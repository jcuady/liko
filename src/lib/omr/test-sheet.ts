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
  /**
   * A printed code block above the answer grid, as the student fills it in.
   *
   * The extra gap between digits is not cosmetic. `readIdRow` decides where one
   * digit ends and the next begins by measuring that gap, so the drawing has to
   * carry the same distinction the reader looks for, or the test would only
   * prove that the reader matches the drawing's own convention rather than a
   * printed one.
   */
  idBlock?: {
    groups: number;
    perGroup: number;
    /**
     * The shaded code per digit. `null` leaves the digit blank and a number
     * shades one bubble; an ARRAY shades several at once, which is what a
     * misread looks like on paper and what the reader has to refuse.
     */
    digits: (number | number[] | null)[];
  };
}

/** Extra spacing between the last code of one digit and the first of the next. */
const ID_DIGIT_GAP = 1.4;
/** Clear air above the code row and between it and the answer grid, in pixels. */
const ID_ROW_CLEARANCE = 24;

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

  const id = spec.idBlock;
  // The code row sits on its own band at the top of the page, clear of the grid
  // and clear of the paper edge. Putting it at a fixed distance above the grid
  // instead would run a 20px bubble off the top of a 160px band and clip it into
  // a shape the detector's aspect gate is entitled to reject.
  const idCy = radius + ID_ROW_CLEARANCE;
  const idWidth = id ? cell * (id.groups * id.perGroup + (id.groups - 1) * ID_DIGIT_GAP) : 0;
  const idBand = id ? idCy + radius + ID_ROW_CLEARANCE : 0;
  const gridTop = marginY + idBand;

  /*
   * Rounded, and that is load-bearing rather than tidy. A fractional length on
   * `new Uint8Array(n)` is truncated, so the buffer is smaller than `width *
   * height` and every `gray[y * width + x]` past the truncation point reads
   * `undefined` instead of a pixel. Adding a code block made the arithmetic
   * fractional on the default spec (1.4 * 64 is not whole), which turned a
   * clean sheet into a field of `undefined` that the detector would have
   * silently reported as blank paper.
   */
  const width = Math.round(marginX * 2 + Math.max(idWidth, cell * spec.cols));
  const height = Math.round(gridTop + cell * spec.rows + marginY);
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
      const cy = gridTop + cell * r + cell / 2;
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

  // The code block, drawn on its own band above the grid and in the same ink and
  // the same bubble size, because a real sheet has exactly one of those.
  if (id) {
    let cx = marginX + cell / 2;
    for (let g = 0; g < id.groups; g++) {
      for (let k = 0; k < id.perGroup; k++) {
        if (g > 0 && k === 0) cx += cell * ID_DIGIT_GAP;
        const centre = Math.round(cx);
        strokeCircle(centre, Math.round(idCy));
        const shaded = id.digits[g];
        const codes = Array.isArray(shaded) ? shaded : shaded === null || shaded === undefined ? [] : [shaded];
        if (codes.includes(k)) fillCircle(centre, Math.round(idCy));
        cx += cell;
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