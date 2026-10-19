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
  // ---- flashcards ----------------------------------------------------
    /*
     * The flashcard policies were applied to the live database and had never
     * been run against it. `check:sql` proves they parse, that RLS is enabled on
     * all three tables, and that every policy is dropped before it is created.
     * None of that is the claim that matters. The claim is that a student's
     * study record is invisible to everybody else, and that claim is exactly
     * what reading SQL cannot tell you: `check:sql` would pass just as happily
     * against a policy that granted everything to `authenticated`.
     *
     * So the claims are asserted here, and asserted in both directions. A test
     * that only proves the grant would pass if the table were simply readable
     * by everyone, which is the failure mode that matters.
     */
    console.log('\nFlashcards: a study record belongs to one student');

    const rosterRows = await admin(`students?select=id&account_id=eq.${studentId}`);
    const rosterId = rosterRows.ok ? (await rosterRows.json())?.[0]?.id : undefined;
    if (!rosterId) throw new Error('could not read back the student roster row');

    const otherRoster = await admin('students', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classB,
        owner_id: ownerA,
        full_name: `${STAMP} other student`,
        initials: 'OS',
        account_id: null,
      }),
    });
    const otherRosterId = otherRoster.ok ? (await otherRoster.json())?.[0]?.id : undefined;
    if (!otherRosterId) throw new Error(`other roster row: ${await otherRoster.text()}`);

    const deck = await admin('flashcard_decks', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: ownerA,
        class_id: classA,
        title: `${STAMP} deck`,
        subject: '',
        description: '',
        shared_at: new Date().toISOString(),
      }),
    });
    const deckId = deck.ok ? (await deck.json())?.[0]?.id : undefined;
    if (!deckId) throw new Error(`deck: ${await deck.text()}`);

    const card = await admin('flashcards', {
      method: 'POST',
      body: JSON.stringify({
        deck_id: deckId,
        owner_id: ownerA,
        front: `${STAMP} front`,
        back: `${STAMP} back`,
      }),
    });
    const cardId = card.ok ? (await card.json())?.[0]?.id : undefined;
    if (!cardId) throw new Error(`card: ${await card.text()}`);

    // Grants first. Without these, every denial below would also pass against a
    // table nobody can read at all, which is how a policy that is wrong in the
    // safe direction still manages to break the product.
    const deckRead = await asUser(`flashcard_decks?id=eq.${deckId}&select=title`, token);
    const deckRows = deckRead.ok ? await deckRead.json() : [];
    check(
      'a student CAN read a deck shared into their class',
      Array.isArray(deckRows) && deckRows.length === 1,
      `status ${deckRead.status}, saw ${Array.isArray(deckRows) ? deckRows.length : '?'} rows`,
    );

    const cardRead = await asUser(`flashcards?deck_id=eq.${deckId}&select=front`, token);
    const cardRows = cardRead.ok ? await cardRead.json() : [];
    check(
      'a student CAN read the cards in it',
      Array.isArray(cardRows) && cardRows.length === 1,
      `status ${cardRead.status}, saw ${Array.isArray(cardRows) ? cardRows.length : '?'} rows`,
    );

    const ownProgress = await asUser('flashcard_progress', token, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ card_id: cardId, student_id: rosterId, status: 'learning' }),
    });
    check(
      'a student CAN record a review against their own record',
      ownProgress.ok,
      ownProgress.ok
        ? `wrote ${ownProgress.status}`
        : `REFUSED THEIR OWN REVIEW: ${ownProgress.status} ${(await ownProgress.text()).slice(0, 140)}. A study record nobody can write is a broken product.`,
    );

    // The denial the whole three-table design exists for.
    const stolenProgress = await asUser('flashcard_progress', {
      token,
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ card_id: cardId, student_id: otherRosterId, status: 'review' }),
    });
    check(
      'a student CANNOT record a review against another student',
      !stolenProgress.ok,
      stolenProgress.ok
        ? `THE WRITE SUCCEEDED with ${stolenProgress.status}. A student can write another student's study record.`
        : `refused: ${stolenProgress.status}`,
    );

    // A row that genuinely belongs to somebody else, so the read below is a
    // read and not an empty table.
    await admin('flashcard_progress', {
      method: 'POST',
      body: JSON.stringify({ card_id: cardId, student_id: otherRosterId, status: 'review' }),
    });
    const othersProgress = await asUser('flashcard_progress?select=student_id', token);
    const seenProgress = othersProgress.ok ? await othersProgress.json() : [];
    const leaked = Array.isArray(seenProgress)
      ? seenProgress.filter((row) => row.student_id === otherRosterId)
      : [true];
    check(
      "a student CANNOT read another student's study record",
      Array.isArray(seenProgress) && leaked.length === 0,
      Array.isArray(seenProgress) && leaked.length === 0
        ? `saw only their own ${seenProgress.length} row(s)`
        : `SAW ${JSON.stringify(seenProgress).slice(0, 160)}. Another student's review history is visible.`,
    );

    const stolenCard = await asUser('flashcards', {
      token,
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ deck_id: deckId, front: 'mine', back: 'mine' }),
    });
    check(
      "a student CANNOT add a card to a deck they do not own",
      !stolenCard.ok,
      stolenCard.ok
        ? `THE INSERT SUCCEEDED with ${stolenCard.status}. Editing does not stay with the deck's author.`
        : `refused: ${stolenCard.status}`,
    );

    // ---- guardian ------------------------------------------------------
    /*
     * A GUARDIAN WHO CAN RESOLVE NOBODY IS NOT A SAFELY RESTRICTED ROLE.
     *
     * This section did not exist, and that is the whole finding. Every other role
     * in this script is asserted in both directions; the guardian was never
     * asserted at all, so a guardian who could read nothing at all passed every
     * gate in this project. Both surrounding gates are structurally incapable of
     * noticing. `pnpm e2e` drives the fixtures, where no RLS applies. And
     * `pnpm verify:app` does sign a guardian in against the real database and
     * passes, because an empty state is a legitimate render: HTTP 200, a header,
     * a paragraph, no console error. Every check available was of the shape
     * "did it render?", and an empty state renders identically whether it is
     * correct or whether the role is walled off entirely.
     *
     * `guardian_email` is written by `scripts/seed.mjs` and read by no policy in
     * the schema — it appears exactly once in the migration, as a column
     * definition. The seat was granted `class:read` and `grade:read` at scope
     * `linked` by the RBAC matrix, and with nothing to resolve against, both
     * scopes matched no row: measured against production, a real guardian
     * session read 0 classes and 0 students.
     *
     * (An earlier draft of this comment repeated the seed's original reasoning,
     * that `guardian_email` gave the guardian seat "a different visibility path
     * from the student seat". That was the belief that caused the defect: it
     * read as a second path because it was described as one, and the column
     * nobody reads is indistinguishable from a column nobody needs. The seed has
     * since linked the seat by `account_id` instead, which is a separate fix to
     * the demo data and does not make this assertion redundant — the assertion is
     * about the POLICY, and it holds whoever chooses the route.)
     *
     * THE INVARIANT BELOW IS OUTCOME-INDEPENDENT. Two repairs are on the table
     * and this assertion is satisfied by either: point the guardian seat at
     * `account_id` the way the student seat already is, or add a policy branch
     * joining `guardian_email` to the caller's own profile email. It encodes no
     * preference between them, because choosing between them is a policy decision
     * about a minor's data and not one a test should make on its own. What it
     * does say is that "can read nothing" is not an acceptable resting state for
     * a role the RBAC matrix grants `linked` scope.
     */
    console.log('\nGuardian: a linked scope that reaches a child');

    const guardianId = await createUser(`${STAMP}_guardian@liko.test`, 'Settle-Test-2026', 'guardian');
    created.users.push(guardianId);

    const guardianProfile = await admin(`profiles?id=eq.${guardianId}`, {
      method: 'PATCH',
      body: JSON.stringify({ org_id: created.orgs[0], role: 'guardian' }),
    });
    if (!guardianProfile.ok) throw new Error(`guardian profile: ${await guardianProfile.text()}`);

    /*
     * THE CHILD IS LINKED BOTH WAYS, AND THAT IS THE POINT OF THE FIXTURE.
     *
     * I first wrote this row with `account_id: null` and `guardian_email` set,
     * with a comment claiming the null was the point: that a guardian is reached
     * by address rather than by the child's login. That comment was an untested
     * claim and it was wrong. It encoded ONE of the two candidate repairs as if
     * it were the invariant, so the test would have gone red against a perfectly
     * correct product that took the other route. A test that picks the answer and
     * then calls itself a check is worse than no test, because it is green until
     * someone fixes the bug correctly.
     *
     * Setting BOTH columns makes the assertion genuinely outcome-independent:
     *
     *   repair (a) seat linked by account_id  -> the account_id policy resolves it
     *   repair (b) policy reads guardian_email -> the email policy resolves it
     *
     * Either one makes the guardian reach its child. Neither is required, so the
     * assertion tests the property that actually matters — a `linked` scope is
     * not an empty scope — and leaves the choice to whoever owns the policy
     * decision. `scripts/seed.mjs` currently takes route (a); that is a
     * decision recorded there, not a constraint asserted here.
     *
     * The leaked-rows half below is what keeps this honest: it fails for the
     * repair that "just widen `students` to every linked account", which is the
     * one way to make this pass while breaking the role.
     */
    const guardianChild = await admin('students', {
      method: 'POST',
      body: JSON.stringify({
        class_id: classA,
        owner_id: ownerA,
        full_name: `${STAMP} guardian child`,
        initials: 'GC',
        account_id: guardianId,
        guardian_email: `${STAMP}_guardian@liko.test`,
      }),
    });
    if (!guardianChild.ok) throw new Error(`guardian child: ${await guardianChild.text()}`);
    const guardianChildId = (await guardianChild.json())?.[0]?.id;

    const guardianToken = await signIn(`${STAMP}_guardian@liko.test`, 'Settle-Test-2026');

    const guardianSees = await asUser('students?select=id,full_name,guardian_email', guardianToken);
    const guardianRows = guardianSees.ok ? await guardianSees.json() : [];
    const linkedEmail = `${STAMP}_guardian@liko.test`;
    const resolvedItsChild =
      Array.isArray(guardianRows) &&
      guardianRows.length === 1 &&
      guardianRows[0]?.guardian_email === linkedEmail &&
      guardianRows[0]?.id === guardianChildId;

    check(
      'a guardian CAN resolve the child it is linked to',
      resolvedItsChild,
      `a guardian session read ${Array.isArray(guardianRows) ? guardianRows.length : '?'} student rows` +
        `${Array.isArray(guardianRows) ? `: ${JSON.stringify(guardianRows).slice(0, 200)}` : ''}. ` +
        'Zero is not a safe restriction here: the RBAC matrix grants this role a `linked` scope, so the child it ' +
        'is linked to should be reachable. Either the seat is linked the way the student seat is, or a policy ' +
        'reads guardian_email, and until one of those happens this role demonstrates nothing in production. ' +
        'Confirmed load-bearing: setting the fixture `account_id` to null reproduces this exact failure, which is ' +
        'the state the seed shipped for the demo guardian seat.',
    );

    /*
     * The other direction, and the half that would matter most if the repair goes
     * wrong: a guardian must reach its own child and NOT the student whose login
     * is linked by `account_id`. A repair that simply widens the students policy
     * to admit every linked account would make the check above pass and this one
     * fail, which is the whole reason both are here.
     */
    const leakedStudent =
      Array.isArray(guardianRows) &&
      guardianRows.some((row) => row.guardian_email !== linkedEmail);

    check(
      'a guardian cannot see a student it is not linked to',
      !leakedStudent,
      leakedStudent
        ? `the guardian read a row that is not linked to it: ${JSON.stringify(guardianRows).slice(0, 200)}. ` +
            'Widening the students policy to admit every linked account would produce exactly this.'
        : `saw ${Array.isArray(guardianRows) ? guardianRows.length : '?'} row(s), none of them another family's child`,
    );

    /*
     * THE OTHER SIX TABLES THE MATRIX PROMISED, each in both directions.
     *
     * Measured before this section existed: a guardian's own token read one
     * class, one roster row and fifteen timetable entries, and zero from
     * `assessments`, `grades`, `student_history`, `lesson_plans`, `attendance`
     * and `calendar_events`. Three tables of nine. The RBAC matrix grants that
     * account `class:read`, `grade:read` and `history:read` at scope `linked`,
     * so the database was promising less than the matrix did and `/grades`
     * rendered empty for a role the product calls working.
     *
     * EVERY ASSERTION HERE COMPARES THE EXACT SET OF IDS, never a count. A
     * count is satisfied by a guardian who can read every row in the table,
     * which is the failure that would matter, so counting would be the wrong
     * instrument for exactly the question being asked. Exact-set comparison
     * fails when the row is absent AND when a row that is not this guardian's
     * turns up.
     */
    const insertRow = async (table, body) => {
      const res = await admin(table, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
      return (await res.json())?.[0]?.id;
    };

    /*
     * A second child in the SAME class with no login at all. Every assertion
     * below is only meaningful because this row exists to be the row that must
     * not come back: a policy that admitted the whole class would return one
     * row for this guardian's child and still pass a count of one.
     */
    const otherChildId = await insertRow('students', {
      class_id: classA,
      owner_id: ownerA,
      full_name: `${STAMP} other child`,
      initials: 'OC',
    });

    const ownAssessmentId = await insertRow('assessments', {
      class_id: classA,
      owner_id: ownerA,
      title: `${STAMP} own assessment`,
    });
    await insertRow('assessments', {
      class_id: classB,
      owner_id: created.users[1],
      title: `${STAMP} other school assessment`,
    });

    const ownGradeId = await insertRow('grades', {
      assessment_id: ownAssessmentId,
      student_id: guardianChildId,
      owner_id: ownerA,
      score: 7,
      max_score: 10,
    });
    await insertRow('grades', {
      assessment_id: ownAssessmentId,
      student_id: otherChildId,
      owner_id: ownerA,
      score: 3,
      max_score: 10,
    });

    const ownAttendanceId = await insertRow('attendance', {
      class_id: classA,
      student_id: guardianChildId,
      owner_id: ownerA,
      date: '2026-03-04',
      status: 'present',
      note: `${STAMP} teacher note`,
    });
    await insertRow('attendance', {
      class_id: classA,
      student_id: otherChildId,
      owner_id: ownerA,
      date: '2026-03-04',
      status: 'absent',
    });

    const ownHistoryId = await insertRow('student_history', {
      student_id: guardianChildId,
      owner_id: ownerA,
      event_type: 'note',
    });
    await insertRow('student_history', {
      student_id: otherChildId,
      owner_id: ownerA,
      event_type: 'note',
    });

    const ownEventId = await insertRow('calendar_events', {
      owner_id: ownerA,
      student_id: guardianChildId,
      title: `${STAMP} own event`,
      starts_at: '2026-03-04T09:00:00Z',
      kind: 'event',
      created_by_role: 'instructor',
    });
    await insertRow('calendar_events', {
      owner_id: ownerA,
      student_id: otherChildId,
      title: `${STAMP} other event`,
      starts_at: '2026-03-04T09:00:00Z',
      kind: 'event',
      created_by_role: 'instructor',
    });

    const ownPlanId = await insertRow('lesson_plans', {
      class_id: classA,
      owner_id: ownerA,
      title: `${STAMP} own plan`,
    });
    await insertRow('lesson_plans', {
      class_id: classB,
      owner_id: created.users[1],
      title: `${STAMP} other school plan`,
    });

    const guardianReadsExactly = async (table, expectedId, label) => {
      const res = await asUser(`${table}?select=id`, guardianToken);
      const rows = res.ok ? await res.json() : [];
      const ids = (Array.isArray(rows) ? rows : []).map((row) => row.id);
      check(
        label,
        ids.length === 1 && ids[0] === expectedId,
        `a guardian session on ${table} read ${ids.length} row(s)` +
          `${ids.length ? `: ${JSON.stringify(ids).slice(0, 300)}` : ''}` +
          `, and should have read exactly [${expectedId}]. ` +
          'Zero is the state the RBAC matrix promises and the schema did not deliver. More than one means the ' +
          'policy is admitting rows this guardian has no link to, which is the half of this that would matter.',
      );
    };

    await guardianReadsExactly('grades', ownGradeId, 'a linked guardian reads its child\'s mark and nobody else\'s');
    await guardianReadsExactly('attendance', ownAttendanceId, 'a linked guardian reads its child\'s attendance and nobody else\'s');
    await guardianReadsExactly('student_history', ownHistoryId, 'a linked guardian reads its child\'s history and nobody else\'s');
    await guardianReadsExactly('calendar_events', ownEventId, 'a linked guardian reads its child\'s calendar entry and nobody else\'s');
    await guardianReadsExactly('assessments', ownAssessmentId, 'a linked guardian reads its class\'s assessments and not another school\'s');
    await guardianReadsExactly('lesson_plans', ownPlanId, 'a linked guardian reads its class\'s lesson plans and not another school\'s');

    /*
     * READING A CHILD'S CALENDAR IS NOT THE SAME RIGHT AS WRITING TO IT.
     *
     * `calendar_events` was the one table in the measured map whose linked
     * access already worked, and the reason is worth recording: its policy was
     * written out separately from the `own rows` loop and carried the roster
     * join already. The audit reported it as a zero because the seeded rows had
     * no `student_id`, so the map recorded a data fact as if it were a policy
     * fact. Which is why the assertion above was written to pass before any
     * migration was applied - it did, and that is what exposed the error.
     *
     * What that policy ALSO did was grant `for all`, carrying the same roster
     * join in `using` and in `with check`, while its own comment said the
     * requirement was that the student "needs to see it". So a parent could
     * edit and delete an entry the teacher had written about their child. That
     * is now split into a select policy and three owner-only write policies.
     *
     * THREE ASSERTIONS, NOT ONE. The two refusals alone would also be satisfied
     * by a policy that refuses everyone, which is why the counterweight at the
     * end matters: the teacher who wrote the entry must still be able to remove
     * it. Refusal that cannot be distinguished from breakage is not a policy.
     *
     * NOTE ON HOW A REFUSAL LOOKS OVER POSTGREST. A DELETE or PATCH whose filter
     * matches nothing RLS-visible returns 200 with an empty body. It is not an
     * error. So none of these assert on a status code; each one reads the row
     * back afterwards and asserts on what is still there. Asserting on the
     * status would pass even if the write had gone through.
     */
    const ownerToken = await signIn(`${STAMP}_owner_a@liko.test`, 'Settle-Test-2026');

    const readBackTitle = async (eventId) => {
      const res = await asUser(`calendar_events?id=eq.${eventId}&select=title`, ownerToken);
      const rows = res.ok ? await res.json() : [];
      return rows?.[0]?.title ?? null;
    };

    const originalTitle = `${STAMP} own event`;
    const rewrittenTitle = `${STAMP} rewritten by a parent`;

    await asUser(`calendar_events?id=eq.${ownEventId}`, guardianToken, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ title: rewrittenTitle }),
    });
    const titleAfterEdit = await readBackTitle(ownEventId);
    check(
      'a linked guardian CANNOT edit a calendar entry its child\'s teacher wrote',
      titleAfterEdit !== rewrittenTitle,
      `the title after a parent's PATCH is ${JSON.stringify(titleAfterEdit)}. If it reads ` +
        `${JSON.stringify(rewrittenTitle)} the 'for all' policy is still in force, and a parent can alter a ` +
        "teacher's own record about their child.",
    );

    await asUser(`calendar_events?id=eq.${ownEventId}`, guardianToken, { method: 'DELETE' });
    const titleAfterDelete = await readBackTitle(ownEventId);
    check(
      'a linked guardian CANNOT delete a calendar entry its child\'s teacher wrote',
      titleAfterDelete !== null,
      `the entry is gone after a parent's DELETE, so a parent can remove a teacher's record about their child. ` +
        'A 200 from PostgREST here is not evidence that the delete was refused.',
    );

    // The counterweight. Created after the read assertions above so it cannot
    // change the row counts they compare against.
    const ownerOwnEventId = await insertRow('calendar_events', {
      owner_id: ownerA,
      student_id: null,
      title: `${STAMP} teacher's own event`,
      starts_at: '2026-03-06T09:00:00Z',
      kind: 'event',
      created_by_role: 'instructor',
    });
    await asUser(`calendar_events?id=eq.${ownerOwnEventId}`, ownerToken, { method: 'DELETE' });
    const ownerTitleAfterDelete = await readBackTitle(ownerOwnEventId);
    check(
      'the teacher who wrote a calendar entry CAN still delete their own',
      ownerTitleAfterDelete === null,
      ownerTitleAfterDelete !== null
        ? `the teacher still holds the entry after their own DELETE (${JSON.stringify(ownerTitleAfterDelete)}), ` +
          'so the owner-only write policies refuse more than cross-owner writes and the calendar is broken for ' +
          'the person who actually uses it.'
        : 'removed by its owner, as it should be',
    );

    /*
     * THE ADMINISTRATOR'S BLIND SPOT, ASSERTED.
     *
     * The owner was asked, in round seventeen of the audit, whether an
     * administrator may read a child's school record, and chose to keep the
     * surface narrow: an administrator manages people, classes, invites, seats
     * and the organisation's own settings, while a child's guardian contact,
     * attendance, behaviour notes and grades are the teacher's and the family's
     * business.
     *
     * The database already behaved that way. `classes` carries an "admin reads
     * classes" policy, `memberships` and `profiles` carry admin policies, and
     * `students` carries none: it admits the class owner through `owner_id` and
     * the linked family through `account_id`, and nobody else.
     *
     * WHICH MEANS THE BOUNDARY WAS NOT ENFORCED BY ANY CHECK. It was enforced
     * by the ABSENCE of a policy, and an absence is invisible to every gate in
     * this repository. The obvious future edit, "admins should be able to see
     * the roster", would have gone green everywhere, and the comment in the
     * migration warning against it is a comment, not a gate. A decision about
     * children's data that is only written down is one edit away from being
     * undone.
     *
     * So it is asserted here.
     *
     * THE POSITIVE CONTROL COMES FIRST, AND IT IS NOT OPTIONAL. A seat that can
     * read nothing at all would also "pass" a refusal assertion, and the
     * failure would be silent. The administrator below must demonstrably read
     * the organisation's classes and members, so that the refusal that follows
     * is known to be about the children and not about a broken token.
     */
    console.log('\nAdministrator: manages the school, not the children');

    const adminId = await createUser(`${STAMP}_admin@liko.test`, 'Settle-Test-2026', 'admin');
    created.users.push(adminId);

    const adminProfile = await admin(`profiles?id=eq.${adminId}`, {
      method: 'PATCH',
      body: JSON.stringify({ org_id: created.orgs[0], role: 'admin' }),
    });
    if (!adminProfile.ok) throw new Error(`admin profile: ${await adminProfile.text()}`);

    /*
     * The membership row, not just the profile role. `is_org_admin` and
     * `is_admin_sharing_org_with` both resolve through `memberships`, and the
     * migration says so in as many words: a tenancy check built on
     * `profiles.org_id` would match nothing. A fixture that set only the profile
     * would produce an administrator with no organisation, who reads nothing,
     * and every refusal assertion below would pass for the wrong reason.
     */
    const adminMembership = await admin('memberships', {
      method: 'POST',
      body: JSON.stringify({
        user_id: adminId,
        org_id: created.orgs[0],
        role: 'admin',
        status: 'active',
      }),
    });
    if (!adminMembership.ok) throw new Error(`admin membership: ${await adminMembership.text()}`);

    const adminToken = await signIn(`${STAMP}_admin@liko.test`, 'Settle-Test-2026');

    const adminClasses = await asUser('classes?select=id', adminToken);
    const adminClassRows = adminClasses.ok ? await adminClasses.json() : [];
    const adminSawItsClass =
      Array.isArray(adminClassRows) && adminClassRows.some((row) => row.id === classA);

    check(
      'an administrator CAN read the classes of its own organisation',
      adminSawItsClass,
      adminClasses.ok
        ? `the administrator read ${adminClassRows.length} class row(s)` +
            `${adminSawItsClass ? '' : `, and classA (${classA}) was not among them. `}` +
            'A refusal assertion below means nothing unless this one passes first: a seat that can read nothing at all ' +
            'would also pass a "cannot read a child" check, and the failure would be silent.'
        : `the read was refused with ${adminClasses.status}: ${(await adminClasses.text()).slice(0, 160)}`,
    );

    const adminMembers = await asUser('memberships?select=user_id', adminToken);
    const adminMemberRows = adminMembers.ok ? await adminMembers.json() : [];
    check(
      'an administrator CAN read the members of its own organisation',
      Array.isArray(adminMemberRows) && adminMemberRows.length > 0,
      adminMembers.ok
        ? `the administrator read ${adminMemberRows.length} membership row(s)`
        : `the read was refused with ${adminMembers.status}: ${(await adminMembers.text()).slice(0, 160)}`,
    );

    /*
     * THE DECISIVE ONE. The roster is not empty: this fixture has created
     * several student rows by now, in classes the administrator can see, so
     * "the administrator read no rows" is a statement about the policy and not
     * about an empty table.
     *
     * AND IT IS NOT A TAUTOLOGY, BECAUSE THIS VERY RUN PROVES IT. Two sections
     * above, a guardian whose seat is linked through `account_id` read exactly
     * one student row from this same table, by this same code, with this same
     * service. So the query is live, the policies do admit a seat that they
     * admit, and the difference between that seat and the administrator is the
     * linkage and nothing else. An assertion that said "the administrator read
     * no rows" against a table that always returns no rows would be
     * indistinguishable from this one, so the guardian's single row is what
     * gives this check its meaning.
     */
    const adminRoster = await asUser('students?select=id,full_name', adminToken);
    const adminRosterRows = adminRoster.ok ? await adminRoster.json() : [];
    const adminSawAnyChild = Array.isArray(adminRosterRows) && adminRosterRows.length > 0;

    check(
      'an administrator CANNOT read a child record',
      !adminSawAnyChild,
      adminSawAnyChild
        ? `the administrator read ${adminRosterRows.length} student row(s), including one it should not have: ` +
            `${JSON.stringify(adminRosterRows).slice(0, 200)}. The students policy admits the class owner through ` +
            'owner_id and the linked family through account_id, and nobody else. Widening it to an org admin is a ' +
            'decision that has to be made on purpose, with a migration, a settling test and a new assertion, and the ' +
            'owner has already answered it: keep the surface narrow.'
        : `the administrator read ${Array.isArray(adminRosterRows) ? adminRosterRows.length : '?'} student row(s), ` +
            'none of them a child, while the classes and members above were readable and the linked guardian in ' +
            'this same run read exactly one. The roster rows it could not reach include the student it created ' +
            `(${rosterId}) and the other teacher's (${otherRosterId}).`,
    );

    /*
     * THE PROOF THAT THE REFUSAL ABOVE MEANS SOMETHING.
     *
     * The check above says the administrator read no child record. A check like
     * that is worth nothing if the read would have been empty anyway, and there
     * is no way to tell from the output alone. So the fixture proves it, by
     * moving the one thing that decides the answer.
     *
     * The `students` policy admits a seat through `account_id`. This links the
     * child to the administrator's seat for a moment, reads the same table with
     * the same token, and then puts the link back. If the administrator can
     * suddenly see the child, then the refusal was the POLICY and not a broken
     * query, a stale token or an empty table.
     *
     * THE SERVICE KEY IS USED TO MOVE THE LINK, AND THAT IS ALLOWED ON PURPOSE.
     * The `protect_student_account_link` trigger fires only when `auth.uid()`
     * is not null, so the service role writes straight through it. The row is
     * one this script created and is deleted with its class in the cleanup
     * below, and the link is restored in a `finally` so a failed probe cannot
     * leave the fixture in a strange state.
     */
    const originalLink = await admin(`students?select=account_id&id=eq.${rosterId}`);
    const originalAccountId = originalLink.ok
      ? ((await originalLink.json())?.[0]?.account_id ?? null)
      : undefined;
    if (originalAccountId === undefined) {
      throw new Error('could not read back the student link to restore it');
    }

    let probeSawTheChild = 0;
    try {
      const relink = await admin(`students?id=eq.${rosterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ account_id: adminId }),
      });
      if (!relink.ok) throw new Error(`relink: ${await relink.text()}`);

      const probe = await asUser('students?select=id', adminToken);
      const probeRows = probe.ok ? await probe.json() : [];
      probeSawTheChild = Array.isArray(probeRows)
        ? probeRows.filter((row) => row.id === rosterId).length
        : 0;
    } finally {
      await admin(`students?id=eq.${rosterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ account_id: originalAccountId }),
      });
    }

    check(
      'the administrator refusal is load-bearing: a seat linked to the child CAN read it',
      probeSawTheChild === 1,
      probeSawTheChild === 1
        ? 'the same administrator token, the same query and the same policies read the child the moment the seat was ' +
            'linked, and lost it again when the link was put back. The refusal above is a policy outcome and not a ' +
            'broken query, a stale token or an empty table.'
        : `after linking the child to the administrator, the administrator still read ${probeSawTheChild} row(s) for ` +
            'it. The check above would then have been insensitive, and its PASS would have meant nothing.',
    );

    /*
     * The bell had no insert policy at all, which is why nothing could ever
     * appear in it. The policy now exists, and both halves of it are refusals
     * a student can attempt with the token this script already holds, so they
     * are asserted here rather than only in the fixture.
     *
     * The positive half needs a teacher token and a throwaway teacher, which
     * this script does not create; that is a genuine gap in the coverage and is
     * stated rather than papered over.
     */
    console.log('\nNotifications: nobody writes into their own inbox');

    const selfNote = await asUser('notifications', token, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: studentId,
        kind: 'schedule_updated',
        title: 'For myself',
        body: 'The policy refuses a row addressed to its own writer.',
        url: null,
      }),
    });
    check(
      'a student CANNOT write a notification into their own inbox',
      !selfNote.ok,
      selfNote.ok
        ? `THE INSERT SUCCEEDED with ${selfNote.status}. The user_id <> auth.uid() half of the rule is missing.`
        : `refused: ${selfNote.status}`,
    );

    const foreignNote = await asUser('notifications', token, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: rosterId,
        kind: 'class_linked',
        title: 'Somebody else',
        body: 'A student is on nobody roster.',
        url: null,
      }),
    });
    check(
      'a student CANNOT write a notification into any inbox',
      !foreignNote.ok,
      foreignNote.ok
        ? `THE INSERT SUCCEEDED with ${foreignNote.status}. A student owns no class, so the teaches-recipient half must refuse.`
        : `refused: ${foreignNote.status}`,
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