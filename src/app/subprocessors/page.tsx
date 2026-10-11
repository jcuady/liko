import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

/**
 * Subprocessor list.
 *
 * WHY THIS PAGE IS BUILT FROM THE CODE RATHER THAN FROM A POLICY. A subprocessor
 * list that is maintained by hand and not checked against the stack goes stale
 * the first time someone adds a dependency, and a stale list is worse than no
 * list because a school relies on it. Every entry below is evidenced by a file in
 * this repository, and the file is named in the entry so a reader, or a
 * reviewer, can check it rather than take it on trust.
 *
 * THE HONEST CONSTRAINT. Only subprocessors that can be evidenced are listed. A
 * vendor that is "probably" involved is not listed, and neither is a component
 * of a provider unless it actually processes data here. Where the honest answer
 * is that nothing else is involved, this page says so, because that is a
 * factual claim a school can rely on and the one most likely to change.
 *
 * IT IS A DRAFT FOR REVIEW by a lawyer, and it is not a statement that any
 * provider named here has been assessed or certified.
 */

const TITLE = 'Subprocessors';
const DESCRIPTION =
  'The list of third parties that process personal data on LIKO instructions, what each one processes, why it is involved, and where it runs. Every entry is evidenced by the file in the LIKO codebase that depends on it.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/subprocessors' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/subprocessors',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function SubprocessorsPage() {
  return (
    <LegalDocument
      title="Subprocessors"
      summary="LIKO does not run its own servers or its own database. The list below names every third party that processes personal data on a school's instructions, what each one does, and why. Each entry cites the file in the LIKO codebase that depends on it, so the list can be checked rather than believed."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'what-this-is',
          heading: 'What this list is',
          body: (
            <>
              <p>
                A subprocessor is a company or service that processes personal
                data on behalf of another company, under that company&apos;s
                instructions. LIKO does not run its own database or its own
                servers, so the list below is not empty and is not short.
              </p>
              <p>
                This list covers personal data held in a LIKO workspace. It does
                not cover the public marketing pages, where no account data is
                involved.
              </p>
              <p>
                <strong>Effective date: 1 February 2026.</strong> The list
                changes as the stack changes. When it does, the school is
                notified before the change takes effect, and this page is
                updated with it.
              </p>
              <p>
                Every entry below names the file in the LIKO codebase that
                depends on it. That is deliberate. A subprocessor list that can
                only be taken on trust is a list nobody can check, and a school
                that is asked to rely on one is entitled to ask where it came
                from.
              </p>
            </>
          ),
        },
        {
          id: 'the-list',
          heading: 'The subprocessors',
          body: (
            <>
              <h3>Supabase</h3>
              <p>
                <strong>What it processes:</strong> the database. Every student
                record, mark, attendance entry, lesson plan and account row, plus
                the authentication records: email addresses, password hashes,
                session tokens and the consent log.
              </p>
              <p>
                <strong>Why it is involved:</strong> Supabase provides the
                Postgres database, the authentication service and the row level
                security that restricts each account to its own records. The
                access controls that keep one school out of another school&apos;s
                data are enforced in this database rather than only in the
                interface, which is the main reason it is here.
              </p>
              <p>
                <strong>Where it runs:</strong> the region the school selected
                when the subscription was created. If that region is outside the
                UK or the European Economic Area, the transfer is covered by the
                UK or EU international data transfer standard clauses, or by an
                adequacy decision where one applies.
              </p>
              <p>
                <strong>Evidenced by:</strong> <code>src/lib/supabase/server.ts</code>{' '}
                and <code>src/lib/env.ts</code>, which hold the project URL and
                build every server-side client.
              </p>

              <h3>Vercel</h3>
              <p>
                <strong>What it processes:</strong> the application itself. The
                pages are served from it, the server-side code runs on it, and it
                holds the request and response data that passes through, which
                includes session cookies and the content of a request.
              </p>
              <p>
                <strong>Why it is involved:</strong> LIKO is deployed as a Next.js
                application and Vercel is the host it is deployed to. It also
                runs the daily scheduled job that produces the at-risk digest, so
                it invokes that job and receives what the job reads in order to
                run it.
              </p>
              <p>
                <strong>Where it runs:</strong> the region the project is
                deployed to, which is set at deployment time and is the same
                region as the application.
              </p>
              <p>
                <strong>Evidenced by:</strong> <code>vercel.json</code>, which
                declares the schedule, and <code>src/app/api/cron/at-risk/route.ts</code>,
                which is the job it invokes.
              </p>

              <h3>Browser and device push services</h3>
              <p>
                <strong>What it processes:</strong> a notification message, when
                a teacher has turned push notifications on. That message can
                include the names of students who have fallen below the threshold
                for needing attention.
              </p>
              <p>
                <strong>Why it is involved:</strong> this is how web push works.
                The browser or operating system, not LIKO, chooses the push
                service. A subscription created in Chrome routes through Google,
                one created in Firefox routes through Mozilla, and one created on
                Safari or iOS routes through Apple. LIKO does not pick one and
                cannot substitute a different one.
              </p>
              <p>
                <strong>What it cannot see:</strong> the message content. The
                payload is encrypted for the teacher&apos;s device before it
                leaves our server, using the keys in the browser&apos;s own
                subscription, so the push service relays a payload it cannot
                read. It holds the subscription identifier and its own delivery
                metadata, and it will hold the message for up to 12 hours if the
                device is offline.
              </p>
              <p>
                <strong>Where it runs:</strong> the operator&apos;s own
                infrastructure, outside LIKO&apos;s region. This is worth being
                explicit about, because it means the one part of the stack where
                a payload leaves our infrastructure is a service LIKO does not
                control the location of.
              </p>
              <p>
                <strong>Evidenced by:</strong> <code>src/lib/push/endpoint.ts</code>,
                which lists the push services a subscription may legitimately
                point at, and <code>src/lib/push/send.ts</code>, which performs
                the dispatch. The list is restricted to those services on both
                the way in and the way out, so a stored endpoint cannot be used to
                make the server fetch an arbitrary address.
              </p>
            </>
          ),
        },
        {
          id: 'what-is-not-here',
          heading: 'What is not on this list, and why',
          body: (
            <>
              <p>
                Stated explicitly, because for a product that runs no analytics
                and no advertising this is as useful as the list itself.
              </p>
              <ul>
                <li>
                  <strong>No analytics or session replay service.</strong> There
                  is no such script in the application, which is why there is no
                  opt-out list anywhere on this site.
                </li>
                <li>
                  <strong>No advertising network, data broker, or social
                  pixel.</strong> None is present, and none receives a page view.
                </li>
                <li>
                  <strong>No error or crash reporting service.</strong> Failures
                  are handled inside our own code rather than reported to a third
                  party.
                </li>
                <li>
                  <strong>No third party support, ticketing, or live chat
                  widget.</strong> Support is email.
                </li>
                <li>
                  <strong>No customer data platform or tag manager.</strong> The
                  pages are not loaded through a tag container.
                </li>
                <li>
                  <strong>No separate email marketing provider.</strong> The
                  product sends the account emails its own authentication flows
                  require, through the authentication provider listed above. It
                  does not send campaigns.
                </li>
                <li>
                  <strong>No file or image hosting service.</strong> LIKO does
                  not store uploaded files or photographs. Answer sheet scanning
                  happens on the device that takes the photograph; the image is
                  scored there and the marks are sent, not the picture.
                </li>
                <li>
                  <strong>No external font service at runtime.</strong> The
                  typeface is fetched once when the application is built and then
                  served from our own deployment, so no request for it reaches
                  Google when you use the product. It is not listed above because
                  it does not process personal data; it is mentioned here so the
                  omission is visibly a decision rather than an oversight.
                </li>
              </ul>
              <p>
                If this list grows, it grows because one of these statements
                stopped being true.
              </p>
            </>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this list',
          body: (
            <>
              <p>
                The list changes when the stack changes, and it will change. We
                treat that as a normal event rather than an exception.
              </p>
              <p>
                When a subprocessor is added, we notify the schools that are
                affected before the new subprocessor processes their data, and we
                give notice of the intended change and a window in which to raise
                an objection. A school that objects may stop using the affected
                part of the service, or may terminate instead, without penalty.
              </p>
              <p>
                Where the change removes a subprocessor, or reduces what it
                processes, we say so on this page rather than leaving the
                improvement undocumented.
              </p>
              <p>
                The version of this page is printed above and is the same version
                string that appears on the other legal documents, because they
                change together and a school should be able to pin the whole set
                to one date.
              </p>
            </>
          ),
        },
        {
          id: 'questions',
          heading: 'Questions and objections',
          body: (
            <>
              <p>
                Write to <strong>privacy@liko.app</strong> with a question about
                an entry, or to raise an objection to a proposed change. Say in
                the subject line that it concerns subprocessors.
              </p>
              <p>
                A school can also ask for the contractual terms that govern a
                named subprocessor, including where it runs and what security
                commitments it has given us. We will provide them.
              </p>
              <p>
                This page describes the stack as it is. It is not a statement
                that any provider named here has been assessed, audited or
                certified by us or by anyone else, and it is not a warranty about
                what a provider does with data outside the instructions we give
                it. Where we hold a commitment from a provider, that commitment
                lives in our contract with the provider and in our data processing
                agreement with the school, not on this page.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact',
          body: (
            <p>
              Subprocessor questions go to <strong>privacy@liko.app</strong>.
              Matters involving a child&apos;s data use the same address with
              that stated in the subject line, so it reaches the right person
              without delay.
            </p>
          ),
        },
      ]}
    />
  );
}