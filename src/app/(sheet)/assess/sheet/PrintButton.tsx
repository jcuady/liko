'use client';

import { PrinterIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';

/**
 * Prints the sheet.
 *
 * `window.print` rather than a generated PDF: the browser already owns the
 * paper size, the margins and the scale-to-fit, and every one of those is
 * something the detector's geometry depends on. A PDF pipeline would have to
 * reproduce them and would eventually disagree.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="primary" onClick={() => window.print()}>
      <PrinterIcon size={18} aria-hidden="true" />
      Print the sheet
    </Button>
  );
}