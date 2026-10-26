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

/**
 * Whether something is gone, given a moment to.
 *
 * Radix unmounts an open listbox asynchronously, so a control that WAS closing
 * still answers a synchronous count in that instant. Deciding "it did not
 * close" from a count is asking a question the DOM cannot answer yet.
 */
async function detached(locator, timeout = 10_000) {
  try {
    await locator.first().waitFor({ state: 'detached', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Driving a Radix `Select`.
 *
 * THE DASHBOARD MOVED FROM NATIVE `<select>` TO RADIX, AND THIS SCRIPT DID NOT
 * FOLLOW. IT WAS BROKEN FROM THE DAY THE CONTROL CHANGED, AND NOTHING SAID SO.
 *
 * It used to read `locator('option')` and drive `selectOption()`. Both are
 * gone: a Radix select is a `button[role=combobox]` plus a listbox that only
 * exists while it is open, and Radix keeps each option's value in React
 * context rather than in the DOM. So `locator('option')` finds nothing and
 * `inputValue()` throws "Node is not an <input>, <textarea> or <select>
 * element", which is what this script reported when it was last run against
 * the deployed site.
 *
 * The e2e suite solved the same problem in `e2e/helpers/select.ts` and its own
 * specs pass, but this script is not part of that suite, so nothing in the
 * suite ever exercised it and the only thing that noticed was a human
 * re-running a check nobody was running. The helpers below are the same
 * mechanism written for a script that is not a Playwright test.
 *
 * THE POINT IS NOT THAT IT NOW PASSES. The point is that a check nobody runs
 * is a claim with no witness, and a claim with no witness rots silently. It
 * rotted here for nine days and the only reason it was found is that it was
 * re-run by hand.
 */
const SELECT_CONTENT = '[data-slot="select-content"]';
const SELECT_ITEM = '[data-slot="select-item"]';

async function openSelect(trigger) {
  await trigger.click();
  const content = page.locator(SELECT_CONTENT);
  const opened = await settles(content, 10_000);
  if (!opened) {
    throw new Error('the select did not open when its trigger was clicked');
  }
  return content;
}

async function closeSelect(content) {
  await page.keyboard.press('Escape');
  await detached(content, 5_000);
}

/** Every option's visible label, read without changing the selection. */
async function optionLabels(trigger) {
  const content = await openSelect(trigger);
  const items = content.locator(SELECT_ITEM);
  const count = await items.count();
  const labels = [];
  for (let index = 0; index < count; index += 1) {
    labels.push((await items.nth(index).innerText()).trim());
  }
  await closeSelect(content);
  return labels;
}

/** The stored slug currently selected, read from the checked item. */
async function chosenValue(trigger) {
  const content = await openSelect(trigger);
  const checked = content.locator(`${SELECT_ITEM}[data-state="checked"]`);
  const count = await checked.count();
  const value = count === 1 ? await checked.getAttribute('data-value') : null;
  await closeSelect(content);
  return value ?? '';
}

/**
 * Choose the option stored as `value`, the way a teacher does.
 *
 * Fails naming the slug that was not found, because "no option stored as gwa"
 * is the difference between a stale slug and a renamed value in the app.
 */
async function chooseOption(trigger, value) {
  const content = await openSelect(trigger);
  const option = content.locator(`${SELECT_ITEM}[data-value="${value}"]`);

  if ((await option.count()) === 0) {
    const offered = await optionLabels(trigger);
    throw new Error(
      `the select offers no option stored as "${value}"; it offers ${offered.join(', ')}`,
    );
  }

  await option.click();

  /*
   * A LOST POINTERDOWN FALLBACK.
   *
   * Radix SelectItem primes a per-instance ref on `pointerdown` and selects on
   * `pointerup` only if that ref reads "mouse", and the ref starts as the
   * string "touch". If the item's node is replaced between the two events the
   * pointerup lands on a fresh instance, nothing selects, and the control stays
   * open indefinitely. This is a defence against a verified mechanism, not a
   * fix for a confirmed cause: `e2e/helpers/select.spec.ts` proves both halves
   * of it directly. The assertion afterwards is unchanged, so a fallback that
   * closed the list without selecting anything still fails.
   */
  if (!(await detached(page.locator(SELECT_CONTENT), 5_000))) {
    const retry = page.locator(`${SELECT_CONTENT} ${SELECT_ITEM}[data-value="${value}"]`);
    if ((await retry.count()) > 0) {
      await retry.focus({ timeout: 5_000 });
      await page.keyboard.press('Enter');
    }
  }

  const closed = await detached(page.locator(SELECT_CONTENT), 10_000);
  if (!closed) {
    throw new Error('the select stayed open after choosing an option');
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

  const options = await optionLabels(weight);
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
  const stored = await chosenValue(weight);
  const target = stored === 'bold' ? 'medium' : 'bold';
  await chooseOption(weight, target);

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