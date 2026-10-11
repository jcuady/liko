'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'pressable inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent hover:bg-accent-hover shadow-sm',
        secondary:
          'bg-surface text-ink border border-border hover:border-border-strong hover:bg-surface-sunken shadow-sm',
        ghost: 'text-ink hover:bg-surface-sunken',
        link: 'text-accent underline-offset-4 hover:underline p-0 h-auto',
        danger:
          'bg-danger text-on-danger hover:opacity-90 shadow-sm',

        /*
         * The two variants that exist only on the dark forest panel: the hero,
         * the mobile band and the lesson preview.

         * They are named for the panel rather than for a colour, because the
         * panel's ink is the one thing they may never be used on. `hero` fills
         * with the highlight green and sets forest text, which is the reverse of
         * every other button here and the reason it is not a `primary` with
         * different classes: forest-on-highlight measures about 11:1, while the
         * highlight on a light surface is close to invisible.
         */
        hero:
          'rounded-full bg-highlight text-forest hover:bg-highlight/85 shadow-sm',
        'hero-outline':
          'rounded-full border border-hero-border text-hero-foreground hover:bg-hero-foreground/10',
      },
      size: {
        /*
         * `sm` is 36px on a pointer and 44px on a thumb, so it is 44px until
         * `lg`. The compact size is still the right one for a dense toolbar on
         * a desktop; it is simply wrong for something a finger has to hit, and
         * 36px is under the 44px comfortable target on every device that has
         * fingers.
         */
        sm: 'h-11 px-3.5 text-sm rounded-[8px] lg:h-9 lg:rounded-[6px]',
        md: 'h-11 px-5 text-[0.9375rem] rounded-[8px]',
        lg: 'h-12 px-7 text-base rounded-[8px]',
        /* The pill CTA from the hero and the closing band. Pill is the only
           shape in the system that is not one of the four radii, and it is
           reserved for the two moments the design gives it. */
        cta: 'h-12 px-6 text-sm rounded-pill',
        icon: 'size-11 rounded-[8px]',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the single child element instead of a button. */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild = false, type, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        // Default to "button" so a button inside a form never submits by accident.
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };