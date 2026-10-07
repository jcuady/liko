'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductPreview } from './ProductPreview';
import {
  attendance,
  stats,
  students,
} from '@/lib/fixtures/workspace';
import type { AttendanceStatus, Student } from '@/lib/api/types';

/**
 * Hero. Editorial split, never centred.
 *
 * Five text elements and no more: one eyebrow, one headline, one subhead, one
 * CTA row, one reassurance line. The line was deliberately parked in the FAQ
 * to keep the stack to four, on the theory that a hero full of microcopy is how
 * a landing page stops reading as a headline. That theory was wrong about what
 * the line was doing. "No credit card required" is not decoration competing
 * with the headline, it is the answer to the question the email field has
 * already asked: what happens if I press this. Answering it here costs one line
 * and removes the hesitation before it forms, where the FAQ answers it only
 * after a reader has already scrolled past two scroll narratives to ask.
 *
 * The restraint that still holds: one line, one sentence, no feature claims,
 * and it sits under the CTA it qualifies rather than beside the headline.
 *
 * The bottom padding is tighter than it was, because the stats band now follows
 * the hero directly and is meant to land on the first screen. The hero gives up
 * the space it no longer needs on its own account.
 */

export function Hero() {
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
    <section className="relative overflow-hidden pb-16 pt-12 md:pb-20 md:pt-16 lg:pb-24 lg:pt-20">
      <div className="container-marketing">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6 xl:col-span-5">
            <p className="text-label">Plan to grade, one path</p>

            <h1 className="text-display mt-5 max-w-[13ch]">
              Every teaching task, in{' '}
              <em className="italic-accent text-accent">one flow</em>.
            </h1>

            <p className="measure mt-6 text-lead">
              LIKO holds your plans, assessments, gradebook, and student history
              on a single thread, so nothing gets rebuilt twice.
            </p>

            <form
              onSubmit={onSubmit}
              noValidate
              className="mt-8 max-w-[30rem]"
            >
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
                <Button
                  type="submit"
                  size="lg"
                  className="group shrink-0 gap-2"
                >
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

            <div className="mt-6">
              <Button asChild variant="link" size="sm" className="group gap-1.5">
                <a href="#flow">
                  See the flow
                  <ArrowRightIcon
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:translate-x-1"
                  />
                </a>
              </Button>
            </div>
          </div>

          {/*
            The preview is a real miniature of the workspace, not a built
            screenshot. It is hidden below lg because on small screens the copy
            should carry the whole viewport. `min-w-0` lets the column shrink
            below the dashboard table's intrinsic width instead of overflowing.
          */}
          <div className="hidden min-w-0 lg:col-span-6 lg:block xl:col-span-7">
            <ProductPreview
              stats={stats as Parameters<typeof ProductPreview>[0]['stats']}
              students={students as Student[]}
              attendance={attendance as Record<string, AttendanceStatus>}
            />
          </div>
        </div>
      </div>
    </section>
  );
}