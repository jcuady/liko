import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Table. One cell rhythm, one header treatment, one way to draw a row rule.
 *
 * WHY THIS EXISTS. Four tables in the product each styled their own cells, and
 * four different answers came back. Two tables inside `ClassesManager` used
 * `px-2` where a third used `px-3`; the permission matrix drew its rule on the
 * cells with `pr-4` and no left padding at all, while the pricing comparison used
 * `px-4 py-4`; one table's header was `text-[0.75rem] font-medium text-ink-subtle`
 * where another wrapped the same words in the uppercase `text-label` treatment.
 * None of it was wrong enough to look broken on the screen it was written on,
 * which is exactly why it survived.
 *
 * A table is the densest thing in the product: marks, totals, rosters and a
 * four-column plan comparison all live in one, and they are read side by side.
 * Where they disagree by 4px of padding the eye reads them as two products.
 *
 * IT IS NOT A WRAPPER FOR `<table>`. It is the cell rhythm: padding, the header
 * treatment, the row rule, and the removal of that rule on the last row. The
 * `<table>`, `<thead>`, `<tbody>` and `<tr>` are all real, because they carry the
 * semantics, the `scope` attributes and the caption. This file only removes the
 * reason to hand-write them differently each time.
 */

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    data-slot="table"
    className={cn('w-full caption-bottom border-collapse text-left', className)}
    {...props}
  />
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} data-slot="table-header" className={cn(className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} data-slot="table-body" className={cn(className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn('border-t border-border font-medium', className)}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

/*
 * The row rule lives here rather than on each cell, so a cell cannot opt out of
 * it by forgetting a class and leave a table with three rules and three gaps.
 * `last:` is on the row, not the table, because the last row is the last row
 * whichever `<tbody>` it happens to sit in.
 */
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn('border-b border-border transition-colors duration-150 last:border-b-0', className)}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

/*
 * `text-label` rather than a hand-written size, weight and colour. It is the
 * uppercase, tracked, ink-subtle treatment the roster and the permission matrix
 * already used, and the pricing comparison had no header treatment at all.
 * `scope` is passed through rather than set here: a header cell is `th` only
 * when it labels something, and that is the caller's decision to make.
 */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    data-slot="table-head"
    className={cn('px-4 py-2.5 text-label align-bottom', className)}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    data-slot="table-cell"
    className={cn('px-4 py-3 align-middle text-[0.9375rem] text-ink', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    data-slot="table-caption"
    className={cn('mt-4 text-meta text-ink-subtle', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};