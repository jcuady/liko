import * as React from 'react';

import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

/**
 * Marketing section shell.
 *
 * Carries the small plain topic label above the large headline, which is the
 * header rhythm taken from the reference. It is a topic word, not a section
 * number, so it stays inside the anti-slop rules.
 *
 * The reveal lives here rather than in each caller so every section header on
 * the page arrives the same way, and a new section cannot forget it. Pass
 * `reveal={false}` where a header sits inside its own scroll narrative and
 * would fight the animation driving it.
 */
export function SectionHeader({
  label,
  title,
  children,
  align = 'left',
  className,
  id,
  reveal = true,
}: {
  label: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
  id?: string;
  reveal?: boolean;
}) {
  const header = (
    <>
      <p className="text-label">{label}</p>
      <h2 id={id} className="text-h2 mt-3">
        {title}
      </h2>
      {children ? <div className="mt-5">{children}</div> : null}
    </>
  );

  return (
    <div
      className={cn(
        'max-w-[46rem]',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {reveal ? <Reveal>{header}</Reveal> : header}
    </div>
  );
}