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
| P2-03 | `setIdFormatAction` has no try/catch and silently no-ops on a foreign or malformed id | **FIXED** — both store writes now answer a refusal with a sentence, matching the three sibling writes in the same file |
| P2-04 | `/api/attendance` had no rate limit | **FIXED** — see below |
| P2-05 | `saveProfile` gated on `class:read` | **NOT A DEFECT** — see corrections |
| P2-06 | `fixtures.listStudents` / `listGrades` / `listAssessments` discarded `userId` | **FIXED** — `ownedClass()` |
| P2-07 | Toast errors use `aria-live="polite"`, never `role="alert"` (40+ sites) | OPEN |
| P2-08 | Destructive actions firing on a single click | **FIXED** — archive class; two other claims were wrong, see corrections |
| P2-09 | No Zod schema for the new calendar inputs; Postgres CHECKs are the only validator, so fixtures accept what production rejects | OPEN |
| P2-10 | `(sheet)` print CSS is imported but never injected | **NOT A DEFECT** — re-checked 2026-10-17. There is no CSS import in the `(sheet)` group at all, and the print rules are injected inline by `<style>` in `sheet/page.tsx`. The only imported stylesheets, `globals.css` and `landing.css`, are both wired |

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
| A class deleted before the element existed | `cn('text-h4 text-ink')` losing `text-h4` | Nothing renders a class that was never applied; every title still *looked* like a title |
| A value measured before the thing it measured changed | present mode's index counted against the pre-flush array | The two states were correct in isolation and only disagreed under a concurrent write |

### The one that was in every card, dialog and sheet

Found while building the timetable, by measuring rather than by looking.

`cn` is `twMerge(clsx(...))`. `tailwind-merge` resolves conflicts by group, and
out of the box the only things it believes are font sizes are Tailwind's
`text-xs` through `text-9xl`. This project's eight typography tokens are not
Tailwind's, so all of them fell into the **colour** group, where two classes
conflict and the later one wins:

```
twMerge('text-h4 text-ink')        ->  'text-ink'
twMerge('text-body text-ink-muted')->  'text-ink-muted'
```

The size was deleted before the element was created. Nothing in the component
could have shown it and no screenshot could have named it, because the defect is
the absence of a class rather than the presence of a wrong one. It also explains
why some screens looked right: a class written as a plain string
(`className="text-body text-ink"`) never went through `cn`, and
`twMerge('text-sm text-ink-muted')` survives because `text-sm` *is* a known size.

Seven call sites, all of them shared primitives: `CardTitle`,
`CardDescription`, `DialogTitle`, `DialogDescription`, `SheetTitle`,
`SheetDescription` and `TableCaption`. So **every card title, dialog title, sheet
title and table caption in the product** had been rendering at the inherited
16px and regular weight instead of its designed scale. It reads as "a bit plain",
not as a fault, which is why it survived this long and why a per-page visual pass
would have kept missing it.

Fixed in `cn` rather than at the seven sites, because the seven are a symptom:
the next person to put `text-` inside a `cn()` call would have hit it again with
no reason to suspect `cn`. The fix appends the project's tokens to the shipped
default group rather than restating it, so `text-[0.9375rem]` keeps working, and
`src/lib/utils.test.ts` asserts both halves: the pair survives, and real conflicts
still resolve (`cn('text-h4', 'text-body')` is still `text-body`). A fix that
merely stopped merging would have passed the first and broken every component
default in the product.

---

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

*(Round three closed the photo capture and confirm screens, terms, custom events
and deadlines. Round five closed the notification bell, end to end: a policy, a
producer, a consumer and a journey that proves the two join up. See below.)*

**Not 100%.** The objective asks for every page, button and workflow to be
functional and audited. The largest remaining piece is a redesign of sign-in and
sign-up on the new branding, plus `probe:ai`, which is blocked on Gemini capacity
rather than on anything in this repository.

---

## Round four: a feature nobody had ever driven

The flashcards feature (decks, cards, and a per-student review schedule) was
built into this working tree by a second process between 23:02 and 00:12 while
this audit was gating an earlier commit. It landed uncommitted, on top of the
commits this audit had already made, and it was **not** reviewed by anyone: its
own author had never seen it run.

It arrived with fifty-odd unit tests, a clean typecheck and a clean lint. It
also had **no browser test at all**, which is the same gap `/history` came
through in round one. Everything below was found by driving the route.

### A test that passed once and failed forever after

`e2e/interactions.spec.ts` had two adjacent tests believed to be racing on the
class default grading scale. They were not racing. I held one fixture server
across two runs to test it directly:

| | Run 1 | Run 2, same store |
|---|---|---|
| before | pass, 2.8s | **fail**, button stuck `disabled` through 43 retries |
| after | 25/25 | 25/25 |

