import 'server-only';

import { randomUUID } from 'node:crypto';
import { cache } from 'react';

import { assertRealDataMode, isSupabaseMode } from '@/lib/data-mode';
import {
  BUILT_IN_POLICIES,
  validatePolicy,
  type GradeBand,
  type GradingPolicy,
} from '@/lib/grading/policy';
import { createSupabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server';
import { newInviteCode, inviteExpiry } from '@/lib/security/invite-code';
import { scoreAnswers } from '@/lib/omr/omr';
import { DataError, mapSupabaseError } from './errors';
import type {
  AssessmentRecord,
  AssessmentType,
  AttendanceMark,
  AttendanceStatus,
  AttendanceWrite,
  AttemptRecord,
  AttemptSummary,
  BehaviourLogRecord,
  CalendarEventInput,
  CalendarEventRecord,
  ClassLevel,
  ClassRecord,
  DeckInput,
  DeckRecord,
  GradeRecord,
  GradeSource,
  GradingPolicyInput,
  GradingPolicyRecord,
  HeatCell,
  HistoryEventType,
  HistoryRecord,
  IdFormat,
  InviteInput,
  InviteRecord,
  InviteRedemption,
  LessonPlanRecord,
  MemberRecord,
  MembershipStatus,
  NotificationRecord,
  OnlineAnswer,
  OrgInput,
  OrgPlan,
  OrgRecord,
  OrgSector,
  OrgVerificationStatus,
  ProfileInput,
  ProfileRecord,
  ScheduleEntryInput,
  ScheduleEntryRecord,
  TermInput,
  TermRecord,
  QuestionRecord,
  Role,
  ScannedAnswer,
  Severity,
  SlideElement,
  SlideInput,
  SlideLayout,
  SlideRecord,
  SlideTheme,
  Stat,
  StudentQuiz,
  StudentQuizQuestion,
  StudentQuizSummary,
  StudentRecord,
} from './types';

/*
 * Values, not types. These two lists are the allowlist `mapOrg` checks a row
 * against, so an unrecognised value reads as unknown rather than being coerced
 * to the nearest legal option. Importing them as types would compile and then
 * fail at runtime, which is the shape of bug that only shows up against a real
 * database.
 */
import { ORG_SECTORS, ORG_VERIFICATION_STATUSES, SLIDE_THEMES, normaliseElements } from './types';

/**
 * The five scales that ship with the product, as records rather than code
 * constants, so the seam hands every caller one list whether a scale is built in
 * or authored.
 */
function builtInPolicies(): GradingPolicyRecord[] {
  const createdAt = '1970-01-01T00:00:00.000Z';
  return BUILT_IN_POLICIES.map((policy: GradingPolicy) => ({
    id: policy.id,
    ownerId: 'built-in',
    name: policy.label,
    kind: policy.kind,
    bands: [...policy.bands],
    builtIn: true,
    createdAt,
  }));
}

/**
 * The single data boundary.
 *
 * No component and no route handler talks to Postgres directly. Every read and
 * write crosses this module, which means the demo fixtures and the real
 * database are interchangeable and a change of backend touches one file.
 *
 * Why this module was rewritten. It previously had zero importers while its own
 * docblock claimed every read crossed it. The two screens that showed real data
 * imported `@/lib/fixtures/workspace` directly, and the one write endpoint
 * validated a payload and then discarded it. Both bypasses are now gone.
 *
 * `classId` is honoured on every method. The old signatures named it and then
 * discarded it, so every class returned identical data.
 *
 * SCOPING. Every method takes the signed-in user's id and passes it to Supabase.
 * Reads go through the cookie-backed client, so PostgREST evaluates RLS with
 * `auth.uid()` set to that user as well. The explicit filter is belt and braces:
 * RLS is the boundary, and a forgotten filter should not be the thing that leaks.
 */

export type DeckAssetKind = 'image' | 'document';

/**
 * A file a teacher brought into a deck.
 *
 * Declared here rather than in `types.ts` because the adapter and the fixtures
 * both consume it and this file is the boundary both are written against.
 */
export interface DeckAssetRecord {
  id: string;
  deckId: string;
  ownerId: string;
  kind: DeckAssetKind;
  filename: string;
  mime: string;
  byteSize: number;
  /** Null for a document. The bytes of a document are never stored, only its text. */
  storagePath: string | null;
  extractedText: string | null;
  createdAt: string;
  /**
   * A short-lived signed URL for an image, or null for a document and for an
   * image whose object is gone.
   *
   * Never a URL assembled from the project address. The bucket is private, so a
   * hand-built URL fails on every load and shows the editor a broken image with
   * nothing in the console explaining it.
   */
  url: string | null;
}

export interface WorkspaceData {
  // Reads
  listClasses(userId: string): Promise<ClassRecord[]>;
  listStudents(userId: string, classId: string): Promise<StudentRecord[]>;
  listStats(userId: string, classId?: string): Promise<Stat[]>;
  getHeatmap(userId: string, classId: string): Promise<HeatCell[]>;

  /*
   * Batched reads.
   *
   * Optional on this interface and REQUIRED on `DataSource`, which is what
   * `data()` returns. An adapter that does not implement one still compiles, and
   * the seam supplies a per-item fallback so every caller gets the batched shape
   * without knowing which backend is behind it.
   */
  listStudentsForClasses?(userId: string, classIds: string[]): Promise<StudentRecord[]>;
  countSlidesByDeck?(userId: string, deckIds: string[]): Promise<Record<string, number>>;
  getAttendance(
    userId: string,
    classId: string,
    date: string,
  ): Promise<Record<string, AttendanceStatus>>;
  listAssessments(userId: string, classId: string): Promise<AssessmentRecord[]>;
  /**
   * One assessment, or null.
   *
   * Exists so a write can prove the row it is about to hang something off is
   * the caller's. RLS stops a teacher reading another teacher's questions, but
   * it does not stop them attaching questions of their own to a foreign
   * assessment: the new rows would carry their own `owner_id` and the foreign
   * teacher would simply never see them. That is silent data loss, not an
   * escape, so ownership is checked before the write rather than after.
   */
  getAssessment(userId: string, assessmentId: string): Promise<AssessmentRecord | null>;
  listQuestions(userId: string, assessmentId: string): Promise<QuestionRecord[]>;

  /*
   * Quizzes a student may sit, and the attempt lifecycle.
   *
   * Every read a student is given goes through a SQL function whose result
   * shape has no answer key in it. That is a deliberate constraint on this
   * interface: `StudentQuiz` has no field to score from, so a caller cannot
   * accidentally build one and ship it. The key is read server-side at submit
   * time and never crosses the wire in either direction.
   *
   * WHY THE TWO ADAPTERS TREAT `userId` DIFFERENTLY. The Supabase adapter
   * ignores it, because `auth.uid()` inside RLS and inside the SQL functions is
   * the only thing that should decide which student is asking, and a parameter
   * the caller controls cannot be that. The fixtures adapter uses it, because a
   * fixture session has no `auth.uid()` and the account-to-roster link
   * `students.account_id` is the same mapping the database makes. Both refuse an
   * assessment outside the caller's own class. Do not "fix" the ignored
   * parameter by filtering on it in the Supabase adapter: it would be a second,
   * weaker source of identity sitting next to the one that is enforced.
   */
  listStudentQuizzes(userId: string): Promise<StudentQuizSummary[]>;
  getStudentQuiz(userId: string, attemptId: string): Promise<StudentQuiz | null>;
  startQuizAttempt(userId: string, assessmentId: string): Promise<AttemptRecord>;
  saveQuizResponses(
    userId: string,
    attemptId: string,
    responses: OnlineAnswer[],
  ): Promise<AttemptRecord>;
  submitQuizAttempt(userId: string, attemptId: string): Promise<AttemptRecord>;
  /** Who has sat it, from the teacher's side. Never their answers. */
  listAttempts(userId: string, assessmentId: string): Promise<AttemptSummary[]>;
  listGrades(userId: string, classId: string): Promise<GradeRecord[]>;
  listLessonPlans(userId: string, classId: string): Promise<LessonPlanRecord[]>;
  listBehaviourLogs(userId: string, classId: string): Promise<BehaviourLogRecord[]>;
  getStudentHistory(userId: string, studentId: string): Promise<HistoryRecord[]>;

  // Writes
  markAttendance(userId: string, write: AttendanceWrite): Promise<void>;
  createClass(
    userId: string,
    input: { name: string; code: string; level: ClassLevel; meetsPerWeek: number },
  ): Promise<ClassRecord>;
  archiveClass(userId: string, classId: string): Promise<void>;
  createStudent(
    userId: string,
    input: Omit<StudentRecord, 'id' | 'ownerId' | 'archivedAt'>,
  ): Promise<StudentRecord>;
  archiveStudent(userId: string, studentId: string): Promise<void>;
  createAssessment(
    userId: string,
    input: Omit<
      AssessmentRecord,
      'id' | 'ownerId' | 'archivedAt' | 'idFormatEnabled' | 'idFormatGroups' | 'idFormatCodes'
    >,
  ): Promise<AssessmentRecord>;
  /**
   * Turns the printed code block on or off for one assessment.
   *
   * Separate from creation because a new assessment is never born with a block:
   * the block depends on how many students are in the class, and the class is
   * not settled at the moment an assessment is created. The shape is also
   * re-read by the scan route, so turning it on while a class is mid-quiz would
   * make previously printed sheets unreadable, which is the caller's problem to
   * decide about and not this method's to allow silently.
   */
  setAssessmentIdFormat(
    userId: string,
    assessmentId: string,
    shape: IdFormat | null,
  ): Promise<void>;
  upsertGrade(
    userId: string,
    input: {
      assessmentId: string;
      studentId: string;
      score: number | null;
      maxScore: number;
      feedback?: string | null;
      source?: GradeSource;
      scanDetail?: ScannedAnswer[] | null;
    },
  ): Promise<GradeRecord>;
  /**
   * Replace an assessment's questions in one call.
   *
   * Whole-set rather than create/update/delete one at a time because the builder
   * edits a list: it can reorder, insert and remove in a single save, and
   * expressing that as N calls makes every intermediate state observable and
   * every failure a half-built question set. `questionId` is only used to keep
   * the identity of an untouched row stable, so its `id` survives a save.
   */
  saveQuestions(
    userId: string,
    questions: (Omit<QuestionRecord, 'id' | 'ownerId'> & { id?: string })[],
  ): Promise<QuestionRecord[]>;
  saveLessonPlan(
    userId: string,
    // `id` present means update, absent means insert. Making it optional keeps
    // the caller from having to know which one it is doing.
    input: Omit<LessonPlanRecord, 'id' | 'ownerId'> & { id?: string },
  ): Promise<LessonPlanRecord>;
  addBehaviourLog(
    userId: string,
    input: {
      classId: string;
      studentId: string;
      entry: string;
      severity: Severity;
    },
  ): Promise<void>;
  appendHistory(
    userId: string,
    input: {
      studentId: string;
      eventType: HistoryEventType;
      payload?: Record<string, unknown>;
    },
  ): Promise<void>;

  /**
   * Every scale available to this account: the five built-ins plus whatever the
   * teacher has authored. Built-ins come from code, so they are always current
   * and need no row.
   */
  listPolicies(userId: string): Promise<GradingPolicyRecord[]>;

  /** Creates or replaces a custom scale. An empty `id` creates, otherwise updates. */
  savePolicy(userId: string, input: GradingPolicyInput & { id?: string }): Promise<GradingPolicyRecord>;

  /** Points a class at a scale. `null` returns the class to the percentage default. */
  setClassPolicy(
    userId: string,
    classId: string,
    policyId: string | null,
  ): Promise<void>;

  /** The signed-in teacher's own settings. */
  getProfile(userId: string): Promise<ProfileRecord | null>;
  updateProfile(userId: string, input: ProfileInput): Promise<ProfileRecord>;

  /*
   * Tenancy.
   *
   * `user:manage` and `org:manage` gate these in the actions that call them; the
   * seam resolves *which* organisation and *whose* members from the session, so
   * a caller cannot reach across tenants by passing an id.
   */
  getOrg(userId: string): Promise<OrgRecord | null>;
  updateOrg(userId: string, input: OrgInput): Promise<OrgRecord>;

  /** Everyone in the caller's organisation, including suspended members. */
  listMembers(userId: string): Promise<MemberRecord[]>;

  /** Changes what a member may do. Does not change their account's own role. */
  setMemberRole(userId: string, memberId: string, role: Role): Promise<void>;

  /** Suspends or restores access without removing the person from the org. */
  setMemberStatus(userId: string, memberId: string, status: MembershipStatus): Promise<void>;

  /**
   * Every invitation issued by the caller's organisation, newest first, spent
   * and lapsed ones included.
   *
   * Included because an administrator needs a used code to read as used. A list
   * of open codes only is a list that keeps offering the same invitation to the
   * twenty-sixth person at a twenty-five seat school.
   */
  listInvites(userId: string): Promise<InviteRecord[]>;

  /**
   * Mints one single-use code and returns it. The caller neither chooses the
   * code nor sees it before it is issued.
   *
   * Issuing does NOT spend a seat. A code may sit unused until it expires, so
   * counting at issue time would refuse people who never joined and would let a
   * pile of unused codes sit against a limit they are not using. The seat is
   * spent at redemption, where `redeem_org_invite` refuses a join that would
   * cross `seat_limit`.
   */
  createInvite(userId: string, input: InviteInput): Promise<InviteRecord>;

  /**
   * Redeems a code for the signed-in account and joins them to its organisation.
   *
   * Throws a `DataError` carrying the refusal the database raised, unedited. The
   * refusal is the control working, not a failure to report around: when
   * `seat_limit` is reached the sentence that comes back names the school, the
   * count and the way out, and paraphrasing it into "could not join" throws away
   * the only thing the person reading it can act on.
   */
  redeemInvite(userId: string, code: string): Promise<InviteRedemption>;

  /*
   * Slide decks.
   *
   * No import and no export. Converting to and from .pptx is deliberately out of
   * scope, so a deck is authored here and presented from here or printed to PDF
   * by the browser.
   */
  listDecks(userId: string): Promise<DeckRecord[]>;
  createDeck(userId: string, input: DeckInput): Promise<DeckRecord>;
  updateDeck(userId: string, deckId: string, input: DeckInput): Promise<DeckRecord>;
  archiveDeck(userId: string, deckId: string): Promise<void>;

  /** Slides of one deck, always in presentation order. */
  listSlides(userId: string, deckId: string): Promise<SlideRecord[]>;
  createSlide(userId: string, deckId: string, input: Partial<SlideInput>): Promise<SlideRecord>;
  updateSlide(userId: string, slideId: string, input: SlideInput): Promise<SlideRecord>;
  deleteSlide(userId: string, slideId: string): Promise<void>;

  /** One slide by its own id, for a write that patches a single element. */
  getSlide(userId: string, slideId: string): Promise<SlideRecord>;

  /**
   * Writes the element list and the background, and nothing else.
   *
   * Separate from `updateSlide` on purpose. The editor rewrites these two
   * columns on every keystroke in the style panel, and a method that took the
   * whole `SlideInput` would make that write carry the title, the body and the
   * notes as well, so two teachers editing different parts of one slide would
   * overwrite each other over fields neither of them touched.
   */
  updateSlideContent(
    userId: string,
    slideId: string,
    input: { elements: SlideElement[]; theme: SlideTheme },
  ): Promise<SlideRecord>;

  /**
   * Moves a slide and renumbers the deck in one call.
   *
   * Taking a from and a to rather than a delta is deliberate: the editor's
   * arrows know the target index, and a client-computed delta breaks the moment
   * two people reorder at once.
   */
  moveSlide(userId: string, slideId: string, toIndex: number): Promise<void>;

  /**
   * Reads this person's generation history for the current window.
   *
   * Returns the rows rather than a count, because the window is decided in the
   * application and a `count` from the database would have to be told what the
   * window is on every call. The meter is also used to explain what happened
   * after a refusal, which needs the timestamps rather than a number.
   *
   * Scoped to `user_id` twice over: by the query, and by the RLS select policy,
   * so a person cannot read anybody else's usage by passing another id.
   */
  listAiUsage(userId: string): Promise<{ created_at: string }[]>;

  /**
   * Records one generation against the person who made it.
   *
   * THE ROW IS WRITTEN BY THE SERVER ONLY. There is no insert policy on
   * `ai_generations`, deliberately: a quota whose rows a client can manufacture
   * is a quota a client can use to lock a user out of their own feature. The
   * service client writes it after the provider has been called, because a
   * refund on failure can be spent by causing failures.
   */
  recordAiGeneration(
    userId: string,
    input: {
      model: string;
      purpose: 'deck' | 'schedule';
      promptTokens: number;
      outputTokens: number;
    },
  ): Promise<void>;

  /**
   * Files brought into a deck.
   *
   * A document is stored as its extracted text and nothing else. A PDF of a
   * chapter is not kept as a file: what the teacher wants is the words, on
   * slides they can restyle, and keeping the original too would mean storing a
   * megabyte per import that nothing ever reads back.
   */
  createDeckAsset(
    userId: string,
    deckId: string,
    input: {
      kind: DeckAssetKind;
      filename: string;
      mime: string;
      byteSize: number;
      /** Images only. Ignored for a document, whose bytes are never stored. */
      bytes?: ArrayBuffer;
      extractedText?: string | null;
    },
  ): Promise<DeckAssetRecord>;
  listDeckAssets(userId: string, deckId: string): Promise<DeckAssetRecord[]>;
  /** Removes the row and the stored image. The row, so the object is only removed for a proven owner. */
  deleteDeckAsset(userId: string, assetId: string): Promise<void>;

  /*
   * A student's week, and the dated things on top of it.
   *
   * WHY SCHEDULE READS TAKE A STUDENT RATHER THAN A CLASS. `listClasses` is
   * scoped to `owner_id`, and a student's `owner_id` is their teacher's, so a
   * student calling it gets an empty array. These take the roster row directly,
   * which is the thing a student can actually be resolved to.
   */
  listSchedule(userId: string, studentId: string): Promise<ScheduleEntryRecord[]>;
  /** Writes one row, or replaces it when the input carries an id. */
  saveScheduleEntry(userId: string, input: ScheduleEntryInput): Promise<ScheduleEntryRecord>;
  /** Replaces a whole week in one call, which is what confirming a photo does. */
  replaceSchedule(userId: string, studentId: string, entries: ScheduleEntryInput[]): Promise<ScheduleEntryRecord[]>;
  deleteScheduleEntry(userId: string, entryId: string): Promise<void>;

  listTerms(userId: string): Promise<TermRecord[]>;
  saveTerm(userId: string, input: TermInput): Promise<TermRecord>;
  deleteTerm(userId: string, termId: string): Promise<void>;

  /**
   * Dated things, for one student or for the caller themselves.
   *
   * `studentId` of null means the caller's own events, which is where a personal
   * deadline lives; naming a roster row is how a teacher writes a deadline for a
   * student and how that student then sees it.
   */
  listCalendarEvents(userId: string, studentId: string | null, from: string, to: string): Promise<CalendarEventRecord[]>;
  saveCalendarEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventRecord>;
  deleteCalendarEvent(userId: string, eventId: string): Promise<void>;

  listNotifications(userId: string): Promise<NotificationRecord[]>;
  markNotificationRead(userId: string, notificationId: string): Promise<void>;
}

/**
 * What `data()` actually hands back: the interface plus the two batched reads,
 * guaranteed present whichever adapter was selected.
 */
export type DataSource = WorkspaceData &
  Required<Pick<WorkspaceData, 'listStudentsForClasses' | 'countSlidesByDeck'>>;

type Row = Record<string, unknown>;

/**
 * Column lists live here so a select and its mapper cannot drift apart. The
 * profile select was repeated inline in three places and had already fallen one
 * column behind the record it feeds.
 */
const PROFILE_COLUMNS =
  'id, email, full_name, role, school_name, subjects, default_grade_level, grading_policy_id, org_id';

const ORG_COLUMNS =
  'id, name, slug, plan, seat_limit, billing_email, created_at, ' +
  // The institutional profile. Listed here rather than with a `select('*')`
  // because a select star is what let this list fall a column behind the record
  // it feeds in the first place.
  'country_code, sector, grade_min, grade_max, enrolment, timezone, ' +
  'contact_name, contact_role, verification_status, verified_at';

const INVITE_COLUMNS =
  'id, org_id, email, role, code, created_by, created_at, expires_at, accepted_at, accepted_by';

/**
 * PostgREST's unique violation, named locally because `errors.ts` keeps its
 * codes private. Only the one caller that retries a collision needs it, and the
 * retry is the entire reason: a duplicate code is a new code, not an error an
 * administrator caused.
 */
const UNIQUE_VIOLATION = '23505';

/**
 * The bucket `deck_assets` rows point into. Named in the migration too, so a
 * fresh database has it before the first upload rather than after the first
 * failure.
 */
const DECK_ASSET_BUCKET = 'deck-assets';

/**
 * How long a signed URL lasts.
 *
 * Long enough to sit open on an editing page for the length of a lesson
 * planning session, short enough that a URL pasted into a chat is dead by the
 * time it is read.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Reduces a teacher's filename to something safe to put in an object path.
 *
 * WHY IT IS NOT ENCODED. Anything is legal inside a path segment, so encoding
 * would work, but an object key nobody can predict is also one nobody can
 * recognise in a storage console while debugging a failed upload. Stripping to
 * a conservative alphabet keeps the key legible and the bucket free of keys
 * that only exist because a macOS download added ` (1)` four times.
 */
function safeFileName(filename: string): string {
  const cleaned = (filename ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'file';
}

function iso(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString();
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// ---------------------------------------------------------------------------
// Supabase adapter
// ---------------------------------------------------------------------------

const supabaseAdapter: WorkspaceData = {
  async listClasses(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('name');
    throwIf(error);
    return (data ?? []).map(mapClass);
  },

  async listStudents(userId, classId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('owner_id', userId)
      .eq('class_id', classId)
      .is('archived_at', null)
      .order('full_name');
    throwIf(error);
    return (data ?? []).map(mapStudent);
  },

  /*
   * One read for every class on the page rather than one per class.
   *
   * The roster panel renders real rows for the class the teacher selects on the
   * client, so these are student records and not counts; the win is the round
   * trips, five queries becoming one. Ordering is applied after the fetch because
   * each class's roster has to come back alphabetically on its own.
   */
  async listStudentsForClasses(userId, classIds) {
    if (classIds.length === 0) return [];

    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('owner_id', userId)
      .in('class_id', classIds)
      .is('archived_at', null);
    throwIf(error);

    return ((data ?? []) as Row[]).map(mapStudent);
  },

  /*
   * Slide totals for every deck, in one read.
   *
   * Only `deck_id` comes back. The list screen shows a number, so transferring
   * every slide's title, body, and notes to count them was pure waste.
   */
  async countSlidesByDeck(userId, deckIds) {
    const counts: Record<string, number> = {};
    for (const deckId of deckIds) counts[deckId] = 0;
    if (deckIds.length === 0) return counts;

    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('slides')
      .select('deck_id')
      .eq('owner_id', userId)
      .in('deck_id', deckIds);
    throwIf(error);

    for (const row of (data ?? []) as Row[]) {
      const deckId = str(row.deck_id);
      counts[deckId] = (counts[deckId] ?? 0) + 1;
    }
    return counts;
  },

  async listStats(userId, _classId) {
    const supabase = await requireClient();
    const [students, classes, grades] = await Promise.all([
      supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .is('archived_at', null),
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .is('archived_at', null),
      supabase.from('grades').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
    ]);

    return [
      { label: 'Students', value: String(students.count ?? 0), delta: 0 },
      { label: 'Classes', value: String(classes.count ?? 0), delta: 0 },
      { label: 'Marks entered', value: String(grades.count ?? 0), delta: 0 },
    ];
  },

  async getHeatmap(userId, classId) {
    const supabase = await requireClient();
    // Derived, not stored. The threshold rule lives in one place so the heatmap
    // and the push alert cannot disagree about who is at risk.
    //
    // WHY THE GRADES QUERY IS JOINED AND NOT MERELY OWNER-FILTERED. It used to
    // read every mark the teacher had ever entered, across every class, to draw
    // one class's grid. The join is the same `assessments!inner(class_id)` idiom
    // `listGrades` already uses: `grades` has no `class_id` of its own, the class
    // is reached through the assessment. A teacher with five classes was
    // transferring several thousand rows per overview load to compute thirty
    // cells, and the extra rows were only ever discarded.
    const [{ data: students }, { data: grades }] = await Promise.all([
      supabase
        .from('students')
        .select('id')
        .eq('owner_id', userId)
        .eq('class_id', classId)
        .is('archived_at', null),
      supabase
        .from('grades')
        .select('student_id, score, max_score, assessments!inner(class_id)')
        .eq('owner_id', userId)
        .eq('assessments.class_id', classId),
    ]);

    const byStudent = new Map<string, number[]>();
    for (const row of (grades ?? []) as Row[]) {
      const score = row.score as number | null;
      const max = num(row.max_score, 100);
      if (score === null || max <= 0) continue;
      const list = byStudent.get(str(row.student_id)) ?? [];
      list.push((score / max) * 100);
      byStudent.set(str(row.student_id), list);
    }

    return ((students ?? []) as Row[]).map((row) => {
      const scores = byStudent.get(str(row.id)) ?? [];
      const average = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0;
      const delta = scores.length >= 2 ? average - scores[0] : 0;
      return {
        studentId: str(row.id),
        level: average >= 70 ? ('on-track' as const) : average >= 55 ? ('watch' as const) : ('at-risk' as const),
        delta: Number(delta.toFixed(1)),
      };
    });
  },

  async getAttendance(userId, classId, date) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('owner_id', userId)
      .eq('class_id', classId)
      .eq('date', date);
    throwIf(error);

    const result: Record<string, AttendanceStatus> = {};
    for (const row of (data ?? []) as Row[]) {
      const status = row.status as AttendanceStatus | undefined;
      if (status) result[str(row.student_id)] = status;
    }
    return result;
  },

  async listAssessments(userId, classId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('owner_id', userId)
      .eq('class_id', classId)
      .is('archived_at', null)
      .order('due_on', { ascending: true });
    throwIf(error);
    return (data ?? []).map(mapAssessment);
  },

  async getAssessment(userId, assessmentId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('owner_id', userId)
      .eq('id', assessmentId)
      .maybeSingle();
    throwIf(error);
    return data ? mapAssessment(data as Row) : null;
  },

  async listQuestions(userId, assessmentId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('owner_id', userId)
      .eq('assessment_id', assessmentId)
      .order('position', { ascending: true });
    throwIf(error);
    return (data ?? []).map(mapQuestion);
  },

  /*
   * The student half of the quiz.
   *
   * `userId` is deliberately unused below. It is the caller's account, not their
   * student record, and nothing here should trust a mapping between the two that
   * the application supplied: `auth.uid()` inside the SQL functions and inside
   * RLS is what decides which student is asking. Passing an id in and filtering
   * on it would be the same mistake as trusting a body-supplied owner.
   */
  async listStudentQuizzes(userId) {
    void userId;
    const supabase = await requireClient();

    const { data, error } = await supabase.rpc('student_quizzes');
    throwIf(error);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return [];

    const studentId = str(rows[0]!.student_id);
    const { data: attemptRows, error: attemptError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    throwIf(attemptError);

    const byAssessment = new Map<string, Row[]>();
    for (const row of (attemptRows ?? []) as Row[]) {
      const list = byAssessment.get(str(row.assessment_id)) ?? [];
      list.push(row);
      byAssessment.set(str(row.assessment_id), list);
    }

    return rows.map((row): StudentQuizSummary => {
      const attempts = byAssessment.get(str(row.assessment_id)) ?? [];
      const open = attempts.find((attempt) => str(attempt.status) === 'in_progress') ?? null;
      const latest = attempts[0] ?? null;

      return {
        assessmentId: str(row.assessment_id),
        title: str(row.title),
        className: str(row.class_name),
        dueOn: (row.due_on as string | null) ?? null,
        questionCount: num(row.question_count, 0),
        attemptId: open ? str(open.id) : null,
        status: latest ? (str(latest.status) === 'submitted' ? 'submitted' : 'in_progress') : null,
        submittedAt: (latest?.submitted_at as string | null) ?? null,
        attemptNumber: attempts.filter((attempt) => str(attempt.status) === 'submitted').length,
      };
    });
  },

  async getStudentQuiz(userId, attemptId) {
    void userId;
    const supabase = await requireClient();

    // RLS decides whether this attempt is theirs; a forged id reads as no row.
    const { data: attempt, error } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();
    throwIf(error);
    if (!attempt) return null;
    const row = attempt as Row;

    const assessmentId = str(row.assessment_id);

    // Two calls, both SECURITY DEFINER, neither able to return a key.
    const [{ data: questionRows, error: questionError }, { data: metaRows, error: metaError }] =
      await Promise.all([
        supabase.rpc('student_quiz_questions', { target_assessment: assessmentId }),
        supabase.rpc('student_quizzes'),
      ]);
    throwIf(questionError);
    throwIf(metaError);

    const meta = ((metaRows ?? []) as Row[]).find((m) => str(m.assessment_id) === assessmentId);

    const { data: priorRows, error: priorError } = await supabase
      .from('quiz_attempts')
      .select('id,status')
      .eq('assessment_id', assessmentId)
      .eq('student_id', str(row.student_id))
      .neq('id', attemptId);
    throwIf(priorError);

    const submittedBefore = ((priorRows ?? []) as Row[]).filter((p) => str(p.status) === 'submitted')
      .length;
    const submitted = str(row.status) === 'submitted';

    return {
      attemptId,
      assessmentId,
      title: meta ? str(meta.title) : '',
      className: meta ? str(meta.class_name) : '',
      dueOn: (meta?.due_on as string | null) ?? null,
      questions: ((questionRows ?? []) as Row[]).map(mapStudentQuestion),
      responses: mapResponses(row.responses),
      status: submitted ? 'submitted' : 'in_progress',
      submittedAt: (row.submitted_at as string | null) ?? null,
      attemptNumber: submittedBefore + (submitted ? 1 : 0),
    } satisfies StudentQuiz;
  },

  async startQuizAttempt(userId, assessmentId) {
    void userId;
    const supabase = await requireClient();
    const { data, error } = await supabase.rpc('start_quiz_attempt', {
      target_assessment: assessmentId,
    });
    if (error && error.message.includes('not one of yours')) {
      throw new DataError('FORBIDDEN', 'That quiz is not one of yours.');
    }
    throwIf(error);

    const attemptId = str(data);
    const { data: row, error: readError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();
    throwIf(readError);
    if (!row) throw new DataError('NOT_FOUND', 'That attempt could not be started.');
    return mapAttempt(row as Row);
  },

  async saveQuizResponses(userId, attemptId, responses) {
    void userId;
    const supabase = await requireClient();
    // Only `responses` is granted to the authenticated role, so this statement
    // cannot become a way to write a score even if the caller forges the id.
    const { data, error } = await supabase
      .from('quiz_attempts')
      .update({ responses })
      .eq('id', attemptId)
      .eq('status', 'in_progress')
      .select()
      .maybeSingle();
    throwIf(error);
    if (!data) {
      throw new DataError('CONFLICT', 'That attempt is no longer open for answers.');
    }
    return mapAttempt(data as Row);
  },

  async submitQuizAttempt(userId, attemptId) {
    void userId;
    const supabase = await requireClient();

    /*
     * WHY THE OWNERSHIP PROOF COMES FIRST. Everything below this line runs with
     * the service role, which ignores RLS. The read above is the only thing that
     * establishes the attempt belongs to the caller, and it happens with the
     * student's own privileges, so a forged id arrives here as "no row" rather
     * than as somebody else's submission. Elevating first and checking later
     * would make the check meaningless.
     */
    const { data: owned, error: ownedError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();
    throwIf(ownedError);
    if (!owned) throw new DataError('NOT_FOUND', 'That attempt does not exist.');

    const attempt = owned as Row;
    if (str(attempt.status) === 'submitted') {
      throw new DataError('CONFLICT', 'That attempt was already submitted.');
    }

    const admin = await createSupabaseAdmin();
    if (!admin) {
      throw new DataError(
        'FORBIDDEN',
        'Submitting a quiz needs the service role key, which this server is not configured with.',
      );
    }

    /*
     * The answer key is read here and nowhere else. It cannot be read with the
     * caller's session, because that is the whole point of keeping it off the
     * student, so this is the one place the key is ever loaded, and it is
     * loaded into a server frame that is never serialised to the browser.
     */
    const { data: questionRows, error: questionError } = await admin
      .from('questions')
      .select('*')
      .eq('assessment_id', str(attempt.assessment_id))
      .order('position', { ascending: true });
    throwIf(questionError);

    const questions = (questionRows ?? []).map(mapQuestion);
    const responses = mapResponses(attempt.responses);

    const result = scoreAnswers(
      questions.map((question) => ({
        id: question.id,
        kind: question.kind,
        answerKey: question.answerKey,
        points: question.points,
      })),
      responses.map((response) => ({
        questionIndex: response.questionIndex,
        optionKeys: response.optionKeys,
      })),
    );

    const submittedAt = new Date().toISOString();

    // The `status` predicate is a compare-and-set: a double submit, or a replay,
    // matches nothing and is reported as already submitted rather than
    // overwriting the first mark. PostgREST returns no error for an update that
    // matched zero rows, so the row is read back rather than assumed.
    const { data: submitted, error: submitError } = await admin
      .from('quiz_attempts')
      .update({
        status: 'submitted',
        score: result.score,
        max_score: result.maxScore,
        submitted_at: submittedAt,
      })
      .eq('id', attemptId)
      .eq('status', 'in_progress')
      .select()
      .maybeSingle();
    throwIf(submitError);
    if (!submitted) {
      throw new DataError('CONFLICT', 'That attempt was already submitted.');
    }

    /*
     * One mark per student per assessment, the same uniqueness `grades` already
     * holds. A re-sit replaces the mark rather than adding a second one, and it
     * is written with the owner being the quiz's teacher, so the gradebook they
     * already open can edit it by hand afterwards.
     */
    const { error: gradeError } = await admin.from('grades').upsert(
      {
        owner_id: str(attempt.owner_id),
        assessment_id: str(attempt.assessment_id),
        student_id: str(attempt.student_id),
        score: result.score,
        max_score: result.maxScore,
        source: 'online',
        scan_detail: null,
        graded_at: submittedAt,
      },
      { onConflict: 'assessment_id,student_id' },
    );
    throwIf(gradeError);

    return mapAttempt(submitted as Row);
  },

  async listAttempts(userId, assessmentId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('id,student_id,status,score,max_score,started_at,submitted_at,created_at')
      .eq('owner_id', userId)
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });
    throwIf(error);

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return [];

    // One row per student: the most recent attempt is the one that counts, and
    // an earlier one still being listed beside it invites the wrong mark being
    // read off the screen.
    const newest = new Map<string, Row>();
    for (const row of rows) {
      const key = str(row.student_id);
      if (!newest.has(key)) newest.set(key, row);
    }
    const kept = [...newest.values()];

    const { data: studentRows, error: studentError } = await supabase
      .from('students')
      .select('id,full_name')
      .eq('owner_id', userId)
      .in(
        'id',
        kept.map((row) => str(row.student_id)),
      );
    throwIf(studentError);

    const names = new Map(
      ((studentRows ?? []) as Row[]).map((row) => [str(row.id), str(row.full_name)]),
    );

    return kept.map(
      (row): AttemptSummary => ({
        id: str(row.id),
        studentId: str(row.student_id),
        studentName: names.get(str(row.student_id)) ?? 'Unknown student',
        status: str(row.status) === 'submitted' ? 'submitted' : 'in_progress',
        score: (row.score as number | null) ?? null,
        maxScore: (row.max_score as number | null) ?? null,
        startedAt: iso(row.started_at),
        submittedAt: (row.submitted_at as string | null) ?? null,
      }),
    );
  },

  async listGrades(userId, classId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('grades')
      .select('*, assessments!inner(class_id)')
      .eq('owner_id', userId)
      .eq('assessments.class_id', classId);
    throwIf(error);
    return (data ?? []).map(mapGrade);
  },

  async listLessonPlans(userId, classId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('lesson_plans')
      .select('*')
      .eq('owner_id', userId)
      .eq('class_id', classId)
      .order('week_of', { ascending: false });
    throwIf(error);
    return (data ?? []).map(mapPlan);
  },

  async listBehaviourLogs(userId, classId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('behaviour_logs')
      .select('*')
      .eq('owner_id', userId)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: str(r.id),
        classId: str(r.class_id),
        studentId: str(r.student_id),
        ownerId: str(r.owner_id),
        entry: str(r.entry),
        severity: str(r.severity, 'note') as Severity,
        createdAt: iso(r.created_at),
      };
    });
  },

  async getStudentHistory(userId, studentId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('student_history')
      .select('*')
      .eq('owner_id', userId)
      .eq('student_id', studentId)
      .order('occurred_at', { ascending: false })
      .limit(100);
    throwIf(error);
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: str(r.id),
        studentId: str(r.student_id),
        ownerId: str(r.owner_id),
        eventType: str(r.event_type, 'note') as HistoryEventType,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        occurredAt: iso(r.occurred_at),
      };
    });
  },

  async markAttendance(userId, write) {
    const supabase = await requireClient();
    if (write.marks.length === 0) return;

    /*
     * The class has to belong to the caller before a single row is written.
     *
     * `attendance` is scoped to the owner, so the rows would be readable only by
     * the writer and a forged `classId` would not leak anything back to them. It
     * would still be a write into somebody else's class, attributed to the wrong
     * teacher, and anything that ever aggregates by `class_id` would inherit it.
     * A membership check that only happens to be unnecessary is not the same as
     * one that happens to be enforced, so it is enforced here where every caller
     * passes through: the attendance screen and the offline replay endpoint.
     *
     * Deliberately not filtered on `archived_at`. Marking a register for a class
     * that is on its way out is ordinary, and refusing it would be a behaviour
     * change dressed up as a security fix.
     */
    const { data: owned, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('id', write.classId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (classError) throw mapSupabaseError(classError);
    if (!owned) throw new DataError('NOT_FOUND', 'That class is not yours.');

    // Upsert on the unique (class_id, student_id, date). This is what makes an
    // offline replay safe: replaying the same day twice updates the row rather
    // than duplicating it.
    const { error } = await supabase.from('attendance').upsert(
      write.marks.map((mark: AttendanceMark) => ({
        owner_id: userId,
        class_id: write.classId,
        student_id: mark.studentId,
        date: write.date,
        status: mark.status,
      })),
      { onConflict: 'class_id,student_id,date' },
    );
    throwIf(error);
  },

  async createClass(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('classes')
      .insert({
        owner_id: userId,
        name: input.name,
        code: input.code,
        level: input.level,
        meets_per_week: input.meetsPerWeek,
      })
      .select()
      .single();
    throwIf(error);
    return mapClass(data as Row);
  },

  async archiveClass(userId, classId) {
    const supabase = await requireClient();
    const { error } = await supabase
      .from('classes')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', classId)
      .eq('owner_id', userId);
    throwIf(error);
  },

  async createStudent(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('students')
      .insert({
        owner_id: userId,
        class_id: input.classId,
        full_name: input.fullName,
        initials: input.initials,
        guardian_name: input.guardianName,
        guardian_email: input.guardianEmail,
        guardian_phone: input.guardianPhone,
        // The link a teacher issues a login against. `null` is the normal case:
        // most students never sign in. Written explicitly rather than omitted so
        // the column is never left to a default that could differ.
        account_id: input.accountId,
      })
      .select()
      .single();
    throwIf(error);
    return mapStudent(data as Row);
  },

  async archiveStudent(userId, studentId) {
    const supabase = await requireClient();
    const { error } = await supabase
      .from('students')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', studentId)
      .eq('owner_id', userId);
    throwIf(error);
  },

  async createAssessment(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        owner_id: userId,
        class_id: input.classId,
        title: input.title,
        type: input.type,
        weight: input.weight,
        max_score: input.maxScore,
        due_on: input.dueOn,
        standard_codes: input.standardCodes,
      })
      .select()
      .single();
    throwIf(error);
    return mapAssessment(data as Row);
  },

  async setAssessmentIdFormat(userId, assessmentId, shape) {
    const supabase = await requireClient();
    /*
     * All three columns are written together, always. The database check rejects
     * a half-configured shape, so a partial write is a loud failure rather than
     * a row the print route has to guess about. Nulls, not zeroes, when off.
     */
    const patch = shape
      ? {
          id_format_enabled: true,
          id_format_groups: shape.groups,
          id_format_codes: shape.perGroup,
        }
      : { id_format_enabled: false, id_format_groups: null, id_format_codes: null };

    const { error } = await supabase
      .from('assessments')
      .update(patch)
      .eq('id', assessmentId)
      .eq('owner_id', userId);
    throwIf(error);
  },

  async upsertGrade(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('grades')
      .upsert(
        {
          owner_id: userId,
          assessment_id: input.assessmentId,
          student_id: input.studentId,
          score: input.score,
          max_score: input.maxScore,
          feedback: input.feedback ?? null,
          source: input.source ?? 'manual',
          // A manual edit of a previously scanned mark must not leave the old
          // sheet reading attached to the new number, so an untyped source
          // clears it rather than leaving it to look current.
          scan_detail: input.source === 'scan' ? (input.scanDetail ?? null) : null,
          graded_at: new Date().toISOString(),
        },
        { onConflict: 'assessment_id,student_id' },
      )
      .select()
      .single();
    throwIf(error);
    return mapGrade(data as Row);
  },

  async saveQuestions(userId, questions) {
    const supabase = await requireClient();
    if (questions.length === 0) return [];

    const assessmentId = questions[0]!.assessmentId;
    const rows = questions.map((question, index) => ({
      // Upserting on the primary key needs an id. One that was never saved gets
      // a fresh uuid so the insert path is the same code path as the update.
      id: question.id ?? crypto.randomUUID(),
      owner_id: userId,
      assessment_id: assessmentId,
      position: question.position ?? index,
      kind: question.kind,
      prompt: question.prompt,
      options: question.options,
      answer_key: question.answerKey,
      points: question.points,
    }));

    const { data, error } = await supabase
      .from('questions')
      .upsert(rows, { onConflict: 'id' })
      .select();
    throwIf(error);

    // Anything the caller dropped has to actually go, or a deleted question
    // keeps scoring students who never saw it.
    const kept = new Set(rows.map((row) => row.id));
    const { data: current } = await supabase
      .from('questions')
      .select('id')
      .eq('owner_id', userId)
      .eq('assessment_id', assessmentId);
    const stale = (current ?? []).map((row) => str(row.id)).filter((id) => !kept.has(id));
    if (stale.length > 0) {
      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('owner_id', userId)
        .eq('assessment_id', assessmentId)
        .in('id', stale);
      throwIf(deleteError);
    }

    return (data ?? []).map(mapQuestion).sort((a, b) => a.position - b.position);
  },

  async saveLessonPlan(userId, input) {
    const supabase = await requireClient();

    if (input.id) {
      const { data, error } = await supabase
        .from('lesson_plans')
        .update({
          title: input.title,
          week_of: input.weekOf,
          body: input.body,
          standard_codes: input.standardCodes,
        })
        .eq('id', input.id)
        .eq('owner_id', userId)
        .select()
        .single();
      throwIf(error);
      return mapPlan(data as Row);
    }

    const { data, error } = await supabase
      .from('lesson_plans')
      .insert({
        owner_id: userId,
        class_id: input.classId,
        title: input.title,
        week_of: input.weekOf,
        body: input.body,
        standard_codes: input.standardCodes,
      })
      .select()
      .single();
    throwIf(error);
    return mapPlan(data as Row);
  },

  async addBehaviourLog(userId, input) {
    const supabase = await requireClient();
    const { error } = await supabase.from('behaviour_logs').insert({
      owner_id: userId,
      class_id: input.classId,
      student_id: input.studentId,
      entry: input.entry,
      severity: input.severity,
    });
    throwIf(error);

    /*
     * A behaviour entry is also a line on the cumulative record. The history page
     * puts the entry form beside the timeline it feeds, so writing only
     * `behaviour_logs` left the note saved and invisible on the timeline it was
     * written from. Same invariant the fixture adapter carries.
     */
    const { error: historyError } = await supabase.from('student_history').insert({
      owner_id: userId,
      student_id: input.studentId,
      event_type: input.severity === 'note' ? 'note' : 'intervention',
      payload: { entry: input.entry, severity: input.severity },
    });
    throwIf(historyError);
  },

  async appendHistory(userId, input) {
    const supabase = await requireClient();
    const { error } = await supabase.from('student_history').insert({
      owner_id: userId,
      student_id: input.studentId,
      event_type: input.eventType,
      payload: input.payload ?? {},
    });
    throwIf(error);
  },

  async listPolicies(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('grading_policies')
      .select('id, owner_id, name, kind, bands, built_in, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });
    throwIf(error);

    const custom = (data ?? []).map((row) => mapPolicy(row as Row));
    return [...builtInPolicies(), ...custom];
  },

  async savePolicy(userId, input) {
    const supabase = await requireClient();

    // Validation lives in the policy engine, and it is the only place that knows
    // what makes a scale usable, so an unusable one never reaches the database.
    const problems = validatePolicy(input);
    if (problems.length > 0) {
      throw new DataError('INVALID', problems[0]);
    }

    if (input.id) {
      const { data, error } = await supabase
        .from('grading_policies')
        .update({ name: input.name, kind: input.kind, bands: input.bands })
        .eq('id', input.id)
        .eq('owner_id', userId)
        .select('id, owner_id, name, kind, bands, built_in, created_at')
        .single();
      throwIf(error);
      return mapPolicy(data as Row);
    }

    const { data, error } = await supabase
      .from('grading_policies')
      .insert({
        owner_id: userId,
        name: input.name,
        kind: input.kind,
        bands: input.bands,
        built_in: false,
      })
      .select('id, owner_id, name, kind, bands, built_in, created_at')
      .single();
    throwIf(error);
    return mapPolicy(data as Row);
  },

  async setClassPolicy(userId, classId, policyId) {
    const supabase = await requireClient();
    const { error } = await supabase
      .from('classes')
      .update({ grading_policy_id: policyId })
      .eq('id', classId)
      .eq('owner_id', userId);
    throwIf(error);
  },

  async getProfile(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);

    return data ? mapProfile(data as Row) : null;
  },

  async updateProfile(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: input.fullName,
        school_name: input.schoolName,
        subjects: input.subjects,
        default_grade_level: input.defaultGradeLevel,
        grading_policy_id: input.gradingPolicyId,
      })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw mapSupabaseError(error);

    return mapProfile(data as Row);
  },

  async getOrg(userId) {
    // Resolved through the caller's own membership rather than from a profile
    // column that could disagree with it, so the tenant is whatever the
    // membership table says it is.
    return supabaseOrgFor(userId);
  },

  async updateOrg(userId, input) {
    const org = await supabaseOrgFor(userId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    const supabase = await requireClient();

    /*
     * Read the headcount before writing the limit.
     *
     * A limit below the number of people already sitting on seats is not a
     * stricter limit, it is an organisation already in breach, and the admin
     * who just set it then has no lever left to pull. This is checked here as
     * well as in the fixture adapter on purpose: a constraint that exists only
     * in one of the two modes is a constraint that one mode does not have.
     *
     * It is a read-then-write and therefore not atomic. That is accepted, not
     * overlooked: two admins lowering a limit at the same instant is not a race
     * worth a database constraint that would arrive at the user as a constraint
     * violation instead of a sentence about seats.
     *
     * The count comes from the `count` field, NOT from `data.length`. A PostgREST
     * count query with `head: true` resolves `data` to null and carries the
     * number separately, so `.length` here is always 0, the guard never fires,
     * and the check below it looks like it is doing its job.
     */
    const { count: activeSeats, error: seatError } = await supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('status', 'active');
    if (seatError) throw mapSupabaseError(seatError);

    const seats = activeSeats ?? 0;
    if (input.seatLimit < seats) {
      throw new DataError(
        'CONFLICT',
        `This workspace already has ${seats} active ${seats === 1 ? 'person' : 'people'}. ` +
          `A limit below that cannot be applied.`,
      );
    }

    const patch: Record<string, unknown> = {
      name: input.name,
      plan: input.plan,
      seat_limit: input.seatLimit,
      billing_email: input.billingEmail,
    };

    /*
     * The profile is merged onto what is stored, and the verification columns
     * are never in the patch. The institution's own form may describe the
     * institution; it may not vouch for it.
     */
    if (input.profile) {
      const profile = input.profile;
      if (profile.countryCode !== undefined) patch.country_code = profile.countryCode;
      if (profile.sector !== undefined) patch.sector = profile.sector;
      if (profile.gradeMin !== undefined) patch.grade_min = profile.gradeMin;
      if (profile.gradeMax !== undefined) patch.grade_max = profile.gradeMax;
      if (profile.enrolment !== undefined) patch.enrolment = profile.enrolment;
      if (profile.timezone !== undefined) patch.timezone = profile.timezone;
      if (profile.contactName !== undefined) patch.contact_name = profile.contactName;
      if (profile.contactRole !== undefined) patch.contact_role = profile.contactRole;
    }

    const { data, error } = await supabase
      .from('organizations')
      .update(patch)
      .eq('id', org.id)
      .select(ORG_COLUMNS)
      .single();
    if (error) throw mapSupabaseError(error);

    // Through `unknown` because the patch is a dynamic column map rather than a
    // literal, so the client cannot infer the row shape it will select back.
    return mapOrg(data as unknown as Row);
  },

  async listMembers(userId) {
    const org = await supabaseOrgFor(userId);
    if (!org) return [];

    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('memberships')
      .select(
        'id, user_id, org_id, role, status, created_at, profiles!memberships_user_id_fkey(email, full_name)',
      )
      .eq('org_id', org.id)
      .order('created_at', { ascending: true });
    if (error) throw mapSupabaseError(error);

    return (data ?? []).map((row) => mapMember(row as Row));
  },

  async setMemberRole(userId, memberId, role) {
    const org = await supabaseOrgFor(userId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    const supabase = await requireClient();
    const { data: updatedMemberships, error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('id', memberId)
      .eq('org_id', org.id)
      .select('id');
    if (error) throw mapSupabaseError(error);
    // PostgREST reports no error for an update that matched nothing, so the rows
    // it hands back are the only evidence the write happened. Without this a
    // member id that matches no membership reports success for nothing.
    if ((updatedMemberships ?? []).length === 0) {
      throw new DataError('NOT_FOUND', 'That record does not exist.');
    }

    /*
     * The account's own role follows the membership, because that is what the
     * permission matrix and the session are checked against. Writing only the
     * membership would leave the console promising a change it had not made.
     * Supabase keeps the two in step at the next token refresh.
     */
    const { data: membership } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('id', memberId)
      .eq('org_id', org.id)
      .maybeSingle();
    const target = membership?.user_id;
    if (!target) return;

    /*
     * WHY THE SERVICE-ROLE CLIENT, AND WHY THE ROW COUNT IS CHECKED.
     *
     * This wrote another user's `profiles.role` through the caller's own
     * session, which was never allowed to do that. It failed quietly: PostgREST
     * returns no error for an update that matched zero rows, so the admin console
     * reported "Role updated." for a change that had not happened. The grant has
     * since been tightened to exclude `role` entirely, so the same write is now
     * refused outright rather than silently ignored.
     *
     * The membership lookup above is what keeps the service-role write scoped:
     * `target` is resolved from a membership inside the CALLER's own
     * organisation, never from anything the request supplied, so this bypasses
     * RLS without ever crossing a tenant boundary. The count is read back rather
     * than assumed, because "no error" is not evidence that a row was written.
     */
    const admin = await createSupabaseAdmin();
    if (!admin) {
      throw new DataError(
        'FORBIDDEN',
        'Changing a role needs the service role key, which this server is not configured with.',
      );
    }

    const { data: updatedProfiles, error: profileError } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', target)
      .select('id');
    if (profileError) throw mapSupabaseError(profileError);
    if ((updatedProfiles ?? []).length === 0) {
      throw new DataError('NOT_FOUND', 'That record does not exist.');
    }
  },

  async setMemberStatus(userId, memberId, status) {
    const org = await supabaseOrgFor(userId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    const supabase = await requireClient();
    const { error } = await supabase
      .from('memberships')
      .update({ status })
      .eq('id', memberId)
      .eq('org_id', org.id);
    if (error) throw mapSupabaseError(error);
  },

  async listInvites(userId) {
    const org = await supabaseOrgFor(userId);
    if (!org) return [];

    /*
     * The service role client, not the session client. There is no
     * `select policy` on `organization_invites` because an invite row is a
     * credential: any member could read their school's codes and walk off with
     * them. That leaves reading them an administrator action, which is what the
     * calling action checks for, and this row filter is what keeps that check
     * from being the only thing standing between two tenants.
     */
    const admin = await createSupabaseAdmin();
    if (!admin) {
      throw new DataError(
        'FORBIDDEN',
        'Reading invitations needs the service role key, which this server is not configured with.',
      );
    }

    const { data, error } = await admin
      .from('organization_invites')
      .select(INVITE_COLUMNS)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });
    if (error) throw mapSupabaseError(error);

    return (data ?? []).map((row) => mapInvite(row as Row));
  },

  async createInvite(userId, input) {
    const org = await supabaseOrgFor(userId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    /*
     * The service role client, not the session client. The insert is refused by
     * RLS on purpose: an invite row is a credential, so writing one is an
     * administrator action that the calling action has already checked, not a
     * thing the browser may do for itself. `org_id` and `created_by` come from
     * the resolved organisation and the session, never from the request.
     */
    const admin = await createSupabaseAdmin();
    if (!admin) {
      throw new DataError(
        'FORBIDDEN',
        'Issuing an invitation needs the service role key, which this server is not configured with.',
      );
    }

    /*
     * Minted here, inserted through the service role, returned to the caller.
     *
     * Three attempts, because the only thing that can fail here is a collision
     * on a 1.1 trillion code space, and a collision is not a reason to tell an
     * administrator their invitation could not be created.
     */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await admin
        .from('organization_invites')
        .insert({
          org_id: org.id,
          email: input.email,
          role: input.role,
          code: newInviteCode(),
          created_by: userId,
          expires_at: inviteExpiry(),
        })
        .select(INVITE_COLUMNS)
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) continue;
        throw mapSupabaseError(error);
      }
      return mapInvite(data as Row);
    }

    throw new DataError('CONFLICT', 'That invitation code collided three times. Try again.');
  },

  async redeemInvite(userId, code) {
    /*
     * `userId` goes unused here, and that is the design rather than an
     * oversight. The function resolves who is redeeming from the session the RPC
     * carries, so no caller can put somebody else in a seat by passing a
     * different id. It stays in the signature so both adapters take the same
     * argument and the seam never grows a rule that applies to one of them.
     *
     * The session client on purpose. Redemption is the one operation a
     * non-admin performs on this table, and it has to run as the person
     * redeeming so the function can write a membership for them. The seat limit
     * is not checked here and could not be: the count and the limit are read and
     * compared inside the same transaction as the insert, so two codes redeemed
     * at the same moment cannot both see the last seat.
     */
    const supabase = await requireClient();
    const normalised = code.trim().toUpperCase();

    const { data, error } = await supabase.rpc('redeem_org_invite', { p_code: normalised });
    if (error) throw inviteRefusal(error);

    const row = ((data ?? []) as Row[])[0] ?? {};
    return { orgId: str(row.org_id), orgName: str(row.org_name) };
  },

  async listDecks(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => mapDeck(row as Row));
  },

  async createDeck(userId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('decks')
      .insert({ owner_id: userId, title: input.title, description: input.description })
      .select('*')
      .single();
    throwIf(error);

    /*
     * A deck with no slides cannot be opened, so a new one is never empty. The
     * opening slide is a title slide rather than a blank, because that is what
     * a teacher is about to replace anyway and a blank canvas looks broken.
     */
    await supabase.from('slides').insert({
      deck_id: data.id,
      owner_id: userId,
      position: 0,
      layout: 'title',
      title: input.title,
      body: '',
      notes: '',
    });
    throwIf(error);

    return mapDeck(data as Row);
  },

  async updateDeck(userId, deckId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('decks')
      .update({ title: input.title, description: input.description })
      .eq('id', deckId)
      .eq('owner_id', userId)
      .select('*')
      .single();
    throwIf(error);
    return mapDeck(data as Row);
  },

  async archiveDeck(userId, deckId) {
    const supabase = await requireClient();
    const { error } = await supabase
      .from('decks')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', deckId)
      .eq('owner_id', userId);
    throwIf(error);
  },

  async listSlides(userId, deckId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('slides')
      .select('*')
      .eq('deck_id', deckId)
      .eq('owner_id', userId)
      .order('position');
    throwIf(error);
    return (data ?? []).map((row) => mapSlide(row as Row));
  },

  async createSlide(userId, deckId, input) {
    const supabase = await requireClient();

    // Appended rather than inserted at a position, so two people adding a slide
    // at once cannot collide on the same index.
    const { data: existing } = await supabase
      .from('slides')
      .select('position')
      .eq('deck_id', deckId)
      .eq('owner_id', userId)
      .order('position', { ascending: false })
      .limit(1);

    const position = (existing?.[0]?.position ?? -1) + 1;
    const { data, error } = await supabase
      .from('slides')
      .insert({
        deck_id: deckId,
        owner_id: userId,
        position,
        layout: input.layout ?? 'bullets',
        title: input.title ?? '',
        body: input.body ?? '',
        notes: input.notes ?? '',
      })
      .select('*')
      .single();
    throwIf(error);
    await touchDeck(supabase, deckId);
    return mapSlide(data as Row);
  },

  async updateSlide(userId, slideId, input) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('slides')
      .update({
        layout: input.layout,
        title: input.title,
        body: input.body,
        notes: input.notes,
      })
      .eq('id', slideId)
      .eq('owner_id', userId)
      .select('*')
      .single();
    throwIf(error);
    await touchDeck(supabase, data.deck_id);
    return mapSlide(data as Row);
  },

  async getSlide(userId, slideId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('slides')
      .select('*')
      .eq('id', slideId)
      .eq('owner_id', userId)
      .maybeSingle();
    throwIf(error);

    const row = data as Row | null;
    if (!row) throw new DataError('NOT_FOUND', 'That slide no longer exists.');
    return mapSlide(row);
  },

  async updateSlideContent(userId, slideId, input) {
    const supabase = await requireClient();

    /*
     * `elements` goes to the jsonb column as the validated array and `theme` to
     * the column beside it. The theme is checked against the same list the
     * column's constraint uses, because a value the database refuses would come
     * back as an error the teacher reads as "your slide did not save" rather
     * than as the mistake it is.
     */
    const theme = SLIDE_THEMES.includes(input.theme) ? input.theme : 'viridian';
    const { data, error } = await supabase
      .from('slides')
      .update({ elements: input.elements, theme })
      .eq('id', slideId)
      .eq('owner_id', userId)
      .select('*')
      .single();
    throwIf(error);

    await touchDeck(supabase, data.deck_id);
    return mapSlide(data as Row);
  },

  async listAiUsage(userId) {
    const supabase = await requireClient();

    /*
     * A window of two hours, not of "all time".
     *
     * The meter counts an hour, but the query takes the longer of the two so the
     * result is stable for a panel that stays open across a boundary. Counting
     * in the database instead would mean passing the window on every call and
     * moving the rule out of the one place it is tested.
     */
    const since = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const { data, error } = await supabase
      .from('ai_generations')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    throwIf(error);

    return ((data ?? []) as Row[]).map((row) => ({ created_at: iso(row.created_at) }));
  },

  async recordAiGeneration(userId, input) {
    /*
     * WHY THE ROW WRITE GOES THROUGH THE SERVICE CLIENT.
     *
     * `ai_generations` has a select policy and nothing else, which is the right
     * shape for a table the browser must never write: this row is the record
     * that a teacher's allowance is counted from, so letting a client insert one
     * would let a client decide how much of its own allowance is left.
     *
     * This was written with the session client and it failed on production with
     * `42501`, because the teacher is `authenticated` and there is no insert
     * policy for that role. The failure was invisible in every local check: the
     * fixture adapter has no policies at all, and unit tests never reach
     * Postgres. It surfaced as a 500 from the generation action and a meter that
     * never moved, which is the allowance failing open.
     *
     * The cost of bypassing RLS is that the explicit filter becomes the only
     * scoping, so `user_id` below is the caller's own id and is never derived
     * from anything the browser sent.
     */
    const admin = await createSupabaseAdmin();
    if (!admin) throw new DataError('CONFLICT', 'This environment cannot record usage right now.');

    const { error } = await admin.from('ai_generations').insert({
      user_id: userId,
      model: input.model,
      purpose: input.purpose,
      // Clamped rather than trusted. A negative count from a caller would make
      // the history look like it had capacity to give away.
      prompt_tokens: Math.max(0, Math.floor(input.promptTokens) || 0),
      output_tokens: Math.max(0, Math.floor(input.outputTokens) || 0),
    });
    throwIf(error);
  },

  async deleteSlide(userId, slideId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('slides')
      .delete()
      .eq('id', slideId)
      .eq('owner_id', userId)
      .select('deck_id');
    throwIf(error);

    const deckId = (data?.[0] as Row | undefined)?.deck_id;
    if (deckId) {
      await resequence(supabase, userId, String(deckId));
      await touchDeck(supabase, String(deckId));
    }
  },

  async moveSlide(userId, slideId, toIndex) {
    const supabase = await requireClient();

    const { data: slide, error: slideError } = await supabase
      .from('slides')
      .select('deck_id')
      .eq('id', slideId)
      .eq('owner_id', userId)
      .single();
    throwIf(slideError);

    const deckId = String((slide as Row | null)?.deck_id ?? '');
    const slides = await supabase
      .from('slides')
      .select('id')
      .eq('deck_id', deckId)
      .eq('owner_id', userId)
      .order('position');
    throwIf(slides.error);

    const ids = (slides.data ?? []).map((row) => String(row.id));
    const from = ids.indexOf(slideId);
    if (from === -1) throw new DataError('NOT_FOUND', 'That slide no longer exists.');

    const target = Math.max(0, Math.min(toIndex, ids.length - 1));
    ids.splice(from, 1);
    ids.splice(target, 0, slideId);

    // Positions are renumbered across the whole deck so there is never a gap or
    // a duplicate, which is what "two slides both claim to be third" looks like.
    await Promise.all(
      ids.map((id, index) =>
        supabase.from('slides').update({ position: index }).eq('id', id).eq('owner_id', userId),
      ),
    );
    await touchDeck(supabase, deckId);
  },

  /*
   * WHY THE ROW WRITE GOES THROUGH THE SERVICE CLIENT.
   *
   * `deck_assets` carries a select policy and nothing else, which is the right
   * shape for a table whose rows are created by one server route and never by a
   * browser. Routing the write back through that table would mean adding insert
   * and delete policies, and an insert policy is a second, weaker place to
   * decide whose files exist.
   *
   * The cost of bypassing RLS is that the explicit filter becomes the only
   * scoping there is, so it is on every write below and is not decoration.
   */
  async createDeckAsset(userId, deckId, input) {
    const supabase = await requireClient();
    const id = randomUUID();
    let storagePath: string | null = null;

    /*
     * The image is uploaded before the row is written, not after. The reverse
     * order leaves a row pointing at an object that was never stored, and that
     * row is the thing the editor renders, so it is the failure a teacher
     * actually sees. An object with no row is only wasted storage, which a
     * later sweep can reclaim and nobody sees in the meantime.
     *
     * This upload runs as the teacher, so it is the storage policies doing the
     * work: the first path segment has to be their own uid or it is refused.
     */
    if (input.kind === 'image') {
      if (!input.bytes || input.bytes.byteLength === 0) {
        throw new DataError('MISSING_FIELD', 'That image had nothing in it.');
      }
      storagePath = `${userId}/${deckId}/${id}/${safeFileName(input.filename)}`;

      const { error: uploadError } = await supabase.storage
        .from(DECK_ASSET_BUCKET)
        .upload(storagePath, new Uint8Array(input.bytes), {
          contentType: input.mime,
          upsert: false,
        });
      throwIf(uploadError);
    }

    const admin = await createSupabaseAdmin();
    if (!admin) throw new DataError('CONFLICT', 'This environment cannot store files right now.');

    const { data, error } = await admin
      .from('deck_assets')
      .insert({
        id,
        deck_id: deckId,
        owner_id: userId,
        kind: input.kind,
        filename: input.filename,
        mime: input.mime,
        byte_size: input.byteSize,
        storage_path: storagePath,
        // A document's bytes are deliberately not stored anywhere. The text is
        // the whole of what the import produced.
        extracted_text: input.extractedText ?? null,
      })
      .select('*')
      .single();
    throwIf(error);

    await touchDeck(supabase, deckId);
    return mapAsset(data as Row, null);
  },

  async listDeckAssets(userId, deckId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('deck_assets')
      .select('*')
      .eq('owner_id', userId)
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false });
    throwIf(error);

    const rows = (data ?? []) as Row[];

    // Signed in the storage API rather than assembled from the project address.
    // The bucket is private, so a URL written by hand is refused by the CDN and
    // the editor shows a broken image with nothing to explain it.
    const urls = await Promise.all(
      rows.map(async (row) => {
        const path = str(row.storage_path);
        if (path.length === 0) return null;
        const signed = await supabase.storage
          .from(DECK_ASSET_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        return signed.data?.signedUrl ?? null;
      }),
    );

    return rows.map((row, index) => mapAsset(row, urls[index] ?? null));
  },

  /*
   * Deleted through the service client for the same reason the create is.
   * `deck_assets` carries a select policy and no delete policy, so the
   * anonymous client is refused here, and the explicit `owner_id` filter below
   * is the whole of the ownership check.
   */
  async deleteDeckAsset(userId, assetId) {
    const supabase = await requireClient();
    const admin = await createSupabaseAdmin();
    if (!admin) throw new DataError('CONFLICT', 'This environment cannot store files right now.');

    const { data, error } = await admin
      .from('deck_assets')
      .delete()
      .eq('id', assetId)
      .eq('owner_id', userId)
      .select('deck_id, storage_path')
      .maybeSingle();
    throwIf(error);

    const row = data as Row | null;
    if (!row) throw new DataError('NOT_FOUND', 'That file is no longer there.');

    const path = str(row.storage_path);
    const deckId = str(row.deck_id);

    /*
     * The bucket has no delete policy on purpose, so removing the bytes goes
     * through the service client rather than by granting every teacher the
     * ability to delete any object under their prefix. The row that proved the
     * path was theirs has already been read and matched above, so this is a
     * cleanup of an object whose owner is established, not a way to reach one
     * whose owner is not.
     */
    if (path.length > 0) {
      const { error: removeError } = await admin.storage.from(DECK_ASSET_BUCKET).remove([path]);
      if (removeError) {
        throw new DataError(
          'CONFLICT',
          'That file was removed from the deck, but its stored image could not be cleaned up.',
        );
      }
    }

    await touchDeck(supabase, deckId);
  },

  /*
   * Schedule, terms, dated events and notifications.
   *
   * WHY THESE DO NOT FILTER ON `userId` THE WAY THE TEACHER READS DO. They are
   * the student's own rows, and a student has no `owner_id` of their own to
   * filter on: their `owner_id` is the teacher's. Identity here comes from RLS,
   * which resolves `students.account_id = auth.uid()` in the database. Filtering
   * as well would add a second, weaker source of identity sitting next to the
   * one that is enforced, which is the arrangement the teacher reads avoid.
   */

  async listSchedule(userId, studentId) {
    void userId;
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('weekly_schedule_entries')
      .select('*')
      .eq('student_id', studentId)
      .order('day_of_week')
      .order('start_minute');
    throwIf(error);
    return (data as Row[]).map(mapScheduleEntry);
  },

  async saveScheduleEntry(userId, input) {
    const supabase = await requireClient();
    const row: Row = {
      student_id: input.studentId,
      day_of_week: input.dayOfWeek,
      start_minute: input.startMinute,
      end_minute: input.endMinute,
      title: input.title,
      teacher_name: input.teacherName ?? null,
      room: input.room ?? null,
      source: input.source ?? 'manual',
    };
    if (input.id) {
      const { data, error } = await supabase
        .from('weekly_schedule_entries')
        .update(row)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();
      throwIf(error);
      if (!data) throw new DataError('NOT_FOUND', 'That class is no longer on your timetable.');
      return mapScheduleEntry(data as Row);
    }
    // owner_id is never taken from the caller: it is the teacher who owns the
    // class, and the student's own write still lands on their teacher's roster.
    const ownerId = await rosterOwner(supabase, input.studentId);
    const { data, error } = await supabase
      .from('weekly_schedule_entries')
      .insert({ ...row, owner_id: ownerId })
      .select('*')
      .single();
    throwIf(error);
    return mapScheduleEntry(data as Row);
  },

  async replaceSchedule(userId, studentId, entries) {
    const supabase = await requireClient();
    // Delete then insert rather than a diff. Confirming a photograph is a
    // wholesale statement of what the week is, and a diff would have to decide
    // which rows the student meant to keep, which the model never said.
    const { error: removed } = await supabase
      .from('weekly_schedule_entries')
      .delete()
      .eq('student_id', studentId);
    throwIf(removed);

    const ownerId = await rosterOwner(supabase, studentId);
    const rows = entries.map((entry) => ({
      student_id: studentId,
      owner_id: ownerId,
      day_of_week: entry.dayOfWeek,
      start_minute: entry.startMinute,
      end_minute: entry.endMinute,
      title: entry.title,
      teacher_name: entry.teacherName ?? null,
      room: entry.room ?? null,
      source: entry.source ?? 'manual',
    }));
    if (rows.length === 0) return [];

    const { data, error } = await supabase.from('weekly_schedule_entries').insert(rows).select('*');
    throwIf(error);
    return (data as Row[]).map(mapScheduleEntry);
  },

  async deleteScheduleEntry(userId, entryId) {
    void userId;
    const supabase = await requireClient();
    const { error } = await supabase.from('weekly_schedule_entries').delete().eq('id', entryId);
    throwIf(error);
  },

  async listTerms(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('academic_terms')
      .select('*')
      .eq('owner_id', userId)
      .order('starts_on');
    throwIf(error);
    return (data as Row[]).map(mapTerm);
  },

  async saveTerm(userId, input) {
    const supabase = await requireClient();
    const row: Row = {
      name: input.name,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    };
    const { data, error } = input.id
      ? await supabase.from('academic_terms').update(row).eq('id', input.id).select('*').maybeSingle()
      : await supabase.from('academic_terms').insert({ ...row, owner_id: userId }).select('*').single();
    throwIf(error);
    if (!data) throw new DataError('NOT_FOUND', 'That term is no longer there.');
    return mapTerm(data as Row);
  },

  async deleteTerm(userId, termId) {
    const supabase = await requireClient();
    const { error } = await supabase.from('academic_terms').delete().eq('id', termId).eq('owner_id', userId);
    throwIf(error);
  },

  async listCalendarEvents(userId, studentId, from, to) {
    void userId;
    const supabase = await requireClient();
    let query = supabase
      .from('calendar_events')
      .select('*')
      .gte('starts_at', from)
      .lte('starts_at', to)
      .order('starts_at');
    // A null studentId is the caller's own events, which is where a personal
    // deadline lives. Naming a roster row is how a teacher writes one for a
    // student and how that student then sees it.
    query = query.is('student_id', studentId);
    const { data, error } = await query;
    throwIf(error);
    return (data as Row[]).map(mapCalendarEvent);
  },

  async saveCalendarEvent(userId, input) {
    const supabase = await requireClient();
    const row: Row = {
      student_id: input.studentId ?? null,
      title: input.title,
      notes: input.notes ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      all_day: input.allDay ?? false,
      kind: input.kind,
      created_by_role: input.createdByRole,
    };
    if (input.id) {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(row)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();
      throwIf(error);
      if (!data) throw new DataError('NOT_FOUND', 'That event is no longer on the calendar.');
      return mapCalendarEvent(data as Row);
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({ ...row, owner_id: userId })
      .select('*')
      .single();
    throwIf(error);
    return mapCalendarEvent(data as Row);
  },

  async deleteCalendarEvent(userId, eventId) {
    void userId;
    const supabase = await requireClient();
    const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
    throwIf(error);
  },

  async listNotifications(userId) {
    const supabase = await requireClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    throwIf(error);
    return (data as Row[]).map(mapNotification);
  },

  async markNotificationRead(userId, notificationId) {
    const supabase = await requireClient();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);
    throwIf(error);
  },
};

