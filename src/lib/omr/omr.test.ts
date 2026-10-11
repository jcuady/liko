import { describe, expect, it } from 'vitest';

import { answersFromSheet, formatIdCode, idToStudentNumber, otsuThreshold, scanSheet, scoreAnswers, studentNumberToDigits } from './omr';
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

/**
 * The student's code block.
 *
 * These tests draw the block, shade it, and then hold the detector against what
 * was drawn. The failure that matters here is not a crash: it is a code read off
 * the sheet that belongs to a different child, or an answer grid quietly shifted
 * by a row that was not an answer row. Every expectation below is a literal.
 */
describe('the printed code block', () => {
  const ANSWERS = {
    rows: 8,
    cols: 4,
    marked: marksFromChoices(8, 4, { 0: [1], 1: [3], 2: [0, 2], 3: [2], 4: [], 5: [1, 2, 3], 6: [0], 7: [3] }),
  };

  it('reads the shaded code and leaves every answer exactly where it was', () => {
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { groups: 2, perGroup: 6, digits: [3, 1] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 2, perGroup: 6 } });

    expect(sheet.idMissing).toBe(false);
    expect(sheet.id?.wellFormed).toBe(true);
    expect(sheet.id?.digits).toEqual([3, 1]);
    expect(formatIdCode(sheet.id)).toBe('31');
    // 3 * 6 + 1 + 1: codes are zero-based, student numbers are not.
    expect(idToStudentNumber(sheet.id)).toBe(20);

    // The point of taking the block out before columns are inferred.
    expect(sheet.rows).toBe(8);
    expect(sheet.cols).toBe(4);
    expect(sheet.bubbles.map((row) => row.map((b) => b.marked))).toEqual(ANSWERS.marked);
  });

  it('refuses a sheet that was printed without the block it was promised', () => {
    const { gray, width, height } = renderSheet(ANSWERS);

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 2, perGroup: 6 } });

    expect(sheet.idMissing).toBe(true);
    expect(sheet.rows).toBe(0);
    expect(formatIdCode(sheet.id)).toBeNull();
  });

  it('refuses rather than reading the answers when the block is the wrong size', () => {
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { groups: 2, perGroup: 6, digits: [3, 1] },
    });

    // Printed 2 x 6, told to look for 3 x 6. Nothing reads as that shape.
    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 3, perGroup: 6 } });

    expect(sheet.idMissing).toBe(true);
    expect(sheet.rows).toBe(0);
  });

  it('takes the code row and not an answer row when the two are the same width', () => {
    // Two digits of two is four bubbles, and so is a four-option answer row.
    const shape = { groups: 2, perGroup: 2 };
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { ...shape, digits: [1, 0] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: shape });

    expect(sheet.id?.digits).toEqual([1, 0]);
    expect(sheet.rows).toBe(8);
    expect(sheet.cols).toBe(4);
    expect(sheet.bubbles.map((row) => row.map((b) => b.marked))).toEqual(ANSWERS.marked);
  });

  it('leaves the answers alone when a same-width block cannot be read', () => {
    // Same collision as above, but the block is unreadable. Nothing may be
    // removed on a guess: taking a row out here would shift every answer.
    const shape = { groups: 2, perGroup: 2 };
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { ...shape, digits: [0, 1] },
      noiseBlobs: [],
    });

    // Asked for a shape that no row reads as, while answer rows are 4 wide.
    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 4, perGroup: 1 } });

    expect(sheet.idMissing).toBe(true);
    expect(sheet.rows).toBe(0);
  });

  it('reads a digit with two bubbles shaded as nothing rather than as one of them', () => {
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { groups: 2, perGroup: 6, digits: [[2, 4], 1] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 2, perGroup: 6 } });

    // The block itself was read; the student behind it is not known.
    expect(sheet.id?.wellFormed).toBe(true);
    expect(sheet.id?.digits).toEqual([null, 1]);
    expect(formatIdCode(sheet.id)).toBeNull();
    expect(idToStudentNumber(sheet.id)).toBeNull();
  });

  it('reads a digit with nothing shaded as nothing rather than as the first code', () => {
    const { gray, width, height } = renderSheet({
      ...ANSWERS,
      idBlock: { groups: 2, perGroup: 6, digits: [null, 1] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 2, perGroup: 6 } });

    expect(sheet.id?.digits).toEqual([null, 1]);
    expect(idToStudentNumber(sheet.id)).toBeNull();
  });

  it('carries a three-digit code without borrowing a digit', () => {
    const { gray, width, height } = renderSheet({
      rows: 4,
      cols: 4,
      marked: marksFromChoices(4, 4, { 0: [0] }),
      idBlock: { groups: 3, perGroup: 4, digits: [2, 3, 1] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 3, perGroup: 4 } });

    expect(sheet.id?.digits).toEqual([2, 3, 1]);
    expect(formatIdCode(sheet.id)).toBe('231');
    expect(idToStudentNumber(sheet.id)).toBe(2 * 16 + 3 * 4 + 1 + 1);
  });

  it('reports no block at all for a sheet the teacher never printed one on', () => {
    const { gray, width, height } = renderSheet(ANSWERS);

    const sheet = scanSheet(gray, width, height);

    expect(sheet.id).toBeNull();
    expect(sheet.idMissing).toBe(false);
    expect(sheet.rows).toBe(8);
  });

  /*
   * The round trip is the part that puts a mark on a child, so it is asserted
   * both ways. `idToStudentNumber` reading a drawn code to N and
   * `studentNumberToDigits` turning N back into that same code are only correct
   * together, and a change to one that leaves the other alone would still pass a
   * test that only checked a single direction.
   */
  it('round-trips every student number the printed shape can carry', () => {
    const shape = { groups: 2, perGroup: 6 };

    for (let number = 1; number <= shape.groups * shape.perGroup; number++) {
      const digits = studentNumberToDigits(number, shape);
      expect(digits).not.toBeNull();
      expect(digits).toHaveLength(shape.groups);

      // Straight back through the reader's own arithmetic.
      const value =
        digits!.reduce((total, digit) => total * shape.perGroup + digit, 0) + 1;
      expect(value).toBe(number);
    }
  });

  it('reads back exactly the codes it printed, one digit at a time', () => {
    const shape = { groups: 2, perGroup: 8 };

    // Student 1 is the all-zeros corner, which is the case most likely to be
    // confused with an empty digit and silently read as nothing.
    expect(studentNumberToDigits(1, shape)).toEqual([0, 0]);
    expect(studentNumberToDigits(2, shape)).toEqual([0, 1]);
    expect(studentNumberToDigits(9, shape)).toEqual([1, 0]);
    expect(studentNumberToDigits(64, shape)).toEqual([7, 7]);
  });

  it('refuses a student number the printed shape cannot carry', () => {
    const shape = { groups: 2, perGroup: 8 };

    // 65 is one past the end. Wrapping around would give two children the same
    // code, which is the failure this function exists to make impossible.
    expect(studentNumberToDigits(65, shape)).toBeNull();
    expect(studentNumberToDigits(0, shape)).toBeNull();
    expect(studentNumberToDigits(-3, shape)).toBeNull();
  });

  it('survives the real printed geometry end to end for a one-digit block', () => {
    // One digit of eight: the simplest shape, and the one a small class uses.
    const choices = { 0: [2], 1: [0], 2: [3], 3: [1] };
    const { gray, width, height } = renderSheet({
      rows: 4,
      cols: 4,
      marked: marksFromChoices(4, 4, choices),
      idBlock: { groups: 1, perGroup: 8, digits: [5] },
    });

    const sheet = scanSheet(gray, width, height, { idBlock: { groups: 1, perGroup: 8 } });

    expect(sheet.id?.digits).toEqual([5]);
    expect(idToStudentNumber(sheet.id)).toBe(6);
    expect(sheet.rows).toBe(4);
    expect(sheet.bubbles.map((row) => row.map((b) => b.marked))).toEqual(
      marksFromChoices(4, 4, choices),
    );
  });
});