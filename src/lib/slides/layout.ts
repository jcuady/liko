import {
  DEFAULT_TEXT_STYLE,
  normaliseElements,
  SLIDE_COLUMNS,
  SLIDE_ROWS,
  type SlideAlignment,
  type SlideElement,
  type SlideFont,
  type SlideImageElement,
  type SlideInk,
  type SlideLayout,
  type SlideSize,
  type SlideTextElement,
  type SlideTheme,
  type SlideRow,
  type SlideWeight,
} from '@/lib/api/types';

/**
 * How a slide's elements reach the screen.
 *
 * WHY THE GEOMETRY LIVES HERE AND NOT IN THE COMPONENT. The renderer is the only
 * thing that turns a stored column into pixels, and every caller of it is a
 * caller that can be wrong: an element written by an older release, an element
 * written by a model, and an element written by a teacher who dragged something
 * half off the edge. Clamping in one pure module is what lets all three of those
 * be tested without a browser, which is the only kind of test this repo runs.
 *
 * WHY THE CLOSED SETS ARE NOT WIDENED. A span is a number because a grid is a
 * promise, and the promise is that an element can always be drawn. A free value
 * here is how a slide ends up with text that runs past the right of the frame on
 * the projector and looks fine on the laptop the teacher built it on.
 */

/**
 * Six columns across, because six divides into halves, thirds and quarters.
 *
 * Read from the closed set rather than written out, so the grid the renderer
 * draws and the columns a teacher may store cannot drift apart.
 */
export const SLIDE_GRID_COLUMNS = SLIDE_COLUMNS.length;

/** Eight row bands down, so a heading, a body and a footer all fit at once. */
export const SLIDE_GRID_ROWS = SLIDE_ROWS.length;

/** The most bands one element may cover, which bounds a body block. */
export const SLIDE_MAX_TALL = 4;

/**
 * CSS grid line numbers, both ends exclusive.
 *
 * Exclusive is what `grid-column: 1 / 3` wants, and expressing it that way here
 * means the renderer never has to decide whether a line is inclusive.
 */
export interface SlidePlacement {
  columnStart: number;
  columnEnd: number;
  rowStart: number;
  rowEnd: number;
}

function clampInt(value: unknown, min: number, max: number): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, raw));
}

/**
 * Where an element sits, clamped so it cannot leave the grid.
 *
 * `normaliseElements` already bounds `span` and `tall` on their own. It cannot
 * bound the pair, because an element at column 5 spanning 4 is a legal element
 * with an illegal placement: the second half of that span is off the frame. So
 * the end line is pulled back here rather than trusted from the column, and the
 * right edge of every slide is the right edge of the grid.
 */
export function slidePlacement(
  element: Pick<SlideElement, 'col' | 'span' | 'row' | 'tall'>,
): SlidePlacement {
  const columnStart = clampInt(element.col, 1, SLIDE_GRID_COLUMNS);
  const rowStart = clampInt(element.row, 1, SLIDE_GRID_ROWS);
  const span = clampInt(element.span, 1, SLIDE_GRID_COLUMNS);
  const tall = clampInt(element.tall, 1, SLIDE_MAX_TALL);

  return {
    columnStart,
    columnEnd: Math.min(SLIDE_GRID_COLUMNS, columnStart + span - 1) + 1,
    rowStart,
    rowEnd: Math.min(SLIDE_GRID_ROWS, rowStart + tall - 1) + 1,
  };
}

/**
 * The four type steps, as a percentage of the canvas width.
 *
 * Container query units rather than pixels or `rem`, because the same slide is
 * drawn at 15rem in the thumbnail rail and at 60rem on the projector. A size in
 * pixels is correct on exactly one of them.
 */
const BODY_SIZE_CQW: Record<SlideSize, number> = {
  sm: 2.4,
  md: 3,
  lg: 3.8,
  xl: 4.6,
};

