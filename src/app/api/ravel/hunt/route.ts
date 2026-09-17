import { NextRequest, NextResponse } from 'next/server';
import { getSession, addHunt, getCurrentBuild } from '@/lib/ravel/engine';
import { generateHuntChallenge } from '@/lib/ravel/ai';
import { type OracleCondition, type HuntChallenge } from '@/types/ravel';

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const currentBuild = getCurrentBuild(sessionId);
  if (!currentBuild) {
    return NextResponse.json({ error: 'No build available' }, { status: 400 });
  }

  try {
    const challenge = await generateHuntChallenge(currentBuild.code, session.gameTitle);

    const oracle: OracleCondition = {
      description: challenge.oracle.description,
      statePath: challenge.oracle.statePath,
      operator: challenge.oracle.operator as OracleCondition['operator'],
      bugValue: challenge.oracle.bugValue,
      fixedValue: challenge.oracle.fixedValue,
      evalExpression: challenge.oracle.evalExpression,
      fixedExpression: challenge.oracle.fixedExpression,
    };

    const huntData: Omit<HuntChallenge, 'id'> = {
      title: challenge.title,
      objective: challenge.objective,
      difficulty: challenge.difficulty,
      reward: challenge.reward,
      status: 'active',
      targetBuildVersion: currentBuild.version,
      oracle,
    };

    const hunt = addHunt(sessionId, huntData);

    return NextResponse.json({ hunt });
  } catch (e) {
    console.error('[ravel/hunt] generateHuntChallenge threw:', e);
    return NextResponse.json(
      { error: 'Failed to generate hunt', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
