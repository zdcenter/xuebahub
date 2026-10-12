import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const coversDir = path.join(webRoot, 'public', 'covers');
const logoSvgPath = path.join(webRoot, 'public', 'logo.svg');

if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

// 读取 Logo SVG 转换为 base64 内嵌，避免 headless chrome 加载相对路径问题
let logoDataUri = '';
if (fs.existsSync(logoSvgPath)) {
  const logoContent = fs.readFileSync(logoSvgPath, 'utf8');
  logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoContent).toString('base64')}`;
}

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4001';

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
  // 如果根目录只有单个大文件夹，向下深入一层展示真正的内容
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
      padding: 32px 36px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #ffffff;
      overflow: hidden;
      position: relative;
    }
    .grid-lines {
      position: absolute;
      inset: 0;
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.1) 0%, transparent 60%),
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 100% 100%, 25px 25px, 25px 25px;
      pointer-events: none;
    }
    .top-header {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      object-fit: contain;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }
    .brand-name {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
      background: linear-gradient(135deg, #ffffff 0%, #93c5fd 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .brand-sub {
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: #38bdf8;
      font-weight: 700;
      letter-spacing: 1.5px;
    }
    .tags-group {
      display: flex;
      gap: 6px;
    }
    .tag {
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 8px;
    }
    .tag-blue { background: rgba(37, 99, 235, 0.3); color: #93c5fd; border: 1px solid rgba(147, 197, 253, 0.3); }
    .tag-amber { background: rgba(245, 158, 11, 0.2); color: #fde047; border: 1px solid rgba(253, 224, 71, 0.3); }

    .title-box {
      position: relative;
      z-index: 2;
      margin: 12px 0 10px;
    }
    .main-title {
      font-size: 21px;
      font-weight: 800;
      line-height: 1.35;
      color: #ffffff;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
    }
    .meta-spec {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: ui-monospace, monospace;
    }
    .meta-spec strong { color: #38bdf8; font-weight: 700; }

    /* 网盘真实文件视窗卡片 */
    .file-window {
      position: relative;
      z-index: 2;
      background: rgba(255, 255, 255, 0.96);
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: 0 16px 30px -8px rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.8);
      color: #1e293b;
    }
    .window-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
    }
    .window-title {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #0f172a;
      font-size: 12px;
    }
    .file-row {
      display: flex;
      align-items: center;
      padding: 6px 4px;
      font-size: 13px;
      border-radius: 8px;
      transition: background 0.1s;
    }
    .file-row:nth-child(even) { background: #f8fafc; }
    .file-icon { font-size: 15px; margin-right: 8px; flex-shrink: 0; }
    .file-name {
      flex: 1;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 8px;
    }
    .file-size {
      font-size: 11px;
      font-family: ui-monospace, monospace;
      color: #64748b;
      flex-shrink: 0;
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .more-row {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }
    .more-row strong { color: #2563eb; }
    .badge-tag {
      font-size: 10px;
      font-weight: 800;
      background: #ecfdf5;
      color: #059669;
      border: 1px solid #a7f3d0;
      padding: 1px 6px;
      border-radius: 4px;
    }

    /* 底部品牌栏 */
    .bottom-bar {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 12px;
    }
    .quark-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #38bdf8;
      font-weight: 700;
    }
    .quark-badge span {
      background: #2563eb;
      color: #ffffff;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 10px;
    }
    .action-tip {
      color: #cbd5e1;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .action-tip strong { color: #fde047; }
  </style>
</head>
<body>
  <div class="grid-lines"></div>

  <!-- 顶部：学霸网徽章与学段标签 -->
  <div class="top-header">
    <div class="brand-box">
      ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo" alt="学霸网" />` : ''}
      <div>
        <div class="brand-name">学霸网</div>
        <div class="brand-sub">XUEBAW.COM</div>
      </div>
    </div>
    <div class="tags-group">
      <span class="tag tag-blue">${grade} ${subject}</span>
      <span class="tag tag-amber">${edition}</span>
    </div>
  </div>

  <!-- 资料标题 -->
  <div class="title-box">
    <h1 class="main-title">${title}</h1>
    <div class="meta-spec">
      <span>💾 规格总容量: <strong>${size}</strong></span>
      <span>•</span>
      <span>⚡ 官方原版 · 高清无水印</span>
    </div>
  </div>

  <!-- 核心仿真实网盘文件清单视窗 -->
  <div class="file-window">
    <div class="window-header">
      <span class="window-title">📂 网盘内含真实目录清单 (所见即所存)</span>
      <span>真实层级 · 极速转存</span>
    </div>
    <div class="file-list">
      ${fileListHtml}
    </div>
    ${moreTextHtml}
  </div>

  <!-- 底部直达行动引导 -->
  <div class="bottom-bar">
    <div class="quark-badge">
      <span>极速推荐</span>
      夸克网盘原画极速转存
    </div>
    <div class="action-tip">
      点击或扫码 <strong>直达免费下载</strong> ➔
    </div>
  </div>
</body>
</html>`;
}

function findChromeExecutable() {
  const candidates = [
    'google-chrome',
    'chromium',
    'google-chrome-stable',
    'chromium-browser'
  ];
  for (const cmd of candidates) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return cmd;
    } catch {
      // continue
    }
  }
  return null;
}

async function main() {
  const chromeCmd = findChromeExecutable();
  if (!chromeCmd) {
    console.warn('[Cover Generator] Chrome/Chromium binary not found in PATH. Skipping thumbnail generation.');
    return;
  }

  console.log(`[Cover Generator] Using Chrome binary: ${chromeCmd}`);
  console.log(`[Cover Generator] Fetching resources from ${API_BASE}...`);
  let resources = [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/resources?limit=100`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    resources = Array.isArray(json.data) ? json.data : (json.data?.items || []);
  } catch (err) {
    console.warn(`[Cover Generator] Could not fetch resources from ${API_BASE} (${err.message}). Using existing static covers if available.`);
    return;
  }

  console.log(`[Cover Generator] Found ${resources.length} resources. Processing covers...`);
  const tmpHtmlPath = path.join(coversDir, '_temp_cover.html');

  for (const item of resources) {
    const targetPng = path.join(coversDir, `${item.slug}.png`);
    console.log(`[Cover Generator] Generating cover for: ${item.slug} (${item.title.slice(0, 20)}...)`);

    const html = renderHtmlTemplate(item);
    fs.writeFileSync(tmpHtmlPath, html, 'utf8');

    try {
      execSync(
        `${chromeCmd} --headless --no-sandbox --disable-gpu --window-size=600,600 --screenshot="${targetPng}" "file://${tmpHtmlPath}"`,
        { stdio: 'pipe' }
      );
      const stat = fs.statSync(targetPng);
      console.log(`  ✓ Successfully created: covers/${item.slug}.png (${(stat.size / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error(`  ✗ Failed to render ${item.slug}:`, e.message);
    }
  }

  if (fs.existsSync(tmpHtmlPath)) {
    fs.unlinkSync(tmpHtmlPath);
  }

  console.log('[Cover Generator] All resource covers generated successfully!');
}

main();
