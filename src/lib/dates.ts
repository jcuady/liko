/**
 * Dates, rendered the same way on the server and in the browser.
 *
 * WHY THIS EXISTS. A date rendered with the runtime's own locale and the
 * runtime's own timezone is rendered TWICE: once by the server and once by
 * the browser. The server runs in UTC and the browser runs in the reader's
 * zone, so a timestamp near midnight falls on one day in one and on the next
 * day in the other, and the two renders disagree. React notices, and reports
 * a hydration error, and the visitor gets a page that threw on the way in.
 *
 * That is not a theory. The live check found it: `/slides` renders "edited
 * 26 Oct 2026" for a deck whose last edit was at 20:58 UTC, because 20:58 in
 * UTC is the 26th and 20:58 in Manila is the 27th. The server wrote the 26th,
 * the browser wanted the 27th, and the page reported a hydration error. It
 * was green in every local run, because the local server and the local
 * browser are in the same zone.
 *
 * So a date is rendered in ONE zone and ONE locale, and both are fixed. The
 * zone is the institution's, because the day a lesson happened is the
 * school's day. Where the institution has not said which zone it is in, it
 * is UTC, which is never wrong by accident: it is the same on both sides.
 *
 * AND A CALENDAR DAY IS NOT AN INSTANT. A term that starts on the 9th starts
 * on the 9th in every zone, so a `YYYY-MM-DD` value is read as a calendar day
 * rather than as midnight in some zone. Converting it to an instant is how a
 * term that begins on the 9th becomes a term that begins on the 8th for
 * anybody west of Greenwich.
 */

/**
 * The zone used when nobody has said otherwise.
 *
 * UTC rather than the runtime's zone, because the runtime's zone is the
 * thing that broke. A date in UTC is the same date on the server and in every
 * browser, which is the property that matters.
 */
export const DEFAULT_TIME_ZONE = 'UTC';

/**
 * The locale used for every date.
 *
 * Pinned rather than left to the browser, for the same reason: a reader in
 * Germany and a reader in the Philippines would otherwise see different
 * strings for the same day, and the server would have had to guess which one
 * the reader wanted before it had heard from them.
 */
export const DATE_LOCALE = 'en-GB';

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar day read at noon UTC.
 *
 * Noon rather than midnight, because midnight UTC is the previous day in
 * every zone west of Greenwich and the next day in every zone east of
 * Greenwich plus twelve. Noon is the same day everywhere a school might be.
 */
function calendarDay(day: string): Date | null {
  const match = CALENDAR_DAY.exec(day.trim());
  if (!match) return null;
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function render(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(DATE_LOCALE, { ...options, timeZone });
}

/** A day, written as a reader writes it: `9 Jan 2026`. */
export function formatDay(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return render(parsed, timeZone, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A day, written with the weekday: `Fri, 9 Jan 2026`. */
export function formatDayWithWeekday(
  iso: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return render(parsed, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** A day without the year: `9 Jan`. */
export function formatDayShort(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return render(parsed, timeZone, { day: 'numeric', month: 'short' });
}

/** The time of day: `20:58`. */
export function formatTime(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString(DATE_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/**
 * A `YYYY-MM-DD` day, written as a reader writes it: `9 Jan 2026`.
 *
 * The day is the day that was recorded. It is not converted to an instant,
 * because a calendar day belongs to no zone in particular.
 */
export function formatCalendarDay(day: string): string {
  const parsed = calendarDay(day);
  if (!parsed) return day;
  return render(parsed, DEFAULT_TIME_ZONE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A `YYYY-MM-DD` day without the year: `9 Jan`. */
export function formatCalendarDayShort(day: string): string {
  const parsed = calendarDay(day);
  if (!parsed) return day;
  return render(parsed, DEFAULT_TIME_ZONE, { day: 'numeric', month: 'short' });
}

/** A `YYYY-MM-DD` day with the weekday: `Fri, 9 Jan 2026`. */
export function formatCalendarDayWithWeekday(day: string): string {
  const parsed = calendarDay(day);
  if (!parsed) return day;
  return render(parsed, DEFAULT_TIME_ZONE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
