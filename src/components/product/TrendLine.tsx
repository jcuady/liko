'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Grade trend. An SVG polyline rather than a chart library: it is a dozen
 * points, and a dependency would cost more bytes than the whole landing page
 * hero.
 *
 * The chart is decorative and paired with an adjacent text summary, because a
 * screen reader gains nothing from 20 data points in a path element.
 */

export interface TrendLineProps {
  values: number[];
  label: string;
  summary: string;
  compact?: boolean;
  className?: string;
}

function toPath(values: number[], width: number, height: number) {
  if (values.length < 2) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function TrendLine({
  values,
  label,
  summary,
  compact = false,
  className,
}: TrendLineProps) {
  const width = 100;
  const height = 32;
  const path = toPath(values, width, height);

  return (
    <figure className={cn('m-0', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}. ${summary}`}
        className={cn('w-full overflow-visible', compact ? 'h-10' : 'h-20')}
      >
        <defs>
          <linearGradient id="liko-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${path} L ${width} ${height} L 0 ${height} Z`}
          fill="url(#liko-trend-fill)"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}