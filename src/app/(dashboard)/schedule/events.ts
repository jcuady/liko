'use server';

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { CalendarEventRecord, TermRecord } from '@/lib/api/types';
import { readEvent, readTerm } from '@/lib/schemas/calendar';

/**
 * Academic terms, and the dated things that sit beside a timetable.
 *
 * The seam methods for all of this were built in `d245ebc` with no caller. This
 * is the caller, and the rules it applies are the ones the timetable already
 * settled on: validate through the schema rather than through the database alone,
 * read a row before deleting it so the same check gates the delete, and never
 * let a caller state who they are.
 */

/** How far ahead the schedule shows. Long enough for a term's worth of work. */
const HORIZON_DAYS = 120;

export interface CalendarExtras {
  terms: TermRecord[];
  /** Sorted soonest first, already bounded to the horizon. */
  events: CalendarEventRecord[];
}

export interface SaveResult {
  ok: boolean;
  message?: string;
}

export async function loadCalendarExtras(subjectId: string | null): Promise<CalendarExtras> {
  const session = await requirePermission('class:read');
  const store = await data();

  const from = new Date();
  const to = new Date(from.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const [terms, events] = await Promise.all([
    store.listTerms(session.userId),
    /*
     * THE SAME SUBJECT THE WRITE USES, AND THAT IS THE WHOLE POINT.
     *
     * The read was written with `null`, which is the caller's own events, while
     * the panel writes with the roster row it was given. A student adding a
     * deadline to their own week therefore wrote a row the read could not see,
     * the dialog closed successfully, and the deadline silently did not appear.
     * A write and the read that confirms it have to agree on whose calendar this
     * is, or the panel is a place where things can be saved and not appear.
     */
    store.listCalendarEvents(session.userId, subjectId, from.toISOString(), to.toISOString()),
  ]);

  return {
    terms,
    events: [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

/**
 * Writes an event or deadline.
 *
 * `createdByRole` comes from the session and not from the input, so a crafted
 * post cannot write a deadline that then renders as though an administrator sent
 * it. The column is provenance, and provenance is not something a caller
 * supplies.
 */
export async function saveEventAction(input: {
  studentId?: string | null;
  title: string;
  notes?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  kind: string;
}): Promise<SaveResult> {
  const session = await requirePermission('class:read');
  const store = await data();

  const checked = readEvent(input);
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  /*
   * A student may only write to their own calendar.
   *
   * The comparison is against the caller's OWN ROSTER ROW, not against their
   * account id. `class:read` is `own` for a student, and their own row is reached
   * through `students.account_id`, so "their own calendar" is `stu_001` while
   * "them" is `usr_demo_noor`. Comparing the two would refuse every deadline the
   * primary persona of this page tried to add, and pass a write aimed at some
   * other roster row only because the ids happen to differ in the wrong direction.
   */
  if (session.role === 'student' || session.role === 'guardian') {
    const own = await store.getMyStudentRecord(session.userId);
    if (checked.row.studentId && checked.row.studentId !== own?.id) {
      return { ok: false, message: 'You can only add things to your own calendar.' };
    }
  }

  try {
    await store.saveCalendarEvent(session.userId, {
      id: checked.row.id,
      studentId: checked.row.studentId ?? null,
      title: checked.row.title,
      notes: checked.row.notes,
      startsAt: new Date(checked.row.startsAt).toISOString(),
      endsAt: checked.row.endsAt ? new Date(checked.row.endsAt).toISOString() : null,
      allDay: checked.row.allDay,
      kind: checked.row.kind,
      createdByRole: session.role === 'admin' ? 'admin' : session.role === 'instructor' ? 'instructor' : 'student',
    });
  } catch {
    return { ok: false, message: 'That could not be saved.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}

/**
 * Removes an event.
 *
 * Read first, delete second. The seam's delete filters on the id alone, so
 * without the read a caller who guessed an id could remove somebody else's
 * deadline and the only thing standing in the way would be the database policy.
 */
export async function deleteEventAction(input: {
  eventId: string;
  studentId: string | null;
}): Promise<SaveResult> {
  const session = await requirePermission('class:read');

  try {
    const store = await data();
    const from = new Date(0);
    const to = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
    const owned = await store.listCalendarEvents(session.userId, input.studentId, from.toISOString(), to.toISOString());
    const current = owned.find((event) => event.id === input.eventId);
    if (!current) {
      return { ok: false, message: 'That is no longer on the calendar.' };
    }
    await store.deleteCalendarEvent(session.userId, input.eventId);
  } catch {
    return { ok: false, message: 'That could not be removed.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}

/**
 * Terms are `class:write`, not `class:read`.
 *
 * A term belongs to the school rather than to one student's week, and a student
 * holds `class:read` at scope `own`. Putting this on the read grant would let
 * every student redefine the school calendar.
 */
export async function saveTermAction(input: {
  id?: string;
  name: string;
  kind: string;
  startsOn: string;
  endsOn: string;
}): Promise<SaveResult> {
  const session = await requirePermission('class:write');

  const checked = readTerm(input);
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  try {
    const store = await data();
    await store.saveTerm(session.userId, checked.row);
  } catch {
    return { ok: false, message: 'That term could not be saved.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}

export async function deleteTermAction(input: { termId: string }): Promise<SaveResult> {
  const session = await requirePermission('class:write');

  try {
    const store = await data();
    const terms = await store.listTerms(session.userId);
    if (!terms.some((term) => term.id === input.termId)) {
      return { ok: false, message: 'That term is no longer there.' };
    }
    await store.deleteTerm(session.userId, input.termId);
  } catch {
    return { ok: false, message: 'That term could not be removed.' };
  }

  revalidatePath('/schedule');
  return { ok: true };
}