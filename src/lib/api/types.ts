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
  /** Whether the printable sheet carries a student code block. */
  idFormatEnabled: boolean;
  /**
   * Digits and codes per digit. Both null when the block is off, and the
   * database refuses any other combination, so a consumer never has to decide
   * what a half-configured shape means.
   */
  idFormatGroups: number | null;
  idFormatCodes: number | null;
}

/**
 * The printable code block's shape, resolved.
 *
 * A separate type because the interesting values of `idFormatGroups` and
 * `idFormatCodes` are the ones that mean "not set", and every caller that draws
 * or reads a block has to handle those without repeating the same four-way
 * branch.
 */
export interface IdFormat {
  groups: number;
  perGroup: number;
  /** How many bubbles the block carries, which is what bounds the class size. */
  capacity: number;
}

/**
 * Reads the block shape off an assessment, or null when it has none.
 *
 * The bounds are repeated here on purpose. They are also check constraints in
 * the database, but the print route and the scan route must not trust a value
 * they are about to turn into either millimetres of paper or a set of bubbles to
 * look for.
 */
export function idFormatOf(assessment: Pick<AssessmentRecord, 'idFormatEnabled' | 'idFormatGroups' | 'idFormatCodes'>): IdFormat | null {
  if (!assessment.idFormatEnabled) return null;
  const groups = assessment.idFormatGroups;
  const perGroup = assessment.idFormatCodes;
  if (groups === null || perGroup === null) return null;
  if (groups < 1 || groups > 3) return null;
  if (perGroup < 2 || perGroup > 8) return null;
  if (groups * perGroup > 24) return null;
  return { groups, perGroup, capacity: groups * perGroup };
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
  /** `manual` when a teacher typed it, `scan` when it came off a sheet,
   *  `online` when the student sat it themselves. */
  source: GradeSource;
  /** The marks exactly as read, plus what the teacher corrected. */
  scanDetail: ScannedAnswer[] | null;
}

/**
 * One question as a student answered it, on screen.
 *
 * Shaped like `ScannedAnswer` on purpose: both describe "what the student put
 * against question N", and both are re-scored by the same `scoreAnswers` call on
 * the server. A second shape for the same idea is a second thing to keep correct.
 */
export interface OnlineAnswer {
  questionIndex: number;
  optionKeys: string[];
}

export const attemptStatusSchema = z.enum(['in_progress', 'submitted']);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

export interface AttemptRecord {
  id: string;
  assessmentId: string;
  studentId: string;
  ownerId: string;
  status: AttemptStatus;
  responses: OnlineAnswer[];
  /** Null until the server has scored it. A student never writes this. */
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  submittedAt: string | null;
}

/**
 * A quiz as the student's side sees it: enough to render the questions, and
 * deliberately not enough to score them.
 *
 * WHY THE KEY IS NOT HERE. This object reaches a student's device. It is built
 * from the stored questions with `answerKey` and `points` removed, and the
 * renderer has no field to print a mark from. The same reasoning that keeps the
 * key off the scan screen: a page that leaks the answer cannot be used to mark a
 * class, and a quiz that leaks it cannot be sat twice.
 */
export interface StudentQuizQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: QuestionOption[];
}

export interface StudentQuiz {
  attemptId: string;
  assessmentId: string;
  title: string;
  className: string;
  dueOn: string | null;
  questions: StudentQuizQuestion[];
  responses: OnlineAnswer[];
  status: AttemptStatus;
  submittedAt: string | null;
  /** How many attempts the student has already submitted, including this one. */
  attemptNumber: number;
}

/** One row on the student's quiz list. */
export interface StudentQuizSummary {
  assessmentId: string;
  title: string;
  className: string;
  dueOn: string | null;
  questionCount: number;
  /** The attempt to resume or sit, created on demand. Null until it exists. */
  attemptId: string | null;
  status: AttemptStatus | null;
  submittedAt: string | null;
  attemptNumber: number;
}

/**
 * A teacher's view of one attempt.
 *
 * Carries the score but not the responses on purpose: the mark belongs to the
 * gradebook, and re-reading what the student chose from the attempt list is not
 * a question this screen is asking.
 */
export interface AttemptSummary {
  id: string;
  studentId: string;
  studentName: string;
  status: AttemptStatus;
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  submittedAt: string | null;
}