`Gradebook.tsx:89-90` is why. The override map is component state, so a reload
opens on `classPolicyId`, and the apply button is disabled precisely when the
selection already matches the class. The old test chose `letter`, applied it and
never put it back; the next run opened *already* on `letter`, so `chooseOption`
clicked the value that was already selected, Radix fired no change, and the
button never enabled.

**The coupling was across runs, not within one.** Under `fullyParallel` that is
exactly how a cross-run coupling looks: whichever test happened to load the
gradebook after the mutation saw the dirt. Serialising the file had hidden the
cause while making all thirteen tests four times slower to protect one.

The same defect was latent one describe down. `the save button is inert until
something changes` left `Ravensmoor College` on the profile permanently while
the test above it asserts `Northfield Science Academy`. Under `fullyParallel`
those two can land in either order across workers.

**Rule: a test that writes must put the world back.** Not "serialise the file",
which treats the symptom and slows every other test for it. Read what you found,
move it somewhere else, prove the move off a reload, and restore it.

### Sharing was unreachable, and the two adapters disagreed about why

`loadShareableClasses` called `listClasses` and then filtered the result *again*
on `ownerId === session.userId`. `listClasses` already answers the question, so
that second filter re-implemented a rule rather than sharing one.

Invisible on the real project, where a teacher's classes genuinely are owned by
their own id. In fixture mode the seeded classes are owned by a synthetic
`demo-owner`, so the filter returned empty, and the component that draws the
share picker renders nothing when its list is empty. A teacher could not share a
deck at all, so the whole sharing path was unreachable and therefore untested.
The production answer was right and the local one was wrong: the same lie as
the too-permissive fixture in P1-07, pointing the other way.

The fixture had the matching half: `createFlashcardDeck` re-derived ownership
with a raw `cls.ownerId === userId`, so even once the picker appeared the save
failed with `FORBIDDEN`. It now uses `isDemoStaff`, the escape `ownedClass` and
`ownedDeck` already use, and deliberately **not** the wider `isDemoAccount`:
the demo set includes a student and a guardian, a student owns no class, and
widening it would hand them a publish the database refuses. Staff is exactly
the set that owns a class.

A third piece fell out of that. Gating the picker on `flashcard:write` was not
enough, because a student holds it at `own` scope and their `listClasses`
answer is classes they are *enrolled* in rather than ones they own. That built
a share control whose every save was refused. The gate is now `class:write`,
the permission that actually means "may own a class", rather than a role name.

### Mojibake, visible to every student, in a green build

The review session rendered its counter as `1 left Â· 0 reviewed`. This is the
second time this class has reached this product, after the weekly grid. The
typechecker, the linter and several hundred unit tests were all green, because
a mojibake character is a perfectly well-formed string.

Fixed at the bytes, then guarded by `src/lib/encoding.test.ts`, which scans the
source for UTF-8 read as Latin-1 and names the file, line and both codepoints.
It is mutation-proven: injecting the sequence turns it red. Its only allow-list
entry is `schedule.spec.ts`, which names the mojibake on purpose in a
regression assertion, and a second test fails if that entry goes stale. The
guard does not allow-list itself; it describes the characters instead of
reproducing them, because a guard that exempts itself is not obviously still a
guard.

**A caveat worth carrying.** When reading Playwright output on this machine, a
correct `·` (UTF-8 bytes `C2 B7`) displays as `Â·` if the output is decoded as
Latin-1. The same pipeline turned Playwright's `×` into `Ã—`. Verify a byte
claim by reading the bytes, never by reading rendered output.

### The admin matrix test was counting literals

Adding three permissions broke a test that had nothing to do with them: it
asserted a student holds exactly four own-records-only grants, and a parent
exactly three. Both are now derived from `PERMISSIONS` and `scopeFor`, which is
what the test already claimed to prove.

My first correction to it was wrong in a way worth recording. I asserted a
parent cannot author a deck by expecting the label to be **absent**. The page
renders every permission for every role, refusals included and bare. That
assertion would have passed on a table that silently dropped the row instead of
refusing it, which is the opposite of what has to be true. It now asserts the
refusal carries no scope annotation.

### The calendar panel asked for a term in words and offered no way to add one

`CalendarExtrasPanel` displayed the current term, and where there wasn't one it
told a teacher *"No term has been set up yet. Adding one tells everyone which
stretch of the year this is."* It offered no control to add one. `saveTermAction`
and `deleteTermAction` were already written and already gated on `class:write`,
and `termSchema` already refused a backwards range with a sentence naming both
dates. The form was genuinely the last missing piece.

**Copy that describes an action the surface does not have is a defect**, and it
is the same shape as the empty-classes page: the panel read as a feature that
existed while offering nothing to drive.

