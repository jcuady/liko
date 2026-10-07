'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-[8px] bg-surface-sunken', className)}
      {...props}
    />
  );
}

type EmptyStateIcon = React.ComponentType<{
  size?: number;
  weight?: 'regular' | 'bold' | 'fill' | 'duotone';
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

/**
 * Empty state. Every placeholder route uses this so a not-yet-built module
 * says plainly what it will do instead of pretending to be broken.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: EmptyStateIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border',
        'bg-surface px-6 py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="mb-5 grid size-12 place-items-center rounded-full bg-accent-subtle text-accent"
        >
          <Icon size={22} weight="duotone" />
        </span>
      ) : null}
      <h3 className="text-h4 max-w-[38ch]">{title}</h3>
      <p className="measure mt-2.5 text-body">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export { Skeleton, EmptyState };