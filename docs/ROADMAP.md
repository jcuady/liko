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

- Ten-section landing page, editorial split hero, two GSAP scroll narratives
- Trust marquee using real Simple Icons glyphs, bento grid of live product
  components, FAQ, final CTA

**Quality**

- 44 unit tests, three Playwright suites, production build verified

---

## Next: the six MVP modules

Each is a vertical slice, in this order. See the build order in
`docs/ARCHITECTURE.md`.

1. **Roster and attendance.** Import from spreadsheet or LMS. Attendance is
   already interactive and optimistic; it needs a real write path.
2. **Lesson planner.** One plan reused across sections, standards attached.
3. **Assessment builder.** Question types inheriting plan context, rubrics.
4. **Gradebook.** Replace the fixture grid with persistence, keep the keyboard
   model, add rubric reasoning per mark.
5. **At-risk heatmap.** Real thresholds, configurable, with the existing
   colour-plus-pattern-plus-label encoding preserved.
6. **Report cards.** PDF export from data already entered.

Each module automatically appears in the landing page hero and bento, because
those render the shipping components.

## Also queued

- AI lesson drafting, scoped per request, with a visible request log
- SIS and LMS import
- Push notifications
- Multi-tenant institution management
- Parent and student read-only portals at real scope depth

---

## Open decisions

**The API layer.** `lib/api/client.ts` is fixture-backed. The shape of the real
API determines several things downstream: whether sessions are issued by LIKO or
by an external identity provider, whether rate-limit state moves to a shared
store, and what the ownership-scoping filters look like. **This is the blocking
decision for the module work.**

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