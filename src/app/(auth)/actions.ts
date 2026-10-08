'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from '@/lib/schemas/auth';
import { RATE_LIMITS, clientKey, consume, consumeCredential } from '@/lib/security/rate-limit';
import { safeNextPath } from '@/lib/security/redirect';

import { checkPasswordStrength } from '@/lib/auth/password';
import { recordConsent } from '@/lib/auth/consent';
import { clearSessionCookie, setSessionCookie } from '@/lib/auth/cookie';
import {
  completePasswordUpdate,
  requestPasswordReset,
  resendConfirmation,
  signUp,
  verifyCredentials,
  verifyEmailToken,
} from '@/lib/auth/store';
import { isSupabaseMode } from '@/lib/data-mode';
import { canAccessPath, landingPathFor, type Role } from '@/lib/auth/rbac';

/**
 * Auth server actions.
 *
 * Every action re-validates input with Zod, rate-limits by client, and folds
 * failures into one generic message so the form cannot be used to enumerate
 * which accounts exist.
 *
 * VERIFICATION. `proxy.ts` refuses any session whose `emailVerified` flag is
 * false, so an unverified user must never be issued one. That rule used to make
 * registration a dead end, because /verify-email had no way to flip the flag.
 * Now: Supabase mode sends a real confirmation email and `/auth/callback`
 * consumes the link; fixture mode verifies at signup, because an in-memory
 * adapter cannot send mail and gating a demo account behind an impossible step
 * reproduces the same dead end.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const GENERIC_FAILURE = 'That email or password is not right.';

/**
 * The one role this form may create.
 *
 * Students and guardians do not self-register. A student or guardian account is
 * issued by the teacher who owns the class, from `/classes`, and joins that
 * teacher's organisation as a member.
 *
 * This is named rather than inlined at the call site because it is a policy, not
 * a default. The schema has no `role` field at all, so Zod strips one from a
 * crafted post, and `registerSchema` therefore has no value to tamper with. This
 * constant is what the account actually gets. Changing it is a product
 * decision, not a refactor.
 */
const SELF_REGISTERED_ROLE = 'instructor' as const;

async function guardRateLimit(scope: string, limit = RATE_LIMITS.auth) {
  const requestHeaders = await headers();
  const key = clientKey(
    new Request('https://internal', { headers: requestHeaders }),
    scope,
  );
  const result = consume(key, limit);
  if (!result.allowed) {
    throw new Error('RATE_LIMITED');
  }
}

/**
 * Credential-endpoint guard.
 *
 * Counts per IP *and* per account, plus a looser per-IP ceiling. Keying on the
 * IP alone was the previous behaviour and it meant one school network shared a
 * single ten-attempt allowance, so the tenth sign-in that morning locked out
 * everyone else in the building.
 */
async function guardCredentialLimit(scope: string, email: unknown) {
  const requestHeaders = await headers();
  const subject = String(email ?? '').trim().toLowerCase() || 'unknown';
  const result = consumeCredential(
    new Request('https://internal', { headers: requestHeaders }),
    scope,
    subject,
  );
  if (!result.allowed) {
    throw new Error('RATE_LIMITED');
  }
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guardCredentialLimit('login', formData.get('email'));
  } catch {
    return {
      ok: false,
      message: 'Too many attempts. Wait a few minutes and try again.',
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) };
  }

  const result = await verifyCredentials(parsed.data.email, parsed.data.password);

  if (!result) {
    return { ok: false, message: GENERIC_FAILURE };
  }

  const { user } = result;

  if (!user.emailVerified) {
    return {
      ok: false,
      message:
        'Confirm your email address first. Open the link we sent, then sign in again.',
    };
  }

  await setSessionCookie(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerified: true,
    },
    { remember: formData.get('remember') === 'on' },
  );

  // Clamped to what this role may actually open. Without it a guardian
  // deep-linking to /overview was shown the forbidden screen as the first page
  // after signing in.
  redirect(safeNext(formData.get('next'), user.role));
}

