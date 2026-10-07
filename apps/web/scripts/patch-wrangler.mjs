/**
 * Patch the Astro-generated wrangler.json for Cloudflare Pages compatibility.
 *
 * @astrojs/cloudflare generates a Workers-style wrangler.json that contains
 * fields incompatible with Cloudflare Pages:
 *   1. "assets.binding": "ASSETS" — reserved name in Pages (auto-provided)
 *   2. "kv_namespaces" without "id" — Pages requires namespace IDs
 *   3. "images" binding — needs dashboard configuration
 *
 * This script removes those fields so the Pages deploy step can proceed.
 * The bindings still work at runtime because Pages auto-injects ASSETS,
 * and KV/Images can be configured via the Cloudflare dashboard.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'dist', 'server', 'wrangler.json');

try {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  // Remove ASSETS binding — reserved and auto-provided in Pages
  delete config.assets;

  // Remove KV namespaces without IDs (e.g. auto-generated SESSION binding)
  config.kv_namespaces = (config.kv_namespaces || []).filter(ns => ns.id);

  // Remove images binding (configure via Cloudflare dashboard instead)
  delete config.images;

  writeFileSync(configPath, JSON.stringify(config));
  console.log('✓ Patched dist/server/wrangler.json for Cloudflare Pages');
} catch (err) {
  console.error('⚠ Failed to patch wrangler.json:', err.message);
  process.exit(1);
}
