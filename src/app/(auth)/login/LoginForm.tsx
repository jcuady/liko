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
import { loginAction, type ActionResult } from '../actions';

export function LoginForm({ next }: { next: string }) {
  const [result, formAction] = useFormState<ActionResult | null, FormData>(
    loginAction,
    null,
  );

  return (
    <>
      <AuthHeading title="Sign in" description="Pick up where you left off." />

      <FormMessages result={result} />

      <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
        {/*
          The destination travels in the form rather than the URL, and the
          server action re-validates it. A tampered value can only ever land on
          a same-origin path.
        */}
        <input type="hidden" name="next" value={next} />

        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={result?.fieldErrors?.email}
        />

        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={result?.fieldErrors?.password}
        />

        {/*
          Off by default. A shared classroom computer should not stay signed in
          for a week because someone ticked a box on a phone-shaped form.
        */}
        <label className="flex items-center gap-2.5 text-[0.875rem] text-ink-muted">
          <input
            type="checkbox"
            name="remember"
            defaultChecked={false}
            className="size-4 rounded-[4px] accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          Keep me signed in for 7 days
        </label>

        <div className="-mt-2 flex justify-end">
          <Link
            href="/forgot-password"
            className="rounded-[6px] text-[0.875rem] text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Forgot password
          </Link>
        </div>

        <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <AuthFooter>
          New to LIKO?{' '}
          <Link
            href="/register"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Create a free account
          </Link>
        </AuthFooter>
      </div>
    </>
  );
}