export async function registerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guardCredentialLimit('register', formData.get('email'));
  } catch {
    return {
      ok: false,
      message: 'Too many attempts. Wait a few minutes and try again.',
    };
  }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    acceptedTerms: formData.get('acceptedTerms'),
    acceptedPrivacy: formData.get('acceptedPrivacy'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) };
  }

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) {
    return { ok: false, fieldErrors: { password: strength.problems[0] } };
  }

  let result: Awaited<ReturnType<typeof signUp>>;
  try {
    result = await signUp({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      role: SELF_REGISTERED_ROLE,
      redirectTo: `${siteUrl()}/auth/callback`,
    });
  } catch {
    // Same generic shape as a validation error, so a probing script learns
    // nothing about which addresses are registered.
    return {
      ok: false,
      message: 'We could not create that account. Check the details and try again.',
    };
  }

  /*
   * Consent is recorded before anything else happens with the new account, and
   * it is recorded server-side from the validated result rather than from the
   * posted form. The parse above is what makes the tick trustworthy; this call
   * is what makes it durable.
   *
   * `recordConsent` swallows its own failure by design, so an unavailable
   * audit table cannot deny an account the person is entitled to open. That
   * trade is written down in `src/lib/auth/consent.ts`.
   */
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await recordConsent({
    userId: result.user.id,
    email: result.user.email,
    subject: 'terms',
    source: 'self_registration',
    ip,
    userAgent: requestHeaders.get('user-agent'),
  });
  await recordConsent({
    userId: result.user.id,
    email: result.user.email,
    subject: 'privacy',
    source: 'self_registration',
    ip,
    userAgent: requestHeaders.get('user-agent'),
  });

  if (result.awaitingConfirmation) {
    // No session issued. The proxy would refuse one, so issuing it here would
    // only produce a redirect loop against /verify-email.
    redirect('/verify-email?pending=1');
  }

  await setSessionCookie({
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
    emailVerified: true,
  });

  redirect(
    result.user.role === 'instructor' || result.user.role === 'admin'
      ? // A new teacher lands on onboarding rather than the workspace. An empty
        // overview answers none of the questions the product asks, and asking
        // them here, once, is what makes the first screen mean something.
        '/welcome'
      : landingPathFor(result.user.role),
  );
}

/** Re-sends the confirmation email from /verify-email. */
export async function resendVerificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guardRateLimit('resend', RATE_LIMITS.passwordReset);
  } catch {
    return { ok: false, message: 'Too many requests. Wait before trying again.' };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) };
  }

  await resendConfirmation(parsed.data.email, `${siteUrl()}/auth/callback`);

  // Identical response whether or not the address exists.
  return {
    ok: true,
    message: 'If that address needs confirming, a new link is on its way.',
  };
}

export async function forgotPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guardRateLimit('forgot', RATE_LIMITS.passwordReset);
  } catch {
    return { ok: false, message: 'Too many requests. Wait before trying again.' };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) };
  }

  await requestPasswordReset(parsed.data.email, `${siteUrl()}/reset-password`);

  /*
   * Identical response whether or not the address is registered, so this
   * endpoint cannot be used to enumerate accounts. Under `supabase` mode a real
   * email now goes out. Under `fixtures` there is nowhere to send it, which is
   * why the wording says "if that address has an account".
   */
  return {
    ok: true,
    message: 'If that address has an account, a reset link is on its way.',
  };
}

export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guardRateLimit('reset', RATE_LIMITS.passwordReset);
  } catch {
    return { ok: false, message: 'Too many requests. Wait before trying again.' };
  }

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password !== confirm) {
    return { ok: false, fieldErrors: { confirm: 'Those passwords do not match.' } };
  }

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return { ok: false, fieldErrors: { password: strength.problems[0] } };
  }

  const done = await completePasswordUpdate(password);
  if (!done) {
    return {
      ok: false,
      message: 'That reset link has expired. Request a new one.',
    };
  }

  redirect('/login?reset=1');
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/');
}

/**
 * Consumes the token from an emailed link and issues the session.
 *
 * Called only by the /auth/callback route. This is the call site
 * `markEmailVerified()` never had, which is what closed the registration dead
 * end.
 */
export async function completeEmailVerification(params: {
  tokenHash: string;
  type: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseMode()) {
    return { ok: true };
  }

  const result = await verifyEmailToken(params);
  if (!result) {
    return { ok: false, error: 'That confirmation link is invalid or has expired.' };
  }

  await setSessionCookie({
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
    emailVerified: true,
  });

  return { ok: true };
}

function flatten(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Only a same-origin relative path is accepted as a post-login destination.
 *
 * The predicate itself lives in `src/lib/security/redirect.ts` because `proxy.ts`
 * needs the identical rule when it builds the `?next=` value, and the two copies
 * had already drifted: both rejected `//evil.com` and both accepted `/\evil.com`,
 * which the URL parser normalises to `//evil.com`. Sharing one tested
 * implementation is the fix.
 */
function safeNext(raw: FormDataEntryValue | null, role: Role): string {
  return safeNextPath(raw, {
    fallback: landingPathFor(role),
    allow: (path) => canAccessPath(role, path),
  });
}