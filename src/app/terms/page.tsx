import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

const TITLE = 'Terms of Use';
const DESCRIPTION =
  'The agreement between you and LIKO: who may hold an account, what a school may do with the data it puts in, what we promise, and how either side ends it.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/terms' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/terms',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Use"
      summary="These terms cover who may open a LIKO account, what your school may put into it, and how the agreement ends. They are written to be read. Where a clause matters more than usual, it says so."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'agreement',
          heading: 'The agreement',
          body: (
            <>
              <p>
                These terms are between you and LIKO. By creating an account you
                accept them. If you do not accept them, do not create an account.
              </p>
              <p>
                Where a school or district buys LIKO on behalf of staff, the
                person who holds the subscription is the party to these terms,
                and the staff who use it are bound by them as users.
              </p>
              <p>
                We may revise these terms. Material changes are announced in the
                product at least 30 days before they take effect, and the version
                in force when you accepted is recorded against your account. A
                change that reduces what we do with your data, or that reduces
                what you can do with it, is never retrospective.
              </p>
            </>
          ),
        },
        {
          id: 'accounts',
          heading: 'Who may hold an account',
          body: (
            <>
              <p>
                <strong>Accounts are for teachers and the staff who administer
                them.</strong> Students and guardians do not create their own
                LIKO accounts. The teacher who owns a class creates the account
                for each student or guardian from the class roster, and the
                account belongs to that teacher&apos;s school.
              </p>
              <p>
                This is deliberate. A student account is tied to a class, a
                teacher and a school, and letting a student assert that
                relationship themselves would make it uncheckable. It also keeps
                students out of the open registration path entirely.
              </p>
              <p>
                You are responsible for the accounts created under your school,
                including choosing who receives access and removing it when
                someone leaves. You must be at least 16 years old to open an
                account, and at least 18 to open one that is paid for.
              </p>
              <p>
                Give every person their own account. Sharing a login makes the
                audit trail, the access controls and the record of who changed
                what useless, and it is the fastest way to lose the protection
                these terms are built on.
              </p>
            </>
          ),
        },
        {
          id: 'your-content',
          heading: 'What you put in LIKO',
          body: (
            <>
              <p>
                You keep ownership of everything you enter: lesson plans,
                assessments, grades, attendance, behaviour notes and student
                records. You give us only the licence needed to operate the
                service for you, which is to say to store it, transmit it, and
                display it back to the people you have shared it with.
              </p>
              <p>
                You confirm that you have the right to enter what you are
                entering. Student data belongs to your school and, in some
                jurisdictions, to the family. If your school has a policy about
                what may be recorded about a child, that policy governs, and
                entering something its terms forbid is on you.
              </p>
              <p>
                You may not enter material that infringes someone else&apos;s rights,
                that you have no right to disclose, or that breaks the law where
                it is stored. Do not use LIKO to store anything a regulator would
                object to seeing in an education record system.
              </p>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          heading: 'Acceptable use',
          body: (
            <>
              <p>You agree not to:</p>
              <ul>
                <li>
                  probe, scan or test the vulnerability of the service without our
                  written permission, or interfere with another school&apos;s use of it
                </li>
                <li>
                  attempt to reach any account, class, grade or record that is not
                  yours
                </li>
                <li>
                  upload malware, or content that is unlawful, or that you know
                  infringes someone else&apos;s rights
                </li>
                <li>
                  resell, sublicense or provide the service to a third party as a
                  standalone offering
                </li>
                <li>
                  scrape the service at a rate that degrades it for others, by
                  automated means or otherwise
                </li>
              </ul>
              <p>
                We will suspend an account that does these things, and we will
                say why. Where a school is involved we tell the school rather
                than acting against an individual account first, because that is
                the person best placed to fix it.
              </p>
            </>
          ),
        },
        {
          id: 'availability',
          heading: 'Availability and support',
          body: (
            <>
              <p>
                We aim to keep the service available continuously, and we do not
                promise that we will. Planned maintenance is announced in
                advance. Unplanned outages are published to a status page.
              </p>
              <p>
                The service supports offline use: recent pages stay readable on a
                device with no connection and changes made offline are sent when
                the connection returns. That is a convenience, not a guarantee
                that nothing is ever queued.
              </p>
              <p>
                Support is provided during the working week in the timezone on
                your subscription. A paid plan includes a stated response target
                for a report that the service is down or that data is wrong. A
                response target is a target, not a warranty.
              </p>
            </>
          ),
        },
        {
          id: 'fees',
          heading: 'Plans, fees and cancellation',
          body: (
            <>
              <p>
                LIKO is sold per teacher, never per student. Prices are shown on
                the pricing page and are exclusive of tax. A free plan covers one
                class.
              </p>
              <p>
                Subscriptions renew automatically at the end of the current term.
                Cancel before the renewal date and you keep access to the end of
                the term you have paid for. Cancel afterwards and the next term
                is not charged.
              </p>
              <p>
                Changing to a lower plan takes effect at the next renewal so that
                a term already paid for is not interrupted. Changing to a higher
                plan takes effect immediately, and we charge the difference for
                the rest of the term.
              </p>
              <p>
                If we change the price of a plan you are on, we will tell you at
                least 30 days before the change applies to you, and you may cancel
                instead without penalty.
              </p>
            </>
          ),
        },
        {
          id: 'termination',
          heading: 'Ending the agreement',
          body: (
            <>
              <p>
                You may stop using LIKO and close your accounts at any time. Write
                to us and we will close them within 30 days.
              </p>
              <p>
                When an agreement ends you may export your data for 30 days. We
                keep it for that period so an export can be taken, then we delete
                it. We will tell you when the export window closes. Section 11 of
                the Privacy Notice explains what is kept after that, and for how
                long.
              </p>
              <p>
                We may suspend or close an account if it is used to break these
                terms, if a payment is not made, or if we are required to by law.
                Where we can, we tell you first and give you a chance to fix it.
              </p>
            </>
          ),
        },
        {
          id: 'warranties',
          heading: 'What we promise, and what we do not',
          body: (
            <>
              <p>
                We warrant that LIKO will perform substantially as described in
                this agreement and that we will operate it with reasonable skill
                and care.
              </p>
              <p>
                We do not warrant that the service will be uninterrupted or error
                free. A school record system is relied on, and a claim that no
                software ever fails is a claim we cannot keep and should not
                make.
              </p>
              <p>
                LIKO is a record-keeping and planning tool. It is not a source of
                truth for a grade dispute, an assessment decision or a legal
                determination. Keep your school&apos;s own records as your system of
                record. Where LIKO is not the system of record, a data migration
                out of it is your responsibility.
              </p>
            </>
          ),
        },
        {
          id: 'liability',
          heading: 'Liability',
          body: (
            <>
              <p>
                Nothing in these terms limits liability that cannot lawfully be
                limited, including for death or personal injury caused by
                negligence, for fraud, or for anything else a consumer law in your
                jurisdiction does not let us exclude.
              </p>
              <p>
                Subject to that, neither side is liable for indirect or
                consequential loss, loss of profit, loss of anticipated savings,
                or loss of data. Neither side&apos;s total liability is limited to the
                fees paid for the service in the 12 months before the claim arose.
              </p>
              <p>
                The cap does not apply to your obligation to give every person
                their own account, to what you put into LIKO, or to your breach of
                the acceptable use rules.
              </p>
            </>
          ),
        },
        {
          id: 'indemnity',
          heading: 'Indemnity',
          body: (
            <>
              <p>
                You agree to indemnify us against a third party claim arising from
                material you put into LIKO, or from your use of it in breach of
                these terms, or from a statement your school makes using it.
              </p>
              <p>
                We agree to indemnify you against a third party claim that the
                service itself, as we provide it and unchanged by you, infringes
                their intellectual property rights.
              </p>
            </>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to these terms',
          body: (
            <>
              <p>
                We may update these terms. The version in force is printed at the
                top of this page and recorded against your account at the moment
                you accept it.
              </p>
              <p>
                A change that materially reduces your rights is announced at least
                30 days before it takes effect. Continuing to use LIKO after that
                date is acceptance of the new version.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact and governing law',
          body: (
            <>
              <p>
                Questions about these terms go to <strong>legal@liko.app</strong>.
                A
                question about a specific account is faster through the support
                address in the product, because it reaches the person who can see
                your account.
              </p>
              <p>
                These terms are governed by the law of England and Wales. Nothing
                in them removes any right you have under the mandatory consumer
                law of the country you live in, and if a provision is unenforceable
                where you are, it is cut down to what is enforceable and the rest
                of these terms still apply.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}