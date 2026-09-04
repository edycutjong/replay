import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// `@chain/casino-sdk` is a private package (package.json `private: true`) and is not
// published to npm. The SDK docs bless vendoring its source into the consuming repo;
// src/vendor/casino-sdk is that vendored copy, aliased so every import site still reads
// as the real package name.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@chain/casino-sdk/guest': fileURLToPath(new URL('./src/vendor/casino-sdk/guest.ts', import.meta.url)),
      '@chain/casino-sdk/host': fileURLToPath(new URL('./src/vendor/casino-sdk/host.ts', import.meta.url)),
      '@chain/casino-sdk': fileURLToPath(new URL('./src/vendor/casino-sdk/index.ts', import.meta.url)),
    },
  },
  build: { target: 'es2022' },
});
