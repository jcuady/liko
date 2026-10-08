# LIKO security posture

This document records what is actually implemented, what is planned, and what is
**not** yet true. The last category is the important one: marketing copy must
never claim a control that does not exist yet.

## OWASP mapping

| ID | Control | Implementation |
|---|---|---|
| **A01** Broken access control | Strict RBAC, two layers | `src/proxy.ts` gates routes before render; `requirePermission()` gates every server action and API route independently. Ownership scopes return 404 for cross-account reads rather than 403, so a tampered id cannot confirm a record exists. |
| **A02** Cryptographic failures | No client-side tokens | Session is a JWS in an `httpOnly`, `SameSite=Lax`, `Secure`-in-production, `Path=/` cookie. `e2e/auth.spec.ts` asserts nothing matching `token`, `jwt`, or `liko_session` reaches `localStorage` or `sessionStorage`. Passwords use scrypt (N=16384, r=8, p=1, 32-byte random salt), compared with `timingSafeEqual`. |
| **A03** Injection | Validation at the boundary | Every server action and route handler parses input with a Zod schema before it reaches the API client. No queries exist in this codebase, so there is no string interpolation surface. |
| **A04** Insecure design | Rate limiting | Token-bucket limiter in `lib/security/rate-limit.ts`: auth 10 per 5 minutes per IP, password reset 3 per hour, AI endpoints 20 per minute per user. Server-side only. A client cooldown is cosmetic and never relied on. |
| **A05** Security misconfiguration | Response headers | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` set in `next.config.ts` and on every proxy response. `Strict-Transport-Security` in production only. `poweredByHeader` is disabled. |
| **A07** Identification and authentication failures | Verification and CSRF | Email verification is required before the workspace renders. CSRF defence is Origin and `Sec-Fetch-Site` validation on every state-changing request in `isSameOrigin`, plus `SameSite=Lax` cookies. Auth autocomplete attributes are set so password managers work, and paste is never blocked. |
| **A09** Logging | Auditable events | Login, logout, registration, password change, and permission denial are the events to emit. **Not yet wired** to a logging backend. `no-console` is enforced by lint so no component logs ad hoc. |

### Account enumeration

Registration and password reset return indistinguishable responses whether or
not the address is registered, and both are rate limited. Sign-in failure always
returns one generic message.

### Password reset

Supabase Auth owns reset delivery. `requestPasswordForEmail` sends the link and
`updateUser` applies the new password from the recovery session; the endpoint
returns the enumeration-safe response whether or not the address exists.

The previous homegrown token scheme (32 random bytes, peppered SHA-256, single
use, 30-minute lifetime) has been removed along with `generateResetToken`,
`hashResetToken` and `checkResetToken`. Their docblock claimed the delivery step
was unwired because it belonged to the API layer; that API layer now exists, and
reimplementing reset on top of an in-memory token table would have been a second,
weaker credential path beside the one Supabase already provides.

### Email verification

`proxy.ts` refuses any session whose `emailVerified` flag is false, so an
unverified account is never issued a cookie. Verification is completed by
`/auth/callback`, which consumes the token Supabase put in the emailed link,
flips the flag, and only then sets the session.

In fixture mode accounts are verified at signup. A fixture adapter cannot send
mail, and gating a demo account behind a step that can never be completed
reproduces exactly the dead end this replaced.

### Web push

Push subscriptions are rows in `push_subscriptions` with an RLS policy scoped to
`user_id = auth.uid()`. Subscription and removal routes require a session and
use the service key server-side only.

Two rules the code enforces:

- **The endpoint is allowlisted before it is ever requested.** The server makes
  an outbound HTTP request to whatever `endpoint` a subscriber supplies, so an
  unchecked URL is a blind SSRF into the instance metadata service or any host
  the app can reach. Validation is `https` only, no userinfo, no port other than
  443, and an exact-or-DNS-label-suffix match against the FCM, Mozilla and Apple
  push hosts. The label boundary is what rejects `fcm.googleapis.com.attacker.com`,
  which a plain `endsWith` would accept. It runs at subscription time so a bad
  row is never stored, and again at send time, because rows written before the
  rule existed are still in the table. A rejected endpoint is counted as a
  failed send and deliberately **not** pruned: deleting a teacher's device
  because our allowlist was wrong is the worse mistake.
- **The VAPID private key never leaves the server.** It is read only through
  `lib/env.ts` and is never returned by a route, logged, or prefixed
  `NEXT_PUBLIC_`. Anyone holding it can push to every subscriber on the project,
  so it is worth rotating if it has ever been shared outside the deployment.
- **Dead endpoints are pruned.** A `404` or `410` from the push service deletes
  the subscription rather than retrying it forever. Without this, endpoints for
  uninstalled apps accumulate indefinitely.

Notification content is generated server-side and is limited to what a teacher
would already see in the product: a count of flagged students, or a summary of
marks posted. Student names are not placed in push payloads, because a
notification can be shown on a lock screen.

## Data privacy posture

This is an education product, so the marketing page makes claims that need to be
true.

**Implemented and verifiable today:**

- Role-scoped access. A teacher sees only their own classes; a guardian sees only
  linked students. Enforced at the proxy and again at every data boundary.
- Exportable data by design. The product model assumes a user can always take
  their data out.
- No sensitive token in browser storage.
- No third-party analytics on authenticated surfaces.

**Intended but not yet operationally verified:**

- **FERPA-aligned handling.** The access model is built to support it: role
  scoping, audit events, exportability, and no data reuse. The administrative
  agreements, the institutional review, and the signed data-processing terms are
  *not* in place.
- **COPPA-aware defaults for K-12.** The product model avoids collecting data it
  does not need for younger students, but the age-banding logic and parental
  consent flows are not built.

**Explicit product commitment:**

- Student data is not used to train third-party models. AI features scope to an
  explicit request, and never include student records unless a user attaches
  them.

**Until the intended items are verified, they are written as posture, not as a
compliance guarantee.** The landing page FAQ says so and links here rather than
claiming certification.

## Audit findings and fixes

A full read of every server action, route handler, RLS policy and service-worker
rule found the following. All are fixed in code; the notes say how, because a fix
without a stated mechanism is a fix nobody can re-check after the next change.

| Severity | Finding | Fix |
|---|---|---|
| **Critical** | `profiles` had a `for all` RLS policy keyed on `id = auth.uid()`. RLS restricts rows, not columns, so any account could `PATCH /rest/v1/profiles?id=eq.<own uuid>` with `{"role":"admin"}` and promote itself. The app's own allowlist in `saveProfile` is irrelevant, because an attacker talks to PostgREST directly. | Column boundary added: `revoke update on public.profiles from authenticated` then `grant update` on only the seven self-editable columns. The single `for all` policy was split into a scoped `select` and an owner-only `update`. `role` and `org_id` are now server-owned. |
| **High** | Two `classes` select policies keyed only on the caller's role (`admin`, or `student`/`guardian`) with no tenant check. Postgres ORs permissive policies, so either one let **any** account read **every** class row in **every** school. The SQL comment claimed a scoping the body did not perform. | Both rewritten to require an active membership in the same organisation. `classes` has no `org_id`, so tenancy is resolved through `memberships` rather than the never-written `profiles.org_id`. |
| **High** | The service worker cached **every** document navigation, including `/overview`, `/grades` and `/attendance`, keyed by URL for an hour. On a shared device, a second user on a flaky network was served the previous user's dashboard HTML: student names, marks, grades. | Document caching is now an explicit allowlist of public routes; everything else is `NetworkOnly`. The allowlist fails safe: a new authenticated route is private with no action required. **This fix alone was not sufficient**, see the row below. |
| **High** | `cacheOnNavigation: true` in `next.config.ts` reopened the same leak from outside the app's own rules. The option patches `history.pushState` and `replaceState` so every client-side navigation posts a URL to the Serwist entry worker, which fetches it and stores the response in a runtime cache named `pages`. That runs inside the Serwist entry worker, so the allowlist in `src/sw.ts` never saw it. Signing in landed on `/overview`, which led to `/grades`, and both documents sat in a URL-keyed cache with the student's names and marks in them, to be served to whichever teacher signed in next on the same machine. Found by dumping the caches of a signed-in production build rather than by reading the code: the only cache present that no rule in `src/sw.ts` creates is named `pages`. | Set to `false`, which is already the library default, with the reasoning in the file so switching it on has to be deliberate. `e2e/pwa.spec.ts` now signs in, pulls `/overview` and `/grades/export` through the worker, and fails if either appears in **any** cache, which is the only way to catch a second vector that the rules in this repository do not own. |
| **Medium** | The push `endpoint` accepted any URL and the server later requested it, giving an authenticated user blind SSRF into cloud metadata or any internal host. | `https` only, no userinfo, no port but 443, and an exact-or-dns-label-suffix match against the FCM, Mozilla and Apple push hosts. Validated at subscription time and again at send time. |
| **Medium** | The service worker cached `/api/cron/at-risk` GET responses for five minutes. That endpoint is called by the scheduler, not a browser, so the rule had no legitimate target. | The `/api/` GET rule was deleted. There is no browser-side read through `/api/` at all; every read goes server-side to PostgREST. |
| **Medium** | `LIKO_RATE_LIMIT_DISABLED=true` disabled the only brute-force control in the product, in any environment, from one env var. | Ignored in production. The single production exception, the end-to-end suite driving a `next start` build, requires **two** deliberate variables, so a stray flag in a deploy dashboard still resolves to limits being active. |
| **Medium** | The session secret was only rejected when *empty*. `LIKO_SESSION_SECRET=a` was accepted and signed every session with a brute-forceable HS256 key. | Production now rejects anything under 32 bytes, measured after base64 decode when the value is base64. The error names the requirement and never echoes the value. |
| **Medium** | `safeNext` rejected `//evil.com` but accepted `/\evil.com`. The URL parser normalises `\` to `/` for special schemes, so that form resolves to the host `evil.com`. Two copies of the predicate had drifted identically. | One tested implementation in `src/lib/security/redirect.ts`, shared by `proxy.ts` and `registerAction`. It resolves the candidate against a known origin and returns it only if the origin survived, rather than pattern-matching shapes. |
| **Low** | `setMemberRole` wrote another user's `profiles.role` through the caller's own session, which the `profiles own row` policy filtered out. PostgREST returns no error for a zero-row update, so the action reported "Role updated." for a change that never happened. | The write goes through the service-role client, and the affected row count is reported rather than assumed. |

