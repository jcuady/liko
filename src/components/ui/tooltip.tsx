'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

/*
 * `Provider` and `Root` render no DOM node of their own, so they have no ref
 * and no `className` to forward. They still need wrappers so they can carry
 * `data-slot`. `Trigger` does render a button, so it forwards both.
 *
 * Note that `data-slot="tooltip"` and `data-slot="tooltip-provider"` never
 * reach the HTML, because there is no element to put them on. They match what
 * shadcn ships and they record intent in the source, but they are not styling
 * hooks. `tooltip-trigger` and `tooltip-content` are real elements.
 */
function TooltipProvider(
  props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>,
) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

function Tooltip(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

const TooltipTrigger = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Trigger
    ref={ref}
    data-slot="tooltip-trigger"
    className={cn(className)}
    {...props}
  />
));
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-[8px] bg-ink px-2.5 py-1.5 text-[0.8125rem] text-[var(--surface)]',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        'data-[state=delayed-open]:duration-150',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };