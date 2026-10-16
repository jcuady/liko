# System Audit

Principal full-system audit of the LIKO workspace. Every claim below is backed
by a command that was run, or is marked **NOT VERIFIED** with the reason.

- Commit audited: `d245ebc` (+ audit fixes, see "What this audit changed")
- Date: 2026-10-15
- Method: three parallel independent audits (RBAC/routing, forms/API/parity,
  UI/a11y/branding), each read-only, plus direct measurement against the live
  Supabase project.

---

## Verification summary

| Check | Result | Evidence |
|---|---|---|
| Build | **PASS** | `pnpm build`, exit 0 |
| Typecheck | **PASS** | `pnpm typecheck`, exit 0 |
| Lint | **PASS** | `pnpm lint`, exit 0 |
| Unit tests | **PASS** | 373 passed, 2 skipped, 28 files |
| e2e | **PASS** | 197 passed |
| SQL parse + cross-refs | **PASS** | 228 statements, 25 tables, RLS on all 25, 27 policies re-runnable |
| **Migration applied to production** | **PASS** | 25 of 25 tables present, measured before and after |
| Dead handlers / `href="#"` / TODO / `console.*` | **PASS** | ripgrep, no matches |
| Raw hex outside exemptions | **PASS** | 7 hits, all legitimately exempt |
| `transition: all`, `h-screen`, `localStorage.setItem`, `text-white` | **PASS** | zero hits |
| Responsive | **PASS** | 5 viewports 375-1920, no overflow |
| Behaviour (anchors, reduced motion, no-JS) | **PASS** | all checks pass |

---

## P0

**None found.** No data loss, auth bypass, tenant leak or broken build.

---

## P1 — fix before release

### P1-01 The migration was not applied to the live database

**Severity:** P1 · **Status:** FIXED (applied 2026-10-16, operator-approved)

The four tables added for the calendar module
(`weekly_schedule_entries`, `notifications`, `academic_terms`,
`calendar_events`) exist in the migration file and **not** in the Supabase
project `ulrjitekiylgepdyijsw`. Measured directly against PostgREST:

```
ABSENT   weekly_schedule_entries  (HTTP 404)
ABSENT   notifications            (HTTP 404)
ABSENT   academic_terms           (HTTP 404)
ABSENT   calendar_events          (HTTP 404)
present  push_subscriptions       (HTTP 200)
```

**Why it survived eleven green gates.** `pnpm db:check` asserted "all 19 tables
and their security-relevant columns exist" from a **hardcoded list** in
`scripts/check-remote-db.mjs`. That list predated the new tables, so the check
had nothing to say about them. `pnpm db:settle` is explicitly documented as
"a thing you run once, by hand, **after applying the migration**" — it tests
RLS behaviour, it never applies anything. So the full suite reported
`11 pass, 0 fail` against a database that was missing four of the tables the
application's API layer queries.

`LIKO_DATA_MODE` **is** set in the Vercel production environment, so production
runs in Supabase mode. The existing 19 tables were applied on 2026-10-09; these
four were added after and never were.

**Fixed in this audit, in two parts.**

**Part 1, the blind spot.** `db:check` now derives its expected table list from
`supabase/migrations/*.sql` rather than from a literal, and exits 1 when the
migration is not applied. Adding a table to the schema now automatically makes
the live database a thing the gate asks about. The gate went from
`11 pass, 0 fail` to `10 pass, 1 fail` on the same codebase, which is the proof
the fix works: it now reports the truth instead of the old truth.

**Part 2, the application.** Applied on operator approval, inside a single
transaction with a rollback on any failure. Measured before and after:

```
BEFORE: 21 tables, 29 policies
  target tables absent before: weekly_schedule_entries, notifications,
                               academic_terms, calendar_events
  applying migration in one transaction...
  committed.
AFTER:  25 tables, 35 policies
  tables added: academic_terms, calendar_events, notifications,
                weekly_schedule_entries
  target tables still absent: none
  RESULT: OK, every target table now exists.
```

29 to 35 policies is the six new ones, and no existing policy count moved, so
the re-applied policies are the same set rather than a wider one.

Verified independently afterwards:

- `pnpm db:check` → `all 25 tables and their security-relevant columns exist`,
  exit 0
- `pnpm db:settle` → `6 passed, 0 failed`, covering self-promotion to admin,
  cross-tenant class reads, and the server-owned student link

A migration that reports "applied" without saying what it changed is the same
class of trust problem as a gate that cannot see its own change, so the apply
script printed the table and policy counts either side and refused to claim
success unless the table count actually moved. It has been deleted; applying is
now `pnpm db:check` reporting what is missing.

