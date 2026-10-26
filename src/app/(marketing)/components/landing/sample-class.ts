import type {
  AssessmentRecord,
  AttendanceStatus,
  HeatCell,
  LessonPlanRecord,
  QuestionRecord,
  Student,
} from '@/lib/api/types';
import { meanPercent, riskFromScores } from '@/lib/risk';

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
 *
 * ONE ROSTER, EVERY FIGURE. The class average, the support count, the heatmap
 * and the gradebook are all derived from the marks below, and the heatmap is
 * derived by the same function the product derives it with
 * (`riskFromScores` in `src/lib/risk.ts`). An earlier version of this file
 * carried a support threshold of its own and a heatmap of its own, and the
 * two disagreed: the panel said two students needed support while the heatmap
 * under it showed every student on track, because they were two different
 * rules applied to the same six people. There is one rule now, and the panel
 * counts what the heatmap flags.
 */

export type SampleTab = 'gradebook' | 'attendance' | 'lessons' | 'quizzes' | 'insights';

export interface SampleStudent {
  id: string;
  name: string;
  initials: string;
  /** The mean of the marks below, rounded for display. */
  grade: number;
  attendanceRate: number;
  trend: 'up' | 'flat' | 'down';
  /** One mark per assessment, in the order of SAMPLE_COLUMNS. */
  marks: readonly number[];
}

/** The assessments the marks below belong to, in the order the grid shows them. */
export const SAMPLE_COLUMNS: string[] = ['Quiz', 'Lab report', 'Exam'];

const SAMPLE_CLASS_ID = 'sample-class-sampaguita';
const SAMPLE_TEACHER_ID = 'sample-teacher-camille';

const ROSTER: readonly {
  id: string;
  name: string;
  initials: string;
  marks: readonly number[];
  attendanceRate: number;
  trend: 'up' | 'flat' | 'down';
}[] = [
  { id: 'sample-01', name: 'Sofia Reyes', initials: 'SR', marks: [94, 97, 97], attendanceRate: 98, trend: 'up' },
  { id: 'sample-02', name: 'Miguel Santos', initials: 'MS', marks: [82, 88, 94], attendanceRate: 95, trend: 'up' },
  { id: 'sample-03', name: 'Isabella Cruz', initials: 'IC', marks: [90, 95, 97], attendanceRate: 97, trend: 'up' },
  { id: 'sample-04', name: 'Lucas Garcia', initials: 'LG', marks: [62, 48, 40], attendanceRate: 76, trend: 'down' },
  { id: 'sample-05', name: 'Amara Dela Cruz', initials: 'AD', marks: [84, 90, 99], attendanceRate: 96, trend: 'flat' },
  { id: 'sample-06', name: 'Ethan Ramos', initials: 'ER', marks: [74, 62, 58], attendanceRate: 84, trend: 'down' },
];

export const SAMPLE_STUDENTS: SampleStudent[] = ROSTER.map((row) => ({
  id: row.id,
  name: row.name,
  initials: row.initials,
  grade: Math.round(meanPercent(row.marks)),
  attendanceRate: row.attendanceRate,
  trend: row.trend,
  marks: row.marks,
}));

/** The roster in the shape the gradebook grid takes. */
export const SAMPLE_GRADEBOOK_STUDENTS: Student[] = SAMPLE_STUDENTS.map((student) => ({
  id: student.id,
  name: student.name,
  initials: student.initials,
  grade: student.grade,
  attendanceRate: student.attendanceRate,
  trend: student.trend,
}));

/** The marks, keyed the way the gradebook grid reads them. */
export const SAMPLE_GRADE_CELLS: Record<string, Record<string, number | null>> = Object.fromEntries(
  SAMPLE_STUDENTS.map((student) => [
    student.id,
    Object.fromEntries(
      SAMPLE_COLUMNS.map((column, index) => [column, student.marks[index] ?? null]),
    ),
  ]),
);

/**
 * The risk grid, derived by the product's own rule.
 *
 * The delta is rounded to one decimal place because the product rounds it to
 * one decimal place, and a sample that showed more precision than the product
 * would be a picture of something the product cannot produce.
 */
