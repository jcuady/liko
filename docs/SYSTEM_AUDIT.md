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

Measured against the working tree at the time each row was last run. Rows are
**not** all current. Each row carries the commit or the round it was last measured
on, and every row that was not re-measured says so in its own text rather than
inheriting a word from an earlier round.

| Check | Result | Evidence | Last run |
|---|---|---|---|
| Build | **PASS** | `pnpm build`, exit 0, in a detached worktree at `312da33` and again after the dialog fix | round twelve |
| Typecheck | **PASS** | `pnpm typecheck`, exit 0 | round twelve |
| Lint | **PASS** | `pnpm lint`, exit 0 | round twelve |
| Unit tests | **PASS** | `537 passed, 2 skipped`, measured in a detached worktree at `312da33` so the figure is that commit's and not the shared tree's. The commit after it changed only a client component with no unit test. | round twelve |
| e2e | **PASS** | `241 passed (4.8m)` at `9604440`, the whole suite, exit 0. Up from `232` at `fe01de2`: eight of these are the new attendance note spec. | round twelve |
| **Full gate** | **21 pass, 0 blocked, 0 fail, 0 error** | `pnpm gates` at `371eeca`, recorded in `docs/evidence/gates.json`, with the build recorded as served and unchanged across the run. Twenty-one registered gates. **The e2e gate flaked on the previous run of this same commit**, nine timeouts across eight specs, and the cause is established in round sixteen: eleven concurrent Playwright sessions on one machine. Not a product defect. | round sixteen |
| **Live app against Postgres** | **PASS** | `verify:app`, **57 passed, 0 failed**, run against the **deployed production site**, not only a local build. All five accounts, every entitled route, refusals, a real attendance write, cron, push, gradebook export scope, and no page errors. Run at `09ebf10`; the only commit deployed afterwards is `20819c0`, documentation only, so the measurement still describes the running system. That second half is a claim about the diff, not a second run. | round eleven |
| **Deployed to production** | **PASS** | Production serves the tip of `main`, deployed by the Vercel Git integration, so **a push to `main` is a production deploy**. Read from the deployment's own build log twice this round: `09ebf10` at 06:15 UTC and `20819c0` at 06:42 UTC. Recording both rather than the latest, because a pinned sha goes stale on the next push by anyone. | round eleven |
| **Per-role sweep of the deployed site** | **PASS** | Guardian probe against production, 5 of 5. `/grades` and `/history` each name the child the seat is linked to. | round eleven |
| **Guardian read path in production** | **PASS** | Closed. The linked-read policies are applied and the code no longer discards what they admit. Round nine's FAIL is not carried forward. | round eleven |
| SQL parse + cross-refs | **PASS** | 273 statements, 28 tables, RLS on all 28, **52 policies** re-runnable (49 in public, 3 on storage). Statements and policies are not the same count: one `foreach` statement creates twelve policies | `dc6d752` |
| **Migration applied to production** | **PASS** | All 28 tables present, measured before and after | `fe01de2` |
| Dead handlers / `href="#"` / TODO / `console.*` | **PASS, not re-measured this round** | ripgrep, no matches | earlier round |
| Raw hex outside exemptions | **PASS, not re-measured this round** | 7 hits, all legitimately exempt | earlier round |
| `transition: all`, `h-screen`, `localStorage.setItem`, `text-white` | **PASS, not re-measured this round** | zero hits | earlier round |
| Responsive | **PASS, not re-measured this round** | 5 viewports 375-1920, no overflow | earlier round |
| Behaviour (anchors, reduced motion, no-JS) | **PASS, not re-measured this round** | all checks pass | earlier round |
| Student sign-up end to end | **BLOCKED externally** | Supabase refuses the probe: `400 email_address_invalid` for a `.test` address, and `429 over_email_send_rate_limit` on other runs. Registration, the `handle_new_user` trigger and the `consent_events` write are unverified until a real SMTP provider is configured. A dashboard setting, not an application defect. | round eleven |
| Crafted `role: "admin"` | **REFUSED** | schema rejects it; no account created, and the test asserts that rather than a silent fallback | earlier round |

Rows that were **not** re-measured say so in their own text rather than
inheriting a word from an earlier round. The single BLOCKED row is blocked by
Supabase rather than by this repository. Everything marked `fe01de2` or round
eleven was measured on the state it describes.

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

Recorded so the next reader does not repeat the search. One of the two has since
been overturned, and its correction matters more than either.

**CORRECTION, AND IT IS AGAINST ME. The first of these was wrong.**

> ~~Three identical interval hints on a new card is not a defect.~~

I wrote that from two sources: a code comment asserting the four answers behaved
differently, and a passing test that pinned the behaviour. Both were true and
neither proved anything about what a person sees. Observed in a browser on a
fresh card, the buttons read **Again 1m, Hard 10m, Good 10m, Easy 10m**: three
buttons carrying the same number, and a student choosing between them is
choosing at random. A test that pins current behaviour proves the behaviour is
current. It does not prove it is right.

**The general rule this exposes is the one worth carrying out of this section: a
comment asserting an invariant is a claim to check, not a thing to believe.** I
had already written that sentence into round four, about a different comment,
about a dead ternary. It applies to the comment I then relied on myself.

A first sighting now spreads four answers across four intervals: `again` returns
to one minute, `hard` moves one rung up the ladder and stays learning, `good`
graduates at a day, `easy` at three days. Reading the source would not have found
this. Watching the buttons did.

**`flashcard_decks` read policy not excluding an archived deck is not a
defect.** `listFlashcardDecks` filters `.is('archived_at', null)`, so no surface
reads one. Worth hardening in RLS as defence in depth, not a bug a person can
hit. Still open.

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
on all 28, **52 policies** — 49 in `public` and 3 on `storage.objects`, which is
what `pg_policies` returns for the live project. `check:sql` is green at 52
re-runnable policies, and it counts policies rather than statements: 41
`create policy` statements produce 52 policies, because one of them is a loop
over twelve tables.
`scripts/rls-settling-test.mjs` gained two denial checks and now reports **25 passed,
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

## Round eight: a contract that was false on the path it was written about

### Round seven's three open findings are closed

They are recorded above as open. They are not any more, and leaving them worded
that way would be the doc lying in the way this audit exists to prevent.

