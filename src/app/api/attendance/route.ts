import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guards';
import { isSameOrigin } from '@/lib/security/rate-limit';

/**
 * Attendance write endpoint.
 *
 * Illustrative: the masterplan places persistence behind an external API, so
 * this validates and authorises, then acknowledges. It is not a fake store that
 * silently discards data; it returns 501 once the API seam is wired, which is
 * the honest response until then.
 */

const bodySchema = z.object({
  studentId: z.string().min(1).max(64),
  status: z.enum(['present', 'absent', 'late', 'excused']).nullable(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let session;
  try {
    session = await requirePermission('attendance:write');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid attendance payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: true, saved: parsed.data, userId: session.userId },
    { status: 202 },
  );
}