/**
 * 学霸网 PWA Service Worker (v1.0.0)
 * 策略规范：
 * 1. API 接口与网盘直链：网络优先 (Network-First)，确保转存链接与统计绝对实时
 * 2. 静态核心资源与字体图标：陈旧复用并在后台刷新 (Stale-While-Revalidate)
 * 3. 页面文档导航：网络优先，断网时安全兜底
 */

const CACHE_NAME = 'xueba-cache-v1';

// 预缓存核心静态应用外壳资产
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/logo.svg',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// 安装阶段：预缓存核心静态外壳并立即激活
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧版本缓存，立即接管客户端
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[PWA SW] 清除过旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截策略
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. 忽略非 GET 请求或浏览器扩展请求
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. API 动态接口、网盘重定向直链：必须网络优先 (永不缓存旧网盘链接)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({ code: 503, message: '离线模式：无法连接网络' }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      })
    );
    return;
  }

  // 3. HTML 页面导航：网络优先，失败时回退缓存 (保持 SEO 与最新内容)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const homeCached = await caches.match('/');
          return homeCached || Response.error();
        })
    );
    return;
  }

  // 4. 静态资源 (JS/CSS/图片/字体/图标)：Stale-While-Revalidate 极速秒开并在后台更新
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => cachedRes || new Response('', { status: 504, statusText: 'Gateway Timeout' }));

      return cachedRes || fetchPromise;
    })
  );
});