**`schedule_entries` is empty in the live database — closed (`bf49804`).**
`scripts/seed.mjs` grew `seedWeek`, `seedFlashcards`, `seedTermAndDates` and
`seedTeachingSurface`, all run from the existing-class branch and guarded by a
lookup rather than a flag. The live database now holds **360
`weekly_schedule_entries`, 3 decks, 18 cards, 3 terms and 2 calendar events**.
Idempotence was proved rather than assumed: a second run wrote 0 rows. Confirmed
on production, where the student week renders fifteen lessons and the conflict
panel fires on the seeded Wednesday overlap, and where a teacher's `/flashcards`
reads "Unit 1: Atomic Structure, 6 cards".

**An administrator sees "0 students" for a class of eight — closed (`d75a38a`).**
Not by widening RLS, because whether an administrator may read a child's record
is a privacy decision and not an audit's to take by default. `ClassSummary` now
carries `rosterVisible: classRecord.ownerId === session.userId` beside the count,
so the card reads "Roster not visible to you", the header reads "N students
across the M rosters you can see", and the roster panel names whose class it is.
Verified against real Postgres rather than against the fixture: `dev@` sees
"3 classes. 8 students across the 1 roster you can see." and `maya@` is unchanged.
The privacy question itself stays open and is recorded as such.

**The fixture hides it — partially closed, and honestly.** The demo accounts are
still exempted, so a browser run continues to answer a question production does
not. What changed is that the page can no longer be wrong: it reports what it was
permitted to read rather than what it happened to be handed.

### A `?? ''` that turned "not signed in" into a Postgres type error

`currentStudentId` resolved the roster row by reading the account id inline:

```ts
.eq('account_id', (await supabase.auth.getUser()).data.user?.id ?? '')
```

`account_id` is a uuid. When `getUser()` returns no user that renders
`account_id=eq.`, and Postgres answers `22P02 invalid input syntax for type uuid:
""`. The function's own docstring promised *"Returns null rather than throwing for
an account with no roster row"*, so the contract was false on precisely the path
it was written about.

The two answers are now separated, because they are different facts. **Null**
means signed in and not a student, and every caller may render an empty review
session for it. **Throwing** means not signed in, and a caller handed null there
would show an empty session to somebody who is not signed in at all, which is the
silent no-op a `null` must never be. That distinction is the whole fix; the
guard is what keeps it.

**Reachability was checked rather than assumed.** There is no Next middleware in
the original tree, and in `supabase` mode the dashboard gate is the LIKO cookie
alone: `guards.ts` returned the signed cookie without revalidating it. That
cookie lives seven days under "remember me" while the Supabase session it shadows
can be revoked, rotated out, or simply fail to refresh. The two genuinely
diverge, so the old line turned that window into a raw Postgres error.

Honest scope: **this is latent, not an active outage.** All six live accounts have
real Supabase sessions and the dead-session path has never been observed firing.
The documented behaviour was wrong regardless, which is why it was worth fixing
while the window was theoretical.

Measured against production Postgres, before the finding was written down:

| call | result |
| --- | --- |
| `.eq(uuid_col, '')` | `22P02 invalid input syntax for type uuid: ""` |
| `.in(col, [])` | no error, zero rows |
| `.is('id', '<uuid>')` | `PGRST100 failed to parse filter` |

and after the fix, the query the function actually builds:

| account | roster row | error |
| --- | --- | --- |
| `student@liko.test` | `312d15c9… "Ana Ferreira"` | none |
| `ingrid@` (teacher) | no rows | none |
| `dev@` (admin) | no rows | none |
| `guardian@` | no rows | none |

### The guard asserts the query, not the text

The first version of this guard scanned `client.ts` for the reflex. It went red
on exactly one line, which is the point of writing it, but a source scan has a
blind spot worth naming: it matches a fallback written on the same line as the
`.eq()`, and an empty value computed earlier and passed under a name would walk
straight past it.

So the tests now drive the function with a stub client and assert **which queries
it declines to build** — that a dead session throws before any `.eq()` is issued,
that a signed-in account with no roster row still returns `null`, and that a
failed session lookup surfaces instead of being queried with. The defect was
never in the characters, so pinning the characters was never going to be enough.

That third case is the one worth keeping: it is what stops a future fix from
quietly merging "no session" back into "not a student" and reintroducing the
silent no-op.

### The rewrite landed, and the gate is green because of one line

The interval question from round four came back and was settled by observation
rather than by re-reading a comment. Running the real scheduler against a new
card:

| | again | hard | good | easy |
| --- | --- | --- | --- | --- |
| new card | `1m` | `10m` | `1d` | `3d` |
| review card at 1 day | `1m` | `2d` | `3d` | `4d` |

Four distinct labels, where the old ladder produced `10m` under three of them. The
unit tests were rewritten to match, including one that had pinned the wrong
specification and was replaced with an ordering assertion.

One e2e assertion still read the old world:

```
e2e/flashcards.spec.ts:169    await expect(good).toContainText('10m');
```

changed to `'1d'`. It has to land **in the same commit** as the scheduler:
changed alone it turns `HEAD` red in the opposite direction, because `HEAD`
still holds the old scheduler. The hint cannot drift from what the scheduler
writes — `previewIntervals` is `formatInterval(review(...))`, so it *is* the
scheduler — which is what made that assertion a real witness rather than a
string that happened to be pinned.

The e2e gate now passes in 265.5s across 20 specs, and the full gate reads
**10 pass, 1 blocked, 0 fail, 0 error**.

### The refusal screen was outside the proxy

Cross-checking every `(dashboard)` page against `PROTECTED_PREFIXES` found one
that was not listed: **`/forbidden`**. It is reached by a rewrite from the proxy
itself, so it reads like a route the proxy already had an opinion about. It was
not, and an anonymous request for it fell through the `!needsSession` branch and
was served.

It is caught today by the dashboard layout's own `requireSession()`, so this was
not an anonymous hole. It is a page relying on a second gate that has nothing to
do with the proxy, and that protection is positional: it holds because the file
sits in this directory, so nothing would announce its absence if the file moved.

**Every existing assertion in `rbac.test.ts` named four paths by hand**, so all
of them stayed green while the twenty-first route sat outside the list. The fix
is the same shape as the rest of this audit: the list is now read from disk by
walking the `(dashboard)` group, with a companion assertion that the walk found
more than ten routes and specifically found `/classes`, because a directory walk
that matches nothing would make the real assertion vacuously true — the one way
this gate could report a clean bill of health for a renamed group.