Built, with four e2e tests: a teacher sets one up and the calendar states it
back, a backwards range is refused with the reason, the term can be taken away,
and a student is offered neither the form nor the delete.

### Writing those tests found two more

**THE TERM LINE HAD NO YEAR.** It rendered `Autumn term Mon, Aug 3 to Fri, Dec
18`. A term is the one thing on that panel that routinely crosses a calendar
year, so "Aug 3 to Jan 18" is not ambiguous to a machine and is ambiguous to a
teacher: it does not say whether this is the term that began last August or the
one beginning next. `readableDate` now takes a `withYear` flag, set for term
boundaries and deliberately not for deadlines, which are read against today and
where the year is noise.

**NEITHER DIALOG HAD A CANCEL BUTTON.** The only ways out were saving or
pressing Escape, which discards whatever was typed with no confirmation.
`NewDeckButton` and `ScaleEditorDialog` both have one. Added to both, since it is
the same defect and the same file.

One of my own tests was wrong first: it asserted the literal date range, and it
failed because `toLocaleDateString` with no fixed locale renders `Aug 3` on
en-US and `3 Aug` on en-GB. **An assertion that names a locale-formatted order
fails on half the machines.** The assertion is on the year, which is stable.

### A toast error was announced politely

Sonner 2.0.8 has exactly one `aria-live` in its entire dist bundle. It is
`polite`, it applies to every toast, and there is no prop to change it and no
exported subscription hook. So `toast.error` — the one message in the product a
person needs to be told about — was announced at the same priority as "Profile
saved", queued behind whatever a screen reader was already reading.

The forty call sites recorded in P2-07 are not where the fix belongs. `toast` is
now wrapped once in `src/lib/toast`, which escalates `toast.error` and only
`toast.error`: an interruption per saved keystroke would make the product worse
to use with a screen reader, not better. Success toasts stay polite on purpose.

Three things are pinned, because each is easy to lose silently:

- The region id is declared in **two** files. If either is renamed, the
  announcement reverts to polite and **nothing fails**, because a live region
  nobody writes is quiet rather than broken.
- The region is `aria-live="assertive"` and deliberately carries **no
  `role="alert"`**. A permanently present `role="alert"` region matches every
  `[role="alert"]` query in the suite, and an empty one satisfies a count
  assertion that was meant to be about a real error.
- No call site may import `toast` from sonner directly.

That last check earned its keep immediately. It caught `slides/[deckId]/SlideEditor.tsx`
still importing from sonner, which my own rewrite had missed because PowerShell
treated the `[deckId]` in the path as a **wildcard pattern**. The tooling hid a
bypass and the guard did not.

### The accessibility fix broke a test that had been correct

The full-suite run failed on `admin.spec.ts` immediately afterwards:

```
strict mode violation: getByText('Seats must be a whole number between 1 and 10,000.')
resolved to 2 elements:
  1) the toast title
  2) <div class="sr-only" aria-live="assertive" id="liko-assertive-toasts">
```

The second element is the region added a moment earlier. **Mirroring an error
into a live region puts the same sentence in the DOM twice, on purpose**, so
every assertion about a toast that uses a bare `getByText` matches both and
fails.

The temptation is to call that a flaky test. It is not, and the difference
matters: the assertion was correct when it was written, the product changed
underneath it deliberately, and the fix belongs in the assertion. `e2e/helpers/toast.ts`
now scopes a toast read to the toast region, so the scoping is stated once
instead of at every call site.

**Adding user-visible text to the DOM breaks every assertion that matches that
text**, in both directions: an assertion that the message is *present* starts
matching two elements, and one that it is *absent* stops meaning anything while
the region is populated. I predicted the second before making the change and the
first is what actually happened.

### Two findings that were not findings

Recorded so the next reader does not repeat the search.

**Three identical interval hints on a new card is not a defect.** Hard, Good
and Easy all advance one rung on a first sighting, and `scheduler.test.ts`
asserts it deliberately. It looks like a violation of `formatInterval`'s own
promise that two buttons never share a label, but that promise governs
graduated cards, not the ladder.

**`flashcard_decks` read policy not excluding an archived deck is not a
defect.** `listFlashcardDecks` filters `.is('archived_at', null)`, so no surface
reads one. Worth hardening in RLS as defence in depth, not a bug a person can
hit.

One real comment defect was in the same module: `scheduler.ts:131` claimed
`hard` graduated "a day early" against a `good` that graduated later, and both
branches were `1`. The dead ternary is gone, the comment now matches, and a
test pins the real behaviour.
---

## Round five: a bell with nothing to ring it

### The table had a realtime channel and no way to write to it