/**
 * The heading scale is the body scale with every step moved up once, and the
 * top step given room of its own.
 *
 * WHY NOT JUST USE THE SAME STEP. A teacher who sets a heading to `sm` has made
 * a mistake, and the cost of that mistake is a slide whose title is smaller than
 * its body. Lifting the whole band means the smallest heading a slide can be
 * given is still larger than the middle of the body scale, whatever the teacher
 * picked. The size they chose still moves the heading within its own band.
 */
const HEADING_SIZE_CQW: Record<SlideSize, number> = {
  sm: BODY_SIZE_CQW.lg,
  md: BODY_SIZE_CQW.xl,
  lg: 5.8,
  xl: 7,
};

export function slideFontSizeCqw(
  kind: SlideTextElement['kind'],
  size: SlideSize,
): number {
  return (kind === 'heading' ? HEADING_SIZE_CQW : BODY_SIZE_CQW)[size] ?? BODY_SIZE_CQW.md;
}

/** One line per bullet, trimmed, with the blank lines a typed body leaves behind. */
function bulletLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * A slide written before elements existed, drawn on the grid it now shares.
 *
 * The old renderer had four layouts and no images. Turning each into elements
 * rather than into a second markup path is what keeps one renderer: the legacy
 * slide and a slide the teacher built by hand go through the same theme, the
 * same type scale and the same grid, so upgrading a deck cannot change how a
 * slide looks except by adding what was actually added.
 */
export function legacyElements(slide: {
  layout: SlideLayout;
  title: string;
  body: string;
}): SlideElement[] {
  // A blank layout was a blank layout before elements existed, and it stays one.
  if (slide.layout === 'blank') return [];

  const elements: SlideElement[] = [];
  const title = slide.title.trim();

  if (title) {
    // A title slide was centred and bold, and a content slide was not. Centring
    // one layout and not the other is the whole difference between them.
    const isTitleOnly = slide.layout === 'title';
    elements.push({
      id: 'legacy_title',
      kind: 'heading',
      content: title,
      col: 1,
      span: SLIDE_GRID_COLUMNS,
      row: isTitleOnly ? 4 : 2,
      tall: 2,
      style: {
        ...DEFAULT_TEXT_STYLE,
        size: isTitleOnly ? 'xl' : 'lg',
        weight: 'semibold',
        align: isTitleOnly ? 'center' : 'left',
      },
    });
  }

  // A title layout has no points. The old renderer drew the body on one and
  // hiding it is not a regression, because it was never shown.
  if (slide.layout === 'title') return elements;

  const points = bulletLines(slide.body);
  if (points.length === 0) return elements;

  // Split is the layout labelled "points beside an image". The image was never
  // stored, so the points take the left half and the right half stays empty
  // rather than pretending there is something in it.
  const split = slide.layout === 'split';

  elements.push({
    id: 'legacy_points',
    kind: 'bullets',
    content: points.join('\n'),
    col: 1,
    span: split ? 3 : SLIDE_GRID_COLUMNS,
    row: 4,
    // Four bands is the most one element may cover, which puts the block in the
    // middle of the frame rather than filling it edge to edge.
    tall: 4,
    style: { ...DEFAULT_TEXT_STYLE, size: 'lg' },
  });

  return elements;
}

/**
 * What the renderer draws, whatever arrived from the column.
 *
 * `null` and `[]` are different instructions and this is the one place that says
 * so: `null` is a slide written before elements existed and is drawn from its
 * layout, `[]` is a teacher who deleted everything on purpose and is drawn
 * blank. Collapsing the two would silently resurrect a title a teacher removed.
 */
export function slideElements(slide: {
  elements: SlideElement[] | null;
  layout: SlideLayout;
  title: string;
  body: string;
}): SlideElement[] {
  const stored = normaliseElements(slide.elements);
  return stored === null ? legacyElements(slide) : stored;
}

