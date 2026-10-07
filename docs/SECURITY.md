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

## Known gaps

| Gap | Impact | When it closes |
|---|---|---|
| Rate-limit state is per-process | A multi-instance deploy multiplies the limit | Move to a shared store; the interface is already the seam |
| No session revocation | A stolen cookie is valid until it expires | Add a token version or deny-list when the real API lands |
| Development secret fallback | A production deploy without `LIKO_SESSION_SECRET` would throw loudly, not silently sign with a guessable key | Already enforced; `signSession` throws in production |
| In-memory user store | Accounts reset on restart | Replaced by the API adapter |
| No CSP | Third-party script injection is harder to detect | Add a nonce-based policy once the real asset set is known |
| scrypt, not argon2id | scrypt with these parameters is acceptable; argon2id is the current preference | `lib/auth/password.ts` is the only file that changes |

## Reporting a vulnerability

Not yet published. Add a security contact and a disclosure policy before any
external launch. An unreported vulnerability channel on a product holding student
data is a gap worth closing early.