`notifications` shipped with select, update and delete policies, all own-only,
and it was added to the realtime publication. There was no `INSERT` policy, no
method on the seam that created a row, and no surface that read one. Every part
of the feature that can be switched on was switched on, and the one part that
makes it a feature was missing.

That direction is worth naming, because it is the opposite of the usual broken
feature. A table nobody can write to fails closed and reads as empty. A table
nobody can write to *while a socket is subscribed to it* reads as live: the
transport is doing real work, delivering zero messages, and no error anywhere
says the producer is missing.

**The insert policy.** `supabase/migrations/20260101000000_initial_schema.sql`
now carries `teachers may notify their own students`, whose `with check` states
two conditions: the recipient is not the writer, and the recipient is an active
student on a class the writer owns. Applied to the live project: 28 tables, RLS
on all 28, **41 policies**. `check:sql` is green at 33 re-runnable policies.
`scripts/rls-settling-test.mjs` gained two denial checks and reports **14 passed,
0 failed**, because a policy that is sound on paper and unexercised against a
real signed-in account is not a policy anybody has proved.

### A fixture stricter than the database, for the third time in this repo

`getStudent(userId, studentId)` is new in this round. It answers one question:
may this caller act on this roster row, as opposed to see it. The
implementation compared `cls.ownerId === userId`, and **the seeded demo classes
carry the synthetic owner id `demo-owner`, which is nobody's account id**.

So `getStudent('usr_demo_maya', 'stu_001')` returned `null` for the demo
teacher, in fixture mode, while the Supabase adapter returns the row. That is
the dangerous direction of a seam disagreement, and the direction that had
already caused two of the bugs fixed in earlier rounds: a fixture stricter than
Postgres does not announce itself. It makes a working feature look broken
everywhere the fixture is what runs, which is the demo, the development server
and every Playwright run.

The same defect had already been found and fixed twice, in
`createFlashcardDeck` and in `listClasses`. That is what made it findable the
third time: not the search, the fact that the answer was already written down
in a comment beside two other copies of it. **When a defect appears once in a
family, the family is the finding.**

**The fix uses `isDemoStaff`, not `isDemoAccount`, and the narrowness is the
point.** `ownedClass` beside it uses the broader helper, and the two now differ
on purpose: reading a roster is not authority over it. A demo student or
guardian may legitimately see a class, and must not gain the right to write
into somebody's inbox because of it. `getStudent` is a write-authority grant,
`listStudents` is a read, and the code says so at the point of the difference.

Three tests in `src/lib/api/notifications.test.ts` pin it: the demo teacher
resolves the demo student, a demo student and a demo parent both get `null` for
a roster row that is not theirs, and a student still resolves their own row.

### The defect was a silent no-op, which is worse than an error

`saveScheduleEntry` resolves the recipient, and skips the note when there is not
one:

```ts
const recipient = await store.getStudent(session.userId, input.studentId);
if (recipient?.accountId && recipient.accountId !== session.userId) {
  await store.createNotification(session.userId, { ... });
}
```

A `null` from `getStudent` takes the `if` branch as quietly as a student with no
linked account does. The class is on the timetable either way. Nothing is logged,
nothing is rendered, nothing is retried. **The failure mode of a notification
system is silence, and silence is what the bug produced.**

Two things about that block are deliberate and are not defects. The notify
failure is swallowed on purpose, because a teacher whose class saved correctly
must not be told it did not, and "notify failure must never fail the save" is
the rule. And the recipient is resolved from the roster row rather than from the
caller, because a student's `owner_id` is their teacher: `studentId` and account
id are different values and only one of them is a login.

### Three of my own tests were asserting the order they ran in

The first version of `e2e/notifications.spec.ts` failed three of five, and one of
the failures was the product defect above. The other two were mine.

The demo student has one inbox and the whole suite shares it. `schedule.spec.ts`
genuinely writes a note every time a teacher saves a class, and my own
"mark all as read" test read every note in the inbox, which is **not reversible
through the product**. With `fullyParallel`, "2 unread" is a statement about
which worker ran first.

Serialising the file would have hidden that rather than answered it, and the note
in `schedule.spec.ts` already explains why that is the wrong move: it serialises
every test in the file to protect two. What actually fixed it was changing what
was claimed:

- `e2e/notifications.spec.ts` asserts only what a fixed set of rows does. It
  opens onto the inbox, names what is in it, checks that a teacher's inbox is
  empty rather than full of a student's, and checks that the menu opens and
  closes from the keyboard. No count assertion anywhere, because no count is
  this file's to make.
- The end-to-end journey lives in `schedule.spec.ts`, in **one test**. The
  teacher saves a class, the student opens the bell, the row says "Unread.", the
  click navigates to `/schedule`, and after a reload the same row does not. One
  write, removed in a `finally`, in the file that already owns the demo week and
  counts it.

