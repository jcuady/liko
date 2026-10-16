import { z } from 'zod';

/**
 * Validation for the dated things on a calendar: academic terms, and the events,
 * deadlines and reminders a person types in beside their timetable.
 *
 * WHY A SCHEMA AND NOT A BLOCK OF `if` STATEMENTS. Same reason as the timetable.
 * The columns carry CHECK constraints and fixture mode has none, so a rule that
 * lives only in Postgres is a rule the demo does not have, and a demo that accepts
 * a term ending before it begins is a demo that shows a term nobody would see in
 * production.
 *
 * DATES AS `YYYY-MM-DD` AND MOMENTS AS FULL ISO. A term has a start date and an
 * end date and no time of day; an event has a moment. Keeping them different
 * types is what stops a term from being stored at midnight and then comparing
 * oddly against one that was not.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar date, not merely digits in the right places.
 *
 * `2026-13-01` matches the shape and is not a date, and `new Date('2026-13-01')`
 * rolls over to January rather than failing, which would silently store a term
 * starting on a different day than the one that was typed. The round trip is the
 * check: format it back and compare.
 */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The same round trip for a moment, at second precision. */
function isRealMoment(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && !Number.isNaN(Date.parse(value));
}

const termShape = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, 'Name the term.').max(120, 'That name is too long.'),
  kind: z.enum(['semester', 'quarter', 'term', 'trimester'], {
    message: 'Pick what kind of term this is.',
  }),
  startsOn: z
    .string()
    .regex(DATE, 'Use a date like 2026-08-03.')
    .refine(isRealDate, 'That is not a date that exists.'),
  endsOn: z
    .string()
    .regex(DATE, 'Use a date like 2026-12-18.')
    .refine(isRealDate, 'That is not a date that exists.'),
});

/**
 * `superRefine` rather than `refine(check, params)`: Zod 4 does not take a message
 * function in the second argument and renders the refusal as "Invalid input",
 * which describes the validator rather than the term.
 */
const termSchema = termShape.superRefine((term, ctx) => {
  if (term.endsOn < term.startsOn) {
    ctx.addIssue({
      code: 'custom',
      message: `A term has to end after it starts. ${term.startsOn} to ${term.endsOn} does not.`,
    });
  }
});

const eventShape = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  /** Null is the caller themselves, which is where a personal deadline lives. */
  studentId: z.string().trim().min(1).max(64).nullish(),
  title: z.string().trim().min(1, 'Give it a title.').max(160, 'That title is too long.'),
  notes: z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? '').trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, 500);
    }),
  startsAt: z
    .string()
    .refine(isRealMoment, 'Use a date and a time like 2026-10-20 at 23:59.'),
  endsAt: z
    .string()
    .nullish()
    .transform((value) => (value === undefined || value === null || value.trim() === '' ? null : value))
    .refine((value) => value === null || isRealMoment(value), 'That is not a time that exists.'),
  allDay: z.boolean().default(false),
  kind: z.enum(['assignment', 'assessment', 'exam', 'deadline', 'reminder', 'event'], {
    message: 'Pick what kind of thing this is.',
  }),
});

/*
 * `createdByRole` IS DELIBERATELY ABSENT FROM THE SHAPE.
 *
 * It is provenance, and provenance is not something a caller supplies. Accepting
 * it here would let a crafted post write a deadline attributed to an
 * administrator, which is a thing a teacher would be shown and believed. The
 * action reads it from the session it already authenticated.
 */

const eventSchema = eventShape.superRefine((event, ctx) => {
  if (event.endsAt !== null && Date.parse(event.endsAt) < Date.parse(event.startsAt)) {
    ctx.addIssue({
      code: 'custom',
      message: 'The end has to be after the start, or it lasts no time at all.',
    });
  }
});

export type TermInput = z.infer<typeof termSchema>;
export type EventInput = z.infer<typeof eventSchema>;

type Read<T> = { ok: true; row: T } | { ok: false; message: string };

function firstProblem(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  // A bare `z.ZodError.message` is a JSON dump, which is never what to show.
  return typeof issue?.message === 'string' && issue.message.length > 0
    ? issue.message
    : fallback;
}

export function readTerm(input: unknown): Read<TermInput> {
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstProblem(parsed.error, 'That term could not be read.') };
  }
  return { ok: true, row: parsed.data };
}

export function readEvent(input: unknown): Read<EventInput> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstProblem(parsed.error, 'That could not be saved.') };
  }
  return { ok: true, row: parsed.data };
}