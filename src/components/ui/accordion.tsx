'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

/*
 * The Root carries no styles of its own, so `className` is only passed through.
 *
 * `data-slot="accordion"` here is a contract marker, not a styling hook.
 * `AccordionPrimitive.Root` is a context provider and renders no DOM node, so
 * the attribute never reaches the HTML. It is kept because it is what shadcn
 * ships and because it documents intent for anyone reading the source, but
 * `data-[slot=accordion]` will not match anything. Every part below Root is a
 * real element and its slot does render.
 */
const Accordion = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Root
    ref={ref}
    data-slot="accordion"
    className={cn(className)}
    {...props}
  />
));
Accordion.displayName = 'Accordion';

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    data-slot="accordion-item"
    className={cn('border-b border-border', className)}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      data-slot="accordion-trigger"
      className={cn(
        'group flex flex-1 items-start justify-between gap-4 py-5 text-left',
        'text-[1.0625rem] font-medium text-ink',
        'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
        'hover:text-accent',
        className,
      )}
      {...props}
    >
      {children}
      <Plus
        size={18}
        strokeWidth={2.5}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-ink-subtle transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=open]:rotate-45"
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    data-slot="accordion-content"
    className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('measure pb-5 pr-8 text-body', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };