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

async function seed() {
  for (const spec of USERS) {
    console.log(`seeding ${spec.email} ...`);
    const user = await upsertUser(spec);
    const ownerId = user.id;

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
      console.log(`  class ${spec.classCode} already exists, skipping`);
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

  console.log('\ndone.');
  console.log(`sign in with any of: ${USERS.map((u) => u.email).join(', ')}`);
  console.log(`password: ${PASSWORD}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});