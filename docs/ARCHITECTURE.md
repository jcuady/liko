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
permission mapping, password hashing and verification, reset-token hashing, Zod
schemas, rate limiting, CSRF origin checks, and the API contracts.

**Playwright** drives a production build, because the service worker and the
cache strategies under test do not exist in dev. It covers the landing page
(including no horizontal scroll at six widths, heading hierarchy, the absence of
em dashes and emoji), the auth round trip, RBAC refusal, session storage hygiene,
manifest validity, icon resolution, service-worker registration, and the offline
fallback.

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