That last point is the rule the repo keeps teaching and that this cost two runs
to relearn: **a test that writes must put the world back, and a test that cannot
put it back must not assert on the part it consumed.**

### An empty inbox is a feature nobody can see

`fixtures.ts` seeded `notifications: []`. With the bell built, that renders as an
empty circle for every demo visitor and every student: the feature is present,
renders, and renders nothing, which is indistinguishable from a missing one. The
same reasoning the seeded week and the seeded calendar already carry.

Three rows for the demo student: two unread and one read. The badge, the
highlighted row and the "Mark all as read" state are three different renders,
and a demo showing only one of them shows the emptiest of the three.

They are rows that already exist, not rows the demo session writes, so they do
not go through `createNotification` and its refusal rules. Nobody is creating
them; the teacher created them before the demo started.

### A note with a number on it and no clock

`src/lib/relative-time.ts` is a pure function with `now` as an argument, because
a time formatter tested only through a DOM is a time formatter not tested. Its
boundaries are the whole of it: truncation and a singular, never rounding. A
reader told "1 hours ago" has been told something false, and one told "in -3
minutes" has been told nothing at all. A timestamp later than `now` is a
database clock disagreeing with this one, so it reports as "Just now" rather
than as a date in the future.

The component gates it on `useIsHydrated`, and that is the one thing that hook
is for. "4 min ago" is a function of now, and now is the server's clock on the
first render and the browser's on the next; a row crossing a boundary between the
two is a hydration mismatch. The stamp is omitted until the client is mounted,
rather than rendered from two disagreeing clocks and patched.

**Nothing is subscribed to.** The table is on the realtime publication and a
socket per open tab is a real cost for an update that is not urgent. A
subscription would also fire in fixture mode against a database no fixture ever
writes to, which is a surface that looks live and is not.

### One collision I checked and did not "fix"

`e2e/helpers/toast.ts` scopes a toast read with
`getByRole('region', { name: /Notifications/ })`. The bell adds an
`aria-label="Notifications"`, which looks like the collision I have been burned
by before, so it was checked rather than assumed.

In the installed `sonner@2.0.8`, that region is
`<section aria-label={`${containerAriaLabel} ${hotkeyLabel}`}>` with the
defaults `Notifications` and `altKey+T`, so it is a `region` named
`"Notifications altKey+T"`. The bell's label is on a `role="menu"`, which
`getByRole('region', ...)` cannot match. The regex is still necessary and still
correct: the real name carries the hotkey, so it could not be an exact string.

**Tightening it would have been a speculative edit to a helper that 224 tests
depend on, to guard against a collision that does not exist.** Checked, recorded,
left alone.

### The bell carries no deletion, on purpose

There is no "delete notification". Marking read is the whole of the consumer, and
a bell whose list has to be emptied by hand is a bell that will not be emptied.
The `delete` policy exists in the database and nothing calls it, which is the
one loose end here: an unused policy is a small amount of unnecessary surface
rather than a hole, and closing it would mean a seam method, an action, a
confirmation and a test for a feature nobody asked for.

### A latent flake from three commits ago, caught by the gate rather than by me

The first gate run after this work came back **9 pass, 1 blocked, 1 fail**, with
`e2e` red on a test I had not written and had never seen fail:

```
onboarding.spec.ts:153  expect(locator).toBeVisible() failed
  strict mode violation: getByText('PHY-1 is already in use.') resolved to 2 elements:
    1) ... aka getByRole('region', { name: 'Notifications alt+T' }).getByText(...)
    2) <div class="sr-only" aria-live="assertive" id="liko-assertive-toasts">
```

My own full run of the same 224 tests had passed four minutes earlier. Both
things are true, and the reason is the rule this document already states in the
round-four section under a different heading: **adding user-visible text to the
DOM breaks every assertion that matches that text, in both directions.**

`toast.error` writes its title into two places, deliberately: the Sonner toast
everybody sees, and the assertive live region that a screen reader is told
about. Element 1 is the first, element 2 is the second. The Sonner toast is
dismissed after four seconds; the assertive region is written on a 60 ms tick and
**never cleared**. So a bare `getByText` saw two elements if it resolved inside
the four-second window and one element if it resolved after it, and which of
those happened was decided by how busy the machine was that minute. The gate runs
e2e immediately after a build, which is the busiest moment in the run.

This is not a new defect. It arrived with P2-07 in `e89b315`, and the same change
broke `admin.spec.ts:166` and `quiz-maker.spec.ts:358` in the session that made
it, at which point `e2e/helpers/toast.ts` was written and two call sites were
repointed. **`onboarding.spec.ts` and `interactions.spec.ts` were missed.** Both
are fixed, and both now say why in a comment, because a `toastText(...)` with no
comment reads like redundancy and the next person will helpfully unwrap it.

