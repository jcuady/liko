import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

/**
 * Acceptable Use Policy.
 *
 * WHY THIS IS SEPARATE FROM THE TERMS. The terms carry a five line summary of
 * acceptable use. That is enough to make the rule enforceable, because a
 * contract that only summarises its prohibitions tends to lose them at the
 * moment they matter. This page is the long version: it is what a teacher reads
 * when they want to know whether the thing they are about to do is allowed, and
 * what a school reads when it needs to write a local copy into its own policy.
 *
 * IT IS A DRAFT FOR REVIEW. Nothing here has been through a lawyer. Where the
 * honest answer depends on the school's own policy or on jurisdiction, this page
 * says that rather than picking an answer, and it never claims a compliance
 * status LIKO has not been assessed for.
 */

const TITLE = 'Acceptable Use Policy';
const DESCRIPTION =
  'What counts as acceptable use of a LIKO teaching workspace, what is prohibited, what happens when it is breached, and how a school can ask for an account to be suspended or data to be deleted.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/acceptable-use' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/acceptable-use',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function AcceptableUsePage() {
  return (
    <LegalDocument
      title="Acceptable Use Policy"
      summary="LIKO holds teaching records, so the rules about what may be done with it are written out in full rather than left to a summary. This page covers what acceptable use looks like, what is prohibited, what happens when it is breached, and how a school can get an account suspended or data deleted."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'what-this-covers',
          heading: 'What this covers',
          body: (
            <>
              <p>
                This policy applies to every person with a LIKO account and to
                every school that holds one. It covers what you may put into the
                service, what you may do to the service itself, and what happens
                when either goes wrong.
              </p>
              <p>
                The Terms of Use contain a shorter version of these rules. Where
                this page and the terms describe the same thing, this page gives
                the detail and the terms give the obligation. They are read
                together.
              </p>
              <p>
                This is a draft prepared for review by a lawyer. It describes
                LIKO&apos;s practices and the rules LIKO enforces. It is not a
                statement that LIKO has been assessed against any particular
                law, standard or certification, and it should not be presented to
                a school, a regulator or a parent as one. Where the correct
                answer depends on your school&apos;s own policy or on the law
                where you are, this page says so instead of choosing for you.
              </p>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          heading: 'What acceptable use looks like',
          body: (
            <>
              <p>
                A LIKO workspace is a teaching record. The uses it is built for
                are preparing lessons, running assessments, recording marks,
                recording attendance, and reporting on a class you are
                responsible for.
              </p>
              <p>Acceptable use means, in practice:</p>
              <ul>
                <li>
                  <strong>You teach the class, or you administer the people who
                  do.</strong> A record belongs to a class, a teacher and a
                  school. If you cannot name all three, you are looking at
                  something you should not be in.
                </li>
                <li>
                  <strong>You give every person their own account.</strong> Not a
                  shared login, not a shared device where someone else signs in
                  as you.
                </li>
                <li>
                  <strong>You record what a gradebook is for.</strong> Names,
                  marks, attendance, assessment outcomes, and the notes a
                  teacher would reasonably need to teach that child.
                </li>
                <li>
                  <strong>You follow your school&apos;s own policy where it is
                  stricter than this one.</strong> A school may decide that
                  certain things must not be recorded at all, and where its
                  policy and this page differ, its policy governs what happens
                  inside that school.
                </li>
                <li>
                  <strong>You remove access when someone leaves.</strong> When a
                  student leaves the class or a member of staff leaves the
                  school, the account goes with them.
                </li>
              </ul>
              <p>
                Teachers have wide discretion over what they record. LIKO does
                not second guess a pedagogical judgement, and it is not a
                curriculum tool. What it does insist on is that the record is
                about teaching, it is stored under your school, and the people
                in it are people you are responsible for.
              </p>
            </>
          ),
        },
        {
          id: 'content-rights',
          heading: 'Content you must have the right to use',
          body: (
            <>
              <p>
                You keep ownership of what you enter. That ownership carries a
                condition: you may only enter material you have the right to
                use, and you must be able to say where that right comes from.
              </p>
              <p>You may not upload or enter:</p>
              <ul>
                <li>
                  material you did not create and have no licence, permission or
                  fair dealing basis to use
                </li>
                <li>
                  a complete commercial textbook, exam paper or question bank
                  where your school has not licensed it for copying
                </li>
                <li>
                  content that infringes a copyright, a trademark, a right of
                  publicity, or someone&apos;s moral rights
                </li>
                <li>
                  content that is unlawful where it is stored or where it is
                  accessed
                </li>
                <li>
                  another person&apos;s personal data, unless your school has
                  collected it lawfully and is entitled to hold it here
                </li>
              </ul>
              <p>
                The law on copying for teaching varies a great deal between
                countries, states and institutions, and it changes. Whether a
                particular upload is permitted depends on your jurisdiction and
                on your school&apos;s licensing arrangements. We cannot advise on
                that, and this policy does not try to. If you are unsure whether
                you may copy something, ask your school before you upload it
                rather than after.
              </p>
            </>
          ),
        },
        {
          id: 'prohibited',
          heading: 'What is prohibited',
          body: (
            <>
              <p>
                These are not guidelines. They are the rules that the Terms of
                Use enforce, and breaching one of them is a breach of the
                agreement.
              </p>

              <h3>Reaching data that is not yours</h3>
              <p>
                Every record belongs to one school. Attempting to reach another
                tenant&apos;s data is prohibited, whether by using the product
                normally, by guessing identifiers, by reusing a link, or by any
                other means. This includes reading, exporting, and attempting to
                write. Attempting is enough; a failed attempt is still a
                breach.
              </p>

              <h3>Sharing credentials</h3>
              <p>
                Giving your login to someone else, or signing in on a shared
                device and leaving it signed in, is prohibited. It defeats the
                access controls, it corrupts the audit trail that says who
                changed what, and it is the fastest route to a guardian finding
                out that their child&apos;s record was visible to a stranger.
              </p>

              <h3>Scraping and automated extraction</h3>
              <p>
                Collecting LIKO data by automated means, or at a rate that
                degrades the service for other schools, is prohibited. Downloading
                a class gradebook through the export the product provides is not
                scraping, and is the supported way to get your own data out.
              </p>

              <h3>Automated bulk account creation</h3>
              <p>
                Creating accounts by script, or by any means other than the
                product&apos;s own registration and roster flows, is prohibited.
                This exists because an account is tied to a real person in a real
                class. Bulk creation breaks that link, and it is also the shape
                that abuse takes.
              </p>

              <h3>Testing or attacking the service</h3>
              <p>
                Probing, scanning, load testing, or attempting to find and
                exploit a weakness without our written permission is prohibited.
                This includes running tests against the live deployment that
                affect other schools. If you are doing security research, contact
                us first and we will tell you what is in scope.
              </p>

              <h3>Reselling and misrepresenting</h3>
              <p>
                Reselling, sublicensing, or offering LIKO to a third party as a
                standalone product is prohibited. Presenting a LIKO record as an
                official assessment, a regulated certification, or an
                authoritative source is also prohibited. LIKO is a record-keeping
                and planning tool, not a system of record for a legal
                determination.
              </p>

              <h3>Using LIKO to build a profile of a child</h3>
              <p>
                Using the service, directly or through anything you build on top
                of it, to profile, track, score or make decisions about a child
                outside their education is prohibited. This includes using
                student data to target advertising, to build a behavioural
                profile, to rank children against each other for a purpose the
                school has not authorised, or to make an admissions, disciplinary
                or safeguarding decision on the basis of LIKO data alone.
              </p>
              <p>
                Safeguarding decisions are made by people, under a school&apos;s
                safeguarding policy, with the context a school holds and LIKO
                does not. A pattern in a gradebook may prompt a conversation. It
                is not a finding.
              </p>
            </>
          ),
        },
        {
          id: 'security-testing',
          heading: 'If you find a vulnerability',
          body: (
            <>
              <p>
                If you find a weakness in LIKO, we want to hear about it, and we
                will not treat good faith reporting as a breach of these rules.
              </p>
              <ul>
                <li>
                  Tell us at <strong>security@liko.app</strong>, or through the
                  support address in the product.
                </li>
                <li>
                  Give us a reasonable amount of time to fix it before you tell
                  anyone else.
                </li>
                <li>
                  Do not access data that is not yours, do not degrade the
                  service, and do not change or delete anything.
                </li>
                <li>
                  Do not access other people&apos;s records to prove the point,
                  even if you can. A proof that reads someone else&apos;s data is
                  a breach no matter why it was made.
                </li>
              </ul>
              <p>
                We will not threaten you with prosecution or with the
                termination of your account for a report made in good faith and
                within these limits. That promise only holds if you stay inside
                them.
              </p>
            </>
          ),
        },
        {
          id: 'enforcement',
          heading: 'What happens when this is breached',
          body: (
            <>
              <p>
                Enforcement is graduated. The response depends on what happened,
                how serious it was, and whether it was a mistake. We would
                rather fix a problem than end a relationship, and a school is a
                better route to a fix than a suspension is.
              </p>
              <ul>
                <li>
                  <strong>Where a school is involved, we go to the school
                  first.</strong> The school is the party that can actually fix
                  the cause, whether that is an account shared by three staff, a
                  teacher uploading the wrong file, or a policy nobody was told.
                  We will tell you at the same time unless there is a reason not
                  to.
                </li>
                <li>
                  <strong>Warning or restriction.</strong> For a first breach
                  that is not serious, we explain what happened and what must
                  change, and we may limit what the account can do.
                </li>
                <li>
                  <strong>Suspension.</strong> Where the breach continues, or is
                  serious enough that leaving access open would cause harm, we
                  suspend. Suspension stops the account working. It does not
                  delete anything, so the school can still reach the data and
                  export what it needs.
                </li>
                <li>
                  <strong>Removal of content.</strong> Where specific material
                  is unlawful, infringes a third party&apos;s rights, or was
                  uploaded by someone with no right to it, we remove that
                  material. We tell the school what was removed and why. Where
                  the law requires it, we may preserve it first and pass it to
                  the authority instead.
                </li>
                <li>
                  <strong>Termination.</strong> For deliberate, repeated or
                  serious breaches, including accessing another school&apos;s
                  data, we may close the account and end the agreement under the
                  termination terms.
                </li>
              </ul>
              <p>
                Where we can, we tell the affected person or school what we did
                and why. There are cases where we cannot: where telling someone
                would compromise an investigation or another person&apos;s
                safety, we say that we cannot rather than pretending the
                explanation was simply forgotten.
              </p>
              <p>
                We do not delete a school&apos;s teaching records as a sanction
                against a teacher. Those records belong to the school, they are
                the school&apos;s system of record, and destroying them to punish
                one person would damage the children in those classes. We
                suspend access and we escalate to the school instead.
              </p>
            </>
          ),
        },
        {
          id: 'reporting',
          heading: 'Reporting a breach or abuse',
          body: (
            <>
              <p>
                If you have seen something that breaks these rules, you can tell
                us directly and you do not need to go through your school first.
              </p>
              <ul>
                <li>
                  Write to <strong>legal@liko.app</strong>, or use the support
                  address in the product if you already have an account.
                </li>
                <li>
                  If it involves a child&apos;s data, use{' '}
                  <strong>privacy@liko.app</strong> instead, and say so in the
                  subject line.
                </li>
                <li>
                  Tell us the school or class involved, what you saw, and roughly
                  when, if you know.
                </li>
              </ul>
              <p>
                You may report anonymously. We will not tell a school who
                reported them, unless you agree, or unless the law requires us to
                disclose it.
              </p>
              <p>
                We will look into a report. We cannot promise a particular
                outcome or a particular timescale, and we will not commit to one
                in advance. If a report concerns an immediate risk to a child,
                tell the school&apos;s safeguarding lead as well as us, because
                they are the party that can act on it today.
              </p>
            </>
          ),
        },
        {
          id: 'school-requests',
          heading: 'How a school asks for action',
          body: (
            <>
              <p>
                A school can ask us to act on its own records, and we do not need
                a parent, a regulator or a court to make us do it. The school is
                the controller of its data and we act on its instructions.
              </p>
              <ul>
                <li>
                  <strong>Suspend an account.</strong> Write from an address on
                  the school&apos;s domain, or from an administrator account on
                  the subscription, and name the account. We suspend within one
                  working day of a verified request. We will tell you when it is
                  done and what state the account is in.
                </li>
                <li>
                  <strong>Delete a student&apos;s record.</strong> The school
                  decides when a student&apos;s data goes. Ask us and we will
                  delete the record and the account, and confirm in writing. We
                  keep what a tax or legal obligation requires, and we tell you
                  what that is rather than deleting it silently.
                </li>
                <li>
                  <strong>Export the data.</strong> A class gradebook can be
                  downloaded as a spreadsheet from the Gradebook page, covering
                  marks, assessment names and a weighted total, one class at a
                  time. Attendance, lesson plans, history notes and accounts are
                  not in that file. Ask us for those and we will send them.
                </li>
                <li>
                  <strong>Correct a record.</strong> Ask and we will make the
                  change. A record that is wrong and known to be wrong is worse
                  than one that is wrong and unchallenged.
                </li>
                <li>
                  <strong>Investigate an account.</strong> Ask us to look at
                  access to a record, and we will. We will tell you what we can
                  establish and what we cannot.
                </li>
              </ul>
              <p>
                A request from someone who is not the school, for the
                school&apos;s data, goes to the school first. We will not act on
                a request to delete a school&apos;s records because a person who
                is not the controller asked us to, however genuine the concern
                behind it is.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact',
          body: (
            <>
              <p>
                Questions about this policy go to <strong>legal@liko.app</strong>.
                A report about a breach goes to the same address. A matter
                involving a child&apos;s data goes to{' '}
                <strong>privacy@liko.app</strong>, so it reaches the right person
                without delay.
              </p>
              <p>
                This policy is versioned with the rest of our legal documents and
                the version in force is printed at the top of this page. We
                update it when the rules change, and we announce a material
                change before it takes effect.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}