import { describe, expect, it } from 'vitest';

import { buildImportPlan, initialsFor } from './import';

describe('initialsFor', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(initialsFor('Ana Ng')).toBe('AN');
    expect(initialsFor('Maria Josefina Dela Cruz')).toBe('MJ');
  });

  it('gives a single-word name one letter, as the roster form always has', () => {
    expect(initialsFor('Cher')).toBe('C');
  });

  it('ignores repeated spaces', () => {
    expect(initialsFor('  Ana   Ng ')).toBe('AN');
  });
});

describe('buildImportPlan', () => {
  it('returns nothing for empty text', () => {
    expect(buildImportPlan('')).toEqual({
      drafts: [],
      problems: [],
      hasHeader: false,
      skipped: 0,
    });
  });

  it('reads a header with a name column', () => {
    const plan = buildImportPlan('Name,Guardian\nAna Ng,Mrs Ng');

    expect(plan.hasHeader).toBe(true);
    expect(plan.drafts).toEqual([
      { row: 2, fullName: 'Ana Ng', guardianName: 'Mrs Ng', guardianEmail: null, guardianPhone: null },
    ]);
  });

  it('matches headers regardless of case, spacing or underscores', () => {
    const plan = buildImportPlan('STUDENT NAME,Parent_Email\nAna Ng,ana@example.com');

    expect(plan.drafts[0].fullName).toBe('Ana Ng');
    expect(plan.drafts[0].guardianEmail).toBe('ana@example.com');
  });

  it('reads all four mapped columns in any order', () => {
    const plan = buildImportPlan(
      'Phone,Email,Parent,Name\n0917 000 0000,ANA@example.com,Mrs Ng,Ana Ng',
    );

    expect(plan.drafts[0]).toEqual({
      row: 2,
      fullName: 'Ana Ng',
      guardianName: 'Mrs Ng',
      guardianEmail: 'ana@example.com',
      guardianPhone: '0917 000 0000',
    });
  });

  it('falls back to the first column when there is no header', () => {
    const plan = buildImportPlan('Ana Ng\nBo Tan\nCai Lim');

    expect(plan.hasHeader).toBe(false);
    expect(plan.drafts.map((draft) => draft.fullName)).toEqual(['Ana Ng', 'Bo Tan', 'Cai Lim']);
    expect(plan.drafts[0].row).toBe(1);
  });

  it('refuses a row with no name', () => {
    const plan = buildImportPlan('Name\nAna Ng\n,someone@example.com\n');

    expect(plan.drafts).toHaveLength(1);
    expect(plan.problems).toEqual([{ row: 3, message: 'No name in this row.' }]);
  });

  it('skips a blank line rather than refusing it', () => {
    const plan = buildImportPlan('Name\nAna Ng\n\nBo Tan\n');

    expect(plan.drafts).toHaveLength(2);
    expect(plan.skipped).toBe(1);
    expect(plan.problems).toEqual([]);
  });

  it('refuses a guardian email that is not an address', () => {
    const plan = buildImportPlan('Name,Guardian Email\nAna Ng,not-an-email');

    expect(plan.drafts).toHaveLength(0);
    expect(plan.problems[0]).toEqual({ row: 2, message: '"not-an-email" is not an email address.' });
  });

  it('refuses a name already on the roster', () => {
    const plan = buildImportPlan('Name\nAna Ng\nBo Tan', new Set(['ana ng']));

    expect(plan.drafts.map((draft) => draft.fullName)).toEqual(['Bo Tan']);
    expect(plan.problems[0]).toEqual({ row: 2, message: 'Ana Ng is already on this roster.' });
  });

  it('refuses a name longer than the column allows', () => {
    const plan = buildImportPlan(`Name\n${'a'.repeat(121)}`);

    expect(plan.problems[0].message).toContain('120 characters');
  });

  it('refuses an absurd phone number', () => {
    const plan = buildImportPlan(`Name,Phone\nAna Ng,${'9'.repeat(41)}`);

    expect(plan.problems[0].message).toContain('40 characters');
  });

  it('handles a quoted name containing a comma', () => {
    const plan = buildImportPlan('Name\n"Ng, Ana"');

    expect(plan.drafts[0].fullName).toBe('Ng, Ana');
  });

  it('points at the row a teacher can see, not the index in the array', () => {
    const plan = buildImportPlan('Name\nAna Ng\n\nBo Tan');

    // Row 4 in the file, because the blank line is still a line.
    expect(plan.drafts[1].row).toBe(4);
  });

  it('stops at the row cap rather than importing a whole school', () => {
    const body = Array.from({ length: 600 }, (_, index) => `Student ${index}`).join('\n');
    const plan = buildImportPlan(body);

    expect(plan.drafts).toHaveLength(500);
  });
});