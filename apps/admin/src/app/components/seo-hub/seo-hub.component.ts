import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  ResourceService, 
  SeoConfigDto, 
  SeoPushLogDto, 
  SeoStatsDto, 
  SeoBatchPushSummaryDto 
} from '../../services/resource.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-seo-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './seo-hub.component.html',
  styleUrls: ['./seo-hub.component.css']
})
export class SeoHubComponent implements OnInit {
  resService = inject(ResourceService);
  i18n = inject(I18nService);

  @Output() notify = new EventEmitter<{ message: string; type: 'success' | 'error' | 'info' }>();

  // 当前子标签: 'batch' (批量秒推) | 'config' (密钥配置) | 'logs' (推送流水)
  activeSubTab = signal<'batch' | 'config' | 'logs'>('batch');

  // 看板统计
  stats = signal<SeoStatsDto>({
    site_domain: 'https://xuebaw.com',
    baidu_active: true,
    baidu_token_set: false,
    baidu_remain_quota: 100000,
    bing_active: true,
    bing_key_set: true,
    auto_push: true,
    today_pushed_count: 0,
    total_pushed_count: 0,
    total_resources: 0,
    published_resources: 0,
    total_logs: 0,
    success_logs: 0,
    latest_logs: []
  });

  // 配置数据
  config = signal<SeoConfigDto>({
    site_domain: 'https://xuebaw.com',
    baidu_token: '',
    baidu_active: true,
    bing_api_key: '7f8a9b2c3d4e5f60718293a4b5c6d7e8',
    bing_active: true,
    auto_push_on_publish: true,
    daily_push_limit: 100000,
    today_pushed_count: 0,
    total_pushed_count: 0,
    baidu_remain_quota: 100000
  });

  // 批量推送选项
  selectedEngine = signal<'all' | 'baidu' | 'bing'>('all');
  customUrlsText = signal<string>('');
  isPushing = signal<boolean>(false);
  lastPushSummary = signal<SeoBatchPushSummaryDto | null>(null);

  // 配置保存状态
  isSavingConfig = signal<boolean>(false);

  // 推送日志
  logs = signal<SeoPushLogDto[]>([]);
  logsTotal = signal<number>(0);
  logsPage = signal<number>(1);
  logsPageSize = signal<number>(20);
  loadingLogs = signal<boolean>(false);

  ngOnInit() {
    this.loadStats();
    this.loadConfig();
    this.loadLogs();
  }

  loadStats() {
    this.resService.getSeoStats().subscribe({
      next: (s) => this.stats.set(s),
      error: (err) => console.error('Failed to load SEO stats:', err)
    });
  }

  loadConfig() {
    this.resService.getSeoConfig().subscribe({
      next: (cfg) => this.config.set(cfg),
      error: (err) => console.error('Failed to load SEO config:', err)
    });
  }

  saveConfig() {
    this.isSavingConfig.set(true);
    const cfg = this.config();
    this.resService.saveSeoConfig(cfg).subscribe({
      next: (res) => {
        this.isSavingConfig.set(false);
        this.config.set(res.config);
        this.loadStats();
        this.notify.emit({ message: 'SEO 搜索引擎密钥与自动推送配置已成功保存！', type: 'success' });
      },
      error: (err) => {
        this.isSavingConfig.set(false);
        this.notify.emit({ message: '保存配置失败: ' + (err.error?.error || err.message), type: 'error' });
      }
    });
  }

  generateRandomKey() {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const current = this.config();
    this.config.set({ ...current, bing_api_key: result });
    this.notify.emit({ message: '已生成全新 IndexNow 32位密钥，保存后即可生效', type: 'info' });
  }

  // 一键全量秒推在库所有已上架资料
  pushAllPublished() {
    if (this.isPushing()) return;
    this.isPushing.set(true);
    this.lastPushSummary.set(null);

    this.resService.pushAllSeo(this.selectedEngine(), 1000).subscribe({
      next: (summary) => {
        this.isPushing.set(false);
        this.lastPushSummary.set(summary);
        this.loadStats();
        this.loadLogs();
        const msg = `全站推送完成！共提交 ${summary.total_urls} 条 URL。${summary.summary_message}`;
        this.notify.emit({ message: msg, type: summary.status === 'failed' ? 'error' : 'success' });
      },
      error: (err) => {
        this.isPushing.set(false);
        this.notify.emit({ message: '全量推送失败: ' + (err.error?.error || err.message), type: 'error' });
      }
    });
  }

  // 推送自定义 URL 列表
  pushCustomUrls() {
    const text = this.customUrlsText().trim();
    if (!text) {
      this.notify.emit({ message: '请输入至少一行待推送的 URL 链接', type: 'error' });
      return;
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    this.isPushing.set(true);
    this.lastPushSummary.set(null);

    this.resService.batchPushSeo(this.selectedEngine(), [], lines).subscribe({
      next: (summary) => {
        this.isPushing.set(false);
        this.lastPushSummary.set(summary);
        this.loadStats();
        this.loadLogs();
        this.customUrlsText.set('');
        const msg = `自定义 URL 推送完成！共提交 ${summary.total_urls} 条。${summary.summary_message}`;
        this.notify.emit({ message: msg, type: summary.status === 'failed' ? 'error' : 'success' });
      },
      error: (err) => {
        this.isPushing.set(false);
        this.notify.emit({ message: '推送失败: ' + (err.error?.error || err.message), type: 'error' });
      }
    });
  }

  loadLogs(page: number = 1) {
    this.loadingLogs.set(true);
    this.logsPage.set(page);
    this.resService.getSeoLogs(page, this.logsPageSize()).subscribe({
      next: (res) => {
        this.loadingLogs.set(false);
        this.logs.set(res.logs || []);
        this.logsTotal.set(res.total || 0);
      },
      error: (err) => {
        this.loadingLogs.set(false);
        console.error('Failed to load SEO logs:', err);
      }
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '尚未推送';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  openSitemap() {
    const domain = this.config().site_domain || 'https://xuebaw.com';
    window.open(domain + '/sitemap.xml', '_blank');
  }

  getDomainHost(): string {
    const domain = this.config().site_domain || 'https://xuebaw.com';
    try {
      return new URL(domain).host;
    } catch {
      return domain.replace(/^https?:\/\//, '');
    }
  }

  getDomainKeyUrl(): string {
    const domain = this.config().site_domain || 'https://xuebaw.com';
    const key = this.config().bing_api_key || '7f8a9b2c3d4e5f60718293a4b5c6d7e8';
    return `${domain.replace(/\/+$/, '')}/${key}.txt`;
  }
}
