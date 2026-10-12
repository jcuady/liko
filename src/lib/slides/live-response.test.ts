import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SLIDE_ELEMENTS, SLIDE_THEMES } from '@/lib/api/types';
import { buildDeckFromOutline } from './generate';

/**
 * The live model response, run through the REAL validator.
 *
 * WHY THIS IS A TEST AND NOT PART OF THE PROBE. `buildDeckFromOutline` imports
 * through the `@/` alias, which Node's type stripper cannot resolve. Re-implementing
 * the rules in the probe would have meant a second copy of every check, and a
 * second copy is a second thing to be wrong. This way the live answer is checked
 * by the same function the product calls.
 *
 * WHY IT SKIPS WHEN THE FILE IS ABSENT. `pnpm test` must not reach the network,
 * so with no cached response there is nothing to check and the suite says so
 * rather than passing quietly over a file it never read. Run
 * `pnpm probe:ai` to produce the response and then this file validates it for
 * real.
 *
 * WHY IT ALSO CHECKS WHICH MODEL AND WHEN. A cached answer used to be an
 * anonymous blob, so a response captured sixteen hours earlier produced exactly
 * the same "9 passed" as one captured a minute ago. The model and the capture
 * time are now part of the evidence, and a response from a model the product no
 * longer calls is skipped with a reason instead of standing in for a
 * verification nobody just performed.
 */

const CACHE = join(tmpdir(), 'liko-ai-live-response.json');

/** The model `src/lib/ai/gemini.ts` calls. Mirrored, not imported, for the same reason the probe mirrors it. */
const PRODUCT_MODEL = 'gemini-3.5-flash';

/** Beyond this, the answer is a historical record rather than a current result. */
const STALE_AFTER_HOURS = 24;

interface LiveCache {
  raw: string;
  model?: string;
  capturedAt?: string;
  elapsedMs: number;
}

function loadLive(): LiveCache | null {
  if (!existsSync(CACHE)) return null;
  return JSON.parse(readFileSync(CACHE, 'utf8')) as LiveCache;
}

const live = loadLive();

const ageHours = live?.capturedAt
  ? (Date.now() - Date.parse(live.capturedAt)) / 3_600_000
  : null;

/** Why the live checks are not running, or an empty string when they are. */
const skipReason = !live
  ? 'no cached response. Produce one with: pnpm probe:ai'
  : !live.model || !live.capturedAt
    ? // A response with no recorded model and no capture time is an anonymous
      // blob. Its age is not zero, it is unknown, and unknown is not fresh.
      // Treating a missing field as "fine" is what let a 16 hour old response
      // keep reporting nine passing live checks.
      'the cached response records neither a model nor a capture time, so it cannot be shown to be current. Re-run pnpm probe:ai'
    : live.model !== PRODUCT_MODEL
      ? `the cached response came from ${live.model}, and the product calls ${PRODUCT_MODEL}`
      : ageHours !== null && ageHours > STALE_AFTER_HOURS
        ? `the cached response is ${Math.round(ageHours)} hours old, past the ${STALE_AFTER_HOURS} hour freshness window`
        : '';

describe.skipIf(Boolean(skipReason))('a live model response', () => {
  const deck = live ? buildDeckFromOutline(live.raw, 'Bonding') : null;

  it('becomes a deck', () => {
    expect(deck).not.toBeNull();
    expect(deck!.slides.length).toBeGreaterThan(0);
  });

  it('has a title', () => {
    expect(deck!.title.length).toBeGreaterThan(0);
  });

  it('has enough slides to be a deck rather than a fragment', () => {
    expect(deck!.slides.length).toBeGreaterThanOrEqual(3);
  });

  it('has no slide that came back blank', () => {
    const withText = deck!.slides.filter((slide) =>
      slide.elements.some(
        (el) => el.kind !== 'image' && 'content' in el && el.content.trim().length > 0,
      ),
    );
    expect(withText).toHaveLength(deck!.slides.length);
  });

  /*
   * The closed-set guarantee, asserted against a LIVE answer rather than a
   * hand-written one. This is the property that matters: whatever the model
   * chose, nothing outside the renderer's vocabulary got through.
   */
  it('produced only element kinds the renderer knows', () => {
    for (const slide of deck!.slides) {
      for (const element of slide.elements) {
        expect(SLIDE_ELEMENTS).toContain(element.kind);
      }
    }
  });

  it('produced only themes the renderer knows', () => {
    for (const slide of deck!.slides) {
      expect(SLIDE_THEMES).toContain(slide.theme);
    }
  });

  it('put nothing off the grid', () => {
    for (const slide of deck!.slides) {
      for (const element of slide.elements) {
        expect(element.col + element.span).toBeLessThanOrEqual(7);
        expect(element.row + element.tall).toBeLessThanOrEqual(9);
      }
    }
  });

  it('gave every element a unique id', () => {
    const ids = deck!.slides.flatMap((s) => s.elements.map((el) => el.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opened at least one slide with a heading', () => {
    const headings = deck!.slides.flatMap((s) => s.elements).filter((el) => el.kind === 'heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});

describe('the live response cache', () => {
  it.skipIf(live !== null)('is absent, so the live checks did not run. Produce one with: pnpm probe:ai', () => {
    expect(existsSync(CACHE)).toBe(false);
  });

  /*
   * The cache exists but the live checks did not run anyway. `pnpm test` prints a
   * count and a count cannot say why, so this states it in words, and fails if
   * the reason disappears: a green line claiming nine passing checks with none
   * of them run is the exact failure this file exists to prevent.
   */
  it.skipIf(!live || !skipReason)('says why the live checks did not run', () => {
    expect(skipReason).not.toBe('');
    // The reason has to be actionable, not a shrug.
    expect(skipReason).toMatch(/probe:ai|product calls|hours old/i);
  });
});