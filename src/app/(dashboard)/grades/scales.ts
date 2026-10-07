/**
 * Grade calculation scales.
 *
 * WHY ONE MODULE. The same mark is shown as a number in the grid, as a letter in
 * a report, and as a GPA on a transcript. Deriving each of those separately is
 * how a student ends up with a B on a transcript and a 61 on a report card. The
 * percentage is the single stored truth and every scale is a view of it.
 *
 * The thresholds are stated once, here, so a school that grades on 50 or on 90
 * changes one constant rather than hunting through components.
 */

export const SCALES = ['percentage', 'letter', 'milestone', 'gpa'] as const;
export type Scale = (typeof SCALES)[number];

export const SCALE_LABELS: Record<Scale, string> = {
  percentage: 'Percentage',
  letter: 'Letter',
  milestone: 'Milestone',
  gpa: 'GPA',
};

export const SCALE_HINTS: Record<Scale, string> = {
  percentage: 'Raw mark out of the assessment maximum.',
  letter: 'A 90 and above, B 80, C 70, D 60, F below.',
  milestone: 'Met at 70 and above, Working towards below.',
  gpa: '4.0 at 90 and above, down to 1.0 at 60.',
};

/** Percentage to grade point. The scale is linear between the two anchors. */
function toGpa(percentage: number): number {
  if (percentage >= 90) return 4;
  if (percentage >= 60) {
    const span = percentage - 60;
    // 60 maps to 1.0 and 90 maps to 4.0, in half steps above 3.5.
    const points = 1 + (span / 30) * 3;
    return Math.round(points * 2) / 2;
  }
  return 0;
}

export function toPercentage(score: number, maxScore: number): number | null {
  if (maxScore <= 0) return null;
  return (score / maxScore) * 100;
}

export function formatByScale(
  score: number | null,
  maxScore: number,
  scale: Scale,
): string {
  if (score === null) return '';

  const percentage = toPercentage(score, maxScore);
  if (percentage === null) return String(score);

  switch (scale) {
    case 'percentage':
      return String(score);
    case 'letter': {
      if (percentage >= 90) return 'A';
      if (percentage >= 80) return 'B';
      if (percentage >= 70) return 'C';
      if (percentage >= 60) return 'D';
      return 'F';
    }
    case 'milestone':
      return percentage >= 70 ? 'Met' : 'Working towards';
    case 'gpa':
      return toGpa(percentage).toFixed(1);
  }
}

/**
 * Weighted total across assessments, using the weights the teacher set.
 * Returns null when nothing has been marked, so the caller can say so rather
 * than printing a zero that reads as a failing grade.
 */
export function weightedTotal(
  entries: { score: number; maxScore: number; weight: number }[],
): number | null {
  const marked = entries.filter((entry) => entry.maxScore > 0);
  if (marked.length === 0) return null;

  let accumulated = 0;
  let totalWeight = 0;

  for (const entry of marked) {
    const percentage = ((entry.score / entry.maxScore) * 100) * entry.weight;
    accumulated += percentage;
    totalWeight += entry.weight;
  }

  if (totalWeight <= 0) return null;
  return accumulated / totalWeight;
}
