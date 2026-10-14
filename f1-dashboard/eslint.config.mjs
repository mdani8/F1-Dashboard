import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'build-fixtures/**', 'artifacts/**'],
  },
  {
    files: ['*.mjs'],
    languageOptions: { globals: globals.node },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: {
      ...a11y.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Scroll regions and tab panels need keyboard focus to expose their content.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region', 'tabpanel'] }],
      'no-restricted-imports': ['error', { patterns: ['**/server/**', '#server/*'] }],
    },
  },
  {
    files: ['src/server/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/client/**'] }] },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/client/**',
            '**/server/**',
            'node:*',
            '#server/*',
            'react',
            'react/*',
            'react-dom',
            'react-dom/*',
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Async test doubles preserve rejection semantics even without asynchronous work.
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
);
