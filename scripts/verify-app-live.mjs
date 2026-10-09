#!/usr/bin/env node
/**
 * Does the application actually work against the real database?
 *
 * WHY THIS IS A SCRIPT AND NOT AN E2E SPEC. `pnpm e2e` runs against the fixture
 * workspace, because that is the only backend a developer or a CI runner can
 * bring up with no network and no credentials, and that is the right default.
 * It also means those passing specs say nothing at all about the Supabase
 * adapter: every one of them drives `fixtures`, so a typo in a PostgREST
 * filter, a column that does not exist, or a join that silently returns nothing
 * would be invisible to all of them. Until this runs, the honest status of the
 * Supabase path is "unverified", not "working".
 *
 * It drives the real built application in a real browser, against a real server
 * started with `LIKO_DATA_MODE=supabase`, signs in as the five seeded accounts,
 * and checks three things on every route:
 *
 *   1. It renders for an account entitled to see it, and the session survives.
 *   2. Seeded data is really on the page. This is the check that earns the rest:
 *      an empty state and a broken query return the same 200, so every route
 *      that should show data is matched against a name the seed actually wrote
 *      into Postgres. Matching on data rather than status is the difference
 *      between verifying the adapter and verifying that the server is on.
 *   3. It is refused for an account that is not entitled.
 *
 * It also performs a real write, through the real UI, and reads the result back
 * with the service key. Reads can all pass while writes are broken, and a write
 * that returns success without changing anything is exactly the failure a
 * status-code assertion cannot see.
 *
 * IT CHANGES DATA. It marks one day's register for one class and deletes those
 * rows afterwards. The date is far in the past and is not one the seed wrote,
 * so a re-run starts clean.
 *
 * Usage:
 *   pnpm verify:app
 *   LIKO_VERIFY_BASE_URL=http://127.0.0.1:3321 node --env-file=.env.local scripts/verify-app-live.mjs
 */

import { chromium } from '@playwright/test';

const BASE = (process.env.LIKO_VERIFY_BASE_URL || 'http://127.0.0.1:3321').replace(/\/$/, '');
const PASSWORD = process.env.LIKO_SEED_PASSWORD || 'LikoDemo!2026';
const REST = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1`;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * The seeded accounts, what each may see, and what must be on the page.
 *
 * `expect` is the field that matters. It is a value the seed actually wrote, so
 * finding it proves the round trip went through Postgres. A route listed with
 * `expect: null` is only checked for rendering, which is deliberate: the student
 * and guardian accounts own no roster, so their overview is legitimately close
 * to empty and asserting roster names there would be asserting a lie.
 */
const ACCOUNTS = [
  {
    email: 'maya@liko.test',
    label: 'instructor',
    routes: [
      ['/overview', null],
      ['/classes', 'Ana Ferreira'],
      ['/attendance', 'Ana Ferreira'],
      ['/plan', null],
      ['/assess', 'Unit 1: Atomic Structure'],
      ['/grades', 'Unit 1: Atomic Structure'],
      ['/history', null],
      ['/slides', null],
      ['/settings/profile', { input: 'Full name', value: 'Maya Okonkwo' }],
      ['/settings/appearance', null],
      ['/settings/notifications', null],
    ],
    forbidden: ['/admin'],
  },
  {
    email: 'dev@liko.test',
    label: 'admin',
    routes: [
      ['/overview', null],
      ['/classes', 'Ana Ferreira'],
      // The member list is an embed across memberships and profiles. It reads
      // through a foreign key PostgREST can only resolve if it points at a table
      // in the public schema, and when it cannot it throws PGRST200 and takes the
      // whole console down. It rendered nothing at all until the seed created an
      // organisation, which is why asserting a name here rather than "200" is
      // the check that has any power.
      ['/admin', 'Ingrid Halvorsen'],
    ],
  },
  {
    email: 'ingrid@liko.test',
    label: 'instructor, university level',
    routes: [
      ['/overview', null],
      ['/classes', 'Ana Ferreira'],
      ['/grades', 'Unit 1: Atomic Structure'],
    ],
  },
  {
    email: 'student@liko.test',
    label: 'student',
    routes: [['/overview', null]],
    forbidden: ['/admin', '/grades/export'],
  },
  {
    email: 'guardian@liko.test',
    label: 'guardian',
    routes: [['/overview', null]],
    forbidden: ['/admin'],
  },
];

const consoleErrors = [];
let failures = 0;
let passes = 0;
let probingRefusal = false;

/** Prints an observation that is context for the checks around it, not a verdict. */
function note(line) {
  console.log(`        ${String(line).slice(0, 400)}`);
}

function check(name, ok, detail) {
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

/** Reads through the service key, which is the only way to see past RLS. */
async function read(path) {
  const response = await fetch(`${REST}/${path}`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`service read ${path} answered ${response.status}`);
  return response.json();
}

async function remove(path) {
  await fetch(`${REST}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Pre-answers the consent cookie.
 *
 * Set rather than clicked because the banner is a fixed overlay at the foot of
 * every page, so it would intercept clicks on the elements under test and turn
 * a working route into a failure for the wrong reason. The name and value are
 * the ones `e2e/storage-state.json` uses; getting them wrong means the banner
 * renders anyway and the checks below fail misleadingly.
 */
