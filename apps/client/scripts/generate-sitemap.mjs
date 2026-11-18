import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');

const siteUrl = 'https://www.xuebaw.com';
const now = new Date().toISOString().split('T')[0];

const staticPages = [
  { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${siteUrl}/book`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/primary`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/junior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/senior`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/cert`, changefreq: 'daily', priority: '0.8' },
  { loc: `${siteUrl}/exam`, changefreq: 'daily', priority: '0.8' },
];

async function generateSitemap() {
  let resources = [];
  const endpoints = [
    process.env['API_BASE'] || 'http://127.0.0.1:4001',
    'https://api.xuebaw.com:8443'
  ];

  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/api/v1/public/resources?limit=1000`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data?.items) && json.data.items.length > 0) {
          resources = json.data.items;
          break;
        }
      }
    } catch (err) {}
  }

  if (resources.length === 0) {
    console.log('[Sitemap] API not reachable at build time, generating base sitemap.');
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
${resources
  .map(
    (item) => `  <url>
    <loc>${siteUrl}/resource/${item.slug || item.id}</loc>
    <lastmod>${item.updated_at ? item.updated_at.substring(0, 10) : now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
  console.log(`[Sitemap] Generated sitemap.xml with ${staticPages.length + resources.length} URLs.`);
}

generateSitemap();
