import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  // This is the strict plugin that will prevent ESLint from interfering with the outputs
  {
    ignores: [
      'node_modules/**',
      'converted-expo-app/**',
      'templates/**',
      'dist/**',
      'build/**',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      eqeqeq: 'error',
    },
  },
];
