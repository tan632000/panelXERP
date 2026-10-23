// @ts-check
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const configDir = dirname(fileURLToPath(import.meta.url));
const erpPluginPath = [
  join(configDir, 'eslint-plugin-erp', 'index.js'),
  join(configDir, 'tools', 'eslint-plugin-erp', 'index.js'),
  join(configDir, '..', 'tools', 'eslint-plugin-erp', 'index.js'),
].find((candidate) => existsSync(candidate));

if (!erpPluginPath) {
  throw new Error(
    'eslint-plugin-erp not found. Expected tools/eslint-plugin-erp under the package or repo root.',
  );
}

const erpPlugin = require(erpPluginPath);

const noReexportRules = [
  {
    selector: 'ExportAllDeclaration',
    message:
      'Do not re-export (`export * from`). Import from the original module instead.',
  },
  {
    selector: 'ExportNamedDeclaration[source]',
    message:
      'Do not re-export (`export { x } from`). Import from the original module instead.',
  },
  {
    selector: 'ExportNamedDeclaration:not([source]):not([declaration])',
    message:
      'Do not re-export (`export { x }` / `export type { x }`). Import from the original module instead.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'eslint-plugin-erp/**',
      'dist/**',
      'node_modules/**',
      '**/*.d.ts',
      'scripts/**/*.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      import: importPlugin,
      erp: erpPlugin,
    },
    rules: {
      'erp/no-cross-plugin-import': ['error', { mode: 'backend' }],
      'erp/no-iso8601-date-field': 'error',
      'erp/no-permission-literal': 'error',
      'erp/no-vietnamese-comments': 'error',

      // --- Shared hygiene (keep equivalent with frontend/eslint.config.mjs) ---
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-throw-literal': 'error',
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-nested-ternary': 'warn',
      'prefer-arrow-callback': ['warn', { allowNamedFunctions: true }],
      'no-useless-return': 'error',
      'no-else-return': ['warn', { allowElseIf: false }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/no-empty-function': [
        'warn',
        { allow: ['arrowFunctions', 'functions', 'methods'] },
      ],

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '../**', '..'],
              message:
                'Do not use parent-relative imports (../). Use path aliases: @kernel/*, @plugins/*, @shared/* or @webhooks/*.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...noReexportRules],

      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'sibling',
            'parent',
            'index',
            'object',
            'type',
          ],
          pathGroups: [
            {
              pattern: '@kernel/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@shared/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@src/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@plugins/**',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@webhooks/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin', 'type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          distinctGroup: true,
        },
      ],

      // Nest / project-specific
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['**/index.ts', '**/index.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: [
      '**/seeds/**',
      '**/scripts/**',
      '**/*.{spec,test,e2e-spec}.ts',
      '**/test/**',
    ],
    rules: {
      'no-console': 'off',
    },
  },
);
