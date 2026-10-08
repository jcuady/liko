import { students as roster } from './workspace';
import type {
  AssessmentRecord,
  AttendanceStatus,
  BehaviourLogRecord,
  DeckRecord,
  GradeRecord,
  GradingPolicyRecord,
  HistoryRecord,
  LessonPlanRecord,
  MemberRecord,
  OrgRecord,
  ProfileRecord,
  RubricRow,
  SlideRecord,
} from '@/lib/api/types';

/**
 * The demo workspace behind `LIKO_DATA_MODE=fixtures`.
 *
 * WHY THIS EXISTS. The fixture adapter shipped with classes and students but
 * with `assessments`, `grades`, `plans`, `behaviour`, and `history` all empty.
 * That meant the gradebook rendered its empty state, the planner and assessment
 * lists were blank, the history timeline had nothing to show, and no test had
 * ever seen a populated table. A demo a teacher signs into on day one looked
 * like a product with four of its six modules missing.
 *
 * Everything below is derived from the roster in `workspace.ts` so the marks a
 * student has are the marks that roster already claimed for them. Scores are
 * deterministic: the same build always produces the same workspace, so an
 * assertion about a grade means the same thing on every run.
 */

const OWNER = 'demo-owner';
const CLASS_ID = 'cls_demo_01';
const SECOND_CLASS_ID = 'cls_demo_02';

/**
 * The second class's roster. Kept separate from the marketing roster above so
 * the two classes do not share students, which is what makes switching between
 * them show a genuinely different roster.
 */