### Consent records

Accepting the terms writes an append-only row to `consent_events`, which has row
level security enabled and **no policy at all**. With no policy the authenticated
role can neither read nor write it, and only the service role can. That matters
because `profiles` permits a user to update their own row, so any timestamp
stored there would be a value the account holder could edit, which is exactly the
value that has to be beyond their reach to be worth keeping.

The record stores the version of the published text that was in force at the
moment of acceptance, so "what had this person agreed to on the day they signed
up" still has an answer after the terms are edited.

### Students cannot register themselves

`registerSchema` has no `role` field at all. Zod strips unknown keys, so a
crafted post carrying `role: "student"` parses successfully and the role is
discarded; `registerAction` passes a fixed `instructor`. A student or guardian
account comes into existence only through `createStudent`, which a teacher
invokes from a roster. The link between the account and the child's record is
`students.account_id`, which the database refuses to let anyone but the class
owner change.

## Known gaps

| Gap | Impact | When it closes |
|---|---|---|
| Rate-limit state is per-process | A multi-instance deploy multiplies the limit | Move to a shared store; the interface is already the seam. Documented at the top of `rate-limit.ts` as an honest local brake, not a distributed limit |
| No session revocation | A stolen cookie is valid until it expires | Add a token version or deny-list |
| Session secret strength | Enforced now: production rejects anything under 32 bytes, measured after base64 decode | Closed. A deploy without a strong secret throws at first use rather than signing with a guessable key |
| In-memory user store | Accounts reset on restart | Fixture mode only; `supabase` mode uses Supabase Auth |
| No CSP | Third-party script injection is harder to detect | Add a nonce-based policy once the real asset set is known. `layout.tsx` injects one inline script today, for the no-js class flip |
| scrypt, not argon2id | scrypt with these parameters is acceptable; argon2id is the current preference | `lib/auth/password.ts` is the only file that changes |
| Legal text not legally reviewed | The terms, privacy notice and cookie notice are written to be accurate about this implementation, but nobody qualified has reviewed them | Before any external launch. They describe the system as built, which is the most they can do |
| Cross-tenant RLS proven only by reading | The policy fixes are correct as written and reviewed, and `pnpm check:sql` proves the file parses and every relation it names exists. What it cannot do is execute it. `pnpm db:check` confirms the live project has 0 of the 16 tables, so there is nothing to exercise yet | Apply the migration, then `pnpm db:settle`, which signs in as a real student in a throwaway tenant and asserts both exploits fail |

## Reporting a vulnerability

Not yet published. Add a security contact and a disclosure policy before any
external launch. An unreported vulnerability channel on a product holding student
data is a gap worth closing early.