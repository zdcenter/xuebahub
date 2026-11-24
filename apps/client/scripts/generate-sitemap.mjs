import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const bookSitemapPath = path.join(publicDir, 'sitemap_books.xml');
const sitemapIndexPath = path.join(publicDir, 'sitemap_index.xml');

const siteUrl = 'https://www.xuebaw.com';
const now = new Date().toISOString().split('T')[0];

const staticPages = [
  { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${siteUrl}/book`, changefreq: 'daily', priority: '1.0' },
  { loc: `${siteUrl}/primary`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/junior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/senior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/cert`, changefreq: 'daily', priority: '0.8' },
  { loc: `${siteUrl}/exam`, changefreq: 'daily', priority: '0.8' },
];

async function generateSitemap() {
  const candidateUrls = [
    {
      all: 'http://127.0.0.1:4001/api/v1/public/sitemap.xml',
      books: 'http://127.0.0.1:4001/api/v1/public/sitemap_books.xml'
    },
    {
      all: 'https://api.xuebaw.com:8443/api/v1/public/sitemap.xml',
      books: 'https://api.xuebaw.com:8443/api/v1/public/sitemap_books.xml'
    },
    {
      all: 'http://127.0.0.1:4001/sitemap.xml',
      books: 'http://127.0.0.1:4001/sitemap_books.xml'
    }
  ];

  let fullSitemapXml = '';
  let bookSitemapXml = '';

  for (const pair of candidateUrls) {
    try {
      const [resAll, resBooks] = await Promise.all([
        fetch(pair.all, { signal: AbortSignal.timeout(8000) }),
        fetch(pair.books, { signal: AbortSignal.timeout(8000) })
      ]);

      if (resAll.ok) {
        const text = await resAll.text();
        if (text.includes('<urlset') && text.includes('<url>')) {
          fullSitemapXml = text;
        }
      }
      if (resBooks.ok) {
        const text = await resBooks.text();
        if (text.includes('<urlset') && text.includes('<url>')) {
          bookSitemapXml = text;
        }
      }

      if (fullSitemapXml && bookSitemapXml) {
        console.log(`[Sitemap] Successfully fetched dynamic sitemaps from: ${pair.all}`);
        break;
      }
    } catch (err) {
      // ignore and try next candidate
    }
  }

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. 保存全站 sitemap.xml
  if (fullSitemapXml && fullSitemapXml.includes('<urlset')) {
    fs.writeFileSync(sitemapPath, fullSitemapXml, 'utf8');
    const count = (fullSitemapXml.match(/<url>/g) || []).length;
    console.log(`[Sitemap] Generated sitemap.xml from API with ${count} URLs.`);
  } else {
    // 静态兜底
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    fs.writeFileSync(sitemapPath, fallbackXml, 'utf8');
    console.log(`[Sitemap] Generated base sitemap.xml with ${staticPages.length} URLs.`);
  }

  // 2. 保存纯电子课本专属 sitemap_books.xml (2032本课本)
  if (bookSitemapXml && bookSitemapXml.includes('<urlset')) {
    fs.writeFileSync(bookSitemapPath, bookSitemapXml, 'utf8');
    const bookCount = (bookSitemapXml.match(/<url>/g) || []).length;
    console.log(`[Sitemap] Generated sitemap_books.xml with ${bookCount} textbook URLs.`);
  }

  // 3. 生成符合 Google/Baidu 标准的 sitemap_index.xml
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/sitemap.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/sitemap_books.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
  fs.writeFileSync(sitemapIndexPath, indexXml, 'utf8');
  console.log(`[Sitemap] Generated sitemap_index.xml linking general and textbook sitemaps.`);
}

generateSitemap();
