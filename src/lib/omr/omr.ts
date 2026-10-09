/**
 * Optical mark recognition for printed answer sheets.
 *
 * WHY PURE. This module takes a grayscale buffer and returns a read grid. It
 * never touches a canvas, a file or the DOM. That is deliberate: the arithmetic
 * that turns ink into a grid is the part that can be quietly wrong, and it is
 * the part that can be held against a sheet whose true contents were decided
 * before the detector ran. `omr.test.ts` does exactly that, drawing an answer
 * key as pixels and asserting the scan returns it.
 *
 * WHY IT IS TEMPLATE-FREE. A printed sheet photographed on a phone arrives
 * scaled, skewed and at whatever angle the desk was at. Nothing here is told
 * where the grid is. Bubbles are found as shapes, grouped into rows by position
 * and into columns against the widest row.
 *
 * WHY THE TEACHER STILL CONFIRMS IT. The detector is expected to be good, not
 * infallible: a smudge, a shadow or a half-shaded bubble is exactly the case
 * where a human beats a threshold. The scan screen therefore shows the grid for
 * correction before anything is written, which is how paper OMR has always
 * worked. That is a safety property, not a workaround.
 */

/** A bubble the detector accepted as a real answer target. */
export interface DetectedBubble {
  row: number;
  col: number;
  /** True when the student shaded it. */
  marked: boolean;
  /** Fraction of the bounding box that is ink, 0 to 1. */
  fill: number;
  cx: number;
  cy: number;
  radius: number;
}

/** Everything the detector learned about one sheet. */
export interface OmrSheet {
  width: number;
  height: number;
  /** The ink/paper cut used, for display and for a manual override. */
  threshold: number;
  rows: number;
  cols: number;
  /** Indexed `[row][col]`. */
  bubbles: DetectedBubble[][];
  /** Bubbles rejected before gridding, kept for the "could not read" message. */
  rejected: number;
}

export interface OmrOptions {
  /** Ink is at or below this value. Defaults to Otsu. */
  threshold?: number;
  /** Fill fraction at or above which a bubble counts as shaded. */
  markFill?: number;
  /** Smallest and largest bounding-box side, in pixels, for a real bubble. */
  minSide?: number;
  maxSide?: number;
}

export interface MarkedAnswer {
  questionIndex: number;
  optionKeys: string[];
}

/** The minimum a question needs in order to be scored from a sheet. */
export interface ScorableQuestion {
  id: string;
  kind: 'single' | 'multiple';
  answerKey: string[];
  points: number;
}

export interface QuestionResult {
  questionIndex: number;
  awarded: number;
  correct: boolean;
  /** Nothing was marked. Kept distinct from a wrong answer, because the two
   *  mean different things to a teacher and a gradebook cannot show one as the
   *  other. */
  blank: boolean;
  /** More than one mark on a single-choice question. */
  ambiguous: boolean;
  optionKeys: string[];
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  percentage: number;
  perQuestion: QuestionResult[];
}

/**
 * Otsu's method: the threshold that maximises between-class variance.
 *
 * A blank or uniform image has no separation to find, so it returns 0 rather
 * than dividing by an empty class.
 */
export function otsuThreshold(gray: Uint8Array): number {
  if (gray.length === 0) return 0;

  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]!++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let bestVar = -1;

  for (let t = 0; t < 256; t++) {
    weightB += hist[t]!;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * hist[t]!;
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) * (meanB - meanF);

    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }

  return best;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  cx: number;
  cy: number;
}

