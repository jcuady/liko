import * as React from 'react';
import Link from 'next/link';
import { ClockIcon } from '@phosphor-icons/react/dist/ssr';

import { MarketingNav } from '@/components/layout/MarketingNav';
import { Footer } from '@/components/layout/Footer';

/**
 * Shared shell for the three legal documents.
 *
 * WHY THIS EXISTS. Terms, Privacy and Cookies are the same page with different
 * text. Building the frame three times meant three chances for the layout to
 * drift and, more importantly, three chances to leave one of them without the
 * version line that says which text the reader actually accepted. The version is
 * passed in and printed, because `TERMS_VERSION` in `src/lib/auth/consent.ts` is
 * what a consent record is stamped with, and a record whose document cannot be
 * pinned to a version is not evidence of anything.
 */

export interface LegalSection {
  /**
   * Anchor id. Rendered on the section AND linked from the contents list, so a
   * TOC link can never point at something that is not there.
   */
  id: string;
  heading: string;
  body: React.ReactNode;
}

export interface LegalMeta {
  title: string;
  /** One or two sentences. Sits under the heading and is the only part that a
   *  skim-reading person is guaranteed to see, so it states the actual point. */
  summary: string;
  /** The version string stamped onto consent records. */
  version: string;
  sections: LegalSection[];
  /** Set on the document that the signup form links to, for context in the TOC. */
  referencedBy?: string;
}

const VERSION_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatVersion(version: string): string {
  // `YYYY-MM-DD`, rendered unambiguously rather than left as a raw token in the
  // middle of a sentence. An unparseable value falls through rather than
  // printing "Invalid Date".
  const parsed = new Date(`${version}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? version : VERSION_FORMAT.format(parsed);
}

export function LegalDocument({ title, summary, version, sections }: LegalMeta) {
  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable left-4 top-4 z-50 rounded-[8px] bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent"
      >
        Skip to content
      </a>

      <MarketingNav />

      <main id="main" className="overflow-x-hidden pb-20 pt-14 md:pt-20">
        <div className="container-marketing">
          <p className="text-label">Legal</p>

          <h1 className="text-display mt-5 max-w-[18ch]">{title}</h1>

          <p className="measure mt-6 text-lead">{summary}</p>

          <p className="mt-6 flex items-center gap-1.5 text-meta text-ink-subtle">
            <ClockIcon size={15} aria-hidden="true" />
            Version {formatVersion(version)}
          </p>

          {/*
            Two columns from `lg` up. The contents list is sticky because a legal
            document is read by scrolling and by jumping, and on a long page
            losing the contents at the top is what makes people give up.
          */}
          <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
            <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
              <h2 className="text-label">Contents</h2>
              <ol className="mt-4 flex flex-col gap-2.5">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    {/*
                      The number is an ordered-list marker, not a styled eyebrow,
                      so it carries no meaning the reader could act on without the
                      heading next to it. It is also inside the anchor, so a
                      screen reader reads "2. What we collect" rather than a bare
                      number that points nowhere.
                    */}
                    <a
                      href={`#${section.id}`}
                      className="flex gap-2 rounded-[6px] text-[0.9375rem] leading-snug text-ink-muted transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                      <span className="tabular shrink-0 text-ink-subtle">
                        {index + 1}.
                      </span>
                      <span>{section.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="min-w-0">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="text-h3">{section.heading}</h2>
                  <div className="legal-body mt-4">{section.body}</div>
                </section>
              ))}

              <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-8">
                <p className="text-meta text-ink-subtle">Related documents</p>
                <RelatedLink href="/terms">Terms of Use</RelatedLink>
                <RelatedLink href="/privacy">Privacy Notice</RelatedLink>
                <RelatedLink href="/cookies">Cookie Notice</RelatedLink>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer context="legal" />
    </>
  );
}

function RelatedLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[6px] text-[0.9375rem] font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      {children}
    </Link>
  );
}