'use server';

/**
 * Attendance reads and writes.
 *
 * WHY SERVER ACTIONS. The old screen fired `fetch('/api/attendance')`, and that
 * endpoint validated a payload and then discarded it, so a teacher could tap a
 * whole register, watch it "save", and reload to find nothing there. Calling
 * `markAttendance` through the data seam is what makes the register durable.
 *
 * The seam is `server-only`, so a client component cannot reach it directly.
 * These actions are the server half: they re-check the session and the
 * permission on every call, because a server action is an HTTP endpoint anyone
 * can post to and the proxy does not sit in front of it.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { AttendanceMark, AttendanceStatus, Severity } from '@/lib/api/types';

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

export async function saveAttendance(input: {
  classId: string;
  date: string;
  marks: AttendanceMark[];
}): Promise<AttendanceActionResult> {
  const session = await requirePermission('attendance:write');

  // A blank date would write a row nobody can ever find again.
  if (!input.classId || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {
      ok: false,
      message: 'That register could not be saved. Pick a date and try again.',
    };
  }

  try {
    const store = await data();
    await store.markAttendance(session.userId, {
      classId: input.classId,
      date: input.date,
      marks: input.marks,
    });
  } catch {
    return {
      ok: false,
      message: 'That change could not be saved. Your register is back to how it was.',
    };
  }

  revalidatePath('/attendance');
  return { ok: true, message: 'Register saved.' };
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
