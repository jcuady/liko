import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Generated rather than hand-written so the theme colours stay
 * in step with the design tokens.
 *
 * `start_url` is `/overview` because that is the first screen after sign-in.
 * A signed-out install still lands on the marketing page through the auth
 * redirect.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LIKO. Every teaching task, in one flow.',
    short_name: 'LIKO',
    description:
      'Plan, create, assess, grade, and analyze on a single thread.',
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fdf8f5',
    theme_color: '#29813d',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}