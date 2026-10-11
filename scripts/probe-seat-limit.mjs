/**
 * Live probe for the seat limit.
 *
 * WHY THIS EXISTS. `redeem_org_invite` is the one place the seat limit is
 * enforced, it is a `security definer` function, and nothing in this repo calls
 * it in any automated test. The last function in this file's neighbourhood,
 * `start_quiz_attempt`, passed 168 end-to-end tests, the SQL reference check and
 * the remote database check, and was broken: it ran `insert ... returning id`
 * without assigning the result and failed the first time a real student clicked
 * anything. Fixtures never execute SQL and `check:sql` parses rather than runs,
 * so the whole gate suite was blind to it.
 *
 * So this calls the function against the live database as a real signed-in user
 * and watches it refuse. The negative case is the one that matters: a function
 * only ever observed to succeed has not been observed at all.
 *
 * IT OWNS ITS OWN USER. The first version of this probe used a demo account,
 * which was wrong twice over: `student@liko.test` is already seated in the demo
 * school, so the function's "you are already part of that school" check fired
 * before the seat check ever ran, and the probe's own cleanup then deleted that
 * real membership. A probe that borrows live data and edits it is not a probe,
 * it is an outage. This version creates its own account, and deletes it.
 *
 * Run: node --env-file=.env.local scripts/probe-seat-limit.mjs
 */
import pg from 'pg';

const { Client } = pg;

function pooler() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const ref = url.hostname.split('.')[0];
  return {
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    user: `postgres.${ref}`,
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  };
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PROBE_EMAIL = `seat-probe-${Date.now()}@liko.test`;
const PROBE_PASSWORD = 'SeatProbe!2026';

const results = [];
function check(name, ok, detail = '') {
  results.push({ ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}\n`);
}

async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed: ${JSON.stringify(body).slice(0, 200)}`);
  return body.access_token;
}

async function createProbeUser() {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD, email_confirm: true }),
  });
  const body = await res.json();
  if (!body.id) throw new Error(`probe user not created: ${JSON.stringify(body).slice(0, 200)}`);
  return body.id;
}

async function deleteProbeUser(id) {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  return res.ok;
}

