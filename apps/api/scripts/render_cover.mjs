import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const webRoot = path.resolve(apiRoot, '..', 'web');

// 优先查找 logo.svg
let logoSvgPath = path.join(apiRoot, 'assets', 'logo.svg');
if (!fs.existsSync(logoSvgPath) && fs.existsSync(path.join(webRoot, 'public', 'logo.svg'))) {
  logoSvgPath = path.join(webRoot, 'public', 'logo.svg');
}

let logoDataUri = '';
if (fs.existsSync(logoSvgPath)) {
  const logoContent = fs.readFileSync(logoSvgPath, 'utf8');
  logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
}

function getFileIcon(ext, isDir) {
  if (isDir) return '📁';
  const e = (ext || '').toUpperCase();
  if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV'].includes(e)) return '🎬';
  if (['PDF'].includes(e)) return '📄';
  if (['DOC', 'DOCX', 'TXT', 'WPS'].includes(e)) return '📝';
  if (['PPT', 'PPTX'].includes(e)) return '📑';
  if (['XLS', 'XLSX'].includes(e)) return '📊';
  if (['ZIP', 'RAR', '7Z', 'TAR'].includes(e)) return '📦';
  if (['MP3', 'WAV'].includes(e)) return '🎵';
  return '📄';
}

function extractDisplayItems(fileTree) {
  if (!fileTree || !Array.isArray(fileTree) || fileTree.length === 0) {
    return { items: [], totalCount: 0 };
  }

  let list = fileTree;
  if (list.length === 1 && list[0].is_dir && Array.isArray(list[0].children) && list[0].children.length > 0) {
    list = list[0].children;
  }

  const items = list.slice(0, 4).map(item => ({
    name: item.name,
    icon: getFileIcon(item.ext, item.is_dir),
    size: item.size || (item.is_dir ? '文件夹' : '资料包'),
    isDir: item.is_dir
  }));

  return {
    items,
    totalCount: list.length
  };
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtmlTemplate(resource) {
  const { items, totalCount } = extractDisplayItems(resource.file_tree);
  const title = escapeHtml(resource.title);
  const grade = escapeHtml(resource.grade || '全阶段');
  const subject = escapeHtml(resource.subject || '精品资料');
  const edition = escapeHtml(resource.edition || '官方正版');
  const size = escapeHtml((!resource.file_size || resource.file_size === '0 B') ? '全套精选资料' : resource.file_size);

  const fileListHtml = items.map(item => `
    <div class="file-row">
      <span class="file-icon">${item.icon}</span>
      <span class="file-name">${escapeHtml(item.name)}</span>
      <span class="file-size">${escapeHtml(item.size)}</span>
    </div>
  `).join('');

  const moreTextHtml = totalCount > items.length 
    ? `<div class="more-row"><span>... 以及其余共 <strong>${totalCount}</strong> 项真实网盘资源</span><span class="badge-tag">所见即所存</span></div>`
    : `<div class="more-row"><span>✓ 以上为根目录下全部已探测解析资源</span><span class="badge-tag">100% 存活</span></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 600px;
      height: 600px;
      background: radial-gradient(circle at 50% 25%, #1e3a8a 0%, #0f172a 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      color: #ffffff;
      padding: 32px 36px 30px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      position: relative;
    }
    .bg-blur-1 {
      position: absolute;
      top: -80px;
      right: -80px;
      width: 300px;
      height: 300px;
      background: rgba(37, 99, 235, 0.35);
      filter: blur(80px);
      border-radius: 50%;
      pointer-events: none;
    }
    .bg-blur-2 {
      position: absolute;
      bottom: -60px;
      left: -60px;
      width: 260px;
      height: 260px;
      background: rgba(245, 158, 11, 0.2);
      filter: blur(70px);
      border-radius: 50%;
      pointer-events: none;
    }
    .top-brand {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      padding-bottom: 16px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo-img {
      width: 48px;
      height: 48px;
      filter: drop-shadow(0 4px 12px rgba(245, 158, 11, 0.35));
    }
    .brand-text h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-text .domain {
      font-size: 11px;
      font-weight: 600;
      color: #93c5fd;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .brand-badge {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.3));
      border: 1px solid rgba(245, 158, 11, 0.6);
      color: #fef08a;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
    }
    .resource-header {
      position: relative;
      margin-top: 16px;
      margin-bottom: 12px;
    }
    .tag-row {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .tag {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .tag-grade {
      background: rgba(59, 130, 246, 0.25);
      border: 1px solid rgba(96, 165, 250, 0.4);
      color: #bfdbfe;
    }
    .tag-subject {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #a7f3d0;
    }
    .tag-edition {
      background: rgba(168, 85, 247, 0.2);
      border: 1px solid rgba(192, 132, 252, 0.4);
      color: #e9d5ff;
    }
    .tag-size {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #e2e8f0;
      margin-left: auto;
    }
    .resource-title {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.4;
      color: #ffffff;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      min-height: 56px;
    }
    .file-tree-container {
      position: relative;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      padding: 14px 16px;
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 200px;
    }
    .tree-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
      color: #94a3b8;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .tree-header span.highlight {
      color: #60a5fa;
    }
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .file-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      background: rgba(255, 255, 255, 0.04);
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .file-icon {
      font-size: 15px;
      flex-shrink: 0;
    }
    .file-name {
      flex: 1;
      color: #f1f5f9;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 370px;
    }
    .file-size {
      font-size: 11px;
      color: #94a3b8;
      font-family: monospace;
      flex-shrink: 0;
    }
    .more-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #cbd5e1;
      padding-top: 8px;
      border-top: 1px dashed rgba(255, 255, 255, 0.1);
      margin-top: 6px;
    }
    .more-row strong {
      color: #f59e0b;
      font-weight: 700;
    }
    .badge-tag {
      background: rgba(16, 185, 129, 0.25);
      border: 1px solid rgba(52, 211, 153, 0.5);
      color: #6ee7b7;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
    }
    .bottom-bar {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .netdisk-source {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #93c5fd;
      font-weight: 600;
    }
    .action-tip {
      font-size: 12px;
      color: #fef08a;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="bg-blur-1"></div>
  <div class="bg-blur-2"></div>

  <div class="top-brand">
    <div class="brand-left">
      ${logoDataUri ? `<img class="brand-logo-img" src="${logoDataUri}" alt="Logo" />` : ''}
      <div class="brand-text">
        <h1>学霸网 <span>备考文库</span></h1>
        <div class="domain">XUEBAW.COM · 免费原画转存</div>
      </div>
    </div>
    <div class="brand-badge">
      👑 100% 真实网盘原件
    </div>
  </div>

  <div class="resource-header">
    <div class="tag-row">
      <span class="tag tag-grade">${grade}</span>
      <span class="tag tag-subject">${subject}</span>
      <span class="tag tag-edition">${edition}</span>
      <span class="tag tag-size">📦 ${size}</span>
    </div>
    <div class="resource-title">${title}</div>
  </div>

  <div class="file-tree-container">
    <div class="tree-header">
      <span>📂 真实网盘内含文件清单目录</span>
      <span class="highlight">已核验无解压码</span>
    </div>
    <div class="file-list">
      ${fileListHtml}
    </div>
    ${moreTextHtml}
  </div>

  <div class="bottom-bar">
    <div class="netdisk-source">
      ⚡ 夸克网盘原画极速转存
    </div>
    <div class="action-tip">
      点击或扫码 <strong>直达免费下载</strong> ➔
    </div>
  </div>
</body>
</html>`;
}

function findChromeExecutable() {
  const candidates = ['google-chrome', 'chromium', 'google-chrome-stable', 'chromium-browser'];
  for (const cmd of candidates) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  let dataJson = '';
  let outPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      dataJson = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outPath = args[i + 1];
      i++;
    }
  }

  if (!dataJson || !outPath) {
    console.error('Usage: node render_cover.mjs --data "<json>" --out "<outputPath>"');
    process.exit(1);
  }

  const chromeCmd = findChromeExecutable();
  if (!chromeCmd) {
    console.error('Error: Headless Chrome/Chromium not found in PATH');
    process.exit(2);
  }

  let resource;
  try {
    resource = JSON.parse(dataJson);
  } catch (e) {
    console.error('Error parsing resource JSON:', e.message);
    process.exit(3);
  }

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tmpHtmlPath = path.join(outDir, `_temp_${Date.now()}_${Math.random().toString(36).substring(7)}.html`);
  const html = renderHtmlTemplate(resource);
  fs.writeFileSync(tmpHtmlPath, html, 'utf8');

  try {
    execSync(
      `${chromeCmd} --headless --no-sandbox --disable-gpu --window-size=600,600 --screenshot="${outPath}" "file://${tmpHtmlPath}"`,
      { stdio: 'pipe' }
    );
    console.log(`Rendered cover successfully: ${outPath}`);
  } catch (err) {
    console.error('Failed to render screenshot with chrome:', err.message);
    process.exit(4);
  } finally {
    if (fs.existsSync(tmpHtmlPath)) {
      try { fs.unlinkSync(tmpHtmlPath); } catch {}
    }
  }
}

main();
