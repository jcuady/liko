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
| Auth: signup, verification, reset, RBAC | Done, verified in fixture mode |
| All seven workspace modules | Done, real CRUD through the seam |
| Offline write queue | Done |
| Web push: routes, cron, service worker | Code done, untested against a live service |
| Migration SQL | Written and idempotent, **not yet applied** |
| Seed script | Written, **never run** (no service key yet) |
| Git history | One commit on `main`, remote set, **not yet pushed** |
| Deployment | **Never attempted** |

The honest summary: the app is complete and self-consistent in `fixtures` mode,
and nothing has been executed against a live database or a live push service.
Steps 1 and 2 are what turn it from verified-in-fixture to verified-for-real.

---

## Step 1: Apply the database schema

The Supabase MCP server is registered but its OAuth was never completed, so no
database tools are exposed to the agent.

**1a.** Open <https://mcp.supabase.com/mcp> and complete the OAuth, selecting
project `ulrjitekiylgepdyijsw`.

**1b.** Apply the migration. Either route works:

- Through the MCP server once OAuth is done, or
- Open the project dashboard, paste
  `supabase/migrations/20260101000000_initial_schema.sql` into the SQL editor,
  and run it.

The migration creates 10 tables, 2 triggers, enables RLS on every table, and
adds `students` and `grades` to the `supabase_realtime` publication. It is
idempotent, so re-running it is safe.

**Verify:** the `profiles`, `classes`, and `students` tables exist and
`pg_tables` reports `rowsecurity = true` for all ten.

---

## Step 2: Add the service role key and seed

`SUPABASE_SERVICE_ROLE_KEY` is blank in `.env.local`. Find it in the dashboard
under Settings, API. It bypasses RLS entirely, so it stays server-side and must
never be prefixed `NEXT_PUBLIC_`.

Then set the mode and seed:

```bash
node -e "const fs=require('fs');const p='.env.local';let s=fs.readFileSync(p,'utf8');s=s.replace(/^LIKO_DATA_MODE=.*$/m,'LIKO_DATA_MODE=supabase');fs.writeFileSync(p,s)"
node --env-file=.env.local scripts/seed.mjs
```

The seed creates five verified test accounts, all with password
`LikoDemo!2026`:

| Email | Role | Notes |
|---|---|---|
| `maya@liko.test` | instructor | Owns Chemistry, Period 2 |
| `dev@liko.test` | admin | Owns Science, Period 4 |
| `ingrid@liko.test` | instructor | Owns Physical Science, Year 1 |
| `student@liko.test` | student | Owns no class, holds only scoped grants |
| `guardian@liko.test` | guardian | Owns no class, holds only linked grants |

The last two exist so every column of the RBAC matrix is reachable by a real
account. An earlier version of this document described Ingrid as a parent; the
seed has always created her as an instructor, and the fixture store now mirrors
the seed exactly.

The same five accounts are seeded into the in-memory store when
`LIKO_DATA_MODE=fixtures`, so `pnpm dev` and the Playwright suite have working
logins without a database. The script refuses to run under `NODE_ENV=production`.

> These are demo credentials in a public repository. Delete them, or change the
> password, before any real launch.

---

## Step 3: Rotate the VAPID key pair

The private key supplied for this build appears in the project chat transcript.
Anyone holding it can push a notification to every subscribed user. Generate a
fresh pair before launch:

```bash
npx web-push generate-vapid-keys
```

Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `.env.local` and
in the Vercel project. Existing browser subscriptions are bound to the old key,
so testers must re-enable notifications once after the rotation.

---

## Step 4: Publish to GitHub

No GitHub credential is available to the agent: `gh` on PATH is an unrelated npm
package, and no token is present in the environment. The remote is already set
to a private repository, so only the push is left.

1. Create the repository on <https://github.com/new>. Owner `jcuady`, name
   `liko`, visibility **private**. It was chosen deliberately: this is unreleased
   product code, and the repository names the Supabase project and ships demo
   credentials in the seed script.

```bash
git push -u origin main
```

Git Credential Manager will prompt for a browser sign-in on first push.

What is already guaranteed: `.env.local` is ignored by `.gitignore:21`, no
secret value appears in any tracked file, and `.env.example` is a blank
template. The Klim Söhne fonts are excluded too, because their bundled licence
is personal-use only and the product ships Geist.

---

## Step 5: Deploy to Vercel

```bash
vercel login
vercel link
```

Then add every production variable from the Deployment section of `README.md`.
`LIKO_DATA_MODE=supabase` is the one that matters most: it defaults to
`fixtures`, so omitting it ships the demo workspace to real users.

```bash
vercel --prod
```

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

1. **The whole Supabase path.** Every read and write through the seam ran against
   the fixture adapter. The Supabase adapter has never executed.
2. **iOS push delivery.** It needs a Home Screen-installed PWA and a real
   subscription. No automated test can cover it.
3. **The at-risk cron.** `/api/cron/at-risk` has never been invoked. Its 7-day
   dedupe writes `student_history` rows with `event_type = 'intervention'` and a
   `payload.alert` flag, because the CHECK constraint has no `at_risk_alert`
   value.
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