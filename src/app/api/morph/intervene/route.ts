import { NextRequest, NextResponse } from 'next/server';
import { applyIntervention } from '@/lib/branches/engine';
import type { InterventionType } from '@/types';

export async function POST(req: NextRequest) {
  const { sessionId, branchId, type, targetBranchIds, mutation } = await req.json();

  if (!sessionId || !branchId || !type) {
    return NextResponse.json(
      { error: 'sessionId, branchId, and type are required' },
      { status: 400 }
    );
  }

  const validTypes: InterventionType[] = ['kill', 'select', 'merge', 'mutate', 'override', 'unfreeze'];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid intervention type' }, { status: 400 });
  }

  const result = await applyIntervention(sessionId, {
    branchId,
    type,
    targetBranchIds,
    mutation,
    streamPosition: 0,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
