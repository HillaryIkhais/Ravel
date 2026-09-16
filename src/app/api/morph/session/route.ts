import { NextRequest, NextResponse } from 'next/server';
import { getSession, getComparison } from '@/lib/branches/engine';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      prompt: session.prompt,
      status: session.status,
      branches: session.branches,
      interventions: session.interventions,
      streamContent: session.streamContent,
      finalOutput: session.finalOutput,
      metrics: session.metrics,
      evolutionGraph: session.evolutionGraph,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    },
    comparison: getComparison(sessionId),
  });
}
