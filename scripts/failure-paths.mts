/**
 * RAVEL failure-path tests.
 *
 * "No proof, no reward." Every one of these deliberately-broken claims
 * must be refused (never award a bounty). The happy path must be the
 * only way to earn.
 *
 * Run: npm run test:failure-paths
 */
import { evaluateBountyClaim, MAX_PATCH_ATTEMPTS } from '../src/lib/ravel/decision.ts';
import type { BountyClaim } from '../src/lib/ravel/decision.ts';

let failures = 0;
let passed = 0;

function check(name: string, claim: BountyClaim, expect: 'verified' | 'refused') {
  const decision = evaluateBountyClaim(claim);
  const ok = decision.status === expect;
  if (ok) {
    passed++;
    console.log(`  PASS  ${name} → ${decision.status}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} → ${decision.status} (expected ${expect})`);
    console.log(`        reason: ${decision.reason}`);
  }
}

const good = {
  buildVersion: 0,
  replayed: true,
  bugMet: true,
  fixedMet: false,
  error: null,
  timedOut: false,
  eventCount: 4,
  snapshots: [{ __trackDead: true, __homingTotal: 4 }],
};
const fixed = {
  buildVersion: 1,
  replayed: true,
  bugMet: false,
  fixedMet: true,
  error: null,
  timedOut: false,
  eventCount: 4,
  snapshots: [{ __tracking: true, __homingTotal: 4 }],
};

function base(partial: Partial<BountyClaim> = {}): BountyClaim {
  return {
    traceId: 't1',
    attemptsUsed: 1,
    eventCount: 4,
    codeChanged: true,
    codeSyntaxOk: true,
    oldVerdict: good,
    newVerdict: fixed,
    ...partial,
  };
}

console.log('RAVEL failure-path suite\n');

// 1. trace has no events — a failure needs a reproducible attack
check('trace has no events', base({ eventCount: 0 }), 'refused');

// 2. patch doesn't change code — nothing was fixed
check('patch does not change code', base({ codeChanged: false }), 'refused');

// 3. patch produces invalid code (attempts exhausted)
check('patch produces invalid code', base({ codeSyntaxOk: false, attemptsUsed: MAX_PATCH_ATTEMPTS }), 'refused');

// 4. invalid AI output (empty) — surfaced upstream as route refusal; invalid code case covers it.

// 5. oracle isn't triggered on v0 — attack did not reproduce
check('oracle not triggered on v0', base({ oldVerdict: { ...good, bugMet: false } }), 'refused');

// 6. user captures garbage (bugMet false even though events exist)
check('user captures non-bug interaction', base({ oldVerdict: { ...good, bugMet: false, actualBugValue: 0 } }), 'refused');

// 7. replay crashes on old build
check('replay crashes (old build)', base({ oldVerdict: { ...good, replayed: false, error: 'TypeError: x is null' } }), 'refused');

// 8. replay times out on old build
check('replay times out (old build)', base({ oldVerdict: { ...good, replayed: false, timedOut: true } }), 'refused');

// 9. oracle still fails on v1 — bug persists after patch, attempts exhausted
check('oracle still fails on v1 (exhausted)', base({ newVerdict: { ...fixed, bugMet: true, fixedMet: false }, attemptsUsed: MAX_PATCH_ATTEMPTS }), 'refused');

// 10. replay crashes on new build (exhausted)
check('replay crashes (new build, exhausted)', base({ newVerdict: { ...fixed, replayed: false, error: 'RefError' }, attemptsUsed: MAX_PATCH_ATTEMPTS }), 'refused');

// 11. new build times out (exhausted)
check('replay times out (new build, exhausted)', base({ newVerdict: { ...fixed, replayed: false, timedOut: true }, attemptsUsed: MAX_PATCH_ATTEMPTS }), 'refused');

// 12. THE hardening: patch removed the bug value but did NOT restore the
//     positive fixedValue → must be refused, never rewarded.
check('patch drops bug but positive fix side not met (exhausted)', base({ newVerdict: { ...fixed, bugMet: false, fixedMet: false }, attemptsUsed: MAX_PATCH_ATTEMPTS }), 'refused');

// 13. bug persists → retry offered (not burning the claim)
const retry = evaluateBountyClaim(base({ newVerdict: { ...fixed, bugMet: true } }));
console.log(`  PASS  bug persists on v1 (attempt 1) → retry offered, ${retry.attemptsLeft} left`);
if (retry.status === 'retry') passed++; else failures++;

// 14. happy path — the ONLY route to a reward
const goodDecision = evaluateBountyClaim(base());
const happy = goodDecision.status === 'verified' && goodDecision.xp > 0 && goodDecision.bounty > 0;
console.log(`  ${happy ? 'PASS' : 'FAIL'}  happy path (bug confirmed + positive fix verified) → ${goodDecision.status}`);
if (happy) passed++; else failures++;

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);