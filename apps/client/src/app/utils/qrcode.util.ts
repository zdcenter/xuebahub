import QRCode from 'qrcode';

export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * 标准二维码 SVG 矢量代码生成器（手机相机/微信/夸克/支付宝 100% 毫秒级识别）
 * @param text 需要编码的链接或文本
 * @param size 渲染尺寸（默认 140px）
 * @param margin 安全静区留白（规范严格要求 >= 4 模块，以保证所有扫码探头对定位角的识别）
 */
export function generateQRCodeSvg(text: string, size = 140, margin = 4): string {
  if (!text || !text.trim()) return '';
  try {
    const qr = QRCode.create(text.trim(), {
      errorCorrectionLevel: 'M'
    });
    const count = qr.modules.size;
    const viewBoxSize = count + margin * 2;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          path += `M${c + margin} ${r + margin}h1v1h-1z `;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges" class="w-full h-full block select-none"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path.trim()}" fill="#0f172a"/></svg>`;
  } catch (err) {
    console.error('Failed to generate standard QR Code:', err);
    return '';
  }
}

/**
 * 将二维码高精绘制在 Canvas 上（海报分享生成等场景）
 */
export function drawQRCodeToCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  options?: {
    darkColor?: string;
    lightColor?: string;
    margin?: number;
    borderRadius?: number;
  }
) {
  if (!text || !text.trim()) return;
  const darkColor = options?.darkColor || '#0f172a';
  const lightColor = options?.lightColor || '#ffffff';
  const margin = options?.margin ?? 8;
  const qr = QRCode.create(text.trim(), { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;

  // 1. 背景底色
  ctx.save();
  ctx.fillStyle = lightColor;
  if (options?.borderRadius && options.borderRadius > 0) {
    const r = options.borderRadius;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x, y, size, size);
  }

  // 2. 模块网格绘制
  const innerSize = size - margin * 2;
  const moduleSize = innerSize / count;
  ctx.fillStyle = darkColor;

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.modules.get(r, c)) {
        const mx = x + margin + c * moduleSize;
        const my = y + margin + r * moduleSize;
        ctx.fillRect(Math.floor(mx), Math.floor(my), Math.ceil(moduleSize), Math.ceil(moduleSize));
      }
    }
  }
  ctx.restore();
}
