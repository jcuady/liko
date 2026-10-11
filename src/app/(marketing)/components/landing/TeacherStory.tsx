import Image from 'next/image';

import { SectionHeading } from '@/components/marketing/SectionHeading';

/**
 * The teacher story. The one photograph on the page, and the only place LIKO
 * talks about the job rather than the software.
 *
 * The image is a real photograph from the brand design rather than an
 * illustration, which is why it carries an alt that says who is in it. A
 * decorative `alt=""` on a picture of a teacher would leave a screen reader user
 * with no idea why the page suddenly got quiet.
 */

const VALUES = [
  { strong: 'One workspace', span: 'No more switching between tools' },
  { strong: 'Every learner', span: 'A clearer view of their progress' },
] as const;

export function TeacherStory() {
  return (
    <section
      id="story"
      aria-labelledby="story-heading"
      className="chapter grid items-center gap-8 md:grid-cols-2 md:gap-[70px] md:pt-0"
    >
      <Image
        src="/classroom.jpg"
        alt="A teacher working through a lesson with a group of students in a classroom"
        width={1440}
        height={1024}
        loading="lazy"
        className="h-[280px] w-full rounded-[8px] object-cover md:h-[370px]"
      />

      <div>
        <SectionHeading
          align="start"
          eyebrow="Made for the moments that matter"
          title={
            <span id="story-heading">
              Your best work happens
              <br />
              beyond the paperwork.
            </span>
          }
        />
        <p className="mt-4 max-w-[560px] text-[14px] leading-[1.75] text-ink-muted">
          The question that sparks curiosity. The student who finally gets it. The
          lesson that stays with them. That is what teaching is about.
        </p>
        <p className="mt-4 max-w-[560px] text-[14px] leading-[1.75] text-ink-muted">
          Liko takes care of the little things, so you can be there for the big ones,
          whatever age you teach.
        </p>

        <dl className="mt-7 flex gap-7">
          {VALUES.map((value) => (
            <div key={value.strong}>
              <dt className="font-display text-[21px] font-semibold">{value.strong}</dt>
              <dd className="text-[11px] text-ink-muted">{value.span}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}