# Project Status

Last Updated: 2026-10-26
Current Branch: `integrate/verified-session-and-runner-fixes`
Overall Status: **IMPLEMENTED, GATE-GREEN ON EVERYTHING THIS TEAM CONTROLS, WITH THREE THINGS ONLY THE OWNER CAN DO.** Measured 2026-10-26 at `f341d9f`, the most recent full run: **25 registered gates, 25 pass, 0 blocked, 0 fail, 0 error**, with `tree.exact: true`, `material: []`, and the build served `PurgjAcao4hxU74Cz9R7n` unchanged at both ends of the run (`build.changed: false`, `contaminated: false`). e2e is **259 passed / 0 failed** in 4.9 min, measured on that clean tree, and `probe:ai` answered the provider rather than refusing it.

- **A blocked gate is a third answer, and it is not "nearly green".** It happened again during this round: the run at `7c7bd62` is **25 pass / 1 blocked / 0 fail** — the block was `probe:ai`, refused with `HTTP 503 — This model is currently experiencing high demand`. The recorder recorded that as `blocked`: never a pass, never a failure, because the gate measured nothing about the product. Being listed is not the same as being able to answer. Its previous real pass was kept beside it rather than overwritten, so a provider outage can neither manufacture a red suite nor hide a genuine one, and the retry 75 seconds later was a pass in 82.2s. **A run with one blocked gate is a legitimate record and a reason to re-run, not a failing suite and not a green one** — and the two must never be confused, because the difference is the whole point of having a third answer.
- **The recorder was itself broken for the eighty-two minutes between two commits, and nothing in this project could report it.** `dc58b3b` read `E2E_PORT` at the top of the gate registry while declaring it near the bottom, so the module threw while evaluating and the recorder could not start at all. Every gate here runs through that one script, so there was no remaining witness. It is now hoisted above the array that consumes it, and `node scripts/run-gates.mjs --list` evaluates the whole module in **84ms** and runs no gate, so the tool can report on itself; the section below records the mutation that proves the probe can fail.
- **`verify:controls` reports one `inert` control and it is correct.** `settings/appearance/ThemeToggle.tsx` is `disabled` exactly when consent is `essential` — the theme is the only thing in the app that writes optional browser storage, so a declined banner withdraws it, and the control says so in its `title` rather than pretending to work. A gate that reported this as a defect would be crying wolf, so it is a named category rather than a failure.
- **The run before that had a red e2e, and it was not a product defect**: **9 failed, 14 did not run, 218 passed**, scattered across six unrelated features with no diff to any of them, while a second Playwright suite ran concurrently in this working directory and the two adopted each other's server on 3311. The recorder's e2e gate now runs on its own port, **3319**, so it cannot adopt somebody else's server — and every run since has been the evidence that it works.

**Every number in that headline comes from the run record, not from this document.** From `docs/evidence/gates.json` for `f341d9f`: typecheck 0, lint 0, unit **567 passed / 2 skipped (569) in 43 files**, e2e **259 passed / 0 failed**, migration **273 statements accepted by the PostgreSQL parser, all 189 cross-references resolving across 28 tables and 12 functions, RLS on 28 of 28 tables, 52 policies** (49 in `public`, 3 on `storage.objects`, from 41 re-runnable drop-and-create statements), layout and no-JS behaviour, the code-block constraint, the live parent-scope probe (**5 passed / 0 failed**), the whole workspace end to end (**83 passed / 0 failed**), the deployed site (**28 passed / 0 failed** against `liko-jcuadys-projects.vercel.app`), the database settle run (**29 passed / 0 failed**), and six static gates over the interface itself — **162 controls in 146 files, 0 unwired, 0 unexamined, 1 inert**; **131 filters in 146 files, 0 unwired, 3 unexamined**; **79 exported server actions, 79 wired, 0 namespace-unresolved, 0 unexamined, 0 dead**; **44 routes with 62 internal links, 0 unexamined**; **13 route-permission rules over 38 routes, 20 gated, 0 dead**; **the app's four roles and the database's three `role` constraints are the same list**; **21 dashboard pages classified against 4 roles, 0 that offer a reader something their role cannot do**. The copy gate is new in this run: **281 source files, 19,702 visible strings, no em dash or en dash in any of them**.

**The three unexamined filters are `<Input>` and `<Checkbox>` spreads inside the shared primitives themselves**, which is where a spread belongs: without type information a scanner cannot know whether a caller passed a handler, so it reports that category separately rather than counting it as clean or as dead. **`verify:actions` closes the other half of `verify:controls`.** The controls gate asks whether a control has something attached to it; it cannot ask whether the server action that control calls is reachable from anywhere, because an action nobody imports is a function with no callers and no failing test. `verify:actions` asks exactly that, and reports **0 dead** — every exported server action is reachable from a module that imports it.

**"All green" is still not "everything", and the recorder says so on its first line**: `package.json` defines 26 gate-shaped scripts, 22 of which it runs and **4 it does not**, each listed with a reason, and the run **fails outright** if a new `check:`/`probe:`/`verify:`/`db:` script is neither registered nor excluded. The 26 gates are those 22 plus four that are not gate-shaped — typecheck, lint, unit and e2e. The production build is not one of them and is recorded separately: **exit 0**. The arithmetic is worth keeping visible because it is the sort of number that drifts: `node scripts/run-gates.mjs --list` prints the 26 it would run, and the recorder refuses to start if a script appears in `package.json` and in neither list.

**None of the four remaining exclusions is "this cannot run here."** Two of them WRITE to the live project — `probe:seats` calls the `security definer` function `redeem_org_invite` and cleans up after itself, and `db:apply` writes the migration — and running those from a recorder that fires on every commit would mean writing to production on every run. The other two are not measurements at all: `probe:gemini` duplicates a pre-flight diagnostic that `probe:ai` already performs, and `probe:ai:check` replays the cache `probe:ai` has just written. Every one of those reasons is a statement about what a script *does*, and a statement about what a script does is verifiable by reading it — which is how each reason was arrived at.

**The deployed site is no longer the least-verified thing in this project.** `verify:saas` was excluded with the reason *"live HTTP against the deployed site, which needs a deployment rather than a checkout"* — a statement that is true only while nothing is deployed. There has been a deployment for a long time, the gate answers **28 passed / 0 failed** against it, and the reason had been quietly wrong the whole time. It is now a registered gate: seven legal pages served and listed in the sitemap, no compliance claim the repo cannot support, `/join`, `/admin` and the printable sheet refused without a session, and an unknown route answering 404. Before this, the only assertions that touched production were five guardian ones. **Read the reason before trusting the absence** — an exclusion whose justification has expired is not a decision, it is a stale note that reads like one.

**Every run now states what it measured, not only what it is labelled with.** The recorder labels a run with `HEAD` but the gates run the **working tree**, and the two are the same thing only when nothing is uncommitted — so each record now carries a `tree` object, a `build` object naming the build the server served, a `contaminated` flag, and the server's own stderr. A run whose build changed underneath it is reported as **CONTAMINATED, not a verdict**, which is not a formality: a concurrent `next build` in the same working directory made three gates go red here with "Internal Server Error" while the tree stayed clean, and the cost of not noticing was twenty minutes and the wrong file. What is not done is anything that needs a credential, a decision or a professional signature, and there are **three** such things rather than the four an earlier draft claimed: an **SMTP provider** (registration is blocked at the email quota), a **lawyer's review of the three policy pages**, and **rotation of the service key and the database password**. None of the three can be done by an agent, and none is worked around in the code.

**`GEMINI_API_KEY` in production was on that list, and it was wrong.** It is set — `vercel env ls` shows it as a Production secret — but a variable being set is not a feature working, so the claim was checked against the deployed product rather than against the dashboard. Signed in to the live site as a teacher, the slides page read **"8 of 8 left this hour"** instead of "Not configured on this deployment", and one real generation produced **eleven topical slides** — *What is Covalent Bonding?*, *Mechanics of Covalent Bond Formation*, *Single, Double and Triple Covalent Bonds*, *Drawing Dot and Cross Diagrams*, *Properties of Simple Molecular Substances*, *Giant Covalent Lattice Structures*, and three worked examples (hydrogen, water, carbon dioxide) — with the usage meter falling to **7 of 8**. The probe deck was archived afterwards and the account's deck list is back to what it was. **A list of things an owner must do is a claim, and every entry in it has to survive the same question every gate answers: what did you actually measure?** This one did not, and it has been struck.

## The rebrand (2026-10-11)

The supplied brand design in `Liko new landing design and branding/` has been applied across the product. That directory is a separate Vite and TanStack Router project kept inside the repo as the reference only; it is excluded from TypeScript, lint, git and the Vercel build.

**Tokens.** The whole palette is now OKLCH rather than hex, because the brand is one hue family that has to lift in dark mode without drifting. DM Sans for interface text, Manrope for headings, and the design's smaller radius scale. The three dark panels, the hero, the mobile band and the lesson preview, sit on `--forest` with a radial glow and a masked grid over it.

**The landing page was rebuilt, not restyled.** It previously ran a hero, a stats band, a logo marquee, a problem statement, two scroll narratives, a roles pan and a proof carousel before a visitor saw a price. It now reaches the workspace at the first screen and a price at the fourth. Nineteen components were deleted.

**Three claims in the design were not true of this product and were not copied.**

1. *App Store and Google Play buttons.* LIKO has no native app. The band now says what is true and was already backed by code: it installs (`app/manifest.ts`) and works offline (Serwist).
2. *"AI generation and PowerPoint file export are not connected yet."* Half of that sentence had become false. Deck generation shipped, so claiming otherwise undersold the product. But `slides/actions.ts` refuses to import or export `.pptx` by design, so the FAQ now states both halves.
3. *Its own plan data.* The landing pricing renders from the same `PLANS` array `/pricing` renders from and links to the same `/register?plan=` URLs, so there is one list of plans rather than two.

**The interactive demo was not ported, and the mock that replaced it renders the shipping components.** The design opens a Zustand-backed fake workspace with an editable gradebook and a scan that returns a score. That was scaffolding for a build with no backend. Putting it beside the real workspace behind `/overview` would be a second, fake product on the page that sells the real one, so the mock keeps every mark on it fixed, fictional and labelled as sample data, and no input on it writes anything.

**What changed on 2026-10-26 is what the mock is made of, and it was a false claim until then.** It used to hand-build a table, a bar chart and a lesson card to look like the product, while `docs/ROADMAP.md` said the landing page renders the shipping components rather than pictures of them. Both could not be true. It renders the real ones now: `GradebookGrid`, `AttendanceGrid`, `AtRiskHeatmap`, `LessonPlanList` and `AssessmentCardList`, the same files the dashboard routes render, driven by one sample roster. A hand-built picture is a second implementation of a screen that already exists, and it drifts: the picture kept showing a support threshold of 80 while the heatmap under it, once it was the real one, used the product's own 70/55 rule. The panels now read the same derived figures, so the class average, the support count and the risk grid cannot disagree with each other or with the product.

**Bugs found and fixed along the way.**

- The column default on `organizations.plan` was never renamed. `create table if not exists` is a no-op against a live database, so the constraint was replaced while the default stayed `solo` and rejected every insert that omitted the column. `pnpm db:settle` found it with a 23514.
- `e2e/legal.spec.ts` asserted on the pricing CTA "Create a free account", which has not existed in the product for some time. The test was matching nothing.
- Three `slide-editor` tests each flipped the same stored font weight on one shared demo deck while `fullyParallel` ran them concurrently. The reload test failed intermittently with a convincing product-level message while saving worked perfectly. The block is now `describe.serial`.
- The mock's internal titles were real `h3` and `h4` elements sitting directly under the page `h1`, which is a heading-level skip. They are paragraphs now.
- The logo, app icons, maskable icon and Open Graph image were still painted `#29813d`, the pre-rebrand green, because `BRAND_GREEN` was a constant nobody had revisited.

## Linked accounts could see a class but not the marks on it — CLOSED

**Status: CLOSED for the pages a parent can reach, measured end to end.** This
section was first written as a derivation from the policies with an explicit
refusal to put a number on it, because the demo guardian seat had no link and a
zero would therefore have had two independent causes at once. That caution was
correct. The seat is now linked, the numbers below were measured with the
guardian's own token, five linked-read policies have landed, the four
owner-filtered reads that were discarding them have been removed, and
`pnpm probe:guardian` now drives the rendered pages and confirms a parent sees
its child's mark and history. What follows is kept as the reasoning, not as a
description of the current state.

