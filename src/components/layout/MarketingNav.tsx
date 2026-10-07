'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListIcon, XIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Marketing nav. One line at desktop, full-screen menu below.
 *
 * The CTA label is "Start free trial" here, in the hero, and in the footer.
 * One label per intent, repeated verbatim, so nobody has to wonder whether
 * "Sign up" and "Get started" go to the same place.
 *
 * Shared by every marketing route, so the section links have to resolve off the
 * landing page too. `#flow` only means "this page" on `/`; anywhere else it is
 * `/#flow`, because a bare hash on `/pricing` would jump to an anchor that page
 * does not have.
 */

const LINKS = [
  { href: '#flow', label: 'Flow' },
  { href: '#modules', label: 'Modules' },
  { href: '/pricing', label: 'Pricing' },
  { href: '#proof', label: 'Why teachers switch' },
  { href: '#faq', label: 'Questions' },
];

function NavLink({
  href,
  label,
  current,
  className,
  onClick,
}: {
  href: string;
  label: string;
  current: boolean;
  className: string;
  onClick?: () => void;
}) {
  const shared = {
    'aria-current': current ? ('page' as const) : undefined,
    className,
    onClick,
  };

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
        aria-label="Main"
        className="container-marketing flex h-[68px] items-center justify-between gap-6"
      >
        <Link href="/" className="shrink-0" aria-label="LIKO home">
          <LikoLogo showWordmark />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <NavLink
                href={isLanding || link.href.startsWith('/') ? link.href : `/${link.href}`}
                label={link.label}
                current={pathname === link.href}
                className={`rounded-[8px] text-[0.9375rem] transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${
                  pathname === link.href ? 'text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">Start free trial</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={open ? 'Close menu' : 'Open menu'}
              >
                {open ? (
                  <XIcon size={20} weight="bold" aria-hidden="true" />
                ) : (
                  <ListIcon size={20} weight="bold" aria-hidden="true" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-[20px] pb-8">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <ul className="flex flex-col">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <NavLink
                      href={isLanding || link.href.startsWith('/') ? link.href : `/${link.href}`}
                      label={link.label}
                      current={pathname === link.href}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-[52px] items-center border-b border-border text-[1.0625rem] last:border-0 ${
                        pathname === link.href ? 'text-accent' : 'text-ink'
                      }`}
                    />
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-6">
                <Link href="/register" onClick={() => setOpen(false)}>
                  Start free trial
                </Link>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}