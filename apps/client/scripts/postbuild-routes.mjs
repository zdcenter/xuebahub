import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distBrowserDir = path.resolve(__dirname, '../dist/client/browser');

function copyStaticPages() {
  if (!fs.existsSync(distBrowserDir)) {
    return;
  }

  // 1. 为顶级频道生成 .html 单文件副本
  const topChannels = ['book', 'primary', 'junior', 'senior', 'cert', 'exam'];
  for (const ch of topChannels) {
    const indexPath = path.join(distBrowserDir, ch, 'index.html');
    const htmlPath = path.join(distBrowserDir, `${ch}.html`);
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, htmlPath);
      console.log(`[Postbuild] Created ${ch}.html`);
    }
  }

  // 2. 为所有 resource/:id 生成 .html 副本，如 /resource/res-xxx.html
  const resourceDir = path.join(distBrowserDir, 'resource');
  if (fs.existsSync(resourceDir)) {
    const entries = fs.readdirSync(resourceDir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const indexPath = path.join(resourceDir, entry.name, 'index.html');
        const targetHtml = path.join(resourceDir, `${entry.name}.html`);
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, targetHtml);
          count++;
        }
      }
    }
    console.log(`[Postbuild] Created ${count} resource .html route copies.`);
  }
}

copyStaticPages();

// ============================================================
// 关键修复：用 CSR 空壳替换 SPA fallback 的 index.html
// ============================================================
// EdgeOne 对于 /resource/res-xxx 这样的路径找不到物理文件时，
// 会 fallback 到 /index.html（SPA 模式）。
// 原始 index.html 是 600KB 的预渲染首页，导致先闪首页再跳转。
// 替换为 4KB 的 CSR 空壳后，fallback 只会得到空白页面，
// Angular 启动后直接渲染正确页面，不会闪首页。
function replaceFallbackWithCsrShell() {
  const indexHtml = path.join(distBrowserDir, 'index.html');
  const csrHtml = path.join(distBrowserDir, 'index.csr.html');

  if (!fs.existsSync(csrHtml)) {
    console.warn('[Postbuild] ⚠️  index.csr.html not found, skipping fallback replacement.');
    return;
  }

  // 备份原始预渲染首页
  const backupPath = path.join(distBrowserDir, '_home_ssr.html');
  fs.copyFileSync(indexHtml, backupPath);
  console.log('[Postbuild] Backed up original index.html → _home_ssr.html');

  // 用 CSR 空壳覆盖 index.html
  fs.copyFileSync(csrHtml, indexHtml);
  console.log('[Postbuild] ✅ Replaced index.html with index.csr.html (4KB CSR shell)');
  console.log('[Postbuild]    → SPA fallback will no longer flash homepage content');
}

replaceFallbackWithCsrShell();
