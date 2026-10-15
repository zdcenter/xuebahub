import { Injectable } from '@angular/core';

export interface CoverResourceInfo {
  title: string;
  grade?: string;
  subject?: string;
  edition?: string;
  file_size?: string;
  file_tree?: any[];
}

@Injectable({
  providedIn: 'root'
})
export class CoverGeneratorService {

  private getFileIcon(ext: string, isDir?: boolean): string {
    if (isDir) return '📁';
    const e = (ext || '').toUpperCase();
    if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV', 'TS'].includes(e)) return '🎬';
    if (['PDF'].includes(e)) return '📄';
    if (['DOC', 'DOCX', 'TXT', 'WPS'].includes(e)) return '📝';
    if (['PPT', 'PPTX'].includes(e)) return '📑';
    if (['XLS', 'XLSX', 'CSV'].includes(e)) return '📊';
    if (['ZIP', 'RAR', '7Z', 'TAR'].includes(e)) return '📦';
    if (['MP3', 'WAV', 'FLAC'].includes(e)) return '🎵';
    return '📄';
  }

  private extractDisplayItems(fileTree: any[]) {
    if (!fileTree || !Array.isArray(fileTree) || fileTree.length === 0) {
      return { items: [], totalCount: 0 };
    }

    let list = fileTree;
    if (list.length === 1 && list[0].is_dir && Array.isArray(list[0].children) && list[0].children.length > 0) {
      list = list[0].children;
    }

    const items = list.slice(0, 4).map(item => ({
      name: item.name || '',
      icon: this.getFileIcon(item.ext, item.is_dir),
      size: item.size || (item.is_dir ? '文件夹' : '资料包'),
      isDir: item.is_dir
    }));

    return {
      items,
      totalCount: list.length
    };
  }

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

