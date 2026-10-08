import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { contentDisposition, toCsv, withBom, type CsvCell } from '@/lib/export/csv';
import {
  PERCENTAGE_POLICY,
  toPolicy,
  weightedPointTotal,
  type GradingPolicy,
} from '@/lib/grading/policy';

/**
 * Gradebook CSV export.
 *
 * `GET /grades/export?class=<id>` returns the selected class as a spreadsheet:
 * one row per student, one column per assessment, then a weighted total.
 *
 * Three decisions worth naming.
 *
 * **It reuses the gradebook's own maths.** `weightedPointTotal` and `toPolicy`
 * are the same functions the page uses, so the file and the screen cannot
 * disagree about what a total is. A separately written exporter is how a
 * spreadsheet ends up reporting a different number from the page it came from.
 *
 * **The class is resolved from what the caller may read.** The id in the query
 * string is never trusted on its own; it has to match a class that came back
 * from `listClasses`, which is scoped by the seam and by RLS underneath. An id
 * belonging to another school therefore 404s rather than exporting.
 *
 * **A missing mark is an empty cell, not a zero.** A zero is a mark somebody
 * gave. Writing one for an unmarked assessment would turn "not graded yet" into
 * "failed" in a file that leaves the building.
 */

export async function GET(request: Request) {
  let session;
  try {
    session = await requirePermission('grade:read');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const store = await data();
  const classes = await store.listClasses(session.userId);

  const classId = new URL(request.url).searchParams.get('class');

  /*
   * No parameter means the first class a teacher owns, which is the common case.
   * A parameter that does not resolve is a 404 rather than a silent fallback:
   * quietly handing back a different class's marks because an id was mistyped
   * is worse than an error, and it is the same shape as asking for another
   * school's class, which also has to fail here.
   */
  const selected = classId === null ? classes[0] : classes.find((item) => item.id === classId);

  if (!selected) {
    return NextResponse.json({ error: 'No such class' }, { status: 404 });
  }

  const [roster, assessments, grades, policies] = await Promise.all([
    store.listStudents(session.userId, selected.id),
    store.listAssessments(session.userId, selected.id),
    store.listGrades(session.userId, selected.id),
    store.listPolicies(session.userId),
  ]);

  const policy: GradingPolicy = (() => {
    const record = policies.find((item) => item.id === (selected.gradingPolicyId ?? 'percentage'));
    return record ? toPolicy(record) : PERCENTAGE_POLICY;
  })();

  const header: CsvCell[] = [
    'Student',
    ...assessments.map((assessment) => `${assessment.title} (out of ${assessment.maxScore})`),
    `Weighted total (${policy.label})`,
  ];

  const rows: CsvCell[][] = roster
    .filter((student) => !student.archivedAt)
    .map((student) => {
      const entries = assessments
        .map((assessment) => {
          const row = grades.find(
            (candidate) =>
              candidate.assessmentId === assessment.id && candidate.studentId === student.id,
          );
          if (!row || row.score === null) return null;
          return { score: row.score, maxScore: row.maxScore, weight: assessment.weight };
        })
        .filter(
          (entry): entry is { score: number; maxScore: number; weight: number } => entry !== null,
        );

      const marks = assessments.map((assessment) => {
        const row = grades.find(
          (candidate) =>
            candidate.assessmentId === assessment.id && candidate.studentId === student.id,
        );
        return row?.score ?? null;
      });

      const points = weightedPointTotal(entries, policy);
      const weight = entries.reduce((sum, entry) => sum + entry.weight, 0);
      const percentage =
        weight > 0
          ? entries.reduce(
              (sum, entry) => sum + (entry.score / entry.maxScore) * 100 * entry.weight,
              0,
            ) / weight
          : null;

      const total = points ?? percentage;
      return [
        student.fullName,
        ...marks,
        total === null ? null : Number(total.toFixed(2)),
      ];
    });

  const csv = withBom(toCsv([header, ...rows]));

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`${selected.code || selected.name}-marks.csv`),
      /*
       * A download must never be rendered inline. Without this a crafted file
       * could come back as text/html and run in the app's origin.
       */
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}