import type { APIRoute } from 'astro';
import { getApiBaseUrl } from '../lib/api';

export const GET: APIRoute = async ({ url }) => {
  const apiBase = getApiBaseUrl(url);
  const siteUrl = 'https://xuebaw.com';

  let resources: any[] = [];
  try {
    const res = await fetch(`${apiBase}/api/v1/public/resources?limit=500`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data?.items)) {
        resources = json.data.items;
      }
    }
  } catch (e) {
    // 降级兜底
  }

  const staticPages = [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${siteUrl}/primary`, changefreq: 'daily', priority: '0.9' },
    { loc: `${siteUrl}/junior`, changefreq: 'daily', priority: '0.9' },
    { loc: `${siteUrl}/senior`, changefreq: 'daily', priority: '0.9' },
    { loc: `${siteUrl}/cert`, changefreq: 'daily', priority: '0.8' },
    { loc: `${siteUrl}/exam`, changefreq: 'daily', priority: '0.8' },
  ];

  const now = new Date().toISOString().split('T')[0];

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
    <loc>${siteUrl}/resource/${item.slug}</loc>
    <lastmod>${item.created_at ? item.created_at.substring(0, 10) : now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemapXml.trim(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=14400',
    },
  });
};
