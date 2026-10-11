import { BookOpen, GraduationCap, School, Shapes } from 'lucide-react';

/**
 * The band that says who it is for, in one line and four nouns.
 *
 * It sits directly under the hero and does no selling. The design uses it as a
 * breath between the panel and the first real section, and it earns its place
 * by answering the first question a visitor has, which is whether a tool for
 * "educators" has anything to do with the year level they actually teach.
 */

const LEVELS = [
  { label: 'Preschool', Icon: Shapes },
  { label: 'Grade school', Icon: BookOpen },
  { label: 'High school', Icon: School },
  { label: 'College', Icon: GraduationCap },
] as const;

export function TeacherLevels() {
  return (
    <section
      id="classrooms"
      aria-labelledby="teacher-levels-heading"
      className="border-b border-border px-5 py-8 text-center md:py-10"
    >
      <p id="teacher-levels-heading" className="mb-5 text-[11px] text-ink-muted">
        Big ideas for little learners. And everyone after.
      </p>
      <ul className="mx-auto grid max-w-[290px] grid-cols-2 gap-x-8 gap-y-5 font-display text-[12px] font-semibold text-ink-muted md:flex md:max-w-none md:items-center md:justify-center md:gap-[65px] md:text-[15px]">
        {LEVELS.map(({ label, Icon }) => (
          <li key={label} className="flex items-center justify-center gap-2.5">
            <Icon size={19} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}