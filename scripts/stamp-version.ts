/**
 * stamp-version — put the running version somewhere a person can read it. `prebuild`
 *
 * semantic-release moves `package.json`'s version on the release commit, but a version
 * that only exists in a git tag cannot answer the question that actually gets asked
 * during a jam: "is the thing serving right now the thing I just fixed?" So the build
 * writes it to the origin as `/version.json`; `vite.config.ts` injects the same string
 * as a `build-version` meta tag, which is why this script does not rewrite index.html —
 * a prebuild step that edits a tracked file leaves the working tree dirty after every
 * single build.
 *
 * Deliberately NOT rendered on the board. The lamp surface is governed by ui.md's
 * string discipline (G9) and interactive budget (G11); a build stamp is developer
 * metadata, not part of the game, and adding it to the frame would spend a scored
 * budget on something no player wants.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; name: string };

const git = (cmd: string, fallback: string): string => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return fallback; }
};

// CI checks out a detached HEAD, so the branch name falls back to the environment when
// git cannot supply it. Both lookups are best-effort: a missing sha must not fail a build.
const stamp = {
  name: pkg.name,
  version: pkg.version,
  commit: git('git rev-parse --short HEAD', process.env.GITHUB_SHA?.slice(0, 7) ?? 'unknown'),
  branch: git('git rev-parse --abbrev-ref HEAD', process.env.GITHUB_REF_NAME ?? 'unknown'),
  builtAt: new Date().toISOString(),
};

mkdirSync('public', { recursive: true });
writeFileSync('public/version.json', JSON.stringify(stamp, null, 2) + '\n');

console.log(`version: ${stamp.version}+${stamp.commit} -> public/version.json`);