/** Calls the function AS the probe user, over PostgREST. */
async function redeem(token, code) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/redeem_org_invite`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const admin = new Client(pooler());
await admin.connect();

let probeUserId = null;
let orgId = null;
let originalLimit = null;
let originalSeats = null;

try {
  const { rows: orgs } = await admin.query(
    `select id, name, seat_limit from public.organizations where slug = 'liko-demo-school' limit 1`,
  );
  const org = orgs[0];
  if (!org) throw new Error('demo organisation missing; run the seed script first');
  orgId = org.id;
  originalLimit = org.seat_limit;

  const { rows: members } = await admin.query(
    `select count(*)::int as n from public.memberships where org_id = $1 and status = 'active'`,
    [orgId],
  );
  check('the demo school has active seats', members[0].n > 0, `${members[0].n} of ${org.seat_limit}`);

  /*
   * Repair whatever a previous run of this probe left behind.
   *
   * The first version deleted the demo student's membership and printed its own
   * cleanup as passing while doing so. Restoring here rather than in a one-off
   * means the repair survives the next mistake instead of being a thing someone
   * remembers to do by hand.
   */
  const { rows: demoStudents } = await admin.query(
    `select u.id from auth.users u
      where u.email = 'student@liko.test'
        and not exists (select 1 from public.memberships m where m.org_id = $1 and m.user_id = u.id)`,
    [orgId],
  );
  for (const row of demoStudents) {
    await admin.query(
      `insert into public.memberships (org_id, user_id, role, status) values ($1, $2, 'student', 'active')`,
      [orgId, row.id],
    );
    process.stdout.write(`repaired the demo student's membership in the demo school\n`);
  }

  /*
   * Counted AFTER the repair, not before. Reading the headcount first and
   * repairing afterwards left the probe reasoning about a school with four seats
   * that then had five, which made every limit it set one seat too low and made
   * a working function look broken.
   */
  const { rows: seatsNow } = await admin.query(
    `select count(*)::int as n from public.memberships where org_id = $1 and status = 'active'`,
    [orgId],
  );
  originalSeats = seatsNow[0].n;

  probeUserId = await createProbeUser();
  check('the probe created its own account', Boolean(probeUserId));

  const token = await signIn(PROBE_EMAIL, PROBE_PASSWORD);
  check('the probe account can sign in', Boolean(token));

  // ---- The block. The limit is set to exactly the number already seated.
  await admin.query(`update public.organizations set seat_limit = $2 where id = $1`, [orgId, originalSeats]);

  const full = await admin.query(
    `insert into public.organization_invites (org_id, email, role, code, created_by)
     select $1, 'blocked@liko.test', 'instructor', 'BLOCKED1', (select user_id from public.memberships where org_id = $1 limit 1)
     returning id`,
    [orgId],
  );
  const inviteId = full.rows[0].id;

  const blocked = await redeem(token, 'BLOCKED1');
  const message = JSON.stringify(blocked.body ?? {});
  check(
    'redemption is refused when the organisation is at its seat limit',
    blocked.status >= 400 && /no room left/i.test(message),
    `status ${blocked.status}: ${message.slice(0, 200)}`,
  );
  check(
    'the refusal tells the reader an administrator can raise the limit',
    /seat limit/i.test(message),
    message.slice(0, 200),
  );

  const { rows: afterBlock } = await admin.query(
    `select count(*)::int as n from public.memberships where org_id = $1 and user_id = $2`,
    [orgId, probeUserId],
  );
  check('a refused redemption creates no membership', afterBlock[0].n === 0, `${afterBlock[0].n}`);

  // ---- Raise the limit, and the very same code works.
  await admin.query(`update public.organizations set seat_limit = $2 where id = $1`, [orgId, originalSeats + 1]);
  const ok = await redeem(token, 'BLOCKED1');
  check(
    'the same code works once an administrator raises the limit',
    ok.status < 400,
    `status ${ok.status}: ${JSON.stringify(ok.body ?? {}).slice(0, 200)}`,
  );

  const { rows: afterOk } = await admin.query(
    `select count(*)::int as n from public.memberships where org_id = $1 and user_id = $2`,
    [orgId, probeUserId],
  );
  check('the membership exists after a permitted redemption', afterOk[0].n === 1, `${afterOk[0].n}`);

  const twice = await redeem(token, 'BLOCKED1');
  check(
    'the code cannot be redeemed a second time',
    twice.status >= 400,
    `status ${twice.status}: ${JSON.stringify(twice.body ?? {}).slice(0, 160)}`,
  );

  const unknown = await redeem(token, 'NOSUCHCD');
  check('an unknown code is refused', unknown.status >= 400, `status ${unknown.status}`);

  await admin.query(`delete from public.organization_invites where id = $1`, [inviteId]);
} finally {
  if (orgId) {
    if (probeUserId) {
      await admin.query(`delete from public.memberships where user_id = $1`, [probeUserId]);
    }
    await admin.query(`delete from public.organization_invites where org_id = $1`, [orgId]);
    await admin.query(`update public.organizations set seat_limit = $2 where id = $1`, [orgId, originalLimit]);

    // Read the state back rather than reporting what the writes were told to do.
    const { rows: left } = await admin.query(
      `select count(*)::int as n from public.organization_invites where org_id = $1`,
      [orgId],
    );
    const { rows: seats } = await admin.query(
      `select count(*)::int as n from public.memberships where org_id = $1 and status = 'active'`,
      [orgId],
    );
    const { rows: limit } = await admin.query(
      `select seat_limit from public.organizations where id = $1`,
      [orgId],
    );
    check('the probe left no invites behind', left[0].n === 0, `${left[0].n} left`);
    check('the probe left the seat count as it found it', seats[0].n === originalSeats, `${seats[0].n} vs ${originalSeats}`);
    check('the probe restored the seat limit', limit[0].seat_limit === originalLimit, `${limit[0].seat_limit} vs ${originalLimit}`);

    const { rows: demoSeat } = await admin.query(
      `select count(*)::int as n from public.memberships m
        join auth.users u on u.id = m.user_id
       where m.org_id = $1 and u.email = 'student@liko.test' and m.status = 'active'`,
      [orgId],
    );
    check('the demo student is seated again', demoSeat[0].n === 1, `${demoSeat[0].n}`);
  }

  if (probeUserId) {
    const gone = await deleteProbeUser(probeUserId);
    check('the probe deleted its own account', gone);
  }

  await admin.end();
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);