# Handover runbook

Everything in this repository is code-complete and passes its gate. What remains
are the steps that need a signed-in browser session, an account you own, or a
secret only you can read. This file is the ordered list.

Project: `https://ulrjitekiylgepdyijsw.supabase.co`

---

## Status

| Area | State |
|---|---|
| Landing page, pricing, brand | Done, audited |
| Auth: signup, verification, reset, RBAC | Done, verified in fixture **and** Supabase mode |
| All seven workspace modules | Done, real CRUD through the seam, verified against the live database |
| Offline write queue | Done |
| Web push: routes, cron, service worker | Sweep proven against the live database; actual delivery still untested |
| Migration SQL | Applied to `ulrjitekiylgepdyijsw`, idempotent, 16 tables |
| Seed script | Run. Five accounts, one school, three classes, 24 students |
| Git history | 22 commits on `main`, pushed, remote verified identical |
| Deployment | **Never attempted.** Vercel is unauthenticated |

The honest summary: every read and write through the seam has now run against the
real database, not just the fixture adapter. `pnpm db:check`, `pnpm db:settle` and
`pnpm verify:app` are the commands that prove it, and all three are green. What
remains is the step that needs a signed-in Vercel account, plus two things that
need hardware or a lawyer.

### The seeded demo data

`node --env-file=.env.local scripts/seed.mjs` creates five confirmed accounts, all
with password `LikoDemo!2026`:

| Email | Role | Notes |
|---|---|---|
| `maya@liko.test` | instructor | Owns Chemistry, Period 2. Seat: instructor |
| `dev@liko.test` | admin | Owns Science, Period 4. Seat: admin |
| `ingrid@liko.test` | instructor | Owns Physical Science, Year 1. Seat: instructor |
| `student@liko.test` | student | Owns no class. Linked to Ana Ferreira's record |
| `guardian@liko.test` | guardian | Owns no class. Reached through Ben Osei's guardian address |

All five hold seats in one seeded school, which is what gives the admin console
something to read. The same five are mirrored into the in-memory store under
`LIKO_DATA_MODE=fixtures`, so `pnpm dev` and the Playwright suite have working
logins with no database. The script refuses to run under `NODE_ENV=production`
and is safe to re-run.

> These are demo credentials in a repository. Delete them, or change the
> password, before any real launch.

---

## Step 1: Deploy to Vercel

This is the only step left that the agent cannot do. `vercel whoami` times out,
so there is no session to deploy with.

```bash
vercel login
vercel link
vercel --prod
```

Then add every production variable from the Deployment section of `README.md`.
Two of them are the ones that break silently if missed:

| Variable | What happens if it is wrong |
|---|---|
| `LIKO_DATA_MODE=supabase` | It defaults to `fixtures`, so the demo workspace ships to real users |
| `CRON_SECRET` | The daily at-risk sweep answers 401 and nobody is ever alerted. It fails closed by design, so it looks like a healthy no-op |

The other variables are the Supabase URL and keys, `LIKO_SESSION_SECRET`,
`NEXT_PUBLIC_SITE_URL` pointed at the real domain, and the VAPID pair.

---

## Step 2: Give Supabase a real email provider

**Nobody can register until this is done.** The project returns
`over_email_send_rate_limit` for every signup and every password reset, so the
register form fails for every real teacher and the "forgot password" link never
arrives. This is not a code fault and no amount of fixing the code will help: the
built-in provider is quota-limited on this project's plan.

It went unnoticed for a long time for a specific reason. The seed creates its
accounts through `auth.admin.createUser`, which sends no email, so every test in
the suite passed. The quota only surfaced when a person actually filled in the
register form against the live project.

In the Supabase dashboard, under Authentication, add a custom SMTP provider
(SendGrid, Resend, Postmark) and point Auth at it. Raising the plan works too.

Until that is done, the signup path, the `handle_new_user` trigger and the
`consent_events` write are **unverified against the live database**. Sign-in is
verified, because it needs no email.

