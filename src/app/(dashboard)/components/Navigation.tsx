'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BellIcon,
  BooksIcon,
  ChartLineUpIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  GridFourIcon,
  ListChecksIcon,
  PaintBrushIcon,
  StackIcon,
  UserCircleIcon,
  XIcon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * Navigation model.
 *
 * One array drives the desktop sidebar, the mobile tab bar, and the command
 * palette, so a new route cannot appear in one and be forgotten in another.
 *
 * `/assess` and `/settings/appearance` existed as routes but appeared in no
 * list, which made both unreachable from the interface. They are here now.
 *
 * Mobile shows the first five destinations and puts everything else behind
 * More. That is a deliberate grouping rather than a squeeze: six icons in a
 * 375px row is roughly 62px each, which is under the 44px comfortable target
 * once the labels are accounted for.
 *
 * The desktop rail collapses to icons between 1024px and 1280px, where a full
 * 16rem sidebar would take a fifth of the content width for five words.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    weight?: 'regular' | 'bold' | 'fill' | 'duotone';
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: GridFourIcon },
  { href: '/classes', label: 'Classes', icon: BooksIcon },
  { href: '/attendance', label: 'Attendance', icon: ListChecksIcon },
  { href: '/plan', label: 'Planner', icon: ClipboardTextIcon },
  { href: '/grades', label: 'Gradebook', icon: ChartLineUpIcon },
  { href: '/assess', label: 'Assess', icon: StackIcon },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: '/history', label: 'History', icon: ClockCounterClockwiseIcon },
  { href: '/settings/notifications', label: 'Notifications', icon: BellIcon },
  { href: '/settings/profile', label: 'Profile', icon: UserCircleIcon },
  { href: '/settings/appearance', label: 'Appearance', icon: PaintBrushIcon },
];

/** How many destinations fit across a 375px viewport without shrinking labels. */
const MOBILE_TAB_LIMIT = 5;

export function isActivePath(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function linkClasses(active: boolean, collapsed: boolean): string {
  return cn(
    'pressable flex min-h-[44px] items-center rounded-[10px]',
    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
    'text-[0.9375rem] transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    active
      ? 'bg-accent-subtle font-medium text-accent'
      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  );
}

/** Desktop sidebar. Icons only on the rail, labels from 1280px. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      // `xl` restores the labels. Below it the rail is icon-only, so every
      // link carries an explicit title as well as its accessible name.
      className="hidden w-[4.25rem] shrink-0 flex-col border-r border-border bg-surface px-2.5 py-4 lg:flex xl:w-[16rem] xl:px-3"
    >
      <ul className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={linkClasses(active, false)}
              >
                <item.icon
                  size={20}
                  weight={active ? 'fill' : 'regular'}
                  aria-hidden="true"
                  className="shrink-0 xl:size-[18px]"
                />
                <span className="hidden xl:inline">{item.label}</span>
                <span className="sr-only xl:hidden">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="my-4 border-t border-border" />

      <ul className="flex flex-col gap-0.5">
        {SECONDARY_NAV.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={linkClasses(active, false)}
              >
                <item.icon
                  size={20}
                  weight={active ? 'fill' : 'regular'}
                  aria-hidden="true"
                  className="shrink-0 xl:size-[18px]"
                />
                <span className="hidden xl:inline">{item.label}</span>
                <span className="sr-only xl:hidden">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile tab bar. Five destinations plus More, inside the safe-area inset. */
export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const overflow = [...PRIMARY_NAV.slice(MOBILE_TAB_LIMIT), ...SECONDARY_NAV];

  return (
    <>
      <nav
        aria-label="Workspace"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-6">
          {PRIMARY_NAV.slice(0, MOBILE_TAB_LIMIT).map((item) => {
            const active = isActivePath(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[56px] flex-col items-center justify-center gap-1',
                    'px-1 text-[0.6875rem] transition-colors duration-150',
                    active ? 'text-accent' : 'text-ink-subtle',
                  )}
                >
                  <item.icon
                    size={20}
                    weight={active ? 'fill' : 'regular'}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More destinations"
              aria-haspopup="dialog"
              className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] text-ink-subtle"
            >
              <GridFourIcon size={20} weight="regular" aria-hidden="true" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] pb-8">
          <SheetTitle className="sr-only">More destinations</SheetTitle>
          <ul className="flex flex-col">
            {overflow.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[52px] items-center gap-3 border-b border-border text-[1.0625rem] text-ink last:border-0"
                >
                  <item.icon size={18} weight="regular" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="pressable mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] text-[0.9375rem] text-ink-muted"
          >
            <XIcon size={16} weight="bold" aria-hidden="true" />
            Close
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}