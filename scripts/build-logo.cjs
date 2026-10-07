/**
 * Reconstructs the supplied LIKO logo as vector paths.
 *
 * The source is a JPEG painted over a checkerboard, so it carries no real
 * transparency and cannot ship as a logo. Every figure below was fitted from
 * scanline runs taken off the original (scripts/scan-logo.cjs), not traced, and
 * the whole wordmark turns out to be a set of monolinear strokes with round
 * terminals. That makes it reproducible exactly.
 *
 *   ink box            1536 x 509
 *   monogram "LK"      514 x 509   one continuous stroke, 79 thick
 *   wordmark "LIKO"    913 x 320   caps 312, stems 71, diagonals 67
 *   core green         #29813d
 *
 * Coordinate space is the source image's own ink box, so the numbers below can
 * be checked straight against the scanline output.
 *
 * Run: node scripts/build-logo.cjs   ->   writes public/brand/liko-*.svg
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'brand');

// ---------------------------------------------------------------------------
// Monogram: an L and a K fused into one stroke.
//
// The L's stem rises, curves right over the top as a semicircular arch, and
// comes down as the K's stem, so the ligature is a single continuous run. The
// foot turns up off the baseline at the far left, and the K's arms spring from
// the stem at 45 degrees.
// ---------------------------------------------------------------------------

const M_STROKE = 79;
const M_R = M_STROKE / 2; // 39.5

// Key x positions in the ligature.
const L_STEM_X = 39.5; //   outer edge 0
const K_STEM_X = 180.5; //  outer edge 141..220
const ARCH_CX = 110; //     arch centre, outer radius 110
const ARCH_CY = 110;
const ARCH_R = 70.5; //     centreline radius, = 110 - 39.5

// Baseline and the foot.
const BASE_Y = 507; //       outer bottom edge
const FOOT_Y = BASE_Y - M_R; // 467.5
const FOOT_END_X = 280.4; //   centreline of the round terminal
const FOOT_CORNER_R = 74.2; // centreline radius; outer radius 113.7

// K stem drop.
const K_STEM_END_Y = 333.5;

// K arms: both 45 degrees, so they read as one clean diagonal language.
const ARM_UPPER = { a: [190, 318], b: [470.5, 37.5] }; // y = 508 - x
const ARM_LOWER = { a: [190, 188], b: [472.5, 470.5] }; // y = x - 2

function monogramPaths() {
  const [x0, y0] = [L_STEM_X + FOOT_CORNER_R, FOOT_Y];
  const [x1, y1] = [L_STEM_X, FOOT_Y - FOOT_CORNER_R];
  return [
    // Foot, corner, L stem, top arch, K stem.
    `M ${FOOT_END_X} ${FOOT_Y} ` +
      `H ${x0} ` +
      `A ${FOOT_CORNER_R} ${FOOT_CORNER_R} 0 0 1 ${x1} ${y1} ` +
      `V ${ARCH_CY} ` +
      `A ${ARCH_R} ${ARCH_R} 0 0 1 ${K_STEM_X} ${ARCH_CY} ` +
      `V ${K_STEM_END_Y}`,
    `M ${ARM_UPPER.a[0]} ${ARM_UPPER.a[1]} L ${ARM_UPPER.b[0]} ${ARM_UPPER.b[1]}`,
    `M ${ARM_LOWER.a[0]} ${ARM_LOWER.a[1]} L ${ARM_LOWER.b[0]} ${ARM_LOWER.b[1]}`,
  ];
}

// ---------------------------------------------------------------------------
// Wordmark: L I K O, capitals, optically centred on the monogram.
// ---------------------------------------------------------------------------

const W_CAP_TOP = 101;
const W_CAP_BOTTOM = 413;
const W_CY = (W_CAP_TOP + W_CAP_BOTTOM) / 2; // 257
const W_STEM = 71;
const W_ARM = 67;
const W_HALF = W_STEM / 2;

function wordmarkPaths() {
  const paths = [];

  // L: stem down, foot right. A miter join keeps the inner corner crisp.
  paths.push({
    d: `M 659.5 136.5 V ${W_CY + 122} H 804`,
    stroke: W_STEM,
  });

  // I: a plain stem. The original is an undotted capital, not a lower-case i.
  paths.push({ d: 'M 898 136.5 V 377.5', stroke: W_STEM });

  // K: stem plus two arms. The upper arm runs down into the stem; the lower
  // arm springs from the diagonal just clear of it, which is how the original
  // breaks the junction.
  paths.push({ d: 'M 1011.5 136.5 V 377.5', stroke: W_STEM });
  paths.push({ d: 'M 1011.5 313.9 L 1176 135', stroke: W_ARM });
  paths.push({ d: 'M 1078 236 L 1186.9 380', stroke: W_ARM });

  return paths;
}

// The O is a ring rather than a stroke: its walls measure 72 on the sides and
// 63 across the top, which no uniform pen produces.
const O_OUTER = { cx: 1382.5, cy: 256.5, rx: 152.5, ry: 159.5 };
const O_INNER = { cx: 1382.5, cy: 256.5, rx: 82, ry: 95 };

function ringPath(o, i) {
  return (
    `M ${o.cx - o.rx} ${o.cy} ` +
    `a ${o.rx} ${o.ry} 0 1 0 ${o.rx * 2} 0 ` +
    `a ${o.rx} ${o.ry} 0 1 0 ${-o.rx * 2} 0 ` +
    `M ${i.cx - i.rx} ${i.cy} ` +
    `a ${i.rx} ${i.ry} 0 1 0 ${i.rx * 2} 0 ` +
    `a ${i.rx} ${i.ry} 0 1 0 ${-i.rx * 2} 0`
  );
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const GREEN = '#29813d';
const MONO_W = 514;
const MONO_H = 509;
const LOCKUP_W = 1536;
const LOCKUP_H = 509;

function strokeGroup(paths, attrs) {
  return (
    paths
      .map((p) => `  <path d="${p.d}" stroke-width="${p.stroke ?? attrs}" />`)
      .join('\n')
  );
}

function lockup() {
  const mono = monogramPaths()
    .map((d) => `  <path d="${d}" stroke-width="${M_STROKE}" />`)
    .join('\n');
  const word = strokeGroup(wordmarkPaths());

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCKUP_W} ${LOCKUP_H}" role="img" aria-label="LIKO">
  <title>LIKO</title>
  <g fill="none" stroke="${GREEN}" stroke-linecap="round" stroke-linejoin="miter">
    <g>
${mono}
    </g>
    <g>
      <path d="${ringPath(O_OUTER, O_INNER)}" fill="${GREEN}" fill-rule="evenodd" stroke="none" />
${word}
    </g>
  </g>
</svg>
`;
}

/** Mark only: the LK ligature, for the app icon and favicon. */
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MONO_W} ${MONO_H}" role="img" aria-label="LIKO">
  <title>LIKO</title>
  <g fill="none" stroke="${GREEN}" stroke-linecap="round" stroke-linejoin="miter" stroke-width="${M_STROKE}">
