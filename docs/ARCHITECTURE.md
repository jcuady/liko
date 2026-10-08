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
| `/welcome` | `(dashboard)` | any authenticated | Dynamic |
| `/overview` | `(dashboard)` | `analytics:read` | Dynamic |
| `/attendance` | `(dashboard)` | `attendance:write` | Dynamic |
| `/classes` `/plan` `/slides` `/assess` `/grades` `/history` | `(dashboard)` | per route | Dynamic |
| `/admin` | `(dashboard)` | `org:manage` | Dynamic |
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
Twelve tables, two triggers, RLS enabled on every table. Conventions:

- `uuid` primary keys, `gen_random_uuid()`
- `owner_id` on every tenant table, even where a foreign key already implies
  ownership, so the RLS policy stays uniform
- soft delete via `archived_at` where a hard delete would destroy history
- uniqueness constraints that make writes idempotent: `attendance` is unique on
  `(class_id, student_id, date)` and `grades` on `(assessment_id, student_id)`.
  This is what makes an offline queue replay safe, so any new write type must
  carry its own constraint or must not be queued. `classes` is unique on
  `(owner_id, upper(code))` among unarchived rows, because the short code is
  typed constantly as a filter and a duplicate makes every lookup ambiguous.
- `organizations` and `memberships` carry the tenancy. Membership is unique on
  `(org_id, user_id)`, so a person appears at most once per school.

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

### Why the session role is re-read on every request

The role inside the session cookie is a copy taken when it was signed. An
administrator who promotes a colleague changes what that person may do, and a
change that only lands at their next sign-in is not a change. `getSession()`
re-reads the account's role and uses it in preference to the cookie's, so
`/admin` means what the console says it means.

## Tenancy

`organizations` is the tenant. `memberships` says who belongs to it, as what,
and whether their access is active. A person in two schools has two membership
rows, which is the whole reason the table exists rather than a column on
`profiles`.

**The membership role is the same four roles the permission matrix already
defines.** An `owner` role was deliberately not added. It would have to appear
in the matrix, in the session payload, in every `switch` on role and in every
test that enumerates roles, all to buy the ability to receive an invoice. Org
ownership is a billing fact, so it is `organizations.billing_email`, and the
person who can administer the org is whoever holds `org:manage`. One concept,
one place.

**Tenancy is resolved from the session, never from a parameter.** The seam's
`getOrg`, `listMembers`, `setMemberRole` and `setMemberStatus` all take the
caller's user id and derive the organisation from their active membership. A
crafted member id from another school is refused in exactly the shape as an id
that never existed, so it cannot be used to confirm that a record is real.

**Every tenancy write passes two gates.** The server action checks the
permission from the session matrix; the seam checks that the caller is an active
admin of the organisation that owns the row. Both are needed, because a server
action is a public endpoint that `proxy.ts` never sees, and a role says what
someone may do without saying whose records they may do it to.

**A tenant can never be left without an administrator.** Demoting or suspending
the last active admin is refused with a reason, in the seam and reflected in the
UI, because the alternative is a school that nobody can recover through the
interface.

## Slide decks

A deck is lesson material, so it is gated on `plan:write` and sits beside the
planner in the navigation. Splitting the two would mean a teacher could prepare a
plan for a class they are not allowed to teach into.

**There is no .pptx import or export, and that is a decision rather than a gap.**
Converting in either direction needs a library that carries its own ideas about
what a slide is, and those ideas are Microsoft Office's. A deck authored in LIKO
is authored in LIKO, and it is presented from LIKO or printed to PDF by the
browser, which is what a teacher actually does with it.

**Positions are a target index, not a delta.** The editor's arrows know where a
slide is going; a client-computed delta is wrong the moment two people reorder
the same deck. The seam renumbers the deck on every move and every delete, and
`unique (deck_id, position)` makes a duplicate impossible rather than merely
unlikely.

**The slide form is mounted with `key={slide.id}`.** The obvious alternative, an
effect that copies the selected slide into form state whenever the selection
changes, renders twice per selection and discards half-typed input every time a
save lands.

**Present mode shares the editor's renderer.** What a teacher sees while editing
a slide is the component the class sees during a lesson, so the preview cannot
drift from the projection.

