'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Dialog rendered as a drawer. Uses the iOS-like drawer curve so it feels
 * native on mobile and acceptable as a side panel on desktop.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    data-slot="sheet-close"
    className={cn(className)}
    {...props}
  />
));
SheetClose.displayName = 'SheetClose';
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      'fixed inset-0 z-50 bg-charcoal/40',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetSides = {
  bottom:
    'inset-x-0 bottom-0 rounded-t-[16px] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  right:
    'inset-y-0 right-0 w-[min(24rem,100vw)] rounded-l-[16px] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  left: 'inset-y-0 left-0 w-[min(24rem,100vw)] rounded-r-[16px] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
} as const;

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: keyof typeof sheetSides;
    hideClose?: boolean;
  }
>(({ className, children, side = 'bottom', hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="sheet-content"
      className={cn(
        'fixed z-50 border-border bg-surface-raised p-6 shadow-[var(--shadow-lg)]',
        'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:duration-200 data-[state=closed]:duration-150',
        'focus:outline-none',
        sheetSides[side],
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          data-slot="sheet-close"
          className={cn(
            'pressable absolute right-4 top-4 grid size-9 place-items-center rounded-[8px]',
            'text-ink-subtle hover:bg-surface-sunken hover:text-ink',
          )}
        >
          <X size={16} strokeWidth={2.5} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn('text-h4 text-ink', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn('text-meta text-ink-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

/*
 * The header and footer groups, matching shadcn's sheet.
 *
 * `SheetHeader` is the column that puts a title and its description on one
 * stack, and `SheetFooter` is the row that lays actions out at the bottom. Both
 * were missing, which pushed every caller into an ad hoc wrapper div. The
 * spacing values are the ones the file already uses for its own content rather
 * than shadcn's defaults, because these tokens are not shadcn's.
 *
 * Neither is used yet. They are here so the part set is complete, which is the
 * same reason `CardAction` exists.
 */
const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-header"
    className={cn('flex flex-col gap-1.5 p-4', className)}
    {...props}
  />
));
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-footer"
    className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
));
SheetFooter.displayName = 'SheetFooter';

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};