'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  BarChart3,
  Bell,
  BookOpen,
  Check,
  LayoutDashboard,
  ScanLine,
  Share,
  Wifi,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SAMPLE_CLASS, SAMPLE_STUDENTS, classAverage } from './sample-class';

/**
 * The mobile band, and the honest version of it.
 *
 * THE DESIGN PROMISED TWO NATIVE APPS. The brand prototype carried an App Store
 * button and a Google Play button, and a caption saying the apps were coming
 * soon. LIKO has neither app and no roadmap commitment to either, and a promise
 * like that is the first thing a school procurement officer checks.
 *
 * WHAT IS ACTUALLY TRUE, AND WAS ALREADY TRUE. `src/app/manifest.ts` and the
 * Serwist service worker have always made LIKO installable and offline
 * capable. So this section needed no new plumbing at all: the buttons are gone,
 * the copy says what the product does, and the claim was already backed by code.
 *
 * (It briefly looked as though a web app manifest was missing and had to be
 * added. It was not: `app/manifest.ts` generates `/manifest.webmanifest` and
 * Next wires the link tag itself. Adding a second `public/manifest.webmanifest`
 * shadowed the generated one and broke the name and start_url. The check that
 * caught it was `e2e/pwa.spec.ts`, which is exactly what it is for.)
 *
 * The install button only appears when the browser actually offers one. A button
 * that always renders and does nothing is worse than no button, so
 * `beforeinstallprompt` is captured on mount and the fallback is the manual
 * two step instructions.
 */

const STEPS = [
  'Check grades and student progress between classes',
  'Take attendance and keep working without a connection',
  'Open Liko from your home screen, like any other app',
] as const;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function PhoneMock() {
  return (
    <div className="flex justify-center pt-5 md:self-end md:pt-10">
      <div className="relative -mb-16 rotate-[6deg] overflow-hidden rounded-[42px] border-[7px] border-ink bg-bg text-ink shadow-[0_0_0_2px_var(--border-strong),var(--shadow-lg)] md:-mb-[47px]">
        <div className="relative h-[514px] w-[258px] rounded-[35px] bg-bg px-3.5 py-3">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-2.5 h-[22px] w-[78px] -translate-x-1/2 rounded-[20px] bg-ink"
          />

          <div className="flex justify-between px-1.5 pt-1 text-[9px] font-bold">
            <span aria-hidden="true">9:41</span>
            <span className="flex gap-1" aria-hidden="true">
              <Wifi size={11} />
              <span className="text-[9px] font-bold">100%</span>
            </span>
          </div>

          <div className="flex items-center justify-between pt-2.5">
            <Image src="/logo.jpg" alt="" width={58} height={17} className="h-auto w-[58px]" />
            <Bell size={17} aria-hidden="true" className="text-ink-muted" />
          </div>

          <h3 className="mb-1 mt-4 text-[21px]">Hello, Ms. Camille.</h3>
          <p className="text-[10px] text-ink-muted">A little progress, every day.</p>

          <div className="my-4 rounded-[6px] bg-accent-subtle p-4">
            <p className="mb-2 text-[10px] text-accent">
              {SAMPLE_CLASS.level} {SAMPLE_CLASS.section}
            </p>
            <strong className="text-[27px] font-display">
              {classAverage(SAMPLE_STUDENTS)}%{' '}
              <span className="text-[9px] font-normal text-ink-muted">class average</span>
            </strong>
            <p className="mt-2 text-[9px] text-ink-muted">Sample data, shown for illustration.</p>
          </div>

          <p className="mb-3 text-[12px] font-semibold">Your students</p>
          <ul>
            {SAMPLE_STUDENTS.slice(0, 4).map((student) => (
              <li
                key={student.name}
                className="flex items-center gap-2 border-b border-border py-2.5 text-[10px]"
              >
                <span
                  aria-hidden="true"
                  className="flex size-[23px] flex-none items-center justify-center rounded-full bg-accent-subtle text-[8px] font-semibold text-accent"
                >
                  {student.initials}
                </span>
                {student.name}
                <strong className="tabular ml-auto">{student.grade}%</strong>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex justify-around text-accent" aria-hidden="true">
            <LayoutDashboard size={19} />
            <BookOpen size={19} />
            <ScanLine size={19} />
            <BarChart3 size={19} />
          </div>
        </div>
      </div>

      <div className="absolute left-2 top-40 -rotate-[4deg] rounded-[8px] bg-surface-raised px-4 py-3 text-ink shadow-lg md:left-8 md:top-[230px]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-[4px] border border-accent text-accent"
          >
            <ScanLine size={23} />
          </span>
          <div>
            <strong className="block text-[16px] leading-tight">Works without signal.</strong>
            <small className="text-[10px] text-ink-muted">Syncs when you are back online.</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileBand() {
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    const capture = (event: Event) => {
      // Chromium fires this once. Without preventDefault the browser shows its
      // own mini infobar, which competes with the button we are about to render.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <section id="mobile" aria-labelledby="mobile-heading" className="forest-panel overflow-hidden">
      <div className="container-marketing grid items-center gap-0 md:grid-cols-2 md:gap-[50px] md:min-h-[560px]">
        <div className="py-12 md:py-16">
          <p className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-highlight">
            A little Liko. Wherever you go.
          </p>
          <h2
            id="mobile-heading"
            className="mb-4 text-[clamp(2rem,4vw,2.625rem)] font-semibold leading-[1.22]"
          >
            Your classroom.
            <br />
            In your pocket.
          </h2>
          <p className="max-w-[390px] text-[14px] leading-[1.75] opacity-65">
            Liko installs to your home screen and keeps working when the connection does
            not. From the staff room to the school run, it opens like any other app on
            the phone you already carry.
          </p>

          <ul className="my-6 grid list-none gap-3 p-0">
            {STEPS.map((step) => (
              <li key={step} className="flex items-start gap-2.5 text-[13px]">
                <Check size={15} className="mt-0.5 flex-none text-highlight" aria-hidden="true" />
                {step}
              </li>
            ))}
          </ul>

          {installEvent ? (
            <Button
              variant="hero-outline"
              className="min-h-[53px] gap-2.5 rounded-[7px] px-4 text-base"
              onClick={install}
            >
              <Share size={18} aria-hidden="true" />
              Add Liko to your home screen
            </Button>
          ) : (
            <div className="mt-7 rounded-[7px] border border-hero-border p-4">
              <p className="text-[13px] font-semibold">Add it to your home screen</p>
              <p className="mt-1.5 text-[12px] leading-relaxed opacity-70">
                On iPhone, tap Share then Add to Home Screen. On Android, open the browser
                menu and choose Install app.
              </p>
            </div>
          )}
        </div>

        <PhoneMock />
      </div>
    </section>
  );
}