While verifying another agent's in-flight `client.ts` fix I swept every read
path that still filters `.eq('owner_id', userId)`. Removing that filter is
correct on `students`, because `students` carries a second, linked-aware
policy and the app-level filter was throwing away rows RLS was admitting. It
is **not** a fix anywhere the table has no such policy, because there RLS
already returns nothing and the filter is not what is stopping the read. That
distinction is the whole lesson of this section: the same filter is the entire
fix on one table and no fix at all on another.

The state as it was, for the two tables a linked account was entitled to and
could not reach:

| Table | Policies present | Reachable by |
|---|---|---|
| `students` | `own rows` **+** `linked reads own student row` | guardian, student |
| `classes` | `own rows` **+** an `exists (... s.account_id = auth.uid() ...)` policy | guardian, student |
| `grades` | `own rows` **only** | **nobody linked** |
| `student_history` | `own rows` **only** | **nobody linked** |

`grades.owner_id` and `student_history.owner_id` hold the **teacher's**
account id, not the child's. So for a guardian or a student the `own rows`
predicate is false on every row, and RLS returns an empty set before the
application filter is even reached.

This was left to the owner of the product rather than taken here, because
`/grades` maps to `grade:read` and `/history` to `history:read`, and both are a
policy decision about a minor's records — the same class of decision as the
guardian seat itself. **The decision was made: all six tables get the linked
read**, on the grounds that the RBAC matrix already states the intent and only
the schema had not implemented it.

**The measurement, once unconfounded (round ten).** Linking the seat removed the
first of the two causes; the second was measured directly and was larger than
the two tables named above. A guardian's own token read `classes` 1,
`students` 1, `weekly_schedule_entries` 15 — and **zero** from `assessments`,
`grades`, `student_history`, `lesson_plans`, `attendance` and
`calendar_events`. Three of nine class-scoped tables admitted a linked account.
The service role was used only to confirm the seat is genuinely linked, because
it bypasses RLS and would otherwise answer yes to everything.

Two corrections were made to that map rather than carried forward:

- **`calendar_events` was never a gap.** It already carried a linked-aware
  policy; the seeded rows simply had a null `student_id`, so the map recorded a
  data fact as a policy fact. An assertion written before the migration passed
  immediately, which is what exposed it.
- **That policy granted too much.** It was `for all`, carrying the roster join
  in both `using` and `with check`, while its own comment said the requirement
  was that the student needs to *see* it. A parent could edit and delete an
  entry the teacher had written. It is now a select policy plus three
  owner-only write policies.

It is also why `/schedule` worked while `/grades` did not. That asymmetry was
the whole map: `weekly_schedule_entries` carried a linked-aware policy, so the
guardian's week rendered fifteen lessons, while `grades` had only the generated
`own rows` policy and a mark's `owner_id` is the teacher's id.

## Open: five data methods that exist and are wired to nothing

A repo-wide sweep of the `WorkspaceData` seam found **87 members and 5 with no
call site anywhere** — not in `src/app`, not in `src/components`, not in `e2e`,
not in `scripts`, not in `docs`:

| Method | Table it would read or write | Verdict |
|---|---|---|
| `listBehaviourLogs` | `behaviour_logs` | redundant — `/history` reads `student_history` |
| `appendHistory` | `student_history` | redundant — `addBehaviourLog` inserts inline |
| `listAttempts` | `quiz_attempts` | no UI calls it |
| `updateFlashcardDeck` | `flashcard_decks` | no UI calls it; only `ArchiveDeckButton` exists |
| `deleteFlashcard` | `flashcards` | no UI calls it |

This is **not** a functional defect, and the sweep that produced it also says
so. The census of reads and writes across all 27 tables found no table that the
app writes and nothing ever displays — which is the defect class worth hunting
here, because it is the one where a button succeeds and its result can never be
seen. The specific worry here was `behaviour_logs`: `addBehaviourLog` writes it
and `/history` reads `student_history`, which looked exactly like a note that
saves and never appears. It is not: `client.ts` mirrors every behaviour entry
into `student_history` as well, and the comment there says so. Reading past that
comment is what stopped a fourth phantom today.

What remains is dead surface: three implementations plus three fixture
implementations that no caller reaches. That is a maintenance cost, not a
user-visible fault, and it is left in place rather than removed — deleting a
public interface member is a change with no failing test to justify it.

**The deck case is now decided, and it is a deliberate omission.**
`updateFlashcardDeck` stays unwired because **archiving a deck is the intended
end of its life**: a teacher creates a deck and retires one, and there is no
step in between. That is a product answer, so the method is kept rather than
wired up, and this table is where the reasoning lives so the next reader does
not mistake it for an oversight. `listAttempts` and `deleteFlashcard` are in
the same category and are recorded the same way.

## Executive Summary

LIKO is a teaching-workspace PWA: a teacher plans lessons, builds assessments, takes attendance, grades, and watches student history on one thread, and slides decks for the lesson.

The code is in good shape. The security, performance and legal-compliance pass found two genuine exploitable defects and a service-worker bug that leaked one teacher's gradebook to the next user of a shared device. All are fixed, and the two SQL-level security fixes are no longer merely argued from reading the policies: they are proven against a running Postgres by `pnpm db:settle`, which signs in as a real student and confirms the exploits fail.

The legal surface did not exist at all before this pass. There were no terms, no privacy notice and no cookie notice, despite the footer showing three dead links styled like compliance links. All three are now written, the signup form is gated on accepting them with a server-side check that cannot be coerced, and acceptance is recorded in an append-only table the account holder cannot edit.

Students cannot self-register. That was already structurally true; it is now explicit, tested, and the teacher-side path that creates those accounts actually exists.

## Tech Stack

### Frontend
- Next.js 16.4.0 App Router, React 19.3.0, Tailwind v4
- `--webpack` for dev and build: Serwist cannot hook Turbopack
- Radix primitives + CVA, vendored in `src/components/ui`, with `components.json` marking shadcn/ui `new-york` as the standard for anything new. Every rendered part carries a `data-slot`; the class strings are LIKO tokens rather than shadcn's, so a newly added part arrives looking wrong and has to be retokenised
- lucide-react icons, imported from the package root by server and client alike. Phosphor's plain entry pulled a React context into the server bundle and needed `@phosphor-icons/react/dist/ssr` in server components; lucide has no context, so that split is gone
- `motion` is the only animation runtime
- TanStack Query v5, React Hook Form + Zod 4, `sonner`, `next-themes`, `vaul`

### Backend
- Next.js route handlers and server actions, no separate server
- Supabase Auth for identity, custom signed session JWT (jose) in an httpOnly cookie
- Supabase Postgres with row level security on every table
- `web-push` for notifications, VAPID

### Database
- Supabase Postgres, 28 tables defined in the migration, one migration: `supabase/migrations/20260101000000_initial_schema.sql`
- Private storage bucket `deck-assets` for the files a teacher brings into a deck, with three `storage.objects` policies scoped by `(storage.foldername(name))[1] = auth.uid()` and **no delete policy**: a file is removed through the application, which checks ownership first, rather than by anyone who can name the object
- `organizations` + `memberships` carry tenancy. There is no `owner` role; the four roles are `instructor`, `admin`, `student`, `guardian`, and `org:manage` means "can administer the organisation"

### Infrastructure
- Vercel, live at `https://liko-jcuadys-projects.vercel.app` (project `jcuadys-projects/liko`, framework preset `nextjs`, SSO protection off)
- Serwist service worker, precache plus runtime rules
- Environment: `LIKO_DATA_MODE` selects the Supabase or fixture adapter at boot, never at runtime. Production is pinned to `supabase` and verified by dataset, not by flag

### Testing
- Vitest 5 for unit, Playwright 1.63 for E2E
- 43 unit files (569 tests) and 25 E2E spec files (259 tests), counted 2026-10-26 from the full run; both counts move as modules land, so the gate table below is the one to trust
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
| Signup with consent gate | Done | Done | **Blocked, not verified** | Passing (fixture) | **Supabase path blocked by the email quota, and the cause is measured.** The form and its consent gate pass in fixtures. Against the live project the signup call returns `429 over_email_send_rate_limit`, so no account is ever created and `handle_new_user` never fires. Needs a custom SMTP provider or a higher plan before it can be verified. **This was previously inferred rather than measured**: the probe addressed a `.test` domain, which Supabase refuses at validation before the mail path, so the gate printed that the quota "appears to have reset" while the quota was spent. It now asks with a routable address and gets the quota's own error code |
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
| Slides deck editor | Done | Done | Verified | Passing | **Complete, and no longer a set of columns.** A slide is a list of typed elements on a six column, eight row grid, drawn by one component used in three places: the editor stage, the thumbnail rail and present mode. Elements name a column, a span, a row band and a height, so a slide renders correctly on a phone, a laptop and a projector, and the renderer clamps a span or a height rather than casting it. Every font, colour, weight, size and theme is read through the same closed set the renderer draws from, so a value the model invents becomes a default instead of reaching the DOM. A slide written before elements existed stores `elements: null` and is drawn from its layout through the same renderer, so upgrading a deck cannot change how a slide looks |
| Deck generation from a prompt | Done | Done | **Verified against the live provider** | Passing (16 unit, 5 e2e) | **New.** A teacher describes the lesson and gets a deck back. `gemini-3.5-flash`, chosen by calling it rather than by reading the model's list, because the list reported `gemini-2.5-flash` as available and the generate endpoint then refused it for a new key. **Nothing from the model is trusted**: the answer is brace-scanned for prose, validated against the closed sets, and a slide that does not survive validation is dropped rather than rendered half-right. The provider's answer is checked by `scripts/probe-ai-deck.mjs` and replayed through the real validator by `src/lib/slides/live-response.test.ts`, which is what caught element ids colliding across slides. The e2e suite never calls the provider, because a suite that fails for somebody else's reasons gets ignored |
| Generation allowance | Done | Done | Verified | Passing (9 unit, e2e) | **New, and visible.** Eight generations per person per rolling hour, shown as a live meter with "N of 8 left this hour" before anything is spent. A quota that refunds failures can be spent by causing failures, so a refused generation is still charged. The panel never claims the service is available merely because a key exists: an upstream tier that is exhausted looks identical from the app, so the copy says the model is out of capacity rather than pretending otherwise |
| Bringing a file into a deck | Done | Done | **Verified through the running server** | Passing (18 unit, 4 e2e) | **New.** PDF, DOCX, TXT, Markdown and images, 25 MB. Text extraction with `unpdf` and `mammoth`; a scan arrives as a refusal that says it is a scan rather than as a success with nothing in it, because an import that reads zero words is the outcome a teacher can least work out. **The unit tests run the parsers under Node; `e2e/deck-upload.spec.ts` uploads a real PDF through the running server and asserts on the exact word count that comes back**, because that is the only way to catch a parser that works under Node and fails inside a webpack server bundle. An image is stored and immediately offered in the deck's own image picker |
| Student history | Done | Done | Verified | Passing | Complete |
| Profile and onboarding wizard | Done | Done | Verified | Passing | Complete |
| Push notifications | Done | Done | Verified except delivery | Passing (subscription, SSRF, dispatch) | **The whole chain is proven except a banner appearing.** Subscription storage, the SSRF allowlist, per-teacher ownership, the sweep finding a subscribed teacher, and an outbound dispatch that treats a permanent 404 as permanent and deletes the dead row. Only real delivery to a browser needs hardware |
| PWA and offline | Done | Done | **Partial** | Passing (manifest, worker, fallback) | **Offline capture is fixed but not proven end to end.** The outbox was dead code: nothing called `enqueueWrite`, so the queue was permanently empty and offline taps were dropped. That is now wired through a real idempotent endpoint, and the online path, replay idempotency and class ownership are proven against the live database. A genuinely-offline capture replay has not been demonstrated in an automated test; see the handover for the manual check |
| Responsive layout | Done | n/a | n/a | Passing | Complete |
| Billing and payments | Not started | Not started | n/a | n/a | **NOT STARTED.** No Stripe, no checkout, no subscription state, no invoices |
| Plan gating | Done | Done | Verified | Passing (`probe:seats` 15/15) | **Seat limits now block.** `redeem_org_invite` counts active memberships and refuses in the database when an organisation is at its limit, and the refusal names the limit and says an administrator can raise it. `plan` still gates nothing beyond that, by decision: there is no billing |
| Organisation invites | Done | Done | Verified | Passing (live probe) | **New.** An admin issues a single-use 8-character code from the console, the recipient redeems it at `/join`, and the membership is created only if there is room. Codes expire after 14 days and cannot be reused. The redemption is one `security definer` statement so the count and the insert cannot be separated |
| Institutional profile (KYC) | Done | Done | Verified | Passing (constraints confirmed live) | **New.** Country, sector, grade span, enrolment estimate, timezone, contact name and role, plus a verification status that **nothing in the product can set**. Every field is optional and the form is submittable empty, because a solo teacher has no principal and no enrolment |
| Legal documents | Done | Done | n/a | Passing (`e2e/legal.spec.ts`) | **Seven documents.** Terms, Privacy, Cookies, Acceptable Use, Children's Privacy, Subprocessors, and a DPA template. All prerendered static, all cross-linked, all in the sitemap. **These are drafts for a lawyer, not compliance.** No page claims LIKO is COPPA or FERPA compliant, certified, or reviewed by counsel |
| Student codes on printed sheets | Done | Done | Verified | Passing (32 unit, 3 e2e) | **New.** The teacher picks a code block of one to three groups of two to eight bubbles. The student shades one bubble per group; the scan reads it and pre-selects the student, who the teacher confirms. A misread digit resolves to nobody rather than to the nearest student. The class roster is shown on screen and never printed |
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
  features. There were no AI features; `grep` for `openai`, `anthropic`, `gemini`
  and `llm` across `src` returned nothing. **This one has since changed and the
  guard changed with it.** The deck maker is a real AI feature now, so the test
  that forbade the phrase "AI feature" outright was replaced by one that forbids
  the claim that was actually false: that LIKO's AI reaches student records. The
  generator sends the teacher's own prompt and nothing else, so it cannot.