${monogramPaths().map((d) => `    <path d="${d}" />`).join('\n')}
  </g>
</svg>
`;

/**
 * Construction sheet. Generated from the same constants as the mark itself, so
 * it can never document a geometry that is no longer being drawn.
 */
function construction() {
  const G = '#9a948a'; // guides
  const A = '#b4472e'; // annotations
  const guide = (d) => `<path d="${d}" stroke="${G}" stroke-width="1" fill="none" />`;
  const note = (x, y, t, anchor = 'start') =>
    `<text x="${x}" y="${y}" fill="${A}" font-family="ui-monospace,monospace" ` +
    `font-size="17" text-anchor="${anchor}">${t}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -40 820 620" role="img" aria-label="LIKO mark construction">
  <title>LIKO mark construction</title>
  <rect x="-150" y="-40" width="820" height="620" fill="#fdf8f5" />

  <g stroke="#e5e0d9" stroke-width="1">
${[0, 110, 220, 330, 440, 509]
  .map(
    (y) =>
      `    <line x1="-60" y1="${y}" x2="${MONO_W + 90}" y2="${y}" />`
  )
  .join('\n')}
  </g>

  <!-- Centre lines and the two semicircular sweeps that set the ligature. -->
  ${guide(`M ${L_STEM_X} -20 V ${BASE_Y + 40}`)}
  ${guide(`M ${K_STEM_X} -20 V ${BASE_Y + 40}`)}
  ${guide(`M ${FOOT_Y} -20 H ${MONO_W + 90}`)}
  ${guide(`M -60 ${BASE_Y} H ${MONO_W + 90}`)}
  ${guide(`M ${ARCH_CX} ${ARCH_CY} m -110 0 a 110 110 0 1 0 220 0 a 110 110 0 1 0 -220 0`)}
  ${guide(`M ${ARCH_CX} ${ARCH_CY} m -${ARCH_R} 0 a ${ARCH_R} ${ARCH_R} 0 1 0 ${ARCH_R * 2} 0 a ${ARCH_R} ${ARCH_R} 0 1 0 -${ARCH_R * 2} 0`)}
  ${guide(`M ${K_STEM_X} ${K_STEM_END_Y} m -${M_R} 0 a ${M_R} ${M_R} 0 1 0 ${M_STROKE} 0 a ${M_R} ${M_R} 0 1 0 -${M_STROKE} 0`)}
  ${guide(`M ${FOOT_END_X} ${FOOT_Y} m -${M_R} 0 a ${M_R} ${M_R} 0 1 0 ${M_STROKE} 0 a ${M_R} ${M_R} 0 1 0 -${M_STROKE} 0`)}

  <!-- The two 45 degree arms. -->
  ${guide('M 120 508 L 500 128')}
  ${guide('M 120 -12 L 500 368')}

  <g fill="none" stroke="${GREEN}" stroke-linecap="round" stroke-linejoin="miter" opacity="0.18" stroke-width="${M_STROKE}">
