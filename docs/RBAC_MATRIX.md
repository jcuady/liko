# RBAC Matrix

**Last updated:** 2026-10-23
**Repo:** LIKO @ `b104fba` (branch `integrate/verified-session-and-runner-fixes`)
**Audit scope:** read-only. No application source, migration, or test file was modified.

---

## Roles

**Source of truth: the database.** The role set is not read from the UI, from a
type alias, or from a doc. It is read from the `check` constraint on the `role`
column, which appears three times in the migration and is identical in all three:

`supabase/migrations/20260101000000_initial_schema.sql`

| Line | Relation | Constraint |
|---|---|---|
| 34 | `public.profiles.role` | `check (role in ('instructor', 'admin', 'student', 'guardian'))` |
| 827 | `public.memberships.role` | `check (role in ('instructor', 'admin', 'student', 'guardian'))` |
| 1297 | `public.organization_invites.role` | `check (role in ('instructor', 'admin', 'student', 'guardian'))` |

**Four roles: `instructor`, `admin`, `student`, `guardian`.**

There is no `owner` role and no `super_admin`. The project is a single-tenant
school deployment, and an administrator is an administrator of one organisation.

### Two role columns, and why that matters

The schema carries the role **twice**, and the two columns answer different
questions:

| Column | Question it answers | Read by |
|---|---|---|
| `profiles.role` | *What may this account do anywhere?* | the app permission matrix and the session |
| `memberships.role` | *What may this person do in this organisation?* | every RLS policy |

`memberships.role` is what the database enforces. `profiles.role` is what the
application checks. `setMemberRole` writes both, in that order
(`src/lib/api/client.ts:1868-1936`), so an administrator's role change moves the
membership first (RLS-visible, immediately) and the profile second (session-visible,
at the next sign-in or token refresh).

**This is the single most important thing to understand about the matrix below:**
the database's notion of "administrator" is `memberships.role = 'admin'`, and it
is what every policy tests.

### Verifying the role set (instrument)

`probe-rbac-matrix.mjs` (audit harness, run outside this repo) reads the role
set out of the migration's `check` constraint and compares it to the app's
`ROLES` array. It asserts equality in both directions.

```
ok    the DB role constraint is discoverable
ok    app roles equal DB roles
ok    every DB role has a row in the app matrix
```

**Negative control.** A synthetic fixture whose DB constraint omitted `admin`
while the app still knew it produced `FAIL app roles equal DB roles :: app=[admin,guardian,instructor,student] db=[guardian,instructor,student]`, exit 1. The check fires.

---

## The permission matrix

**Source of truth for the app layer:** `src/lib/auth/rbac.ts:68-141` (`MATRIX`).

Scope vocabulary: `yes` = unrestricted · `no` = refused · `own` = only rows
bound to the caller's own session · `linked` = only rows bound to a linked child.

| Capability | instructor | admin | student | guardian | Enforced at | Verified by |
|---|---|---|---|---|---|---|
| `class:read` | yes | yes | own | linked | RLS `classes` select + `client.ts` filter | `db:settle` (linked read classes), `rbac.spec.ts` |
| `class:write` | yes | yes | — | — | server action `requirePermission` + RLS `own rows` | `e2e` role-controls, `rbac.spec.ts` |
| `attendance:write` | yes | yes | — | — | server action + RLS `own rows` | `db:settle`, `e2e` attendance |
| `plan:write` | yes | yes | — | — | server action + RLS `own rows` | `e2e` slides/plan |
| `assess:write` | yes | yes | — | — | server action + RLS `own rows` | `e2e` assess |
| `grade:read` | yes | yes | own | linked | RLS `grades` select | `db:settle` (exact-set guardian read) |
| `grade:write` | yes | yes | — | — | server action + RLS `own rows` | `e2e` gradebook |
| `history:read` | yes | yes | own | linked | RLS `student_history` select | `db:settle` |
| `history:write` | yes | yes | — | — | server action + RLS `own rows` | `e2e` attendance-note |
| `quiz:take` | — | — | own | — | server action + RLS `quiz_attempts` | `e2e` quiz-online |
| `flashcard:read` | yes | yes | own | linked | server action + RLS `flashcards` | `e2e` flashcards |
| `flashcard:write` | yes | yes | own | — | server action + RLS `flashcard_decks` | `e2e` flashcards |
| `flashcard:review` | — | — | own | — | server action + RLS `flashcard_progress` | `e2e` flashcards |
| `analytics:read` | yes | yes | — | — | **page layer** (`overview/page.tsx:34`) + proxy | `e2e` rbac |
| `user:manage` | — | yes | — | — | server action + RLS `memberships` | `e2e` admin |
| `org:manage` | — | yes | — | — | server action + RLS `organizations` | `e2e` admin |

**Every "Enforced at" entry names a server-side location.** No row in this table
is enforced by a UI conditional alone.

**Two of the `admin` cells are the application layer, not the database.**
`class:read` and `grade:read` say `yes` because the application will open
`/classes` and `/grades` for an administrator. The database is narrower, and the
table does not pretend otherwise: the `students` table has no administrator
policy at all, and the `grades` table's only select policy is the linked
family, so an administrator reads no roster and no marks for a class it does
not teach. The screen says `Roster not visible to you` rather than inventing a
number. See *The administrator's roster gap* below.

