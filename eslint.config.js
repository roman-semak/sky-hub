// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.ts', '**/*.mts', '**/*.cts'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/node_modules/**',
      'design_handoff_flight_radar/**',
      'data/**',
      '**/*.config.{js,mjs,ts}',
      '**/playwright-report/**',
      '**/out-tsc/**',
    ],
  },
  {
    // TS rules are scoped to TS files: Angular inline templates are linted as
    // virtual .html files that carry no type information.
    files: TS_FILES,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Mocks implement async interfaces without awaiting anything.
      '@typescript-eslint/require-await': 'off',
      // Tests deliberately throw non-Error values to cover defensive branches.
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  prettier,
);
