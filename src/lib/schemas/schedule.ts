import { z } from 'zod';

import { formatMinute } from '@/lib/schedule/extract';

/**
 * The rules a timetable has to satisfy before anything is written.
 *
 * WHY THIS IS A SCHEMA AND NOT A BLOCK OF `if` STATEMENTS. The columns already
 * carry CHECK constraints, so Postgres refuses a day of 0, an end before its
 * start and a name over 120 characters. Fixture mode has no such constraint, so
 * without checks on this side the demo would accept a week the product rejects.
 * That is P2-09, and it was raised as "the inputs are validated by the database
 * alone".
 *
 * The second reason is the one that bit. Those checks were hand-written inside
 * `saveScheduleEntry`, and `replaceSchedule` had none of its own, because it was
 * written later and did not know about them. Confirming a photograph replaces the
 * whole week at once, so it needed every one of those rules and had none. One
 * schema means a second write path cannot be added without inheriting the rules.
 *
 * The sentences here are the product's, not Zod's. "A class has to end after it
 * starts. 09:00 to 08:00 does not." is something a student can act on, and a
 * `refinement failed` message is not.
 */

/**
 * The parser caps a photograph at this many rows, so a confirm body claiming more
 * is not a bigger week, it is a crafted one. See `MAX_ENTRIES` in
 * `lib/schedule/extract.ts`.
 */
export const MAX_WEEK_ROWS = 60;

/**
 * Largest photograph accepted, in bytes of the decoded file.
 *
 * Lives here rather than beside the action that enforces it because a `'use
 * server'` module may only export functions, and because the page has to state the
 * same limit to the student before they choose a file. One constant, read by both,
 * so the sentence on the screen and the check on the server cannot disagree.
 */
export const MAX_TIMETABLE_BYTES = 4 * 1024 * 1024;

/**
 * The `accept` attribute for the picker.
 *
 * Derived from the same list the AI client validates against, so the operating
 * system stops the student choosing a file the server would only refuse. HEIC and
 * HEIF are readable by the model but are left out here on purpose: a phone offers
 * them by default and they are usually the wrong choice for a screenshot anyway.
 */
export const TIMETABLE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * The same list in words.
 *
 * A student is not served by `image/jpeg,image/png,image/webp`. The `accept`
 * attribute needs the machine form and the line under the picker needs the human
 * one, and both come from here so they cannot drift. This is why `UploadPanel`
 * takes `accept` and `acceptedLabel` as two props rather than one.
 */
export const TIMETABLE_IMAGE_LABEL = 'JPEG, PNG or WebP';

/** The same limit in words, for the line under the picker. */
export const TIMETABLE_SIZE_LABEL = `${MAX_TIMETABLE_BYTES / (1024 * 1024)} MB`;

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const trimmed = (value ?? '').trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });

const scheduleRowShape = z.object({
  dayOfWeek: z
    .number('A day of the week is a number.')
    .int('A day of the week is a whole number.')
    .min(1, 'Pick a day of the week.')
    .max(7, 'Pick a day of the week.'),
  startMinute: z
    .number('Those times are not on a clock.')
    .int('Those times are not on a clock.')
    .min(0, 'Those times are not on a clock.')
    .max(1439, 'Those times are not on a clock.'),
  endMinute: z
    .number('Those times are not on a clock.')
    .int('Those times are not on a clock.')
    .min(0, 'Those times are not on a clock.')
    .max(1439, 'Those times are not on a clock.'),
  title: z
    .string('Give the class a name.')
    .trim()
    .min(1, 'Give the class a name.')
    .max(120, 'That class name is too long.'),
  teacherName: optionalText(120),
  room: optionalText(120),
});

/**
 * A class, with the ordering rule kept out of the object shape.
 *
 * A `.superRefine` rather than a second schema because `endMinute > startMinute`
 * needs both fields at once, and because the refusal has to quote them both back.
 * Written this way rather than as `.refine(check, (row) => ({ message }))` because
 * Zod 4 does not take a function there: it renders the refusal as "Invalid input",
 * which is a message that describes the validator rather than the student's week.
 */
const scheduleRowSchema = scheduleRowShape.superRefine((row, ctx) => {
  if (row.endMinute <= row.startMinute) {
    ctx.addIssue({
      code: 'custom',
      message: `A class has to end after it starts. ${formatMinute(row.startMinute)} to ${formatMinute(
        row.endMinute,
      )} does not.`,
    });
  }
});

export type ScheduleRow = z.infer<typeof scheduleRowSchema>;

export type ReadRow =
  | { ok: true; row: ScheduleRow }
  | { ok: false; message: string };

export type ReadWeek =
  | { ok: true; rows: ScheduleRow[] }
  | { ok: false; message: string };

/** The first refusal Zod found, in a sentence, or the row it accepted. */
function firstProblem(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  // A bare `z.ZodError.message` is a JSON dump, which is never what to show.
  return typeof issue?.message === 'string' && issue.message.length > 0
    ? issue.message
    : fallback;
}

export function readScheduleRow(input: unknown): ReadRow {
  const parsed = scheduleRowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstProblem(parsed.error, 'That class could not be read.') };
  }
  return { ok: true, row: parsed.data };
}

/**
 * A whole week.
 *
 * WHY THE REFUSAL NAMES A POSITION. Confirming a photograph replaces everything,
 * so one unreadable row would otherwise take the whole week down with it and the
 * student would be left with no way to tell which line of the photograph to look
 * at again. "The 2nd class in that photograph is not a class I can read" points at
 * the photo.
 */
export function readScheduleWeek(input: unknown): ReadWeek {
  const list = Array.isArray(input) ? input : [];

  if (list.length === 0) {
    return {
      ok: false,
      message:
        'Nothing was replaced. That photograph did not read as a week, so your timetable is ' +
        'still here. Add the classes by hand instead.',
    };
  }

  if (list.length > MAX_WEEK_ROWS) {
    return {
      ok: false,
      message: `That is more than ${MAX_WEEK_ROWS} classes. Check you photographed one week and not a whole term.`,
    };
  }

  const rows: ScheduleRow[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const parsed = readScheduleRow(list[index]);
    if (!parsed.ok) {
      const position = index + 1;
      const ordinal = `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}`;
      return { ok: false, message: `The ${ordinal} class could not be read. ${parsed.message}` };
    }
    rows.push(parsed.row);
  }

  return { ok: true, rows };
}