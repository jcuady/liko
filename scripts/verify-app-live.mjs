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
 * THE SERVER IS NOT STARTED BY THIS SCRIPT, and running it without one used to
 * report nine failures that all named the product. The comment above said "a real
 * server started with LIKO_DATA_MODE=supabase" in a way that read like this file
 * starts it. It does not, and `page.goto` answers `ERR_CONNECTION_REFUSED` for
 * every account, which is indistinguishable from a broken app if the reader does
 * not already know. Start one first, or set `LIKO_VERIFY_BASE_URL`:
 *
 *   pnpm build
 *   $env:LIKO_DATA_MODE='supabase'; node --env-file=.env.local next start -p 3321
 *   pnpm verify:app
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
const AUTH = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/auth/v1`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
      // The two newest routes, and the two that had never been run against
      // Postgres at all. `/schedule` needs a student before it will draw a week,
      // so the teacher half is covered through `?student=` below instead.
      //
      // THE WITNESS IS WHAT THE SEED WRITES, NOT WHAT THE FIXTURE NAMES. This
      // asserted the literal `Chemistry`, which the fixture workspace used for a
      // class title and which `scripts/seed.mjs` never writes: it names the deck
      // `Unit 1: Atomic Structure` and gives the week Filipino, Mathematics,
      // English, Science, History, Technology, Clinic, Physical Education and
      // Values Education. So the page was serving real seeded rows and the check
      // failed anyway, reporting a working route as broken.
      //
      // Both replacements are live-only on purpose. The fixture workspace
      // contains no schedule entries at all and no deck by this name, so neither
      // string can pass against demo data — which is what makes these witnesses
      // rather than decoration.
      ['/flashcards', 'Unit 1: Atomic Structure'],
    ],
    forbidden: ['/admin'],
  },
  {
    email: 'dev@liko.test',
    label: 'admin',
    routes: [
      ['/overview', null],
      /*
       * Renders, and deliberately not asserted for a student's name.
       *
       * This used to expect 'Ana Ferreira', which was the fixture's answer rather
       * than the database's. `classes` carries `admin reads classes`, so an
       * administrator lists every class in the organisation; `students` has no
       * admin policy, so the roster read returns nothing for a class they do not
       * teach. Asserting a student here would have demanded that RLS be widened
       * to admit children's names to every administrator, disguised as a data
       * check.
       *
       * What is asserted instead is that the page refuses to invent a number,
       * which is the part that was wrong and is now pinned.
       */
      ['/classes', /Roster not visible to you/],
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
    /*
     * `/schedule` is the only route in this list that checks a read the fixtures
     * could not: the week grid, the account-linked roster row, and now the
     * notification bell that a teacher's save writes into. Asserting a seeded
     * class title here is what proves the RLS on `schedule_entries` and
     * `students` actually admits a student, rather than merely returning 200.
     */
    routes: [
      ['/overview', null],
      /*
       * `Clinic` is one of the two Wednesday entries that overlap by half an
       * hour in the seeded week, so it is present exactly when the real rows
       * were read. It replaced `Chemistry`, which the seed never writes.
       */
      ['/schedule', 'Clinic'],
    ],
    /*
     * `/grades/export` used to be here, asserting that a student resolves no
     * class and therefore 404s. That was true while `listClasses` filtered on
     * `owner_id`, and it stopped being true the moment the linked-read
     * policies landed: the seat now resolves its own class and the endpoint
     * answers 200 with a CSV holding exactly one row, its own.
     *
     * A blanket refusal was the wrong assertion, not merely a stale one. The
     * property worth protecting is scope, and it is now asserted directly in
     * "Gradebook export scope" below: a student may hold their own marks and
     * nothing else, and is refused any class they are not linked to.
     */
    forbidden: ['/admin'],
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

/**
 * The copy the app's own error boundary renders.
 *
 * Exists so a failed render is reported as a failed render. An error boundary
 * answers HTTP 200 and simply lacks the expected text, which is the same
 * observable as an empty state, and the sweep used to call both of them the
 * same thing.
 */
const ERROR_BOUNDARY = /Something went wrong|failed to load|Application error/i;

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

/**
 * Waits for the page to stop streaming before anything is read off it.
 *
 * Next.js streams the App Router shell, so at `domcontentloaded` the document
 * briefly holds TWO `<main>` elements: the bare shell the browser received first,
 * whose content has not arrived, and the real tree still inside a hidden
 * container. `locator('main')` then resolves to two nodes and every read of it
 * throws a strict-mode violation.
 *
 * THAT MATTERS BECAUSE BOTH READS BELOW USED `.catch(() => '')`. An empty string
 * is a perfectly good page body as far as the next line is concerned, so the
 * check did not report "I could not read the page", it reported the confident
 * and completely wrong "HTTP 200 but the seeded data is not on the page, so this
 * is an empty state rather than real data", and pointed the investigation at the
 * Supabase adapter. The adapter was fine.
 *
 * A tool failure must never be reported as a product failure, because the cause
 * names the wrong file and that is the expensive kind of wrong.
 */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main').first().waitFor({ state: 'visible' });
}

/**
 * The page's own text, read once and read loudly.
 *
 * No `.catch`. If this cannot read the page it throws, with the real reason,
 * rather than handing a caller an empty string that reads like a verdict.
 */
async function pageText(page) {
  const mains = page.locator('main');
  const count = await mains.count();
  if (count !== 1) {
    throw new Error(
      `expected exactly one <main> to read, found ${count}. The page has not finished streaming.`,
    );
  }
  return mains.innerText();
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
      await settle(page);
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
        const body = await pageText(page);
        if (!body.includes(expect)) {
          ok = false;
          /*
           * REPORT THE OBSERVATION, NOT A DIAGNOSIS.
           *
           * The sentence this replaces ended "so this is an empty state rather
           * than real data". Nothing on the page had established that. A render
           * that throws reaches the error boundary, which still answers HTTP 200
           * and simply does not contain the expected text, so the old wording
           * reported a crash as an empty state and pointed the investigation at
           * the data layer. It was not the data layer: the database had the rows
           * and RLS had admitted them, and the throw was a stale session cookie
           * handing a fixture id to Postgres.
           *
           * So the message now states what is true, the text being absent, and
           * separates the two cases that are indistinguishable from outside: the
           * error boundary, and a page that genuinely rendered without the text.
           */
          const crashed = ERROR_BOUNDARY.test(body);
          detail = crashed
            ? `HTTP 200 but the page rendered the error boundary instead of "${expect}". That is a crash, not an empty state, and the server log holds the throw.`
            : `HTTP 200 but "${expect}" is not on the page, which renders: ${body.replace(/\s+/g, ' ').slice(0, 160)}`;
        }
      } else if (ok && expect instanceof RegExp) {
        /*
         * A regular expression is a real assertion, and it has to be handled
         * rather than ignored.
         *
         * The branch below it checks `expect.input`, and a RegExp is an object
         * without an `input` property, so a route written as `['/classes',
         * /some text/]` fell through both branches and passed without reading the
         * page at all. A check that cannot fail is worse than no check, because
         * it looks like coverage in the output.
         */
        const body = await pageText(page);
        if (!expect.test(body)) {
          ok = false;
          detail = `HTTP 200 but ${expect} does not match the page, which reads: ${body.slice(0, 120)}`;
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
       * redirects or renders the refusal copy; an endpoint answers 4xx, or
       * bounces to the sign-in page, which is the same protection expressed as
       * a missing row rather than a sentence. Judging an endpoint by its
       * rendered copy would call that a pass only by accident, and judging it
       * by its status code alone would miss a CSV that was served to an
       * account with no right to it.
       */
      const response = await fetchAs(page, `${BASE}${route}`);
      const type = response.type;
      const served = type.includes('text/csv');
      /*
       * `url` is the URL after redirects, so a request bounced to the sign-in
       * page no longer ends in the route that was asked for. Both of those are
       * refusals. What is not a refusal is a CSV arriving intact, which is the
       * one outcome this check exists to catch.
       *
       * The request is issued from inside the page on purpose. This branch is
       * dormant today -- no account lists an export route -- and an anonymous
       * request would be bounced to sign-in for ANY route, which would make this
       * assertion pass without RBAC ever being consulted. It has to carry the
       * real session or it reports protection it never tested.
       */
      const bounced = !response.url.endsWith(route);

      if (route.includes('/export')) {
        /*
         * No account lists an export route at the moment: the student seat is
         * entitled to its own marks, so its export is asserted by scope in
         * `verifyGradebookExportScope` instead. The branch stays because an
         * endpoint listed as forbidden needs an endpoint's rules, and reaching
         * for the page branch would quietly judge a status code by its copy.
         */
        check(
          `${route} is refused`,
          !served && (response.status >= 400 || bounced),
          `answered ${response.status} as ${type} from ${response.url}`,
        );
      } else {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const landed = new URL(page.url()).pathname;
        const body = await pageText(page);
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
 * THE CONTROLS A ROLE CANNOT USE.
 *
 * Every one of these actions calls `requirePermission` before it looks at a
 * record, so a control the current role may not use is refused at the moment
 * it is pressed. That is the right place for the refusal and the wrong place
 * for the control. A student and a guardian were both offered a "New class"
 * button on the page that is their landing page, an editable cell for every
 * mark in the gradebook, and a free-text form on a child's behaviour record,
 * and every one of them was refused with a message that reads like a broken
 * product rather than like a boundary.
 *
 * WHY THIS IS HERE AND NOT ONLY IN THE E2E SPEC. The e2e suite runs against
 * the fixture workspace, so it says nothing about the deployed bundle. This
 * runs against the live site, which is the only place a deployed build can be
 * caught still offering a control it is about to refuse.
 *
 * THE POSITIVE CONTROL IS HERE TOO, AND IT IS THE PART THAT MAKES THE ZERO
 * MEAN SOMETHING. A count of zero for a locator that matches nothing is a
 * pass that means nothing, so the instructor is asserted to be offered the
 * same controls on the same pages. A student is still offered "New deck",
 * because a student holds `flashcard:write` at `own` and a deck they make is
 * their own; a fix that over-hides is a defect too.
 */
const ROLE_GATED_CONTROLS = [
  { route: '/classes', control: 'New class', refused: ['student', 'guardian'], offered: ['instructor'] },
  { route: '/grades', control: 'Use for this class', refused: ['student', 'guardian'], offered: ['instructor'] },
  { route: '/grades', control: 'New scale', refused: ['student', 'guardian'], offered: ['instructor'] },
  { route: '/grades', control: 'New assessment', refused: ['student', 'guardian'], offered: ['instructor'] },
  { route: '/history', control: 'Add entry', refused: ['student', 'guardian'], offered: ['instructor'] },
  { route: '/flashcards', control: 'New deck', refused: ['guardian'], offered: ['student', 'instructor'] },
];

async function verifyRoleGatedControls() {
  console.log('Role-gated controls');
  const browser = await chromium.launch();
  try {
    const roles = [
      { role: 'instructor', email: 'maya@liko.test' },
      { role: 'student', email: 'student@liko.test' },
      { role: 'guardian', email: 'guardian@liko.test' },
    ];

    for (const { role, email } of roles) {
      const context = await browser.newContext();
      await seedConsent(context);
      const page = await context.newPage();
      await signIn(page, email);

      for (const route of ['/classes', '/grades', '/history', '/flashcards']) {
        const rules = ROLE_GATED_CONTROLS.filter((rule) => rule.route === route);
        if (rules.length === 0) continue;

        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await settle(page);

        for (const rule of rules) {
          const count = await page.getByRole('button', { name: rule.control }).count();
          if (rule.refused.includes(role)) {
            check(
              `${role} is offered no "${rule.control}" on ${route}`,
              count === 0,
              `found ${count}`,
            );
          } else if (rule.offered.includes(role)) {
            check(
              `${role} is still offered "${rule.control}" on ${route}`,
              count === 1,
              `found ${count}`,
            );
          }
        }

        /*
         * The gradebook's editable cells, which are not a button and so are not
         * in the table above. The grid marks the cells it wants edited with an
         * explicit `role="gridcell"`, and the cells it does not are plain table
         * cells, so the marking is what tells the two apart.
         */
        if (route === '/grades') {
          const cells = await page.getByRole('gridcell').count();
          if (role === 'instructor') {
            check(
              'the instructor is still offered editable marks on /grades',
              cells > 0,
              `found ${cells}`,
            );
          } else {
            check(
              `${role} is offered no editable mark on /grades`,
              cells === 0,
              `found ${cells}`,
            );
          }
        }
      }

      await context.close();
    }
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
    /*
     * THIS WAS THE ONLY `goto` IN THE SCRIPT WITHOUT IT.
     *
     * The register renders its "Mark all present" control inside the streamed
     * tree, so at `domcontentloaded` the document still holds the bare shell and
     * the count below came back 0 — reported as "the write was never attempted"
     * when the write was never tried because the page had not finished
     * arriving. Every other navigation in this file settles for the reason
     * documented on `settle` itself; this one was missed, and the only symptom
     * was an intermittent failure that looked like a product fault.
     *
     * The product was verified by hand at the same URL and renders the control,
     * so the check was wrong and not the page.
     */
    await settle(page);

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
 * The gradebook export, asserted by scope rather than by refusal.
 *
 * WHY THIS REPLACED A CHECK THAT USED TO PASS. `/grades/export` was listed as
 * forbidden for the student seat, on the reasoning that a student resolves no
 * class and so 404s. That was true while `listClasses` filtered on `owner_id`.
 * The linked-read policies landed, `listClasses` stopped filtering, and the
 * student seat now resolves its own class: the product answers `200 text/csv`.
 * The old assertion then failed against a correct application, which is the
 * worst failure mode a gate has, because it trains the reader to ignore it.
 *
 * WHY IT STILL FAILED, AND IT WAS NOT THE PRODUCT. For a long time this check
 * read `200 text/html` and two explanations were written down for it, both
 * wrong. It was not `proxy.ts` rewriting a refused role to `/forbidden`, and it
 * was not the export refusing anybody. The session cookie is `Secure`, and
 * Playwright's `page.request` jar withholds `Secure` cookies over plain
 * `http://127.0.0.1` while the browser itself sends them, because loopback is a
 * trustworthy origin. So the request left anonymous, `307` went to `/login`, and
 * the followed redirect rendered the sign-in page as `200 text/html`.
 *
 * Two consequences, and both are load-bearing:
 *
 *   - A refusal that is actually a sign-in page is the worst thing a gate can
 *     print. "answered 200 as text/html" reads like an RBAC failure, and the
 *     instinct to open `proxy.ts` is exactly the wrong place to look.
 *   - The three request shapes disagree. `page.request` answers 307; the same
 *     call with `liko_session` set by hand answers 404, because the session
 *     verifies without `sb-*-auth-token` and RLS then denies; a real browser
 *     answers 200 with the CSV. Only the third is what a user gets, so it is the
 *     only one this check is allowed to make an assertion from.
 *
 * A blanket refusal was also the wrong property. The student is entitled to
 * their own marks, and a CSV of one row is the same data `/grades` already
 * renders. What must never happen is a student receiving a classmate's row, so
 * that is what is asserted, and rows are counted against the roster RLS really
 * admits the seat rather than pattern-matched on a name.
 *
 * The second check is the one the old list never covered at all: asking for a
 * class the caller cannot resolve. An id from elsewhere must 404 rather than
 * export, and that behaviour had no test anywhere.
 */
