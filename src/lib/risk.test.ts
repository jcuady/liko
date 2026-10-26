import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ON_TRACK_MIN_PERCENT,
  WATCH_MIN_PERCENT,
  meanPercent,
  riskDeltaFromScores,
  riskFromScores,
  riskLevelFromMean,
} from './risk';
import { AT_RISK_MEAN_PERCENT } from '@/lib/push/at-risk';

/**
 * The at-risk rule, and the proof that there is only one of it.
 *
 * THE RULE is easy to test and has nothing interesting to say. What matters is
 * the second half of this file: the sweep and the heatmap used to carry their
 * own copies of the boundaries, and the copy in `at-risk.ts` came with a
 * comment saying it was the same boundary as the heatmap's. It was not the same
 * boundary. It was the same NUMBER, copied, and nothing in the repository could
 * tell the difference between "the same number" and "the same rule".
 *
 * So these are not tests of a helper. They are tests of the absence of a copy.
 */

describe('the at-risk rule', () => {
  it('puts a student on track at the on-track boundary', () => {
    expect(riskLevelFromMean(ON_TRACK_MIN_PERCENT)).toBe('on-track');
  });

  it('watches a student one point below the on-track boundary', () => {
    expect(riskLevelFromMean(ON_TRACK_MIN_PERCENT - 0.1)).toBe('watch');
  });

  it('watches a student at the watch boundary', () => {
    expect(riskLevelFromMean(WATCH_MIN_PERCENT)).toBe('watch');
  });

  it('flags a student one point below the watch boundary', () => {
    expect(riskLevelFromMean(WATCH_MIN_PERCENT - 0.1)).toBe('at-risk');
  });

  it('averages no marks to zero rather than to NaN', () => {
    expect(meanPercent([])).toBe(0);
    expect(Number.isNaN(meanPercent([]))).toBe(false);
  });

  it('reports no change for a student with fewer than two marks', () => {
    expect(riskDeltaFromScores([])).toBe(0);
    expect(riskDeltaFromScores([80])).toBe(0);
  });

  it('reports the change from the first mark to the mean', () => {
    // 60, 70, 80 has a mean of 70 and a first mark of 60, so the change is 10.
    expect(riskDeltaFromScores([60, 70, 80])).toBe(10);
  });

  it('derives a level and a delta together from the same marks', () => {
    expect(riskFromScores([60, 70, 80])).toEqual({ level: 'on-track', delta: 10 });
    expect(riskFromScores([40, 50, 60])).toEqual({ level: 'at-risk', delta: 10 });
  });
});

describe('there is only one copy of the rule', () => {
  it('sweeps exactly the students the heatmap calls at-risk', () => {
    /*
     * This is the assertion that carries the weight, and it is behavioural
     * rather than a comparison of two constants.
     *
     * The first version of this test compared `AT_RISK_MEAN_PERCENT` with
     * `WATCH_MIN_PERCENT` and was a tautology: the sweep declared its boundary
     * as the shared constant, so the two were equal by construction and no
     * change to either could ever fail it. A check that cannot fail is worse
     * than no check, because it is read as protection.
     *
     * This one asks the question the drift would actually change the answer
     * to. The sweep alerts when a student's mean falls below its boundary; the
     * heatmap calls the same student at-risk below the same boundary. If the
     * two ever disagree, one of those screens is telling a teacher a different
     * thing from the other, and this goes red.
     */
    for (const mean of [0, 40, 54.9, 55, 60, 69.9, 70, 100]) {
      const sweptByTheAlert = mean < AT_RISK_MEAN_PERCENT;
      const flaggedByTheHeatmap = riskLevelFromMean(mean) === 'at-risk';
      expect(sweptByTheAlert).toBe(flaggedByTheHeatmap);
    }
  });

  it('has the sweep importing the shared boundary rather than declaring one', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/push/at-risk.ts'), 'utf8');
    expect(src).toMatch(/WATCH_MIN_PERCENT/);
    // The copy this replaced, in the shape it was written in.
    expect(src).not.toMatch(/AT_RISK_MEAN_PERCENT\s*=\s*\d/);
  });

  it('has the heatmap calling the shared rule rather than deciding a level', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/api/client.ts'), 'utf8');
    expect(src).toMatch(/riskFromScores/);
    // The ternary this replaced, in the shape it was written in.
    expect(src).not.toMatch(/average\s*>=\s*(70|55)/);
  });
});
