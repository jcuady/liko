import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

const TITLE = 'Cookie Notice';
const DESCRIPTION =
  'Every cookie and every piece of browser storage LIKO sets, what each one is for, how long it lasts, and how to remove it. There is no tracking list here because there is no tracking.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/cookies' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/cookies',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Cookie Notice"
      summary="LIKO sets one cookie to keep you signed in, and stores two preferences in your browser. There is no analytics script, no advertising pixel and no third party tracking on this site, so there is no list of trackers to opt out of."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'the-short-version',
          heading: 'The short version',
          body: (
            <>
              <ul>
                <li>
                  One cookie, <code>liko_session</code>, keeps you signed in. It
                  cannot be turned off because the product does not work without
                  it.
                </li>
                <li>
                  One cookie, <code>liko_consent</code>, remembers your answer to
                  the cookie banner so you are not asked again.
                </li>
                <li>
                  Your theme choice, light or dark, is kept in your browser&apos;s
                  local storage. It is never sent to us.
                </li>
                <li>
                  We set no advertising cookies, no analytics cookies and no
                  cookies from any third party.
                </li>
              </ul>
              <p>
                If any of that changes, this page changes first and the change is
                dated.
              </p>
            </>
          ),
        },
        {
          id: 'strictly-necessary',
          heading: 'Strictly necessary',
          body: (
            <>
              <p>
                These make the service work. They cannot be switched off without
                breaking the thing you came here to do, so they are not optional
                and the cookie banner does not offer you a choice about them.
              </p>
              <h3>liko_session</h3>
              <p>
                Holds your signed session. Without it every request would be
                anonymous and you would be asked to sign in on each page.
              </p>
              <ul>
                <li>Set when you sign in, and when you complete a verification link</li>
                <li>Expires after 24 hours, or after 7 days if you asked to stay signed in</li>
                <li>Not readable by JavaScript</li>
                <li>Sent only to this site, and only on requests to this site</li>
                <li>Cleared immediately when you sign out</li>
              </ul>
              <p>
                The token is signed, so it cannot be edited to change who you are.
                It is not readable by any script on the page, which is what keeps
                it out of reach of an injected one.
              </p>
              <h3>liko_consent</h3>
              <p>
                Remembers that you have answered the cookie banner, and what you
                answered. Without it you would be asked again on every visit,
                which is its own kind of bad experience.
              </p>
              <ul>
                <li>Set when you choose on the cookie banner</li>
                <li>Expires after 180 days, then you are asked once more</li>
                <li>Readable by JavaScript, because the banner has to read it</li>
                <li>Cleared when you clear cookies for this site</li>
              </ul>
            </>
          ),
        },
        {
          id: 'optional',
          heading: 'Optional, and only with your agreement',
          body: (
            <>
              <p>
                There is one optional thing, and it is not tracking.
              </p>
              <h3>Your theme preference</h3>
              <p>
                If you pick the dark theme, LIKO remembers it so the next page you
                open is not a flash of white. It is kept in your browser&apos;s
                local storage, which never leaves your device and is never sent to
                us or to anyone else.
              </p>
              <p>
                If you choose <strong>Essential only</strong>, we do not store it.
                Your browser still uses the theme your operating system asks for,
                so the site follows the system setting instead of your last choice.
                Every other part of the product behaves identically.
              </p>
              <p>
                Choose Essential only and the site is fully usable. Nothing behind
                this preference is a marketing surface.
              </p>
            </>
          ),
        },
        {
          id: 'what-we-do-not-do',
          heading: 'What we do not do',
          body: (
            <>
              <p>
                Stated plainly, because a cookie notice that only lists what a
                company does is not very useful.
              </p>
              <ul>
                <li>
                  We run no analytics script. Nobody is measuring which pages you
                  read.
                </li>
                <li>We set no advertising or retargeting cookies.</li>
                <li>We embed no social pixels or share buttons that report back.</li>
                <li>We set no third party cookies of any kind.</li>
                <li>We do not build a profile of you across sites.</li>
                <li>
                  We do not read anything already in your browser from another
                  site.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'change-choice',
          heading: 'Changing your choice',
          body: (
            <>
              <p>
                Clearing cookies for this site removes the banner answer and you
                will be asked again on your next visit. Your browser&apos;s own
                controls, usually under Settings or Privacy, can delete cookies
                for this site at any time.
              </p>
              <p>
                You can also clear the stored theme preference the same way. The
                theme then follows your operating system until you choose again.
              </p>
              <p>
                Turning off cookies entirely will let you read every public page,
                including these documents, and this notice. Signing in will stop
                working, because that one cookie is what identifies the session.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact',
          body: (
            <p>
              Questions about this notice go to <strong>privacy@liko.app</strong>.
              For anything involving a child&apos;s data, use the address on the
              Privacy Notice so it reaches the person who handles those.
            </p>
          ),
        },
      ]}
    />
  );
}