### Three failures that were the instruments, not the application

Recorded because each was reported as a product defect and none was one.

**`git status` hid four modified files.** The index stat cache goes stale on
Windows and OneDrive, so `git status --porcelain` reported a clean set while
`git diff HEAD --name-only` listed six. Work belonging to a concurrent process
was being attributed from `git status`, and two files were misattributed as a
result. When a second process is working in the same checkout, the authoritative
list is `git diff HEAD --name-only`; it reads content and cannot be fooled by a
stale cache.

**Two `next start` on one `.next` 500 every static chunk.** The symptom was 225
console errors, `text/plain` on every `/_next/static/**`, and a page that never
hydrated — which surfaced downstream as *"the control was not rendered, so the
write was never attempted"*, which reads exactly like a broken feature. The
server log was clean throughout. A 500 on a static asset under `next start` is
almost never the application; it is build thrash.

**The verifier read its own source mid-edit.** A `const ERROR_BOUNDARY` used two
hundred lines below it threw `ReferenceError: ERROR_BOUNDARY is not defined`, and
the harness printed it as a failed account. The declaration and the use had
landed in two separate saves, and Node had loaded the file between them. A
`ReferenceError` naming a symbol that is visibly declared on disk is a stale
read, not a bug.

All three had already been reported as product failures before they were
attributed, and each had to change what the product appeared to be doing. That is
the common shape, and it is why the habit matters more than any one of them: a
tool failure must never be reported as a product failure, and the cheapest
question to ask when a failure appears in a shared tree is what the instrument
is actually reading.

### What round eight changed

- `currentStudentId` no longer builds a uuid filter from a value that might not be
  one, and no longer throws a Postgres type error where it promised to return
  `null`.
- `postgrest-filter.test.ts` gained a behavioural half that pins which queries the
  function declines to build, beside the source scan that found the defect.
- Round seven's first three open findings are closed above, and the admin privacy
  question is recorded as still open rather than quietly answered.
- Two production seed gaps closed: the timetable and the flashcard decks.
- `/forbidden` is inside `PROTECTED_PREFIXES`, and the route list is now derived
  from the `(dashboard)` directory rather than restated by hand, so the
  twenty-second page cannot be forgotten the way the twenty-first was.
- The e2e gate is green again, at 20 specs.

### The real application, driven against Postgres

Every Playwright run in this project drives the fixtures, so a green gate says
nothing about the Supabase adapter. This round finally got the built application
in front of a browser against the live project, once the tree went quiet and
both `next start` processes were gone — the earlier two attempts had been
invalidated by build thrash, not by the application.

```
pnpm build
LIKO_DATA_MODE=supabase node --env-file=.env.local next start -p 3322
LIKO_VERIFY_BASE_URL=http://127.0.0.1:3322 pnpm verify:app

56 passed, 0 failed
```

All five demo accounts sign in and render every workspace route they are entitled
to; the routes they are not entitled to are refused; a real attendance write is
read back out of Postgres with the service key; the at-risk sweep, the push
subscription lifecycle and the attendance endpoint are exercised; and no console
or page error fires on any route.

The static-asset check matters as much as the pass. The two earlier attempts both
*looked* like application failures because `/_next/static/**` was answering 500,
and one of them took a working page down with a message about a control that was
never rendered. Checking a chunk's content type before trusting a browser run is
what distinguishes "the page is broken" from "the build was replaced underneath
the server".

Two witnesses in that run are worth naming, because each is a thing this audit
had previously got wrong. `/schedule` is asserted on `Clinic`, one of the two
seeded Wednesday entries that overlap by half an hour, so it is present exactly
when the real rows were read. `/flashcards` is asserted on `Unit 1: Atomic
Structure`, which is what the seed writes and not the class title the fixture
workspace uses for the same subject. Both previously asserted the fixture's
answer and would have failed against a correctly working page.

### Deployed, and read back off the live site

The deployment that served production had been built at **14:35**, before three
code commits. That is only a git-graph claim until someone reads the page, so it
was checked in a browser against the live site first, signed in as the demo
administrator:

```
Your classes  3 classes, 8 students in total.
Chemistry, Period 2  CHEM-2  K to 12 · 0 students · 5 lessons a week
Physical Science ... PHYS-1  University · 0 students · 5 lessons a week
No students on this roster yet.
```

A header counting eight students, two of three class cards counting zero, and a
roster panel declaring the register empty, all for the same school. The
adminsister "0 students" finding from round seven was not a latent edge case; it
was what the deployment was telling a user.

`a101b53` was then deployed and read back off the live site:

```
Your classes  3 classes. 8 students across the 1 roster you can see.
Chemistry, Period 2  CHEM-2  K to 12 · Roster not visible to you · 5 lessons a week
Physical Science ... PHYS-1  University · Roster not visible to you · 5 lessons a week
Science, Period 4  SCI-4  K to 12 · 8 students · 5 lessons a week
This roster belongs to another teacher, so you cannot see the names on it.

/forbidden with no session  ->  /login
```

The page no longer asserts a count it was not permitted to read, and the refusal
screen is behind the session gate.

**It was deployed from a separate worktree at `a101b53`, not from the working
tree.** The tree carried thirteen uncommitted files belonging to another process,
and `vercel deploy` uploads the directory it is run in, so deploying from where
the work sat would have shipped all of it unrecorded. A detached worktree gave a
source tree containing exactly one commit and nothing else, and the working tree
was never stashed or touched. That is the general form: **when something
uncommitted must not ship, do not deploy from the working tree — deploy from a
checkout of the commit.**

### Two findings this round did not close

**The administrator privacy question is still a question.** The page is honest
about it now; whether the policy should change is not decided here.

**`probe:ai` is blocked.** The provider is at capacity. Nothing in the tree
causes it and nothing in the tree can clear it.

## Round nine: a whole role that renders perfectly and demonstrates nothing

Found by sweeping the deployed site per role rather than per route, which is the
one angle earlier rounds had not taken.

### What the sweep said

Twenty-seven of twenty-eight route visits rendered or refused as expected. The
one that did not was `guardian@liko.test` reaching `/grades`, which my sweep had
listed as forbidden.

**That expectation was wrong and the application was right.** The matrix grants
`guardian` `'grade:read': 'linked'`, so reaching a gradebook is by design. The
instrument was the suspect, not the artefact, and checking the matrix before
filing a finding is the whole difference between a real defect and a wasted
afternoon.

