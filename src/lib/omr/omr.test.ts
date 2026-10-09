import { describe, expect, it } from 'vitest';

import { answersFromSheet, otsuThreshold, scanSheet, scoreAnswers } from './omr';
import { marksFromChoices, renderSheet } from './test-sheet';

/**
 * Optical mark recognition.
 *
 * The seam is the pixel buffer in and the read grid out. Nothing here touches a
 * canvas, a file or a browser, because the part that can be wrong in an
 * interesting way is the arithmetic that turns ink into a grid. The browser glue
 * is left to an end-to-end test that has a real image.
 *
 * Every expectation is a literal that was decided before the detector ran. No
 * test recomputes the answer the way the code does, so a test that passes is
 * evidence rather than a tautology.
 */

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

describe('otsuThreshold', () => {
  it('splits a sheet with a clear paper-and-ink separation', () => {
    // 60% light paper, 40% dark ink, so the natural cut sits between them.
    const gray = new Uint8Array(100);
    for (let i = 0; i < 100; i++) gray[i] = i < 60 ? 245 : 40;
    const t = otsuThreshold(gray);
    // The contract is the separation, not a particular number: everything at or
    // below the cut is ink and everything above it is paper.
    expect(40).toBeLessThanOrEqual(t);
    expect(t).toBeLessThan(245);
    const classifiedAsInk = [...gray].filter((v) => v <= t);
    expect(classifiedAsInk).toHaveLength(40);
  });

  it('returns 0 for a blank image rather than dividing by zero', () => {
    expect(otsuThreshold(new Uint8Array(64).fill(255))).toBe(0);
  });
});

describe('scanSheet', () => {
  it('recovers the exact grid a clean sheet was drawn with', () => {
    const spec = {
      rows: 8,
      cols: 4,
      marked: marksFromChoices(8, 4, { 0: [1], 1: [3], 2: [0, 2], 3: [2], 4: [], 5: [1, 2, 3], 6: [0], 7: [3] }),
    };
    const { gray, width, height } = renderSheet(spec);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.rows).toBe(spec.rows);
    expect(sheet.cols).toBe(spec.cols);
    expect(sheet.bubbles.map((row) => row.map((b) => b.marked))).toEqual(spec.marked);
  });

  it('reads a completely unmarked sheet as all-empty, not all-marked', () => {
    const spec = { rows: 5, cols: 4, marked: marksFromChoices(5, 4, {}) };
    const { gray, width, height } = renderSheet(spec);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.bubbles.every((row) => row.every((b) => !b.marked))).toBe(true);
  });

  it('reads a fully shaded sheet as all-marked', () => {
    const spec = { rows: 3, cols: 4, marked: marksFromChoices(3, 4, { 0: [0, 1, 2, 3], 1: [0, 1, 2, 3], 2: [0, 1, 2, 3] }) };
    const { gray, width, height } = renderSheet(spec);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.bubbles.every((row) => row.every((b) => b.marked))).toBe(true);
  });

  it('ignores printed labels that are not bubbles', () => {
    // Long thin rectangles, the shape of a printed word, near the top margin.
    const spec = {
      rows: 6,
      cols: 4,
      marked: marksFromChoices(6, 4, { 1: [2] }),
      noiseBlobs: [
        { x: 80, y: 20, w: 240, h: 9 },
        { x: 80, y: 36, w: 180, h: 9 },
        { x: 300, y: 20, w: 12, h: 70 },
      ],
    };
    const { gray, width, height } = renderSheet(spec);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.rows).toBe(spec.rows);
    expect(sheet.cols).toBe(spec.cols);
    expect(sheet.bubbles[1][2].marked).toBe(true);
  });

  it('survives paper grain without inventing marks', () => {
    const spec = { rows: 6, cols: 4, marked: marksFromChoices(6, 4, { 2: [1] }), grain: 22 };
    const { gray, width, height } = renderSheet(spec);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.rows).toBe(spec.rows);
    expect(sheet.cols).toBe(spec.cols);
    expect(sheet.bubbles[2][1].marked).toBe(true);
    expect(sheet.bubbles.flat().filter((b) => b.marked)).toHaveLength(1);
  });

  it('reports a sheet with no bubbles at all instead of throwing', () => {
    const gray = new Uint8Array(60 * 60).fill(245);
    const sheet = scanSheet(gray, 60, 60);
    expect(sheet.rows).toBe(0);
    expect(sheet.cols).toBe(0);
  });
});

