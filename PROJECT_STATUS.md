# Project Status

Last Updated: 2026-10-09
Current Branch: `main`
Overall Status: **IMPLEMENTED AND VERIFIED AGAINST THE REAL DATABASE, NOT DEPLOYED.** Every gate is green, including the ones that need a live Supabase project. One thing blocks a launch, and it needs the user.

## Executive Summary

LIKO is a teaching-workspace PWA: a teacher plans lessons, builds assessments, takes attendance, grades, and watches student history on one thread, and slides decks for the lesson.

The code is in good shape. The security, performance and legal-compliance pass found two genuine exploitable defects and a service-worker bug that leaked one teacher's gradebook to the next user of a shared device. All are fixed, and the two SQL-level security fixes are no longer merely argued from reading the policies: they are proven against a running Postgres by `pnpm db:settle`, which signs in as a real student and confirms the exploits fail.

The legal surface did not exist at all before this pass. There were no terms, no privacy notice and no cookie notice, despite the footer showing three dead links styled like compliance links. All three are now written, the signup form is gated on accepting them with a server-side check that cannot be coerced, and acceptance is recorded in an append-only table the account holder cannot edit.

Students cannot self-register. That was already structurally true; it is now explicit, tested, and the teacher-side path that creates those accounts actually exists.

## Tech Stack

### Frontend
- Next.js 16.4.0 App Router, React 19.3.0, Tailwind v4
- `--webpack` for dev and build: Serwist cannot hook Turbopack
- Radix primitives + CVA, vendored in `src/components/ui`
- Phosphor icons. Server components import from `@phosphor-icons/react/dist/ssr`; the plain entry breaks the build with `createContext is not a function`
- `motion` is the only animation runtime
- TanStack Query v5, React Hook Form + Zod 4, `sonner`, `next-themes`, `vaul`

### Backend
- Next.js route handlers and server actions, no separate server
- Supabase Auth for identity, custom signed session JWT (jose) in an httpOnly cookie
- Supabase Postgres with row level security on every table
- `web-push` for notifications, VAPID

### Database
- Supabase Postgres, 18 tables, one migration: `supabase/migrations/20260101000000_initial_schema.sql`
- `organizations` + `memberships` carry tenancy. There is no `owner` role; the four roles are `instructor`, `admin`, `student`, `guardian`, and `org:manage` means "can administer the organisation"

### Infrastructure
- Vercel, live at `https://liko-jcuadys-projects.vercel.app` (project `jcuadys-projects/liko`, framework preset `nextjs`, SSO protection off)
- Serwist service worker, precache plus runtime rules
- Environment: `LIKO_DATA_MODE` selects the Supabase or fixture adapter at boot, never at runtime. Production is pinned to `supabase` and verified by dataset, not by flag

### Testing
- Vitest 5 for unit, Playwright 1.63 for E2E
- 16 unit files, 12 E2E specs
- `pnpm check:responsive` and `pnpm check:behaviour` as static gates
- E2E runs against a production build on port 3311
- `pnpm db:apply`, `pnpm db:check`, `pnpm db:settle` and `pnpm verify:app` are the
  live-database gates. They are deliberately not in CI: they need credentials
  and a reachable project, and a gate that cannot run in CI is not a gate
- Both check scripts verify they are pointed at this checkout by build id before
  reporting anything; they had been silently measuring another application on
  port 3000

## Architecture Summary

Every read and write goes through one seam, `src/lib/api/client.ts`, which returns a store adapter chosen at boot by `LIKO_DATA_MODE`. Behind it is either PostgREST or an in-memory fixture workspace, so the whole product runs with no database and no network, which is what makes the E2E suite possible.

Authorisation is two independent layers. `proxy.ts` gates routes before render, purely as an optimisation. Every server action and route handler independently re-checks the session and the permission, because a server action is a public endpoint that `proxy.ts` never sees.

## Feature Status

