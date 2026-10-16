'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { CircleAlert, CircleCheck, Sparkles } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
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

export function RegisterForm({
  prefilledEmail,
  chosenPlan,
  verificationSkipped = false,
}: {
  prefilledEmail: string;
  /** Set when the visitor arrived from a pricing card. */
  chosenPlan?: { id: string; name: string } | null;
  /** Read on the server, so the line below the form cannot promise an email. */
  verificationSkipped?: boolean;
}) {
  const [result, formAction] = useFormState<ActionResult | null, FormData>(
    registerAction,
    null,
  );
  const [password, setPassword] = React.useState('');

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="No credit card required. Setup in 2 minutes."
      />

      <FormMessages result={result} />

      {chosenPlan ? (
        <p className="flex items-start gap-2 rounded-[12px] border border-accent bg-accent-subtle px-4 py-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          <Sparkles
            size={17}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-accent"
          />
          <span>
            You picked <strong className="font-semibold text-ink">{chosenPlan.name}</strong>.
            Nothing is charged and no card is needed. You can change your mind
            later.
          </span>
        </p>
      ) : null}

      <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
        {/*
         * WHICH KIND OF ACCOUNT.
         *
         * Rendered as a radio group rather than a select, because the two
         * answers need a sentence of explanation each and a select hides the one
         * you did not pick. A `fieldset` and `legend` are used so a screen
         * reader announces the question before the options, which a bare `div`
         * of buttons would not.
         *
         * The values are exactly the two the schema admits. `admin` and
         * `guardian` are not reachable from here at all: an administrator is
         * promoted by an existing administrator, and a guardian account is issued
         * by the teacher who owns the class.
         */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label mb-1">This account is for</legend>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border border-border px-4 py-3 transition-colors hover:bg-surface-sunken has-checked:border-accent has-checked:bg-accent-subtle">
            <input
              type="radio"
              name="role"
              value="instructor"
              defaultChecked
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-semibold text-ink">I teach</span>
              <span className="text-meta text-ink-muted">
                Create classes, take attendance, set work and see how students are
                doing.
              </span>
            </span>
          </label>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border border-border px-4 py-3 transition-colors hover:bg-surface-sunken has-checked:border-accent has-checked:bg-accent-subtle">
            <input
              type="radio"
              name="role"
              value="student"
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-semibold text-ink">I am a student</span>
              <span className="text-meta text-ink-muted">
                See your classes and your week, take your quizzes, and keep track of
                what is due. Your teacher links you to the class.
              </span>
            </span>
          </label>
        </fieldset>

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
                  <CircleCheck
                    size={13}
                    strokeWidth={met ? 2.25 : 1.75}
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

        <ConsentGate errors={result?.fieldErrors} />

        <SubmitButton pendingLabel="Creating your workspace">
          Create workspace
        </SubmitButton>
      </form>

      {/*
       * Said only when it is true. With accounts confirmed at creation nothing
       * is emailed, and a form that still promises a link teaches a teacher to
       * wait for an email that will never arrive before anyone will look for it.
       */}
      <p className="mt-5 text-[0.8125rem] text-ink-subtle">
        {verificationSkipped
          ? 'Your workspace opens as soon as you finish this form.'
          : 'We will email you a verification link before the workspace opens.'}
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

/**
 * The consent gate.
 *
 * Two separate ticks rather than one "I agree" box. The terms and the privacy
 * notice are different documents with different consequences, and a single tick
 * over a link to one of them records agreement to a document the person cannot
 * see.
 *
 * Nothing here decides whether the account is created. That is decided by
 * `registerSchema`, and the errors it returns are rendered under the tick that
 * caused them so the failure points at the thing the person has to change.
 *
 * The copy names who signs up. A reader who arrived here expecting to make a
 * student account is told the actual arrangement before they submit, not after.
 */
function ConsentGate({ errors }: { errors?: Record<string, string> }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
      <legend className="sr-only">Agreement</legend>

      <ConsentRow
        name="acceptedTerms"
        error={errors?.acceptedTerms}
        label={
          <>
            I agree to the{' '}
            <LegalLink href="/terms">Terms of Use</LegalLink>.
          </>
        }
      />

      <ConsentRow
        name="acceptedPrivacy"
        error={errors?.acceptedPrivacy}
        label={
          <>
            I have read the{' '}
            <LegalLink href="/privacy">Privacy Notice</LegalLink>.
          </>
        }
      />

      <p className="text-meta text-ink-subtle">
        A guardian account is created by the teacher who owns the class, from
        the class roster. If you are under 13, ask a parent or guardian before
        creating an account.
      </p>
    </fieldset>
  );
}

function ConsentRow({
  name,
  label,
  error,
}: {
  name: string;
  label: React.ReactNode;
  error?: string;
}) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col">
      <label className="-m-2 flex cursor-pointer items-start gap-1 rounded-[8px] p-2 hover:bg-surface-sunken">
        <Checkbox
          name={name}
          invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <span className="pt-2.5 text-[0.9375rem] leading-snug text-ink-muted">
          {label}
        </span>
      </label>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 flex items-start gap-1.5 pl-13 text-meta font-medium text-danger"
        >
          <CircleAlert
            size={15}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A link inside a sentence of consent copy.
 *
 * It opens a new tab so reading the terms does not lose the half-filled form.
 * `noopener` is implied by `noreferrer` in every current engine but stated, and
 * the reader is told in words that it opens a new tab, because a link that opens
 * somewhere unexpected is disorienting for anyone who does not expect it.
 */
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-[4px] font-medium text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}