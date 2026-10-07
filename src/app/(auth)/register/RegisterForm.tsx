'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { CheckCircleIcon } from '@phosphor-icons/react';

import {
  AuthFooter,
  AuthHeading,
  Field,
  FormMessages,
  SubmitButton,
} from '../components/AuthForm';
import { registerAction, type ActionResult } from '../actions';

const REQUIREMENTS = [
  'At least 10 characters',
  'A lowercase letter',
  'An uppercase letter',
  'A number',
];

export function RegisterForm({ prefilledEmail }: { prefilledEmail: string }) {
  const [result, formAction] = useFormState<ActionResult | null, FormData>(
    registerAction,
    null,
  );
  const [password, setPassword] = React.useState('');

  return (
    <>
      <AuthHeading
        title="Start your free trial"
        description="No credit card required. Setup in 2 minutes."
      />

      <FormMessages result={result} />

      <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
        <Field
          name="name"
          label="Full name"
          autoComplete="name"
          required
          error={result?.fieldErrors?.name}
        />

        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={prefilledEmail}
          error={result?.fieldErrors?.email}
        />

        <div className="flex flex-col gap-1.5">
          <Field
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            onChange={(event) => setPassword(event.target.value)}
            error={result?.fieldErrors?.password}
          />

          {/*
            Requirements are listed up front rather than revealed on failure,
            and each one carries its own tick, so the state is never carried by
            colour alone.
          */}
          <ul className="mt-1 flex flex-col gap-1">
            {REQUIREMENTS.map((requirement) => {
              const met = requirementSatisfied(requirement, password);
              return (
                <li
                  key={requirement}
                  className="flex items-center gap-1.5 text-[0.8125rem]"
                >
                  <CheckCircleIcon
                    size={13}
                    weight={met ? 'fill' : 'regular'}
                    aria-hidden="true"
                    className={met ? 'text-accent' : 'text-ink-subtle opacity-40'}
                  />
                  <span className={met ? 'text-ink-muted' : 'text-ink-subtle'}>
                    {requirement}
                  </span>
                  <span className="sr-only">{met ? 'met' : 'not met'}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <SubmitButton pendingLabel="Creating your workspace">
          Create workspace
        </SubmitButton>
      </form>

      <p className="mt-5 text-[0.8125rem] text-ink-subtle">
        We will email you a verification link before the workspace opens.
      </p>

      <div className="mt-8 border-t border-border pt-6">
        <AuthFooter>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </AuthFooter>
      </div>
    </>
  );
}

/** Mirrors the Zod rules so the checklist agrees with what the server accepts. */
function requirementSatisfied(requirement: string, password: string): boolean {
  switch (requirement) {
    case 'At least 10 characters':
      return password.length >= 10;
    case 'A lowercase letter':
      return /[a-z]/.test(password);
    case 'An uppercase letter':
      return /[A-Z]/.test(password);
    case 'A number':
      return /[0-9]/.test(password);
    default:
      return false;
  }
}