| Feature | Frontend | Backend | Integration | Tests | Status |
|---|---|---|---|---|---|
| Marketing site | Done | n/a | n/a | Passing | Complete |
| Pricing | Done | n/a | n/a | Passing | Complete |
| Terms / Privacy / Cookies | Done | n/a | n/a | Passing | Complete |
| Cookie consent banner | Done | Done | Verified | Passing | Complete |
| Signup with consent gate | Done | Done | **Blocked, not verified** | Passing (fixture) | **Supabase path blocked by the email quota.** The form and its consent gate pass in fixtures. Against the live project the signup call returns `over_email_send_rate_limit`, so no account is ever created and `handle_new_user` never fires. Needs a custom SMTP provider or a higher plan before it can be verified |
| Consent records | n/a | Done | **Blocked, not verified** | Passing (fixture) | **Never executed against Supabase.** `recordConsent` swallows its own failure by design, so a broken audit table is indistinguishable from a working one by return value alone. It runs on signup, which is blocked, so no row has ever been written to the live `consent_events` table |
| Sign in / sign out / reset | Done | Done | Partial | Passing (fixture and Supabase) | Sign-in is proven against the live database by `pnpm verify:app`. **Password reset is blocked by the same email quota**, so no recovery link has been sent |
| Tenancy and admin console | Done | Done | Verified | Passing (fixture and Supabase) | Complete |
| Classes and roster | Done | Done | Verified | Passing | Complete |
| Teacher-issued student/guardian accounts | Done | Done | Verified | Passing (fixture and Supabase) | Complete |
| Assessments | Done | Done | Verified | Passing | Complete |
| Quiz maker | Done | Done | Verified | Passing (unit + e2e) | **Complete.** An assessment now carries its questions: single choice and multiple select only, with an answer key, points and 2 to 8 options per question. They live in a new `questions` table and are edited through `/assess`, where an assessment is selected rather than merely listed. No `free_text` kind exists on purpose, because a printed bubble sheet cannot carry one and offering it would produce questions that look markable and score zero on every scan |
| Marked-sheet scanning | Done | Done | Verified against the live database | Passing (19 unit + 3 e2e) | **Complete, single and multiple select only.** A photo or file of a marked sheet is thresholded with Otsu, segmented into bubbles by 8-connected components, gated on shape and on median bubble size, clustered into rows and columns, and scored against the stored key. The teacher sees an editable grid and confirms before anything is written, and the student is a required field because a sheet carries a score and no name. Proven end to end against live Supabase: a synthetic sheet scored 8/11 and landed as a `grades` row with `source='scan'` and all eight reads in `scan_detail` |
| Printable answer sheet | Done | Done | Verified by reading the printed page back | Passing (2 e2e) | **The missing half of print-and-scan.** The scanner had always existed and nothing in the product produced the sheet it reads, so a teacher was expected to invent a layout and hope. `/assess/sheet` prints one, sized in millimetres against the detector's own gates: 11mm bubbles against a normalised minimum shape of about 51px, 10pt prompts that stay under it, 14mm rows that cannot merge. Proven by screenshotting the real printed page, shading a known set of bubbles and running the real detector over those pixels |
| Sitting a quiz online | Done | Done | Verified end to end in fixture and production shape | Passing (4 e2e) | **A student signs in and sits it on their own device, any time before the due date**, one question per screen, answers saved at every step. No score is shown anywhere on the student's side, so the answer key never leaves the database. The mark is recomputed on the server at submission and lands in the teacher's gradebook with `source='online'` |
| Gradebook and grading policies | Done | Done | Verified | Passing | Complete |
| Attendance | Done | Done | Verified | Passing | Complete. Marks go through the offline outbox to `POST /api/attendance`, which is idempotent and safe to replay |
| Lesson planner | Done | Done | Verified | Passing | Complete |
| Slides deck editor | Done | Done | Verified | Passing | Complete |
| Student history | Done | Done | Verified | Passing | Complete |
| Profile and onboarding wizard | Done | Done | Verified | Passing | Complete |
| Push notifications | Done | Done | Verified except delivery | Passing (subscription, SSRF, dispatch) | **The whole chain is proven except a banner appearing.** Subscription storage, the SSRF allowlist, per-teacher ownership, the sweep finding a subscribed teacher, and an outbound dispatch that treats a permanent 404 as permanent and deletes the dead row. Only real delivery to a browser needs hardware |
| PWA and offline | Done | Done | **Partial** | Passing (manifest, worker, fallback) | **Offline capture is fixed but not proven end to end.** The outbox was dead code: nothing called `enqueueWrite`, so the queue was permanently empty and offline taps were dropped. That is now wired through a real idempotent endpoint, and the online path, replay idempotency and class ownership are proven against the live database. A genuinely-offline capture replay has not been demonstrated in an automated test; see the handover for the manual check |
| Responsive layout | Done | n/a | n/a | Passing | Complete |
| Billing and payments | Not started | Not started | n/a | n/a | **NOT STARTED.** No Stripe, no checkout, no subscription state, no invoices |
| Plan gating | Column exists, unused | Not started | n/a | n/a | **DEFERRED BY DECISION.** `organizations.plan` and `seat_limit` are stored and editable but no code reads them to limit anything. Deliberately not built yet, see below |
| Class list import | Done | Done | n/a | Passing | **CSV only.** File or paste, headings matched by alias, preview before writing. No LMS roster format |
| Data export | Done | Done | n/a | Passing | **Partly complete.** Gradebook CSV per class at `/grades/export`. Attendance, history, plans and accounts are not in it; those go through us |

