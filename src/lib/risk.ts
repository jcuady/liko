import type { HeatCell } from '@/lib/api/types';

/**
 * The at-risk rule, in one place.
 *
 * WHY THIS MODULE EXISTS. The rule used to live in two places and nowhere else:
 * `getHeatmap()` in `src/lib/api/client.ts` carried the boundaries as bare
 * literals inside a ternary, and `src/lib/push/at-risk.ts` carried a copy of one
 * of them as `AT_RISK_MEAN_PERCENT` with a comment claiming it was "the same
 * boundary". A copy in a comment is not a link, so the two could drift without
 * anything noticing, and the drift would be invisible from the outside: the
 * heatmap would keep colouring a student `on-track` while the sweep kept
 * alerting on them, or the other way round. The comment said the rule should
 * live in one place so the heatmap and the alert cannot disagree. This is that
 * one place.
 *
 * IT IS NOT `server-only`, deliberately. The at-risk sweep is a server module
 * and the heatmap is a server module, so both could have kept their own copy.
 * The landing page renders the real heatmap component with sample data, and a
 * sample that classified students by a different rule than the product would be
 * a picture of the product that lies about it. That is the same failure the
 * marketing page had before, in a smaller costume.
 *
 * THE LEVELS. `on-track` is at or above {@link ON_TRACK_MIN_PERCENT}, `watch` is
 * at or above {@link WATCH_MIN_PERCENT}, and `at-risk` is below it. The sweep's
 * threshold is the `at-risk` boundary: a student is swept when their mean falls
 * below {@link WATCH_MIN_PERCENT}.
 */

export type RiskLevel = HeatCell['level'];

/** At or above this mean, a student is on track. */
export const ON_TRACK_MIN_PERCENT = 70;

/** At or above this mean, a student is on watch. Below it, they are at risk. */
export const WATCH_MIN_PERCENT = 55;

/**
 * The mean of a set of percentages.
 *
 * Zero for an empty set rather than `NaN`, because a student with no marks has
 * no risk level and every caller already handles "no marks" by showing an empty
 * state rather than a number.
 */
export function meanPercent(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, value) => sum + value, 0);
  return total / scores.length;
}

/** The level a mean falls into. The one place the boundaries are decided. */
export function riskLevelFromMean(mean: number): RiskLevel {
  if (mean >= ON_TRACK_MIN_PERCENT) return 'on-track';
  if (mean >= WATCH_MIN_PERCENT) return 'watch';
  return 'at-risk';
}

/**
 * The change shown on a heat cell: the mean minus the FIRST score.
 *
 * The first score has to be the earliest one, so the scores must arrive in
 * chronological order. `getHeatmap()` orders its query by `graded_at` for
 * exactly this reason: without the order the database decides which assessment
 * lands first, and the number on the cell means something different on every
 * deploy.
 */
export function riskDeltaFromScores(scores: readonly number[]): number {
  if (scores.length < 2) return 0;
  return meanPercent(scores) - scores[0];
}

/**
 * The whole of a heat cell, derived from a student's marks.
 *
 * ONE FUNCTION, TWO CALLERS. `getHeatmap()` in the data layer and the landing
 * page's sample class both call this rather than each assembling a level and a
 * delta from the two helpers above. Two callers that each pick their own
 * thresholds are two rules wearing the same name, which is how the copy in
 * `at-risk.ts` came to exist in the first place.
 */
export function riskFromScores(scores: readonly number[]): { level: RiskLevel; delta: number } {
  return {
    level: riskLevelFromMean(meanPercent(scores)),
    delta: riskDeltaFromScores(scores),
  };
}
