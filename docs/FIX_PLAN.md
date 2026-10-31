# Fix Plan

**Last updated:** 2026-10-23
**Repo:** LIKO @ `b104fba` (branch `integrate/verified-session-and-runner-fixes`)

Ordered by what unblocks the most, not by severity alone. Each slice is one
coherent change with its own verification, so it can be handed to whoever picks
it up without reading this whole document.

**Scope note:** this audit changed no application source. Every slice below is
a proposal. Nothing here has been implemented, and no slice has been started.

---

## STATUS: every slice is now implemented (2026-10-26)

**The scope note above was true when it was written and is false now. It is
kept, because a plan records what was proposed, and the plan is what the
proposal was.** What follows is the current state of each slice, and it is
kept here rather than edited into the slices themselves so that a reader can
see both the proposal and what was actually done.

| Slice | Status | What closed it |
|---|---|---|
| 1 — De-escalation window (P1, #2) | **DONE** | The service-role admin paths (`createInvite`, `listInvites`) now re-prove the caller's **current** membership role against the database instead of trusting the role copied into their cookie. `verify:app` carries four de-escalation assertions, including that a demoted administrator is refused and no credential is minted, and that the administrator can read the code again once the role is restored. Mutation-proved |
| 2 — Make the documents say what the product does (P1 #1, P2 #4, #5, P3 #7, #8, #9) | **DONE** | `docs/ROADMAP.md`, `docs/DESIGN.md`, `docs/PRODUCT.md`, `docs/RBAC_MATRIX.md` and `docs/ARCHITECTURE.md` all corrected, and `docs/AUDIT_FINDINGS.md` now marks all eleven findings **CLOSED** with the resolution that closed each. The eleventh was found by this repo's own gates: a register taken with no signal was never sent, and the banner said nothing was waiting |
| 3 — Remove the dead configuration and the unused dependency (P2 #3, #6) | **DONE** | The `optimizePackageImports` block is gone from `next.config.ts` and is replaced by a comment saying why it must not come back; `simple-icons` is out of `package.json` and the lockfile with zero references left; the Phosphor trap in `docs/ARCHITECTURE.md` is in the past tense |
| 4 — State the em-dash rule's scope (P3 #10) | **DONE, AND BEYOND THE RECOMMENDATION** | The recommendation was (a) state the scope now and (b) extend the gate later, because (b) would have been an unbounded copy edit. Both were done: `docs/DESIGN.md` states the scope, and `pnpm check:copy` now walks **every** visible string in `src/` — 285 files, 19,775 strings — with the TypeScript AST rather than a regex, and fails below floors of 150 files and 2,000 literals so a scanner that stopped working cannot pass for clean. Mutation-proved twice, once with a dash inside a string literal and once inside raw JSX text |
| 5 — Fold the role-set equality assertion into the existing RBAC gate (P2) | **DONE** | `scripts/verify-rbac-routes.mjs` now compares the app's `ROLES` against the `check (role in (...))` constraints the migration declares, rather than adding a second script. `created_by_role` is deliberately excluded: it is a different column with a different meaning. Mutation-proved by adding a role to the app's list only |
| 6 — The offline queue, which this plan did not have (P1 #11) | **DONE** | Found by this repo's own gates rather than by an audit. A register taken with no signal was never sent, and the banner rendered nothing while a mark was waiting, because a queue that could not be **read** was reported as an empty queue. Three faults: the read, a page that loaded with a queued write and did not send it, and a failed send that was not retried soon. `e2e/outbox.spec.ts` holds the three claims, four mutations each turn a spec red, and the offline spec waits for the server's answer rather than for a banner to disappear |

**Three things this plan did not anticipate, all recorded because a plan that is
only read as a list of accomplishments is not a plan.** The landing page's
showcase was found to render a hand-built picture of the product while
`docs/ROADMAP.md` claimed it rendered the shipping components; the code was the
one that was wrong, and it now renders `GradebookGrid`, `AttendanceGrid`,
`AtRiskHeatmap`, `LessonPlanList` and `AssessmentCardList`. And
`scripts/verify-deck-maker-prod.mjs`, which drives the deployed site's deck
maker, had been silently broken since the day the dashboard moved from native
`<select>` to Radix; it was a check nobody ran, and it is a registered gate now.
The third is the one the gates found rather than an audit: the offline queue
promised that a mark taken with no signal would replay when the signal came
back, and it did not, and the banner that was supposed to say so said nothing
at all.

**The current live status is `PROJECT_STATUS.md`.** The gate table in this
document describes the run at `b104fba` on 2026-10-23 and is a snapshot of it.

---

## Slice 1 — Settle the de-escalation window (P1, finding #2)

**Why first.** It is the only finding with a security consequence, and it is
also the only one where the fix and its test are the same piece of work. Until
it is settled, the honest answer to "does demoting an administrator actually
revoke their access?" is *mostly, and not for seven days*.

**The question to answer.** A demoted administrator keeps the role copied into
their signed cookie (`src/lib/auth/guards.ts:51-53`), so `requirePermission`
still grants `org:manage` and `user:manage` for the remainder of the cookie's
life (`src/lib/auth/session.ts:14`, seven days). The database is unaffected —
every RLS policy reads `memberships.role`, which `setMemberRole` updates
immediately — but two paths use the service role and therefore bypass RLS:
`createInvite` (`src/lib/api/client.ts:1984`) and `listInvites`
(`src/lib/api/client.ts:1955`).

**Step 1 — measure before changing anything.** Do not fix this from reading.
Build the negative test first, and let it fail:

1. Extend `scripts/rls-settling-test.mjs` (or add a sibling script) with a
   scenario that: creates an administrator in a throwaway tenant; signs in as
   that administrator with a real token and a real session cookie; demotes
   `memberships.role` to `instructor` **without** re-signing the cookie; then
   attempts to read the organisation's invites and to create one.
2. Assert the outcome is a refusal. **Expect this to fail on the current
   code** — that failure is the evidence, and it is what makes the rest of the
   slice meaningful.
3. Record the result in `docs/RBAC_MATRIX.md` § *Verification log*.

**Step 2 — fix.** Three options, in order of preference:

- **(a) Re-read the membership on the admin paths.** `listInvites` and
  `createInvite` already resolve the caller's organisation through
  `supabaseOrgFor` (`client.ts:3511`), which reads `memberships` with
  `status = 'active'` through the caller's own session. Add the same
  `role = 'admin'` filter to the admin-only service-role reads, or assert the
  caller's membership role before the service-role call. This keeps the
  service-role usage (which the code justifies at length) and closes the gap at
  the same place the tenant is already being resolved.
- **(b) Narrow the cookie's blast radius.** Give the admin permissions a
  shorter-lived, separately-scoped credential, so a stale cookie cannot carry
  `org:manage` for seven days.
- **(c) Re-mint the session on role change.** Requires the changed account to
  make a request, which a demoted administrator need never do — so on its own
  this does not close the window. Listed for completeness, not recommended.

**Recommendation: (a).** It is the smallest change, it reuses an existing
resolution path, and it does not weaken the service-role design that the
codebase argues for at length.

**Step 3 — verify.** The new test from step 1 must now pass. Then:
`pnpm db:settle` (exit 0, expect the count to have grown by the new
assertions), `pnpm e2e`, `pnpm verify:app`.

**Regression test:** the step-1 scenario, kept permanently. It is the test that
was missing.

**Also fix while here:** the stale justification at `guards.ts:33-34` ("In
production the same effect comes from Supabase refreshing the token") is not
true for this application's cookie. Either correct the comment or make the
behaviour match it.

---

## Slice 2 — Make the documents say what the product does (P1 #1, P2 #4, #5, P3 #7, #8, #9)

**Why second.** Six findings, no code risk, and the repo's own `PROJECT_STATUS.md`
makes the case that a stale document is worse than a missing one. This slice is
documentation-only and needs no product decision except one (see below).

**The one decision needed:** the landing page's hero renders a **picture** of
the product, not the product. `WorkspaceMock.tsx:24-31` says so in the code.
`docs/ROADMAP.md:74-75` says the opposite. Both cannot stand.

Two ways to resolve it, and it is the owner's call:

- **(a) Correct the documents** to describe the mock honestly: that the landing
  page renders a static, token-accurate picture of the workspace built from
  the shared design tokens, and that the interactive product lives behind
  `/overview`. This matches the code, matches the commit that made the change
  (`435f4bd`), and matches what `check:primitives` already records about
  `WorkspaceMock`.
- **(b) Restore the real components** in the hero, as the pre-`435f4bd`
  `ModuleBento` did (`GradebookGrid`, `AtRiskHeatmap`, `AttendanceGrid` from
  `@/components/product/`). This costs the pixel-for-pixel match with the
  supplied design, which is the reason the mock was introduced.

**Recommendation: (a).** The mock is deliberate, documented in code, and
consistent with the supplied design the project was asked to follow. The
defect is the roadmap sentence, not the component.

**Then, in the same slice:**

| File | Change | Finding |
|---|---|---|
| `docs/ROADMAP.md:74-75` | Stop claiming the hero renders the shipping components | #1 |
| `docs/ROADMAP.md:37-47` | 8 sections, no scroll narratives, no marquee, no bento | #5 |
| `docs/ROADMAP.md:46` | 558 unit tests across 42 files; 257 Playwright tests across 25 files | #8 |
| `docs/ROADMAP.md:8` | Correct the type stack (same edit as DESIGN.md) | #7 |
| `docs/DESIGN.md:179-188` | Name DM Sans, Manrope and Geist Mono; note the three-import swap | #7 |
| `docs/PRODUCT.md:70-71` | Correct the landing and type claims | #9 |
| `docs/PRODUCT.md:78` | Correct the test counts | #9 |
| `docs/PRODUCT.md:82-84` | Move the five shipped modules out of "What is next" | #9 |
| `docs/RBAC_MATRIX.md` | State the admin roster narrowing in the matrix itself | #4 |

**Verification:** no gate covers prose, so this slice verifies by re-reading
each edited claim against the file it names — and by the numbers, which come
from `npx vitest run --reporter=json` and `npx playwright test --list`. Two of
the counts are already recorded in this audit's evidence table.

**Do not** bulk-edit. Each claim was checked individually and each of the six
findings names a specific line.

---

## Slice 3 — Remove the dead configuration and the unused dependency (P2 #3, #6)

**Why third.** Cosmetic to the product, but it is a stale reference to a
migration the repo already completed, and an unused dependency in
`dependencies` is a real supply-chain surface.

1. `next.config.ts:56-64` — delete the `experimental.optimizePackageImports`
   block and its comment. The project imports `lucide-react`, not
   `@phosphor-icons/react`; the package is not installed. An optimisation for
   an absent package is dead configuration that reads as live.
2. `package.json:71` — remove `"simple-icons": "^16.34.0"`. It is imported
   nowhere in `src/`, `e2e/` or `scripts/`. (If the roadmap's "trust marquee"
   is ever rebuilt, it can come back then, with a stated reason.)
3. `docs/ARCHITECTURE.md:484-497` — the Phosphor trap is described in the
   present tense but documented as resolved in `PROJECT_STATUS.md:173`. Change
   the tense so a future reader knows the rule is gone.

**Verification:** `pnpm build` (exit 0), `pnpm lint` (exit 0), `pnpm typecheck`
(exit 0), then a full `node scripts/run-gates.mjs` to confirm all 23 gates
still hold. Also re-run the import scan to confirm `simple-icons` has zero
references before removing it from the manifest.

---

## Slice 4 — State the em-dash rule's scope (P3 #10)

Small, cheap, and it closes a gap where a real rule has an unstated boundary.

The rule is real and enforced — `e2e/landing.spec.ts:344-362` walks the DOM
text nodes of `/` and asserts the list is empty. But nothing enforces it on
dashboard pages, and `docs/DESIGN.md` does not say so. `Hero.tsx:20-22`
correctly says "this page".

Two ways:

- **(a) State the scope.** One sentence in `docs/DESIGN.md` saying the rule
  binds marketing copy and that the dashboard is not yet covered. Honest,
  cheap.
- **(b) Extend the gate.** Apply the same DOM walk to the dashboard routes and
  fix what it finds. Better, and it will find things — the dashboard's
  user-facing copy has not been under this rule.

**Recommendation: (a) now, (b) as a follow-up slice.** Do not run (b) inside
this slice: it will turn a one-line documentation fix into an unbounded copy
edit, and the copy decisions are not the auditor's to make.

---

## Slice 5 — Decide whether the audit's own harnesses become repo gates (P2)

The audit ran two harnesses outside the repository so that no application file
was touched:

- `probe-rbac-matrix.mjs` — the DB role constraint vs the app matrix; every
  declared permission has a server-side guard; every route rule gates a real
  route.
- `probe-rls-policies.mjs` — extracts every RLS policy, including the twelve
  generated by the `DO` loop, and reports the effective per-table reach.

They are negative-controlled (see `docs/FINISH_STATUS.md` § *Instrument
validation*), and they duplicate some of what `pnpm verify:rbac-routes` already
covers. The unique value they add is the **role-set equality check** — nothing
in the repo currently asserts that the app's `ROLES` array still equals the
database's `check` constraint, and a drift there would be silent.

**Recommendation:** fold the role-set equality assertion into the existing
`scripts/verify-rbac-routes.mjs` rather than adding a second script, so the
repo keeps one RBAC gate. `probe-rls-policies.mjs` is more useful as a
one-off audit instrument than as a permanent gate, because it reports the
policy map rather than asserting anything.

---

## What is deliberately not in this plan

- **No session revocation or token version.** `docs/SECURITY.md:231` names it
  as a known gap with the right fix. It is a larger change than finding #2
  needs, and slice 1 closes the specific exposure without it.
- **No CSP.** Named in `docs/SECURITY.md:234`. It needs the real asset set and
  a nonce strategy; it is not an audit finding.
- **No argon2id.** `docs/SECURITY.md:235`. `password.ts` is the only file that
  would change, and it is not a finding.
- **No change to any RLS policy.** The audit found the policies correct and
  deliberately narrow. Finding #4 is a **documentation** fix, not a policy
  change; widening `students` to admit administrators would contradict a
  decision the codebase argues for at length.
- **Nothing that needs a credential, a decision, or a professional signature.**
  Three things remain outside anyone's reach but a machine's: an SMTP
  provider (registration is unverified against the live database because
  Supabase rejects the `.test` probe address), a lawyer's review of the three
  policy pages, and rotation of the service key and the database password.

---

## Sequencing

| # | Slice | Findings | Needs | Risk |
|---|---|---|---|---|
| 1 | De-escalation window | #2 (P1) | a decision on the fix shape | medium — touches an admin path |
| 2 | Documents | #1 (P1), #4, #5, #7, #8, #9 | a decision on (a) vs (b) in slice 2 | none — prose only |
| 3 | Dead config | #3, #6 (P2) | nothing | low — manifest and config |
| 4 | Em-dash scope | #10 (P3) | nothing | none |
| 5 | Fold the harness in | — | nothing | low |

Slices 1 and 2 are independent and can run in parallel by different people.
Slices 3, 4 and 5 touch no product behaviour and can be batched into one
pull request. **Every slice must end by re-running the full gate suite** —
`node scripts/run-gates.mjs` — and recording the exit codes, because a slice
that changes one file can break a gate three files away, and the recorder's
own `tree` object is what tells a later reader whether the run described the
code that was tested.
