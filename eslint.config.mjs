import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint 9 flat config.
 *
 * eslint-config-next 16 exports flat arrays directly, so the `FlatCompat`
 * shim from older setups is not used here: wrapping these configs in the
 * legacy compat layer produces a circular-structure crash.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'public/sw.js',
      'public/swe-worker-*.js',
      'next-env.d.ts',
      'test-results/**',
      'playwright-report/**',
      // Brand build tooling in scripts/ is CommonJS and runs under plain Node.
      // It is deliberately outside the app module graph and outside the
      // shipped-code bar: stdout is the whole point of `build-logo.cjs`.
      // The pattern needs the `**/` prefix, otherwise it only matches `.cjs`
      // files sitting in the project root.
      '**/*.cjs',
      // `seed.mjs` is the same category: a developer CLI whose output is the
      // product. Nothing in `scripts/` is ever bundled or served.
      '**/*.mjs',

      /*
       * The supplied brand prototype.
       *
       * A separate Vite and TanStack Router project that happens to sit inside
       * this repository. It is the reference the design was ported from, not
       * part of the application, and it is already excluded from `tsconfig.json`,
       * `.gitignore` and `.vercelignore`.
       *
       * It was MISSING from here, which meant `pnpm lint` had been failing on
       * somebody else's codebase: 18 errors and 7 warnings, every one of them
       * in files this product does not build, serve or ship. The gate was being
       * reported as green because it was being run as `eslint src e2e` rather
       * than as the project's own `eslint .`, so nothing in this repository
       * noticed for several days.
       *
       * Four files have to agree on this list. If you are adding a new top level
       * directory that should not be built, excluded from the module graph, or
       * kept out of version control, add it to all of them in the same commit.
       */
      'Liko new landing design and branding/**',
    ],
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // The shipped-code bar is zero stray console statements. Structured
      // reporting belongs to the observability layer, not to components.
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];

export default eslintConfig;