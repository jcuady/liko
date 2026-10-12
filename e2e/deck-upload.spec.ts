import { expect, test, type Page } from '@playwright/test';

import { optionEntries, optionLabels } from './helpers/select';

/**
 * Bringing a real file into a real deck.
 *
 * WHY THIS FILE EXISTS AND WHY IT BUILDS ITS OWN PDF. `extract.test.ts` proves
 * the extractor reads a PDF, but it runs the library under Node. The app runs
 * it inside a webpack server bundle, and that is a different piece of machinery:
 * `unpdf` reaches for `import.meta`, which webpack reports on at build time and
 * which a unit test never touches. A parser that passes 18 tests under Node and
 * throws on the first real upload is exactly the failure this file is here to
 * catch, and it can only be caught by uploading through the page.
 *
 * WHY THE WORD COUNT IS THE ASSERTION. A success message that merely says
 * "imported" would pass on a stub, on an empty string, and on a parser that
 * returned the right shape and no words. The count is written here by hand into
 * the fixture, so an exact match can only come from the bytes coming back out of
 * the document.
 *
 * WHY THE REFUSALS ARE IN THE SAME FILE. The picker filters by `accept`, which
 * is a hint a person can edit in devtools. What proves the server is doing its
 * own checking is a file the browser was willing to hand over and the action
 * still refused.
 */

const TEACHER = { email: 'maya@liko.test', password: 'LikoDemo!2026' };

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEACHER.email);
  await page.getByLabel(/password/i).fill(TEACHER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/overview');
}

/**
 * Builds a one page PDF with a real cross-reference table.
 *
 * Written rather than checked in as a fixture for the reason the unit test
 * writes its own: a PDF is a list of numbered objects at byte offsets, and a
 * hand-built one shows exactly what was handed to the parser. Offsets are
 * padded to ten digits because that is what a real table looks like, and a
 * parser given a broken table falls back to scanning the file for objects.
 */
function buildPdf(stream: string): Buffer {
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(encoder.encode(pdf));
}

/** Each line drawn as its own text object, which is how a page of prose is made. */
function pdfWithText(...lines: string[]): Buffer {
  const commands = lines
    .map((line, index) => `BT /F1 12 Tf 40 ${340 - index * 24} Td (${line}) Tj ET`)
    .join('\n');
  return buildPdf(commands);
}

/** One transparent pixel, so an image import has real bytes to store. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * THE PANEL'S OWN REFUSAL, not the route announcer.
 *
 * Next.js puts a `role="alert"` live region on every route so a screen reader
 * hears the new page's title. An unfiltered `getByRole('alert')` therefore
 * matches that first, and a test asserting on it fails with the page title as
 * the received text, which says nothing about the upload.
 */
function REFUSAL(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

test.describe('bringing a file into a deck', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
    // Matched on the href shape rather than on position: the sidebar's first
    // link is Overview, and clicking it walks away from the deck.
    await page.locator('a[href^="/slides/"]').first().click();
    await page.waitForURL(/\/slides\/[^/]+$/);
  });

  test('reads a real PDF through the running server', async ({ page }) => {
    /*
     * Nine words, written out here on purpose so the count in the success line
     * is a claim about the parser and not a tautology about the message.
     */
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'enzymes.pdf',
      mimeType: 'application/pdf',
      buffer: pdfWithText('Enzymes speed up reactions', 'They lower the activation energy'),
    });

    await page.getByRole('button', { name: 'Import' }).click();

    await expect(page.getByText('enzymes.pdf imported. 9 words ready to turn into slides.')).toBeVisible();
  });

  test('keeps an image as an image and offers it on the slide', async ({ page }) => {
    const picker = page.getByLabel('Image', { exact: true });
    await expect(picker).toBeVisible();
    const before = (await optionEntries(page, picker)).length;

    await page.getByLabel('Choose a file').setInputFiles({
      name: 'leaf-cell.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await page.getByRole('button', { name: 'Import' }).click();

    await expect(page.getByText('leaf-cell.png uploaded. It is ready to place on a slide.')).toBeVisible();

    // The proof that the bytes were stored and not merely accepted: the deck's
    // own image picker has gained the file it just uploaded. The listbox only
    // exists while the picker is open, so each poll opens and reads it again
    // rather than holding a snapshot of a listbox that has since unmounted.
    await expect
      .poll(async () => (await optionEntries(page, picker)).length)
      .toBe(before + 1);
    const uploaded = (await optionLabels(page, picker)).filter((label) =>
      label.includes('leaf-cell.png'),
    );
    expect(uploaded).toHaveLength(1);
  });

  test('a scanned PDF is refused in words rather than imported empty', async ({ page }) => {
    /*
     * A valid PDF whose page draws nothing. This is what a scan looks like to a
     * text extractor, and the outcome that matters is that the teacher is told,
     * because an import that reports success and yields no words is the one
     * they have no way to diagnose themselves.
     */
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'worksheet-scan.pdf',
      mimeType: 'application/pdf',
      buffer: buildPdf(''),
    });
    await page.getByRole('button', { name: 'Import' }).click();

    await expect(REFUSAL(page)).toContainText(/scan/i);
  });

  test('a file the app cannot read is refused on the server', async ({ page }) => {
    /*
     * `setInputFiles` does not respect the accept attribute, which is exactly
     * the point: this is what the browser would hand over if somebody edited
     * the filter in devtools, and the refusal has to come from the server.
     */
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'installer.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ not really an executable'),
    });
    await page.getByRole('button', { name: 'Import' }).click();

    await expect(REFUSAL(page)).toContainText('LIKO cannot read "installer.exe"');
  });
});