But the sweep had been pointed at the wrong question. It asked whether the
guardian was refused. The interesting question is what they were shown.

### What the guardian is actually shown

```
/grades as guardian@liko.test
  Gradebook. Marks belong to a class, and there are none yet. Create a class first.
```

A guardian holds `'class:write': 'no'` and is being instructed to create a class.
The same three pages — `/grades`, `/assess`, `/plan` — hand-roll that sentence in
a bare `<p>` while the rest of the application uses the `EmptyState` component
that exists for exactly this.

### The reason behind it is worse than the copy

Reading the RLS policies settled what the empty state was actually reporting.

Both guardian-facing policies join on `account_id`:

```sql
-- students
create policy "linked reads own student row" on public.students
  for select using (account_id = auth.uid());

-- classes
create policy "linked read classes" on public.classes
  for select using (
    exists (select 1 from public.students s
            where s.class_id = classes.id
              and s.account_id = auth.uid()
              and s.archived_at is null));
```

Note that the `students` policy contains **no role test at all**. Its comment
says "A logged-in student or guardian may read the one record that is theirs",
but `account_id = auth.uid()` admits whoever their id happens to sit in that
column, which the seed only ever puts a *student's* login in.

And the seed links the guardian somewhere else entirely:

```js
// scripts/seed.mjs
// The guardian is reached by address rather than by account, so the student
// and guardian seats exercise two different visibility paths.
await supabase.from('students').update({ guardian_email: guardianEmail }).eq('id', candidate.id);
```

`guardian_email` appears **exactly once in the entire schema**: as a column
definition at line 209. No policy reads it. Not one.

So the seed deliberately creates a second visibility path for the guardian, and
the database has no policy that can traverse it. Measured with a real guardian
session against production, because the service role bypasses RLS and cannot
answer this:

| read, as | classes | students |
| --- | --- | --- |
| `guardian@liko.test` | **0** | **0** |
| `maya@liko.test` | 1 | — |
| service role (bypasses RLS) | 3 | 24 |

One of the 24 students has a linked `account_id`. That is the student seat. The
guardian seat has no path at all.

**The RBAC matrix grants a guardian two scopes the database cannot satisfy.**
`class:read: 'linked'` and `grade:read: 'linked'` describe a relationship that no
query resolves to a row, so every guardian page in the application resolves to
its empty state and the role demonstrates nothing in production.

### Why nothing caught it

This is the part worth keeping.

- The e2e gate drives the **fixtures**, where the demo workspace is not subject to
  RLS and the guardian sees seeded data.
- `verify:app` does sign the guardian in on the real database, and it passes,
  because an empty state is a **legitimate render**. The page returned HTTP 200,
  drew a header and a paragraph, and produced no console error.
- The migration's own RLS settling test covers the policies it defines. Both
  policies are correct as written; the defect is that no policy covers the column
  the seed writes.

**An empty state renders identically whether it is correct or whether a role
simply cannot read anything.** Nothing that checks "did it render?" can tell those
apart, and every check in this project was of that shape. A role can be 100%
green and demonstrate zero of the product.

### What this needs, and what it does not

It is a policy decision and not an audit's to take by default, because it is a
decision about a minor's data. The two candidate shapes:

1. **Point the guardian seat at `account_id` as the student seat is.** The
   existing policies already work; this is a seed change and touches no policy.
   It loses the "two different visibility paths" intent the seed states, and it
   models a guardian as if a guardian were a pupil.
2. **Add a policy branch joining `guardian_email` to the caller's own profile
   email**, which is what the seed's comment says was intended. It keeps the two
   paths distinct, but it makes a teacher-typed free-text address an
   authentication input, which is weaker than a uuid link.

Recorded, not chosen. What is not a decision is that the page must stop telling a
role it cannot create a class to create one.

### Two findings this round did not close

**The guardian visibility path is still dead.** Everything above is a diagnosis.
The fix is one of two shapes and belongs to whoever owns the privacy call.

**The other process's work is still uncommitted.** Fifteen files, including the
auth rewrite, the SRS scheduler and the `1d` e2e assertion, remain on disk
outside `origin/main` and outside production.

## Round ten: the linked scope reaches three tables out of ten

Round nine said the guardian seat was granted two scopes nothing could satisfy.
The seat is linked now, and measuring that turned one dead role into a map.

### Why this could not be measured before

A probe run against a guardian returns zero for two independent reasons at once:
the seat has no link, and most class-scoped tables admit no linked account. Until
the seat was linked, a zero proved neither. The other branch recorded that
caution explicitly and declined to put a number on it, which was the right call.

Linking the seat removes the first reason, and the two separate.

### The map, read with the guardian's own token

| table | guardian | its own teacher | admits a linked account |
| --- | --- | --- | --- |
| `classes` | 1 | 1 | **yes** |
| `students` | 1 | 8 | **yes** |
| `weekly_schedule_entries` | 15 | 120 | **yes** |
| `assessments` | 0 | 2 | no |
| `grades` | 0 | 9 | no |
| `student_history` | 0 | 8 | no |
| `lesson_plans` | 0 | 1 | no |
| `attendance` | 0 | 40 | no |
| `calendar_events` | 0 | 10 | no |

**Three of ten.** The service role was used only to confirm the seat really is
linked, because it bypasses RLS and would answer yes to everything: two rows
carry an `account_id`, Ana Ferreira for the student seat and Ben Osei for the
guardian. So a zero in the table above is a policy, not a missing link.

### This is why `/schedule` worked and `/grades` did not

That asymmetry is the map. `weekly_schedule_entries` carries a linked-aware
policy, so the guardian's week renders fifteen lessons. `grades` has only the
generated `own rows` policy, and a mark's `owner_id` is the teacher's id, so a
linked account is admitted nothing and the page says there are no assessments.

It also settles which half of a fix is which. Removing `.eq('owner_id', userId)`
from a read is only correct where a linked-aware policy already admits the row.
On `students` the policy exists and the filter was discarding it, so removing the
filter is the whole fix. On `grades` and `student_history` the filter is
redundant and the policy is absent, so removing it would change nothing and leave
the page reading exactly as it does now. **Two tables, the same filter, opposite
answers**, which is why this is a map and not a pattern replace.

### What it means for the product

