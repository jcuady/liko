/**
 * How long ago something happened, in words a person reads without decoding.
 *
 * Used by the notification bell. The rules are truncation and a singular, never
 * rounding: a reader who is told "1 hours ago" has been told something false,
 * and one who is told "in -3 minutes" has been told nothing at all.
 *
 * Kept in `lib` rather than beside the component because it is pure arithmetic
 * with no React in it, and a function that cannot be tested without a DOM is a
 * function that does not get tested.
 *
 * WHY THE ZONE IS AN ARGUMENT. The date a count falls on is a day in the
 * institution's zone, not a day in whichever zone the reader's browser happens
 * to be in, and not a day in whichever zone the server happens to be in. The
 * two are different, and a date rendered differently by the two is a page that
 * reports a hydration error.
 */

import { DATE_LOCALE, DEFAULT_TIME_ZONE } from './dates';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Above a week, a count of days stops meaning anything and the date takes over. */
const CUTOFF = WEEK;

/**
 * `now` is an argument rather than a lookup so the boundaries can be pinned in
 * a test. Callers with no reason to care pass nothing and get the current time.
 */
export function relativeTime(
  iso: string,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;

  /*
   * A timestamp later than now is not a message about the future, it is a
   * database clock that disagrees with this one. Reporting it as elapsed is the
   * only reading that stays true.
   */
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < MINUTE) return 'Just now';

  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min ago`;

  if (seconds < DAY) {
    const hours = Math.floor(seconds / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  if (seconds < CUTOFF) {
    const days = Math.floor(seconds / DAY);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  return then.toLocaleDateString(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });
}