'use server';

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePagePermission, requirePermission } from '@/lib/auth/guards';
import type { Role } from '@/lib/auth/rbac';
import type { ScheduleEntryRecord, StudentRecord } from '@/lib/api/types';
import {
  MAX_TIMETABLE_BYTES,
  readScheduleRow,
  readScheduleWeek,
} from '@/lib/schemas/schedule';
import {
  SCHEDULE_INSTRUCTION,
  ScheduleRefusal,
  detectConflicts,
  parseScheduleFromModel,
  type ScheduleConflict,
  type ScheduleEntry,
} from '@/lib/schedule/extract';
import {
  AI_PURPOSE_SCHEDULE,
  AiUnavailable,
  GEMINI_MODEL,
  aiConfigured,
  generate,
  usageFrom,
  type UsageSummary,
} from '@/lib/ai/gemini';

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
   *
   * The rules live in one schema beside the `replaceSchedule` path, which needs
   * every one of them and would otherwise have had none: that is the whole of
   * P2-09.
   */
  const checked = readScheduleRow(input);
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }
  const row = checked.row;

  try {
    const store = await data();
    await store.saveScheduleEntry(session.userId, {
      id: input.id,
      studentId: input.studentId,
      dayOfWeek: row.dayOfWeek,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      title: row.title,
      teacherName: row.teacherName,
      room: row.room,
      source: 'manual',
    });

    /*
     * THE PRODUCER THE BELL WAS WAITING FOR.
     *
     * A student editing their own week does not notify themselves, and a
     * teacher editing somebody else's does. The recipient is resolved from the
     * roster row rather than from the caller for the same reason the seam
     * ignores a supplied `studentId`: a student's `owner_id` is their teacher,
     * so the two are different values and only one of them is a login.
     *
     * A failure to notify is deliberately NOT allowed to fail the save. The
     * class is on the timetable either way, and telling a teacher their class
     * was not saved because a notification bounced would be a lie.
     */
    if (input.studentId) {
      try {
        const recipient = await store.getStudent(session.userId, input.studentId);
        if (recipient?.accountId && recipient.accountId !== session.userId) {
          await store.createNotification(session.userId, {
            recipientId: recipient.accountId,
            kind: 'schedule_updated',
            title: 'Your timetable changed',
            body: `${row.title} was added to your week.`,
            url: '/schedule',
          });
        }
      } catch {
        // Swallowed on purpose, and the reason is above.
      }
    }
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

/*
 * ---------------------------------------------------------------------------
 * PHOTOGRAPHING A TIMETABLE.
 *
 * Two requests, deliberately, and never one.
 *
 * Reading a photograph is a guess and writing a week is a statement. Collapsing
 * them would replace a student's whole timetable with a model's first attempt at
 * a blurry photograph, with no moment at which the student is shown what was
 * read and can drop the rows that are wrong. So `readTimetableAction` returns a
 * proposal and writes nothing, and `confirmScheduleAction` is a separate request
 * that the student sends only once they have looked at it.
 *
 * The split also means the expensive call cannot be repeated by the confirm step,
 * and that the confirm step is not holding a photograph in memory across a page
 * the student is looking at.
 * ---------------------------------------------------------------------------
 */

/** What the model is told, beyond the JSON shape in `SCHEDULE_INSTRUCTION`. */
const TIMETABLE_SYSTEM =
  'You read a photograph of a school timetable and report the weekly classes it ' +
  'shows. You copy what is printed rather than correcting it, you never invent a ' +
  'class that is not visible in the photograph, and you leave out any row you ' +
  'cannot read rather than guessing at it.';

/** Largest photograph accepted, in bytes of the decoded file. Defined in the
 * schema module beside the other input bounds, because this file may only export
 * functions and the page needs to state the same limit on screen. */

export interface ProposedWeek {
  /** What to show for review. Nothing is written until this is confirmed. */
  entries: ScheduleEntry[];
  /** Rows the model could not read, said plainly rather than dropped in silence. */
  warnings: string[];
  /** Clashes found in the proposal, reported and never resolved. */
  conflicts: ScheduleConflict[];
}

export type ReadResult =
  | ({ ok: true; message: string } & ProposedWeek & { usage?: UsageSummary })
  | { ok: false; message: string; usage?: UsageSummary };

export type ConfirmResult =
  | { ok: true; message: string; saved: number }
  | { ok: false; message: string };

function withModel(usage: UsageSummary): UsageSummary {
  return { ...usage, model: GEMINI_MODEL };
}

/** Whether the deployment can read a photograph at all. */
export async function timetableAiStatusAction(): Promise<UsageSummary> {
  const session = await requirePermission('class:read');
  const store = await data();
  return withModel(usageFrom(await store.listAiUsage(session.userId), aiConfigured()));
}

/**
 * Reads a photograph into a proposed week. Writes nothing.
 *
 * The bytes arrive as FormData rather than as a base64 argument because that is
 * how a file is meant to cross this boundary, and because the size is refused
 * here, where the file is still small, instead of after a client has encoded a
 * 200 MB scan into a string.
 */
export async function readTimetableAction(form: FormData): Promise<ReadResult> {
  const session = await requirePermission('class:read');
  const store = await data();

  const studentId = String(form.get('studentId') ?? '');
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a photograph of your timetable first.' };
  }
  if (file.size > MAX_TIMETABLE_BYTES) {
    return {
      ok: false,
      message:
        'That photograph is too large to read. Take it closer, with just the timetable in it.',
    };
  }

  /*
   * Reach the subject before spending anything.
   *
   * `listSchedule` is the access probe rather than a role test, because it is the
   * one call whose permission answer comes from the same place the write's does:
   * RLS in production, `requireStudentFor` in fixture mode. A student naming
   * somebody else's roster row therefore fails here, before a generation is spent
   * on a week that could never have been saved.
   */
  await store.listSchedule(session.userId, studentId);

  if (!aiConfigured()) {
    return {
      ok: false,
      message:
        'Reading a photograph is not set up on this deployment. Add the classes by hand instead.',
    };
  }

  const before = withModel(usageFrom(await store.listAiUsage(session.userId), true));
  if (before.remaining <= 0) {
    return {
      ok: false,
      message: `You have used all ${before.limit} generations in the last hour. Try again shortly.`,
      usage: before,
    };
  }

  const mimeType = file.type || 'image/jpeg';
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  let parsed: ReturnType<typeof parseScheduleFromModel>;
  let tokens: { promptTokens: number; outputTokens: number };

  try {
    const raw = await generate({
      prompt: 'Read the timetable in this photograph into the weekly classes it shows.',
      system: TIMETABLE_SYSTEM,
      schemaHint: SCHEDULE_INSTRUCTION,
      image: { mimeType, base64 },
    });
    parsed = parseScheduleFromModel(raw.text);
    tokens = { promptTokens: raw.promptTokens, outputTokens: raw.outputTokens };
  } catch (cause) {
    if (cause instanceof AiUnavailable) {
      return { ok: false, message: cause.message, usage: before };
    }
    // Charged whether or not the answer was usable: the student's own allowance
    // did the work, and a limit that refunds failures can be spent by causing them.
    await store.recordAiGeneration(session.userId, {
      model: GEMINI_MODEL,
      purpose: AI_PURPOSE_SCHEDULE,
      promptTokens: 0,
      outputTokens: 0,
    });
    const after = withModel(usageFrom(await store.listAiUsage(session.userId), true));
    if (cause instanceof ScheduleRefusal) {
      return { ok: false, message: cause.message, usage: after };
    }
    return {
      ok: false,
      message:
        'I could not make a week out of that photograph. Try again with the timetable ' +
        'filling the frame and the light off to one side.',
      usage: after,
    };
  }

  await store.recordAiGeneration(session.userId, {
    model: GEMINI_MODEL,
    purpose: AI_PURPOSE_SCHEDULE,
    promptTokens: tokens.promptTokens,
    outputTokens: tokens.outputTokens,
  });
  const after = withModel(usageFrom(await store.listAiUsage(session.userId), true));

  const count = parsed.entries.length;
  return {
    ok: true,
    message: `I read ${count} ${count === 1 ? 'class' : 'classes'} from that photograph. Check them before they replace your week.`,
    entries: parsed.entries,
    warnings: parsed.warnings,
    conflicts: detectConflicts(parsed.entries),
    usage: after,
  };
}

/**
 * Replaces a week with what the student agreed to.
 *
 * The whole array is validated before the first row is written, because this is a
 * wholesale write: one bad row taking the request down halfway would leave a week
 * that is neither the old one nor the new one, and neither of them is something
 * anybody asked for. An empty array is refused by the same schema, which is what
 * stops a refusal from the read step turning into a wiped timetable.
 */
export async function confirmScheduleAction(input: {
  studentId: string;
  entries: unknown[];
}): Promise<ConfirmResult> {
  const session = await requirePermission('class:read');

  const checked = readScheduleWeek(input.entries);
  if (!checked.ok) {
    return { ok: false, message: checked.message };
  }

  try {
    const store = await data();
    await store.replaceSchedule(
      session.userId,
      input.studentId,
      checked.rows.map((row) => ({
        ...row,
        studentId: input.studentId,
        source: 'photo' as const,
      })),
    );
  } catch {
    return { ok: false, message: 'That week could not be saved. Nothing was changed.' };
  }

  revalidatePath('/schedule');
  const count = checked.rows.length;
  return {
    ok: true,
    message: `Your week is now ${count} ${count === 1 ? 'class' : 'classes'}.`,
    saved: count,
  };
}