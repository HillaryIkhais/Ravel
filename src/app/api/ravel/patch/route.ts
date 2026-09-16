import { NextRequest, NextResponse } from 'next/server';
import { getSession, getCurrentBuild, setPendingPatch } from '@/lib/ravel/engine';
import { patchGame } from '@/lib/ravel/ai';
import { generateVerificationReplayHtml } from '@/lib/ravel/verifier';
import { wrapGameHtml } from '@/lib/ravel/html';
import { isSyntaxValid } from '@/lib/ravel/validate';
import { type OracleCondition } from '@/types/ravel';

export async function POST(req: NextRequest) {
  const { sessionId, traceId, attempt = 1, lastFailureReason } = await req.json();

  if (!sessionId || !traceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const currentBuild = getCurrentBuild(sessionId);
  if (!currentBuild) {
    return NextResponse.json({ error: 'No current build' }, { status: 400 });
  }

  const trace = session.traces.find(t => t.id === traceId);
  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  const hunt = session.hunts.find(h => h.id === trace.huntId);
  const oracle = hunt?.oracle ?? null;

  try {
    const { code: patchedCode, explanation } = await patchGame({
      originalCode: currentBuild.code,
      failureDescription: trace.observedBehavior,
      reproductionSteps: trace.reproductionSteps,
      expectedBehavior: trace.expectedBehavior,
      observedBehavior: trace.observedBehavior,
      oracle: oracle ?? undefined,
      previousFailure: lastFailureReason ?? undefined,
    });

    const codeChanged = patchedCode !== currentBuild.code;
    const codeSyntaxOk = isSyntaxValid(patchedCode);

    setPendingPatch(session.id, {
      code: patchedCode,
      html: wrapGameHtml(patchedCode),
      explanation,
      attempt,
      lastFailureReason: lastFailureReason ?? null,
    });

    const newVersion = currentBuild.version + 1;
    const oldReplayHtml = generateVerificationReplayHtml(
      currentBuild.code,
      trace.inputEvents,
      currentBuild.version,
      oracle ?? fallbackOracle(),
      'bug',
    );
    const newReplayHtml = generateVerificationReplayHtml(
      patchedCode,
      trace.inputEvents,
      newVersion,
      oracle ?? fallbackOracle(),
      'fix',
    );

    return NextResponse.json({
      attempt,
      explanation,
      oldVersion: currentBuild.version,
      newVersion,
      codeChanged,
      codeSyntaxOk,
      oldReplayHtml,
      newReplayHtml,
      oracle,
      lastFailureReason: lastFailureReason ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI patch failed';
    return NextResponse.json(
      {
        refused: true,
        reason:
          message.includes('no code') || message.includes('invalid')
            ? `AI produced invalid output: ${message}`
            : 'AI patch failed or timed out. No reward was awarded.',
        detail: message,
      },
      { status: 502 },
    );
  }
}

function fallbackOracle(): OracleCondition {
  return {
    description: 'Game should not crash',
    statePath: '',
    operator: 'not_exists',
    bugValue: 'error',
    fixedValue: null,
    fixedOperator: 'not_exists',
    evalExpression: 'typeof window.__plError === "undefined"',
  };
}