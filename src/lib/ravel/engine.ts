import { type InputEvent, type GameStateSnapshot, type FailureTrace, type HuntChallenge } from '@/types/ravel';
import { generateId } from '@/lib/utils';

const SESSIONS = new Map<string, RavelSessionInternal>();

export interface PendingPatchInternal {
  code: string;
  html: string;
  explanation: string;
  attempt: number;
  lastFailureReason: string | null;
}

interface RavelSessionInternal {
  id: string;
  gameTitle: string;
  builds: GameBuildInternal[];
  currentBuildIndex: number;
  hunts: HuntChallenge[];
  traces: FailureTrace[];
  refusals: { reason: string; traceId: string; at: number }[];
  totalXp: number;
  totalEarned: number;
  versionBase: number;
  huntBase: number;
  pendingPatch: PendingPatchInternal | null;
  createdAt: number;
}

interface GameBuildInternal {
  id: string;
  version: number;
  code: string;
  html: string;
  status: string;
  createdAt: number;
}

export interface CreateSessionOptions {
  versionBase?: number;
  huntBase?: number;
}

export function createSession(gameTitle: string, opts: CreateSessionOptions = {}): RavelSessionInternal {
  const session: RavelSessionInternal = {
    id: generateId(),
    gameTitle,
    builds: [],
    currentBuildIndex: 0,
    hunts: [],
    traces: [],
    refusals: [],
    totalXp: 0,
    totalEarned: 0,
    versionBase: opts.versionBase ?? 0,
    huntBase: opts.huntBase ?? 0,
    pendingPatch: null,
    createdAt: Date.now(),
  };
  SESSIONS.set(session.id, session);
  return session;
}

export function getSession(id: string): RavelSessionInternal | undefined {
  return SESSIONS.get(id);
}

export function addBuild(sessionId: string, code: string, html: string): GameBuildInternal {
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Session not found');

  const version = session.versionBase + session.builds.length;
  const build: GameBuildInternal = {
    id: generateId(),
    version,
    code,
    html,
    status: 'ready',
    createdAt: Date.now(),
  };

  session.builds.push(build);
  session.currentBuildIndex = session.builds.length - 1;
  return build;
}

export function getCurrentBuild(sessionId: string): GameBuildInternal | undefined {
  const session = SESSIONS.get(sessionId);
  if (!session) return undefined;
  return session.builds[session.currentBuildIndex];
}

export function getBuild(sessionId: string, version: number): GameBuildInternal | undefined {
  const session = SESSIONS.get(sessionId);
  if (!session) return undefined;
  return session.builds.find(b => b.version === version);
}

export function setPendingPatch(sessionId: string, patch: PendingPatchInternal): void {
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Session not found');
  session.pendingPatch = patch;
}

export function getPendingPatch(sessionId: string): PendingPatchInternal | null {
  const session = SESSIONS.get(sessionId);
  return session?.pendingPatch ?? null;
}

export function clearPendingPatch(sessionId: string): void {
  const session = SESSIONS.get(sessionId);
  if (session) session.pendingPatch = null;
}

export function recordTrace(
  sessionId: string,
  buildVersion: number,
  huntId: string,
  inputEvents: InputEvent[],
  snapshots: GameStateSnapshot[],
  expectedBehavior: string,
  observedBehavior: string
): FailureTrace {
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Session not found');

  const trace: FailureTrace = {
    id: generateId(),
    buildVersion,
    huntId,
    description: `Failure on build ${buildVersion}: ${observedBehavior}`,
    inputEvents,
    snapshots,
    expectedBehavior,
    observedBehavior,
    reproductionSteps: generateReproductionSteps(inputEvents),
    capturedAt: Date.now(),
  };

  session.traces.push(trace);
  return trace;
}

export function addHunt(sessionId: string, hunt: Omit<HuntChallenge, 'id'>): HuntChallenge {
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Session not found');

  const fullHunt: HuntChallenge = {
    ...hunt,
    id: generateId(),
  };

  session.hunts.push(fullHunt);
  return fullHunt;
}

/**
 * Awards a verified hunt: promotes the pending patch to the current build,
 * completes the hunt, and credits XP + bounty.
 * Returns the newly-promoted build.
 */
export function awardVerifiedHunt(
  sessionId: string,
  huntId: string,
  xp: number,
  bounty: number
): GameBuildInternal | undefined {
  const session = SESSIONS.get(sessionId);
  if (!session) return undefined;

  const pending = session.pendingPatch;
  if (!pending) return undefined;

  const build: GameBuildInternal = {
    id: generateId(),
    version: session.versionBase + session.builds.length,
    code: pending.code,
    html: pending.html,
    status: 'ready',
    createdAt: Date.now(),
  };

  session.builds.push(build);
  session.currentBuildIndex = session.builds.length - 1;
  session.pendingPatch = null;

  const hunt = session.hunts.find(h => h.id === huntId);
  if (hunt && hunt.status === 'active') {
    hunt.status = 'completed';
  }

  session.totalXp += xp;
  session.totalEarned += bounty;

  return build;
}

export function recordRefusal(sessionId: string, traceId: string, reason: string): void {
  const session = SESSIONS.get(sessionId);
  if (!session) return;
  session.refusals.push({ reason, traceId, at: Date.now() });
  session.pendingPatch = null;
}

export function completeHunt(sessionId: string, huntId: string, traceId: string, xp: number, bounty: number) {
  const session = SESSIONS.get(sessionId);
  if (!session) return;

  const hunt = session.hunts.find(h => h.id === huntId);
  if (hunt) {
    hunt.status = 'completed';
  }

  session.totalXp += xp;
  session.totalEarned += bounty;
}

export function getAllSessions(): RavelSessionInternal[] {
  return Array.from(SESSIONS.values());
}

function generateReproductionSteps(events: InputEvent[]): string[] {
  const steps: string[] = [];
  for (const event of events) {
    if (event.type === 'keydown' && event.key) {
      steps.push(`Press ${event.key}`);
    } else if (event.type === 'mousedown') {
      steps.push(`Click at (${event.x}, ${event.y})`);
    }
  }
  return steps.slice(0, 10);
}