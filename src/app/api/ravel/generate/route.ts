import { NextRequest, NextResponse } from 'next/server';
import { createSession, addBuild } from '@/lib/ravel/engine';
import { generateGame } from '@/lib/ravel/ai';
import { createShowcaseSeed } from '@/lib/ravel/showcase';

export async function POST(req: NextRequest) {
  const { title, model } = await req.json();

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const session = createSession(title);

  const hasKey = !!(process.env.GEMINI_API_KEY || (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here'));

  if (hasKey) {
    try {
      const { code, html } = await generateGame(title, model);
      const build = addBuild(session.id, code, html);
      return NextResponse.json({
        sessionId: session.id,
        buildId: build.id,
        version: build.version,
        versionBase: session.versionBase,
        huntBase: session.huntBase,
        html: build.html,
        title: session.gameTitle,
        generated: true,
      });
    } catch {
      // Fall through to demo
    }
  }

  const seed = createShowcaseSeed();
  const build = addBuild(session.id, seed.code, seed.html);
  return NextResponse.json({
    sessionId: session.id,
    buildId: build.id,
    version: build.version,
    versionBase: session.versionBase,
    huntBase: session.huntBase,
    html: build.html,
    title: session.gameTitle,
    generated: false,
    hunt: {
      id: 'showcase-hunt',
      title: seed.huntTitle,
      objective: seed.huntObjective,
      difficulty: seed.huntDifficulty,
      reward: seed.huntReward,
      status: 'active',
      oracle: seed.oracle,
    },
    huntNumber: session.huntBase + 1,
  });
}