---

## Step 3: Rotate the VAPID key pair and the Supabase service key

The private key supplied for this build, and the service role key and database
password, appear in the project chat transcript. Anyone holding the service key
can read and write every table, bypassing RLS entirely. Generate fresh values
before launch:

```bash
npx web-push generate-vapid-keys
```

Then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and the Supabase
keys, in `.env.local` and in the Vercel project. Existing browser subscriptions
are bound to the old VAPID key, so testers must re-enable notifications once
after the rotation.

---

## Post-deploy verification

Work through this against the live URL before calling it launched.

- [ ] Sign up with a fresh email, receive the verification mail, land on
      `/overview?verified=1`
- [ ] Sign in as `maya@liko.test`, confirm the seeded classes and students load
- [ ] Create a class, add a student, mark attendance, enter a grade, and reload
      to confirm every write survived
- [ ] Enable notifications in Settings. Chrome or Edge desktop is the reliable
      path. iOS requires Add to Home Screen and cannot be verified here
- [ ] Load the app with the network disabled, mark attendance, then restore the
      connection and confirm the outbox drains
- [ ] Confirm `LIKO_DATA_MODE=supabase` is live, by checking that a brand-new
      account sees no seeded demo data

---

## Known untested surfaces

Stated plainly so nobody is surprised later.

1. **The signup path.** Blocked, not merely untested. Supabase's built-in email
   quota is exhausted on this project, so `signUp` never returns a user. That
   leaves three things that only run during registration unproven against the
   live database: `signUp` itself, the `handle_new_user` trigger, and the
   `consent_events` write. All three are exercised in fixture mode and all three
   are straightforward. What makes this more than a coverage gap is that
   `recordConsent` swallows its own failure by design, so once the email provider
   is fixed, the first thing to check is that `consent_events` actually gains
   rows. A signup that succeeds while the audit table is broken is exactly the
   failure that returns nothing to catch it.
2. **iOS push delivery.** It needs a Home Screen-installed PWA and a real
   subscription. No automated test can cover it. Chrome and Edge desktop are the
   reliable path.
3. **The push send itself.** Almost everything is proven: subscription storage, the
   SSRF allowlist against six hostile payloads including the suffix tricks a naive
   host check would accept, per-teacher ownership on delete, the sweep finding a
   subscribed teacher, and an outbound dispatch that reaches the push service and
   treats a permanent 404 as permanent by deleting the dead row instead of
   retrying it forever. What is unproven is a notification actually appearing on
   a device, which needs a real browser subscription. Chrome and Edge desktop are
   the reliable path; iOS needs Add to Home Screen.
4. **Payment.** The pricing page is presentation only. No billing provider is
   wired, so the Starter tier is genuinely free rather than free-with-a-card.

---

## Deliberate deviations

Disclosed rather than hidden.

- **The masterplan forbids designing a database.** The project owner overrode
  this on 2026-10-07, because an auth-only product cannot be a real product.
  The override, its date, and its reason are recorded in `docs/ARCHITECTURE.md`.
- **The hero was specified as four text elements.** It became five, once the
  "no credit card required" reassurance line was added for conversion. The code
  comment was updated to match.
- **Seven section eyebrows remain** against the design rule of one per three
  sections. The supplied reference image requires them.
- **Reset-token helpers were removed, and the unit suite shrank with them.**
  `generateResetToken`, `hashResetToken` and `RESET_TOKEN_TTL_MS` sat in
  `src/lib/auth/password.ts` calling nothing, and `hashResetToken` carried a
  hardcoded `'liko-development-secret'` fallback. They are gone, along with the
  three tests that exercised them, so the suite runs 44 tests rather than 47. The
  count matters more than the coverage: a credential helper that ships but is
  never called is a liability, and `docs/SECURITY.md` already claimed the token
  scheme had been removed. The code now matches the document.