The RBAC matrix grants a guardian `class:read`, `grade:read`, `history:read` and
`flashcard:read` at scope `linked`. The database delivers `linked` on three of
those and nothing on the others. So the matrix states an intent the schema has
not implemented for most of it, and the honest reading is that a parent account
is a partially built feature rather than a working one.

Adding the missing policies is a privacy decision and not an audit's to take by
default: a mark, an attendance row and a lesson plan are three different things
to hand to a parent, and `attendance` in particular has no parent-facing story in
this product at all. Recorded as the shape of the gap and left open.

### One thing this round got wrong before it got it right

Resolving a cherry-pick by hand shipped a file that did not parse. The edit that
removed the `<<<<<<< HEAD` side also consumed the `*/` that closed the comment,
and a stray `>` survived from the `>>>>>>>` marker. Typechecking the tree the
commit came from was green, because that is not the tree the commit was made on.

**A commit is not the tree you tested.** Typecheck the pushed state, not the
state you edited. That check cost one `tsc` run and it found two syntax errors
that a unit suite run in the wrong directory would not have.

The same run produced a false positive too: `src/lib/slides/generate.test.ts`
fails in a freshly created worktree and passes in the primary checkout on
byte-identical content, because `core.autocrlf` is true and the two files that
test compares were checked out with different endings. A test asserting two files
hold the same prompt should normalise line endings before comparing, or it passes
or fails depending on who checked the file out.

## Round eleven: a gate that failed against correct code

Round ten ended with a claim about production that this round falsified, and the
correction led to a defect in the audit's own instrumentation.

### What I believed about production, and why it was wrong

I carried forward the statement that production was still serving `42ad1b7`,
that `listGrades` there still filtered on `owner_id`, and that a guardian's
`/grades` was therefore incomplete on the live site. That claim was the entire
justification for a second deploy, and I was about to ask for approval to make
it.

`vercel inspect <production alias> --logs` says:

```
Cloning github.com/jcuady/liko (Branch: main, Commit: fe01de2)
```

**`main` is connected to Vercel's Git integration.** Production is deployed by
pushing to `main`, not by a CLI command, and the second deploy had already
happened without me running anything. The guardian probe run against production
confirms it rather than inferring it: 5 of 5, including `/grades` and `/history`
each naming the child the seat is linked to.

The wrong belief was not a careless guess. I had deployed `42ad1b7` myself and
remembered doing it, and every later fact was consistent with it, including a
deployment list showing several recent production builds. Nothing in my own
history could have told me a newer commit had since been pushed.

**Never infer what is live from what you deployed. Read the deployment's own
build log.** It is one command, it names the commit, and it is the only source
that knows about deploys you did not make.

There is a governance consequence worth stating plainly: **on this project a
push to `main` is a production deploy.** That is not a property of the code and
nothing in the repository warns about it.

### It then moved again, inside the same round

This branch is shared. Another process works in the same checkout and pushes the
same branch, so `origin/main` moved from `fe01de2` to `09ebf10` while this round
was being written, carrying six commits that were not mine, one of which changes
the data mode the app is served in.

Two things followed, and both are the same lesson arriving late.

The commit I had just made was **already on `main`**, pushed by that other
process. An approval to push it was therefore a no-op, and asking for it was
close to meaningless: the action had been taken by something else before the
question was answered. On a repository where a push is a deploy, *who pushed* is
part of the state, and `git log --oneline origin/main..HEAD` — not the branch I
am standing on — is the question that answers it.

And the row I had written saying production serves `fe01de2` was stale the
moment it was written. The corrected row names `09ebf10`, read from the build
log, and `verify:app` was re-run against production at that commit: 57 passed,
0 failed, with the gradebook scope checks included. The earlier 57 was a true
statement about a commit that is no longer deployed, which is worth very little.

**Read what is live at the moment you are about to describe it.** On this
repository that is a command, and it is cheap.

### A failing gate that was not a failing application

`verify:app` against the live site answered **55 passed, 1 failed**:

```
FAIL  /grades/export is refused
      answered 200 as text/csv; charset=utf-8 from .../grades/export
```

The same check passes against a local build of the same commit, which is what
made it worth chasing rather than filing.

The check's own comment explains what it expected: `/grades/export` "answers 404
'No such class' because a student resolves no class at all". That was true while
`listClasses` filtered on `owner_id`. Round nine's linked-read policies landed
and `e7217b9` removed that filter, so the student seat now resolves its own
class. **The assertion encoded a world that a fix had already ended.**

Measuring it with the seat's own JWT rather than reasoning about it:

| table | rows the student seat can read |
|---|---|
| `classes` | 1 (its linked class) |
| `students` | 1 (its own row) |
| `grades` | 2 (its own marks) |
| `assessments` | 2 |

And the CSV the student actually receives, fetched from production:

```
Student,Bonding Quiz (out of 11),Unit 1: Atomic Structure (out of 100),Weighted total (Percentage)
Ana Ferreira,1,48,48
```

Header, one row, its own marks. The class holds eight students and the service
key sees twenty-four across tenants. **Nothing leaked; the application was right
and the gate was wrong.**

### What replaced it

A blanket refusal was the wrong property, not merely a stale one. The student is
entitled to its own marks, and a CSV holding one row is the same data `/grades`
already renders. So the check now asserts scope:

- **the rows served equal the rows RLS admits the seat**, matched by name and
  read through that seat's own JWT, so it stays true if the seed is repointed;
- **and a class the seat cannot resolve is refused**, which is the negative the
  old forbidden-list never covered at all. An id from elsewhere must 404.

The second check is the one that actually protects anything. It had no test
anywhere in the repo.

Mutation-proved rather than assumed: reading the same roster through the service
key instead of the seat's JWT turns the first check red at
`1 data row(s) for a seat that can read 24`, and reverting turns it green again.
The assertion reads two live sources and compares them, so it cannot pass
without looking at both.

### The rule this round earned

**A gate that fails against correct code is worse than no gate, because it
trains its reader to ignore it.** The tempting fix here was to delete the check,
which would have made the suite green in one edit and removed the only assertion
ever written about who may receive a gradebook. The fix was to change the
assertion to the property actually worth holding.

The same shape as the census's `el.value` and the `?? "\0"` locator: a check
whose expectation has drifted from reality does not announce itself, it just
starts costing credibility until somebody deletes it.

### What this round did not close

The two open decisions are unchanged and are the owner's: whether an
administrator may read a child's roster at all, and whether to ship store
buttons with no app behind them. Neither is an audit's to decide.

