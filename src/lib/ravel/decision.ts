import type { OracleVerdict, BountyDecision } from '@/types/ravel';

export const MAX_PATCH_ATTEMPTS = 3;
export const XP_PER_VERIFIED = 140;
export const BOUNTY_PER_VERIFIED = 2.4;

export interface BountyClaim {
  traceId: string;
  eventCount: number;
  codeChanged: boolean;
  codeSyntaxOk: boolean;
  oldVerdict: Partial<OracleVerdict>;
  newVerdict: Partial<OracleVerdict>;
  attemptsUsed: number;
  maxAttempts?: number;
}

/**
 * Decides whether a bounty is earned — or refused.
 *
 * RAVEL's core promise: "No proof, no reward."
 * Every claim is refused unless BOTH sides of the oracle are positively proven:
 *  - OLD build: the bug side holds (the attack actually reproduces the failure).
 *  - NEW build: the positive fix side holds (fixedValue restored, not merely absent).
 */
export function evaluateBountyClaim(claim: BountyClaim): BountyDecision {
  const maxAttempts = claim.maxAttempts ?? MAX_PATCH_ATTEMPTS;

  const refuse = (reason: string): BountyDecision => ({
    status: 'refused',
    traceId: claim.traceId,
    reason,
    xp: 0,
    bounty: 0,
    attemptsUsed: claim.attemptsUsed,
    attemptsLeft: 0,
  });

  if (!claim.eventCount || claim.eventCount < 1) {
    return refuse('No recorded input events. A failure needs a reproducible attack.');
  }

  if (!claim.codeChanged) {
    return refuse('The patch did not change the code. Nothing was fixed.');
  }

  if (!claim.codeSyntaxOk) {
    return retryOrRefuse(claim, maxAttempts, 'The patch produced invalid code.');
  }

  const old = claim.oldVerdict;
  if (old.timedOut) {
    return refuse('Replay timed out on the reported version. No proof was captured.');
  }
  if (old.error) {
    return refuse(`The reported version crashed during replay (${old.error}). No bug was proven.`);
  }
  if (old.replayed !== true) {
    return refuse('Replay did not complete on the reported version. No proof was captured.');
  }
  if (old.bugMet !== true) {
    return refuse('The attack did not reproduce the failure on the reported version. Expected bug side not observed.');
  }

  const next = claim.newVerdict;
  if (next.timedOut) {
    return retryOrRefuse(claim, maxAttempts, 'The patched version timed out during verification replay.');
  }
  if (next.error) {
    return retryOrRefuse(claim, maxAttempts, `The patched version crashed during replay (${next.error}).`);
  }
  if (next.replayed !== true) {
    return retryOrRefuse(claim, maxAttempts, 'The patched version did not complete its verification replay.');
  }
  if (next.bugMet === true) {
    return retryOrRefuse(claim, maxAttempts, 'The bug still reproduces in the patched version.');
  }
  if (next.fixedMet !== true) {
    return retryOrRefuse(
      claim,
      maxAttempts,
      'The patch removed the failure but did not restore the expected behavior (positive fix side not met).',
    );
  }

  return {
    status: 'verified',
    traceId: claim.traceId,
    reason: 'Attack reproduced on reported version; same attack passes and fix is positively confirmed on the patched version.',
    xp: XP_PER_VERIFIED,
    bounty: BOUNTY_PER_VERIFIED,
    attemptsUsed: claim.attemptsUsed,
    attemptsLeft: Math.max(0, maxAttempts - claim.attemptsUsed),
    verifiedAt: Date.now(),
  };
}

function retryOrRefuse(
  claim: BountyClaim,
  maxAttempts: number,
  reason: string,
): BountyDecision {
  const attemptsUsed = claim.attemptsUsed;
  if (attemptsUsed >= maxAttempts) {
    return {
      status: 'refused',
      traceId: claim.traceId,
      reason: `Patch failed after ${attemptsUsed} attempt(s): ${reason}`,
      xp: 0,
      bounty: 0,
      attemptsUsed,
      attemptsLeft: 0,
    };
  }
  return {
    status: 'retry',
    traceId: claim.traceId,
    reason,
    xp: 0,
    bounty: 0,
    attemptsUsed,
    attemptsLeft: maxAttempts - attemptsUsed,
  };
}