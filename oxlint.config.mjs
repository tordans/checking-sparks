import { defineConfig } from 'oxlint'

// FMC default — shared tilda-geo / trassenscout base (no app-specific jsPlugins).
// Add custom jsPlugins per app (e.g. Trassenscout auth-boundary rules — see references/oxc-config.md).
// ignorePatterns: keep in sync with oxfmt.config.mjs.
export default defineConfig({
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'react'],
  options: { typeAware: true },
  ignorePatterns: ['.agents/**', '.cursor/**', '.output/**', 'dist/**'],
  rules: {
    'typescript/switch-exhaustiveness-check': 'error',
    // Restriction category — keep ESLint recommended coverage (off by default in oxlint)
    'react/unsupported-syntax': 'error',
    // Allow bare `_` (oxlint default ignores `_foo` but not `_`); object config clears defaults
    'eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'typescript/no-non-null-assertion': 'off',
        'react/rules-of-hooks': 'off',
      },
    },
    {
      files: ['src/**'],
      jsPlugins: [{ name: 'compat', specifier: 'eslint-plugin-compat' }],
      rules: {
        'compat/compat': 'error',
      },
    },
  ],
})
