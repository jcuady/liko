import Image from 'next/image';

import { Reveal } from './Reveal';
import { SectionHeader } from './SectionHeader';
import { GradebookGrid } from '@/components/product/GradebookGrid';
import { AtRiskHeatmap } from '@/components/product/AtRiskHeatmap';
import { AttendanceGrid, AttendanceLegend } from '@/components/product/AttendanceGrid';
import { attendance, heatmap, standards, students } from '@/lib/fixtures/workspace';

/**
 * Module bento. Six cells for six modules, no filler.
 *
 * The spans tile a three-column grid with content-sized rows, zero voids:
 *
 *     row 1   Gradebook(2 wide)   Attendance(1)
 *     row 2   Heatmap(2 wide)     Planner(1)
 *     row 3   Report cards(2 wide) Student history(1)
 *
 * Every row is `auto`, never `1fr`. An explicit `grid-rows-4` looks tidier in
 * the source but emits four equal fractions, so whichever cell has the most
 * content stretches its whole row and the short cells collapse into voids with
 * a third of a card of dead air underneath. Content-sized rows remove the
 * whole class of bug and keep the section honest when the copy changes.
 *
 * Three cells carry real visual variation: three live component miniatures, a
 * tinted planner panel, and one photograph. Six identical cards would be the
 * failure mode here.
 *
 * The photograph is a committed local asset at `public/marketing`, not a hotlink.
 * The page is a PWA and has to render identically with no network, and a third
 * party placeholder host would also make the alt text a guess.
 */

const GRADE_COLUMNS = ['Unit 1', 'Unit 2', 'Midterm'];

const GRADE_CELLS: Record<string, Record<string, number | null>> = Object.fromEntries(
  students.map((student, index) => [
    student.id,
    {
      'Unit 1': student.grade - 6 + index,
      'Unit 2': student.grade - 2,
      Midterm: student.grade,
    },
  ]),
);

const namesById = Object.fromEntries(
  students.map((student) => [student.id, student.name]),
);

const HISTORY = [
  { week: 'Week 12', text: 'Assessment score rose' },
  { week: 'Week 9', text: 'Attendance flagged' },
  { week: 'Week 7', text: 'Standard mastered' },
  { week: 'Week 4', text: 'Enrolled in class' },
];

const PLANNER_WEEK = [
  { day: 'Mon', unit: 'Linear equations', minutes: 50 },
  { day: 'Tue', unit: 'Word problems', minutes: 50 },
  { day: 'Wed', unit: 'Lab: modelling', minutes: 45 },
  { day: 'Thu', unit: 'Peer review', minutes: 40 },
];

/** Gives the wide heatmap cell enough body to sit level with the planner column. */
const HEATMAP_NOTES = [
  { label: 'Three flagged', body: 'Across seven students this week.' },
  { label: 'Two improving', body: 'Up on last week after intervention.' },
  { label: 'Reviewed Friday', body: 'Before the term closes, not after.' },
];

/**
 * Tallies the real fixture rather than hard-coding figures, so the strip can
 * never drift from the marks shown directly above it. A summary that
 * contradicts the grid it summarises is worse than no summary.
 */
