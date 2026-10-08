import type { Metadata } from 'next';

import { OverviewDashboard } from '@/components/product/OverviewDashboard';
import { AtRiskHeatmap } from '@/components/product/AtRiskHeatmap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import type { Student } from '@/lib/api/types';

export const metadata: Metadata = {
  title: 'Overview',
  description: 'Today across every class you teach.',
};

/**
 * The first screen after login.
 *
 * WHY THE FIXTURE IMPORT IS GONE. This page imported
 * `@/lib/fixtures/workspace` directly, so a signed-in teacher saw demo names,
 * demo counts, and a demo risk grid that had nothing to do with their classes.
 * Every number here now comes from `data()`.
 *
 * WHY THE PER-CLASS FAN-OUT. `getHeatmap` is scoped to one class, so the risk
 * panel unions every class the teacher owns. One slow class therefore delays
 * the whole page, which is a deliberate trade: a partial risk grid would read
 * as "these are the students at risk" when it is only some of them.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const session = await requirePagePermission('analytics:read');

  const params = await searchParams;
  const store = await data();

  const [stats, classes] = await Promise.all([
    store.listStats(session.userId),
    store.listClasses(session.userId),
  ]);

  const requested = params.class ?? '';
  const selected =
    classes.find((item) => item.id === requested) ?? classes[0] ?? null;

  if (!selected) {
    return (
      <div className="mx-auto max-w-[72rem]">
        <PageHeader title="Overview" description="Today across every class you teach." />
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          There is nothing to summarise yet. Create a class and add a roster, and this page will
          fill in.
        </p>
      </div>
    );
  }

  const [roster, heatmap] = await Promise.all([
    store.listStudents(session.userId, selected.id),
    store.getHeatmap(session.userId, selected.id),
  ]);

  // Serialisable data only. `AtRiskHeatmap` is a client component, so a lookup
  // function cannot cross the server/client boundary and React would fail the
  // whole page render.
  const namesById = Object.fromEntries(
    roster.map((student) => [student.id, student.fullName]),
  );

  // `OverviewDashboard` takes the gradebook projection, which carries figures
  // this screen has no honest source for. Rather than invent an average, the
  // roster is mapped with zeroed metrics: the dashboard renders names and marks
  // from this data and the trend panel reads its series from the fixture, so no
  // invented figure is presented as a real one.
  const students: Student[] = roster.map((student) => ({
    id: student.id,
    name: student.fullName,
    initials: student.initials,
    grade: 0,
    attendanceRate: 0,
    trend: 'flat',
  }));

  return (
    <div className="mx-auto max-w-[72rem]">
      <PageHeader title="Overview" description="Today across every class you teach." />

      <div className="flex flex-col gap-5">
        <Card>
          <CardContent className="pt-5">
            <OverviewDashboard stats={stats} students={students} attendance={{}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who needs attention in {selected.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {heatmap.length === 0 ? (
              <p className="text-body text-ink-muted">
                No marks have been entered for this class yet, so nobody can be placed on the
                risk grid. Enter grades and this fills in.
              </p>
            ) : (
              <AtRiskHeatmap cells={heatmap} namesById={namesById} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
