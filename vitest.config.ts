import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * `.tsx` IS COLLECTED, AND ITS ABSENCE WAS A SILENT HOLE.
     *
     * The globs below used to match `.test.ts` only, so a component test written
     * as `.test.tsx` — `NoClassesYet.test.tsx` — was never picked up. It was not
     * failing, not skipped and not reported: it simply did not exist as far as
     * the runner was concerned, while sitting in the tree looking exactly like
     * coverage. The count of test files did not move when it was added, which is
     * the tell. A check that cannot fail is worse than no check, because it is
     * read as protection.
     *
     * Collecting it costs nothing: that test is pure assertions over a copy
     * function and runs under `environment: 'node'` below with no DOM at all.
     *
     * The old patterns are written out rather than globbed here on purpose. A
     * recursive glob contains a slash followed by a star, and that pair is a
     * block comment terminator — so writing one inside this comment closes it
     * early and the config fails to parse. That is not hypothetical; it is what
     * happened the first time this note was written.
     */
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * `server-only` throws on import outside a React Server Component graph,
       * and Vitest has none. Without this alias a server module could not be
       * unit tested at all, and the only alternative would be to leave it
       * untested. The guard stays exactly where it is in the application.
       */
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});