'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { PRIMARY_NAV, SECONDARY_NAV } from './Navigation';

/**
 * Command palette.
 *
 * Opened with a keyboard shortcut, because that is how it will actually be
 * used. The shortcut does not animate, per the rule that anything a keyboard
 * user repeats hundreds of times a day must feel instant.
 */

const ALL = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL;
    return ALL.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The active row resets in the change handler rather than in an effect, so
  // typing does not schedule a second render pass.
  const onQueryChange = (value: string) => {
    setQuery(value);
    setActive(0);
  };

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex h-10 w-full max-w-[22rem] items-center gap-2.5 rounded-[12px] border border-border bg-surface-sunken px-3.5 text-left text-[0.9375rem] text-ink-subtle hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <MagnifyingGlassIcon size={16} weight="regular" aria-hidden="true" />
        <span className="flex-1">Jump to</span>
        <kbd className="tabular rounded-[6px] border border-border bg-surface px-1.5 py-0.5 text-[0.6875rem]">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] max-w-xl translate-y-0 p-0">
          <DialogTitle className="sr-only">Jump to</DialogTitle>
          <DialogDescription className="sr-only">
            Search workspace destinations.
          </DialogDescription>

          <div className="border-b border-border p-3">
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                }
                if (event.key === 'Enter' && results[active]) {
                  event.preventDefault();
                  go(results[active].href);
                }
              }}
              placeholder="Search destinations"
              aria-label="Search destinations"
              className="h-10 w-full rounded-[10px] bg-transparent px-1 text-[0.9375rem] text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>

          <ul className="max-h-[18rem] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-[0.9375rem] text-ink-subtle">
                Nothing matches &ldquo;{query}&rdquo;
              </li>
            ) : (
              results.map((item, index) => (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 text-left text-[0.9375rem] ${
                      index === active
                        ? 'bg-accent-subtle text-accent'
                        : 'text-ink-muted'
                    }`}
                  >
                    <item.icon size={17} weight="regular" aria-hidden="true" />
                    {item.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}