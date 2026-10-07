import type { Metadata } from 'next';


import { ThemeToggle } from './ThemeToggle';
import { PageHeader } from '../../components/PageHeader';
import { Switch } from '@/components/ui/switch';
import { requireSession } from '@/lib/auth/guards';

export const metadata: Metadata = {
  title: 'Appearance',
  description: 'Theme and density settings.',
};

export default async function AppearancePage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-[42rem]">
      <PageHeader
        title="Appearance"
        description="Theme applies across the marketing site and the workspace together."
      />

      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[1.0625rem] font-medium text-ink">Theme</h2>
            <p className="mt-1 text-[0.875rem] text-ink-muted">
              Dark mode lifts the accent rather than inverting it, so contrast
              holds in both themes.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-6">
          <div>
            <label htmlFor="reduce-motion" className="text-[1.0625rem] font-medium text-ink">
              Follow system motion preference
            </label>
            <p className="mt-1 text-[0.875rem] text-ink-muted">
              Honour prefers-reduced-motion for scroll narratives and reveals.
            </p>
          </div>
          <Switch id="reduce-motion" defaultChecked aria-describedby="reduce-motion-hint" />
          <span id="reduce-motion-hint" className="sr-only">
            When enabled, LIKO removes position and scale animation in favour of
            opacity and colour changes.
          </span>
        </div>
      </div>
    </div>
  );
}