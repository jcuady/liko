'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      /*
       * `enableSystem` is on, and `defaultTheme` is "system".
       *
       * It was off before, so the site was always light until someone pressed the
       * toggle. That is wrong twice over. A teacher on a laptop set to dark
       * spends the day looking at a white page until they find the setting, and
       * "Essential only" on the cookie banner promises the site follows the
       * operating system. With system mode off that promise was false.
       *
       * Storage is still only written when someone actually picks a theme, which
       * is the part the cookie banner gates.
       */
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="liko-theme"
    >
      {children}
    </NextThemesProvider>
  );
}