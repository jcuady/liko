'use client';

import * as React from 'react';
import Link from 'next/link';

import {
  AuthFooter,
  AuthHeading,
  AuthLink,
  Field,
  FormMessages,
  SubmitButton,
} from '../components/AuthForm';
import { Checkbox } from '@/components/ui/checkbox';
import { loginAction, type ActionResult } from '../actions';

export function LoginForm({ next, passwordReset }: { next: string; passwordReset: boolean }) {
  /*
   * `useActionState`, not the deprecated `useFormState` from `react-dom`.
   *
   * The old name logs a console error on every render of this component, which
   * is not cosmetic: a suite that asserts "no console errors on any route"
   * passes only while this is quiet, and a team that sees red on every build
   * learns to ignore the gate that was meant to catch a real one.
   */
  const [result, formAction] = React.useActionState<ActionResult | null, FormData>(
    loginAction,
    null,
  );

  return (
    <>
      <AuthHeading title="Sign in" description="Pick up where you left off." />

      {/*
        SAID ONLY WHEN IT IS TRUE.

        `resetPasswordAction` redirects here with `?reset=1`, and nothing read
        it. A person who chose a new password was dropped onto the ordinary
        sign-in form with nothing on it to say the reset had worked, so the only
        way to find out was to try the new password and see. Same defect as the
        `?plan=` on `/register`: a query parameter that arrives and is read by
        nobody, written by an action that believed something had happened.
      */}
      {passwordReset ? (
        <div className="mb-6 rounded-[12px] border border-success bg-success-subtle p-3.5 text-[0.9375rem] font-medium text-success">
          Your password has been changed. Sign in with it.
        </div>
      ) : null}

      <FormMessages result={result}>
        {result?.code === 'EMAIL_UNVERIFIED' ? (
          <AuthLink href="/verify-email">Send the link again</AuthLink>
        ) : null}
      </FormMessages>

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

          THE PRIMITIVE, NOT A RAW INPUT. This was a bare `<input size-4>` in a
          label with no padding, so the whole row measured 345x23 on a phone: a
          23px target for the one optional control on the sign-in form. The
          consent gate on `/register` already solved the same problem with
          `Checkbox`, which is a 20px box inside a 44px row precisely so the
          extra room is not spent on making a checkbox bigger than a checkbox.
          Two forms, one control, one answer.
        */}
        <label className="-m-2 flex cursor-pointer items-center gap-1 rounded-[8px] p-2 hover:bg-surface-sunken">
          <Checkbox name="remember" defaultChecked={false} />
          <span className="text-[0.9375rem] text-ink-muted">
            Keep me signed in for 7 days
          </span>
        </label>

        <div className="flex justify-end">
          <AuthLink href="/forgot-password">Forgot password</AuthLink>
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