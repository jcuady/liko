import { describe, expect, it } from 'vitest';

import {
  detectConflicts,
  formatMinute,
  parseClock,
  parseScheduleFromModel,
  ScheduleRefusal,
  sortEntries,
  type ScheduleEntry,
} from './extract';

const MONDAY_0830: ScheduleEntry = {
  dayOfWeek: 1,
  startMinute: 8 * 60 + 30,
  endMinute: 9 * 60 + 15,
  title: 'Mathematics',
  teacherName: 'Dela Cruz',
  room: 'Room 204',
};

describe('parseClock', () => {
  it('reads a 24 hour clock', () => {
    expect(parseClock('08:30')).toBe(8 * 60 + 30);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(23 * 60 + 59);
  });

  it('reads the 12 hour clocks students actually write on a timetable', () => {
    expect(parseClock('8:30 AM')).toBe(8 * 60 + 30);
    expect(parseClock('12:00 PM')).toBe(12 * 60);
    expect(parseClock('12:00 AM')).toBe(0);
    expect(parseClock('1:45 pm')).toBe(13 * 60 + 45);
  });

  it('reads a clock written without a colon, which is how grid timetables print it', () => {
    expect(parseClock('0830')).toBe(8 * 60 + 30);
    expect(parseClock('1530')).toBe(15 * 60 + 30);
  });

  it('reads a half past the hour written the way the Philippines writes it', () => {
    // "7:30 nm" is how a Manila timetable marks half past seven.
    expect(parseClock('7:30 nm')).toBe(19 * 60 + 30);
    expect(parseClock('7:30 nn')).toBe(7 * 60 + 30);
  });

  it('refuses a clock that is not one', () => {
    expect(parseClock('noon sharp')).toBeNull();
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('08:75')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('refuses a bare number that is not a four digit clock', () => {
    expect(parseClock('30')).toBeNull();
    expect(parseClock('99999')).toBeNull();
  });
});

describe('formatMinute', () => {
  it('renders minutes from midnight as a 24 hour clock', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(8 * 60 + 30)).toBe('08:30');
    expect(formatMinute(23 * 60 + 59)).toBe('23:59');
  });
});

