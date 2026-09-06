import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Coverage used to be scoped to src/game/** — the ported paytable math (pascal.ts,
// unrank.ts, menu.ts) that test/enumeration.test.ts holds at 100%. That scope was the
// bug: four real defects shipped in this repo and every one of them lived in a file the
// threshold never looked at (App.tsx's ticket resolution, coldOpen's fence colour, the
// unmounted host bridge, a stale-closure effect). Coverage now spans all of src/, and a
// file is excluded only when there is a concrete, stated reason it can't be exercised
// here — not because exercising it would be inconvenient.
//
//   src/vendor/**  the vendored @chain/casino-sdk (not ours to cover)
//   src/main.tsx   a 6-line React bootstrap: createRoot + render, no branches
//
// Every included file holds 100% today (lines, branches, functions, statements) — a
// handful of genuinely unreachable defensive branches are marked with a targeted
// `/* v8 ignore */` and a reason at the call site, rather than folded into a lowered
// global number.
export default defineConfig({
  // Mirrors vite.config.ts's alias — vitest does not read that file, so
  // useCasinoHost.ts's `@chain/casino-sdk*` imports would otherwise fail to resolve
  // under test the same way they resolve in the real build.
  resolve: {
    alias: {
      '@chain/casino-sdk/guest': fileURLToPath(new URL('./src/vendor/casino-sdk/guest.ts', import.meta.url)),
      '@chain/casino-sdk/host': fileURLToPath(new URL('./src/vendor/casino-sdk/host.ts', import.meta.url)),
      '@chain/casino-sdk': fileURLToPath(new URL('./src/vendor/casino-sdk/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/vendor/**', 'src/main.tsx', 'scripts/**', 'dist/**'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  plugins: [react()],
});