## Round twelve: a capability with no button, and a test that caught its own bug

Round eleven ended with a note, recorded by another pass, that five exported
server actions have no caller. Verified by name across `src`, `e2e` and
`scripts` rather than taken on trust, because a number like that is cheap to
state and expensive to act on wrongly.

`removeDeckAsset` turned out to be already wired, in uncommitted work by the
other process. Four remained. One of those was a real hole in the product.

### A teacher could mark a student absent and nowhere to say why

`addAttendanceNote` has been on the server since the register was built, with
the behaviour log behind it, correct permissions, and nothing in front of it.
The mark is the half of the workflow; the reason is the other half, and there
was nowhere to put it.

The control is one dialog beside "Mark all present", not a button on every row.
`AttendanceGrid` is shared with the overview dashboard, and a 44px target in a
grid tuned for tapping a status is worse than choosing the student once, on a
screen that has to work at 375px.

The vocabulary and the 500 character limit were a literal in the action and a
second literal in the control. They now live in `note-craft`, which both read,
with eleven tests including the boundary at exactly the limit and one character
over. Two copies of one rule is how a field offers something the server quietly
refuses.

### The test caught a defect in the code it was written for

The e2e spec failed on its first run. A teacher typed a sentence, pressed
Cancel, reopened the dialog, and found the sentence still there.

The reset lived in Radix's `onOpenChange`, and the Cancel button and the success
path both called `setOpen(false)` directly. **Radix raises `onOpenChange` when
the trigger drives the state, not when the controlled prop changes**, so neither
of those two routes cleared anything. Every exit now goes through one `close()`
that sets the state and resets together.

Worth stating plainly: this was found by the test written for the feature, on
its first execution, against code that had already passed typecheck, lint and a
537-test unit suite. None of those three can see a stale field.

### Two checks I wrote that were wrong about correct code

Twice in one session, both the same shape, which is why it is written down.

The e2e refusal asserted that a student is "kept off the register" by asserting
the URL changed. It failed. The application renders the refusal copy at the
address that was asked for, which is this codebase's convention, and the check
was judging the mechanism rather than the refusal. It now asserts the copy.

That is the identical mistake to the stale `/grades/export` assertion fixed
earlier today: **a check that encodes how something should be expressed fails
the moment it is expressed differently, and the tempting response is to delete
it.** Assert the property. A refusal is a refusal whether it is a redirect, a
403, or a sentence at the same address.

### The harness lied, and it looked exactly like a product defect

The note reached the UI as a success, and Postgres held nothing. The dialog
closed, the action answered `ok`, and `behaviour_logs` was empty, including
every row written by anything.

`.env.local` sets `LIKO_DATA_MODE=fixtures`. The command that started the
server set the mode to `supabase` first and then loaded that file, so the file
overwrote the override and the server ran against the in-memory store for the
whole run. Every write succeeded and none of them existed.

This is the failure already recorded once in this repository, from the other
direction: a gate that touches data must run in the mode production runs in.
Here the gate was correct and the *harness* was in the wrong mode, which is
harder to see, because a green assertion is exactly what a wrongly configured
harness produces.

The fix was ordering, not configuration: load the env file, then set the mode.
Re-run against real Postgres, the note lands in `behaviour_logs` with the
severity chosen in the dialog, and the probe row is removed afterwards.

### What was measured, and where

The verification ran in a detached worktree at the commit, not in the shared
checkout. That was forced rather than chosen: `next start` in the shared tree
died with `ENOENT .next/server/preview-props.json` because another process
rebuilt `.next` underneath it, which is the same reason a deploy is made from a
clean worktree.

- `pnpm typecheck` exit 0, `pnpm lint` exit 0.
- `pnpm vitest run` **537 passed, 2 skipped**, measured in the worktree at this
  commit, so the figure is this commit's and not the shared tree's.
- `playwright e2e/attendance-note.spec.ts` **8 passed**, including the reset that
  caught the defect.
- The **whole** e2e suite at `9604440`: **241 passed, 4.8m, exit 0.** The
  earlier caveat on this row, that only the new spec had been run, is now
  retired rather than left standing.
- Persistence proved separately against real Postgres: one row, severity
  `concern`, then removed.

One caveat kept rather than smoothed over: the commit message for the first of
these two commits says the unit count included the other process's uncommitted
work. The isolated worktree returned the same 537, so that caveat was wrong,
though harmlessly so since it warned the number was not this commit's alone.

### What this round did not close

The two decisions are unchanged and still the owner's. One more is now visible
and worth the same question: the timetable photo import reads a photograph
through the most expensive AI call in the product and, until this round, showed
no quota. It now shows the same meter the deck panel shows and disables itself
when the hour is spent, which is why `timetableAiStatusAction` was wired rather
than deleted alongside the other two.

## Round thirteen: a sweep that reported three wrong answers in a row

The question was narrow and answerable: **does any control in the dashboard do
nothing?** It is the frontend half of round nine and round twelve, which found
capabilities on the server that no button called.

### Three passes, and only the last two were honest

| pass | method | reported | verdict |
| --- | --- | --- | --- |
| one | regex over `<button` | 19 buttons, in 144 `.tsx` files | not reading anything |
| two | TypeScript AST, lowercase `button` | 1 | wrong: `asChild` read from the wrong element |
| three | AST, `<Button>` too, `asChild` read from the parent | **0 of 162** | correct, and proved below |

Pass one was a shell scan that also failed structurally: the `Get-Content` it
depended on was throwing `A parameter cannot be found that matches parameter
name 'Raw'`, so it was reading nothing and counting its own noise. Nineteen was
never a measurement.

Pass two parsed properly and was still wrong, twice over.

It named the schedule's "Add a class" control, which is the child of
`<DialogTrigger asChild>` and receives its `onClick` from Radix through
`cloneElement`. The check looked for `asChild` on the button; it lives on the
**parent**.

And, once that was fixed, the corpus was **24 controls in 144 files**. That is
not credible for a dashboard. Almost every control in this product is the shadcn
`<Button>` wrapper, which is a capital-B component a lowercase match cannot see.
A gate that quietly examines a twentieth of the surface and reports zero is
worse than no gate, because it reads as coverage. The tag set is now both
`button` and `Button`, and the corpus is **162**.