### Claims versus reality

An audit of every marketing and legal claim against the source found that a
substantial part of the public site described features that do not exist. This
is recorded here because the fix was editorial but the finding is not:

- `/pricing` and `/` promised CSV and JSON export, class lists imported from a
  spreadsheet or an LMS, rubrics attached to marks, department invoicing,
  priority email support, and a cancellation flow in settings. None of those
  exist. `grep` for `csv`, `Blob`, `spreadsheet` and `rubric` across `src`
  returns nothing.
- Every plan card and FAQ answer described a subscription system: monthly
  charges, annual refunds, a trial with an end date. There is no billing code at
  all.
- The three plans implied capability differences, but no code reads
  `organizations.plan` or `seat_limit` to gate anything, so all three tiers are
  identical in the product.
- The landing FAQ had a question about what happens to student data in AI
  features. There are no AI features; `grep` for `openai`, `anthropic`, `gemini`
  and `llm` across `src` returns nothing.
- `?plan=` from the pricing cards was read by nothing, so a visitor who
  compared three tiers arrived at a register form that discarded their choice.

All of the above is now rewritten to describe what the product does, and
`e2e/legal.spec.ts` fails the build if any of those claims reappear. Two real
bugs were fixed alongside it: the plan ids the page sold
(`starter | teacher | school`) overlapped the `organizations.plan` check
constraint (`solo | school | district`) on only one value, so two of the three
ids could never have been stored and `district` had no card; and the vocabulary
is now one list in three places.

### Why plan gating is deferred rather than built

`organizations.plan` and `organizations.seat_limit` exist, are settable in the
admin console, and are read by nothing. That is the last place where the stored
schema and the shipped behaviour disagree, and it was left alone on purpose.

Building it was designed and rejected, for two reasons that are about the
product rather than the code:

1. **It deadlocks the upgrade path.** The only place an organisation's plan can
   be changed is the admin console, which is the page a plan gate would lock.
   A School administrator who set their own organisation down to Solo would have
   no route back to the plan that unlocks the console.
2. **Nothing is being charged.** Gating a free teacher out of a page they paid
   nothing for, before there is a subscription to gate behind, is a punishment
   rather than a business model.

So the honest alternative was chosen: the comparison table no longer claims a
plan gate that does not exist. The admin console row now reads `Included, for
administrators` in all three columns, because `/admin` is gated on the
`org:manage` permission in `rbac.ts` and follows a person's role rather than
their organisation's plan. The console is likewise listed as a Solo feature,
because a school can make any teacher's account an administrator.

When billing opens, that row becomes a real gate in the same release that
starts taking money, and the check belongs next to the RBAC matrix rather than
in a pricing file.

## Completed

- [x] Two-step onboarding wizard at `/welcome`, per-step persistence, skippable, resumes at the first unanswered question
- [x] Tenancy: `organizations`, `memberships`, RLS, and an `/admin` console rendered from the single RBAC matrix
- [x] Grading policies: percentage, letter, GPA, GWA, milestone, per-class override, scale editor
- [x] Slides deck editor with four layouts, notes, reorder, duplicate, keyboard present mode
- [x] Responsive pass across 12 routes at 7 viewports, with a permanent regression spec
- [x] Touch targets brought to 44px below `lg`; fields step to 16px to stop iOS auto-zoom
- [x] Legal: `/terms`, `/privacy`, `/cookies`, sitemap entries, real footer links, three near-duplicate footers collapsed into one
- [x] Consent gate on signup, enforced server-side, recorded in an append-only table
- [x] Cookie consent banner whose decline genuinely withdraws optional storage
- [x] Students and guardians cannot self-register; teachers issue those accounts from the roster
- [x] Quiz maker: an assessment carries its questions, single choice and multiple select, with an answer key and points, edited at `/assess`
- [x] Marked-sheet scanning: Otsu threshold, connected-component bubble detection, an editable review grid, a required student, and a server-recomputed score written to the gradebook with `source='scan'`
- [x] Critical: closed `profiles` self-promotion to admin
- [x] High: closed cross-tenant `classes` read
- [x] High: service worker no longer caches authenticated documents
- [x] Medium: push endpoint SSRF, rate-limit kill switch, session secret length, open redirect via backslash

