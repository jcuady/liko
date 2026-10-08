import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

const TITLE = 'Privacy Notice';
const DESCRIPTION =
  'What personal data LIKO holds, who it belongs to, why each part is kept, who can see a student record, and how a parent exercises their rights over it.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/privacy',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Notice"
      summary="LIKO holds records about children, so this notice is written to be acted on rather than skimmed. It covers what is collected, who owns it, who can see a student record, and how a parent gets at one."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'who-we-are',
          heading: 'Who we are',
          body: (
            <>
              <p>
                LIKO is a teaching workspace sold to schools. In almost every case
                the organisation holding your data is your school, not us. Your
                school decides what may be recorded about a child and is the
                controller of that record. We act on your school&apos;s
                instructions and under a data processing agreement signed with it.
              </p>
              <p>
                We are nonetheless the party that operates the databases and the
                security around them, so we are directly responsible for keeping
                them safe. This notice describes both sides of that.
              </p>
              <p>
                Our data protection contact is <strong>privacy@liko.app</strong>.
                For a complaint about how a school handles a record, the school is
                the right first contact, because it is the controller. We will
                cooperate with any supervisory authority that asks about our part in
                it.
              </p>
            </>
          ),
        },
        {
          id: 'what-we-collect',
          heading: 'What we collect',
          body: (
            <>
              <h3>About staff accounts</h3>
              <p>
                Name, email address, a hashed password, your role, and the
                preferences you set: school name, subjects taught, default grade
                level and default grading scale. If you turn on notifications, we
                also hold a push subscription endpoint.
              </p>
              <h3>About students and guardians</h3>
              <p>
                Name, initials, the class they are on, their guardian&apos;s name,
                email address and phone number where the teacher has entered them,
                and, where the school records them, marks, attendance and
                behaviour notes.
              </p>
              <h3>About everyone</h3>
              <p>
                The acceptance you gave to our terms and privacy notice, with a
                timestamp and the version of the text you accepted. The IP address
                and browser string from the request that recorded it.
              </p>
              <h3>What we do not collect</h3>
              <p>
                No advertising identifiers. No behavioural analytics. No data
                broker profiles. No special category data, and we ask that none be
                entered: no health, religious or political information about a
                child belongs in a gradebook.
              </p>
            </>
          ),
        },
        {
          id: 'student-accounts',
          heading: 'Student and guardian accounts',
          body: (
            <>
              <p>
                Students and guardians do not create their own LIKO accounts. A
                teacher creates the account from the class roster and sets its
                role, so an account always belongs to a class, a teacher and a
                school.
              </p>
              <p>
                A student account can see only its own record. A guardian account
                can see the records of students linked to it and nothing else.
                Neither can see another class, another school, the gradebook as a
                whole, or any administrative screen. Those permissions are
                enforced by the database, not only by the interface.
              </p>
              <p>
                If a student should not hold an account at all, the teacher can
                remove it. Removal removes the account and the sessions attached
                to it. Records the teacher has already entered are retained,
                because they are the school&apos;s record, and the school decides
                when those are deleted.
              </p>
            </>
          ),
        },
        {
          id: 'why',
          heading: 'Why we hold it',
          body: (
            <>
              <p>
                Staff account data exists to provide the workspace to the person
                who signed in. Student records exist to run the school day:
                attendance, assessment, grading and reporting.
              </p>
              <p>
                Consent records exist for a narrower reason. We keep an append-only
                log of what each person agreed to and when, so that if the terms
                are ever disputed we can show what was in force at that moment.
                Each acceptance is stored separately, so changing the terms does
                not overwrite the evidence of the earlier agreement.
              </p>
              <p>
                Push subscription endpoints exist to deliver notifications. They
                are deleted when the notification is switched off, when the
                browser rotates the subscription, or when the endpoint stops
                working.
              </p>
              <p>
                We do not sell personal data, and we do not use a child&apos;s
                data for advertising or profiling of any kind.
              </p>
            </>
          ),
        },
        {
          id: 'sharing',
          heading: 'Who can see it',
          body: (
            <>
              <p>
                <strong>Within a school:</strong> teachers see the classes they
                own. An administrator may see class names and rosters to manage
                the school, but does not gain the ability to edit another
                teacher&apos;s gradebook. A student sees their own record. A
                guardian sees the students linked to them.
              </p>
              <p>
                <strong>Outside the school:</strong> our infrastructure providers
                process data on our instructions under contract, including the
                database host and the email delivery provider. We disclose data to
                a public authority only where the law compels it, and we tell the
                school as well where the law allows us to.
              </p>
              <p>
                We do not sell data, and we do not share it with advertisers or
                data brokers, because we do not collect it in a form they would
                want.
              </p>
            </>
          ),
        },
        {
          id: 'security',
          heading: 'How it is kept safe',
          body: (
            <>
              <p>
                Access to every table is enforced in the database itself, so a
                permission that is missed in the interface is still missed by the
                data. A session token is signed, is unreadable by scripts on the
                page, and is refused if it has been altered.
              </p>
              <p>
                Passwords are stored only as slow salted hashes. Signing in is
                rate limited per address and per account, so guessing one password
                does not help guess another.
              </p>
              <p>
                Sign-in attempts return the same message whether or not an account
                exists, so the sign-in form cannot be used to find out who has one.
                Records of consent are written by the server and cannot be edited
                or deleted by the person they are about.
              </p>
              <p>
                Traffic is encrypted in transit. If a breach affects personal
                data, we will notify the affected schools and, where the law
                requires it, the supervisory authority, without undue delay.
              </p>
            </>
          ),
        },
        {
          id: 'retention',
          heading: 'How long we keep it',
          body: (
            <>
              <ul>
                <li>
                  <strong>Consent records</strong> are kept for as long as the
                  account exists and for 6 years after it closes. The limitation
                  period for contractual claims is the reason, and the record is
                  far smaller than the teaching data around it.
                </li>
                <li>
                  <strong>Push subscriptions</strong> are deleted when they stop
                  working, when notifications are switched off, or when the account
                  closes.
                </li>
                <li>
                  <strong>Teaching records</strong> are kept for as long as the
                  school keeps them. LIKO holds a working copy, not a separate
                  archive, and the school exports and deletes on its own schedule.
                </li>
                <li>
                  <strong>Server logs</strong> are kept for 30 days, then deleted
                  automatically.
                </li>
              </ul>
              <p>
                When a subscription ends you can export your data for 30 days. We
                hold it for that window so the export can be taken, then delete
                it, keeping only what a tax or legal obligation requires.
              </p>
            </>
          ),
        },
        {
          id: 'your-rights',
          heading: 'Your rights',
          body: (
            <>
              <p>
                For a staff account you can see and change your own details in the
                product at any time. For a student record, your rights are
                exercised through your school, which holds the record. We support
                that process and will not obstruct it.
              </p>
              <p>
                Depending on where you are, you may have the right to:
              </p>
              <ul>
                <li>be told what data is held about you, and get a copy</li>
                <li>have anything inaccurate corrected</li>
                <li>have data deleted, where there is no overriding obligation to keep it</li>
                <li>restrict or object to a use of your data</li>
                <li>receive your data in a portable format</li>
                <li>complain to your supervisory authority</li>
              </ul>
              <p>
                To exercise any of these for a student or a staff member at a
                school, write to the school first. They will ask us for the data
                or make the change, and we respond to them within a few days. If
                you are asking about our own handling rather than your
                school&apos;s, write to us directly.
              </p>
            </>
          ),
        },
        {
          id: 'children',
          heading: "Children's data",
          body: (
            <>
              <p>
                LIKO is built for schools, so it handles data about children by
                necessity rather than by choice.
              </p>
              <p>
                <strong>Under 13.</strong> LIKO is not directed at children under
                13 and they cannot create an account. A child&apos;s record exists
                only because a school entered it, under the school&apos;s own
                policies and its obligations as a school. We hold such data only on
                a school&apos;s instruction.
              </p>
              <p>
                <strong>COPPA.</strong> We do not collect personal information
                directly from a child under 13. A school provides it, and the
                school is the party responsible for its collection notice and its
                consent or authorisation where one is needed.
              </p>
              <p>
                <strong>FERPA.</strong> LIKO is built to hold education records,
                which makes the school the records custodian and us a service
                provider with a legitimate educational interest operating under
                that school&apos;s supervision. We do not disclose education
                records except to that school, to a person the school authorises,
                or where the law compels it. If you believe a record has been
                disclosed improperly, tell the school and tell us at the address
                above, and we will investigate with them.
              </p>
              <p>
                When a school leaves LIKO, its data is exported on request and
                deleted from our systems after the 30 day window described above.
              </p>
            </>
          ),
        },
        {
          id: 'transfers',
          heading: 'Where data is held',
          body: (
            <>
              <p>
                Data is held in the region your school chose when it signed up. If
                that region is outside the UK or the European Economic Area, the
                transfer is covered by the UK or EU international data transfer
                standard clauses, or an adequacy decision where one applies.
              </p>
              <p>
                If your school&apos;s data region changes, we tell the school before the
                move and do not move it without confirmation.
              </p>
            </>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this notice',
          body: (
            <p>
              We update this notice when what we do changes. The version is printed
              at the top of this page and recorded against your account at the
              moment you accept it. Where a change affects how children&apos;s data
              is handled, we tell the school before it takes effect.
            </p>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact',
          body: (
            <p>
              Write to <strong>privacy@liko.app</strong>. For a matter involving a
              child&apos;s data, say so in the subject line so it reaches the right
              person without delay.
            </p>
          ),
        },
      ]}
    />
  );
}