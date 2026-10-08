import { assertRealDataMode } from '@/lib/data-mode';
import { findUserById, isDemoAccount } from '@/lib/auth/store';
import {
  BUILT_IN_POLICIES,
  validatePolicy,
  type GradingPolicy,
} from '@/lib/grading/policy';
import { DataError } from './errors';
import {
  demoAssessments,
  demoAttendance,
  demoBehaviour,
  demoGrades,
  demoHistory,
  demoPlans,
  demoPolicies,
  demoProfiles,
  secondClassStudents,
} from '@/lib/fixtures/workspace-seed';
import {
  attendance,
  heatmap,
  stats,
  students as fixtureStudents,
} from '@/lib/fixtures/workspace';
import type {
  AssessmentRecord,
  AttendanceStatus,
  AttendanceWrite,
  BehaviourLogRecord,
  ClassRecord,
  GradeRecord,
  GradingPolicyRecord,
  HeatCell,
  HistoryRecord,
  LessonPlanRecord,
  ProfileRecord,
  Stat,
  StudentRecord,
} from './types';
import type { WorkspaceData } from './client';

/**
 * Fixture adapter.
 *
 * Serves the built-in demo workspace so the marketing page, the hero device
 * mockups and the Playwright suite run with no network and no database.
 *
 * Every read passes through `assertRealDataMode`, so if `LIKO_DATA_MODE` is ever
 * `supabase` and this file is reached anyway, it throws on the first call rather
 * than quietly showing one teacher another set of demo names.
 *
 * The old `client.ts` this replaces simulated latency with a fixed sleep and
 * then returned fixtures. The delay is gone: it made every screen feel broken
 * without testing anything, and the real path's timing now comes from the
 * network.
 */

const CLASS_ID = 'cls_demo_01';
const SECOND_CLASS_ID = 'cls_demo_02';
const OWNER = 'demo-owner';

function guard(operation: string): void {
  assertRealDataMode(operation);
}

interface FixtureStore {
  classes: ClassRecord[];
  students: StudentRecord[];
  attendance: Map<string, Record<string, AttendanceStatus>>;
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
  plans: LessonPlanRecord[];
  behaviour: BehaviourLogRecord[];
  history: HistoryRecord[];
  policies: GradingPolicyRecord[];
  /** Keyed by user id. The demo account is seeded; anyone else starts blank. */
  profiles: Map<string, ProfileRecord>;
}

function createStore(): FixtureStore {
  return {
    classes: [
      {
        id: CLASS_ID,
        ownerId: OWNER,
        name: 'Chemistry, Period 2',
        code: 'CHEM-2',
        level: 'k12',
        meetsPerWeek: 5,
        archivedAt: null,
        gradingPolicyId: null,
      },
      {
        // Grades on UK degree classes, so the demo shows a real choice rather
        // than every class sitting on the percentage default.
        id: SECOND_CLASS_ID,
        ownerId: OWNER,
        name: 'Biology, Period 4',
        code: 'BIO-4',
        level: 'k12',
        meetsPerWeek: 4,
        archivedAt: null,
        gradingPolicyId: 'pol_demo_uk',
      },
    ],
    students: [
      ...fixtureStudents.map((student) => ({
        id: student.id,
        classId: CLASS_ID,
        ownerId: OWNER,
        fullName: student.name,
        initials: student.initials,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        archivedAt: null,
      })),
      ...secondClassStudents.map((student) => ({
        id: student.id,
        classId: SECOND_CLASS_ID,
        ownerId: OWNER,
        fullName: student.name,
        initials: student.initials,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        archivedAt: null,
      })),
    ],
    attendance: demoAttendance(),
    assessments: demoAssessments,
    grades: demoGrades,
    plans: demoPlans,
    behaviour: demoBehaviour,
    history: demoHistory,
    policies: demoPolicies,
    profiles: new Map(demoProfiles.map((profile) => [profile.id, profile])),
  };
}

/**
 * WHY THE STORE LIVES ON `globalThis`.
 *
 * A module-level `const store` is per *bundle*, not per process. Next gives a
 * page and the server action it calls separate copies of a shared module, so a
 * `createClass` write updated the action's copy while the page re-render read
 * the page's copy. The dialog reported success and nothing appeared: creating a
 * class, or adding a student, silently did nothing until a server restart.
 *
 * Storing it on the global object makes it a real singleton for the life of the
 * process, which is what an in-memory demo workspace has to be. In `supabase`
 * mode this file is unreachable, so nothing here is load-bearing in production.
 */
const globalScope = globalThis as typeof globalThis & {
  __likoFixtureStore?: FixtureStore;
};

const store: FixtureStore = (globalScope.__likoFixtureStore ??= createStore());

/**
 * The five scales that ship with the product, presented as records so the seam
 * hands every caller one list whether a scale is built in or authored. Mirrors
 * `builtInPolicies` in `client.ts`; both adapters must return the same shape.
 */
