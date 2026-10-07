import { assertRealDataMode } from '@/lib/data-mode';
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
  HeatCell,
  HistoryRecord,
  LessonPlanRecord,
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
const OWNER = 'demo-owner';

function guard(operation: string): void {
  assertRealDataMode(operation);
}

const store: {
  classes: ClassRecord[];
  students: StudentRecord[];
  attendance: Map<string, Record<string, AttendanceStatus>>;
  assessments: AssessmentRecord[];
  grades: GradeRecord[];
  plans: LessonPlanRecord[];
  behaviour: BehaviourLogRecord[];
  history: HistoryRecord[];
} = {
  classes: [
    {
      id: CLASS_ID,
      ownerId: OWNER,
      name: 'Chemistry, Period 2',
      code: 'CHEM-2',
      level: 'k12',
      meetsPerWeek: 5,
      archivedAt: null,
    },
  ],
  students: fixtureStudents.map((student) => ({
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
  attendance: new Map<string, Record<string, AttendanceStatus>>(),
  assessments: [],
  grades: [],
  plans: [],
  behaviour: [],
  history: [],
};

function seededKey(classId: string, date: string): string {
  return `${classId}:${date}`;
}

export const fixtures: WorkspaceData = {
  async listClasses() {
    guard('listClasses');
    return store.classes;
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

  async listAssessments() {
    guard('listAssessments');
    return store.assessments;
  },

  async listGrades() {
    guard('listGrades');
    return store.grades;
  },

  async listLessonPlans() {
    guard('listLessonPlans');
    return store.plans;
  },

  async listBehaviourLogs() {
    guard('listBehaviourLogs');
    return store.behaviour;
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

  async createClass(_userId, input) {
    guard('createClass');
    const record: ClassRecord = {
      id: `cls_${store.classes.length + 1}`,
      ownerId: OWNER,
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
};