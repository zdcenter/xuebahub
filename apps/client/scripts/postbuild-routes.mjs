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
