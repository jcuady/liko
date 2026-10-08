# LIKO architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.4, App Router | React 19.3 |
| Styling | Tailwind CSS v4 | CSS-first `@theme`, no `tailwind.config.js` |
| Type | Geist + Geist Mono | Self-hosted via `next/font` |
| Icons | Phosphor | One family, no emoji |
| Components | Radix primitives + CVA | Vendored in `src/components/ui` |
| Client motion | `motion` | All UI state and reveals |
| Scroll motion | GSAP + ScrollTrigger | Two landing sections only |
| Server state | TanStack Query v5 | |
| Forms | React Hook Form + Zod 4 | |
| PWA | Serwist | Requires webpack |
| Sessions | `jose` JWS in an httpOnly cookie | |
| Tests | Vitest + Playwright | |

### Why `--webpack` on both scripts

Serwist compiles the service worker at build time by attaching a webpack
plugin. Next.js 16 runs Turbopack by default and Serwist cannot hook into it.
The flag is confined to the `dev` and `build` scripts in `package.json` and to
one comment in `next.config.ts`, so removing it when Serwist ships Turbopack
support is a one-line change.

## Routing

Route groups share layouts without affecting URLs. `app/layout.tsx` is the only
root layout and owns `<html>`, fonts, and providers.

| Route | Group | Access | Render |
|---|---|---|---|
| `/` | `(marketing)` | public | Dynamic (session check redirects) |
| `/login` `/register` `/forgot-password` | `(auth)` | public | Static |
| `/verify-email` | `(auth)` | public | Static |
| `/offline` | public | public | Static |
| `/overview` | `(dashboard)` | `analytics:read` | Dynamic |
| `/attendance` | `(dashboard)` | `attendance:write` | Dynamic |
| `/classes` `/plan` `/assess` `/grades` `/history` | `(dashboard)` | per route | Dynamic |
| `/settings/*` | `(dashboard)` | any authenticated | Dynamic |
| `/forbidden` | `(dashboard)` | any authenticated | Dynamic |
| `/api/attendance` | api | `attendance:write` | Node |
| `/api/auth/sign-out` | api | same-origin only | Node |

## The API seam

The masterplan places persistence behind an external API and explicitly forbids
designing a database, ORM, or schema. That constraint was honoured in the first
phase of this project: the adapter was fixture-backed and no schema existed.

**That constraint was explicitly overridden on 2026-10-07 by the project owner**,
with an instruction to provision a real Supabase backend. It is recorded here
rather than quietly rewritten, because the fixture-first design was a deliberate
choice and the reason it was reversed is worth keeping.

The seam survived that change, which is the point of having built it: the
interface did not move, only the adapter behind it.

**`src/lib/api/client.ts` is the only module that talks to the database.** No
component and no route handler calls `fetch` for data. It has two
implementations: a Supabase adapter for `LIKO_DATA_MODE=supabase`, and a fixture
adapter for `LIKO_DATA_MODE=fixtures`.

Every method takes the signed-in user's id and honours `classId`. The original
signatures named a `classId` and then discarded it, so every class returned
identical data; that is fixed.

`src/lib/data-mode.ts` selects the implementation, and `assertRealDataMode`
throws if a fixture read is attempted under `supabase` mode. Without that guard a
missed wiring would quietly show demo names to a real teacher, which is worse
than an error because it looks like a working app.

**`src/lib/api/types.ts` holds the contracts**, now split into view models
(`Student`, `Stat`, `HeatCell`) and persistence shapes (`StudentRecord`,
`ClassRecord`, `GradeRecord`). Keeping them apart is what lets a column change
without a marketing mockup breaking.

## Schema

`supabase/migrations/20260101000000_initial_schema.sql` is the source of truth.
Ten tables, two triggers, RLS enabled on every table. Conventions:

- `uuid` primary keys, `gen_random_uuid()`
- `owner_id` on every tenant table, even where a foreign key already implies
  ownership, so the RLS policy stays uniform