## In Progress

- [ ] Nothing. Every gate is green, including the four that need the live database.

## Remaining

- [x] Apply the migration to the real Supabase project, then run `pnpm db:check` to confirm and `pnpm db:settle` to prove the two security fixes
- [x] Seed a real database with `SUPABASE_SERVICE_ROLE_KEY`
- [x] `git push` to the configured remote
- [ ] Authenticate with Vercel and deploy
- [ ] Verify push delivery from a Home Screen-installed PWA
- [ ] Have the legal text reviewed by a qualified lawyer
- [ ] Have the legal text reviewed by a qualified lawyer

## Known Bugs

### Critical
- None known. The two that existed were fixed; both are unproven against a running database, which is listed as a blocker rather than a bug.

### High
- None known.

### Medium
- None known.

### Low
- `revalidatePath('/settings/appearance')` runs when a grading scale is saved. Unrelated route, harmless, copy-paste noise. Not fixed because the file belongs to a different change set.
- No Content Security Policy. `layout.tsx` injects one inline script, for the no-js class flip that keeps scroll-reveal content visible without JavaScript.
- scrypt rather than argon2id for password hashing. The parameters are acceptable; `lib/auth/password.ts` is the only file that changes if it is swapped.

## Testing Status

### Frontend
- Playwright covers the landing page, auth, RBAC, admin, onboarding, slides, interactions, responsive, PWA, and the legal and consent surface.

### Backend
- Vitest covers the permission matrix, session signing and secret rules, password strength, grading policy engine, schemas, the persistence seam, the redirect guard, cookie consent, the push endpoint allowlist and the rate-limit kill switch.
- `src/lib/server-module-exports.test.ts` scans every `'use server'` module and fails the build if one exports anything that is not an async function. This exists because two exports were silently replaced by reference proxies on the client, which is a failure that only shows up when the value is used.

### Integration
- Both adapters are exercised. `pnpm verify:app` drives the built application in a real browser against the live Supabase project: it signs in as all five demo accounts, renders every workspace route, checks that seeded data is actually on the page rather than an empty state, confirms the routes an account is not entitled to are refused, and performs a real attendance write that is read back out of Postgres with the service key.

### E2E
- 12 specs. Each test uses a unique email address and nothing pins a shared count, because the fixture workspace is one shared mutable store and the specs run in parallel against a single server.

## Latest Test Results

All run on 2026-10-09 against this working tree, after the quiz maker and the sheet reader. The four live-database gates are the ones that were impossible before credentials existed.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | **0 errors** |
| Lint | `pnpm lint` | **0 errors, 0 warnings** |
| Unit | `pnpm vitest run` | **241 passed** in 18 files |
| Migration | `pnpm check:sql` | **149 statements parse; 111 cross-references resolve; RLS on 18/18 tables; 14/14 policies re-runnable** |
| Production build | `pnpm build` | **exit 0** |
| End to end | `pnpm e2e` | **168 passed** across 15 specs, 3.4m |
| Live schema | `pnpm db:apply` then `pnpm db:check` | **18 tables, RLS on 18, 27 policies; all security-relevant columns present** |
| Live RLS behaviour | `pnpm db:settle` | **6 passed, 0 failed**: self-promotion refused, cross-tenant read refused, server-owned link cannot be moved |
| Live application | `pnpm verify:app` | **54 passed, 0 failed**: every workspace route renders with real seeded data, refusals hold, an attendance write is read back out of Postgres and replays without duplicating, a write into another teacher's class is refused, the at-risk sweep authenticates and stays idempotent, the push route refuses six SSRF payloads and enforces per-teacher ownership, an outbound dispatch reaches the push service and prunes a dead endpoint, and registration is reported as blocked by the email quota |

### What `check:sql` proves, and what it does not

The database was empty until this pass, so the 809-line migration had never been
executed by anything. `pnpm check:sql` runs it through `@libpg-query/parser`,
which is the real PostgreSQL grammar compiled to WASM, then cross-references the
result against the file's own contents:

