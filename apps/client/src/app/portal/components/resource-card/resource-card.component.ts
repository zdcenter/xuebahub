import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';

@Component({
  selector: 'app-resource-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './resource-card.component.html'
})
export class ResourceCardComponent {
  @Input({ required: true }) resource!: ResourceItemDto;
  @Input() viewMode: 'grid' | 'list' = 'grid';

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

  // 学段中文字符串清洗 (解决数据库存 'primary' / 'junior' 出现英文胶囊问题)
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

  // 格式化转存人数（支持千分位或 k 展示）
  get formattedSaveCount(): string {
    const count = this.resource.save_count || 0;
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return count.toString();
  }
}
