import { defineConfig } from 'oxfmt'

// FMC default — aligned with tilda-geo (single quotes) and trassenscout (ignore/build paths).
// Copy to project root on scaffold; adjust sortTailwindcss.stylesheet and ignorePatterns (keep in sync with oxlint.config.mjs).
export default defineConfig({
  useTabs: false,
  tabWidth: 2,
  printWidth: 100,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  semi: false,
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  sortImports: {
    newlinesBetween: false,
  },
  sortTailwindcss: {
    stylesheet: 'src/index.css',
    functions: ['twMerge', 'twJoin', 'clsx'],
  },
  sortPackageJson: true,
  // Health-tracker: the user's Markdown docs keep their own table/emphasis style, do not rewrite them.
  ignorePatterns: [
    '.agents/**',
    '.cursor/**',
    '.output/**',
    'dist/**',
    'docs/**',
    'PLAN.md',
    'private/**',
  ],
})
