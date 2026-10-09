import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { isSameOrigin } from '@/lib/security/rate-limit';

/**
 * Attendance writes over HTTP.
 *
 * WHY THIS EXISTS AGAIN. It used to be here, and it validated a payload, checked
 * a permission, answered `202 { ok: true }`, and wrote nothing. A teacher could
 * tap a whole register, watch it "save", and reload to find nothing there. The
 * screen was moved to a server action to fix exactly that, and this endpoint was
 * deleted.
 *
 * That fix created a second problem nobody noticed. The offline outbox replays
 * with a plain `fetch(record.path)`, and a server action cannot be replayed that
 * way: it needs the `Next-Action` header and a generated action id, neither of
 * which survives being written to IndexedDB and sent hours later. So the queue
 * was left with nothing to send to, `enqueueWrite` stopped being called by
 * anything, and offline attendance silently stopped being captured while the
 * documentation still described a background-sync queue for failed writes.
 *
 * This endpoint is that replay target, and it is the opposite of what it was: it
 * writes, through the same seam every other read and write uses.
 *
 * IT MUST STAY IDEMPOTENT. A queued write is retried until it succeeds, and a
 * teacher can also replay the same day by reloading. The seam upserts on the
 * unique `(class_id, student_id, date)`, so replaying updates the row instead of
 * duplicating it. Replacing that upsert with an insert would turn a flaky
 * connection into double-marked registers.
 *
 * A 4xx here is authoritative and the outbox drops the queued copy rather than
 * retrying it forever; a 5xx is treated as transient and kept. That split is why
 * a refused write must be a 4xx and not a 200 with a message in the body.
 */

const markSchema = z.object({
  studentId: z.string().min(1).max(64),
  status: z.enum(['present', 'absent', 'late', 'excused']),
});

/*
 * Ids are plain strings, not UUIDs.
 *
 * This was `z.uuid()` and it was wrong in a way that only the fixture workspace
 * could reveal. Against Supabase every class id really is a UUID, so it passed
 * every live-database check in this project. The fixture workspace uses
 * `cls_demo_01` and `stu_001`, so validating a UUID rejected every attendance
 * write in fixture mode: the whole Playwright suite runs there, and one spec
 * caught it while 155 others carried on. Nothing about the database and nothing
 * about the running tests would have shown it.
 *
 * The shape check is length and non-emptiness; the real constraint is ownership,
 * and `markAttendance` enforces that against the database on the way in.
 */
const bodySchema = z.object({
  classId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  marks: z.array(markSchema).min(1).max(500),
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

  try {
    const store = await data();
    await store.markAttendance(session.userId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    /*
     * A class the caller does not own is a 404, not a 403: the outbox drops a
     * 4xx rather than retrying it, and this one must never succeed on replay.
     * Anything else is transient, so it is a 500 and the queued copy is kept.
     */
    const code = (error as { code?: string } | null)?.code;
    if (code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'No such class' }, { status: 404 });
    }
    return NextResponse.json({ error: 'The register could not be saved' }, { status: 500 });
  }
}