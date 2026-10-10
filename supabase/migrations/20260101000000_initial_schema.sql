-- LIKO initial schema.
--
-- Conventions:
--   * uuid primary keys, gen_random_uuid() (pgcrypto ships enabled on Supabase)
--   * every tenant table carries owner_id = auth.users.id, even where a foreign
--     key already implies ownership, because RLS policies stay uniform that way
--   * soft delete via archived_at where a hard delete would destroy history
--   * RLS is enabled on every table, and every policy is scoped to auth.uid()
--
-- Apply with the Supabase MCP server, or paste into the SQL editor.
-- Idempotent: safe to re-run against a fresh or partially migrated database.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without every writer remembering it
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user, created on signup
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'instructor'
              check (role in ('instructor', 'admin', 'student', 'guardian')),
  avatar_url  text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for an authenticated user. Mirrors auth.users for data only.';

-- ---------------------------------------------------------------------------
-- Teacher context
--
-- `subjects` is a text array rather than a table: it is a short free-text list
-- the teacher types and nothing joins to it, so normalising it would add a
-- lookup nobody queries and an extra write on every save.
--
-- `grading_policy_id`, the scale this teacher grades on by default, is added
-- further down with the rest of the grading wiring rather than here, because it
-- is a foreign key into a table this migration creates later. See the note
-- where it is added.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists school_name text,
  add column if not exists subjects text[] not null default '{}',
  add column if not exists default_grade_level text
    check (default_grade_level is null or default_grade_level in ('preschool', 'k12', 'university'));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Runs on every signup, including OAuth, so no code path can create an account
-- without a profile. Security definer because the insert runs as the auth role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  code           text not null,
  level          text not null default 'k12'
                 check (level in ('preschool', 'k12', 'university')),
  meets_per_week integer not null default 1 check (meets_per_week > 0),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists classes_owner_idx on public.classes (owner_id)
  where archived_at is null;

-- One class per code per teacher. The short code is typed constantly as a
-- filter, so a duplicate would make every lookup ambiguous. Case-folded
-- because `createClass` upper-cases it, and partial so archiving a class frees
-- its code for reuse.
create unique index if not exists classes_owner_code_key
  on public.classes (owner_id, upper(code))
  where archived_at is null;

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- grading policies
--
-- A scale is data, not code: a descending list of bands each carrying a label
-- and optionally a grade point. That is what lets a school grade on GWA, on a
-- 4.0 GPA, on milestone bands, or on a scale nobody shipped. `bands` is jsonb
-- because it is read as a whole document and never queried into.
--
-- The five built-in scales live in code, not here, so they can be corrected in a
-- release without a data migration. Only user-authored scales are rows, and they
-- carry `built_in = false`.
-- ---------------------------------------------------------------------------
create table if not exists public.grading_policies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  kind       text not null default 'custom'
             check (kind in ('points', 'letter', 'milestone', 'custom')),
  bands      jsonb not null
             check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) > 0),
  built_in   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grading_policies_owner_idx
  on public.grading_policies (owner_id);

drop trigger if exists grading_policies_set_updated_at on public.grading_policies;
create trigger grading_policies_set_updated_at
  before update on public.grading_policies
  for each row execute function public.set_updated_at();

alter table public.grading_policies enable row level security;

drop policy if exists "grading policies are readable by their owner"
  on public.grading_policies;
create policy "grading policies are readable by their owner"
  on public.grading_policies
  for select
  using (auth.uid() = owner_id);

drop policy if exists "grading policies are writable by their owner"
  on public.grading_policies;
create policy "grading policies are writable by their owner"
  on public.grading_policies
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- A class grades on exactly one scale. Null means the built-in percentage
-- default, so an existing row keeps working without a backfill.
alter table public.classes
  add column if not exists grading_policy_id uuid
  references public.grading_policies (id) on delete set null;

-- The teacher's own default, which a class then overrides, so a department can
-- differ from the teacher's habit.
--
-- IT IS HERE, NOT WITH THE REST OF THE profiles COLUMNS, AND THAT ORDERING IS
-- NOT COSMETIC. Postgres does not resolve a foreign key target when it parses
-- an `alter table`; it resolves it when it executes the statement. Adding this
-- column up beside the other profiles columns therefore failed on a real
-- database with `relation "public.grading_policies" does not exist` (42P01),
-- because the table it points at is created 80 lines further down.
--
-- `pnpm check:sql` could not see it, and that is worth stating plainly rather
-- than fixing silently: it resolves every relation a statement names against
-- the set of tables this migration creates, which answers "does this exist"
-- and not "does this exist YET". A name that appears later in the file is a
-- pass. Order is not checkable by cross-reference alone, and this file is now
-- proof that only running it proves it.
alter table public.profiles
  add column if not exists grading_policy_id uuid
  references public.grading_policies (id) on delete set null;