const ATTENDANCE_TALLY = (() => {
  const counts = new Map<string, number>();
  for (const state of Object.values(attendance)) {
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [
    { value: counts.get('present') ?? 0, label: 'present' },
    { value: counts.get('absent') ?? 0, label: 'absent' },
    { value: counts.get('late') ?? 0, label: 'late' },
  ];
})();

export function ModuleBento() {
  return (
    <section id="modules" aria-labelledby="modules-title" className="chapter">
      <div className="container-marketing">
        <SectionHeader
          label="What you get"
          id="modules-title"
          title={
            <>
              Six tools that already know about <em className="italic-accent text-ink">each other</em>.
            </>
          }
        >
          <p className="measure text-lead">
            Each one is useful alone. Together they stop repeating the same work
            in a different tab.
          </p>
        </SectionHeader>

        <div className="mt-14 grid grid-cols-1 gap-4 md:mt-20 md:grid-cols-2 lg:grid-cols-3">
          {/* Row 1. Gradebook is wide because a table needs horizontal room. */}
          <Reveal className="lg:col-span-2" delay={0}>
            <article className="bento h-full rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
              <h3 className="text-h4">Gradebook</h3>
              <p className="mt-2 max-w-[46ch] text-meta text-ink-muted">
                Every mark keeps the reasoning behind it.
              </p>
              <div className="mt-5 min-w-0">
                <GradebookGrid
                  students={students.slice(0, 5)}
                  columns={GRADE_COLUMNS}
                  cells={GRADE_CELLS}
                  compact
                />
              </div>
            </article>
          </Reveal>

          <Reveal className="h-full" delay={0.06}>
            <article className="bento flex h-full flex-col rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
              <h3 className="text-h4">Attendance</h3>
              <p className="mt-2 text-meta text-ink-muted">
                Four taps per student, works with one thumb.
              </p>
              <div className="mt-4">
                <AttendanceGrid
                  students={students.slice(0, 12).map((s) => ({
                    id: s.id,
                    initials: s.initials,
                    name: s.name,
                  }))}
                  marks={attendance}
                  compact
                  dense
                />
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <AttendanceLegend compact />
              </div>
              {/*
                `mt-auto` pins the tally to the bottom of the card. The cell
                stretches to match the gradebook beside it, so without this the
                shortfall collects at the bottom edge as dead air instead of
                reading as deliberate spacing.
              */}
              <dl className="mt-auto grid grid-cols-3 gap-2 pt-4">
                {ATTENDANCE_TALLY.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[10px] bg-surface-sunken px-2.5 py-2"
                  >
                    <dd className="tabular text-[1.125rem] font-semibold leading-none text-ink">
                      {stat.value}
                    </dd>
                    <dt className="mt-1.5 text-[0.6875rem] leading-tight text-ink-subtle">
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </article>
          </Reveal>

          {/* Row 2. The heatmap needs width; the planner reads fine in a column. */}
          <Reveal className="lg:col-span-2" delay={0}>
            <article className="bento h-full rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
              <h3 className="text-h4">At-risk heatmap</h3>
              <p className="mt-2 max-w-[46ch] text-meta text-ink-muted">
                Flagged while there is still time to act.
              </p>
              <div className="mt-5 min-w-0">
                <AtRiskHeatmap cells={heatmap} namesById={namesById} compact />
              </div>
              <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
                {HEATMAP_NOTES.map((note) => (
                  <p key={note.label} className="text-[0.8125rem] text-ink-muted">
                    <span className="block text-meta font-semibold text-ink">
                      {note.label}
                    </span>
                    {note.body}
                  </p>
                ))}
              </div>
            </article>
          </Reveal>

          <Reveal className="h-full" delay={0.06}>
            <article className="bento h-full rounded-[16px] border border-transparent bg-accent-subtle p-5">
              <h3 className="text-h4 text-ink">Lesson planner</h3>
              <p className="mt-2 text-meta text-ink-muted">
                Standards travel with the plan, not beside it.
              </p>
              <ol className="mt-4 space-y-1.5">
                {PLANNER_WEEK.map((slot) => (
                  <li
                    key={slot.day}
                    className="flex items-baseline gap-2 border-b border-accent/10 pb-1.5 text-[0.8125rem] last:border-b-0"
                  >
                    <span className="tabular w-8 shrink-0 text-ink-subtle">
                      {slot.day}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {slot.unit}
                    </span>
                    <span className="tabular shrink-0 text-ink-subtle">
                      {slot.minutes}m
                    </span>
                  </li>
                ))}
              </ol>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {standards.slice(0, 3).map((standard) => (
                  <li
                    key={standard.code}
                    className="tabular rounded-[8px] bg-surface px-2 py-1 text-[0.6875rem] font-medium text-accent"
                  >
                    {standard.code}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>

          {/* Row 3. A photograph takes the full-bleed treatment. */}
          <Reveal className="lg:col-span-2" delay={0}>
            <article className="bento group relative isolate flex h-full min-h-[15rem] flex-col justify-end overflow-hidden rounded-[16px] border border-border bg-surface">
              <Image
                src="/marketing/liko-report-card.jpg"
                alt="A printed student report card showing a table of marks, lying on a warm bone-coloured desk beside a dark green pen."
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 66vw, 100vw"
                className="absolute inset-0 -z-10 object-cover object-[58%_50%] saturate-[0.92] transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-[1.04]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-gradient-to-t from-[#141613]/85 via-[#141613]/35 to-transparent"
              />
              <div className="p-5 sm:p-6">
                <h3 className="text-h4 text-white">Report cards</h3>
                <p className="mt-2 max-w-[42ch] text-meta text-white/75">
                  Generated from data you already entered, not retyped.
                </p>
              </div>
            </article>
          </Reveal>

          <Reveal className="h-full" delay={0.06}>
            <article className="bento flex h-full flex-col rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
              <h3 className="text-h4">Student history</h3>
              <p className="mt-2 text-meta text-ink-muted">
                One timeline per student, from week one.
              </p>
              <ol className="mt-4 space-y-2.5">
                {HISTORY.map((entry) => (
                  <li key={entry.week} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] text-ink">
                        {entry.text}
                      </span>
                      <span className="tabular block text-[0.6875rem] text-ink-subtle">
                        {entry.week}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}