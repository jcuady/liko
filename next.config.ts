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
  /*
   * THERE IS NO `optimizePackageImports` BLOCK HERE, AND THAT IS DELIBERATE.
   *
   * There used to be one, naming `@phosphor-icons/react`, with a comment about
   * the Phosphor barrel entry dragging the whole icon set into every bundle. It
   * was the last trace of a migration this repository had otherwise completed:
   * the product imports `lucide-react` and has done so for a long time, the
   * package was not in `package.json`, and `node_modules/@phosphor-icons` did
   * not exist. An optimisation for a package that is not installed is dead
   * configuration that reads as live, and it is worse than nothing because it
   * looks like someone thought about bundle size.
   *
   * The concern it described is real and is already handled, by Next.js itself:
   * `lucide-react` is in Next's DEFAULT `optimizePackageImports` list, so named
   * icon imports are rewritten to their individual modules without this project
   * asking. That was verified against the installed `next` package rather than
   * taken from memory, which is the only reason this paragraph can say so.
   *
   * If a new icon library is added, check Next's default list before adding a
   * line here: an entry for a package Next already covers is a no-op, and an
   * entry for a package that is not installed is worse.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack(config) {
    /*
     * `unpdf` reaches for `import.meta` at module scope, which webpack cannot
     * statically analyse and reports as a critical dependency on every build.
     *
     * It is silenced rather than tolerated because a warning that fires on
     * every build is a warning the team learns to skip, and the next one that
     * appears would be skipped with it. The path is matched exactly, so a
     * genuine `import.meta` problem anywhere else in the tree still reports.
     *
     * This is not a papered-over failure. `e2e/deck-upload.spec.ts` uploads a
     * real PDF through the running server and asserts on the exact word count
     * that comes back out of it, so if this module stopped working under
     * webpack that suite goes red rather than the build going quiet.
     */
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules[\\/].*unpdf[\\/].*index\.mjs/ },
    ];
    return config;
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