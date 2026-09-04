import { defineConfig } from 'vitest/config';

// Coverage is scoped to src/game/** — the ported paytable math (pascal.ts, unrank.ts,
// menu.ts) that test/enumeration.test.ts exists to hold at 100%. Everything else in src/
// is either vendored third-party code, a throwaway D00 scaffold, or not yet built:
//   - src/vendor/**  the vendored @chain/casino-sdk (not ours to cover)
//   - src/main.tsx   React bootstrap, no logic
//   - src/App.tsx    the D00 stub (specs/build-plan.md); the real UI lands D07-D13
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/game/**'],
      exclude: ['src/vendor/**', 'src/main.tsx', 'src/App.tsx', 'scripts/**', 'dist/**'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
