import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-runner');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Control UI (runner entry only) → dist-runner/ui
execSync('vite build', { cwd: root, stdio: 'inherit', env: { ...process.env, RUNNER_BUILD: '1' } });

// 2. Server → one self-contained ESM file with ws/zod/simplex inlined. Node
// built-ins stay external; ws's optional native accelerators fall back to JS.
await build({
  entryPoints: [join(root, 'src/runner/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
  outfile: join(out, 'server.mjs'),
  logLevel: 'warning',
});

// 3. Runtime pixel data + a cwd-independent launcher
cpSync(join(root, 'pixel-map'), join(out, 'pixel-map'), { recursive: true });

writeFileSync(
  join(out, 'start.mjs'),
  `import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
process.env.RUNNER_UI_DIR ??= join(here, 'ui');
process.env.PIXEL_MAP_DIR ??= join(here, 'pixel-map');
await import('./server.mjs');
`,
);

writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'gothic-folly-runner',
      private: true,
      type: 'module',
      scripts: { start: 'node start.mjs' },
    },
    null,
    2,
  ) + '\n',
);

console.log('\n✓ dist-runner/ ready — copy the folder to the target and run: node start.mjs');
