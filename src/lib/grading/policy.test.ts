import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_POLICIES,
  GPA_POLICY,
  GWA_POLICY,
  LETTER_POLICY,
  MILESTONE_POLICY,
  PERCENTAGE_POLICY,
  bandForPercentage,
  formatByPolicy,
  gradePointForPercentage,
  policyById,
  toPercentage,
  validatePolicy,
  weightedPointTotal,
  type GradingPolicy,
} from './policy';

/**
 * The grading engine.
 *
 * Every built-in policy is exercised against its own published thresholds,
 * because a grading scale that is off by one band is a wrong transcript rather
 * than a wrong colour.
 */

describe('built-in policies', () => {
  it('resolves every policy by id', () => {
    for (const policy of BUILT_IN_POLICIES) {
      expect(policyById(policy.id)).toBe(policy);
    }
  });

  it('returns undefined for an unknown id rather than guessing', () => {
    expect(policyById('nope')).toBeUndefined();
  });

  it('gives every built-in policy a passing shape', () => {
    for (const policy of BUILT_IN_POLICIES) {
      expect(
        validatePolicy({ label: policy.label, kind: policy.kind, bands: policy.bands }),
      ).toEqual([]);
    }
  });

  it('includes the scales the product advertises', () => {
    expect(BUILT_IN_POLICIES.map((policy) => policy.id)).toEqual([
      'percentage',
      'letter',
      'milestone',
      'gpa',
      'gwa',
    ]);
  });
});

describe('toPercentage', () => {
  it('converts a mark against its maximum', () => {
    expect(toPercentage(19, 20)).toBeCloseTo(95);
  });

  it('returns null when the maximum is unusable', () => {
    expect(toPercentage(5, 0)).toBeNull();
    expect(toPercentage(5, -1)).toBeNull();
  });
});

describe('letter policy', () => {
  it.each([
    [95, 'A'],
    [90, 'A'],
    [89, 'B'],
    [80, 'B'],
    [79, 'C'],
    [70, 'C'],
    [69, 'D'],
    [60, 'D'],
    [59, 'F'],
    [0, 'F'],
  ])('maps %i to %s', (percentage, label) => {
    expect(bandForPercentage(LETTER_POLICY, percentage)?.label).toBe(label);
  });

  it('carries grade points so it can drive a GPA', () => {
    expect(gradePointForPercentage(LETTER_POLICY, 95)).toBe(4);
    expect(gradePointForPercentage(LETTER_POLICY, 85)).toBe(3.5);
    expect(gradePointForPercentage(LETTER_POLICY, 45)).toBe(0);
  });
});

describe('milestone policy', () => {
  it('splits at 70', () => {
    expect(bandForPercentage(MILESTONE_POLICY, 70)?.label).toBe('Met');
    expect(bandForPercentage(MILESTONE_POLICY, 69)?.label).toBe('Working towards');
  });

  it('awards no grade point, because it is not a point scale', () => {
    expect(gradePointForPercentage(MILESTONE_POLICY, 95)).toBeNull();
  });
});

describe('GPA policy', () => {
  it.each([
    [95, 4],
    [90, 4],
    [89, 3.5],
    [85, 3.5],
    [84, 3],
    [80, 3],
    [79, 2.5],
    [75, 2.5],
    [74, 2],
    [70, 2],
    [69, 1],
    [60, 1],
    [59, 0],
  ])('maps %i to %s points', (percentage, points) => {
    expect(gradePointForPercentage(GPA_POLICY, percentage)).toBe(points);
  });
});

describe('GWA policy', () => {
  it.each([
    [100, 5],
    [98, 5],
    [97, 4.75],
    [95, 4.75],
    [94, 4.5],
    [89, 4.25],
    [86, 4],
    [51, 1],
    [50, null],
    [0, null],
  ])('maps %i to %s', (percentage, points) => {
    expect(gradePointForPercentage(GWA_POLICY, percentage)).toBe(points);
  });

  it('steps by a quarter point between 98 and 51', () => {
    const points = BUILT_IN_POLICIES.length;
    expect(points).toBeGreaterThan(0);

    const graded = [98, 95, 92, 89, 86, 83, 80, 77, 75, 72, 69, 66, 63, 60, 57, 54, 51]
      .map((pct) => gradePointForPercentage(GWA_POLICY, pct))
      .filter((value): value is number => value !== null);

    expect(graded).toHaveLength(17);
    for (let i = 1; i < graded.length; i += 1) {
      expect(graded[i - 1] - graded[i]).toBeCloseTo(0.25);
    }
  });

  it('awards no point below 51 rather than a zero', () => {
    // A failing mark is recorded as a remark in this system. Reporting 0.00
    // would put a number on a transcript that the scale does not define.
    expect(bandForPercentage(GWA_POLICY, 40)?.label).toBe('No point');
    expect(gradePointForPercentage(GWA_POLICY, 40)).toBeNull();
  });
});

describe('formatByPolicy', () => {
  it('renders the raw mark for an unbanded policy', () => {
    expect(formatByPolicy(17, 20, PERCENTAGE_POLICY)).toBe('17');
  });

  it('renders the band label otherwise', () => {
    expect(formatByPolicy(17, 20, LETTER_POLICY)).toBe('B');
    // 17 of 20 is 85 per cent, which is the 3.75 band on GWA. 4.00 starts at 86.
    expect(formatByPolicy(17, 20, GWA_POLICY)).toBe('3.75');
    expect(formatByPolicy(19, 20, GWA_POLICY)).toBe('4.75');
  });

  it('renders nothing for an unmarked cell', () => {
    expect(formatByPolicy(null, 20, LETTER_POLICY)).toBe('');
    expect(formatByPolicy(null, 20, PERCENTAGE_POLICY)).toBe('');
  });

  it('falls back to the raw mark when the maximum is unusable', () => {
    expect(formatByPolicy(7, 0, LETTER_POLICY)).toBe('7');
  });
});

describe('weightedPointTotal', () => {
  it('weights each assessment by its weight', () => {
    const total = weightedPointTotal(
      [
        { score: 18, maxScore: 20, weight: 1 }, // 90 -> 4.0
        { score: 15, maxScore: 20, weight: 3 }, // 75 -> 2.5
      ],
      GPA_POLICY,
    );
    // (4.0 * 1 + 2.5 * 3) / 4
    expect(total).toBeCloseTo(2.875);
  });

  it('ignores an assessment with no usable maximum', () => {
    const total = weightedPointTotal(
      [
        { score: 18, maxScore: 20, weight: 1 },
        { score: 5, maxScore: 0, weight: 5 },
      ],
      GPA_POLICY,
    );
    expect(total).toBeCloseTo(4);
  });

  it('returns null when nothing has been marked', () => {
    expect(weightedPointTotal([], GPA_POLICY)).toBeNull();
  });

  it('returns null when every mark falls outside the point range', () => {
    const total = weightedPointTotal([{ score: 1, maxScore: 20, weight: 1 }], GWA_POLICY);
    expect(total).toBeNull();
  });

  it('refuses to invent a point total for a non-point scale', () => {
    expect(weightedPointTotal([{ score: 18, maxScore: 20, weight: 1 }], MILESTONE_POLICY)).toBeNull();
    expect(weightedPointTotal([{ score: 18, maxScore: 20, weight: 1 }], PERCENTAGE_POLICY)).toBeNull();
  });
});

describe('validatePolicy', () => {
  const band = (minPercentage: number, label: string) => ({
    minPercentage,
    label,
    gradePoint: null,
  });

  it('accepts a well-formed custom scale', () => {
    expect(
      validatePolicy({
        label: 'Four point',
        bands: [band(75, 'Distinction'), band(50, 'Pass'), band(0, 'Refer')],
      }),
    ).toEqual([]);
  });

  it('rejects bands that are not in descending order', () => {
    const problems = validatePolicy({
      label: 'Backwards',
      bands: [band(40, 'Low'), band(80, 'High'), band(0, 'Floor')],
    });
    expect(problems.join(' ')).toMatch(/must start below/i);
  });

  it('rejects a scale with no floor at zero', () => {
    const problems = validatePolicy({
      label: 'Gap at the bottom',
      bands: [band(90, 'A'), band(70, 'B')],
    });
    expect(problems.join(' ')).toMatch(/must start at 0/i);
  });

  it('rejects an empty band list', () => {
    expect(validatePolicy({ label: 'Empty', bands: [] }).join(' ')).toMatch(/at least one band/i);
  });

  it('rejects a nameless scale and an unlabelled band', () => {
    const problems = validatePolicy({
      label: '   ',
      bands: [band(0, '  ')],
    });
    expect(problems.join(' ')).toMatch(/Give the scale a name/i);
    expect(problems.join(' ')).toMatch(/no label/i);
  });

  it('rejects a threshold outside 0 to 100', () => {
    const problems = validatePolicy({
      label: 'Out of range',
      bands: [band(120, 'Impossible'), band(0, 'Floor')],
    });
    expect(problems.join(' ')).toMatch(/outside 0 to 100/i);
  });
});

describe('custom policies behave like built-in ones', () => {
  it('formats and totals a user-defined scale', () => {
    const custom: GradingPolicy = {
      id: 'four-point',
      label: 'Four point',
      kind: 'points',
      hint: 'Distinction, pass, refer.',
      bands: [
        { minPercentage: 75, label: 'Distinction', gradePoint: 4 },
        { minPercentage: 50, label: 'Pass', gradePoint: 2 },
        { minPercentage: 0, label: 'Refer', gradePoint: 0 },
      ],
    };

    expect(formatByPolicy(19, 20, custom)).toBe('Distinction');
    expect(gradePointForPercentage(custom, 60)).toBe(2);
    expect(
      weightedPointTotal(
        [
          { score: 19, maxScore: 20, weight: 1 },
          { score: 11, maxScore: 20, weight: 1 },
        ],
        custom,
      ),
    ).toBeCloseTo(3);
  });
});