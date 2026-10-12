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
      <p id="teacher-levels-heading">Big ideas for little learners. And everyone after.</p>
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