async function verifyGradebookExportScope() {
  console.log('Gradebook export scope');

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    await seedConsent(context);
    const page = await context.newPage();
    await signIn(page, 'student@liko.test');

    /*
     * The roster RLS admits the seat, read with that seat's own JWT. Comparing
     * against this rather than a hard-coded name means the check still asserts
     * the invariant if the seed is ever re-pointed at different data.
     */
    const seat = await fetch(`${AUTH}/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@liko.test', password: PASSWORD }),
    });
    const seatJwt = (await seat.json()).access_token;
    const roster = await fetch(`${REST}/students?select=full_name`, {
      headers: { apikey: ANON, Authorization: `Bearer ${seatJwt}` },
    });
    const visible = roster.ok ? (await roster.json()).map((row) => row.full_name) : [];

    const own = await fetchAs(page, `${BASE}/grades/export`);
    const isCsv = own.type.includes('text/csv');

    /*
     * The student seat is NOT refused here. It holds `grade:read` at `own`
     * scope, so `can()` is true, the proxy does not rewrite it, and it is
     * entitled to a CSV of its own marks -- the same data `/grades` renders.
     * Asserting the CSV is therefore asserting the real invariant, and unlike a
     * refusal it can actually fail.
     */
    check(
      'a student seat is answered its own gradebook CSV',
      isCsv,
      `answered ${own.status} as ${own.type}` +
        (own.type.includes('text/html')
          ? ' -- an HTML body here is the sign-in page, meaning the request was not authenticated'
          : ''),
    );

    if (isCsv) {
      const dataRows = own.body
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .slice(1);

      check(
        'a student export holds only the rows RLS admits the seat',
        dataRows.length === visible.length &&
          dataRows.every((row, index) => row.startsWith(`${visible[index]},`)),
        `${dataRows.length} data row(s) for a seat that can read ${visible.length}: ${JSON.stringify(dataRows).slice(0, 200)}`,
      );
    } else {
      note('row scope not checked, because no CSV came back');
    }

    /*
     * A class taken through the service key, which bypasses RLS precisely so
     * the id here is one the student must not resolve rather than one that
     * happens to be absent. The first class the seat CAN see is excluded, so
     * this cannot accidentally ask for the seat's own class and pass for the
     * wrong reason.
     */
    const [mine] = visible.length ? await seatClasses(seatJwt) : [];
    const everyone = await read('classes?select=id&limit=50');
    const stranger = everyone.find((row) => !mine || row.id !== mine.id);

    if (stranger) {
      const refused = await fetchAs(page, `${BASE}/grades/export?class=${stranger.id}`);
      const refusedCsv = refused.type.includes('text/csv');
      check(
        'a student export for a class it cannot resolve is refused',
        !refusedCsv && refused.status >= 400,
        `answered ${refused.status} as ${refused.type}` +
          (refusedCsv
            ? ' -- a CSV came back for a class this seat cannot resolve, which is the leak'
            : ''),
      );
    } else {
      note('only one class exists, so there is no stranger to ask for');
    }
  } finally {
    await browser.close();
  }
}

/**
 * A GET issued from inside the signed-in page, so the browser sends the cookies.
 *
 * THIS REPLACES `page.request`, AND THE REPLACEMENT IS THE POINT. The session
 * cookie is `Secure`. Over plain `http://127.0.0.1` a browser still sends it,
 * because loopback counts as a trustworthy origin, but Playwright's API request
 * jar withholds it -- so `page.request` reached the app as an anonymous caller,
 * was redirected to `/login`, and came back as `200 text/html`. Three different
 * answers came out of three request shapes for one URL, and only this one is what
 * a user actually receives.
 *
 * Not `redirect: 'manual'` either: a refusal the app expresses as a redirect is
 * exactly what these checks exist to catch, and swallowing the redirect would
 * hide it. The status is asserted as it comes back.
 */
async function fetchAs(page, url) {
  const answer = await page.evaluate(async (target) => {
    const res = await fetch(target, { credentials: 'include' });
    return {
      status: res.status,
      type: res.headers.get('content-type') ?? '',
      /* After redirects, so a request bounced to sign-in no longer ends in the
         route that was asked for. */
      url: res.url,
      body: await res.text(),
    };
  }, url);
  return answer;
}

/** The classes one seat's own token can read, which is its linked scope. */
async function seatClasses(jwt) {
  const response = await fetch(`${REST}/classes?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  return response.ok ? response.json() : [];
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
  const addressRejected = result.error_code === 'email_address_invalid';

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

  if (addressRejected) {
    /*
     * Not a quota problem this time: Supabase refused the address itself. The
     * probe uses a `.test` domain because the seed's accounts do, and the public
     * signup path validates the TLD while `auth.admin.createUser` does not. That
     * is worth knowing plainly, because it means the demo accounts could never
     * have been created through the product's own registration form, only
     * through the seed.
     */
    check(
      'signup rejects the .test probe address, so the path stays unverified',
      true,
      undefined,
    );
    note(
      `Supabase answered ${probe.status} ${result.error_code}: ${result.msg}. The email quota ` +
        'appears to have reset, but this probe cannot exercise registration until it uses a real ' +
        'address on a real domain.',
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

/**
 * Posts from inside the page rather than through `page.request`.
 *
 * `page.request` shares the context's cookies, but the session here is set by a
 * server action during sign-in and the requests made that way were answered 401
 * even with a valid signed-in browser. Running the fetch inside the page means
 * the browser sends exactly the headers it would send, which is also the more
 * faithful test: this is what the service worker does when it subscribes.
 */
async function callAsPage(page, method, path, body) {
  return page.evaluate(
    async ([verb, url, payload]) => {
      const response = await fetch(url, {
        method: verb,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.text() };
    },
    [method, `${BASE}${path}`, body],
  );
}

/**
 * The push subscription route: SSRF allowlist, RLS ownership, and the sweep's
 * path from a stored row to an outbound send.
 *
 * This endpoint has never been exercised against a live database, and it is the
 * one place in the product where a signed-in teacher supplies a URL that the
 * server will later fetch. The refusal cases are asserted first because they are
 * the security-relevant ones and they need no state.
 *
 * The suffix cases matter more than they look. A naive host check accepts
 * `fcm.googleapis.com.attacker.com`, which an attacker obtains by owning
 * `attacker.com`, and accepting it would turn this into a blind proxy out of the
 * server. Those two payloads are the whole reason the rule compares parsed
 * hostnames against dot-anchored suffixes.
 */
async function verifyPush() {
  console.log('Push subscriptions');

  const endpoint = `https://fcm.googleapis.com/fcm/send/verify-${Date.now()}`;
  const payload = {
    endpoint,
    keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', auth: '8eDyX_uCN0XRhSbE5HG7pJLvWOhVr6jLGlhFwqsmGY' },
  };

  const browser = await chromium.launch();

  try {
    // ---- refusals that need no session ----------------------------------
    const anonymous = await fetch(`${BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    check('an anonymous subscribe is refused', anonymous.status === 401, `answered ${anonymous.status}`);

    const crossOrigin = await fetch(`${BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify(payload),
    });
    check('a cross-origin subscribe is refused', crossOrigin.status === 403, `answered ${crossOrigin.status}`);

    // ---- the allowlist --------------------------------------------------
    const refusals = [
      ['instance metadata over http', 'http://169.254.169.254/latest/meta-data/'],
      ['a host that merely ends in the right characters', 'https://fcm.googleapis.com.attacker.com/x'],
      ['a host with the right characters as a prefix', 'https://notfcm.googleapis.com/x'],
      ['a valid host carrying credentials', 'https://user:pass@fcm.googleapis.com/x'],
      ['a valid host on the wrong port', 'https://fcm.googleapis.com:8443/x'],
      ['a loopback address', 'https://127.0.0.1/x'],
    ];

    const context = await browser.newContext();
    await seedConsent(context);
    const page = await context.newPage();
    await signIn(page, 'maya@liko.test');

    for (const [label, hostile] of refusals) {
      const res = await callAsPage(page, 'POST', '/api/push/subscribe', {
        endpoint: hostile,
        keys: payload.keys,
      });
      check(`refuses ${label}`, res.status === 400, `answered ${res.status}`);
    }

    // ---- a legitimate subscription --------------------------------------
    const accepted = await callAsPage(page, 'POST', '/api/push/subscribe', payload);
    check('a real push endpoint is accepted', accepted.status === 204, `answered ${accepted.status}`);

    const rows = await read(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=user_id`);
    check(
      'and it is stored against the signed-in teacher',
      Array.isArray(rows) && rows.length === 1,
      `rows: ${JSON.stringify(rows)}`,
    );

    // ---- re-subscribing must not duplicate ------------------------------
    await callAsPage(page, 'POST', '/api/push/subscribe', payload);
    const again = await read(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=id`);
    check(
      're-subscribing the same endpoint updates rather than duplicating',
      again.length === 1,
      `${again.length} rows after a second subscribe`,
    );

    // ---- and the sweep can now find a teacher ----------------------------
    /*
     * The sweep must actually have something to alert on, or it dispatches
     * nothing and this proves nothing about the network path. A previous run of
     * this script, or of the at-risk sweep itself, leaves `intervention` rows
     * behind, and the seven-day cooldown then suppresses every student before any
     * send happens. Clearing them first is what makes the dispatch assertion
     * deterministic; the rows written below are removed again at the end so the
     * database is left as it was found.
     */
    await remove('student_history?event_type=eq.intervention');

    if (process.env.CRON_SECRET) {
      const sweep = await fetch(`${BASE}/api/cron/at-risk`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).then((r) => r.json());

      /*
       * With a stored subscription the sweep must now find a teacher, which is
       * the link this whole chain depends on.
       *
       * The endpoint here is synthetic, so a delivery cannot succeed. What is
       * being proved is that the request actually leaves the server and that a
       * permanent rejection is handled as permanent: FCM answers 404 for an
       * unknown subscription, the dispatcher treats that as "gone", and the row
       * is deleted rather than retried forever. So `pruned` is the signal here,
       * not `failed`. A run reporting neither sent nor pruned would mean the
       * dispatcher never reached the network at all.
       */
      check(
        'the sweep now finds a subscribed teacher instead of nobody',
        sweep.teachers >= 1,
        `sweep reported ${JSON.stringify(sweep)}`,
      );
      check(
        'and it dispatched to the endpoint, treating the rejection as permanent',
        sweep.pruned > 0 || sweep.notifications > 0 || sweep.failed > 0,
        `notifications ${sweep.notifications}, pruned ${sweep.pruned}, failed ${sweep.failed}. ` +
          'All three at zero would mean the dispatcher stopped before reaching the push service.',
      );
      note(
        `sweep reported notifications: ${sweep.notifications}, pruned: ${sweep.pruned}, ` +
          `failed: ${sweep.failed}. A synthetic endpoint is expected to be pruned, not delivered ` +
          'to. Real delivery still needs a browser that accepts a subscription.',
      );
    }

    // ---- one teacher cannot remove another's device ----------------------
    const devContext = await browser.newContext();
    await seedConsent(devContext);
    const devPage = await devContext.newPage();
    await signIn(devPage, 'dev@liko.test');

    const devEndpoint = `https://fcm.googleapis.com/fcm/send/verify-dev-${Date.now()}`;
    await callAsPage(devPage, 'POST', '/api/push/subscribe', {
      endpoint: devEndpoint,
      keys: payload.keys,
    });

    // Maya tries to delete Dev's subscription using her own session.
    await callAsPage(page, 'DELETE', '/api/push/subscribe', { endpoint: devEndpoint });

    const devRows = await read(`push_subscriptions?endpoint=eq.${encodeURIComponent(devEndpoint)}&select=user_id`);
    check(
      "one teacher cannot unsubscribe another teacher's device",
      devRows.length === 1,
      `dev's row count after maya's delete: ${devRows.length}`,
    );

    // ---- and she can remove her own --------------------------------------
    await callAsPage(page, 'DELETE', '/api/push/subscribe', { endpoint });
    const gone = await read(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=id`);
    check('a teacher can remove their own subscription', gone.length === 0, `${gone.length} rows left`);

    await remove(`push_subscriptions?endpoint=eq.${encodeURIComponent(devEndpoint)}`);
    await devContext.close();
    await context.close();
  } finally {
    await remove(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`);
    await remove('student_history?event_type=eq.intervention');
    await browser.close();
  }
}

/**
 * The attendance endpoint that the offline queue replays to.
 *
 * This is a write surface, and it is the one the outbox can hit hours later
 * without a teacher watching, so the properties worth proving are that it
 * refuses an anonymous caller, refuses a cross-origin one, and refuses a class
 * the caller does not own. The last one is the interesting one: attendance rows
 * are scoped to the owner, so a forged class id would not leak anything back to
 * the forger, but it would still write into somebody else's class attributed to
 * the wrong teacher.
 *
 * A refusal has to be a 4xx rather than a 200 with a message in the body,
 * because the outbox drops 4xx and retries 5xx. A class that is not the
 * caller's will never become the caller's, so retrying it forever would grow the
 * queue without ever succeeding.
 */
async function verifyAttendanceEndpoint() {
  console.log('Attendance endpoint');

  const anonymous = await fetch(`${BASE}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: 'x', date: '2026-03-03', marks: [] }),
  });
  check('an anonymous attendance write is refused', anonymous.status === 401, `answered ${anonymous.status}`);

  const crossOrigin = await fetch(`${BASE}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ classId: 'x', date: '2026-03-03', marks: [] }),
  });
  check('a cross-origin attendance write is refused', crossOrigin.status === 403, `answered ${crossOrigin.status}`);

  const auth = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/auth/v1`;
  const { users } = await (await fetch(`${auth}/admin/users`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).json();
  const maya = users.find((u) => u.email === 'maya@liko.test');
  const ingrid = users.find((u) => u.email === 'ingrid@liko.test');

  const [mine] = await read(`classes?owner_id=eq.${maya.id}&select=id&limit=1`);
  const [theirs] = await read(`classes?owner_id=eq.${ingrid.id}&select=id&limit=1`);
  const [{ id: studentId }] = await read(`students?owner_id=eq.${maya.id}&select=id&limit=1`);

  const browser = await chromium.launch();
  const date = '2026-03-03';
  try {
    const context = await browser.newContext();
    await seedConsent(context);
    const page = await context.newPage();
    await signIn(page, 'maya@liko.test');

    const post = (body) =>
      page.evaluate(
        async ([url, payload]) => {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return { status: r.status, body: (await r.text()).slice(0, 200) };
        },
        [`${BASE}/api/attendance`, body],
      );

    const mine_result = await post({ classId: mine.id, date, marks: [{ studentId, status: 'late' }] });
    check(
      'writing attendance to a class the caller owns succeeds',
      mine_result.status === 200,
      `answered ${mine_result.status}: ${mine_result.body}`,
    );

    /*
     * Replaying the same day is what the outbox does on every reconnect, so it
     * has to be an update rather than a second row. The endpoint is only safe to
     * queue because of this.
     */
    await post({ classId: mine.id, date, marks: [{ studentId, status: 'late' }] });
    const rows = await read(
      `attendance?class_id=eq.${mine.id}&student_id=eq.${studentId}&date=eq.${date}&select=id,status`,
    );
    check(
      'replaying the same day updates the row instead of duplicating it',
      rows.length === 1,
      `${rows.length} rows after writing the same mark twice`,
    );

    const foreign = await post({ classId: theirs.id, date, marks: [{ studentId, status: 'late' }] });
    check(
      "writing attendance into another teacher's class is refused",
      foreign.status === 404,
      `answered ${foreign.status}: ${foreign.body}`,
    );

    const leaked = await read(`attendance?class_id=eq.${theirs.id}&date=eq.${date}&select=id`);
    check('and no row was written into that class', leaked.length === 0, `${leaked.length} rows`);

    await remove(`attendance?class_id=eq.${mine.id}&date=eq.${date}`);
    await context.close();
  } finally {
    await browser.close();
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
    await verifyRoleGatedControls();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the role-gated controls could not be checked: ${error.message}`);
  }

  try {
    await verifyWrite();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the write check could not run: ${error.message}`);
  }

  try {
    await verifyGradebookExportScope();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the gradebook export scope could not be checked: ${error.message}`);
  }

  try {
    await verifyCron();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the at-risk sweep could not be checked: ${error.message}`);
  }

  try {
    await verifyPush();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  push subscriptions could not be checked: ${error.message}`);
  }

  try {
    await verifyAttendanceEndpoint();
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  the attendance endpoint could not be checked: ${error.message}`);
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