import { describe, expect, it } from 'vitest';

import {
  SLIDE_SIZES,
  SLIDE_THEMES,
  SLIDE_WEIGHTS,
  SLIDE_FONTS,
  SLIDE_INKS,
  SLIDE_ALIGNMENTS,
  SLIDE_ELEMENTS,
  type SlideElement,
  type SlideTextElement,
} from '@/lib/api/types';
import { OutlineError, OUTLINE_INSTRUCTION, buildDeckFromOutline } from './generate';

/**
 * A type guard, not a boolean test.
 *
 * `filter((el) => el.kind === 'bullets')` compiles and hands back
 * `SlideElement[]`, so `bullets[0].content` is an error on the image variant of
 * the union. The predicate has to be a guard for the narrowing to happen at all.
 */
function isBullet(el: SlideElement): el is SlideTextElement {
  return el.kind === 'bullets';
}

/*
 * The probe's copy of the instruction has to be the same instruction.
 *
 * `scripts/ai-prompt-hint.mjs` exists only so a plain Node script can send the
 * prompt without resolving the `@/` alias, and a copy of the prompt is a copy
 * that can drift. If this ever fails, the live probe is no longer proving what
 * the product sends, and a green probe would mean nothing.
 */
describe('the live probe shares this prompt', () => {
  it('sends exactly the instruction the product sends', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(new URL('../../../scripts/ai-prompt-hint.mjs', import.meta.url), 'utf8');
    const match = /export const OUTLINE_INSTRUCTION = `([\s\S]*?)`;/.exec(raw);

    expect(match, 'the probe hint module exists and exports the instruction').not.toBeNull();
    expect(match![1]).toBe(OUTLINE_INSTRUCTION);
  });
});

/**
 * A model response is untrusted input.
 *
 * Every test here feeds the builder something it could plausibly return on a bad
 * day, and asserts that the result is either correct or refused. The property
 * under test is not "does it parse", it is that nothing unrecognised can reach
 * the renderer, because a hallucinated font or colour is a slide that looks
 * broken to a teacher who did not ask for it.
 */

const GOOD = JSON.stringify({
  title: 'Bonding',
  slides: [
    { title: 'What is a covalent bond', bullets: ['Shared pairs', 'Valence electrons'] },
    { title: 'Single and double', body: 'A double bond shares two pairs.' },
  ],
});