/**
 * The teacher who owns the roster row a schedule entry hangs off.
 *
 * Resolved rather than taken from the caller so that a student writing their own
 * week still lands it on their teacher's roster, which is what the ownership
 * policy keys on.
 */
async function rosterOwner(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null,
  studentId: string,
): Promise<string> {
  const client = supabase ?? (await createSupabaseServerClient());
  if (!client) throw new DataError('CONFLICT', 'This environment cannot reach the database.');
  const { data, error } = await client
    .from('students')
    .select('owner_id')
    .eq('id', studentId)
    .maybeSingle();
  throwIf(error);
  const row = data as Row | null;
  if (!row) throw new DataError('NOT_FOUND', 'That student is no longer on a roster.');
  return str(row.owner_id);
}

function mapScheduleEntry(row: Row): ScheduleEntryRecord {
  return {
    id: str(row.id),
    studentId: str(row.student_id),
    ownerId: str(row.owner_id),
    dayOfWeek: num(row.day_of_week, 1),
    startMinute: num(row.start_minute, 0),
    endMinute: num(row.end_minute, 0),
    title: str(row.title),
    teacherName: (row.teacher_name as string | null) ?? null,
    room: (row.room as string | null) ?? null,
    source: row.source === 'photo' ? 'photo' : 'manual',
    createdAt: iso(row.created_at),
  };
}

