'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

// The Root carries no styles of its own, so `className` is only passed through.
/*
 * `data-slot="tabs"` on the Root is a contract marker, not a styling hook.
 * `TabsPrimitive.Root` is a context provider and renders no DOM node, so the
 * attribute never reaches the HTML. `tabs-list`, `tabs-trigger` and
 * `tabs-content` are real elements and their slots do render.
 */
const Tabs = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    data-slot="tabs"
    className={cn(className)}
    {...props}
  />
));
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-slot="tabs-list"
    /*
     * Wraps rather than scrolls. Four tabs are about 356px of triggers plus the
     * container padding, which does not fit a 375px screen, and an
     * `inline-flex` that cannot wrap pushes the whole page sideways. Scrolling
     * fixed the overflow but hid "Access" behind an edge with nothing to say it
     * was there, so two rows of pills is the better answer: everything stays
     * visible and the strip never needs an affordance.
     */
    className={cn(
      'inline-flex max-w-full flex-wrap items-center gap-1 rounded-[12px] border border-border bg-surface-sunken p-1',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      // `min-h-11` below `lg`, compact above. A 36px tab is a comfortable
      // pointer target and an awkward thumb one.
      'pressable inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[8px] px-3.5 py-2 lg:min-h-0',
      'text-[0.9375rem] font-medium whitespace-nowrap text-ink-muted',
      'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
      'hover:text-ink',
      'data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[var(--shadow-sm)]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn('focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };