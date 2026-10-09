/**
 * 获取 API 服务端/客户端统一的基础 URL
 * 
 * 优先级：
 * 1. 运行时环境变量 / 客户端环境变量 PUBLIC_API_URL
 * 2. 默认本地开发地址 http://127.0.0.1:4001
 */
export function getApiBaseUrl(): string {
  // Vite / Astro 编译期与运行时公开环境变量
  if (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_URL) {
    return (import.meta.env.PUBLIC_API_URL as string).replace(/\/$/, '');
  }

  // Node.js / process.env 环境兜底
  if (typeof process !== 'undefined' && process.env?.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:4001';
}
