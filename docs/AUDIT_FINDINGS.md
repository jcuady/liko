# Audit Findings

**Last updated:** 2026-10-26 (every finding closed; the text below is the 2026-10-23
record, kept as written, with a resolution line added to each finding)
**Repo:** LIKO @ `b104fba` (branch `integrate/verified-session-and-runner-fixes`)
**Auditor scope:** read-only. No application source, config, migration, or test file
was modified by this audit. The four files under `docs/` are the only writes.

**All ten findings are closed.** The findings are recorded as the audit found
them on 2026-10-23; the resolution under each one says what closed it and how
that was proved. One of them changed the code rather than the document, which
is what the project had decided for it: the roadmap is the specification of
what the product is supposed to be, so when the code and the roadmap disagreed,
the code was wrong.

**Severity key:** P0 = data loss, auth bypass, money error, or a primary workflow
impossible · P1 = a real feature broken or unreachable for a real class of user ·
P2 = degraded but usable, or inconsistent with the design system · P3 = polish, copy,
minor a11y.

**Counts: 0 P0 · 2 P1 · 4 P2 · 4 P3. All ten closed as of 2026-10-26.**

---

## P0 — Critical

None. Every auth bypass I could construct was refused, and the refusal was proved
by execution rather than by reading a policy.

---

## P1 — High

### #1 The landing page no longer renders the shipping components, and the roadmap still says it does

- **Severity:** P1
- **Location:** `src/app/(marketing)/components/landing/WorkspaceMock.tsx:1-15` ·
  `docs/ROADMAP.md:74-75` · `docs/ROADMAP.md:39-42`
