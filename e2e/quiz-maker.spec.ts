import { expect, test, type Page } from '@playwright/test';

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

/** Draws a bubble sheet with the marks in `given` and returns it as a PNG file. */
async function drawSheet(page: Page, given: string[][]) {
  const dataUrl = await page.evaluate((marks) => {
    const rows = marks.length;
    const cols = 4;
    const cell = 90;
    const radius = 26;
    const mx = 110;
    const my = 110;
    const width = mx * 2 + cell * cols;
    const height = my * 2 + cell * rows;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = mx + cell * c + cell / 2;
        const cy = my + cell * r + cell / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (marks[r]!.includes(c)) {
          ctx.fillStyle = '#000000';
          ctx.fill();
        }
      }
    }
    return canvas.toDataURL('image/png');
  }, given.map((keys) => keys.map((k) => k.charCodeAt(0) - 65)));

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
    // the other half of the feature. The kind is a per-question select, so read
    // the values: the option text is on every question's dropdown whether or not
    // that question is a multiple select, and asserting on it proves nothing.
    const kinds = await page
      .getByLabel(/^Question \d+ type$/)
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).value));

    expect([...new Set(kinds)].sort()).toEqual(['multiple', 'single']);
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

    const student = await page.getByLabel('Whose sheet is this?').locator('option').nth(1);
    const studentName = (await student.innerText()).trim();
    await page.getByLabel('Whose sheet is this?').selectOption(await student.getAttribute('value'));

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