- soft delete via `archived_at` where a hard delete would destroy history
- uniqueness constraints that make writes idempotent: `attendance` is unique on
  `(class_id, student_id, date)` and `grades` on `(assessment_id, student_id)`.
  This is what makes an offline queue replay safe, so any new write type must
  carry its own constraint or must not be queued.

## Access control

Two layers, deliberately.

**`src/proxy.ts` is the outer gate.** Next.js 16 renamed the middleware
convention: the file is `proxy.ts`, the export is `proxy`, and it runs on the
Node.js runtime rather than Edge. It verifies the session cookie, maps the
pathname to a required permission, and redirects or refuses before any app shell
renders. It also sets security headers and rejects cross-origin state-changing
requests.

**`requirePermission()` is the inner gate.** Every server action and API route
checks independently. This is defence in depth, not redundancy: a proxy bypass,
a stale cached route, or a direct call to a server action must grant nothing.

**`src/lib/auth/rbac.ts` is the single source of truth.** Both layers read it.
A local copy of the matrix in either place is a bug.

Ownership scopes (`own`, `linked`) mean the API filter resolves accessible
records from the session. A tampered id in a URL returns 404, never another
user's data.

### Open redirect protection

The post-login destination travels in the form body, not the query string, and
the server action re-validates it. Anything that is not a single-slash-prefixed
relative path falls back to `/overview`, which also rejects the protocol-relative
`//evil.example` form.

## State ownership

Four layers, no overlap.

| Layer | Owner | Used for |
|---|---|---|
| Server state | TanStack Query | Rosters, gradebook rows, analytics |
| Form state | React Hook Form + Zod | Login, registration, lesson drafts |
| URL state | `searchParams` | Filters, sort, pagination, active tab |
| Client UI state | Local `useState` | Disclosure, accordion, input value |
| Continuous values | Motion values | Pointer tracking, scroll progress |

**Never `useState` for a value driven by scroll or pointer.** It re-renders the
tree every frame and collapses on mobile. Scroll-linked and pointer-linked motion
uses Motion values or GSAP.

**Query keys come from the factory in `lib/query/keys.ts`**, so invalidation is
never ad hoc.

**Optimistic updates are limited to attendance and grade entry.** Both are
reversible: the mutation writes optimistically, holds a rollback closure, and
reverts with an undo toast on failure.

## React 19 effects

ESLint's `react-hooks/set-state-in-effect` rule is on and passing. Two patterns
were replaced rather than suppressed:

- **Media queries** use `useSyncExternalStore` instead of
  `setMatches` inside an effect, which avoided a cascading render on every mount.
- **Hydration flags** use `useSyncExternalStore` with a no-op subscribe instead
  of the `useState` + `useEffect` + `setMounted(true)` pattern.
- **Prop-to-state sync** in `AttendanceGrid` was replaced with an override layer
  merged during render, so no effect is needed to keep them aligned.

## Offline

Serwist compiles `src/sw.ts` at build time into `public/sw.js`.

| Route pattern | Strategy | Notes |
|---|---|---|
| `/_next/static/*` | CacheFirst | Hashed, immutable |
| Same-origin images | CacheFirst | Content-addressed |
| `/_next/image` | StaleWhileRevalidate | |
| Documents | NetworkFirst, 3s timeout | Falls back to `/offline` |
| `/api/*` GET | NetworkFirst, 5min expiry | |
| `/api/*` POST | NetworkOnly + BackgroundSync | Never cached, replayed on reconnect |

The `OfflineBanner` in the workspace shell reports queue state and never covers a
keyboard-focused control.

## Testing

**Vitest** covers the pure logic where a bug is expensive: the RBAC matrix, route
permission mapping, password hashing and verification, Zod schemas, rate
limiting, CSRF origin checks, the grading policy engine, the API contracts, and
the `'use server'` export rule described below.

**Playwright** drives a production build, because the service worker and the
cache strategies under test do not exist in dev. It covers the landing page
(including no horizontal scroll at six widths, heading hierarchy, the absence of
em dashes and emoji), the auth round trip, the full RBAC matrix per role,
the interactive controls on every workspace screen, session storage hygiene,
manifest validity, icon resolution, service-worker registration, and the offline
fallback.