${monogramPaths().map((d) => `    <path d="${d}" />`).join('\n')}
  </g>

  <g fill="none" stroke="${GREEN}" stroke-linecap="round" stroke-linejoin="miter" stroke-width="${M_STROKE}">
${monogramPaths().map((d) => `    <path d="${d}" />`).join('\n')}
  </g>

  ${note(L_STEM_X + 8, -22, 'L stem centre')}
  ${note(K_STEM_X + 8, -22, 'K stem centre')}
  ${note(ARCH_CX + ARCH_R + 12, ARCH_CY - ARCH_R - 14, `arch R${ARCH_R} on R${ARCH_CY - 39.5 + 39.5} outer`)}
  ${note(FOOT_Y + 12, FOOT_Y - 12, `foot centre y ${FOOT_Y}`)}
  ${note(MONO_W + 22, BASE_Y + 6, `baseline ${BASE_Y}`, 'start')}
  ${note(MONO_W + 22, K_STEM_END_Y + 6, 'K stem terminal')}
  ${note(MONO_W + 22, FOOT_Y + 40, 'foot terminal')}
  ${note(-140, ARM_UPPER.b[1] + 130, 'arms at 45 degrees')}
  ${note(-140, 560, `stroke ${M_STROKE} · box ${MONO_W}x${MONO_H}`)}
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'liko-logo.svg'), lockup(), 'utf8');
fs.writeFileSync(path.join(OUT, 'liko-mark.svg'), mark, 'utf8');
fs.writeFileSync(
  path.join(OUT, 'liko-mark-construction.svg'),
  construction(),
  'utf8'
);

console.log('wrote public/brand/liko-logo.svg, liko-mark.svg, liko-mark-construction.svg');
console.log(`monogram ${MONO_W}x${MONO_H} stroke ${M_STROKE}`);
console.log(`wordmark caps ${W_CAP_TOP}..${W_CAP_BOTTOM} stems ${W_STEM} arms ${W_ARM}`);
console.log(`green ${GREEN}`);