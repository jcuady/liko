'use server';

/**
 * Attendance reads and per-student notes.
 *
 * WHY THE WRITE PATH IS NOT A SERVER ACTION. It was, and moving it there fixed
 * a real bug: the screen used to fire `fetch('/api/attendance')` at an endpoint
 * that validated a payload and discarded it, so a teacher could tap a whole
 * register, watch it "save", and reload to find nothing there.
 *
 * That fix quietly broke the next thing. The offline outbox replays with a plain
 * `fetch(record.path)` from the service worker or the flush loop, and a server
 * action cannot be replayed that way: it needs a `Next-Action` header and a
 * generated action id, neither of which survives being written to IndexedDB and
 * sent hours later. So the queue was left with nothing to send to, nothing ever
 * called `enqueueWrite`, and offline attendance stopped being captured while the
 * documentation still described a background-sync queue.
 *
 * Marks therefore go through `enqueueWrite` to `POST /api/attendance`, which is
 * idempotent and safe to replay. The route re-checks the session and the
 * permission on every call, exactly as an action did.
 *
 * These two remain actions because neither is queued: a read has nothing to
 * replay, and a note is an occasional deliberate act rather than something a
 * teacher taps repeatedly on a bad connection.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { AttendanceStatus, Severity } from '@/lib/api/types';

export interface AttendanceActionResult {
  ok: boolean;
  message: string;
}

/** Read path for the client cache. Goes through the seam, never a bare fetch. */
export async function loadAttendance(
  classId: string,
  date: string,
): Promise<Record<string, AttendanceStatus>> {
  const session = await requirePermission('attendance:write');
  const store = await data();
  return store.getAttendance(session.userId, classId, date);
}

const SEVERITIES: Severity[] = ['note', 'praise', 'concern', 'intervention'];

/**
 * Notes ride the behaviour log because that is the only per-student free-text
 * channel the seam exposes. Writing them anywhere else would mean inventing a
 * table, and inventing a table here is how a mark and its note drift apart.
 */
export async function addAttendanceNote(input: {
  classId: string;
  studentId: string;
  entry: string;
  severity: Severity;
}): Promise<AttendanceActionResult> {
  const session = await requirePermission('attendance:write');

  const entry = input.entry.trim();
  if (!input.classId || !input.studentId || entry.length === 0) {
    return { ok: false, message: 'That note was empty, so nothing was saved.' };
  }
  if (entry.length > 500) {
    return { ok: false, message: 'Keep notes under 500 characters.' };
  }

  try {
    const store = await data();
    await store.addBehaviourLog(session.userId, {
      classId: input.classId,
      studentId: input.studentId,
      entry,
      severity: SEVERITIES.includes(input.severity) ? input.severity : 'note',
    });
  } catch {
    return { ok: false, message: 'That note could not be saved.' };
  }

  revalidatePath('/attendance');
  return { ok: true, message: 'Note saved.' };
}
