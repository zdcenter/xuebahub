import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import {
  PosterGeneratorService,
  PosterOptions,
  PosterRatio,
  PosterTheme
} from '../../services/poster-generator.service';

@Component({
  selector: 'app-poster-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './poster-modal.component.html',
  styleUrls: ['./poster-modal.component.css']
})
export class PosterModalComponent {
  i18n = inject(I18nService);
  posterService = inject(PosterGeneratorService);

  isOpen = input<boolean>(false);
  resource = input<any>(null);
  batchResources = input<any[]>([]); // 支持多选批量合辑海报
  closed = output<void>();

  // 状态控制器
  selectedRatio = signal<PosterRatio>('story');
  selectedTheme = signal<PosterTheme>('academic');
  customTitle = signal<string>('');
  customSubtitle = signal<string>('');
  customUrl = signal<string>('');
  previewDataUrl = signal<string>('');
  isRendering = signal<boolean>(false);
  feedbackMessage = signal<string | null>(null);
  feedbackType = signal<'success' | 'warning' | 'info'>('info');

  private debounceTimer: any = null;

  constructor() {
    // 监听 resource 或 batchResources 或 isOpen 变动自动初始化
    effect(() => {
      const open = this.isOpen();
      const res = this.resource();
      const batch = this.batchResources();

      if (open) {
        if (batch && batch.length > 1) {
          // 批量合辑模式
          const subjects = Array.from(new Set(batch.map(r => r.subject).filter(Boolean))).join('/');
          const grade = batch[0]?.grade || '精选全套';
          this.customTitle.set(`【${grade}】${subjects ? subjects + ' ' : ''}核心真题与密卷全套合辑 (${batch.length} 套资料包)`);
          this.customSubtitle.set(`⚡ 一键打包转存 ${batch.length} 套名校精选真题密卷，A4无损高清打印 + 名师大题微课！`);
          this.customUrl.set('https://xuebaw.com');
        } else if (res) {
          // 单套资料模式
          this.customTitle.set(res.title || '精选试卷真题资料');
          this.customSubtitle.set('🔥 完整版试卷真题 + 答题卡 + 名师解析微课，原卷无删减，建议收藏转存！');
          const slug = res.slug || res.id || '';
          this.customUrl.set(`https://xuebaw.com/resource/${slug}`);
        } else {
          this.customTitle.set('学霸网 · 中小学名校期末与中高考真题合辑');
          this.customSubtitle.set('🔥 100% 矢量无损 A4 极清打印，名师精讲微课，官方网盘极速转存！');
          this.customUrl.set('https://xuebaw.com');
        }

        this.feedbackMessage.set(null);
        this.triggerRender();
      }
    });
  }

  // 快捷切换版型
  setRatio(ratio: PosterRatio) {
    this.selectedRatio.set(ratio);
    this.triggerRender();
  }

  // 快捷切换主题
  setTheme(theme: PosterTheme) {
    this.selectedTheme.set(theme);
    this.triggerRender();
  }

  // 文本改动防抖渲染
  onTextChange() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.triggerRender();
    }, 150);
  }

  private extractFileItems(): { name: string; icon: string; size?: string }[] {
    const res = this.resource();
    if (!res || !res.file_tree || !Array.isArray(res.file_tree)) {
      return [];
    }

    let list = res.file_tree;
    if (list.length === 1 && list[0].is_dir && Array.isArray(list[0].children)) {
      list = list[0].children;
    }

    return list.slice(0, 4).map((f: any) => ({
      name: f.name || '学习文件',
      icon: f.is_dir ? '📁' : '📄',
      size: f.size || (f.is_dir ? '文件夹' : '资料包')
    }));
  }

  private buildPosterOptions(): PosterOptions {
    const res = this.resource();
    const batch = this.batchResources();
    const isBatch = batch && batch.length > 1;

    return {
      ratio: this.selectedRatio(),
      theme: this.selectedTheme(),
      title: this.customTitle().trim() || '精选学习资料',
      subtitle: this.customSubtitle().trim(),
      grade: isBatch ? (batch[0]?.grade || '全阶段') : (res?.grade || '全阶段'),
      subject: isBatch ? '全套密卷' : (res?.subject || '精品资料'),
      edition: isBatch ? `${batch.length}套合辑` : (res?.edition || '2024-2025学年最新'),
      file_size: isBatch ? `${batch.length} 套资料` : (res?.file_size || '精选全套'),
      targetUrl: this.customUrl().trim() || 'https://xuebaw.com',
      brandName: '学霸网 · xuebaw.com',
      brandSlogan: 'xuebaw.com · 中小学与职考精选真题文库 · 免费原画转存',
      fileItems: isBatch ? batch.slice(0, 4).map(b => ({ name: b.title, icon: '📄' })) : this.extractFileItems(),
      highlights: [
        '📄 100% 矢量无损高清 (A4 打印绝不发虚模糊)',
        '🎬 配套名师解题微课 (原画原声流畅观看)',
        '⚡ 官方网盘极速直链 (免费原画 · 一键秒存)'
      ]
    };
  }

  async triggerRender() {
    this.isRendering.set(true);
    try {
      const opts = this.buildPosterOptions();
      const dataUrl = await this.posterService.generatePosterDataUrl(opts);
      this.previewDataUrl.set(dataUrl);
    } catch (err) {
      console.error('Failed to render poster:', err);
    } finally {
      this.isRendering.set(false);
    }
  }

  // 一键复制图片到剪贴板
  async copyImage() {
    const opts = this.buildPosterOptions();
    const ok = await this.posterService.copyPosterToClipboard(opts);
    if (ok) {
      this.feedbackType.set('success');
      this.feedbackMessage.set(this.i18n.t('poster.copySuccess'));
    } else {
      // 降级为自动下载并提示
      this.feedbackType.set('warning');
      this.feedbackMessage.set(this.i18n.t('poster.copyFailed'));
      await this.downloadImage();
    }
  }

  // 一键下载高清原图
  async downloadImage() {
    const opts = this.buildPosterOptions();
    await this.posterService.downloadPoster(opts);
    this.feedbackType.set('success');
    this.feedbackMessage.set('✅ 高清海报已保存到您的下载文件夹！');
  }

  // 复制落地页链接
  async copyTargetLink() {
    try {
      await navigator.clipboard.writeText(this.customUrl());
      this.feedbackType.set('info');
      this.feedbackMessage.set(this.i18n.t('poster.copyLinkSuccess'));
    } catch {
      this.feedbackMessage.set('请手动复制链接');
    }
  }

  close() {
    this.closed.emit();
  }
}
