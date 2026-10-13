/**
 * Turning a photograph of a timetable into a week the student can use.
 *
 * WHY THIS IS PURE. This module takes a string and returns a week. It never
 * touches a canvas, a file, a Date or the network. That is the same rule
 * `omr.ts` is built on: the arithmetic that can be quietly wrong is the part that
 * has to be holdable on its own, against an answer whose truth was decided
 * before the model ran.
 *
 * WHY TIMES ARE MINUTES, NOT DATES. A recurring weekly class has no date. Give it
 * one and the row silently depends on a time zone, and a student in Manila and a
 * teacher in Cebu disagree about when Tuesday starts for a week that never
 * changes. `startMinute` is minutes since local midnight, so the row is the same
 * object everywhere and "Tuesday 08:30" cannot drift.
 *
 * WHY THE STUDENT CONFIRMS IT. Same safety property as the paper OMR screen: the
 * detector is expected to be good, not infallible. A photograph of a timetable is
 * exactly the case where one misread character produces a plausible-looking wrong
 * week, so nothing is written until the student has seen the rows and agreed.
 *
 * WHY A BAD ROW IS A WARNING, NOT A SILENT DROP. A model that reads nine classes
 * well and one badly should still produce the nine. Dropping the bad row without
 * saying so leaves the student believing the photo was fully understood.
 */

export type ScheduleRefusalReason = 'not-json' | 'cut-off' | 'not-a-schedule' | 'no-classes';

export class ScheduleRefusal extends Error {
  readonly reason: ScheduleRefusalReason;
  constructor(reason: ScheduleRefusalReason, message: string) {
    super(message);
    this.name = 'ScheduleRefusal';
    this.reason = reason;
  }
}

/** One recurring weekly class. `dayOfWeek` is ISO: 1 is Monday, 7 is Sunday. */
export interface ScheduleEntry {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  title: string;
  teacherName: string | null;
  room: string | null;
}

export interface ScheduleConflict {
  dayOfWeek: number;
  first: ScheduleEntry;
  second: ScheduleEntry;
}

export interface WeeklySchedule {
  entries: ScheduleEntry[];
  /** One line per row that was dropped, so the screen can say what was lost. */
  warnings: string[];
}

/** A real week is not this long, and a runaway list is a sign the read went wrong. */
const MAX_ENTRIES = 60;
const MAX_TITLE_CHARS = 120;
const MAX_NAME_CHARS = 120;

/**
 * "nn" and "nm" are how a Manila timetable marks noon and night. A student
 * photographing a Filipino school timetable will meet them, and "7:30 nm" is
 * 19:30 to the person who wrote it.
 */
const NOON_TOKENS = ['nn'];
const NIGHT_TOKENS = ['nm'];

const DAY_NAMES: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};

/**
 * Reads a clock in any of the ways a timetable actually writes one.
 *
 * Returns null rather than a guess. A wrong time is the worst possible outcome
 * here, because it is indistinguishable from a right one until the student turns
 * up to the wrong room.
 */
export function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  let text = value.trim().toLowerCase();
  if (!text) return null;

  let meridiem: 'am' | 'pm' | null = null;
  let isNight = false;
  let isNoon = false;

  for (const token of NIGHT_TOKENS) {
    // A boundary, not `includes`: "nm" appears inside no English time word, but a
    // bare substring test would one day match a subject name.
    if (new RegExp(`(^|\\s)${token}(\\s|$)`).test(text)) {
      isNight = true;
      text = text.replace(new RegExp(`(^|\\s)${token}(\\s|$)`, 'g'), ' ');
    }
  }
  for (const token of NOON_TOKENS) {
    if (new RegExp(`(^|\\s)${token}(\\s|$)`).test(text)) {
      isNoon = true;
      text = text.replace(new RegExp(`(^|\\s)${token}(\\s|$)`, 'g'), ' ');
    }
  }
  for (const token of ['am', 'pm', 'a.m.', 'p.m.']) {
    if (new RegExp(`(^|\\s)${token.replace('.', '\\.')}(\\s|$)`).test(text)) {
      meridiem = token.startsWith('a') ? 'am' : 'pm';
      text = text.replace(new RegExp(`(^|\\s)${token.replace('.', '\\.')}(\\s|$)`, 'g'), ' ');
    }
  }

  text = text.replace(/[\s.]/g, '');
  if (!text) return null;

  let hour: number;
  let minute: number;

  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (/^\d{4}$/.test(text)) {
    // Grid timetables print "0830" with no colon. Only exactly four digits: "30"
    // is not half past and "99999" is not a time.
    hour = Number(text.slice(0, 2));
    minute = Number(text.slice(2));
  } else {
    return null;
  }

  if (minute > 59) return null;

  if (meridiem === 'am') {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
  } else if (meridiem === 'pm') {
    if (hour < 1 || hour > 12) return null;
    if (hour !== 12) hour += 12;
  } else if (isNight) {
    if (hour > 23) return null;
    if (hour < 12) hour += 12;
  } else if (isNoon) {
    if (hour > 23) return null;
  } else if (hour > 23) {
    return null;
  }

  const total = hour * 60 + minute;
  return total >= 0 && total <= 1439 ? total : null;
}

export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minute)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Pulls the first complete JSON object out of a model answer.
 *
 * The brace matcher is copied in spirit from `slides/generate.ts`: a model that
 * wraps JSON in an apology must still produce a schedule, and an answer that
 * stops mid object has to be refused rather than half read.
 */
