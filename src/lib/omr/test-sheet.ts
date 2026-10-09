/**
 * A synthetic answer sheet, drawn in memory.
 *
 * WHY THIS EXISTS. Optical mark recognition cannot be proved by asserting that a
 * function returns something. It has to be proved that a sheet with a KNOWN
 * pattern comes back with that EXACT pattern, including the cells nobody marked
 * and the ones that were marked by accident. A real scan cannot supply an
 * expected value, because nobody writes down what the sheet is supposed to say
 * before scanning it.
 *
 * So the expected answer is drawn first, as pixels, and the detector is then held
 * against it. That is an independent source of truth: the marks come from the
 * drawing routine, not from the detector's own logic.
 *
 * The geometry deliberately mirrors a printed sheet: an EMPTY bubble is an
 * outline and a FILLED one is a solid disc, which is what a pencil does to
 * paper and what a phone camera photographs.
 */

export interface SheetSpec {
  /** Question rows. */
  rows: number;
  /** Option columns. */
  cols: number;
  /** Centre-to-centre spacing in pixels. */
  cellSize?: number;
  /** Bubble radius in pixels. */
  radius?: number;
  /** `[row][col]`, true when the student marked that bubble. */
  marked: boolean[][];
  marginX?: number;
  marginY?: number;
  /** Extra dark blobs that are NOT bubbles, e.g. printed labels. */
  noiseBlobs?: { x: number; y: number; w: number; h: number }[];
  /** Deterministic speckle amplitude, 0 to disable. */
  grain?: number;
}

export interface RenderedSheet {
  gray: Uint8Array;
  width: number;
  height: number;
}

const PAPER = 245;

/**
 * Deterministic value noise. Seeded from the pixel index rather than
 * `Math.random` so a failing assertion is reproducible on the next run.
 */
function grainAt(x: number, y: number, amplitude: number): number {
  const n = (x * 73856093) ^ (y * 19349663);
  return ((n >>> 0) % (amplitude * 2 + 1)) - amplitude;
}

export function renderSheet(spec: SheetSpec): RenderedSheet {
  const cell = spec.cellSize ?? 64;
  const radius = spec.radius ?? 20;
  const marginX = spec.marginX ?? 80;
  const marginY = spec.marginY ?? 80;
  const grain = spec.grain ?? 6;

  const width = marginX * 2 + cell * spec.cols;
  const height = marginY * 2 + cell * spec.rows;
  const gray = new Uint8Array(width * height);

  for (let i = 0; i < gray.length; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    gray[i] = Math.max(0, Math.min(255, PAPER + grainAt(x, y, grain)));
  }

  const ink = 40;

  // An outline circle: everything within one pixel of the circle's circumference.
  const strokeCircle = (cx: number, cy: number) => {
    const outer = radius;
    const inner = radius - 3;
    for (let y = Math.max(0, cy - outer); y <= Math.min(height - 1, cy + outer); y++) {
      for (let x = Math.max(0, cx - outer); x <= Math.min(width - 1, cx + outer); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= outer && d >= inner) gray[y * width + x] = ink;
      }
    }
  };

  const fillCircle = (cx: number, cy: number) => {
    const r = radius - 3;
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) {
        if (Math.hypot(x - cx, y - cy) <= r) gray[y * width + x] = ink;
      }
    }
  };

  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      const cx = marginX + cell * c + cell / 2;
      const cy = marginY + cell * r + cell / 2;
      strokeCircle(Math.round(cx), Math.round(cy));
      if (spec.marked[r]?.[c]) fillCircle(Math.round(cx), Math.round(cy));
    }
  }

  for (const b of spec.noiseBlobs ?? []) {
    for (let y = b.y; y < Math.min(height, b.y + b.h); y++) {
      for (let x = b.x; x < Math.min(width, b.x + b.w); x++) {
        gray[y * width + x] = ink;
      }
    }
  }

  return { gray, width, height };
}

/** Convenience for the common case: one answer per row, given as column indexes. */
export function marksFromChoices(
  rowCount: number,
  colCount: number,
  choices: Record<number, number[]>,
): boolean[][] {
  const grid: boolean[][] = [];
  for (let r = 0; r < rowCount; r++) {
    grid.push(new Array(colCount).fill(false));
    for (const c of choices[r] ?? []) grid[r][c] = true;
  }
  return grid;
}