/** The first row band below everything on the slide, for a newly added element. */
/**
 * The next free row band for a new element, as a `SlideRow`.
 *
 * RETURNING THE GRID TYPE AND NOT `number` IS THE POINT. A plain number is
 * assignable to `SlideRow` only by a cast, and a cast is a place where an
 * out-of-range band would get past the compiler and into the renderer. The clamp
 * below cannot produce a row outside the union because it is drawn from the
 * union, so the caller never has to assert anything.
 */
export function nextElementRow(elements: SlideElement[]): SlideRow {
  const bottom = elements.reduce((max, element) => {
    const placement = slidePlacement(element);
    return Math.max(max, placement.rowEnd - 1);
  }, 0);
  const next = Math.min(SLIDE_GRID_ROWS, bottom + 1);
  // Every value between 1 and the grid size is a member of `SLIDE_ROWS`, so this
  // is a narrowing rather than a cast.
  const candidate = SLIDE_ROWS.find((row) => row === next);
  return candidate ?? SLIDE_ROWS[0];
}

// ---------------------------------------------------------------------------
// Themes
//
// Four grounds, all of them composed from tokens that already exist. A slide
// surface is the one place in the product that has to survive a washed-out
// projector, so the four are genuinely different grounds rather than four tints
// of the same one, and each one carries its own text colours.
//
// WHY THE INK TABLE HAS FALLBACKS IN IT. The ink set is closed and shared, so a
// slide can say "on-accent" while sitting on a pale ground, which is white text
// on white. Rather than widen the set or refuse the combination, the unsafe pair
// renders as the strongest legible ink on that ground: the teacher sees their
// mistake as a plain heading rather than as a slide they cannot read.
// ---------------------------------------------------------------------------

const GROUNDS: Record<SlideTheme, string> = {
  // The warm page ground, with the accent carried by the heading rule.
  viridian: 'bg-surface',
  // Near black in the light theme, the sunken ground in the dark one. Both are
  // the darkest surface the app owns, so the slide is never the brightest thing
  // on a wall.
  ink: 'bg-ink dark:bg-surface-sunken',
  // The lightest ground in the system, for a room whose projector washes out.
  paper: 'bg-surface-raised',
  // The accent itself, which is the only ground that is a brand colour.
  dusk: 'bg-accent',
};

const INKS: Record<SlideTheme, Record<SlideInk, string>> = {
  viridian: {
    ink: 'text-ink',
    muted: 'text-ink-muted',
    accent: 'text-accent',
    'on-accent': 'text-ink',
  },
  paper: {
    ink: 'text-ink',
    muted: 'text-ink-muted',
    accent: 'text-accent',
    'on-accent': 'text-ink',
  },
  ink: {
    ink: 'text-surface dark:text-ink',
    muted: 'text-surface/75 dark:text-ink/70',
    accent: 'text-ink',
    'on-accent': 'text-surface dark:text-ink',
  },
  dusk: {
    // There is no dimmer ink that stays above 4.5:1 on the accent fill, so the
    // hierarchy on this ground is carried by size and weight rather than by
    // colour. A second, lighter grey here would fail the contrast it was
    // introduced to pass.
    ink: 'text-on-accent',
    muted: 'text-on-accent',
    accent: 'text-on-accent',
    'on-accent': 'text-on-accent',
  },
};

/** The inks that are legible on this ground, which is what the picker offers. */
const INK_OPTIONS: Record<SlideTheme, SlideInk[]> = {
  viridian: ['ink', 'muted', 'accent'],
  paper: ['ink', 'muted', 'accent'],
  // The accent on near black scores 3.5:1, so it is neither offered nor used.
  ink: ['ink', 'muted'],
  dusk: ['ink', 'muted'],
};

/** An inset frame, on one theme only, so the four grounds are told apart at a glance. */
const FRAMES: Record<SlideTheme, string> = {
  viridian: '',
  ink: '',
  paper: 'absolute inset-[3cqw] border border-border',
  dusk: '',
};

