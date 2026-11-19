import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    // 客户端环境优雅注册 PWA Service Worker (HTTPS 或本地测试环境)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          console.log('[PWA] Service Worker 注册就绪:', reg.scope);
        }).catch((err) => {
          console.warn('[PWA] Service Worker 注册失败:', err);
        });
      });
    }
  })
  .catch((err) => console.error(err));
