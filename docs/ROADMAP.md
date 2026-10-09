# LIKO roadmap

## Delivered

**Foundation**

- Next.js 16.4 App Router, React 19.3, Tailwind v4 with a CSS-first `@theme`
- Viridian token set with paired dark mode, Geist type stack, motion scale
- ESLint 9 flat config, TypeScript strict, Vitest, Playwright

**Brand**

- SVG mark and wordmark, mark construction diagram
- Icons generated at build time by `next/og`, so they can never drift from the
  mark: app icon, maskable icon, Apple touch icon, OpenGraph image

**PWA**

- Serwist service worker with per-resource-class caching
- Generated manifest, offline fallback page, offline banner, background-sync
  queue for failed writes

**Authentication**

- Register, sign in, reset password, email verification
- JWS sessions in httpOnly cookies, scrypt password hashing, peppered reset
  tokens, rate limiting, CSRF origin checks
- Four-role RBAC matrix enforced at the proxy and again at every data boundary

**Workspace**

- Responsive shell: sidebar on desktop, bottom tab bar on mobile, command
  palette, theme toggle
- Overview, working attendance capture, five module routes with honest empty
  states, settings

**Marketing**

- Ten-section landing page, editorial split hero, two scroll narratives (sticky
  Flow stack, horizontal Roles pan) on the one Motion runtime
- Trust marquee using real Simple Icons glyphs, bento grid of live product
  components, FAQ, final CTA

**Quality**

- 214 unit tests across 16 files, 156 Playwright tests across 12 specs,
  production build verified
- Four live-database gates: `db:apply`, `db:check`, `db:settle` and
  `verify:app`. They need credentials, so they are run by hand rather than in CI

---

## Delivered: the six MVP modules

Each was a vertical slice. All six now read and write real data through the
seam, and `pnpm verify:app` proves each renders with seeded data against a live
Postgres rather than an empty state.

1. **Roster and attendance.** CSV import by heading alias, with a preview before
   anything is written. Attendance marks cycle per cell and persist through a
   server action.
2. **Lesson planner.** Plans per class, standards attached, saved and reloaded.
3. **Assessment builder.** Weighted assessments with types, due dates and
   standard codes.
4. **Gradebook.** Persistent marks, five built-in scales plus custom ones,
   weighted totals, keyboard model, CSV export.
5. **At-risk heatmap.** Derived from real marks and absences, encoded with
   colour plus pattern plus label. A daily sweep alerts on the same threshold
   rule, so the heatmap and the alert cannot disagree about who is at risk.
6. **Report cards.** Not built. Deliberately deferred: it needs a PDF pipeline
   and a layout decision, and neither is worth doing before the product has
   users.

Each module appears in the landing page hero and bento, because those render the
shipping components rather than pictures of them.

## Also delivered

- Push notifications: VAPID subscription, service worker, background sync, and
  a daily at-risk cron verified against the live database
- Multi-tenant institution management: one school, five seats, four roles
- Student and guardian read-only access at real scope depth, enforced by RLS and
  proven by `pnpm db:settle`

## Still queued

- AI lesson drafting, scoped per request, with a visible request log
- SIS and LMS roster import, beyond the CSV importer that shipped

---

## Resolved decisions

**The API layer.** RESOLVED on 2026-10-07, when the project owner overrode the
masterplan's instruction not to design a database. `lib/api/client.ts` selects
between PostgREST and an in-memory fixture workspace at boot, so the product runs
with no network and no credentials while the same code path serves real users.
Sessions are issued by LIKO, rate-limit state is per-process, and the
ownership-scoping filters are duplicated as explicit `.eq('owner_id', userId)`
calls on top of RLS.

**Session revocation.** Still absent. A stolen cookie is valid until it expires.

## Open decisions

**Söhne licensing.** Geist ships. If a Söhne licence is bought, the change is two
imports in `app/layout.tsx`.

**Serwist and Turbopack.** Both `dev` and `build` pass `--webpack`. When Serwist
leaves experimental Turbopack support, drop the flag from both scripts. Nothing
else changes.

**Statutory compliance claims.** FERPA and COPPA posture is documented as intent
in `docs/SECURITY.md`, not as a guarantee, until the administrative agreements
exist. Marketing copy must not harden before the operational work does.

**Disclosure channel.** A security contact and vulnerability disclosure policy
need to exist before any external launch.

**Genuine testimonials.** The three quotes in the proof section are illustrative
placeholders and are labelled as such in the product notes. They need real,
consented teacher quotes, or removal.

**Brand board raster.** The code-native brand system is complete and is the
system of record. A rendered 3x3 presentation board was scoped but the image
tooling call failed on this machine, so it is outstanding.