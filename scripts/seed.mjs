#!/usr/bin/env node
/**
 * Seed the Supabase project with demo data.
 *
 * Creates verified test accounts and a full workspace for each, so every screen
 * has something real in it and the at-risk sweep has something to fire on.
 *
 * Refuses to run against production. A seed that can silently create accounts
 * in a live tenant is a footgun, not a convenience.
 *
 *   node --env-file=.env.local scripts/seed.mjs
 *   LIKO_ALLOW_SEED_PRODUCTION=1 node --env-file=.env.local scripts/seed.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. The publishable key cannot create users.
 */

import { createClient } from '@supabase/supabase-js';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ulrjitekiylgepdyijsw.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set.\n' +
      'The publishable key cannot create users. Copy .env.example to .env.local\n' +
      'and fill in the service role key.',
  );
  process.exit(1);
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.LIKO_ALLOW_SEED_PRODUCTION !== '1'
) {
  console.error(
    'Refusing to seed with NODE_ENV=production.\n' +
      'Set LIKO_ALLOW_SEED_PRODUCTION=1 if you really mean it.',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = process.env.LIKO_SEED_PASSWORD ?? 'LikoDemo!2026';

const USERS = [
  {
    email: 'maya@liko.test',
    name: 'Maya Okonkwo',
    role: 'instructor',
    className: 'Chemistry, Period 2',
    classCode: 'CHEM-2',
    level: 'k12',
  },
  {
    email: 'dev@liko.test',
    name: 'Dev Ramanathan',
    role: 'admin',
    className: 'Science, Period 4',
    classCode: 'SCI-4',
    level: 'k12',
  },
  {
    email: 'ingrid@liko.test',
    name: 'Ingrid Halvorsen',
    role: 'instructor',
    className: 'Physical Science, Year 1',
    classCode: 'PHYS-1',
    level: 'university',
  },
  // The RBAC matrix has four roles. These two exist so every column of it is
  // reachable by a real account: without them the `student` and `guardian`
  // rows could only ever be tested by hand-editing a JWT.
  //
  // They own no class. `class:read` for both is scoped (`own` / `linked`) rather
  // than unrestricted, and a class they own would defeat the point of the test.
  { email: 'student@liko.test', name: 'Noor Haddad', role: 'student', teaches: false },
  { email: 'guardian@liko.test', name: 'Priya Raman', role: 'guardian', teaches: false },
];

const STUDENT_NAMES = [
  ['Ana Ferreira', 'AF'],
  ['Ben Osei', 'BO'],
  ['Clara Nwosu', 'CN'],
  ['Dmitri Volkov', 'DV'],
  ['Elif Demir', 'ED'],
  ['Farid Haddad', 'FH'],
  ['Grace Mbeki', 'GM'],
  ['Hana Ito', 'HI'],
];

function iso(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function dateOnly(daysAgo = 0) {
  return iso(daysAgo).slice(0, 10);
}

async function upsertUser(spec) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: spec.name },
  });

  if (error) {
    // Already seeded. Look the user up rather than failing the whole run, so
    // the script is safe to re-run.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === spec.email);
    if (!existing) throw error;
    return existing;
  }

  return data.user;
}

/**
 * The school the demo accounts belong to, and their seats in it.
 *
 * WHY THIS EXISTS. The per-account loop above gives every teacher a class and a
 * roster, which is what makes the teaching screens real. It left `organizations`
 * and `memberships` empty, and the admin console reads its member list straight
 * off the membership, so /admin rendered an empty state and the whole
 * multi-tenant surface was untested against the real database. An org with five
 * members in four different roles is what exercises it.
 */
const ORG = {
  name: 'Liko Demo School',
  slug: 'liko-demo-school',
  plan: 'school',
  seat_limit: 50,
  billing_email: 'billing@liko.test',
};

