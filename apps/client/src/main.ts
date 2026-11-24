import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    // 客户端环境优雅注册 PWA Service Worker (生产 HTTPS 环境启用，本地 localhost/127.0.0.1 自动注销避免调试冲突)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (location.protocol === 'https:' && !isLocalhost) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('[PWA] Service Worker 注册就绪:', reg.scope);
          }).catch((err) => {
            console.warn('[PWA] Service Worker 注册失败:', err);
          });
        });
      } else if (isLocalhost) {
        // 本地开发环境自动卸载历史旧 SW，防止热更新冲突与未捕获的 Response 异常
        navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) {
            reg.unregister();
          }
        }).catch(() => {});
      }
    }
  })
  .catch((err) => console.error(err));