**The lesson is not about the two call sites.** It is that a fix which duplicates
content into a second channel has a blast radius equal to every assertion that
matches that content, and the blast radius was worked out by running the suite
once, at a moment when it happened to land the right way. `onboarding.spec.ts`
had been passing, loudly, for sessions.

### Two bells, both called Notifications

The sidebar already carried `{ href: '/settings/notifications', label:
'Notifications', icon: Bell }`. Then the header got a real bell.

Nothing broke. Every test passed, because nothing asserts that two controls on a
screen have different jobs. But a user who wants to read their notifications now
finds two bells, both labelled Notifications, one of which opens a switch for
push alerts about at-risk students and the other of which opens their timetable
notes. One of those is a settings page the wrong person opens, which is a small
friction every single time.

The sidebar item is now **"Push alerts"** with `BellRing`, so the two are
distinguishable by shape before either is read. The route keeps its path:
renaming it would mean the RBAC route table, the responsive sweep and the live
verification script changing together for a URL nobody bookmarked. The settings
page's `<h1>` and metadata title follow it, and the page now says outright that
notes about your own timetable arrive in the header bell and are not switched on
or off here.

**A collision found by reading the nav rather than by running a test is still a
collision.** The automated gates were asked to catch everything and could not
have caught this one.

### What round five changed

| Change | Where |
| --- | --- |
| Insert policy, so the table has a producer | `supabase/migrations/20260101000000_initial_schema.sql` |
| `createNotification` and `getStudent` on the seam, both adapters | `src/lib/api/client.ts`, `src/lib/api/fixtures.ts` |
| `getStudent` no longer refuses the demo teacher | `src/lib/api/fixtures.ts` |
| The producer, in `saveScheduleEntry` | `src/app/(dashboard)/schedule/actions.ts` |
| Two actions and the bell itself | `src/app/(dashboard)/components/` |
| Relative time, with its boundaries pinned | `src/lib/relative-time.ts` |
| Three seeded rows so the demo is not an empty circle | `src/lib/api/fixtures.ts` |
| Eight unit tests and four browser tests | `src/lib/api/notifications.test.ts`, `src/lib/relative-time.test.ts`, `e2e/notifications.spec.ts`, `e2e/schedule.spec.ts` |
| Two latent toast flakes scoped to the toast | `e2e/onboarding.spec.ts`, `e2e/interactions.spec.ts` |
| The sidebar's second bell renamed | `src/app/(dashboard)/components/Navigation.tsx`, `src/app/(dashboard)/settings/notifications/page.tsx` |

Gate evidence for this round: unit **497 passed / 2 skipped across 37 files**.
Browser: the bell and the week, run together, **21 of 21**; the whole suite,
**224 passed**. The full gate at the end of the round is recorded in
`docs/evidence/gates.json`, and `probe:ai` remains blocked on Gemini capacity,
which is a blocked gate and not a pass.

---

## Round six: the pages nobody had ever measured

### The auth shell was outside every sweep, and that is why it was wrong

`responsive.spec.ts` has two sweeps: nothing overflows sideways, and every
control is at least 44px. Both **sign in before they measure**.

That is correct for the workspace and wrong for `/login`, `/register`,
`/forgot-password` and `/reset-password`, which redirect a signed-in visitor.
Adding them to `ROUTES` would have measured the redirect target and reported a
clean result for a page nobody visited. So the consequence of the sweep being
correct was that the entire auth shell had never been measured, on the one
screen every single person meets before they have an account to sign in with.

Added, anonymously, at 375 and 393. It found **16 controls under 44px**, and
three of them turned out to be real.

### The measurement was wrong twice before it was right

The first run reported sixteen offenders. Two thirds of them were not defects,
and both causes were mistakes in the test rather than in the product, which is
the part worth writing down.

**A checkbox is not its target.** `Checkbox` in `components/ui/checkbox.tsx` is
deliberately a 20px painted box inside a 44px span, with the file's own comment
saying so: a 20px box next to 15px body type is the right shape for a checkbox,
and the extra 24px belongs in the padding and the label. The sweep measured the
`<input>`, which is the box. A thumb aims at the row.

**`label[for]` is a caption, not a target.** Fixing the first one naively, by
resolving a control's target through `label[for=...]`, reported every text field
on every auth page as a `345x23` offender. `FormField` uses `<label htmlFor>` as a
caption *beside* the input, and that caption is a 14px line of text; the input
next to it is `h-11`. Only an **ancestor** label absorbs the tap.

