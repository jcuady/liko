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
-- `grading_policy_id` is the scale this teacher grades on by default. A class
-- still overrides it, so a department can differ from the teacher's habit.
-- Added after the initial table so the migration stays idempotent.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists school_name text,
  add column if not exists subjects text[] not null default '{}',
  add column if not exists default_grade_level text
    check (default_grade_level is null or default_grade_level in ('preschool', 'k12', 'university')),
  add column if not exists grading_policy_id uuid
    references public.grading_policies (id) on delete set null;

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

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

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

create trigger assessments_set_updated_at
  before update on public.assessments
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

create trigger grades_set_updated_at
  before update on public.grades
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
alter table public.grades            enable row level security;
alter table public.lesson_plans      enable row level security;
alter table public.behaviour_logs    enable row level security;
alter table public.student_history   enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles is keyed by id rather than owner_id.
drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array[
    'classes', 'students', 'attendance', 'assessments', 'grades',
    'lesson_plans', 'behaviour_logs', 'student_history'
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

-- An admin can read across the classes they administer without being able to
-- read a class they do not own. Write stays owner-only.
drop policy if exists "admin reads classes" on public.classes;
create policy "admin reads classes" on public.classes
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Students and guardians see a roster only through a class they are linked to.
-- The link table is not part of this migration, so today the roster is
-- owner-only; the policy exists so adding the link table later does not require
-- re-auditing every table.
drop policy if exists "linked read classes" on public.classes;
create policy "linked read classes" on public.classes
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('student', 'guardian')
    )
  );

drop policy if exists "push own subscriptions" on public.push_subscriptions;
create policy "push own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime for the in-app at-risk toast. Without this the publication does not
-- carry the table and the channel silently receives nothing.
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.grades;