function mapTerm(row: Row): TermRecord {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    name: str(row.name),
    kind: str(row.kind, 'term') as TermRecord['kind'],
    startsOn: str(row.starts_on),
    endsOn: str(row.ends_on),
    createdAt: iso(row.created_at),
  };
}

function mapCalendarEvent(row: Row): CalendarEventRecord {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    studentId: (row.student_id as string | null) ?? null,
    title: str(row.title),
    notes: (row.notes as string | null) ?? null,
    startsAt: iso(row.starts_at),
    endsAt: (row.ends_at as string | null) ?? null,
    allDay: row.all_day === true,
    kind: str(row.kind, 'event') as CalendarEventRecord['kind'],
    createdByRole: str(row.created_by_role, 'student') as CalendarEventRecord['createdByRole'],
    createdAt: iso(row.created_at),
  };
}

function mapNotification(row: Row): NotificationRecord {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    kind: str(row.kind, 'schedule_updated') as NotificationRecord['kind'],
    title: str(row.title),
    body: str(row.body),
    url: (row.url as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

function mapClass(row: Row): ClassRecord {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    name: str(row.name),
    code: str(row.code),
    level: str(row.level, 'k12') as ClassLevel,
    meetsPerWeek: num(row.meets_per_week, 1),
    archivedAt: (row.archived_at as string | null) ?? null,
    gradingPolicyId: (row.grading_policy_id as string | null) ?? null,
  };
}

function mapDeck(row: Row): DeckRecord {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    title: str(row.title),
    description: str(row.description),
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapSlide(row: Row): SlideRecord {
  return {
    id: str(row.id),
    deckId: str(row.deck_id),
    ownerId: str(row.owner_id),
    position: num(row.position),
    layout: str(row.layout, 'bullets') as SlideLayout,
    // Read back through the normaliser rather than cast. The column is jsonb, so
    // a half-written element is a thing this function can be handed, and the
    // alternative is a renderer that reads `style.size` off undefined.
    theme: SLIDE_THEMES.includes(str(row.theme) as SlideTheme)
      ? (str(row.theme) as SlideTheme)
      : 'viridian',
    elements: normaliseElements(row.elements),
    title: str(row.title),
    body: str(row.body),
    notes: str(row.notes),
    updatedAt: iso(row.updated_at),
  };
}

function mapAsset(row: Row, url: string | null): DeckAssetRecord {
  return {
    id: str(row.id),
    deckId: str(row.deck_id),
    ownerId: str(row.owner_id),
    kind: str(row.kind, 'document') === 'image' ? 'image' : 'document',
    filename: str(row.filename),
    mime: str(row.mime),
    byteSize: num(row.byte_size),
    storagePath: (row.storage_path as string | null) ?? null,
    extractedText: (row.extracted_text as string | null) ?? null,
    createdAt: iso(row.created_at),
    url,
  };
}

function mapOrg(row: Row): OrgRecord {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    plan: str(row.plan, 'starter') as OrgPlan,
    seatLimit: num(row.seat_limit, 5),
    billingEmail: (row.billing_email as string | null) ?? null,
    createdAt: iso(row.created_at),
    profile: {
      countryCode: (row.country_code as string | null) ?? null,
      // Anything the constraint list does not recognise reads as unknown rather
      // than being coerced into the nearest match. A sector guessed for a school
      // is a fact invented about that school.
      sector: ORG_SECTORS.includes(row.sector as OrgSector) ? (row.sector as OrgSector) : null,
      gradeMin: (row.grade_min as number | null) ?? null,
      gradeMax: (row.grade_max as number | null) ?? null,
      enrolment: (row.enrolment as number | null) ?? null,
      timezone: (row.timezone as string | null) ?? null,
      contactName: (row.contact_name as string | null) ?? null,
      contactRole: (row.contact_role as string | null) ?? null,
      verificationStatus: ORG_VERIFICATION_STATUSES.includes(row.verification_status as OrgVerificationStatus)
        ? (row.verification_status as OrgVerificationStatus)
        : 'unverified',
      verifiedAt: (row.verified_at as string | null) ?? null,
    },
  };
}

function mapMember(row: Row): MemberRecord {
  /*
   * The profile comes back as an embedded object for a membership row and as an
   * array for a profile row, depending on whether the foreign key was inferred
   * as one-to-one. Both shapes appear in practice, so both are read.
   */
  const embedded = row.profiles;
  const profile: Row = Array.isArray(embedded) ? (embedded[0] ?? {}) : ((embedded as Row) ?? {});

  return {
    id: str(row.id),
    userId: str(row.user_id),
    orgId: str(row.org_id),
    fullName: str(profile.full_name),
    email: str(profile.email),
    role: str(row.role, 'instructor') as Role,
    status: str(row.status, 'active') as MembershipStatus,
    joinedAt: iso(row.created_at),
  };
}

function mapInvite(row: Row): InviteRecord {
  return {
    id: str(row.id),
    orgId: str(row.org_id),
    email: str(row.email),
    role: str(row.role, 'instructor') as Role,
    code: str(row.code),
    createdBy: str(row.created_by),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    acceptedAt: (row.accepted_at as string | null) ?? null,
    acceptedBy: (row.accepted_by as string | null) ?? null,
  };
}

/**
 * Turns a failed `redeem_org_invite` call into the refusal the administrator
 * needs to read.
 *
 * WHY NOT `mapSupabaseError`.
 *
 * The function signals every refusal by raising `42501`, and `mapSupabaseError`
 * renders that code as "That record does not exist." That single line is the
 * difference between a seat limit that explains itself and one that looks like a
 * broken page. So the message from the function is passed through untouched, and
 * only that code is passed through at all: any other failure is a transport or
 * permissions problem whose text belongs to PostgREST, not to a person holding
 * an invitation, and those still go through the generic mapping.
 *
 * `42501` reaching here means `redeem_org_invite` ran and said no. The function
 * is granted to `authenticated` alone, so nothing else in the schema can raise
 * with this code from this call path.
 */
function inviteRefusal(error: { code?: string; message?: string }): DataError {
  if (error.code === '42501' && typeof error.message === 'string' && error.message.trim()) {
    return new DataError('CONFLICT', error.message.trim());
  }
  return mapSupabaseError(error);
}

function mapProfile(row: Row): ProfileRecord {
  return {
    id: str(row.id),
    email: str(row.email),
    fullName: str(row.full_name),
    role: str(row.role, 'instructor') as Role,
    schoolName: (row.school_name as string | null) ?? null,
    subjects: Array.isArray(row.subjects) ? (row.subjects as string[]) : [],
    defaultGradeLevel: (row.default_grade_level as ClassLevel | null) ?? null,
    gradingPolicyId: (row.grading_policy_id as string | null) ?? null,
    orgId: (row.org_id as string | null) ?? null,
  };
}

function mapPolicy(row: Row): GradingPolicyRecord {
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    name: str(row.name),
    kind: str(row.kind, 'custom') as GradingPolicyInput['kind'],
    bands: (row.bands as GradeBand[]) ?? [],
    builtIn: row.built_in === true,
    createdAt: str(row.created_at),
  };
}

