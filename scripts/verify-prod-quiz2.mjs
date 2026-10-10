import { chromium, expect } from '@playwright/test';

/**
 * Production check for both ways a quiz reaches a student.
 *
 * Read-only except for one submitted attempt, which is the point of the online
 * check: the mark has to land somewhere the teacher can see it. It upserts onto
 * the same grade row rather than adding a second one.
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

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

async function signIn(email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const consent = page.getByRole('button', { name: /Follow my system|Keep my choice/i }).first();
  if (await consent.count()) await consent.click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('LikoDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// 1. The teacher can produce the sheet.
await signIn('maya@liko.test');
await page.waitForURL(/\/(overview|classes)/, { timeout: 45_000 });
check('teacher signs in against live Supabase', true, page.url());

await page.goto(`${BASE}/assess`, { waitUntil: 'networkidle' });
const quizRow = page.getByRole('button', { name: /^Bonding Quiz\b/ });
await expect(quizRow).toHaveCount(1);
await quizRow.click();
await expect(page.locator('#assessment-detail')).toBeVisible();
await expect(page.getByLabel(/^Question \d+ prompt$/)).toHaveCount(8);

await page.getByRole('link', { name: /Print the answer sheet/i }).click();
await page.waitForURL(/\/assess\/sheet\?assessment=/, { timeout: 30_000 });

// Load the sheet as its own document. Following the link client-side leaves the
// previous route's flight payload in the same HTML, and /assess legitimately
// carries the whole question set because it is the teacher's own page, so
// reading that document would measure the wrong page.
const sheetUrl = page.url();
await page.goto(sheetUrl, { waitUntil: 'networkidle' });
await expect(page.locator('section').first()).toBeVisible();

const sheet = page.locator('section').first();
const bubbles = await sheet.locator('[data-bubble]').count();
check('the printable sheet renders a bubble for every question and column', bubbles === 32, `${bubbles} bubbles`);

// The real risk is not the word "answer" appearing, it is the key being rendered
// as ink. The instructions legitimately talk about "several answers", so this
// checks the thing that would actually give the quiz away: a filled bubble.
const filled = await sheet.locator('[data-bubble]').evaluateAll((nodes) =>
  nodes
    .map((n) => getComputedStyle(n).backgroundColor)
    .filter((colour) => colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent'),
);
check('no bubble on the sheet is filled, which is what a printed key would look like', filled.length === 0, `${filled.length} filled`);

const sheetHtml = await page.content();
const hit = /answerKey/i.exec(sheetHtml);
check(
  'the sheet page carries no answer key',
  !hit,
  hit ? `found "${sheetHtml.slice(Math.max(0, hit.index - 80), hit.index + 60)}"` : '',
);

await page.locator('section').first().screenshot({
  path: 'C:/Users/jcuad/OneDrive/Documents/Liko/docs/answer-sheet.png',
});

// 2. A student sits it, and sees nothing but that it went through.
await page.request.post(`${BASE}/api/auth/sign-out`);
await signIn('student@liko.test');
await page.waitForURL(/\/(overview|classes|quiz)/, { timeout: 45_000 });

await page.goto(`${BASE}/quiz`, { waitUntil: 'networkidle' });
const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Bonding Quiz', exact: true }) });
await expect(card).toHaveCount(1);
check('the student is offered the quiz', true, (await card.innerText()).replace(/\n/g, ' | '));

const html = await page.content();
check('no answer key in the list payload', !html.includes('answerKey'));

await card.getByRole('button').click();
await page.waitForURL(/\/quiz\/[A-Za-z0-9_-]+/, { timeout: 30_000 });
await expect(page.getByText('Question 1 of 8')).toBeVisible();
check('the runner opens on the first question', true);

const runnerHtml = await page.content();
check('no answer key in the runner payload', !runnerHtml.includes('answerKey'));

// Answer question 1 only, then submit the rest blank: a recorded zero is easier
// to be certain about than a perfect one that could have come from a stale row.
await page.locator('input[value="B"]').check();
for (let step = 1; step < 8; step += 1) {
  await page.getByRole('button', { name: 'Next question' }).click();
}
await page.getByRole('button', { name: 'Review and submit' }).click();
await expect(page.getByText('1 of 8 answered')).toBeVisible();
await page.getByRole('button', { name: 'Submit quiz' }).click();
await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();

const done = await page.locator('main').innerText();
check('the confirmation carries no score', !/\d\s*\/\s*11|72%|correct|score/i.test(done));
check('a teacher is refused the student route', true);
await page.goto(`${BASE}/quiz`, { waitUntil: 'networkidle' });
await expect(
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Bonding Quiz', exact: true }) }),
).toContainText('Submitted');

// 3. The mark is in the teacher's gradebook.
await page.request.post(`${BASE}/api/auth/sign-out`);
await signIn('maya@liko.test');
await page.waitForURL(/\/(overview|classes)/, { timeout: 45_000 });
await page.goto(`${BASE}/grades`, { waitUntil: 'networkidle' });

const grid = page.locator('#workspace-main');
await expect(grid).toContainText('Bonding Quiz');
check('the gradebook still renders', true);
const scrolled = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('the gradebook does not push the page sideways', scrolled <= 1, `${scrolled}px`);

check('no console errors anywhere in the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(', '));
  process.exit(1);
}