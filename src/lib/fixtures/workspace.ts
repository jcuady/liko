import type {
  AttendanceStatus,
  ClassRoom,
  HeatCell,
  Stat,
  Student,
} from '@/lib/api/types';

/**
 * Sample workspace data.
 *
 * These values drive the real dashboard components, including the miniatures
 * inside the landing page hero. Because the hero renders the same components
 * the app ships, these fixtures must stay coherent with each other: the class
 * counts have to match the student list, and the heatmap has to reference
 * students that exist.
 */

export const classes: ClassRoom[] = [
  { id: 'cls_chem_1', name: 'Chemistry', code: 'CHE 10A', studentCount: 31, meetsPerWeek: 5 },
  { id: 'cls_bio_1', name: 'Biology', code: 'BIO 10B', studentCount: 28, meetsPerWeek: 4 },
  { id: 'cls_chem_2', name: 'Honours Chemistry', code: 'CHE 11A', studentCount: 24, meetsPerWeek: 3 },
  { id: 'cls_env_1', name: 'Environmental Science', code: 'ENV 9A', studentCount: 35, meetsPerWeek: 2 },
];

export const students: Student[] = [
  { id: 'stu_001', name: 'Ana Ferreira', initials: 'AF', grade: 94, attendanceRate: 98, trend: 'up' },
  { id: 'stu_002', name: 'Ben Osei', initials: 'BO', grade: 88, attendanceRate: 95, trend: 'flat' },
  { id: 'stu_003', name: 'Clara Nwosu', initials: 'CN', grade: 91, attendanceRate: 97, trend: 'up' },
  { id: 'stu_004', name: 'Dmitri Volkov', initials: 'DV', grade: 76, attendanceRate: 88, trend: 'down' },
  { id: 'stu_005', name: 'Elif Demir', initials: 'ED', grade: 84, attendanceRate: 93, trend: 'flat' },
  { id: 'stu_006', name: 'Farid Haddad', initials: 'FH', grade: 69, attendanceRate: 79, trend: 'down' },
  { id: 'stu_007', name: 'Grace Mbeki', initials: 'GM', grade: 92, attendanceRate: 99, trend: 'up' },
  { id: 'stu_008', name: 'Hana Sato', initials: 'HS', grade: 87, attendanceRate: 94, trend: 'up' },
];

export const stats: Stat[] = [
  { label: 'Classes', value: '4', delta: 0 },
  { label: 'Students', value: '118', delta: 6 },
  { label: 'Needs review', value: '7', delta: -2 },
  { label: 'Avg. grade', value: '84.2', delta: 3.1 },
];

/**
 * Attendance for today. States are deliberately mixed so every visual state is
 * present in the hero miniature rather than only the happy one.
 */
export const attendance: Record<string, AttendanceStatus> = {
  'stu_001': 'present',
  'stu_002': 'present',
  'stu_003': 'late',
  'stu_004': 'present',
  'stu_005': 'absent',
  'stu_006': 'present',
  'stu_007': 'present',
  'stu_008': 'excused',
};

/**
 * At-risk ramp. `delta` is the grade-point change over the last six weeks; the
 * heatmap derives both colour and pattern from `level` so the encoding never
 * relies on colour alone.
 */
export const heatmap: HeatCell[] = [
  { studentId: 'stu_001', level: 'on-track', delta: 4.2 },
  { studentId: 'stu_002', level: 'on-track', delta: 1.1 },
  { studentId: 'stu_003', level: 'on-track', delta: 5.8 },
  { studentId: 'stu_004', level: 'watch', delta: -3.4 },
  { studentId: 'stu_005', level: 'on-track', delta: 0.6 },
  { studentId: 'stu_006', level: 'at-risk', delta: -9.7 },
  { studentId: 'stu_007', level: 'on-track', delta: 3.9 },
  { studentId: 'stu_008', level: 'watch', delta: -1.8 },
];

/**
 * Twenty-week grade trend, used by the analyse stage and the overview chart.
 * Values are weighted so the line reads as a real term rather than noise.
 */
export const gradeTrend: number[] = [
  71, 72, 74, 73, 76, 78, 77, 79, 81, 80, 82, 84, 83, 85, 84, 86, 85, 87, 86, 88,
];

/** Marks shown in the planner stage miniature. */
export const standards: { code: string; title: string; met: boolean }[] = [
  { code: 'HS-PS1-1', title: 'Model atomic structure', met: true },
  { code: 'HS-PS1-2', title: 'Interpret the periodic table', met: true },
  { code: 'HS-PS1-3', title: 'Balance chemical equations', met: false },
  { code: 'HS-PS2-5', title: 'Explain reaction rates', met: false },
];

/** Question types available in the assessment builder. */
export const questionTypes = [
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'short', label: 'Short answer' },
  { id: 'essay', label: 'Extended response' },
  { id: 'numeric', label: 'Numeric' },
];

/** Rubric rows shown in the assess stage miniature. */
export const rubricRows = [
  { criterion: 'Method', points: 12, earned: 10 },
  { criterion: 'Working', points: 8, earned: 7 },
  { criterion: 'Conclusion', points: 5, earned: 3 },
];