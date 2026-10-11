/**
 * The sample class behind the workspace mock on the landing page.
 *
 * WHY THIS IS A SEPARATE MODULE, AND WHY IT IS NOT DATA.
 *
 * The supplied brand design opens an interactive demo: a Zustand store, an
 * editable gradebook, a fake scan that returns a score, a quiz that grades
 * itself. That whole surface was scaffolding for a prototype with no backend,
 * and porting it into LIKO would put a second, fake product on the marketing
 * page next to a real one. Two products is worse than none.
 *
 * So the mock keeps the part that earns its place, which is the visual: a
 * workspace that shows what the real screens look like. What it loses is every
 * part that pretended to be the product. The numbers below never change, the
 * tabs only switch what is visible, and nothing reports a result.
 *
 * The names are Filipino and invented, which is the point. LIKO is sold to
 * Filipino teachers, and the previous demo data used "Student 1". Using real
 * looking names from the market the product is for is not a privacy problem
 * precisely because they are fictional, and every surface that renders them
 * says so in the same words.
 */

export type SampleTab = 'gradebook' | 'lessons' | 'quizzes' | 'insights';

export interface SampleStudent {
  name: string;
  initials: string;
  grade: number;
}

export const SAMPLE_STUDENTS: readonly SampleStudent[] = [
  { name: 'Sofia Reyes', initials: 'SR', grade: 96 },
  { name: 'Miguel Santos', initials: 'MS', grade: 88 },
  { name: 'Isabella Cruz', initials: 'IC', grade: 94 },
  { name: 'Lucas Garcia', initials: 'LG', grade: 72 },
  { name: 'Amara Dela Cruz', initials: 'AD', grade: 91 },
  { name: 'Ethan Ramos', initials: 'ER', grade: 78 },
] as const;

/** Below this the mock tags a student as needing support, as the real one does. */
export const SUPPORT_THRESHOLD = 80;

export function classAverage(students: readonly SampleStudent[]): number {
  if (students.length === 0) return 0;
  const total = students.reduce((sum, student) => sum + student.grade, 0);
  return Math.round(total / students.length);
}

export function needsSupport(students: readonly SampleStudent[]): SampleStudent[] {
  return students.filter((student) => student.grade < SUPPORT_THRESHOLD);
}

export const SAMPLE_CLASS = {
  teacher: 'Ms. Camille',
  level: 'Grade 7',
  section: 'Sampaguita',
  subject: 'Science',
  schoolYear: 'School year 2026 to 2027',
} as const;

/** The four tabs the showcase switches between, in the order the design shows. */
export const SHOWCASE_TABS: readonly {
  id: SampleTab;
  label: string;
  /** The nav label in the mock's own sidebar, which is shorter than the tab. */
  nav: string;
}[] = [
  { id: 'gradebook', label: 'Gradebook', nav: 'Gradebook' },
  { id: 'lessons', label: 'Lesson studio', nav: 'Lessons' },
  { id: 'quizzes', label: 'Quiz maker', nav: 'Quizzes' },
  { id: 'insights', label: 'Student insights', nav: 'Insights' },
] as const;