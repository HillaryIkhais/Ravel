import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getCurrentBuild,
  getPendingPatch,
  awardVerifiedHunt,
  recordRefusal,
  getBuild,
} from '@/lib/ravel/engine';
import { evaluateBountyClaim } from '@/lib/ravel/decision';
import { isSyntaxValid } from '@/lib/ravel/validate';
import { type OracleVerdict } from '@/types/ravel';

export async function POST(req: NextRequest) {
  const { sessionId, traceId, attempt = 1, oldVerdict, newVerdict } = await req.json();

  if (!sessionId || !traceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const trace = session.traces.find(t => t.id === traceId);
  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  const hunt = session.hunts.find(h => h.id === trace.huntId);
  if (!hunt) {
    recordRefusal(sessionId, traceId, 'Hunt no longer exists.');
    return NextResponse.json({ status: 'refused', reason: 'Hunt no longer exists.' });
  }
  const pending = getPendingPatch(sessionId);
  const currentBuild = getCurrentBuild(sessionId);
  const reportedBuild = getBuild(sessionId, trace.buildVersion) ?? currentBuild;

  if (!reportedBuild || !pending) {
    return NextResponse.json({ error: 'No patch pending for this trace' }, { status: 400 });
  }

  const codeChanged = pending.code !== reportedBuild.code;
  const codeSyntaxOk = isSyntaxValid(pending.code);

  const decision = evaluateBountyClaim({
    traceId,
    eventCount: trace.inputEvents.length,
    codeChanged,
    codeSyntaxOk,
    oldVerdict: normalizeVerdict(oldVerdict, reportedBuild.version),
    newVerdict: normalizeVerdict(newVerdict, reportedBuild.version + 1),
    attemptsUsed: Number(attempt) || 1,
  });

  if (decision.status === 'verified') {
    const build = awardVerifiedHunt(sessionId, hunt.id, decision.xp, decision.bounty);
    if (!build) {
      recordRefusal(sessionId, traceId, 'Internal error: could not promote the patched build.');
      return NextResponse.json({ status: 'refused', decision });
    }
    return NextResponse.json({
      status: 'verified',
      decision: {
        ...decision,
        xp: decision.xp,
        bounty: decision.bounty,
      },
      newVersion: build.version,
      html: build.html,
      explanation: pending.explanation,
    });
  }

  if (decision.status === 'refused') {
    recordRefusal(sessionId, traceId, decision.reason);
    return NextResponse.json({ status: 'refused', decision, reason: decision.reason });
  }

  return NextResponse.json({ status: 'retry', decision, reason: decision.reason });
}

function normalizeVerdict(v: Partial<OracleVerdict> | null | undefined, buildVersion: number): Partial<OracleVerdict> {
  if (!v || typeof v !== 'object') return {};
  return {
    buildVersion: v.buildVersion ?? buildVersion,
    replayed: v.replayed,
    bugMet: v.bugMet,
    fixedMet: v.fixedMet,
    actualBugValue: v.actualBugValue,
    actualFixedValue: v.actualFixedValue,
    error: v.error ?? null,
    timedOut: v.timedOut,
    reason: v.reason,
    eventCount: v.eventCount,
    snapshots: v.snapshots,
  };
}