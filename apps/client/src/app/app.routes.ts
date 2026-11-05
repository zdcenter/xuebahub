import { Routes } from '@angular/router';

export const routes: Routes = [
  // 0. 学霸网专属网盘直跳通道 (goto 语义直达，无顶栏干扰)
  {
    path: 'goto/:id',
    loadComponent: () => import('./portal/pages/redirect/smart-redirect.component').then(m => m.SmartRedirectComponent)
  },
  {
    path: 's/:id',
    redirectTo: ({ params }) => `/goto/${params['id']}`
  },

  // 1. 前台门户系统 (Portal)
  {
    path: '',
    loadChildren: () => import('./portal/portal.routes').then(m => m.PORTAL_ROUTES)
  },

  // 2. 后台管理系统 (Admin)
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent)
  },

  // 404 保底重定向
  {
    path: '**',
    redirectTo: ''
  }
];
