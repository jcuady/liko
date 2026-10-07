/**
 * Query key factory.
 *
 * One place decides what a cache entry means. The routes used to hold marks in
 * component state with no cache at all, so two screens open at once disagreed
 * about the same grade until a full reload.
 *
 * Every key is a tuple under the `workspace` root so a mutation can invalidate a
 * whole class's data with one prefix match, and so two screens keyed on the same
 * class share a cache entry instead of each fetching their own copy.
 *
 * Keys are scoped by the ids that actually change the result. Attendance is
 * keyed by class AND date because the register for one day says nothing about
 * another, and collapsing them would let a cached Tuesday overwrite Thursday.
 */

export const queryKeys = {
  workspace: () => ['workspace'] as const,

  classes: () => ['workspace', 'classes'] as const,

  students: (classId: string) => ['workspace', 'classes', classId, 'students'] as const,

  stats: (classId: string | null) => ['workspace', 'stats', classId ?? 'all'] as const,

  heatmap: (classId: string) => ['workspace', 'classes', classId, 'heatmap'] as const,

  attendance: (classId: string, date: string) =>
    ['workspace', 'classes', classId, 'attendance', date] as const,

  assessments: (classId: string) => ['workspace', 'classes', classId, 'assessments'] as const,

  grades: (classId: string) => ['workspace', 'classes', classId, 'grades'] as const,

  lessonPlans: (classId: string) => ['workspace', 'classes', classId, 'lesson-plans'] as const,

  behaviourLogs: (classId: string) =>
    ['workspace', 'classes', classId, 'behaviour-logs'] as const,

  history: (studentId: string) => ['workspace', 'students', studentId, 'history'] as const,
} as const;