describe('building a deck from a model response', () => {
  it('builds slides from a clean outline', () => {
    const deck = buildDeckFromOutline(GOOD, 'fallback');

    expect(deck.title).toBe('Bonding');
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.elements[0]!.kind).toBe('heading');
    expect(deck.slides[1]!.elements.some((el) => el.kind === 'text')).toBe(true);
  });

  it('strips a code fence, which is the most common decoration', () => {
    const fenced = '```json\n' + GOOD + '\n```';
    expect(buildDeckFromOutline(fenced, 'x').slides).toHaveLength(2);
  });

  it('finds the object when the model adds prose either side', () => {
    const chatty = `Sure! Here is the deck you asked for:\n${GOOD}\nLet me know if you want changes.`;
    expect(buildDeckFromOutline(chatty, 'x').title).toBe('Bonding');
  });

  it('refuses prose rather than inventing a deck from it', () => {
    expect(() => buildDeckFromOutline('I cannot help with that request.', 'x')).toThrow(OutlineError);
  });

  it('refuses an outline with no slides instead of returning an empty deck', () => {
    expect(() => buildDeckFromOutline('{"title":"x","slides":[]}', 'x')).toThrow(OutlineError);
  });

  /*
   * The half-failure that matters: some slides usable, some not. Silently
   * returning the survivors would show a teacher six slides when they asked for
   * eight, with nothing saying so, and they would teach from an incomplete deck.
   */
  it('drops a slide with no usable content rather than shipping a blank frame', () => {
    const outline = JSON.stringify({
      title: 'Mixed',
      slides: [
        { title: 'Real', bullets: ['a point'] },
        { title: '', bullets: [] },
        { title: 'Also real', body: 'text' },
      ],
    });
    const deck = buildDeckFromOutline(outline, 'x');

    expect(deck.slides).toHaveLength(2);
    expect(deck.slides.every((slide) => slide.elements.length > 0)).toBe(true);
  });

  it('refuses the whole deck when every slide was unusable', () => {
    const outline = JSON.stringify({ title: 'Empty', slides: [{ title: '' }, { bullets: [] }] });
    expect(() => buildDeckFromOutline(outline, 'x')).toThrow(OutlineError);
  });

  /*
   * A model asked to choose typography will choose typography. Every value it
   * returns is checked against the same closed set the renderer uses, so a
   * hallucinated font or an invented colour cannot survive into the DOM.
   */
  it('replaces any typography the model invented with a default', () => {
    const outline = JSON.stringify({
      title: 'Invented',
      slides: [
        {
          title: 'Fonts',
          font: 'Comic Sans',
          ink: '#ff0000',
          weight: 'ultra-heavy',
          theme: 'neon',
          bullets: ['a point'],
        },
      ],
    });
    const deck = buildDeckFromOutline(outline, 'x');
    const heading = deck.slides[0]!.elements[0]!;
    if (heading.kind === 'image') throw new Error('expected a text element');

    expect(SLIDE_FONTS).toContain(heading.style.font);
    expect(SLIDE_INKS).toContain(heading.style.ink);
    expect(SLIDE_WEIGHTS).toContain(heading.style.weight);
    expect(SLIDE_SIZES).toContain(heading.style.size);
    expect(SLIDE_ALIGNMENTS).toContain(heading.style.align);
    expect(SLIDE_THEMES).toContain(deck.slides[0]!.theme);
    expect(deck.slides[0]!.theme).toBe('viridian');
  });

  it('keeps a heading large whatever the model asked for', () => {
    const outline = JSON.stringify({
      title: 'Small',
      slides: [{ title: 'A heading', bullets: ['a point'], size: 'sm' }],
    });
    const heading = buildDeckFromOutline(outline, 'x').slides[0]!.elements[0]!;
    if (heading.kind === 'image') throw new Error('expected a text element');

    expect(heading.kind).toBe('heading');
    expect(heading.style.size).toBe('xl');
  });

  it('drops bullets that are not strings and trims the ones that are', () => {
    const outline = JSON.stringify({
      title: 'Mixed bullets',
      slides: [{ title: 'Points', bullets: ['  spaced   out  ', 42, null, { a: 1 }, 'second'] }],
    });
    const bullets = buildDeckFromOutline(outline, 'x').slides[0]!.elements.filter(isBullet);

    expect(bullets).toHaveLength(2);
    expect(bullets[0]!.content).toBe('spaced out');
  });

  it('keeps a bullet list inside the grid', () => {
    const many = Array.from({ length: 8 }, (_, i) => `point ${i}`);
    const outline = JSON.stringify({ title: 'Long', slides: [{ title: 'Points', bullets: many }] });
    const bullets = buildDeckFromOutline(outline, 'x').slides[0]!.elements.filter(isBullet);

    for (const bullet of bullets) {
      expect(bullet.col + bullet.span).toBeLessThanOrEqual(7);
      expect(bullet.row + bullet.tall).toBeLessThanOrEqual(9);
    }
  });

  it('uses the fallback title when the model leaves the deck title out', () => {
    const outline = JSON.stringify({ slides: [{ title: 'One', bullets: ['a'] }] });
    expect(buildDeckFromOutline(outline, 'Photosynthesis').title).toBe('Photosynthesis');
  });

  it('produces only element kinds the renderer knows', () => {
    const deck = buildDeckFromOutline(GOOD, 'x');
    for (const slide of deck.slides) {
      for (const element of slide.elements) {
        expect(SLIDE_ELEMENTS).toContain(element.kind);
      }
    }
  });

  it('gives every element a unique id across the WHOLE deck, not one slide', () => {
    /*
     * This originally checked a single slide and passed. The live probe then
     * failed it, because every slide was minting `gen_h` and `gen_b0` and a five
     * slide deck held five elements with the same id.
     *
     * An id is the only thing that makes an element addressable, so uniqueness is
     * a property of the DECK and has to be asserted over the deck.
     */
    const outline = JSON.stringify({
      title: 'Ids',
      slides: [
        { title: 'One', bullets: ['a', 'b'] },
        { title: 'Two', body: 'a paragraph' },
        { title: 'Three', bullets: ['c'] },
      ],
    });
    const ids = buildDeckFromOutline(outline, 'x')
      .slides.flatMap((slide) => slide.elements.map((el) => el.id));

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('caps a runaway deck rather than rendering four hundred frames', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `S${i}`, bullets: ['a'] }));
    const deck = buildDeckFromOutline(JSON.stringify({ title: 'Long', slides: many }), 'x');

    expect(deck.slides.length).toBeLessThanOrEqual(20);
  });
});