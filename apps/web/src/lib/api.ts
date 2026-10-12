/**
 * 获取 API 服务端/客户端统一的基础 URL
 * 
 * 核心调度准则：
 * 1. 本地开发模式 (astro dev / vite dev)：100% 强制连接本地 Go API (http://127.0.0.1:4001)
 * 2. 客户端浏览器运行时：若访问域名为 localhost / 127.0.0.1，强制连接本地 API (http://127.0.0.1:4001)
 * 3. 服务端 SSR 运行时：若当前请求来源为 localhost / 127.0.0.1，强制连接本地 API (http://127.0.0.1:4001)
 * 4. 仅在部署到 Cloudflare Pages 线上生产环境 (xuebaw.com / *.pages.dev) 时，才连接生产 API https://api.xuebaw.com:8443
 */
export function getApiBaseUrl(reqUrl?: string | URL): string {
  // 1. 本地开发模式 (astro dev)：本地开发绝对优先连接本地后端与本地数据库
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return 'http://127.0.0.1:4001';
  }

  // 2. 客户端浏览器运行时检测 (用户在浏览器中打开 http://localhost:4321 等本地端口)
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:4001`;
    }
    // 允许通过 localStorage 手动指定 API 进行在线调试
    try {
      const customApi = localStorage.getItem('API_BASE_URL');
      if (customApi) return customApi.replace(/\/$/, '');
    } catch (e) {}
  }

  // 3. 服务端 SSR 运行时检测 (如果传入了当前页面的 Astro.url 或 Request)
  if (reqUrl) {
    try {
      const u = typeof reqUrl === 'string' ? new URL(reqUrl) : reqUrl;
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:4001';
      }
    } catch (e) {}
  }

  // 4. 显式指定的自定义环境变量 (如生产 CI/CD 构建配置)
  if (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_URL) {
    return (import.meta.env.PUBLIC_API_URL as string).trim().replace(/\/$/, '');
  }

  if (typeof process !== 'undefined' && process.env?.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.trim().replace(/\/$/, '');
  }

  // 5. 生产环境默认远程服务端地址
  return 'https://api.xuebaw.com:8443';
}