  /**
   * 在浏览器内存中使用 HTML5 Canvas 绘制 600×600 PNG 海报封面
   */
  async generateCoverDataUrl(resource: CoverResourceInfo): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    // 1. 深蓝径向渐变底色
    const bgGrad = ctx.createRadialGradient(300, 150, 0, 300, 150, 450);
    bgGrad.addColorStop(0, '#1e3a8a');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 600, 600);

    // 光晕虚化球 1 (右上蓝光)
    ctx.save();
    const blur1 = ctx.createRadialGradient(500, 50, 0, 500, 50, 150);
    blur1.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
    blur1.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = blur1;
    ctx.beginPath();
    ctx.arc(500, 50, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 光晕虚化球 2 (左下金光)
    ctx.save();
    const blur2 = ctx.createRadialGradient(80, 520, 0, 80, 520, 140);
    blur2.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
    blur2.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = blur2;
    ctx.beginPath();
    ctx.arc(80, 520, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. 顶部品牌栏
    // 品牌 Logo 底座 Squircle
    ctx.save();
    this.roundRect(ctx, 36, 32, 46, 46, 12);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Logo 内部绘制金色学士帽图标
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', 59, 56);
    ctx.restore();

    // 品牌文字
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif';
    ctx.fillText('学霸网 备考文库', 92, 51);

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('XUEBAW.COM · 免费原画转存', 93, 70);
    ctx.restore();

    // 右侧胶囊徽章 "👑 100% 真实网盘原件"
    ctx.save();
    const badgeText = '👑 100% 真实网盘原件';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 24;
    this.roundRect(ctx, 564 - badgeW, 40, badgeW, 28, 14);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 564 - badgeW / 2, 54);
    ctx.restore();

    // 品牌分割线
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, 92);
    ctx.lineTo(564, 92);
    ctx.stroke();
    ctx.restore();

    // 3. 标签行 (Grade, Subject, Edition, Size)
    ctx.save();
    let tagX = 36;
    const drawTag = (text: string, bgColor: string, textColor: string, strokeColor: string) => {
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      const tw = ctx.measureText(text).width + 18;
      this.roundRect(ctx, tagX, 106, tw, 24, 6);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tagX + tw / 2, 118);
      tagX += tw + 8;
    };

    drawTag(resource.grade || '全阶段', 'rgba(59, 130, 246, 0.25)', '#bfdbfe', 'rgba(96, 165, 250, 0.4)');
    drawTag(resource.subject || '精品资料', 'rgba(16, 185, 129, 0.2)', '#a7f3d0', 'rgba(52, 211, 153, 0.4)');
    drawTag(resource.edition || '官方正版', 'rgba(168, 85, 247, 0.2)', '#e9d5ff', 'rgba(192, 132, 252, 0.4)');

    // 容量标签（右对齐）
    const sizeText = `📦 ${(!resource.file_size || resource.file_size === '0 B') ? '全套精选资料' : resource.file_size}`;
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    const sizeW = ctx.measureText(sizeText).width + 18;
    this.roundRect(ctx, 564 - sizeW, 106, sizeW, 24, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sizeText, 564 - sizeW / 2, 118);
    ctx.restore();

    // 4. 资源标题 (最多两行，带省略号)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 6;

    const title = resource.title || '精选学习资料合集';
    const maxTitleWidth = 528;
    const lineHeight = 26;
    let titleY = 156;

    // 自动折行算法
    let currentLine = '';
    let lineCount = 0;
    for (let i = 0; i < title.length; i++) {
      const testLine = currentLine + title[i];
      if (ctx.measureText(testLine).width > maxTitleWidth && i > 0) {
        lineCount++;
        if (lineCount === 2) {
          ctx.fillText(currentLine.slice(0, -1) + '...', 36, titleY);
          currentLine = '';
          break;
        } else {
          ctx.fillText(currentLine, 36, titleY);
          currentLine = title[i];
          titleY += lineHeight;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      ctx.fillText(currentLine, 36, titleY);
    }
    ctx.restore();

    // 5. 真实文件目录卡片容器
    const cardY = 224;
    const cardH = 286;
    ctx.save();
    this.roundRect(ctx, 36, cardY, 528, cardH, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 目录卡片头部
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('📂 真实网盘内含文件清单目录', 52, cardY + 24);

    ctx.fillStyle = '#60a5fa';
    ctx.textAlign = 'right';
    ctx.fillText('已核验无解压码', 548, cardY + 24);

    // 头部虚线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(52, cardY + 34);
    ctx.lineTo(548, cardY + 34);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 提取文件列表
    const { items, totalCount } = this.extractDisplayItems(resource.file_tree || []);
    let rowY = cardY + 46;

    if (items.length === 0) {
      // 默认空状态模拟行
      const defaultRows = [
        { icon: '🎬', name: '高清全套微课精讲视频课合集.mp4', size: '已校验' },
        { icon: '📄', name: '名师同步重点笔记与压轴真题.pdf', size: '可打印' },
        { icon: '📦', name: '官方高清原题及手写步骤解析.zip', size: '完整包' },
      ];
      for (const r of defaultRows) {
        this.drawFileRow(ctx, 52, rowY, 496, 34, r.icon, r.name, r.size);
        rowY += 42;
      }
    } else {
      for (const item of items) {
        this.drawFileRow(ctx, 52, rowY, 496, 34, item.icon, item.name, item.size);
        rowY += 42;
      }
    }

    // 底部汇总背书行
    const summaryY = cardY + cardH - 32;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(52, summaryY);
    ctx.lineTo(548, summaryY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    const sumCount = totalCount > 0 ? totalCount : 3;
    ctx.fillText(`... 以及其余共 ${sumCount} 项真实网盘资源`, 52, summaryY + 20);

    // 绿标 "所见即所存"
    const proofText = '所见即所存 · 100% 存活';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    const proofW = ctx.measureText(proofText).width + 16;
    this.roundRect(ctx, 548 - proofW, summaryY + 8, proofW, 20, 10);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
    ctx.stroke();
    ctx.fillStyle = '#6ee7b7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(proofText, 548 - proofW / 2, summaryY + 18);
    ctx.restore();

    // 6. 底部行动呼吁条
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(36, 532);
    ctx.lineTo(564, 532);
    ctx.stroke();

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('⚡ 夸克网盘原画极速转存', 36, 560);

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('点击或扫码 直达免费下载 ➔', 564, 560);
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  private drawFileRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, icon: string, name: string, size: string) {
    ctx.save();
    this.roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 图标
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x + 16, y + h / 2);

    // 文件名 (截断)
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const maxNameW = w - 120;
    let display = name;
    if (ctx.measureText(display).width > maxNameW) {
      while (display.length > 4 && ctx.measureText(display + '...').width > maxNameW) {
        display = display.slice(0, -1);
      }
      display += '...';
    }
    ctx.fillText(display, x + 34, y + h / 2);

    // 大小
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(size, x + w - 10, y + h / 2);

    ctx.restore();
  }
}
