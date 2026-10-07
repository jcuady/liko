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
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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