/** 8-connected components of ink. Iterative, so a large sheet cannot blow the stack. */
function findComponents(
  ink: Uint8Array,
  width: number,
  height: number,
): Component[] {
  const seen = new Uint8Array(width * height);
  const out: Component[] = [];
  const stack = new Int32Array(width * height);

  for (let start = 0; start < ink.length; start++) {
    if (ink[start] === 0 || seen[start] === 1) continue;

    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;

    while (sp > 0) {
      const idx = stack[--sp]!;
      const x = idx % width;
      const y = (idx / width) | 0;

      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nidx = ny * width + nx;
          if (ink[nidx] === 0 || seen[nidx] === 1) continue;
          seen[nidx] = 1;
          stack[sp++] = nidx;
        }
      }
    }

    out.push({ minX, minY, maxX, maxY, area, cx: sumX / area, cy: sumY / area });
  }

  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function scanSheet(
  gray: Uint8Array,
  width: number,
  height: number,
  options: OmrOptions = {},
): OmrSheet {
  const empty: OmrSheet = {
    width,
    height,
    threshold: 0,
    rows: 0,
    cols: 0,
    bubbles: [],
    rejected: 0,
  };
  if (gray.length === 0 || width <= 0 || height <= 0) return empty;

  const threshold = options.threshold ?? otsuThreshold(gray);
  const markFill = options.markFill ?? 0.45;
  const maxSide = options.maxSide ?? Math.max(12, Math.min(width, height) / 6);
  const minSide = options.minSide ?? Math.max(4, maxSide * 0.22);

  const ink = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) ink[i] = gray[i]! <= threshold ? 1 : 0;

  const components = findComponents(ink, width, height);

  // Shape gate first: a bubble is compact, roughly square, and roughly the size
  // of the others. Printed words and rules fail this and never reach the grid.
  const shaped = components.filter((c) => {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    if (w < minSide || h < minSide) return false;
    if (w > maxSide || h > maxSide) return false;
    const aspect = w / h;
    return aspect >= 0.5 && aspect <= 2;
  });

  if (shaped.length === 0) {
    return { ...empty, threshold };
  }

  // Scale gate: keep the dominant population. A stray speck of a different size
  // is not an answer target just because it passed the shape test.
  const typical = median(shaped.map((c) => Math.min(c.maxX - c.minX + 1, c.maxY - c.minY + 1)));
  const candidates = shaped.filter((c) => {
    const side = Math.min(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
    return side >= typical * 0.45 && side <= typical * 2.1;
  });

  if (candidates.length === 0) {
    return { ...empty, threshold };
  }

  const rows: Component[][] = [];
  const rowTolerance = median(candidates.map((c) => c.maxY - c.minY + 1)) * 0.75;

  const byY = [...candidates].sort((a, b) => a.cy - b.cy);
  let current: Component[] = [];
  let currentY: number | null = null;

  for (const c of byY) {
    if (currentY === null || Math.abs(c.cy - currentY) <= rowTolerance) {
      current.push(c);
      currentY = currentY === null ? c.cy : (currentY * (current.length - 1) + c.cy) / current.length;
    } else {
      rows.push(current);
      current = [c];
      currentY = c.cy;
    }
  }
  if (current.length > 0) rows.push(current);

  // Columns come from the fullest row, so a row where the detector missed one
  // bubble still lines up with the sheet instead of shifting left.
  const fullest = rows.reduce((best, row) => (row.length > best.length ? row : best), rows[0]!);
  const centres = [...fullest].sort((a, b) => a.cx - b.cx).map((c) => c.cx);
  const cols = centres.length;

  const bubbles: DetectedBubble[][] = [];

  for (const row of rows) {
    const cells: DetectedBubble[] = new Array(cols);
    for (const c of row) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centres.length; i++) {
        const d = Math.abs(centres[i]! - c.cx);
        if (d < bestDist) {
          bestDist = d;
          bestCol = i;
        }
      }
      if (cells[bestCol]) continue;

      const w = c.maxX - c.minX + 1;
      const h = c.maxY - c.minY + 1;
      const boxArea = w * h;
      const fill = boxArea > 0 ? c.area / boxArea : 0;

      cells[bestCol] = {
        row: 0,
        col: bestCol,
        marked: fill >= markFill,
        fill: Math.round(fill * 1000) / 1000,
        cx: Math.round(c.cx),
        cy: Math.round(c.cy),
        radius: Math.round(Math.min(w, h) / 2),
      };
    }
    // A bubble the detector missed is an unreadable cell, not a blank answer,
    // so it is filled with a definite "not read" marker.
    for (let i = 0; i < cols; i++) {
      if (!cells[i]) {
        cells[i] = {
          row: 0,
          col: i,
          marked: false,
          fill: 0,
          cx: Math.round(centres[i]!),
          cy: 0,
          radius: 0,
        };
      }
    }
    bubbles.push(cells);
  }

  bubbles.forEach((row, r) => row.forEach((b) => { b.row = r; }));

  return {
    width,
    height,
    threshold,
    rows: bubbles.length,
    cols,
    bubbles,
    rejected: components.length - candidates.length,
  };
}

export function answersFromSheet(sheet: OmrSheet, optionKeys: string[]): MarkedAnswer[] {
  const answers: MarkedAnswer[] = [];
  for (let r = 0; r < sheet.bubbles.length; r++) {
    const keys: string[] = [];
    const row = sheet.bubbles[r]!;
    for (let c = 0; c < row.length && c < optionKeys.length; c++) {
      if (row[c]!.marked) keys.push(optionKeys[c]!);
    }
    answers.push({ questionIndex: r, optionKeys: keys });
  }
  return answers;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, i) => value === right[i]);
}

export function scoreAnswers(
  questions: ScorableQuestion[],
  answers: MarkedAnswer[],
): ScoreResult {
  const byIndex = new Map(answers.map((a) => [a.questionIndex, a.optionKeys]));

  const perQuestion: QuestionResult[] = [];
  let score = 0;
  let maxScore = 0;

  questions.forEach((question, index) => {
    const selected = byIndex.get(index) ?? [];
    const blank = selected.length === 0;
    const ambiguous = question.kind === 'single' && selected.length > 1;
    const correct = !ambiguous && sameSet(selected, question.answerKey);
    const points = Number.isFinite(question.points) ? question.points : 0;

    maxScore += points;
    if (correct) score += points;

    perQuestion.push({
      questionIndex: index,
      awarded: correct ? points : 0,
      correct,
      blank,
      ambiguous,
      optionKeys: selected,
    });
  });

  const roundedMax = Math.round(maxScore * 100) / 100;
  const roundedScore = Math.round(score * 100) / 100;

  return {
    score: roundedScore,
    maxScore: roundedMax,
    percentage: roundedMax > 0 ? Math.round((roundedScore / roundedMax) * 1000) / 10 : 0,
    perQuestion,
  };
}