export const secondClassStudents = [
  { id: 'stu_101', name: 'Tomas Lindqvist', initials: 'TL', grade: 85 },
  { id: 'stu_102', name: 'Amara Nwankwo', initials: 'AN', grade: 91 },
  { id: 'stu_103', name: 'Ravi Menon', initials: 'RM', grade: 78 },
] as const;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function dateOnly(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

/** Baseline attainment per student, taken from the marketing roster. */
const BASELINE: Record<string, number> = Object.fromEntries(
  roster.map((student) => [student.id, student.grade]),
);

const ASSESSMENT_SEED = [
  {
    id: 'asm_demo_01',
    title: 'Unit 3 Quiz: Bonding',
    type: 'quiz' as const,
    weight: 20,
    maxScore: 20,
    dueDaysAgo: 21,
    standardCodes: ['S2C1', 'S2C2'],
  },
  {
    id: 'asm_demo_02',
    title: 'Stoichiometry Worksheet',
    type: 'worksheet' as const,
    weight: 25,
    maxScore: 25,
    dueDaysAgo: 12,
    standardCodes: ['S2C4'],
  },
  {
    id: 'asm_demo_03',
    title: 'Titration Lab Report',
    type: 'lab' as const,
    weight: 40,
    maxScore: 40,
    dueDaysAgo: 4,
    standardCodes: ['S2C4', 'S2C7'],
  },
];

export const demoAssessments: AssessmentRecord[] = ASSESSMENT_SEED.map((seed) => ({
  id: seed.id,
  classId: CLASS_ID,
  ownerId: OWNER,
  title: seed.title,
  type: seed.type,
  weight: seed.weight,
  maxScore: seed.maxScore,
  dueOn: dateOnly(seed.dueDaysAgo),
  standardCodes: seed.standardCodes,
  archivedAt: null,
}));

/**
 * Marks, with a small per-assessment swing so the gradebook has spread rather
 * than three identical columns, and a floor so nobody scores negative.
 */
export const demoGrades: GradeRecord[] = ASSESSMENT_SEED.flatMap((assessment, index) =>
  roster.map((student) => {
    const baseline = BASELINE[student.id] ?? 80;
    // Earlier assessments trend slightly lower, so the recent column tells the
    // story of a class improving rather than a flat line.
    const drift = (index - 1) * 3;
    const ratio = (baseline + drift) / 100;
    const score = Math.max(
      0,
      Math.min(assessment.maxScore, Math.round(assessment.maxScore * ratio)),
    );

    const rubric: RubricRow[] = [
      { criterion: 'Method', points: 10, earned: Math.min(10, Math.round(10 * ratio)) },
      { criterion: 'Working', points: 10, earned: Math.min(10, Math.round(10 * ratio)) },
    ];

    return {
      id: `grd_${student.id}_${assessment.id}`,
      assessmentId: assessment.id,
      studentId: student.id,
      ownerId: OWNER,
      score,
      maxScore: assessment.maxScore,
      rubric,
      feedback: null,
      gradedAt: isoDaysAgo(assessment.dueDaysAgo - 1),
    } satisfies GradeRecord;
  }),
);

const PLAN_SEED = [
  {
    id: 'pln_demo_01',
    title: 'Ionic versus covalent bonding',
    weekDaysAgo: 21,
    body: {
      objective: 'Classify a bond as ionic or covalent and justify the choice.',
      starter: 'Recall the octet rule in two minutes.',
      activity: 'Model bonding with the Lewis dot kit in pairs.',
      assessment: 'Exit ticket: three unlabelled structures to classify.',
      standards: ['S2C1', 'S2C2'],
    },
  },
  {
    id: 'pln_demo_02',
    title: 'Balancing equations',
    weekDaysAgo: 14,
    body: {
      objective: 'Balance a chemical equation and explain the conservation of mass.',
      starter: 'Two minutes of silent recall on the law of conservation of mass.',
      activity: 'Whiteboard race, ten equations at the front.',
      assessment: 'Homework set of twelve equations.',
      standards: ['S2C4'],
    },
  },
  {
    id: 'pln_demo_03',
    title: 'Titration technique and error',
    weekDaysAgo: 7,
    body: {
      objective: 'Run a titration and identify the dominant source of error.',
      starter: 'Recap the mole ratio from last week.',
      activity: 'Paired titration with a shared worksheet.',
      assessment: 'Lab report due, with an error analysis paragraph.',
      standards: ['S2C4', 'S2C7'],
    },
  },
];

export const demoPlans: LessonPlanRecord[] = PLAN_SEED.map((seed) => ({
  id: seed.id,
  classId: CLASS_ID,
  ownerId: OWNER,
  title: seed.title,
  weekOf: dateOnly(seed.weekDaysAgo),
  body: seed.body,
  standardCodes: seed.body.standards as string[],
}));

const BEHAVIOUR_SEED: {
  id: string;
  studentId: string;
  entry: string;
  severity: BehaviourLogRecord['severity'];
  daysAgo: number;
}[] = [
  {
    id: 'beh_demo_01',
    studentId: 'stu_006',
    entry: 'Third absence this fortnight. Checked in with the form tutor.',
    severity: 'concern',
    daysAgo: 9,
  },
  {
    id: 'beh_demo_02',
    studentId: 'stu_004',
    entry: 'Stayed after to finish the titration write-up without prompting.',
    severity: 'praise',
    daysAgo: 6,
  },
  {
    id: 'beh_demo_03',
    studentId: 'stu_006',
    entry: 'Set a catch-up pack for stoichiometry before the next assessment.',
    severity: 'intervention',
    daysAgo: 5,
  },
  {
    id: 'beh_demo_04',
    studentId: 'stu_003',
    entry: 'Peer mentoring on Lewis structures, offered and accepted.',
    severity: 'note',
    daysAgo: 3,
  },
];

export const demoBehaviour: BehaviourLogRecord[] = BEHAVIOUR_SEED.map((seed) => ({
  id: seed.id,
  classId: CLASS_ID,
  studentId: seed.studentId,
  ownerId: OWNER,
  entry: seed.entry,
  severity: seed.severity,
  createdAt: isoDaysAgo(seed.daysAgo),
}));

/**
 * The cumulative record. Every student has an enrolment and at least one scored
 * assessment, so the timeline is never empty and the `attendance_flag` and
 * `note` rows show the shape the page is actually designed around.
 */
export const demoHistory: HistoryRecord[] = roster.flatMap((student) => {
  const rows: HistoryRecord[] = [
    {
      id: `his_${student.id}_enrolled`,
      studentId: student.id,
      ownerId: OWNER,
      eventType: 'enrolled',
      payload: { class: 'Chemistry, Period 2', code: 'CHEM-2' },
      occurredAt: isoDaysAgo(120),
    },
  ];

  ASSESSMENT_SEED.forEach((assessment, index) => {
    const mark = demoGrades.find(
      (grade) => grade.assessmentId === assessment.id && grade.studentId === student.id,
    );
    rows.push({
      id: `his_${student.id}_${assessment.id}`,
      studentId: student.id,
      ownerId: OWNER,
      eventType: 'assessment_scored',
      payload: {
        assessment: assessment.title,
        score: mark?.score ?? 0,
        maxScore: assessment.maxScore,
      },
      occurredAt: isoDaysAgo(assessment.dueDaysAgo - 1 - index),
    });
  });

  const logs = BEHAVIOUR_SEED.filter((entry) => entry.studentId === student.id);
  for (const log of logs) {
    rows.push({
      id: `his_${student.id}_${log.id}`,
      studentId: student.id,
      ownerId: OWNER,
      eventType: log.severity === 'note' ? 'note' : 'intervention',
      payload: { entry: log.entry, severity: log.severity },
      occurredAt: isoDaysAgo(log.daysAgo),
    });
  }

  if ((BASELINE[student.id] ?? 80) < 80) {
    rows.push({
      id: `his_${student.id}_absence`,
      studentId: student.id,
      ownerId: OWNER,
      eventType: 'attendance_flag',
      payload: { reason: 'Unauthorised absence', days: 2 },
      occurredAt: isoDaysAgo(9),
    });
  }

  return rows;
});

/**
 * Two authored scales, so the demo workspace shows a custom scale sitting next
 * to the five built-ins. Both are plausible departmental scales rather than
 * placeholders.
 */
export const demoPolicies: GradingPolicyRecord[] = [
  {
    id: 'pol_demo_distinction',
    ownerId: OWNER,
    name: 'Distinction / Pass / Refer',
    kind: 'points',
    bands: [
      { minPercentage: 75, label: 'Distinction', gradePoint: 4 },
      { minPercentage: 50, label: 'Pass', gradePoint: 2 },
      { minPercentage: 0, label: 'Refer', gradePoint: 0 },
    ],
    builtIn: false,
    createdAt: '2026-01-05T09:00:00.000Z',
  },
  {
    id: 'pol_demo_uk',
    ownerId: OWNER,
    name: 'UK degree class',
    kind: 'letter',
    bands: [
      { minPercentage: 70, label: 'First', gradePoint: 4 },
      { minPercentage: 68, label: '2:1', gradePoint: 3.5 },
      { minPercentage: 65, label: '2:2', gradePoint: 3 },
      { minPercentage: 60, label: 'Third', gradePoint: 2 },
      { minPercentage: 0, label: 'Fail', gradePoint: 0 },
    ],
    builtIn: false,
    createdAt: '2026-01-06T09:00:00.000Z',
  },
];

/**
 * The demo organisation.
 *
 * The five demo accounts are one school's staff, which is what makes the admin
 * page show something real: a principal, two teachers, a student and a parent
 * in the same tenant, each holding a different grant.
 */
export const demoOrg: OrgRecord = {
  id: 'org_demo_northfield',
  name: 'Northfield Science Academy',
  slug: 'northfield-science-academy',
  plan: 'school',
  seatLimit: 25,
  billingEmail: 'office@northfield.test',
  createdAt: '2026-01-02T09:00:00.000Z',
};

/**
 * The demo teacher.
 *
 * Carries the answers a real account accumulates: the school they work at, the
 * subjects they teach, the level they usually teach at, and the scale they grade
 * on by default. Shaped exactly as a saved profile so the profile form opens on
 * real data rather than empty fields.
 */
export const demoProfile: ProfileRecord = {
  id: 'usr_demo_maya',
  email: 'maya@liko.test',
  fullName: 'Maya Okonkwo',
  role: 'instructor',
  schoolName: 'Northfield Science Academy',
  subjects: ['Chemistry', 'Environmental Science'],
  defaultGradeLevel: 'k12',
  gradingPolicyId: 'percentage',
  orgId: demoOrg.id,
};

/**
 * A profile for every demo account, not just the teacher the workspace belongs to.
 *
 * `getProfile` keys on the signed-in user id, so seeding one record under the
 * workspace owner left the four other documented test accounts with a blank
 * synthesised profile: an empty school, no subjects, no default scale. The
 * visible symptom was `/welcome` refusing to skip itself for a teacher who had
 * been set up all along, and `/settings/profile` opening blank.
 *
 * Each carries the answers that account's role would actually have collected, so
 * the wizard and the profile form both open on real data for every test user.
 */
export const demoProfiles: ProfileRecord[] = [
  demoProfile,
  {
    id: 'usr_demo_dev',
    email: 'dev@liko.test',
    fullName: 'Dev Ramanathan',
    role: 'admin',
    schoolName: 'Northfield Science Academy',
    subjects: ['Physics', 'Electronics'],
    defaultGradeLevel: 'k12',
    gradingPolicyId: 'percentage',
    orgId: demoOrg.id,
  },
  {
    id: 'usr_demo_ingrid',
    email: 'ingrid@liko.test',
    fullName: 'Ingrid Halvorsen',
    role: 'instructor',
    schoolName: 'Northfield Science Academy',
    subjects: ['Biology', 'Marine Science'],
    defaultGradeLevel: 'k12',
    gradingPolicyId: 'letter',
    orgId: demoOrg.id,
  },
  {
    id: 'usr_demo_noor',
    email: 'student@liko.test',
    fullName: 'Noor Haddad',
    role: 'student',
    schoolName: 'Northfield Science Academy',
    subjects: [],
    defaultGradeLevel: null,
    gradingPolicyId: null,
    orgId: demoOrg.id,
  },
  {
    id: 'usr_demo_priya',
    email: 'guardian@liko.test',
    fullName: 'Priya Raman',
    role: 'guardian',
    schoolName: 'Northfield Science Academy',
    subjects: [],
    defaultGradeLevel: null,
    gradingPolicyId: null,
    orgId: demoOrg.id,
  },
];

/**
 * Membership rows for the demo accounts.
 *
 * `joinedAt` is staggered so the people list has a stable order rather than
 * sorting by an identical timestamp, and so a test can assert the oldest member
 * is the one who cannot be removed.
 */
export const demoMemberships: MemberRecord[] = [
  {
    id: 'mem_01_dev',
    userId: 'usr_demo_dev',
    orgId: demoOrg.id,
    fullName: 'Dev Ramanathan',
    email: 'dev@liko.test',
    role: 'admin',
    status: 'active',
    joinedAt: '2026-01-02T09:05:00.000Z',
  },
  {
    id: 'mem_02_maya',
    userId: 'usr_demo_maya',
    orgId: demoOrg.id,
    fullName: 'Maya Okonkwo',
    email: 'maya@liko.test',
    role: 'instructor',
    status: 'active',
    joinedAt: '2026-01-03T09:05:00.000Z',
  },
  {
    id: 'mem_03_ingrid',
    userId: 'usr_demo_ingrid',
    orgId: demoOrg.id,
    fullName: 'Ingrid Halvorsen',
    email: 'ingrid@liko.test',
    role: 'instructor',
    status: 'active',
    joinedAt: '2026-01-06T09:05:00.000Z',
  },
  {
    id: 'mem_04_noor',
    userId: 'usr_demo_noor',
    orgId: demoOrg.id,
    fullName: 'Noor Haddad',
    email: 'student@liko.test',
    role: 'student',
    status: 'active',
    joinedAt: '2026-01-06T10:30:00.000Z',
  },
  {
    id: 'mem_05_priya',
    userId: 'usr_demo_priya',
    orgId: demoOrg.id,
    fullName: 'Priya Raman',
    email: 'guardian@liko.test',
    role: 'guardian',
    status: 'active',
    joinedAt: '2026-01-06T11:00:00.000Z',
  },
];

/**
 * The demo deck.
 *
 * The slide module is the one part of the product a teacher cannot tell is
 * working from a list of names alone, so it ships with a real lesson in it:
 * rates, titration and the equilibrium explanation a chemistry class actually
 * walks through. An empty editor would be indistinguishable from a broken one.
 */
export const demoDecks: DeckRecord[] = [
  {
    id: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    title: 'Reaction rates',
    description: 'What changes the speed of a reaction, and what does not.',
    archivedAt: null,
    createdAt: '2026-01-07T09:00:00.000Z',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
];

export const demoSlides: SlideRecord[] = [
  {
    id: 'sld_demo_01',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    position: 0,
    layout: 'title',
    title: 'Reaction rates',
    body: '',
    notes: 'Two minutes on why this matters before any equations.',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
  {
    id: 'sld_demo_02',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    position: 1,
    layout: 'bullets',
    title: 'What the collision theory says',
    body: 'Reactions need particles to collide\nEnough energy to break bonds\nThe right particles facing the right way',
    notes: 'Draw two particles on the board. Ask which collision actually works.',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
  {
    id: 'sld_demo_03',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    position: 2,
    layout: 'bullets',
    title: 'Four things you can change',
    body: 'Temperature\nConcentration\nSurface area\nA catalyst',
    notes: 'Ask for a prediction before revealing each one.',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
  {
    id: 'sld_demo_04',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    position: 3,
    layout: 'bullets',
    title: 'A catalyst changes the route, not the destination',
    body: 'Lower activation energy\nSame starting materials\nSame products\nFaster, but unchanged overall',
    notes: 'The one students most often get wrong. Slow down here.',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
  {
    id: 'sld_demo_05',
    deckId: 'deck_demo_reaction_rates',
    ownerId: OWNER,
    position: 4,
    layout: 'bullets',
    title: 'What you should be able to say by the end',
    body: 'Explain a rate change using collisions\nPredict which change speeds a reaction up\nSay why a catalyst is not used up',
    notes: 'Exit ticket. Two minutes, silent, on a sticky note.',
    updatedAt: '2026-01-08T09:00:00.000Z',
  },
];

/**
 * Marked registers for the last three weeks.
 *
 * The window is wide rather than a handful of days on purpose: the attendance
 * page opens on a date the reader chooses, and a sparse seed leaves most dates
 * blank, which makes the register look broken and makes any assertion about a
 * stored state depend on which day the suite happened to run.
 */
export const demoAttendance = (): Map<string, Record<string, AttendanceStatus>> => {
  const map = new Map<string, Record<string, AttendanceStatus>>();

  const fill = (classId: string, people: { id: string; initials: string }[]) => {
    for (let day = 0; day < 21; day += 1) {
      const marks: Record<string, AttendanceStatus> = {};
      people.forEach((person, index) => {
        // Deterministic but not uniform: one student is regularly late and one
        // is regularly absent, which is what makes the summary worth reading.
        if (person.id === 'stu_006' && day % 2 === 0) marks[person.id] = 'absent';
        else if (person.id === 'stu_004' && day === 3) marks[person.id] = 'late';
        else if ((index + day) % 7 === 0) marks[person.id] = 'excused';
        else if ((index + day) % 5 === 0) marks[person.id] = 'late';
        else marks[person.id] = 'present';
      });
      map.set(`${classId}:${dateOnly(day)}`, marks);
    }
  };

  fill(CLASS_ID, roster);
  fill(SECOND_CLASS_ID, [...secondClassStudents]);

  return map;
};