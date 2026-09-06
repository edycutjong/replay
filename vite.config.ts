import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

/** Stamp the built HTML with the version scripts/stamp-version.ts wrote to
 *  public/version.json, so `curl <origin> | grep build-version` can tell you whether
 *  the origin is serving the commit you think it is. Injected here rather than written
 *  into index.html, which is tracked and would otherwise be dirty after every build. */
function buildVersion(): Plugin {
  return {
    name: 'replay-build-version',
    transformIndexHtml(html) {
      let v = 'unknown';
      try {
        const s = JSON.parse(readFileSync('public/version.json', 'utf8')) as { version: string; commit: string };
        v = `${s.version}+${s.commit}`;
      } catch { /* prebuild has not run; a missing stamp must not fail the build */ }
      return html.replace('</head>', `  <meta name="build-version" content="${v}" />\n  </head>`);
    },
  };
}

// `@chain/casino-sdk` is a private package (package.json `private: true`) and is not
// published to npm. The SDK docs bless vendoring its source into the consuming repo;
// src/vendor/casino-sdk is that vendored copy, aliased so every import site still reads
// as the real package name.
export default defineConfig({
  plugins: [react(), buildVersion()],
  resolve: {
    alias: {
      '@chain/casino-sdk/guest': fileURLToPath(new URL('./src/vendor/casino-sdk/guest.ts', import.meta.url)),
      '@chain/casino-sdk/host': fileURLToPath(new URL('./src/vendor/casino-sdk/host.ts', import.meta.url)),
      '@chain/casino-sdk': fileURLToPath(new URL('./src/vendor/casino-sdk/index.ts', import.meta.url)),
    },
  },
  build: { target: 'es2022' },
});
