'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

/**
 * Switch.
 *
 * WHY THE ROOT IS SQUARE AND BIGGER THAN THE TRACK. A switch is 24px tall
 * because that is what a switch looks like, and it was also 24px tall to hit,
 * which is a target about half the comfortable minimum on a phone. The root is
 * now a 44 by 44 box on touch screens with the visual track drawn inside it, so
 * the thing a finger aims at is genuinely finger sized without the control
 * looking like a switch on a dinner plate. From `lg` up it collapses to the
 * track itself, where a mouse does not care.
 *
 * The root is a `group` because the state lives on it and the track is a child,
 * so the track reads its colours from `group-data-[state=...]`.
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'group peer inline-flex size-11 shrink-0 cursor-pointer items-center justify-center',
      'rounded-full lg:h-6 lg:w-11',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none relative inline-flex h-6 w-11 items-center rounded-full',
        'border-2 border-transparent transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'group-data-[state=checked]:bg-accent group-data-[state=unchecked]:bg-border-strong',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-[var(--shadow-sm)]',
          'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </span>
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };