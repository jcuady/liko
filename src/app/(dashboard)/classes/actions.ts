'use server';

/**
 * Roster writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `createClass` or `createStudent` itself. Every action re-checks the
 * session and the permission, because a server action is a public endpoint and
 * `proxy.ts` never sees it.
 *
 * Validation lives here rather than in the form so the same rules apply to a
 * crafted request.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { classLevelSchema, type ClassLevel } from '@/lib/api/types';

export interface RosterResult {
  ok: boolean;
  message: string;
}

const LEVELS: ClassLevel[] = ['preschool', 'k12', 'university'];

function clean(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function createClass(input: {
  name: string;
  code: string;
  level: ClassLevel;
  meetsPerWeek: number;
}): Promise<RosterResult> {
  const session = await requirePermission('class:write');

  const name = clean(input.name, 80);
  const code = clean(input.code, 24).toUpperCase();
  const meetsPerWeek = Math.round(input.meetsPerWeek);

  if (name.length < 2) {
    return { ok: false, message: 'Give the class a name of at least two characters.' };
  }
  if (code.length < 2) {
    return { ok: false, message: 'Give the class a short code, such as CHEM-2.' };
  }
  if (!LEVELS.includes(input.level) || !classLevelSchema.safeParse(input.level).success) {
    return { ok: false, message: 'That level is not one this app supports.' };
  }
  if (!Number.isFinite(meetsPerWeek) || meetsPerWeek < 1 || meetsPerWeek > 14) {
    return { ok: false, message: 'Lessons per week must be between 1 and 14.' };
  }

  try {
    const store = await data();
    await store.createClass(session.userId, { name, code, level: input.level, meetsPerWeek });
  } catch {
    return { ok: false, message: 'That class could not be created. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: `${name} created.` };
}

export async function archiveClass(classId: string): Promise<RosterResult> {
  const session = await requirePermission('class:write');
  if (!classId) return { ok: false, message: 'That class could not be archived.' };

  try {
    const store = await data();
    await store.archiveClass(session.userId, classId);
  } catch {
    return { ok: false, message: 'That class could not be archived. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: 'Class archived.' };
}

export async function createStudent(input: {
  classId: string;
  fullName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
}): Promise<RosterResult> {
  const session = await requirePermission('class:write');

  const fullName = clean(input.fullName, 80);
  const guardianName = clean(input.guardianName, 80);
  const guardianEmail = clean(input.guardianEmail, 120).toLowerCase();
  const guardianPhone = clean(input.guardianPhone, 32);

  if (!input.classId) return { ok: false, message: 'Pick a class first.' };
  if (fullName.length < 2) {
    return { ok: false, message: 'Enter the student name.' };
  }
  // An address that will bounce is worse than none: the school finds out a day
  // late that a family never got the message.
  if (guardianEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
    return { ok: false, message: 'That guardian email address does not look right.' };
  }

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  try {
    const store = await data();
    await store.createStudent(session.userId, {
      classId: input.classId,
      fullName,
      initials,
      guardianName: guardianName.length > 0 ? guardianName : null,
      guardianEmail: guardianEmail.length > 0 ? guardianEmail : null,
      guardianPhone: guardianPhone.length > 0 ? guardianPhone : null,
    });
  } catch {
    return { ok: false, message: 'That student could not be added. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: `${fullName} added.` };
}

export async function archiveStudent(studentId: string): Promise<RosterResult> {
  const session = await requirePermission('class:write');
  if (!studentId) return { ok: false, message: 'That student could not be archived.' };

  try {
    const store = await data();
    await store.archiveStudent(session.userId, studentId);
  } catch {
    return { ok: false, message: 'That student could not be archived. Try again.' };
  }

  revalidatePath('/classes');
  return { ok: true, message: 'Student archived.' };
}