- `?plan=` from the pricing cards was read by nothing, so a visitor who
  compared three tiers arrived at a register form that discarded their choice.

All of the above is now rewritten to describe what the product does, and
`e2e/legal.spec.ts` fails the build if any of those claims reappear. Two real
bugs were fixed alongside it: the plan ids the page sold
(`starter | teacher | school`) overlapped the `organizations.plan` check
constraint (`solo | school | district`) on only one value, so two of the three
ids could never have been stored and `district` had no card; and the vocabulary
is now one list in three places. The tiers were later renamed to
`starter | teacher-pro | school` across the page, the API types and the check
constraint together, and `pnpm check:sql` now reads the constraint and both
TypeScript lists and fails the build if any of the three disagree.

### Seat limits are enforced; plan gating is still deferred

This section was written when `seat_limit` was a column nothing read. That is
no longer true, and the reason it was true is the part worth keeping.

**There was no member-add path at all.** Every signup created its own personal
workspace, and a school membership came only from a seed script. A limit with
nothing behind it is a number in a column, so enforcing it meant building the
path first: `organization_invites`, single-use 8-character codes, and
`/join` to redeem one. The limit is enforced inside `redeem_org_invite`, in one
`security definer` statement, because a check the client is trusted to perform
is not a check.

That function had never been executed by anything. `start_quiz_attempt` in the
same file passed 168 end-to-end tests, `check:sql`, and `db:check` while being
broken, because fixtures never run SQL and the reference check parses rather than
executes. So `scripts/probe-seat-limit.mjs` exists and calls the function against
the live database as a real signed-in user, watching it **refuse** at the limit
and then succeed once the limit is raised. That is the only reason the block can
be called proven rather than written.

**`organizations.plan` still gates nothing**, and that half is still deliberate.
Feature gating was designed and rejected for two reasons that are about the
product rather than the code:

1. **It would deadlock the upgrade path.** The only place an organisation's plan
   can be changed is the admin console, which is the page a plan gate would lock.
   A School administrator who set their own organisation down to Solo would have
   no route back to the plan that unlocks the console.
2. **Nothing is being charged.** Gating a free teacher out of a page they paid
   nothing for, before there is a subscription to gate behind, is a punishment
   rather than a business model.

So the comparison table claims no plan gate that does not exist. The admin
console row reads `Included, for administrators` in all three columns, because
`/admin` follows a person's role rather than their organisation's plan.

When billing opens, that becomes a real gate in the same release that starts
taking money, and the check belongs next to the RBAC matrix rather than in a
pricing file.

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

**The thing that was in progress a moment ago, and is not any more.** This section used to carry the landing page's showcase, which rendered a hand-built picture of the product while `docs/ROADMAP.md` claimed it rendered the shipping components. One of those two sentences had to be false, and the code was the one that was wrong: the mock now renders `GradebookGrid`, `AttendanceGrid`, `AtRiskHeatmap`, `LessonPlanList` and `AssessmentCardList`, the same files the dashboard routes render. It also used to carry the de-escalation defect, where a demoted administrator kept `org:manage` for the life of the session. Both are closed and both are covered by a gate that fails if they come back.

## Remaining

- [x] Apply the migration to the real Supabase project, then run `pnpm db:check` to confirm and `pnpm db:settle` to prove the two security fixes
- [x] Seed a real database with `SUPABASE_SERVICE_ROLE_KEY`
- [x] `git push` to the configured remote
- [x] Authenticate with Vercel and deploy — the project has git integration, a push creates a deployment nobody asked for, and `https://liko-jcuadys-projects.vercel.app` serves this project
- [ ] Configure a custom SMTP provider on Supabase, so registration and password reset are not blocked at the email quota — **the cause is now measured rather than inferred**: `verify:app` gets `429 over_email_send_rate_limit` from the signup endpoint, which is the quota refusing before any mail is sent
- [ ] Verify push delivery from a Home Screen-installed PWA — the one item here that needs a physical device
- [ ] Have the legal text reviewed by a qualified lawyer
- [ ] Rotate the service role key and the database password, which have been handled in a conversation

**This list had drifted, and the drift was in the direction that makes a document look finished.** It carried "Authenticate with Vercel and deploy" as **unfinished** when deployment is automatic and verified, and it carried "Have the legal text reviewed by a qualified lawyer" **twice**. Both are the same failure as a stale number in a results table: a line that is never re-derived stops being a statement and becomes a decoration. The owner items are now the same three the header names, and each one says what specifically has to happen.

**The registration blocker had the same shape, one level down.** `verify:app` used to address a `.test` domain, which Supabase refuses at validation before the request reaches the mail path, so the gate reported green and printed that the quota "appears to have reset" when the quota was in fact spent. The probe now asks with a routable address when the cause is open, and the answer is `429 over_email_send_rate_limit` — **the quota is still spent**. The probe was repaired because a blocker whose cause is a guess is a blocker somebody might work around instead of fix.

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
- **25 spec files** (counted 2026-10-26: admin, answer-sheet, attendance-note, auth, deck-maker, deck-upload, export, flashcards, helpers/select, import, interactions, landing, legal, notifications, offline-attendance, onboarding, pwa, quiz-maker, quiz-online, rbac, responsive, role-controls, schedule, slide-editor, slides), running **259 tests** at the last full green run. Each test uses a unique email address and nothing pins a shared count, because the fixture workspace is one shared mutable store and the specs run in parallel against a single server.

## Latest Test Results

Every row in this table below was re-measured on **2026-10-26**, against the tree at `f341d9f`, in the run recorded in `docs/evidence/gates.json`. The live-database gates are the ones that were impossible before credentials existed.

A row that was not re-run says so and carries the date it was last measured. It does not inherit PASS from an older run, because a summary that disagrees with the body is the one failure this document exists to prevent.