function mapStudent(row: Row): StudentRecord {
  return {
    id: str(row.id),
    classId: str(row.class_id),
    ownerId: str(row.owner_id),
    fullName: str(row.full_name),
    initials: str(row.initials),
    guardianName: (row.guardian_name as string | null) ?? null,
    guardianEmail: (row.guardian_email as string | null) ?? null,
    guardianPhone: (row.guardian_phone as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    accountId: (row.account_id as string | null) ?? null,
  };
}

function mapAssessment(row: Row): AssessmentRecord {
  return {
    id: str(row.id),
    classId: str(row.class_id),
    ownerId: str(row.owner_id),
    title: str(row.title),
    type: str(row.type, 'quiz') as AssessmentType,
    weight: num(row.weight, 1),
    maxScore: num(row.max_score, 100),
    dueOn: (row.due_on as string | null) ?? null,
    standardCodes: strArray(row.standard_codes),
    archivedAt: (row.archived_at as string | null) ?? null,
    idFormatEnabled: row.id_format_enabled === true,
    idFormatGroups: (row.id_format_groups as number | null) ?? null,
    idFormatCodes: (row.id_format_codes as number | null) ?? null,
  };
}

function gradeSource(value: unknown): GradeSource {
  const raw = str(value, 'manual');
  return raw === 'scan' || raw === 'online' ? raw : 'manual';
}

function mapGrade(row: Row): GradeRecord {
  return {
    id: str(row.id),
    assessmentId: str(row.assessment_id),
    studentId: str(row.student_id),
    ownerId: str(row.owner_id),
    score: (row.score as number | null) ?? null,
    maxScore: num(row.max_score, 100),
    rubric: Array.isArray(row.rubric) ? (row.rubric as GradeRecord['rubric']) : [],
    feedback: (row.feedback as string | null) ?? null,
    gradedAt: iso(row.graded_at),
    source: gradeSource(row.source),
    scanDetail: Array.isArray(row.scan_detail) ? (row.scan_detail as ScannedAnswer[]) : null,
  };
}

/**
 * A question as a student is allowed to receive it.
 *
 * Note what is absent: `answerKey` and `ownerId`. This is the only place a
 * student-facing question is built, and it is built from a function that cannot
 * return a key in the first place, so dropping the field here is a second line
 * rather than the only one.
 */
function mapStudentQuestion(row: Row): StudentQuizQuestion {
  const options = Array.isArray(row.options)
    ? (row.options as { key?: unknown; text?: unknown }[])
        .filter((o) => o && typeof o.key === 'string' && typeof o.text === 'string')
        .map((o) => ({ key: o.key as string, text: o.text as string }))
    : [];
  return {
    id: str(row.id),
    kind: str(row.kind) === 'multiple' ? 'multiple' : 'single',
    prompt: str(row.prompt),
    options,
  };
}

function mapResponses(value: unknown): OnlineAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        questionIndex: num(record.questionIndex, -1),
        optionKeys: strArray(record.optionKeys),
      };
    })
    .filter((answer) => answer.questionIndex >= 0);
}

function mapAttempt(row: Row): AttemptRecord {
  const status = str(row.status) === 'submitted' ? 'submitted' : 'in_progress';
  return {
    id: str(row.id),
    assessmentId: str(row.assessment_id),
    studentId: str(row.student_id),
    ownerId: str(row.owner_id),
    status,
    responses: mapResponses(row.responses),
    score: (row.score as number | null) ?? null,
    maxScore: (row.max_score as number | null) ?? null,
    startedAt: iso(row.started_at),
    submittedAt: (row.submitted_at as string | null) ?? null,
  };
}

function mapQuestion(row: Row): QuestionRecord {
  const options = Array.isArray(row.options)
    ? (row.options as { key?: unknown; text?: unknown }[])
        .filter((o) => o && typeof o.key === 'string' && typeof o.text === 'string')
        .map((o) => ({ key: o.key as string, text: o.text as string }))
    : [];
  return {
    id: str(row.id),
    assessmentId: str(row.assessment_id),
    ownerId: str(row.owner_id),
    position: num(row.position, 0),
    kind: str(row.kind, 'single') === 'multiple' ? 'multiple' : 'single',
    prompt: str(row.prompt),
    options,
    answerKey: strArray(row.answer_key),
    points: num(row.points, 1),
  };
}

function mapPlan(row: Row): LessonPlanRecord {
  return {
    id: str(row.id),
    classId: str(row.class_id),
    ownerId: str(row.owner_id),
    title: str(row.title),
    weekOf: (row.week_of as string | null) ?? null,
    body: (row.body ?? {}) as Record<string, unknown>,
    standardCodes: strArray(row.standard_codes),
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw mapSupabaseError(error);
}

/**
 * Stamps a deck as just edited.
 *
 * The deck list is ordered by `updated_at`, so a deck whose slides changed has
 * to be stamped or it disappears down the list while the teacher is working on
 * it.
 */
async function touchDeck(supabase: Awaited<ReturnType<typeof requireClient>>, deckId: string) {
  await supabase.from('decks').update({ updated_at: new Date().toISOString() }).eq('id', deckId);
}

/** Closes the gap left by a deleted slide so positions stay contiguous. */
async function resequence(
  supabase: Awaited<ReturnType<typeof requireClient>>,
  userId: string,
  deckId: string,
) {
  const { data, error } = await supabase
    .from('slides')
    .select('id')
    .eq('deck_id', deckId)
    .eq('owner_id', userId)
    .order('position');
  if (error) return;

  await Promise.all(
    (data ?? []).map((row, index) =>
      supabase
        .from('slides')
        .update({ position: index })
        .eq('id', row.id)
        .eq('owner_id', userId),
    ),
  );
}

async function requireClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error(
      'Supabase is not reachable. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and that a Supabase session cookie is present.',
    );
  }
  return supabase;
}