-- ---------------------------------------------------------------------------
-- students: class_id is the join key the old fixture model was missing
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  full_name       text not null,
  initials        text not null,
  guardian_name   text,
  guardian_email  text,
  guardian_phone  text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists students_class_idx on public.students (class_id)
  where archived_at is null;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The link between a student record and a LIKO login
--
-- Students and guardians do not self-register. A teacher creates the account
-- from the roster and it lands here, which is what makes "teachers create
-- accounts for them" an enforceable rule rather than a sentence in the terms:
-- the public signup path has no role that can produce one of these, and every
-- account that can see a student row reaches it through this column.
--
-- NULL for the common case, which is a student in a class that never needs a
-- login. A roster row with no account is the normal state, not a broken one.
--
-- `on delete set null` because deleting an account must not delete a child's
-- school record. The gradebook and attendance history outlive any one login.
--
-- Added after the initial table so the migration stays idempotent, matching how
-- the profile columns were added above.
-- ---------------------------------------------------------------------------
alter table public.students
  add column if not exists account_id uuid
    references auth.users (id) on delete set null;

create index if not exists students_account_idx
  on public.students (account_id)
  where account_id is not null;

-- A logged-in student or guardian may read the one record that is theirs, and
-- nothing else on the table. This ORs with the owner policy above, which is the
-- point: a teacher keeps seeing the whole roster, and a parent sees one row.
drop policy if exists "linked reads own student row" on public.students;
create policy "linked reads own student row" on public.students
  for select using (account_id = auth.uid());

-- The link itself is not self-editable.
--
-- WHAT IS ACTUALLY ENFORCING THIS. The primary boundary is the policy above.
-- "own rows" is the only UPDATE policy on `students` and it requires
-- `owner_id = auth.uid()`, so a linked account has no route to UPDATE the row at
-- all, linked or not. This trigger is the second layer, not the first, and it is
-- here because RLS protects columns only by accident: the day someone widens
-- those policies, or adds an update grant for guardians so they can fix a phone
-- number, this still holds the link.
--
-- WHY A TRIGGER AND NOT A COLUMN GRANT. The shape used on `profiles` above,
-- `revoke update` plus a narrow `grant update (...)`, cannot work here. The same
-- table is written by two callers with very different rights: the teacher who
-- owns the roster and edits freely, and the linked account. A grant is per-role,
-- not per-row, so it cannot tell them apart. A trigger can, because it can see
-- who is asking.
--
-- `auth.uid()` is NULL when the service role writes, which is what lets the
-- server-side create and link paths through untouched. It only fires on UPDATE,
-- so the initial insert is unaffected, and on that insert `old.owner_id` is still
-- null anyway.
--
-- KNOWN LIMITATION, DELIBERATE: a guardian cannot correct their own phone number
-- on the record. Granting that needs the policies above widened first, and it is
-- a product decision rather than a security one.
create or replace function public.protect_student_account_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.account_id is distinct from old.account_id
     and auth.uid() is not null
     and auth.uid() <> old.owner_id
  then
    raise exception 'the login linked to a student record can only be set by the class owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists students_protect_account_link on public.students;
create trigger students_protect_account_link
  before update on public.students
  for each row execute function public.protect_student_account_link();

-- ---------------------------------------------------------------------------
-- attendance: unique per class/student/day so marking is idempotent and an
-- offline replay can never duplicate a day
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  status     text not null
             check (status in ('present', 'absent', 'late', 'excused')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_once_per_day unique (class_id, student_id, date)
);

create index if not exists attendance_class_date_idx
  on public.attendance (class_id, date desc);

drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assessments and grades
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  type           text not null default 'quiz'
                 check (type in ('quiz', 'worksheet', 'exam', 'project', 'lab')),
  weight         numeric(5,2) not null default 1 check (weight >= 0),
  max_score      numeric(8,2) not null default 100 check (max_score > 0),
  due_on         date,
  standard_codes text[] not null default '{}',
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists assessments_class_idx on public.assessments (class_id);