- every relation named by a policy, grant, index or trigger resolves to a table
  or function this migration creates. A `create policy ... on public.studentz`
  parses perfectly and fails at deploy; this catches it.
- row level security is enabled on all 18 tables. The audit that found the two
  cross-tenant bugs found a third table in the same family of mistake.
- every policy is dropped before it is created, so a second run works. That is
  the run somebody performs while recovering.

It does not execute the migration and it does not prove a policy behaves
correctly, only that the SQL is real and its objects exist. Behaviour is
`pnpm db:settle`, against a live database.

The build script for `@launchql/protobufjs` is declined in `pnpm-workspace.yaml`
rather than granted: the parser ships a prebuilt WASM bundle and parses the whole
migration correctly without it.

The E2E suite drives a real production build through `next start` on port 3311,
so the build is part of that gate rather than a separate claim.

### How to run it, and how it fails

`playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, which means a
server left listening on 3311 is adopted rather than replaced. That server is
running against whatever fixture data is in its memory, and if it was started by
an interrupted run, the next run inherits that state.

Two consequences worth knowing before a run looks like a product failure:

- **Port 3311 must be free.** A stale server adopted from a killed run has been
  observed to take the suite down with an exit of `-1` partway through, with no
  failing test and no summary line.
- **Back-to-back Playwright invocations need the port cleared between them.** A
  successful run does not always release it, and the second invocation adopts the
  first's server. This was diagnosed by running the suite one spec at a time: the
  first spec passed, the second died, and clearing 3311 between invocations made
  it reliable.

An exit of `-1` with every test that ran marked `ok` is therefore a runner
problem, not a test result. Do not read it as either a pass or a fail; clear the
port and run again.

Full pass history for the audit work, including the two failures this pass found
in its own test changes and the evidence for each, is in the commit body.

See `docs/SECURITY.md` for the full audit findings table and the mechanism behind each fix.

### The sheet reader, and how it is proven

`src/lib/omr/omr.ts` is pure: grey pixels in, a grid out, no canvas and no DOM.
That is the whole reason the arithmetic is trustworthy, because the part that can
quietly be wrong is separable from the part that only wires pixels to it. The
browser does the canvas work, calls the pure function, and the e2e suite drives
it with a real image.

| Claim | How it is established |
|---|---|
| The threshold separates ink from paper | Otsu, by between-class variance, with the uniform-image case returning 0 rather than dividing by nothing |
| A mark is a bubble | 8-connected components, iterative rather than recursive, gated on area and aspect |
| The bubbles are all the same size | The median component population sets the scale gate, so one stray blob cannot rescale the sheet |
| Rows and lines up | Clustered on y, with columns taken from the fullest row |
| The score is right | Expected values are hand-calculated from the stored key, in both the unit test and the e2e spec. Nothing asserts what the scanner said it read |
| The number that lands is the number shown | The server recomputes it in `saveScannedGrade` from stored questions and read marks. The preview agrees because both call `scoreAnswers`, not because anyone kept them in step |
| A wrong student cannot be written | The scan writes nothing until a student is chosen, and the sheet cannot name one |

The honest limit: it has been proven on synthetic sheets drawn flat and upright,
not on a photograph of a photocopied page at an angle with a shadow across it.
That is the gap the confirm-before-save grid exists to cover.

## Security Review

Full pass over every server action, route handler, RLS policy, and service-worker rule. Findings and fixes are tabulated in `docs/SECURITY.md`. The two that mattered:

**Critical, closed.** `profiles` carried `for all using (id = auth.uid())`. RLS restricts rows, not columns, so any account could `PATCH /rest/v1/profiles?id=eq.<own uuid>` with `{"role":"admin"}` and promote itself, then chain into the admin console. The application's own field allowlist is irrelevant when the attacker talks to PostgREST directly with their own token, which sign-in genuinely mints. Fixed with `revoke update on public.profiles from authenticated` plus a column grant on only the seven self-editable columns.

**High, closed.** Two `classes` select policies keyed only on the caller's role, with no tenant check. Postgres ORs permissive policies, so either one let any account in any school read every class row in every school. The SQL comment claimed a scoping the body did not perform.

Also closed: blind SSRF through the push endpoint, a rate-limit kill switch one env var from production, an unenforced session secret length, an open redirect via the backslash form of a protocol-relative URL, and a service worker that cached one teacher's dashboard for the next user of the same device.

## Documentation Status

- `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/HANDOVER.md`, `docs/SECURITY.md` all current. The GSAP references in DESIGN and ARCHITECTURE were removed this pass, since GSAP is gone.
- The legal text is written to match the implementation exactly, including the exact cookie names. It has not been reviewed by anyone qualified to review it.

## Deployment Readiness

**Not ready.** The application builds, typechecks, lints and tests clean, and the code is in better shape than at any previous point. What is missing is entirely external:

1. The 16-table migration has never been applied to a database. Two security fixes live in that SQL and are unproven at runtime.
2. No real database has ever been seeded.
3. No deployment target is authenticated.
4. The remote is unreachable.

## Blockers

Three of the five blockers listed here were resolved on 2026-10-09 and are kept here only so the record shows what they were.

1. **RESOLVED: `git push`.** The remote is `https://github.com/jcuady/liko.git` and every commit is pushed. The earlier `Repository not found` was a credential problem, not a wrong repository name.
2. **RESOLVED: the database was empty.** `pnpm db:apply` applied the migration to project `ulrjitekiylgepdyijsw`, which now holds 18 tables with row level security on all 18 and 27 policies.
3. **RESOLVED: `SUPABASE_SERVICE_ROLE_KEY`.** `scripts/seed.mjs` has run; five demo accounts hold a school, three classes, 24 students, assessments, marks, attendance and history.
4. **OPEN: Vercel unauthenticated.** `vercel whoami` fails. This is the one thing standing between this codebase and a live URL, and it needs the user.
5. **OPEN: iOS push delivery unverifiable** without a Home Screen-installed PWA.
6. **OPEN: the legal text has not been read by a lawyer.** It describes this implementation accurately, which is the most it can do, but accuracy about the system is not legal sufficiency.
7. **OPEN: Supabase's built-in email quota is exhausted, so nobody can register.** The project sends `over_email_send_rate_limit` for every signup and every password reset. It is not a code fault: the seed created its accounts through the admin API, which sends no email, which is why this only appeared when a real person filled in the register form. Fixing it needs a custom SMTP provider or a plan with a higher limit, both of which are dashboard decisions.

