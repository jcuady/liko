import type { ReactNode } from 'react';

import { PageHeader } from './PageHeader';
import { EmptyState } from '@/components/ui/feedback';

/**
 * Module page shell.
 *
 * Each MVP module ships in this pass as an empty state that says plainly what
 * it will do and when it lands. A placeholder that looks broken trains people to
 * distrust the product; one that is honest does not.
 */
export function ModulePage({
  title,
  description,
  icon,
  milestone,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{
    size?: number;
    weight?: 'regular' | 'bold' | 'fill' | 'duotone';
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  /** Which delivery phase this module is scheduled for. */
  milestone: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[64rem]">
      <PageHeader title={title} description={description} />

      {children ?? (
        <EmptyState
          icon={icon}
          title={`${title} is not built yet`}
          description={`${description} It is scheduled for ${milestone}. The route, its permission check, and its navigation entry already exist, so nothing is stubbed out behind a fake screen.`}
        />
      )}
    </div>
  );
}