export const gradeSourceSchema = z.enum(['manual', 'scan', 'online']);
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
 * vocabularies: this file and the SQL said `solo | teacher | school`, while the
 * pricing page sold `starter | teacher-pro | school`. Only `school` appeared in
 * both, so two of the three plan ids on the pricing page could not have been
 * written to the column they referred to. The 2026-01-01 migration moves
 * `solo` to `starter` and `teacher` to `teacher-pro` before recreating the
 * constraint, so the column and the page finally speak the same three names.
 */
export const ORG_PLANS = ['starter', 'teacher-pro', 'school'] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const ORG_PLAN_LABELS: Record<OrgPlan, string> = {
  starter: 'Starter',
  'teacher-pro': 'Teacher Pro',
  school: 'School',
};

export type MembershipStatus = 'active' | 'suspended';

export const ORG_SECTORS = [
  'k12',
  'primary',
  'secondary',
  'higher_ed',
  'training',
  'nonprofit',
  'other',
] as const;
export type OrgSector = (typeof ORG_SECTORS)[number];

export const ORG_SECTOR_LABELS: Record<OrgSector, string> = {
  k12: 'K to 12 school',
  primary: 'Primary school',
  secondary: 'Secondary school',
  higher_ed: 'University or college',
  training: 'Training provider',
  nonprofit: 'Nonprofit',
  other: 'Something else',
};

/**
 * How far an institutional profile has been checked.
 *
 * `verified` is not something the product grants. There is no code path anywhere
 * that writes it, and that is deliberate: a status the application can set for
 * itself is a status nobody can rely on. It exists so that a review process run
 * outside the database has somewhere to record its decision.
 */
export const ORG_VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUSES)[number];

export const ORG_VERIFICATION_LABELS: Record<OrgVerificationStatus, string> = {
  unverified: 'Not checked yet',
  pending: 'In review',
  verified: 'Checked',
  rejected: 'Not accepted',
};

/**
 * What a school is asked to tell us about itself.
 *
 * Every field except `name` is nullable because every one of them has a truthful
 * answer of "we would rather not say", and a required field that is filled with a
 * placeholder is worse than an absent one. A solo teacher has no principal and no
 * enrolment figure, and the form has to be finishable by one.
 */
export interface OrgProfile {
  /** ISO 3166-1 alpha-2, uppercase. Null when not supplied. */
  countryCode: string | null;
  sector: OrgSector | null;
  /** Lowest grade taught, where 0 is kindergarten and negatives are pre-K. */
  gradeMin: number | null;
  gradeMax: number | null;
  /** Pupils or students at the institution, as an estimate. */
  enrolment: number | null;
  /** IANA zone such as `Asia/Manila`. Null when not supplied. */
  timezone: string | null;
  contactName: string | null;
  contactRole: string | null;
  verificationStatus: OrgVerificationStatus;
  verifiedAt: string | null;
}

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  seatLimit: number;
  billingEmail: string | null;
  createdAt: string;
  profile: OrgProfile;
}

/** What an admin may change about the institution. */
export type OrgProfileInput = Omit<OrgProfile, 'verificationStatus' | 'verifiedAt'>;

