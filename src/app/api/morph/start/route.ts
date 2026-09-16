import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/branches/engine';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const session = createSession(prompt.trim());

  return NextResponse.json({
    sessionId: session.id,
    prompt: session.prompt,
    status: session.status,
  });
}
