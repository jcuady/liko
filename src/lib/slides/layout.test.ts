import { describe, expect, it } from 'vitest';

import { DEFAULT_TEXT_STYLE, type SlideElement } from '@/lib/api/types';

import {
  SLIDE_GRID_COLUMNS,
  SLIDE_GRID_ROWS,
  SLIDE_MAX_TALL,
  legacyElements,
  nextElementRow,
  slideElements,
  slideFontSizeCqw,
  slideGroundClass,
  slideInkClass,
  slideInkOptions,
  slidePlacement,
} from './layout';

/**
 * The mapping from a stored slide to what the renderer draws.
 *
 * These are the four cases that have no visual smoke test to catch them. A slide
 * written before elements existed and a slide whose teacher deleted everything
 * both arrive as "no elements" to a careless reader, and the difference between
 * them is a title the teacher removed coming back from the dead. The clamp is
 * here because an element at column 5 spanning 4 is a legal element with an
 * illegal placement, and the malformed case is here because `elements` is jsonb:
 * anything can be in it, including half of an object.
 */

const heading: SlideElement = {
  id: 'h1',
  kind: 'heading',
  content: 'Collision theory',
  col: 1,
  span: 6,
  row: 2,
  tall: 2,
  style: { ...DEFAULT_TEXT_STYLE },
};

const bullets: SlideElement = {
  id: 'b1',
  kind: 'bullets',
  content: 'Particles must collide\nEnough energy to break bonds',
  col: 1,
  span: 6,
  row: 4,
  tall: 4,
  style: { ...DEFAULT_TEXT_STYLE },
};

describe('what a slide draws', () => {
  it('falls back to the layout when there are no elements at all', () => {
    const drawn = slideElements({
      elements: null,
      layout: 'bullets',
      title: 'What the collision theory says',
      body: 'Reactions need particles to collide\nEnough energy to break bonds',
    });

    expect(drawn).toHaveLength(2);
    expect(drawn[0]).toMatchObject({ kind: 'heading', content: 'What the collision theory says' });
    expect(drawn[1]).toMatchObject({ kind: 'bullets', content: 'Reactions need particles to collide\nEnough energy to break bonds' });
  });

  it('treats an empty array as a slide the teacher emptied on purpose', () => {
    // The title is still on the row and is still in `title`. Drawing it anyway
    // would resurrect content a teacher deleted on purpose.
    const drawn = slideElements({ elements: [], layout: 'bullets', title: 'Deleted', body: 'Gone' });
    expect(drawn).toEqual([]);
  });

  it('draws the four layouts the old renderer had', () => {
    expect(legacyElements({ layout: 'title', title: 'Reaction rates', body: 'ignored' })).toHaveLength(1);
    // A title slide never showed its points, and hiding them is not a change.
    expect(legacyElements({ layout: 'title', title: 'Reaction rates', body: 'a point' })).toHaveLength(1);
    expect(legacyElements({ layout: 'blank', title: 'Anything', body: 'Anything' })).toEqual([]);
    expect(legacyElements({ layout: 'bullets', title: '', body: '' })).toEqual([]);

    const split = legacyElements({ layout: 'split', title: 'Rates', body: 'One point' });
    // Split is labelled points beside an image, so the points take one half.
    expect(split[1]).toMatchObject({ col: 1, span: 3 });
  });

  it('drops a malformed element instead of handing it to the renderer', () => {
    const drawn = slideElements({
      elements: [
        null,
        'not an element',
        { kind: 'sparkles', id: 'x' },
        heading,
        { ...bullets, style: { size: 'gigantic', weight: 'hairline' } },
      ] as unknown as SlideElement[],
      layout: 'bullets',
      title: '',
      body: '',
    });

    expect(drawn).toHaveLength(2);
    expect(drawn.map((element) => element.id)).toEqual(['h1', 'b1']);
    // The unknown style values are replaced by the closed set's defaults rather
    // than passed through as the string the column happened to hold.
    expect(drawn[1]).toMatchObject({ style: { size: 'md', weight: 'normal' } });
  });
});

