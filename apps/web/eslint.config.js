// @ts-check
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import root from '../../eslint.config.js';

export default tseslint.config(
  ...root,
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'st', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'st', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/prefer-standalone': 'error',
    },
  },
  {
    files: ['**/*.html'],
    // Inline templates are virtual files without type information; the typed
    // rules from the root config cannot run on them.
    extends: [
      tseslint.configs.disableTypeChecked,
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },
  { ignores: ['playwright.config.ts', 'e2e/**/*.js', 'out-tsc/**'] },
);
