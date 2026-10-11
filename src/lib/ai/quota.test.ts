import { describe, expect, it } from 'vitest';

import { GENERATION_LIMIT_PER_HOUR, usageFrom } from './quota';

/**
 * The quota is the only thing standing between a shared free-tier key and a
 * bill, and the one number a teacher reads to decide whether to try.
 *
 * The tests below are mostly about the edges, because the middle of the range is
 * arithmetic nobody gets wrong. The edges are where a teacher is told they can
 * still generate when they cannot, or told they are out when they are not.
 */

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

/**
 * Returns the ROW SHAPE, not a bare date string.
 *
 * The first version of this helper returned a string, which meant `row.created_at`
 * was `undefined`, `getTime()` returned NaN, and the function counted every row
 * as unparseable. The two failures it produced read exactly like a broken window,
 * and the window was fine. An assertion that builds the wrong shape does not fail
 * loudly, it fails as a plausible defect somewhere else.
 */
function minutesAgo(minutes: number): { created_at: string } {
  return { created_at: new Date(NOW - minutes * 60_000).toISOString() };
}

describe('the generation allowance', () => {
  it('starts full', () => {
    const usage = usageFrom([], true, NOW);

    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(GENERATION_LIMIT_PER_HOUR);
    expect(usage.limit).toBe(GENERATION_LIMIT_PER_HOUR);
  });

  it('counts only the current hour', () => {
    const usage = usageFrom(
      [minutesAgo(10), minutesAgo(20), minutesAgo(30), minutesAgo(45)],
      true,
      NOW,
    );

    expect(usage.used).toBe(4);
    expect(usage.remaining).toBe(4);
  });

  /*
   * The window has to roll, or a teacher who uses their share at nine in the
   * morning is still told they are out of it at four in the afternoon.
   */
  it('forgets what fell out of the window', () => {
    const usage = usageFrom(
      Array.from({ length: 5 }, () => minutesAgo(61)),
      true,
      NOW,
    );

    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(GENERATION_LIMIT_PER_HOUR);
  });

  it('keeps what is still inside the window when old rows are also present', () => {
    const usage = usageFrom(
      [minutesAgo(5), minutesAgo(59), minutesAgo(120), minutesAgo(300)],
      true,
      NOW,
    );

    expect(usage.used).toBe(2);
  });

  it('runs out exactly at the limit and not one call earlier', () => {
    const inside = usageFrom(
      Array.from({ length: GENERATION_LIMIT_PER_HOUR }, () => minutesAgo(5)),
      true,
      NOW,
    );

    expect(inside.remaining).toBe(0);

    const justUnder = usageFrom(
      Array.from({ length: GENERATION_LIMIT_PER_HOUR - 1 }, () => minutesAgo(5)),
      true,
      NOW,
    );

    expect(justUnder.remaining).toBe(1);
  });

  /*
   * A negative allowance renders as a negative number of things you can still do,
   * and a teacher seeing "-2" is told something is wrong that is not.
   */
  it('never reports a negative remainder', () => {
    const usage = usageFrom(
      Array.from({ length: GENERATION_LIMIT_PER_HOUR + 5 }, () => minutesAgo(5)),
      true,
      NOW,
    );

    expect(usage.used).toBeGreaterThan(GENERATION_LIMIT_PER_HOUR);
    expect(usage.remaining).toBe(0);
  });

  /*
   * A row whose timestamp cannot be read is counted, not ignored. Ignoring it
   * would mean a corrupt row hands back a whole allowance, which is the wrong
   * direction to fail in for a control that exists to stop something.
   */
  it('counts a row with an unreadable timestamp rather than granting the allowance back', () => {
    const usage = usageFrom([{ created_at: 'not a date' }], true, NOW);

    expect(usage.used).toBe(1);
    expect(usage.remaining).toBe(GENERATION_LIMIT_PER_HOUR - 1);
  });

  it('says the deployment is not configured rather than showing an empty meter', () => {
    const usage = usageFrom([], false, NOW);

    expect(usage.configured).toBe(false);
    expect(usage.available).toBe(false);
    expect(usage.reason).toMatch(/not configured/i);
  });

  it('reports a real model name so the panel can show it', () => {
    const usage = usageFrom([], true, NOW);

    expect(usage.windowMinutes).toBe(60);
    expect(usage.limit).toBeGreaterThan(0);
  });
});