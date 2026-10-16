import { describe, expect, it } from 'vitest';

import { readScheduleWeek, readScheduleRow } from './schedule';

/**
 * The rules a timetable row has to satisfy before it can be written.
 *
 * These assertions are about refusals. A test that only checks a good row parses
 * passes just as happily when the schema has been reduced to `z.any()`, and the
 * whole point of this file is that something is turned away.
 */

const GOOD = {
  dayOfWeek: 1,
  startMinute: 480,
  endMinute: 510,
  title: 'Mathematics',
  teacherName: 'Santos',
  room: 'Room 204',
};

describe('a single class', () => {
  it('accepts an ordinary row', () => {
    const parsed = readScheduleRow(GOOD);
    expect(parsed.ok).toBe(true);
  });

  it('refuses a day outside Monday to Sunday', () => {
    for (const dayOfWeek of [0, 8, -1, 2.5]) {
      const parsed = readScheduleRow({ ...GOOD, dayOfWeek });
      expect(parsed.ok, `day ${dayOfWeek} should be refused`).toBe(false);
    }
  });

  it('refuses a time that is not on a clock', () => {
    for (const minute of [-1, 1440, 12.5]) {
      const parsed = readScheduleRow({ ...GOOD, startMinute: minute });
      expect(parsed.ok, `start ${minute} should be refused`).toBe(false);
    }
  });

  /*
   * The rule the database states as `end_minute > start_minute`, and the reason a
   * zero-length row is worse than a missing one: it renders as an invisible block
   * on the grid and reads as a gap in the week rather than as a bad row.
   */
  it('refuses a class that does not end after it starts', () => {
    for (const endMinute of [480, 470]) {
      const parsed = readScheduleRow({ ...GOOD, endMinute });
      expect(parsed.ok, `end ${endMinute} should be refused`).toBe(false);
    }
  });

  it('quotes both times back in the refusal', () => {
    const parsed = readScheduleRow({ ...GOOD, startMinute: 540, endMinute: 480 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toBe(
      'A class has to end after it starts. 09:00 to 08:00 does not.',
    );
  });

  it('refuses a blank name', () => {
    for (const title of ['', '   ', '\t\n']) {
      const parsed = readScheduleRow({ ...GOOD, title });
      expect(parsed.ok, `title ${JSON.stringify(title)} should be refused`).toBe(false);
    }
  });

  /*
   * The column carries `char_length(title) between 1 and 120`, so a longer name
   * is something Postgres refuses outright. Truncating it instead would make
   * fixture mode accept a row the product would reject, which is the exact shape
   * of defect P2-09 was raised about.
   */
  it('refuses a name longer than the column allows rather than cutting it', () => {
    const parsed = readScheduleRow({ ...GOOD, title: 'M'.repeat(121) });
    expect(parsed.ok).toBe(false);
  });

  it('accepts a name exactly on the limit', () => {
    const parsed = readScheduleRow({ ...GOOD, title: 'M'.repeat(120) });
    expect(parsed.ok).toBe(true);
  });

  it('treats an absent teacher and room as absent rather than as invalid', () => {
    const parsed = readScheduleRow({ ...GOOD, teacherName: null, room: undefined });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row.teacherName).toBeNull();
    expect(parsed.row.room).toBeNull();
  });
});

describe('a whole week', () => {
  it('accepts a week of ordinary rows', () => {
    const parsed = readScheduleWeek([GOOD, { ...GOOD, dayOfWeek: 2 }]);
    expect(parsed.ok).toBe(true);
  });

  /*
   * THE RULE THAT PREVENTS A WIPE.
   *
   * Confirming a photograph replaces the week wholesale, so an empty array would
   * delete every class the student has. The read step already refuses a photograph
   * with no classes in it, but the confirm step is a separate request with its own
   * body and cannot assume the other one ran. An empty week is refused here
   * rather than being allowed to mean "empty your timetable".
   */
  it('refuses an empty week', () => {
    const parsed = readScheduleWeek([]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('replace');
  });

  it('refuses the whole week when one row is bad, naming that row', () => {
    const parsed = readScheduleWeek([
      GOOD,
      { ...GOOD, dayOfWeek: 9 },
      { ...GOOD, dayOfWeek: 3 },
    ]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    // "the second class" is what tells a student which line of a photograph to go
    // and look at again.
    expect(parsed.message).toContain('2');
  });

  it('refuses a week longer than the parser will ever produce', () => {
    const parsed = readScheduleWeek(Array.from({ length: 61 }, () => GOOD));
    expect(parsed.ok).toBe(false);
  });
});