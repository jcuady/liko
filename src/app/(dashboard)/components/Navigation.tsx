'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BellRing,
  CircleUser,
  ClipboardList,
  History,
  CalendarDays,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  ListChecks,
  Paintbrush,
  PencilLine,
  Presentation,
  ShieldCheck,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { navFor, type Role } from '@/lib/auth/rbac';

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
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/classes', label: 'Classes', icon: Library },
  { href: '/attendance', label: 'Attendance', icon: ListChecks },
  { href: '/plan', label: 'Planner', icon: ClipboardList },
  { href: '/slides', label: 'Slides', icon: Presentation },
  { href: '/grades', label: 'Gradebook', icon: TrendingUp },
  { href: '/assess', label: 'Assess', icon: Layers },
  /*
   * `/schedule` sits in the primary list and is the one entry every role sees,
   * because `class:read` is granted to all four. A student's is the whole of
   * what they can do here: their own week. A teacher arrives at the same grid
   * with a student picker, because the question "what does this child have on
   * Thursday" is the same question with a different subject.
   */
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
];

/**
 * Administration is admin-only, so it is declared separately rather than in
 * `SECONDARY_NAV`. The mobile overflow sheet and the desktop rail both filter
 * through `visibleNav`, which asks the permission matrix rather than comparing
 * roles by hand.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Administration', icon: ShieldCheck },
];

export const SECONDARY_NAV: NavItem[] = [
  /*
   * The student's own route. It is in the secondary list because it is the one
   * destination a teacher never sees: `quiz:take` is granted to students alone,
   * so this line changes the student navigation and leaves every teacher's
   * sidebar, tab bar and overflow sheet exactly as it was.
   */
  { href: '/quiz', label: 'Quizzes', icon: PencilLine },
  /*
   * Beside the quiz because it is the same job: something a student opens to
   * revise. Every role holds `flashcard:read` at some scope, so this line shows
   * for all four and the matrix decides what happens behind it.
   *
   * It was missing the first time this route shipped, which is worth recording:
   * the page worked, the gate worked, and the link did not appear, because
   * `SECONDARY_ROUTES` in the permission table and this list are two separate
   * declarations of the same set. Adding a route to the first one changes no
   * navigation at all.
   */
  { href: '/flashcards', label: 'Flashcards', icon: Layers },
  { href: '/history', label: 'History', icon: History },
  /*
   * RENAMED FROM "Notifications", AND THE BELL ICON WENT WITH IT.
   *
   * The header now has an actual bell: notes about a timetable or a class,
   * addressed to you. This page is a different thing, it is whether LIKO may
   * push to this device when a student is at risk. Two bells in one product,
   * both labelled Notifications, sending somebody to the wrong one, is worse
   * than either name on its own.
   *
   * The route keeps its path. Renaming it would mean the RBAC route table, the
   * responsive sweep and the live verification script all changing together for
   * a URL nobody has bookmarked, which buys nothing a person can see.
   */
  { href: '/settings/notifications', label: 'Push alerts', icon: BellRing },
  { href: '/settings/profile', label: 'Profile', icon: CircleUser },
  { href: '/settings/appearance', label: 'Appearance', icon: Paintbrush },
];

/** How many destinations fit across a 375px viewport without shrinking labels. */
const MOBILE_TAB_LIMIT = 5;

/**
 * The destinations this role may open, in the order they are declared.
 *
 * `/admin` is absent for anyone without `org:manage`. Showing it anyway would
 * hand a teacher a link that leads to the forbidden screen, which reads as a
 * broken product rather than as the permission boundary it actually is.
 */
export function visibleNav(role: Role | undefined): {
  primary: NavItem[];
  secondary: NavItem[];
} {
  const allowed = navFor(role);
  const keep = (prefixes: string[]) => (item: NavItem) => prefixes.includes(item.href);

  return {
    primary: PRIMARY_NAV.filter(keep(allowed.primary)),
    secondary: [...SECONDARY_NAV, ...ADMIN_NAV].filter(keep(allowed.secondary)),
  };
}

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
export function Sidebar({ role }: { role: Role | undefined }) {
  const pathname = usePathname();
  const { primary, secondary } = visibleNav(role);

  return (
    <nav
      aria-label="Workspace"
      // `xl` restores the labels. Below it the rail is icon-only, so every
      // link carries an explicit title as well as its accessible name.
      className="hidden w-[4.25rem] shrink-0 flex-col border-r border-border bg-surface px-2.5 py-4 lg:flex xl:w-[16rem] xl:px-3"
    >
      <ul className="flex flex-col gap-0.5">
        {primary.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={linkClasses(active, false)}
              >
                {/*
                  Phosphor marked the current destination by switching the icon
                  to a filled weight. Lucide has no weight axis, so the same
                  emphasis is drawn with a heavier stroke; the accent colour and
                  the tinted ground come from `linkClasses`.
                */}
                <item.icon
                  size={20}
                  strokeWidth={active ? 2.25 : 1.75}
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
        {secondary.map((item) => {
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
                  strokeWidth={active ? 2.25 : 1.75}
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
export function MobileTabBar({ role }: { role: Role | undefined }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const { primary, secondary } = visibleNav(role);
  const overflow = [...primary.slice(MOBILE_TAB_LIMIT), ...secondary];

  return (
    <>
      <nav
        aria-label="Workspace"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-6">
          {primary.slice(0, MOBILE_TAB_LIMIT).map((item) => {
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
                    strokeWidth={active ? 2.25 : 1.75}
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
              <LayoutGrid size={20} aria-hidden="true" />
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
                  <item.icon size={18} aria-hidden="true" />
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
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}