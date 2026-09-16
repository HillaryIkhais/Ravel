export type BranchType = 'direction' | 'style' | 'approach' | 'tone' | 'structure' | 'element';

export type BranchStatus = 'active' | 'killed' | 'merged' | 'selected' | 'merged_into' | 'frozen';

export type InterventionType = 'kill' | 'select' | 'merge' | 'mutate' | 'override' | 'unfreeze';

export type SessionStatus = 'idle' | 'streaming' | 'paused' | 'completed' | 'error';

export interface Branch {
  id: string;
  type: BranchType;
  label: string;
  description: string;
  probability: number;
  status: BranchStatus;
  streamPosition: number;
  interventions: Intervention[];
  parentBranchId?: string;
  mergedIntoId?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface Intervention {
  id: string;
  type: InterventionType;
  branchId: string;
  targetBranchIds?: string[];
  mutation?: string;
  timestamp: number;
  streamPosition: number;
}

export interface EvolutionNode {
  id: string;
  type: 'branch_detected' | 'intervention' | 'convergence' | 'stream_chunk' | 'branch_killed' | 'branch_merged';
  timestamp: number;
  data: Record<string, unknown>;
  parentId?: string;
}

export interface MorphSession {
  id: string;
  prompt: string;
  provider: 'openai' | 'anthropic';
  model: string;
  status: SessionStatus;
  branches: Branch[];
  interventions: Intervention[];
  streamContent: string;
  originalStream: string;
  finalOutput: string;
  evolutionGraph: EvolutionNode[];
  metrics: SessionMetrics;
  createdAt: number;
  completedAt?: number;
}

export interface SessionMetrics {
  totalBranches: number;
  branchesKilled: number;
  branchesMerged: number;
  branchesSelected: number;
  interventionsCount: number;
  streamLength: number;
  timeSpent: number;
  downstreamChanges: number;
}

export interface StreamChunk {
  type: 'text' | 'branch_detected' | 'intervention_applied' | 'done' | 'error';
  content?: string;
  branch?: Branch;
  intervention?: Intervention;
  error?: string;
}

export interface ComparisonResult {
  originalOutput: string;
  morphedOutput: string;
  interventionsCount: number;
  downstreamChanges: number;
  branchesDetected: number;
  branchesKilled: number;
  branchesMerged: number;
}