### P1-02 Students and guardians land on an empty classes page

**Severity:** P1 · **Status:** FIXED

`supabaseAdapter.listClasses` filtered `.eq('owner_id', userId)`. A student's
`owner_id` is their **teacher's** account id, so the filter removed every row
that RLS's `linked read classes` policy had just granted. PostgREST intersects
policy and filter, so the intersection of "permitted" and "mine" is "mine",
which for a student is nothing. `landingPathFor` sends students to `/classes`,
so every student landed on a page that rendered successfully and empty.

Fixed by removing the filter. The policies on `classes` already cover exactly
the right set — `own rows` (the owner), `linked read classes` (a student on the
roster), `admin reads classes` (an admin sharing the organisation) — so dropping
it widens nothing. All 14 callers pass `session.userId` and resolve the record
they want out of the result; none relied on the filter to authorise.

### P1-03 `createFirstClass` was gated on a read permission

**Severity:** P1 · **Status:** FIXED

`src/app/(dashboard)/welcome/actions.ts` required `class:read` to **create** a
class row. The matrix grants `class:read` to a student at scope `own` and a
guardian at `linked`, and `can()` deliberately counts an ownership scope as
permitted. Both roles passed the check and inserted a row with their own id as
`owner_id`, which the `own rows` policy on `classes` accepts. A student could
create persistent classes. The sibling action in `classes/actions.ts` already
required `class:write`, so the correct gate existed and this file had drifted.

Fixed: now requires `class:write`.

### P1-04 `addBehaviourLog` was gated on a read permission

**Severity:** P1 · **Status:** FIXED

`src/app/(dashboard)/history/actions.ts` required `history:read` to append a
behaviour note. Students hold that at `own` and guardians at `linked`, so both
could write a note against any `student_id` they named. The note never reached
the teacher's view, because reads filter on `owner_id` and the insert stamped
the writer's own id — so no visible record was altered. But an unauthorised
write is still one, and it was unbounded.

Fixed by splitting `history:write` out of `history:read`:
`instructor`/`admin` yes, `student`/`guardian` no. Adding the permission broke
the type check in `admin/page.tsx`, which keeps a `Record<Permission, string>`
label map — that is how the second copy of the matrix was caught.

### P1-05 `/pricing` rendered `$299` where the landing rendered `₱299`

**Severity:** P1 · **Status:** FIXED

`PricingTiers.tsx` declared a local `formatPrice(value) { return `$${value}` }`,
shadowing the peso formatter exported from `../plans`. Same product, same plan,
two currencies on two pages. `plans.ts` had already replaced a dollar formatter
with a peso one because the product is sold in the Philippines; the shadow was
re-added afterwards. Fixed by importing the shared formatter and deleting the
local one, with the reasoning recorded at the old declaration site.

### P1-06 Three fixture adapter methods were less safe than the database

**Severity:** P1 · **Status:** FIXED

Found in code written during this session's calendar work. The rule the seam
exists to enforce is that the two adapters stay in step; these were the cases
where fixtures were looser than Postgres, which is the direction that hides
real bugs.

| Method | Defect | Fix |
|---|---|---|
| `deleteCalendarEvent` | Ignored `userId` entirely; any signed-in fixture user could delete any event by id | Resolves ownership via `requireStudentFor` or `ownerId`, else NOT_FOUND |
| `saveScheduleEntry` | Checked access to `input.studentId`, then overwrote whatever row `input.id` named — a caller could write over another student's week | Resolves the existing row first and rejects a studentId mismatch |
| `listNotifications` | Uncapped, while Supabase has `.limit(50)` — fixtures could return a longer list than production ever can | Capped at 50 to match |

Plus a latent defect: ids were generated as `store.x.length + 1`, so archiving a
row made the next insert reuse the freed id, and since the write path treats a
colliding id as an update, the new row silently overwrote an unrelated one.
Replaced with a monotonic `fixtureId()` that never reissues.

### P1-07 The fixtures masked P1-02

**Severity:** P1 · **Status:** FIXED

`fixtures.listClasses` returned the entire class store to *every* demo account.
Only the first class has a linked account, so the student demo was shown a class
they are not enrolled in — and, more importantly, fixture mode disagreed with
production about the same method, which is why the 197-test Playwright suite,
the demo and the whole gate run all looked healthy while the real student page
rendered empty.

A fixture adapter more permissive than the database does not merely differ from
it; it hides the failures in it. Students and guardians now see only the class
they are actually on, matching `linked read classes`.