**And the link exemption needed a parent, not just text.** Testing "does the
parent contain other text" exempted the logo link, because its parent is the
whole page column and the column contains the form. Restricted to text-flow
parents (`P`, `LI`, `LABEL`, `SPAN`, ...), the logo is a target again and
"Terms of Use" stays exempt, which is right: WCAG 2.5.8 excludes targets inline
in a block of text, and widening an in-sentence link would break the line it sits
in.

**I then made the first of these two mistakes again, immediately, in the very
test I wrote to lock the fix in.** `getByLabel('Keep me signed in')` resolves to
the input, which measured 20, and the test failed against a product that was
already correct. The lesson is not about touch targets: **a target-size test has
to decide what the target is before it measures anything**, and that decision is
the easy part to get wrong.

### What was actually wrong

| Control | Was | Now |
| --- | --- | --- |
| "Keep me signed in for 7 days" on `/login` | 345x23 | 44px row, via `Checkbox` |
| "Forgot password" on `/login` | 108x23 | 44px, via `AuthLink` |
| "Back to sign in" on `/reset-password` | 102x20 | 44px, via `AuthLink` |
| The LIKO mark, on all four auth pages | 84x28 | 44px, padding around the link |

The `remember` box was also the only control in the auth shell that was not built
from a primitive: a bare `<input size-4>` with a hand-written `accent-[var(--accent)]`,
sitting next to a consent gate that had solved the identical problem with
`Checkbox` three files away. Two forms, one job, two answers. That inconsistency
is the more expensive of the two findings, because the primitive was already
written and already correct.

`AuthLink` exists for the three links that stand alone. `AuthFooter`'s inline
links stay as they are, because they are in a sentence.

### Two ways off the sign-in page that did not exist

**`?reset=1` was written and read by nobody.** `resetPasswordAction` redirects to
`/login?reset=1` on success. `login/page.tsx` read `next` and nothing else. So
the person who had just chosen a new password was dropped onto an ordinary
sign-in form with no word that it had worked, and the only way to find out was to
try it. Exactly the defect `register/page.tsx` already documents for `?plan=`, one
file over.

Fixed at the point of the redirect and asserted both ways: the confirmation shows
when the parameter is there, and it does **not** show on an ordinary visit.

**An unconfirmed account was told to open an email it might never have had.**
`loginAction` returned "Confirm your email address first. Open the link we sent,
then sign in again." and stopped. The email that link came from is the most
likely reason somebody is signing in again, and there was no way to ask for
another from where they were standing. `/verify-email` works with no session,
because the session is precisely what has not been issued yet.

`ActionResult` gained a `code`, and the unverified branch returns
`code: 'EMAIL_UNVERIFIED'`. The wording stays here and may change; a link that
appears only when a sentence happens to read a certain way is a link that
silently disappears the next time somebody improves the sentence. The test
asserts the link is **absent** for an unknown address, because offering it there
would both be useless and start to leak which addresses exist.

### What round six changed

| Change | Where |
| --- | --- |
| The auth shell is measured at last | `e2e/responsive.spec.ts` |
| Four controls brought to 44px | `src/app/(auth)/layout.tsx`, `login/LoginForm.tsx`, `reset-password/ResetPasswordForm.tsx` |
| `Checkbox` and `AuthLink` shared across the auth forms | `src/app/(auth)/components/AuthForm.tsx` |
| `?reset=1` read at last | `login/page.tsx`, `login/LoginForm.tsx` |
| A way out of the unverified branch, by code | `src/app/(auth)/actions.ts` |
| Three browser tests | `e2e/auth.spec.ts` |

Auth: **11 of 11**. Responsive, auth pages included: green at 375 and 393.

---

## Round seven: the page that was dead in production

### `.is()` is not `=`

`calendar_events` was read with `.is('student_id', studentId)`.

PostgREST's `is` operator is not equality. It takes only `null`, `not_null`,
`true`, `false` or `unknown`, and it renders as `column=is.<value>`. For a
teacher `studentId` is `null`, so the query reads `student_id=is.null` and is
correct. For a student it is a uuid, so the query reads `student_id=is.<uuid>`
and PostgREST answers **PGRST100, "failed to parse filter (is.<uuid>)"**.

So `/schedule` threw on the server for every student, hit its error boundary,
and surfaced as minified React error #441. In development it was worse in the
opposite direction: a Suspense fallback that never resolved, with no error at
all on the page.

```
⨯ Error [DataError]: Something went wrong. Try again.
    at Object.listCalendarEvents (src/lib/api/client.ts:2763:5)
    at async loadCalendarExtras (src/app/(dashboard)/schedule/events.ts:41:27)
    at async SchedulePage (src/app/(dashboard)/schedule/page.tsx:52:18)
  [cause] { code: 'PGRST100',
    message: '"failed to parse filter (is.312d15c9-b3e8-41d6-90df-018b7a0f1466)"' }
```

