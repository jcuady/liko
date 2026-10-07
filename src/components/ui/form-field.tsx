'use client';

import * as React from 'react';
import { CheckCircleIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

/**
 * Form field wrapper. Enforces the accessibility contract for every input in
 * the product: visible label, optional hint, error below the control linked by
 * `aria-describedby`, and a required marker that is not colour alone.
 */
export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    required: boolean | undefined;
  }) => React.ReactNode;
}

function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.875rem] font-medium text-ink">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}

      {hint ? (
        <p id={hintId} className="text-meta text-ink-subtle">
          {hint}
        </p>
      ) : null}

      {/*
        role="alert" announces the error as it appears. The icon is decorative
        because the message text already carries the meaning.
      */}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-meta font-medium text-danger"
        >
          <WarningCircleIcon
            size={15}
            weight="fill"
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
 * Error summary. After a failed submit with more than one invalid field, focus
 * moves here so screen reader users hear the full list before tabbing into
 * individual fields. Each item links to its field.
 */
function ErrorSummary({
  errors,
  title = 'Check the highlighted fields',
  ref,
}: {
  errors: { id: string; label: string; message: string }[];
  title?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="form-error-summary-title"
      className="rounded-[12px] border border-danger bg-danger-subtle p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
    >
      <div className="flex items-start gap-2.5">
        <WarningIcon size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h3 id="form-error-summary-title" className="text-[0.9375rem] font-semibold text-danger">
            {title}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {errors.map((error) => (
              <li key={error.id} className="text-meta text-danger">
                <a
                  href={`#${error.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(error.id)?.focus();
                  }}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  <span className="font-medium">{error.label}:</span> {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-[12px] border border-success bg-success-subtle p-3.5 text-meta font-medium text-success"
    >
      <CheckCircleIcon size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

export { FormField, ErrorSummary, FormSuccess };