'use client';

import * as React from 'react';
import Image from 'next/image';
import { BarChart3, ClipboardCheck, LayoutDashboard, Presentation, ScanLine } from 'lucide-react';

import { cn } from '@/lib/utils';
import { GradebookGrid } from '@/components/product/GradebookGrid';
import { AtRiskHeatmap } from '@/components/product/AtRiskHeatmap';
import { AttendanceGrid, AttendanceLegend } from '@/components/product/AttendanceGrid';
import { LessonPlanList } from '@/components/product/LessonPlanList';
import { AssessmentCardList } from '@/components/product/AssessmentCardList';
import {
  SAMPLE_ASSESSMENTS,
  SAMPLE_ATTENDANCE,
  SAMPLE_ATTENDANCE_STUDENTS,
  SAMPLE_CLASS,
  SAMPLE_COLUMNS,
  SAMPLE_GRADE_CELLS,
  SAMPLE_GRADEBOOK_STUDENTS,
  SAMPLE_HEATMAP,
  SAMPLE_NAMES_BY_ID,
  SAMPLE_PLANS,
  SAMPLE_QUESTIONS_BY_ASSESSMENT,
  SAMPLE_STUDENTS,
  SHOWCASE_TABS,
  attendanceCounts,
  classAverage,
  needsSupport,
  riskCounts,
  type SampleTab,
} from './sample-class';

/**
 * The workspace, as the product actually looks, built out of the real tokens.
 *
 * SHARED BY THE HERO AND THE SHOWCASE, which is the reason it takes a tab rather
 * than owning one: the design draws the same mock twice at two scales, and two
 * copies of a mock is exactly how the two drift apart.
 *
 * IT IS A PICTURE OF THE PRODUCT, NOT THE PRODUCT. No input on this component
 * writes anything, no number on it moves, and nothing here reports a result.
 * Every grade is the same six fictional marks regardless of what has happened
 * anywhere else on the page. The interactive parts of the brand prototype, an
 * editable gradebook and a scan that reports a score, were scaffolding for a
 * build with no backend and are deliberately not ported: LIKO has a real
 * workspace behind `/overview`, and a second one that pretends to be it would be
 * a false claim about the product on the page that sells it.
 *
 * BUT IT IS THE PRODUCT'S OWN COMPONENTS. Every panel below is the component
 * the app ships, given the sample class and nothing else. An earlier version of
 * this file hand-built a table, a bar chart and a lesson card to look like the
 * product, and `docs/ROADMAP.md` said the landing page renders the shipping
 * components rather than pictures of them. It did not, and the two cannot both
 * be true. The components are the shipping ones now: `GradebookGrid`,
 * `AttendanceGrid`, `AtRiskHeatmap`, `LessonPlanList` and `AssessmentCardList`,
 * the same files the dashboard routes render.
 *
 * WHY THAT MATTERS BEYOND HONESTY. A hand-built picture is a second
 * implementation of a screen that already exists, and it drifts: the picture
 * kept showing a support threshold of 80 while the heatmap under it, once it
 * was the real one, used the product's own rule. The panels here read the same
 * derived figures, so the class average, the support count and the risk grid
 * cannot disagree with each other or with the product.
 */

const TAB_ICONS: Record<SampleTab, typeof LayoutDashboard> = {
  gradebook: LayoutDashboard,
  attendance: ClipboardCheck,
  lessons: Presentation,
  quizzes: ScanLine,
  insights: BarChart3,
};

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-[18px] font-semibold leading-tight">{title}</p>
        <p className="mt-1 text-[10px] text-ink-muted">{sub}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[6px] border border-border px-3 py-3">
      <span className="block text-[9px] text-ink-muted">{label}</span>
      <strong className="mt-1 block font-display text-[22px] leading-none">
        {value}
        {note ? <small className="ml-2 text-[9px] font-normal text-accent">{note}</small> : null}
      </strong>
    </div>
  );
}

/**
 * How the class average is described, derived rather than asserted.
 *
 * A caption that says "Looking good" next to a class average is a claim about
 * a number, and the number changes when the sample does. The threshold is here
 * so the caption cannot survive a change to the marks.
 */
function averageNote(average: number): string {
  if (average >= 85) return 'Looking good';
  if (average >= 75) return 'Holding steady';
  return 'Worth a look';
}

