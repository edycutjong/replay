// Flat config (ESLint 9+ shape; we run on 10). One config for the whole tree —
// src/vendor is excluded because it is a vendored copy of a third-party SDK
// (vite.config.ts explains why it lives in the repo) and linting someone else's
// code to our house rules would just produce noise we can't fix at the source.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'out/**', 'cache/**', 'src/vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Only the two classic hook rules, not the plugin's full v7 "recommended-latest"
      // preset — that preset also turns on a family of React Compiler readiness rules
      // (purity, immutability, set-state-in-effect, static-components, ...) aimed at
      // codebases opting into the compiler. This one renders through an imperative
      // canvas layer on purpose (refs mutated in effects, a hand-rolled render loop),
      // which is exactly the shape those rules exist to flag elsewhere. Adopting the
      // compiler is a real decision for later, not a side effect of adding a linter.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'warn',
      // The codec's word-count/bounds checks intentionally return `false`/`null` from
      // shallow catches (decodeGameState, isEmbedded) — treating every branch as
      // significant here is more surface than the vendor SDK's own style asks for.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node-context config/build files: no browser globals, no React rules to apply.
    files: ['*.config.ts', '*.config.js', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // gates.ts, shipcheck.mjs and bench.ts report every check the same way —
      // `condition ? pass(...) : fail(...)`, one line per gate, both arms a call with
      // its own side effect. That is a deliberate house style for a report script, not
      // an accidental no-op expression, so this turns off only the ternary arm of the
      // rule and leaves it catching the real thing (`foo.bar;` typo'd off from a call)
      // everywhere else, gates.ts and bench.ts included, which stay untouched because
      // their output is pinned by published golden digests.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
    },
  },
);
