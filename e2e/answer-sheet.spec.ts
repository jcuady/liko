import { expect, test, type Page } from '@playwright/test';

import { scanSheet } from '../src/lib/omr/omr';

/**
 * The sheet the product prints must be the sheet the product can read.
 *
 * The scanner was built and proven against synthetic sheets drawn on a canvas.
 * A printed layout is a different artifact with different typography, different
 * ink and a different aspect ratio, and none of that was ever measured against
 * the detector that has to read it. This closes the loop: it opens the real print
 * route, shades a known set of bubbles the way a pencil would, photographs the
 * page at print resolution, and runs the real detector over those pixels.
 *
 * If the prompt text ever grows large enough to clear the detector's minimum
 * shape, it becomes a phantom bubble and every mark shifts. Nothing else in the
 * suite would notice, because nothing else reads a printed page.
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

/** What this student put on the sheet, keyed by column letter. */
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

const LETTER = (key: string) => key.charCodeAt(0) - 65;

async function signIn(page: Page) {
  await page.goto('/login');
  const consent = page.getByRole('button', { name: /Follow my system|Keep my choice/i }).first();
  if (await consent.count()) await consent.click();
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill('LikoDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/overview/, { timeout: 30_000 });
}

/** Opens the print route for the scannable quiz and returns the sheet element. */
async function openSheet(page: Page) {
  await signIn(page);
  await page.goto('/assess');
  await page.getByRole('button', { name: /^Bonding Quiz\b/ }).first().click();
  await expect(page.locator('#assessment-detail')).toBeVisible();

  await page.getByRole('link', { name: /Print the answer sheet/i }).click();
  await page.waitForURL(/\/assess\/sheet\?assessment=/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Bonding Quiz' })).toBeVisible();

  return page.locator('section').first();
}

test.describe('the printed sheet', () => {
  test('is laid out so the detector finds the grid it was promised', async ({ page }) => {
    const sheet = await openSheet(page);

    // Empty sheet first: this is the harder case, because every bubble is an
    // outline and there is no ink anywhere but the print.
    const blank = await sheet.screenshot({ type: 'png', scale: 'device' });

    const decoded = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));

      // The same normalisation the scan screen applies before it reads.
      const maxEdge = 1400;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height).data;

      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < frame.length; i += 4, p += 1) {
        gray[p] = (frame[i]! * 299 + frame[i + 1]! * 587 + frame[i + 2]! * 114) / 1000;
      }

      // Base64 rather than a number array: a full page is hundreds of thousands
      // of values, and shipping them as JSON over the test bridge is slow enough
      // to read as a hang.
      let binary = '';
      for (let i = 0; i < gray.length; i += 1) binary += String.fromCharCode(gray[i]!);
      return { data: btoa(binary), width, height };
    }, blank.toString('base64'));

    const gray = new Uint8Array(Buffer.from(decoded.data, 'base64'));
    const read = scanSheet(gray, decoded.width, decoded.height);

    expect(read.rows, 'one row per question').toBe(KEY.length);
    expect(read.cols, 'one column per option').toBe(4);
  });

  test('reads the marks a student actually made', async ({ page }) => {
    const sheet = await openSheet(page);

    // Shade what the student filled in. A pencil mark is ink inside the circle,
    // so a filled background is the honest simulation: same bounding box, more
    // ink, which is exactly the difference `marked` measures.
    await sheet.evaluate((root, marks) => {
      for (const [row, keys] of marks.entries()) {
        for (const key of keys) {
          const bubble = root.querySelector<HTMLElement>(`[data-bubble="0-${row}-${key}"]`);
          if (!bubble) throw new Error(`no bubble for row ${row} column ${key}`);
          bubble.style.background = '#000000';
        }
      }
    }, GIVEN.map((keys) => keys.map(LETTER)));

    const shot = await sheet.screenshot({ type: 'png', scale: 'device' });

    const decoded = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const maxEdge = 1400;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height).data;
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < frame.length; i += 4, p += 1) {
        gray[p] = (frame[i]! * 299 + frame[i + 1]! * 587 + frame[i + 2]! * 114) / 1000;
      }
      let binary = '';
      for (let i = 0; i < gray.length; i += 1) binary += String.fromCharCode(gray[i]!);
      return { data: btoa(binary), width, height };
    }, shot.toString('base64'));

    const gray = new Uint8Array(Buffer.from(decoded.data, 'base64'));
    const read = scanSheet(gray, decoded.width, decoded.height);

    expect(read.rows, 'one row per question').toBe(KEY.length);
    expect(read.cols, 'one column per option').toBe(4);

    // What it read, against what was drawn. Nothing here asks the scanner what
    // it thinks it saw.
    const keys = ['A', 'B', 'C', 'D'];
    const readMarks = read.bubbles.map((row) =>
      row.filter((bubble) => bubble.marked).map((bubble) => keys[bubble.col]),
    );

    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join() === [...b].sort().join();

    readMarks.forEach((mark, index) => {
      expect(same(mark, GIVEN[index]!), `question ${index + 1}`).toBe(true);
    });
  });
});