import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Footer. Locale-agnostic by design: no city, no time, no weather, no version
 * badge. A conversion surface should not look like a debug page.
 */

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '#flow', label: 'The Flow' },
      { href: '#modules', label: 'Modules' },
      { href: '#proof', label: 'Why teachers switch' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '#faq', label: 'Questions' },
      { href: '#modules', label: 'Security' },
      { href: '#proof', label: 'Contact' },
    ],
  },
  {
    heading: 'Workspace',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create an account' },
      { href: '/overview', label: 'Open workspace' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border py-14 md:py-16">
      <div className="container-marketing">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-[18rem]">
            <LikoLogo showWordmark />
            <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-muted">
              Plan, create, assess, grade, and analyze on a single thread.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-14">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h2 className="text-label">{column.heading}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {column.links.map((link) => (
                    <li key={`${column.heading}-${link.label}`}>
                      <Link
                        href={link.href}
                        className="rounded-[6px] text-[0.9375rem] text-ink-muted transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-ink-subtle">
            FERPA-aligned handling. COPPA-aware defaults for K-12.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-[0.8125rem] text-ink-subtle">
              Privacy
            </span>
            <span className="text-[0.8125rem] text-ink-subtle">Terms</span>
            <span className="text-[0.8125rem] text-ink-subtle">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
}