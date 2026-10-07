'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 py-2',
          'text-[0.9375rem] text-ink placeholder:text-ink-subtle',
          'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'hover:border-border-strong',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full resize-y rounded-[12px] border border-border bg-surface px-3.5 py-2.5',
        'text-[0.9375rem] text-ink placeholder:text-ink-subtle',
        'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'hover:border-border-strong',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Input, Textarea };