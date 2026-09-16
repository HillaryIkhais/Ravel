import { NextRequest, NextResponse } from 'next/server';
import { getSession, getCurrentBuild } from '@/lib/ravel/engine';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const currentBuild = getCurrentBuild(sessionId);

  return NextResponse.json({
    session: {
      id: session.id,
      gameTitle: session.gameTitle,
      currentVersion: currentBuild?.version || 0,
      versionBase: session.versionBase,
      huntBase: session.huntBase,
      totalBuilds: session.builds.length,
      hunts: session.hunts,
      traces: session.traces,
      totalXp: session.totalXp,
      totalEarned: session.totalEarned,
    },
    currentBuild: currentBuild ? {
      id: currentBuild.id,
      version: currentBuild.version,
      html: currentBuild.html,
    } : null,
  });
}
