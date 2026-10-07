import { z } from 'zod';

/**
 * Domain contracts.
 *
 * These are the shapes the UI is allowed to assume. They are deliberately
 * narrow: the fixture adapter and the eventual real API both satisfy them, so
 * swapping one for the other does not touch a component.
 */

export const roleSchema = z.enum(['instructor', 'admin', 'student', 'guardian']);
export type Role = z.infer<typeof roleSchema>;

export const attendanceStatusSchema = z.enum([
  'present',
  'absent',
  'late',
  'excused',
]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const studentSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  grade: z.number().min(0).max(100),
  attendanceRate: z.number().min(0).max(100),
  trend: z.enum(['up', 'flat', 'down']),
});
export type Student = z.infer<typeof studentSchema>;

export const classSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  studentCount: z.number().int().nonnegative(),
  meetsPerWeek: z.number().int().positive(),
});
export type ClassRoom = z.infer<typeof classSchema>;

export const statSchema = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.number(),
});
export type Stat = z.infer<typeof statSchema>;

export const flowStageSchema = z.enum([
  'plan',
  'create',
  'assess',
  'grade',
  'analyze',
]);
export type FlowStage = z.infer<typeof flowStageSchema>;

export const heatCellSchema = z.object({
  studentId: z.string(),
  level: z.enum(['on-track', 'watch', 'at-risk']),
  delta: z.number(),
});
export type HeatCell = z.infer<typeof heatCellSchema>;

// ---------------------------------------------------------------------------
// Persistence shapes
//
// These mirror the Postgres rows in supabase/migrations. They are deliberately
// separate from the view models above: `Student` is a gradebook projection, while
// `StudentRecord` is what the database actually stores. Keeping them apart is
// what lets a column change without a marketing mockup breaking.
// ---------------------------------------------------------------------------

export const classLevelSchema = z.enum(['preschool', 'k12', 'university']);
export type ClassLevel = z.infer<typeof classLevelSchema>;

export interface ClassRecord {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  level: ClassLevel;
  meetsPerWeek: number;
  archivedAt: string | null;
}

export interface StudentRecord {
  id: string;
  classId: string;
  ownerId: string;
  fullName: string;
  initials: string;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  archivedAt: string | null;
}

export const assessmentTypeSchema = z.enum([
  'quiz',
  'worksheet',
  'exam',
  'project',
  'lab',
]);
export type AssessmentType = z.infer<typeof assessmentTypeSchema>;

export interface AssessmentRecord {
  id: string;
  classId: string;
  ownerId: string;
  title: string;
  type: AssessmentType;
  weight: number;
  maxScore: number;
  dueOn: string | null;
  standardCodes: string[];
  archivedAt: string | null;
}

export interface GradeRecord {
  id: string;
  assessmentId: string;
  studentId: string;
  ownerId: string;
  score: number | null;
  maxScore: number;
  rubric: RubricRow[];
  feedback: string | null;
  gradedAt: string;
}

export const rubricRowSchema = z.object({
  criterion: z.string(),
  points: z.number(),
  earned: z.number(),
});
export type RubricRow = z.infer<typeof rubricRowSchema>;

export interface LessonPlanRecord {
  id: string;
  classId: string;
  ownerId: string;
  title: string;
  weekOf: string | null;
  body: Record<string, unknown>;
  standardCodes: string[];
}

export const severitySchema = z.enum([
  'note',
  'praise',
  'concern',
  'intervention',
]);
export type Severity = z.infer<typeof severitySchema>;

export interface BehaviourLogRecord {
  id: string;
  classId: string;
  studentId: string;
  ownerId: string;
  entry: string;
  severity: Severity;
  createdAt: string;
}

export const historyEventSchema = z.enum([
  'enrolled',
  'attendance_flag',
  'standard_mastered',
  'assessment_scored',
  'intervention',
  'note',
]);
export type HistoryEventType = z.infer<typeof historyEventSchema>;

export interface HistoryRecord {
  id: string;
  studentId: string;
  ownerId: string;
  eventType: HistoryEventType;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

/** One student's mark in a date, as posted by the attendance grid. */
export interface AttendanceMark {
  studentId: string;
  status: AttendanceStatus;
}

/** Bulk write used by "mark all present" and by an offline queue replay. */
export interface AttendanceWrite {
  classId: string;
  date: string;
  marks: AttendanceMark[];
}