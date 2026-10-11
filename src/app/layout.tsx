import type { Metadata, Viewport } from 'next';
import { DM_Sans, Geist_Mono, Manrope } from 'next/font/google';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { CookieConsentBanner } from '@/components/legal/CookieConsentBanner';

import './globals.css';

/**
 * The shipping typefaces, and why there are two of them plus a mono.
 *
 * The supplied brand design sets DM Sans for interface text and Manrope for
 * display, and the split is the design's own: the hero and section headings are
 * cut in a geometric face with a taller x-height while running copy stays in the
 * neutral sans. `--font-display` is wired to headings in `globals.css`, so a
 * component picks a voice by reading a token rather than by naming a font.
 *
 * Geist Mono stays. Numbers never reflow in the gradebook, the heatmap or the
 * stat tiles, and that is tabular figures rather than a typeface decision.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
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
  /*
     The browser chrome followed the page in name only. One fixed viridian meant
     the mobile address bar stayed brand green over the near-black dark canvas,
     and `colorScheme: 'light'` told the UA this was a light-only document, so
     scrollbars, the default canvas and unstyled form controls were all painted
     from the light palette while the app sat in dark mode.

     Both now follow `prefers-color-scheme`, and they use the same two surface
     values the token layer uses: the viridian in light, the dark page in dark.
  */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#007134' },
    { media: '(prefers-color-scheme: dark)', color: '#090f0c' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${manrope.variable} ${geistMono.variable} no-js`}
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