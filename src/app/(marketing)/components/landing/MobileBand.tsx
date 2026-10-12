'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  BarChart3,
  BatteryFull,
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
 * Serwist service worker make LIKO installable and offline capable. So this
 * section needed no new plumbing: the store buttons are the design's, the caption
 * is not, and the claim underneath is already backed by code.
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
  'Check grades and student progress on the go',
  'Scan paper quizzes straight from your phone',
  'Keep your classes close, wherever you are',
] as const;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function PhoneMock() {
  return (
    <div className="phone-scene">
      <div className="phone">
        <span className="phone-island" aria-hidden="true" />

        <div className="phone-top">
          <span aria-hidden="true">9:41</span>
          <span aria-hidden="true">
            <Wifi size={11} />
            <BatteryFull size={13} />
          </span>
        </div>

        <div className="phone-header">
          <Image src="/logo.jpg" alt="" width={58} height={17} />
          <Bell size={17} aria-hidden="true" />
        </div>

        <h3>Hello, Ms. Camille.</h3>
        <p>A little progress, every day.</p>

        <div className="phone-summary">
          <p>
            {SAMPLE_CLASS.level} · {SAMPLE_CLASS.section}
          </p>
          <strong>
            {classAverage(SAMPLE_STUDENTS)}% <span>class average</span>
          </strong>
          <p className="mt-2">Sample data, shown for illustration.</p>
        </div>

        <div className="phone-subheading">Your students</div>
        <ul>
          {SAMPLE_STUDENTS.slice(0, 4).map((student) => (
            <li key={student.name} className="phone-student">
              <span className="avatar">{student.initials}</span>
              {student.name}
              <strong>{student.grade}%</strong>
            </li>
          ))}
        </ul>

        <div className="phone-bottom" aria-hidden="true">
          <LayoutDashboard size={19} />
          <BookOpen size={19} />
          <ScanLine size={19} />
          <BarChart3 size={19} />
        </div>
      </div>

      <div className="floating-label mobile-float">
        <span className="scan-square" aria-hidden="true">
          <ScanLine size={23} />
        </span>
        <div>
          <strong>Scan. Score. Done.</strong>
          <small>Your paper quizzes, reimagined.</small>
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
    <section className="mobile-band" id="mobile" aria-labelledby="mobile-heading">
      <div className="page-width mobile-inner">
        <div className="mobile-copy">
          <p className="section-tag">A little Liko. Wherever you go.</p>
          <h2 className="section-title" id="mobile-heading">
            Your classroom.
            <br />
            In your pocket.
          </h2>
          <p className="section-copy">
            From the staff room to the school run, stay connected to your teaching day.
            Liko installs to your home screen and keeps working when the connection does
            not, so it goes where you do.
          </p>

          <ul className="mobile-list">
            {STEPS.map((step) => (
              <li key={step}>
                <Check aria-hidden="true" />
                {step}
              </li>
            ))}
          </ul>

          <div className="store-links">
            {installEvent ? (
              <Button variant="hero-outline" className="store-button" onClick={install}>
                <Share size={18} aria-hidden="true" />
                <span>Add Liko to your home screen</span>
              </Button>
            ) : (
              <div className="store-button">
                <span>
                  <small>Add it from your browser</small>
                  Share, then Add to Home Screen
                </span>
              </div>
            )}
          </div>
          <p className="mobile-caption">One install. Works offline once it is on your phone.</p>
        </div>

        <PhoneMock />
      </div>
    </section>
  );
}