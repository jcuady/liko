'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The hero email capture.
 *
 * Split out of `Hero` so the headline, the subhead, and the whole right-hand
 * product mockup render on the server and never enter the client bundle. This
 * form is the only part of the hero that needs a runtime: two pieces of state
 * and a client-side navigation. The markup, the ids, and the copy are
 * unchanged, so the field keeps its label, its described-by wiring, and its
 * placeholder exactly as before.
 */
export function HeroEmailForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);

  const emailId = 'hero-email';
  const errorId = 'hero-email-error';

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validate on submit, not on keystroke. Annoying mid-typing errors are a
    // pattern, not feedback.
    const value = email.trim();
    if (!value) {
      setError('Enter your email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email address.');
      return;
    }

    router.push(`/register?email=${encodeURIComponent(value)}`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 max-w-[30rem]">
      <Label htmlFor={emailId} className="sr-only">
        Work email
      </Label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex-1">
          <Input
            id={emailId}
            type="email"
            name="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(undefined);
            }}
            placeholder="Enter your email here"
            autoComplete="email"
            inputMode="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-12"
          />
          {error ? (
            <p
              id={errorId}
              role="alert"
              className="mt-1.5 text-meta font-medium text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="group shrink-0 gap-2">
          Start free trial
          <ArrowRightIcon
            size={16}
            weight="bold"
            aria-hidden="true"
            className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:translate-x-1"
          />
        </Button>
      </div>

      {/* The fifth element. One sentence, and it answers the field
          above it rather than the page around it. */}
      <p className="mt-3.5 text-meta text-ink-muted">
        No credit card required. Setup in 2 minutes.
      </p>
    </form>
  );
}