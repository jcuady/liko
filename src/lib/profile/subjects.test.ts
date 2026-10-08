import { describe, expect, it } from 'vitest';

import { parseSubjects } from './subjects';

describe('parseSubjects', () => {
  it('splits a comma separated list', () => {
    expect(parseSubjects('Chemistry, Environmental Science')).toEqual([
      'Chemistry',
      'Environmental Science',
    ]);
  });

  it('keeps the first spelling when a subject repeats', () => {
    // The list is read back to the teacher, so it should read the way they
    // wrote it rather than normalised to whatever case came last.
    expect(parseSubjects('Physics, PHYSICS, physics')).toEqual(['Physics']);
  });

  it('drops empty entries from a trailing or doubled comma', () => {
    expect(parseSubjects('Biology,,  ,Chemistry,')).toEqual(['Biology', 'Chemistry']);
  });

  it('returns nothing for empty input', () => {
    expect(parseSubjects('')).toEqual([]);
    expect(parseSubjects('   ')).toEqual([]);
  });

  it('caps the list rather than storing an unbounded column', () => {
    const many = Array.from({ length: 40 }, (_, index) => `Subject ${index}`).join(', ');
    expect(parseSubjects(many)).toHaveLength(20);
  });

  it('preserves punctuation a teacher actually uses', () => {
    expect(parseSubjects('AP Biology, Year 10 Chemistry, Physical Science 1')).toEqual([
      'AP Biology',
      'Year 10 Chemistry',
      'Physical Science 1',
    ]);
  });
});