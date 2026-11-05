import { Injectable } from '@angular/core';
import { drawQRCodeToCanvas } from '../utils/qrcode.util';

export type PosterRatio = 'story' | 'square' | 'banner' | 'exam';
export type PosterTheme = 'academic' | 'xiaohongshu' | 'emerald' | 'dark';

export interface PosterResourceData {
  id?: string;
  slug?: string;
  title: string;
  grade?: string;
  subject?: string;
  edition?: string;
  file_size?: string;
  file_tree?: any[];
  customSubtitle?: string;
  targetUrl?: string;
}

export interface PosterOptions {
  ratio: PosterRatio;
  theme: PosterTheme;
  title: string;
  subtitle?: string;
  grade?: string;
  subject?: string;
  edition?: string;
  file_size?: string;
  highlights?: string[];
  targetUrl: string;
  brandName?: string;
  brandSlogan?: string;
  fileItems?: { name: string; icon: string; size?: string }[];
}

export interface ThemeColors {
  bgStart: string;
  bgEnd: string;
  accentGlow1: string;
  accentGlow2: string;
  brandBg: string;
  brandText: string;
  brandAccent: string;
  titleColor: string;
  subtitleColor: string;
  cardBg: string;
  cardBorder: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  highlightBg: string;
  highlightText: string;
  highlightIcon: string;
  qrBorder: string;
  qrTipTitle: string;
  qrTipDesc: string;
}

const THEME_PALETTES: Record<PosterTheme, ThemeColors> = {
  academic: {
    bgStart: '#1e3a8a', // 学院深蓝
    bgEnd: '#0f172a',
    accentGlow1: 'rgba(37, 99, 235, 0.45)',
    accentGlow2: 'rgba(245, 158, 11, 0.25)',
    brandBg: '#1d4ed8',
    brandText: '#ffffff',
    brandAccent: '#f59e0b',
    titleColor: '#ffffff',
    subtitleColor: '#bfdbfe',
    cardBg: 'rgba(15, 23, 42, 0.85)',
    cardBorder: 'rgba(96, 165, 250, 0.35)',
    badgeBg: 'rgba(59, 130, 246, 0.28)',
    badgeText: '#93c5fd',
    badgeBorder: 'rgba(96, 165, 250, 0.45)',
    highlightBg: 'rgba(30, 58, 138, 0.65)',
    highlightText: '#f8fafc',
    highlightIcon: '#f59e0b',
    qrBorder: '#60a5fa',
    qrTipTitle: '#ffffff',
    qrTipDesc: '#93c5fd'
  },
  xiaohongshu: {
    bgStart: '#be123c', // 珊瑚红热推
    bgEnd: '#4c0519',
    accentGlow1: 'rgba(244, 63, 94, 0.45)',
    accentGlow2: 'rgba(251, 146, 60, 0.3)',
    brandBg: '#e11d48',
    brandText: '#ffffff',
    brandAccent: '#fde047',
    titleColor: '#ffffff',
    subtitleColor: '#fecdd3',
    cardBg: 'rgba(76, 5, 25, 0.85)',
    cardBorder: 'rgba(251, 113, 133, 0.4)',
    badgeBg: 'rgba(225, 29, 72, 0.32)',
    badgeText: '#fda4af',
    badgeBorder: 'rgba(251, 113, 133, 0.55)',
    highlightBg: 'rgba(136, 19, 55, 0.65)',
    highlightText: '#fff1f2',
    highlightIcon: '#fbbf24',
    qrBorder: '#fb7185',
    qrTipTitle: '#ffffff',
    qrTipDesc: '#fecdd3'
  },
  emerald: {
    bgStart: '#064e3b', // 翡翠墨绿
    bgEnd: '#022c22',
    accentGlow1: 'rgba(16, 185, 129, 0.45)',
    accentGlow2: 'rgba(52, 211, 153, 0.25)',
    brandBg: '#059669',
    brandText: '#ffffff',
    brandAccent: '#a7f3d0',
    titleColor: '#ffffff',
    subtitleColor: '#a7f3d0',
    cardBg: 'rgba(2, 44, 34, 0.85)',
    cardBorder: 'rgba(52, 211, 153, 0.4)',
    badgeBg: 'rgba(16, 185, 129, 0.28)',
    badgeText: '#6ee7b7',
    badgeBorder: 'rgba(52, 211, 153, 0.45)',
    highlightBg: 'rgba(6, 78, 59, 0.65)',
    highlightText: '#f0fdf4',
    highlightIcon: '#34d399',
    qrBorder: '#34d399',
    qrTipTitle: '#ffffff',
    qrTipDesc: '#a7f3d0'
  },
  dark: {
    bgStart: '#18181b', // 极客暗夜黑金
    bgEnd: '#09090b',
    accentGlow1: 'rgba(234, 179, 8, 0.35)',
    accentGlow2: 'rgba(168, 85, 247, 0.25)',
    brandBg: '#27272a',
    brandText: '#fef08a',
    brandAccent: '#eab308',
    titleColor: '#ffffff',
    subtitleColor: '#e4e4e7',
    cardBg: 'rgba(24, 24, 27, 0.88)',
    cardBorder: 'rgba(234, 179, 8, 0.4)',
    badgeBg: 'rgba(63, 63, 70, 0.55)',
    badgeText: '#fef08a',
    badgeBorder: 'rgba(234, 179, 8, 0.45)',
    highlightBg: 'rgba(39, 39, 42, 0.7)',
    highlightText: '#fafafa',
    highlightIcon: '#eab308',
    qrBorder: '#eab308',
    qrTipTitle: '#ffffff',
    qrTipDesc: '#d4d4d8'
  }
};