### The two deliberate exceptions

`admin` does not hold `quiz:take` or `flashcard:review`. `src/lib/auth/rbac.test.ts:27`
enumerates them as `ADMIN_EXCEPTIONS` and fails if a third is added, so the
exception cannot quietly become normal.

---

## Route gating

**Source of truth:** `src/lib/auth/rbac.ts:177-205` (`ROUTE_PERMISSIONS`).

| Prefix | Permission | Page exists |
|---|---|---|
| `/overview` | `analytics:read` | yes |
| `/grades` | `grade:read` | yes |
| `/assess` | `assess:write` | yes |
| `/quiz` | `quiz:take` | yes |
| `/flashcards` | `flashcard:read` | yes |
| `/plan` | `plan:write` | yes |
| `/slides` | `plan:write` | yes |
| `/attendance` | `attendance:write` | yes |
| `/classes` | `class:read` | yes |
| `/history` | `history:read` | yes |
| `/admin` | `org:manage` | yes |
| `/schedule` | `class:read` | yes |
| `/settings` | `class:read` | yes |

13 rules over 38 routes, 20 gated. Verified independently by
`probe-rbac-matrix.mjs` (route existence through Next.js route groups, which
`src/app/(dashboard)/…` requires) and by the repo's own
`pnpm verify:rbac-routes` → `0 dead rule(s)`.

**Negative control.** A fixture with one rule pointed at `/grdes` produced
`FAIL every route-permission rule gates a real route :: dead: /grdes` and exit 1,
with every other assertion green. The check distinguishes a dead rule from a
route that merely lives behind a route group.

---

## Effective database reach, per role

Extracted from the migration by `probe-rls-policies.mjs`: 26 tables carry
policies, 49 policies in `public` plus 3 on `storage.objects` (52 total, matching
`pnpm check:sql` → `52 policies (49 in public across 28 tables, 3 on storage)`).

The twelve `own rows` policies are generated in a `DO` loop
(`initial_schema.sql:1460-1477`), not written out one by one. A scan that reads
only literal `create policy` statements misses all twelve and makes twelve
owner-scoped tables look owner-less.

| Relation | instructor / owner | admin | student | guardian |
|---|---|---|---|---|
| `classes` | own rows + linked read | **own rows + admin reads classes** | linked (own class) | linked (own class) |
| `students` | own rows | **own rows only** | linked (own row) | linked (own row) |
| `grades` | own rows | own rows only | linked (own child's marks) | linked (own child's marks) |
| `assessments` | own rows | own rows only | linked (own class's) | linked (own class's) |
| `attendance` | own rows | own rows only | linked (own child's) | linked (own child's) |
| `student_history` | own rows | own rows only | linked (own child's) | linked (own child's) |
| `lesson_plans` | own rows | own rows only | linked (own class's) | linked (own class's) |
| `behaviour_logs` | own rows | own rows only | — | — |
| `questions` | own rows | own rows only | — | — |
| `decks`, `slides` | own rows | own rows only | — | — |
| `quiz_attempts` | own rows + linked | own rows only | linked (own attempt) | linked (own attempt) |
| `memberships` | own membership | **org memberships readable + manageable** | own membership | own membership |
| `organizations` | org visible to members | **org manageable by admins** | visible | visible |
| `profiles` | own row | **own row + `is_admin_sharing_org_with`** | own row | own row |
| `organization_invites` | no policy → service role only | no policy → service role only | no policy → service role only | no policy → service role only |
| `consent_events` | RLS on, **no policy** → service role only | same | same | same |

### The administrator's roster gap — a deliberate narrowing

An administrator **cannot** read a child's record. The `students` policy admits
the class owner (`owner_id`) and the linked family (`account_id`) and nobody
else. `pnpm db:settle` proves this by execution:

```
PASS  an administrator CAN read the classes of its own organisation
PASS  an administrator CAN read the members of its own organisation
PASS  an administrator CANNOT read a child record
```

The refusal is not a tautology, and the suite says why: a guardian linked
through `account_id` read exactly one row from the same table, by the same code,
in the same run. The query is live; the policies admit a seat that they admit.

**Consequence for the app layer.** The app matrix grants `admin` `class:read`
at scope `yes`, and the database will not return a roster for a class the
administrator does not teach. The `grades` table is narrower still: its only
select policy is the linked family, so an administrator reads no marks for a
class it does not teach either. `verify:app` asserts the page says
`Roster not visible to you` rather than inventing a number. The matrix
overstates the database's grant, and the UI is honest about the difference.

**This is recorded as a finding, not a bug in the policy** — see
`docs/AUDIT_FINDINGS.md` #4, which has been answered by the note under the
matrix table rather than by widening a policy that is deliberately narrow.

---

## Verification log

Every row below is a measurement. The instrument is named, the exit code is
stated, and "not verified" is recorded where that is the truth.

