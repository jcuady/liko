import { expect, test, type Page } from '@playwright/test';

import { chooseOption, optionEntries } from './helpers/select';

/**
 * The quiz maker and the sheet reader.
 *
 * An assessment used to be a title, a weight and a maximum. It could be created,
 * weighted and reported on, and there was nothing to sit the quiz, nothing to
 * mark against and nothing to scan. These tests exist because that gap was
 * invisible: every other screen kept working the whole time.
 *
 * The sheet is drawn in the browser from an answer pattern chosen before the
 * detector runs, and the expected score is worked out from the stored key by
 * hand in `expectedScore()`. Nothing here asks the scanner what it thinks it
 * read, so a scanner that returned the right number for the wrong reason would
 * still fail these tests.
 */

const KEY = [
  ['B'],
  ['B'],
  ['A', 'C'],
  ['B'],
  ['A', 'B'],
  ['B'],
  ['B'],
  ['A', 'B', 'D'],
];
const POINTS = [1, 1, 2, 1, 2, 1, 1, 2];

/** What this student actually put on the sheet. */
const GIVEN = [
  ['B'],
  ['A'],
  ['A', 'C'],
  ['B'],
  ['A'],
  ['B'],
  ['B'],
  ['A', 'B', 'D'],
];

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

function expectedScore(): { score: number; max: number } {
  return {
    score: KEY.reduce((sum, key, i) => sum + (sameSet(key, GIVEN[i]!) ? POINTS[i]! : 0), 0),
    max: POINTS.reduce((a, b) => a + b, 0),
  };
}