- **Category:** DOC / UI
- **Observed:** `docs/ROADMAP.md:74-75` claims:

  > Each module appears in the landing page hero and bento, because those render the
  > shipping components rather than pictures of them.

  The hero renders `WorkspaceMock`, whose only imports are `next/image`,
  `lucide-react`, `cn` and a local `sample-class` fixture. It imports **no**
  component from `src/components/product/` and **no** component from
  `src/components/ui/`. The same is true of every landing component: the six
  that import anything import only `@/components/ui/button` and
  `@/components/ui/accordion`. There is no bento grid and no marquee; the
  landing page's sections are `Hero`, `TeacherLevels`, `FeaturesShowcase`,
  `TeacherStory`, `MobileBand`, `LandingPricing`, `Faq`, `BottomCta`
  (`src/app/(marketing)/page.tsx:95-102`).

  This was true of the *previous* landing page and stopped being true on
  2026-10-12. Commit `435f4bd` ("Replace the landing page with the supplied
  design, stylesheet and all") deleted `ModuleBento.tsx`, which did import the
  real `GradebookGrid`, `AtRiskHeatmap` and `AttendanceGrid` from
  `@/components/product/` — visible in `git show 681d6ee^:src/app/(marketing)/components/ModuleBento.tsx`.

  `WorkspaceMock.tsx:24-31` is candid about it: *"IT IS A PICTURE OF THE
  PRODUCT, NOT THE PRODUCT."* That is a defensible engineering decision. What
  is not defensible is that `ROADMAP.md` still tells a reader the opposite,
  because the roadmap is the document that states what the product is supposed
  to be, and this is the sentence a reviewer would use to check it.

- **Expected:** either the roadmap sentence is corrected to describe the mock
  honestly, or the hero renders the real components again.
- **Repro:**
  1. `git show 681d6ee^:src/app/(marketing)/components/ModuleBento.tsx` → imports `@/components/product/GradebookGrid`, `AtRiskHeatmap`, `AttendanceGrid`.
  2. `Select-String -Path 'src/app/(marketing)/components/landing/*.tsx' -Pattern "@/components/product"` → no match.
  3. Read `docs/ROADMAP.md:74-75` → claims the opposite.
- **Evidence:** `git show` output above; import scan of all ten files in
  `src/app/(marketing)/components/landing/` (only `button` and `accordion`
  referenced); `src/app/(marketing)/page.tsx:95-102`.
- **Instrument validated:** the import scan is the same check
  `pnpm check:primitives` uses to find raw controls
  (`scripts/check-primitives.mjs`), and that gate returned exit 0 — it confirms
  the finding is not a primitives-check artifact. `WorkspaceMock.tsx` is on that
  gate's explicit allow list (`scripts/check-primitives.mjs:58-62`), with the
  reason "the landing page mocks the product" — the gate's own words.
- **Status:** CLOSED — the code was changed, not the sentence. The workspace mock
  now renders the product's own components: `GradebookGrid`, `AttendanceGrid`,
  `AtRiskHeatmap`, `LessonPlanList` and `AssessmentCardList`, all driven by one
  sample class in `sample-class.ts`. `LessonPlanList` and `AssessmentCardList`
  were extracted out of the planner and assessment routes, so the landing page
  and the dashboard now render the same file. `docs/ROADMAP.md:74-75` is true as
  written, with "bento" replaced by "showcase" because the page has a tabbed
  showcase and no bento grid. The mock's exemption from `check:primitives` went
  with it, and that gate now refuses a hand-built table on the landing page:
  proven by mutation, a raw `<table>` put back into `WorkspaceMock.tsx` makes
  the gate exit 1.

### #2 A demoted administrator keeps app-layer permissions until their session expires, and no test covers it

- **Severity:** P1
- **Location:** `src/lib/auth/guards.ts:51-53` · `src/lib/auth/session.ts:14` ·
  `src/lib/api/client.ts:1861-1928`
- **Category:** RBAC
- **Observed:** the session cookie carries a copy of the role taken when it was
  signed. `getSession()` in `supabase` mode returns that copy without re-reading
  the account:

  ```ts
  if (isSupabaseMode()) {
    return isRealSupabaseUserId(session.userId) ? session : null;
  }
  ```

  The cookie's lifetime is `60 * 60 * 24 * 7` — seven days. The code says so
  plainly at `guards.ts:26-29`: *"The role in the cookie is a copy taken when it
  was signed… a change that only takes effect at their next sign-in is not a
  change."* The comment then justifies it: in production the same effect comes
  from Supabase refreshing the token.

  **It does not.** Supabase refreshing its own access token does not re-mint
  this application's `liko_session` cookie, because that cookie is signed by
  `LIKO_SESSION_SECRET` and carries its own `role` claim
  (`src/lib/auth/session.ts:143-155`). Nothing in the codebase re-signs the
  cookie on a role change; `setMemberRole` writes `memberships.role` and
  `profiles.role` and returns.

  The **database** layer is not affected. Every RLS policy tests
  `memberships.role`, so the moment the membership row changes, the database
  stops treating the demoted administrator as an administrator. The exposure is
  confined to the application layer: `requirePermission()` reads
  `session.role`, so `user:manage` and `org:manage` still pass for the
  remainder of the cookie's life.

  What that reaches is not nothing. `setMemberRole` and `setMemberStatus` both
  call `requireClient()` — the caller's own Supabase session — so their writes
  are still RLS-bound and will be refused by the database. But
  `createInvite` and `listInvites` (`src/lib/api/client.ts:1984` and `:1955`)
  deliberately use the **service role**, and the service role ignores RLS. The
  only thing standing between a demoted administrator and the creation of a new
  organisation credential is the app-layer permission check reading a stale
  cookie.

  **This is not a verified exploit.** I did not execute a demotion against the
  live database, so the end-to-end consequence is reasoned from the code, not
  measured. What *is* measured is the mechanism: `db:settle` proves the
  database refuses a demoted seat's writes, and the fixture-mode refresh at
  `guards.ts:55-58` proves the app layer *does* refresh the role — but that
  branch is `fixtures`-only, and `supabase` mode never reaches it.
- **Expected:** a role change revokes the old rights on the next request, or the
  exposure window is bounded and documented.
- **Repro:**
  1. Sign in as an administrator; note the session cookie's `role` claim.
  2. Demote that account's `memberships.role` from `admin` to `instructor` (`setMemberRole` does this).
  3. Call `listInvitesAction` or `createInviteAction` with the same cookie.
  4. Expected: refused. Actual (reasoned, not executed): `requirePermission('org:manage')` still passes on the stale cookie, and the service-role read/write is not RLS-bound.
- **Evidence:** `guards.ts:51-53`, `session.ts:14`, `session.ts:143-155`,
  `client.ts:1984` (service role for invite insert), `client.ts:1955` (service
  role for invite list). `pnpm db:settle` → exit 0, 29 passed, 0 failed,
  establishes the database half.
- **Instrument validated:** no instrument was needed for the mechanism — it is
  read directly from three files whose line numbers are cited. The *consequence*
  is explicitly marked unverified rather than asserted, which is the point.
- **Status:** CLOSED for the two paths that mattered, and now measured rather
  than reasoned. `listInvites` and `createInvite` resolve the caller's CURRENT
  membership role from the database through a new `supabaseAdminOrgFor`
  (`src/lib/api/client.ts:3594`) and refuse anyone who is not an administrator
  of that school. `pnpm verify:app` carries a de-escalation scenario: it signs
  an administrator in, demotes them without re-signing, and asserts that the
  credential disappears from the screen, that the refusal is shown, and that no
  invitation row is minted. With the fix reverted the same run reports
  `the credential was still shown: true` and `invitation rows 1 before, 2
  after`, so the check is reading the thing it claims to read. What is left is
  stated rather than fixed: every other permission still reads the cookie, so
  for the page layer the window is still seven days.

### #11 A register taken with no signal was never sent, and the banner said there was nothing waiting

- **Severity:** P1
- **Location:** `src/lib/outbox/index.ts` ·
  `src/app/(dashboard)/components/OfflineBanner.tsx` · `e2e/offline-attendance.spec.ts`
- **Category:** DATA / UI
- **Observed:** the offline-attendance spec failed in the full gate run of
  2026-10-26 with the register reading `not set` after a replay that had been
  reported as done. The Playwright trace of that run is the evidence, and it
  shows three separate faults stacked on top of each other.

  **First, the queue could be read as empty when it could not be read at all.**
  `pendingSummary()` caught every error and returned `{ count: 0 }`, and the
  banner renders nothing when the count is zero. The trace shows the banner
  counting `1`, then `0`, then `1` again across a reload, with the queued row
  never deleted. A count that goes 1 to 0 to 1 with the row still in IndexedDB
  is a read that failed and was reported as an empty queue.

  **Second, a page that loaded with a queued write did not send it.** The only
  things that started a flush were an `online` event and a thirty second poll.
  The trace shows the page reloading itself as the service worker claimed it,
  one millisecond after the reconnect, so the `online` event had already been
  and gone by the time the new page was asking about the queue.

  **Third, a send that failed was not tried again soon.** The trace shows the
  first attempt after the signal returned failing with `net::ERR_FAILED`, which
  is what the first request does while the network is still settling, and the
  next attempt was the thirty second poll away.

  The banner's own comment says the opposite of what it did: *"a banner that
  says '0 changes queued' while a change is queued is worse than no banner,
  because it tells the teacher their tap did not register."* That is exactly
  what a failed read produced.

- **Expected:** a queue that cannot be read says so, a page that loads with
  something to send sends it, and a send that failed is tried again while the
  teacher is still looking at the register.
- **Repro:**
  1. `npx playwright test e2e/offline-attendance.spec.ts` against a build with
     the reconnect happening immediately after the tap: the replay never
     reaches the server.
  2. Read `src/lib/outbox/index.ts`: `pendingSummary()`'s catch returns
     `{ count: 0 }`, and `startAutoFlush()` had no flush on load and no ladder.
  3. The trace of the failing run: `test-results/run-2026-10-26T18-59-12-668Z/…/trace.zip`.
- **Evidence:** the trace's network log, which shows every `POST /api/attendance`
  answered `net::ERR_FAILED` and no later attempt; the trace's frame snapshots,
  which show the banner count going 1, 0, 1; the source, cited above.
- **Instrument validated:** four mutations, each breaking one repair and each
  turning a spec red. Reporting a failed read as a readable empty queue turns
  the honesty spec red. Removing the flush on load turns the reload spec red.
  Removing the wake-up turns the retry spec red. Removing the ladder turns the
  retry spec red as well, which is what separates the two.
- **Status:** CLOSED. `pendingSummary()` now returns a reading that says
  whether the queue could be read at all, the banner keeps the count it last
  saw when a read fails and says in words that it cannot check the queue, the
  last reading is kept in the outbox module so a banner that remounts cannot
  claim nothing is waiting, a failed open no longer poisons the queue for the
  life of the page, the flush loop runs once on load and wakes itself when a
  write is left unsent, and a failed send is retried on a ladder that starts at
  two seconds. `e2e/outbox.spec.ts` holds the three claims, and the
  offline-attendance spec now waits for the server's answer rather than for a
  banner to disappear.

---

## P2 — Medium

### #3 `next.config.ts` optimises a package the project does not depend on

- **Severity:** P2
- **Location:** `next.config.ts:56-64`
- **Category:** CODE / DOC
- **Observed:** the `experimental.optimizePackageImports` block names
  `@phosphor-icons/react`, and its comment describes the Phosphor barrel-entry
  problem as current. The project uses `lucide-react` — 54 references across
  `src/`, and the only occurrence of the word "phosphor" anywhere in `src/` is
  a comment at `src/app/(dashboard)/components/Navigation.tsx:184`. The package
  is **not** in `package.json` and **not** installed (`node_modules/@phosphor-icons`
  does not exist).

  The optimisation is therefore inert. It is also the last trace of a migration
  the repo has otherwise completed: `docs/ARCHITECTURE.md:484-497` documents
  the Phosphor trap in the present tense ("This used to be a trap… The
  workaround was…") and `PROJECT_STATUS.md:173` records that the switch to
  lucide removed the split. The config file was not updated with the rest.
- **Expected:** the config names packages the project actually imports, or the
  stale entry and its comment are removed.
- **Repro:** `Select-String -Path next.config.ts -Pattern 'phosphor'` → line 64.
  `Test-Path node_modules/@phosphor-icons` → `False`.
  `Select-String -Path package.json -Pattern 'phosphor'` → no match.
- **Evidence:** the three commands above, run 2026-10-23.
- **Instrument validated:** `pnpm build` and `pnpm lint` both exited 0 with this
  entry in place, which is exactly why it is P2 and not P1 — it is dead
  configuration, not a broken build.
- **Status:** CLOSED. The `experimental.optimizePackageImports` block is removed
  from `next.config.ts` and replaced with a note recording that
  `lucide-react` is already in Next's default optimised list, checked against
  the installed `next` package rather than from memory.

### #4 The app matrix grants `admin` a read the database will not honour

- **Severity:** P2
- **Location:** `src/lib/auth/rbac.ts:88-104` (`admin` row) ·
  `supabase/migrations/20260101000000_initial_schema.sql:1713-1715` ·
  `scripts/rls-settling-test.mjs:927-940`
- **Category:** RBAC / DOC
- **Observed:** the matrix grants `admin` `'class:read': 'yes'` and
  `'grade:read': 'yes'`. The `students` RLS policy admits the class owner and
  the linked family, and no administrator policy exists on that table. The
  settling test asserts this by execution:

  ```
  PASS  an administrator CAN read the classes of its own organisation
  PASS  an administrator CAN read the members of its own organisation
  PASS  an administrator CANNOT read a child record
  ```

  The product handles it correctly — `verify:app` asserts the page renders
  "Roster not visible to you" rather than inventing a number — so no user sees
  a wrong screen. But the matrix is the document other engineers read to decide
  what to build, and it currently promises an administrator a gradebook and a
  roster it cannot have. The narrowing was a deliberate decision
  (`initial_schema.sql:1709-1711`: "a tenancy check built on it would match
  nothing and silently hand admins an empty list rather than a scoped one"), so
  the fix is to the matrix's description, not to the policy.
- **Expected:** the matrix states the effective grant, or distinguishes "the
  application will let you open this screen" from "the database will return
  rows".
- **Repro:** `pnpm db:settle` → the three assertions above. Read
  `rbac.ts:88-104` for the contradicting grant.
- **Evidence:** `pnpm db:settle` → exit 0, 29 passed, 0 failed; the admin
  section of `scripts/rls-settling-test.mjs`.
- **Instrument validated:** the settling test's own negative control is in the
  file: a guardian linked through `account_id` read exactly one row from the
  same table by the same code in the same run, which is what makes "the
  administrator read no rows" a statement about the policy rather than about an
  empty table (`rls-settling-test.mjs:907-921`).
- **Status:** CLOSED. `docs/RBAC_MATRIX.md` now says, directly under the matrix
  table, that two of the `admin` cells are the application layer rather than
  the database, and names them. The policy is unchanged, because the narrowing
  was deliberate.

### #5 The roadmap's marketing section describes a landing page that no longer exists

- **Severity:** P2
- **Location:** `docs/ROADMAP.md:37-47`
- **Category:** DOC
- **Observed:** three claims, all now false:

  | ROADMAP claim | Actual |
  |---|---|
  | "Ten-section landing page" | 8 sections (`page.tsx:95-102`) |
  | "two scroll narratives (sticky Flow stack, horizontal Roles pan) on the one Motion runtime" | no scroll-narrative set pieces; `FlowStickyStack.tsx` and `FlowStageCard.tsx` were deleted in `435f4bd`; `landing.css` contains no `marquee`, `scroll-snap` or `sticky` rules for them. `motion/react` is used only by `src/components/marketing/Reveal.tsx` |
  | "Trust marquee using real Simple Icons glyphs" | no marquee; `simple-icons` is declared in `package.json:71` but **imported nowhere** in `src/`, `e2e/` or `scripts/` |

  The design brief that seeded this section (`docs/DESIGN.md:9-10`, "two
  scroll-narrative set pieces"; `DESIGN.md:14-17`, "high enough to forbid a
  centred hero and to require distinct layout families") describes the
  *earlier* design, and the supplied design that replaced it is a different
  page.
- **Expected:** the roadmap describes the page that ships.
- **Repro:** read `docs/ROADMAP.md:37-47`; read `src/app/(marketing)/page.tsx:95-102`;
  `Select-String -Path 'src/app/(marketing)/landing.css' -Pattern 'marquee|scroll-snap'` → no match;
  `Get-ChildItem src -Recurse -File | Select-String -Pattern 'simple-icons' -SimpleMatch` → no match.
- **Evidence:** the four commands above, run 2026-10-23.
- **Instrument validated:** `pnpm check:behaviour` (exit 0) asserts the
  behaviour of the page that exists, including that reduced motion leaves 0
  reveals hidden — it exercises the current page, not the one the roadmap
  describes, which is why it could not have caught this.
- **Status:** CLOSED. The marketing section describes the eight sections that
  ship, and the tabbed product showcase is named for what it is.

### #6 `simple-icons` is a declared dependency with no import anywhere

- **Severity:** P2
- **Location:** `package.json:71`
- **Category:** CODE
- **Observed:** `"simple-icons": "^16.34.0"` is in `dependencies`. A search of
  `src/`, `e2e/` and `scripts/` for the string `simple-icons` returns no match.
  The package is installed and never used, and the roadmap still claims the
  landing page renders "real Simple Icons glyphs" (see #5).
- **Expected:** an unused dependency is removed, or the feature that needs it
  is built.
- **Repro:** `Select-String -Path package.json -Pattern 'simple-icons'` → line 71.
  `Get-ChildItem src,e2e,scripts -Recurse -File | Select-String -Pattern 'simple-icons' -SimpleMatch` → no match.
- **Evidence:** the two commands above, run 2026-10-23.
- **Instrument validated:** `pnpm lint` exit 0 and `pnpm typecheck` exit 0 do
  not flag an unused dependency, which is why the finding needs the import scan
  above rather than a gate.
- **Status:** CLOSED. `simple-icons` is removed from `package.json` and from the
  lockfile.

---

## P3 — Low

### #7 `docs/DESIGN.md` documents a type stack the product does not use

- **Severity:** P3
- **Location:** `docs/DESIGN.md:179-188`
- **Category:** DOC
- **Observed:** DESIGN.md states: *"**Geist** and **Geist Mono**, self-hosted
  through `next/font`… exposed as `--font-sans` and `--font-mono`"* and explains
  that Söhne cannot be fetched so Geist was chosen as the substitute.

  The product ships **DM Sans** (interface), **Manrope** (display) and **Geist
  Mono** (tabular figures only). `src/app/layout.tsx:2` imports
  `{ DM_Sans, Geist_Mono, Manrope }`; `src/app/globals.css:58-67` maps
  `--font-sans` to `--font-dm-sans` and `--font-display` to `--font-manrope`.
  Geist Mono is deliberately not preloaded, because one rule reads it
  (`layout.tsx:39-45`).

  The rationale is still sound — the token indirection means swapping fonts is
  a two-import edit, exactly as DESIGN.md says — but the names are wrong, and
  DESIGN.md's own advice ("editing two imports in `src/app/layout.tsx`") is now
  three.
- **Expected:** the typography section names the fonts that ship.
- **Repro:** read `docs/DESIGN.md:179-188`; read `src/app/layout.tsx:2` and
  `src/app/globals.css:58-67`.
- **Evidence:** the two reads above, run 2026-10-23.
- **Instrument validated:** `pnpm check:primitives` and `pnpm lint` do not read
  prose, so this needs the file read; the finding is a direct quote against a
  direct quote.
- **Status:** CLOSED. The typography section now names DM Sans, Manrope and Geist
  Mono, and says three imports rather than two.

### #8 `docs/ROADMAP.md` and `docs/PRODUCT.md` quote stale test counts

- **Severity:** P3
- **Location:** `docs/ROADMAP.md:46` · `docs/PRODUCT.md:78`
- **Category:** DOC
- **Observed:**

  | Claim | Measured |
  |---|---|
  | ROADMAP.md:46 — "469 unit tests across 33 files" | **558 tests across 42 files** (548 passed, 10 skipped) |
  | ROADMAP.md:46 — "156 Playwright tests across 12 specs" | **257 tests across 25 files** |
  | PRODUCT.md:78 — "44 unit tests and three Playwright suites" | **558 tests across 42 files; 257 tests across 25 files** |

  Measured with `npx vitest run --reporter=json` (`numTotalTests: 558`,
  `numTotalTestSuites: 42`, `numPassedTests: 548`, `numPendingTests: 10`) and
  `npx playwright test --list` (`Total: 257 tests in 25 files`).
- **Expected:** the counts quoted are the counts that exist.
- **Repro:** the two commands above.
- **Evidence:** both commands, run 2026-10-23. The `unit` gate independently
  reported `Test Files 42 passed (42)` / `Tests 548 passed | 10 skipped (558)`,
  and the `e2e` gate reported `256 passed (6.8m)`.
- **Instrument validated:** the vitest JSON reporter and the playwright list
  reporter are the tools that produced the numbers, so there is no transcription
  step between the measurement and the table above.
- **Status:** CLOSED. Both counts were re-measured and rewritten: 569 unit tests
  across 43 files, and 259 Playwright tests across 25 specs.

### #9 `docs/PRODUCT.md` describes a product that is materially different from the one that ships

- **Severity:** P3
- **Location:** `docs/PRODUCT.md:68-84`
- **Category:** DOC
- **Observed:** the "What is built now" list is stale in five places, and the
  "What is next" list describes work that is already done.

  | PRODUCT.md claim | Actual |
  |---|---|
  | ":70 Production landing page with ten sections and two scroll narratives" | 8 sections, no scroll narratives (same defect as #5) |
  | ":71 Complete design system: Viridian token set, Geist type, motion scale" | DM Sans + Manrope + Geist Mono (same defect as #7) |
  | ":78 44 unit tests and three Playwright suites" | 558 tests across 42 files; 257 tests across 25 files (same defect as #8) |
  | ":82-84 'What is next: The six MVP modules, in this order: roster and attendance, lesson planner, assessment builder, gradebook, at-risk heatmap, report-card export'" | five of the six are shipped and live; `docs/ROADMAP.md:53-75` documents all six as delivered, with report cards deliberately deferred |
  | ":73 Authentication: register, sign in, reset password, email verification" | accurate, but `docs/SECURITY.md:25-36` explains that Supabase Auth owns reset delivery and the homegrown scheme was removed — the two documents are not in conflict, they are at different levels of detail, and PRODUCT.md simply does not say which is true |

  The last row is **not** a defect in either document. `SECURITY.md` is correct
  and precise; I initially misread it as a contradiction and it is not one.
  It is listed here only because PRODUCT.md claims a feature without saying
  who owns it, and a reader comparing the two files should not have to work
  that out.

  The "What is next" row is the substantive one: a document that states the
  product's plan should not present shipped modules as pending.
- **Expected:** PRODUCT.md's "built now" and "what is next" reflect the product
  as built.
- **Repro:** read `docs/PRODUCT.md:68-84`; read `docs/ROADMAP.md:53-75` for the
  six modules as delivered; the counts come from the vitest JSON reporter and
  `playwright test --list` as recorded in #8.
- **Evidence:** the file reads and the two measurement commands, 2026-10-23.
- **Instrument validated:** `pnpm verify:app` (exit 0, 79 passed) exercises the
  live authentication paths and reported no failure against any of the features
  PRODUCT.md lists, so these are documentation defects rather than broken
  flows.
- **Status:** CLOSED. "What is built now" and "What is next" describe the product
  as built, and report-card export is named as the one deferred module.

### #10 The em-dash rule is enforced on the landing page only

- **Severity:** P3
- **Location:** `e2e/landing.spec.ts:344-362` · `src/app/(marketing)/components/landing/Hero.tsx:20-22`
- **Category:** DOC / CODE
- **Observed:** the house rule "no em dashes" is real and enforced, but the
  enforcement is scoped: the test walks the text nodes of `/` only. The hero's
  comment says "This page has a gate that fails the build on em dashes in
  visible copy" — which is true of *this page*. Nothing enforces the rule on
  dashboard pages, and `docs/DESIGN.md` does not state the scope.
- **Expected:** the rule's scope is stated, or the gate covers what the rule
  claims to cover.
- **Repro:** read `e2e/landing.spec.ts:344-362` (the only em-dash assertion);
  grep the suite for another.
- **Evidence:** file read, 2026-10-23.
- **Instrument validated:** the e2e gate passed with the assertion present, and
  the assertion is a real DOM walk rather than a source grep — it collects text
  nodes and asserts the array is empty.
- **Status:** CLOSED, by covering what the rule claims to cover. A new gate,
  `check:copy`, reads the parsed source and fails on an em dash or an en dash
  in any string literal, template literal or run of JSX text under `src/`. It
  scans 281 files and 19,687 visible strings and prints the counts, so a
  scanner that had stopped working cannot be mistaken for a clean tree. It was
  mutation-proved twice: an em dash inside a string literal and an em dash
  inside raw JSX text each turn it red. `docs/DESIGN.md` now states the scope
  and what enforces each ban.

---

## Verified-good, recorded so it is not re-litigated

These are claims I checked and found **true**. They are listed because a defect
log that only lists failures gives no picture of what was examined.

| Claim | Verified |
|---|---|
| The role set is four roles, and the app agrees with the DB constraint | `probe-rbac-matrix.mjs`, equality in both directions |
| Every one of the 16 declared permissions has a server-side guard | `probe-rbac-matrix.mjs`: 15 by a server action, `analytics:read` by the page layer |
| Every route-permission rule gates a real route | `probe-rbac-routes` exit 0, 0 dead rules; independently re-checked |
| A student cannot promote itself to admin | `pnpm db:settle`, live PostgREST with the student's own JWT |
| No account can read another school's data | `pnpm db:settle` cross-tenant exploit |
| A guardian reaches its linked child and no other | `pnpm db:settle`, exact id-set comparison in both directions |
| A guardian cannot write into any child's record | `pnpm db:settle` |
| An administrator cannot read a child record | `pnpm db:settle` |
| `UPDATE` on `quiz_attempts` is revoked from `authenticated` and re-granted on the `responses` column only | `initial_schema.sql:1646-1648`, verified as written |
| `profiles.role` cannot be self-escalated; the grant excludes `role` | `initial_schema.sql:1686-1689` |
| The service-role write in `setMemberRole` resolves its target from the caller's own organisation, never from the request | `client.ts:1886-1893` |
| The session secret is measured after base64 decode and refused under 32 bytes in production | `session.ts:56`, `session.test.ts` |
| Passwords use scrypt N=16384 r=8 p=1 with a per-password salt, constant-time verify | `password.ts:37-43` |
| `--webpack` is on both `dev` and `build`; no Turbopack reference exists in any executable file | `package.json:7-8`; the only occurrences of the word in the repo are prose in `docs/ARCHITECTURE.md:22-24` and `docs/ROADMAP.md:131-132`, which correctly explain why the flag is there |
| The service worker is emitted by the build and registers to `activated` | `public/sw.js` (49,370 bytes, regenerated 21:51 by the gate run); `e2e/pwa.spec.ts` passed in the e2e gate |
| The manifest is served, installable, and its icons resolve | `e2e/pwa.spec.ts`, in the e2e gate |
| The landing page's colours are all tokens; no hardcoded hex | `landing.css` has zero hex literals; every `var(--…)` it uses is defined in `globals.css` |
| The landing page's typography classes exist | `globals.css:377-433` defines all seven DESIGN.md names |
| The account-level role follows the membership on a role change | `client.ts:1880-1928` writes both columns |

---

## Method notes

**Instruments.** Two audit harnesses were written and run **outside** the target
repository, so that no application file was touched:

- `probe-rbac-matrix.mjs` — compares the DB role constraint to the app matrix;
  checks every declared permission has a server-side guard; checks every route
  rule gates a real route.
- `probe-rls-policies.mjs` — extracts every RLS policy and the generated
  `own rows` block, and reports the effective per-table reach.

Both were **negative-controlled** before their findings were reported. See
`docs/FINISH_STATUS.md` § *Instrument validation* for the exact control runs.

**What I did not do.** I did not execute a role demotion against the live
database, so finding #2's end-to-end consequence was reasoned from the code and
marked unverified. That gap was closed on 2026-10-26: `pnpm verify:app` now
demotes a signed-in administrator against the live database and asserts the
consequence, with the fix reverted as its negative control. I did not attempt a cross-tenant exploit outside the
throwaway tenant `db:settle` creates. I did not modify application source,
migrations, configuration, or tests.

**Concurrent activity.** Another process was writing to this repository during
the audit. Between 21:31 and 22:40 on 2026-10-23 it modified
`src/app/(dashboard)/attendance/AttendanceGridClient.tsx`,
`src/app/(dashboard)/flashcards/[deckId]/page.tsx`,
`src/app/(dashboard)/flashcards/actions.ts`,
`src/app/(dashboard)/flashcards/page.tsx`, `src/lib/outbox/index.ts`, and added
`scripts/verify-role-guards.mjs`, `e2e/offline-attendance.spec.ts` and
`b.txt`. None of the files I cite in these findings are among them, so no
finding here depends on a moving file. The gate run is labelled
`tree.exact: false` for the same reason.
