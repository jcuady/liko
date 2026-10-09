import { assertRealDataMode } from '@/lib/data-mode';
import { findUserById, isDemoAccount, setAccountRole } from '@/lib/auth/store';
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
  demoOrg,
  demoMemberships,
  demoDecks,
  demoSlides,
  demoQuestions,
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
  DeckRecord,
  GradeRecord,
  GradingPolicyRecord,
  HeatCell,
  HistoryRecord,
  LessonPlanRecord,
  MemberRecord,
  OrgRecord,
  ProfileRecord,
  QuestionRecord,
  SlideRecord,
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
  questions: QuestionRecord[];
  grades: GradeRecord[];
  plans: LessonPlanRecord[];
  behaviour: BehaviourLogRecord[];
  history: HistoryRecord[];
  policies: GradingPolicyRecord[];
  /** Keyed by user id. The demo account is seeded; anyone else starts blank. */
  profiles: Map<string, ProfileRecord>;
  /**
   * Keyed by id. The demo school is seeded; every account registered during a
   * session gets its own, which is what a real signup produces.
   */
  orgs: Map<string, OrgRecord>;
  memberships: MemberRecord[];
  decks: DeckRecord[];
  slides: SlideRecord[];
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
      /*
       * `accountId` is null on every seeded row, which is the honest default:
       * most students on a roster never need to sign in, and a demo that
       * pre-linked five children to logins would misrepresent the normal state.
       * The `student@` and `guardian@` demo accounts exist for the permission
       * matrix; they are not attached to a roster row until a teacher issues a
       * login from /classes, which is the only thing that can set this column.
       */
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
        accountId: null,
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
        accountId: null,
      })),
    ],
    attendance: demoAttendance(),
    assessments: demoAssessments,
    questions: demoQuestions,
    grades: demoGrades,
    plans: demoPlans,
    behaviour: demoBehaviour,
    history: demoHistory,
    policies: demoPolicies,
    profiles: new Map(demoProfiles.map((profile) => [profile.id, profile])),
    orgs: new Map([[demoOrg.id, { ...demoOrg }]]),
    memberships: demoMemberships.map((member) => ({ ...member })),
    decks: demoDecks.map((deck) => ({ ...deck })),
    slides: demoSlides.map((slide) => ({ ...slide })),
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

function activeMembership(store: FixtureStore, userId: string): MemberRecord | null {
  return store.memberships.find((row) => row.userId === userId && row.status === 'active') ?? null;
}

/** Active admins of one organisation, which is the count that keeps a tenant recoverable. */
function countAdmins(store: FixtureStore, orgId: string): number {
  return store.memberships.filter(
    (row) => row.orgId === orgId && row.role === 'admin' && row.status === 'active',
  ).length;
}

/**
 * The organisation a newly registered account belongs to.
 *
 * One person, one organisation, and they administer it. Created on first use and
 * cached on the store so the id is stable for the life of the process.
 */
function personalOrg(userId: string, store: FixtureStore): { org: OrgRecord; membership: MemberRecord } {
  const existing = store.memberships.find((row) => row.userId === userId);
  if (existing) {
    const found = store.orgs.get(existing.orgId);
    if (found) return { org: found, membership: existing };
  }

  const orgId = `org_personal_${userId}`;
  const createdAt = new Date().toISOString();
  const org: OrgRecord = {
    id: orgId,
    name: 'My workspace',
    slug: `solo-${userId.slice(-8)}`,
    plan: 'solo',
    seatLimit: 1,
    billingEmail: null,
    createdAt,
  };

  const membership: MemberRecord = {
    id: `mem_personal_${userId}`,
    userId,
    orgId,
    fullName: '',
    email: '',
    role: 'admin',
    status: 'active',
    joinedAt: createdAt,
  };

  store.orgs.set(orgId, org);
  store.memberships.push(membership);

  return { org, membership };
}

