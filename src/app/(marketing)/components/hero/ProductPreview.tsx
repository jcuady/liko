'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { AttendanceGrid, AttendanceLegend } from '@/components/product/AttendanceGrid';
import { OverviewDashboard } from '@/components/product/OverviewDashboard';
import { TrendLine } from '@/components/product/TrendLine';
import { gradeTrend } from '@/lib/fixtures/workspace';
import type { AttendanceStatus, Stat, Student } from '@/lib/api/types';

/**
 * Device frames.
 *
 * The frames are pure CSS and inline SVG, so they stay sharp at any pixel
 * density or zoom level and carry no raster asset to go stale. Everything
 * inside a screen is the shipping dashboard component, which is what makes the
 * mockup credible and impossible to desynchronise from the product.
 */

/**
 * Ambient blooms behind the mockups. Rotated from the reference image's
 * lavender and rose into the viridian family, since the masterplan forbids
 * purple and teal.
 */
function Blooms() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        className="bloom"
        style={{
          width: '38rem',
          height: '38rem',
          background: 'var(--accent)',
          top: '-8rem',
          right: '-6rem',
          opacity: 0.16,
        }}
      />
      <span
        className="bloom"
        style={{
          width: '30rem',
          height: '30rem',
          background: '#7ea86b',
          bottom: '-10rem',
          left: '-4rem',
          opacity: 0.2,
        }}
      />
      <span
        className="bloom"
        style={{
          width: '22rem',
          height: '22rem',
          background: '#b7cfa8',
          top: '38%',
          left: '38%',
          opacity: 0.18,
        }}
      />
    </div>
  );
}

/** Signal, wifi and battery. Drawn rather than typed so they scale cleanly. */
function StatusIcons() {
  return (
    <span className="flex items-center gap-[0.14rem]">
      <svg width="9" height="7" viewBox="0 0 9 7" fill="currentColor" aria-hidden="true">
        <rect x="0" y="5" width="1.6" height="2" rx="0.5" />
        <rect x="2.4" y="3.4" width="1.6" height="3.6" rx="0.5" />
        <rect x="4.8" y="1.8" width="1.6" height="5.2" rx="0.5" />
        <rect x="7.2" y="0" width="1.6" height="7" rx="0.5" opacity="0.35" />
      </svg>
      <svg width="8" height="7" viewBox="0 0 8 7" fill="currentColor" aria-hidden="true">
        <path d="M4 6.4 5.7 4.7a2.4 2.4 0 0 0-3.4 0L4 6.4Z" />
        <path d="M1.5 3 0 1.5a5.65 5.65 0 0 1 8 0L6.5 3a3.9 3.9 0 0 0-5 0Z" opacity="0.9" />
      </svg>
      <svg width="13" height="7" viewBox="0 0 13 7" fill="none" aria-hidden="true">
        <rect
          x="0.6"
          y="0.6"
          width="10.6"
          height="5.8"
          rx="1.6"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />
        <rect x="2" y="2" width="6.6" height="3" rx="0.8" fill="currentColor" />
        <path d="M12.1 2.4v2.2c.6-.2.9-.6.9-1.1s-.3-.9-.9-1.1Z" fill="currentColor" fillOpacity="0.45" />
      </svg>
    </span>
  );
}

/**
 * A phone. Black bezel, Dynamic Island, and a status bar that reads like the
 * real one, sized off the 9:19.5 screen ratio so the frame stays honest.
 */
