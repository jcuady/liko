'use client';

import * as React from 'react';
import { CheckIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

/**
 * Checkbox.
 *
 * WHY A NATIVE INPUT AND NOT A RADIX ONE. This control appears on the consent
 * gate, and consent is proved by what the browser posts. A real
 * `<input type="checkbox" name>` posts `on` when ticked and nothing at all when
 * it is not, which is precisely the contract `registerSchema` validates. Radix
 * renders a `button[role=checkbox]` and relies on a visually hidden input to
 * reproduce that, which is one more thing between the person and the evidence.
 *
 * The visual box is 20px, which is correct next to 15px body type, and the row
 * around it is 44px. A 20px target is the wrong size for a thumb and the right
 * size for a checkbox, so the extra 24px lives in the padding and the label
 * rather than in the control that is supposed to read as small.
 */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<'input'>, 'type'> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <span className="relative flex size-11 shrink-0 items-center justify-center">
    <input
      ref={ref}
      type="checkbox"
      aria-invalid={invalid || undefined}
      className={cn(
        'peer size-5 shrink-0 cursor-pointer appearance-none rounded-[6px] border bg-surface',
        'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'border-border-strong',
        'hover:border-accent',
        'checked:border-accent checked:bg-accent',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-danger',
        className,
      )}
      {...props}
    />
    <CheckIcon
      size={13}
      weight="bold"
      aria-hidden="true"
      className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };