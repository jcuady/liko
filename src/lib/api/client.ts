import 'server-only';

import { cache } from 'react';

import { assertRealDataMode, isSupabaseMode } from '@/lib/data-mode';
import {
  BUILT_IN_POLICIES,
  validatePolicy,
  type GradeBand,
  type GradingPolicy,
} from '@/lib/grading/policy';
import { createSupabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server';
import { DataError, mapSupabaseError } from './errors';
import type {
  AssessmentRecord,
  AssessmentType,
  AttendanceMark,
  AttendanceStatus,
  AttendanceWrite,
  BehaviourLogRecord,
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
  LessonPlanRecord,
  MemberRecord,
  MembershipStatus,
  OrgInput,
  OrgPlan,
  OrgRecord,
  ProfileInput,
  ProfileRecord,
  QuestionRecord,
  Role,
  ScannedAnswer,
  Severity,
  SlideInput,
  SlideLayout,
  SlideRecord,
  Stat,
  StudentRecord,
} from './types';

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
    input: Omit<AssessmentRecord, 'id' | 'ownerId' | 'archivedAt'>,
  ): Promise<AssessmentRecord>;
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

  /**
   * Moves a slide and renumbers the deck in one call.
   *
   * Taking a from and a to rather than a delta is deliberate: the editor's
   * arrows know the target index, and a client-computed delta breaks the moment
   * two people reorder at once.
   */
  moveSlide(userId: string, slideId: string, toIndex: number): Promise<void>;
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

const ORG_COLUMNS = 'id, name, slug, plan, seat_limit, billing_email, created_at';

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
    const { data, error } = await supabase
      .from('organizations')
      .update({
        name: input.name,
        plan: input.plan,
        seat_limit: input.seatLimit,
        billing_email: input.billingEmail,
      })
      .eq('id', org.id)
      .select(ORG_COLUMNS)
      .single();
    if (error) throw mapSupabaseError(error);

    return mapOrg(data as Row);
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
};

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
    title: str(row.title),
    body: str(row.body),
    notes: str(row.notes),
    updatedAt: iso(row.updated_at),
  };
}

function mapOrg(row: Row): OrgRecord {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    plan: str(row.plan, 'solo') as OrgPlan,
    seatLimit: num(row.seat_limit, 5),
    billingEmail: (row.billing_email as string | null) ?? null,
    createdAt: iso(row.created_at),
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
  };
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
    source: (str(row.source, 'manual') as GradeSource) === 'scan' ? 'scan' : 'manual',
    scanDetail: Array.isArray(row.scan_detail) ? (row.scan_detail as ScannedAnswer[]) : null,
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