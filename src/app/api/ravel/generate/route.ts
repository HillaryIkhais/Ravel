import { NextRequest, NextResponse } from 'next/server';
import { createSession, addBuild } from '@/lib/ravel/engine';
import { generateGame } from '@/lib/ravel/ai';

export async function POST(req: NextRequest) {
  const { title } = await req.json();

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const session = createSession(title);

  try {
    const { code, html } = await generateGame(title);
    const build = addBuild(session.id, code, html);

    return NextResponse.json({
      sessionId: session.id,
      buildId: build.id,
      version: build.version,
      versionBase: session.versionBase,
      huntBase: session.huntBase,
      html: build.html,
      title: session.gameTitle,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate game. Check OPENAI_API_KEY.' },
      { status: 500 }
    );
  }
}