Fixed to branch on `null` and use the operator that matches the value.

### Two hundred and thirty-one green tests said nothing about it

Every browser test in this repository drives `fixtures`. A fixture never builds
a PostgREST filter, so the entire Supabase adapter is invisible to the e2e
suite: a typo in a filter, an operator that does not mean what it looks like, a
column that does not exist. The script that does test it, `verify-app-live.mjs`,
documents this in its own header and had **never been run against a live
server**, because the server it needs has to be started by hand and the header
implied the script started it.

`pnpm e2e` at 231 passing is therefore not evidence about production. It is
evidence about the fixtures. That distinction is the finding, and it is why the
route was added to the verifier rather than merely patched.

### The verifier was wrong four ways before it was right

It found the bug. It also produced three false failures and would have reported
one if run blind, which is the more interesting part.

**It raced the stream.** Both reads ran at `domcontentloaded`, while Next.js is
still streaming. At that instant the document holds **two** `<main>` elements:
the bare shell the browser received first, whose content has not arrived, and
the real tree still inside a hidden container. `locator('main')` resolves to two
nodes and throws.

**It swallowed the reason and named the wrong file.** Both reads used
`.catch(() => '')`. A strict-mode violation became an empty string, and an empty
string is a perfectly good page body to the line above, so the check did not say
"I could not read this page". It said:

> HTTP 200 but "Ana Ferreira" is not on the page, so this is an empty state
> rather than real data

which is confident, specific, and completely wrong, and which points the next
investigation at the Supabase adapter. **A tool failure must never be reported
as a product failure, because the cause names the wrong file and that is the
expensive kind of wrong.** `pageText()` now throws with the real reason, and
there is no `.catch` anywhere on a read that produces a verdict.

**It never covered the newest routes.** `/schedule` and `/flashcards` were not
in the list at all.

**Its own comment lied.** "a real server started with `LIKO_DATA_MODE=supabase`"
read like the script starts one. It does not, and without one every account gets
`ERR_CONNECTION_REFUSED`, which is indistinguishable from a broken application
to anyone who does not already know.

### The guard, and what it cost to write

`src/lib/api/postgrest-filter.test.ts` scans the adapter and fails if a variable
is ever handed to `.is`.

The first version used two regexes to strip comments and reported a defect in
**my own comment**, because the fix for this bug explains the bug by naming the
line it removed. That is the general trap: **a comment explaining an absence
necessarily names the thing absent**, so any negative source assertion has to
strip comments before it looks, or it will spend its life finding the very
things it was written to explain away.

The stripper is now a small state machine with its own three tests, including
the one input that could make the guard lie: an unterminated block comment,
which correctly swallows everything after it and cannot happen in a file that
typechecks. The guard also asserts that **both legal shapes still exist**, so
"simplifying" `.eq` to `.is` everywhere cannot make it go quiet, which is how a
guard becomes worse than no guard.

Swept for the class across the whole repository. This was the only `.is` given a
value PostgREST will not accept; `.is('org_id', 'not.is.null')` in the auth store
is a deliberate PostgREST idiom and is correct.

### Confirmed on production, not only locally

`https://liko-jcuadys-projects.vercel.app/schedule` as `student@liko.test`: no
error boundary, no page errors, heading "Schedule".

### Three findings this round did not close

Recorded here because they are real, measured, and still open.

**`schedule_entries` is empty in the live database.** The seed writes 3 classes,
24 students, 6 assessments and 25 grades, and writes no timetable at all, so
the deployment's flagship page renders "No classes yet" while the fixtures show a
fifteen-lesson week. The same is true of `flashcard_decks` and `flashcards`:
`/flashcards` is a correct empty state in production and has never once been
verified against a real row.

**An administrator sees "0 students" for a class of eight.** `classes` carries
`admin reads classes`, so an admin lists every class in the organisation.
`students` has only `"own rows"` and `"linked reads own student row"`, neither of
which admits an administrator, so every roster read returns nothing. The page
prints the number it was given, so a real teacher's class is labelled "0
students". The class list and the roster disagree about what "may see this class"
means, and the page believes the roster.

Whether an administrator should see children's records at all is a privacy
decision with two legitimate answers, and it is not one to be taken by default in
either direction. What is not a decision is that **the page must never assert a
count it was not permitted to read.** "No students" and "not allowed to read the
students" are different facts and only one of them is true here.

**The fixture hides it, in the direction that hides.** `listClasses` and
`ownedClass` both exempt every demo account, so the fixture shows an admin eight
students and production shows none. This is the fourth time this project has
found that shape, and the comment on `listClasses` already describes it in full
for the earlier occurrence.
