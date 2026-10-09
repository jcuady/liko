/**
 * Do the security policies actually behave?
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST FILE. Everything else in this repo runs
 * against the in-memory fixture workspace, which has no Postgres and therefore
 * no RLS. The two fixes that matter most, the column-scoped `profiles` grant and
 * the tenant-scoped class reads, live entirely in SQL. Reading SQL proves
 * nothing about whether Postgres enforces it, and the honest statement of their
 * status until this runs is "unverified".
 *
 * It needs the service key, because it has to create two throwaway tenants and
 * sign in as a real student in one of them. It is not part of `pnpm test`, and
 * it is not wired into CI. It is a thing you run once, by hand, after applying
 * the migration.
 *
 * IT DELETES EVERYTHING IT CREATES. Both tenants and all four test users are
 * removed in the finally block, including on failure. The ids it generates are
 * prefixed so a partial run is recognisable and easy to clean up.
 *
 * Run:
 *   node --env-file=.env.local scripts/rls-settling-test.mjs
 */

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and');
  console.error('SUPABASE_SERVICE_ROLE_KEY. The service key is required to create the');
  console.error('throwaway tenants; nothing here works without it.');
  process.exit(1);
}

/*
 * A hyphen, not an underscore. This stamp goes into the organisation slug, and
 * `organizations_slug_check` is `^[a-z0-9][a-z0-9-]{1,62}$`, so an underscore
 * makes the very first insert fail with 23514 and the test never reaches an
 * assertion. It looked fine because this script had never been run against a
 * database: the migration was written, checked, and left unapplied, so the only
 * thing that had ever tested this code was its author reading it.
 */
const STAMP = `settle-${Date.now()}`;
const rest = `${url}/rest/v1`;
const auth = `${url}/auth/v1`;

