import * as React from 'react';

import {
  BRAND_GREEN,
  LOCKUP_VIEWBOX,
  MARK_PATHS,
  MARK_STROKE,
  MARK_VIEWBOX,
  O_PATH,
  WORDMARK_PATHS,
} from '@/components/brand/logo-geometry';
import { cn } from '@/lib/utils';

/**
 * The LIKO mark: the LK ligature drawn as a single continuous stroke that runs
 * from the foot on the lower left, up and over a semicircular arch, and back
 * down as the K's stem. `currentColor` throughout, so it inherits the accent
 * from its context and turns white on a filled tile.
 */
function LikoMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      className={cn('size-7 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <g
        stroke="currentColor"
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="miter"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * The full lockup: the ligature followed by the LIKO wordmark. The wordmark is
 * optically centred against the monogram rather than sitting on its baseline,
 * which is what the supplied artwork does.
 */
function LikoLogo({
  className,
  showWordmark = true,
  href,
  title,
}: {
  className?: string;
  showWordmark?: boolean;
  href?: string;
  title?: string;
}) {
  const content = (
    <svg
      viewBox={showWordmark ? LOCKUP_VIEWBOX : MARK_VIEWBOX}
      fill="none"
      className={cn('h-7 w-auto shrink-0 text-accent', className)}
      role="img"
      aria-label={title ?? 'LIKO'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title ?? 'LIKO'}</title>
      <g
        stroke="currentColor"
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="miter"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {showWordmark ? (
        <>
          <path d={O_PATH} fill="currentColor" fillRule="evenodd" stroke="none" />
          <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="miter">
            {WORDMARK_PATHS.map((p) => (
              <path key={p.d} d={p.d} strokeWidth={p.width} />
            ))}
          </g>
        </>
      ) : null}
    </svg>
  );

  if (!href) return content;

  return (
    <a
      href={href}
      aria-label="LIKO home"
      className={cn(
        'pressable inline-flex rounded-[8px]',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent',
        className,
      )}
    >
      {content}
    </a>
  );
}

export { LikoMark, LikoLogo, BRAND_GREEN };