/**
 * Geometry for the LIKO mark and lockup, in one place so the React components,
 * the generated icons and the static files in `public/brand/` cannot drift.
 *
 * The figures were measured off the supplied artwork rather than eyeballed:
 * the monogram is one continuous stroke (foot, up the L, over a semicircular
 * arch, down the K) with two 45 degree arms, and the wordmark is four capitals
 * with monolinear strokes and round terminals. See `scripts/build-logo.cjs`,
 * which emits the same numbers to `public/brand/`.
 */

/** The LK ligature, 514 x 509, drawn as a 79-thick round-capped stroke. */
export const MARK_VIEWBOX = '0 0 514 509';
export const MARK_STROKE = 79;

export const MARK_PATHS = [
  // Foot, bottom-left turn, L stem, top arch, K stem.
  'M 280.4 467.5 H 113.7 A 74.2 74.2 0 0 1 39.5 393.3 V 110 A 70.5 70.5 0 0 1 180.5 110 V 333.5',
  // K arms, both 45 degrees.
  'M 190 318 L 470.5 37.5',
  'M 190 188 L 472.5 470.5',
];

/** Cap height 312, stems 71, diagonals 67. */
export const LOCKUP_VIEWBOX = '0 0 1536 509';
export const WORDMARK_STEM = 71;
export const WORDMARK_ARM = 67;

export const WORDMARK_PATHS: ReadonlyArray<{ d: string; width: number }> = [
  // L: stem down, foot right. A miter join keeps the inner corner crisp.
  { d: 'M 659.5 136.5 V 379 H 804', width: WORDMARK_STEM },
  // I: a plain stem. The original is an undotted capital, not a lower-case i.
  { d: 'M 898 136.5 V 377.5', width: WORDMARK_STEM },
  // K: stem plus two arms. The lower arm springs from the diagonal just clear of
  // the stem, which is how the original breaks the junction.
  { d: 'M 1011.5 136.5 V 377.5', width: WORDMARK_STEM },
  { d: 'M 1011.5 313.9 L 1176 135', width: WORDMARK_ARM },
  { d: 'M 1078 236 L 1186.9 380', width: WORDMARK_ARM },
];

/**
 * The O is a ring rather than a stroke: its walls measure 72 at the sides and
 * 63 across the top, which no uniform pen can produce.
 */
export const O_RING = {
  outer: { cx: 1382.5, cy: 256.5, rx: 152.5, ry: 159.5 },
  inner: { cx: 1382.5, cy: 256.5, rx: 82, ry: 95 },
};

function ellipse({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    `M ${cx - rx} ${cy} ` +
    `a ${rx} ${ry} 0 1 0 ${rx * 2} 0 ` +
    `a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`
  );
}

export const O_PATH =
  `${ellipse(O_RING.outer)} ${ellipse(O_RING.inner)}`;

/** The green measured off the supplied artwork. */
export const BRAND_GREEN = '#29813d';