export const SAMPLE_HEATMAP: HeatCell[] = SAMPLE_STUDENTS.map((student) => {
  const risk = riskFromScores(student.marks);
  return {
    studentId: student.id,
    level: risk.level,
    delta: Number(risk.delta.toFixed(1)),
  };
});

const RISK_BY_STUDENT = new Map(SAMPLE_HEATMAP.map((cell) => [cell.studentId, cell.level]));

/** Student id to display name, which is what the heatmap takes. */
export const SAMPLE_NAMES_BY_ID: Record<string, string> = Object.fromEntries(
  SAMPLE_STUDENTS.map((student) => [student.id, student.name]),
);

/** Today's attendance, with every state the legend explains. */
export const SAMPLE_ATTENDANCE: Record<string, AttendanceStatus> = {
  'sample-01': 'present',
  'sample-02': 'present',
  'sample-03': 'late',
  'sample-04': 'absent',
  'sample-05': 'present',
  'sample-06': 'excused',
};

/** The roster in the shape the attendance grid takes. */
export const SAMPLE_ATTENDANCE_STUDENTS: { id: string; initials: string; name: string }[] =
  SAMPLE_STUDENTS.map((student) => ({
    id: student.id,
    initials: student.initials,
    name: student.name,
  }));

/** The lesson plans behind the lesson studio panel. */
export const SAMPLE_PLANS: LessonPlanRecord[] = [
  {
    id: 'sample-plan-1',
    classId: SAMPLE_CLASS_ID,
    ownerId: SAMPLE_TEACHER_ID,
    title: 'How a leaf makes food',
    weekOf: '2026-10-19',
    body: {
      objective:
        'Explain how a plant turns light into chemical energy, and label the parts of a leaf that make it possible.',
      activities:
        'Leaf dissection in pairs, then a labelled diagram checked against the display board.',
    },
    standardCodes: ['NGSS-MS-LS1-1'],
  },
  {
    id: 'sample-plan-2',
    classId: SAMPLE_CLASS_ID,
    ownerId: SAMPLE_TEACHER_ID,
    title: 'Forces at the science fair',
    weekOf: '2026-10-26',
    body: {
      objective: 'Predict which force changes the motion of a toy cart, and say why.',
      activities:
        'Starter: a cart on a ramp. Pairs change one thing at a time and record what happens.',
    },
    standardCodes: ['NGSS-MS-PS2-2'],
  },
];

/** The assessments behind the quiz maker panel. Their weights total 100. */
export const SAMPLE_ASSESSMENTS: AssessmentRecord[] = [
  {
    id: 'sample-assessment-1',
    classId: SAMPLE_CLASS_ID,
    ownerId: SAMPLE_TEACHER_ID,
    title: 'Photosynthesis check',
    type: 'quiz',
    weight: 20,
    maxScore: 20,
    dueOn: '2026-10-22',
    standardCodes: ['NGSS-MS-LS1-1'],
    archivedAt: null,
    idFormatEnabled: false,
    idFormatGroups: null,
    idFormatCodes: null,
  },
  {
    id: 'sample-assessment-2',
    classId: SAMPLE_CLASS_ID,
    ownerId: SAMPLE_TEACHER_ID,
    title: 'Leaf dissection lab report',
    type: 'lab',
    weight: 30,
    maxScore: 30,
    dueOn: '2026-10-24',
    standardCodes: ['NGSS-MS-LS1-1'],
    archivedAt: null,
    idFormatEnabled: false,
    idFormatGroups: null,
    idFormatCodes: null,
  },
  {
    id: 'sample-assessment-3',
    classId: SAMPLE_CLASS_ID,
    ownerId: SAMPLE_TEACHER_ID,
    title: 'Unit exam: cells and energy',
    type: 'exam',
    weight: 50,
    maxScore: 50,
    dueOn: '2026-10-30',
    standardCodes: ['NGSS-MS-LS1-1', 'NGSS-MS-PS2-2'],
    archivedAt: null,
    idFormatEnabled: false,
    idFormatGroups: null,
    idFormatCodes: null,
  },
];