**Deleting the last slide archives the deck.** A deck with nothing in it cannot
be presented, and leaving one behind reads as data loss rather than as an
accident.

## Administration

`/admin` is gated on `org:manage`, not `user:manage`. The two are separate grants
on purpose: managing people in a school and managing the school's plan, billing
contact and seat count are different jobs, and a district roll-out will want to
hand out one without the other.

It answers four questions in one place, because they are compared against each
other rather than read in isolation: who is here, what may each of them do, what
the organisation is set up as, and what the access model actually is.

The access matrix on that page is **read from `rbac.ts` and rendered**, never
written out again as markup. A hand-maintained copy of a permission table is a
table that is wrong within a release, and it is exactly the kind of document an
administrator would trust.

The navigation entry is filtered by the same matrix that gates the route
(`navFor()` in `rbac.ts`), so a teacher is neither shown a link to `/admin` nor
able to open it.

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

### Two traps in this codebase that cost real time

**Server components must import icons from `@phosphor-icons/react/dist/ssr`.**
The plain entry pulls a React context into the server bundle, and the route fails
at build time with `createContext is not a function` during page-data
collection, which names neither the file nor the import. Client components use
the plain entry. `verify-email/page.tsx` has always done it the other way.

**The fixture workspace is one shared, mutable store, and Playwright runs specs
in parallel against one server.** Two tests writing to the demo workspace see
each other. This has produced two brittle assertions that looked like product
bugs: an onboarding test asserting an exact count of grading scales, which moved
when a sibling test authored one, and a present-mode test asserting "1 of 5"
when a sibling had added a slide. Assert on behaviour the test owns, or read the
shared value and compare against it, rather than pinning a total. A test that
mutates shared state should also put it back.

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

## The teacher profile

`profiles` carries the answers that make the product specific to one teacher: the
school they work at, the subjects they teach, the level they usually teach at,
and the scale they grade on by default. A class still overrides the scale, so a
department can differ from the teacher's own habit.

Subjects are a `text[]` rather than a table. Nothing joins to a subject, because
the gradebook reaches a student through a class, so normalising them would add a
lookup nobody queries and an extra write per save. They are deduplicated
case-insensitively while keeping the first spelling typed, because the list is
read back to the teacher and should read the way they wrote it.

`parseSubjects` lives in `src/lib/profile/subjects.ts` rather than beside the
server action, for the same reason `SEVERITY_OPTIONS` moved: a `'use server'`
module may only export async functions, and a plain helper exported from one
reaches the client as an uncallable proxy.

`/settings/profile` used to render an "editing your profile is not built yet"
placeholder. It is a single form with everything visible, deliberately not a
wizard: the wizard belongs to signup, where collecting answers in an order that
builds context has a job to do. Editing an existing profile has no such order.
Both paths write the same shape.

## First-run setup

Registration sends a new teacher to `/welcome`, not to the workspace. An empty
overview answers none of the questions a teacher has, and every later screen has
to guess. Asked once here, the rest of the product can be specific.

Three questions, because each one removes a decision from every later screen:
what is taught, how it is graded, and the first class that ties the two together.
Anything else would be the product asking questions it could ask later, when the
teacher has the context to answer them.

**It is idempotent by construction, not by a flag.** `/welcome` reads the
profile and the roster and redirects onward when the teacher has already
answered. There is no `onboarded` boolean to drift out of step with reality, so
the route is safe to reach by URL, safe to abandon and return to, and safe for a
user who already had a workspace before it existed.

**Each step writes immediately.** A wizard that loses everything when the tab
closes is worse than no wizard, and a half-answered profile is still better than
an empty one.

**It can be skipped in one click.** Not everyone teaches the same way, and a
teacher who wants none of it can reach the workspace and fill it in when it
matters. Forcing it would convert a convenience into a wall.

**A student or guardian is never shown it.** There is no class to name and no
scale to choose, so the route would be three questions with no answer available,
and the server sends them to `/classes` instead.

The scale chosen on step two becomes the class's own scale rather than only the
teacher's default, because that is the scale the teacher just said they use. The
name typed at registration is carried across rather than rebuilt from the email
address, since the wizard never asks for one.

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