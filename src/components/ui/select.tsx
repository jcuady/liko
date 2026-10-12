'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Select, on Radix.
 *
 * WHY THIS IS NOT A NATIVE `<select>` ANY MORE. The kit had a native one, with
 * the same twelve utility classes, and it was used in five places that each
 * rendered it themselves. A native select draws its own control: the height,
 * the padding, the chevron, the popup and the dark-mode behaviour are whatever
 * the browser decides, and they differ between the two engines this product is
 * read on. That is a design system leaking, and it cannot be fixed with classes
 * because the element is not ours to style.
 *
 * Radix draws it, so it matches the rest of the kit and comes with the
 * behaviour the native one does not give for free: type-ahead, Home and End,
 * arrow and Enter selection, focus management and a portal that escapes
 * overflow containers.
 *
 * THE ONE THING THIS GIVES UP, DELIBERATELY. A native select is a form control,
 * so it posts its `name` with the form. A Radix select is a `button` with a
 * hidden native `select` beside it, which is how the underlying value is still
 * submitted. Every caller here is a React controlled component rather than an
 * uncontrolled form post, so that is the correct trade. The consent checkbox in
 * `checkbox.tsx` keeps its native input for exactly the opposite reason and says
 * so at the definition.
 */

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      'flex h-11 w-full items-center justify-between gap-2 rounded-[12px] border border-border-strong bg-surface px-3.5',
      'text-base lg:text-[0.9375rem] text-ink data-[placeholder]:text-ink-subtle',
      'transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
      'data-[hover]:border-border-strong',
      'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
      // The chevron is decorative and sits on the right of the control.
      '[&>span]:line-clamp-1 [&>span]:text-left',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon size={16} className="flex-none text-ink-muted" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      data-slot="select-content"
      position={position}
      className={cn(
        'relative z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-y-auto',
        'rounded-[12px] border border-border bg-surface-raised p-1 text-ink shadow-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        position === 'popper' &&
          'w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
        <ChevronUpIcon size={14} aria-hidden="true" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-0">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
        <ChevronDownIcon size={14} aria-hidden="true" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    data-slot="select-label"
    className={cn('px-2 py-1.5 text-[11px] font-semibold text-ink-muted', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, value, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    /*
     * WHY `data-value` IS PUBLISHED. Radix keeps the item's value in context and
     * does not put it in the DOM, so a test cannot drive this control the way it
     * drove a native one. Every caller here stores a slug (`university`, `gwa`,
     * `admin`) and renders a sentence, and the slug is the part that matters to
     * the code, so it is now readable from the element. Without it, driving this
     * from a test means hardcoding the label next to every value, which is a
     * second copy of the same list.
     */
    data-value={value}
    /*
     * `value` is destructured out of the rest-spread above, so it has to be put
     * back explicitly. Radix reads it from the item to drive selection and to
     * decide which item shows the check; publishing `data-value` without this
     * line renders a list whose options all report the same stored slug.
     */
    value={value}
    className={cn(
      'relative flex min-h-11 w-full cursor-default select-none items-center gap-2 rounded-[8px]',
      'py-2 pl-3 pr-9 text-[0.9375rem] outline-none',
      'data-[highlighted]:bg-accent-subtle data-[highlighted]:text-ink',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-3 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon size={14} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    data-slot="select-separator"
    className={cn('my-1 h-px bg-border', className)}
    {...props}
  />
));
SelectSeparator.displayName = 'SelectSeparator';

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};