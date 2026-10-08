/**
 * Skeleton and EmptyState.
 *
 * WHY THERE IS NO `use client` HERE. Both are pure presentational markup with
 * no state, no hooks, and no handlers. Marking the module as a Client Component
 * made `EmptyState`'s `icon` prop a function crossing the server/client
 * boundary, which React refuses: "Functions cannot be passed directly to Client
 * Components". Every Server Component that rendered an empty state with an icon
 * therefore 500ed. `/settings/profile` was one of them, so the profile page was
 * broken for every signed-in user.
 *
 * With the directive removed, a Server Component can pass an icon component and
 * a Client Component can still import the same module, where it simply becomes
 * part of the client bundle.
 */
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