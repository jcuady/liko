'use server';

/**
 * Behaviour log writes and history reads.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `addBehaviourLog` or `getStudentHistory` itself.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { HistoryRecord, Severity } from '@/lib/api/types';

export interface BehaviourResult {
  ok: boolean;
  message: string;
}

/** Read path for the client cache. Goes through the seam, never a bare fetch. */
export async function loadHistory(studentId: string): Promise<HistoryRecord[]> {
  const session = await requirePermission('history:read');
  const store = await data();
  return store.getStudentHistory(session.userId, studentId);
}

const SEVERITIES: Severity[] = ['note', 'praise', 'concern', 'intervention'];

export const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'praise', label: 'Praise' },
  { value: 'concern', label: 'Concern' },
  { value: 'intervention', label: 'Intervention' },
];

export async function addBehaviourLog(input: {
  classId: string;
  studentId: string;
  entry: string;
  severity: Severity;
}): Promise<BehaviourResult> {
  const session = await requirePermission('history:read');

  const entry = input.entry.trim();

  if (!input.classId || !input.studentId) {
    return { ok: false, message: 'Pick a student before adding a note.' };
  }
  if (entry.length === 0) {
    return { ok: false, message: 'That entry was empty, so nothing was saved.' };
  }
  if (entry.length > 500) {
    return { ok: false, message: 'Keep entries under 500 characters.' };
  }
  if (!SEVERITIES.includes(input.severity)) {
    return { ok: false, message: 'That kind of entry is not one this app records.' };
  }

  try {
    const store = await data();
    await store.addBehaviourLog(session.userId, {
      classId: input.classId,
      studentId: input.studentId,
      entry,
      severity: input.severity,
    });
  } catch {
    return { ok: false, message: 'That entry could not be saved. Try again.' };
  }

  revalidatePath('/history');
  revalidatePath('/attendance');
  return { ok: true, message: 'Entry added.' };
}