/** One seat per demo account, covering every role the RBAC matrix defines. */
const SEATS = [
  { email: 'dev@liko.test', role: 'admin' },
  { email: 'maya@liko.test', role: 'instructor' },
  { email: 'ingrid@liko.test', role: 'instructor' },
  { email: 'student@liko.test', role: 'student' },
  { email: 'guardian@liko.test', role: 'guardian' },
];

/**
 * Creates the organisation, seats everyone in it, and links the two read-only
 * accounts to real rows.
 *
 * The link is written on insert-time state rather than patched, because
 * `protect_student_account_link` refuses to let `account_id` change afterwards.
 * That trigger is doing its job: the account link is server-owned, so the seed
 * sets it once and leaves it alone on every later run.
 */
async function seedTenancy(accounts) {
  console.log('\nseeding the school and its seats ...');

  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', ORG.slug)
    .maybeSingle();

  let orgId = existingOrg?.id;

  if (orgId) {
    console.log(`  organization ${ORG.slug} already exists, reusing it`);
  } else {
    const { data: created, error } = await supabase
      .from('organizations')
      .insert(ORG)
      .select('id')
      .single();
    if (error) throw error;
    orgId = created.id;
    console.log(`  created ${ORG.name}`);
  }

  for (const seat of SEATS) {
    const userId = accounts.get(seat.email);
    if (!userId) continue;

    const { data: existing } = await supabase
      .from('memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      console.log(`  ${seat.email} is already seated as ${seat.role}`);
    } else {
      const { error } = await supabase
        .from('memberships')
        .insert({ org_id: orgId, user_id: userId, role: seat.role, status: 'active' });
      if (error) throw error;
      console.log(`  seated ${seat.email} as ${seat.role}`);
    }

    await supabase.from('profiles').update({ org_id: orgId }).eq('id', userId);
  }

  // A linked student account is what makes the student seat mean anything: the
  // visibility policies hang off `students.account_id`, so without a link the
  // student can sign in and see nothing at all.
  const studentUser = accounts.get('student@liko.test');
  const mayaUser = accounts.get('maya@liko.test');

  if (studentUser && mayaUser) {
    const { data: linked } = await supabase
      .from('students')
      .select('id')
      .eq('account_id', studentUser)
      .maybeSingle();

    if (linked) {
      console.log('  student account is already linked to a record');
    } else {
      const { data: candidate } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('owner_id', mayaUser)
        .is('account_id', null)
        .order('full_name')
        .limit(1)
        .maybeSingle();

      if (candidate) {
        await supabase.from('students').update({ account_id: studentUser }).eq('id', candidate.id);
        console.log(`  linked the student account to ${candidate.full_name}`);
      }
    }
  }

  // The guardian is reached by address rather than by account, so the student
  // and guardian seats exercise two different visibility paths.
  const guardianEmail = 'guardian@liko.test';
  const { data: guardianLinked } = await supabase
    .from('students')
    .select('id')
    .eq('guardian_email', guardianEmail)
    .maybeSingle();

  if (!guardianLinked && mayaUser) {
    const { data: candidate } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('owner_id', mayaUser)
      .neq('full_name', 'Ana Ferreira')
      .is('account_id', null)
      .order('full_name')
      .limit(1)
      .maybeSingle();

    if (candidate) {
      await supabase
        .from('students')
        .update({ guardian_email: guardianEmail })
        .eq('id', candidate.id);
      console.log(`  pointed the guardian seat at ${candidate.full_name}`);
    }
  }
}

/**
 * A second assessment that is actually scannable, and the questions on it.
 *
 * WHY A SECOND ASSESSMENT. The one seeded above exists to give the gradebook and
 * the at-risk sweep a spread of marks on a round scale. It has a maximum, a
 * weight and no content, because before questions existed there was nowhere to
 * put content. This one carries the eight questions a sheet is read against, and
 * its maximum is the sum of their points rather than a round hundred: a maximum
 * that disagrees with the questions is exactly how a scan ends up reporting a
 * mark out of a number nobody is being taught.
 *
 * WHY IT RUNS FOR EXISTING CLASSES TOO. The class-creation branch skips a class
 * it finds already there, and this was written inside that branch, so a second
 * run of the seed added nothing and the quiz silently never appeared. It is
 * idempotent on its own terms instead: it looks first, and does nothing if the
 * quiz is already there.
 */
