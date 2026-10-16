'use server';

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePagePermission, requirePermission } from '@/lib/auth/guards';
import type { Role } from '@/lib/auth/rbac';
import type { ScheduleEntryRecord, StudentRecord } from '@/lib/api/types';
import { detectConflicts, formatMinute, type ScheduleEntry } from '@/lib/schedule/extract';

/**
 * Reading and writing one student's week.
 *
 * WHY THE READ RESOLVES THE SUBJECT RATHER THAN TRUSTING THE URL. The page
 * knows who it is showing: a student's own roster row, or a student a teacher
 * picked from their roster. Neither is taken from a query parameter, because a
 * query parameter is whatever the caller typed. A teacher picking a student is
 * filtered through `listStudents` on a class they own, so an id outside their
 * classes is not in the list to be picked.
 */

export interface ScheduleView {
  /** The roster row whose week this is. Null when the caller is not one. */
  student: StudentRecord | null;
  entries: ScheduleEntryRecord[];
  conflicts: ReturnType<typeof detectConflicts>;
  /** Students the caller may open a week for. Empty for a student. */
  options: Pick<StudentRecord, 'id' | 'fullName'>[];
  /**
   * Whether this account picks a subject rather than being one.
   *
   * Taken from the session role, never from `options.length`. An empty options
   * list means "this teacher has no students yet", not "this teacher is a
   * student", and inferring one from the other showed a teacher with a class but
   * no roster the student empty state: "You are not on a class yet. Your teacher
   * links you from the class roster."
   */
  staff: boolean;
  role: Role;
}

export interface ScheduleResult {
  ok: boolean;
  message?: string;
}

export async function loadSchedule(subjectId: string | null): Promise<ScheduleView> {
  const session = await requirePagePermission('class:read');
  const store = await data();

  const staff = session.role === 'instructor' || session.role === 'admin';

  /*
   * A student's subject is their own roster row, resolved through the account
   * link rather than asked for. A staff member's subject is the one they picked,
   * and a null subject with no classes is an empty state rather than an error.
   */
  if (!staff) {
    const own = await store.getMyStudentRecord(session.userId);
    if (!own) {
      return { student: null, entries: [], conflicts: [], options: [], staff, role: session.role };
    }
    const entries = await store.listSchedule(session.userId, own.id);
    return {
      student: own,
      entries,
      conflicts: detectConflicts(toDomain(entries)),
      options: [],
      staff,
      role: session.role,
    };
  }

  // The picker is every unarchived student on a class this account owns.
  const classes = await store.listClasses(session.userId);
  const rosters = await Promise.all(
    classes.map((record) => store.listStudents(session.userId, record.id)),
  );
  const options = rosters
    .flat()
    .filter((student) => student.archivedAt === null)
    .map((student) => ({ id: student.id, fullName: student.fullName }));

  if (!subjectId || !options.some((option) => option.id === subjectId)) {
    return { student: null, entries: [], conflicts: [], options, staff, role: session.role };
  }

  const entries = await store.listSchedule(session.userId, subjectId);
  const student =
    rosters.flat().find((candidate) => candidate.id === subjectId) ?? null;

  return {
    student,
    entries,
    conflicts: detectConflicts(toDomain(entries)),
    options,
    staff,
    role: session.role,
  };
}

/** The record shape the parser and the grid both speak. */
function toDomain(entries: ScheduleEntryRecord[]): ScheduleEntry[] {
  return entries.map((entry) => ({
    dayOfWeek: entry.dayOfWeek,
    startMinute: entry.startMinute,
    endMinute: entry.endMinute,
    title: entry.title,
    teacherName: entry.teacherName,
    room: entry.room,
  }));
}

export async function saveScheduleEntry(input: {
  id?: string;
  studentId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  title: string;
  teacherName?: string | null;
  room?: string | null;
}): Promise<ScheduleResult> {
  const session = await requirePermission('class:read');

  /*
   * VALIDATED HERE, NOT ONLY BY THE DATABASE.
   *
   * The columns carry CHECK constraints, so Postgres would refuse a day of 0 or
   * an end before its start. Fixture mode has no such constraint, so without
   * these checks the demo would accept a week the product would reject, and a
   * grid that renders a zero-length block in one mode and not the other is not
   * something a screenshot would catch.
   */
  const title = input.title.trim().slice(0, 120);
  if (title.length === 0) {
    return { ok: false, message: 'Give the class a name.' };
  }
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7) {
    return { ok: false, message: 'Pick a day of the week.' };
  }
  if (
    !Number.isInteger(input.startMinute) ||
    !Number.isInteger(input.endMinute) ||
    input.startMinute < 0 ||
    input.endMinute > 1439
  ) {
    return { ok: false, message: 'Those times are not on a clock.' };
  }
  if (input.endMinute <= input.startMinute) {
    return {
      ok: false,
      message: `A class has to end after it starts. ${formatMinute(input.startMinute)} to ${formatMinute(input.endMinute)} does not.`,
    };
  }

  try {
    const store = await data();
    await store.saveScheduleEntry(session.userId, {
      id: input.id,
      studentId: input.studentId,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      title,
      teacherName: input.teacherName?.trim().slice(0, 120) || null,
      room: input.room?.trim().slice(0, 120) || null,
      source: 'manual',
    });
  } catch {
    return { ok: false, message: 'That class could not be saved.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}

export async function removeScheduleEntry(input: {
  entryId: string;
  studentId: string;
}): Promise<ScheduleResult> {
  const session = await requirePermission('class:read');

  try {
    const store = await data();
    /*
     * The entry is read before it is deleted so the same check that gates the
     * write also gates the delete. Without it, a caller who guessed an id could
     * remove somebody else's class, because the seam's delete filters on the id
     * alone and trusts the database policy to be the only gate.
     */
    const current = (await store.listSchedule(session.userId, input.studentId)).find(
      (entry) => entry.id === input.entryId,
    );
    if (!current) {
      return { ok: false, message: 'That class is no longer on the timetable.' };
    }
    await store.deleteScheduleEntry(session.userId, input.entryId);
  } catch {
    return { ok: false, message: 'That class could not be removed.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}