'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { PaperPlaneTiltIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resendVerificationAction } from '@/app/(auth)/actions';

/**
 * Resend the confirmation email.
 *
 * Exists because verification used to be a one-way street: the account was
 * created unverified and nothing in the product could ever flip the flag, so a
 * lost email left the user permanently locked out. This is the recovery path.
 */
export function ResendVerificationForm() {
  const [state, formAction] = React.useActionState(
    resendVerificationAction,
    null,
  );

  return (
    <form action={formAction} className="mt-8 w-full max-w-[22rem]">
      <Label htmlFor="resend-email" className="text-[0.875rem]">
        Resend the confirmation email
      </Label>
      <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          required
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
          className="h-11"
        />
        <ResendButton />
      </div>

      {state?.message ? (
        <p
          role="status"
          className={`mt-3 text-[0.875rem] ${
            state.ok ? 'text-ink-muted' : 'text-danger'
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="shrink-0 gap-2">
      <PaperPlaneTiltIcon size={16} weight="bold" aria-hidden="true" />
      {pending ? 'Sending' : 'Resend'}
    </Button>
  );
}