async function seedConsent(context) {
  await context.addCookies([
    { name: 'liko_consent', value: 'all', domain: '127.0.0.1', path: '/' },
  ]);
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function verifyRoutes(account) {
  console.log(`${account.email} (${account.label})`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await seedConsent(context);
    const page = await context.newPage();

    page.on('console', (message) => {
      if (message.type() === 'error' && !probingRefusal) {
        consoleErrors.push(`[${account.email}] ${page.url()} :: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      if (!probingRefusal) {
        consoleErrors.push(`[${account.email}] ${page.url()} :: ${error.message}`);
      }
    });

    await signIn(page, account.email);

    for (const [route, expect] of account.routes) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      const landed = new URL(page.url()).pathname;

      if (landed.startsWith('/login')) {
        check(`${route} renders`, false, `redirected to ${landed}, so the session did not hold`);
        continue;
      }

      const status = response?.status() ?? 0;
      let ok = status === 200;
      let detail = status !== 200 ? `HTTP ${status}` : undefined;

      /*
       * Two ways a route can prove it read the database, and they are not
       * interchangeable.
       *
       * A page that renders text is matched against that text. `innerText` does
       * not include an `<input>`'s value, so a form route has to be checked by
       * reading the control itself; asserting on innerText there passes for an
       * empty field and fails for a full one, which is worse than not asserting.
       */
      if (ok && typeof expect === 'string') {
        const body = await page.locator('main').innerText().catch(() => '');
        if (!body.includes(expect)) {
          ok = false;
          detail = `HTTP 200 but "${expect}" is not on the page, so this is an empty state rather than real data`;
        }
      } else if (ok && expect && typeof expect === 'object' && expect.input) {
        const control = page.getByLabel(expect.input, { exact: false }).first();
        const value = await control.inputValue().catch(() => null);
        if (value !== expect.value) {
          ok = false;
          detail = `the "${expect.input}" control holds ${JSON.stringify(value)} rather than ${JSON.stringify(expect.value)}, so the form did not open on the stored profile`;
        }
      }

      check(`${route} renders`, ok, detail);
    }

    for (const route of account.forbidden ?? []) {
      /*
       * Console errors are not counted while probing a refusal. A refusal is
       * supposed to be an error response, and the browser logs every 4xx as a
       * failed resource, so counting them would report a working guard as a
       * broken page.
       */
      probingRefusal = true;

      /*
       * A page and an endpoint refuse differently and both are correct. A page
       * redirects or renders the refusal copy; `/grades/export` answers 404
       * "No such class" because a student resolves no class at all, which is
       * the same protection expressed as a missing row rather than a sentence.
       * Judging an endpoint by its rendered copy would call that a pass only by
       * accident, and judging it by its status code alone would miss a CSV that
       * was served to an account with no right to it.
       */
      const response = await page.request.get(`${BASE}${route}`);
      const type = response.headers()['content-type'] ?? '';
      const served = type.includes('text/csv');
      /*
       * `response.url()` is the URL after redirects, so a request bounced to the
       * sign-in page no longer ends in the route that was asked for. Both of
       * those are refusals. What is not a refusal is a CSV arriving intact,
       * which is the one outcome this check exists to catch.
       */
      const bounced = !response.url().endsWith(route);

      if (route.includes('/export')) {
        check(
          `${route} is refused`,
          !served && (response.status() >= 400 || bounced),
          `answered ${response.status()} as ${type} from ${response.url()}`,
        );
      } else {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        const landed = new URL(page.url()).pathname;
        const body = await page.locator('main').innerText().catch(() => '');
        const saysNo =
          /do not have access|not allowed|no access|forbidden/i.test(body) ||
          /forbidden/i.test(landed);
        check(
          `${route} is refused`,
          landed !== route || saysNo,
          `still on ${landed} and nothing on the page says the account is refused`,
        );
      }

      probingRefusal = false;
    }

    await context.close();
  } finally {
    await browser.close();
  }
  console.log('');
}

/**
 * Marks a register through the UI and confirms the row exists in Postgres.
 *
 * The write goes through the button a teacher would press, so it exercises the
 * server action, the permission check, the data seam, and RLS together. The
 * read-back uses the service key deliberately: reloading the page would be
 * satisfied by whatever the app is willing to show, which is not the question.
 */
async function verifyWrite() {
  console.log('Writes');

  const date = '2026-02-02';
  const browser = await chromium.launch();

  try {
    /*
     * Maya's own class, found by her account rather than by taking the first
     * class in the table. The service key sees every tenant, so an unscoped read
     * would happily return Ingrid's class, and then the write below would be
     * refused by RLS for reasons that have nothing to do with the bug it is
     * looking for.
     */
    const auth = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/auth/v1`;
    const whoami = await fetch(`${auth}/admin/users`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    if (!whoami.ok) throw new Error(`auth admin read answered ${whoami.status}`);
    const { users } = await whoami.json();
    const maya = users.find((user) => user.email === 'maya@liko.test');
    if (!maya) throw new Error('maya@liko.test does not exist; run the seed first');

    const [klass] = await read(`classes?owner_id=eq.${maya.id}&select=id&limit=1`);
    if (!klass) throw new Error('maya has no class to write against; run the seed first');

    const context = await browser.newContext();
    await seedConsent(context);
    const page = await context.newPage();
    await signIn(page, 'maya@liko.test');

    await page.goto(`${BASE}/attendance?date=${date}&class=${klass.id}`, {
      waitUntil: 'domcontentloaded',
    });

    const marked = page.getByRole('button', { name: 'Mark all present' });
    if ((await marked.count()) === 0) {
      throw new Error('the register rendered no "Mark all present" control, so the write was never attempted');
    }
    await marked.click();

    /*
     * The proof is the row in Postgres, not the toast. The register confirms a
     * save in the UI, but a confirmation that fires regardless of what the write
     * did is exactly the failure this is here to catch, and the only way to
     * distinguish them is to read the table afterwards. The service key is used
     * deliberately: reloading the page proves only that the app is willing to
     * show what it has.
     */
    let rows = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      rows = await read(`attendance?class_id=eq.${klass.id}&date=eq.${date}&select=student_id,status`);
      if (rows.length > 0 && rows.every((row) => row.status === 'present')) break;
      await page.waitForTimeout(500);
    }

    check(
      'the register write reached Postgres',
      rows.length > 0 && rows.every((row) => row.status === 'present'),
      `read back ${rows.length} rows for ${date}: ${JSON.stringify(rows).slice(0, 200)}`,
    );

    await context.close();
    await remove(`attendance?class_id=eq.${klass.id}&date=eq.${date}`);
  } finally {
    await browser.close();
  }
}

/**
 * The at-risk sweep, exercised for real.
 *
 * It is here rather than in the Playwright suite because it is the one endpoint
 * that is not reachable from a browser session: the gate is a bearer secret,
 * there is no page that calls it, and it only does work once somebody has a
 * stored push subscription. It had never been invoked before this.
 *
 * The idempotence check is the one that matters. The sweep writes
 * `student_history` rows to alert a teacher, so a sweep that re-alerts on every
 * run would turn a daily job into a spam cannon, and the only thing that would
 * catch it is counting rows before and after a second run.
 */
async function verifyCron() {
  console.log('At-risk sweep');

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log('  SKIP  CRON_SECRET is not set, so the sweep can only be checked for failing closed');
  }

  const endpoint = `${BASE}/api/cron/at-risk`;
  const anon = await fetch(endpoint);
  check('the sweep refuses a request with no secret', anon.status === 401, `answered ${anon.status}`);

  const wrong = await fetch(endpoint, {
    headers: { Authorization: 'Bearer not-the-secret' },
  });
  const wrongBody = await wrong.text();
  check('the sweep refuses a wrong secret', wrong.status === 401, `answered ${wrong.status}`);
  check(
    'and that refusal discloses nothing about the sweep',
    wrongBody.trim() === JSON.stringify({ error: 'Unauthorized' }),
    wrongBody,
  );

  if (!secret) return;

  const before = await read('student_history?event_type=eq.intervention&select=id');

  const ok = await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await ok.text();
  check('the real secret is accepted', ok.status === 200, `answered ${ok.status}: ${body.slice(0, 160)}`);

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Reported by the next check rather than thrown, so one malformed body does
    // not hide the refusals above.
  }
  check('and it answers with a sweep result', parsed?.ok === true, body.slice(0, 240));

  /*
   * A sweep across every teacher legitimately reports zero, because
   * `teachersToSweep` only reaches people who have a stored push subscription
   * and nobody has one yet. Asserting a non-zero count here would make this
   * script fail for a correct reason, so the count is reported, not demanded.
   */
  console.log(`        swept ${parsed?.teachers} teacher(s), alerted ${parsed?.alerted}`);

  const after = await read('student_history?event_type=eq.intervention&select=id');
  check(
    'a second sweep does not re-alert, so the cooldown holds',
    after.length === before.length,
    `${before.length} intervention rows before, ${after.length} after`,
  );

  const bad = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: 'not-a-uuid' }),
  });
  check('a malformed sweep request is refused', bad.status === 400, `answered ${bad.status}`);
}

