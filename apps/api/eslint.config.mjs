// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
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
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],

      // Prefixul `_` marchează ceva declarat intenționat și nefolosit: parametri ceruți de un
      // decorator Nest, sau aserțiunile de tip din `src/contract.ts`, care există doar ca `tsc`
      // să le verifice.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Familia `no-unsafe-*` raportează ~190 de locuri unde `any` circulă prin servicii. E datorie
      // reală de tipuri, nu zgomot — dar e datorie *veche*, iar la `error` ar face `pnpm lint`
      // roșu din prima zi, deci inutil ca poartă de CI: nimeni nu deosebește o regresie nouă de
      // fundalul constant.
      //
      // La `warn` rămân vizibile la fiecare rulare și numărabile, iar CI poate bloca erorile noi.
      // Se ridică înapoi la `error` pe măsură ce E05 le plătește, modul cu modul.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },
);
