/**
 * Registration, end to end, on the deployed site.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT PART OF `pnpm e2e`. The suite runs against
 * fixture data, where an account is verified at creation because an in-memory
 * map cannot send mail. Supabase mode is the opposite: the account is created
 * and a confirmation link is emailed. Those are different code paths for the same
 * form, and the one that matters to a real teacher is the second.
 *
 * It stayed broken for a long time for a specific reason. `scripts/seed.mjs`
 * creates its accounts through `auth.admin.createUser`, which sends no email, so
 * every test passed while nobody could register through the form at all.
 *
 * So this registers a real account against the real database, and then signs in
 * with the password again from a clean context. The second half matters more than
 * the first: an account that can be created but not signed back into is not an
 * account anybody can use.
 *
 * Run with: `node scripts/verify-signup-prod.mjs`
 */

import { chromium } from '@playwright/test';

const BASE = process.env.LIKO_PROD ?? 'https://liko-jcuadys-projects.vercel.app';

/** Unique per run, because registering the same address twice must fail. */
const stamp = Date.now().toString(36);
const ACCOUNT = {
  name: 'Signup Check',
  email: `signup-check-${stamp}@example.com`,
  password: 'LikoCheck!2026x',
};

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${label}${detail ? `  ${detail}` : ''}`);
}

async function settle(locator, timeout = 30_000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function fillRegisterForm(page) {
  await page.getByLabel('Full name').fill(ACCOUNT.name);
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password').fill(ACCOUNT.password);
  await page.locator('input[name="acceptedTerms"]').check();
  await page.locator('input[name="acceptedPrivacy"]').check();
  await page.getByRole('button', { name: /create workspace/i }).click();
}

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // ---------------------------------------------------------------- the promise
  await page.goto(`${BASE}/register`);
  await settle(page.getByRole('button', { name: /create workspace/i }));

  /*
   * The form must not say it will email a verification link when it will not.
   * Read BEFORE registering, because after registering the page has moved on.
   */
  const registerCopy = await page.locator('main').innerText();
  const promisesAnEmail = /verification link/i.test(registerCopy);
  const saysNothingToWait = /workspace opens as soon as/i.test(registerCopy);
  check(
    'the register form describes what actually happens next',
    promisesAnEmail !== saysNothingToWait,
    `promises an email=${promisesAnEmail} says no wait=${saysNothingToWait}`,
  );

  // ------------------------------------------------------------------- register
  await fillRegisterForm(page);

  await page.waitForURL(/\/(verify-email|welcome|overview|plan|classes)/, { timeout: 60_000 });
  const landed = new URL(page.url()).pathname;
  check(
    'a new account is not parked on the confirmation page',
    landed !== '/verify-email',
    `landed on ${landed}`,
  );

  // ------------------------------------------------- the workspace really opens
  check(
    'the workspace opens for the account that was just created',
    await settle(page.getByRole('link', { name: /^overview$/i }), 45_000),
    `url ${page.url().replace(BASE, '')}`,
  );

  // ------------------------------------------------------------- and the profile
  await page.goto(`${BASE}/settings/profile`);
  const profile = await settle(page.getByRole('heading', { level: 1 }), 45_000);
  if (profile) {
    const text = await page.locator('main').innerText();
    check('the profile belongs to the account that registered', text.includes(ACCOUNT.email));
  } else {
    check('the profile page opens for the new account', false, 'no heading rendered');
  }

  // ------------------------------------------- and the password really works
  /*
   * A second browser context, so there is no session carried over from the
   * registration above. This is the half that matters: an account that can be
   * created and not signed into is not an account anybody can use.
   */
  const second = await browser.newContext();
  const fresh = await second.newPage();
  await fresh.goto(`${BASE}/login`);
  await fresh.getByLabel('Email').fill(ACCOUNT.email);
  await fresh.getByLabel(/password/i).fill(ACCOUNT.password);
  await fresh.getByRole('button', { name: /sign in/i }).click();

  const signedIn = await settle(fresh.getByRole('link', { name: /^overview$/i }), 45_000);
  check(
    'the same password signs the account back in from a clean session',
    signedIn || /\/overview/.test(fresh.url()),
    `url ${fresh.url().replace(BASE, '')}`,
  );
  await second.close();

  console.log(`\nnote  registered ${ACCOUNT.email} on ${BASE}`);
} catch (error) {
  failed += 1;
  console.log(`FAIL  the run threw before finishing: ${error.message}`);
} finally {
  await browser.close();
}

console.log('');
console.log(`${passed} passed, ${failed} failed`);

/*
 * `process.exitCode` rather than `process.exit()`. Undici still holds a socket
 * when the browser closes, and exiting mid-close makes libuv assert, which turns
 * a green run into a crash for a reason that has nothing to do with the result.
 */
process.exitCode = failed === 0 ? 0 : 1;