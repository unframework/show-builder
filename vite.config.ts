/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const PIXEL_MAP_DIR = join(import.meta.dirname, 'pixel-map');
const RUNNER_ORIGIN = 'http://127.0.0.1:3002';
const runnerOnlyBuild = process.env.RUNNER_BUILD === '1';
const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

// The sims fetch LED position data from /pixel-map/*.json at runtime (so the same
// build can point at local files on the playa or the remote wiki). That directory
// lives at the repo root, outside Vite's public dir, so serve it directly in dev.
function servePixelMap(): Plugin {
  return {
    name: 'serve-pixel-map',
    configureServer(server) {
      server.middlewares.use('/pixel-map', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const full = join(PIXEL_MAP_DIR, rel);
        if (full !== PIXEL_MAP_DIR && !full.startsWith(PIXEL_MAP_DIR + sep)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        try {
          const body = readFileSync(full);
          res.setHeader('Content-Type', CONTENT_TYPES[extname(rel)] ?? 'application/octet-stream');
          res.end(body);
        } catch {
          next();
        }
      });
    }
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), servePixelMap()],
  server: {
    host: '127.0.0.1',
    allowedHosts: ['.ts.net'],
    // Route the effect runner's control channel through the dev origin so the
    // browser never opens a second (mixed-content-prone) connection to :3002.
    proxy: {
      '/fx': {
        target: RUNNER_ORIGIN,
        ws: true
      }
    }
  },
  build: runnerOnlyBuild ? {
    // Deployable runner artifact: just the control UI, no 3D sim.
    outDir: 'dist-runner/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        runner: join(import.meta.dirname, 'runner.html')
      }
    }
  } : {
    rollupOptions: {
      input: {
        cathedral: join(import.meta.dirname, 'cathedral.html'),
        runner: join(import.meta.dirname, 'runner.html')
      }
    }
  },
  test: {
    projects: [{
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});