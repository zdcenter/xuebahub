import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const eduSitemapPath = path.join(publicDir, 'sitemap_edu.xml');
const bookSitemapPath = path.join(publicDir, 'sitemap_books.xml');
const sitemapIndexPath = path.join(publicDir, 'sitemap_index.xml');

const siteUrl = 'https://www.xuebaw.com';
const now = new Date().toISOString().split('T')[0];

const staticPages = [
  { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${siteUrl}/primary`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/junior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/senior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/cert`, changefreq: 'daily', priority: '0.8' },
  { loc: `${siteUrl}/exam`, changefreq: 'daily', priority: '0.8' },
  { loc: `${siteUrl}/requests`, changefreq: 'daily', priority: '0.8' },
];

async function generateSitemap() {
  const candidateUrls = [
    {
      edu: 'http://127.0.0.1:4001/api/v1/public/sitemap_edu.xml',
      books: 'http://127.0.0.1:4001/api/v1/public/sitemap_books.xml'
    },
    {
      edu: 'https://api.xuebaw.com:8443/api/v1/public/sitemap_edu.xml',
      books: 'https://api.xuebaw.com:8443/api/v1/public/sitemap_books.xml'
    },
    {
      edu: 'http://127.0.0.1:4001/sitemap_edu.xml',
      books: 'http://127.0.0.1:4001/sitemap_books.xml'
    }
  ];

  let eduSitemapXml = '';
  let bookSitemapXml = '';

  for (const pair of candidateUrls) {
    try {
      const [resEdu, resBooks] = await Promise.all([
        fetch(pair.edu, { signal: AbortSignal.timeout(8000) }),
        fetch(pair.books, { signal: AbortSignal.timeout(8000) })
      ]);

      if (resEdu.ok) {
        const text = await resEdu.text();
        if (text.includes('<urlset') && text.includes('<url>')) {
          eduSitemapXml = text;
        }
      }
      if (resBooks.ok) {
        const text = await resBooks.text();
        if (text.includes('<urlset') && text.includes('<url>')) {
          bookSitemapXml = text;
        }
      }

      if (eduSitemapXml && bookSitemapXml) {
        console.log(`[Sitemap] Successfully fetched dynamic sitemaps from: ${pair.edu}`);
        break;
      }
    } catch (err) {
      // ignore and try next
    }
  }

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. 学习资料频道专属地图 (sitemap_edu.xml)
  if (eduSitemapXml) {
    fs.writeFileSync(eduSitemapPath, eduSitemapXml, 'utf8');
    const eduCount = (eduSitemapXml.match(/<url>/g) || []).length;
    console.log(`[Sitemap] Generated sitemap_edu.xml with ${eduCount} URLs.`);
  } else {
    // 静态兜底
    const fallbackEduXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    fs.writeFileSync(eduSitemapPath, fallbackEduXml, 'utf8');
    console.log(`[Sitemap] Generated base sitemap_edu.xml with ${staticPages.length} URLs.`);
  }

  // 2. 电子课本专区专属地图 (sitemap_books.xml，纯2032本课本 + /book)
  if (bookSitemapXml) {
    fs.writeFileSync(bookSitemapPath, bookSitemapXml, 'utf8');
    const bookCount = (bookSitemapXml.match(/<url>/g) || []).length;
    console.log(`[Sitemap] Generated sitemap_books.xml with ${bookCount} textbook URLs.`);
  }

  // 3. 符合 Google/Bing/Baidu 官方标准的总索引地图 (sitemap_index.xml 与 sitemap.xml 统一为干净索引)
  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/sitemap_edu.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/sitemap_books.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;

  fs.writeFileSync(sitemapIndexPath, indexXml, 'utf8');
  fs.writeFileSync(sitemapPath, indexXml, 'utf8');
  console.log(`[Sitemap] Generated sitemap_index.xml and sitemap.xml as clean channel index (0 duplicate URLs).`);
}

generateSitemap();
