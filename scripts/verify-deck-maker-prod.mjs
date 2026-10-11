/**
 * The deck maker, checked on the deployed site rather than on a laptop.
 *
 * WHY THIS IS A SEPARATE SCRIPT AND NOT PART OF THE E2E SUITE. The suite runs
 * against a local production build, which proves the code. This proves the
 * deployment: the environment variables that exist only on the Vercel project,
 * the Supabase tables that exist only in the live database, and the provider key
 * that is, at the time of writing, deliberately absent.
 *
 * WHY IT REPORTS THE GENERATOR'S STATE INSTEAD OF ASSERTING IT IS READY. The
 * point of this run is to find out what production says, and a script that
 * asserted "configured" would fail on the answer and tell nobody what the
 * answer was. It asserts that the panel is HONEST: it must either offer
 * generation or say plainly that it cannot, and it must never show a key.
 *
 * Run with: `node scripts/verify-deck-maker-prod.mjs`
 */

import { chromium } from '@playwright/test';

const BASE = process.env.LIKO_PROD ?? 'https://liko-jcuadys-projects.vercel.app';
const TEACHER = { email: 'maya@liko.test', password: 'LikoDemo!2026' };

let passed = 0;
let failed = 0;
const notes = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${label}${detail ? `  ${detail}` : ''}`);
}

/**
 * Whether something becomes visible, given a moment to.
 *
 * `locator.isVisible()` answers immediately and never retries, so on a page that
 * is still hydrating it reports a panel that is plainly there as missing. That
 * is how this script first failed three checks against a working deployment.
 */
async function settles(locator, timeout = 20_000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

try {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(TEACHER.email);
  await page.getByLabel(/password/i).fill(TEACHER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/overview', { timeout: 60_000 });
  check('signed in against the live database', true);

  // ---------------------------------------------------------------- the panel
  await page.goto(`${BASE}/slides`);

  check(
    'the deck generator is on the slides page',
    await settles(page.getByRole('heading', { name: 'Make a deck from a description' })),
  );

  /*
   * WHAT THE DEPLOYMENT ACTUALLY SAYS, AND THE TWO HONEST BRANCHES.
   *
   * The panel either offers generation or says plainly that it cannot, and the
   * meter only exists in the first case: it is a bar showing how much of an
   * allowance is left, and an allowance nobody has is not drawn. Asserting the
   * meter unconditionally would fail on a deployment that is correctly telling
   * the truth, which is the opposite of what this run is for.
   *
   * The status is waited out first. "Checking what is left" is what the panel
   * says while it is asking the server, and reading the state during that
   * window reports neither a meter nor a refusal.
   */
  const checking = page.getByText('Checking what is left');
  await checking
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {});

  const meter = page.getByRole('progressbar', { name: /generations used/i });
  const meterShown = await settles(meter, 5_000);
  const notConfigured = await settles(
    page.getByText(/Not configured on this deployment/),
    5_000,
  );

  const statusLine = (await page.locator('[role="status"]').allInnerTexts()).join(' | ');
  notes.push(`generator status on production: ${statusLine.trim() || '(empty)'}`);

  check(
    'the panel is honest about the generator: a meter, or a plain refusal',
    meterShown !== notConfigured && (meterShown || statusLine.trim().length > 0),
    `meter=${meterShown} notConfigured=${notConfigured} status=${statusLine.trim()}`,
  );

  if (meterShown) {
    const used = await meter.getAttribute('aria-valuenow');
    const max = await meter.getAttribute('aria-valuemax');
    check(
      'the meter carries a real allowance',
      Number.isFinite(Number(used)) && Number.isFinite(Number(max)) && Number(max) > 0,
      `now=${used} max=${max}`,
    );
  }

  if (notConfigured) {
    /*
     * Only ever said when this run actually SAW the refusal. An earlier version
     * printed this note whenever the meter was absent, which meant a run that
     * had simply asked too early claimed to know why.
     */
    notes.push(
      'this deployment reports the generator as not configured, so no provider key is set on it',
    );
  }

  const html = await page.content();
  check('no provider key is present in the rendered page', !/AIza[0-9A-Za-z_-]{10,}/.test(html));
  check('no provider key variable name is present', !/GEMINI_API_KEY/.test(html));

  // -------------------------------------------------------------- the editor
  /*
   * A deck is created here rather than opened from the list, because the live
   * database this deployment points at has no seeded decks and a check that
   * depends on seed data fails for a reason that has nothing to do with the
   * editor. Creating one also proves the path a real teacher takes.
   */
  let deckLink = page.locator('a[href^="/slides/"]').first();
  if ((await deckLink.count()) === 0) {
    notes.push('the live database has no seeded decks, so this run created one');
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByLabel('Title').fill('Verification deck');
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.waitForURL(/\/slides\/[^/]+$/, { timeout: 60_000 });
    check('a deck can be created and opens straight into its editor', true);
  } else {
    await deckLink.click();
    await page.waitForURL(/\/slides\/[^/]+$/, { timeout: 60_000 });
    check('the demo deck is listed and opens', true);
  }

  const canvas = page.locator('[data-slide-canvas]:not([aria-hidden="true"])').first();
  check('the stage renders a slide', await settles(canvas));

  const elements = canvas.locator('[data-slide-element]');
  check('the slide is drawn from elements', (await elements.count()) > 0);

  // Selecting an element is the whole edit path, and it is the thing that was
  // broken for every slide written before elements existed.
  await elements.first().click();
  const weight = page.getByLabel('Weight');
  check('selecting an element opens its typography controls', await settles(weight));

  const options = await weight.locator('option').allInnerTexts();
  check(
    'weight is a closed set a teacher can choose from',
    options.length > 0 && options.every((text) => text.trim().length > 0),
    options.join(', '),
  );

  // Change it and read the rendered result, which is the property that matters.
  /*
   * A DIFFERENT WEIGHT FROM THE ONE ALREADY STORED.
   *
   * This runs against a deck that persists between runs, so whatever weight the
   * last run left is the weight this one starts from. Asking for "bold" every
   * time means the second run onwards asks for what is already there: the
   * rendered slide does not move, the poll times out, and the reload check
   * compares 700 with 700 and reports success for a change that never happened.
   */
  const text = elements.first().locator('p, ul').first();
  const before = await text.evaluate((node) => getComputedStyle(node).fontWeight);
  const stored = await weight.inputValue();
  const target = stored === 'bold' ? 'medium' : 'bold';
  await weight.selectOption(target);

  const expected = target === 'bold' ? '700' : '500';
  let after = before;
  for (let attempt = 0; attempt < 25 && after !== expected; attempt += 1) {
    await page.waitForTimeout(150);
    after = await text.evaluate((node) => getComputedStyle(node).fontWeight);
  }
  check(
    'changing the weight changes the rendered slide',
    after === expected,
    `${before} -> ${after}, expected ${expected}`,
  );

  /*
   * Waited for, not sampled. The panel debounces for 700ms and then writes to
   * a server action on a production deployment, so the rendered weight moves
   * long before the write lands. Asking about the save before the save is the
   * one moment its answer is not yet true.
   */
  check(
    'the editor says when the autosave landed',
    await settles(page.getByText('Changes saved.'), 30_000),
  );

  // And the saved value has to be the saved value, after a reload.
  await page.reload();
  await settles(canvas);
  const reloaded = await page
    .locator('[data-slide-canvas]:not([aria-hidden="true"])')
    .first()
    .locator('[data-slide-element]')
    .first()
    .locator('p, ul')
    .first()
    .evaluate((node) => getComputedStyle(node).fontWeight);
  check('the weight survived a reload on the live database', reloaded === expected, `${expected} -> ${reloaded}`);

  // ---------------------------------------------------------------- the file
  check('a file can be brought into the deck', await settles(page.getByLabel('Choose a file')));
  const hint = await page.locator('#deck-asset-file-hint').innerText();
  check(
    'the accepted formats are stated on the page',
    /PDF/i.test(hint) && /MB/i.test(hint),
    hint,
  );

  // ------------------------------------------------------------- phone width
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('the editor fits a phone without horizontal overflow', overflow <= 1, `overflow=${overflow}`);

  check('no browser console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' / '));
} catch (error) {
  failed += 1;
  console.log(`FAIL  the run threw before finishing: ${error.message}`);
} finally {
  await browser.close();
}

console.log('');
for (const note of notes) console.log(`note  ${note}`);
console.log('');
console.log(`${passed} passed, ${failed} failed`);

/*
 * `process.exitCode` rather than `process.exit()`. Undici still holds a socket
 * when the browser closes, and exiting mid-close makes libuv assert, which turns
 * a green run into a non-zero exit for a reason that has nothing to do with the
 * result.
 */
process.exitCode = failed === 0 ? 0 : 1;