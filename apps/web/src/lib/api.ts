/**
 * 获取 API 服务端/客户端统一的基础 URL
 * 
 * 优先级：
 * 1. 运行时环境变量 / 客户端环境变量 PUBLIC_API_URL
 * 2. 客户端浏览器运行时：公网域名自动指向生产环境 https://api.xuebaw.com:8443
 * 3. Astro 生产构建期 (PROD)：默认指向生产环境 https://api.xuebaw.com:8443
 * 4. 本地开发默认地址 http://127.0.0.1:4001
 */
export function getApiBaseUrl(): string {
  // 1. Vite / Astro 编译期与运行时公开环境变量
  if (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_URL) {
    return (import.meta.env.PUBLIC_API_URL as string).replace(/\/$/, '');
  }

  // 2. Node.js / process.env 环境兜底
  if (typeof process !== 'undefined' && process.env?.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 3. 客户端浏览器运行时检测
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'https://api.xuebaw.com:8443';
    }
  }

  // 4. Astro 生产环境构建模式兜底
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return 'https://api.xuebaw.com:8443';
  }

  return 'http://127.0.0.1:4001';
}