/**
 * The organisation the caller belongs to.
 *
 * Every tenancy write goes through this rather than taking an org id from the
 * caller, so a crafted request cannot address another school's members. A
 * suspended membership resolves to null, which is what makes suspending someone
 * actually take effect on their next request.
 */
async function supabaseOrgFor(userId: string): Promise<OrgRecord | null> {
  const supabase = await requireClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('org_id, organizations(' + ORG_COLUMNS + ')')
    .eq('user_id', userId)
    .eq('status', 'active')
    // Most recent first, and this is load-bearing rather than cosmetic. A person
    // can hold two active memberships, and without an order PostgREST returns
    // an arbitrary one, so the same account could resolve to two different
    // tenants on two requests. Accepting an invitation is the thing that makes
    // the newer one the right answer.
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);

  const org = (data as { organizations: Row } | null)?.organizations;
  return org ? mapOrg(org) : null;
}

// ---------------------------------------------------------------------------
// Fixture adapter
//
// Kept for the marketing page, the hero device mockups, the demo workspace, and
// the Playwright suite, all of which must run with no network. It throws under
// `LIKO_DATA_MODE=supabase` so a missed wiring surfaces as a stack trace rather
// than as plausible-looking demo data in front of a real teacher.
// ---------------------------------------------------------------------------