async function signIn(page: Page) {
  await page.goto('/login');
  const consent = page.getByRole('button', { name: /Follow my system|Keep my choice/i }).first();
  if (await consent.count()) {
    await consent.click();
  }
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill('LikoDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/overview/, { timeout: 30_000 });
}

/**
 * The code this student's sheet carries, zero-based per group.
 *
 * Two groups of six, which is what the demo quiz prints. `[0][3]` is student
 * number 4, and the roster is sorted by name, so that is Dmitri Volkov.
 */
const CODE = [0, 3];
const CODE_GROUPS = 2;
const CODE_PER_GROUP = 6;

/**
 * Draws a bubble sheet with the marks in `given` and returns it as a PNG file.
 *
 * THE CODE BLOCK IS PART OF THE SHEET, NOT A SEPARATE CASE. The demo quiz prints
 * one, so the scan screen expects one, and a sheet without it is refused rather
 * than read. That refusal is correct behaviour, and it means a synthetic sheet
 * that omitted the block would be testing a page state a teacher can no longer
 * reach.
 *
 * The between-digit gap is 2.4 times the inside gap, which is what the printed
 * sheet does and comfortably clear of the 1.6x the reader splits on.
 */
async function drawSheet(page: Page, given: string[][], code: number[] = CODE) {
  const dataUrl = await page.evaluate(
    ({ marks, code, codeGroups, codePerGroup }) => {
      const rows = marks.length;
      const cols = 4;
      const cell = 90;
      const radius = 26;
      const mx = 110;
      const my = 110;

      /*
       * The code block, sized as its own population.
       *
       * Answer bubbles are 53px across. The code bubbles are smaller, which the
       * detector allows down to 45% of the dominant size, but they must stay
       * ABOVE `minSide`, which on a canvas this wide is about 37px. A code bubble
       * of 35px is rejected outright and the block vanishes rather than reading,
       * which is why this is 19 rather than the 15 that would fit the canvas.
       *
       * The canvas is then widened to hold the block. It does not have to be the
       * same width as the answer grid; leaving it narrower drew twelve bubbles
       * into an area that only had room for five, which reads as a block the
       * student partly filled in.
       */
      const codeRadius = 19;
      const codeCell = 54;
      const codeBetween = codeCell * 1.4;
      const codeWidth =
        codeGroups * codePerGroup * codeCell + (codeGroups - 1) * codeBetween;

      const drawBubble = (cx: number, cy: number, r: number, filled: boolean) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        if (filled) {
          ctx.fillStyle = '#000000';
          ctx.fill();
          ctx.fillStyle = '#111111';
        }
      };

      const codeCy = 70;
      const idBand = 130;
      const gridTop = my + idBand;

      const width = Math.ceil(Math.max(mx * 2 + cell * cols, mx + codeWidth + codeCell + mx));
      const height = gridTop + cell * rows + my;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 3;

      let cx = mx + codeRadius;
      for (let g = 0; g < codeGroups; g++) {
        for (let k = 0; k < codePerGroup; k++) {
          if (g > 0 && k === 0) cx += codeBetween;
          drawBubble(Math.round(cx), codeCy, codeRadius, code[g] === k);
          cx += codeCell;
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          drawBubble(
            mx + cell * c + cell / 2,
            gridTop + cell * r + cell / 2,
            radius,
            marks[r]!.includes(c),
          );
        }
      }
      return canvas.toDataURL('image/png');
    },
    {
      marks: given.map((keys) => keys.map((k) => k.charCodeAt(0) - 65)),
      code,
      codeGroups: CODE_GROUPS,
      codePerGroup: CODE_PER_GROUP,
    },
  );

  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/*
 * Both are anchored, and that matters more than it looks.
 *
 * The demo class holds "Unit 3 Quiz: Bonding" as well as "Bonding Quiz", so an
 * unanchored `/Bonding Quiz/i` matches both and `.first()` quietly opens the
 * empty one. The suite then failed on a 45 second locator timeout rather than on
 * the thing it meant to check, because the empty assessment correctly refuses to
 * offer a scan. An anchor is the whole difference between a wrong row and a
 * missing element.
 */
const SCANNABLE = /^Bonding Quiz\b/;
const EMPTY = /^Unit 3 Quiz\b/i;
const STOICHIOMETRY = /^Stoichiometry\b/i;

/** Opens one assessment and waits for the pane it fills in to actually arrive. */
async function openAssessment(page: Page, title: RegExp) {
  await page.getByRole('button', { name: title }).click();
  await expect(page.locator('#assessment-detail')).toBeVisible();
}

test.describe('the quiz maker', () => {
  test('an assessment opens onto the questions it has, not onto nothing', async ({ page }) => {
    await signIn(page);
    await page.goto('/assess');

    await openAssessment(page, SCANNABLE);

    const detail = page.locator('#assessment-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Questions');
    // `.first()` because every question also carries screen-reader labels that
    // begin "Question 1", and the heading is the one meant here.
    await expect(page.getByText('Question 1', { exact: true }).first()).toBeVisible();
    // Both kinds have to be present, because they are marked by different rules
    // and a builder that only ever produced one of them would be untested on
    // the other half of the feature. The kind is a per-question Radix select, so
    // it is read from the closed trigger, which shows only the kind that
    // question currently holds. Reading the listbox instead would prove nothing,
    // because every question's listbox offers both labels whether or not that
    // question is a multiple select.
    const kinds = await page.getByLabel(/^Question \d+ type$/).allInnerTexts();

    expect([...new Set(kinds.map((text) => text.trim()))].sort()).toEqual([
      'Multiple select',
      'Single choice',
    ]);
  });

  test('a question can be written, answered and saved', async ({ page }) => {
    await signIn(page);
    await page.goto('/assess');
    // The demo assessment with no questions on it, so the count this test
    // asserts is one it decided rather than one it inherited.
    await openAssessment(page, EMPTY);

    await page.getByRole('button', { name: /Add question/i }).click();

    await page.getByLabel('Question 1 prompt').fill('What is the valency of Group 2?');
    await page.getByLabel('Option A for question 1').fill('One');
    await page.getByLabel('Option B for question 1').fill('Two');
    await page.getByLabel('Option C for question 1').fill('Three');
    await page.getByLabel('Option D for question 1').fill('Seven');

    // Mark B correct. The key is what the sheet is read against, so an
    // unanswered question is the one state that must not reach the database.
    await page.getByRole('button', { name: 'Mark option B as the correct answer' }).click();

    await page.getByRole('button', { name: /Save 1 questions/i }).click();
    await expect(page.getByText(/1 question saved/i)).toBeVisible();

    // And it survived the round trip rather than only living in local state.
    await page.reload();
    await openAssessment(page, EMPTY);
    await expect(page.getByLabel('Question 1 prompt')).toHaveValue(
      'What is the valency of Group 2?',
    );
  });

  test('an assessment with no questions says so instead of offering a scan', async ({ page }) => {
    await signIn(page);
    await page.goto('/assess');
    await openAssessment(page, STOICHIOMETRY);

    await expect(page.locator('#assessment-detail')).toContainText(/Add at least one question/i);
  });
});

test.describe('reading a marked sheet', () => {
  test('a drawn sheet is read, checked, assigned and saved', async ({ page }) => {
    const { score, max } = expectedScore();
    await signIn(page);
    await page.goto('/assess');
    await openAssessment(page, SCANNABLE);

    const sheet = await drawSheet(page, GIVEN);
    await page.setInputFiles('#sheet-file', {
      name: 'sheet.png',
      mimeType: 'image/png',
      buffer: sheet,
    });

    // The grid appears for correction before anything is written. A scanner that
    // saved straight to the gradebook could put a wrong mark on a real child.
    await expect(page.getByText('What was read')).toBeVisible();
    await expect(page.getByText('Whose sheet is this?')).toBeVisible();
    await expect(page.getByTestId('scan-score')).toHaveText(`${score} / ${max}`);

    /*
     * THE CODE PICKED THE STUDENT. Code [0][3] of two groups of six is student
     * number 4, and the roster is sorted by name, so this is Dmitri Volkov. This
     * is the whole point of the block: nobody chose anything, the sheet said who
     * it was, and the mark is still saved only after the teacher confirms it.
     */
    const preSelected = page.getByLabel('Whose sheet is this?');
    // Two separate assertions, because they fail differently. The placeholder is
    // gone means a student was picked at all; the name means the code picked the
    // right one. Collapsing them into one would hide which half broke.
    await expect(preSelected).not.toHaveText('Choose a student');
    await expect(preSelected).toHaveText('Dmitri Volkov');
    await expect(page.getByText(/Code 03 on the sheet picked this/)).toBeVisible();

    // The roster is read from the open listbox because a closed Radix select has
    // no option elements in the DOM, and the teacher is moved off the automatic
    // pick to prove the corrected selection is the one that gets saved.
    const roster = await optionEntries(page, preSelected);
    const studentName = roster[1].label;
    await chooseOption(page, preSelected, roster[1].value);
    await expect(preSelected).toHaveText(studentName);

    await page.getByRole('button', { name: /Save result/i }).click();
    await expect(page.getByText(new RegExp(`${score} out of ${max} recorded`))).toBeVisible();

    // And it is in the gradebook, not just in a toast.
    await page.goto('/grades');
    await expect(page.locator('#workspace-main')).toContainText(studentName);
  });

  test('a teacher can correct a misread mark before it is saved', async ({ page }) => {
    const { score, max } = expectedScore();
    await signIn(page);
    await page.goto('/assess');
    await openAssessment(page, SCANNABLE);

    const sheet = await drawSheet(page, GIVEN);
    await page.setInputFiles('#sheet-file', {
      name: 'sheet.png',
      mimeType: 'image/png',
      buffer: sheet,
    });
    await expect(page.getByText('What was read')).toBeVisible();

    // Question 2 was answered A and is wrong. Marking it correct makes the
    // sheet right and the score must move by exactly that question's points.
    const corrected = score + 1;
    await page.getByRole('button', { name: /Question 2, option B/ }).click();
    await page.getByRole('button', { name: /Question 2, option A/ }).click();
    await expect(page.getByTestId('scan-score')).toHaveText(`${corrected} / ${max}`);
  });

  test('an image with no bubbles is refused rather than saved as a blank sheet', async ({ page }) => {
    await signIn(page);
    await page.goto('/assess');
    await openAssessment(page, SCANNABLE);

    const blank = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, 400, 400);
      return canvas.toDataURL('image/png');
    });

    await page.setInputFiles('#sheet-file', {
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: Buffer.from(blank.split(',')[1]!, 'base64'),
    });

    await expect(page.getByText(/No answer bubbles were found/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Save result/i })).toHaveCount(0);
  });
});