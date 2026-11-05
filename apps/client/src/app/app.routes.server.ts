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

  // 2. 动态详情与直跳路由按需客户端渲染或后续动态服务端渲染
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
  {
    path: 'resource/:id',
    renderMode: RenderMode.Client
  },

  // 3. 前台门户、专区与电子书架均启用全量静态预渲染 (SSG)
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
