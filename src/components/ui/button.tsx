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
          'bg-danger text-white hover:opacity-90 shadow-sm',
      },
      size: {
        /*
         * `sm` is 36px on a pointer and 44px on a thumb, so it is 44px until
         * `lg`. The compact size is still the right one for a dense toolbar on
         * a desktop; it is simply wrong for something a finger has to hit, and
         * 36px is under the 44px comfortable target on every device that has
         * fingers.
         */
        sm: 'h-11 px-3.5 text-sm rounded-[10px] lg:h-9 lg:rounded-[8px]',
        md: 'h-11 px-5 text-[0.9375rem] rounded-[12px]',
        lg: 'h-12 px-7 text-base rounded-[12px]',
        icon: 'size-11 rounded-[12px]',
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