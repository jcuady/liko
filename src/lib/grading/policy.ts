/**
 * Grading policies.
 *
 * WHY A POLICY OBJECT RATHER THAN A SWITCH. The original `scales.ts` hardcoded
 * four scales and computed each one inline. That works until a school grades on
 * a system nobody anticipated: a Philippine college computing General Weighted
 * Average on a 5.00 point, a university on a 4.0 GPA with a half-step, a British
 * department that calls 70 "Met" and 85 "Strong Met". All of those are the same
 * shape, a descending set of bands each carrying a label and optionally a grade
 * point, so they are data here rather than branches.
 *
 * The percentage remains the single stored truth. A policy is a view over it, so
 * the same mark can be shown as a 61, a D, and a 1.00 without any of those being
 * a second source of truth that can disagree with the others.
 */

/** One band of a grading policy. Bands are evaluated highest threshold first. */
export interface GradeBand {
  /** Inclusive lower bound, 0 to 100. */
  minPercentage: number;
  /** What a teacher or a transcript calls this band. `A`, `Met`, `5.00`. */
  label: string;
  /** Grade point for GPA and GWA totals. Null when the policy is not point-based. */
  gradePoint: number | null;
}

/**
 * `raw` is the percentage: it renders the mark itself and has no bands.
 * `custom` is a user-authored banded scale, which behaves like `points` or
 * `letter` depending on whether its bands carry grade points.
 */
export type PolicyKind = 'points' | 'letter' | 'milestone' | 'custom' | 'raw';

export interface GradingPolicy {
  id: string;
  label: string;
  kind: PolicyKind;
  /** Bands, highest `minPercentage` first. Empty for `raw`. */
  bands: readonly GradeBand[];
  /** Short explanation shown wherever the scale is chosen. */
  hint: string;
}

/** Raw marks. No banding: the number is the answer. */
export const PERCENTAGE_POLICY: GradingPolicy = {
  id: 'percentage',
  label: 'Percentage',
  kind: 'raw',
  bands: [],
  hint: 'Raw mark out of the assessment maximum.',
};

/** North American letters. Carries grade points so it also drives a GPA. */
export const LETTER_POLICY: GradingPolicy = {
  id: 'letter',
  label: 'Letter',
  kind: 'letter',
  hint: 'A 90 and above, B 80, C 70, D 60, F below.',
  bands: [
    { minPercentage: 90, label: 'A', gradePoint: 4 },
    { minPercentage: 80, label: 'B', gradePoint: 3.5 },
    { minPercentage: 70, label: 'C', gradePoint: 3 },
    { minPercentage: 60, label: 'D', gradePoint: 2 },
    { minPercentage: 0, label: 'F', gradePoint: 0 },
  ],
};

/** UK primary and milestone reporting. */
export const MILESTONE_POLICY: GradingPolicy = {
  id: 'milestone',
  label: 'Milestone',
  kind: 'milestone',
  hint: 'Met at 70 and above, Working towards below.',
  bands: [
    { minPercentage: 70, label: 'Met', gradePoint: null },
    { minPercentage: 0, label: 'Working towards', gradePoint: null },
  ],
};

/** 4.0 GPA, half steps above 3.5, the common US undergraduate conversion. */
export const GPA_POLICY: GradingPolicy = {
  id: 'gpa',
  label: 'GPA',
  kind: 'points',
  hint: '4.0 at 90 and above, down to 1.0 at 60.',
  bands: [
    { minPercentage: 90, label: '4.0', gradePoint: 4 },
    { minPercentage: 85, label: '3.5', gradePoint: 3.5 },
    { minPercentage: 80, label: '3.0', gradePoint: 3 },
    { minPercentage: 75, label: '2.5', gradePoint: 2.5 },
    { minPercentage: 70, label: '2.0', gradePoint: 2 },
    { minPercentage: 60, label: '1.0', gradePoint: 1 },
    { minPercentage: 0, label: '0.0', gradePoint: 0 },
  ],
};

/**
 * General Weighted Average, the 5.00 point scale used by Philippine colleges.
 *
 * The bands step by 0.25 and the anchors follow the usual conversion: 98 to 100
 * is 5.00, and anything below 51 carries no point at all rather than a zero,
 * because a failing mark is normally recorded as a remark, not as 0.00.
 */
export const GWA_POLICY: GradingPolicy = {
  id: 'gwa',
  label: 'GWA',
  kind: 'points',
  hint: 'General Weighted Average on a 5.00 point scale.',
  bands: [
    { minPercentage: 98, label: '5.00', gradePoint: 5 },
    { minPercentage: 95, label: '4.75', gradePoint: 4.75 },
    { minPercentage: 92, label: '4.50', gradePoint: 4.5 },
    { minPercentage: 89, label: '4.25', gradePoint: 4.25 },
    { minPercentage: 86, label: '4.00', gradePoint: 4 },
    { minPercentage: 83, label: '3.75', gradePoint: 3.75 },
    { minPercentage: 80, label: '3.50', gradePoint: 3.5 },
    { minPercentage: 77, label: '3.25', gradePoint: 3.25 },
    { minPercentage: 75, label: '3.00', gradePoint: 3 },
    { minPercentage: 72, label: '2.75', gradePoint: 2.75 },
    { minPercentage: 69, label: '2.50', gradePoint: 2.5 },
    { minPercentage: 66, label: '2.25', gradePoint: 2.25 },
    { minPercentage: 63, label: '2.00', gradePoint: 2 },
    { minPercentage: 60, label: '1.75', gradePoint: 1.75 },
    { minPercentage: 57, label: '1.50', gradePoint: 1.5 },
    { minPercentage: 54, label: '1.25', gradePoint: 1.25 },
    { minPercentage: 51, label: '1.00', gradePoint: 1 },
    { minPercentage: 0, label: 'No point', gradePoint: null },
  ],
};

export const BUILT_IN_POLICIES: readonly GradingPolicy[] = [
  PERCENTAGE_POLICY,
  LETTER_POLICY,
  MILESTONE_POLICY,
  GPA_POLICY,
  GWA_POLICY,
];

export function policyById(id: string): GradingPolicy | undefined {
  return BUILT_IN_POLICIES.find((policy) => policy.id === id);
}

/** Mark as a percentage, or null when the assessment has no usable maximum. */
export function toPercentage(score: number, maxScore: number): number | null {
  if (maxScore <= 0) return null;
  return (score / maxScore) * 100;
}

/** The band a percentage falls into, or null for an unbanded policy. */
export function bandForPercentage(
  policy: GradingPolicy,
  percentage: number,
): GradeBand | null {
  return policy.bands.find((band) => percentage >= band.minPercentage) ?? null;
}

/** The grade point a percentage earns, or null when the policy awards none. */
export function gradePointForPercentage(
  policy: GradingPolicy,
  percentage: number,
): number | null {
  return bandForPercentage(policy, percentage)?.gradePoint ?? null;
}

/** Renders a mark the way the policy names it. Empty string for an unmarked cell. */
export function formatByPolicy(
  score: number | null,
  maxScore: number,
  policy: GradingPolicy,
): string {
  if (score === null) return '';

  if (policy.kind === 'raw') return String(score);

  const percentage = toPercentage(score, maxScore);
  if (percentage === null) return String(score);

  return bandForPercentage(policy, percentage)?.label ?? '';
}

/**
 * Weighted point total across assessments, on whichever point scale the policy
 * uses. Returns null when nothing has been marked or nothing carries a point, so
 * the caller can say so rather than printing a zero that reads as a failure.
 */
export function weightedPointTotal(
  entries: readonly { score: number; maxScore: number; weight: number }[],
  policy: GradingPolicy,
): number | null {
  if (policy.kind !== 'points' && policy.kind !== 'letter') return null;

  let accumulated = 0;
  let totalWeight = 0;

  for (const entry of entries) {
    if (entry.maxScore <= 0 || entry.weight <= 0) continue;
    const percentage = (entry.score / entry.maxScore) * 100;
    const point = gradePointForPercentage(policy, percentage);
    if (point === null) continue;
    accumulated += point * entry.weight;
    totalWeight += entry.weight;
  }

  if (totalWeight <= 0) return null;
  return accumulated / totalWeight;
}

/**
 * Validation for a policy a user is defining, so a custom scale is rejected at
 * the point of entry rather than silently grading everyone wrong.
 *
 * Returns human-readable problems, empty when the policy is usable.
 */
export function validatePolicy(input: {
  id?: string;
  name: string;
  kind?: PolicyKind;
  bands: readonly GradeBand[];
}): string[] {
  const problems: string[] = [];

  if (input.name.trim().length === 0) {
    problems.push('Give the scale a name.');
  }

  // A raw policy renders the mark itself and deliberately has no bands, so the
  // "needs at least one band" rule applies to the banded kinds only.
  if (input.bands.length === 0) {
    if (input.kind !== 'raw') {
      problems.push('A scale needs at least one band.');
    }
    return problems;
  }

  input.bands.forEach((band, index) => {
    if (band.minPercentage < 0 || band.minPercentage > 100) {
      problems.push(`Band ${index + 1} starts at ${band.minPercentage}, which is outside 0 to 100.`);
    }
    if (band.label.trim().length === 0) {
      problems.push(`Band ${index + 1} has no label.`);
    }
  });

  for (let i = 1; i < input.bands.length; i += 1) {
    if (input.bands[i].minPercentage >= input.bands[i - 1].minPercentage) {
      problems.push(
        `Band ${i + 1} (${input.bands[i].label}) must start below band ${i} (${input.bands[i - 1].label}).`,
      );
    }
  }

  if (input.bands[input.bands.length - 1].minPercentage > 0) {
    problems.push('The lowest band must start at 0, or some marks will have no band at all.');
  }

  return problems;
}