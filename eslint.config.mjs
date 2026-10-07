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