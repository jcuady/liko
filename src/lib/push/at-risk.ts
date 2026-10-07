import 'server-only';

import { sendPushToUser, type PushSummary } from './send';
import { createSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The at-risk sweep.
 *
 * Runs on a schedule, walks the teachers who have at least one push
 * subscription, and tells each of them which of their students have drifted. The
 * work happens here rather than inside the route so the GET and POST entry
 * points cannot drift apart: Vercel's cron only issues GET on the Hobby plan,
 * and both verbs must produce identical results.
 *
 * THE THRESHOLD IS NOT INVENTED HERE. `getHeatmap()` in `src/lib/api/client.ts`
 * already classifies a student as at risk below 55 percent mean, and its own
 * comment asks that the rule live in one place so the heatmap and the alert
 * cannot disagree. `AT_RISK_MEAN_PERCENT` is that same boundary.
 *
 * WHY ONE ALERT PER TEACHER AND NOT PER STUDENT. A teacher with nine slipping
 * students should get one notification they can act on, not nine banners. The
 * per-student cooldown below is what keeps the digest honest: once a student has
 * been reported, they drop out of the list until the cooldown expires, so the
 * next notification is about whatever changed since.
 *
 * WHY `intervention` IS THE EVENT TYPE. The `student_history.event_type` CHECK
 * constraint in `20260101000000_initial_schema.sql` allows exactly `enrolled`,
 * `attendance_flag`, `standard_mastered`, `assessment_scored`, `intervention`,
 * and `note`. There is no `at_risk_alert` value and the migration is not owned by
 * this phase, so an at-risk record is stored as `intervention` carrying a
 * payload marker. The marker is what the dedupe query filters on, which is why
 * the dedupe is a JSON path filter and not a bare `event_type` match: it must not
 * treat a genuine human intervention note as an alert we already sent.
 */

type Row = Record<string, unknown>;

/** Same boundary the heatmap uses for its `at-risk` level. */
export const AT_RISK_MEAN_PERCENT = 55;

/** Absences in the attendance window that count as a pattern rather than a bad day. */
export const ABSENCE_THRESHOLD = 2;

/** How far back attendance is counted. */
export const ATTENDANCE_WINDOW_DAYS = 14;

/** One at-risk alert per student per this many days. */
export const ALERT_COOLDOWN_DAYS = 7;

/** Payload marker on `student_history`, matched by the dedupe query. */
const ALERT_MARKER = 'at_risk';

export interface AtRiskStudent {
  studentId: string;
  name: string;
  classId: string;
  /** Null when the student has no graded work yet, so the absence signal stands alone. */
  meanPercent: number | null;
  absences: number;
  reasons: string[];
}

export interface SweepResult {
  /** Teachers examined, which is every user holding at least one subscription. */
  teachers: number;
  /** Students alerted about. */
  alerted: number;
  /** At-risk students skipped because they were alerted on within the cooldown. */
  suppressed: number;
  /** Push notifications sent. */
  notifications: number;
  /** Endpoints deleted after a 404 or 410. */
  pruned: number;
  /** Transient send failures. */
  failed: number;
}

interface SweepOptions {
  /** Restricts the run to one teacher. Used by manual verification. */
  ownerId?: string;
  /** Sends the grade and attendance digest as well as the at-risk alert. */
  includeSummary?: boolean;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function percent(mean: number): string {
  return `${Math.round(mean)} percent`;
}

/**
 * Collects the teachers worth sweeping. Anyone without a stored subscription
 * cannot be reached, so they are skipped rather than reported as failures.
 */
async function teachersToSweep(
  admin: NonNullable<Awaited<ReturnType<typeof createSupabaseAdmin>>>,
  ownerId?: string,
): Promise<string[]> {
  if (ownerId) return [ownerId];

  const { data } = await admin.from('push_subscriptions').select('user_id');
  const unique = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    const id = str(row.user_id);
    if (id) unique.add(id);
  }

  return [...unique];
}

function evaluate(
  student: Row,
  scores: number[],
  absences: number,
): AtRiskStudent | null {
  const studentId = str(student.id);
  if (!studentId) return null;

  const reasons: string[] = [];

  const mean =
    scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;

  if (mean !== null && mean < AT_RISK_MEAN_PERCENT) {
    reasons.push(`mean grade ${percent(mean)}`);
  }
  if (absences >= ABSENCE_THRESHOLD) {
    reasons.push(`${absences} absences in the last ${ATTENDANCE_WINDOW_DAYS} days`);
  }

  if (reasons.length === 0) return null;

  return {
    studentId,
    name: str(student.full_name, 'A student'),
    classId: str(student.class_id),
    meanPercent: mean === null ? null : Number(mean.toFixed(1)),
    absences,
    reasons,
  };
}

function digestBody(names: string[]): string {
  const shown = names.slice(0, 2).join(' and ');
  const rest = names.length - 2;
  return rest > 0 ? `${shown}, plus ${rest} more` : shown;
}

export async function runAtRiskSweep(options: SweepOptions = {}): Promise<SweepResult> {
  const result: SweepResult = {
    teachers: 0,
    alerted: 0,
    suppressed: 0,
    notifications: 0,
    pruned: 0,
    failed: 0,
  };

  const admin = await createSupabaseAdmin();
  if (!admin) {
    throw new Error('The at-risk sweep needs the service role key.');
  }

  const teachers = await teachersToSweep(admin, options.ownerId);
  result.teachers = teachers.length;

  const attendanceFrom = isoDateDaysAgo(ATTENDANCE_WINDOW_DAYS);
  const cooldownFrom = isoDaysAgo(ALERT_COOLDOWN_DAYS);

  for (const ownerId of teachers) {
    const [studentsResult, gradesResult, attendanceResult, historyResult] = await Promise.all([
      admin
        .from('students')
        .select('id, class_id, full_name')
        .eq('owner_id', ownerId)
        .is('archived_at', null),
      admin
        .from('grades')
        .select('student_id, score, max_score')
        .eq('owner_id', ownerId)
        .not('score', 'is', null),
      admin
        .from('attendance')
        .select('student_id, status')
        .eq('owner_id', ownerId)
        .gte('date', attendanceFrom),
      admin
        .from('student_history')
        .select('student_id')
        .eq('owner_id', ownerId)
        .eq('event_type', 'intervention')
        .gte('occurred_at', cooldownFrom)
        .filter('payload->>alert', 'eq', ALERT_MARKER),
    ]);

    const students = (studentsResult.data ?? []) as Row[];

    const scoresByStudent = new Map<string, number[]>();
    for (const row of (gradesResult.data ?? []) as Row[]) {
      const id = str(row.student_id);
      const score = num(row.score);
      const max = num(row.max_score);
      if (!id || score === null || max === null || max <= 0) continue;
      const list = scoresByStudent.get(id) ?? [];
      list.push((score / max) * 100);
      scoresByStudent.set(id, list);
    }

    const absencesByStudent = new Map<string, number>();
    for (const row of (attendanceResult.data ?? []) as Row[]) {
      if (str(row.status) !== 'absent') continue;
      const id = str(row.student_id);
      if (!id) continue;
      absencesByStudent.set(id, (absencesByStudent.get(id) ?? 0) + 1);
    }

    const alreadyAlerted = new Set(
      ((historyResult.data ?? []) as Row[]).map((row) => str(row.student_id)),
    );

    const atRisk: AtRiskStudent[] = [];
    for (const student of students) {
      const id = str(student.id);
      const candidate = evaluate(
        student,
        scoresByStudent.get(id) ?? [],
        absencesByStudent.get(id) ?? 0,
      );
      if (!candidate) continue;

      if (alreadyAlerted.has(id)) {
        result.suppressed += 1;
        continue;
      }

      atRisk.push(candidate);
    }

    if (atRisk.length > 0) {
      // Recorded before the send. A push that fails is preferable to a record we
      // skipped, because the cost of the mistake is one delayed alert rather
      // than a week of silence about a student who needs help.
      const { error: historyError } = await admin.from('student_history').insert(
        atRisk.map((student) => ({
          owner_id: ownerId,
          student_id: student.studentId,
          event_type: 'intervention',
          payload: {
            alert: ALERT_MARKER,
            meanPercent: student.meanPercent,
            absences: student.absences,
            reasons: student.reasons,
            cooldownDays: ALERT_COOLDOWN_DAYS,
          },
        })),
      );

      if (historyError === null) {
        result.alerted += atRisk.length;
      }

      const names = atRisk.map((student) => student.name);
      const summary: PushSummary = await sendPushToUser(ownerId, {
        title: atRisk.length === 1 ? '1 student needs attention' : `${atRisk.length} students need attention`,
        body: digestBody(names),
        url: '/overview',
        tag: 'liko-at-risk',
      });

      result.notifications += summary.sent;
      result.pruned += summary.pruned;
      result.failed += summary.failed;
    }

    if (options.includeSummary) {
      const marked = (attendanceResult.data ?? []) as Row[];
      const absences = marked.filter((row) => str(row.status) === 'absent').length;
      const summary: PushSummary = await sendPushToUser(ownerId, {
        title: 'Grade and attendance summary',
        body: `${students.length} students, ${scoresByStudent.size} with marks, ${absences} absences recorded.`,
        url: '/overview',
        tag: 'liko-summary',
      });

      result.notifications += summary.sent;
      result.pruned += summary.pruned;
      result.failed += summary.failed;
    }
  }

  return result;
}