Extending it surfaced three more candidates, and **all three were false
positives**, which is what made the parent list worth measuring rather than
guessing. Every `<X asChild>` in `src` was counted:

    DialogTrigger 13   DropdownMenuItem 3   DropdownMenuTrigger 2
    SheetTrigger 1     DialogClose 1        Button 11

`Button` is excluded on purpose: Radix's triggers and closes merge props into
their child, shadcn's `Button asChild` only swaps which element is rendered, so
a button wrapped in one really is unwired. The three candidates were a
`DialogClose`, a `SheetTrigger`, and a bare `disabled` button on the theme
toggle.

### The lesson is the false positive, not the zero

A sweep that finds real problems is still a sweep that can find fake ones, and
this is the fourth time in this repository that a consistency-style sweep has
been the thing that breaks code or lies about it.

**Measure a new check's false-positive rate before you believe its zero.** A
clean report from an instrument that has never been wrong is indistinguishable
from a clean report from an instrument that cannot see.

### A zero has to prove it looked at something

The gate printed "0 unwired" without saying how many controls it had examined,
so a run that read nothing at all would have printed the same line. It now
reports the corpus, and **an empty corpus is a failure rather than a pass**:

    ok    every control under src has something attached to it (162 controls in 144 files)

This was raised by a second, independent pass over the script rather than by me,
which is the correct kind of review and the reason the floor exists.

### Then prove it can fail at all

Before recording the zero, a dead `<Button>` and a dead `<button>` were planted
in `src`. Both were reported with file and line, the run exited 1, and they were
then removed. The capital-B plant matters: the first version of this gate would
have missed it entirely.

### Inert is reported and does not fail

The theme toggle reads "Following system" and explains that storing a choice
needs storage the teacher declined. That button is disabled on purpose and it is
correct. A gate that went red for it would be a gate failing on correct code,
which is the failure mode this audit keeps meeting, so it is printed and left
for a reader:

    note  1 deliberately disabled control(s):
          src/app/(dashboard)/settings/appearance/ThemeToggle.tsx:37  disabled=true
    ok    every control under src has something attached to it (162 controls in 144 files)
          0 unwired, 0 unexamined, 1 inert

### What it does not cover, and registered where

It says nothing about controls that are not buttons, links to routes that do not
exist, inputs whose filter never fires, or handlers that are attached but wrong.
It answers "is anything behind this", not "does this work".

Registered as `pnpm verify:controls` and wired into `scripts/run-gates.mjs` at
`d69957a`, so it runs with the suite rather than being something a reader has to
remember. That happened while this round was being written, which is why the
first version of this paragraph claimed it was not registered: it was written
against a tree where `run-gates.mjs` still had another process's uncommitted
work in it. A caveat can be true when written and false an hour later, so this
one is dated rather than phrased as a standing truth.

### What this round did not close

The two decisions remain the owner's: whether an administrator may read a
child's roster, and whether to ship store buttons with no app behind them.

## Round fourteen: thirty-six links to nowhere that all existed

Round thirteen ended by listing what its gate did not cover. One of those lines
was "links to routes that do not exist", and that is the question this round
answered.

### The answer is no, and getting there took four wrong answers

`verify:links` walks the App Router to build the set of real URLs, then parses
every `.tsx` under `src` for the `href`s written in the source. The answer is
**62 internal links across 44 routes, 0 broken, 0 unexamined.**

Getting there looked like this:

| pass | reported | why it was wrong |
| --- | --- | --- |
| one | 36 broken, including `/login` | the route set held 15 entries instead of 44 |
| two | 0 broken, 10 unexamined | `mailto:` and `#` counted as unexaminable; partial prefixes not checked |
| three | 0 broken, 0 unexamined | correct |

### The bug was one missing `else`

The first version built the route set by skipping any directory whose name was
a route group, because `(dashboard)` contributes no URL segment. It should have
descended into it *without adding a segment*. Skipping meant the set held the ten
top-level marketing pages and nothing else, and the gate then reported
`/login`, `/register`, `/overview` and `/slides` as links to nowhere.

**Thirty-six confident wrong answers from one missing `else**, and every one of
them named a page that plainly exists. A person reading that list would have
started "fixing" working navigation.

The second fix is smaller and is the one that makes the number worth having. A
link written as `` `/flashcards/${id}` `` has no static string to compare, and
the first version put all ten of those in an "unexamined" bucket, which is a way
of saying "I did not check". Their static prefix is checkable, and every one of
them resolves. `mailto:` and `#` were in that bucket too, which mixed a limit
with a defect.

### It can fail

Before recording the zero, a file was planted holding seven links: one to a
route that does not exist, one `href=""`, and five that are all legitimate
(`/slides` reaching the parent of a dynamic segment, `/slides/abc123` reaching
the child, `/pricing?plan=school#top` with both a query and a fragment, an
external URL, and a fragment-only anchor). The gate reported exactly the first
two, named them with file and line, and exited 1.

### What it still does not cover

`router.push('/x')` and `redirect('/x')` are not `href`s and are not read here.
Whether a destination then *permits* the reader is `verify:app`'s job and it
already does that per role. This gate answers "does the page exist", not "can
this person see it", and the difference is worth naming because conflating the
two is how a route ends up looking reachable and being useless.

Registered as `pnpm verify:links` and wired into `run-gates.mjs`.

### `probe:ai` passed, and then it did not

The full suite at `498362b` reads **19 pass, 1 blocked, 0 fail**. The blocked one
is `probe:ai`, and the reason is worth stating because it is the same shape as a
finding:

    FAIL  the provider answered -- HTTP 503 This model is currently
          experiencing high demand.

An hour earlier, at `38d9903`, the same gate on the same product code passed
`2 passed, 0 failed`. Nothing about the deck generator changed in between. The
gate went from green to blocked without a line of product code moving, which is
the clearest possible statement that it is measuring **the provider's mood** and
not this repository.

It is recorded as BLOCKED rather than PASS because a gate that could not run has
proved nothing, and because "it usually passes" is not the sentence a reader of
an evidence file needs. It has been capacity-blocked for hours at a stretch
earlier in this project and green moments later, and both states are true.

A gate whose result can change with no code change is not a defect in the gate.
It is a fact about what the gate can tell you, and it belongs in the table next
to the result rather than in a footnote.

It recovered on the next full run at `944f1cc`: **20 pass, 0 blocked, 0 fail,
0 error**, `probe:ai` green at 2 of 2 again. So the same gate, the same code and
the same provider gave blocked and then pass inside two hours, which is the
claim above confirmed rather than argued.