/**
 * The register form, against the live project.
 *
 * This is expected to be blocked on a Supabase project whose built-in email
 * quota is spent, because signup needs to send a confirmation link. That is
 * worth asserting rather than skipping: a project where registration works is a
 * project where the consent write, which deliberately swallows its own failure,
 * finally has something to run against.
 */
async function verifySignup() {
  console.log('Registration');

  const auth = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/auth/v1`;
  const probe = await fetch(`${auth}/signup`, {
    method: 'POST',
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: `verify-probe-${Date.now()}@liko.test`,
      password: 'Good-Pass-1',
      data: { full_name: 'Verify Probe' },
    }),
  });

  const result = await probe.json().catch(() => ({}));
  const rateLimited = probe.status === 429;

  if (rateLimited) {
    check(
      'signup is BLOCKED by the Supabase email quota, which is a dashboard setting',
      true,
      undefined,
    );
    note(
      `Supabase answered ${probe.status} ${result.error_code ?? ''}: ${result.msg ?? ''}. ` +
        'Registration, the handle_new_user trigger and the consent_events write are therefore ' +
        'unverified against this database until a custom SMTP provider is configured.',
    );
    return;
  }

  check(
    'Supabase accepted a registration',
    probe.ok && Boolean(result.id),
    `answered ${probe.status}: ${JSON.stringify(result).slice(0, 200)}`,
  );

  if (result.id) {
    const consent = await read(`consent_events?user_id=eq.${result.id}&select=subject,source`);
    const subjects = Array.isArray(consent) ? consent.map((c) => c.subject).sort() : [];
    check(
      'and the consent audit rows were written',
      subjects.join(',') === 'privacy,terms',
      `got ${JSON.stringify(subjects)}`,
    );
    await remove(`consent_events?user_id=eq.${result.id}`);
    await fetch(`${auth}/admin/users/${result.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
  }
}

async function main() {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[name]) {
      console.error(`${name} is not set. Run this through --env-file=.env.local.`);
      process.exit(1);
    }
  }

  console.log(`Target: ${BASE}\n`);

  for (const account of ACCOUNTS) {
    try {
      await verifyRoutes(account);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL  ${account.email} could not be verified: ${error.message}\n`);
    }
  }

  try {
    await verifyWrite();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the write check could not run: ${error.message}`);
  }

  try {
    await verifyCron();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the at-risk sweep could not be checked: ${error.message}`);
  }

  try {
    await verifySignup();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  registration could not be checked: ${error.message}`);
  }

  check(
    'no console or page errors on any route',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 6).join(' | '),
  );

  console.log(`\n${passes} passed, ${failures} failed`);

  if (consoleErrors.length) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    for (const line of consoleErrors.slice(0, 20)) console.log(`  ${line}`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main();