drop trigger if exists assessments_set_updated_at on public.assessments;
create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- questions
--
-- An assessment was a title, a weight and a maximum. It had no content, so a
-- quiz could be created, weighted and reported on, but there was nothing to sit
-- the quiz. This table is that content, and it is deliberately narrow: only the
-- two kinds a sheet can actually be marked for. Free text, numeric and matching
-- questions are not representable here, because nothing on this sheet can be
-- read off a scan, and a question whose answer cannot be read must not look
-- like one that can.
--
-- `options` is `[{ key, text }]`. `key` is the letter printed on the sheet and
-- is what a scan returns, so it is the durable identity of an option and must
-- not be reused for different text on the same question.
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  kind          text not null default 'single'
                 check (kind in ('single', 'multiple')),
  prompt        text not null check (length(trim(prompt)) > 0),
  options       jsonb not null default '[]'::jsonb,
  answer_key    text[] not null default '{}',
  points        numeric(6,2) not null default 1 check (points > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Two options is the floor for anything worth asking and eight is the ceiling
  -- a sheet column can hold at a printable size.
  constraint questions_options_count check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 8
  ),
  -- A question with no answer key is unmarkable, which would make every scan of
  -- it score zero and look like the student got everything wrong.
  constraint questions_answer_key_present check (array_length(answer_key, 1) >= 1)
);

create index if not exists questions_assessment_idx
  on public.questions (assessment_id, position);

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

create table if not exists public.grades (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  score         numeric(8,2) check (score is null or score >= 0),
  max_score     numeric(8,2) not null default 100 check (max_score > 0),
  rubric        jsonb not null default '[]'::jsonb,
  feedback      text,
  graded_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One mark per student per assessment. Makes grading idempotent under an
  -- offline replay, which is the same reason attendance is unique per day.
  constraint grades_one_per_student unique (assessment_id, student_id)
);

create index if not exists grades_student_idx on public.grades (student_id);

-- ---------------------------------------------------------------------------
-- How a mark was produced.
--
-- A gradebook that cannot say whether a mark was typed or read off a sheet
-- cannot be argued with when a parent asks. `manual` and `scan` are the two
-- honest answers, and `scan_detail` keeps the marks exactly as they were read,
-- so a disputed sheet can be reopened and compared against what the machine
-- saw rather than against what it concluded.
-- ---------------------------------------------------------------------------
alter table public.grades add column if not exists
  source text not null default 'manual' check (source in ('manual', 'scan'));
alter table public.grades add column if not exists
  scan_detail jsonb;

-- The check above was written before a quiz could be sat on a screen. It has to
-- say so, and it has to be re-stated rather than edited, because this file has
-- already run once against the live project: `add column if not exists` is a
-- no-op on a column that exists, so widening the list means dropping the
-- constraint Postgres generated and putting a new one in its place. Both halves
-- are guarded, so this is safe on a fresh database and on a live one.
do $$
begin
  alter table public.grades drop constraint if exists grades_source_check;
  alter table public.grades
    add constraint grades_source_check check (source in ('manual', 'scan', 'online'));
end $$;

drop trigger if exists grades_set_updated_at on public.grades;
create trigger grades_set_updated_at
  before update on public.grades
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quiz_attempts: a quiz sat on a screen rather than on paper
--
-- WHY THIS IS NOT A COLUMN ON `grades`. A sheet carries one mark per student,
-- and so does a gradebook, but an online quiz is written more than once: a
-- student can save answers, close the tab, and come back. Collapsing that into
-- `grades` would mean a mark existed while it was still being decided, and a
-- gradebook cannot say which of its cells are final.
--
-- `responses` holds what the student chose, in question order, so the sheet the
-- student actually sat can be reopened and compared against what the machine
-- concluded, exactly as `grades.scan_detail` does for a scan. `score` is written
-- once, by the server, at submission.
--
-- `owner_id` is the teacher who wrote the quiz, not the student who sat it, so
-- the generic "own rows" policy below is what lets a teacher read their own
-- class's attempts without a policy per role.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'in_progress'
                check (status in ('in_progress', 'submitted')),
  -- A list of `{ questionId, optionKeys }`, not an object keyed by question id,
  -- because order is meaningful here and the reader is the same code that reads
  -- a sheet: both are indexed by position.
  responses     jsonb not null default '[]'::jsonb,
  score         numeric(8,2) check (score is null or score >= 0),
  max_score     numeric(8,2) check (max_score is null or max_score > 0),
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint quiz_attempts_responses_array check (jsonb_typeof(responses) = 'array'),
  -- A submission without a score is the one state that would let a gradebook
  -- show a number nobody computed.
  constraint quiz_attempts_submitted_is_scored check (
    status = 'in_progress'
    or (submitted_at is not null and score is not null and max_score is not null)
  )
);