## Round fifteen: three filters the gate would not look at

The twenty-gate run at `944f1cc` reports, among everything green:

    ok    every filter under src is wired to something (131 filters in 144 files)
          0 unwired, 3 unexamined, 0 disabled

The three are `Input`, `Textarea` and `Checkbox`, the shared primitives. They
are behind a spread, and a spread in a primitive is the design rather than a
risk: a primitive exists to forward.

That is a reasonable position and it is also, precisely, an *unexamined* claim
wearing a better hat. If `Checkbox` began pulling `onChange` out of its props and
dropping it, every consent box in the product would silently stop recording
consent, the registration evidence would stop matching the schema, and this gate
would keep reporting the three as merely unexamined.

So they are examined, by a test that asserts the property rather than the
shape:

> **A primitive may consume presentation. It may not consume a handler.**

A handler name in the destructured list is a swallowed event. A presentation
name is the primitive doing its job. `className`, `type`, `rows`, `invalid`,
`name`, `id` are allowed; `onChange`, `onCheckedChange`, `onClick` are not.

### The test was worthless for its first three runs

It passed fourteen of fourteen on arrival and proved nothing, and the only
reason it was found out is that I broke the subject on purpose rather than
re-reading the assertions.

**One.** It collected only rest-element names, so `consumed` was `['props']` for
all three primitives no matter what else they pulled out. Deleting `onChange`
from `Checkbox`'s destructuring left all fourteen green. The assertion was
tautological: it compared a constant against a list built from the same
constant.

**Two.** Fixed, it reported `props` twice for `input.tsx`, because `Input` and
`Textarea` live in the same file and the walk read both while asking about one.
Functions are now collected with their ranges and the one that actually renders
the element is selected.

**Three.** `element.name.getText()` does not include the `...`: the dots are a
separate `dotDotDotToken` on the `BindingElement`. Testing the text for a
leading `...` therefore never matched, and the rest element was being counted
as a consumed prop named `props` in all three primitives.

With all three fixed, deleting `onChange` from `Checkbox` produces

    AssertionError: expected [ 'onChange' ] to deeply equal []

and a non-zero exit. Restored, fourteen pass.

**A test written in the same hour as its subject, green on arrival, is worth
nothing until the subject is broken.** Three bugs in a file whose entire job
was to be right about a three-line pattern, and not one of them would ever have
surfaced by running it again.

### What the primitives actually do

All three are correct. `Input` takes `className` and `type`, `Textarea` takes
`className` and `rows`, `Checkbox` takes `className` and `invalid`, and each
spreads the remainder onto its native element. Consent, which is the reason the
checkbox is a real `<input name>` at all, keeps working.

### Two runs of the same commit, one red and one green

At `371eeca` the suite was run twice within twelve minutes:

| run | summary | e2e |
| --- | --- | --- |
| 11:34:50 | 20 pass, 0 blocked, **1 fail** | 221 passed, 5.3m |
| 11:46:28 | **21 pass, 0 blocked, 0 fail, 0 error** | exit 0 |

Twenty tests did not report on the first run. Nothing in the product changed
between the two, and the build was recorded as served and unchanged in both.

Two agents ran suites in one checkout at that time, which is the most likely
cause: each run rebuilds `.next` and starts a server, and two of those
interleaving is exactly the arrangement that has already taken down a run in
this project once. The recording now says so itself, because it captures the
tree and the build rather than only the commit.

**A flake is neither a pass nor a failure, and it is not a pass that happened to
be lucky.** Both rows are kept above rather than the red one deleted, because a
suite that has flaked and a suite that has never flaked are different products,
and only the history shows which one this is.

The honest reading of the green row is therefore: *everything passes, and the
e2e gate has demonstrated at least once that it does not always.* Until the flake
is understood, the twenty missing tests are an open question rather than a
settled one.

### Round sixteen: that open question, answered from a file nobody was reading

The full failure was in the recorder all along. Read rather than summarised:

    9 failed
       e2e/deck-upload.spec.ts   keeps an image as an image
       e2e/deck-upload.spec.ts   a file can be taken back out again
       e2e/helpers/select.spec.ts a pointerup with no pointerdown behind it
       e2e/import.spec.ts        adds the students and reports the rows it left out
       e2e/interactions.spec.ts  shows the teacher context on the profile
       e2e/quiz-maker.spec.ts    a question can be written, answered and saved
       e2e/schedule.spec.ts      a saved class reaches the student
       e2e/slide-editor.spec.ts  the change survives a reload
       e2e/slides.spec.ts        the demo workspace ships with a real deck
    14 did not run
    218 passed (5.9m)

Nine failures across **eight unrelated spec files**, and the failures are
timeouts: `Test timeout of 45000ms exceeded` on a click, and `element(s) not
found` after a 20s wait on a page that had rendered a second earlier in the same
run. A product defect does not arrive in eight unrelated places at once and then
vanish on the next run of the identical commit.

`test-results/` settles it. Playwright writes one `run-<timestamp>` directory per
session, and in the five minutes around the failure there are **eleven**:

    11-25:29  11-27:02  11-27:03 x3  11-28:34  11-28:41
    11-29:07  11-29:20  11-29:55  11-30:28

Eleven sessions, each with its own `next build`, its own server and its own
browser workers, all pointed at one checkout on one machine. The run that failed
was competing with about ten of them. It is not established how those sessions
were launched, and this document does not apportion them.

**A red e2e gate on a busy machine is a measurement of the machine.** The
failure signature is the evidence: timeouts, scattered, in areas with nothing in
common. A real defect has a subject.

### The rule, which is about me

I launched a full `vitest run` across the same window, on the same machine,
while that gate run was in flight. That is mine, and it is the kind of thing
that turns someone else's green run red.

**Do not run a suite in this checkout while another is in flight.** It is the
same discipline as not deploying from a dirty tree and not running two Playwright
sessions at once: the second run does not just cost you time, it costs the first
run its meaning. And when a gate goes red, ask what else was running before
concluding anything about the product.

The recorder could answer this itself and currently does not. A run record that
carried the number of `test-results/run-*` directories present at start would
turn "the machine was busy" from an argument into a fact. That is the one change
this round would make to `run-gates.mjs`, which belongs to the other process and
is not mine to edit today.

### Still open

The two decisions remain the owner's: whether an administrator may read a
child's roster, and whether to ship store buttons with no app behind them.

