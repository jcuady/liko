import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

/**
 * Data Processing Agreement.
 *
 * WHY THIS IS PUBLISHED AS A DRAFT TEMPLATE. A school buying LIKO is being asked
 * to accept that a vendor will hold education records about children, and most
 * schools cannot sign that on the strength of a marketing promise. Publishing
 * the template lets a school see the commitments before a conversation starts,
 * and lets its counsel mark it up. That is the whole point of putting it on the
 * public site rather than behind a sales call.
 *
 * IT IS NOT EXECUTED BY THIS PAGE. Nothing here is agreed by reading it or by
 * accepting our terms. A data processing agreement is formed when the parties
 * sign it, and until then this is a draft for review. Stating that at the top of
 * the document rather than in a footnote is deliberate: a template that reads
 * like a live contract is the most common way a school ends up assuming it has
 * protections it has not actually agreed.
 *
 * THE CLAUSES MAP TO ARTICLE 28 GDPR, but the agreement is written to be usable
 * where the GDPR does not apply, because most LIKO schools are outside the EEA
 * and the UK. Where the law requires something this document does not yet say,
 * the answer is that the document is a draft and the gap should be closed in
 * review, not that the requirement does not apply.
 */

const TITLE = 'Data Processing Agreement';
const DESCRIPTION =
  'The template data processing agreement between a school, as controller, and LIKO, as processor: subject matter, data subjects, the Article 28 obligations, subprocessors, international transfers, breach notification, and signature blocks.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/dpa' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/dpa',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function DpaPage() {
  return (
    <LegalDocument
      title="Data Processing Agreement"
      summary="This is the data processing agreement LIKO uses as a starting point for a school. It sets out what the school controls, what LIKO does on its instructions, and the commitments each side takes. It is a draft template: an agreement is formed when the two parties sign it, not when this page is read."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'status',
          heading: 'What this document is',
          body: (
            <>
              <p>
                This is a <strong>template</strong>. It is published so a school
                can read what LIKO is willing to commit to before signing
                anything, and so its counsel can mark it up.
              </p>
              <p>
                <strong>No agreement is formed by reading this page.</strong> The
                terms of use and the privacy notice are separate documents with
                their own effect. This document takes effect only when it is
                signed by or on behalf of both parties, or when it is incorporated
                into a signed master agreement.
              </p>
              <p>
                It is a draft prepared for review by a lawyer. It has not been
                through legal review, and it should not be presented to a school,
                a regulator or a parent as reviewed or approved. If a clause here
                is wrong for your jurisdiction, your sector or your school, the
                fix belongs in the signed copy rather than in a reading of this
                page.
              </p>
              <p>
                Clauses are numbered in the version circulated for signature. The
                numbering on this page follows the same order, so a comment about
                clause 9 here means clause 9 there.
              </p>
            </>
          ),
        },
        {
          id: 'parties',
          heading: 'The parties',
          body: (
            <>
              <p>
                This agreement is between:
              </p>
              <ul>
                <li>
                  <strong>The Controller</strong>: the school, district or other
                  educational institution that holds the subscription. It is the
                  party that decides what personal data is processed and why.
                </li>
                <li>
                  <strong>The Processor</strong>: LIKO, which processes personal
                  data on the Controller&apos;s instructions to provide the
                  workspace.
                </li>
              </ul>
              <p>
                The Controller and the Processor may be referred to as &quot;the
                parties&quot;. The Controller may also be the employer or
                enrolment authority of the data subjects whose data is processed,
                which is normally but not always the case: a school may hold the
                record on behalf of a district, a local authority or a
                governing body that is in fact the controller.
              </p>
              <p>
                Where the Controller is not the party that has the direct
                relationship with the data subjects, the Processor will process
                only on the Controller&apos;s documented instructions, and the
                Controller remains responsible for the notices given to those
                data subjects.
              </p>
            </>
          ),
        },
        {
          id: 'subject-matter',
          heading: 'Subject matter, duration and nature',
          body: (
            <>
              <p>
                <strong>Subject matter.</strong> The subject matter of this
                agreement is the provision of the LIKO teaching workspace: lesson
                planning, assessment creation, grading, attendance, student
                records, reporting, notifications to teachers, and the associated
                accounts and administration.
              </p>
              <p>
                <strong>Duration.</strong> This agreement applies for as long as
                the Controller has a LIKO subscription and continues in force
                until the subscription ends and the return or deletion obligations
                in clause 11 have been completed. Clauses that by their nature
                should survive, including confidentiality, security, audit and
                the records required to evidence what happened, survive.
              </p>
              <p>
                <strong>Nature and purpose.</strong> The processing is carried
                out on the Controller&apos;s behalf and solely on its documented
                instructions, for the purpose of providing the workspace. The
                Processor will not process personal data for its own purposes,
                including its own analytics or its own product improvement, and
                will not sell it, use it for advertising, or build a profile of
                any data subject.
              </p>
              <p>
                The Processor may process personal data to the extent necessary
                to comply with a legal obligation to which it is subject, and will
                inform the Controller of that obligation before processing unless
                the law prohibits it.
              </p>
            </>
          ),
        },
        {
          id: 'data-and-subjects',
          heading: 'Categories of data and data subjects',
          body: (
            <>
              <p>
                <strong>Categories of data subjects.</strong> The personal data
                processed covers:
              </p>
              <ul>
                <li>
                  <strong>Teachers and staff</strong>, including administrators
                  who manage the Controller&apos;s subscription.
                </li>
                <li>
                  <strong>Students</strong>, whose records are created by the
                  staff of the Controller from class rosters.
                </li>
                <li>
                  <strong>Parents and guardians</strong>, where their details have
                  been entered by the Controller&apos;s staff.
                </li>
              </ul>
              <p>
                <strong>Categories of personal data.</strong> The processing may
                include:
              </p>
              <ul>
                <li>
                  identifiers: name, initials, email address, and for a guardian
                  a phone number where the Controller has entered one
                </li>
                <li>
                  account data: role, password hash, session tokens, and
                  authentication records
                </li>
                <li>
                  <strong>education records</strong>: class membership, subjects,
                  assessments, marks and weighted totals, attendance, behaviour
                  notes, and the history of interventions
                </li>
                <li>
                  preferences: school name, subjects taught, default grade level
                  and grading scale
                </li>
                <li>
                  <strong>consent records</strong>: what each person accepted,
                  when, under which version, with the IP address and browser
                  string from that request
                </li>
                <li>
                  push notification subscription endpoints, where the person has
                  turned notifications on
                </li>
              </ul>
              <p>
                <strong>Special category data is not expected and should not be
                entered.</strong> Health, religious, political, racial or
                biometric data about a child does not belong in a gradebook. The
                Processor asks the Controller not to enter it and does not design
                the workspace to encourage it. Where such data is submitted in
                error, the Controller should ask for its deletion.
              </p>
              <p>
                <strong>Frequency and duration of processing.</strong>
                Continuous and systematic for the duration of the subscription.
                The Processor holds a working copy of the Controller&apos;s data,
                not a separate archive, and the Controller decides how long that
                data is retained.
              </p>
            </>
          ),
        },
        {
          id: 'instructions',
          heading: 'Documented instructions and confidentiality',
          body: (
            <>
              <p>
                The Processor shall:
              </p>
              <ul>
                <li>
                  process personal data only on documented instructions from the
                  Controller, including with regard to transfers to a third
                  country, unless required to do so by law, in which case it
                  will inform the Controller before processing unless the law
                  prohibits it;
                </li>
                <li>
                  immediately inform the Controller if, in its opinion, an
                  instruction infringes the GDPR or other applicable data
                  protection law, and will not carry out the instruction until the
                  position is resolved;
                </li>
                <li>
                  ensure that each person authorised by the Processor to process
                  personal data is bound by a confidentiality obligation no less
                  protective than the one in this agreement.
                </li>
              </ul>
              <p>
                The Controller&apos;s instructions are the terms of use, this
                agreement, the configuration the Controller chooses for its
                users, and the specific instructions its administrators give in
                writing from time to time.
              </p>
            </>
          ),
        },
        {
          id: 'security',
          heading: 'Security of processing',
          body: (
            <>
              <p>
                Taking into account the state of the art, the nature of the
                processing and the risk to data subjects, the Processor shall
                implement and maintain appropriate technical and organisational
                measures. The measures that exist today are:
              </p>
              <ul>
                <li>
                  <strong>Access control enforced in the database.</strong> Row
                  level security restricts each row to the people entitled to it,
                  so a permission missed in the interface is still missed by the
                  data.
                </li>
                <li>
                  <strong>Signed sessions.</strong> Session tokens are signed,
                  are unreadable by scripts running on the page, and are refused
                  if they have been altered.
                </li>
                <li>
                  <strong>Password storage.</strong> Passwords are held only as
                  slow salted hashes.
                </li>
                <li>
                  <strong>Rate limiting.</strong> Sign-in attempts are limited per
                  address and per account, so that guessing one password does not
                  assist guessing another.
                </li>
                <li>
                  <strong>No enumeration on sign-in.</strong> The same message is
                  returned whether or not an account exists.
                </li>
                <li>
                  <strong>Append-only consent records.</strong> Written by the
                  server, with no policy allowing the account holder to read,
                  edit or delete them.
                </li>
                <li>
                  <strong>Encryption in transit.</strong> Transport to and from
                  the application and the database is encrypted.
                </li>
                <li>
                  <strong>Response headers.</strong> Content type options, referrer
                  policy, framing denial and a restrictive permissions policy are
                  set on every response.
                </li>
                <li>
                  <strong>Egress restriction on the push path.</strong> Dispatch
                  is restricted to a fixed list of known push services, checked
                  both when a subscription is stored and when a message is sent,
                  so that a stored endpoint cannot make the server fetch an
                  arbitrary address.
                </li>
              </ul>
              <p>
                <strong>Limits of these measures, stated plainly.</strong> This is
                a description of what the Processor has implemented. It is not a
                certification, an audit result, or an assurance that no breach
                will occur, and it should not be presented as one. The Processor
                does not hold an ISO 27001 or SOC 2 certification for this
                service at the date of this document, and will not describe it as
                holding one. Where the Controller requires an independent
                assurance report as a condition of procurement, that is something
                to raise before signature rather than to assume.
              </p>
            </>
          ),
        },
        {
          id: 'subprocessors',
          heading: 'Subprocessors',
          body: (
            <>
              <p>
                The Processor shall not engage a subprocessor without the
                Controller&apos;s prior specific or general written authorisation.
              </p>
              <p>
                The Controller gives <strong>general written authorisation</strong>
                for the subprocessors listed on the subprocessors page, which is
                published at <code>/subprocessors</code> and forms part of this
                agreement. The Controller may object to a subprocessor, and where
                an objection cannot be resolved the Processor will make a
                reasonable alternative available or the Controller may terminate
                the affected part of the service without penalty.
              </p>
              <p>
                The Processor shall impose on each subprocessor, by contract,
                data protection obligations that are no less protective than
                those in this agreement, and remains fully liable to the Controller
                for the performance of each subprocessor&apos;s obligations.
              </p>
              <p>
                Where the Processor adds or replaces a subprocessor, it will
                notify the Controller before the new subprocessor processes the
                Controller&apos;s personal data, giving the Controller a
                reasonable period to object. The current list is: Supabase for the
                database and authentication, Vercel for hosting and scheduled
                processing, and the browser or device maker&apos;s push service
                where a person has turned notifications on. The subprocessors page
                explains each one and names the file in the codebase that depends
                on it.
              </p>
            </>
          ),
        },
        {
          id: 'data-subject-rights',
          heading: 'Assistance with data subject rights',
          body: (
            <>
              <p>
                Taking into account the nature of the processing, the Processor
                shall assist the Controller by appropriate technical and
                organisational measures, insofar as this is possible, in responding
                to requests under Chapter III of the GDPR.
              </p>
              <p>
                This is assistance, not decision making. Because the Controller is
                the party that holds the relationship with the data subject and
                that makes the decisions about the record, the Processor will not
                answer a request from a data subject about a student record. It
                will instead do the following:
              </p>
              <ul>
                <li>
                  confirm to the Controller what personal data it processes about
                  the data subject;
                </li>
                <li>
                  provide the Controller with the personal data it holds, within
                  a few days of the Controller&apos;s request;
                </li>
                <li>
                  forward any request received directly from a data subject to
                  the Controller without undue delay, and not answer it itself,
                  except where the Processor is itself the controller for that
                  request;
                </li>
                <li>
                  make available the information needed to demonstrate compliance
                  with this clause, and allow for audits of that information.
                </li>
              </ul>
              <p>
                The Processor will notify the Controller if it receives a request
                from a data subject that appears to concern the Controller&apos;s
                data, and will cooperate with any instruction the Controller gives
                in response. Where a request seeks the deletion of data and the
                Controller instructs deletion, the Processor will delete the
                account, the record and the sessions attached to it, and will
                confirm in writing.
              </p>
            </>
          ),
        },
        {
          id: 'articles-32-36',
          heading: 'Assistance with Articles 32 to 36',
          body: (
            <>
              <p>
                Taking into account the nature of the processing and the
                information available to it, the Processor shall assist the
                Controller with:
              </p>
              <ul>
                <li>
                  <strong>Article 32, security of processing.</strong> Including
                  maintaining the measures in clause 6, and notifying the
                  Controller without undue delay on becoming aware of a personal
                  data breach.
                </li>
                <li>
                  <strong>Article 33, notification of a breach to the supervisory
                  authority.</strong> Providing the information the Controller
                  needs to make that notification within its own deadline, where
                  the breach concerns the Controller&apos;s data.
                </li>
                <li>
                  <strong>Article 34, communication of a breach to the data
                  subject.</strong> Providing the relevant information, where the
                  Controller is the party required to communicate.
                </li>
                <li>
                  <strong>Article 35, data protection impact assessment.</strong>
                  Providing information reasonably required for the Controller to
                  carry out an assessment, including on the nature of the
                  processing, the categories of data subject and the measures in
                  place.
                </li>
                <li>
                  <strong>Article 36, prior consultation.</strong> Providing the
                  information the Controller needs to consult a supervisory
                  authority, where we hold it.
                </li>
              </ul>
              <p>
                Where an obligation under these articles falls on the Processor in
                respect of personal data it processes in its own right, for
                example consent records about its own service, the Processor
                discharges that obligation itself rather than relying on the
                Controller to do it.
              </p>
            </>
          ),
        },
        {
          id: 'breach-notification',
          heading: 'Personal data breaches',
          body: (
            <>
              <p>
                The Processor shall notify the Controller without undue delay, and
                in any event within <strong>72 hours</strong> of becoming aware,
                where it becomes aware of a personal data breach affecting
                personal data processed under this agreement.
              </p>
              <p>
                That timeframe is the one the GDPR sets for the processor to
                notify the controller where the two are in a controller and
                processor relationship. It is stated here as a commitment rather
                than as a description, and it is a worst case. Where a breach
                requires it, the Processor will notify sooner, and will not wait
                until the full picture is available before making contact.
              </p>
              <p>
                <strong>What the notice contains:</strong> the nature of the
                breach, the categories of data subjects and personal data
                concerned, the likely consequences, and the measures taken or
                proposed. Information that is not yet available will be provided
                in phases as it is established.
              </p>
              <p>
                <strong>Where the Controller decides.</strong> The assessment of
                whether a breach is reportable to a supervisory authority, whether
                affected individuals must be told, and what is said to them, is
                the Controller&apos;s decision as controller. The Processor will
                provide the information needed for it and will cooperate with the
                assessment.
              </p>
              <p>
                <strong>What happens to a breach affecting the Processor&apos;s
                own operations</strong>, including a breach of the accounts of
                LIKO personnel, is handled under our own obligations. We do not
                use a student record as the subject of such a notification.
              </p>
              <p>
                This clause is a commitment about notification. It is not a
                promise that no breach will occur, and it should not be read as a
                representation that the service has not been, and will not be,
                the subject of one.
              </p>
            </>
          ),
        },
        {
          id: 'transfers',
          heading: 'International transfers',
          body: (
            <>
              <p>
                The Processor shall not transfer personal data to a third country
                or international organisation except on the Controller&apos;s
                documented instructions.
              </p>
              <p>
                Where a transfer is required, the Processor shall ensure that it is
                covered by an adequacy decision or by appropriate safeguards. The
                safeguard relied on for transfers to the United States is the
                applicable standard contractual clauses or an adequacy decision
                where one applies, together with any supplementary measures the
                circumstances require.
              </p>
              <p>
                <strong>Where the data is held.</strong> The database is held in
                the region the Controller selected when the subscription was
                created. The application is served from the region the deployment
                is configured to run in. A school whose data region changes is
                told before the move, and the data is not moved without
                confirmation.
              </p>
              <p>
                <strong>The one transfer the Controller does not direct.</strong>
                Where a person has turned on push notifications, the notification
                is dispatched through the push service belonging to that
                person&apos;s browser or device maker. That service is selected by
                the device, not by the Processor, and it is outside the
                Controller&apos;s region. The payload is encrypted for the
                device before it leaves the Processor, so the push service
                receives a payload it cannot read; it receives a subscription
                identifier and delivery metadata, and may hold the message for up
                to 12 hours if the device is offline. This is set out here rather
                than in a schedule because it is a real transfer and a school
                deciding whether to enable notifications should be able to see
                it.
              </p>
              <p>
                Where an adequacy decision relied on is withdrawn, invalidated or
                superseded, the Processor will put an alternative safeguard in
                place and will notify the Controller.
              </p>
            </>
          ),
        },
        {
          id: 'deletion',
          heading: 'Deletion or return on termination',
          body: (
            <>
              <p>
                On termination of this agreement, or of the Processor&apos;s
                services to the Controller, the Processor shall, at the
                Controller&apos;s choice and subject to the following:
              </p>
              <ul>
                <li>
                  <strong>Export first.</strong> On request, make the
                  Controller&apos;s personal data available to it so that it can get
                  its records out. A class gradebook can be downloaded as a
                  spreadsheet from the product, one class at a time, and the
                  Processor will provide anything that download does not cover.
                </li>
                <li>
                  <strong>Then delete.</strong> Delete the personal data, and
                  remove it from working copies, within 30 days of the export
                  window closing.
                </li>
                <li>
                  <strong>Except where the law requires retention.</strong> The
                  Processor may retain personal data where the law requires it to
                  be retained, and will tell the Controller what it has retained
                  and for how long rather than deleting it silently.
                </li>
              </ul>
              <p>
                <strong>What is retained after deletion.</strong> Consent records
                are kept for as long as the account existed and for 6 years
                afterwards, because they are the evidence of what was agreed and
                when. Server logs are kept for 30 days. Push subscriptions are
                deleted when the account closes or the subscription stops working.
              </p>
              <p>
                <strong>Backups.</strong> Data removed from working systems may
                persist in encrypted backups for a limited period until those
                backups age out. It is not restored into working systems except
                for disaster recovery, and if it is, the deletion obligation
                applies again to it.
              </p>
            </>
          ),
        },
        {
          id: 'audits',
          heading: 'Audits and inspections',
          body: (
            <>
              <p>
                The Processor shall make available to the Controller all
                information necessary to demonstrate compliance with Article 28
                and with this agreement, and shall allow for and contribute to
                audits, including inspections, conducted by the Controller or an
                auditor the Controller mandates.
              </p>
              <p>
                <strong>How an audit runs in practice.</strong> An audit is
                ordinarily a written request for the information described in
                clause 6, together with a call. That is the normal route and it is
                the one that resolves most questions fastest, because it is
                answered from the same controls that run in production.
              </p>
              <p>
                <strong>On site and more than once a year.</strong> The Controller
                may conduct an on-site audit more than once in any twelve month
                period where a personal data breach has occurred, where a
                supervisory authority has required it, or where the Controller has
                received a binding complaint from a data subject. The Processor
                will set out any reasonable objection, and where the parties
                cannot agree on the audit they will agree an alternative that
                achieves the same assurance.
              </p>
              <p>
                <strong>What the Processor does not claim.</strong> The measures
                in clause 6 are described accurately and are what runs. They are
                not the output of an independent audit, and the Processor does not
                represent that they have been certified by anyone. An audit clause
                is included precisely because that representation cannot be made
                today.
              </p>
            </>
          ),
        },
        {
          id: 'general',
          heading: 'General',
          body: (
            <>
              <p>
                <strong>Order of precedence.</strong> Where this agreement
                conflicts with a signed master agreement between the parties,
                the master agreement prevails on the point of conflict. Where it
                conflicts with the terms of use, this agreement prevails in so far
                as it concerns the processing of personal data.
              </p>
              <p>
                <strong>Liability.</strong> Liability under this agreement is
                subject to the limitation of liability in the terms of use, which
                the parties agree applies to this agreement, except where a
                limitation is not permitted by law.
              </p>
              <p>
                <strong>Changes.</strong> The Processor may amend this
                agreement. A change that materially affects the processing, or
                the list of subprocessors, will be notified to the Controller
                before it takes effect, and the version in force is published on
                this page.
              </p>
              <p>
                <strong>Governing law.</strong> The governing law of the master
                agreement between the parties applies. Where there is no master
                agreement, this agreement is governed by the law of England and
                Wales, and nothing in it removes any right the Controller has under
                the mandatory data protection law applicable to it.
              </p>
            </>
          ),
        },
        {
          id: 'signatures',
          heading: 'Signatures',
          body: (
            <>
              <p>
                Agreed between the parties on the dates written below, in
                duplicate.
              </p>
              <ul>
                <li>
                  <strong>For the Controller</strong> (school, district or other
                  institution): name, position, signature, date.
                </li>
                <li>
                  <strong>For the Processor</strong> (LIKO): name, position,
                  signature, date.
                </li>
              </ul>
              <p>
                Signing this document is what brings it into force. Until it is
                signed, the terms of use and the privacy notice govern the
                relationship, and this template is reference material.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          heading: 'Contact',
          body: (
            <p>
              Questions about this document go to <strong>legal@liko.app</strong>.
              A question that concerns a child&apos;s data should also be copied
              to <strong>privacy@liko.app</strong>, so it reaches the right person
              without delay.
            </p>
          ),
        },
      ]}
    />
  );
}