export interface OrgInput {
  name: string;
  plan: OrgPlan;
  seatLimit: number;
  billingEmail: string | null;
  /** Merged into the stored profile, so an admin can fill it in later. */
  profile?: Partial<OrgProfileInput>;
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
 * One invitation to join an organisation.
 *
 * The `code` IS the credential. There is no second factor and no emailed token
 * beyond the code itself, so it is short, single use, and expires. `acceptedAt`
 * is what makes it single use and `expiresAt` is what stops an abandoned code
 * from being a permanent way into a school.
 *
 * The address is recorded so an administrator can see who was invited and to
 * whom, not so it can be enforced: an invitation may be passed on, and the seat
 * limit, not the address, is the control that decides how many people get in.
 */
export interface InviteRecord {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
}

/** What an administrator may choose when issuing an invitation. */
export interface InviteInput {
  email: string;
  role: Role;
}

/** What redeeming an invitation resolved to. */
export interface InviteRedemption {
  orgId: string;
  orgName: string;
}

export type InviteStatus = 'open' | 'accepted' | 'expired';

/**
 * How long an issued code stays usable.
 *
 * One number, stated here rather than in the copy, because the database column
 * defaults to the same fourteen days and a page that promised a different
 * window from the one the row carries would be lying in a way nobody could see.
 */
export const INVITE_TTL_DAYS = 14;

/**
 * An invitation's status, resolved from the two columns that decide it.
 *
 * A derived value rather than a stored one, for the same reason the console
 * never invents a verification status: the row is the truth, and a status field
 * beside it is a second thing to keep in step. Accepted beats expired because a
 * code used before it lapsed was used.
 */
export function inviteStatus(
  invite: Pick<InviteRecord, 'acceptedAt' | 'expiresAt'>,
  now: Date = new Date(),
): InviteStatus {
  if (invite.acceptedAt) return 'accepted';
  const expiry = new Date(invite.expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) return 'expired';
  return 'open';
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

/**
 * What a slide actually contains.
 *
 * WHY ELEMENTS AND NOT THREE COLUMNS. `title` and `body` describe a slide as a
 * heading and some bullets, which is a slide a teacher can fill in but not
 * design: no font, no size, no alignment, no image, no position. Asking for
 * PowerPoint-like editing means storing the styling somewhere, and storing it
 * per slide means storing the shape of a slide somewhere.
 *
 * WHY A GRID AND NOT ABSOLUTE PIXELS. Every element names a column and a row
 * rather than an x and a y, so the same slide renders correctly on a phone in a
 * browser, on a laptop, and projected in a hall. Free positioning is the thing
 * that makes a slide unreadable on the one screen the teacher did not test it
 * on, and it is unrecoverable once a teacher has dragged something off the edge.
 *
 * WHY FORMATTING IS A CLOSED SET. Every value below is enumerated, which means a
 * slide cannot carry a colour that is not a token, a font that has not been
 * loaded, or an alignment nobody implemented. An open field would be one
 * unvalidated string away from a slide with white text on white.
 */
export const SLIDE_ELEMENTS = ['heading', 'text', 'bullets', 'image'] as const;
export type SlideElementKind = (typeof SLIDE_ELEMENTS)[number];

export const SLIDE_COLUMNS = [1, 2, 3, 4, 5, 6] as const;
export type SlideColumn = (typeof SLIDE_COLUMNS)[number];

export const SLIDE_ROWS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type SlideRow = (typeof SLIDE_ROWS)[number];

/**
 * The only weights offered.
 *
 * A free weight field is how a slide ends up at 350 and looks like a mistake. A
 * teacher who wants a heavier slide uses the darkest ink, not a bigger number.
 */
export const SLIDE_WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;
export type SlideWeight = (typeof SLIDE_WEIGHTS)[number];

export const SLIDE_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type SlideSize = (typeof SLIDE_SIZES)[number];

export const SLIDE_FONTS = ['geist', 'geist-mono'] as const;
export type SlideFont = (typeof SLIDE_FONTS)[number];

export const SLIDE_FONTS_LABELS: Record<SlideFont, string> = {
  geist: 'Geist',
  'geist-mono': 'Geist Mono',
};

export const SLIDE_INKS = ['ink', 'muted', 'accent', 'on-accent'] as const;
export type SlideInk = (typeof SLIDE_INKS)[number];

export const SLIDE_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type SlideAlignment = (typeof SLIDE_ALIGNMENTS)[number];

/*
 * The human labels for the closed sets.
 *
 * They live here rather than in the inspector because a control that renders the
 * raw value is a control showing `semibold`, and a second control elsewhere that
 * shows `Semibold` for the same thing is two vocabularies. One list, like the
 * rest of this file.
 */
export const SLIDE_SIZE_LABELS: Record<SlideSize, string> = {
  sm: 'Small',
  md: 'Body',
  lg: 'Large',
  xl: 'Display',
};

export const SLIDE_WEIGHT_LABELS: Record<SlideWeight, string> = {
  normal: 'Regular',
  medium: 'Medium',
  semibold: 'Semibold',
  bold: 'Bold',
};

export const SLIDE_ALIGNMENT_LABELS: Record<SlideAlignment, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

export const SLIDE_INK_LABELS: Record<SlideInk, string> = {
  ink: 'Ink',
  muted: 'Muted',
  accent: 'Accent',
  'on-accent': 'On accent',
};

/** The colour treatments a slide can be built from, all of them on-brand. */
export const SLIDE_THEMES = ['viridian', 'ink', 'paper', 'dusk'] as const;
export type SlideTheme = (typeof SLIDE_THEMES)[number];

export const SLIDE_THEME_LABELS: Record<SlideTheme, string> = {
  viridian: 'Viridian',
  ink: 'Ink',
  paper: 'Paper',
  dusk: 'Dusk',
};

/** Typography shared by every text element, whatever its role. */
export interface SlideTextStyle {
  size: SlideSize;
  weight: SlideWeight;
  font: SlideFont;
  ink: SlideInk;
  align: SlideAlignment;
}

export const DEFAULT_TEXT_STYLE: SlideTextStyle = {
  size: 'md',
  weight: 'normal',
  font: 'geist',
  ink: 'ink',
  align: 'left',
};

interface SlideElementBase {
  id: string;
  /** 1-based column on a six-column grid. */
  col: SlideColumn;
  /** How many grid columns the element spans. */
  span: number;
  /** 1-based row band. Bands are thirds, so a heading sits at the top. */
  row: SlideRow;
  /** How many row bands the element spans. */
  tall: number;
}

export interface SlideTextElement extends SlideElementBase {
  kind: 'heading' | 'text' | 'bullets';
  /** Bullets hold one item per line. Heading and text hold a single string. */
  content: string;
  style: SlideTextStyle;
}

export interface SlideImageElement extends SlideElementBase {
  kind: 'image';
  /** A `deck_assets` id. Never a URL a teacher pasted in. */
  assetId: string;
  /** How the image fills its box when it does not match it. */
  fit: 'cover' | 'contain';
  alt: string;
}

export type SlideElement = SlideTextElement | SlideImageElement;

export interface SlideRecord {
  id: string;
  deckId: string;
  ownerId: string;
  position: number;
  layout: SlideLayout;
  theme: SlideTheme;
  /** Null on a slide written before elements existed: render the legacy layout. */
  elements: SlideElement[] | null;
  title: string;
  body: string;
  notes: string;
}

/**
 * Fills in anything a stored element is missing, and drops anything malformed.
 *
 * The alternative is trusting a column. `elements` is jsonb, so anything can
 * be in it, and a renderer that meets a half-written element and reads
 * `style.size` off undefined throws during render and takes the editor with it.
 * Normalising at the boundary means the renderer only ever sees the closed set.
 */
export function normaliseElements(value: unknown): SlideElement[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const out: SlideElement[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const el = raw as Record<string, unknown>;
    const kind = SLIDE_ELEMENTS.includes(el.kind as SlideElementKind)
      ? (el.kind as SlideElementKind)
      : null;
    if (!kind) continue;

    const base = {
      id: typeof el.id === 'string' && el.id ? el.id : `el_${out.length}`,
      col: (SLIDE_COLUMNS.includes(el.col as SlideColumn) ? el.col : 1) as SlideColumn,
      span: clampSpan(el.span),
      row: (SLIDE_ROWS.includes(el.row as SlideRow) ? el.row : 1) as SlideRow,
      tall: clampTall(el.tall),
    };

    if (kind === 'image') {
      out.push({
        ...base,
        kind,
        assetId: typeof el.assetId === 'string' ? el.assetId : '',
        fit: el.fit === 'contain' ? 'contain' : 'cover',
        alt: typeof el.alt === 'string' ? el.alt : '',
      });
      continue;
    }

    const style = (typeof el.style === 'object' && el.style !== null ? el.style : {}) as Record<
      string,
      unknown
    >;
    out.push({
      ...base,
      kind,
      content: typeof el.content === 'string' ? el.content : '',
      style: {
        size: SLIDE_SIZES.includes(style.size as SlideSize) ? (style.size as SlideSize) : 'md',
        weight: SLIDE_WEIGHTS.includes(style.weight as SlideWeight)
          ? (style.weight as SlideWeight)
          : 'normal',
        font: SLIDE_FONTS.includes(style.font as SlideFont) ? (style.font as SlideFont) : 'geist',
        ink: SLIDE_INKS.includes(style.ink as SlideInk) ? (style.ink as SlideInk) : 'ink',
        align: SLIDE_ALIGNMENTS.includes(style.align as SlideAlignment)
          ? (style.align as SlideAlignment)
          : 'left',
      },
    });
  }
  return out;
}

/** An element may not run off the right of the grid. */
function clampSpan(value: unknown): number {
  const span = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 6;
  return Math.min(6, Math.max(1, span));
}

/** An element may not run off the bottom of the grid. */
function clampTall(value: unknown): number {
  const tall = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(4, Math.max(1, tall));
}

/** The text a screen reader and a thumbnail get, whatever the slide contains. */
export function slidePlainText(elements: SlideElement[] | null, fallbackTitle: string): string {
  if (!elements || elements.length === 0) return fallbackTitle;
  return elements
    .filter((el): el is SlideTextElement => el.kind !== 'image')
    .map((el) => el.content.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

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
  /**
   * The design the slide is drawn in. Defaults at the storage layer rather than
   * being required here, so a caller that only knows the legacy four fields
   * still produces a valid slide.
   */
  theme?: SlideTheme;
  /** Null renders the legacy layout; an empty array renders a blank slide. */
  elements?: SlideElement[] | null;
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