async function seedScannableQuiz(supabase, ownerId, klass) {
  const TITLE = 'Bonding Quiz';

  const { data: existing } = await supabase
    .from('assessments')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('class_id', klass.id)
    .eq('title', TITLE)
    .maybeSingle();

  if (existing) return;

  const { data: scannable, error: scannableError } = await supabase
    .from('assessments')
    .insert({
      owner_id: ownerId,
      class_id: klass.id,
      title: TITLE,
      type: 'quiz',
      weight: 0,
      max_score: 11,
      due_on: dateOnly(7),
      standard_codes: ['HS-PS1-1'],
    })
    .select()
    .single();

  if (scannableError) throw scannableError;

  const option = (key, text) => ({ key, text });
  const { error: questionError } = await supabase.from('questions').insert(
    [
      [
        'single',
        'Which bond is formed when sodium transfers an electron to chlorine?',
        [
          option('A', 'Covalent'),
          option('B', 'Ionic'),
          option('C', 'Metallic'),
          option('D', 'Coordinate'),
        ],
        ['B'],
        1,
      ],
      [
        'single',
        'How many lone pairs does an oxygen atom carry in a water molecule?',
        [option('A', 'One'), option('B', 'Two'), option('C', 'Three'), option('D', 'Four')],
        ['B'],
        1,
      ],
      [
        'multiple',
        'Which of these are covalent? Select every answer that applies.',
        [option('A', 'O2'), option('B', 'NaCl'), option('C', 'H2O'), option('D', 'MgO')],
        ['A', 'C'],
        2,
      ],
      [
        'single',
        'A double bond consists of how many shared pairs?',
        [option('A', 'One'), option('B', 'Two'), option('C', 'Three'), option('D', 'Four')],
        ['B'],
        1,
      ],
      [
        'multiple',
        'Which particles carry a full octet in an ionic lattice? Select all that apply.',
        [option('A', 'Na+'), option('B', 'Cl-'), option('C', 'Na'), option('D', 'Cl')],
        ['A', 'B'],
        2,
      ],
      [
        'single',
        'What is the valency of an element in Group 2?',
        [option('A', 'One'), option('B', 'Two'), option('C', 'Three'), option('D', 'Seven')],
        ['B'],
        1,
      ],
      [
        'single',
        'Which statement about giant covalent structures is true?',
        [
          option('A', 'They conduct electricity when solid'),
          option('B', 'They have a very high melting point'),
          option('C', 'They dissolve readily in water'),
          option('D', 'They are always gases'),
        ],
        ['B'],
        1,
      ],
      [
        'multiple',
        'Which properties does metallic bonding explain? Select all that apply.',
        [
          option('A', 'Good electrical conductivity'),
          option('B', 'Malleability'),
          option('C', 'Solubility in water'),
          option('D', 'High melting point'),
        ],
        ['A', 'B', 'D'],
        2,
      ],
    ].map(([kind, prompt, options, answerKey, points], position) => ({
      owner_id: ownerId,
      assessment_id: scannable.id,
      position,
      kind,
      prompt,
      options,
      answer_key: answerKey,
      points,
    })),
  );

  if (questionError) throw questionError;
}

