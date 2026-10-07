'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoonIcon, SunIcon, SignOutIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useIsHydrated } from '@/lib/hooks/use-media-query';

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is unknown during SSR, so the icon is only swapped once
  // hydrated. Rendering a different icon on the server is a hydration mismatch.
  const mounted = useIsHydrated();

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <span className="grid size-7 place-items-center rounded-full bg-accent-subtle text-[0.6875rem] font-semibold text-accent">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[10rem] truncate sm:inline">
            {email}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as {email}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings/profile">Profile settings</Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings/appearance">Appearance</Link>
        </DropdownMenuItem>

        {mounted ? (
          <DropdownMenuItem
            onSelect={() =>
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
            }
          >
            {resolvedTheme === 'dark' ? (
              <SunIcon weight="regular" aria-hidden="true" />
            ) : (
              <MoonIcon weight="regular" aria-hidden="true" />
            )}
            {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem destructive onSelect={signOut}>
          <SignOutIcon weight="regular" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}