import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { CookieConsentBanner } from '@/components/legal/CookieConsentBanner';

import './globals.css';

/**
 * Geist is the shipping typeface. Söhne is a paid Klim licence and cannot be
 * fetched from npm, so Geist stands in as the closest open neo-grotesk. To
 * switch to a licensed Söhne, replace these two imports and the two
 * `--font-geist-*` variables. Every component reads `--font-sans`, so no
 * component changes.
 */
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  /*
   * Not preloaded. `--font-mono` is read by exactly one rule in `globals.css`
   * (the tabular-nums utility, for numbers in the gradebook and heatmap), and
   * preloading a face on every route to serve it on one screen is a request
   * every visitor pays for and most never need.
   */
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://liko.app',
  ),
  title: {
    default: 'LIKO. Every teaching task, in one flow.',
    template: '%s. LIKO',
  },
  description:
    'LIKO holds your plans, assessments, gradebook, and student history on a single thread, so nothing gets rebuilt twice.',
  applicationName: 'LIKO',
  appleWebApp: { capable: true, title: 'LIKO', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'LIKO',
    title: 'LIKO. Every teaching task, in one flow.',
    description:
      'Plan, create, assess, grade, and analyze on a single thread. Built for teachers who are done retyping the same data into four tools.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LIKO. Every teaching task, in one flow.',
    description:
      'Plan, create, assess, grade, and analyze on a single thread.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#29813d',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} no-js`}
    >
      <head>
        {/*
          Scroll reveals are baked into the server HTML as `opacity: 0`, because
          that is what Motion renders on the first pass. If scripting never runs
          the content would stay invisible, which is not an acceptable state for
          a PWA whose whole premise is that it opens without a network.

          The class starts as `no-js` and flips during parsing, long before React
          hydrates, so there is no flash of hidden content and no hydration
          mismatch to suppress. `globals.css` pins `[data-reveal]` visible while
          the `no-js` class is still present.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.replace('no-js','js')`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <QueryProvider>
            {children}
            <ToastProvider />
            {/*
              Mounted at the root rather than inside the marketing group so that
              /terms, /privacy and /cookies, which are reachable from anywhere,
              all carry it. The component itself decides not to render inside the
              workspace.
            */}
            <CookieConsentBanner />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}