import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Footer.
 *
 * Locale-agnostic by design: no city, no time, no weather, no version badge. A
 * conversion surface should not look like a debug page.
 *
 * WHY THE ANCHORS ARE ABSOLUTE AND WHY IT TAKES A `context`. The marketing
 * columns link to section anchors on `/`. Written as bare `#flow` they resolved
 * against whatever page they were rendered on, so the same component worked on
 * the landing page and produced four dead links everywhere else. `/#flow` is
 * correct from any route, which is why one footer now serves `/`, `/pricing` and
 * the legal pages rather than three near-identical copies.
 *
 * `context="legal"` drops the marketing columns anyway, because on a document
 * about privacy the last thing a reader needs is an advertisement.
 *
 * WHY THE OLD "Company" COLUMN IS GONE. It listed "Security" pointing at
 * `#modules` and "Contact" pointing at `#proof`. Neither went to security or to
 * a contact address, and the bottom row's Privacy, Terms and Security were
 * plain `<span>`s styled like links that went nowhere at all. Three dead links
 * pretending to be compliance information is worse than no footer links, so they
 * now point at documents that exist, and the compliance claim links to the
 * document that actually makes it.
 *
 * WHY THE PRODUCT ANCHORS NOW POINT AT SECTIONS THAT EXIST. Removing that
 * Company column fixed two dead links and left the same two dead targets sitting
 * in the Product column, because `modules` and `proof` were never the names of
 * anything. When the landing page was rebuilt on the supplied design its sections
 * became `flow`, `classrooms`, `features`, `story`, `mobile`, `pricing` and
 * `faq`, and the footer was not updated to match. "Modules" now points at the
 * feature tabs and "Why teachers switch" at the teacher's own account of the
 * work, which is what those sections actually say.
 *
 * These three shipped dead to production and the end-to-end anchor check passed
 * throughout, because it selects `a[href^="#"]` and the switch to absolute
 * anchors above moved every one of them out of that selector. A check scoped to
 * the syntax it was written for stops covering the links the moment someone
 * fixes them a different way. `e2e/landing.spec.ts` now matches `a[href^="/#"]`
 * as well, and resolves it against the landing page.
 */

type FooterContext = 'marketing' | 'legal';

interface Column {
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}

/*
 * WHY THE LEGAL COLUMN IS THE FULL SET. This was three links when there were
 * three legal documents, and it stayed three after four more appeared, which
 * left the acceptable use rules, the children's notice, the subprocessor list
 * and the processing agreement reachable only from inside another document.
 *
 * That is the wrong shape for this set specifically. The documents divide into
 * clusters: the acceptable use rules are what the terms summarise, the
 * children's notice is what the privacy notice defers to, the subprocessor list
 * is the evidence behind the privacy notice's sentence about third parties, and
 * the processing agreement is the instrument the other two describe. A reader
 * who has to guess which document holds the answer is a reader who concludes
 * there is no answer.
 *
 * Order is deliberate: the three that were already here stay at the top so no
 * existing position moves, then the four that answer the questions those three
 * defer to. All seven are also linked from the "Related documents" footer of
 * every legal document itself, so a reader arriving mid-document has the same
 * set without going back to the site footer.
 */

const PRODUCT: Column = {
  heading: 'Product',
  links: [
    { href: '/#flow', label: 'The Flow' },
    { href: '/#features', label: 'Modules' },
    { href: '/#story', label: 'Why teachers switch' },
    { href: '/pricing', label: 'Pricing' },
  ],
};

const WORKSPACE: Column = {
  heading: 'Workspace',
  links: [
    { href: '/login', label: 'Sign in' },
    { href: '/register', label: 'Create an account' },
    { href: '/overview', label: 'Open workspace' },
  ],
};

const COMPANY: Column = {
  heading: 'Company',
  links: [
    { href: '/#faq', label: 'Questions' },
    { href: '/cookies', label: 'What we store' },
  ],
};

const LEGAL: Column = {
  heading: 'Legal',
  links: [
    { href: '/terms', label: 'Terms of Use' },
    { href: '/privacy', label: 'Privacy Notice' },
    { href: '/cookies', label: 'Cookie Notice' },
    { href: '/acceptable-use', label: 'Acceptable Use' },
    { href: '/children-privacy', label: "Children's Privacy" },
    { href: '/subprocessors', label: 'Subprocessors' },
    { href: '/dpa', label: 'Data Processing Agreement' },
  ],
};

export function Footer({ context = 'marketing' }: { context?: FooterContext }) {
  const columns =
    context === 'marketing' ? [PRODUCT, COMPANY, WORKSPACE] : [LEGAL, WORKSPACE];

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
            {columns.map((column) => (
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
            {/*
              The claim links to the document that makes it in full, rather than
              resting on the marketing page as an unlinked assertion.
            */}
            <Link
              href="/privacy"
              className="rounded-[4px] underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              FERPA and COPPA handling
            </Link>
          </p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/terms"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Privacy
            </Link>
            <Link
              href="/cookies"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Cookies
            </Link>
            {/*
              The remaining four documents are listed here rather than left to
              the LEGAL column alone. This strip is the shortest path off a
              marketing page, and the three most contested questions LIKO gets
              asked are a parent's rights, what the acceptable use rules are, and
              who holds the data. All three were previously answerable only by
              someone who already knew to ask.
            */}
            <Link
              href="/children-privacy"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Children
            </Link>
            <Link
              href="/acceptable-use"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Acceptable Use
            </Link>
            <Link
              href="/subprocessors"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Subprocessors
            </Link>
            <Link
              href="/dpa"
              className="rounded-[6px] text-[0.8125rem] text-ink-subtle transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              DPA
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}