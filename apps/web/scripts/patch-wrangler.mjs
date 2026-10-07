/**
 * Transform Astro's Workers-style build output into Cloudflare Pages format.
 *
 * @astrojs/cloudflare v14 generates Workers-style output:
 *   dist/server/entry.mjs   (SSR worker)
 *   dist/server/chunks/     (server chunks)
 *   dist/client/            (static assets)
 *
 * Cloudflare Pages expects:
 *   dist/client/             (static assets root = pages_build_output_dir)
 *   dist/client/_worker.js/  (SSR worker directory, auto-discovered by Pages)
 *
 * This script:
 * 1. Removes .wrangler/deploy/config.json (prevents redirect to incompatible config)
 * 2. Copies server code into dist/client/_worker.js/ directory
 * 3. Creates an index.js entry point inside _worker.js/
 */

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distServer = join(root, 'dist', 'server');
const distClient = join(root, 'dist', 'client');
const workerDir = join(distClient, '_worker.js');

try {
  // 1. Remove redirect file so Pages uses our wrangler.toml directly
  const deployConfig = join(root, '.wrangler', 'deploy', 'config.json');
  if (existsSync(deployConfig)) {
    rmSync(deployConfig);
    console.log('  ✓ Removed .wrangler/deploy/config.json redirect');
  }

  // 2. Create _worker.js directory in client output
  if (existsSync(workerDir)) {
    rmSync(workerDir, { recursive: true });
  }
  mkdirSync(workerDir, { recursive: true });

  // 3. Copy server files (except wrangler.json) into _worker.js/
  cpSync(join(distServer, 'chunks'), join(workerDir, 'chunks'), { recursive: true });
  cpSync(join(distServer, 'entry.mjs'), join(workerDir, 'entry.mjs'));
  if (existsSync(join(distServer, 'virtual_astro_middleware.mjs'))) {
    cpSync(join(distServer, 'virtual_astro_middleware.mjs'), join(workerDir, 'virtual_astro_middleware.mjs'));
  }

  // 4. Create index.js entry that re-exports from entry.mjs
  writeFileSync(
    join(workerDir, 'index.js'),
    `export { default } from './entry.mjs';\n`
  );

  console.log('✓ Transformed build output for Cloudflare Pages');
  console.log('  - Worker: dist/client/_worker.js/');
  console.log('  - Assets: dist/client/');
} catch (err) {
  console.error('⚠ Failed to transform build output:', err.message);
  process.exit(1);
}