async function seed() {
  /** Account id per email, so the tenancy pass below can attach everyone. */
  const accounts = new Map();

  for (const spec of USERS) {
    console.log(`seeding ${spec.email} ...`);
    const user = await upsertUser(spec);
    const ownerId = user.id;
    accounts.set(spec.email, ownerId);

    await supabase
      .from('profiles')
      .update({ full_name: spec.name, role: spec.role })
      .eq('id', ownerId);

    // Students and guardians hold no roster, so there is nothing to seed below.
    if (spec.teaches === false) {
      console.log(`  ${spec.role} account, no class to seed`);
      continue;
    }

    const { data: existingClass } = await supabase
      .from('classes')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('code', spec.classCode)
      .maybeSingle();

    if (existingClass) {
      console.log(`  class ${spec.classCode} already exists, checking the scannable quiz`);
      await seedScannableQuiz(supabase, ownerId, existingClass);
      continue;
    }

    const { data: klass, error: classError } = await supabase
      .from('classes')
      .insert({
        owner_id: ownerId,
        name: spec.className,
        code: spec.classCode,
        level: spec.level,
        meets_per_week: 5,
      })
      .select()
      .single();

    if (classError) throw classError;

    const { data: insertedStudents, error: studentError } = await supabase
      .from('students')
      .insert(
        STUDENT_NAMES.map(([fullName, initials]) => ({
          owner_id: ownerId,
          class_id: klass.id,
          full_name: fullName,
          initials,
          guardian_name: `${fullName.split(' ')[1]} household`,
          guardian_email: `${initials.toLowerCase()}@guardian.test`,
        })),
      )
      .select('id, full_name');

    if (studentError) throw studentError;

    // Attendance for the last five days, with a couple of absences so the
    // at-risk sweep has something to find.
    const attendanceRows = [];
    for (let day = 0; day < 5; day += 1) {
      insertedStudents.forEach((student, index) => {
        const absent = day === 1 && index % 4 === 0;
        attendanceRows.push({
          owner_id: ownerId,
          class_id: klass.id,
          student_id: student.id,
          date: dateOnly(day),
          status: absent ? 'absent' : index % 7 === 3 ? 'late' : 'present',
        });
      });
    }
    await supabase.from('attendance').upsert(attendanceRows, {
      onConflict: 'class_id,student_id,date',
    });

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .insert({
        owner_id: ownerId,
        class_id: klass.id,
        title: 'Unit 1: Atomic Structure',
        type: 'quiz',
        weight: 1,
        max_score: 100,
        due_on: dateOnly(-3),
        standard_codes: ['HS-PS1-1', 'HS-PS1-2'],
      })
      .select()
      .single();

    if (assessmentError) throw assessmentError;

    // Two students score low on purpose so the heatmap and the push sweep both
    // have a real signal rather than an empty state.
    await supabase.from('grades').upsert(
      insertedStudents.map((student, index) => ({
        owner_id: ownerId,
        assessment_id: assessment.id,
        student_id: student.id,
        score: index < 2 ? 48 + index * 4 : 78 + ((index * 5) % 18),
        max_score: 100,
        feedback: index < 2 ? 'Needs a reteach before the next unit.' : null,
        graded_at: iso(3),
      })),
      { onConflict: 'assessment_id,student_id' },
    );

    await seedScannableQuiz(supabase, ownerId, klass);

    await supabase.from('lesson_plans').insert({
      owner_id: ownerId,
      class_id: klass.id,
      title: 'Modelling atomic structure',
      week_of: dateOnly(0),
      body: { blocks: [{ type: 'text', text: 'Introduce the Bohr model.' }] },
      standard_codes: ['HS-PS1-1'],
    });

    await supabase.from('student_history').insert(
      insertedStudents.map((student) => ({
        owner_id: ownerId,
        student_id: student.id,
        event_type: 'enrolled',
        payload: { class: spec.classCode },
        occurred_at: iso(60),
      })),
    );

    console.log(`  seeded ${insertedStudents.length} students`);
  }

  await seedTenancy(accounts);

  console.log('\ndone.');
  console.log(`sign in with any of: ${USERS.map((u) => u.email).join(', ')}`);
  console.log(`password: ${PASSWORD}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});