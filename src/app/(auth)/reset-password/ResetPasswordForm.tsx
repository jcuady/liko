'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';

import {
  AuthFooter,
  AuthHeading,
  Field,
  FormMessages,
  SubmitButton,
} from '../components/AuthForm';
import { resetPasswordAction, type ActionResult } from '../actions';

/**
 * Set a new password.
 *
 * Reached from the link in a reset email. Supabase has already established a
 * recovery session in its own cookie by the time this renders, so submitting
 * here updates the password through that session rather than asking for the old
 * one.
 *
 * This route is listed in AUTH_PATHS. Without that, `proxy.ts` would bounce a
 * signed-in user straight off the page before the recovery session could be
 * used.
 */
export function ResetPasswordForm() {
  const [result, formAction] = useFormState<ActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description="Pick something you have not used on another site."
      />

      <FormMessages result={result} />

      <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
        <Field
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          error={result?.fieldErrors?.password}
        />

        <Field
          name="confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          error={result?.fieldErrors?.confirm}
        />

        <SubmitButton pendingLabel="Saving">
          Save new password
        </SubmitButton>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <AuthFooter>
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </AuthFooter>
      </div>
    </>
  );
}