describe('grid placement', () => {
  it('clamps a span that would run off the right of the grid', () => {
    // Column 5 plus a span of 4 ends at column 8, and there are only 6. An
    // unclamped element is text hanging off the edge of the projector.
    expect(slidePlacement({ col: 5, span: 4, row: 1, tall: 1 })).toEqual({
      columnStart: 5,
      columnEnd: SLIDE_GRID_COLUMNS + 1,
      rowStart: 1,
      rowEnd: 2,
    });
  });

  it('clamps the bottom of the frame as well as the right of it', () => {
    expect(slidePlacement({ col: 1, span: 2, row: 7, tall: 4 })).toEqual({
      columnStart: 1,
      columnEnd: 3,
      rowStart: 7,
      rowEnd: SLIDE_GRID_ROWS + 1,
    });

    // More bands than an element may cover is clamped rather than honoured, so
    // one element cannot fill the whole frame and push the heading off the top.
    expect(slidePlacement({ col: 1, span: 6, row: 1, tall: 9 }).rowEnd).toBe(1 + SLIDE_MAX_TALL);
  });

  it('clamps values that are not numbers at all', () => {
    const placement = slidePlacement({
      col: Number.NaN,
      span: 0,
      row: 99,
      tall: Number.POSITIVE_INFINITY,
    } as never);
    expect(placement).toEqual({ columnStart: 1, columnEnd: 2, rowStart: SLIDE_GRID_ROWS, rowEnd: SLIDE_GRID_ROWS + 1 });
  });

  it('gives the next free band to a newly added element', () => {
    expect(nextElementRow([])).toBe(1);
    expect(nextElementRow([heading])).toBe(4);
    expect(nextElementRow([heading, bullets])).toBe(SLIDE_GRID_ROWS);
  });
});

describe('type scale', () => {
  it('keeps a heading at least one step above body text', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      expect(slideFontSizeCqw('heading', size)).toBeGreaterThan(slideFontSizeCqw('text', size));
      expect(slideFontSizeCqw('heading', size)).toBeGreaterThan(slideFontSizeCqw('bullets', size));
    }
  });

  it('never lets the smallest heading fall below the middle of the body scale', () => {
    // A teacher who sets a heading to `sm` has made a mistake, and the slide
    // still has to read from the back of a room.
    expect(slideFontSizeCqw('heading', 'sm')).toBeGreaterThan(slideFontSizeCqw('text', 'md'));
    expect(slideFontSizeCqw('heading', 'md')).toBeGreaterThan(slideFontSizeCqw('text', 'lg'));
  });
});

describe('themes', () => {
  it('gives the four grounds four different surfaces', () => {
    const grounds = (['viridian', 'ink', 'paper', 'dusk'] as const).map((theme) =>
      slideGroundClass(theme),
    );
    expect(new Set(grounds).size).toBe(4);
  });

  it('never offers an ink that cannot be read on its ground', () => {
    for (const theme of ['viridian', 'ink', 'paper', 'dusk'] as const) {
      const options = slideInkOptions(theme);
      expect(options.length).toBeGreaterThan(0);
      for (const ink of options) {
        expect(slideInkClass(theme, ink)).toMatch(/^text-/);
      }
    }

    // Accent on the accent ground is invisible and accent on near black scores
    // 3.5:1, so neither ground offers it even though the set is closed.
    expect(slideInkOptions('dusk')).not.toContain('accent');
    expect(slideInkOptions('ink')).not.toContain('accent');
    expect(slideInkOptions('viridian')).toContain('accent');
  });

  it('keeps the accent ground on the label colour rather than on white', () => {
    expect(slideInkClass('dusk', 'ink')).toBe('text-on-accent');
  });
});