| Date | Role used | Capability | Method | Result |
|---|---|---|---|---|
| 2026-10-23 | student | self-promotion to admin | `pnpm db:settle` → live PostgREST with the student's own JWT | **refused** ✓ |
| 2026-10-23 | student | cross-tenant class read | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | guardian | read own child's roster row | `pnpm db:settle` → live PostgREST | **1 row, the linked child** ✓ |
| 2026-10-23 | guardian | read an unlinked child's roster row | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | guardian | read own child's marks, attendance, history, events, assessments, plans | `pnpm db:settle` → exact id-set comparison, not a count | **exact set only** ✓ |
| 2026-10-23 | guardian | write into a child's record | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | guardian | edit or delete an event its child's teacher wrote | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | admin | read own org's classes and members | `pnpm db:settle` → live PostgREST | **allowed** ✓ |
| 2026-10-23 | admin | read a child record | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | student | write a notification into any inbox | `pnpm db:settle` → live PostgREST | **refused** ✓ |
| 2026-10-23 | student | sit a quiz as instructor or admin | `e2e/rbac.spec.ts` + `rbac.test.ts` | **refused** ✓ |
| 2026-10-23 | student, guardian | open `/admin`, `/assess`, `/grades`, `/history`, `/overview` | `e2e/rbac.spec.ts` → live route navigation | **refused, renders the refusal screen** ✓ |
| 2026-10-23 | student, guardian | reach a route they hold | `e2e/rbac.spec.ts` → live route navigation | **allowed** ✓ |
| 2026-10-23 | student | be offered a control the app would refuse | `e2e/role-controls.spec.ts` | **no such control offered** ✓ |
| 2026-10-23 | all four | role set equals DB constraint | `probe-rbac-matrix.mjs` (audit harness) | **equal** ✓ |
| 2026-10-23 | all four | every declared permission has a server-side guard | `probe-rbac-matrix.mjs` | **16/16** ✓ |
| 2026-10-23 | all four | every route rule gates a real route | `probe-rbac-matrix.mjs` | **13/13** ✓ |

**`pnpm db:settle` → exit 0, 29 passed, 0 failed.** This is the strongest
evidence in the table: it creates real users in a throwaway tenant on the live
database, signs in as each of them with a real token, and asserts the exact set
of rows each may read.

---

## Known gaps

- **A demoted administrator kept app-layer permissions until their session
  expired. The two paths that mattered are closed and verified; the rest is
  stated rather than fixed.** `getSession()` returns the role copied into the
  signed cookie (`src/lib/auth/guards.ts:20-72`); in `supabase` mode it does not
  re-read the profile, because that would be an Auth admin round trip on every
  page load. The cookie lives 7 days (`src/lib/auth/session.ts:14`). A demotion
  changed what the *database* allowed immediately (RLS reads `memberships.role`)
  but what the *page layer* allowed only at the next sign-in.
  **The two paths that used the service role, which ignores RLS, are closed.**
  `listInvites` and `createInvite` now resolve the caller's CURRENT membership
  role from the database through `supabaseAdminOrgFor`
  (`src/lib/api/client.ts:3594`) and refuse anyone who is not an administrator
  of that school, so a demoted administrator cannot read the school's invite
  codes or mint a new credential for a week after losing the job.
  `pnpm verify:app` proves it by execution: it signs an administrator in,
  demotes them without re-signing, and asserts that the credential disappears
  from the screen, that the refusal is shown, and that no new invitation row
  is written. With the fix reverted the same run reports
  `the credential was still shown: true` and `invitation rows 1 before, 2 after`,
  so the check is reading the thing it claims to read.
  **What is left is stated, not fixed.** Every other permission still reads the
  cookie, so for the page layer the window is still seven days. A short-lived
  administrator credential, or a session version number the cookie carries,
  would close it; neither is in place.
- **Suspension does take effect immediately.** `supabaseOrgFor` filters
  `status = 'active'` (`src/lib/api/client.ts:3567`), so a suspended member
  resolves to no organisation and every tenancy write fails with NOT_FOUND.
- **No session revocation.** A stolen cookie is valid until it expires. Named as
  a known gap in `docs/SECURITY.md:231`.
- **Registration is unverified against the live database.** Supabase rejects the
  `.test` probe address, so the signup path, the `handle_new_user` trigger and
  the `consent_events` write are untested. Named in `docs/SECURITY.md` and
  reported by `pnpm verify:app` as `signup rejects the .test probe address, so
  the path stays unverified`.

---

## How to re-verify this matrix

```bash
# The repo's own gates (all require the credentials in .env.local)
pnpm db:settle        # live RLS, per role, real tokens   → exit 0, 29 passed
pnpm verify:app       # live app, per role, real refusals  → exit 0, 83 passed
pnpm e2e              # route + control gating, per role  → exit 0, 259 passed
pnpm verify:rbac-routes # no dead route-permission rule, and the app's roles
                       # are the database's                → exit 0, 0 dead

# The audit harness (run from outside the repo; it does not modify anything)
node probe-rbac-matrix.mjs --repo <path-to-Liko>
node probe-rls-policies.mjs --repo <path-to-Liko>
```
