'use client';

import * as React from 'react';
import Image from 'next/image';
import { BarChart3, LayoutDashboard, Presentation, ScanLine } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  SAMPLE_CLASS,
  SAMPLE_STUDENTS,
  SHOWCASE_TABS,
  classAverage,
  needsSupport,
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
 */

const TAB_ICONS: Record<SampleTab, typeof LayoutDashboard> = {
  gradebook: LayoutDashboard,
  lessons: Presentation,
  quizzes: ScanLine,
  insights: BarChart3,
};

function SampleAvatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-[23px] flex-none items-center justify-center rounded-full bg-accent-subtle text-[8px] font-semibold text-accent"
    >
      {initials}
    </span>
  );
}

function GradeTag({ grade }: { grade: number }) {
  const support = grade < 80;
  return (
    <span
      className={cn(
        'rounded-[4px] px-[7px] py-1 text-[9px]',
        support ? 'bg-surface-sunken text-warning' : 'bg-accent-subtle text-accent',
      )}
    >
      {support ? 'Needs support' : 'On track'}
    </span>
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

function GradebookPanel() {
  const support = needsSupport(SAMPLE_STUDENTS);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold leading-tight">A good day to make a difference.</p>
          <p className="mt-1 text-[10px] text-ink-muted">
            Here is how your {SAMPLE_CLASS.level} {SAMPLE_CLASS.section} class is doing.
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Students" value={String(SAMPLE_STUDENTS.length)} note={SAMPLE_CLASS.level} />
        <MiniStat
          label="Class average"
          value={`${classAverage(SAMPLE_STUDENTS)}%`}
          note="Looking good"
        />
        <MiniStat label="Need a little support" value={String(support.length)} note="Worth a check" />
      </div>

      <table className="w-full border-collapse text-[10px]">
        <caption className="sr-only">
          Sample marks for the fictional {SAMPLE_CLASS.level} {SAMPLE_CLASS.section} class
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-surface-sunken px-1.5 py-2 text-left text-[9px] font-medium text-ink-muted"
            >
              Student name
            </th>
            <th
              scope="col"
              className="bg-surface-sunken px-1.5 py-2 text-left text-[9px] font-medium text-ink-muted"
            >
              {SAMPLE_CLASS.subject}
            </th>
            <th
              scope="col"
              className="bg-surface-sunken px-1.5 py-2 text-left text-[9px] font-medium text-ink-muted"
            >
              Progress
            </th>
            <th
              scope="col"
              className="hidden bg-surface-sunken px-1.5 py-2 text-left text-[9px] font-medium text-ink-muted sm:table-cell"
            >
              Last activity
            </th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_STUDENTS.map((student) => (
            <tr key={student.name} className="border-b border-border">
              <td className="px-1.5 py-2">
                <span className="flex items-center gap-2">
                  <SampleAvatar initials={student.initials} />
                  {student.name}
                </span>
              </td>
              <td className="tabular px-1.5 py-2">{student.grade}%</td>
              <td className="px-1.5 py-2">
                <GradeTag grade={student.grade} />
              </td>
              <td className="hidden px-1.5 py-2 text-ink-muted sm:table-cell">Today</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InsightsPanel() {
  const support = needsSupport(SAMPLE_STUDENTS);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold leading-tight">See the student behind the score.</p>
          <p className="mt-1 text-[10px] text-ink-muted">
            {SAMPLE_CLASS.level} {SAMPLE_CLASS.section} {SAMPLE_CLASS.subject} performance
          </p>
        </div>
        <BarChart3 size={22} className="flex-none text-accent" aria-hidden="true" />
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Class average" value={`${classAverage(SAMPLE_STUDENTS)}%`} />
        <MiniStat label="On track" value={String(SAMPLE_STUDENTS.length - support.length)} />
        <MiniStat label="Needs support" value={String(support.length)} />
      </div>

      <div className="flex h-[140px] items-end gap-5 pt-4">
        {SAMPLE_STUDENTS.map((student) => (
          <div
            key={student.name}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <strong className="tabular text-[9px]">{student.grade}%</strong>
            <div
              className="w-full rounded-t-[3px] border-t-[3px] border-accent bg-accent-subtle"
              style={{ height: `${student.grade}%` }}
            />
            <span className="text-[9px] text-ink-muted">{student.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>

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

function LessonsPanel() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold leading-tight">A lesson worth looking forward to.</p>
          <p className="mt-1 text-[10px] text-ink-muted">Start with a topic. Make it your own.</p>
        </div>
        <Presentation size={22} className="flex-none text-accent" aria-hidden="true" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[5px] border border-border px-3 py-2">
          <span className="text-[9px] text-ink-muted">Lesson topic</span>
          <p className="mt-1 text-[12px]">The Solar System</p>
        </div>
        <div className="rounded-[5px] border border-border px-3 py-2">
          <span className="text-[9px] text-ink-muted">Teaching level</span>
          <p className="mt-1 text-[12px]">{SAMPLE_CLASS.level}</p>
        </div>
      </div>

      <div className="forest-panel mt-4 rounded-[6px] p-6">
        <span className="text-[10px] text-highlight">
          {SAMPLE_CLASS.level} to Grade 7, slide 1
        </span>
        <p className="my-2.5 font-display text-[22px] font-semibold">The Solar System</p>
        <p className="text-[12px] leading-relaxed opacity-80">
          Learning objective: identify the key ideas in the solar system and connect them
          to everyday life.
        </p>
        <p className="mt-3 text-[12px] opacity-80">
          Explore, then discuss, then practice, then reflect, then review.
        </p>
      </div>
    </>
  );
}

function QuizzesPanel() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold leading-tight">One quiz. Any classroom.</p>
          <p className="mt-1 text-[10px] text-ink-muted">
            From a paper handout to an online activity.
          </p>
        </div>
        <ScanLine size={22} className="flex-none text-accent" aria-hidden="true" />
      </div>

      <ol className="mt-1 grid list-none gap-2.5 p-0 text-[12px] leading-relaxed">
        {[
          'Print the quiz as a paper handout, or run it online with the class.',
          'Scan the completed paper against the answer key to get the marks.',
        ].map((step, index) => (
          <li key={step} className="rounded-[5px] border border-border p-3">
            <span className="font-semibold">{index + 1}.</span> {step}
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-[5px] border border-border p-3">
          <span className="text-[9px] text-ink-muted">Format</span>
          <p className="mt-1 text-[12px]">Printable or online</p>
        </div>
        <div className="rounded-[5px] border border-border p-3">
          <span className="text-[9px] text-ink-muted">Marking</span>
          <p className="mt-1 text-[12px]">Scored against the answer key</p>
        </div>
      </div>
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

      <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between border-b border-border pb-3 text-[9px] text-ink-muted">
          <span>My workspace / {SHOWCASE_TABS.find((item) => item.id === tab)?.nav}</span>
          <span className="hidden sm:inline">{SAMPLE_CLASS.schoolYear}</span>
        </div>
        <Panel />
      </div>
    </div>
  );
}