import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distBrowserDir = path.resolve(__dirname, '../dist/client/browser');
const cacheFilePath = path.resolve(__dirname, 'resources-seo-cache.json');
const siteUrl = 'https://www.xuebaw.com';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildResourceSeoMeta(item) {
  const isBook = item.channel_slug === 'book' || item.stage === 'book';
  const slugOrId = item.slug || item.id;
  const canonicalUrl = `${siteUrl}/resource/${slugOrId}`;
  const ogImage = item.cover_url
    ? (item.cover_url.startsWith('http') ? item.cover_url : `${siteUrl}${item.cover_url.startsWith('/') ? '' : '/'}${item.cover_url}`)
    : `${siteUrl}/og-cover.png`;

  const editionText = item.edition ? `【${item.edition}】` : '';
  const gradeSubject = [item.grade, item.subject].filter(Boolean).join('');

  let title;
  let description;
  let keywords;

  if (isBook) {
    title = `《${item.title}》电子课本PDF下载_最新审定版高清课文目录 - 学霸网`;
    description = `学霸网提供正版《${item.title}》高清矢量电子课本PDF免费在线阅读与夸克网盘免密下载，涵盖全书完整章节目录与课文导航，支持手机免下载全屏翻页阅读与A4纸张高清双面打印，全国中小学正版教科书数字书架。`;
    keywords = [
      item.title,
      `${item.title}电子课本`,
      `${item.title}PDF下载`,
      `${item.grade || ''}${item.subject || ''}电子课本`,
      `${item.edition || '统编版'}${item.grade || ''}${item.term || ''}教材`,
      '正版中小学电子教材',
      '夸克网盘免密直存'
    ].filter(Boolean).join(', ');
  } else {
    title = `${item.title}${editionText} - ${gradeSubject ? gradeSubject + ' ' : ''}高清PDF下载与网盘转存 - 学霸网`;
    const fallbackDesc = `${item.title}${editionText}，正版高清PDF/视频课件，支持A4无损打印与极速转存。全套高清资料整理，含详细解析与答案，免费一键转存至个人网盘。`;
    const rawDesc = (item.description || '').trim();
    description = rawDesc.length >= 70
      ? rawDesc
      : (rawDesc ? `${rawDesc}。${fallbackDesc}` : fallbackDesc);
    keywords = [
      item.title,
      item.subject,
      item.grade,
      item.edition,
      gradeSubject,
      '试卷真题',
      '高清PDF下载',
      '夸克网盘免密直存'
    ].filter(Boolean).join(', ');
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': isBook ? 'Book' : 'LearningResource',
    name: item.title,
    description,
    url: canonicalUrl,
    inLanguage: 'zh-CN',
    publisher: {
      '@type': 'Organization',
      name: '学霸网',
      url: siteUrl
    }
  };

  return { slugOrId, title, description, keywords, canonicalUrl, ogImage, schema };
}

function injectSeoIntoShell(shellHtml, meta) {
  let html = shellHtml;
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeKeywords = escapeHtml(meta.keywords);
  const safeCanonical = escapeHtml(meta.canonicalUrl);
  const safeOgImage = escapeHtml(meta.ogImage);

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${safeCanonical}">`);
  html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${safeDesc}">`);
  html = html.replace(/<meta name="keywords" content="[^"]*">/i, `<meta name="keywords" content="${safeKeywords}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${safeTitle}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${safeDesc}">`);

  const extraHead = `  <meta property="og:image" content="${safeOgImage}">\n  <script id="app-structured-data" type="application/ld+json">${JSON.stringify(meta.schema)}</script>\n</head>`;
  html = html.replace(/<\/head>/i, extraHead);

  const semanticBody = `<app-root><main><h1>${safeTitle}</h1><p>${safeDesc}</p></main></app-root>`;
  html = html.replace(/<app-root><\/app-root>/i, semanticBody);

  return html;
}

