/**
 * Why a signup failed, reduced to what is safe to tell the person.
 *
 * WHY THIS IS ITS OWN MODULE. The classification is the whole of the fix and it
 * needs testing on its own, and `store.ts` reaches `server-only` modules through
 * `@/lib/supabase/server`, so importing it from a unit test would drag a server
 * boundary into a test that has no business crossing one. The function is pure,
 * so it lives somewhere it can be pinned.
 *
 * THE TWO ANSWWERS, AND WHY THEY DIFFER.
 *
 * `ACCOUNT_NOT_CREATED` is deliberately opaque. Supabase distinguishes "already
 * registered" from every other failure, and repeating that distinction is how an
 * address list gets enumerated. Everything that is not provably transient gets
 * this answer.
 *
 * `SIGNUP_RATE_LIMITED` is the exception, and it is safe to name. Supabase
 * returns it identically for every address, so it discloses nothing about
 * whether an account exists, and it is the one failure where the generic advice
 * is actively harmful: "check the details and try again" sends someone off to
 * correct a form that was already right, when the only thing that helps is
 * waiting for the quota. This was not hypothetical. Running the register form
 * against a real project returned `over_email_send_rate_limit`, and every real
 * teacher would have been told to check their spelling.
 */

export type SignupFailure = 'SIGNUP_RATE_LIMITED' | 'ACCOUNT_NOT_CREATED';

/** The slice of a Supabase `AuthError` this decision depends on. */
export interface SignupErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * Codes Supabase uses when it will not send another email right now.
 *
 * Matched as a pattern rather than a list so a new provider-side code is caught
 * by shape: anything that reads as a rate limit is treated as one, because the
 * cost of guessing wrong is only a slightly wrong retry hint.
 */
const RATE_LIMIT_PATTERN = /rate_limit|too[_ ]?many|over_email|over_request/i;

export function classifySignupFailure(
  error: SignupErrorLike | null | undefined,
): SignupFailure {
  if (!error) return 'ACCOUNT_NOT_CREATED';

  if (error.status === 429) return 'SIGNUP_RATE_LIMITED';

  const described = `${error.code ?? ''} ${error.message ?? ''}`;
  return RATE_LIMIT_PATTERN.test(described) ? 'SIGNUP_RATE_LIMITED' : 'ACCOUNT_NOT_CREATED';
}

/**
 * What each failure is allowed to say.
 *
 * WHY THE COPY LIVES HERE AND NOT IN THE ACTION. The action that renders it
 * is a server action, so it cannot be unit tested without dragging a server
 * boundary into the test, which is the same reason the classification moved
 * here in the first place. The two halves of the answer were split across two
 * files with nothing pinning them together: the classification was tested and
 * the wording was not, so a mapping could be inverted and the suite would
 * still be green.
 *
 * THE RATE-LIMITED MESSAGE NAMES THE EMAIL, AND THAT IS SAFE HERE AND NOT ON
 * THE RESET PATH. Measured on 2026-11-01: while the project's email allowance
 * is spent, `POST /auth/v1/signup` answers `429 over_email_send_rate_limit`
 * for every address, registered or not, so naming it discloses nothing about
 * who has an account. `POST /auth/v1/recover` does NOT do that: it answered
 * 429 for four registered addresses and 200 for four unregistered ones in the
 * same minute, so a reset path that named the rate limit would be handing out
 * the registration list. That asymmetry is why the reset path still says
 * nothing, and it is recorded in `docs/SECURITY.md`.
 */
export function signupFailureMessage(failure: SignupFailure): string {
  return failure === 'SIGNUP_RATE_LIMITED'
    ? 'We could not send your confirmation email just now. Wait a few minutes and try again.'
    : 'We could not create that account. Check the details and try again.';
}