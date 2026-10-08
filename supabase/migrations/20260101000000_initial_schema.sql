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
                check (plan in ('solo', 'school', 'district')),
  seat_limit    integer not null default 5 check (seat_limit > 0),
  billing_email text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.organizations is
  'The tenant. One per school or district; every other table hangs off it.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
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
alter table public.organizations enable row level security;
alter table public.memberships    enable row level security;

drop policy if exists "org visible to members" on public.organizations;
create policy "org visible to members" on public.organizations
  for select using (
    exists (
      select 1 from public.memberships m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists "org manageable by admins" on public.organizations;
create policy "org manageable by admins" on public.organizations
  for update using (
    exists (
      select 1 from public.memberships m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'admin'
        and m.status = 'active'
    )
  );

drop policy if exists "own membership" on public.memberships;
create policy "own membership" on public.memberships
  for select using (user_id = auth.uid());

drop policy if exists "org memberships readable" on public.memberships;
create policy "org memberships readable" on public.memberships
  for select using (
    exists (
      select 1 from public.memberships mine
      where mine.org_id = memberships.org_id
        and mine.user_id = auth.uid()
        and mine.role = 'admin'
        and mine.status = 'active'
    )
  );

drop policy if exists "org memberships manageable" on public.memberships;
create policy "org memberships manageable" on public.memberships
  for all using (
    exists (
      select 1 from public.memberships mine
      where mine.org_id = memberships.org_id
        and mine.user_id = auth.uid()
        and mine.role = 'admin'
        and mine.status = 'active'
    )
  ) with check (
    exists (
      select 1 from public.memberships mine
      where mine.org_id = memberships.org_id
        and mine.user_id = auth.uid()
        and mine.role = 'admin'
        and mine.status = 'active'
    )
  );

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
alter table public.grades            enable row level security;
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
    'classes', 'students', 'attendance', 'assessments', 'grades',
    'lesson_plans', 'behaviour_logs', 'student_history', 'decks', 'slides'
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
    id = auth.uid()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs
        on theirs.org_id = mine.org_id
      where mine.user_id = auth.uid()
        and mine.role = 'admin'
        and mine.status = 'active'
        and theirs.user_id = profiles.id
    )
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
  for select using (
    exists (
      select 1
      from public.memberships mine
      join public.memberships owner_m
        on owner_m.org_id = mine.org_id
       and owner_m.user_id = classes.owner_id
      where mine.user_id = auth.uid()
        and mine.role = 'admin'
        and mine.status = 'active'
        and owner_m.status = 'active'
    )
  );

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
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.grades;