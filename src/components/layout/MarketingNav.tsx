'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, List, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Marketing nav, on the brand design's proportions.
 *
 * THE LINKS ARE THE LANDING PAGE'S SECTIONS. The design's header points at
 * Features, Classrooms, Mobile and Pricing, which are the four anchors a
 * visitor needs to move around the page it is sitting at the top of.
 *
 * Section links are rewritten to `/#anchor` anywhere other than `/`, because a
 * bare hash on `/pricing` jumps to an anchor that page does not have. A header
 * link that silently does nothing on every page but one is worse than no link.
 */

/** `null` means this route has no such section, and the link is hidden. */
const LINKS: readonly { href: string; label: string }[] = [
  { href: '#features', label: 'Features' },
  { href: '#classrooms', label: 'For every teacher' },
  { href: '#mobile', label: 'Mobile app' },
  { href: '#pricing', label: 'Pricing' },
] as const;

const QUICK_LINKS: readonly { href: string; label: string }[] = [
  { href: '/login', label: 'Log in' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/cookies', label: 'Cookies' },
] as const;

function NavLink({
  href,
  label,
  className,
  onClick,
}: {
  href: string;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  const shared = { className, onClick };

  // A route link goes through the router; a section link must stay a plain
  // anchor so the browser can jump to the section without a client transition.
  if (href.startsWith('/')) {
    return (
      <Link href={href} {...shared}>
        {label}
      </Link>
    );
  }

  return (
    <a href={href} {...shared}>
      {label}
    </a>
  );
}

export function MarketingNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const isLanding = pathname === '/';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--surface)]/85 backdrop-blur-lg">
      <nav
        aria-label="Main navigation"
        className="container-marketing flex h-[74px] items-center justify-between gap-6 md:h-[88px]"
      >
        <Link href="/" className="shrink-0" aria-label="Liko home">
          <LikoLogo showWordmark />
        </Link>

        <ul className="hidden items-center gap-6 md:flex lg:gap-8">
          {LINKS.map((link) => (
            <li key={link.href}>
              <NavLink
                href={isLanding ? link.href : `/${link.href}`}
                label={link.label}
                className="inline-flex min-h-11 items-center rounded-[8px] text-[13px] font-medium text-ink-muted transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-accent"
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">
              Log in
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </Button>

          {/*
            * `max-sm` padding, not a shorter label. "Try Liko free" is five
            * characters longer than the label it replaced and that was exactly
            * the 5px of horizontal scroll it produced at 320px, with the whole
            * nav row, not the landing sections, as the offender.
            */}
          <Button asChild size="sm" className="rounded-pill max-sm:px-2.5 max-sm:text-[13px]">
            <Link href="/register">
              Try Liko free
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={open ? 'Close navigation' : 'Open navigation'}
              >
                {open ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-[20px] pb-8">
              <SheetTitle className="sr-only">Mobile navigation</SheetTitle>
              <ul className="flex flex-col">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <NavLink
                      href={isLanding ? link.href : `/${link.href}`}
                      label={link.label}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[52px] items-center border-b border-border text-[1.0625rem] text-ink last:border-0"
                    />
                  </li>
                ))}
                {QUICK_LINKS.map((link) => (
                  <li key={link.href}>
                    <NavLink
                      href={link.href}
                      label={link.label}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[52px] items-center border-b border-border text-[1.0625rem] text-ink last:border-0"
                    />
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-6">
                <Link href="/register" onClick={() => setOpen(false)}>
                  Try Liko free
                </Link>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}