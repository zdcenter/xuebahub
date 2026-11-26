import { Routes } from '@angular/router';
import { PortalLayoutComponent } from './layout/portal-layout.component';

export const PORTAL_ROUTES: Routes = [
  {
    path: '',
    component: PortalLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'all' }
      },
      {
        path: 'book',
        loadComponent: () => import('./pages/book/book-shelf.component').then(m => m.BookShelfComponent)
      },
      {
        path: 'primary',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'primary' }
      },
      {
        path: 'junior',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'junior' }
      },
      {
        path: 'senior',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'senior' }
      },
      {
        path: 'cert',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'cert' }
      },
      {
        path: 'exam',
        loadComponent: () => import('./pages/channel/channel.component').then(m => m.ChannelComponent),
        data: { channel: 'exam' }
      },
      {
        path: 'detail/:id',
        redirectTo: ({ params }) => `/resource/${params['id']}`
      },
      {
        path: 'goto/:id',
        redirectTo: ({ params }) => `/goto/${params['id']}`
      },
      {
        path: 's/:id',
        redirectTo: ({ params }) => `/goto/${params['id']}`
      },
      {
        path: 'resource/:id',
        loadComponent: () => import('./pages/detail/resource-detail.component').then(m => m.ResourceDetailComponent)
      },
      {
        path: 'collections',
        loadComponent: () => import('./pages/collection/collection-list.component').then(m => m.CollectionListComponent)
      },
      {
        path: 'collection/:slug',
        loadComponent: () => import('./pages/collection/collection-detail.component').then(m => m.CollectionDetailComponent)
      }
    ]
  }
];