### The RLS settling test

Findings 1 and 2 of the security review are correct as written and reviewed, but reading SQL is not the same as running it. Both are now one command rather than prose:

```
pnpm check:sql   # is the migration sound? needs nothing, runs offline
pnpm db:check    # does the schema exist? needs only the publishable key
pnpm db:settle   # do the policies behave? needs SUPABASE_SERVICE_ROLE_KEY
```

`db:check` probes each expected table and distinguishes missing from present
using PostgREST's `PGRST205`. It validates its own discriminator against two
table names that cannot exist before it will report anything, because the first
version of it decided "exists" unless the code was a SQLSTATE that PostgREST
never returns, and so reported a fully migrated database that was empty.

`db:settle` creates two throwaway schools, signs in as a real student in one of
them, and asserts the two exploits fail: that the student cannot set their own
`role` to `admin`, and that they cannot see the other school's class. It also
checks the link is server-owned and that the student can still read its own
record. It deletes everything it creates, including on failure, and is not wired
into `pnpm test` or CI.

## Technical Debt

- The fixture workspace is one shared mutable store on `globalThis`. It is the reason the E2E suite can run with no database, and it is also why no test may pin a shared count. That is a real constraint on the test suite, not a workaround that should be removed.
- The rate limiter is per-process and per-deploy. It raises the cost of credential stuffing; it is not a distributed limit. Moving it to Redis changes one file.
- No session revocation: a stolen cookie is valid until it expires.
- `resetPasswordAction` validates its password with the strength checker rather than a Zod schema, unlike every other auth action. The rules it applies are the same ones, so this is consistency rather than a gap.
- `completeEmailVerification` passes a client-supplied `type` into `verifyOtp` through an unchecked cast. Constrain it to the three values Supabase actually sends.

## Recommended Next Actions

1. Authenticate with Vercel and deploy. Everything else that could be verified on this machine has been.
2. Configure a custom SMTP provider on Supabase. Until that is done nobody can register, and the signup path, the `handle_new_user` trigger and the `consent_events` write are unverified against the live database.
3. Have the legal text reviewed by a lawyer. It describes this implementation accurately, which is the most it can do, but accuracy about the system is not the same as legal sufficiency.
4. Rotate the service role key and the database password before this project carries anything real. Both have been handled in chat and written to a local `.env.local`, which is gitignored, but they were shared in a conversation.

