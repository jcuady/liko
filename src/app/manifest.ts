import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Generated rather than hand-written so the theme colours stay
 * in step with the design tokens.
 *
 * `start_url` is `/overview` because that is the first screen after sign-in.
 * A signed-out install still lands on the marketing page through the auth
 * redirect.
 *
 * THE TWO COLOURS ARE THE BRAND, REWRITTEN IN HEX.
 *
 * A manifest has no way to read a CSS custom property, so these are the only
 * places in the product where a brand colour is written as hex rather than
 * through a token. Both are computed from the tokens they mirror:
 * `--accent` at `oklch(0.48 0.13 151)` is `#007134`, and `--surface` at
 * `oklch(0.989 0.003 130)` is `#fbfcfa`. They used to be `#29813d` and
 * `#fdf8f5`, which were the pre-rebrand values, so an installed LIKO was showing
 * a mobile address bar in the old green against the new canvas.
 *
 * `e2e/pwa.spec.ts` pins `theme_color` on purpose. A generated manifest is a
 * generated manifest: it is easy to "regenerate" it with a default and never
 * notice, so the value is asserted rather than assumed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LIKO. Less admin. More teaching.',
    short_name: 'LIKO',
    description:
      'The teacher workspace for lessons, grades, student insights and quizzes.',
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#fbfcfa',
    theme_color: '#007134',
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
    /*
     * Long press the installed icon. These are the three screens a teacher
     * opens between classes, and they are all real routes: the shortcuts used
     * to be absent because the landing page had an App Store button instead,
     * which is a promise the product cannot keep.
     */
    shortcuts: [
      { name: 'Take attendance', url: '/attendance' },
      { name: 'Classes', url: '/classes' },
      { name: 'Grades', url: '/grades' },
    ],
  };
}