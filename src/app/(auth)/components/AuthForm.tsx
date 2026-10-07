'use client';

import * as React from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { CircleNotchIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorSummary, FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import type { ActionResult } from '../actions';

/**
 * Submit button that reflects the pending state.
 *
 * Every async action in the product uses this, so a user always gets feedback
 * within 100ms of pressing and the control cannot be pressed twice.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" block disabled={pending} className={className}>
      {pending ? (
        <>
          <CircleNotchIcon size={16} weight="bold" aria-hidden="true" className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Form-level error summary. Renders above the fields and takes focus after a
 * failed submit so a screen reader hears every problem before tabbing in.
 */
export function FormMessages({ result }: { result: ActionResult | null }) {
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const errors = React.useMemo(() => {
    if (!result?.fieldErrors) return [];
    return Object.entries(result.fieldErrors).map(([id, message]) => ({
      id: `field-${id}`,
      label: id,
      message,
    }));
  }, [result]);

  React.useEffect(() => {
    if (errors.length > 0) summaryRef.current?.focus();
  }, [errors]);

  if (!result?.message && errors.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {errors.length > 0 ? (
        <ErrorSummary
          ref={summaryRef}
          errors={errors}
          title="Check the highlighted fields"
        />
      ) : null}
      {result?.message ? (
        <p
          role="alert"
          className="rounded-[12px] border border-danger bg-danger-subtle p-3.5 text-[0.9375rem] font-medium text-danger"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

/** Text input wired into FormField's accessibility contract. */
export function Field({
  label,
  hint,
  error,
  required,
  type = 'text',
  name,
  autoComplete,
  defaultValue,
  inputMode,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
  name: string;
  autoComplete?: string;
  defaultValue?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <FormField
      id={`field-${name}`}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      {(aria) => (
        <Input
          {...aria}
          name={name}
          type={type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          inputMode={inputMode}
          onChange={onChange}
        />
      )}
    </FormField>
  );
}

export function AuthFooter({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn('text-center text-[0.9375rem] text-ink-muted')}>{children}</p>
  );
}

export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-h3">{title}</h1>
      <p className="mt-2.5 text-[0.9375rem] text-ink-muted">{description}</p>
    </div>
  );
}

export { Link };