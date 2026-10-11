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
 */

const CACHE = join(tmpdir(), 'liko-ai-live-response.json');

function loadLive(): { raw: string; elapsedMs: number } | null {
  if (!existsSync(CACHE)) return null;
  return JSON.parse(readFileSync(CACHE, 'utf8')) as { raw: string; elapsedMs: number };
}

const live = loadLive();

describe.skipIf(!live)('a live model response', () => {
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
  it.skipIf(live !== null)(
    'is absent, so the live checks did not run. Produce one with: pnpm probe:ai',
    () => {
      expect(existsSync(CACHE)).toBe(false);
    },
  );
});