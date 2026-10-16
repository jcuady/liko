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
| Student sign-up end to end | **PASS** | registers as a student and lands on `/classes`, not the teacher wizard |
| Crafted `role: "admin"` | **REFUSED** | schema rejects it; no account created, and the test asserts that rather than a silent fallback |

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
| P2-01 | `/settings` 404s: no `page.tsx`, so typing `/settings` errored while the three sub-pages worked | **FIXED** — index page redirects to `/settings/profile`, gated on `class:read` |
| P2-02 | A signed-in student or guardian hitting an auth page was redirected to hardcoded `/overview`, which they lack `analytics:read` for, then rewritten to `/forbidden` | **FIXED** — `proxy.ts` now uses `landingPathFor(session.role)` |
| P2-03 | `setIdFormatAction` has no try/catch and silently no-ops on a foreign or malformed id | OPEN |
| P2-04 | `/api/attendance` had no rate limit | **FIXED** — see below |
| P2-05 | `saveProfile` gated on `class:read` | **NOT A DEFECT** — see corrections |
| P2-06 | `fixtures.listStudents` / `listGrades` / `listAssessments` discarded `userId` | **FIXED** — `ownedClass()` |
| P2-07 | Toast errors use `aria-live="polite"`, never `role="alert"` (40+ sites) | OPEN |
| P2-08 | Destructive actions firing on a single click | **FIXED** — archive class; two other claims were wrong, see corrections |
| P2-09 | No Zod schema for the new calendar inputs; Postgres CHECKs are the only validator, so fixtures accept what production rejects | OPEN |
| P2-10 | `(sheet)` print CSS is imported but never injected | OPEN |

### P2-06, the same shape as P1-07

Three fixture reads took a `userId` and then ignored it, filtering on `classId`
alone. The Supabase adapter filters on `owner_id` as well, so a caller holding
another teacher's class id read that class's roster, gradebook and assessments in
fixture mode while the same call in production returned nothing.

Nothing in the app could reach it, because class ids arrive from `listClasses`,
which is owner scoped. That is still worth closing: "no caller can reach it
today" is a statement about callers, not about the method, and the defect class
that hid the empty-classes bug was a fixture disagreeing with production in the
permissive direction. `ownedClass()` now reports a class the caller does not own
as one that does not exist, matching `ownedDeck` and the RLS read.

### P2-08, and two of its three claims were wrong

The audit named `ClassRosterDrawer`, `DeckCard` and `Attendance`. The first does
not exist under that name, and there is no deck-delete action in the codebase at
all. What it did find, one file over, was real and worse than reported:

`archiveClass` fired on a single unconfirmed click, while `archiveStudent` in the
same file had a full confirmation dialog. The less dangerous action was the
guarded one. Archiving a class takes every student on it out of the register, the
gradebook and the history in one click, with no undo offered, and the button sat
beside two other buttons in a wrapped row. It now has a dialog that names the
class, because "Archive class" is ambiguous when two class cards are open.

### P2-04 was hiding a data-loss bug

Adding a rate limit to `/api/attendance` could not be done on its own. The
outbox classifies responses to decide whether a queued write is worth retrying,
and it read:

```ts
// A 4xx will never succeed on replay. A 5xx might, so only 4xx is dropped.
const droppable = response.status >= 400 && response.status < 500;
```

429 is a 4xx. So a rate-limited attendance write would have been **deleted from
the queue** — and the teacher who had tapped a register offline would be told it
had saved. Rate limiting the endpoint alone would have introduced the data loss
it was meant to prevent.

The rule was about the status class when it needed to be about the status
*meaning*. A refusal of the request itself (400, 401, 404) is permanent. A
refusal to serve it right now (429, 503) is not, and "come back later" is
precisely what an offline outbox replaying a burst after reconnect is. 429 and
503 are now kept and retried.

This was latent before the rate limit: no route returned 429 at the time, so
nothing exercised it. The two endpoints that did rate limit were
`/api/push/subscribe` (which uses `consume`) and the AI server action. An
earlier coverage scan I ran searched for `rateLimit(` and wrongly reported that
no route was limited; the helper is named `consume`, and `/api/push/subscribe`
had been limited all along.

The attendance limit is keyed on `session.userId`, not the client IP. Behind a
school NAT every teacher shares one address, so an address limit would throttle
a whole school because one teacher tapped a large register, and an address is
also trivially rotated.

`/api/auth/sign-out` and `/api/cron/at-risk` are deliberately unlimited: the
first is idempotent and cheap, the second is authenticated by `CRON_SECRET` and
invoked by Vercel's scheduler.

---

## Corrections to this audit

Three findings were reported that did not survive checking the code. They are
recorded because an audit that only lists what it found is less useful than one
that shows what it got wrong.

