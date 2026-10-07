# LIKO product

## What it is

LIKO is a teacher productivity workspace. The organising idea is **the Flow**:
one continuous path through **Plan → Create → Assess → Grade → Analyze**, rather
than five tools that each hold a fragment of the same term.

The name comes from that path. The mark is a single continuous stroke that enters
low, rises, and exits high, doubling as a stylised L.

## Who it is for

**Maya, 34, high-school chemistry teacher.** Four sections, 118 students. Lives
in three apps and a spreadsheet. The pain is not that any one tool is bad; it is
re-entering the same data several times a week.

**Dev, 41, department head at a private K-8.** Needs to see which students are
slipping before the term ends, not after report cards are written.

**Ana, 19, first-year university student.** Wants her own progress in one place
without emailing five professors.

**Rosa, 46, Ana's mother.** Wants a read-only view of her daughter's attendance
and grades, without asking her daughter to read them out.

**Priya, marketing operations.** Reached the site from search and decides within
about three minutes whether to keep reading.

## The problem being solved

Three failures break a teacher's week, and none of them are fixed by a single
better tool:

1. **The plan gets retyped.** It lives in a document, the timings in a
   spreadsheet, the objectives in the LMS. They disagree by week three.
2. **The mark loses its reason.** A spreadsheet gives you a number. When a
   student or a parent asks how it was reached, the rubric reasoning is gone.
3. **The drop-off is found late.** By the time the pattern is obvious the term is
   over and the intervention that would have worked is six weeks behind.

## Design principles

**The hero mockup is the real product.** The device frames on the landing page
contain the shipping `OverviewDashboard`, `GradebookGrid`, and `AttendanceGrid`
components at reduced scale. There is no second implementation to fall out of
date, and a hand-built div mockup drifting from the real UI is the most common
way a SaaS landing page loses trust.

**Placeholders say when they are placeholders.** Unbuilt modules ship as routed,
permission-gated empty states that name what the module will do and when it
lands. A screen that looks broken trains people to distrust the product.

**Copy states only what is true.** No unsourced statistics about teachers. Any
figure without a published source is labelled illustrative in the product notes.
FERPA and COPPA claims in `docs/SECURITY.md` are written as the current posture,
including what is implemented and what is planned, not as a guarantee.

**Offline is a feature, not an error.** A teacher takes attendance in a corridor
with no signal. That has to work, queue, and sync.

## Voice

Plain, concrete, and specific. Banned verbs: elevate, seamless, unleash,
next-gen, revolutionize, supercharge. No em dashes in visible copy. No emoji. No
section-number labels.

## What is built now

- Production landing page with ten sections and two scroll narratives
- Complete design system: Viridian token set, Geist type, motion scale
- PWA: manifest, generated icons, Serwist service worker, offline fallback
- Authentication: register, sign in, reset password, email verification,
  rate limiting, CSRF origin checks
- Role-based access control across instructor, admin, student, and guardian
- Workspace shell: sidebar, mobile tab bar, command palette, offline banner
- Six module routes with working empty states, plus a working attendance screen
- 44 unit tests and three Playwright suites

## What is next

The six MVP modules, in this order: roster and attendance, lesson planner,
assessment builder, gradebook, at-risk heatmap, report-card export. The API seam
is defined and fixture-backed, so each module is a vertical slice rather than a
rewrite.