describe('answersFromSheet', () => {
  it('turns marked columns into option keys, one entry per question', () => {
    const spec = { rows: 3, cols: 4, marked: marksFromChoices(3, 4, { 0: [2], 1: [0, 3], 2: [] }) };
    const { gray, width, height } = renderSheet(spec);
    const sheet = scanSheet(gray, width, height);

    const answers = answersFromSheet(sheet, OPTION_KEYS);

    expect(answers).toEqual([
      { questionIndex: 0, optionKeys: ['C'] },
      { questionIndex: 1, optionKeys: ['A', 'D'] },
      { questionIndex: 2, optionKeys: [] },
    ]);
  });

  it('reports an answer the student could not have written, for review', () => {
    const spec = { rows: 2, cols: 4, marked: marksFromChoices(2, 4, { 0: [0, 1, 2, 3] }) };
    const { gray, width, height } = renderSheet(spec);
    const sheet = scanSheet(gray, width, height);

    const answers = answersFromSheet(sheet, OPTION_KEYS);

    expect(answers[0].optionKeys).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('scoreAnswers', () => {
  // `ScorableQuestion` deliberately carries only what marking needs. The prompt
  // and the option text are the builder's business; a scorer that reached for
  // them could not be reused on a question whose wording changed.
  const single = (correct: string, points = 1) => ({
    id: 'q1',
    kind: 'single' as const,
    answerKey: [correct],
    points,
  });

  const multiple = (correct: string[], points = 2) => ({
    id: 'q2',
    kind: 'multiple' as const,
    answerKey: correct,
    points,
  });

  it('awards a single-choice question only on an exact key', () => {
    const result = scoreAnswers([single('B')], [{ questionIndex: 0, optionKeys: ['B'] }]);
    expect(result.perQuestion[0].awarded).toBe(1);
    expect(result.perQuestion[0].correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(1);
  });

  it('takes a single-choice mark off a blank, which is not the same as a wrong answer', () => {
    const result = scoreAnswers([single('B')], [{ questionIndex: 0, optionKeys: [] }]);
    expect(result.perQuestion[0].awarded).toBe(0);
    expect(result.perQuestion[0].correct).toBe(false);
    expect(result.perQuestion[0].blank).toBe(true);
  });

  it('marks two marks on a single-choice question as ambiguous, never as correct', () => {
    const result = scoreAnswers([single('B')], [{ questionIndex: 0, optionKeys: ['A', 'B'] }]);
    expect(result.perQuestion[0].correct).toBe(false);
    expect(result.perQuestion[0].ambiguous).toBe(true);
    expect(result.score).toBe(0);
  });

  it('requires the whole set for a multiple-select question', () => {
    const questions = [multiple(['A', 'C'])];
    const right = scoreAnswers(questions, [{ questionIndex: 0, optionKeys: ['A', 'C'] }]);
    const partial = scoreAnswers(questions, [{ questionIndex: 0, optionKeys: ['A'] }]);
    expect(right.score).toBe(2);
    expect(partial.score).toBe(0);
    expect(partial.perQuestion[0].correct).toBe(false);
  });

  it('ignores the order marks were written in', () => {
    // A three-mark, three-point question, so the assertion can never be
    // satisfied by the two-point helper above.
    const result = scoreAnswers(
      [multiple(['A', 'C', 'D'], 3)],
      [{ questionIndex: 0, optionKeys: ['D', 'A', 'C'] }],
    );
    expect(result.score).toBe(3);
    expect(result.maxScore).toBe(3);
  });

  it('gives a missing sheet entry the same treatment as a blank answer', () => {
    const result = scoreAnswers([single('B')], []);
    expect(result.perQuestion[0].blank).toBe(true);
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(1);
  });

  it('adds up points that are not all worth one', () => {
    const questions = [single('A'), multiple(['B', 'D'])];
    const result = scoreAnswers(questions, [
      { questionIndex: 0, optionKeys: ['A'] },
      { questionIndex: 1, optionKeys: ['B', 'D'] },
    ]);
    expect(result.maxScore).toBe(3);
    expect(result.score).toBe(3);
    expect(result.percentage).toBe(100);
  });

  it('does not divide by zero when nothing has been set', () => {
    const result = scoreAnswers([], []);
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('scores a question the sheet does not contain as blank rather than skipping it', () => {
    const result = scoreAnswers([single('B'), single('C')], [{ questionIndex: 0, optionKeys: ['B'] }]);
    expect(result.perQuestion).toHaveLength(2);
    expect(result.perQuestion[1].blank).toBe(true);
    expect(result.maxScore).toBe(2);
  });
});