import { describe, expect, it } from 'vitest';

import {
  NOTE_MAX_LENGTH,
  NOTE_SEVERITIES,
  describeNoteSeverity,
  noteProblem,
} from './note-craft';

/**
 * The note vocabulary, tested apart from the component that renders it.
 *
 * WHY A `.ts` FILE WITH NO JSX. The unit suite collects `src/**\/*.test.ts` and
 * does not collect `.tsx`, so a component test written as a sibling `.tsx` would
 * never run. Anything worth asserting here is a value, not a tree.
 *
 * WHY THE SEVERITY LIST IS TESTED FOR PARITY. `addAttendanceNote` keeps its own
 * `SEVERITIES` array and used to keep its own length limit as a literal. Two
 * copies of one rule is how a control offers a kind of note the server quietly
 * refuses, or accepts 500 characters while the field stops the teacher at 480.
 * These assertions exist to fail the moment the two lists stop agreeing.
 */

describe('note severity options', () => {
  it('offers exactly the four kinds the server accepts', () => {
    expect(NOTE_SEVERITIES.map((option) => option.value)).toEqual([
      'note',
      'praise',
      'concern',
      'intervention',
    ]);
  });

  it('has no duplicate values, because a duplicated option cannot be selected', () => {
    const values = NOTE_SEVERITIES.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('gives every option a label a teacher can read', () => {
    for (const option of NOTE_SEVERITIES) {
      expect(option.label.length).toBeGreaterThan(0);
      // The house rule forbids dashes in visible copy.
      expect(option.label).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('does not render an empty label for a value it does not know', () => {
    // A value arriving from the database rather than the list must not silently
    // become a blank option.
    expect(describeNoteSeverity('not-a-severity')).toBe('');
  });

  it('round-trips every option through the label lookup', () => {
    for (const option of NOTE_SEVERITIES) {
      expect(describeNoteSeverity(option.value)).toBe(option.label);
    }
  });
});

describe('note problem', () => {
  it('accepts an ordinary note', () => {
    expect(noteProblem('Called home about the lab report.')).toBe('');
  });

  it('refuses an empty note rather than saving a blank row', () => {
    expect(noteProblem('')).not.toBe('');
  });

  it('refuses a note that is only whitespace', () => {
    expect(noteProblem('   \n\t ')).not.toBe('');
  });

  it('accepts a note at exactly the limit', () => {
    expect(noteProblem('x'.repeat(NOTE_MAX_LENGTH))).toBe('');
  });

  it('refuses a note one character over the limit', () => {
    expect(noteProblem('x'.repeat(NOTE_MAX_LENGTH + 1))).not.toBe('');
  });

  it('uses one shared limit, so the field and the server cannot disagree', () => {
    // 500 is the number the server action used to hold as a literal. If this
    // changes, the server changes with it because both read this constant.
    expect(NOTE_MAX_LENGTH).toBe(500);
  });
});