**No row names a gate by its position in the registry.** This table used to say "gate 8 of 13", "gate 17", "gate 19" and "gate 21", and every one of those was a position in a list that grows. Two gates were added and the numbers went stale without anything turning red, because a position is not a measurement. The gates are named by their script instead, and the order lives in one place: the `results` object in `docs/evidence/gates.json`, written by the recorder itself.

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | **0 errors**, exit 0, 6.8s (re-run 2026-10-26) |
| Lint | `pnpm lint` | **0 errors, 0 warnings**, exit 0, 77.6s (re-run 2026-10-26) |
| Unit | `pnpm vitest run` | **567 passed, 2 skipped** (569 tests) in 43 files (re-run 2026-10-26 at `f341d9f`), superseding 556/2 in 42 files, 551/2 in 42 files, 526/2 in 40 files and, before that, 518/10. **The rise is tests being added, not a regression being hidden**, and the skip count fell 10 → 2 for one reason. All ten skips lived in `src/lib/slides/live-response.test.ts`, which gates its live-model checks on a cache that `pnpm probe:ai` writes. That probe had returned **503 at capacity**, so no cache existed and eight live checks could not run. It has since produced one recording `gemini-3.5-flash` — the model the product actually calls — so those eight now execute. **The two remaining skips are that file's own meta-tests**, which assert the *absence* case (`expect(existsSync(CACHE)).toBe(false)`) and cannot run while the cache is present. Neither figure is a regression, and neither is a pass on its own: the file names which of the two states it is in and why |
| Migration | `pnpm check:sql` | **273 statements parse; 189 cross-references resolve; RLS on 28/28 tables; 52 policies re-runnable** (re-run 2026-10-26), superseding the 254/170/32 recorded on 2026-10-17. **This row caught a real defect the three direct runs had missed**: splitting the `calendar_events` policy left its `drop` naming the *old* policy, so a second apply would have failed on "policy already exists". Re-runnability is now proved rather than asserted — the migration applies twice in a row, exit 0 both times. **The policy figure counts policies, not statements, and it did not used to.** The gate printed "41 policies across 28 tables" because it counted the text `create policy`, and one of those statements is a `foreach` loop over 12 tables that creates 12 policies from a single line: `41 − 1 + 12 = 52`, less the 3 that live on `storage.objects` rather than `public`, leaving **49 in public**. That is not arithmetic in place of evidence — the live database was asked directly through `pg_policies` and returned 49, and a set comparison found nothing on the database that the migration fails to declare and nothing the migration declares that the database lacks. The count is mutation-proved: deleting one table from the loop moves the printed figure to 48 |
| Production build | `pnpm build` | **exit 0, compiled successfully.** Re-run 2026-10-26 from a clean `.next`: 49s compile, 15.3s TypeScript, 49 static pages. The one standing warning was `unpdf` reaching for `import.meta`, which webpack cannot analyse. It is silenced by exact module path in `next.config.ts` rather than tolerated, because a warning that fires on every build is one the team learns to skip. The e2e upload suite is what keeps that honest: it parses a real PDF through the built server |
| End to end | `pnpm e2e` | **259 passed, 0 failed** (4.9 min, re-run 2026-10-26 on `f341d9f`, up from 256 on 2026-10-20; the duration varies with the machine and is not itself a signal). **The runs that read like product failures are recorded here rather than dropped.** The 9-failure run at `371eeca` was two Playwright suites sharing one server on 3311, not a regression, and the recorder's e2e gate now runs on its own port — 3319 — so it cannot adopt somebody else's server. Earlier on 2026-10-19, at 04:22 it reported **153 passed, 20 did not run** in 12.1 min: Playwright's `reuseExistingServer` adopted a server already listening on port 3311 instead of building its own, that server died mid-run, and the suite was **cut short rather than failing any assertion**. That was self-inflicted — the server was mine, and holding the e2e port is exactly how you produce a run that looks red and means nothing. Re-run clean at 04:33 it gave **231 passed, 1 failed**: `interactions.spec.ts:293` authored a scale, the `"created."` toast appeared, and the new scale was not yet in the `Show as` list when the test read it once, synchronously. It passed in isolation, so the race was in the assertion and not a refusal in the product — the list does catch up. The assertion now polls, and is mutation-proved: naming a scale that cannot exist makes it fail. **No product code changed for it, and none needed to.** The 2026-10-17 history stands and is not retracted: four runs gave `workers: 4` → 231/0 then 213/7, and `workers: 1` → 231/0 then 230/1, with rate limiting and parallelism both ruled out. **The intermittent Radix select from that entry is still unexplained**, and this row does not claim otherwise — the fallback added on 2026-10-19 defends a mechanism read out of the installed source (`pointerTypeRef` begins as `"touch"`, and an option only selects on `pointerup` while it reads `"mouse"`), proved by construction in `e2e/helpers/select.spec.ts`, and a defence against a verified mechanism is not a fix for a confirmed cause |
| Live provider | `pnpm probe:ai` | **This is a moving number and the reason is the provider, not the product.** It passed on 2026-10-19 at 03:48 and 05:25 (the latter exit 0 in 11.6s: the provider answered in 10s, reported the token usage the quota bills against, and the answer was replayed through the real validator), has answered `HTTP 503 — This model is currently experiencing high demand` several times since, and **passed in the run at `f341d9f` on 2026-10-26** — 57.8s, 319 prompt tokens and 552 output tokens. **Then it was refused again two hours later, in the run at `7c7bd62`**, which is the clearest possible demonstration of why this is a third answer rather than a number: that run was **25 pass / 1 blocked / 0 fail**, and the retry 75 seconds later was a pass in 82.2s. **The recorder records a refusal as `blocked`, never as a pass and never as a failure**, and keeps the last real pass beside it rather than overwriting it — so an outage at the provider can neither manufacture a red suite nor hide a genuine one. It is one of the recorder's **26** gates, not an on-demand extra, despite an earlier draft of this row saying otherwise — `probe:gemini` is excluded precisely because it duplicates it. Being listed by the provider is not the same as being able to answer, and the app is written to say "out of capacity" rather than to pretend otherwise. **What the deployed site does with that distinction was checked directly, and it works**: one prompt produced eleven real slides and the meter fell from 8 of 8 to 7 of 8 — see the section on the AI feature below |
| Static layout | `pnpm check:responsive` | **PASS at 375, 768, 1024, 1440 and 1920px**, `scrollWidth` equal to the viewport at every one — 28.6s, re-run 2026-10-26 against build `PurgjAcao4hxU74Cz9R7n`, superseding the 2026-10-17 result. **This row used to be one the recorder declined to run, and that was the wrong answer.** It needs a production server serving this checkout, nothing was wrong with the recorder starting one, so it does: `ensureServer` starts `next start` on **port 3317**, waits for the manifest of `.next/BUILD_ID` to answer, and tears the server down when the run ends. **3317 is not 3311 on purpose** — 3311 is where `playwright.config.ts` puts its own server, and a `pnpm start` abandoned there is exactly what made a later e2e run adopt a stale process and collapse. Mutation-proved in both directions: with the server both rendered-page gates pass, and stubbing `ensureServer` to report ready without spawning one makes them fail (exit 1), so neither passes vacuously. `describeTarget` still has the last word and refuses to grade a stale build |
| Static behaviour | `pnpm check:behaviour` | **all passed**, 8.4s, re-run 2026-10-26 against the same build served on port 3317: 4 anchors clear the sticky nav (`#features`, `#classrooms`, `#mobile`, `#pricing` — each heading's `top` below the nav's `bottom`), reduced motion leaves 0 reveals hidden and stops the marquee, and the no-JS path keeps its `no-js` class with 0 elements hidden and the headline still rendering. Supersedes the 2026-10-17 result |
| Live schema | `pnpm db:apply` then `pnpm db:check` | **CONFIRMED 2026-10-26** — `db:check` reports all 28 tables and their security-relevant columns present — superseding the 2026-10-19 re-apply and the 2026-10-17 confirmation on this row. The migration file defines 28 tables and **52 policies, 49 of them in `public` and 3 on `storage.objects`** — statements and policies are not the same count here, and the Migration row explains why; `db:check` reports all 28 tables present against the live project, and its self-check confirms two canary tables correctly read as missing. `pg_policies` on the live project returns 49, which is the same 49 the migration declares, so the checked-in file and the running database have not drifted |
| Live RLS behaviour | `pnpm db:settle` | **29 passed, 0 failed** (re-run 2026-10-26), superseding the 2026-10-20 figure, 25 on 2026-10-19, the earlier 16 and the 14 before it. Includes six flashcard assertions, six linked-read assertions comparing the EXACT set of row ids a guardian may read (`grades`, `attendance`, `student_history`, `calendar_events`, `assessments`, `lesson_plans`) rather than a count, because a count is satisfied by a guardian who can read everything, and three calendar-write assertions that a parent may not edit or delete an entry its child's teacher wrote while the teacher still may. Confirmed load-bearing: run before the policies were applied it reported **17 passed, 5 failed**, and before the write split it reported **23 passed, 2 failed** — the failures were exactly the newly-guaranteed behaviours |
| Live application | `pnpm verify:app` | **83 passed, 0 failed** (re-run 2026-10-26), **and this row is one of the recorder's gates.** It previously read 58/0, then 56/0, then 55 passed / 2 failed, and **that red figure and the cause written beside it were both wrong** — see the correction below. Every workspace route renders with real seeded data, refusals hold, an attendance write is read back out of Postgres and replayed without duplicating, the at-risk sweep authenticates and stays idempotent, the push route refuses six SSRF payloads and enforces per-teacher ownership, and registration is reported as blocked by the email quota |
| What a parent actually SEES | `pnpm probe:guardian` | **5 passed, 0 failed** (re-run 2026-10-26) — and **this is a registered gate**, not an on-demand extra. It signs the guardian in against the live project and asserts that `/grades` names the linked child **and** renders the assessment that child's mark is on, and that `/history` names the child. Seed-written witnesses (`Ben Osei`, `Unit 1: Atomic Structure`) rather than a blacklist of empty-state phrases — the first version blacklisted "no marks" and reported a working gradebook as empty, because the page always renders "A student with no marks yet has no total rather than a zero". A check built on absence matches prose. **It only passes against a server in `LIKO_DATA_MODE=supabase`**: pointed at the fixture-mode server the recorder used before, it failed on `renders the assessment the child's mark belongs to` because the fixtures do not carry the linked grade — which is how the wrong data mode was found |
| Code-block constraint on the server | `pnpm probe:shape` | **all confirmed** (re-run 2026-10-26, exit 0), and **a registered gate rather than an on-demand probe**. It answers a question `check:sql` structurally cannot: that the constraint still on the server is the one that was written, not a first version left in place. A constraint silently stuck at its first version permits shapes the printed sheet cannot render. It confirms the CHECK expression, the twelve-code cap, all 10 institutional profile columns, that no row's verification status disagrees with its timestamp, and that no organisation has an upside-down grade span |
| Storage and AI write paths | `pnpm probe:files` | **all confirmed** (re-run 2026-10-26, superseding the 2026-10-17 entry): the bucket is private with no delete policy on storage objects, the usage row is written through the service client and read back, and a browser is refused with 401 that is genuinely row-level security rather than a missing grant — `new row violates row-level security policy for table "ai_generations"` — before the probe row is removed again |
| Deck maker on the deployed site | `pnpm verify:deck-maker` | **18 passed, 0 failed** (re-run 2026-10-26): signs in against the live database, opens a deck, changes a weight and reads the rendered result, sees the autosave land, reloads and finds it still there, and fits a phone. **This row was nine days stale, and the check behind it had been broken for most of that time.** The script still read `locator('option')` and drove `selectOption()`, which against a Radix trigger waits for a native element that will never arrive; re-running it produced `FAIL weight is a closed set a teacher can choose from` and then `locator.inputValue: Error: Node is not an <input>, <textarea> or <select> element`. The product was fine throughout — the e2e suite drives the same control with its own Radix-aware helper and passes — so the failure was in the check, not the app. **Nothing caught it, because it was not a gate.** It is one now, and a check nobody runs is a claim with no witness |
| Copy and dash | `pnpm check:copy` | **281 source files, 19,702 visible strings, no em dash or en dash in any of them** (re-run 2026-10-26). It parses the TypeScript AST rather than the text, so a dash in a comment is not a violation and a dash in a string is. **It fails below floors of 150 files and 2,000 literals**, so a scanner that stopped working cannot pass for clean: a scan that finds nothing has to prove it found something. Mutation-proved twice, once with a dash inside a string literal and once inside raw JSX text |
| Kit primitives | `pnpm check:primitives` | **146 files scanned, 7 deliberate exceptions, each carrying a reason** (re-run 2026-10-26). Every select, textarea, table and text input in the product is a kit primitive rather than a hand-built one. **The landing page's allow-list entry was removed this round**, because the hand-built table it excused is gone: the mock renders the shipping `GradebookGrid` now, and the gate refuses a raw `<table>` on the landing page, which is mutation-proved |
| Secrets in source | `pnpm check:redaction` | **exit 0** (re-run 2026-10-26): **7 secret shapes removed, 4 real gate lines unaltered**. It strips credential-shaped strings from the tree's own output while leaving the lines the gates report intact, so a log line cannot carry a key and a gate line cannot be mistaken for one |

**The live database is seeded.** `scripts/seed.mjs` was run against the live project on 2026-10-17 and reported every section already present, because a prior run had created it; the state was then confirmed independently rather than taken from the seed's own log: 3 classes, 24 students, 360 timetable rows, 3 flashcard decks of 6 cards each, 24 questions, 1 organisation and 5 memberships. Two failures this round were **not** a data gap. One was an oracle asserting the literal `Chemistry`, which the seed has never written; the other was a render that threw and reached the error boundary, which answers HTTP 200 and is indistinguishable from an empty state from outside.

A real generation was run through the deployed site end to end, not simulated:
a prompt went to the provider, six slides came back, the first rendered as
"The Collision Theory of Chemical Reactions", the teacher changed its weight from
600 to 700, the panel confirmed the save, and the allowance on the panel went
from 6 of 8 to 5 of 8.

### What production found that nothing local could

Four defects in this feature passed every local gate and failed only on the deployed site. They are recorded because the pattern is the lesson, not because the four were unusual.

1. **The provider key arrived with a byte order mark in front of it.** The value had been piped into the Vercel CLI from a shell that writes one. A header value has to be a `ByteString`, so every request threw before it left the function, and because that failure was classified as a transport fault the teacher was told "the AI service could not be reached. Try again in a moment". Nothing in that sentence was true. `readApiKey` now trims and strips the mark, and `aiConfigured` is what decides whether the panel says configured, so a key that cannot be sent is not a key that reports as working.
2. **The usage row was written with the signed-in teacher's session.** `ai_generations` has a select policy and no insert policy, on purpose, so Postgres answered `42501`. Every generation returned a 500 and the meter never moved, which is the allowance failing open. `createDeckAsset` already did this correctly through the service client; `recordAiGeneration` was the one reader of that rule that did not.
3. **The `purpose` value was written as a literal in three places.** The live-schema check sent its own value, the check constraint refused it, and the failure read exactly like a product defect. It is one exported constant now, read from source by the check so the probe cannot drift from the application.
4. **The panel could claim "configured" on a key that could not be used.** That is the one word on it a teacher cannot check for themselves.

`pnpm probe:files` was extended to cover the class rather than the instance: it posts a usage row through the service client, reads it back, removes it, and then posts the same row as a browser does and requires the refusal. A table can have every column, every grant and exactly the intended policies and still be unwritable through the client the application actually uses.

Two more were found the same way, in the editor rather than the generator.

5. **The panel's save status watched one of the two things that write a slide.** The first edit on a slide writes the whole element list; every edit after that patches one element through a different action. From the second edit onwards the panel sat on "changes here save on their own" while a write was in flight and never said it had landed. Every test passed, because a test that edits a slide once is always taking the first path. The control that finds it edits the same slide twice.
6. **Two style writes could lose each other.** Patching one element means reading the slide and writing the whole list back, so two overlapping calls is a read, a read, a write, a write, and the second carries the array as the first read it. Both requests succeed and the later change is gone. Writes are now serialised on the client, and the end-to-end suite was run twice because the fault was intermittent.

### What `check:sql` proves, and what it does not

The database was empty until this pass, so the 809-line migration had never been
executed by anything. `pnpm check:sql` runs it through `@libpg-query/parser`,
which is the real PostgreSQL grammar compiled to WASM, then cross-references the
result against the file's own contents:

- every relation named by a policy, grant, index or trigger resolves to a table
  or function this migration creates. A `create policy ... on public.studentz`
  parses perfectly and fails at deploy; this catches it.
- row level security is enabled on all 28 tables. The audit that found the two
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

## Route reachability — no page is orphaned

Audited 2026-10-19: **all 45 routes in `src/app` were enumerated and every user-facing one has a caller in the product.** This was checked because a route can be green across typecheck, lint, unit, e2e and route-coverage while nothing in the application links to it — those gates prove a page renders and its controls work, not that a person can find it.

**One route is correctly unlinked.** `/api/cron/at-risk` is the daily at-risk sweep, invoked by the scheduler declared in `vercel.json` rather than by a browser, and `src/app/subprocessors/page.tsx` documents exactly that. There is no UI link because there should not be one.

**Two routes looked orphaned and were not, and both were my scanner's fault.** A first pass matched only exact quoted strings and reported `/grades/export` and `/assess/sheet` as unlinked. Both are linked through template literals carrying a query string — `href={`/grades/export?class=${...}`}` with a `download` attribute in `app/(dashboard)/grades/Gradebook.tsx:362`, and `href={`/assess/sheet?assessment=${...}`}` in `app/(dashboard)/assess/AssessmentList.tsx:203`. A second pass, boundary-aware, reported zero orphans — and that was *also* wrong, because `/api/cron/at-risk` then matched a **comment** in `src/sw.ts:35` and a file-path string on the subprocessors page. Neither is navigation.

**So this audit is recorded here rather than promoted to a gate, and the reason is the whole point of writing it down.** A reachability check that matches prose and comments cannot tell a link from a sentence, so it would report orphans that are not there and pass routes that are. Green route coverage is the gate most likely to *reward* an orphan page, because adding a page makes the enumeration more complete while the product stays unreachable. A correct version has to parse `<Link href>`, `<a href>` and `router.push` targets, exclude comments, and treat `/api/*` as scheduler territory — that is real work, and until it exists the honest statement is the one above: **verified by inspection, not by an automated gate.**

**Superseded 2026-10-19: that gate now exists.** `verify:links` parses the JSX rather than grepping the text, and reports **44 routes, 62 internal links, 0 unexamined** — every link resolves to a route that exists. It was built to be made to fail, which is the only way to know a reachability gate is not vacuous. The two failures above are exactly what it had to get right, and they are why it parses: a text matcher cannot tell a template-literal `href` from prose, and it cannot exclude a comment. The count moved from 45 routes to 44 because the enumeration is now the gate's own and excludes what it does not cover; the substantive claim is unchanged and now has teeth behind it.

## Every control is wired, and how that is known rather than assumed

`scripts/verify:controls` is a registered gate. It answers the question the user's brief asks most directly — *do the buttons do anything?* — by parsing every `.tsx` under `src` with the TypeScript compiler and reporting any control with nothing behind it.

**Why it is parsed and not grepped.** A regex over `<button` reported **nineteen** buttons in a codebase that has well over a hundred, and the compiler-based first version reported **one**, which was also wrong. Both numbers were confident and both were false: a regex cannot see a handler that arrives through Radix's `cloneElement`, and it cannot tell `<button` from `<buttonSomething`.

**What it measures, measured independently.** 162 controls across 146 files. The gate's own success line says so, because a scan that finds nothing has to prove it found something — an empty corpus and a real zero are indistinguishable without asserting on the corpus size, and the first version printed the same line in both cases. It now fails outright if it read no files or found no controls, and prints `162 controls in 146 files` on success.

**The coverage gap that a review closed.** The first version matched the lowercase tag only, so it examined **24 of 162** controls and reported zero — a gate quietly covering a seventh of the surface, which is worse than no gate because it looks like coverage. Extending it to the shared `<Button>` needed one more thing: the list of parents that inject a handler into their child. That list was measured rather than guessed, and it was **missing three Radix components** — `DialogClose`, `SheetTrigger` and `DropdownMenuItem` — each of which is used in this codebase with `asChild` around a control. Without them, the extended gate would have reported three live controls as dead. All three are now in the list, and the extended gate is green.

**The one finding it reports, and why it is not a defect.** `settings/appearance/ThemeToggle.tsx` renders a permanently `disabled` button when the user has chosen *Essential only* cookies, because picking a theme is the one thing in the app that writes optional browser storage. That branch is **reachable** — `'essential'` is a real persisted consent value, written by the cookie banner — so the control is deliberately unpressable and carries a `title` saying so. The gate now reports it as a *deliberately disabled control* rather than as a failure, because a red gate gets disabled and this one is reporting a correct design.

**It is proven to fail.** A fixture with two genuinely unwired controls — one `<Button>` and one native `<button>` — turns it red and names both, and the fixture is removed afterwards. A gate that has never failed has not been shown to work.

## Every filter is wired, and the sweep that nearly said otherwise

`scripts/verify:filters` is a registered gate, and it exists because "filters" is named in the brief and `verify:controls` only asks about buttons. It asks a different question over the same tree: is every `<Select>`, `<Input>`, `<input>` and `<Textarea>` attached to something?

**Result: 131 filters across 146 files, 0 unwired.** 99 drive state through an explicit handler, 29 submit natively via `name` inside a `<form>` — which is how a filter with no JS state is still a real filter — and the remaining **3 sit behind a JSX spread**, all of them in the shared primitives `ui/input.tsx` and `ui/checkbox.tsx`, which is exactly where a spread belongs because the primitive's job is to forward props to the DOM node. They are reported as **unexamined**, never as clean. **That split is now printed by the gate rather than remembered by this document.** It used to live here alone, which meant the number had no run behind it and could not be re-derived from anything — the same failure as a stale figure in a results table, one level down. The gate now counts the four ways a filter can be wired and prints them, so the number a reader quotes comes from the run that measured it.

**The first version of this sweep was confidently wrong, and the way it was wrong is the reason it is written down.** It tested "has a spread" before "has a handler", and reported **73 unexamined controls out of 131**. Every one of them was `<FormField>{(props) => <Input {...props} onChange={...} />}</FormField>`: a render prop whose spread carries the label, id and aria wiring while the handler sits on the next line. A gate that reported 73 of 131 as unexplained would have been the reason to distrust a correct codebase, and would have been disabled within the week.

**The lesson generalises past filters.** *Which branch a scanner tests first decides its answer, and a spread is not a missing handler — it is an unexamined one.* The same file now asks the explicit handler first and only treats a spread as unexamined when nothing else about the element says how it is wired.

**Proven to fail.** A fixture with an unwired `<Select>`, `<Input>` and `<Textarea>` turns it red and names all three by file and line. The gate also fails outright if it reads no files or finds no filters, because a scan that examined nothing prints the same line as a scan that found everything.

**What it does not claim.** That a filter is *attached*, not that it filters correctly — `e2e` answers that, with real interactions. And it deliberately covers five tags, not every input-like element: `Checkbox` and `Switch` were considered and left out, because a narrow question answered correctly is worth more than a broad one that cries wolf.

## Nine red e2e tests that were one red cause, and how to tell

**What the run said.** `19 pass, 1 blocked, 1 fail`, with the e2e gate reporting **9 failed, 14 did not run, 218 passed**. Nine failures, and the record only showed the last two of them.

**The recorder could not show the rest, and that was its own defect.** A gate's output is kept as a 60-line tail. Nine Playwright failures take about fifteen lines each, so the record kept failures 8 and 9 and **silently dropped 1 to 7** — the worst way round, because the first failure is the cause and the rest are the echo. A failing gate now keeps **400 lines**, and a truncated tail says so on its first line rather than presenting itself as the whole story. The fix was proven by the very run that motivated it: the re-run showed failures 1 through 6, where before it could only show 8 and 9.

**What the failures actually were.** Scattered across `deck-upload`, `import`, `quiz-maker`, `schedule`, `slide-editor` and `slides`. A regression that appears in six unrelated features at once is not a regression in any of them, and no product code under any of those features had changed since the previous green run.

**The cause.** Two Playwright runs were in flight in the same working directory. `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so outside CI a suite **adopts whatever is already listening on 3311** rather than starting its own. The two runs therefore shared one server, one in-memory fixture workspace and one `.next`, and each saw the other's state. The proof is inside the failure messages: a single-element locator in the quiz maker matched **both "Question 1" and "Question 2"**, which is not a product fault but two runs writing to one fixture.

**The fix, and it is the 3317 argument again.** The recorder's e2e gate now runs on **port 3319**, not 3311 — for exactly the reason `SERVER_PORT` is 3317 and not 3311. `playwright.config.ts` reads `PORT` from the environment and nothing in the suite hardcodes 3311, so a dedicated port means this run can never adopt somebody else's server. Two runs then either succeed independently or say so.

**What this does not solve, stated plainly.** The port stops *server adoption*. It does not stop *build collision*: one working directory has one `.next`, so two suites building at once still contend for the Next.js build lock. That one is loud — the second build exits with `⨯ Another next build process is already running` rather than corrupting anything — which is the right way to fail. It also does not help a suite started *outside* the recorder, which still defaults to 3311 and can still be adopted by.

**It has now been measured working rather than argued.** The run at `fcd13f5` was the first full suite to execute with the 3319 change actually in place — the commit that introduced it had never been run, which is its own story, told below. On a `tree.exact: true` tree with the build stable at both ends, e2e reported **241 passed / 0 failed** in 4.6 minutes with no other Playwright suite in the directory. Every run since has been green on the same port, and the suite has since grown to **259 passed / 0 failed** — which is what a port that changes nothing about the product should produce.

## A count that was counting more than the week, and a test that passed twice before it failed

**What the run said.** The full suite at `2d661c1` on 2026-10-26 reported **258 passed, 1 failed**: `e2e/schedule.spec.ts` → "the picker is shown instead of an assumed subject" failed on `expect(weekEntries(page)).toHaveCount(15)`, having received a different number. The same suite had passed twice that afternoon. **A test that passes twice and fails on the third is a race until proven otherwise**, and the cause was not the product.

**The locator was the defect, and it was older than the race.** The assertion counted `main ul li`. `main ul` is not only the week: the same page also renders the deadlines beside the week, the terms, and the photograph-import control, each of which is a `ul` of `li` under `main` and each of which appears and disappears with the page's own state. The deadlines list renders only when there are deadlines and the terms list only when there are terms, so **the same count was fifteen in a quiet moment and sixteen in a busy one**. Two tests in that file create a deadline and a term, and `fullyParallel` ran them concurrently with the tests that count the week. The count moved underneath the assertion.

**So the locator now counts the week and nothing else.** The week is the one thing on the page that is a `section` per day with the weekday as its heading, so `weekList` is scoped to those sections rather than to `main`. This also fixes a latent assertion nobody had hit yet: the "no subject chosen" test asserted `weekList` was empty, and a teacher with a deadline of their own would have failed it.

**The classes the file creates are excluded from the seeded count as well.** Two tests in the file write a class to the same week — `Astronomy` from the student's side and `Bell journey` from the teacher's side — and they are in different `describe` blocks, so they run in parallel against the one shared fixture store. `SEEDED_WEEK` is the SEEDED week, and neither of those classes is part of the seed, so the seeded count excludes them by name. The mutating test keeps a count that includes its own class, and excludes only the *other* test's, because that one is allowed to be there.

**Proven by stress rather than by assertion.** A race that shows up once in three runs cannot be proven fixed by one green run. `npx playwright test e2e/schedule.spec.ts --repeat-each=10` runs ten copies of every test against the one shared fixture store, which is the same contention with ten times the pressure:

| | Result |
|---|---|
| Before the fix | **12 failed**, 168 passed |
| After excluding the scratch classes, before scoping the locator | **2 failed**, 178 passed |
| After scoping the locator | **0 failed**, **180 passed** |

**The notification locator was the other half.** `getByRole('menuitem', { name: /Bell journey was added/ })` resolved to **eight elements** and threw a strict-mode violation: the fixture store outlives the test, so every earlier run of the file left its own note behind. It now takes `.first()`, which is the newest row — the one this run created, and the one the assertion is about — and that is what makes the file repeatable against a server that has already run it.

**This is the same rule this document already stated.** The Technical Debt section has said, since it was written, that the fixture workspace is one shared mutable store and **"no test may pin a shared count"**. The schedule spec pinned one. The rule was right and the spec was wrong, so the spec was changed.

## The fix that shipped with the recorder broken, and the probe that would have caught it

**A commit I made and pushed had never been executed.** `dc58b3b` gave the e2e gate its own port, and in the same file it read `String(E2E_PORT)` at the top of the gate registry while declaring `const E2E_PORT = 3319` near the bottom. That is a temporal dead zone: the registry is built while the module evaluates, long before the declaration runs, so

```
ReferenceError: Cannot access 'E2E_PORT' before initialization
```

and **the recorder could not start at all.** Every gate in this project is run by this one script, so there was nothing left to report the failure. It was found by trying to use the tool.

**Why it survived a session that measured everything else.** The gate numbers printed beside that commit in this document were recorded by the *previous, working* version of the file, eighty-two seconds before the broken commit landed. Read as a timeline, the evidence looks complete: a full green suite, then a commit. What is missing is the commit ever having run. `git log` cannot tell you that, and neither can a passing suite recorded under the same heading.

**`SERVER_PORT` had the same shape of mistake and was saved by an accident.** Its two uses sit inside arrow functions, which defer evaluation until the gate runs; `E2E_PORT` was read eagerly at module scope. An ordering dependency that only bites when someone writes the eager version is a dependency nobody reviews. Both constants now sit above the array that consumes them, and the reasoning travelled with them.

**The recorder could not report on itself, so it grew a way to.** `node scripts/run-gates.mjs --list` evaluates the entire module and stops: **84ms, no gate, no build, no server**, printing the selected registry. Reaching the end of the module *is* the assertion — it proves every declaration the registry reads was initialised.

**Proven to fail.** Restoring the original ordering — the declaration moved back below `let server = null` — makes `--list` exit 1 with the `ReferenceError`, and putting it back makes it exit 0 again. A check that has only ever passed is an assertion about the day it was written.

**The general rule.** A tool that runs every other check has no independent witness to its own survival, so its first execution after any change is the only test that matters, and it has to be *run* rather than reasoned about. Committing an unexecuted change to the thing that executes everything else is the one commit shape with no safety net under it.

## The AI feature, driven on the deployed site rather than read in the source

**Why this was checked at all.** The project's own gates never drive the deployed AI path. `probe:ai` calls Google's API **directly** with the local key, so it answers "can this machine reach the provider" — not "can a teacher on the live site make a deck". `verify:saas` touches production but only over HTTP: legal pages, `/join`, `/admin`, the printable sheet, a 404. **Nothing in the 22 gates signs in to production and asks the product to do the thing it exists to do.** That is the same class of gap as a route gate that checks which pages a role can open without checking which data methods a page calls.

**What was done.** Signed in to `https://liko-jcuadys-projects.vercel.app` as the seeded teacher, opened `/slides`, and observed the rendered product:

- The status line read **"8 of 8 left this hour"** — not the "Not configured on this deployment" the same panel renders when the key is missing. The key is present.
- One prompt — *"Ten slides on covalent bonding for Year 10, with worked examples at the end"* — produced a deck of **eleven slides**: a title slide, then *What is Covalent Bonding?*, *Mechanics of Covalent Bond Formation*, *Single Covalent Bonds*, *Double and Triple Covalent Bonds*, *Drawing Dot and Cross Diagrams*, *Properties of Simple Molecular Substances*, *Giant Covalent Lattice Structures*, and worked examples for hydrogen, water and carbon dioxide. The toast read **"Made 10 slides. Every one of them is yours to edit."** and the app navigated to the editor, where the deck was fully editable: layout, title, points, speaker notes, background, and the element palette.
- The usage meter fell to **7 of 8**, so the allowance is counted on production, not just displayed.

**Two things this corrected.** First, `GEMINI_API_KEY` in production was listed as an outstanding owner task; it is set and the feature works, so it was struck. Second, and more generally: **a list of things only the owner can do is a claim with the same standing as a gate, and this one had been carried on the strength of a dashboard entry rather than a measurement.** A variable being set is not a feature working.

**A third thing it taught, which is about reading, not about AI.** The first two attempts looked like failures: no deck, meter unchanged, no console error. The cause was the *observation*, not the product — a refusal is reported in a toast that auto-dismisses, and I was looking thirty seconds later. The third attempt, which sampled the page every second, caught it: *"Made 10 slides."* **A check that looks at the right moment and a check that looks too late can disagree completely about a working system**, and the second one will be believed. Sampling while the event happens is part of the measurement, not a convenience.

**The probe deck was archived afterwards**, and the account's deck list is back to the four decks that were there before, so production carries nothing from this.

## Every route-permission rule gates a real route

`scripts/verify:rbac-routes` is a registered gate, and it closes a hole that nothing else could see.

**The hole.** `ROUTE_PERMISSIONS` in `src/lib/auth/rbac.ts` is a list of prefixes that decide which role may open which page. **Nothing asserted that each prefix matches a real route.** A typo there is invisible from both directions at once: the rule looks present in the source, the page looks present on disk, and the gap between them is not something any existing check reports. `/grdes` matches nothing, the gradebook stops being gated at the proxy, and no gate reports the miss — while the *server actions* still re-check permissions, so nothing leaks and nothing looks wrong.

**What is green.** 13 rules over 38 routes; **20 routes are gated and 0 rules are dead.** The 18 that are not gated are all correct: the marketing pages, the seven legal pages, `/offline`, `/pricing`, and `/forbidden` — which must render for whoever was just refused, or it cannot do its job.

**Only the reverse is asserted, and the asymmetry is the design.** "No rule is dead" is wrong in every case, so it is a gate. "Every page has a rule" is *not* wrong in every case — `/settings` is role-agnostic, `/forbidden` is the refusal page, and every public page must render for an anonymous visitor — so asserting it would be a gate about a design decision nobody made. A check that encodes a preference as a requirement is how a gate gets disabled.

**The matcher is copied, not imported, and says so at the point of use.** This file cannot import a TypeScript module. The condition is a verbatim copy of `permissionForPath`'s, because a gate that tested a *different* rule from the one the application applies would be a gate about the gate.

**Proven to fail.** Adding `{ prefix: '/grdes', permission: 'grade:read' }` to the rule list — one character — turns it red and names the rule with the permission it would have gated:

```
FAIL  1 route rule(s) gate no route at all
  /grdes         requires grade:read
A rule that matches no route is doing nothing. Either the prefix is misspelled,
in which case the page it was written to protect is no longer gated, or the route
was renamed and the rule was left behind.
```

The mutation was reverted and `rbac.ts` verified byte-identical to `HEAD` afterwards.

**And now the same gate also asserts that the app's roles and the database's are the same list.** This was slice 5 of the audit's fix plan and it had not been done. `ROLES` in `rbac.ts` is what the application will accept; `check (role in (...))` in the migration is what the database will store. They agree today and **nothing asserted it**, so a role added to one and not the other was silent: the application writes a row the database refuses, and the refusal reads as a generic constraint error rather than as a drift.

The two sides answer different questions, and neither covers the other. `db:check` asks whether the **live database** matches the migration. This asks whether the **application** matches the migration. The constraint is read from the migration file rather than from the live database, because this gate runs offline.

**The constraint is read from the migration file, and `created_by_role` is deliberately excluded.** It is a different column with a different meaning — who issued an invitation — and a guardian cannot issue one, so it carries a narrower list on purpose. The three that are compared are `profiles.role`, `memberships.role` and `organization_invites.role`, and they are all the same four roles.

**Proven to fail, and proven to fail on a vacuity guard first.** The first version of the parser read the app's roles as **zero**, because `ROLES` is declared `as const` and the initializer is an `AsExpression` wrapping the array literal rather than the array literal itself. The gate's existing "a scan that examined nothing has proved nothing" guard caught it and refused to report an empty app's role list as an empty database's. Then the real mutation: adding one role to the app's list only turns it red and names both sets:

```
FAIL  the application's role list and the database's are not the same list

  app   (instructor, admin, student, guardian, observer)
  db    (instructor, admin, student, guardian)  in supabase\migrations\20260101000000_initial_schema.sql
```

`rbac.ts` was restored byte for byte afterwards.

## The recorder now records what it measured, not only what it is labelled with

**The defect.** `scripts/run-gates.mjs` labels every run with `git rev-parse --short HEAD`. The gates run the **working tree**. Those are the same thing only when nothing is uncommitted, and the recorder never said so. A run over edited-and-staged code was therefore filed under the previous commit and read afterwards as proof about that commit.

**It happened here, and I did not notice until I read the evidence back.** The full-suite run this session was recorded at `312da33` while measuring a tree that contained four of my own uncommitted files, none of them in that commit. The gate results were true; the label was a lie about what they were true *of*. Untracked files make this worse than imprecise: `src/` compiles untracked modules into the build, so an untracked `.tsx` is part of what `e2e` and `verify:app` exercised, and the label can name a version that never existed.

**The fix.** Every run now records a `tree` object beside `commit`, and prints the discrepancy **before** the gates run rather than after, so a reader can decide whether to trust the run before reading a single result:

```
tree: { clean, count, material[], immaterial[], exact }
```

`exact` is the question the evidence record actually needs answered: does the commit label describe the code that was measured?

**A dirty tree is not automatically an inexact label, and treating it as one would have produced a check nobody reads.** A stray note at the repository root cannot change what any gate measures. If every run printed a warning for it, the warning would be noise that people learn to skip — the fate of every check that cries wolf. So paths are sorted by whether they can reach the build, and **only the ones that can raise an alarm**. The split is a whitelist of directories and root config files (`src`, `e2e`, `scripts`, `supabase`, `tests`, `public`, plus `package.json`, the lockfile, `tsconfig.json`, `playwright.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `next.config.*`, `vercel.json`) rather than a blacklist of safe paths, because a wrong blacklist is silent while a wrong whitelist is loud.

**Proven in both directions, not asserted:**

| Probe | Expected | Observed |
|---|---|---|
| Untracked `src/__tree_probe.ts` added | warning names it | `WARNING 2 changed path(s) can reach the build` listing `src/__tree_probe.ts` |
| `b.txt` and `docs/evidence/gates.json` present | listed as immaterial, no alarm | `2 further path(s) cannot reach the build and are not listed` |
| `isMaterial` mutated to always return `false` | warning silenced | **no warning at all**, exit 0 — the classifier is load-bearing, and the warning depends on it |
| Clean tree, separate worktree at the same commit | no warning, `exact: true` | confirmed; the worktree also caught its own redirect file as a dirtied path, which is the detector working, not failing |

**What this is not.** It does not make a dirty run invalid — it makes the run *honest about itself*. A dirty run still measures real code, and the results are still worth having; what it cannot do is claim to describe a commit. The distinction matters because the alternative — refusing to record a run at all — would throw away eight minutes of real measurement over a stray file, which is its own kind of lie.

## A red gate that was never the product's fault, and what now catches it

**What happened.** A full recorder run reported `12 pass, 1 blocked, 3 fail`. `check:behaviour`, `probe:guardian` and `verify:app` were red. `probe:guardian` said the guardian's `/grades` and `/history` were **HTTP 500 — Internal Server Error**, and `verify:app` reported 42 console errors, most of them on `/login`. That reads like a product regression and is not one.

**The cause.** A second process in the same working directory ran `next build` **while the run was in flight**. The recorder's server was serving the old build; the build directory was replaced underneath it; the server kept answering from a directory whose chunks had been swapped. Three gates went red, and the tree stayed **clean the whole time** — because `.next` is gitignored, no tree check can see it.

The timeline settles it rather than making it likely: `.next/BUILD_ID` was recreated at **16:56:52**, between `check:behaviour` (16:56:11) and the gates after it. The server had started on build `6U-Dgr5jXWiJeteSRMF6z`; the build on disk at the end was `QG2iLIfuebwWxpR4DNtHM`. The three red gates all passed on the second run, unchanged, with no edit to any product file.

**Why it cost twenty minutes to find, and what now prevents it.**

| Gap | Now |
|---|---|
| The record said `commit: 312da33` and nothing about which **build** was served | `build: { atStart, atEnd, changed }` is in every record, read before the server starts and again after the last gate |
| Nothing noticed the build changing mid-run | `contaminated: true`, a loud `CONTAMINATED` banner, and a non-zero exit that says **"this run is CONTAMINATED, not a verdict"** — the measurements are real but describe a build that no longer exists |
| The server's stderr was `stdio: 'ignore'` — a 500's cause was thrown away, and the cause had to be reconstructed by hand | The server's stderr is captured and stored in the record as `serverLog`, and it is **written through a file descriptor** rather than a `data` handler, because this recorder is synchronous end to end and an event handler would never fire before the evidence was written — a log that is always empty would look like it worked while proving nothing |
| A dirty tree was reported as one undifferentiated list | Already fixed above: only paths that can reach the build raise the alarm |

**Proven, not asserted.** The stderr capture was proved by spawning a server that writes a probe line to stderr: the record came back with `serverLog: "SERVER STDERR PROBE"`. The contamination detector was proved by swapping `.next/BUILD_ID` to `CONTAMINATIONPROBE01` six seconds into a run and restoring it immediately: the recorder reported `served QG2iLIfuebwWxpR4DNtHM, on disk now CONTAMINATIONPROBE01` and refused to call the run a verdict. Both probes were reverted; `BUILD_ID` was restored to the value it held before.

**The general shape of it.** The tree check and the build check cover the same failure from two sides, and neither would have caught the other: a clean tree is not a stable build, and a stable build is not a clean tree. Both are now recorded, because the question a reader of an evidence file actually has is *"what exactly did this measure?"* — and a commit hash alone answers it only when nothing else is moving.

## Four server actions wired up, and one left alone on purpose

Audited 2026-10-19 with the TypeScript parser rather than a regex, because a regex scan of source is narrower than the source. Five exported server actions had **no caller anywhere** in `src`, `e2e` or `scripts` — verified by name across the whole repository, where each appeared only on its own declaration line.

**One of them is now a button, because a teacher could bring a file into a deck and never take it back out.** `removeDeckAsset` existed on the server and `listDeckAssets` existed in the data layer, and nothing in the product reached either. The upload panel now lists what is already in the deck with a Remove per row, and each button names its file in a screen-reader-only span rather than saying "Remove" three times. The list action returns a **`DeckAssetSummary`, deliberately narrower than `DeckAssetRecord`**: that record carries `extractedText`, which is the body of a whole document, and sending it to the browser to render a filename would put an entire uploaded document into the client payload and the RSC cache for nothing.

The e2e test drives the whole round trip, and it is mutation-proved against the failure that matters. Making the action report success **without deleting** leaves the toast saying "That file was removed." and still fails the test, because the poll finds the row on screen: `Expected: 0, Received: 1`. That is the shape of bug a status-code assertion cannot see, and it is exactly what this one was written to catch.

**The other four were left unwired at the time of that audit, each for a different reason.**

| Action | Why it stays |
|---|---|
| `addAttendanceNote` | Writes a note against a mark. Whether notes belong in the register is a product decision, and adding a control nobody asked for is the same mistake as dead code |
| `loadPolicies` | The gradebook loads grades and never policies; adding the call would mean deciding what the page does with them |
| `logoutAction` | Redundant with `/api/auth/sign-out`, which is what `UserMenu` actually calls. Two ways to sign out, one used. Removing it needs no failing test to justify, because there is nothing to break |
| `timetableAiStatusAction` | Reports the AI allowance on the timetable. The generator already has a live meter; a second one on a screen that does not generate is a design choice, not a repair |

**Updated later the same day — the table above is now history, not the current state.** Three of those four have since been resolved, and re-verified by name rather than remembered:

| Action | Now | Evidence |
|---|---|---|
| `addAttendanceNote` | **Wired** | 4 references, first at `attendance/AttendanceNoteDialog.tsx:6`. A note control now sits against a mark |
| `timetableAiStatusAction` | **Wired** | 2 references, first at `schedule/TimetablePhotoImport.tsx:17`. The photo import screen reads the allowance |
| `loadPolicies` | **Retired** | Zero references *and* no declaration anywhere in `src` — deleted outright rather than left as dead weight |
| `logoutAction` | **Still unwired, still deliberate** | Zero references. Redundant with `/api/auth/sign-out`, which is what `UserMenu` calls |

So the two judgement calls this file left open — whether `addAttendanceNote` was a control nobody asked for, and whether `loadPolicies` should exist at all — were answered by `312da33` ("Give attendance notes a control, and retire three dead exports"), not deferred indefinitely. Only `logoutAction` remains a deliberate omission, and its justification did not change: two ways to sign out where one is used is not a defect, and removing it needs no failing test to justify because there is nothing to break.

**A dated table is a snapshot, and a snapshot goes stale silently.** Nothing in the recorder compares a documented status against the source, so a row can name an action as dead for as long as it likes while the code underneath moves. That correction was made by hand, from a fresh name search. **This gap is now closed.** `verify:actions` is a registered gate that asserts every exported server action is reachable from a module that imports it, and it reports **79 wired, 0 namespace-unresolved, 0 unexamined, 0 dead**. It is not a check that a *document* is current — it cannot read prose — but it is the check that would have caught the drift, because an action with no importer is what "dead" means in the source, and the source is what the document was describing. The recorder still enforces that every gate-shaped script is registered or excluded. A correction worth keeping from an earlier draft of this paragraph: it credited a `verify:gates` script for catching the count form of the same drift, and there is no such script in `package.json`. The count is enforced inside `run-gates.mjs` itself, not by a separate check.

**Why the number is small, and the false positives along the way.** A first pass reported eight dead actions and three were wrong: `loadGrades`, `loadAssessments` and `loadQuestions` are all called through `const { loadGrades } = await import('./actions')`, and a scanner that reads `ImportDeclaration` nodes does not see a dynamic `import()`. A second pass over the raw name list produced **218** "dead" exports overall, almost all of them Next.js default exports such as `export default function AdminPage` and `Props` interfaces a file declares for its own use. **Neither version was usable as evidence.** No automated gate was added: a dead-export check that cannot see dynamic imports reports working code as dead, and one that ignores default exports reports most of `app/` as dead. Both are worse than no check, because a red gate gets disabled.

## Security Review

Full pass over every server action, route handler, RLS policy, and service-worker rule. Findings and fixes are tabulated in `docs/SECURITY.md`. The two that mattered:

**Critical, closed.** `profiles` carried `for all using (id = auth.uid())`. RLS restricts rows, not columns, so any account could `PATCH /rest/v1/profiles?id=eq.<own uuid>` with `{"role":"admin"}` and promote itself, then chain into the admin console. The application's own field allowlist is irrelevant when the attacker talks to PostgREST directly with their own token, which sign-in genuinely mints. Fixed with `revoke update on public.profiles from authenticated` plus a column grant on only the seven self-editable columns.

**High, closed.** Two `classes` select policies keyed only on the caller's role, with no tenant check. Postgres ORs permissive policies, so either one let any account in any school read every class row in every school. The SQL comment claimed a scoping the body did not perform.

Also closed: blind SSRF through the push endpoint, a rate-limit kill switch one env var from production, an unenforced session secret length, an open redirect via the backslash form of a protocol-relative URL, and a service worker that cached one teacher's dashboard for the next user of the same device.

### Checked on 2026-10-19 and found sound: every session-gated page is behind the proxy

`rbac.test.ts` walks `src/app/(dashboard)` **from disk** — it does not restate the protected list, because a test that repeats a list can only prove the list agrees with itself — and asserts that no page in that group falls outside `PROTECTED_PREFIXES`. It also carries a vacuity guard, so a walk that matched nothing after a group rename cannot read as a pass. That is the right design and it is in place.

**One page sits outside what that walk covers.** `/join` is the only session-gated page that is not in the `(dashboard)` group, and it is in `PROTECTED_PREFIXES` with a documented reason: redeeming an invitation needs a session and no permission, so every signed-in role reaches it. **Nothing enforces that entry.** If it were removed, `/join` would still render for an anonymous visitor — `page.tsx` uses `getSession` rather than `requireSession` and shows a sign-in prompt — because the page degrades on purpose.

**This is not a hole, and the reason is worth writing down.** The mutation is not the page: `redeemInviteAction` calls `requirePermission('class:read')` before it touches anything. An anonymous visitor could render `/join` and could not redeem a code with it, because the only thing that changes state is gated at the action rather than at the route. The unenforced list entry is **defence in depth with one missing check**, not a vulnerability.

No test was added, deliberately. The only assertion available here would restate `PROTECTED_PREFIXES` for the pages outside the group — the exact thing the existing test is written not to do — and a check that repeats a list is a check that rots quietly.

### Retracted on 2026-10-19: the gradebook export was never refused, and the check could not log in

This corrects a claim carried in the recorder's exclusion reason and in this file's own `verify:app` row. Both are withdrawn rather than quietly edited, because the wrong cause was the useful part.

**What was written.** That a student asking for `/grades/export` was answered `200 text/html` because `src/proxy.ts` *rewrites* a refused role to `/forbidden` and `rewrite` preserves the status — a cross-tenant-looking defect in the route gate, with a 403-versus-200 decision left open.

**What is true.** The export was never refused, and no role is refused there. A student holds `grade:read` at `own` scope, `can()` is true for every scope except `'no'`, so the proxy does not rewrite, and the route answers **`200 text/csv`** with the student's own marks. An in-page `fetch` returns the header row `Student,Bonding Quiz (out of 11),Unit 1: Atomic Structure (out of 100),Weighted …`.

**The actual cause.** The session cookie is `Secure`. Over plain `http://127.0.0.1` a browser sends it, because loopback is a trustworthy origin, but Playwright's `page.request` jar withholds it. So the check's own request left **anonymous**, `307` went to `/login`, and the followed redirect rendered the sign-in page as `200 text/html`. The `text/html` was a login page. Three request shapes disagreed for one URL:

    page.request.get            -> 307, no session
    ... with liko_session by hand-> 404, session verifies but no sb-*-auth-token, so RLS denies
    real browser / in-page fetch-> 200 text/csv, the real answer

**Why the exclusion was the wrong answer.** It was justified as "not mine to decide", but the thing to decide was never a product question — it was a question about the check. An exclusion is not a decision, it is a debt, and a debt whose stated reason is wrong is worse than the red gate it was hiding, because it reads as a considered position.

**Fixed and proven.** `verify-app-live.mjs` now issues those requests from inside the signed-in page, so the browser sends the cookies, and it asserts the real invariant — that the student seat is answered its own CSV, and that a class it cannot resolve is refused. Mutation-proved: setting `credentials: 'omit'` reproduces the original `200 text/html` and turns both assertions red with a message that names the cause rather than pointing at RBAC. The row scope assertion carries a `note` when no CSV arrives, so it cannot report a scope it never measured. `verify:app` is now a registered gate (**16**), and the stale `41 policies` figure in `docs/SYSTEM_AUDIT.md` is flagged for that file's owner rather than edited here.

**The lesson worth keeping:** an exclusion written from a symptom tends to survive the fix, because the fix changes the product's behaviour and not the sentence. Read the reason before trusting the absence.

## Documentation Status

- `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/HANDOVER.md`, `docs/SECURITY.md` all current. The GSAP references in DESIGN and ARCHITECTURE were removed this pass, since GSAP is gone.
- **Eleven documents, not six.** `docs/RBAC_MATRIX.md`, `docs/AUDIT_FINDINGS.md`, `docs/FINISH_STATUS.md`, `docs/FIX_PLAN.md` and `docs/SYSTEM_AUDIT.md` were added by the audit round and are as load-bearing as the first six, so the list above used to understate what the project has. `docs/AUDIT_FINDINGS.md` carries all ten findings marked **CLOSED** with the resolution that closed each, which is the only place that says *why* each one is closed rather than merely that it is.
- The legal text is written to match the implementation exactly, including the exact cookie names. It has not been reviewed by anyone qualified to review it.

## Deployment Readiness

**Ready to use, with three things that need the owner and are not code.** The application builds, typechecks, lints, tests clean and is deployed. What remains is external:

1. The migration is applied and the live gates pass, so the SQL is proven at runtime and not only by reading it.
2. The database is seeded and the live application renders every workspace route against real rows.
3. Deployment is authenticated and serving.
4. The generator's provider is on the free tier, which refuses at the provider's own rate. See blocker 8.
5. Registration and password reset are refused by Supabase's email quota, so the two paths that need a real person to receive a message cannot be exercised until an SMTP provider is configured. See blocker 7.

**Point four is a provider at capacity and point five is a dashboard setting, and neither is a defect in the product.** Both are named here so that a reader knows exactly what "ready to use" excludes, rather than discovering it.

## Blockers

Three of the five blockers listed here were resolved on 2026-10-09 and are kept here only so the record shows what they were.

1. **RESOLVED: `git push`.** The remote is `https://github.com/jcuady/liko.git` and every commit is pushed. The earlier `Repository not found` was a credential problem, not a wrong remote name.
2. **RESOLVED: the database was empty.** `pnpm db:apply` applied the migration. The file now defines 28 tables with row level security on all 28 and 52 policies, 49 of them in `public` and 3 on `storage.objects`; the live database holds the same revision, which `pnpm db:check` confirms table by table.
3. **RESOLVED: `SUPABASE_SERVICE_ROLE_KEY`.** `scripts/seed.mjs` has run; five demo accounts hold a school, three classes, 24 students, assessments, marks, attendance and history.
4. **RESOLVED: deployment.** `https://liko-jcuadys-projects.vercel.app` serves this project.
5. **OPEN: iOS push delivery unverifiable** without a Home Screen-installed PWA.
6. **OPEN: the legal text has not been read by a lawyer.** It describes this implementation accurately, which is the most it can do, but accuracy about the system is not legal sufficiency.
7. **OPEN: Supabase's built-in email quota is exhausted, so nobody can register.** The project answers `429 over_email_send_rate_limit` for every signup and every password reset — **measured on 2026-10-26 against a routable address, so this is the quota's own error code and not an inference from an address the validator refused.** It is not a code fault: the seed created its accounts through the admin API, which sends no email, which is why this only appeared when a real person filled in the register form. Fixing it needs a custom SMTP provider or a plan with a higher limit, both of which are dashboard decisions.
8. **OPEN, AND IT IS A PROVIDER NOT A BUG: the deck generator runs on the AI free tier, and that tier refuses.** A real call during this work returned `503 This model is currently experiencing high demand`, and `gemini-2.5-flash` returned `404` for a new key even though the model list reported it as available. LIKO handles all of it: the panel says the model is out of capacity, it distinguishes a refusal from an outage, and each teacher gets eight generations an hour so one person cannot exhaust the shared allowance. **What it cannot do is make the free tier reliable.** That needs a paid key, and the panel never claims otherwise. **The same day, the deployed site generated for real**: signed in on production, one prompt produced eleven topical slides and the meter fell from 8 of 8 to 7 of 8, which is the provider answering rather than refusing. The free tier is therefore intermittent, not broken, and the difference between those two words is exactly what the panel reports.
9. **RESOLVED 2026-10-19: this round's fixes ARE deployed.** This said "OPEN: not deployed" — `origin/main` and local `HEAD` both at `a101b53` with 16 files uncommitted — which was true when written and is false now. Both fixes are on `main` and live at `https://liko-jcuadys-projects.vercel.app`: `main` is `ea94cd1` and the production alias resolves to a build made from it. **The reasoning underneath is kept, because it was the reason the item was not simply closed by deploying:**

   - **The stale demo-cookie crash was a genuine production exposure.** Production runs `LIKO_DATA_MODE=supabase`, and a session cookie minted while the app ran in `fixtures` mode stayed valid after the switch, so a real visitor with an old cookie reached a page that queried `auth.uid()` as a uuid and got `invalid input syntax for type uuid`. Fixed and shipped.
   - **The roster fix was fixtures-mode only and never affected production.** `isDemoStaff` matches the fixed demo ids, so a production session carrying a Supabase uuid is unaffected. The live site reading `Roster not visible to you` for `CHEM-2` and `PHYS-1` while showing `SCI-4` was the `d75a38a` fix behaving correctly, not a defect. Conflating the two fixes would have sent someone looking for a production bug that was not there.

   **Deployment no longer depends on a human.** The Vercel project had no git integration, which is why this sat undeployed for a day while `main` moved six commits; `vercel git connect` is done and verified by watching a push create a deployment nobody asked for.

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

**Three, and none of them is code.** The first item on an earlier draft of this list was "authenticate with Vercel and deploy", which is done: the project has git integration, a push creates a deployment, and `https://liko-jcuadys-projects.vercel.app` serves this project. It was struck for the same reason `GEMINI_API_KEY` was struck from the header — a list that nobody re-checks stops being a list and becomes a wish.

1. **Configure a custom SMTP provider on Supabase.** Until that is done nobody can register, and the signup path, the `handle_new_user` trigger and the `consent_events` write are unverified against the live database. The form and its consent gate pass in fixtures; the live signup call returns `over_email_send_rate_limit`.
2. **Have the legal text reviewed by a lawyer.** It describes this implementation accurately, which is the most it can do, but accuracy about the system is not the same as legal sufficiency.
3. **Rotate the service role key and the database password before this project carries anything real.** Both have been handled in chat and written to a local `.env.local`, which is gitignored — and no commit in this repository contains a secret, which was checked rather than assumed: only `.env.example` is tracked, and no env file appears anywhere in the history. They were shared in a conversation, and that is the reason to rotate them.

## Recent Work

### 2026-10-17

The live database was empty of demo rows, which made two routes render honest empty states and the sweep report them as failures. Seeding it turned out to be a **no-op** — a prior run had already created everything — so the state was confirmed independently through the service role rather than taken from the seed's own log: 3 classes, 24 students, 360 timetable rows, 3 decks of 6 cards, 24 questions, 1 organisation, 5 memberships. The two failures were not a data gap at all.

Fixed:
- **High: a demo-mode session cookie stayed valid in `supabase` mode and crashed every data page.** `getSession()` reads the signed cookie and, under `supabase`, deliberately skips the account lookup that `fixtures` does — so it is the one place a cookie is read with nothing to check it against. Demo ids like `usr_demo_noor` are signed with the same `LIKO_SESSION_SECRET`, verified perfectly, and were then rejected by Postgres for a uuid column: `invalid input syntax for type uuid: "usr_demo_noor"`. Every data page hit the error boundary while answering HTTP 200, with the database holding every row and RLS admitting them. An id that cannot be a Supabase user id is now refused, by a single predicate shared by the guard and the proxy
- **High: the roster was invisible to every demo teacher, including the one standing in front of it.** `classes/page.tsx` derived `rosterVisible` from class ownership alone, which is correct against Postgres and wrong in the fixture workspace, whose seeded classes carry the synthetic owner `demo-owner` — nobody's account id. The fixture adapter has escaped this in six other places (`rosterOwner`, `ownedClass`, `ownedDeck`, `getStudent`, `listClasses`, `createFlashcardDeck`); this was the one call site left out. The page then still offered "Add student" and "Import CSV" on a class whose roster it refused to render, so a write could succeed and its result could never be seen — the silent direction described beside `rosterOwner`

Instrument:
- The live sweep asserted the literal `Chemistry`, which `seed.mjs` has never written; the deck is `Unit 1: Atomic Structure` and the week is Filipino/Math/English/Science/History/Technology/Clinic/PE/Values. Both witnesses are now strings the seed writes **and** the fixtures cannot produce
- Its failure message asserted a cause it had not observed ("this is an empty state"). `/schedule` was not empty — its render had thrown, and the error boundary answers HTTP 200, which from outside is identical to an empty state. That misdiagnosis sent the investigation at the database first. It now reports what was observed and names the error boundary separately
- One `goto` in twenty omitted the `settle()` every other navigation calls, so a streamed control was counted before it existed and the register write reported "the write was never attempted" for a page that renders it
- `e2e/flashcards.spec.ts` still asserted the Good button reads `10m` — the ladder where hard, good and easy all landed on the same rung, which is the defect that ladder was rewritten to remove. A test pinning behaviour the product deliberately moved off from is a specification of the old bug

**Diagnosed then; the two surviving faults are now addressed below — see "Why the cause was never established" further down this section for what changed and what remains unproven.** The e2e suite alternated between green and red full runs, with a different failing set each time. Two full runs captured: one **231 passed / 0 failed**, one **213 passed / 7 failed** across `responsive`, `schedule` (×4), `slides` and others — all of which pass in isolation. The failures were **not** the same defect:

- Five were "element not found / not visible" inside a 20 s assertion, spread across three unrelated files. That is the signature of a **server that cannot keep up**, not of three separate bugs.
- Two were `strict mode violation`: `getByRole('link', { name: 'Schedule' })` matched **both** the desktop sidebar link and the mobile tab-bar link at once. Both renderings are briefly present together while a slow re-render is in flight, and a locator that can match two elements is a latent failure even when it passes today.

**What is ruled out.** Not credential rate limiting — `playwright.config.ts` sets both `LIKO_RATE_LIMIT_DISABLED` and `LIKO_E2E`, the deliberate two-key override the limiter documents, precisely so this suite is never throttled. Not machine contention from other gates — a deliberate reproduction attempt under concurrent CPU load stayed green. Not any individual spec — each passes repeatedly in isolation.

**What remains, and what is now ruled out.** The suite is flaky at **both** worker counts, so "too much parallelism" is **not** the explanation:

| Run | Workers | Result |
|---|---|---|
| 1 | 4 | 231 passed, 0 failed |
| 2 | 4 | 213 passed, 7 failed |
| 3 | 1 | 231 passed, 0 failed (9.6 min) |
| 4 | 1 | 230 passed, **1 failed** (11.6 min) |

**Why the cause was never established, which is the useful part.** Playwright
clears `test-results/` at the *start* of every run, so run 2's trace was deleted
by run 3 and the only directory left standing belonged to a run that passed. The
instrument was configured (`trace: 'retain-on-failure'`, `screenshot:
'only-on-failure'`) and produced nothing, because its output was overwritten
before anyone read it. `outputDir` is now stamped per run, so a failure from
this morning is still on disk after this evening's run.

**The mechanism, established by construction rather than by luck.** Radix
`SelectItem` (`@radix-ui/react-select`, `dist/index.mjs`) does:

```js
const pointerTypeRef = React.useRef("touch");          // note: the string
onPointerDown: pointerTypeRef.current = event.pointerType;
onPointerUp:   if (pointerTypeRef.current === "mouse") handleSelect();
```

A mouse selection is gated on a `pointerdown` that reached **that item
instance**, and the ref's initial value is `"touch"`, which rejects the
pointerup. If the item's node is replaced between the two events the pointerup
lands on a fresh instance, `handleSelect` never runs, `onOpenChange(false)`
never runs, and the control stays open **indefinitely** rather than briefly.
`e2e/helpers/select.spec.ts` now proves both halves directly: a bare `pointerup`
leaves the control open on its old value, and the same pair in order selects and
closes.

**What is still not established** is that this caused the four runs above. It is
a defence against a verified mechanism, not a fix for a confirmed cause, and it
is recorded that way. The assertion is unchanged — the control must close — and
`chooseOption` now waits a bounded 3s for the close before falling back to the
keyboard, because the first version of that fallback tested `count()` synchronously
and made the suite worse (231 passed became 224 passed / 4 failed with
`locator.focus` timing out): Radix unmounts the listbox asynchronously, so a
control that *was* closing still answered `count() === 1` in that instant.
Both halves mutation-proved — with the click replaced by a bare pointerup the
helper still passes via the fallback, and with the fallback disabled as well it
fails with the original message.

**A second, unrelated flake surfaced once the evidence survived**, which is the
argument for having fixed the artefacts first. `landing.spec.ts` pressed Tab
immediately after `page.goto('/')`, which resolves on `load` while the skip link
is rendered client-side; on a loaded machine nothing was focused for the full 20s
and `locator(':focus')` reported "element(s) not found". It now waits for the
link to be attached before pressing the key that depends on it — a precondition,
not a substitute for the assertion.

Full suite after both fixes: **232 passed, 0 failed** (5.2 min), which is one
more than before because the mechanism proof is a new test.

Run 4 failed in `interactions.spec.ts:43` inside the shared `chooseOption` helper: `select stayed open after choosing an option`. The click landed on a visible option and the Radix listbox stayed mounted, so the helper's own close assertion timed out.

**Do not believe either of the two explanations that were tried and discarded.** Rate limiting is excluded — `playwright.config.ts` sets both `LIKO_RATE_LIMIT_DISABLED` and `LIKO_E2E` deliberately. CPU contention was excluded by a reproduction attempt that stayed green. Parallelism is now excluded by runs 3 and 4 differing **at one worker**. What remains is an intermittent UI-interaction timing fault around a Radix select, whose cause is **not established**. That exact test, run six times in isolation, passed **6/6**, so the fault needs the full-suite context and is not a per-test defect. The next step is a trace captured on a failing *full* run, since that is the only way it has ever been reproduced.

**And note what a tempting "fix" would actually be.** The timeout at `select.ts:97` is the helper's own assertion, so deleting or relaxing it would turn the gate green while changing nothing about the product — which is indistinguishable, from the output, from having fixed it. That is precisely the shape of change that makes a suite worse, because it removes the only evidence the fault exists.

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