- **P2-05, `saveProfile` on `class:read` — not a defect.** The gate is correct.
  The action writes `fullName`, `schoolName`, `subjects`, `defaultGradeLevel` and
  `gradingPolicyId`, all of them self-service fields, through
  `updateProfile(session.userId, …)`. It never writes `role` or `org_id`, and
  `db:settle` already proves a signed-in student cannot re-point their own
  record. `class:read` is the "has a workspace" permission all four roles hold,
  and a student editing their own name is exactly the intended behaviour.
- **P2-02's claim that `/overview` is unprotected — wrong.** It is in
  `PROTECTED_PREFIXES`. The finding was half right: the bounce was real and is
  fixed, but the cause is the hardcoded redirect target, not a missing entry.
- **P3, present mode rendering "white on white, zero contrast" — wrong.** An
  audit cited `SlideFrame.tsx:80-86` and a `data-frame="dark"` attribute. No
  `SlideFrame.tsx` exists and no `data-frame=` attribute is set anywhere in the
  repo. Checked against `globals.css`, dark mode gives `--ink: oklch(0.96)` as
  the background and `--surface: oklch(0.21)` as the text, so the contrast is
  high and the only real defect is a `border-white/10` literal that is nearly
  invisible against a light chrome.

The lesson is the same one that produced P1-01: a finding that names a file and
a line number is not thereby checked, and a verifier that reads a codebase by
recollection will cite things that are not there.

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

## Findings made while fixing

Two defects appeared during round two that belong here rather than in a commit
message, because both are the same shape as something already on this list.

### A green schema test hid a role that never arrived

Student self-signup was added with `registerSchema` gaining
`role: z.enum(['instructor', 'student']).default('instructor')`, and
`registerAction` passing `parsed.data.role`. Both were correct and the unit tests
passed.

`registerAction` assembles its parse input **field by field**:

```ts
const parsed = registerSchema.safeParse({
  name: formData.get('name'),
  email: formData.get('email'),
  password: formData.get('password'),
  role: formData.get('role'),   // <-- this line was missing
  ...
});
```

Without that line `role` is always `undefined`, `undefined` takes the default,
and every registration created a teacher. The schema admitted `student`, the
schema's own test proved it admitted `student`, and no student could ever be
created.

Nothing could have caught it at the unit level: the test exercised the schema
directly, and the schema was not where the bug was. It took an end-to-end test
that registered as a student and asserted where it landed. This is the fourth
entry in the "what the gates could not see" table, and the second where a value
was computed correctly and then never read.

### Rate limiting a route exposed a data-loss bug behind it

Adding a limit to `/api/attendance` would have deleted queued registers, because
the outbox treated every 4xx as a permanent refusal and 429 is a 4xx. The fix
belongs to the outbox, not the route: 429 and 503 now say "come back later" and
are retried. See the P2-04 section.

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
| An encoding fault | `Â·` separator in the timetable | `tsc`, `eslint` and 379 unit tests are all blind to bytes |
| A state derived from the wrong thing | staff inferred from `options.length` | Nothing asserts which role sees which empty state |
| A fixture stricter than the database | `requireStudentFor` refusing the owning teacher | Fixtures usually hide production bugs; this one hid a **working** feature |
| A comment asserting what the data does not do | the demo seed promised a double slot it did not contain | The conflict banner was unreachable, so nothing ever rendered it |

---

## What this audit changed

Round one (`999bc3c`, `5d3f1f7`):

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

Round two:

- `src/proxy.ts` — `landingPathFor(session.role)` instead of hardcoded `/overview`
- `src/app/(dashboard)/settings/page.tsx` — new; `/settings` no longer 404s
- `src/app/api/attendance/route.ts` — rate limit keyed on the session
- `src/lib/security/rate-limit.ts` — `write` preset
- `src/lib/outbox/index.ts` — 429 and 503 are transient, not permanent refusals
- `src/lib/api/fixtures.ts` — `ownedClass()` on the three reads that ignored it
- `src/app/(dashboard)/classes/ClassesManager.tsx` — archive class is confirmed
- `src/lib/schemas/auth.ts` — `role` enum of `instructor` and `student`
- `src/app/(auth)/actions.ts`, `register/RegisterForm.tsx` — role passed through
- `src/app/(auth)/lib/schemas/auth.test.ts` — rewritten for the new admission rule
- `/terms`, `/privacy`, `/children-privacy` — state what the code actually does

Round three, building and proving the timetable:

- `src/app/(dashboard)/schedule/` — new; the route, its actions and the weekly grid
- `src/lib/auth/rbac.ts`, `src/lib/query/keys.ts`, `Navigation.tsx` — the route entry
- `e2e/schedule.spec.ts` — new; eight tests driving the page as each role
- `src/lib/api/fixtures.ts` — `requireStudentFor` mirrors both RLS branches; the
  seeded week carries one genuine overlap
