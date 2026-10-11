'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';

import { LikoLogo } from '@/components/brand/LikoLogo';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FormMessages, SubmitButton } from '@/app/(auth)/components/AuthForm';

import { redeemInviteAction, type JoinResult } from './actions';

/**
 * Redeeming an invitation code.
 *
 * WHY SIGNING OUT IS A SENTENCE AND NOT A WALL. The proxy sends a signed-out
 * visitor to `/login?next=/join` before this renders, so this branch is the
 * fallback rather than the usual path. It still has to read well, because the
 * person standing in front of it has just been handed a code by a colleague and
 * the worst thing this page could do is tell them to create a second account and
 * start again. So: sign in, come back here, the code is still waiting.
 *
 * WHY THE REFUSAL IS SHOWN WHOLE. `FormMessages` puts `result.message` in a live
 * alert, and the action passes the database's sentence through without editing
 * it. "There is no room left: Northfield Science Academy has 25 active seats of
 * 25 seats. Ask an administrator to raise the seat limit, then use this code
 * again." is the one sentence in this flow that tells somebody what to do next,
 * and paraphrasing it would throw away the only instruction the person has.
 */
export function JoinForm({
  signedIn,
  landingPath,
  initialCode,
}: {
  signedIn: boolean;
  landingPath: string;
  initialCode: string;
}) {
  const [result, formAction] = useFormState<JoinResult | null, FormData>(
    redeemInviteAction,
    null,
  );

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 py-8 sm:px-10">
      <Link href="/" className="shrink-0 self-start" aria-label="LIKO home">
        <LikoLogo showWordmark />
      </Link>

      <main id="main" className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[26rem]">
          {signedIn ? (
            <>
              <h1 className="text-h3">Join a school</h1>
              <p className="mt-2.5 text-[0.9375rem] text-ink-muted">
                Enter the code an administrator gave you. The code works once and only adds you to
                that school.
              </p>

              <div className="mt-6">
                <FormMessages result={result} />
              </div>

              <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
                <FormField
                  id="field-code"
                  label="Invitation code"
                  required
                  hint="Eight letters and numbers. Case does not matter."
                  error={result?.fieldErrors?.code}
                >
                  {(props) => (
                    <Input
                      {...props}
                      name="code"
                      // A pasted lowercase code is the common case, so it is
                      // capitalised on the way in rather than refused on the way
                      // through. The server normalises it again.
                      defaultValue={initialCode}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="ABCDEFGH"
                      className="tabular uppercase tracking-[0.16em]"
                    />
                  )}
                </FormField>

                <SubmitButton pendingLabel="Joining">Join school</SubmitButton>
              </form>

              <p className="mt-8 text-[0.9375rem] text-ink-muted">
                Not the code you were expecting?{' '}
                <Link
                  href={landingPath}
                  className="font-medium text-accent underline-offset-4 hover:underline"
                >
                  Back to your workspace
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="text-h3">Sign in to join a school</h1>
              <p className="mt-2.5 text-[0.9375rem] text-ink-muted">
                An invitation can only be used by an account that exists, so sign in first. Your
                code is not used up by signing in: enter it on this page afterwards and it joins
                you to that school.
              </p>

              <div className="mt-6 flex flex-col gap-4">
                {/*
                 * A styled link rather than a button inside a link. Nesting one
                 * interactive element in another gives a screen reader two
                 * controls to announce and a keyboard one target to focus, and
                 * this is a navigation, not a submission.
                 */}
                <Link
                  href="/login?next=/join"
                  className="pressable flex h-11 items-center justify-center rounded-[12px] bg-accent px-5 text-[0.9375rem] font-medium text-on-accent"
                >
                  Sign in
                </Link>
                <p className="text-meta text-ink-muted">
                  No account yet?{' '}
                  <Link
                    href="/register"
                    className="font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Register
                  </Link>{' '}
                  first, then come back with the code.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}