function extractJson(raw: string): unknown {
  const candidate = raw.trim();
  if (!candidate) {
    throw new ScheduleRefusal('not-a-schedule', 'The answer was empty.');
  }

  const start = candidate.indexOf('{');
  if (start === -1) {
    throw new ScheduleRefusal('not-a-schedule', 'The answer was not a timetable.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          throw new ScheduleRefusal('not-json', 'The answer was not valid JSON.');
        }
      }
    }
  }

  throw new ScheduleRefusal('cut-off', 'The answer was cut off before it finished.');
}

function firstString(source: Record<string, unknown>, keys: string[], max: number): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, max);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function parseDay(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }
  if (typeof value === 'string') {
    const named = DAY_NAMES[value.trim().toLowerCase()];
    if (named) return named;
    const digits = value.trim();
    if (/^[1-7]$/.test(digits)) return Number(digits);
  }
  return null;
}

/** Reads a row, accepting the shapes a model actually answers with. */
function readEntry(raw: unknown): ScheduleEntry | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'a row that was not an object';
  }
  const row = raw as Record<string, unknown>;

  const dayOfWeek = parseDay(row.dayOfWeek ?? row.day ?? row.weekday);
  if (dayOfWeek === null) return 'a row with no day we recognise';

  const title = firstString(row, ['title', 'subject', 'name', 'class'], MAX_TITLE_CHARS);
  if (!title) return 'a row with no class name';

  let startMinute = parseClock(row.start ?? row.startTime ?? row.from);
  let endMinute = parseClock(row.end ?? row.endTime ?? row.to);
  if (startMinute === null && typeof row.startMinute === 'number') startMinute = row.startMinute;
  if (endMinute === null && typeof row.endMinute === 'number') endMinute = row.endMinute;
  if (startMinute === null || endMinute === null) return `${title} with an unreadable time`;

  if (endMinute <= startMinute) return `${title} with an end time at or before its start`;

  return {
    dayOfWeek,
    startMinute,
    endMinute,
    title,
    teacherName: firstString(row, ['teacher', 'teacherName', 'teacher_name'], MAX_NAME_CHARS),
    room: firstString(row, ['room', 'location', 'place'], MAX_NAME_CHARS),
  };
}

/**
 * Builds a week from a model answer.
 *
 * Throws `ScheduleRefusal` rather than returning a partial week silently. A
 * student who photographed a timetable and then saw an empty grid would conclude
 * they have no classes, which is a worse outcome than being told the photo could
 * not be read and being asked to try again.
 */
export function parseScheduleFromModel(raw: string): WeeklySchedule {
  const parsed = extractJson(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ScheduleRefusal('not-a-schedule', 'The answer was not a timetable.');
  }

  const rows = (parsed as Record<string, unknown>).entries;
  if (!Array.isArray(rows)) {
    throw new ScheduleRefusal('not-a-schedule', 'The answer was not a timetable.');
  }

  const entries: ScheduleEntry[] = [];
  const warnings: string[] = [];

  for (const raw of rows.slice(0, MAX_ENTRIES)) {
    const result = readEntry(raw);
    if (typeof result === 'string') {
      warnings.push(`I could not read ${result}.`);
      continue;
    }
    entries.push(result);
  }

  if (rows.length > MAX_ENTRIES) {
    warnings.push(`I read the first ${MAX_ENTRIES} rows and stopped.`);
  }

  if (entries.length === 0) {
    throw new ScheduleRefusal('no-classes', 'I could not find any classes in that photo.');
  }

  return { entries: sortEntries(entries), warnings };
}

/**
 * Classes that overlap on the same day.
 *
 * Reported rather than prevented. A student whose timetable genuinely has a
 * clash, or whose photo was misread into one, is better served by seeing it than
 * by having a row silently reshuffled.
 */
export function detectConflicts(entries: ScheduleEntry[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const byDay = new Map<number, ScheduleEntry[]>();

  for (const entry of entries) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    byDay.set(entry.dayOfWeek, list);
  }

  for (const [, dayEntries] of byDay) {
    const sorted = sortEntries(dayEntries);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const first = sorted[i]!;
        const second = sorted[j]!;
        // Strict, so an abutting changeover is not a clash.
        if (second.startMinute < first.endMinute) {
          conflicts.push({ dayOfWeek: first.dayOfWeek, first, second });
        }
      }
    }
  }

  return conflicts;
}

/** Day first, then start time. Returns a new array; the input is left alone. */
export function sortEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  return [...entries].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
  );
}

/**
 * What the model is asked for.
 *
 * Exported so the instruction and the parser cannot drift apart, the same way
 * `OUTLINE_INSTRUCTION` sits beside `buildDeckFromOutline`.
 */
export const SCHEDULE_INSTRUCTION = `You read a photograph of a student's weekly class timetable.

Reply with JSON only. No prose, no code fence.

{
  "entries": [
    {
      "dayOfWeek": 1,
      "start": "08:30",
      "end": "09:15",
      "title": "Mathematics",
      "teacher": "Dela Cruz",
      "room": "Room 204"
    }
  ]
}

Rules:
- dayOfWeek is ISO: 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday,
  6 Saturday, 7 Sunday.
- start and end are 24 hour "HH:MM" strings. If the photograph uses a 12 hour
  clock, convert it. "7:30 nm" means 19:30.
- title is the subject or class name, copied as printed.
- teacher and room are optional. Use null when the photograph does not say.
- One entry per class in the week, including every day shown.
- Never invent a class that is not in the photograph.
- If you cannot read a row, leave it out rather than guessing at it.

Return {"entries": []} when the photograph contains no timetable.`;