The suite sets `LIKO_RATE_LIMIT_DISABLED` for its own server. Throttling is a
deployed control, and an end-to-end run that signs in as the same demo account
repeatedly would otherwise be blocked by the very limiter that protects
production.

### The `'use server'` export rule

A `'use server'` module may only export async functions. Any other export is
replaced, on the client, by a reference proxy, so an import that resolves fine
can still be the wrong shape at runtime.

This bit twice. `ASSESSMENT_TYPES` was fixed by moving it to `assess/options.ts`.
`SEVERITY_OPTIONS` was still sitting in `history/actions.ts`, which made
`SEVERITY_OPTIONS.map` throw and dropped `/history` into the error boundary for
every signed-in user, and no test had ever opened that route with a session.
Presentation constants belong in a plain module beside the actions;
`src/lib/server-module-exports.test.ts` now scans the tree and fails if one
reappears.

## The fixture workspace

`LIKO_DATA_MODE=fixtures` serves a complete demo workspace: two classes, eleven
students, three assessments with a full gradebook, three lesson plans, five
weeks of marked registers, behaviour entries, and a cumulative history per
student. It is derived from the marketing roster so the marks a student holds
are the marks that roster already claimed, and it is deterministic, so an
assertion about a grade means the same thing on every run.

Two things about it are load-bearing and were both wrong first:

**The store lives on `globalThis`.** A module-level `const store` is per
*bundle*, not per process, and Next gives a page and its server action separate
copies. A `createClass` write updated the action's copy while the page
re-render read the page's copy, so creating a class reported success and
nothing appeared. Storing it globally makes it a real singleton for the life of
the process, which is what an in-memory workspace has to be.

**A behaviour entry is also a line on the cumulative record.** The history page
puts the entry form beside the timeline it feeds, so `addBehaviourLog` writes
both `behaviour_logs` and `student_history` in each adapter. Writing only the
first left the note saved, the toast truthful, and the timeline permanently
silent about it.

In `supabase` mode none of this file is reachable.

## Grading policies

`src/lib/grading/policy.ts` treats a grading scale as data: a descending set of
bands, each carrying a label and optionally a grade point. Five ship built in,
percentage, letter, milestone, GPA (4.00) and GWA (5.00, the Philippine General
Weighted Average), and `validatePolicy` accepts a user-defined scale of any
shape.

The percentage stays the single stored truth and a policy is only a view over
it, so a mark can read as 85, a B, and 3.75 without any of those being a second
source of truth that can disagree with the others.

**The gradebook runs on policies.** `grades/scales.ts`, which hardcoded four
scales and computed each inline, is gone. The gradebook reads the account's
scales from the seam, renders marks through `formatByPolicy`, and reports
weighted totals as grade points when the scale is point-based and as a weighted
percentage otherwise. `ScaleEditorDialog` authors a new scale, validated on every
keystroke by `validatePolicy`, so an unusable one never reaches the server.

**A class names its scale.** `classes.grading_policy_id` is a nullable
reference, and null means the percentage default, so an existing row keeps
working without a backfill. The selector offers every scale the account has, and
a separate action makes the choice stick to the class rather than resetting on
every reload. The selector's own value is per-class and derived from that
reference rather than copied into state, so switching class switches scale
without a frame showing the wrong one.

**The percentage stays the only stored truth.** A mark can read as 85, a B, and
3.75 without any of those being a second source of truth that can disagree with
the others. GWA below 51 carries no grade point rather than a 0.00, because a
failing mark is recorded as a remark in that system.

Still outstanding: the scale editor creates but does not edit an existing scale,
and a policy has no per-term override.

## Build order for the next module

Each MVP module is a vertical slice, in this order:

1. Add or extend the Zod contract in `lib/api/types.ts`
2. Add the method to `lib/api/client.ts`
3. Build the real component in `components/product/`
4. Wire the route, with `requirePermission()` on the page
5. Replace the empty state with the real screen
6. Add the unit and e2e coverage

Because the hero renders the real components, a module that is finished appears
in the landing page mockup automatically. That is deliberate.