const admin = (path, init = {}) =>
  fetch(`${rest}/${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });

const asUser = (path, token, init = {}) =>
  fetch(`${rest}/${path}`, {
    ...init,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

let failures = 0;
let passes = 0;

function check(name, ok, detail) {
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

async function signIn(email, password) {
  const response = await fetch(`${auth}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

/** Creates a confirmed user through the service key, which skips email. */
async function createUser(email, password, role) {
  const response = await fetch(`${auth}/admin/users`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    }),
  });
  if (!response.ok) {
    throw new Error(`user create failed for ${email}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).id;
}

async function main() {
  console.log(`Project: ${new URL(url).host}`);
  console.log(`Stamp:   ${STAMP}\n`);

  // Does the schema exist at all?
  const probe = await admin('profiles?select=id&limit=1');
  if (!probe.ok) {
    console.error(`The profiles table is not there (HTTP ${probe.status}).`);
    console.error('Apply the migration first: node scripts/check-remote-db.mjs will say so too.');
    process.exit(1);
  }

  const created = { users: [], orgs: [], classes: [] };

  try {
    // ---- build two separate schools -------------------------------------
    for (const suffix of ['a', 'b']) {
      const owner = await createUser(`${STAMP}_owner_${suffix}@liko.test`, 'Settle-Test-2026', 'instructor');
      created.users.push(owner);

      const org = await admin('organizations', {
        method: 'POST',
        body: JSON.stringify({ name: `${STAMP}_school_${suffix}`, slug: `${STAMP}-${suffix}`, billing_email: `billing_${suffix}@liko.test` }),
      });
      const orgBody = await org.json();
      const orgId = orgBody?.[0]?.id;
      if (!orgId) throw new Error(`could not create org ${suffix}: ${JSON.stringify(orgBody)}`);
      created.orgs.push(orgId);

      const membership = await admin('memberships', {
        method: 'POST',
        body: JSON.stringify({ user_id: owner, org_id: orgId, role: 'instructor', status: 'active' }),
      });
      if (!membership.ok) throw new Error(`membership ${suffix}: ${await membership.text()}`);

      /*
       * No `org_id`. `classes` genuinely does not have one: the tenancy check
       * resolves through `memberships`, not through a column that is never
       * written. Sending it anyway fails with PGRST204, which is PostgREST
       * correctly refusing to invent a column the table does not have.
       */
      const klass = await admin('classes', {
        method: 'POST',
        body: JSON.stringify({
          owner_id: owner,
          name: `${STAMP}_class_${suffix}`,
          code: `${STAMP}-${suffix}`.toUpperCase().slice(0, 40),
          level: 'k12',
          meets_per_week: 3,
        }),
      });
      const classBody = await klass.json();
      const classId = classBody?.[0]?.id;
      if (!classId) throw new Error(`could not create class ${suffix}: ${JSON.stringify(classBody)}`);
      created.classes.push(classId);
    }

    const [ownerA] = created.users;
    const [classA, classB] = created.classes;

    // A student in school A, with a login linked to their record. The link is
    // what the visibility policies hang off, so it has to exist for the test to
    // mean anything.
    const studentId = await createUser(`${STAMP}_student@liko.test`, 'Settle-Test-2026', 'student');
    created.users.push(studentId);

    /*
     * The profile row is created by `handle_new_user` when the auth user is
     * made, not by this script. It has to exist before anything below means
     * anything, and proving it exists matters more than it looks: a PATCH
     * against a row that is not there returns HTTP 200 with an empty array,
     * because zero rows matched is not an error. A missing profile would
     * therefore sail straight through the self-escalation check below and
     * report a critical vulnerability that is not one. Assert it first so a
     * broken trigger reads as a setup failure.
     */
    /*
     * `?id=eq.` in the path, not `id` in the body. PostgREST refuses an UPDATE
     * without a WHERE clause outright, so the body-based form this used to send
     * failed with 21000 before reaching the database.
     */
    const profilePatch = await admin(`profiles?id=eq.${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ org_id: created.orgs[0], role: 'student' }),
    });
    if (!profilePatch.ok) throw new Error(`profile patch: ${await profilePatch.text()}`);
    const patched = await profilePatch.json();
    if (!Array.isArray(patched) || patched.length !== 1) {
      throw new Error(
        `no profile row exists for the new student (the PATCH returned ${JSON.stringify(patched)}). ` +
          'handle_new_user is not firing, so the student has no profile and every check below is meaningless.',
      );
    }

    /*
     * No `org_id` here either, for the same reason the class insert has none:
     * the live `students` table has no such column. Tenancy resolves through
     * `owner_id` and, for the student, through `account_id`. Sending a column
     * that does not exist fails with PGRST204 rather than being ignored, which
     * is PostgREST refusing to guess.
     */
    const studentRow = await admin('students', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classA,
        owner_id: ownerA,
        full_name: `${STAMP} student`,
        initials: 'SS',
        account_id: studentId,
      }),
    });
    if (!studentRow.ok) throw new Error(`student row: ${await studentRow.text()}`);

    const token = await signIn(`${STAMP}_student@liko.test`, 'Settle-Test-2026');

    // ---- the two things that were exploitable ---------------------------

    console.log('Critical: self-promotion to admin');
    const escalate = await asUser(`profiles?id=eq.${studentId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    const escalateBody = await escalate.text();
    check(
      'a signed-in student cannot set their own role to admin',
      !escalate.ok,
      escalate.ok
        ? `the PATCH SUCCEEDED with ${escalate.status}: ${escalateBody}. This is the exact vulnerability the column grant exists to close.`
        : `refused: ${escalate.status} ${escalateBody.slice(0, 120)}`,
    );

    // Confirm by reading it back rather than trusting the error alone.
    const roles = await asUser(`profiles?id=eq.${studentId}&select=role`, token);
    const roleRows = roles.ok ? await roles.json() : [];
    check(
      'and the stored role is still student',
      Array.isArray(roleRows) && roleRows[0]?.role === 'student',
      `read back: ${JSON.stringify(roleRows).slice(0, 160)}`,
    );

    console.log('\nHigh: cross-tenant class read');
    const classes = await asUser('classes?select=id,name', token);
    const visible = classes.ok ? await classes.json() : [];
    const names = Array.isArray(visible) ? visible.map((row) => row.name) : [];

    check(
      'a student sees their own class',
      names.includes(`${STAMP}_class_a`),
      `saw: ${JSON.stringify(names)}`,
    );
    check(
      "a student does NOT see another school's class",
      !names.includes(`${STAMP}_class_b`),
      `SAW THE OTHER TENANT: ${JSON.stringify(names)}. This is a cross-school data leak.`,
    );

    // ---- and the link itself -------------------------------------------

    /*
     * Filter on `account_id`, not `id`.
     *
     * `students.id` is the row's own generated uuid. `studentId` is the auth
     * user's uuid. They are different values, so `id=eq.<studentId>` matched
     * zero rows and PostgREST answered 204 No Content, which the check below
     * used to read as "the PATCH succeeded" and report a vulnerability that
     * was never there. A 204 on a PATCH means "nothing matched", which is not
     * the same as "the write was allowed".
     *
     * And the assertion is on the resulting state, not on the status code. RLS
     * refuses this write by making the row invisible to the student, which
     * Postgres reports as zero rows updated rather than as an error. Demanding
     * an HTTP error here would have been demanding the wrong thing; the only
     * question worth asking is whether the link moved.
     */
    console.log('\nServer-owned link');
    const steal = await asUser(`students?account_id=eq.${studentId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ account_id: ownerA }),
    });
    const stealStatus = steal.ok ? `answered ${steal.status}` : `refused ${steal.status}`;

    const afterSteal = await asUser(`students?account_id=eq.${studentId}&select=account_id`, token);
    const afterRows = afterSteal.ok ? await afterSteal.json() : [];
    const stillLinked = Array.isArray(afterRows) && afterRows[0]?.account_id === studentId;

    check(
      'a student cannot re-point their own record at another account',
      stillLinked,
      stillLinked
        ? `the write was ${stealStatus} and the link is unchanged, as it must be`
        : `the write ${stealStatus} and the link now reads ${JSON.stringify(afterRows).slice(0, 160)}. ` +
            'The account link is server-owned and a student must not be able to move it.',
    );

    // A linked account reading its own record is the one thing it should see.
    const ownRow = await asUser('students?select=full_name', token);
    const ownRows = ownRow.ok ? await ownRow.json() : [];
    check(
      'a student CAN read its own record',
      Array.isArray(ownRows) && ownRows.length === 1,
      `saw ${Array.isArray(ownRows) ? ownRows.length : '?'} rows`,
    );
  } catch (error) {
    failures += 1;
    console.error(`\nSetup failed: ${error.message}`);
  } finally {
    console.log('\nCleaning up');
    for (const id of created.users) {
      await fetch(`${auth}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: service, Authorization: `Bearer ${service}` },
      }).catch(() => {});
    }
    for (const id of created.classes) {
      await admin(`classes?id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
    }
    for (const id of created.orgs) {
      await admin(`memberships?org_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await admin(`organizations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
    }
    console.log('Done.');
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main();