import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

/**
 * WHY `--webpack` IS REQUIRED ON `dev` AND `build`:
 *
 * Serwist compiles the service worker at build time by attaching a webpack plugin.
 * Next.js 16 runs Turbopack by default, and Serwist cannot hook into Turbopack yet.
 * Passing `--webpack` in the npm scripts keeps the PWA pipeline intact.
 *
 * WHEN THIS CAN BE DROPPED:
 * When `@serwist/next` publishes stable Turbopack support. At that point remove the
 * flag from `dev` and `build` in package.json and delete nothing else. See docs/ROADMAP.md.
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // The service worker is disabled in development unless explicitly enabled, so HMR
  // is not shadowed by a stale cached shell.
  disable:
    process.env.NODE_ENV === 'development' &&
    process.env.LIKO_ENABLE_SW !== 'true',
  reloadOnOnline: true,
  /*
   * MUST STAY FALSE. Read this before switching it on.
   *
   * `cacheOnNavigation` patches `history.pushState` and `replaceState` so that
   * every client-side navigation tells the worker to fetch that URL and store
   * the response in a runtime cache named `pages`. It runs in the Serwist entry
   * worker, entirely OUTSIDE the `runtimeCaching` rules in `src/sw.ts`.
   *
   * That matters because `src/sw.ts` uses an allowlist of public documents
   * precisely so that `/overview` and `/grades` are never cached, and it looked
   * like that was sufficient. It is not. With this flag on, the allowlist is
   * bypassed for the exact URLs it exists to protect: signing in lands on
   * `/overview`, which lands on `/grades`, and both HTML documents, complete
   * with student names and marks, sit in a cache keyed by URL.
   *
   * The failure is silent. There is no error and no staleness warning, so
   * whichever teacher signs in next on the same machine is handed the previous
   * one's dashboard out of the cache. That was verified rather than assumed:
   * a `pages` cache holding `/login`, `/overview` and `/grades` was found on a
   * signed-in production build. `e2e/pwa.spec.ts` now fails if any private
   * response reaches any cache.
   *
   * The library default is already false. It is written out here so that turning
   * it on has to be a deliberate act with this comment in the diff.
   */
  cacheOnNavigation: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    /*
     * The marketing page and the app shell both import named icons from the
     * Phosphor package. Without this the barrel entry is pulled in whole and
     * every named icon drags the rest of the set along with it. Listing the
     * package here rewrites those named imports to their individual modules,
     * so a server component that forgets the `/dist/ssr` entry still fails
     * loudly at build time instead of quietly shipping the context-based one.
     */
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);