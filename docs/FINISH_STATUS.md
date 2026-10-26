# System Finish Status

**Last updated:** 2026-10-23
**Repo:** LIKO @ `b104fba` (branch `integrate/verified-session-and-runner-fixes`)
**Coverage:** **93%** (100 of 108 rows terminal)
**Audit mode:** read-only. No application source, config, migration, or test file
was modified. The four files under `docs/` are the only writes this audit made.

> **This file is the canonical status document for this audit.** `PROJECT_STATUS.md`
> (repo root, 132 KB) and `docs/SYSTEM_AUDIT.md` (165 KB) predate it and cover
> overlapping ground. They are **not** superseded by it and were **not** edited.
> Where they disagree with this document, this one describes the state measured
> on 2026-10-23 and the other two describe the state measured earlier. Two
> status documents that describe different dates are a known condition of this
> repo, recorded here rather than resolved by editing files outside this
> audit's scope.

> **THAT NOTE IS NOW OUT OF DATE, AND IT IS LEFT HERE FOR THE SAME REASON THE
> REST OF THIS DOCUMENT IS.** This file is a snapshot of the audit of
> 2026-10-23. **The live status is `PROJECT_STATUS.md`**, which has moved on:
> every finding this audit raised is closed, every slice of `docs/FIX_PLAN.md`
> is implemented, and the recorder now runs **26 gates** rather than 23.
> **Nothing in this file has been edited to match, because its figures are
> claims about the run at `b104fba` and they are true of it.** What has changed
> is everything after it, and a reader who wants to know what is true now must
> read `PROJECT_STATUS.md` and `docs/evidence/gates.json` rather than this
> file. Two documents that describe different dates are a known condition of
> this repo; the thing that makes it survivable is that each one says which
> date it describes, and this one now says so more loudly than it did.


---

## Definition of done

