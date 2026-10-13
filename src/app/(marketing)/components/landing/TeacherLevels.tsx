import { BookOpen, GraduationCap, School, Shapes } from 'lucide-react';

/**
 * The four levels band. A one-line rhythm between the hero and the feature tabs,
 * so the page does not go straight from the promise to the interface.
 */

const LEVELS = [
  { label: 'Preschool', Icon: Shapes },
  { label: 'Grade school', Icon: BookOpen },
  { label: 'High school', Icon: School },
  { label: 'College', Icon: GraduationCap },
] as const;

export function TeacherLevels() {
  return (
    <section className="teacher-levels" id="classrooms">
      {/*
        AN `h2`, WHERE THE DESIGN HAS A `<p>`, AND IT RENDERS IDENTICALLY.

        The nav links "For every teacher" here, so this is a destination a teacher
        can land on, and the band was labelled only by a paragraph. A section a
        nav link points at, and which the screen reader's heading list will not
        contain at all, is the gap this project's own `check:behaviour` has been
        failing on: `anchor #classrooms has a heading`. The e2e suite could not
        see it, because that suite only checks that an anchor resolves, and the
        element did.

        This is the design's gap rather than a porting mistake. `index.tsx` in the
        supplied prototype links `#classrooms` to a section whose only label is
        a `<p>`, exactly as here. The design is the spec for how this looks and
        what it says, and the stylesheet below keeps it to the pixel; the markup
        is where the repository's accessibility rule takes precedence, the same
        way the kit's own primitives took precedence over the design's raw
        `<select>`.

        `h2` rather than `h3`: the hero owns the only `h1` on the page and this
        band sits level with the other sections, so `h2` skips nothing.
      */}
      <h2 id="teacher-levels-heading">Big ideas for little learners. And everyone after.</h2>
      <div className="levels">
        {LEVELS.map(({ label, Icon }) => (
          <span key={label}>
            <Icon aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}