function GradebookPanel() {
  const average = classAverage(SAMPLE_STUDENTS);
  const support = needsSupport();

  return (
    <>
      <PanelHeading
        title="A good day to make a difference."
        sub={`Here is how your ${SAMPLE_CLASS.level} ${SAMPLE_CLASS.section} class is doing.`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Students" value={String(SAMPLE_STUDENTS.length)} note={SAMPLE_CLASS.level} />
        <MiniStat label="Class average" value={`${average}%`} note={averageNote(average)} />
        <MiniStat
          label="Need a little support"
          value={String(support.length)}
          note="Worth a check"
        />
      </div>

      <GradebookGrid
        students={SAMPLE_GRADEBOOK_STUDENTS}
        columns={SAMPLE_COLUMNS}
        cells={SAMPLE_GRADE_CELLS}
        maxScoreFor={() => 100}
        compact
      />
    </>
  );
}

function AttendancePanel() {
  const counts = attendanceCounts();

  return (
    <>
      <PanelHeading
        title="Mark the room in a minute."
        sub={`Who is here for ${SAMPLE_CLASS.level} ${SAMPLE_CLASS.section} today.`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Present" value={String(counts.present)} note="On time" />
        <MiniStat label="Late" value={String(counts.late)} note="In a hurry" />
        <MiniStat label="Absent" value={String(counts.absent)} note="Noted" />
      </div>

      <AttendanceGrid students={SAMPLE_ATTENDANCE_STUDENTS} marks={SAMPLE_ATTENDANCE} compact />

      <div className="mt-4 border-t border-border pt-3">
        <AttendanceLegend compact />
      </div>
    </>
  );
}

function LessonsPanel() {
  return (
    <>
      <PanelHeading
        title="A lesson worth looking forward to."
        sub="Start with a topic. Make it your own."
      />

      <LessonPlanList plans={SAMPLE_PLANS} compact />
    </>
  );
}

function QuizzesPanel() {
  return (
    <>
      <PanelHeading
        title="One quiz. Any classroom."
        sub="From a paper handout to an online activity."
      />

      <AssessmentCardList
        assessments={SAMPLE_ASSESSMENTS}
        questionsByAssessment={SAMPLE_QUESTIONS_BY_ASSESSMENT}
        compact
      />
    </>
  );
}

function InsightsPanel() {
  const counts = riskCounts();
  const support = needsSupport();

  return (
    <>
      <PanelHeading
        title="See the student behind the score."
        sub={`${SAMPLE_CLASS.level} ${SAMPLE_CLASS.section} ${SAMPLE_CLASS.subject} performance`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Class average" value={`${classAverage(SAMPLE_STUDENTS)}%`} />
        <MiniStat label="On track" value={String(counts.onTrack)} />
        <MiniStat label="Needs support" value={String(counts.watch + counts.atRisk)} />
      </div>

      <AtRiskHeatmap cells={SAMPLE_HEATMAP} namesById={SAMPLE_NAMES_BY_ID} compact />

      <p className="mt-5 rounded-[5px] bg-accent-subtle p-3.5 text-[12px] leading-relaxed">
        <strong>A little attention goes a long way.</strong>
        <br />
        {support.length > 0
          ? `${support.map((student) => student.name.split(' ')[0]).join(' and ')} could benefit from a one on one review before the next assessment.`
          : 'No students are currently flagged for extra support.'}
      </p>
    </>
  );
}

/**
 * The mock's own titles are paragraphs, not headings.
 *
 * They look like headings and are drawn in the display face, but they are
 * chrome inside a picture of a product rather than structure in this document.
 * Rendering them as `h3` put them straight under the page's `h1` in the hero,
 * which is a heading-level skip and breaks screen reader navigation, and in the
 * showcase they would have competed with the real section headings that a reader
 * is actually navigating by.
 *
 * `role="presentation"` is on the wrapper rather than on each one, so the
 * accessibility tree sees one flat picture instead of four phantom sections.
 */

const PANELS: Record<SampleTab, () => React.JSX.Element> = {
  gradebook: GradebookPanel,
  attendance: AttendancePanel,
  lessons: LessonsPanel,
  quizzes: QuizzesPanel,
  insights: InsightsPanel,
};

export interface WorkspaceMockProps {
  /** Which panel to show. Omit to let the mock own its tab. */
  tab?: SampleTab;
  /** Called when the mock's own sidebar changes the tab. */
  onTabChange?: (tab: SampleTab) => void;
  /** Hides the sidebar. The hero's smaller instance does not have room for it. */
  hideSidebar?: boolean;
  className?: string;
}

export function WorkspaceMock({
  tab: controlledTab,
  onTabChange,
  hideSidebar = false,
  className,
}: WorkspaceMockProps) {
  const [ownTab, setOwnTab] = React.useState<SampleTab>('gradebook');
  const tab = controlledTab ?? ownTab;
  const Panel = PANELS[tab];

  const select = (next: SampleTab) => {
    if (controlledTab === undefined) setOwnTab(next);
    onTabChange?.(next);
  };

  return (
    <div
      className={cn(
        'flex min-h-[390px] overflow-hidden rounded-[7px] bg-bg text-left text-ink',
        className,
      )}
    >
      {!hideSidebar && (
        <aside className="hidden w-[164px] flex-none border-r border-border bg-surface-sunken px-[13px] py-5 sm:flex sm:flex-col">
          <Image
            src="/logo.jpg"
            alt="Liko"
            width={68}
            height={20}
            className="mb-7 h-auto w-[68px]"
          />
          <p className="mb-2.5 px-2.5 text-[9px] uppercase tracking-[0.1em] text-ink-muted">
            Your workspace
          </p>
          {SHOWCASE_TABS.map((item) => {
            const Icon = TAB_ICONS[item.id];
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item.id)}
                aria-pressed={active}
                className={cn(
                  'mb-1 flex min-h-11 w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[11px] lg:min-h-0 lg:h-[35px]',
                  active
                    ? 'bg-accent-subtle text-accent'
                    : 'text-ink-muted hover:bg-surface-raised',
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {item.nav}
              </button>
            );
          })}
          <div className="mt-auto flex items-center gap-2 pt-6 text-[10px]">
            <span
              aria-hidden="true"
              className="flex size-[30px] flex-none items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent"
            >
              MC
            </span>
            <span>
              {SAMPLE_CLASS.teacher}
              <small className="block text-ink-muted">Teacher workspace</small>
            </span>
          </div>
        </aside>
      )}

      <div className="mock-content min-w-0 flex-1 overflow-hidden px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between border-b border-border pb-3 text-[9px] text-ink-muted">
          <span>My workspace / {SHOWCASE_TABS.find((item) => item.id === tab)?.nav}</span>
          <span className="hidden sm:inline">{SAMPLE_CLASS.schoolYear}</span>
        </div>
        <Panel />
      </div>
    </div>
  );
}
