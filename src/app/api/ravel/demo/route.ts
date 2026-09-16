import { NextResponse } from 'next/server';
import { createSession, addBuild, addHunt } from '@/lib/ravel/engine';
import { createShowcaseSeed } from '@/lib/ravel/showcase';

export async function POST() {
  const seed = createShowcaseSeed();
  const session = createSession(seed.gameTitle, {
    versionBase: seed.versionBase,
    huntBase: seed.huntBase,
  });

  const build = addBuild(session.id, seed.code, seed.html);

  const hunt = addHunt(session.id, {
    title: seed.huntTitle,
    objective: seed.huntObjective,
    difficulty: seed.huntDifficulty,
    reward: seed.huntReward,
    status: 'active',
    targetBuildVersion: build.version,
    oracle: seed.oracle,
  });

  return NextResponse.json({
    sessionId: session.id,
    title: session.gameTitle,
    version: build.version,
    huntNumber: seed.huntBase + 1,
    html: build.html,
    build: { id: build.id, version: build.version },
    hunt: {
      id: hunt.id,
      title: hunt.title,
      objective: hunt.objective,
      difficulty: hunt.difficulty,
      reward: hunt.reward,
      status: hunt.status,
      oracle: hunt.oracle,
    },
  });
}