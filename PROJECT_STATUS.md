# Project Status

Last Updated: 2026-10-06
Current Branch: `main`
Current Commit: `a11f069` Close the security gaps, and write down what this product promises
Overall Status: **IMPLEMENTED, NOT DEPLOYED.** Every gate that can be run without credentials is green. Three things block an actual launch, all of which need the user.

## Executive Summary

LIKO is a teaching-workspace PWA: a teacher plans lessons, builds assessments, takes attendance, grades, and watches student history on one thread, and slides decks for the lesson.

The code is in good shape. This pass was a full security, performance and legal-compliance review of an existing working application, and it found two genuine exploitable defects and a service-worker bug that leaked one teacher's gradebook to the next user of a shared device. All are fixed. The two security fixes are in the SQL and cannot be proven correct without a running Postgres, which is the one substantive thing left that this environment cannot do.

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
- Supabase Postgres, 16 tables, one migration: `supabase/migrations/20260101000000_initial_schema.sql`
- `organizations` + `memberships` carry tenancy. There is no `owner` role; the four roles are `instructor`, `admin`, `student`, `guardian`, and `org:manage` means "can administer the organisation"

### Infrastructure
- Vercel (target, unauthenticated)
- Serwist service worker, precache plus runtime rules
- Environment: `LIKO_DATA_MODE` selects the Supabase or fixture adapter at boot, never at runtime

### Testing
- Vitest 5 for unit, Playwright 1.63 for E2E
- 13 unit files, 10 E2E specs
- `pnpm check:responsive` and `pnpm check:behaviour` as static gates
- E2E runs against a production build on port 3311
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
| Signup with consent gate | Done | Done | Verified | Passing | Complete |
| Consent records | n/a | Done | Unverified against Postgres | Passing (fixture) | Implemented, NOT VERIFIED in Supabase |
| Sign in / sign out / reset | Done | Done | Unverified against Supabase | Passing (fixture) | Implemented, NOT VERIFIED in Supabase |
| Tenancy and admin console | Done | Done | Unverified against Postgres | Passing (fixture) | Implemented, NOT VERIFIED in Supabase |
| Classes and roster | Done | Done | Verified | Passing | Complete |
| Teacher-issued student/guardian accounts | Done | Done | Unverified against Postgres | Passing (fixture) | Implemented, NOT VERIFIED in Supabase |
| Assessments | Done | Done | Verified | Passing | Complete |
| Gradebook and grading policies | Done | Done | Verified | Passing | Complete |
| Attendance | Done | Done | Verified | Passing | Complete |
| Lesson planner | Done | Done | Verified | Passing | Complete |
| Slides deck editor | Done | Done | Verified | Passing | Complete |
| Student history | Done | Done | Verified | Passing | Complete |
| Profile and onboarding wizard | Done | Done | Verified | Passing | Complete |
| Push notifications | Done | Done | Unverified on iOS | Passing (subscription) | Implemented, NOT VERIFIED for delivery |
| PWA and offline | Done | Done | Verified | Passing | Complete |
| Responsive layout | Done | n/a | n/a | Passing | Complete |
| Billing and payments | Not started | Not started | n/a | n/a | **NOT STARTED.** No Stripe, no checkout, no subscription state, no invoices |
| Plan gating | Column exists, unused | Not started | n/a | n/a | **DEFERRED BY DECISION.** `organizations.plan` and `seat_limit` are stored and editable but no code reads them to limit anything. Deliberately not built yet, see below |
| Class list import | Not started | Not started | n/a | n/a | **NOT STARTED.** No spreadsheet or LMS import |
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
- [x] Critical: closed `profiles` self-promotion to admin
- [x] High: closed cross-tenant `classes` read
- [x] High: service worker no longer caches authenticated documents
- [x] Medium: push endpoint SSRF, rate-limit kill switch, session secret length, open redirect via backslash

## In Progress

- [ ] Nothing. The audit pass is complete; what remains is verification against real infrastructure.

## Remaining

- [ ] Apply the migration to the real Supabase project, then run `pnpm db:check` to confirm and `pnpm db:settle` to prove the two security fixes
- [ ] Seed a real database with `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `git push` to the configured remote
- [ ] Authenticate with Vercel and deploy
- [ ] Verify push delivery from a Home Screen-installed PWA
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
- Fixture mode only. The Supabase adapter has never been exercised.

### E2E
- 10 specs. Each test uses a unique email address and nothing pins a shared count, because the fixture workspace is one shared mutable store and the specs run in parallel against a single server.

## Latest Test Results

All run on 2026-10-06 against this working tree.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | **0 errors** |
| Lint | `pnpm lint` | **0 errors, 0 warnings** |
| Unit | `pnpm vitest run` | **164 passed** in 13 files |
| Migration | `pnpm check:sql` | **105 statements parse; 74 cross-references resolve; RLS on 16/16 tables; 14/14 policies re-runnable** |
| Production build | `pnpm build` (via the E2E web server) | **exit 0** |
| End to end | `pnpm e2e` | **137 passed** across 10 specs, 2.6m |

### What `check:sql` proves, and what it does not

The database was empty until this pass, so the 809-line migration had never been
executed by anything. `pnpm check:sql` runs it through `@libpg-query/parser`,
which is the real PostgreSQL grammar compiled to WASM, then cross-references the
result against the file's own contents:

- every relation named by a policy, grant, index or trigger resolves to a table
  or function this migration creates. A `create policy ... on public.studentz`
  parses perfectly and fails at deploy; this catches it.
- row level security is enabled on all 16 tables. The audit that found the two
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

1. **`git push` fails.** `git ls-remote origin` returns `remote: Repository not found` for `https://github.com/jcuady/liko.git`. `credential.helper=manager` is set but no usable token is present, and there is no `GITHUB_TOKEN` or `GH_TOKEN`. Needs `gh auth login`, or the correct repository name if the repo was renamed.
2. **Supabase OAuth not completed.** The MCP server is registered but exposes no database tools. Now verified directly rather than assumed: `pnpm db:check` reaches project `ulrjitekiylgepdyijsw` with the existing publishable key and reports **0 of 15 tables present**. The project exists and is live, but has no LIKO schema at all. This is stronger and more certain than the earlier "has never been applied": it is not partially applied, it is entirely absent.
3. **`SUPABASE_SERVICE_ROLE_KEY` is blank.** `scripts/seed.mjs` has never run against a real database.
4. **Vercel unauthenticated.** `vercel whoami` fails.
5. **iOS push delivery unverifiable** without a Home Screen-installed PWA.

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

1. Apply the migration, then run `pnpm db:check` and `pnpm db:settle`. That is the only thing standing between this codebase and an honest "verified" on its two most important security properties. The schema is confirmed absent, so this starts from nothing.
2. Fix the git remote and push. Every commit so far exists only on this machine.
3. Have the legal text reviewed. It describes this implementation accurately, which is the most it can do, but accuracy about the system is not the same as legal sufficiency.

## Recent Work

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