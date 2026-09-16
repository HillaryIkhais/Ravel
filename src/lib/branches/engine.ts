import { StreamCallbacks, streamGenerate, generateBranches, buildMorphSystemPrompt } from '../ai/providers/openai';
import { type Branch, type Intervention, type MorphSession, type ComparisonResult } from '@/types';
import { generateId } from '@/lib/utils';

const SESSIONS = new Map<string, MorphSession>();
const ORIGINAL_STREAMS = new Map<string, string>();

export function getSession(id: string): MorphSession | undefined {
  return SESSIONS.get(id);
}

export function createSession(prompt: string): MorphSession {
  const session: MorphSession = {
    id: generateId(),
    prompt,
    provider: 'openai',
    model: 'gpt-4o',
    status: 'idle',
    branches: [],
    interventions: [],
    streamContent: '',
    originalStream: '',
    finalOutput: '',
    evolutionGraph: [],
    metrics: {
      totalBranches: 0,
      branchesKilled: 0,
      branchesMerged: 0,
      branchesSelected: 0,
      interventionsCount: 0,
      streamLength: 0,
      timeSpent: 0,
      downstreamChanges: 0,
    },
    createdAt: Date.now(),
  };
  SESSIONS.set(session.id, session);
  return session;
}

export async function startMorphStream(
  sessionId: string,
  callbacks: StreamCallbacks & { onBranch?: (branch: Branch) => void; onIntervention?: (intervention: Intervention) => void }
): Promise<void> {
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Session not found');

  session.status = 'streaming';
  const startTime = Date.now();

  let branchCheckCounter = 0;
  let lastBranchCheck = '';

  const wrappedCallbacks: StreamCallbacks = {
    onText: (text) => {
      session.streamContent += text;
      session.metrics.streamLength = session.streamContent.length;
      callbacks.onText(text);

      branchCheckCounter += text.length;
      if (branchCheckCounter > 300 && !session.streamContent.endsWith('\n\n')) {
        const recentContent = session.streamContent.slice(-600);
        if (recentContent !== lastBranchCheck) {
          lastBranchCheck = recentContent;
          branchCheckCounter = 0;
          detectBranches(session, recentContent, callbacks.onBranch);
        }
      }
    },
    onDone: (fullText) => {
      session.status = 'completed';
      session.completedAt = Date.now();
      session.metrics.timeSpent = session.completedAt - startTime;
      session.finalOutput = fullText;

      if (!ORIGINAL_STREAMS.has(sessionId)) {
        ORIGINAL_STREAMS.set(sessionId, fullText);
        session.originalStream = fullText;
      }

      callbacks.onDone(fullText);
    },
    onError: (error) => {
      session.status = 'error';
      callbacks.onError(error);
    },
  };

  let systemPrompt = buildMorphSystemPrompt();

  if (session.interventions.length > 0) {
    const interventionContext = session.interventions.map(i => {
      const branch = session.branches.find(b => b.id === i.branchId);
      return `[Intervention: ${i.type} on "${branch?.label || 'unknown'}"${i.mutation ? ` - Mutation: "${i.mutation}"` : ''}]`;
    }).join('\n');

    systemPrompt += `\n\nPREVIOUS HUMAN INTERVENTIONS:\n${interventionContext}\n\nIncorporate these interventions into your continued generation. Show that the human's choices materially affected the output.`;
  }

  await streamGenerate(session.prompt, systemPrompt, wrappedCallbacks, session.model);
}

async function detectBranches(
  session: MorphSession,
  recentContent: string,
  onBranch?: (branch: Branch) => void
): Promise<void> {
  try {
    const rawBranches = await generateBranches(session.prompt, recentContent);

    for (const raw of rawBranches.slice(0, 3)) {
      const exists = session.branches.some(
        b => b.label.toLowerCase() === raw.label.toLowerCase()
      );
      if (exists) continue;

      const branch: Branch = {
        id: generateId(),
        type: raw.type as Branch['type'],
        label: raw.label,
        description: raw.description,
        probability: raw.probability,
        status: 'active',
        streamPosition: session.streamContent.length,
        interventions: [],
        metadata: {},
        createdAt: Date.now(),
      };

      session.branches.push(branch);
      session.metrics.totalBranches = session.branches.length;

      session.evolutionGraph.push({
        id: generateId(),
        type: 'branch_detected',
        timestamp: Date.now(),
        data: { branchId: branch.id, label: branch.label, type: branch.type },
      });

      onBranch?.(branch);
    }
  } catch {
    // Branch detection is best-effort
  }
}

export async function applyIntervention(
  sessionId: string,
  intervention: Omit<Intervention, 'id' | 'timestamp'>
): Promise<{ success: boolean; continuedOutput?: string }> {
  const session = SESSIONS.get(sessionId);
  if (!session) return { success: false };

  const fullIntervention: Intervention = {
    ...intervention,
    id: generateId(),
    timestamp: Date.now(),
  };

  session.interventions.push(fullIntervention);
  session.metrics.interventionsCount = session.interventions.length;

  const branch = session.branches.find(b => b.id === intervention.branchId);
  if (branch) {
    branch.interventions.push(fullIntervention);

    switch (intervention.type) {
      case 'kill':
        branch.status = 'killed';
        session.metrics.branchesKilled++;
        break;
      case 'select':
        branch.status = 'selected';
        session.metrics.branchesSelected++;
        break;
      case 'merge':
        if (intervention.targetBranchIds) {
          for (const tid of intervention.targetBranchIds) {
            const target = session.branches.find(b => b.id === tid);
            if (target) {
              target.status = 'merged_into';
              target.mergedIntoId = branch.id;
            }
          }
          session.metrics.branchesMerged++;
        }
        branch.status = 'merged';
        break;
      case 'mutate':
        if (intervention.mutation) {
          branch.description = intervention.mutation;
          branch.metadata.mutated = true;
        }
        break;
    }
  }

  session.evolutionGraph.push({
    id: generateId(),
    type: 'intervention',
    timestamp: Date.now(),
    data: {
      interventionType: intervention.type,
      branchId: intervention.branchId,
      branchLabel: branch?.label,
      mutation: intervention.mutation,
    },
  });

  session.metrics.downstreamChanges++;

  return { success: true };
}

export function getComparison(sessionId: string): ComparisonResult | null {
  const session = SESSIONS.get(sessionId);
  if (!session) return null;

  return {
    originalOutput: session.originalStream || session.streamContent,
    morphedOutput: session.finalOutput || session.streamContent,
    interventionsCount: session.metrics.interventionsCount,
    downstreamChanges: session.metrics.downstreamChanges,
    branchesDetected: session.metrics.totalBranches,
    branchesKilled: session.metrics.branchesKilled,
    branchesMerged: session.metrics.branchesMerged,
  };
}

export function getAllSessions(): MorphSession[] {
  return Array.from(SESSIONS.values());
}
