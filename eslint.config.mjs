import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  // هذه هي الإضافة الصارمة التي ستمنع ESLint من حشر أنفه في المخرجات
  {
    ignores: [
      'node_modules/',
      'converted-expo-app/',
      'dist/',
      'build/',
      'tests/fixtures/',
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