---

## P2 — fix in this audit where practical

| ID | Finding | Status |
|---|---|---|
| P2-01 | `/settings` 404s; three nav items point at it. Not in `PROTECTED_PREFIXES` | OPEN |
| P2-02 | `proxy.ts` hardcodes `/overview`, which is not in `PROTECTED_PREFIXES`, so student/guardian get one auth redirect then a `/forbidden` bounce | OPEN |
| P2-03 | `setIdFormatAction` has no try/catch and silently no-ops on a foreign or malformed id | OPEN |
| P2-04 | `/api/attendance` has no rate limit, the only mutating route without one | OPEN |
| P2-05 | `saveProfile` gated on `class:read`, which students and guardians hold | OPEN |
| P2-06 | `fixtures.listStudents` / `listGrades` / `listAssessments` discard `userId` | OPEN |
| P2-07 | Toast errors use `aria-live="polite"`, never `role="alert"` (40+ sites) | OPEN |
| P2-08 | `ClassRosterDrawer`, `DeckCard`, `Attendance` fire destructive actions with no confirmation | OPEN |
| P2-09 | No Zod schema for the new calendar inputs; Postgres CHECKs are the only validator, so fixtures accept what production rejects | OPEN |
| P2-10 | `(sheet)` print CSS is imported but never injected | OPEN |

---

## P3 — polish

- `SlideEditor.tsx:715` — present-mode chrome uses `border-white/10`, a literal
  white, which is nearly invisible against the light chrome that dark mode
  produces. **Corrected during this audit:** an audit claimed this rendered
  "white text on white, zero contrast". Checked against `globals.css`, dark mode
  gives `--ink: oklch(0.96)` as the background and `--surface: oklch(0.21)` as
  the text, so the contrast is high. The claim was wrong; only the border
  literal is a real, minor defect.
- 88 deferred-`use client` components.
- `Progress` (`src/components/ui/progress.tsx`) has zero importers.

---

## Missed by the automated gates

This is the most useful section. Each of these passed all eleven gates.

| Class | Instance | Why no gate caught it |
|---|---|---|
| Filters and RLS disagreeing | `listClasses` emptying student results | Fixtures were more permissive, so fixture-mode tests passed |
| A green check that cannot see its own change | `db:check`'s hardcoded 19-table list | Nothing connected the migration to the check |
| A test asserting the wrong thing | `quiz-maker.spec.ts` reading `.value` off a Radix trigger | Assertion returned `""` and passed vacuously |
| A missing border indistinguishable from a designed one | `--border: var(--border)` self-reference | No gate asks whether a border exists |
| A duplicated matrix | `PERMISSION_LABELS` in `admin/page.tsx` | Only `tsc` caught it, when the permission list changed |
| A documented file that does not exist | `SlideFrame.tsx`, cited by an audit with a line number | Reading the audit instead of the repo |
| Unreachable code | 13 calendar seam methods, 0 callers | Lint has no dead-export rule |
| Currency shadowing | `/pricing` vs landing | No test asserts visible price text |

---

## What this audit changed

- `scripts/check-remote-db.mjs` — expected tables derived from the migration
- `src/lib/api/client.ts` — `listClasses` no longer filters on `owner_id`
- `src/lib/api/fixtures.ts` — student-scoped `listClasses`; ownership check on
  `deleteCalendarEvent`; studentId match on `saveScheduleEntry`; notification
  cap; monotonic `fixtureId()`
- `src/lib/auth/rbac.ts` — `history:write` split from `history:read`
- `src/app/(dashboard)/admin/page.tsx` — label for the new permission
- `src/app/(dashboard)/history/actions.ts` — requires `history:write`
- `src/app/(dashboard)/welcome/actions.ts` — `createFirstClass` requires `class:write`
- `src/app/pricing/components/PricingTiers.tsx` — shared peso formatter
- `src/lib/auth/rbac.test.ts` — 4 regression tests asserting the **denials**

---

## Completion status

**All seven P1 findings are closed.** No known P0. Build, typecheck, lint, 373
unit tests, 197 e2e, the SQL gate, the redaction gate, the primitives gate, the
remote-database check and the RLS settling test all pass against the live
project.

Ten P2 findings remain open and are listed above; none blocks release.

The calendar module built in commits `b67d173` and `d245ebc` is **data layer
only** — 13 seam methods with zero callers and no `/schedule` route. Its tables
now exist and its policies are enforced, so it is correct, tested and still
unreachable. That is deliberate staging, not a defect, but it must not be
described as a finished feature.