/**
 * Refuses a membership write that is not made by an active admin of the same
 * organisation.
 *
 * The actions gate on `user:manage` already; this is the inner check, because a
 * server action is a public endpoint and the role in the session is only half the
 * answer to whose organisation a member id belongs to.
 */
function requireOrgManager(store: FixtureStore, userId: string, memberId: string): MemberRecord {
  const caller = activeMembership(store, userId);
  if (caller?.role !== 'admin') {
    throw new DataError('FORBIDDEN', 'Only an admin can manage people in this organisation.');
  }

  const target = store.memberships.find((row) => row.id === memberId);
  if (!target || target.orgId !== caller.orgId) {
    // Deliberately the same shape as a genuine miss: a crafted id from another
    // school should be indistinguishable from one that never existed.
    throw new DataError('NOT_FOUND', 'That person is not in your organisation.');
  }

  return target;
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
      Object.assign(existing, input, {
        source: input.source ?? 'manual',
        scanDetail: input.source === 'scan' ? (input.scanDetail ?? null) : null,
        gradedAt: new Date().toISOString(),
      });
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
      source: input.source ?? 'manual',
      scanDetail: input.source === 'scan' ? (input.scanDetail ?? null) : null,
      gradedAt: new Date().toISOString(),
    };
    store.grades = [...store.grades, record];
    return record;
  },

  async getAssessment(_userId, assessmentId) {
    guard('getAssessment');
    return store.assessments.find((row) => row.id === assessmentId) ?? null;
  },

  async listQuestions(_userId, assessmentId) {
    guard('listQuestions');
    return store.questions
      .filter((row) => row.assessmentId === assessmentId)
      .sort((a, b) => a.position - b.position);
  },

  async saveQuestions(_userId, questions) {
    guard('saveQuestions');
    if (questions.length === 0) return [];
    const assessmentId = questions[0]!.assessmentId;

    // Whole-set replace, mirroring the Supabase adapter: rows the caller dropped
    // are deleted rather than left behind, so the fixture cannot drift into
    // agreeing with production on updates while disagreeing on deletions.
    const kept = new Set(questions.map((q) => q.id).filter(Boolean));
    store.questions = [
      ...store.questions.filter(
        (row) => row.assessmentId !== assessmentId || (row.id && kept.has(row.id)),
      ),
      ...questions.map((question, index) => ({
        ...question,
        id: question.id ?? `qst_${assessmentId}_${index + 1}`,
        ownerId: OWNER,
        assessmentId,
        position: question.position ?? index,
      })),
    ];
    return store.questions
      .filter((row) => row.assessmentId === assessmentId)
      .sort((a, b) => a.position - b.position);
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
      orgId: null,
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

  /*
   * Tenancy.
   *
   * The demo accounts are one school's staff. An account registered during a
   * session is its own organisation with itself as the only admin, which is what
   * a real signup produces, and it keeps the admin page from showing a new
   * teacher a roster of strangers they did not invite.
   */
  async getOrg(userId) {
    guard('getOrg');
    const membership = activeMembership(store, userId);
    if (membership) {
      const org = store.orgs.get(membership.orgId);
      if (org) return { ...org };
    }
    if (isDemoAccount(userId)) return { ...(store.orgs.get(demoOrg.id) as OrgRecord) };
    return { ...personalOrg(userId, store).org };
  },

  async updateOrg(userId, input) {
    guard('updateOrg');

    const membership = activeMembership(store, userId);
    if (membership?.role !== 'admin') {
      throw new DataError('FORBIDDEN', 'Only an admin can change the organisation.');
    }

    const org = store.orgs.get(membership.orgId);
    if (!org) throw new DataError('NOT_FOUND', 'This account has no organisation yet.');

    org.name = input.name;
    org.plan = input.plan;
    org.seatLimit = input.seatLimit;
    org.billingEmail = input.billingEmail;

    return { ...org };
  },

  async listMembers(userId) {
    guard('listMembers');

    const membership = activeMembership(store, userId);
    if (!membership) return [];
    const org = store.orgs.get(membership.orgId);
    if (!org) return [];

    const rows = store.memberships.filter((row) => row.orgId === org.id);
    // Names and addresses are read from the profiles those accounts already
    // have, so a change to someone's name shows up here instead of leaving a
    // second copy in this table to drift out of step with it.
    const profiles = await Promise.all(rows.map((row) => fixtures.getProfile(row.userId)));

    return rows.map((row, index) => ({
      ...row,
      fullName: profiles[index]?.fullName || row.fullName,
      email: profiles[index]?.email || row.email,
    }));
  },

  async setMemberRole(userId, memberId, role) {
    guard('setMemberRole');
    const member = requireOrgManager(store, userId, memberId);

    // Demoting the last admin would leave the organisation with nobody who can
    // manage it and nobody who could restore that. Refused with a reason rather
    // than performed.
    if (member.role === 'admin' && role !== 'admin' && countAdmins(store, member.orgId) === 1) {
      throw new DataError('CONFLICT', 'This is the only admin. Promote someone else first.');
    }

    member.role = role;

    // The account's own role follows, because that is what the permission matrix
    // and the session are checked against. Writing only the membership would
    // leave the console promising a change it had not actually made.
    await setAccountRole(member.userId, role);
    const profile = store.profiles.get(member.userId);
    if (profile) profile.role = role;
  },

  async setMemberStatus(userId, memberId, status) {
    guard('setMemberStatus');
    const member = requireOrgManager(store, userId, memberId);

    if (member.userId === userId && status === 'suspended') {
      throw new DataError('CONFLICT', 'You cannot suspend your own access.');
    }
    if (member.role === 'admin' && status === 'suspended' && countAdmins(store, member.orgId) === 1) {
      throw new DataError('CONFLICT', 'This is the only admin. Promote someone else first.');
    }

    member.status = status;

    /*
     * Suspension has to reach the session too. The session carries a copy of
     * the account role, so without this a suspended colleague would keep working
     * until their token expired, which is the opposite of what a suspension is
     * for.
     */
    const profile = store.profiles.get(member.userId);
    if (profile) profile.orgId = status === 'active' ? member.orgId : null;
  },

  /*
   * Slide decks.
   *
   * Ownership follows the classes: the demo workspace's deck belongs to the demo
   * accounts, and an account registered during a session sees only what it
   * created. An editor that opened onto somebody else's lesson would be worse
   * than an empty one.
   */
  async listDecks(userId) {
    guard('listDecks');
    const rows = isDemoAccount(userId) ? store.decks : store.decks.filter((d) => d.ownerId === userId);
    return rows
      .filter((deck) => deck.archivedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((deck) => ({ ...deck }));
  },

  async createDeck(userId, input) {
    guard('createDeck');
    const now = new Date().toISOString();
    const deck: DeckRecord = {
      id: `deck_${store.decks.length + 1}`,
      ownerId: userId,
      title: input.title,
      description: input.description,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.decks = [...store.decks, deck];

    // A deck with no slides cannot be opened, so a new one opens with a title
    // slide. That is also what the teacher is about to replace.
    store.slides = [
      ...store.slides,
      {
        id: `sld_${store.slides.length + 1}`,
        deckId: deck.id,
        ownerId: userId,
        position: 0,
        layout: 'title',
        title: input.title,
        body: '',
        notes: '',
        updatedAt: now,
      },
    ];

    return { ...deck };
  },

  async updateDeck(userId, deckId, input) {
    guard('updateDeck');
    const deck = ownedDeck(store, userId, deckId);
    deck.title = input.title;
    deck.description = input.description;
    deck.updatedAt = new Date().toISOString();
    return { ...deck };
  },

  async archiveDeck(userId, deckId) {
    guard('archiveDeck');
    const deck = ownedDeck(store, userId, deckId);
    // Soft delete, like everything else that has history behind it.
    deck.archivedAt = new Date().toISOString();
  },

  async listSlides(userId, deckId) {
    guard('listSlides');
    return deckSlides(store, userId, deckId).map((slide) => ({ ...slide }));
  },

  async createSlide(userId, deckId, input) {
    guard('createSlide');
    const deck = ownedDeck(store, userId, deckId);
    const siblings = deckSlides(store, userId, deckId);
    const now = new Date().toISOString();

    const slide: SlideRecord = {
      id: `sld_${store.slides.length + 1}`,
      deckId: deck.id,
      ownerId: userId,
      // Appended, never inserted at a chosen index, so two people adding at
      // once cannot collide on the same position.
      position: siblings.length,
      layout: input.layout ?? 'bullets',
      title: input.title ?? '',
      body: input.body ?? '',
      notes: input.notes ?? '',
      updatedAt: now,
    };

    store.slides = [...store.slides, slide];
    deck.updatedAt = now;
    return { ...slide };
  },

  async updateSlide(userId, slideId, input) {
    guard('updateSlide');
    const slide = ownedSlide(store, userId, slideId);

    slide.layout = input.layout;
    slide.title = input.title;
    slide.body = input.body;
    slide.notes = input.notes;
    slide.updatedAt = new Date().toISOString();

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = slide.updatedAt;

    return { ...slide };
  },

  async deleteSlide(userId, slideId) {
    guard('deleteSlide');
    const slide = ownedSlide(store, userId, slideId);

    store.slides = store.slides.filter((row) => row.id !== slideId);
    resequenceSlides(store, userId, slide.deckId);

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = new Date().toISOString();
  },

  async moveSlide(userId, slideId, toIndex) {
    guard('moveSlide');
    const slide = ownedSlide(store, userId, slideId);
    const siblings = deckSlides(store, userId, slide.deckId);

    const from = siblings.findIndex((row) => row.id === slideId);
    if (from === -1) throw new DataError('NOT_FOUND', 'That slide no longer exists.');

    const target = Math.max(0, Math.min(toIndex, siblings.length - 1));
    if (target === from) return;

    const reordered = [...siblings];
    reordered.splice(from, 1);
    reordered.splice(target, 0, slide);

    reordered.forEach((row, index) => {
      row.position = index;
    });

    const deck = store.decks.find((row) => row.id === slide.deckId);
    if (deck) deck.updatedAt = new Date().toISOString();
  },
};

/** Slides of one deck, in presentation order. */
function deckSlides(store: FixtureStore, userId: string, deckId: string): SlideRecord[] {
  return store.slides
    .filter((slide) => slide.deckId === deckId)
    .filter((slide) => isDemoAccount(userId) || slide.ownerId === userId)
    .sort((a, b) => a.position - b.position);
}

/** Renumbers a deck so positions are contiguous, with no gap or duplicate. */
function resequenceSlides(store: FixtureStore, userId: string, deckId: string): void {
  deckSlides(store, userId, deckId).forEach((slide, index) => {
    slide.position = index;
  });
}

function ownedDeck(store: FixtureStore, userId: string, deckId: string): DeckRecord {
  const deck = store.decks.find((row) => row.id === deckId);
  // A deck that is not this account's is reported exactly as one that does not
  // exist, so a crafted id cannot confirm that somebody else's deck is real.
  if (!deck || (!isDemoAccount(userId) && deck.ownerId !== userId)) {
    throw new DataError('NOT_FOUND', 'That deck does not exist.');
  }
  return deck;
}

function ownedSlide(store: FixtureStore, userId: string, slideId: string): SlideRecord {
  const slide = store.slides.find((row) => row.id === slideId);
  if (!slide || (!isDemoAccount(userId) && slide.ownerId !== userId)) {
    throw new DataError('NOT_FOUND', 'That slide does not exist.');
  }
  return slide;
}