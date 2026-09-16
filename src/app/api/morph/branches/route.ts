import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/branches/engine';

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
    branches: session.branches,
    activeBranches: session.branches.filter(b => b.status === 'active'),
    interventions: session.interventions,
  });
}
