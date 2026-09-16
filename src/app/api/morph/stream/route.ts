import { NextRequest } from 'next/server';
import { getSession, startMorphStream } from '@/lib/branches/engine';
import type { StreamChunk } from '@/types';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId required', { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      startMorphStream(sessionId, {
        onText: (text) => {
          send({ type: 'text', content: text });
        },
        onBranch: (branch) => {
          send({ type: 'branch_detected', branch });
        },
        onIntervention: (intervention) => {
          send({ type: 'intervention_applied', intervention });
        },
        onDone: (fullText) => {
          send({ type: 'done', content: fullText });
          controller.close();
        },
        onError: (error) => {
          send({ type: 'error', error: error.message });
          controller.close();
        },
      });
    },
    cancel() {
      session.status = 'paused';
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
