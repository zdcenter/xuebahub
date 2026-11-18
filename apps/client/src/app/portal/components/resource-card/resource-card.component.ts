import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { generateQRCodeSvg } from '../../../utils/qrcode.util';
import { getStageTheme, StageThemeInfo } from '../../../utils/stage-theme.util';

@Component({
  selector: 'app-resource-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './resource-card.component.html'
})
export class ResourceCardComponent {
  private sanitizer = inject(DomSanitizer);

  @Input({ required: true }) resource!: ResourceItemDto;
  @Input() viewMode: 'grid' | 'list' = 'grid';

  copied = false;
  private copyTimer: any = null;

  get primaryLink(): ResourceLinkDto | null {
    if (!this.resource.links || this.resource.links.length === 0) return null;
    return this.resource.links.find(l => l.drive_type === 'quark') || this.resource.links[0];
  }

  get hasBaidu(): boolean {
    return !!this.resource.links?.some(l => l.drive_type === 'baidu');
  }

  get hasQuark(): boolean {
    return !!this.resource.links?.some(l => l.drive_type === 'quark');
  }

  get isVideo(): boolean {
    const raw = ((this.resource.file_type || '') + ' ' + (this.resource.title || '')).toUpperCase();
    return raw.includes('视频') || raw.includes('MP4') || raw.includes('微课');
  }

  get isPdf(): boolean {
    const raw = (this.resource.file_type || '').toUpperCase();
    return raw.includes('PDF') || (!this.isVideo && !raw.includes('DOC'));
  }

  // 详情页完整 URL（用于二维码编码及微信/朋友圈分享）
  get detailUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.xuebaw.com';
    return `${origin}/resource/${this.resource.slug || this.resource.id}`;
  }

  // 动态生成直达详情页的 SVG 二维码
  get qrSvg(): SafeHtml {
    const svgStr = generateQRCodeSvg(this.detailUrl, 84, 2);
    return this.sanitizer.bypassSecurityTrustHtml(svgStr);
  }

  // 获取该资源对应的 5 大专属阶段视觉主题（色彩与文案）
  get stageTheme(): StageThemeInfo {
    return getStageTheme(this.resource);
  }

  // 学段标签
  get stageLabel(): string {
    return this.stageTheme.shortLabel;
  }

  // 年级精简标签 (消除 "通用 (1-6年级通用)" 这类过长文本)
  get cleanGrade(): string {
    const g = (this.resource.grade || '').trim();
    if (g.includes('通用') || g.includes('1-6')) return '通用版';
    return g;
  }

  // 清洗副标题/简介（消除开头的 ": "、"：" 等历史遗留符号）
  get cleanDescription(): string {
    const text = this.resource.subtitle || this.resource.description || '';
    return text.replace(/^[:：\s\-_]+/, '').trim();
  }

  // 根据学科定制视觉主题（用于拟真书卷与微渐变）
  get subjectTheme(): {
    bgGradient: string;
    border: string;
    textColor: string;
    badgeBg: string;
    badgeText: string;
    spineColor: string;
  } {
    const sub = (this.resource.subject || '').trim();
    if (sub.includes('语') || sub.includes('文')) {
      return {
        bgGradient: 'from-amber-500/10 via-orange-50/40 to-white',
        border: 'border-amber-200/70',
        textColor: 'text-amber-900',
        badgeBg: 'bg-amber-100/90 text-amber-800 border-amber-300/60',
        badgeText: '语',
        spineColor: 'bg-amber-500'
      };
    }
    if (sub.includes('数') || sub.includes('奥')) {
      return {
        bgGradient: 'from-blue-600/10 via-indigo-50/40 to-white',
        border: 'border-blue-200/70',
        textColor: 'text-blue-900',
        badgeBg: 'bg-blue-100/90 text-blue-800 border-blue-300/60',
        badgeText: '数',
        spineColor: 'bg-blue-600'
      };
    }
    if (sub.includes('英')) {
      return {
        bgGradient: 'from-emerald-600/10 via-teal-50/40 to-white',
        border: 'border-emerald-200/70',
        textColor: 'text-emerald-900',
        badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-300/60',
        badgeText: '英',
        spineColor: 'bg-emerald-600'
      };
    }
    if (sub.includes('物') || sub.includes('化') || sub.includes('生') || sub.includes('科')) {
      return {
        bgGradient: 'from-cyan-600/10 via-sky-50/40 to-white',
        border: 'border-cyan-200/70',
        textColor: 'text-cyan-900',
        badgeBg: 'bg-cyan-100/90 text-cyan-800 border-cyan-300/60',
        badgeText: '理',
        spineColor: 'bg-cyan-600'
      };
    }
    if (sub.includes('政') || sub.includes('史') || sub.includes('地') || sub.includes('道')) {
      return {
        bgGradient: 'from-rose-600/10 via-pink-50/40 to-white',
        border: 'border-rose-200/70',
        textColor: 'text-rose-900',
        badgeBg: 'bg-rose-100/90 text-rose-800 border-rose-300/60',
        badgeText: '文',
        spineColor: 'bg-rose-600'
      };
    }
    return {
      bgGradient: 'from-slate-500/10 via-slate-50/40 to-white',
      border: 'border-slate-200',
      textColor: 'text-slate-800',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-300/60',
      badgeText: '学',
      spineColor: 'bg-slate-500'
    };
  }

  // 5大考学阶段专属精装教材立体书皮渐变色系 (蓝=小学/小升初, 绿=初中/中考, 紫=高中/高考, 橙=教资, 红=公考)
  get subjectBgColor(): string {
    return this.stageTheme.gradientClass;
  }

  // 格式化转存人数
  get formattedSaveCount(): string {
    const count = this.resource.save_count || 0;
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return count.toString();
  }

  // 判断是否为移动端环境（手机/平板）
  get isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
  }

  // 分享功能处理 (PC端专注极速复制链接，移动端优先系统原生分享)
  async onShare(event: Event) {
    event.stopPropagation();
    event.preventDefault();

    const title = this.resource.title;
    const desc = this.cleanDescription || '名校精选真题密卷，A4高清原版可打印，免费一键转存！';
    const url = this.detailUrl;
    const shareText = `【学霸网资料】《${title}》\n${desc}\n⚡免密极速转存链接：${url}`;

    // 1. 移动端 (手机/iPad)：优先唤起系统原生分享面板 (微信/QQ/备忘录)
    if (this.isMobile && typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: `学霸网: ${title}`,
          text: desc,
          url: url
        });
        // 移动端调起系统分享后保持原有状态，不覆盖为“已复制”
        return;
      } catch (err: any) {
        // 用户主动取消系统分享时直接退出，不误触发复制状态
        if (err && (err.name === 'AbortError' || err.code === 20)) {
          return;
        }
      }
    }

    // 2. PC 端或不支持原生系统分享的环境：直接同步执行剪贴板极速复制
    this.copyToClipboard(shareText);
  }

  private copyToClipboard(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.triggerCopiedState();
      }).catch(() => {
        this.fallbackCopy(text);
      });
      return;
    }
    this.fallbackCopy(text);
  }

  private triggerCopiedState() {
    this.copied = true;
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.copied = false;
    }, 2500);
  }

  private fallbackCopy(text: string) {
    if (typeof document === 'undefined') return;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      this.triggerCopiedState();
    } catch (e) {
      console.error('Fallback copy failed', e);
    }
    document.body.removeChild(textarea);
  }
}