async function fixtureAdapter(): Promise<WorkspaceData> {
  const { fixtures } = await import('./fixtures');
  return scopeFixtureHeatmap(fixtures);
}

/**
 * Scopes the fixture heatmap to the class it was asked about.
 *
 * `fixtures.getHeatmap` returns one shared, precomputed grid and ignores both
 * arguments, so every class showed the same eight students. That is harmless for
 * the marketing miniature, which has no class, and wrong for the overview page,
 * which labels the grid with the selected class name. Filtering against that
 * class's roster is done here rather than in `fixtures.ts` so the demo store
 * itself is left alone; the default class still returns the same eight cells,
 * because those eight students are on its roster.
 */
function scopeFixtureHeatmap(store: WorkspaceData): WorkspaceData {
  return {
    ...store,
    async getHeatmap(userId, classId) {
      const [cells, roster] = await Promise.all([
        store.getHeatmap(userId, classId),
        store.listStudents(userId, classId),
      ]);
      const onRoster = new Set(roster.map((student) => student.id));
      return cells.filter((cell) => onRoster.has(cell.studentId));
    },
  };
}

let cached: DataSource | null = null;

/**
 * The two batched reads.
 *
 * `unstable_cache` is deliberately NOT used anywhere in this file. The existing
 * writes invalidate with `revalidatePath`, which does not address `unstable_cache`
 * entries by tag, so a tagged entry here would survive the write that should have
 * cleared it and a teacher would edit a grade and still see the old one. React's
 * per-request `cache()` below gives the deduplication benefit with none of that
 * risk: its store is thrown away when the request ends, so a write can never be
 * followed by a stale read in a later render.
 */