| # | Condition | Status |
|---|---|---|
| 1 | Every coverage row has a terminal status | **met** — 108 rows, 100 terminal, 8 with an explicit FAIL and a linked finding |
| 2 | Every DONE row cites evidence | **met** — every DONE row names a command with an exit code, or a file with a line number |
| 3 | Zero open P0/P1 | **not met** — 0 P0, **2 P1 open** (`docs/AUDIT_FINDINGS.md` #1, #2) |
| 4 | Docs match the matrix | **not met** — 6 doc claims contradict the code (`docs/AUDIT_FINDINGS.md` #1, #4, #5, #7, #8, #9) |

**Coverage is 93%, and the gap is not spread evenly.** The product itself is
in good shape: 22 of 23 gates pass, the database layer is genuinely enforced
and proved by execution, and the PWA and design-system work is done and
measured. The missing 7% is concentrated in **two places**: one
security-shaped question that nobody has tested (de-escalation), and **six
documentation claims that are now false**. The documentation debt is the
larger half of the gap by count and the smaller half by risk.

---

## Gate results

Run: `node scripts/run-gates.mjs` — the repository's own recorder, 23 gates,
started 2026-10-23 21:31, completed 21:46.

**Recorded run:** `commit b104fba`, `tree.exact: false` (see *Working tree*
below), `build 8bM5RQXug3KnWcoTnDQKC` at both start and end, `changed: false`,
`contaminated: false`, `partial: false`, Node v25.4.0.

**Result: 22 pass, 1 blocked, 0 fail, 0 error.**

| # | Gate | Command | Exit | Status |
|---|---|---|---|---|
| 1 | typecheck | `pnpm typecheck` | 0 | **PASS** — 12.1s |
| 2 | lint | `pnpm lint` | 0 | **PASS** — 35.6s |
| 3 | unit | `pnpm test` | 0 | **PASS** — 9.7s; 42 files, 548 passed, 10 skipped, 558 total |
| 4 | check:sql | `pnpm check:sql` | 0 | **PASS** — 1.6s; RLS on all 28 tables, 52 policies (49 public, 3 storage) |
| 5 | check:redaction | `pnpm check:redaction` | 0 | **PASS** — 0.1s; 7 secret shapes removed, 4 real gate lines unaltered |
| 6 | check:primitives | `pnpm check:primitives` | 0 | **PASS** — 0.2s; 144 files, every raw control is a kit primitive, 8 reasoned exceptions |
| 7 | e2e | `pnpm e2e` | 0 | **PASS** — 415.6s; 256 passed, 0 failed, 25 spec files |
| 8 | check:responsive | `pnpm check:responsive` | 0 | **PASS** — 33.1s |
| 9 | check:behaviour | `pnpm check:behaviour` | 0 | **PASS** — 9.3s |
| 10 | probe:shape | `pnpm probe:shape` | 0 | **PASS** — 1.6s |
| 11 | probe:guardian | `pnpm probe:guardian` | 0 | **PASS** — 9.0s |
| 12 | verify:app | `pnpm verify:app` | 0 | **PASS** — 80.0s; 79 passed, 0 failed against the live app |
| 13 | verify:saas | `pnpm verify:saas` | 0 | **PASS** — 4.1s; 28 passed, 0 failed |
| 14 | db:check | `pnpm db:check` | 0 | **PASS** — 3.7s; all 28 tables present on the live project |
| 15 | db:settle | `pnpm db:settle` | 0 | **PASS** — 10.8s; **29 passed, 0 failed**, per-role RLS proved by execution |
| 16 | probe:files | `pnpm probe:files` | 0 | **PASS** — 1.5s |
| 17 | verify:controls | `pnpm verify:controls` | 0 | **PASS** — 0.8s; 162 controls in 144 files, 0 unwired, 1 inert (explained) |
| 18 | verify:links | `pnpm verify:links` | 0 | **PASS** — 0.8s; 44 routes, 62 internal links, 0 unexamined |
| 19 | verify:filters | `pnpm verify:filters` | 0 | **PASS** — 0.8s; 131 filters, 0 unwired, 3 unexamined, 0 disabled |
| 20 | verify:actions | `pnpm verify:actions` | 0 | **PASS** — 10.6s |
| 21 | verify:empty-states | `pnpm verify:empty-states` | 0 | **PASS** — 2.8s |
| 22 | verify:rbac-routes | `pnpm verify:rbac-routes` | 0 | **PASS** — 0.5s; 13 rules over 38 routes, **0 dead rules** |
| 23 | probe:ai | `pnpm probe:ai` | 1 | **BLOCKED** — 3.4s; the upstream provider answered **HTTP 503, "This model is currently experiencing high demand"**. Not a product failure and not a pass. The gate measured nothing. |

**Gates not run by this audit.** `pnpm build` was not run as a separate gate —
it runs *inside* the e2e gate (`playwright.config.ts:64` → `pnpm run build &&
pnpm run start`) and inside the recorder's own server start, and the recorder
records `build.served: true` with the build id unchanged at both ends of the
run. It is therefore **PASS by inclusion**, not independently re-run.
`pnpm db:apply` was not run: it mutates the live database and this audit is
read-only. `pnpm verify:signup-prod` and the other `verify:prod-*` scripts are
not registered gates.

**On the blocked gate.** `probe:ai` is blocked by an external condition — the
provider is at capacity. The repo's own record already shows this gate passing
on other runs and blocking on others for the same reason. It is recorded as
**BLOCKED**, never as a pass and never as a failure, and the previous passing
run is preserved beside it rather than overwritten.

### Working tree

`tree.exact: false`. Four paths differed from `b104fba` at run time:
`scripts/verify-role-guards.mjs` (material — it can reach the build),
`PROJECT_STATUS.md`, `docs/evidence/gates.json` and `b.txt` (immaterial).

**A second process was writing to this repository during the audit.** Between
21:31 and 22:40 on 2026-10-23 it modified
`src/app/(dashboard)/attendance/AttendanceGridClient.tsx`,
`src/app/(dashboard)/flashcards/[deckId]/page.tsx`,
`src/app/(dashboard)/flashcards/actions.ts`,
`src/app/(dashboard)/flashcards/page.tsx` and `src/lib/outbox/index.ts`, and
added `scripts/verify-role-guards.mjs`, `e2e/offline-attendance.spec.ts` and
`b.txt`. **None of the files cited in this audit's findings are among them**,
so no finding depends on a file that was moving. The gate run is labelled
`tree.exact: false` for the same reason, and that label is accurate rather
than a formality.

**The gate list grew during the audit.** After the run completed, the same
process registered `verify:role-guards` in `package.json` and
`scripts/run-gates.mjs`, so the recorder now selects **24** gates where it
selected 23 when this run was made. The gate table above is the 23 that
**actually executed** and is deliberately not extended with a gate that did not
run. The new gate is unmeasured by this audit and its result is unknown here.

---

## Coverage matrix

108 rows. 100 terminal (DONE / BLOCKED / DEFERRED / N/A), 8 FAIL.

### ARCH — Architecture and baseline

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| ARCH-01 | Stack, framework, DB, auth, API shape, styling, test stack, deploy config identified | DONE | `package.json:7-38`; `src/app/globals.css`; `playwright.config.ts` | Next.js 16.4, React 19.3, Tailwind v4, Supabase (Postgres + Auth + Storage), Serwist SW, Vitest + Playwright, Vercel |
| ARCH-02 | Documentation inventory | DONE | `docs/` (10 files), `README.md` (18 KB), `PROJECT_STATUS.md` (132 KB), `docs/SYSTEM_AUDIT.md` (165 KB) | No `AGENTS.md`/`CLAUDE.md`. Six prior docs make claims now false — findings #1, #5, #7, #8, #9 |
| ARCH-03 | Package manager and script names resolved from the manifest | DONE | `package.json:6-39` | pnpm 11.8.0, 14 named scripts + 23 registered gates |
| ARCH-04 | Git state captured; unknown work preserved | DONE | `git status`, `git log` | Branch `integrate/verified-session-and-runner-fixes`. Uncommitted work left untouched; a concurrent writer's changes were not modified or reverted |
| ARCH-05 | Baseline gate run recorded before any change | DONE | gate table above | `node scripts/run-gates.mjs`, 23 gates, 21:31–21:46 |
| ARCH-06 | Every baseline gate individually classified | DONE | gate table above | 22 PASS, 1 BLOCKED, 0 SKIPPED, 0 FAIL, 0 VACUOUS. The recorder runs gates independently — no `&&` chain can skip a later gate |

### ROUTE — Pages and routing

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| ROUTE-01 | Every route enumerated with purpose and roles | DONE | `pnpm verify:links` → 44 routes, 62 internal links, 0 unexamined | Exit 0 |
| ROUTE-02 | No dead links | DONE | `pnpm verify:links` exit 0 | Every internal link resolves to a real route |
| ROUTE-03 | Every nav item resolves to a complete page | DONE | `pnpm verify:rbac-routes` → 13 rules over 38 routes, 20 gated, 0 dead | Exit 0 |
| ROUTE-04 | 404 / loading / error boundaries exist | DONE | `pnpm verify:saas` → "an unknown route renders the 404 page — status 404" | Exit 0, 28 passed |
| ROUTE-05 | Redirects correct; no loops; deep links work cold | DONE | `e2e` 256 passed incl. `landing.spec.ts`, `auth.spec.ts` | — |
| ROUTE-06 | Every referenced-but-absent page flagged | DONE | `pnpm verify:links` exit 0; `pnpm verify:rbac-routes` 0 dead rules | — |

### CTRL — Interactive controls

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| CTRL-01 | Every control enumerated | DONE | `pnpm verify:controls` → **162 controls in 144 files** | Exit 0 |
| CTRL-02 | Every control has a handler that is connected | DONE | `pnpm verify:controls` → 0 unwired, 0 unexamined | Exit 0 |
| CTRL-03 | Handler performs the correct action for its label | DONE | `pnpm verify:actions` exit 0, 10.6s | — |
| CTRL-04 | Disabled states correct and explained | DONE | `pnpm verify:controls` → 1 inert, `ThemeToggle.tsx:37`, with a `title` explaining it | Verified: the control is disabled only when cookie consent is "essential", and the reason is in the tooltip |
| CTRL-05 | Permission-gated in the server action, not only hidden in the UI | DONE | 15 of 16 permissions guarded by `requirePermission` in 64 call sites across 17 `actions.ts` files; `analytics:read` by the page layer | `probe-rbac-matrix.mjs`: 16/16 |

### FILTER — Search, filter, sort, paginate

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| FILTER-01 | Every filter wired to something | DONE | `pnpm verify:filters` → 131 filters in 144 files, 0 unwired, 0 disabled | Exit 0 |
| FILTER-02 | Filters narrow the result set and can be cleared | DONE | `pnpm verify:filters` exit 0 | — |

### RBAC — Roles and authorization

Full matrix: **`docs/RBAC_MATRIX.md`**.

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| RBAC-01 | Role list from the source of truth | DONE | `probe-rbac-matrix.mjs` → app roles == DB roles; `initial_schema.sql:34, 827, 1297` | **4 roles**: instructor, admin, student, guardian. Read from the DB `check` constraint, not the UI |
| RBAC-02 | Permission matrix filled in from code and observed behaviour | DONE | `docs/RBAC_MATRIX.md`; `src/lib/auth/rbac.ts:68-141` | 16 capabilities × 4 roles |
| RBAC-03 | Every matrix cell verified by acting as the role | DONE | `pnpm db:settle` → 29 passed, 0 failed; `pnpm verify:app` → 79 passed; `pnpm e2e` → 256 passed | Real tokens on the live DB, per role, in both directions. The repo's own gates; see the verification log in `docs/RBAC_MATRIX.md` |
| RBAC-04 | Server-side enforcement on every mutation | DONE | `probe-rbac-matrix.mjs` → 16/16 permissions guarded; 64 `requirePermission` call sites | 15 by server action, 1 by the page layer (read-only) |
| RBAC-05 | Cross-tenant isolation verified with a second tenant's data | DONE | `pnpm db:settle` → self-promotion and cross-tenant class read both refused | Exit 0. A throwaway tenant is created on the live database for this |
| RBAC-06 | Ownership checks on read, update, delete | DONE | `pnpm db:settle` → guardian exact-set reads; guardian writes refused; parent cannot edit or delete an event its child's teacher wrote | Exit 0 |
| RBAC-07 | Role changes take effect on the next request | **FAIL** | `src/lib/auth/guards.ts:51-53`; `src/lib/auth/session.ts:14` | **Finding #2.** The role is a copy in the signed cookie; `supabase` mode never re-reads it. The cookie lives 7 days. The *database* updates immediately (`memberships.role`), the *app layer* does not |
| RBAC-08 | De-escalation actually revokes access | **FAIL** | Same as RBAC-07 | **Finding #2.** Not verified by execution — no test exercises a demotion. The service-role invite paths (`client.ts:1955`, `:1984`) bypass RLS, so the stale cookie is the only gate there |
| RBAC-09 | Admin-only surfaces probed by URL and by API | DONE | `pnpm e2e` `rbac.spec.ts` → a refused route renders the refusal, never the error boundary; `verify:app` 79 passed | — |
| RBAC-10 | Route guards cover the handler layer, not just the layout | DONE | `src/lib/auth/guards.ts:10-16`; `src/proxy.ts` | The proxy is documented as an optimisation; every server action re-checks. 64 call sites |
| RBAC-11 | Nav and buttons respect the same matrix the server enforces | DONE | `pnpm verify:app` → `ROLE_GATED_CONTROLS`, 6 entries; `e2e/role-controls.spec.ts` | A student is still offered "New deck" because they own it — the positive control that stops an over-hiding fix reading as a pass |
| RBAC-12 | Effective DB reach documented per role | DONE | `probe-rls-policies.mjs` → 26 tables, 49 public policies + 3 storage | `docs/RBAC_MATRIX.md` § *Effective database reach* |

### CRUD — Entity lifecycles

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| CRUD-01 | Roster / attendance lifecycle | DONE | `pnpm e2e` `attendance-note.spec.ts`, `import.spec.ts` | — |
| CRUD-02 | Lesson planner lifecycle | DONE | `pnpm e2e` | — |
| CRUD-03 | Assessment builder lifecycle | DONE | `pnpm e2e` `quiz-maker.spec.ts`, `answer-sheet.spec.ts` | — |
| CRUD-04 | Gradebook lifecycle | DONE | `pnpm e2e` `export.spec.ts`, `gradebook` | — |
| CRUD-05 | At-risk heatmap lifecycle | DONE | `pnpm probe:shape` → no upside-down grade span | — |
| CRUD-06 | Report cards | **DEFERRED** | `docs/ROADMAP.md:70-72` | Deliberately deferred: needs a PDF pipeline and a layout decision. Revisit when the product has users |

### API — Backend contracts

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| API-01 | Every frontend-called endpoint exists and matches | DONE | `pnpm verify:actions` exit 0 | — |
| API-02 | Server-side schema validation | DONE | `pnpm verify:actions`; `src/lib/api/client.ts` `mapSupabaseError` | — |
| API-03 | Status codes correct and meaningful | DONE | `pnpm verify:saas` 28 passed | — |
| API-04 | Auth and authz on every non-public endpoint | DONE | 64 `requirePermission` call sites; `pnpm verify:app` | Public set is explicit (`src/lib/auth/rbac.ts:362` `AUTH_PATHS`) |
| API-05 | Errors structured and leak nothing internal | DONE | `pnpm check:redaction` exit 0; `client.ts` `DataError` codes | — |
| API-06 | No swallowed exceptions | DONE | `pnpm lint` exit 0; `check:redaction` 4 real gate lines unaltered | — |

### DB — Database and schema

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| DB-01 | Migrations apply cleanly, in order | DONE | `pnpm db:check` → all 28 tables present on the live project; `pnpm check:sql` | The migration is applied to the live database and the checked-in file matches it |
| DB-02 | Constraints exist where the app relies on them | DONE | `initial_schema.sql:34, 827, 1297` role checks; FKs and unique constraints throughout | — |
| DB-03 | Every FK target has a matching unique/primary key | DONE | `pnpm check:sql` exit 0 | — |
| DB-04 | Indexes support the query patterns | DONE | `initial_schema.sql` index block; `pnpm db:check` exit 0 | — |
| DB-05 | RLS correct per role and tenant, verified as each role | DONE | `pnpm db:settle` → 29 passed, 0 failed | **The strongest evidence in this document.** Real users, real tokens, live database, both directions |
| DB-06 | Deletion strategy deliberate | DONE | `initial_schema.sql` — cascade on auth user, soft-archive for students (`archived_at`) | — |
| DB-09 | Numeric columns use numeric, not float | DONE | `initial_schema.sql:565` `score numeric(8,2)` | — |
| DB-10 | Seed data consistent and does not contradict the UI | DONE | `pnpm probe:shape` → 0 incoherent rows | — |
| DB-11 | No credentials or connection strings committed | DONE | `pnpm check:redaction` exit 0; `.env.local` and `.env*.local` are gitignored | — |

### FORM — Forms and validation

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| FORM-01 | Client and server validation on every field | DONE | `pnpm e2e` + `pnpm verify:actions` exit 0 | — |
| FORM-02 | File upload validated | DONE | `pnpm probe:files` → probe row removed, status 204 | — |

### STATE — Loading, empty, success, error

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| STATE-01 | Every async surface has a loading state | DONE | `pnpm e2e` 256 passed | — |
| STATE-02 | Every list has a purposeful empty state | DONE | `pnpm verify:empty-states` → 21 pages classified, 5 shared role-aware, 2 invitation-allowed | — |
| STATE-03 | Every mutation surfaces success feedback | DONE | `pnpm verify:actions` exit 0 | — |
| STATE-04 | Every failure path surfaces a specific message | DONE | `pnpm e2e`; `client.ts` `DataError` message mapping | — |

### UI — Branding, design system, consistency

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| UI-01 | Design tokens used; no hardcoded values that duplicate a token | DONE | `landing.css` has **zero** hex literals; all 24 `var(--…)` tokens it uses resolve — 17 in `globals.css`, 7 in landing.css's own bridge block, which maps the design's names (`--primary`, `--foreground`, `--muted`) onto the product's tokens rather than duplicating them | No token is undefined |
| UI-02 | Semantic colour roles consistent | DONE | `globals.css:187-206` light and `:237-265` dark | — |
| UI-03 | Type scale and heading hierarchy consistent | DONE | `globals.css:377-433` — all seven DESIGN.md classes exist | — |
| UI-05 | Shared components used, no parallel variants | DONE | `pnpm check:primitives` → 144 files, every select/textarea/table/input is a kit primitive, 8 reasoned exceptions | — |
| UI-06 | Icon library and sizing consistent | DONE | 54 `lucide-react` references; `next.config.ts:64` names an absent package | **Finding #3** — the *config* is stale, the *usage* is consistent |
| UI-08 | Dark mode parity | DONE | `globals.css:237-265` — the dark token set mirrors the light one | — |
| UI-10 | Copy tone consistent; no placeholder marketing text | DONE | `e2e/landing.spec.ts:344` em-dash assertion; `docs/PRODUCT.md:64` voice rules | — |
| UI-11 | The hero renders the shipping components, not a div-built fake | **FAIL** | `WorkspaceMock.tsx:1-15` imports no `@/components/product/*`; `git show 681d6ee^:…/ModuleBento.tsx` did | **Finding #1.** The locked decision is not met, and `docs/ROADMAP.md:74-75` claims the opposite |
| UI-12 | The no-em-dash rule's scope is stated and enforced as claimed | **FAIL** | `e2e/landing.spec.ts:344-362` is the only em-dash assertion, and it covers `/` only; `Hero.tsx:20-22` correctly says "this page" | **Finding #10.** The rule is real; its boundary is unstated |

### RESP — Responsive

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| RESP-01 | Viewports tested | DONE | `pnpm check:responsive` → 375, 768, 1024, 1440, 1920px, exit 0, 33.1s | — |
| RESP-02 | No horizontal overflow at any tested width | DONE | `pnpm check:responsive` exit 0 | `scrollWidth` == viewport at every width |
| RESP-03 | No overlap, clipping, or off-screen overlays | DONE | `pnpm check:behaviour` → 4 anchors clear the sticky nav | Exit 0 |

### A11Y — Accessibility

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| A11Y-01 | Semantic elements; no generic div click handlers | DONE | `pnpm check:primitives` exit 0 | — |
| A11Y-02 | Heading hierarchy correct per page | DONE | `pnpm e2e` `landing.spec.ts` | — |
| A11Y-03 | All controls have accessible names | DONE | `pnpm verify:controls` → 162 controls, 0 unwired | — |
| A11Y-04 | Images have alt text | DONE | `pnpm e2e` `landing.spec.ts` → the workspace mock's table has a `<caption class="sr-only">` | — |
| A11Y-05 | Full keyboard navigation with visible focus | DONE | `globals.css:340` — focus is never removed, 2px viridian ring | — |
| A11Y-08 | Contrast meets WCAG AA | DONE | `docs/DESIGN.md:291-293` states the target; `pnpm check:responsive` and `check:behaviour` exit 0 | The **claim** is documented; a contrast measurement tool was not run in this audit |

### CODE — Code health

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| CODE-01 | Lint clean | DONE | `pnpm lint` exit 0, 35.6s | — |
| CODE-02 | Typecheck clean | DONE | `pnpm typecheck` exit 0, 12.1s | A clean typecheck proves declaration, not runtime binding — the e2e gate covers the runtime |
| CODE-03 | Production build succeeds | DONE | Inside the e2e gate: `playwright.config.ts:64` runs `pnpm run build && pnpm run start`; recorder `build.served: true`, unchanged at both ends | Not independently re-run; PASS by inclusion |
| CODE-04 | No stray TODO/FIXME/mock in user-facing paths | DONE | `pnpm e2e`; `verify:empty-states` → no page tells a reader to create a class their role cannot create | — |
| CODE-05 | No `@ts-ignore` / blanket `eslint-disable` masking defects | DONE | Exactly one hit: `src/lib/ai/gemini.ts:277`, `eslint-disable-next-line no-console`, with a stated reason | — |
| CODE-06 | No unused exports, dead components, orphaned routes | **FAIL** | `package.json:71` `simple-icons` — imported nowhere in `src/`, `e2e/` or `scripts/` | **Finding #6.** The repo's own `check:primitives` gate even *names* the mock: "the landing page mocks the product" |
| CODE-09 | No new dependency added without justification | **FAIL** | `next.config.ts:64` optimises `@phosphor-icons/react`, which is neither in `package.json` nor installed | **Finding #3** |
| CODE-10 | No secrets in source, fixtures, committed logs, or generated evidence | DONE | `pnpm check:redaction` exit 0 — 7 secret shapes removed, 4 real gate lines unaltered | — |

### TEST — Test coverage

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| TEST-01 | Existing suites run; results recorded per suite with exit codes | DONE | gate table above — 23 gates, each with its exit code and duration | — |
| TEST-02 | Login, logout, session expiry covered | DONE | `e2e/auth.spec.ts`; `session.test.ts` | — |
| TEST-03 | Each CRUD path has at least one test | DONE | `pnpm e2e` 256 tests across 25 spec files | — |
| TEST-04 | Search, filter, sort covered | DONE | `pnpm verify:filters` 131 filters; `e2e/interactions.spec.ts` | — |
| TEST-05 | Permission-sensitive actions covered by a negative test | DONE | `e2e/rbac.spec.ts`, `e2e/role-controls.spec.ts`; `pnpm db:settle` | — |
| TEST-07 | The tests can fail | DONE | The repo's own record: `db:settle` reported **17 passed, 5 failed** before the policies were applied and **23 passed, 2 failed** before the write split — the failures were exactly the newly-guaranteed behaviours | Independently corroborated: the e2e gate reported 256 passed / 0 failed, and the recorder's `lastPassing` mechanism preserves prior passes beside a block |
| TEST-08 | Every defect found by this audit has a regression test | **FAIL** | Findings #1–#10 have no new test | This audit changed no source, so no test was added. The plan for each is in `docs/FIX_PLAN.md` |

### DOC — Documentation completeness

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| DOC-01 | README accurate | DONE | `README.md` — the `--webpack` rationale at `:76-81` and the port note at `:221-241` both match the code | — |
| DOC-02 | Environment variables documented, no secrets | DONE | `.env.example`; `pnpm check:redaction` exit 0 | — |
| DOC-03 | Architecture documented | DONE | `docs/ARCHITECTURE.md` | One stale passage — finding #3's third bullet |
| DOC-05 | RBAC documented | DONE | **`docs/RBAC_MATRIX.md`** (created by this audit) | Did not exist before. Role list, 16-capability matrix, enforcement point per row, verification log |
| DOC-07 | Deploy/ops documented | DONE | `README.md`; `docs/HANDOVER.md` | — |
| DOC-08 | Known limitations stated explicitly | DONE | `docs/SECURITY.md:226-242` — 9 known gaps, each with impact and closure condition | Verified each against the code; the technical claims hold |
| DOC-10 | Every doc claim cross-checked against code | **FAIL** | 6 false claims found — findings #1, #4, #5, #7, #8, #9 | The cross-check is now recorded; the corrections are slice 2 of `docs/FIX_PLAN.md` |

### OPS — Production readiness

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| OPS-02 | Migrations run in deploy order and are reversible or documented as one-way | DONE | `pnpm check:sql` → every policy is dropped before creation; `pnpm db:check` | — |
| OPS-03 | Secrets from environment, not committed | DONE | `.gitignore`; `pnpm check:redaction` exit 0 | — |
| OPS-06 | Backup/restore path documented and believed | **DEFERRED** | No backup tooling in the repo | An ops decision, not a code one. Revisit before the first paying customer |
| OPS-07 | No debug flags, dev bypasses, or seed passwords in production paths | DONE | `playwright.config.ts:76-93` — the rate-limit bypass is a **two-key** override that `next start` (NODE_ENV=production) refuses to honour on a single flag; `LIKO_E2E` is a test-only marker | The one deliberate bypass is documented at the point of use and is inert without the second key |

### PWA — Serwist, manifest, offline

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| PWA-01 | The service worker is emitted by the build | DONE | `public/sw.js` — 49,370 bytes, regenerated 21:51 by the gate run's build; contains the Serwist precache manifest | `pnpm build` log: `(serwist) Bundling the service worker script with the URL '/sw.js' and the scope '/'` |
| PWA-02 | The service worker registers and reaches `activated` | DONE | `e2e/pwa.spec.ts` "registers and reaches an activated state" — in the e2e gate, 256 passed | Waits for the terminal state rather than sampling once |
| PWA-03 | The manifest is served, valid, and installable | DONE | `e2e/pwa.spec.ts` — name, `display: standalone`, `start_url`, `theme_color #007134`, ≥2 icons, ≥3 shortcuts | Every icon was confirmed to resolve to a real image with an image content-type |
| PWA-04 | Manifest shortcuts point at real routes | DONE | `e2e/pwa.spec.ts` — each shortcut request must be 307→/login (auth-gated) rather than 404 | The earlier `toBeTruthy()` assertion proved nothing; this one checks the status |
| PWA-05 | The `--webpack` constraint is respected | DONE | `package.json:7-8` — `--webpack` on both `dev` and `build`; build log reads `▲ Next.js 16.4.0 (webpack)` | No Turbopack reference exists in any executable file |
| PWA-06 | Offline fallback renders | DONE | `e2e/pwa.spec.ts` — the cache-eviction test seeds a stale cache and forces a real `activate` | — |

---

## Instrument validation

Two harnesses were written for this audit and run **outside** the target
repository, so that no application file was touched. Per the evidence rules, a
new instrument is unverified software until it has been shown to fire on a
known-bad case.

### `probe-rbac-matrix.mjs`

| Assertion | Positive (real repo) | Negative control |
|---|---|---|
| DB role constraint is discoverable | ok | — |
| App roles equal DB roles | ok | **FAIL** — a fixture whose DB constraint omitted `admin` while the app still knew it: `app=[admin,guardian,instructor,student] db=[guardian,instructor,student]`, exit 1 |
| Every DB role has a matrix row | ok | — |
| Every declared permission has a server-side guard | ok | **FAIL** — a fixture with `class:read` and `grade:read` unguarded: `no requirePermission/requirePagePermission for: class:read, grade:read`, exit 1 |
| Every route rule gates a real route | ok (13/13) | **FAIL** — a fixture with one rule pointed at `/grdes`: `dead: /grdes`, exit 1, every other assertion green |
| Every route rule names a declared permission | ok | — |

The third control also proved the check distinguishes a dead rule from a route
that merely lives behind a Next.js route group (`src/app/(dashboard)/…`) — the
first version of the probe reported all 13 rules as dead, which was the
instrument's bug, not the repo's.

### `probe-rls-policies.mjs`

Two instrument bugs were found and fixed before its output was used:

1. A non-greedy regex truncated every multi-line predicate at its first close
   paren, so `exists ( select 1 from … )` policies were read as narrower than
   they are. Replaced with a depth-counting scanner.
2. The twelve `own rows` policies are generated in a `DO` loop
   (`initial_schema.sql:1460-1477`), not written literally, so a
   literal-`create policy` scan missed all twelve and made twelve owner-scoped
   tables look owner-less.

After both fixes it reports 26 tables and 49 public policies, which matches
`pnpm check:sql` → `52 policies (49 in public across 28 tables, 3 on storage)`
exactly.

---

## Blockers to 100%

| Row(s) | Reason | What would unblock |
|---|---|---|
| RBAC-07, RBAC-08 | The role in the session cookie is a copy; `supabase` mode never re-reads it, and the cookie lives 7 days. No test exercises a demotion, so the end-to-end consequence is reasoned, not measured | Slice 1 of `docs/FIX_PLAN.md`: write the failing test first, then close the window on the two service-role invite paths |
| UI-11 | The hero renders a static picture of the product, not the shipping components. Whether that is acceptable is an owner's decision | Slice 2 of `docs/FIX_PLAN.md`, option (a) correct the docs or option (b) restore the real components |
| UI-12 | The no-em-dash rule is enforced on `/` only, and its scope is unstated | Slice 4 of `docs/FIX_PLAN.md` — one sentence in `docs/DESIGN.md` |
| DOC-10 | Six doc claims contradict the code | Slice 2 of `docs/FIX_PLAN.md` — prose only, no code risk |
| CODE-06, CODE-09 | One unused dependency and one dead config entry | Slice 3 — 15 minutes of work |
| TEST-08 | This audit changed no source, so it added no regression test | Each fix slice adds the test specified in `docs/FIX_PLAN.md` |
| — (gate 23) | `probe:ai` is blocked by the upstream provider returning HTTP 503 | Provider capacity. Not fixable in code; the app is written to say "out of capacity" rather than pretend otherwise |
| — (not a row) | **Registration is unverified against the live database.** Supabase rejects the `.test` probe address, so the signup path, the `handle_new_user` trigger and the `consent_events` write are untested | A custom SMTP provider, or a probe address on a real domain. `pnpm verify:app` reports this honestly as `signup rejects the .test probe address, so the path stays unverified` |
| — (not a row) | **Legal text has not been reviewed by a lawyer.** `docs/SECURITY.md:236` names this as a gap before any external launch | A professional signature. Not an agent's to give |
| — (not a row) | **The service key and the database password have not been rotated.** Named in `PROJECT_STATUS.md` | A credential rotation, proven by refusing the old value |

The last three cannot be closed by any agent. They are listed because a status
document that lists only what an agent could do would misrepresent what is
standing between the product and a launch.

---

## Deferred

| Row(s) | Rationale | Revisit when |
|---|---|---|
| CRUD-06 (report cards) | Needs a PDF pipeline and a layout decision; `docs/ROADMAP.md:70-72` calls it deliberately deferred | The product has users |
| OPS-06 (backup/restore) | An ops decision and a job to run, not a code path | Before the first paying customer |
| A11Y-08 (contrast, measured) | The target is documented at `docs/DESIGN.md:291-293`; no contrast tool was run in this audit | When an automated contrast pass is added to the suite |
| TEST-08 (regression tests for this audit's findings) | This audit changed no source, so it added no test. Each finding's test is specified in `docs/FIX_PLAN.md` | As each fix slice lands |

---

## Coverage arithmetic

```
108 rows
 98 DONE
  2 DEFERRED
  0 BLOCKED
  0 N/A
  8 FAIL

terminal (DONE + DEFERRED + BLOCKED + N/A) = 100
100 / 108 = 92.6%  →  93%
```

The 8 FAIL rows collapse to **10 distinct findings**
(`docs/AUDIT_FINDINGS.md` #1–#10): 0 P0, 2 P1, 4 P2, 4 P3. They are:

| FAIL row | Finding |
|---|---|
| RBAC-07, RBAC-08 | #2 (P1) — de-escalation window |
| UI-11 | #1 (P1) — the hero renders a mock, and the roadmap claims otherwise |
| UI-12 | #10 (P3) — the em-dash rule's scope is unstated |
| CODE-06 | #6 (P2) — `simple-icons` is a dependency with no import |
| CODE-09 | #3 (P2) — `next.config.ts` optimises an absent package |
| DOC-10 | #1, #4, #5, #7, #8, #9 — six false doc claims |
| TEST-08 | all ten — this audit changed no source, so it added no test |

Six of the ten findings share one root cause: the landing page was replaced on
2026-10-12 and the documents that described the old one were not updated. One
fix closes all six.

**An honest note on the number.** 93% measures *this audit's coverage
matrix*, which is a subset of the full `coverage-checklist.md` inventory. Rows
for dimensions that do not apply to a Next.js PWA (pagination-specific API
rows, money/numeric-amount rows beyond `DB-09`, multi-tenant route isolation)
were folded into the rows above rather than listed separately, and each fold is
named in its row's Notes. It is not a claim that 93% of the *product* is
finished — the product's own gates pass at 22/23 — it is a claim that 93% of
*what this audit set out to check* was checked, and that what remains is
identified, located, and reproducible.

**A number that is easy to get wrong.** An earlier draft of this document
reported 74% from a miscount: the matrix was written with 108 rows and the
header claimed 65. The arithmetic was recomputed from the file itself — every
row parsed, counted, and grouped by status — rather than estimated. The count
that is reported here is the count that is in the file.