- `src/lib/auth/store.ts` — `isDemoStaff`, because `isDemoAccount` is also true of
  the demo student and the demo parent
- `src/app/(dashboard)/schedule/WeeklyGrid.tsx` — the `Â·` separator, and an empty
  state that is addressed to the role reading it

---

## Three defects the first timetable test run found

All three were invisible to a green build, and none of them is exotic.

**The separator was not a separator.** `WeeklyGrid.tsx` joined a class's teacher
and room with `Â·` — the two code points U+00C2 U+00B7, which is a UTF-8 middle dot
that had been decoded as Latin-1 once and written back out. Every row in the week
rendered a stray letter before its dot. `tsc`, `eslint` and 379 unit tests are all
blind to an encoding fault, and no test asserted on the assembled string. The
regression test now asserts the real separator positively *and* the mojibake
negatively, because a positive assertion alone does not tell you what changed.

**A role was inferred from a list length.** `page.tsx` decided whether the reader
was staff by asking whether the student picker had any options. A teacher who owns
a class with no students on it has none, so they were shown the student empty
state: *"You are not on a class yet. Your teacher links you from the class
roster."* A teacher asking their own teacher is nonsense, and the guardian below
was worse. `staff` now comes from the session role, which is the thing the rest of
the page already trusts.

**A guardian was told to ask a teacher.** There is no link from a guardian login
to a child anywhere in the schema: the roster stores a guardian's email and phone
as plain text and nothing joins those to an account. So a guardian can never
resolve a week, and the page has to say why in words that fit the reader. It now
does, and the test asserts the student-facing copy is *absent* — the denial is the
assertion, because the copy was the defect.

### A fixture stricter than the database, which is the rarer way round

`requireStudentFor` compared the roster row's `ownerId` to the caller, to decide
whether the caller owned the class. In the fixture workspace that column is the
synthetic `demo-owner`, which is not any account's id, so the teacher who *does*
own the class failed the check and every teacher's view of a student's week
reached the error boundary instead of a grid.

The usual shape of this defect is a fixture more permissive than the database,
which hides a production bug. This is the inverse: production was correct
(`rosterOwner` sets `owner_id`, and the policy grants it to `auth.uid()`) and the
fixture was stricter, which hides a feature that works. I read the truncated
`saveScheduleEntry` body, concluded the adapter never wrote `owner_id` at all, and
was about to report a P1 that did not exist. The insert does set it, three lines
below where the excerpt ended.

The fix mirrors the policy's two branches rather than widening anything, which
required care: `isDemoAccount` is true of the demo student and the demo parent, so
using it here would have handed the entire roster to a parent. `isDemoStaff` is
the same escape `ownedClass` and `ownedDeck` already use, narrowed to teachers and
administrators.

---

## Completion status

**All seven P1 findings are closed.** No known P0. Build, typecheck, lint, unit,
e2e, the SQL gate, the redaction gate, the primitives gate, the remote-database
check and the RLS settling test all pass against the live project.

Round two closed five more: P2-01, P2-02, P2-04, P2-06 and P2-08. One more was
disproven rather than fixed (P2-05), because the gate it recommended tightening
was already correct.

**Remaining open:** P2-03, P2-07, P2-09 and P2-10. None blocks release.
P2-09 matters most: the calendar inputs are validated by Postgres CHECK
constraints alone, so fixture mode accepts values production would reject.

The calendar module built in commits `b67d173` and `d245ebc` started as a **data
layer with no page**: 13 seam methods with zero callers and no `/schedule`
route. Its tables now exist and its policies are enforced, and `/schedule` now
renders a weekly grid with add and remove, reachable from the sidebar for all
four roles.

One seam method was still missing for that to work. Every schedule read is keyed
on a `studentId`, and **a student does not know their own**, because their
`owner_id` is their teacher's. `getMyStudentRecord` resolves it from the
`students.account_id` link, which is the same mapping the RLS policy uses, so
the two adapters answer the same question the same way. Without it the grid
would have been reachable but empty, which is the exact shape of the
`listClasses` defect in P1-02.

`e2e/schedule.spec.ts` now drives that page as all four roles, and it is the
first thing here that asserted the timetable was ever *read*: a student resolves
their own week, a teacher resolves one by picking from their roster, a crafted
`?student=` id resolves to nobody, a guardian is told the truth about why they
have no week, and a class can be added and taken back off. Three of the defects
above were found by that run rather than by reading the code.

Still outstanding on the calendar: photographing a timetable (the parser and the
image-capable AI call are built and tested, the capture and confirm screens are
not), terms, custom events, deadlines, teacher-to-student reminders, and the
notification bell.

**Not 100%.** The objective asks for every page, button and workflow to be
functional and audited. The largest remaining pieces are the rest of the
calendar module and a redesign of sign-in and sign-up on the new branding.