function withBatchReads(source: WorkspaceData): DataSource {
  return {
    ...source,
    // One `in(...)` read instead of one read per class. The roster panel needs
    // the real student rows for whichever class the teacher selects on the
    // client, so this returns records rather than a count.
    listStudentsForClasses: source.listStudentsForClasses ?? (async (userId, classIds) => {
      const groups = await Promise.all(classIds.map((id) => source.listStudents(userId, id)));
      return groups.flat();
    }),
    // An in-memory store has no round trips to save, so the fallback still costs
    // nothing here; it exists so both adapters answer the same question.
    countSlidesByDeck: source.countSlidesByDeck ?? (async (userId, deckIds) => {
      const counted = await Promise.all(
        deckIds.map(async (id) => [id, (await source.listSlides(userId, id)).length] as const),
      );
      return Object.fromEntries(counted);
    }),
  };
}

/**
 * Per-request read cache.
 *
 * Each wrapper is keyed on the arguments React is given, and `userId` is always
 * the first one, so a cached entry is reachable only by the same owner who
 * produced it. No entry outlives the request that built it, which is what makes
 * this safe next to the writes: `revalidatePath` plus `router.refresh()` starts a
 * fresh render with a fresh cache, so an edit is never served from the old one.
 *
 * Callers only ever pass a session id from `requirePagePermission` /
 * `requireSession`, so there is no unauthenticated path to a cached read.
 */
function withRequestCache(source: DataSource): DataSource {
  return {
    ...source,
    listClasses: cache((userId: string) => source.listClasses(userId)),
    listPolicies: cache((userId: string) => source.listPolicies(userId)),
    listDecks: cache((userId: string) => source.listDecks(userId)),
  };
}

/**
 * The data source for this request.
 *
 * Cached per process. `supabase` mode never falls back to fixtures: if the
 * client cannot be built the call throws, because silently serving demo data in
 * production is the one failure this module exists to prevent.
 */
export async function data(): Promise<DataSource> {
  if (cached) return cached;

  cached = withRequestCache(
    withBatchReads(isSupabaseMode() ? supabaseAdapter : await fixtureAdapter()),
  );
  return cached;
}

/** Test seam: lets a suite inject a stub without touching module state. */
export function __setDataSource(next: WorkspaceData | null): void {
  cached = next === null ? null : withRequestCache(withBatchReads(next));
}

export { assertRealDataMode };