import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // 1. 后台管理系统为高交互 SPA 仪表盘，运行于纯客户端模式
  {
    path: 'admin',
    renderMode: RenderMode.Client
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client
  },

  // 2. 动态直跳路由按需客户端渲染
  {
    path: 'goto/:id',
    renderMode: RenderMode.Client
  },
  {
    path: 's/:id',
    renderMode: RenderMode.Client
  },
  {
    path: 'detail/:id',
    renderMode: RenderMode.Client
  },

  // 3. 核心资源详情页：全量静态预渲染 (SSG)！让每个资源都拥有独立的静态 HTML，彻底杜绝首屏闪现首页和客户端跳转，100% 利于搜索引擎收录
  {
    path: 'resource/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const endpoints = [
        'http://127.0.0.1:4001/api/v1/public/resources?limit=1000',
        'https://api.xuebaw.com:8443/api/v1/public/resources?limit=1000'
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const json = await res.json();
            const items = json?.data?.items || [];
            const params: Record<string, string>[] = [];
            const seen = new Set<string>();
            for (const item of items) {
              if (item.slug && !seen.has(item.slug)) {
                seen.add(item.slug);
                params.push({ id: item.slug });
              }
              if (item.id && !seen.has(item.id)) {
                seen.add(item.id);
                params.push({ id: item.id });
              }
            }
            if (params.length > 0) {
              return params;
            }
          }
        } catch {}
      }
      return [];
    }
  },
  {
    path: 'collection/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const endpoints = [
        'http://127.0.0.1:4001/api/v1/public/collections?limit=500',
        'https://api.xuebaw.com:8443/api/v1/public/collections?limit=500'
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const json = await res.json();
            const items = json?.data?.items || json?.data || [];
            const params: Record<string, string>[] = [];
            const seen = new Set<string>();
            for (const item of items) {
              if (item.slug && !seen.has(item.slug)) {
                seen.add(item.slug);
                params.push({ slug: item.slug });
              }
              if (item.id && !seen.has(item.id)) {
                seen.add(item.id);
                params.push({ slug: item.id });
              }
            }
            if (params.length > 0) {
              return params;
            }
          }
        } catch {}
      }
      return [];
    }
  },

  // 4. 前台门户、专区与电子书架均启用全量静态预渲染 (SSG)
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