const SAMPLE_QUESTIONS: Record<string, QuestionRecord[]> = {
  'sample-assessment-1': [
    {
      id: 'sample-question-1',
      assessmentId: 'sample-assessment-1',
      ownerId: SAMPLE_TEACHER_ID,
      position: 0,
      kind: 'single',
      prompt: 'Which part of a leaf takes in the light?',
      options: [
        { key: 'A', text: 'The chlorophyll in the cells' },
        { key: 'B', text: 'The roots in the soil' },
      ],
      answerKey: ['A'],
      points: 10,
    },
    {
      id: 'sample-question-2',
      assessmentId: 'sample-assessment-1',
      ownerId: SAMPLE_TEACHER_ID,
      position: 1,
      kind: 'single',
      prompt: 'What does a plant release while it makes food?',
      options: [
        { key: 'A', text: 'Oxygen' },
        { key: 'B', text: 'Nitrogen' },
      ],
      answerKey: ['A'],
      points: 10,
    },
  ],
  'sample-assessment-2': [
    {
      id: 'sample-question-3',
      assessmentId: 'sample-assessment-2',
      ownerId: SAMPLE_TEACHER_ID,
      position: 0,
      kind: 'single',
      prompt: 'Which vein carries water into the leaf?',
      options: [
        { key: 'A', text: 'The xylem' },
        { key: 'B', text: 'The phloem' },
      ],
      answerKey: ['A'],
      points: 15,
    },
  ],
  'sample-assessment-3': [
    {
      id: 'sample-question-4',
      assessmentId: 'sample-assessment-3',
      ownerId: SAMPLE_TEACHER_ID,
      position: 0,
      kind: 'multiple',
      prompt: 'Which of these are plant cells?',
      options: [
        { key: 'A', text: 'Leaf cells' },
        { key: 'B', text: 'Root cells' },
        { key: 'C', text: 'Red blood cells' },
      ],
      answerKey: ['A', 'B'],
      points: 25,
    },
  ],
};

export const SAMPLE_QUESTIONS_BY_ASSESSMENT: Record<string, QuestionRecord[]> = SAMPLE_QUESTIONS;

export function classAverage(students: readonly { grade: number }[]): number {
  if (students.length === 0) return 0;
  const total = students.reduce((sum, student) => sum + student.grade, 0);
  return Math.round(total / students.length);
}

/**
 * The students the risk grid flags, which is what the panel counts.
 *
 * It is the heatmap's answer and not a threshold of its own, because a panel
 * that says one student needs support while the heatmap under it flags two is
 * a page that contradicts itself, and a reader who notices stops believing the
 * rest of it.
 */
export function needsSupport(students: readonly SampleStudent[] = SAMPLE_STUDENTS): SampleStudent[] {
  return students.filter((student) => {
    const level = RISK_BY_STUDENT.get(student.id);
    return level !== undefined && level !== 'on-track';
  });
}

/** How many students are on each level of the risk grid. */
export function riskCounts(): { onTrack: number; watch: number; atRisk: number } {
  const counts = { onTrack: 0, watch: 0, atRisk: 0 };
  for (const cell of SAMPLE_HEATMAP) {
    if (cell.level === 'on-track') counts.onTrack += 1;
    else if (cell.level === 'watch') counts.watch += 1;
    else counts.atRisk += 1;
  }
  return counts;
}

/** How many students carry each attendance state today. */
export function attendanceCounts(): {
  present: number;
  absent: number;
  late: number;
  excused: number;
} {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const student of SAMPLE_STUDENTS) {
    const status = SAMPLE_ATTENDANCE[student.id];
    if (status) counts[status] += 1;
  }
  return counts;
}

export const SAMPLE_CLASS = {
  teacher: 'Ms. Camille',
  level: 'Grade 7',
  section: 'Sampaguita',
  subject: 'Science',
  schoolYear: 'School year 2026 to 2027',
} as const;

/** The five tabs the showcase switches between, in the order the design shows. */
export const SHOWCASE_TABS: readonly {
  id: SampleTab;
  label: string;
  /** The nav label in the mock's own sidebar, which is shorter than the tab. */
  nav: string;
}[] = [
  { id: 'gradebook', label: 'Gradebook', nav: 'Gradebook' },
  { id: 'attendance', label: 'Attendance', nav: 'Attendance' },
  { id: 'lessons', label: 'Lesson studio', nav: 'Lessons' },
  { id: 'quizzes', label: 'Quiz maker', nav: 'Quizzes' },
  { id: 'insights', label: 'Student insights', nav: 'Insights' },
] as const;
