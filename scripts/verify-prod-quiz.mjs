import { chromium, expect } from '@playwright/test';

/**
 * Production check for the quiz maker and the sheet reader.
 *
 * Read-only by design. The scan is detected, scored and shown with its student
 * control, but nothing is saved, so verifying the deploy does not write another
 * grade into the demo data. Persistence was already proven directly against the
 * live database.
 */

const BASE = 'https://liko-jcuadys-projects.vercel.app';

const results = [];
const errors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

// 1. The public site is not sitting behind a login wall.
const landing = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
check('landing responds 200', landing?.status() === 200, `status ${landing?.status()}`);

// 2. Sign in against live Supabase.
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
const consent = page.getByRole('button', { name: /Follow my system|Keep my choice/i }).first();
if (await consent.count()) await consent.click();
await page.getByLabel('Email').fill('maya@liko.test');
await page.getByLabel('Password').fill('LikoDemo!2026');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/overview/, { timeout: 45_000 });
check('signs in against live Supabase', page.url().includes('/overview'), page.url());

// 3. The assess page offers a selectable assessment with its questions.
await page.goto(`${BASE}/assess`, { waitUntil: 'networkidle' });
const rows = await page.getByRole('button', { name: /weight \d+%/ }).count();
check('the assessment list renders seeded data', rows >= 2, `${rows} assessments`);

const quizRow = page.getByRole('button', { name: /^Bonding Quiz\b/ });
check('the scannable quiz is listed', (await quizRow.count()) === 1);
const badge = await quizRow.innerText();
check('it reports its question count', /8 questions/.test(badge), badge.replace(/\n/g, ' | '));

await quizRow.click();
const detail = page.locator('#assessment-detail');
await detail.waitFor({ state: 'visible', timeout: 20_000 });

// The builder is seeded from the server render, so these are present on first
// paint. Auto-retrying here would hide the very thing this check exists for.
const prompts = detail.getByLabel(/^Question \d+ prompt$/);
await expect(prompts).toHaveCount(8, { timeout: 20_000 });
check(
  'the assessment opens onto its questions with no empty-state flash',
  (await detail.getByText('Add the first question to make this assessment scannable').count()) === 0,
);

const promptValues = await prompts.evaluateAll((nodes) => nodes.map((n) => n.value));
check(
  'questions came from the live database, not fixtures',
  promptValues[0]?.startsWith('Which bond is formed') ?? false,
  promptValues[0] ?? '',
);

const kinds = await detail
  .getByLabel(/^Question \d+ type$/)
  .evaluateAll((nodes) => nodes.map((n) => n.value));
check(
  'both question kinds are present',
  new Set(kinds).size === 2 && kinds.includes('single') && kinds.includes('multiple'),
  [...new Set(kinds)].join(','),
);

// 4. The reader: draw a sheet from a known pattern and check what it reads.
const sheetPng = await page.evaluate(() => {
  const given = [
    ['B'],
    ['A'],
    ['A', 'C'],
    ['B'],
    ['A'],
    ['B'],
    ['B'],
    ['A', 'B', 'D'],
  ];
  const cell = 90;
  const radius = 26;
  const m = 110;
  const canvas = document.createElement('canvas');
  canvas.width = m * 2 + cell * 4;
  canvas.height = m * 2 + cell * given.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 3;
  given.forEach((keys, r) => {
    for (let c = 0; c < 4; c += 1) {
      const cx = m + cell * c + cell / 2;
      const cy = m + cell * r + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (keys.includes(String.fromCharCode(65 + c))) {
        ctx.fillStyle = '#000000';
        ctx.fill();
      }
    }
  });
  return canvas.toDataURL('image/png');
});

await page.setInputFiles('#sheet-file', {
  name: 'sheet.png',
  mimeType: 'image/png',
  buffer: Buffer.from(sheetPng.split(',')[1], 'base64'),
});

await page.getByText('What was read').waitFor({ state: 'visible', timeout: 30_000 });
const score = (await page.getByTestId('scan-score').innerText()).trim();
check('a drawn sheet is read and scored 8 / 11', score === '8 / 11', score);

// 5. A scan cannot be saved without a student.
const saveBtn = page.getByRole('button', { name: /Save result/i });
check('the save control exists once a sheet is read', (await saveBtn.count()) === 1);
check('it is disabled until a student is chosen', await saveBtn.isDisabled());

const studentSelect = page.getByLabel('Whose sheet is this?');
const roster = await studentSelect.locator('option').count();
check('the roster is offered', roster > 1, `${roster - 1} students`);
await studentSelect.selectOption({ index: 1 });
check('choosing a student enables saving', await saveBtn.isEnabled());

// 6. The gradebook still renders after the grid change.
await page.goto(`${BASE}/grades`, { waitUntil: 'networkidle' });
const gradebookText = await page.locator('#workspace-main').innerText();
check('gradebook renders seeded students', gradebookText.includes('Ana Ferreira'), '');
const scrolled = await page.evaluate(() => {
  const doc = document.documentElement;
  return doc.scrollWidth - doc.clientWidth;
});
check('gradebook does not push the page sideways', scrolled <= 1, `${scrolled}px of overflow`);

check('no console errors anywhere in the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(', '));
  process.exit(1);
}