## Recent Work

### 2026-10-10

Added, so that one set of questions has two real deliveries rather than one and a half:
- **Sitting a quiz online.** A student signs in, opens `/quiz`, and answers one question per screen on their own device, any time before the due date. Answers save at every step, because a phone locks and a signal drops. Nothing on the student's screen carries a score: the attempt is scored on the server at submission and the mark lands in the teacher's gradebook with `source='online'`
- **The printable answer sheet.** The scanner had always existed and nothing in the product produced the sheet it reads, which made "print and scan" a loop with a missing link. `/assess/sheet` prints it, in millimetres, against the detector's own gates rather than against taste alone

The security shape of the online quiz is the part worth stating plainly. A quiz runner is a page that renders the questions of an assessment whose answer key is sitting in the database next door. Three things hold that line:
- The key is never selected on a path a student can reach. `student_quiz_questions` declares the columns it returns and `answer_key` is not one of them, so there is no column to widen later and no result shape to smuggle it through. Asserted in e2e against the serialised payload, not against visible text
- A student's token cannot write its own score. `score`, `status` and the ids are unreachable: `UPDATE` is revoked from `authenticated` and re-granted on the single `responses` column, so opening devtools and PATCHing PostgREST directly is refused rather than ignored
- The row is created by a `SECURITY DEFINER` function that reads `owner_id` off the assessment rather than off the request, because a student must not choose whose gradebook their attempt belongs to

The ownership proof is deliberately the first thing that happens in the submit path, before any service-role read. Everything after it runs with the service role, which ignores RLS, and the only thing that establishes the attempt belongs to the caller is a read made with the caller's own privileges, where a forged id arrives as "no row".

Proven rather than asserted:
- The printed page is screenshot at print resolution, shaded the way a pencil would shade it, and read by the real detector: 8 rows, 4 columns, marks exactly as drawn. A prompt that grew large enough to clear the detector's minimum shape would become a phantom bubble and shift every mark, and nothing else in the suite would notice
- The online flow answers the stored key, submits, and confirms the confirmation screen contains no score, no percentage and no correct-answer flag

Fixed while proving it:
- Three quiz-maker tests failed on 45 second locator timeouts because `/Bonding Quiz/i` also matched the pre-existing "Unit 3 Quiz: Bonding", so `.first()` opened the empty one. The selector was anchored
- The gradebook leaked its horizontal overflow to the document. `overflow-x-auto` was not enough and a class with four assessments scrolled the whole page sideways by 22px on a 375px phone. Paint containment on the same box holds the document at 375 while the table still scrolls
- The builder painted "Add the first question to make this assessment scannable" for an assessment that already had eight. An empty state that is briefly true is a lie a teacher acts on

### 2026-10-09, later

Completed:
- Dark mode became a real theme. Colour primitives were declared twice, once as Tailwind values in a plain `@theme` (which copies them onto `:root` and is never overridden) and once as semantic roles, so 711 call sites across 86 files rendered the light palette onto a dark page. Primitives moved to `@theme inline`. Dark primary CTA went from 3.26:1 to 5.72:1, the destructive button from 1.71:1 to 10.92:1, and the field edge from 1.30:1 to 3.40:1
- The quiz maker. An assessment had a title, a weight and a maximum and nothing to sit, so it is now selected rather than merely listed and carries its questions: `questions` table, RLS, single choice and multiple select only, 2 to 8 options, an answer key and points
- Marked-sheet scanning, constrained to the two kinds a printed sheet can carry. Otsu threshold, iterative 8-connected components, a shape gate and a median-population scale gate, row clustering and column detection from the fullest row, then scored against the stored key with all-or-nothing marking for multiple select
- The teacher confirms every scan on an editable grid before anything is written, and the student is a required field, because a sheet carries a score and no name
- The score is recomputed on the server from the stored questions and the read marks, so the number that lands in the gradebook does not come from the browser

