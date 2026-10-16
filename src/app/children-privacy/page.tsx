import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { TERMS_VERSION } from '@/lib/auth/consent';

/**
 * Children's Privacy Notice.
 *
 * WHY THIS IS SEPARATE FROM THE PRIVACY NOTICE. `/privacy` is written for an
 * adult signing up for an account. This page is written for someone who did not
 * sign up, holds no account, and is trying to find out what is held about a
 * child. That reader has a different question and a different legal position,
 * and answering them inside the general notice meant burying the answer.
 *
 * THE HONEST POSTURE, WHICH IS THE WHOLE POINT. LIKO is not the controller of a
 * student record; the school is. That single fact decides who a guardian must
 * deal with, and this page says it plainly rather than implying LIKO can act as
 * the parent's route to the data. It also never says LIKO "is COPPA compliant"
 * or "is FERPA compliant": LIKO describes what the obligations are, what it
 * does, and what stays with the school, because a compliance claim we cannot
 * evidence would be worse than no claim at all.
 *
 * IT IS A DRAFT FOR REVIEW by a lawyer.
 */

const TITLE = "Children's Privacy Notice";
const DESCRIPTION =
  'What a parent or guardian needs in order to act on a child record held in LIKO: who the controller is, how to reach the school, how to reach us, what happens next, and what we cannot do for you.';

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/children-privacy' },
    openGraph: {
      title: `${TITLE}. LIKO.`,
      description: DESCRIPTION,
      url: '/children-privacy',
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${TITLE}. LIKO.`, description: DESCRIPTION },
  };
}

export default function ChildrenPrivacyPage() {
  return (
    <LegalDocument
      title="Children's Privacy Notice"
      summary="This page is for a parent or guardian who wants to know what is held about a child in LIKO, or to ask for it to be changed or deleted. The short version: your school is the organisation that holds your child's record, and it is the party you must go to. We are the company that runs the software on its instructions. Both are described here, including what we can and cannot do for you."
      version={TERMS_VERSION}
      sections={[
        {
          id: 'the-short-version',
          heading: 'The short version',
          body: (
            <>
              <ul>
                <li>
                  <strong>Your school holds your child&apos;s record.</strong> It
                  decided what to record and why. It is the controller of that
                  data.
                </li>
                <li>
                  <strong>LIKO runs the software.</strong> We store and display
                  the record on the school&apos;s instructions. We are the
                  processor.
                </li>
                <li>
                  <strong>So you go to the school first.</strong> Not because we
                  will not help, but because the school is the only party that can
                  actually change a record or give you access to it.
                </li>
                <li>
                  <strong>Write to us as well if you want to.</strong> We will
                  confirm what we hold, we will tell you which school it belongs
                  to, and we will cooperate with whatever the school decides.
                </li>
                <li>
                  <strong>We cannot act for you against your school.</strong> We
                  are not in a relationship with you, and we cannot verify that
                  you are the guardian of a particular child. That is stated
                  plainly further down rather than left to be discovered.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'who-is-responsible',
          heading: "Who is responsible for your child's data",
          body: (
            <>
              <p>
                This is the part most privacy notices blur, so it is worth being
                blunt about it.
              </p>
              <p>
                <strong>The school is the controller.</strong> Your child&apos;s
                record exists because your school created it. Your school decided
                that this information should be kept, decided how long to keep it,
                and decided who inside the organisation may see it. Those are the
                decisions a data protection law calls the decisions a controller
                makes, and that makes the school the controller of your
                child&apos;s education record.
              </p>
              <p>
                <strong>LIKO is the processor.</strong> We hold the record because
                your school instructed us to, for the purpose of running a
                teaching workspace. We act on documented instructions from the
                school, under a data processing agreement signed with it. We do
                not decide what is recorded about your child.
              </p>
              <p>
                <strong>We are responsible for our own part.</strong> Being the
                processor does not mean we can be careless. We are the party that
                operates the databases, the backups and the access controls, so we
                are directly responsible for keeping them safe. If something goes
                wrong in our part, we are accountable for our part even though
                the record itself is the school&apos;s.
              </p>
              <p>
                This division matters practically. It decides who has to answer
                your question, who has to correct the record, and who has to
                delete it. In almost every case, the answer is the school.
              </p>
            </>
          ),
        },
        {
          id: 'how-to-act',
          heading: 'How to act on a request',
          body: (
            <>
              <p>
                If you want to see what is held about your child, correct it, or
                have it deleted, here is the sequence that works.
              </p>
              <ol>
                <li>
                  <strong>Write to the school.</strong> Start with the person
                  who administers records at your child&apos;s school: the data
                  protection officer if they have one, otherwise the head of
                  year, the office, or the person who handles enrolment and
                  records. Ask what they hold about your child, ask to see it, or
                  ask for the change you want.
                </li>
                <li>
                  <strong>The school checks that you are the guardian.</strong> It
                  will have its own process for this. It may ask for proof of
                  identity or of guardianship, and it is entitled to.
                </li>
                <li>
                  <strong>The school asks us for the data or the change.</strong> It
                  holds the relationship with us, so it does not have to go
                  through you, and it can act on the record directly.
                </li>
                <li>
                  <strong>We respond to the school, usually within a few
                  days.</strong> We do not hold the decision. If a request needs a
                  decision about a student record, that decision is the
                  school&apos;s.
                </li>
                <li>
                  <strong>The school answers you.</strong> Including where it
                  says no, and why.
                </li>
              </ol>
              <p>
                You are entitled to go to us at any point, at{' '}
                <strong>privacy@liko.app</strong>, and a school cannot stop you.
                What changes is what we can do once you have written. We can
                confirm what we hold about an email address or an account, tell
                you which school the record belongs to, and pass your concern to
                the school. We cannot hand over a student record to a member of
                the public, and we cannot overrule a school&apos;s decision about
                a record the school controls.
              </p>
            </>
          ),
        },
        {
          id: 'reaching-us',
          heading: 'Reaching us, and what a request looks like',
          body: (
            <>
              <p>
                Write to <strong>privacy@liko.app</strong>. If the message is
                about a child, put that in the subject line. It routes to the
                person who handles those rather than to a general queue.
              </p>
              <p>It helps a great deal if your message contains:</p>
              <ul>
                <li>your child&apos;s name, and their class or year group</li>
                <li>the name of the school</li>
                <li>what you are asking for: access, correction, or deletion</li>
                <li>
                  enough for us to find the record, such as an email address
                  your school used for them
                </li>
                <li>
                  what you have already asked the school, if you have asked
                </li>
              </ul>
              <p>
                Please do not send a copy of a birth certificate, a passport or
                other identity documents by ordinary email. If we need to verify
                something we will tell you and arrange a way that does not put an
                identity document in an inbox.
              </p>
              <p>
                What we will do with it: confirm what we hold, tell you which
                school it sits under, and pass the request to that school where
                we are able to. What we will not do is decide the matter for
                you, because it is not ours to decide.
              </p>
            </>
          ),
        },
        {
          id: 'what-we-cannot-do',
          heading: 'What LIKO cannot do for you',
          body: (
            <>
              <p>
                This section exists because the honest answer is sometimes no, and
                a parent should not have to discover that after sending documents.
              </p>
              <ul>
                <li>
                  <strong>We cannot hand a student record to you directly.</strong>
                  The record is the school&apos;s. We can send it to the school,
                  or with the school&apos;s written instruction, but we cannot
                  decide that you should receive it.
                </li>
                <li>
                  <strong>We cannot open your child&apos;s account for you.</strong>
                  Guardian accounts exist, but a guardian account is created by
                  the teacher who owns the class, from the class roster. A
                  guardian cannot create one, and neither can we on request.
                  If you want one, ask the school or the teacher.
                </li>
                <li>
                  <strong>We cannot tell you what the school has told your
                  child.</strong> A teacher&apos;s private judgement about a
                  student is not LIKO data.
                </li>
                <li>
                  <strong>We cannot change a grade, a mark, or an attendance
                  entry.</strong> Those are the school&apos;s records, entered by
                  its staff under its policies.
                </li>
                <li>
                  <strong>We cannot stop a school from using LIKO.</strong> If a
                  dispute with the school cannot be resolved, the route is that
                  school&apos;s complaints process and then its regulator, not
                  us.
                </li>
                <li>
                  <strong>We cannot verify that you are a guardian.</strong> Not
                  as a refusal to help. We simply hold no relationship with you,
                  so we would be taking a disclosure request from an unverified
                  stranger about a named child.
                </li>
              </ul>
              <p>
                None of this is a way of avoiding our obligations. Where the law
                gives you a right against a processor as well as a controller,
                we will support the exercise of it. It is a statement about who
                holds the decision, not about whether we will help.
              </p>
            </>
          ),
        },
        {
          id: 'the-rules-that-apply',
          heading: 'The rules that apply to a child record',
          body: (
            <>
              <p>
                The rules below are real and they apply to this situation. What
                follows is what each one requires and where the responsibility
                sits. LIKO does not claim to have been assessed against any of
                them, and a reader should not treat this as a compliance
                statement.
              </p>

              <h3>COPPA, the US rule for under 13s</h3>
              <p>
                The Children&apos;s Online Privacy Protection Act applies to an
                operator of a child-directed online service, or of a general
                audience service with actual knowledge that it collects personal
                information from a child under 13. It requires parental consent
                for collection, and it requires a notice to parents and a means
                to review and delete.
              </p>
              <p>
                How that bears on a school deployment depends on the deployment,
                which is why the school makes the call rather than us. The
                position LIKO is built for is this: a student may create their
                own account from the public registration path, and LIKO applies
                no age gate, so a child under 13 can reach that path and give us
                personal information directly rather than through a school. A
                child&apos;s record is otherwise created or linked by a teacher,
                from a class roster, under a school&apos;s own policy. Where a
                school deploys LIKO the school collects the information and is
                the party responsible for its collection notice and for consent
                or authorisation where one is required.
              </p>
              <p>
                We hold such data only on a school&apos;s instruction, we do not
                use it for advertising or profiling, and we do not sell it. A
                child under 13 should have a parent or guardian&apos;s agreement
                before registering. Whether these facts satisfy COPPA in a
                particular school&apos;s particular deployment is a question for
                that school, with its own counsel, and we do not answer it on
                their behalf.
              </p>

              <h3>FERPA, the US rule for education records</h3>
              <p>
                FERPA governs the disclosure of education records by an
                educational institution. It is the school that is the custodian
                of the record and the party that owes the duties. LIKO is a
                service provider working under that school&apos;s supervision, and
                the school remains the custodian.
              </p>
              <p>
                What LIKO does: we do not disclose education records except to
                the school that owns them, to a person the school authorises, or
                where the law compels it, in which case we tell the school as
                well where the law allows us to. Access to a student record is
                enforced in the database itself, not only in the interface.
              </p>
              <p>
                What stays with the school: deciding what is an education record,
                deciding who may see it, handling a request to amend it, and
                responding to a parent&apos;s request under FERPA. If you believe
                a record has been disclosed improperly, tell the school, and
                tell us at the address above. We will investigate with them and
                tell you what we find about our own part.
              </p>

              <h3>GDPR and UK GDPR</h3>
              <p>
                Where a school is established in the EEA or the UK, the school is
                the controller and we are its processor. We process on the
                school&apos;s documented instructions under a data processing
                agreement, which is a template the two parties sign. On that
                basis the lawful basis for the processing is the school&apos;s to
                set out to you.
              </p>
              <p>
                For a child, the position needs care rather than a formula. The
                age at which a child can consent for themselves is 16 in some
                member states and 13 in others, and where the consent age is
                below 18 a child&apos;s consent requires the holder of parental
                responsibility, and the holder&apos;s consent, in addition. Where
                processing relies on consent rather than on another basis. None
                of this is ours to determine: it turns on the school&apos;s
                establishment, the law that applies to it, and the lawful basis
                it has chosen.
              </p>

              <h3>State privacy laws and PIPEDA</h3>
              <p>
                Several US states have privacy statutes that add rights around
                sensitive data and around children, commonly with opt-in consent
                and a duty to erase. Canada&apos;s PIPEDA applies to private
                sector organisations in Canada, and the school is likewise the
                organisation making the decisions there.
              </p>
              <p>
                We do not maintain a store of sensitive data about a child, and
                we ask that none be entered: health, religious or political
                information does not belong in a gradebook, and the product is
                built not to encourage it. If your jurisdiction requires an
                additional authorisation for a child, the school is the party that
                obtains it.
              </p>
              <p>
                A short statement of the general shape, because it is the honest
                one: in each of these regimes the obligation sits with the
                organisation that decided to collect the data, and that is the
                school. LIKO&apos;s obligation is to process it as instructed,
                to keep it safe, and to support the school in answering you.
              </p>
            </>
          ),
        },
        {
          id: 'notifications',
          heading: 'What a notification can contain',
          body: (
            <>
              <p>
                One thing is worth telling a parent about plainly, because it is
                the point where a child&apos;s name leaves the school&apos;s own
                systems.
              </p>
              <p>
                If a teacher turns on push notifications, LIKO sends alerts to
                that teacher&apos;s own devices. One of those alerts names
                students: it tells the teacher which students have fallen below
                the threshold for needing attention, and it can include the
                first couple of student names.
              </p>
              <p>
                Those notifications are sent through the push service belonging to
                the teacher&apos;s browser or device maker, which is how web push
                works. The message content is encrypted for the teacher&apos;s
                device before it is sent, so the push service relays a payload it
                cannot read. We do not choose that service, the device does, and
                we restrict dispatch to known push services only.
              </p>
              <p>
                This is a real consideration for a school that turns the feature
                on, and it is one we would rather state than leave to be
                discovered. Turning notifications off removes it, and doing so
                does not remove any other function.
              </p>
            </>
          ),
        },
        {
          id: 'deletion',
          heading: 'Retention and deletion',
          body: (
            <>
              <p>
                Your child&apos;s record belongs to the school, and the school
                decides when it goes. Here is what happens in practice.
              </p>
              <ul>
                <li>
                  <strong>While the child is on the roll</strong>, the record is
                  kept as the school&apos;s teaching record.
                </li>
                <li>
                  <strong>When the school deletes the record</strong>, it asks
                  us and we delete the account, the record and the sessions
                  attached to it, and we confirm in writing.
                </li>
                <li>
                  <strong>When a school leaves LIKO</strong>, its data is
                  exported on request and deleted from our systems after a 30 day
                  window, so that the school can get anything out first.
                </li>
                <li>
                  <strong>What we keep afterwards</strong> is limited: consent
                  records, kept for as long as the account existed and for 6
                  years afterwards, because they are the evidence of what was
                  agreed and when. Server logs are kept for 30 days. Push
                  subscriptions are deleted when they stop working or the account
                  closes.
                </li>
              </ul>
              <p>
                We keep nothing about a child beyond that without a reason we
                could name to you. If you ask us to delete something and we keep
                it, we will tell you which item, why, and for how long.
              </p>
              <p>
                Deleting an account does not delete teaching records that a
                teacher has already entered. Those are the school&apos;s, and the
                school decides their lifetime. That is deliberate: a record
                should not vanish because an account was closed, because the
                school may need it for a dispute long afterwards.
              </p>
            </>
          ),
        },
        {
          id: 'complaints',
          heading: 'If you are not satisfied',
          body: (
            <>
              <p>
                If the school has not resolved something, that is a complaint
                about the school, and it belongs with the school&apos;s own
                complaints process and, if that fails, with the supervisory
                authority for that school.
              </p>
              <p>
                If the concern is about LIKO&apos;s part, write to{' '}
                <strong>privacy@liko.app</strong>. We will investigate, we will
                tell you what we found, and we will cooperate with any
                supervisory authority that asks about us.
              </p>
              <p>
                We will not ask a parent to withdraw a complaint to their school
                in order to get something from us, and we will not ask a school
                to withdraw a complaint to us in order to get something from
                them.
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
                Write to <strong>privacy@liko.app</strong>, and say in the subject
                line that it concerns a child.
              </p>
              <p>
                This page is versioned with the rest of our legal documents and
                the version in force is printed above. If it changes in a way
                that affects how a child&apos;s data is handled, we tell the
                school before the change takes effect.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}