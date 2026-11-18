import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { generateQRCodeSvg } from '../../../utils/qrcode.util';

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

  // 学段中文字符串清洗
  get stageLabel(): string {
    const s = (this.resource.stage || '').toLowerCase().trim();
    if (s === 'primary' || s === '小学') return '小学';
    if (s === 'junior' || s === '初中') return '初中';
    if (s === 'senior' || s === '高中') return '高中';
    if (s === 'kindergarten' || s === '幼小衔接' || s === '学前') return '学前幼小';
    if (s === 'cert' || s === '教师资格证') return '教师资格证';
    if (s === 'exam' || s === '考公考研') return '公考考研';
    return this.resource.stage || '';
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

  // 格式化转存人数
  get formattedSaveCount(): string {
    const count = this.resource.save_count || 0;
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return count.toString();
  }

  // 分享功能处理 (支持原生系统分享与智能剪贴板复制)
  async onShare(event: Event) {
    event.stopPropagation();
    event.preventDefault();

    const title = this.resource.title;
    const desc = this.cleanDescription || '名校精选真题密卷，A4高清原版可打印，免费一键转存！';
    const url = this.detailUrl;
    const shareText = `【学霸网资料分享】《${title}》\n${desc}\n⚡免密极速转存链接：${url}`;

    // 优先唤起移动端或微信原生系统分享面板
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: `学霸网: ${title}`,
          text: desc,
          url: url
        });
        this.triggerCopiedState();
        return;
      } catch (err) {
        // 用户取消或拒绝直接跳入剪贴板兜底
      }
    }

    // 剪贴板复制
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareText);
        this.triggerCopiedState();
        return;
      } catch (err) {}
    }

    // 传统输入框复制兜底
    this.fallbackCopy(shareText);
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
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.triggerCopiedState();
    } catch (e) {
      console.error('Copy failed', e);
    }
    document.body.removeChild(textarea);
  }
}
