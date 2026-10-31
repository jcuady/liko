import { describe, expect, it } from 'vitest';

import {
  formatCalendarDay,
  formatCalendarDayShort,
  formatCalendarDayWithWeekday,
  formatDay,
  formatDayShort,
  formatDayWithWeekday,
  formatTime,
} from './dates';

/**
 * THE TIMESTAMP THAT BROKE IT.
 *
 * The live check found a hydration error on `/slides` because this instant is
 * the 26th in UTC and the 27th in Manila, and the server and the browser
 * each rendered the day they were in. It is here so the property that fixes it
 * is stated as a fact rather than as an intention.
 */
const NEAR_MIDNIGHT = '2026-10-26T20:58:24.888038+00:00';

describe('a date is rendered in the zone it is given', () => {
  it('puts the same instant on different days in different zones', () => {
    expect(formatDay(NEAR_MIDNIGHT, 'UTC')).toBe('26 Oct 2026');
    expect(formatDay(NEAR_MIDNIGHT, 'Europe/London')).toBe('26 Oct 2026');
    expect(formatDay(NEAR_MIDNIGHT, 'Asia/Manila')).toBe('27 Oct 2026');
  });

  it('gives the same answer whatever the zone the machine is in', () => {
    /*
     * The zone is an argument and never the runtime's, so the answer cannot
     * depend on where the code is running. A helper that fell back to the
     * runtime's zone would answer differently on a server in UTC and a
     * browser in Manila, which is the defect.
     */
    expect(formatDay(NEAR_MIDNIGHT, 'UTC')).toBe('26 Oct 2026');
    expect(formatDayWithWeekday(NEAR_MIDNIGHT, 'UTC')).toBe('Mon, 26 Oct 2026');
    expect(formatDayShort(NEAR_MIDNIGHT, 'UTC')).toBe('26 Oct');
    expect(formatTime(NEAR_MIDNIGHT, 'UTC')).toBe('20:58');
  });

  it('renders the time of an instant in the zone it is given', () => {
    expect(formatTime(NEAR_MIDNIGHT, 'Asia/Manila')).toBe('04:58');
  });

  it('says nothing at all about a value that is not a date', () => {
    expect(formatDay('not a date')).toBe('');
    expect(formatDayShort('')).toBe('');
    expect(formatTime('not a date')).toBe('');
  });
});

describe('a calendar day is the day that was recorded', () => {
  it('does not move for a reader west of Greenwich', () => {
    /*
     * A term that begins on the ninth of January begins on the ninth of
     * January everywhere. Reading it as midnight in the reader's zone and
     * writing it back in the reader's zone is how a term that begins on the
     * ninth becomes a term that begins on the eighth.
     */
    expect(formatCalendarDay('2026-01-09')).toBe('9 Jan 2026');
    expect(formatCalendarDayShort('2026-01-09')).toBe('9 Jan');
    expect(formatCalendarDayWithWeekday('2026-01-09')).toBe('Fri, 9 Jan 2026');
  });

  it('does not move for a reader east of Greenwich either', () => {
    expect(formatCalendarDay('2026-01-01')).toBe('1 Jan 2026');
    expect(formatCalendarDay('2026-12-31')).toBe('31 Dec 2026');
  });

  it('gives back what it was given when the value is not a day', () => {
    expect(formatCalendarDay('not a day')).toBe('not a day');
    expect(formatCalendarDayShort('')).toBe('');
  });
});
