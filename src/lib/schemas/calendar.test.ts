import { describe, expect, it } from 'vitest';

import { readEvent, readTerm } from './calendar';

/**
 * Validation for the dated things on a calendar.
 *
 * Same rule as the timetable and for the same reason: the columns carry CHECK
 * constraints and fixture mode has none, so a check that lives only in Postgres
 * is a check the demo silently does not have. The refusals here are the ones a
 * person can act on, because that is what a form has to say when it refuses.
 *
 * The assertions are about refusals. A test that only checks good input parses
 * passes just as happily against `z.any()`.
 */

const GOOD_TERM = {
  name: 'First semester',
  kind: 'semester' as const,
  startsOn: '2026-08-03',
  endsOn: '2026-12-18',
};

const GOOD_EVENT = {
  title: 'Lab report due',
  startsAt: '2026-10-20T23:59:00.000Z',
  kind: 'deadline' as const,
};

describe('an academic term', () => {
  it('accepts an ordinary one', () => {
    expect(readTerm(GOOD_TERM).ok).toBe(true);
  });

  it('refuses a blank name', () => {
    for (const name of ['', '   ']) {
      expect(readTerm({ ...GOOD_TERM, name }).ok, `name ${JSON.stringify(name)}`).toBe(false);
    }
  });

  it('refuses a kind it does not know', () => {
    // Anything a crafted post can invent has to fail rather than fall back.
    expect(readTerm({ ...GOOD_TERM, kind: 'year' }).ok).toBe(false);
    expect(readTerm({ ...GOOD_TERM, kind: 'SEMESTER' }).ok).toBe(false);
  });

  it('refuses a date that is not a date', () => {
    for (const startsOn of ['next monday', '2026-13-01', '', '08/03/2026']) {
      expect(readTerm({ ...GOOD_TERM, startsOn }).ok, `startsOn ${startsOn}`).toBe(false);
    }
  });

  /*
   * A term that ends before it begins is not a term, and the database stores
   * both dates without either being aware of the other.
   */
  it('refuses a term that ends before it starts, quoting both dates', () => {
    const parsed = readTerm({ ...GOOD_TERM, endsOn: '2026-07-01' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('2026-08-03');
    expect(parsed.message).toContain('2026-07-01');
  });

  it('accepts a term that ends the day it starts', () => {
    expect(readTerm({ ...GOOD_TERM, startsOn: '2026-08-03', endsOn: '2026-08-03' }).ok).toBe(true);
  });
});

describe('a dated event', () => {
  it('accepts an ordinary one', () => {
    expect(readEvent(GOOD_EVENT).ok).toBe(true);
  });

  it('refuses a blank title', () => {
    expect(readEvent({ ...GOOD_EVENT, title: '  ' }).ok).toBe(false);
  });

  it('refuses a kind it does not know', () => {
    for (const kind of ['homework', 'exam ', null, 7]) {
      expect(readEvent({ ...GOOD_EVENT, kind }).ok, `kind ${String(kind)}`).toBe(false);
    }
  });

  it('refuses a start that is not a moment in time', () => {
    for (const startsAt of ['tomorrow', 'next friday', '', '20/10/2026']) {
      expect(readEvent({ ...GOOD_EVENT, startsAt }).ok, `startsAt ${startsAt}`).toBe(false);
    }
  });

  /*
   * A BARE DATE IS ACCEPTED, DELIBERATELY.
   *
   * This assertion was written the other way round and it was the test that was
   * wrong. `2026-10-20` is a valid ISO 8601 date and `new Date` resolves it
   * deterministically to midnight UTC, so storing it as the start of an all-day
   * deadline is unambiguous. Refusing it would mean a person entering a date for
   * "the lab is due on the 20th" is told to invent a time of day they do not
   * have, and the stored value would be the one they meant either way.
   */
  it('accepts a bare date, which means midnight on that day', () => {
    const parsed = readEvent({ ...GOOD_EVENT, startsAt: '2026-10-20', allDay: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(new Date(parsed.row.startsAt).toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('refuses an end before its start', () => {
    const parsed = readEvent({
      ...GOOD_EVENT,
      endsAt: '2026-10-19T23:59:00.000Z',
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('end');
  });

  it('treats an absent end as a moment rather than a zero-length one', () => {
    const parsed = readEvent({ ...GOOD_EVENT, endsAt: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row.endsAt).toBeNull();
  });

  it('treats an absent student as the caller themselves', () => {
    const parsed = readEvent({ ...GOOD_EVENT, studentId: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row.studentId).toBeNull();
  });

  it('defaults all-day rather than requiring the form to say it', () => {
    const parsed = readEvent(GOOD_EVENT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row.allDay).toBe(false);
  });
});