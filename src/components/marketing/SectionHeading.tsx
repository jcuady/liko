import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The eyebrow and title every marketing section repeats.
 *
 * Shared rather than owned by the landing page, because `/pricing` sets its
 * headings the same way and two components doing one job is how a marketing
 * surface ends up with two different section voices.
 *
 * NOTE ON THE EYEBROW. The supplied brand design numbers its feature cards
 * "01 / CREATE" and "02 / UNDERSTAND", which reads as a chapter marker rather
 * than as a heading. That is kept, deliberately, on the cards where the number
 * means something. It is never used on a section heading, where it would just
 * be the old numbered-eyebrow habit wearing the brand's clothes.
 */
export function SectionHeading({
  eyebrow,
  title,
  copy,
  align = 'center',
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  copy?: React.ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <div className={cn(align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      <p className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
        {eyebrow}
      </p>
      <h2 className="mb-4 text-[clamp(1.8rem,4vw,2.375rem)] font-semibold leading-[1.22] text-balance">
        {title}
      </h2>
      {copy ? (
        <p
          className={cn(
            'text-[0.9375rem] leading-[1.75] text-ink-muted',
            align === 'center' ? 'mx-auto max-w-[560px]' : 'max-w-[560px]',
          )}
        >
          {copy}
        </p>
      ) : null}
    </div>
  );
}