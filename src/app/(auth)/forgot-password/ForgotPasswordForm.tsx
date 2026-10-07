'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { AuthFooter, AuthHeading, Field, FormMessages } from '../components/AuthForm';
import { forgotPasswordAction, type ActionResult } from '../actions';

export function ForgotPasswordForm() {
  const [result, formAction] = useFormState<ActionResult | null, FormData>(
    forgotPasswordAction,
    null,
  );

  const { pending } = useFormStatus();
  const sent = result?.ok === true;

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="We will email you a link to set a new one."
      />

      {/*
        The confirmation is identical whether or not the address is registered,
        so this page cannot be used to discover which accounts exist.
      */}
      {sent ? (
        <div
          role="status"
          className="rounded-[12px] border border-success bg-success-subtle p-5"
        >
          <EnvelopeSimpleIcon
            size={20}
            weight="duotone"
            aria-hidden="true"
            className="text-success"
          />
          <p className="mt-3 text-[0.9375rem] font-medium text-success">
            {result.message}
          </p>
          <p className="mt-2 text-[0.875rem] text-ink-muted">
            Check the spam folder if it has not arrived in a few minutes.
          </p>
        </div>
      ) : (
        <>
          <FormMessages result={result} />

          <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
            <Field
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              error={result?.fieldErrors?.email}
            />

            <Button type="submit" size="lg" block disabled={pending}>
              {pending ? 'Sending link' : 'Send reset link'}
            </Button>
          </form>
        </>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <AuthFooter>
          Remembered it?{' '}
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