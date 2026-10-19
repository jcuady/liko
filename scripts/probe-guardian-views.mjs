/**
 * What a parent actually SEES, which is not what `pnpm verify:app` measures.
 *
 * WHY THIS FILE EXISTS. `verify:app` signs a guardian in and asserts that
 * `/overview` renders and that `/admin` is refused. It does not visit `/grades`
 * or `/history` for that role at all. Those two assertions are satisfied by a
 * guardian whose every page is empty, which is precisely the state this product
 * spent round nine and round ten in: a role that renders perfectly and
 * demonstrates nothing. "Rendered" and "showed the child's marks" are different
 * questions, and only one of them is answered by a 200.
 *
 * So this drives the two pages a linked account is granted and reports what is
 * ON them. The empty-state phrasings are listed explicitly rather than inferred,
 * because the failure being guarded against is precisely an absence that looks
 * like a success.
 *
 * Usage:
 *   pnpm build
 *   $env:LIKO_DATA_MODE='supabase'; pnpm exec next start -p 3321
 *   LIKO_VERIFY_BASE_URL=http://127.0.0.1:3321 node --env-file=.env.local scripts/probe-guardian-views.mjs
 */
import { chromium } from '@playwright/test';

const BASE = (process.env.LIKO_VERIFY_BASE_URL || 'http://127.0.0.1:3321').replace(/\/$/, '');
const PASSWORD = process.env.LIKO_SEED_PASSWORD || 'LikoDemo!2026';

/** The child the seed links to the guardian seat, from `scripts/seed.mjs`. */
const CHILD = 'Ben Osei';

/**
 * The assessment Ben Osei's mark belongs to, read out of the live database
 * rather than remembered. Measured: `guardian@liko.test` resolves to Ben Osei,
 * whose single grade row (52/100) sits on this assessment.
 *
 * WHY A WITNESS STRING AND NOT A LIST OF PHRASES THAT MUST NOT APPEAR. The
 * first version of this file blacklisted empty-state phrasings ("no students",
 * "no marks", ...) and reported `/grades` as EMPTY. It was wrong, and the
 * product was fine: the gradebook always renders the explanatory sentence "A
 * student with no marks yet has no total rather than a zero", which contains
 * the blacklisted phrase whether or not any mark exists. A check built on
 * absence matches prose, and prose is always there.
 *
 * So this asserts on PRESENCE of a seeded value instead: the child's name, and
 * the title of the assessment his mark is on. Both are written by the seed and
 * cannot appear by accident, so the page can only satisfy them by having
 * actually loaded his record.
 */
const CHILD_ASSESSMENT = 'Unit 1: Atomic Structure';

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

let failures = 0;
let passes = 0;

function check(name, ok, detail) {
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${String(detail).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'liko_consent', value: 'all', domain: '127.0.0.1', path: '/' },
  ]);
  const page = await context.newPage();

  console.log(`Target: ${BASE}\n`);
  console.log('guardian@liko.test (guardian)\n');

  await signIn(page, 'guardian@liko.test');

  for (const route of ['/grades', '/history']) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await settle(page);

    const landed = new URL(page.url()).pathname;
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

    console.log(`  ${route} -> ${landed} (HTTP ${response?.status()})`);

    check(
      `${route} is reachable by a guardian, not refused`,
      landed === route && (response?.status() ?? 0) < 400,
      `landed on ${landed} with HTTP ${response?.status()}`,
    );

    const namesChild = text.includes(CHILD);
    check(
      `${route} names the child the seat is linked to`,
      namesChild,
      namesChild ? '' : `the page never shows ${CHILD}. Sample: ${text.slice(0, 300)}`,
    );

    /*
     * Only `/grades` is expected to carry the assessment. `/history` shows the
     * child's events and has no assessment on it, so asking it for one would be
     * a check that can never pass and would train the reader to ignore this file.
     */
    if (route === '/grades') {
      const showsMark = text.includes(CHILD_ASSESSMENT);
      check(
        '/grades renders the assessment the child\'s mark belongs to',
        showsMark,
        showsMark
          ? ''
          : `the page never shows ${JSON.stringify(CHILD_ASSESSMENT)}. The seed holds a mark for ${CHILD} on ` +
            `that assessment, so an empty gradebook here is a denial, not an absence of data. Sample: ` +
            text.slice(0, 300),
      );
    }
  }

  await browser.close();

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});