function PhoneFrame({
  heading,
  subheading,
  children,
  className,
}: {
  heading: string;
  subheading?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-[9.25rem] shrink-0 select-none', className)}>
      <div className="relative rounded-[1.45rem] bg-[#0b0b0d] p-[0.28rem] shadow-[var(--shadow-lg)] ring-1 ring-black/20">
        {/* Hardware keys sit on the frame edge, outside the screen. */}
        <span className="absolute -left-[1.5px] top-[5.6rem] h-[1.5rem] w-[2px] rounded-l-full bg-[#2b2b30]" />
        <span className="absolute -right-[1.5px] top-[4.4rem] h-[2.4rem] w-[2px] rounded-r-full bg-[#2b2b30]" />
        <span className="absolute -right-[1.5px] top-[7.1rem] h-[2.4rem] w-[2px] rounded-r-full bg-[#2b2b30]" />

        <div className="relative aspect-[9/17.5] overflow-hidden rounded-[1.19rem] bg-white">
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-[0.62rem] pt-[0.34rem] text-[0.5rem] font-semibold text-black">
            <span className="tabular-nums">9:41</span>
            <StatusIcons />
          </div>
          <span className="absolute left-1/2 top-[0.3rem] z-30 h-[0.66rem] w-[2.5rem] -translate-x-1/2 rounded-full bg-black" />

          <div className="flex h-full flex-col pt-[1.45rem]">
            <div className="px-[0.62rem] pb-[0.5rem]">
              <p className="text-[0.72rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
                {heading}
              </p>
              {subheading ? (
                <p className="mt-[0.1rem] truncate text-[0.5rem] text-ink-subtle">
                  {subheading}
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductPreview({
  stats,
  students,
  attendance,
  className,
}: {
  stats: Stat[];
  students: Student[];
  attendance: Record<string, AttendanceStatus>;
  className?: string;
}) {
  // Derived the same way the overview route derives them, so the miniature
  // shows real components with real-shaped data rather than a hand-built fake.
  const attendanceRoster = students.slice(0, 12).map((s) => ({
    id: s.id,
    initials: s.initials,
    name: s.name,
  }));

  return (
    <div className={cn('relative isolate', className)}>
      <Blooms />

      {/*
        The decorative preview is hidden from assistive technology and paired
        with a written description, which carries the same information without
        forcing a screen reader through a miniature UI.
      */}
      <div aria-hidden="true" className="relative pb-5">
        {/* Laptop, centre. */}
        <div className="glass relative rounded-[1.15rem] p-[0.5rem] pb-[0.75rem]">
          <div className="overflow-hidden rounded-[0.65rem] bg-surface">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              <span className="size-2 rounded-full bg-border-strong" />
              <span className="size-2 rounded-full bg-border-strong" />
              <span className="size-2 rounded-full bg-border-strong" />
              <span className="ml-2 rounded-[6px] bg-surface-sunken px-2 py-0.5 text-[0.625rem] text-ink-subtle">
                liko.app/overview
              </span>
            </div>
            <OverviewDashboard
              stats={stats}
              students={students}
              attendance={attendance}
              compact
            />
          </div>
        </div>
        {/* Laptop base: the silver wedge under the lid that reads as hardware. */}
        <div className="mx-auto h-[0.7rem] w-[107%] rounded-b-[1rem] border border-t-0 border-[#c6c0b4] bg-[linear-gradient(to_bottom,#e2ddd3,#c3bdb0)] shadow-[0_10px_18px_-12px_rgba(20,22,18,0.5)]">
          <span className="mx-auto mt-[0.18rem] block h-[0.16rem] w-[13%] rounded-full bg-[#a8a294]" />
        </div>

        {/* Phone, left, angled and overlapping the laptop. */}
        <div className="absolute -bottom-3 left-0 z-10 hidden origin-bottom rotate-[-7deg] lg:block xl:-left-4">
          <PhoneFrame heading="Attendance" subheading="Period 3 · Room 214">
            <div className="px-[0.55rem] pb-2">
              <AttendanceGrid
                students={attendanceRoster}
                marks={attendance}
                compact
                dense
              />
              <div className="mt-2 border-t border-border pt-1.5">
                <AttendanceLegend compact />
              </div>
            </div>
          </PhoneFrame>
        </div>

        {/*
          Phone, right, angled the other way. It carries the trend chart rather
          than the gradebook table: a three-column table needs about 170px and a
          phone screen is 125, so the real table would only ever be seen through
          a scrollbar. The chart is the same component the overview renders.
        */}
        <div className="absolute -right-1 -top-12 z-10 hidden origin-top rotate-[6deg] lg:block xl:-right-3">
          <PhoneFrame heading="Class trend" subheading="Algebra II · 20 weeks">
            <div className="flex flex-col gap-2 px-[0.55rem] pb-2">
              <TrendLine
                values={gradeTrend}
                label="Class average across twenty weeks"
                summary="The class average rose from 71 to 88 over twenty weeks."
              />
              <p className="tabular text-[0.5625rem] text-ink-subtle">
                71 → 88 across 20 weeks
              </p>
            </div>
          </PhoneFrame>
        </div>
      </div>

      <p className="sr-only">
        A preview of the LIKO workspace showing today&apos;s four classes,
        118 students, a live attendance grid, and a twenty-week grade trend that
        rises from 71 to 88.
      </p>
    </div>
  );
}