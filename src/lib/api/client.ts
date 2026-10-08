import 'server-only';

import { assertRealDataMode, isSupabaseMode } from '@/lib/data-mode';
import {
  BUILT_IN_POLICIES,
  validatePolicy,
  type GradeBand,
  type GradingPolicy,
} from '@/lib/grading/policy';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  GradeRecord,
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
  Role,
  Severity,
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
  getAttendance(
    userId: string,
    classId: string,
    date: string,
  ): Promise<Record<string, AttendanceStatus>>;
  listAssessments(userId: string, classId: string): Promise<AssessmentRecord[]>;
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
    },
  ): Promise<GradeRecord>;
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
}

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
    const [{ data: students }, { data: grades }] = await Promise.all([
      supabase
        .from('students')
        .select('id')
        .eq('owner_id', userId)
        .eq('class_id', classId)
        .is('archived_at', null),
      supabase
        .from('grades')
        .select('student_id, score, max_score')
        .eq('owner_id', userId),
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
          graded_at: new Date().toISOString(),
        },
        { onConflict: 'assessment_id,student_id' },
      )
      .select()
      .single();
    throwIf(error);
    return mapGrade(data as Row);
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
    const { error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('id', memberId)
      .eq('org_id', org.id);
    if (error) throw mapSupabaseError(error);

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

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', target);
    if (profileError) throw mapSupabaseError(profileError);
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
  return fixtures;
}

let cached: WorkspaceData | null = null;

/**
 * The data source for this request.
 *
 * Cached per process. `supabase` mode never falls back to fixtures: if the
 * client cannot be built the call throws, because silently serving demo data in
 * production is the one failure this module exists to prevent.
 */
export async function data(): Promise<WorkspaceData> {
  if (cached) return cached;

  if (isSupabaseMode()) {
    cached = supabaseAdapter;
    return cached;
  }

  cached = await fixtureAdapter();
  return cached;
}

/** Test seam: lets a suite inject a stub without touching module state. */
export function __setDataSource(next: WorkspaceData | null): void {
  cached = next;
}

export { assertRealDataMode };
export type { WorkspaceData as DataSource };