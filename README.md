# LIKO

**Every teaching task, in one flow.**

LIKO is a teacher-productivity Progressive Web App. The product idea is the
**Flow**: one continuous path that unifies **Plan → Create → Assess → Grade →
Analyze**, so a teacher stops retyping the same data into four disconnected
tools.

Built for preschool, K-12 and university instructors, plus administrator and
parent/guardian views.

---

## Table of contents

- [What is in this repository](#what-is-in-this-repository)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Supabase setup](#supabase-setup)
- [Web push setup](#web-push-setup)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Security posture](#security-posture)
- [Design system](#design-system)
- [Deployment](#deployment)
- [Handover runbook](#handover-runbook)
- [License](#license)

---

## What is in this repository

| Area | State |
|---|---|
| Marketing site | Hero, social proof, problem, the Flow narrative, roles, module bento, testimonials, FAQ, pricing |
| Design system | Viridian accent ramp, Geist type scale, motion tokens, brand tooling |
| Responsive | Measured across 12 routes at 7 widths: no horizontal scroll, 44px touch targets on touch widths, 16px fields so iOS does not zoom. Enforced by `e2e/responsive.spec.ts` |
| Authentication | Email + password via Supabase Auth, email verification, password reset, RBAC |
| Consent | `/terms`, `/privacy` and `/cookies`, written to match what the code actually does. Signup is gated on accepting the first two, checked server-side, and each acceptance is written to an append-only table the account holder cannot edit. A cookie banner withdraws the one optional thing there is, the stored theme preference |
| Accounts | Teachers and administrators register themselves. Students and guardians do not: a teacher issues those accounts from the class roster, and the database refuses to let anyone but the class owner link an account to a child's record |
| Onboarding | Three first-run questions: what is taught, how it is graded, the first class. Skippable, saves as it goes, resumes where it stopped |
| Tenancy | `organizations` and `memberships`, resolved through the signed-in account so no caller can address another school's records |
| Administration | `/admin`, gated on `org:manage`: people and roles, classes, organisation settings, and the live permission matrix |
| Slides | Deck editor with four layouts, speaker notes, reorder, and a keyboard-driven present mode. No .pptx conversion, by design |
| Workspace | Nine permission-gated routes (overview, classes, attendance, planner, slides, assessments, gradebook, history, administration, settings) with a `/forbidden` refusal, covered per role by `e2e/rbac.spec.ts` |
| Data | One typed seam, `src/lib/api/client.ts`, with a Supabase adapter and a fixture adapter |
| Offline | IndexedDB write queue plus Serwist runtime caching and an `/offline` fallback |
| Push | Web push for at-risk alerts and grade/attendance summaries |
| Brand | The LK-ligature wordmark, reconstructed from measurement and verified to under 0.3% |

The project builds two ways from one codebase. `LIKO_DATA_MODE=fixtures` serves
the built-in demo workspace, so the marketing page and the test suite run with no
network and no database. `LIKO_DATA_MODE=supabase` serves real, per-user data.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local     # then fill in the values you need
pnpm dev
```

Open <http://localhost:3000>.

To exercise the PWA behaviour (service worker, offline, install prompt) you need
a production build, because the worker is compiled at build time:

```bash
pnpm build
pnpm start
```

### Why `--webpack` is in the scripts

`next dev` and `next build` both pass `--webpack`. Serwist compiles the service
worker by attaching a webpack plugin, and Next.js 16 runs Turbopack by default,
which Serwist cannot hook. The flag is confined to two npm scripts and one
comment in `next.config.ts`, so removing it when Serwist ships Turbopack support
is a one-line change. See `docs/ROADMAP.md`.

### Demo accounts

With the default `LIKO_DATA_MODE=fixtures`, the auth store seeds the same five
accounts `scripts/seed.mjs` creates, so there is something to sign in with
before any database exists. Password for all of them is `LikoDemo!2026`.

| Email | Role | Lands on |
|---|---|---|
| `maya@liko.test` | instructor | `/overview` |
| `dev@liko.test` | admin | `/overview` |
| `ingrid@liko.test` | instructor | `/overview` |
| `student@liko.test` | student | `/classes` |
| `guardian@liko.test` | guardian | `/classes` |

The last two exist so all four RBAC roles are reachable. A student or guardian
holds only scoped grants, so they are refused `/overview`, `/attendance`,
`/plan` and `/assess` and are shown `/forbidden` rather than an error page.

---

## Configuration

Copy `.env.example` to `.env.local`. Only variables prefixed `NEXT_PUBLIC_` reach
the browser bundle; everything else stays server-side.

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Publishable key. Grants only the `anon` role; RLS is what protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Auth admin, push dispatch, seed |
| `SUPABASE_DB_PASSWORD` | **server only** | Supabase CLI migrations |
| `LIKO_DATA_MODE` | server | `supabase` or `fixtures` |
| `LIKO_SESSION_SECRET` | **server only** | HS256 key for the session JWS. Required in production |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Web push application server key |
| `VAPID_PRIVATE_KEY` | **server only** | Web push private key. Anyone holding it can push to every subscriber |
| `VAPID_SUBJECT` | server | `mailto:` sender for push payloads |
| `NEXT_PUBLIC_SITE_URL` | public | Absolute origin for metadata and email redirects |
| `CRON_SECRET` | **server only** | Bearer token guarding the at-risk sweep |

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Supabase setup

The schema lives in `supabase/migrations/`. It is written to be idempotent, so it
is safe to re-run.

**Option A, through the Supabase MCP server** (recommended)

Register the hosted MCP server, project-scoped, and complete the browser OAuth:

```
https://mcp.supabase.com/mcp?project_ref=<your-project-ref>
```

Then apply `supabase/migrations/20260101000000_initial_schema.sql`.

**Option B, through the SQL editor**

Open your project in the Supabase dashboard, paste the migration into the SQL
editor, and run it.

Either way the migration creates ten tables, two triggers, Row Level Security on
every table, and adds `students` and `grades` to the `supabase_realtime`
publication.

### Row Level Security

Every table carries an ownership policy of the form
`owner_id = auth.uid()`. Reads go through the cookie-backed server client, so
PostgREST evaluates RLS with the signed-in teacher's id already set. The explicit
`.eq('owner_id', userId)` filter in the data seam is belt and braces: RLS is the
boundary, and a forgotten filter should not be the thing that leaks.

A refusal (`42501`) is surfaced to callers as **not found**, never as
**forbidden**, because confirming a record exists is itself a leak.

---

## Web push setup

1. Generate a VAPID key pair and put the output in `.env.local`:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Enable the provider in Supabase Auth (Google, Apple, etc.) if you want
   social sign-in.

### Browser support, honestly

| Platform | Works | Caveat |
|---|---|---|
| Chrome, Edge (desktop + Android) | Yes | Full support including background sync |
| Safari on macOS | Yes | |
| Safari on iOS 16.4+ | **Installed PWA only** | Requires Add to Home Screen. The settings page detects this and explains it rather than showing a toggle that silently fails |
| Firefox desktop | Yes | |
| Firefox Android | Yes, from 120+ | |

Push requires a service worker, so it is unavailable in `pnpm dev` unless
`LIKO_ENABLE_SW=true`.

Delivery is best effort and controlled by the operating system. The in-app
Realtime channel is the guaranteed path, so the product never depends on a
notification actually arriving.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server with hot reload. No service worker |
| `pnpm build` | Production build. Emits `public/sw.js` |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint 9 flat config |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit suites |
| `pnpm e2e` | Playwright. Builds and starts the app first |
| `pnpm check:responsive` | Horizontal overflow audit at five widths, plus screenshots |
| `pnpm check:behaviour` | Anchor navigation, reduced motion, and no-JS fallback |

The last two need a server already running, and they identify it by the build
id in `.next/BUILD_ID` rather than by port, so they fail loudly instead of
grading whatever else happens to be listening:

```bash
pnpm build && pnpm run start --port 3311   # in one shell
pnpm check:behaviour                        # in another
```

Both accept an explicit URL as an argument. Set `PORT` to change the default.

This is not hypothetical. They used to default to `http://localhost:3000`,
which on this machine is a `next start` server for a different project, so both
scripts had been measuring another application and reporting its numbers as
LIKO's.

### Do not hand-start the e2e server

`pnpm e2e` builds and starts its own server, with `LIKO_SESSION_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `LIKO_RATE_LIMIT_DISABLED` and `LIKO_E2E` set in
`playwright.config.ts`. It also sets `reuseExistingServer`, so if anything is
already listening on 3311 the suite adopts that instead and runs against
whatever configuration it found.

Starting one by hand with a bare `pnpm run start --port 3311` therefore breaks
the suite in a way that looks like a product regression: without the two rate
limit variables the limiter stays active under `next start`, which runs with
`NODE_ENV=production` and ignores a single bypass flag on purpose. The suite
signs in as the same demo accounts dozens of times, gets throttled, and every
authenticated test fails at about 31 seconds at once.

If you need a server up for the two check scripts above, either run
`pnpm check:behaviour` against a server started by `pnpm e2e`, or copy the four
variables out of `playwright.config.ts`. Otherwise clear port 3311 first and let
Playwright manage the server:

```bash
# PowerShell
Get-NetTCPConnection -LocalPort 3311 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Brand tooling

The supplied logo arrived as a JPEG over a checkerboard, so it was reconstructed
as vector from measurements rather than traced. These scripts keep the geometry
honest and live outside the app module graph.

```bash
node scripts/build-logo.cjs        # emit the SVG from the source constants
node scripts/verify-logo.cjs       # diff against the supplied original
node scripts/compare-logo.cjs      # write a side-by-side raster
```

`verify-logo.cjs` is the regression test. It reports every glyph within 0 to 3
units of the original across a 1536 unit canvas, which is under 0.3%.

### Image tooling

```powershell
powershell -File scripts/resize-image.ps1 -In src.jpg -Out dst.jpg -Width 1600 -Quality 82
```

Uses the System.Drawing codecs that ship with Windows, so optimising a marketing
asset does not add a native dependency.

---

## Architecture

```
Browser
  ├─ Supabase client (publishable key, RLS-scoped)
  │    ├─ Auth, data reads and writes, Realtime
  │    └─ IndexedDB outbox → replayed on reconnect
  │
  ▼
Next.js 16 (Vercel)
  ├─ src/proxy.ts ............ outer RBAC gate, security headers
  ├─ server actions .......... inner gate via requirePermission()
  ├─ src/lib/api/client.ts ... the single data boundary
  └─ /api/push, /api/cron .... server-role only
```

### The data seam

`src/lib/api/client.ts` is the only module that touches the database. No
component and no route handler calls `fetch` for data. That is what makes the
backend swappable: the demo fixtures and the real database are two
implementations of one interface.

`src/lib/data-mode.ts` selects the implementation. In `supabase` mode a fixture
read throws rather than silently returning demo data that looks real.

### Access control

Two layers, deliberately.

`src/proxy.ts` (Next.js 16 renamed the middleware convention) verifies the
session cookie, maps the pathname to a required permission, and refuses before
any app shell renders. It is a routing optimisation, **not** the security
boundary.

`requirePermission()` is the inner gate. Every server action and API route checks
independently, so a proxy bypass grants nothing.

`src/lib/auth/rbac.ts` is the single source of truth for the matrix. A second
copy in either place is a bug.

### Sessions

The session is a JWS in an `httpOnly`, `SameSite=Lax` cookie. Nothing sensitive
is written to `localStorage`, which an e2e test enforces. The app keeps its own
session JWT alongside the Supabase session so that the RBAC layer and its tests
are unaffected by the identity provider.

### Offline

Writes go into an IndexedDB outbox *before* they are sent, and leave only after
the server confirms them. Replay is safe because attendance upserts on
`(class_id, student_id, date)` and grades on `(assessment_id, student_id)`, so
replaying the same day twice updates rather than duplicates.

---

## Security posture

| Control | Implementation |
|---|---|
| Injection | Every server action validates with Zod before touching the data layer |
| Broken access control | Two-layer RBAC; every table has RLS. `profiles.role` and `profiles.org_id` are column-granted away from the account holder, because RLS restricts rows and cannot restrict columns |
| Cross-tenant reads | Every cross-account policy joins the caller's own active membership. Postgres ORs permissive policies, so a role test without a tenant check is a data leak, not a scoping |
| Offline isolation | The service worker caches public documents only. Authenticated documents are `NetworkOnly`, so one teacher's gradebook is never served to the next user of a shared device |
| Session handling | `httpOnly`, `SameSite=Lax`, `Secure` in production. Never `localStorage`. Signing refuses a secret under 32 bytes in production rather than signing with a guessable key |
| Account enumeration | Login, signup and password reset return one generic message |
| CSRF | Cross-origin state-changing requests are rejected in `proxy.ts`; the post-login destination travels in the form body and is re-validated against a known origin, not against a list of string shapes |
| SSRF | The push endpoint is https-only and matched against the known push-service hosts by DNS label, at subscription time and again at send time |
| Rate limiting | In-process limiter on auth and password-reset endpoints. The bypass flag is ignored in production unless a second deliberate variable is also set |
| Secrets | Server-only variables read through `lib/env.ts`; the service key is never imported by a client module |
| Headers | `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS in production |
| Consent records | Append-only, service-role-only. The account holder can neither read, forge nor edit a record, because a value the subject can rewrite is not evidence |

Student data is handled under FERPA-aligned defaults and COPPA-aware choices.
Access is role-scoped. See `docs/SECURITY.md` for the full posture, the audit
findings and what is implemented versus planned, and `/privacy` for what the
product tells a parent.

> The two most important security properties in that document, the column-scoped
> `profiles` grant and the tenant-scoped class reads, live in the SQL migration.
> They are correct as written and reviewed, but have not been exercised against a
> running Postgres. `PROJECT_STATUS.md` records the test that settles it.

---

## Design system

Viridian accent on a warm off-white canvas, Geist throughout, generous whitespace,
and one accent colour used sparingly. Full documentation in `docs/DESIGN.md`.

The accent is `#29813d`, measured from the supplied logo artwork. The original
brief named `#228B22`, but the shipped mark is the brand's most visible asset, so
the palette follows the artwork. It also improves contrast against the warm
canvas, from 4.15:1 to 4.63:1.

Two hard rules enforced by passing tests: no em dashes in visible copy, and no
emoji.

---

## Deployment

Vercel is the intended host. The Supabase CLI is not required at build time.

```bash
vercel link

# Required in production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add LIKO_DATA_MODE production      # must be: supabase
vercel env add LIKO_SESSION_SECRET production
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_SUBJECT production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel env add CRON_SECRET production

vercel --prod
```

`SUPABASE_DB_PASSWORD` is the only variable not needed on Vercel. It is used by
the Supabase CLI locally to apply migrations.

> **`LIKO_DATA_MODE` is not optional.** It defaults to `fixtures` when unset, so
> a production deploy that forgets it serves the demo workspace to real teachers
> and every screen looks plausible. Set it to `supabase`.

The at-risk sweep is scheduled in `vercel.json` and calls
`/api/cron/at-risk` with the `CRON_SECRET` bearer token.

---

## Handover runbook

This repository is code-complete, but the database migration has never been
applied, no seed data has been written, and nothing has been deployed. The steps
that remain, in order, with this project's real values and an honest list of
what is still untested, are in **[`docs/HANDOVER.md`](docs/HANDOVER.md)**.

---

## License

Proprietary. All rights reserved.