create index if not exists quiz_attempts_student_idx
  on public.quiz_attempts (student_id);

-- One row per attempt, and the gradebook wants the newest submitted one per
-- student, so the index carries the order the question is actually asked in.
create index if not exists quiz_attempts_assessment_idx
  on public.quiz_attempts (assessment_id, submitted_at desc);

drop trigger if exists quiz_attempts_set_updated_at on public.quiz_attempts;
create trigger quiz_attempts_set_updated_at
  before update on public.quiz_attempts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson plans
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_plans (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  week_of        date,
  body           jsonb not null default '{}'::jsonb,
  standard_codes text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists lesson_plans_class_idx on public.lesson_plans (class_id);

drop trigger if exists lesson_plans_set_updated_at on public.lesson_plans;
create trigger lesson_plans_set_updated_at
  before update on public.lesson_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- behaviour logs
-- ---------------------------------------------------------------------------
create table if not exists public.behaviour_logs (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  entry      text not null,
  severity   text not null default 'note'
             check (severity in ('note', 'praise', 'concern', 'intervention')),
  created_at timestamptz not null default now()
);

create index if not exists behaviour_logs_student_idx
  on public.behaviour_logs (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- student_history: append-only timeline backing the history route
-- ---------------------------------------------------------------------------
create table if not exists public.student_history (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  event_type  text not null
              check (event_type in (
                'enrolled', 'attendance_flag', 'standard_mastered',
                'assessment_scored', 'intervention', 'note'
              )),
  payload     jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists student_history_student_idx
  on public.student_history (student_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Tenancy
--
-- WHY MEMBERSHIP REUSES THE FOUR ROLES RATHER THAN ADDING AN `owner`.
--
-- The RBAC matrix in `src/lib/auth/rbac.ts` is the single source of truth for
-- what a role may do, and `org:manage` is already held by exactly one role. An
-- `owner` role would have to be added to that matrix, to the session payload,
-- to every `switch` on role and to every test that enumerates roles, to buy
-- the ability to receive an invoice. Org ownership is a billing fact, so it is
-- `organizations.billing_email`, and the person who can manage the org is
-- whoever holds `org:manage`. One concept, one place.
--
-- `seat_limit` is the number of active members a plan is sold for. It is
-- enforced in the application rather than by a trigger, because the refusal
-- has to arrive as a message a principal secretary can read, not as a
-- constraint violation.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 160),
  slug          text not null unique
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  plan          text not null default 'solo'
                check (plan in ('solo', 'teacher', 'school')),
  seat_limit    integer not null default 5 check (seat_limit > 0),
  billing_email text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.organizations is
  'The tenant. One per school or district; every other table hangs off it.';

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  /*
   * `public.profiles`, not `auth.users`.
   *
   * `profiles.id` is the auth user id already, so this stores exactly the same
   * value. What it buys is the relationship PostgREST needs: the admin console
   * reads a seat as `profiles!memberships_user_id_fkey(email, full_name)` to
   * show who is in the school, and an embed is only resolvable when the foreign
   * key points at a table in the exposed schema. Pointing at `auth.users` made
   * that query fail with PGRST200 and the whole console 500. It failed silently
   * before the console had anything to show, because the read only runs once
   * there is an organisation, which is exactly the state the fixture workspace
   * always had and the seeded database did not.
   *
   * Cascade is preserved either way: deleting the auth user deletes the profile,
   * which deletes the seat.
   */
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'instructor'
             check (role in ('instructor', 'admin', 'student', 'guardian')),
  status     text not null default 'active'
             check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  -- One row per person per organisation. A person in two schools gets two
  -- rows and two memberships, which is the whole point of the table.
  unique (org_id, user_id)
);

comment on table public.memberships is
  'Which people belong to which organisation, and as what.';

/*
 * Re-point the seat at `public.profiles` on a database that already has one.
 *
 * `create table if not exists` above is a no-op once the table exists, so on
 * this project's own database the constraint in the create statement never
 * applies and the old `auth.users` reference would simply survive every
 * re-apply, leaving the admin console broken while the migration reported
 * success. Swapping the constraint explicitly is the part that actually
 * converges, and it preserves the rows: `profiles.id` is the auth user id, so
 * every existing `user_id` already satisfies the new key.
 */
alter table public.memberships
  drop constraint if exists memberships_user_id_fkey;
alter table public.memberships
  add constraint memberships_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

create index if not exists memberships_org_idx on public.memberships (org_id);
create index if not exists memberships_user_idx on public.memberships (user_id);

alter table public.profiles
  add column if not exists org_id uuid
    references public.organizations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tenancy RLS
--
-- A membership is readable by the person it names and by anyone in the same
-- organisation who can manage users. That second clause is what makes the
-- admin people list possible without a service-role key.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Tenancy RLS, and the recursion trap underneath it
--
-- WHY THESE THREE FUNCTIONS EXIST, because the obvious way to write every
-- policy below fails at runtime, and fails catastrophically.
--
-- "Is the caller an active admin of this organisation?" is naturally written as
-- `exists (select 1 from memberships where ...)`. Putting that subquery inside
-- a policy ON `memberships` asks Postgres to evaluate the membership policies
-- in order to decide whether to evaluate the membership policies. That is 42P17,
-- infinite recursion detected in policy for relation "memberships".
--
-- It was not a hypothetical ordering mistake. The first version of this file had
-- exactly that, and the entire tenancy model was dead on arrival. Against a real
-- database, with the publishable key, every one of these returned 500:
--
--   profiles      42P17 infinite recursion detected in policy "memberships"
--   classes       42P17
--   organizations 42P17
--   memberships   42P17
--
-- So every signed-in user would have received a 500 from the database for the
-- dashboard, the roster and the admin console. The service-role key returns 200
-- for all four, because it bypasses RLS, so any check run with the service key
-- reports a perfectly healthy schema while the application is unusable.
-- `pnpm db:check` uses the publishable key on purpose, and that is how it was
-- found.
--
-- A SECURITY DEFINER function is owned by the table owner and so is not subject
-- to the caller's RLS, which means the query inside it does not re-enter the
-- policy that called it. That breaks the cycle and leaves the predicate itself
-- unchanged. `stable` lets the planner call it once per row; `search_path` is
-- pinned so a shadowed name cannot redirect the query somewhere else.
--
-- These are helpers for POLICIES ONLY. Nothing in the application calls them:
-- each takes no secret, answers a question about the CALLER, and reveals
-- nothing about any row.
-- ---------------------------------------------------------------------------

-- Active member of the organisation, whatever their role.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Active administrator of the organisation.
create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and m.status = 'active'
  );
$$;

-- Active administrator who shares an organisation with the named person.
--
-- Serves both "an admin may read another member's profile" and "an admin may
-- read the classes of another member": the same question with a different
-- argument. The subject's own membership must be active. The classes policy
-- required that already and the profiles policy did not, which was an
-- inconsistency rather than a deliberate difference; a suspended member is not
-- something an admin should keep reading through a stale membership row.
create or replace function public.is_admin_sharing_org_with(subject_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs
      on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid()
      and mine.role = 'admin'
      and mine.status = 'active'
      and theirs.user_id = subject_user
      and theirs.status = 'active'
  );
$$;

comment on function public.is_org_member(uuid) is
  'Active membership of the caller in the given organisation. RLS helper.';
comment on function public.is_org_admin(uuid) is
  'Active administrator membership of the caller. RLS helper.';
comment on function public.is_admin_sharing_org_with(uuid) is
  'Caller administers an organisation the named user also belongs to. RLS helper.';

alter table public.organizations enable row level security;
alter table public.memberships    enable row level security;

drop policy if exists "org visible to members" on public.organizations;
create policy "org visible to members" on public.organizations
  for select using (public.is_org_member(organizations.id));

drop policy if exists "org manageable by admins" on public.organizations;
create policy "org manageable by admins" on public.organizations
  for update using (public.is_org_admin(organizations.id));

drop policy if exists "own membership" on public.memberships;
create policy "own membership" on public.memberships
  for select using (user_id = auth.uid());

drop policy if exists "org memberships readable" on public.memberships;
create policy "org memberships readable" on public.memberships
  for select using (public.is_org_admin(memberships.org_id));

drop policy if exists "org memberships manageable" on public.memberships;
create policy "org memberships manageable" on public.memberships
  for all using (public.is_org_admin(memberships.org_id))
  with check (public.is_org_admin(memberships.org_id));

-- ---------------------------------------------------------------------------
-- decks and slides
--
-- Authoring only. There is deliberately no .pptx import or export: a deck is
-- written here and presented from here, or printed to PDF by the browser.
--
-- `position` is the presentation order and is kept contiguous, with the unique
-- index below making a duplicate impossible rather than merely unlikely. A
-- reorder renumbers the whole deck, which is why the editor sends a target
-- index rather than a delta.
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists decks_owner_idx on public.decks (owner_id)
  where archived_at is null;

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

create table if not exists public.slides (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references public.decks (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  position   integer not null check (position >= 0),
  layout     text not null default 'bullets'
             check (layout in ('title', 'bullets', 'split', 'blank')),
  title      text not null default '',
  body       text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, position)
);

create index if not exists slides_deck_idx on public.slides (deck_id, position);

drop trigger if exists slides_set_updated_at on public.slides;
create trigger slides_set_updated_at
  before update on public.slides
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- consent_events: append-only log of what each account agreed to, and when
--
-- WHY THIS IS A SEPARATE TABLE AND NOT A COLUMN ON `profiles`.
--
-- `profiles` is reachable by an account on its own row, and RLS restricts
-- rows, not columns, so what keeps a column off that reach is the column
-- grant below rather than the policy. A `terms_accepted_at` column added to
-- `profiles` without also being left out of that grant would therefore be a
-- timestamp the account holder is free to edit, which is exactly the value
-- that has to be beyond their reach to be worth keeping.
--
-- Row level security is enabled below and NO policy is ever created for this
-- table. With no policy, PostgREST returns nothing for select and rejects insert
-- for the authenticated role, so the only writer is the service role, which
-- bypasses RLS. The account can neither read nor forge a record.
--
-- Append-only on purpose: re-accepting after the terms change adds a row instead
-- of overwriting, so "what had this person agreed to on the day they signed up"
-- still has an answer after the text has been edited.
-- ---------------------------------------------------------------------------
create table if not exists public.consent_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  subject     text not null check (subject in ('terms', 'privacy', 'cookies')),
  -- The version of the published text in force at the moment of acceptance. A
  -- record under an old version is not evidence for the current text.
  version     text not null,
  source      text not null default 'self_registration'
              check (source in ('self_registration', 'teacher_invite', 'cookie_banner')),
  ip          text,
  user_agent  text,
  accepted_at timestamptz not null default now()
);