describe('parseScheduleFromModel', () => {
  const answer = JSON.stringify({
    entries: [
      {
        dayOfWeek: 1,
        start: '08:30',
        end: '09:15',
        title: 'Mathematics',
        teacher: 'Dela Cruz',
        room: 'Room 204',
      },
      { dayOfWeek: 1, start: '10:00', end: '11:00', title: 'Science' },
      { dayOfWeek: 3, start: '13:00', end: '14:30', title: 'History', room: 'Lab 2' },
    ],
  });

  it('turns a model answer into weekly entries', () => {
    const schedule = parseScheduleFromModel(answer);
    expect(schedule.entries).toHaveLength(3);
    expect(schedule.entries[0]).toEqual(MONDAY_0830);
    expect(schedule.entries[2]).toEqual({
      dayOfWeek: 3,
      startMinute: 13 * 60,
      endMinute: 14 * 60 + 30,
      title: 'History',
      teacherName: null,
      room: 'Lab 2',
    });
  });

  it('reads a model answer wrapped in prose and a code fence', () => {
    const chatty = `Here is what I read from the photo:\n\`\`\`json\n${answer}\n\`\`\`\nLet me know if anything looks wrong.`;
    expect(parseScheduleFromModel(chatty).entries).toHaveLength(3);
  });

  it('accepts the day spelled as a name, because a model often answers that way', () => {
    const named = JSON.stringify({
      entries: [{ day: 'Monday', start: '08:30', end: '09:15', title: 'Mathematics' }],
    });
    const schedule = parseScheduleFromModel(named);
    expect(schedule.entries[0]?.dayOfWeek).toBe(1);
  });

  it('refuses an answer that is not a schedule at all', () => {
    expect(() => parseScheduleFromModel('I could not read that image.')).toThrow(ScheduleRefusal);
  });

  it('refuses an answer that was cut off before it finished', () => {
    const truncated = '{"entries":[{"dayOfWeek":1,"start":"08:30","end":"09:15",';
    expect(() => parseScheduleFromModel(truncated)).toThrow(/cut off/i);
  });

  it('refuses a schedule with nothing in it rather than saving an empty week', () => {
    // A blank week is indistinguishable from a failed read, and a student who
    // sees an empty grid concludes they have no classes.
    expect(() => parseScheduleFromModel('{"entries":[]}')).toThrow(/any classes/i);
  });

  it('keeps the entries it could read and warns about the ones it could not', () => {
    const mixed = JSON.stringify({
      entries: [
        { dayOfWeek: 1, start: '08:30', end: '09:15', title: 'Mathematics' },
        { dayOfWeek: 2, start: 'oops', end: '10:00', title: 'Art' },
        { dayOfWeek: 9, start: '10:00', end: '11:00', title: 'Music' },
        { dayOfWeek: 3, start: '14:00', end: '13:00', title: 'Backwards' },
      ],
    });
    const schedule = parseScheduleFromModel(mixed);
    // Only the one row that was actually well formed survives.
    expect(schedule.entries).toHaveLength(1);
    expect(schedule.warnings).toHaveLength(3);
  });

  it('refuses an entry whose end is at or before its start', () => {
    // A zero or negative length class is not a class, and storing one would put
    // an invisible entry on the student's week.
    const same = JSON.stringify({
      entries: [{ dayOfWeek: 1, start: '09:00', end: '09:00', title: 'Zero Length' }],
    });
    expect(() => parseScheduleFromModel(same)).toThrow(ScheduleRefusal);
  });

  it('collapses whitespace in a title a model wrapped across lines', () => {
    const wrapped = JSON.stringify({
      entries: [
        {
          dayOfWeek: 1,
          start: '08:30',
          end: '09:15',
          title: 'Advanced\n  Science   Laboratory',
        },
      ],
    });
    expect(parseScheduleFromModel(wrapped).entries[0]?.title).toBe('Advanced Science Laboratory');
  });

  it('drops an entry with no title rather than saving an unlabelled class', () => {
    const untitled = JSON.stringify({
      entries: [{ dayOfWeek: 1, start: '08:30', end: '09:15', title: '   ' }],
    });
    expect(() => parseScheduleFromModel(untitled)).toThrow(/any classes/i);
  });

  it('caps the number of rows rather than trusting an unbounded list', () => {
    const many = JSON.stringify({
      entries: Array.from({ length: 90 }, (_, index) => ({
        dayOfWeek: (index % 7) + 1,
        start: '08:00',
        end: '08:45',
        title: `Subject ${index}`,
      })),
    });
    expect(parseScheduleFromModel(many).entries.length).toBeLessThanOrEqual(60);
  });
});

describe('detectConflicts', () => {
  it('finds nothing when the week is clean', () => {
    expect(
      detectConflicts([
        MONDAY_0830,
        { ...MONDAY_0830, startMinute: 10 * 60, endMinute: 11 * 60, title: 'Science' },
      ]),
    ).toEqual([]);
  });

  it('treats an abutting class as no conflict', () => {
    // One ends at 09:15 and the next starts at 09:15. That is a normal changeover,
    // and flagging it would train a student to ignore the warning that matters.
    expect(
      detectConflicts([MONDAY_0830, { ...MONDAY_0830, startMinute: 9 * 60 + 15, title: 'Lab' }]),
    ).toEqual([]);
  });

  it('reports two classes that overlap on the same day', () => {
    const clash = { ...MONDAY_0830, startMinute: 9 * 60, title: 'Science' };
    const conflicts = detectConflicts([MONDAY_0830, clash]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ dayOfWeek: 1 });
  });

  it('does not report the same slot on two different days as a conflict', () => {
    expect(
      detectConflicts([MONDAY_0830, { ...MONDAY_0830, dayOfWeek: 2 }]),
    ).toEqual([]);
  });
});

describe('sortEntries', () => {
  it('orders by day, then by start time', () => {
    const sorted = sortEntries([
      { ...MONDAY_0830, dayOfWeek: 3 },
      { ...MONDAY_0830, startMinute: 9 * 60 },
      MONDAY_0830,
    ]);
    expect(sorted.map((entry) => `${entry.dayOfWeek}:${entry.startMinute}`)).toEqual([
      '1:510',
      '1:540',
      '3:510',
    ]);
  });

  it('does not mutate the array it was given', () => {
    const input = [{ ...MONDAY_0830, dayOfWeek: 4 }, MONDAY_0830];
    const copy = [...input];
    sortEntries(input);
    expect(input).toEqual(copy);
  });
});