'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Card. One elevation step, one radius. Surface tint is set by CSS variables so
 * the same component works on the marketing canvas and inside the app shell.
 */
const cardVariants = cva(
  'rounded-[16px] border border-border bg-surface text-ink',
  {
    variants: {
      elevation: {
        flat: 'shadow-none',
        raised: 'shadow-[var(--shadow-md)]',
        glass: 'glass',
      },
      interactive: {
        true: 'pressable hover:border-border-strong hover:shadow-[var(--shadow-md)]',
        false: '',
      },
    },
    defaultVariants: { elevation: 'flat', interactive: false },
  },
);

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof cardVariants>
>(({ className, elevation, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(cardVariants({ elevation, interactive }), className)}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-h4 text-ink', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-meta text-ink-muted', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-3 p-5 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-ink-muted border border-border',
        accent: 'bg-accent-subtle text-accent border border-transparent',
        success: 'bg-success-subtle text-success border border-transparent',
        warning: 'bg-warning-subtle text-warning border border-transparent',
        danger: 'bg-danger-subtle text-danger border border-transparent',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-[0.8125rem]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>
>(({ className, tone, size, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ tone, size }), className)} {...props} />
));
Badge.displayName = 'Badge';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  badgeVariants,
};