import { z } from 'zod';

import type { GradeBand, PolicyKind } from '@/lib/grading/policy';

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
  /** The scale this class is graded on. Null means the built-in percentage. */
  gradingPolicyId: string | null;
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
  /**
   * The LIKO login issued for this student, if any. Null is the normal case:
   * most students on a roster never need to sign in.
   *
   * This is the only thing that lets a student or guardian account see anything,
   * and it is set exclusively by a teacher from the roster. Nothing in the
   * public signup path can produce one, which is what makes "teachers create
   * student accounts" a rule the database enforces rather than a promise in a
   * terms page.
   */
  accountId: string | null;
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

/**
 * The two question kinds a printed sheet can carry.
 *
 * `free_text` is deliberately absent. It is the kind people ask for first and it
 * is the kind a bubble sheet cannot read, so offering it here would produce a
 * question that looks markable on the builder and then scores zero on every
 * scan, with nothing in the UI to explain why.
 */
export const questionKindSchema = z.enum(['single', 'multiple']);
export type QuestionKind = z.infer<typeof questionKindSchema>;

export const questionOptionSchema = z.object({
  /** The letter printed on the sheet. This is what a scan returns. */
  key: z.string().min(1).max(4),
  text: z.string().min(1).max(400),
});
export type QuestionOption = z.infer<typeof questionOptionSchema>;

export interface QuestionRecord {
  id: string;
  assessmentId: string;
  ownerId: string;
  /** Zero-based, and the order the sheet is printed in. */
  position: number;
  kind: QuestionKind;
  prompt: string;
  options: QuestionOption[];
  answerKey: string[];
  points: number;
}

export const questionInputSchema = z
  .object({
    assessmentId: z.string().min(1),
    kind: questionKindSchema,
    prompt: z.string().min(1).max(500),
    options: z.array(questionOptionSchema).min(2).max(8),
    answerKey: z.array(z.string().min(1)).min(1),
    points: z.number().positive().max(100),
  })
  .superRefine((value, ctx) => {
    const keys = value.options.map((option) => option.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'Every option needs its own letter.', path: ['options'] });
    }
    const unknown = value.answerKey.filter((key) => !keys.includes(key));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `The answer key names an option that does not exist: ${unknown.join(', ')}.`,
        path: ['answerKey'],
      });
    }
    if (value.kind === 'single' && value.answerKey.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'A single choice question has exactly one answer.',
        path: ['answerKey'],
      });
    }
  });
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** What a scan read, kept so a disputed sheet can be re-examined. */
export interface ScannedAnswer {
  questionIndex: number;
  optionKeys: string[];
  /** The teacher changed this before saving. */
  edited: boolean;
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
  /** `manual` when a teacher typed it, `scan` when it came off a sheet. */
  source: GradeSource;
  /** The marks exactly as read, plus what the teacher corrected. */
  scanDetail: ScannedAnswer[] | null;
}

export const gradeSourceSchema = z.enum(['manual', 'scan']);
export type GradeSource = z.infer<typeof gradeSourceSchema>;

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

/**
 * A stored grading scale.
 *
 * `bands` is the wire form of `GradeBand[]` from `lib/grading/policy`. Stored as
 * jsonb because the shape is a descending list, not something the database needs
 * to query. A policy whose `id` is empty is a draft the user is editing; a saved
 * one has the row id.
 */
export interface GradingPolicyRecord {
  id: string;
  ownerId: string;
  name: string;
  kind: PolicyKind;
  bands: GradeBand[];
  /** Built-in scales are read only. A custom scale belongs to its author. */
  builtIn: boolean;
  createdAt: string;
}

export interface GradingPolicyInput {
  name: string;
  kind: PolicyKind;
  bands: GradeBand[];
}

/**
 * A teacher's own account settings.
 *
 * Separate from `ClassRecord` because these follow the person, not a class: a
 * teacher who grades chemistry on GWA and biology on percentage carries both
 * answers here once and overrides per class where they differ.
 */
export interface ProfileRecord {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  schoolName: string | null;
  /** Free text as typed, so "AP Biology" survives rather than being normalised. */
  subjects: string[];
  defaultGradeLevel: ClassLevel | null;
  /** The scale this teacher grades on by default. */
  gradingPolicyId: string | null;
  /** The organisation this account belongs to, once it has one. */
  orgId: string | null;
}

/**
 * The plans an organisation can be sold on.
 *
 * These three ids are the same three the pricing page sells and the same three
 * the `organizations.plan` check constraint allows. They used to be two
 * vocabularies: this file and the SQL said `solo | school | district`, while the
 * pricing page sold `starter | teacher | school`. Only `school` appeared in
 * both, so two of the three plan ids on the pricing page could not have been
 * written to the column they referred to, and `district` had no card on the
 * page at all. Three names, one list, kept here where the type lives.
 */
export const ORG_PLANS = ['solo', 'teacher', 'school'] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const ORG_PLAN_LABELS: Record<OrgPlan, string> = {
  solo: 'Solo',
  teacher: 'Teacher',
  school: 'School',
};

export type MembershipStatus = 'active' | 'suspended';

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  seatLimit: number;
  billingEmail: string | null;
  createdAt: string;
}

export interface OrgInput {
  name: string;
  plan: OrgPlan;
  seatLimit: number;
  billingEmail: string | null;
}

/**
 * One person inside the organisation.
 *
 * The role is the same four the permission matrix uses, so an admin changing it
 * here changes what that person can actually do. `status` is separate because
 * removing a teacher's access is not the same as demoting them: a suspended
 * colleague keeps their history and can be restored in one click.
 */
export interface MemberRecord {
  id: string;
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  joinedAt: string;
}

/**
 * How a slide arranges its own content.
 *
 * Four is enough to cover the shapes a lesson actually uses and few enough that
 * a teacher can tell them apart at a glance in the layout picker. Anything more
 * becomes a design tool, which is not what this is.
 */
export const SLIDE_LAYOUTS = ['title', 'bullets', 'split', 'blank'] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const SLIDE_LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: 'Title only',
  bullets: 'Title and points',
  split: 'Points beside an image',
  blank: 'Blank',
};

export interface DeckRecord {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckInput {
  title: string;
  description: string;
}

export interface SlideRecord {
  id: string;
  deckId: string;
  ownerId: string;
  position: number;
  layout: SlideLayout;
  title: string;
  body: string;
  /** Kept apart from the body because a teacher never projects it. */
  notes: string;
  updatedAt: string;
}

export interface SlideInput {
  layout: SlideLayout;
  title: string;
  body: string;
  notes: string;
}

export interface ProfileInput {
  fullName: string;
  /**
   * Nullable to match the record. It was `string`, which made it impossible to
   * clear a school from the profile form: the value had to be sent as something,
   * and the empty string was stored as a real blank rather than as "not set".
   */
  schoolName: string | null;
  subjects: string[];
  defaultGradeLevel: ClassLevel | null;
  gradingPolicyId: string | null;
}