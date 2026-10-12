import Image from 'next/image';

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
    <section className="section page-width teacher-story" id="story" aria-labelledby="story-heading">
      <Image
        src="/classroom.jpg"
        alt="A Filipino teacher helping students learn together in a classroom"
        width={1440}
        height={1024}
        loading="lazy"
        className="teacher-photo"
      />

      <div>
        <p className="section-tag">Made for the moments that matter</p>
        <h2 className="section-title">
          <span id="story-heading">
            Your best work happens
            <br />
            beyond the paperwork.
          </span>
        </h2>
        <p className="section-copy">
          The question that sparks curiosity. The student who finally gets it. The
          lesson that stays with them. That’s what teaching is about.
        </p>
        <p className="section-copy mt-4">
          Liko takes care of the little things, so you can be there for the big ones,
          whatever age you teach.
        </p>

        <dl className="teacher-values">
          {VALUES.map((value) => (
            <div key={value.strong}>
              <strong>{value.strong}</strong>
              <span>{value.span}</span>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}