@Injectable({
  providedIn: 'root'
})
export class PosterGeneratorService {

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines = 2
  ): number {
    ctx.textBaseline = 'top';
    const chars = Array.from(text);
    let currentLine = '';
    let currentY = y;
    let linesDrawn = 0;

    for (let i = 0; i < chars.length; i++) {
      const testLine = currentLine + chars[i];
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && i > 0) {
        linesDrawn++;
        if (linesDrawn >= maxLines) {
          ctx.fillText(currentLine.slice(0, -1) + '...', x, currentY);
          return currentY + lineHeight;
        } else {
          ctx.fillText(currentLine, x, currentY);
          currentLine = chars[i];
          currentY += lineHeight;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      ctx.fillText(currentLine, x, currentY);
      currentY += lineHeight;
    }

    return currentY;
  }

  private formatUrlForDisplay(url: string): string {
    return url.replace(/^https?:\/\//i, '').toLowerCase();
  }

  /**
   * 核心 Canvas 渲染主流程，输出 HTMLCanvasElement
   */
  generatePosterCanvas(opts: PosterOptions): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    // 画布像素设定 (高解析度 2x 保证打印和手机清晰)
    let width = 720;
    let height = 1280;
    if (opts.ratio === 'square') {
      width = 800;
      height = 800;
    } else if (opts.ratio === 'banner') {
      width = 1280;
      height = 720;
    } else if (opts.ratio === 'exam') {
      width = 750;
      height = 1000;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    const theme = THEME_PALETTES[opts.theme] || THEME_PALETTES.academic;

    // 1. 渐变背景与虚化光晕
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, theme.bgStart);
    bgGrad.addColorStop(1, theme.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 光晕虚化球 1
    ctx.save();
    const g1 = ctx.createRadialGradient(width * 0.85, height * 0.1, 0, width * 0.85, height * 0.1, width * 0.45);
    g1.addColorStop(0, theme.accentGlow1);
    g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(width * 0.85, height * 0.1, width * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 光晕虚化球 2
    ctx.save();
    const g2 = ctx.createRadialGradient(width * 0.15, height * 0.85, 0, width * 0.15, height * 0.85, width * 0.4);
    g2.addColorStop(0, theme.accentGlow2);
    g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(width * 0.15, height * 0.85, width * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 分流根据版型进行排版绘制
    if (opts.ratio === 'story' || opts.ratio === 'exam') {
      this.renderVerticalPoster(ctx, width, height, opts, theme);
    } else if (opts.ratio === 'square') {
      this.renderSquarePoster(ctx, width, height, opts, theme);
    } else if (opts.ratio === 'banner') {
      this.renderBannerPoster(ctx, width, height, opts, theme);
    }

    return canvas;
  }

  /**
   * 竖版海报渲染 (9:16 小红书/朋友圈 & 3:4 名校卷)
   */
  private renderVerticalPoster(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    opts: PosterOptions,
    theme: ThemeColors
  ) {
    const pad = 48;
    const contentW = width - pad * 2;
    let curY = 48;

    // 1. 顶部品牌栏 (清晰驼峰 XueBaW.com)
    ctx.save();
    this.roundRect(ctx, pad, curY, 48, 48, 12);
    ctx.fillStyle = theme.brandBg;
    ctx.fill();
    ctx.strokeStyle = theme.brandAccent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', pad + 24, curY + 25);

    // 品牌名小写 xuebaw.com
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.brandText;
    ctx.font = 'bold 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif';
    ctx.fillText(opts.brandName || '学霸网 · xuebaw.com', pad + 60, curY + 20);

    ctx.fillStyle = theme.subtitleColor;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(opts.brandSlogan || 'xuebaw.com · 中小学与职考精选真题文库', pad + 61, curY + 39);

    // 右上角胶囊徽标
    const topBadge = '👑 官方真题精选';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    const topBadgeW = ctx.measureText(topBadge).width + 22;
    this.roundRect(ctx, width - pad - topBadgeW, curY + 10, topBadgeW, 28, 14);
    ctx.fillStyle = theme.badgeBg;
    ctx.fill();
    ctx.strokeStyle = theme.badgeBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = theme.brandAccent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topBadge, width - pad - topBadgeW / 2, curY + 24);
    ctx.restore();

    curY += 68;

    // 分割线
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(width - pad, curY);
    ctx.stroke();
    ctx.restore();

    curY += 26;

    // 2. 标签行 (去重图标，清晰标示)
    ctx.save();
    let tagX = pad;
    const tags = [
      opts.grade || '全学段通用',
      opts.subject || '全科精品资料',
      opts.edition || '官方正版'
    ];
    for (const t of tags) {
      // 避免自身带重复图标
      const cleanT = t.replace(/^[🎒📘🎓📋🏛️\s]+/, '');
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
      const tw = ctx.measureText(cleanT).width + 24;
      this.roundRect(ctx, tagX, curY, tw, 30, 8);
      ctx.fillStyle = theme.badgeBg;
      ctx.fill();
      ctx.strokeStyle = theme.badgeBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = theme.badgeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cleanT, tagX + tw / 2, curY + 15);
      tagX += tw + 10;
    }

    // 右侧容量标签 (保证单图标)
    if (opts.file_size && opts.file_size !== '0 B') {
      const cleanSz = opts.file_size.replace(/^[💾📦\s]+/, '');
      const szText = `📦 ${cleanSz}`;
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
      const szW = ctx.measureText(szText).width + 22;
      this.roundRect(ctx, width - pad - szW, curY, szW, 30, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(szText, width - pad - szW / 2, curY + 15);
    }
    ctx.restore();

    // 留出充足呼吸空间，彻底消除与上方规则标签重叠的拥挤感
    curY += 56;

    // 3. 资源大标题 (字体加大到 34px，极速吸睛，垂直精准计算)
    ctx.save();
    ctx.fillStyle = theme.titleColor;
    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 10;
    curY = this.wrapText(ctx, opts.title, pad, curY, contentW, 44, 3);
    ctx.restore();

    curY += 16;

    // 副标题/核心引流说明
    const subtitle = opts.subtitle || '🔥 完整版试卷真题 + 答题卡 + 名师解析微课，原卷无删减，建议收藏转存！';
    ctx.save();
    ctx.fillStyle = theme.subtitleColor;
    ctx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    curY = this.wrapText(ctx, subtitle, pad, curY, contentW, 24, 2);
    ctx.restore();

    curY += 28;

    // 4. 三大高转化权益卡片 (将“锁”改为“闪电”极速网盘图标，消除收费顾虑)
    const highlights = opts.highlights || [
      '📄 100% 矢量无损高清 (A4 打印绝不发虚模糊)',
      '🎬 配套名师解题微课 (原画原声流畅观看)',
      '⚡ 官方网盘极速直链 (免费原画 · 一键秒存)'
    ];

    for (const h of highlights) {
      // 强制将任何可能存在的锁图标替换为极速闪电
      const safeH = h.replace(/🔒/g, '⚡');

      ctx.save();
      this.roundRect(ctx, pad, curY, contentW, 52, 12);
      ctx.fillStyle = theme.highlightBg;
      ctx.fill();
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = theme.highlightText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(safeH, pad + 20, curY + 26);
      ctx.restore();

      curY += 66;
    }

    curY += 14;

    // 5. 中间区域：展示真实文件树或真题规格背书卡片 (填补竖版中间空白，层次饱满)
    const qrSectionH = 180;
    const qrY = height - pad - qrSectionH;
    const remainingMiddleSpace = qrY - curY - 20;

    if (remainingMiddleSpace >= 110) {
      ctx.save();
      this.roundRect(ctx, pad, curY, contentW, remainingMiddleSpace, 14);
      ctx.fillStyle = theme.cardBg;
      ctx.fill();
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (opts.fileItems && opts.fileItems.length > 0) {
        // 展示真实文件树
        ctx.font = 'bold 13.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = theme.brandAccent;
        ctx.textBaseline = 'middle';
        ctx.fillText('📂 资源包内含真实附件清单：', pad + 18, curY + 26);

        let itemY = curY + 54;
        for (const item of opts.fileItems.slice(0, 3)) {
          if (itemY + 28 > curY + remainingMiddleSpace) break;
          ctx.font = '13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.fillStyle = '#e2e8f0';
          const name = item.name.length > 28 ? item.name.slice(0, 26) + '...' : item.name;
          ctx.fillText(`${item.icon} ${name}`, pad + 18, itemY);
          itemY += 34;
        }
      } else {
        // 展示权威真题规格背书
        ctx.font = 'bold 13.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = theme.brandAccent;
        ctx.textBaseline = 'middle';
        ctx.fillText('👑 名校真题与网盘原画转存标准：', pad + 18, curY + 26);

        const specs = [
          '✓ 试卷规格：高清矢量 PDF + 答题卡 + 名师解析微课',
          '✓ 打印支持：1:1 原版排版 · A4 纸张直接打印绝不发虚',
          '✓ 网盘转存：夸克/百度官方网盘通道 · 永久保存防失效'
        ];
        let specY = curY + 54;
        for (const sp of specs) {
          if (specY + 24 > curY + remainingMiddleSpace) break;
          ctx.font = '13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(sp, pad + 18, specY);
          specY += 32;
        }
      }
      ctx.restore();
    }

    // 6. 底部二维码转化区域 (锁定底部)
    ctx.save();
    this.roundRect(ctx, pad, qrY, contentW, qrSectionH, 16);
    ctx.fillStyle = theme.cardBg;
    ctx.fill();
    ctx.strokeStyle = theme.qrBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 绘制高清二维码
    const qrSize = 144;
    const qrPadding = 18;
    drawQRCodeToCanvas(ctx, opts.targetUrl, pad + qrPadding, qrY + qrPadding, qrSize, {
      darkColor: '#0f172a',
      lightColor: '#ffffff',
      margin: 8,
      borderRadius: 10
    });

    // 右侧扫码文案
    const textX = pad + qrPadding + qrSize + 22;

    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillStyle = theme.qrTipTitle;
    ctx.textBaseline = 'top';
    ctx.fillText('📱 微信 / 手机扫码直达', textX, qrY + 26);

    ctx.font = 'bold 14.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillStyle = theme.brandAccent;
    ctx.fillText('⚡ 长按识别 · 免费秒存到网盘', textX, qrY + 60);

    ctx.font = '12.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = theme.qrTipDesc;
    ctx.fillText('✓ 免费免登录 · 试看即存 · 永久防失效', textX, qrY + 90);

    // 底部网址印章 (XueBaW.com 驼峰)
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const displayUrl = this.formatUrlForDisplay(opts.targetUrl);
    const shortUrl = displayUrl.length > 28 ? displayUrl.slice(0, 26) + '...' : displayUrl;
    ctx.fillText(`网址: ${shortUrl}`, textX, qrY + 124);

    ctx.restore();
  }

  /**
   * 方形海报渲染 (1:1 微信群/QQ群/论坛)
   */
  private renderSquarePoster(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    opts: PosterOptions,
    theme: ThemeColors
  ) {
    const pad = 44;
    const contentW = width - pad * 2;

    // 顶部品牌栏
    ctx.save();
    this.roundRect(ctx, pad, pad, 44, 44, 10);
    ctx.fillStyle = theme.brandBg;
    ctx.fill();
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', pad + 22, pad + 22);

    ctx.fillStyle = theme.brandText;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.brandName || '学霸网 · xuebaw.com', pad + 54, pad + 19);

    ctx.fillStyle = theme.subtitleColor;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(opts.brandSlogan || 'xuebaw.com · 中小学与职考精选真题文库', pad + 55, pad + 38);
    ctx.restore();

    // 标签栏
    ctx.save();
    let tagX = pad;
    const tags = [opts.grade || '全学段', opts.subject || '精品试卷', opts.edition || '最新版'];
    for (const t of tags) {
      const cleanT = t.replace(/^[🎒📘🎓📋🏛️\s]+/, '');
      ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, sans-serif';
      const tw = ctx.measureText(cleanT).width + 20;
      this.roundRect(ctx, tagX, pad + 62, tw, 28, 6);
      ctx.fillStyle = theme.badgeBg;
      ctx.fill();
      ctx.strokeStyle = theme.badgeBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = theme.badgeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cleanT, tagX + tw / 2, pad + 76);
      tagX += tw + 10;
    }
    ctx.restore();

    // 大标题 (间距拉开，不重叠)
    ctx.save();
    ctx.fillStyle = theme.titleColor;
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const titleY = this.wrapText(ctx, opts.title, pad, pad + 116, contentW, 36, 2);
    ctx.restore();

    // 特色权益 (无锁图标)
    const highY = titleY + 14;
    const highlights = [
      '📄 100% 矢量无损高清 (A4 打印超清晰)',
      '🎬 配套名师解题微课 (原画原声流畅观看)',
      '⚡ 官方网盘极速直链 (免费原画 · 一键秒存)'
    ];

    let hy = highY;
    for (const h of highlights.slice(0, 2)) {
      ctx.save();
      this.roundRect(ctx, pad, hy, contentW, 40, 8);
      ctx.fillStyle = theme.highlightBg;
      ctx.fill();
      ctx.font = 'bold 13.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = theme.highlightText;
      ctx.textBaseline = 'middle';
      ctx.fillText(h, pad + 16, hy + 20);
      ctx.restore();
      hy += 48;
    }

    // 底部扫码与转化大卡片
    const qrCardH = 210;
    const qrCardY = height - pad - qrCardH;

    ctx.save();
    this.roundRect(ctx, pad, qrCardY, contentW, qrCardH, 16);
    ctx.fillStyle = theme.cardBg;
    ctx.fill();
    ctx.strokeStyle = theme.qrBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const qrSize = 174;
    drawQRCodeToCanvas(ctx, opts.targetUrl, pad + 18, qrCardY + 18, qrSize, {
      darkColor: '#0f172a',
      lightColor: '#ffffff',
      margin: 8,
      borderRadius: 10
    });

    const qrInfoX = pad + 18 + qrSize + 26;
    ctx.font = 'bold 21px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillStyle = theme.qrTipTitle;
    ctx.textBaseline = 'top';
    ctx.fillText('📱 微信 / 手机扫码直达', qrInfoX, qrCardY + 36);

    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillStyle = theme.brandAccent;
    ctx.fillText('⚡ 长按识别 · 免费秒存到网盘', qrInfoX, qrCardY + 74);

    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = theme.qrTipDesc;
    ctx.fillText('✓ 权威真题 · 附官方答题卡', qrInfoX, qrCardY + 106);

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const displayUrl = this.formatUrlForDisplay(opts.targetUrl);
    ctx.fillText(`网址: ${displayUrl}`, qrInfoX, qrCardY + 138);

    ctx.restore();
  }

  /**
   * 横版海报渲染 (16:9 B站动态/贴吧宽幅/视频封面)
   */
  private renderBannerPoster(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    opts: PosterOptions,
    theme: ThemeColors
  ) {
    const pad = 48;
    const leftW = width - pad * 2 - 320;

    // 左侧：品牌 + 标签 + 标题 + 核心卖点
    // 品牌栏
    ctx.save();
    this.roundRect(ctx, pad, pad, 44, 44, 10);
    ctx.fillStyle = theme.brandBg;
    ctx.fill();
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', pad + 22, pad + 22);

    ctx.fillStyle = theme.brandText;
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.brandName || '学霸网 · xuebaw.com', pad + 56, pad + 20);

    ctx.fillStyle = theme.subtitleColor;
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(opts.brandSlogan || 'xuebaw.com · 中小学与职考精选真题文库 · 免费原画转存', pad + 58, pad + 40);
    ctx.restore();

    // 标签栏
    ctx.save();
    let tagX = pad;
    const tags = [opts.grade || '全学段', opts.subject || '全科资料', opts.edition || '最新版'];
    for (const t of tags) {
      const cleanT = t.replace(/^[🎒📘🎓📋🏛️\s]+/, '');
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
      const tw = ctx.measureText(cleanT).width + 20;
      this.roundRect(ctx, tagX, pad + 68, tw, 28, 6);
      ctx.fillStyle = theme.badgeBg;
      ctx.fill();
      ctx.strokeStyle = theme.badgeBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = theme.badgeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cleanT, tagX + tw / 2, pad + 82);
      tagX += tw + 10;
    }
    ctx.restore();

    // 大标题
    ctx.save();
    ctx.fillStyle = theme.titleColor;
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const titleY = this.wrapText(ctx, opts.title, pad, pad + 130, leftW, 44, 2);
    ctx.restore();

    // 权益栏 (无锁图标)
    let hy = titleY + 16;
    const highlights = [
      '📄 100% 矢量无损高清 (A4 打印绝不发虚模糊)',
      '🎬 配套名师解题微课 (原画原声流畅观看)',
      '⚡ 官方网盘极速直链 (免费原画 · 一键秒存)'
    ];

    for (const h of highlights) {
      ctx.save();
      this.roundRect(ctx, pad, hy, leftW, 46, 10);
      ctx.fillStyle = theme.highlightBg;
      ctx.fill();
      ctx.font = 'bold 14.5px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = theme.highlightText;
      ctx.textBaseline = 'middle';
      ctx.fillText(h, pad + 18, hy + 23);
      ctx.restore();
      hy += 56;
    }

    // 右侧：高清扫码直达卡片
    const rightX = width - pad - 280;
    const rightY = pad;
    const rightH = height - pad * 2;

    ctx.save();
    this.roundRect(ctx, rightX, rightY, 280, rightH, 18);
    ctx.fillStyle = theme.cardBg;
    ctx.fill();
    ctx.strokeStyle = theme.qrBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 二维码
    const qrSize = 210;
    const qrX = rightX + (280 - qrSize) / 2;
    drawQRCodeToCanvas(ctx, opts.targetUrl, qrX, rightY + 36, qrSize, {
      darkColor: '#0f172a',
      lightColor: '#ffffff',
      margin: 10,
      borderRadius: 12
    });

    // 文案
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillStyle = theme.qrTipTitle;
    ctx.fillText('📱 微信 / 手机扫码直达', rightX + 140, rightY + 288);

    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = theme.brandAccent;
    ctx.fillText('⚡ 立即保存到个人网盘', rightX + 140, rightY + 318);

    ctx.font = '12.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = theme.qrTipDesc;
    ctx.fillText('长按识别二维码 · 免费转存', rightX + 140, rightY + 344);

    ctx.font = '11.5px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const displayUrl = this.formatUrlForDisplay(opts.targetUrl);
    ctx.fillText(`网址: ${displayUrl}`, rightX + 140, rightY + 372);
    ctx.restore();
  }

  /**
   * 生成图片 DataURL
   */
  async generatePosterDataUrl(opts: PosterOptions): Promise<string> {
    const canvas = this.generatePosterCanvas(opts);
    return canvas.toDataURL('image/png', 0.95);
  }

  /**
   * 生成图片 Blob
   */
  async generatePosterBlob(opts: PosterOptions): Promise<Blob> {
    const canvas = this.generatePosterCanvas(opts);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png', 0.95);
    });
  }

  /**
   * 一键直接复制图片到系统剪贴板 (免下载，直接在微信/QQ等按 Ctrl+V 粘贴秒发)
   */
  async copyPosterToClipboard(opts: PosterOptions): Promise<boolean> {
    try {
      const blob = await this.generatePosterBlob(opts);
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Clipboard write image failed, falling back:', err);
      return false;
    }
  }

  /**
   * 一键下载 PNG
   */
  async downloadPoster(opts: PosterOptions, fileName?: string) {
    const dataUrl = await this.generatePosterDataUrl(opts);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName || `学霸网海报_${opts.title.slice(0, 16)}_${opts.ratio}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