function builtInPolicies(): GradingPolicyRecord[] {
  return BUILT_IN_POLICIES.map((policy: GradingPolicy) => ({
    id: policy.id,
    ownerId: 'built-in',
    name: policy.label,
    kind: policy.kind,
    bands: [...policy.bands],
    builtIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  }));
}

function seededKey(classId: string, date: string): string {
  return `${classId}:${date}`;
}

export const fixtures: WorkspaceData = {
  async listClasses(userId) {
    guard('listClasses');
    /*
     * The seeded demo workspace belongs to the demo accounts. Anyone who
     * registered during a demo session sees only the classes they created
     * themselves, which is both what really happens and what lets first-run
     * onboarding mean anything: otherwise a brand new teacher appears to own a
     * full roster and the wizard skips itself as already answered.
     */
    if (isDemoAccount(userId)) return store.classes;
    return store.classes.filter((row) => row.ownerId === userId);
  },

  async listStudents(_userId, classId) {
    guard('listStudents');
    return store.students.filter((student) => student.classId === classId);
  },

  async listStats(): Promise<Stat[]> {
    guard('listStats');
    return stats;
  },

  async getHeatmap(): Promise<HeatCell[]> {
    guard('getHeatmap');
    return heatmap;
  },

  async getAttendance(_userId, classId, date) {
    guard('getAttendance');
    return store.attendance.get(seededKey(classId, date)) ?? attendance;
  },

  /*
   * These four took a classId and ignored it, so switching class in the
   * gradebook, planner, or assessment list kept showing the previous class's
   * rows. The Supabase adapter has always filtered correctly, which is exactly
   * why the fixture quietly disagreed with production instead of the other way
   * round.
   */
  async listAssessments(_userId, classId) {
    guard('listAssessments');
    return store.assessments.filter((row) => row.classId === classId);
  },

  async listGrades(_userId, classId) {
    guard('listGrades');
    const assessmentIds = new Set(
      store.assessments.filter((row) => row.classId === classId).map((row) => row.id),
    );
    return store.grades.filter((row) => assessmentIds.has(row.assessmentId));
  },

  async listLessonPlans(_userId, classId) {
    guard('listLessonPlans');
    return store.plans.filter((row) => row.classId === classId);
  },

  async listBehaviourLogs(_userId, classId) {
    guard('listBehaviourLogs');
    return store.behaviour.filter((row) => row.classId === classId);
  },

  async getStudentHistory(_userId, studentId) {
    guard('getStudentHistory');
    return store.history.filter((entry) => entry.studentId === studentId);
  },

  async markAttendance(_userId, write: AttendanceWrite) {
    guard('markAttendance');
    const key = seededKey(write.classId, write.date);
    const existing = store.attendance.get(key) ?? {};
    for (const mark of write.marks) {
      existing[mark.studentId] = mark.status;
    }
    store.attendance.set(key, existing);
  },

  async createClass(userId, input) {
    guard('createClass');
    const record: ClassRecord = {
      id: `cls_${store.classes.length + 1}`,
      // The real owner, not the demo owner, or a class a teacher just created
      // would be invisible to them: `listClasses` hands out the seeded demo
      // workspace only to the demo accounts.
      ownerId: userId,
      gradingPolicyId: null,
      ...input,
      archivedAt: null,
    };
    store.classes = [...store.classes, record];
    return record;
  },

  async archiveClass(_userId, classId) {
    guard('archiveClass');
    store.classes = store.classes.map((row) =>
      row.id === classId ? { ...row, archivedAt: new Date().toISOString() } : row,
    );
  },

  async createStudent(_userId, input) {
    guard('createStudent');
    const record: StudentRecord = {
      ...input,
      id: `stu_${store.students.length + 1}`,
      ownerId: OWNER,
      archivedAt: null,
    };
    store.students = [...store.students, record];
    return record;
  },

  async archiveStudent(_userId, studentId) {
    guard('archiveStudent');
    store.students = store.students.map((row) =>
      row.id === studentId ? { ...row, archivedAt: new Date().toISOString() } : row,
    );
  },

  async createAssessment(_userId, input) {
    guard('createAssessment');
    const record: AssessmentRecord = {
      ...input,
      id: `asm_${store.assessments.length + 1}`,
      ownerId: OWNER,
      archivedAt: null,
    };
    store.assessments = [...store.assessments, record];
    return record;
  },

  async upsertGrade(_userId, input) {
    guard('upsertGrade');
    const existing = store.grades.find(
      (row) =>
        row.assessmentId === input.assessmentId && row.studentId === input.studentId,
    );

    if (existing) {
      Object.assign(existing, input, { gradedAt: new Date().toISOString() });
      return existing;
    }

    const record: GradeRecord = {
      id: `grd_${store.grades.length + 1}`,
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      ownerId: OWNER,
      score: input.score,
      maxScore: input.maxScore,
      rubric: [],
      feedback: input.feedback ?? null,
      gradedAt: new Date().toISOString(),
    };
    store.grades = [...store.grades, record];
    return record;
  },

  async saveLessonPlan(_userId, input) {
    guard('saveLessonPlan');
    if (input.id) {
      const existing = store.plans.find((row) => row.id === input.id);
      if (existing) {
        Object.assign(existing, input);
        return existing;
      }
    }
    const record: LessonPlanRecord = {
      ...input,
      id: `plan_${store.plans.length + 1}`,
      ownerId: OWNER,
    };
    store.plans = [record, ...store.plans];
    return record;
  },

  async addBehaviourLog(_userId, input) {
    guard('addBehaviourLog');
    store.behaviour = [
      {
        id: `log_${store.behaviour.length + 1}`,
        ...input,
        ownerId: OWNER,
        createdAt: new Date().toISOString(),
      },
      ...store.behaviour,
    ];

    /*
     * A behaviour entry is also a line on the cumulative record. The history page
     * deliberately puts the entry form beside the timeline it feeds, and promises
     * the entry stays on the record. Writing only `behaviour` meant the note was
     * saved, the toast said it was, and the timeline never showed it.
     */
    await fixtures.appendHistory(_userId, {
      studentId: input.studentId,
      eventType: input.severity === 'note' ? 'note' : 'intervention',
      payload: { entry: input.entry, severity: input.severity },
    });
  },

  async appendHistory(_userId, input) {
    guard('appendHistory');
    store.history = [
      {
        id: `hist_${store.history.length + 1}`,
        studentId: input.studentId,
        ownerId: OWNER,
        eventType: input.eventType,
        payload: input.payload ?? {},
        occurredAt: new Date().toISOString(),
      },
      ...store.history,
    ];
  },

  async listPolicies(userId) {
    guard('listPolicies');
    /*
     * Authored scales belong to the account that wrote them, exactly as classes
     * do. Returning the whole list handed every newly registered teacher the
     * demo organisation's two custom scales on the onboarding screen, which is
     * both a data leak and a wrong first impression: those are not scales they
     * wrote and cannot edit.
     */
    return [
      ...builtInPolicies(),
      ...store.policies.filter((policy) => isDemoAccount(userId) || policy.ownerId === userId),
    ];
  },

  async savePolicy(userId, input) {
    guard('savePolicy');
    const problems = validatePolicy(input);
    if (problems.length > 0) {
      throw new DataError('INVALID', problems[0]);
    }

    if (input.id) {
      const existing = store.policies.find((policy) => policy.id === input.id);
      if (!existing) {
        throw new DataError('NOT_FOUND', 'That scale no longer exists.');
      }
      if (!isDemoAccount(userId) && existing.ownerId !== userId) {
        throw new DataError('FORBIDDEN', 'That scale belongs to another account.');
      }
      Object.assign(existing, { name: input.name, kind: input.kind, bands: input.bands });
      return existing;
    }

    const record: GradingPolicyRecord = {
      id: `pol_${store.policies.length + 1}`,
      ownerId: userId,
      name: input.name,
      kind: input.kind,
      bands: input.bands,
      builtIn: false,
      createdAt: new Date().toISOString(),
    };
    store.policies = [...store.policies, record];
    return record;
  },

  async setClassPolicy(_userId, classId, policyId) {
    guard('setClassPolicy');
    store.classes = store.classes.map((row) =>
      row.id === classId ? { ...row, gradingPolicyId: policyId } : row,
    );
  },

  async getProfile(userId) {
    guard('getProfile');

    const saved = store.profiles.get(userId);
    if (saved) return saved;

    /*
     * One profile per account, not one profile for the process.
     *
     * This was a single object, so every teacher who registered inherited the
     * demo account's school, subjects, and scale, which made `/welcome` see the
     * setup as already answered and redirect every new account straight past the
     * wizard. The profile follows the person, exactly as the `profiles` row does
     * in Supabase.
     *
     * The name and address come from the auth store, mirroring the
     * `handle_new_user` trigger, which copies them out of the signup metadata.
     */
    const account = await findUserById(userId);

    /*
     * The lookup above awaits, and `findUserById` seeds the demo accounts on
     * first use, which hashes with scrypt. A request that arrived in that gap
     * can already have written a real profile, so the cache is re-read before
     * this synthesised record is stored. Without the re-read, a stale
     * synthesise lands last and overwrites the name and answers the teacher
     * had just saved, which surfaced as a registration losing its name whenever
     * two requests for the same account overlapped.
     */
    const written = store.profiles.get(userId);
    if (written) return written;

    const synthesised: ProfileRecord = {
      id: userId,
      email: account?.email ?? '',
      fullName: account?.name ?? '',
      role: account?.role ?? 'instructor',
      schoolName: null,
      subjects: [],
      defaultGradeLevel: null,
      gradingPolicyId: null,
    };

    store.profiles.set(userId, synthesised);
    return synthesised;
  },

  async updateProfile(userId, input) {
    guard('updateProfile');
    const existing = await fixtures.getProfile(userId);
    // `getProfile` synthesises a record rather than returning null, so this cast
    // is only satisfying the seam's nullable signature. Spreading the union
    // directly would widen every field of `ProfileRecord` to optional.
    const record: ProfileRecord = { ...(existing as ProfileRecord), ...input };
    store.profiles.set(userId, record);
    return record;
  },
};