async function fetchAllResourcesFromBase(baseUrl) {
  const items = [];
  const seen = new Set();

  for (const queryExtra of ['', '&channel=book']) {
    let page = 1;
    let fetchedInQuery = 0;
    const pageSize = 100;

    while (true) {
      const res = await fetch(`${baseUrl}/api/v1/public/resources?page=${page}&page_size=${pageSize}${queryExtra}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const batch = json?.data?.items || [];
      if (!Array.isArray(batch) || batch.length === 0) break;

      fetchedInQuery += batch.length;
      for (const r of batch) {
        const key = r.slug || r.id;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: r.id,
          slug: r.slug,
          channel_slug: r.channel_slug,
          stage: r.stage,
          grade: r.grade,
          subject: r.subject,
          edition: r.edition,
          term: r.term,
          title: r.title,
          description: r.description,
          cover_url: r.cover_url
        });
      }

      const total = json?.data?.total || 0;
      if (fetchedInQuery >= total) break;
      page++;
    }
  }
  return items;
}

async function generateStaticResourceSeoPages() {
  const csrHtmlPath = path.join(distBrowserDir, 'index.csr.html');
  if (!fs.existsSync(csrHtmlPath)) return;
  const shellHtml = fs.readFileSync(csrHtmlPath, 'utf8');

  let resources = [];
  for (const base of ['http://127.0.0.1:4001', 'https://api.xuebaw.com:8443']) {
    try {
      const fetched = await fetchAllResourcesFromBase(base);
      if (fetched.length > 0) {
        resources = fetched;
        if (base.includes('127.0.0.1')) {
          fs.writeFileSync(cacheFilePath, JSON.stringify(resources), 'utf8');
        }
        console.log(`[Postbuild] Fetched ${resources.length} resources for static SEO HTML from ${base}`);
        break;
      }
    } catch {
      // try next source
    }
  }

  if (resources.length === 0 && fs.existsSync(cacheFilePath)) {
    try {
      resources = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      console.log(`[Postbuild] Loaded ${resources.length} resources from SEO cache.`);
    } catch {
      resources = [];
    }
  }

  if (resources.length === 0) return;

  const resourceBaseDir = path.join(distBrowserDir, 'resource');
  fs.mkdirSync(resourceBaseDir, { recursive: true });

  let created = 0;
  for (const item of resources) {
    const meta = buildResourceSeoMeta(item);
    const targetDir = path.join(resourceBaseDir, meta.slugOrId);
    const targetIndex = path.join(targetDir, 'index.html');
    const targetFlatHtml = path.join(resourceBaseDir, `${meta.slugOrId}.html`);

    // 保留 Angular 完整预渲染页面，仅为其余资源生成静态 SEO HTML
    if (!fs.existsSync(targetIndex)) {
      fs.mkdirSync(targetDir, { recursive: true });
      const html = injectSeoIntoShell(shellHtml, meta);
      fs.writeFileSync(targetIndex, html, 'utf8');
      if (!fs.existsSync(targetFlatHtml)) {
        fs.writeFileSync(targetFlatHtml, html, 'utf8');
      }
      created++;
    }
  }
  console.log(`[Postbuild] ✅ Generated static SEO HTML for ${created} additional resource pages.`);
}

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

// 关键修复：用 CSR 空壳替换 SPA fallback 的 index.html
function replaceFallbackWithCsrShell() {
  const indexHtml = path.join(distBrowserDir, 'index.html');
  const csrHtml = path.join(distBrowserDir, 'index.csr.html');

  if (!fs.existsSync(csrHtml)) {
    console.warn('[Postbuild] ⚠️  index.csr.html not found, skipping fallback replacement.');
    return;
  }

  const backupPath = path.join(distBrowserDir, '_home_ssr.html');
  fs.copyFileSync(indexHtml, backupPath);
  console.log('[Postbuild] Backed up original index.html → _home_ssr.html');

  fs.copyFileSync(csrHtml, indexHtml);
  console.log('[Postbuild] ✅ Replaced index.html with index.csr.html (4KB CSR shell)');
}

async function main() {
  copyStaticPages();
  await generateStaticResourceSeoPages();
  replaceFallbackWithCsrShell();
}

main();