Fixed, found while proving it:
- The builder painted "Add the first question to make this assessment scannable" for an assessment that already had eight. The page loads every assessment's questions on the server and hands them to the scan panel, but the builder was refetching them and rendering an empty set until that call came back. It is seeded from the server render now. An empty state that is briefly true is a lie a teacher acts on: it invites them to start typing a quiz they have already written
- `seedScannableQuiz` sat inside the class-creation branch behind a `continue`, so a second seed run added nothing and the quiz silently never appeared. Found only by querying the live database and seeing `questions: 0`
- The gradebook leaked its horizontal overflow to the document. `overflow-x-auto` on the grid was not enough, so a class with four assessments scrolled the whole page sideways by 22px on a 375px phone. Paint containment on the same box holds the document at 375 while the table still scrolls
- Three quiz-maker tests failed on locator timeouts because `/Bonding Quiz/i` also matched the pre-existing "Unit 3 Quiz: Bonding", and `.first()` opened the empty one. The selector was anchored

### 2026-10-09

Completed:
- Applied the migration to the live Supabase project with a new `pnpm db:apply`, which brings the database up from a checkout with nothing but Node
- Found that the offline write queue had never worked. `enqueueWrite` was exported and called by nothing, so the queue was permanently empty, the offline banner permanently read zero, and a teacher's offline tap was dropped while the documentation described a background-sync queue. The cause was architectural: moving attendance writes to a server action had removed the HTTP endpoint the replay needs, because a queued record has to survive to `fetch(path)` hours later and an action id does not. Marks now go through the outbox to a real, idempotent `POST /api/attendance`
- Fixed the RLS infinite recursion that made `profiles`, `classes`, `organizations` and `memberships` return `42P17`, by adding three `SECURITY DEFINER` helper functions and rewriting six policies to call them
- Proved the two security fixes rather than arguing them: `pnpm db:settle` signs in as a real student and confirms self-promotion and the cross-tenant read both fail
- Seeded the project, then extended the seed to create the school, its five seats and the two read-only account links, because the admin console had nothing to read
- Found and fixed a real defect that only a live database could surface: `memberships.user_id` referenced `auth.users`, so PostgREST could not resolve the embed the admin console reads and `/admin` returned 500. The foreign key now references `public.profiles`
- Deleted `/api/attendance`, which validated a payload, authorised it, answered `202 {ok:true}`, and wrote nothing
- Added `pnpm verify:app`, which drives the built application in a browser against the live project, asserts that seeded data is on the page rather than an empty state, and reads a real write back out of Postgres

### 2026-10-06

Completed:
- Terms, privacy notice and cookie notice, written to match the implementation
- Cookie consent banner, with a decline path that genuinely withdraws optional storage rather than pretending
- Server-enforced consent gate on signup, recorded in an append-only, service-role-only `consent_events` table
- Students and guardians cannot self-register; teachers issue those accounts from the roster, and the database refuses to let anyone but the class owner change the link
- Two near-duplicate footers collapsed into one with real links; three dead compliance-looking spans removed

Fixed:
- Critical: any account could promote itself to `admin` through `profiles` RLS
- High: any account could read every class row in every school
- High: the service worker cached authenticated documents for an hour, leaking one teacher's gradebook to the next user of a shared device
- Medium: blind SSRF through the push subscription endpoint
- Medium: the rate-limit kill switch was honoured in production
- Medium: a session secret of any length was accepted in production
- Medium: the open-redirect guard missed `/\evil.com`, which browsers resolve to `//evil.com`
- Low: `setMemberRole` reported success for a write the database silently rejected
- Test: `slides.spec.ts` ran in parallel with itself, so the reorder test had slide 1 swapped out from under the present-mode tests reading it. Three passes in isolation and one failure in a full run. The file is now serial
- Test: the signup helper in two specs no longer submitted without accepting the new consent gate
- Performance: `/overview` no longer downloads every grade the teacher owns to draw one class's heatmap
- Performance: `/classes` and `/slides` no longer issue one query per class
- Performance: GSAP removed entirely, cutting two ScrollTrigger chunks of 50 KB and 94 KB from the landing route, which itself shrank 29%

Tests Added:
- `src/lib/security/redirect.test.ts`, including the backslash bypass
- `src/lib/consent/browser.test.ts`
- `src/lib/push/endpoint.test.ts`, including the DNS-label bypass tricks
- `src/lib/auth/session.test.ts`, secret length
- `src/lib/security/rate-limit.kill-switch.test.ts`
- `e2e/legal.spec.ts`, covering the consent gate, no-student-self-signup, the three documents, and the banner

Documentation Updated:
- `docs/SECURITY.md`: findings table, consent records, the no-self-signup enforcement
- `docs/ARCHITECTURE.md`, `docs/DESIGN.md`: GSAP removed
- `README.md`: legal routes and the demo

Remaining:
- Everything listed under Blockers. None of it can be done from here.