'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * WHY THE TYPE SCALE SPLITS AT `lg`.
 *
 * `text-[0.9375rem]` is 15px, which is the right reading size for the type
 * system. It is also below the 16px that iOS Safari insists on before it will
 * stop zooming the whole viewport when a field takes focus. So the body of the
 * control stays at the design system's size on a pointer, and steps up to 16px
 * on anything wide enough to be a tablet or a phone.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-[12px] border border-border-strong bg-surface px-3.5 py-2',
          // 16px below `lg` is the anti-zoom floor; the rem above is the
          // design system's own size.
          'text-base lg:text-[0.9375rem] text-ink placeholder:text-ink-subtle',
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
        'flex w-full resize-y rounded-[12px] border border-border-strong bg-surface px-3.5 py-2.5',
        'text-base lg:text-[0.9375rem] text-ink placeholder:text-ink-subtle',
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

/**
 * Select.
 *
 * This existed as the same twelve utility classes pasted into fifteen files. A
 * copy that size drifts: it was already at 36px in two places where the inputs
 * beside it were 44px, and nobody was going to notice that a select was harder
 * to hit than the field above it.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-[12px] border border-border-strong bg-surface px-3.5',
      'text-base lg:text-[0.9375rem] text-ink',
      'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
      'hover:border-border-strong',
      'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export { Input, Textarea, Select };