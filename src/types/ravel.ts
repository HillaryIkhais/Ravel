export type GameStatus = 'generating' | 'ready' | 'playing' | 'capturing' | 'patching' | 'verifying' | 'shipped';

export interface GameBuild {
  id: string;
  version: number;
  code: string;
  html: string;
  status: GameStatus;
  createdAt: number;
}

export interface InputEvent {
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'mousemove' | 'click';
  key?: string;
  code?: string;
  x?: number;
  y?: number;
  button?: number;
  timestamp: number;
  frame: number;
}

export interface GameStateSnapshot {
  frame: number;
  timestamp: number;
  canvasHash: string;
  data: Record<string, unknown>;
}

export interface FailureTrace {
  id: string;
  buildVersion: number;
  huntId: string;
  description: string;
  inputEvents: InputEvent[];
  snapshots: GameStateSnapshot[];
  expectedBehavior: string;
  observedBehavior: string;
  reproductionSteps: string[];
  capturedAt: number;
}

export interface HuntChallenge {
  id: string;
  title: string;
  objective: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reward: number;
  status: 'active' | 'completed' | 'failed';
  targetBuildVersion: number;
  oracle: OracleCondition;
}

export type OracleOperator = 'equals' | 'not_equals' | 'less_than' | 'greater_than' | 'contains' | 'exists' | 'not_exists';

/**
 * Semantic oracle condition — defines what "broken" means.
 * Evaluated against game state AFTER replay.
 *
 * Two-sided contract:
 *  - OLD build must satisfy the BUG side: the reported failure actually happens.
 *  - NEW build must satisfy the FIX side: the positive `fixedValue`/`fixedExpression`
 *    is restored. We never award on "bugValue simply disappeared" — the fix must be
 *    positively present.
 */
export interface OracleCondition {
  /** Human-readable description of what the oracle checks */
  description: string;
  /** The game state variable to inspect (e.g., "enemy.target", "player.health") */
  statePath: string;
  /** The operator used to interpret `bugValue` on the BUG side */
  operator: OracleOperator;
  /** The expected value when the bug is PRESENT (on old version) */
  bugValue: unknown;
  /** The expected value when the bug is FIXED (on new version) */
  fixedValue: unknown;
  /** Operator used to interpret `fixedValue` on the FIX side (defaults to 'equals') */
  fixedOperator?: OracleOperator;
  /** TRUE when the bug is PRESENT (bug side). Preferred over path checks. */
  evalExpression?: string;
  /** TRUE when the bug is FIXED (positive fix side). Enforced on the new build. */
  fixedExpression?: string;
}

/** Verdict produced by a replay of one build against an oracle. */
export interface OracleVerdict {
  buildVersion: number;
  /** True if the replay ran to completion without a runtime error. */
  replayed: boolean;
  /** True if the BUG side of the oracle held during the replay. */
  bugMet: boolean;
  /** True if the positive FIX side of the oracle held (new build only). */
  fixedMet: boolean;
  /** Value observed for the oracle's state path / expression. */
  actualBugValue: unknown;
  /** Value observed for the positive fix check. */
  actualFixedValue: unknown;
  error: string | null;
  timedOut: boolean;
  reason: string;
  eventCount: number;
  /** Transient state captured during replay (one snapshot after each event). */
  snapshots: Record<string, unknown>[];
}

export type BountyStatus = 'verified' | 'retry' | 'refused';

export interface BountyDecision {
  status: BountyStatus;
  traceId: string;
  reason: string;
  xp: number;
  bounty: number;
  attemptsUsed: number;
  attemptsLeft: number;
  verifiedAt?: number;
}

export interface PatchResult {
  success: boolean;
  patchedCode: string;
  explanation: string;
  tracesReplayed: number;
  tracesPassed: number;
}

export interface VerificationResult {
  traceId: string;
  passed: boolean;
  oldFailedAt: string;
  newSurvived: boolean;
  replayDuration: number;
}

export interface Bounty {
  id: string;
  amount: number;
  creatorAddress: string;
  status: 'active' | 'claimed' | 'expired';
  traceId?: string;
  claimerAddress?: string;
}

export interface RavelSession {
  id: string;
  gameTitle: string;
  builds: GameBuild[];
  currentBuild: number;
  hunts: HuntChallenge[];
  traces: FailureTrace[];
  bounties: Bounty[];
  totalXp: number;
  totalEarned: number;
  createdAt: number;
}
