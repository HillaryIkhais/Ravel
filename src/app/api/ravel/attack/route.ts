import { NextRequest, NextResponse } from 'next/server';
import { getSession, getCurrentBuild, recordTrace } from '@/lib/ravel/engine';
import { type InputEvent } from '@/types/ravel';

export async function POST(req: NextRequest) {
  const { sessionId, huntId, inputEvents, expectedBehavior, observedBehavior } = await req.json();

  if (!sessionId || !huntId) {
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

  const hunt = session.hunts.find(h => h.id === huntId);
  if (!hunt) {
    return NextResponse.json({ error: 'Hunt not found' }, { status: 404 });
  }

  const events: InputEvent[] = Array.isArray(inputEvents)
    ? inputEvents.filter((e: InputEvent) => e && e.type && (e.type !== 'mousemove' && e.type !== 'click'))
    : [];

  const eventCount = events.length;
  if (eventCount === 0) {
    return NextResponse.json(
      {
        refused: true,
        reason: 'No recorded input events. A failure needs a reproducible attack.',
      },
      { status: 422 },
    );
  }

  const trace = recordTrace(
    sessionId,
    currentBuild.version,
    huntId,
    events,
    [],
    expectedBehavior || hunt.objective,
    observedBehavior || 'Player reported unexpected behavior during the hunt',
  );

  return NextResponse.json({
    traceId: trace.id,
    eventCount,
    buildVersion: currentBuild.version,
    oracle: hunt.oracle,
    reproductionSteps: trace.reproductionSteps,
  });
}