const HEADING_RULES: Record<SlideTheme, string> = {
  viridian: 'border-t-[0.35cqw] border-t-accent pt-[1.2cqw]',
  ink: '',
  paper: '',
  dusk: 'border-t-[0.35cqw] border-t-on-accent pt-[1.2cqw]',
};

const HOVERS: Record<SlideTheme, string> = {
  viridian: 'hover:bg-ink/5',
  paper: 'hover:bg-ink/5',
  ink: 'hover:bg-surface/10 dark:hover:bg-ink/10',
  dusk: 'hover:bg-on-accent/10',
};

/**
 * The selection ring.
 *
 * Each ground needs its own, because the obvious one (an accent ring) is
 * invisible on the accent ground and the second obvious one (ink) is invisible
 * on the ink ground. A teacher who cannot see what they selected will format the
 * wrong element.
 */
const SELECTIONS: Record<SlideTheme, string> = {
  viridian: 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
  paper: 'ring-2 ring-ink ring-offset-2 ring-offset-surface-raised',
  ink: 'ring-2 ring-surface ring-offset-2 ring-offset-ink dark:ring-ink dark:ring-offset-surface-sunken',
  dusk: 'ring-2 ring-on-accent ring-offset-2 ring-offset-accent',
};

function lookup<T>(table: Record<SlideTheme, T>, theme: SlideTheme, fallback: T): T {
  return table[theme] ?? fallback;
}

export function slideGroundClass(theme: SlideTheme): string {
  return lookup(GROUNDS, theme, GROUNDS.viridian);
}

export function slideInkClass(theme: SlideTheme, ink: SlideInk): string {
  return lookup(INKS, theme, INKS.viridian)[ink] ?? INKS.viridian.ink;
}

export function slideInkOptions(theme: SlideTheme): SlideInk[] {
  return lookup(INK_OPTIONS, theme, INK_OPTIONS.viridian);
}

export function slideFrameClass(theme: SlideTheme): string {
  return lookup(FRAMES, theme, FRAMES.viridian);
}

export function slideHeadingRuleClass(theme: SlideTheme): string {
  return lookup(HEADING_RULES, theme, HEADING_RULES.viridian);
}

export function slideHoverClass(theme: SlideTheme): string {
  return lookup(HOVERS, theme, HOVERS.viridian);
}

export function slideSelectionClass(theme: SlideTheme): string {
  return lookup(SELECTIONS, theme, SELECTIONS.viridian);
}

// ---------------------------------------------------------------------------
// Labels
//
// Only the two vocabularies `types.ts` does not already own. Size, weight,
// alignment, ink, font, layout and theme labels all live beside their closed
// sets, and a second list here would be a control saying `Body` in one panel and
// `Medium` in the other.
// ---------------------------------------------------------------------------

export const SLIDE_FIT_LABELS: Record<SlideImageElement['fit'], string> = {
  cover: 'Fill the box',
  contain: 'Fit inside',
};

export const SLIDE_ELEMENT_LABELS: Record<SlideElement['kind'], string> = {
  heading: 'Heading',
  text: 'Text block',
  bullets: 'Bullet list',
  image: 'Image',
};

const WEIGHT_CLASSES: Record<SlideWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const FONT_CLASSES: Record<SlideFont, string> = {
  geist: '',
  'geist-mono': 'font-mono',
};

const ALIGN_CLASSES: Record<SlideAlignment, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export function slideWeightClass(weight: SlideWeight): string {
  return WEIGHT_CLASSES[weight] ?? WEIGHT_CLASSES.normal;
}

export function slideFontClass(font: SlideFont): string {
  return FONT_CLASSES[font] ?? FONT_CLASSES.geist;
}

export function slideAlignClass(align: SlideAlignment): string {
  return ALIGN_CLASSES[align] ?? ALIGN_CLASSES.left;
}