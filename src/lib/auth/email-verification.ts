/**
 * Whether a new account is issued a usable session without an emailed
 * confirmation link.
 *
 * WHY THIS EXISTS. Supabase's built-in email service on this project has
 * exhausted its send quota, so `signUp` creates the account and then nobody can
 * complete `/verify-email`. `proxy.ts` refuses any session whose email is not
 * confirmed, so every person who registers is parked on "Check your inbox"
 * forever. That is the one block on the product that no amount of code fixes: it
 * needs a real SMTP provider, which is a dashboard decision, not a change.
 *
 * This flag removes the email round trip and nothing else. The account is still
 * created through Supabase Auth, the password is still hashed by the auth
 * service, the session is still a real Supabase session, and every row-level
 * security policy still evaluates against that session's identity. What is gone
 * is the proof that the address belongs to whoever typed it.
 *
 * WHAT THAT COSTS, PLAINLY. With this on, anybody can register using an address
 * they do not own. They cannot read another account's data, because none of that
 * is reachable without the password. What they can do is occupy an address that
 * somebody else would later try to register with, and take the name a person
 * would have chosen for their own account. For a real rollout that is a cost
 * worth paying to have email verification on instead.
 *
 * WHY IT TAKES TWO VARIABLES. `rate-limit.ts` already established the rule for
 * this codebase: an environment variable is not a security boundary, nobody
 * reviews the diff that sets one, and a `.env.local` copied into production is
 * exactly the accident that turns a protection off. A single stray
 * `LIKO_SKIP_EMAIL_VERIFICATION` in a deploy dashboard therefore does nothing on
 * a production deployment. Turning this off in production takes two deliberate
 * choices in the same place, and the single stray one resolves to verification
 * being enforced.
 */

/** One warning per process per condition, so a busy route cannot flood the log. */
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  process.emitWarning(message, 'LikoEmailVerification');
}

/**
 * Cleared between tests so the once-per-process warning can be asserted.
 * Exported for the test file only; nothing else calls it.
 */
export function resetEmailVerificationWarnings(): void {
  warned.clear();
}

/**
 * True when a signup should be confirmed at creation rather than by email.
 *
 * In development and test a single variable is enough. In production it takes
 * `LIKO_ALLOW_UNVERIFIED_SIGNUP` as well, and refuses loudly when only one of
 * the two is present, because a flag that half works is a flag nobody can reason
 * about later.
 */
export function emailVerificationSkipped(): boolean {
  if (process.env.LIKO_SKIP_EMAIL_VERIFICATION !== 'true') return false;

  const env = process.env.NODE_ENV ?? 'development';

  if (env === 'production') {
    if (process.env.LIKO_ALLOW_UNVERIFIED_SIGNUP !== 'true') {
      warnOnce(
        'ignored',
        'SECURITY: LIKO_SKIP_EMAIL_VERIFICATION is set but NODE_ENV is "production" and ' +
          'LIKO_ALLOW_UNVERIFIED_SIGNUP is not, so it is being IGNORED and email ' +
          'verification is ENFORCED. Turning it off on a live deployment takes both ' +
          'variables on purpose.',
      );
      return false;
    }

    warnOnce(
      'live',
      'SECURITY: email verification is DISABLED on this live deployment because ' +
        'LIKO_SKIP_EMAIL_VERIFICATION=true alongside LIKO_ALLOW_UNVERIFIED_SIGNUP=true. ' +
        'Accounts are created and signed in without anyone proving they own the ' +
        'address. That is acceptable for a deployment people are testing. Remove ' +
        'LIKO_ALLOW_UNVERIFIED_SIGNUP before this carries real student data.',
    );
    return true;
  }

  return true;
}