create index if not exists consent_events_user_idx
  on public.consent_events (user_id, accepted_at desc);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Ownership rule for every tenant table. Writes and reads both require
-- auth.uid() = owner_id, so a tampered id in a URL returns no rows rather than
-- another teacher's data.
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.classes           enable row level security;
alter table public.students          enable row level security;
alter table public.attendance        enable row level security;
alter table public.assessments       enable row level security;
alter table public.questions         enable row level security;
alter table public.grades            enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.lesson_plans      enable row level security;
alter table public.behaviour_logs    enable row level security;
alter table public.student_history   enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.decks             enable row level security;
alter table public.slides            enable row level security;
-- Enabled with deliberately NO policy. See the table comment above: the
-- authenticated role gets nothing here, and only the service role writes.
alter table public.consent_events    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'classes', 'students', 'attendance', 'assessments', 'questions', 'grades',
    'lesson_plans', 'behaviour_logs', 'student_history', 'decks', 'slides',
    'quiz_attempts'
  ]
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I
         for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- quiz_attempts: the student half
--
-- WHY A HELPER AND NOT AN INLINE EXISTS. The obvious predicate for "this attempt
-- is mine" is `exists (select 1 from public.students where account_id =
-- auth.uid())`. RLS is applied inside a policy subquery as though the caller
-- made the call, and a student cannot select their own quiz's `assessments` row,
-- so any policy that has to look at the assessment through the caller's own
-- privileges evaluates to false and the insert is refused for a reason that has
-- nothing to do with the student. A SECURITY DEFINER helper reads the same rows
-- with the owner's privileges and answers only a question about the CALLER,
-- which is what the helpers above already exist for.
--
-- WHAT THE STUDENT CANNOT DO. Not "should not", cannot. `score`, `max_score`,
-- `status`, `student_id` and `owner_id` are unreachable by the student's token:
-- the column grant below removes table-level UPDATE and re-adds exactly one
-- column. A student who opens devtools and PATCHes PostgREST directly, skipping
-- the server action entirely, is refused on `score` rather than quietly ignored.
-- That is the same boundary the `profiles` role column has, for the same reason.
-- The attempt is created and submitted by the server through the service role.
-- ---------------------------------------------------------------------------
create or replace function public.owns_student_record(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = target_student
      and s.account_id = auth.uid()
      and s.archived_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- quiz_attempts: what a student is allowed to be handed
--
-- WHY FUNCTIONS AND NOT A WIDENED POLICY. A student needs the prompt text and
-- the option labels of a quiz in their own class. Those live on `questions`,
-- whose rows also carry `answer_key`. Widening that table's SELECT policy would
-- hand every student every answer in one query, so the read is expressed as a
-- function instead: it declares the columns it returns, and `answer_key` is not
-- one of them. There is no column to select later and no way to widen it from
-- the client, because the result shape is the function's `returns table`.
--
-- The function is SECURITY DEFINER so it can join through `assessments` and
-- `classes`, which the student cannot read, and it filters on `auth.uid()` so
-- that capability is spent on the caller alone. Every row it returns is a row
-- the caller is entitled to; it reveals nothing about anyone else.
--
-- The one thing deliberately NOT here: the attempt's score. A student is told
-- they submitted and nothing else, so there is no function for a student to
-- call that could return one.
-- ---------------------------------------------------------------------------
create or replace function public.student_quizzes()
returns table (
  student_id    uuid,
  assessment_id uuid,
  title         text,
  class_name    text,
  due_on        date,
  question_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, a.id, a.title, c.name, a.due_on, count(q.id)::integer
  from public.students s
  join public.classes c on c.id = s.class_id
  join public.assessments a on a.class_id = s.class_id
  join public.questions q on q.assessment_id = a.id
  where s.account_id = auth.uid()
    and s.archived_at is null
  group by s.id, a.id, a.title, c.name, a.due_on
  order by a.due_on nulls last, a.title;
$$;

create or replace function public.student_quiz_questions(target_assessment uuid)
returns table (
  id       uuid,
  -- Not `position`: that is the name of a built-in function in the grammar, and
  -- a bare column called position fails to parse inside a `returns table`.
  question_position integer,
  kind     text,
  prompt   text,
  options  jsonb,
  points   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.position, q.kind, q.prompt, q.options, q.points
  from public.questions q
  join public.assessments a on a.id = q.assessment_id
  join public.students s on s.class_id = a.class_id
  where q.assessment_id = target_assessment
    and s.account_id = auth.uid()
    and s.archived_at is null
  order by q.position;
$$;

-- WHY THE ROW IS CREATED HERE RATHER THAN BY AN INSERT POLICY. The student is
-- not allowed to choose `owner_id`, which decides whose gradebook the attempt
-- belongs to, or `status`, which decides whether it counts, so INSERT is revoked
-- from `authenticated` outright and this is the only way a row comes into being.
-- It is SECURITY DEFINER for that reason alone: the caller has no INSERT right
-- of its own, and the function is the single place those two fields are chosen.
-- Everything it chooses is read from `assessments`, not from the request.
create or replace function public.start_quiz_attempt(target_assessment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_owner   uuid;
begin
  select s.id, a.owner_id into v_student, v_owner
  from public.students s
  join public.assessments a on a.class_id = s.class_id
  where a.id = target_assessment
    and s.account_id = auth.uid()
    and s.archived_at is null
  limit 1;

  if v_student is null then
    raise exception 'that quiz is not one of yours'
      using errcode = '42501';
  end if;

  insert into public.quiz_attempts (assessment_id, student_id, owner_id)
  values (target_assessment, v_student, v_owner)
  returning id;
end;
$$;

drop policy if exists "linked account reads own attempt" on public.quiz_attempts;
create policy "linked account reads own attempt" on public.quiz_attempts
  for select using (public.owns_student_record(quiz_attempts.student_id));

drop policy if exists "linked account saves own answers" on public.quiz_attempts;
create policy "linked account saves own answers" on public.quiz_attempts
  for update
  using (public.owns_student_record(quiz_attempts.student_id))
  with check (public.owns_student_record(quiz_attempts.student_id));

-- INSERT is revoked outright rather than policed. The row the student is about to
-- create has fields they must not choose: `owner_id` decides whose gradebook it
-- lands in, and `status` decides whether it is finished. Creating it server-side
-- removes the question instead of policing it.
revoke insert on public.quiz_attempts from authenticated;
revoke update on public.quiz_attempts from authenticated;
grant update (responses) on public.quiz_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: row scope AND column scope
--
-- RLS restricts rows, never columns. A `for all` policy on a table keyed by
-- id therefore hands every account UPDATE on *every* column of its own row,
-- and `role` and `org_id` are precisely the two columns an account must not
-- reach: `role` is the permission matrix, `org_id` is the tenancy boundary.
-- A row policy cannot express that, because there is no row a caller may
-- update `role` on -- it is a column question wearing a row's clothes.
--
-- So the boundary is drawn twice, and the column grant below is the part
-- that actually holds. The signup trigger and the service-role paths still
-- write both columns, because the service role bypasses RLS and the trigger
-- is SECURITY DEFINER. An attacker who skips the server action entirely and
-- PATCHes PostgREST with their own access token gets a permission denied on
-- `role`, not a promotion. The allowlist in the server action is a second
-- layer over this one, not the layer that protects the column.
--
-- Column scope is the set `saveProfile` writes plus the two a caller owns
-- outright; `email` stays out because it mirrors auth.users.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
  for select using (
    id = auth.uid() or public.is_admin_sharing_org_with(profiles.id)
  );

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Table-level UPDATE goes first, otherwise the column grant below would only
-- ever add to a blanket right that was already there. `id` is the key, `role`
-- and `org_id` are server-owned, and the timestamps are the database's.
-- `updated_at` still advances: the set_updated_at trigger assigns NEW, and a
-- trigger's assignment is not a privilege-checked UPDATE target list.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, timezone, school_name, subjects,
              default_grade_level, grading_policy_id)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- classes: reads outside the owner
--
-- PERMISSIVE POLICIES OR TOGETHER. Postgres evaluates every `for select`
-- policy on a table and keeps a row when ANY one of them says yes, so a
-- broad policy silently widens the narrow ones beside it however carefully
-- those were written. Before adding a select policy here, the question is
-- never "is this policy tight" but "is this policy tight AND is every other
-- select policy tight", because one loose one defeats all of them. That is
-- what made the previous version of these two policies a cross-tenant read:
-- each looked scoped to the caller, and together they returned every class.
--
-- HOW A CLASS IS REACHABLE TO A TENANT. `classes` has no `org_id` (see the
-- table definition above), so a class belongs to whichever organisation its
-- owner belongs to, and `memberships` answers both halves of that test: the
-- owner's membership says which org the class sits in, the caller's
-- membership says whether the caller administers that same org. Deliberately
-- not routed through `profiles.org_id`, which exists on the table but is
-- never written by any application path -- a tenancy check built on it would
-- match nothing and silently hand admins an empty list rather than a scoped
-- one. Writes stay owner-only; `own rows` above is `for all` and unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists "admin reads classes" on public.classes;
create policy "admin reads classes" on public.classes
  for select using (public.is_admin_sharing_org_with(classes.owner_id));

-- A student or guardian sees the class their own record sits on, and no other.
--
-- The join column now exists. `students.account_id` is set when a teacher issues
-- a login from the roster, so "is this account on this class" is answerable by
-- the database rather than by a role test that is true of every student
-- everywhere. The archived row is excluded so that removing a child from a
-- roster also removes their access to it, which is what archiving is for.
--
-- The previous policy here tested `role in ('student','guardian')` against the
-- caller's own profile. That is true of every student account in every school,
-- so it returned every class row in the table while its comment claimed a
-- scoping the body did not perform.
drop policy if exists "linked read classes" on public.classes;
create policy "linked read classes" on public.classes
  for select using (
    exists (
      select 1
      from public.students s
      where s.class_id = classes.id
        and s.account_id = auth.uid()
        and s.archived_at is null
    )
  );

drop policy if exists "push own subscriptions" on public.push_subscriptions;
create policy "push own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime for the in-app at-risk toast. Without this the publication does not
-- carry the table and the channel silently receives nothing.
--
-- Guarded, because `alter publication ... add table` has no `if not exists` and
-- fails on the second apply with `relation "students" is already member of
-- publication "supabase_realtime"`. The membership is checked in
-- `pg_publication_tables` first, which is the only place that knows whether an
-- `alter publication` is needed at all.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grades'
  ) then
    alter publication supabase_realtime add table public.grades;
  end if;
end $$;