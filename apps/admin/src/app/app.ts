import { Component, OnInit, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceService, ResourceItemDto, NetdiskAccountDto, TransferShareResultDto, ChannelDto, NavMenuDto, RegionDto, SchoolDto, DashboardStatsDto, HotSearchDto, SiteSettingDto, ResourceRequestDto, TelegramConfigDto, TelegramChannelDto, TelegramBroadcastChannelDto, ResourceDraftDto, CrawlerStatsDto } from './services/resource.service';
import { CoverGeneratorService } from './services/cover-generator.service';
import { I18nService } from './services/i18n.service';
import { SmartMetaHelperService, AiConfig } from './services/smart-meta-helper.service';

export interface StageConfigItem {
  key: string;
  label: string;
  grades: string[];
  subjects: string[];
  editions: string[];
}

export const STAGE_OPTIONS: Record<string, StageConfigItem> = {
  primary: {
    key: 'primary',
    label: '小学阶段 (1-6年级)',
    grades: ['通用 (1-6年级通用)', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
    subjects: ['通用/全科', '数学', '语文', '英语', '奥数思维培优', '科学'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '外研版 (英语)', '冀教版', '沪教版']
  },
  junior: {
    key: 'junior',
    label: '初中专区 (中考冲刺)',
    grades: ['通用 (初中全阶段通用)', '初一/七年级', '初二/八年级', '初三/中考冲刺'],
    subjects: ['中考综合/全科', '数学', '语文', '英语', '物理', '化学', '道德与法治', '历史', '生物', '地理'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '华师大版', '外研版']
  },
  senior: {
    key: 'senior',
    label: '高中专区 (高考专项)',
    grades: ['通用 (高中全阶段通用)', '高一', '高二', '高三/高考总复习'],
    subjects: ['高考综合/全科', '数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理'],
    editions: ['通用版本', '人教版 (新高考)', '北师大版', '苏教版', '外研版']
  },
  cert: {
    key: 'cert',
    label: '成人考证 (教师资格证)',
    grades: ['国家统考通用', '小学教师资格证', '中学教师资格证', '幼儿教师资格证', '普通话等级考试'],
    subjects: ['统考全套考点', '综合素质 (科一)', '教育知识与能力 (科二)', '保教知识与能力', '学科知识与教学能力 (科三)', '面试试讲教案'],
    editions: ['国家考试大纲通用', '中公教育配套', '粉笔教育配套']
  },
  exam: {
    key: 'exam',
    label: '考公考研专区',
    grades: ['国家/地方统一大纲', '国家公务员考试 (国考)', '多省联考/省考', '事业单位招聘', '全国硕士研究生统考 (考研)'],
    subjects: ['备考全套大礼包', '申论提分范文与热点', '行测高频速算与技巧', '考研政治核心背诵', '考研英语词汇与长难句', '考研数学'],
    editions: ['国家考试大纲通用', '华图教育版', '中公教育版', '粉笔教育版']
  }
};

import { EmailHubComponent } from './components/email-hub/email-hub.component';
import { SeoHubComponent } from './components/seo-hub/seo-hub.component';
import { PosterModalComponent } from './components/poster-modal/poster-modal.component';
import { VideoScriptModalComponent } from './components/video-script-modal/video-script-modal.component';
import { QuickPasteModalComponent, ParsedItem } from './components/quick-paste-modal/quick-paste-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, EmailHubComponent, SeoHubComponent, PosterModalComponent, VideoScriptModalComponent, QuickPasteModalComponent],
  templateUrl: './app.html'
})
export class App implements OnInit {
  private resService = inject(ResourceService);
  private coverGen = inject(CoverGeneratorService);
  i18n = inject(I18nService);
  smartMeta = inject(SmartMetaHelperService);

  // 智能副标题轮换与 AI 大模型状态
  newSubtitleIndex = 0;
  editSubtitleIndex = 0;
  cachedNewSubtitles: string[] = [];
  cachedEditSubtitles: string[] = [];

  isAiGenerating = signal<boolean>(false);
  showAiSettingsModal = signal<boolean>(false);
  aiConfigState: AiConfig = this.smartMeta.getAiConfig();
  isTestingAiConnection = signal<boolean>(false);
  aiConfigVersion = signal<number>(0);
  suggestedTitleNew = signal<string>('');
  suggestedTitleEdit = signal<string>('');

  currentAiProviderLabel = computed(() => {
    this.aiConfigVersion();
    const cfg = this.smartMeta.getAiConfig();
    if (cfg.provider === 'gemini') return 'Google Gemini';
    if (cfg.provider === 'deepseek') return 'DeepSeek';
    if (cfg.provider === 'custom') return '自定义 OpenAI';
    return '本地规则引擎';
  });

  // ⚡ 列表行内直接修改转存数与浏览量
  editingStatsId = signal<string | null>(null);
  quickStatsSave = signal<number>(0);
  quickStatsView = signal<number>(0);
  savingStats = signal<boolean>(false);

  startEditStats(item: ResourceItemDto, event?: any) {
    if (event?.stopPropagation) event.stopPropagation();
    this.editingStatsId.set(item.id);
    this.quickStatsSave.set(item.save_count || 0);
    this.quickStatsView.set(item.view_count || 0);
  }

  cancelEditStats(event?: any) {
    if (event?.stopPropagation) event.stopPropagation();
    this.editingStatsId.set(null);
  }

  saveInlineStats(item: ResourceItemDto, event?: any) {
    if (event?.stopPropagation) event.stopPropagation();
    if (this.savingStats()) return;
    this.savingStats.set(true);

    const saveVal = Math.max(0, Number(this.quickStatsSave()) || 0);
    const viewVal = Math.max(0, Number(this.quickStatsView()) || 0);

    this.resService.updateStats(item.id, {
      save_count: saveVal,
      view_count: viewVal
    }).subscribe({
      next: () => {
        item.save_count = saveVal;
        item.view_count = viewVal;
        this.savingStats.set(false);
        this.editingStatsId.set(null);
        this.showToast(this.i18n.t('stats.editSuccess'), 'success');
      },
      error: (err) => {
        this.savingStats.set(false);
        this.showToast(this.i18n.t('stats.editFailed') + ': ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  readonly stageOptions = STAGE_OPTIONS;
  readonly stageKeys = Object.keys(STAGE_OPTIONS);

  // --- 身份认证与权限状态 ---
  isLoggedIn = signal<boolean>(false);
  currentUser = signal<{ username: string; nickname: string; role: string } | null>(null);
  loginForm = {
    username: 'admin',
    password: ''
  };
  loginLoading = signal<boolean>(false);
  loginError = signal<string>('');

  // --- 管理员资料与修改密码弹窗状态 ---
  showProfileModal = signal<boolean>(false);
  profileLoading = signal<boolean>(false);
  profileError = signal<string>('');
  profileForm = {
    nickname: '',
    old_password: '',
    new_password: '',
    confirm_password: ''
  };

  // --- 全局现代高质感确认对话框状态 ---
  confirmDialogState = signal<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    type: 'danger' | 'warning' | 'info';
    icon: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    type: 'danger',
    icon: '⚠️',
    onConfirm: () => {},
    onCancel: () => {}
  });

  confirmDialog(options: {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    icon?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmDialogState.set({
        isOpen: true,
        title: options.title || this.i18n.t('common.confirmTitle'),
        message: options.message,
        confirmText: options.confirmText || this.i18n.t('common.confirm'),
        cancelText: options.cancelText || this.i18n.t('common.cancel'),
        type: options.type || 'danger',
        icon: options.icon || (options.type === 'danger' ? '🗑️' : (options.type === 'info' ? 'ℹ️' : '⚠️')),
        onConfirm: () => {
          this.confirmDialogState.update(s => ({ ...s, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          this.confirmDialogState.update(s => ({ ...s, isOpen: false }));
          resolve(false);
        }
      });
    });
  }

  // --- 数据统计与全站转存监控看板 ---
  dashboardStats = signal<DashboardStatsDto | null>(null);
  statsLoading = signal<boolean>(false);

  currentTab = signal<'list' | 'add' | 'stats' | 'crawler' | 'email' | 'seo' | 'accounts' | 'channels' | 'navmenus' | 'schools' | 'hotsearches' | 'settings' | 'requests'>('list');
  emailPreselectedResource = signal<any>(null);

  // --- 侧边栏折叠/展开系统（支持记忆） ---
  isSidebarCollapsed = signal<boolean>(typeof window !== 'undefined' && localStorage.getItem('xueba_sidebar_collapsed') === 'true');

  toggleSidebar() {
    const nextState = !this.isSidebarCollapsed();
    this.isSidebarCollapsed.set(nextState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('xueba_sidebar_collapsed', String(nextState));
    }
  }

  // --- 资料列表行专属：宣发推广矩阵快捷下拉浮层 (TG / 邮件 / 文案) ---
  activePromoDropdownId = signal<string | null>(null);

  togglePromoDropdown(resId: string, event: MouseEvent) {
    event.stopPropagation();
    this.activePromoDropdownId.set(this.activePromoDropdownId() === resId ? null : resId);
  }

  closePromoDropdown() {
    this.activePromoDropdownId.set(null);
  }

  @HostListener('document:click')
  onDocumentClick() {
    if (this.activePromoDropdownId()) {
      this.activePromoDropdownId.set(null);
    }
  }

  openEmailHubWithResource(res: any) {
    this.closePromoDropdown();
    this.emailPreselectedResource.set(res);
    this.currentTab.set('email');
  }

  handleEmailHubNotification(event: { message: string; type: 'success' | 'error' | 'info' }) {
    this.showToast(event.message, event.type === 'error' ? 'error' : 'success');
  }

  handleSeoHubNotification(event: { message: string; type: 'success' | 'error' | 'info' }) {
    this.showToast(event.message, event.type === 'error' ? 'error' : 'success');
  }

  batchPushSelectedToSeo() {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) {
      this.showToast('请先勾选需要推送到搜索引擎的资料', 'error');
      return;
    }
    this.showToast(`正在将选中的 ${ids.length} 套资料推送到百度与必应...`, 'success');
    this.resService.batchPushSeo('all', ids, []).subscribe({
      next: (summary) => {
        const msg = `搜索引擎推送完成！${summary.summary_message}`;
        this.showToast(msg, summary.status === 'failed' ? 'error' : 'success');
      },
      error: (err) => {
        this.showToast('推送失败: ' + (err.error?.error || err.message), 'error');
      }
    });
  }
  loading = signal<boolean>(false);
  resources = signal<ResourceItemDto[]>([]);

  // 列表筛选与统计：支持一键切换“全部 / 仅失效 / 仅用户报错”
  listFilter = signal<'all' | 'invalid' | 'reported'>('all');

  invalidResourceCount = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'invalid')).length;
  });

  reportedResourceCount = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'reported')).length;
  });

  // 列表学段快捷筛选
  currentStageFilter = signal<string>('all');

  matchStage(actual?: string, target?: string): boolean {
    if (!target || target === 'all') return true;
    const a = (actual || '').toLowerCase();
    const t = target.toLowerCase();
    if (a === t) return true;
    if (t === 'primary' && (a.includes('小学') || a === 'primary')) return true;
    if (t === 'junior' && (a.includes('初中') || a === 'junior')) return true;
    if (t === 'senior' && (a.includes('高中') || a === 'senior')) return true;
    if (t === 'cert' && (a.includes('考证') || a.includes('教资') || a === 'cert')) return true;
    if (t === 'exam' && (a.includes('公考') || a.includes('考研') || a === 'exam')) return true;
    return false;
  }

  stageCount(stage: string): number {
    if (stage === 'all') return this.resources().length;
    return this.resources().filter(r => this.matchStage(r.stage, stage)).length;
  }

  filterByStage(stage: string) {
    this.currentStageFilter.set(stage);
  }

  currentSchoolFilter = signal<string>('');
  adminKeyword = signal<string>('');

  availableSchools = computed(() => {
    const schoolCountMap = new Map<string, number>();
    for (const r of this.resources()) {
      const s = (r.school || '').trim();
      if (s) {
        schoolCountMap.set(s, (schoolCountMap.get(s) || 0) + 1);
      }
    }
    return Array.from(schoolCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  });

  filterBySchool(school: string) {
    this.currentSchoolFilter.set(school);
  }

  clearAllFilters() {
    this.currentStageFilter.set('all');
    this.currentSchoolFilter.set('');
    this.adminKeyword.set('');
  }

  filteredResources = computed(() => {
    const filter = this.listFilter();
    const stage = this.currentStageFilter();
    const school = this.currentSchoolFilter().trim();
    const kw = this.adminKeyword().trim().toLowerCase();

    let list = this.resources();
    if (stage !== 'all') {
      list = list.filter(r => this.matchStage(r.stage, stage));
    }
    if (school) {
      list = list.filter(r => r.school && r.school.includes(school));
    }
    if (kw) {
      list = list.filter(r => 
        (r.title && r.title.toLowerCase().includes(kw)) ||
        (r.school && r.school.toLowerCase().includes(kw)) ||
        (r.region && r.region.toLowerCase().includes(kw)) ||
        (r.subject && r.subject.toLowerCase().includes(kw)) ||
        (r.grade && r.grade.toLowerCase().includes(kw))
      );
    }
    if (filter === 'invalid') {
      return list.filter(r => r.links?.some(l => l.status === 'invalid'));
    }
    if (filter === 'reported') {
      return list.filter(r => r.links?.some(l => l.status === 'reported'));
    }
    return list;
  });

  hasInvalidLink(res: ResourceItemDto): boolean {
    return Boolean(res.links?.some(l => l.status === 'invalid'));
  }

  hasReportedLink(res: ResourceItemDto): boolean {
    return Boolean(res.links?.some(l => l.status === 'reported'));
  }

  // --- 全网资源监控与智能采集中台 ---
  crawlerRawText = signal<string>('');
  isParsingCrawler = signal<boolean>(false);
  crawlerParsedResults = signal<any[]>([]);
  isCheckingDeadlinks = signal<boolean>(false);
  lastCheckResult = signal<string>('');

  // 全库网盘监控统计
  totalMonitoredLinks = computed(() => {
    let count = 0;
    for (const r of this.resources()) {
      count += (r.links || []).length;
    }
    return count;
  });

  invalidLinksCount = computed(() => {
    let count = 0;
    for (const r of this.resources()) {
      for (const l of r.links || []) {
        if (l.status === 'invalid' || l.status === 'reported') {
          count++;
        }
      }
    }
    return count;
  });

  healthRate = computed(() => {
    const total = this.totalMonitoredLinks();
    if (total === 0) return 100;
    const invalid = this.invalidLinksCount();
    const rate = ((total - invalid) / total) * 100;
    return Math.max(0, Math.min(100, Math.round(rate * 10) / 10));
  });

  deadOrReportedResources = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'invalid' || l.status === 'reported'));
  });

  // 立即触发全站存活批量巡检
  runFullSiteCheck() {
    this.isCheckingDeadlinks.set(true);
    this.lastCheckResult.set('');
    this.resService.batchCheckLinks({ force: true, min_interval_hours: 0 }).subscribe({
      next: (res: any) => {
        this.isCheckingDeadlinks.set(false);
        this.lastCheckResult.set(`✅ 巡检完成！已检测 ${res.checked_count} 个网盘链接：存活 ${res.active_count} 个，失效/异常 ${res.invalid_count} 个。`);
        this.loadResources();
        this.loadDashboardStats();
      },
      error: (err: any) => {
        this.isCheckingDeadlinks.set(false);
        this.lastCheckResult.set('❌ 巡检失败: ' + (err.error?.message || err.message));
      }
    });
  }

  // --- Telegram 智能采集中台与草稿池 (Telegram Ingestion & Drafts Pool) ---
  crawlerDrafts = signal<ResourceDraftDto[]>([]);
  crawlerDraftsTotal = signal<number>(0);
  crawlerDraftsPage = signal<number>(1);
  crawlerDraftsPageSize = signal<number>(20);
  crawlerDraftsStatus = signal<string>('pending'); // 'pending', 'all', 'approved', 'ignored'
  crawlerDraftsDrive = signal<string>('all');
  crawlerDraftsSearch = signal<string>('');
  isLoadingDrafts = signal<boolean>(false);
  isSyncingCrawler = signal<boolean>(false);
  selectedDraftIds = signal<string[]>([]);
  crawlerStats = signal<CrawlerStatsDto>({
    total_drafts: 0,
    pending_drafts: 0,
    approved_drafts: 0,
    ignored_drafts: 0,
    monitored_channels: 0
  });
  crawlerConfig = signal<TelegramConfigDto | null>(null);
  crawlerChannels = signal<TelegramChannelDto[]>([]);
  isRegisteringWebhook = signal<boolean>(false);
  activeChannelsCount = computed(() => this.crawlerChannels().filter(c => c.is_active).length);
  pausedChannelsCount = computed(() => this.crawlerChannels().filter(c => !c.is_active).length);

  // Telegram 工作台 Sub-Tab 控制 (方案 1：4大模块平铺切换)
  crawlerSubTab = signal<'drafts' | 'ingestion' | 'broadcast' | 'settings'>('drafts');
  activeBroadcastChannelsCount = computed(() => this.broadcastChannels().filter(c => c.is_active).length);
  pausedBroadcastChannelsCount = computed(() => this.broadcastChannels().filter(c => !c.is_active).length);

  switchCrawlerSubTab(tab: 'drafts' | 'ingestion' | 'broadcast' | 'settings') {
    this.crawlerSubTab.set(tab);
    if (tab === 'ingestion') {
      this.loadCrawlerChannels();
    } else if (tab === 'broadcast') {
      this.loadBroadcastChannels();
    } else if (tab === 'drafts') {
      this.loadCrawlerDrafts();
    } else if (tab === 'settings') {
      this.loadCrawlerConfigAndStats();
    }
  }

  // 模态框控制
  showCrawlerSettingsModal = signal<boolean>(false);
  crawlerSettingsTab = signal<'ingestion' | 'broadcast'>('ingestion');
  smartChannelInput = '';
  isResolvingChannel = signal<boolean>(false);
  isTestingBroadcast = signal<boolean>(false);
  broadcastChannels = signal<TelegramBroadcastChannelDto[]>([]);
  smartBroadcastChannelInput = '';
  isResolvingBroadcastChannel = signal<boolean>(false);
  showCrawlerPasteModal = signal<boolean>(false);
  isPastingCrawler = signal<boolean>(false);
  showCrawlerRawModal = signal<boolean>(false);
  currentRawDraft = signal<ResourceDraftDto | null>(null);

  // 粘贴采集表单
  pasteForm = {
    rawText: '',
    sourceName: '',
    driveType: 'auto'
  };

  // 频道新增表单
  newChannelForm = {
    channelId: '',
    name: '',
    driveType: 'auto',
    remark: ''
  };

  // 记录从哪个草稿一键导入，发布成功后自动更新草稿状态为 approved
  currentImportingDraftId: string | null = null;

  loadCrawlerConfigAndStats() {
    this.resService.getCrawlerConfig().subscribe({
      next: (res) => {
        this.crawlerConfig.set(res.config);
        this.crawlerStats.set(res.stats);
      },
      error: () => {}
    });
  }

  loadCrawlerChannels() {
    this.resService.getCrawlerChannels().subscribe({
      next: (res) => {
        this.crawlerChannels.set(res.channels);
      },
      error: () => {}
    });
  }


  loadCrawlerDrafts() {
    this.isLoadingDrafts.set(true);
    this.resService.getCrawlerDrafts({
      page: this.crawlerDraftsPage(),
      page_size: this.crawlerDraftsPageSize(),
      status: this.crawlerDraftsStatus(),
      drive_type: this.crawlerDraftsDrive(),
      search: this.crawlerDraftsSearch()
    }).subscribe({
      next: (res) => {
        this.crawlerDrafts.set(res.items || []);
        this.crawlerDraftsTotal.set(res.total || 0);
        this.isLoadingDrafts.set(false);
        this.selectedDraftIds.set([]);
      },
      error: () => {
        this.isLoadingDrafts.set(false);
      }
    });
  }

  triggerCrawlerSync() {
    this.isSyncingCrawler.set(true);
    this.resService.syncCrawlerNow().subscribe({
      next: (res) => {
        this.isSyncingCrawler.set(false);
        const msg = res.result?.message || '同步完成';
        this.showToast(`✅ ${msg}`, 'success');
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.isSyncingCrawler.set(false);
        this.showToast(`❌ 同步失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  showQuickPasteModal = signal<boolean>(false);

  toggleQuickPasteModal() {
    this.showQuickPasteModal.set(!this.showQuickPasteModal());
  }

  openQuickPasteModal() {
    this.showQuickPasteModal.set(true);
  }

  closeQuickPasteModal() {
    this.showQuickPasteModal.set(false);
  }

  onQuickPasteDraftCreated() {
    this.loadCrawlerDrafts();
    this.loadCrawlerConfigAndStats();
  }

  onQuickPasteDirectPublish(item: ParsedItem) {
    this.switchTab('add');
    this.newResource.title = item.title;
    this.newResource.file_size = item.fileSize || '15.0 MB';

    // 全自动智能推断：学科、学段、年级、教材版本、通俗 SEO 副标题与结构化内容说明
    const meta = this.smartMeta.inferMeta(item.title);
    this.newResource.stage = item.stage || meta.stage;
    this.newResource.grade = meta.grade;
    this.newResource.subject = item.subject || meta.subject;
    this.newResource.edition = meta.edition;
    this.newResource.channel_slug = meta.channel_slug;
    this.newResource.subtitle = meta.selectedSubtitle;
    this.cachedNewSubtitles = meta.subtitles;
    this.newSubtitleIndex = 0;
    if (!this.newResource.description || this.newResource.description.trim() === '') {
      this.newResource.description = meta.description;
    }
    if (meta.has_video) {
      this.newResource.has_video = true;
    }
    this.onStageChange('new');

    if (item.driveType === 'quark') {
      this.newResource.quarkUrl = item.shareUrl;
    } else if (item.driveType === 'baidu') {
      this.newResource.baiduUrl = item.shareUrl;
      this.newResource.baiduCode = item.extractCode || '';
    } else {
      this.newResource.quarkUrl = item.shareUrl;
    }
    this.showToast('✅ 已将智能解析数据填入表单，已生成通俗副标题与使用说明！', 'success');
  }

  openCrawlerPasteModal() {
    this.openQuickPasteModal();
  }

  closeCrawlerPasteModal() {
    this.closeQuickPasteModal();
  }

  onFastPasteKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.submitPasteIngest();
    }
  }

  clearFastPaste() {
    this.pasteForm.rawText = '';
  }

  submitPasteIngest() {
    if (!this.pasteForm.rawText.trim()) {
      this.showToast(this.i18n.lang() === 'zh-CN' ? '请粘贴消息内容' : 'Please paste message content', 'error');
      return;
    }
    this.isPastingCrawler.set(true);
    this.resService.ingestCrawlerText({
      raw_text: this.pasteForm.rawText,
      source_name: this.pasteForm.sourceName,
      drive_type: this.pasteForm.driveType
    }).subscribe({
      next: (res) => {
        this.isPastingCrawler.set(false);
        this.showToast(res.message || (this.i18n.lang() === 'zh-CN' ? '✅ 成功提取并录入草稿' : '✅ Draft parsed successfully'), 'success');
        this.pasteForm.rawText = '';
        this.showCrawlerPasteModal.set(false);
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.isPastingCrawler.set(false);
        this.showToast(`❌ ${err.error?.error || (this.i18n.lang() === 'zh-CN' ? '解析失败' : 'Parsing failed')}`, 'error');
      }
    });
  }

  openCrawlerSettingsModal(tab: 'ingestion' | 'broadcast' | 'settings' = 'ingestion') {
    this.currentTab.set('crawler');
    this.switchCrawlerSubTab(tab);
  }

  closeCrawlerSettingsModal() {
    this.showCrawlerSettingsModal.set(false);
  }

  saveCrawlerConfig() {
    const cfg = this.crawlerConfig();
    if (!cfg) return;
    this.resService.updateCrawlerConfig(cfg).subscribe({
      next: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 机器人配置已保存' : '✅ Settings saved', 'success');
        this.loadCrawlerConfigAndStats();
      },
      error: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '❌ 保存失败' : '❌ Save failed', 'error');
      }
    });
  }

  addCrawlerChannel() {
    if (!this.newChannelForm.channelId.trim()) {
      this.showToast(this.i18n.lang() === 'zh-CN' ? '请输入频道 ID' : 'Please enter Channel ID', 'error');
      return;
    }
    this.resService.createCrawlerChannel({
      channel_id: this.newChannelForm.channelId.trim(),
      name: this.newChannelForm.name.trim() || `频道 ${this.newChannelForm.channelId}`,
      drive_type: this.newChannelForm.driveType,
      remark: this.newChannelForm.remark
    }).subscribe({
      next: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 监控频道已添加' : '✅ Channel added', 'success');
        this.newChannelForm = { channelId: '', name: '', driveType: 'auto', remark: '' };
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.showToast(`❌ ${err.error?.error || '添加失败'}`, 'error');
      }
    });
  }

  async deleteCrawlerChannel(id: string) {
    const ok = await this.confirmDialog({
      title: this.i18n.lang() === 'zh-CN' ? '移除监控频道' : 'Remove Monitored Channel',
      message: this.i18n.lang() === 'zh-CN' ? '确定要移除该监控频道吗？移除后将不再接收该频道的资源推送。' : 'Are you sure you want to remove this monitored channel?',
      confirmText: this.i18n.lang() === 'zh-CN' ? '确定移除' : 'Remove',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;
    this.resService.deleteCrawlerChannel(id).subscribe({
      next: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 频道已移除' : '✅ Channel removed', 'success');
        this.loadCrawlerConfigAndStats();
      }
    });
  }

  toggleCrawlerChannel(ch: TelegramChannelDto) {
    this.resService.toggleCrawlerChannel(ch.id).subscribe({
      next: (res) => {
        ch.is_active = res.is_active;
        this.showToast(res.message || '✅ 频道状态已更新', 'success');
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.showToast(`❌ 切换失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  toggleCrawlerMasterSwitch() {
    this.resService.toggleCrawlerMasterSwitch().subscribe({
      next: (res) => {
        this.showToast(res.message || '✅ 采集监控总开关状态已更新', 'success');
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.showToast(`❌ 切换失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  registerCrawlerWebhook() {
    this.isRegisteringWebhook.set(true);
    this.resService.registerCrawlerWebhook().subscribe({
      next: (res) => {
        this.isRegisteringWebhook.set(false);
        this.showToast(res.message || '✅ Telegram Webhook 实时触发已成功注册！', 'success');
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.isRegisteringWebhook.set(false);
        this.showToast(`❌ 注册 Webhook 失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  resolveAndAddCrawlerChannel() {
    const input = this.smartChannelInput.trim();
    if (!input) {
      this.showToast(this.i18n.lang() === 'zh-CN' ? '请输入频道用户名、链接或数字ID' : 'Please enter channel link or username', 'error');
      return;
    }
    this.isResolvingChannel.set(true);
    this.resService.resolveCrawlerChannel(input).subscribe({
      next: (res) => {
        const ch = res.channel;
        this.resService.createCrawlerChannel({
          channel_id: ch.channel_id,
          name: ch.name,
          drive_type: ch.drive_type || 'auto',
          remark: ch.remark || ''
        }).subscribe({
          next: () => {
            this.isResolvingChannel.set(false);
            this.showToast(this.i18n.lang() === 'zh-CN' ? `✅ 成功识别并添加频道【${ch.name}】` : `✅ Added channel ${ch.name}`, 'success');
            this.smartChannelInput = '';
            this.loadCrawlerConfigAndStats();
          },
          error: (err) => {
            this.isResolvingChannel.set(false);
            this.showToast(`❌ 添加频道失败: ${err.error?.error || err.message}`, 'error');
          }
        });
      },
      error: (err) => {
        this.isResolvingChannel.set(false);
        this.showToast(`❌ 识别频道失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  sendCrawlerTestBroadcast(targetChannel?: string) {
    this.isTestingBroadcast.set(true);
    this.resService.sendCrawlerTestBroadcast(targetChannel).subscribe({
      next: (res) => {
        this.isTestingBroadcast.set(false);
        this.showToast(res.message || '🎉 测试广播消息已发送成功！', 'success');
      },
      error: (err) => {
        this.isTestingBroadcast.set(false);
        this.showToast(`❌ ${err.error?.error || err.message || '测试广播发送失败'}`, 'error');
      }
    });
  }

  loadBroadcastChannels() {
    this.resService.getBroadcastChannels().subscribe({
      next: (res) => {
        this.broadcastChannels.set(res.channels || []);
      }
    });
  }

  resolveAndAddBroadcastChannel() {
    const input = this.smartBroadcastChannelInput.trim();
    if (!input) {
      this.showToast(this.i18n.lang() === 'zh-CN' ? '请输入我的频道用户名、链接或数字ID' : 'Please enter channel link or username', 'error');
      return;
    }
    this.isResolvingBroadcastChannel.set(true);
    this.resService.resolveBroadcastChannel(input).subscribe({
      next: (res) => {
        this.isResolvingBroadcastChannel.set(false);
        this.showToast(this.i18n.lang() === 'zh-CN' ? `✅ 成功识别并添加广播频道【${res.channel.name}】` : `✅ Added broadcast channel ${res.channel.name}`, 'success');
        this.smartBroadcastChannelInput = '';
        this.loadBroadcastChannels();
      },
      error: (err) => {
        this.isResolvingBroadcastChannel.set(false);
        this.showToast(`❌ 添加广播频道失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  toggleBroadcastChannel(ch: TelegramBroadcastChannelDto) {
    this.resService.toggleBroadcastChannel(ch.id).subscribe({
      next: (res) => {
        ch.is_active = res.is_active;
        this.showToast(res.message || '✅ 广播状态已更新', 'success');
        this.loadBroadcastChannels();
      },
      error: (err) => {
        this.showToast(`❌ 切换失败: ${err.error?.error || err.message}`, 'error');
      }
    });
  }

  async deleteBroadcastChannel(id: string) {
    const ok = await this.confirmDialog({
      title: this.i18n.lang() === 'zh-CN' ? '移除广播频道' : 'Remove Broadcast Channel',
      message: this.i18n.lang() === 'zh-CN' ? '确定要从广播列表中移除该频道吗？移除后将不再向该频道发布资料。' : 'Are you sure you want to remove this broadcast channel?',
      confirmText: this.i18n.lang() === 'zh-CN' ? '确定移除' : 'Remove',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;
    this.resService.deleteBroadcastChannel(id).subscribe({
      next: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 广播频道已移除' : '✅ Channel removed', 'success');
        this.loadBroadcastChannels();
      }
    });
  }

  broadcastResourceToTelegram(res: ResourceItemDto) {
    if (!res.id) return;
    this.showToast(this.i18n.lang() === 'zh-CN' ? `📢 正在广播推送「${res.title}」至 Telegram 频道...` : `Broadcasting to Telegram...`);
    this.resService.broadcastResourceToTelegram(res.id).subscribe({
      next: (resp) => {
        this.showToast(resp.message || this.i18n.t('crawler.broadcastSuccess'), 'success');
      },
      error: (err) => {
        this.showToast(`❌ ${err.error?.error || err.message || '广播推送失败'}`, 'error');
      }
    });
  }

  async removeCrawlerWebhook() {
    this.registerCrawlerWebhook();
  }

  updateDraftStatus(draft: ResourceDraftDto, status: 'pending' | 'approved' | 'ignored') {
    this.resService.updateCrawlerDraftStatus(draft.id, status).subscribe({
      next: () => {
        draft.status = status;
        this.loadCrawlerConfigAndStats();
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 状态已更新' : '✅ Status updated', 'success');
      }
    });
  }

  async deleteDraft(draft: ResourceDraftDto) {
    const ok = await this.confirmDialog({
      title: this.i18n.lang() === 'zh-CN' ? '删除采集草稿' : 'Delete Draft',
      message: this.i18n.lang() === 'zh-CN' ? `确定要删除草稿【${draft.title}】吗？` : 'Are you sure you want to delete this draft?',
      confirmText: this.i18n.lang() === 'zh-CN' ? '确定删除' : 'Delete',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;
    this.resService.deleteCrawlerDraft(draft.id).subscribe({
      next: () => {
        this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 草稿已删除' : '✅ Draft deleted', 'success');
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      }
    });
  }

  batchIgnoreDrafts() {
    const ids = this.selectedDraftIds();
    if (ids.length === 0) return;
    this.resService.batchCrawlerDraftsAction('ignore', ids).subscribe({
      next: (res) => {
        this.showToast(res.message || '✅ 已批量忽略', 'success');
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      }
    });
  }

  async batchDeleteDrafts() {
    const ids = this.selectedDraftIds();
    if (ids.length === 0) return;
    const ok = await this.confirmDialog({
      title: this.i18n.lang() === 'zh-CN' ? '批量删除草稿' : 'Batch Delete',
      message: this.i18n.lang() === 'zh-CN' ? `确定要批量删除选中的 ${ids.length} 条草稿吗？此操作无法撤销。` : `Are you sure you want to delete ${ids.length} selected drafts?`,
      confirmText: this.i18n.lang() === 'zh-CN' ? '彻底删除' : 'Delete All',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;
    this.resService.batchCrawlerDraftsAction('delete', ids).subscribe({
      next: (res) => {
        this.showToast(res.message || '✅ 已批量删除', 'success');
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      }
    });
  }

  toggleSelectAllDrafts(event: any) {
    if (event.target.checked) {
      this.selectedDraftIds.set(this.crawlerDrafts().map(d => d.id));
    } else {
      this.selectedDraftIds.set([]);
    }
  }

  toggleDraftSelect(id: string) {
    const current = [...this.selectedDraftIds()];
    const idx = current.indexOf(id);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(id);
    }
    this.selectedDraftIds.set(current);
  }

  isDraftSelected(id: string): boolean {
    return this.selectedDraftIds().includes(id);
  }

  openDraftRawModal(draft: ResourceDraftDto) {
    this.currentRawDraft.set(draft);
    this.showCrawlerRawModal.set(true);
  }

  closeDraftRawModal() {
    this.showCrawlerRawModal.set(false);
  }

  importDraftToResource(draft: ResourceDraftDto) {
    this.currentImportingDraftId = draft.id;
    this.switchTab('add');
    this.newResource.title = draft.title;
    this.newResource.file_size = draft.file_size && draft.file_size !== '未知' ? draft.file_size : '15.0 MB';
    
    // 全自动智能推断：学科、学段、年级、教材版本、通俗 SEO 副标题与结构化内容介绍
    const meta = this.smartMeta.inferMeta(draft.title);
    this.newResource.stage = meta.stage;
    this.newResource.grade = meta.grade;
    this.newResource.subject = meta.subject;
    this.newResource.edition = meta.edition;
    this.newResource.channel_slug = meta.channel_slug;
    this.newResource.subtitle = meta.selectedSubtitle;
    this.cachedNewSubtitles = meta.subtitles;
    this.newSubtitleIndex = 0;
    if (!this.newResource.description || this.newResource.description.trim() === '') {
      this.newResource.description = meta.description;
    }
    if (meta.has_video) {
      this.newResource.has_video = true;
    }
    this.onStageChange('new');

    if (draft.drive_type === 'quark') {
      this.newResource.quarkUrl = draft.share_url;
    } else if (draft.drive_type === 'baidu') {
      this.newResource.baiduUrl = draft.share_url;
      this.newResource.baiduCode = draft.extract_code || '';
    } else {
      this.newResource.quarkUrl = draft.share_url;
    }

    this.showToast(this.i18n.lang() === 'zh-CN' ? '✅ 已将草稿填入表单，已智能匹配学科并生成通俗副标题与说明！' : 'Draft imported with smart meta generated!', 'success');
  }

  // ⚡ 1. 本地智能推导（纯本地规则，0 延迟、0 费用、100% 离线稳定，排在前面）
  runLocalInference(mode: 'new' | 'edit') {
    const target = mode === 'new' ? this.newResource : this.editForm;
    const title = target.title.trim();
    if (!title) {
      this.showToast(this.i18n.t('smart.titleRequired'), 'error');
      return;
    }

    const meta = this.smartMeta.inferMeta(title);
    target.stage = meta.stage;
    target.grade = meta.grade;
    target.subject = meta.subject;
    target.edition = meta.edition;
    target.channel_slug = meta.channel_slug;
    target.subtitle = meta.selectedSubtitle;
    target.description = meta.description;
    if (meta.has_video) {
      target.has_video = true;
    }

    if (mode === 'new') {
      this.cachedNewSubtitles = meta.subtitles;
      this.newSubtitleIndex = 0;
      this.onStageChange('new');
    } else {
      this.cachedEditSubtitles = meta.subtitles;
      this.editSubtitleIndex = 0;
      this.onStageChange('edit');
    }

    if (meta.polished_title && meta.polished_title.trim() && meta.polished_title.trim() !== title) {
      if (mode === 'new') {
        this.suggestedTitleNew.set(meta.polished_title.trim());
      } else {
        this.suggestedTitleEdit.set(meta.polished_title.trim());
      }
    }

    const msg = `⚡ 已使用【本地规则引擎】极速推导完成：${meta.subject}（无需配置 API，0延迟）`;
    this.showToast(msg, 'success');
  }

  // ✨ 2. AI 云端大模型深度生成（明确调用 Google Gemini / DeepSeek，不暗中偷换，排在后面）
  runAiGeneration(mode: 'new' | 'edit') {
    const target = mode === 'new' ? this.newResource : this.editForm;
    const title = target.title.trim();
    if (!title) {
      this.showToast(this.i18n.t('smart.titleRequired'), 'error');
      return;
    }

    const cfg = this.smartMeta.getAiConfig();
    if (cfg.provider === 'local') {
      this.showToast('ℹ️ 当前处于本地模式。如需使用大模型，请点击【⚙️ AI 模型配置】切换为 Gemini 或 DeepSeek！', 'error');
      this.openAiSettings();
      return;
    }

    const key = cfg.provider === 'gemini' ? cfg.geminiApiKey : (cfg.provider === 'deepseek' ? cfg.deepseekApiKey : cfg.customApiKey);
    if (!key || !key.trim()) {
      const pName = cfg.provider === 'gemini' ? 'Google Gemini' : (cfg.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI');
      this.showToast(`⚠️ 请先在【⚙️ AI 模型配置】中填写您的 ${pName} API Key！`, 'error');
      this.openAiSettings();
      return;
    }

    this.isAiGenerating.set(true);
    this.smartMeta.generateWithAi(title).subscribe({
      next: (result) => {
        this.isAiGenerating.set(false);
        const meta = result.meta;
        target.stage = meta.stage;
        target.grade = meta.grade;
        target.subject = meta.subject;
        target.edition = meta.edition;
        target.channel_slug = meta.channel_slug;
        target.subtitle = meta.selectedSubtitle;
        target.description = meta.description;
        if (meta.has_video) {
          target.has_video = true;
        }

        if (mode === 'new') {
          this.cachedNewSubtitles = meta.subtitles;
          this.newSubtitleIndex = 0;
          this.onStageChange('new');
        } else {
          this.cachedEditSubtitles = meta.subtitles;
          this.editSubtitleIndex = 0;
          this.onStageChange('edit');
        }

        if (meta.polished_title && meta.polished_title.trim() && meta.polished_title.trim() !== title) {
          if (mode === 'new') {
            this.suggestedTitleNew.set(meta.polished_title.trim());
          } else {
            this.suggestedTitleEdit.set(meta.polished_title.trim());
          }
        }

        const msg = `✨ [${result.providerUsed}] 深度分析完成！已生成 4 套高转化副标题与备考指南！`;
        this.showToast(msg, 'success');
      },
      error: (err) => {
        this.isAiGenerating.set(false);
        const errDetail = err.error?.error || err.message || '网络连接超时';
        this.showToast(`❌ AI 生成失败: ${errDetail}。您可点击前面的【⚡ 本地智能推导】极速录入！`, 'error');
      }
    });
  }

  adoptSuggestedTitle(mode: 'new' | 'edit') {
    if (mode === 'new') {
      const s = this.suggestedTitleNew();
      if (s) {
        this.newResource.title = s;
        this.suggestedTitleNew.set('');
        this.showToast('✓ ' + this.i18n.t('smart.titleAdopted'), 'success');
      }
    } else {
      const s = this.suggestedTitleEdit();
      if (s) {
        this.editForm.title = s;
        this.suggestedTitleEdit.set('');
        this.showToast('✓ ' + this.i18n.t('smart.titleAdopted'), 'success');
      }
    }
  }

  dismissSuggestedTitle(mode: 'new' | 'edit') {
    if (mode === 'new') {
      this.suggestedTitleNew.set('');
    } else {
      this.suggestedTitleEdit.set('');
    }
  }

  // 兼容别名
  autoInferAndGenerate(mode: 'new' | 'edit') {
    this.runAiGeneration(mode);
  }

  openAiSettings() {
    this.aiConfigState = this.smartMeta.getAiConfig();
    this.showAiSettingsModal.set(true);
  }

  closeAiSettings() {
    this.showAiSettingsModal.set(false);
  }

  saveAiSettings() {
    this.smartMeta.saveAiConfig(this.aiConfigState);
    this.aiConfigVersion.update(v => v + 1);
    this.showToast('✅ AI 大模型配置已成功保存！', 'success');
    this.closeAiSettings();
  }

  testAiConnection() {
    const cfg = this.aiConfigState;
    if (cfg.provider === 'local') {
      this.showToast('ℹ️ 当前选择的是本地极速规则引擎，无需联网测试，0秒即时可用！', 'success');
      return;
    }
    const key = cfg.provider === 'gemini' ? cfg.geminiApiKey : (cfg.provider === 'deepseek' ? cfg.deepseekApiKey : cfg.customApiKey);
    if (!key || !key.trim()) {
      this.showToast('⚠️ 请先填写对应大模型的 API Key 再进行测试', 'error');
      return;
    }

    this.isTestingAiConnection.set(true);
    const model = cfg.provider === 'gemini' ? cfg.geminiModel : (cfg.provider === 'deepseek' ? cfg.deepseekModel : cfg.customModel);
    const baseUrl = cfg.provider === 'custom' ? cfg.customBaseUrl : undefined;

    this.smartMeta.testConnection({
      provider: cfg.provider,
      api_key: key.trim(),
      model,
      base_url: baseUrl
    }).subscribe({
      next: (res) => {
        this.isTestingAiConnection.set(false);
        this.showToast(res.message || '✅ 连通性测试通过！API Key 有效且模型响应正常！', 'success');
      },
      error: (err) => {
        this.isTestingAiConnection.set(false);
        const errMsg = err.error?.error || err.message || '网络连接超时或服务未就绪';
        this.showToast('❌ 连通性测试失败: ' + errMsg, 'error');
      }
    });
  }

  // 🎲 3. 轮换切换通俗高转化副标题（明确告知用户当前是第几套文案）
  cycleSubtitle(mode: 'new' | 'edit') {
    const target = mode === 'new' ? this.newResource : this.editForm;
    const title = target.title.trim();
    if (!title) {
      this.showToast(this.i18n.t('smart.titleRequired'), 'error');
      return;
    }

    let subs = mode === 'new' ? this.cachedNewSubtitles : this.cachedEditSubtitles;
    if (!subs || subs.length === 0) {
      const meta = this.smartMeta.inferMeta(title);
      subs = meta.subtitles;
      if (mode === 'new') this.cachedNewSubtitles = subs;
      else this.cachedEditSubtitles = subs;
    }

    let idx = mode === 'new' ? this.newSubtitleIndex : this.editSubtitleIndex;
    idx = (idx + 1) % subs.length;
    if (mode === 'new') this.newSubtitleIndex = idx;
    else this.editSubtitleIndex = idx;

    target.subtitle = subs[idx];
    const msg = `🎲 已切换为第 ${idx + 1}/${subs.length} 套副标题: "${subs[idx]}"`;
    this.showToast(msg, 'success');
  }

  // 新增表单数据绑定（支持智能联动、精细与通用）
  newResource = {
    channel_slug: 'edu',
    title: '',
    subtitle: '',
    stage: 'primary',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    region: (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : null) || '广西-柳州',
    school: '',
    file_type: 'PDF',
    file_size: '15.0 MB',
    page_count: 24,
    view_count: 0,
    save_count: 0,
    has_video: false,
    quarkUrl: '',
    quarkFileSize: '15.0 MB',
    quarkFileType: 'PDF',
    quarkDesc: '',
    baiduUrl: '',
    baiduCode: '',
    baiduFileSize: '15.0 MB',
    baiduFileType: 'PDF',
    baiduDesc: '',
    description: '',
    file_tree: [] as any[]
  };

  // 编辑表单数据绑定
  isEditModalOpen = signal<boolean>(false);
  editForm = {
    id: '',
    channel_slug: 'edu',
    title: '',
    subtitle: '',
    stage: 'primary',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    region: '',
    school: '',
    file_type: 'PDF',
    file_size: '15.0 MB',
    page_count: 24,
    view_count: 0,
    save_count: 0,
    has_video: false,
    is_published: true,
    quarkUrl: '',
    quarkFileSize: '15.0 MB',
    quarkFileType: 'PDF',
    quarkDesc: '',
    baiduUrl: '',
    baiduCode: '',
    baiduFileSize: '15.0 MB',
    baiduFileType: 'PDF',
    baiduDesc: '',
    description: '',
    file_tree: [] as any[]
  };

  // 标准化学段键值（完全兼容历史中文与规范英文字符）
  normalizeStageKey(stage: string): string {
    if (!stage) return 'primary';
    if (this.stageOptions[stage]) return stage;
    if (stage === '小学阶段' || stage === '小学' || stage === '小学专区') return 'primary';
    if (stage === '初中冲刺' || stage === '初中' || stage === '初中专区') return 'junior';
    if (stage === '高中专区' || stage === '高中') return 'senior';
    if (stage === '成人考证' || stage === '教师资格证' || stage === '教资') return 'cert';
    if (stage === '考公考研' || stage === '考公' || stage === '考研') return 'exam';
    return stage;
  }

  // 获取当前选中学段的可选项配置
  getStageConfig(stage: string): StageConfigItem {
    const key = this.normalizeStageKey(stage);
    return this.stageOptions[key] || this.stageOptions['primary'];
  }

  // 获取学段中文简洁标签（用于后台表格展示）
  getStageLabel(stage: string): string {
    const key = this.normalizeStageKey(stage);
    const item = this.stageOptions[key];
    return item ? item.label.split(' ')[0] : (stage || '全阶段');
  }

  // 学段切换时自动联动推荐默认项
  onStageChange(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const config = this.getStageConfig(form.stage);
    form.grade = config.grades[0]; // 默认选中通用或第一个
    form.subject = config.subjects[1] || config.subjects[0];
    form.edition = config.editions[1] || config.editions[0];
  }

  // ⚡ 智能调用 API 解析网盘真实文件大小与属性
  parsingNetdisk = signal<boolean>(false);
  parsingBaidu = signal<boolean>(false);

  // 🎨 浏览器端 HTML5 Canvas 自动生成封面预览状态
  newCoverPreview = signal<string>('');
  editCoverPreview = signal<string>('');

  async generatePreview(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    if (!form.title && !form.quarkUrl) return;
    try {
      const dataUrl = await this.coverGen.generateCoverDataUrl({
        title: form.title || '精选学习资料合集',
        grade: form.grade,
        subject: form.subject,
        edition: form.edition,
        file_size: form.quarkFileSize || form.file_size,
        file_tree: (form as any).file_tree || []
      });
      if (target === 'new') {
        this.newCoverPreview.set(dataUrl);
      } else {
        this.editCoverPreview.set(dataUrl);
      }
    } catch (e) {
      console.warn('Canvas cover generation error:', e);
    }
  }

  autoDetectNetdiskInfo(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const url = form.quarkUrl?.trim();
    if (!url) return;

    this.parsingNetdisk.set(true);
    this.resService.parseNetdisk(url, 'quark').subscribe({
      next: (info) => {
        this.parsingNetdisk.set(false);
        if (info && info.success) {
          if (info.file_size && info.file_size !== '0 B') {
            form.quarkFileSize = info.file_size;
            form.file_size = info.file_size;
          } else if (!form.quarkFileSize || form.quarkFileSize === '0 B') {
            form.quarkFileSize = '完整视频合集包';
            form.file_size = '完整视频合集包';
          }
          if (info.has_video) {
            form.has_video = true;
          }
          if (info.file_type) {
            form.file_type = info.file_type;
            form.quarkFileType = info.file_type;
          }
          if (info.resource_desc) {
            form.quarkDesc = info.resource_desc;
          }
          if (!form.title && info.file_name) {
            form.title = info.file_name.replace(/\.[^/.]+$/, "");
          }
          if (info.file_list && info.file_list.length > 0) {
            (form as any).file_tree = info.file_list;
          } else {
            (form as any).file_tree = [];
          }
          const timeTip = info.file_time ? ` · ${info.file_time}` : '';
          const countTip = (info.file_count || info.file_list?.length) ? ` · 内含 ${info.file_count || info.file_list?.length} 个真实文件` : '';
          this.showToast(`⚡ 夸克网盘解析成功: ${info.file_size || ''} (${info.file_type || 'PDF'}${timeTip}${countTip})`);
          this.generatePreview(target);
        } else {
          (form as any).file_tree = [];
          this.showToast(info?.message || '夸克网盘解析失败，未能读取到文件', 'error');
        }
      },
      error: (err) => {
        this.parsingNetdisk.set(false);
        this.showToast('请求网盘解析服务超时或网络繁忙，请重试', 'error');
      }
    });
  }

  // ⚡ 智能读取百度网盘文件大小、格式与更新时间
  autoDetectBaiduInfo(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const url = form.baiduUrl?.trim();
    const code = form.baiduCode?.trim();
    if (!url) {
      this.showToast('请先输入百度网盘链接', 'error');
      return;
    }

    this.parsingBaidu.set(true);
    this.resService.parseNetdisk(url, 'baidu', code).subscribe({
      next: (info) => {
        this.parsingBaidu.set(false);
        if (info && info.success) {
          if (info.file_size) {
            form.baiduFileSize = info.file_size;
            if (!form.quarkFileSize || form.quarkFileSize === '15.0 MB') {
              form.file_size = info.file_size;
            }
          }
          if (info.file_type) {
            form.baiduFileType = info.file_type;
          }
          if (info.resource_desc) {
            form.baiduDesc = info.resource_desc;
          }
          if (!form.title && info.file_name) {
            form.title = info.file_name.replace(/\.[^/.]+$/, "");
          }
          if (info.file_list && info.file_list.length > 0) {
            (form as any).file_tree = info.file_list;
          } else {
            (form as any).file_tree = [];
          }
          const timeTip = info.file_time ? ` · ${info.file_time}` : '';
          const countTip = (info.file_count || info.file_list?.length) ? ` · 内含 ${info.file_count || info.file_list?.length} 个真实文件` : '';
          this.showToast(`⚡ 百度网盘解析成功: ${info.file_size || ''} (${info.file_type || 'PDF'}${timeTip}${countTip})`);
        } else {
          (form as any).file_tree = [];
          this.showToast(info?.message || '百度网盘解析失败，未能提取到文件', 'error');
        }
      },
      error: () => {
        this.parsingBaidu.set(false);
        this.showToast('解析百度网盘超时或网络繁忙，请重试', 'error');
      }
    });
  }

  // 📂 网盘目录树层级展开与格式图标辅助函数
  toggleFolder(folder: any) {
    folder.collapsed = !folder.collapsed;
  }

  getFileCount(list: any[]): number {
    if (!list || !Array.isArray(list)) return 0;
    let count = 0;
    for (const item of list) {
      if (item.is_dir && item.children && item.children.length > 0) {
        count += item.children.length;
      } else {
        count++;
      }
    }
    return count;
  }

  getFileIcon(ext: string, isDir?: boolean): string {
    if (isDir) return '📁';
    const e = (ext || '').toUpperCase();
    if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV'].includes(e)) return '🎬';
    if (['PDF'].includes(e)) return '📄';
    if (['DOC', 'DOCX'].includes(e)) return '📝';
    if (['PPT', 'PPTX'].includes(e)) return '📑';
    if (['XLS', 'XLSX'].includes(e)) return '📊';
    if (['ZIP', 'RAR', '7Z', 'TAR'].includes(e)) return '📦';
    if (['MP3', 'WAV', 'FLAC', 'AAC'].includes(e)) return '🎵';
    if (['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(e)) return '🖼️';
    return '📄';
  }

  getNormalizedTree(list: any[]): any[] {
    if (!list || !Array.isArray(list)) return [];
    if (list.some(it => it.children && it.children.length > 0)) {
      return list;
    }
    const hasSlash = list.some(it => it.name && it.name.includes('/'));
    if (!hasSlash) return list;

    const folderMap = new Map<string, any>();
    const rootItems: any[] = [];

    for (const item of list) {
      if (item.name && item.name.includes('/')) {
        const parts = item.name.split('/');
        const folderName = parts[0];
        const fileName = parts.slice(1).join('/');
        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, {
            name: folderName,
            is_dir: true,
            ext: 'DIR',
            size: '',
            children: []
          });
        }
        folderMap.get(folderName).children.push({
          ...item,
          name: fileName
        });
      } else {
        rootItems.push(item);
      }
    }

    const result = [...rootItems];
    for (const folder of folderMap.values()) {
      folder.size = `${folder.children.length} 个文件`;
      result.push(folder);
    }
    return result;
  }

  // 🔄 自动洗链：一键将对方夸克链接转存到我的网盘并生成专属推广链接
  transferringQuark = signal<boolean>(false);

  autoTransferQuark(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const url = form.quarkUrl?.trim();
    if (!url) {
      this.showToast('请先输入需要转存的夸克分享链接', 'error');
      return;
    }

    this.transferringQuark.set(true);
    this.showToast('🔄 正在连接夸克云端转存并生成专属新链接，请稍候...');

    this.resService.autoTransferAndShare({ share_url: url }).subscribe({
      next: (result) => {
        this.transferringQuark.set(false);
        if (result && result.new_share_url) {
          form.quarkUrl = result.new_share_url;
          if (result.file_size) {
            form.quarkFileSize = result.file_size;
            form.file_size = result.file_size;
          }
          if (result.file_type) {
            form.quarkFileType = result.file_type;
            form.file_type = result.file_type;
          }
          if (result.file_type?.includes('视频')) {
            form.has_video = true;
          }
          if (result.resource_desc) {
            form.quarkDesc = result.resource_desc;
          }
          if (!form.title && result.share_title) {
            form.title = result.share_title.replace(/\.[^/.]+$/, "");
          }
          this.showToast(`🎉 成功洗链！已转存到您的夸克网盘并生成专属链接：${result.new_share_url}`);
        }
      },
      error: (err) => {
        this.transferringQuark.set(false);
        const errMsg = err.error?.message || err.message || '转存失败';
        this.showToast(`转存失败：${errMsg}（可在“网盘账号配置”中更新 Cookie）`, 'error');
      }
    });
  }

  // --- 网盘账号管理与自动转存换链配置 ---
  accounts = signal<NetdiskAccountDto[]>([]);
  accountLoading = signal<boolean>(false);
  testingTransfer = signal<boolean>(false);

  accountForm = {
    id: '',
    drive_type: 'quark',
    account_name: '站长夸克主账号',
    cookie: '',
    target_folder_fid: '0',
    target_folder_name: '/',
    is_default: true
  };

  testTransfer = {
    account_id: '',
    share_url: '',
    passcode: '',
    result: null as TransferShareResultDto | null
  };

  isFolderPickerOpen = signal<boolean>(false);
  folderPickerAccountId = signal<string>('');
  folderPickerList = signal<{ fid: string; file_name: string; dir: boolean }[]>([]);
  folderPickerLoading = signal<boolean>(false);
  newFolderName = signal<string>('');
  creatingFolder = signal<boolean>(false);
  currentPdirFid = signal<string>('0');
  currentFolderName = signal<string>('根目录');
  folderBreadcrumbs = signal<{ fid: string; name: string }[]>([{ fid: '0', name: '根目录' }]);

  // 夸克网盘文件浏览器（从默认账号直接选取文件/目录生成免密公开分享）
  isDrivePickerOpen = signal<boolean>(false);
  drivePickerMode = signal<'new' | 'edit'>('new');
  drivePickerAccountName = signal<string>('');
  drivePickerList = signal<any[]>([]);
  drivePickerLoading = signal<boolean>(false);
  drivePickerCurrentFid = signal<string>('0');
  drivePickerCurrentName = signal<string>('根目录');
  drivePickerBreadcrumbs = signal<{ fid: string; name: string }[]>([{ fid: '0', name: '根目录' }]);
  drivePickerSharingFid = signal<string | null>(null);

  loadAccounts() {
    this.accountLoading.set(true);
    this.resService.listAccounts().subscribe({
      next: (accs) => {
        this.accounts.set(accs);
        this.accountLoading.set(false);
      },
      error: () => {
        this.accountLoading.set(false);
      }
    });
  }

  saveAccountConfig() {
    if (!this.accountForm.cookie && !this.accountForm.id) {
      this.showToast('请粘贴网页端获取的 Cookie 凭据', 'error');
      return;
    }
    this.accountLoading.set(true);
    const payload: Partial<NetdiskAccountDto> = {
      drive_type: this.accountForm.drive_type,
      account_name: this.accountForm.account_name,
      cookie: this.accountForm.cookie,
      target_folder_fid: this.accountForm.target_folder_fid,
      target_folder_name: this.accountForm.target_folder_name,
      is_default: this.accountForm.is_default
    };
    if (this.accountForm.id) {
      payload.id = this.accountForm.id;
    }

    this.resService.saveAccount(payload).subscribe({
      next: (saved) => {
        this.accountLoading.set(false);
        this.loadAccounts();
        this.resetAccountForm();
        if (saved.status === 'valid') {
          this.showToast(`✅ 账号【${saved.account_name}】连通验证成功！容量: ${saved.total_capacity}`);
        } else {
          this.showToast(`⚠️ 账号已保存，但验证提示: ${saved.error_message}`, 'error');
        }
      },
      error: (err) => {
        this.accountLoading.set(false);
        this.showToast('保存失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  editAccount(acc: NetdiskAccountDto, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.accountForm = {
      id: acc.id || '',
      drive_type: acc.drive_type || 'quark',
      account_name: acc.account_name,
      cookie: '',
      target_folder_fid: acc.target_folder_fid || '0',
      target_folder_name: this.formatFolderPath(acc.target_folder_name),
      is_default: acc.is_default || false
    };
    this.showToast(`已加载账号【${acc.account_name}】配置，可在左侧表单修改`);
    const el = document.getElementById('account-config-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  setDefaultAccount(acc: NetdiskAccountDto, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!acc.id) return;
    if (acc.is_default) {
      this.showToast(`账号【${acc.account_name}】已经是当前激活的默认账号`);
      return;
    }

    this.resService.setDefaultAccount(acc.id).subscribe({
      next: () => {
        this.accounts.update(list => list.map(item => ({
          ...item,
          is_default: item.id === acc.id
        })));
        this.showToast(`⭐ 已成功将【${acc.account_name}】激活为当前默认网盘账号！`);
      },
      error: (err) => {
        this.showToast('切换激活账号失败: ' + err.message, 'error');
      }
    });
  }

  startAddNewAccount() {
    this.resetAccountForm();
    this.showToast('已切换至新建网盘账号模式，请在左侧表单填写配置');
    const el = document.getElementById('account-config-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  resetAccountForm() {
    this.accountForm = {
      id: '',
      drive_type: 'quark',
      account_name: '站长夸克主账号',
      cookie: '',
      target_folder_fid: '0',
      target_folder_name: '/',
      is_default: this.accounts().length === 0
    };
  }

  async deleteAccount(id: string) {
    const ok = await this.confirmDialog({
      title: '删除网盘账号',
      message: '确认删除该网盘账号配置吗？删除后将无法使用该账号执行自动转存。',
      confirmText: '确定删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.resService.deleteAccount(id).subscribe({
      next: () => {
        this.showToast('🗑️ 账号已删除');
        this.loadAccounts();
      },
      error: (err) => this.showToast('删除失败: ' + err.message, 'error')
    });
  }

  verifyAccount(acc: NetdiskAccountDto) {
    if (!acc.id) return;
    this.showToast(`🔍 正在验证【${acc.account_name}】连接状态并刷新容量...`);
    this.resService.verifyAccount(acc.id).subscribe({
      next: (res) => {
        this.loadAccounts();
        if (res.status === 'valid') {
          this.showToast(`✅ 验证通过！昵称: ${res.nickname}，总容量: ${res.total_capacity}，剩余: ${res.free_capacity}`);
        } else {
          this.showToast(`❌ 验证失败: ${res.error_message}`, 'error');
        }
      },
      error: (err) => this.showToast('验证请求失败: ' + err.message, 'error')
    });
  }

  openFolderPicker(acc: NetdiskAccountDto) {
    if (!acc.id) return;
    this.folderPickerAccountId.set(acc.id);
    this.isFolderPickerOpen.set(true);
    this.currentPdirFid.set('0');
    this.currentFolderName.set('根目录');
    this.folderBreadcrumbs.set([{ fid: '0', name: '根目录' }]);
    this.newFolderName.set('');
    this.fetchFolderList(acc.id, '0');
  }

  openFolderPickerById(accountId?: string) {
    if (!accountId) return;
    const acc = this.accounts().find(a => a.id === accountId);
    if (acc) {
      this.openFolderPicker(acc);
    }
  }

  fetchFolderList(accId: string, pdirFid: string) {
    this.folderPickerLoading.set(true);
    this.resService.listAccountFolders(accId, pdirFid).subscribe({
      next: (folders) => {
        this.folderPickerList.set(folders);
        this.folderPickerLoading.set(false);
      },
      error: (err) => {
        this.folderPickerLoading.set(false);
        this.showToast('获取网盘目录失败: ' + err.message, 'error');
      }
    });
  }

  enterFolder(folder: { fid: string; file_name: string }) {
    const accId = this.folderPickerAccountId();
    if (!accId) return;
    this.currentPdirFid.set(folder.fid);
    this.currentFolderName.set(folder.file_name);
    this.folderBreadcrumbs.update(crumbs => [...crumbs, { fid: folder.fid, name: folder.file_name }]);
    this.fetchFolderList(accId, folder.fid);
  }

  navigateBreadcrumb(index: number) {
    const crumbs = this.folderBreadcrumbs();
    if (index >= crumbs.length) return;
    const target = crumbs[index];
    const accId = this.folderPickerAccountId();
    if (!accId) return;
    this.currentPdirFid.set(target.fid);
    this.currentFolderName.set(target.name);
    this.folderBreadcrumbs.set(crumbs.slice(0, index + 1));
    this.fetchFolderList(accId, target.fid);
  }

  getCurrentFullPath(): string {
    const crumbs = this.folderBreadcrumbs();
    if (crumbs.length <= 1) {
      return '/';
    }
    return '/' + crumbs.slice(1).map(c => c.name).join('/');
  }

  getFullPathForChild(childName: string): string {
    const parentPath = this.getCurrentFullPath();
    if (parentPath === '/') {
      return '/' + childName;
    }
    return parentPath + '/' + childName;
  }

  formatFolderPath(path?: string): string {
    if (!path || path === '/' || path === '0') return '/';
    return path.startsWith('/') ? path : '/' + path;
  }

  createFolderInPicker() {
    const name = this.newFolderName().trim();
    const accId = this.folderPickerAccountId();
    if (!name) {
      this.showToast('请输入新文件夹名称', 'error');
      return;
    }
    if (!accId) return;

    this.creatingFolder.set(true);
    const targetPdirFid = this.currentPdirFid();
    this.resService.createAccountFolder(accId, name, targetPdirFid).subscribe({
      next: (res) => {
        this.creatingFolder.set(false);
        this.newFolderName.set('');
        this.showToast(`✅ 文件夹【${name}】创建成功！`);

        // 1. 立即乐观插入到当前目录视图中，0秒看到新目录
        if (res && res.fid) {
          const newItem = { fid: res.fid, file_name: res.file_name || name, dir: true };
          this.folderPickerList.update(list => {
            if (!list.some(item => item.fid === res.fid)) {
              return [newItem, ...list];
            }
            return list;
          });
        }

        // 2. 延迟 350ms 重新拉取一次，保证与云端网盘底层数据绝对一致
        setTimeout(() => {
          this.fetchFolderList(accId, targetPdirFid);
        }, 350);
      },
      error: (err) => {
        this.creatingFolder.set(false);
        const errMsg = err.error?.message || err.message || '创建文件夹失败';
        this.showToast('创建失败: ' + errMsg, 'error');
      }
    });
  }

  async deleteFolderInPicker(folder: { fid: string; file_name: string }, event: Event) {
    event.stopPropagation();
    const accId = this.folderPickerAccountId();
    if (!accId) return;

    const ok = await this.confirmDialog({
      title: '删除网盘文件夹',
      message: `确定要在网盘中彻底删除文件夹【${folder.file_name}】吗？\n请注意：此操作将在夸克网盘中移除该目录！`,
      confirmText: '确定删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.showToast(`正在从网盘删除【${folder.file_name}】...`);
    const currentFid = this.currentPdirFid();
    this.resService.deleteAccountFolder(accId, folder.fid).subscribe({
      next: () => {
        this.showToast(`🗑️ 文件夹【${folder.file_name}】已成功删除`);
        // 立即从当前视图移除
        this.folderPickerList.update(list => list.filter(item => item.fid !== folder.fid));
        setTimeout(() => {
          this.fetchFolderList(accId, currentFid);
        }, 350);
      },
      error: (err) => {
        const errMsg = err.error?.message || err.message || '删除失败';
        this.showToast('删除失败: ' + errMsg, 'error');
      }
    });
  }

  selectCurrentAsTarget() {
    const fid = this.currentPdirFid();
    const fullPath = this.getCurrentFullPath();
    this.selectFolder({ fid, file_name: fullPath });
  }

  closeFolderPicker() {
    this.isFolderPickerOpen.set(false);
  }

  selectFolder(folder: { fid: string; file_name: string }) {
    let fullPath = folder.file_name;
    if (!fullPath.startsWith('/')) {
      fullPath = this.getFullPathForChild(folder.file_name);
    }

    this.accountForm.target_folder_fid = folder.fid;
    this.accountForm.target_folder_name = fullPath;
    const accId = this.folderPickerAccountId();

    const acc = this.accounts().find(a => a.id === accId);
    if (acc && (!this.accountForm.id || this.accountForm.id !== acc.id)) {
      this.resService.saveAccount({
        id: acc.id,
        drive_type: acc.drive_type,
        account_name: acc.account_name,
        target_folder_fid: folder.fid,
        target_folder_name: fullPath,
        is_default: acc.is_default
      }).subscribe({
        next: () => {
          this.loadAccounts();
          this.closeFolderPicker();
          this.showToast(`已将【${fullPath}】设为【${acc.account_name}】的转存目标！`);
        },
        error: (err) => {
          this.closeFolderPicker();
          this.showToast('更新转存目录失败: ' + err.message, 'error');
        }
      });
    } else {
      this.closeFolderPicker();
      this.showToast(`已选定转存目录: ${fullPath}`);
    }
  }

  // --- 夸克网盘文件浏览器与一键免密公开分享 ---
  openDrivePicker(mode: 'new' | 'edit' = 'new') {
    this.drivePickerMode.set(mode);
    this.isDrivePickerOpen.set(true);
    this.drivePickerCurrentFid.set('0');
    this.drivePickerCurrentName.set('根目录');
    this.drivePickerBreadcrumbs.set([{ fid: '0', name: '根目录' }]);
    this.fetchDrivePickerFiles('0');
  }

  closeDrivePicker() {
    this.isDrivePickerOpen.set(false);
    this.drivePickerSharingFid.set(null);
  }

  fetchDrivePickerFiles(pdirFid: string = '0') {
    this.drivePickerLoading.set(true);
    this.resService.getDefaultAccountFiles(pdirFid).subscribe({
      next: (res) => {
        this.drivePickerLoading.set(false);
        this.drivePickerList.set(res.items || []);
        if (res.account_name) {
          this.drivePickerAccountName.set(res.nickname ? `${res.account_name} (${res.nickname})` : res.account_name);
        }
      },
      error: (err) => {
        this.drivePickerLoading.set(false);
        const msg = err.error?.message || err.message || '获取默认网盘文件失败';
        this.showToast('获取网盘文件失败: ' + msg, 'error');
      }
    });
  }

  enterDrivePickerFolder(folder: { fid: string; file_name: string }) {
    this.drivePickerCurrentFid.set(folder.fid);
    this.drivePickerCurrentName.set(folder.file_name);
    this.drivePickerBreadcrumbs.update(crumbs => [...crumbs, { fid: folder.fid, name: folder.file_name }]);
    this.fetchDrivePickerFiles(folder.fid);
  }

  navigateDrivePickerBreadcrumb(index: number) {
    const crumbs = this.drivePickerBreadcrumbs();
    if (index >= crumbs.length) return;
    const target = crumbs[index];
    this.drivePickerCurrentFid.set(target.fid);
    this.drivePickerCurrentName.set(target.name);
    this.drivePickerBreadcrumbs.set(crumbs.slice(0, index + 1));
    this.fetchDrivePickerFiles(target.fid);
  }

  createAndApplyShare(item: { fid: string; file_name: string; dir: boolean; format_size?: string }) {
    if (this.drivePickerSharingFid()) return;
    this.drivePickerSharingFid.set(item.fid);
    this.showToast(`⚡ 正在为【${item.file_name}】生成永久免密公开分享链接...`);

    this.resService.createShareFromDefaultAccount(item.fid, item.file_name).subscribe({
      next: (res) => {
        this.drivePickerSharingFid.set(null);
        if (!res || !res.share_url) {
          this.showToast('生成分享链接失败：未返回有效链接', 'error');
          return;
        }

        const mode = this.drivePickerMode();
        if (mode === 'new') {
          this.newResource.quarkUrl = res.share_url;
          if (!this.newResource.title) {
            this.newResource.title = item.file_name;
          }
          if (item.format_size && item.format_size !== '0 B') {
            this.newResource.quarkFileSize = item.format_size;
          }
          if (item.dir) {
            this.newResource.quarkFileType = '合集/文件夹';
          }
        } else {
          this.editForm.quarkUrl = res.share_url;
          if (!this.editForm.title) {
            this.editForm.title = item.file_name;
          }
          if (item.format_size && item.format_size !== '0 B') {
            this.editForm.quarkFileSize = item.format_size;
          }
          if (item.dir) {
            this.editForm.quarkFileType = '合集/文件夹';
          }
        }

        this.showToast(`✅ 成功生成免密公开分享并填入表单！\n${res.share_url}`);
        this.closeDrivePicker();
      },
      error: (err) => {
        this.drivePickerSharingFid.set(null);
        const msg = err.error?.message || err.message || '生成分享失败';
        this.showToast('生成分享失败: ' + msg, 'error');
      }
    });
  }

  shareCurrentDriveFolder() {
    const fid = this.drivePickerCurrentFid();
    const name = this.drivePickerCurrentName();
    if (!fid || fid === '0') {
      this.showToast('网盘顶级根目录不支持直接分享，请进入具体资源文件夹进行分享', 'error');
      return;
    }
    this.createAndApplyShare({ fid, file_name: name, dir: true });
  }

  runTestTransfer() {
    const url = this.testTransfer.share_url?.trim();
    if (!url) {
      this.showToast('请先输入要测试的夸克分享链接', 'error');
      return;
    }
    this.testingTransfer.set(true);
    this.testTransfer.result = null;
    this.showToast('🚀 正在执行转存与换链，请稍候...');

    this.resService.autoTransferAndShare({
      account_id: this.testTransfer.account_id || undefined,
      share_url: url,
      passcode: this.testTransfer.passcode
    }).subscribe({
      next: (result) => {
        this.testingTransfer.set(false);
        this.testTransfer.result = result;
        this.showToast('🎉 测试成功！已生成您的专属分享链接！');
      },
      error: (err) => {
        this.testingTransfer.set(false);
        const errMsg = err.error?.message || err.message || '测试转存失败';
        this.showToast(`转存失败: ${errMsg}`, 'error');
      }
    });
  }

  ngOnInit() {
    this.checkAuth();
  }

  checkAuth() {
    const token = this.resService.getToken();
    const cachedUser = this.resService.getCurrentUser();
    if (token) {
      if (cachedUser) {
        this.currentUser.set(cachedUser);
      }
      this.isLoggedIn.set(true);
      this.initDashboard();
      // 异步校验 Token 是否依旧有效并同步管理员数据
      this.resService.getMe().subscribe({
        next: (user) => {
          this.currentUser.set({
            username: user.username,
            nickname: user.nickname || '超级管理员',
            role: user.role || 'superadmin'
          });
        },
        error: () => {
          this.resService.logout();
          this.isLoggedIn.set(false);
          this.currentUser.set(null);
        }
      });
    } else {
      this.isLoggedIn.set(false);
    }
  }

  loadDashboardStats() {
    this.statsLoading.set(true);
    this.resService.getDashboardStats().subscribe({
      next: (data) => {
        this.dashboardStats.set(data);
        this.statsLoading.set(false);
      },
      error: () => {
        this.statsLoading.set(false);
      }
    });
  }

  initDashboard() {
    this.loadChannels();
    this.loadResources();
    this.loadAccounts();
    this.loadNavMenus();
    this.loadRegions();
    this.loadDashboardStats();
    this.loadCrawlerConfigAndStats();
  }

  onLogin() {
    if (!this.loginForm.username.trim() || !this.loginForm.password) {
      this.loginError.set('请输入管理员账号与密码');
      return;
    }
    this.loginLoading.set(true);
    this.loginError.set('');
    this.resService.login(this.loginForm.username.trim(), this.loginForm.password).subscribe({
      next: (res) => {
        this.loginLoading.set(false);
        this.isLoggedIn.set(true);
        this.currentUser.set({
          username: res.username,
          nickname: res.nickname || '超级管理员',
          role: res.role || 'superadmin'
        });
        this.showToast(`🎉 欢迎回来，${res.nickname || res.username}！`);
        this.loginForm.password = '';
        this.initDashboard();
      },
      error: (err) => {
        this.loginLoading.set(false);
        const msg = err.error?.message || '账号或密码错误，请重新输入';
        this.loginError.set(msg);
      }
    });
  }

  onLogout() {
    this.resService.logout();
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this.showToast('已安全退出管理后台');
  }

  openProfileModal() {
    this.profileError.set('');
    this.profileForm = {
      nickname: this.currentUser()?.nickname || '',
      old_password: '',
      new_password: '',
      confirm_password: ''
    };
    this.showProfileModal.set(true);
  }

  closeProfileModal() {
    this.showProfileModal.set(false);
  }

  onSaveProfile() {
    this.profileError.set('');
    const { nickname, old_password, new_password, confirm_password } = this.profileForm;

    const isChangingPassword = !!(old_password || new_password || confirm_password);

    if (isChangingPassword) {
      if (!old_password) {
        this.profileError.set('请输入当前原密码以完成身份验证');
        return;
      }
      if (!new_password || new_password.length < 6) {
        this.profileError.set('新密码长度不能少于 6 位');
        return;
      }
      if (new_password !== confirm_password) {
        this.profileError.set('两次输入的新密码不一致，请核对');
        return;
      }
    }

    this.profileLoading.set(true);

    const curNick = this.currentUser()?.nickname || '';
    const shouldUpdateNick = nickname.trim() && nickname.trim() !== curNick;

    const doChangePassword = () => {
      if (isChangingPassword) {
        this.resService.changePassword(old_password, new_password).subscribe({
          next: () => {
            this.profileLoading.set(false);
            this.showToast('🎉 密码修改成功！请牢记您的新密码');
            this.closeProfileModal();
          },
          error: (err) => {
            this.profileLoading.set(false);
            const msg = err.error?.message || '修改密码失败，请核对原密码是否正确';
            this.profileError.set(msg);
          }
        });
      } else {
        this.profileLoading.set(false);
        this.showToast('✅ 个人资料保存成功');
        this.closeProfileModal();
      }
    };

    if (shouldUpdateNick) {
      this.resService.updateProfile(nickname.trim()).subscribe({
        next: (user) => {
          this.currentUser.update(curr => curr ? { ...curr, nickname: user.nickname } : null);
          doChangePassword();
        },
        error: (err) => {
          this.profileLoading.set(false);
          const msg = err.error?.message || '更新昵称失败';
          this.profileError.set(msg);
        }
      });
    } else {
      doChangePassword();
    }
  }

  openEdit(item: ResourceItemDto) {
    this.suggestedTitleEdit.set('');
    const quarkLink = item.links?.find(l => l.drive_type === 'quark');
    const baiduLink = item.links?.find(l => l.drive_type === 'baidu');

    this.editForm = {
      id: item.id,
      channel_slug: item.channel_slug || 'edu',
      title: item.title,
      subtitle: item.subtitle || '',
      stage: this.normalizeStageKey(item.stage),
      grade: item.grade,
      subject: item.subject,
      edition: item.edition,
      region: item.region || '',
      school: item.school || '',
      file_type: item.file_type || 'PDF',
      file_size: item.file_size || '15 MB',
      page_count: item.page_count || 24,
      view_count: item.view_count || 0,
      save_count: item.save_count || 0,
      has_video: Boolean(item.file_type?.includes('视频') || item.file_type?.includes('MP4') || quarkLink?.file_type?.includes('视频')),
      is_published: item.is_published ?? true,
      quarkUrl: quarkLink?.share_url || '',
      quarkFileSize: quarkLink?.file_size || item.file_size || '15.0 MB',
      quarkFileType: quarkLink?.file_type || (quarkLink?.share_url ? '高清视频课' : 'PDF'),
      quarkDesc: quarkLink?.resource_desc || '',
      baiduUrl: baiduLink?.share_url || '',
      baiduCode: baiduLink?.extract_code || '',
      baiduFileSize: baiduLink?.file_size || '15.0 MB',
      baiduFileType: baiduLink?.file_type || 'PDF',
      baiduDesc: baiduLink?.resource_desc || '',
      description: item.description || '',
      file_tree: (item as any).file_tree || []
    };
    this.editCoverPreview.set(item.cover_image || '');
    if (!item.cover_image) {
      this.generatePreview('edit');
    }
    this.isEditModalOpen.set(true);
  }

  closeEdit() {
    this.isEditModalOpen.set(false);
  }

  // 顶部轻量浮动通知 (代替阻塞的 alert 对话框)
  toastMessage = signal<string | null>(null);
  toastType = signal<'success' | 'error'>('success');
  private toastTimer: any = null;

  showToast(msg: string, type: 'success' | 'error' = 'success') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(msg);
    this.toastType.set(type);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, 2200);
  }

  async saveEdit() {
    if (!this.editForm.title || !this.editForm.quarkUrl) {
      this.showToast('请至少填写资料标题和夸克推广链接！', 'error');
      return;
    }

    // 自动在浏览器中绘制 600×600 海报，保存时由后端直传 Cloudflare R2
    let coverDataUrl = this.editCoverPreview();
    if (!coverDataUrl || !coverDataUrl.startsWith('data:image/')) {
      try {
        coverDataUrl = await this.coverGen.generateCoverDataUrl({
          title: this.editForm.title,
          grade: this.editForm.grade,
          subject: this.editForm.subject,
          edition: this.editForm.edition,
          file_size: this.editForm.quarkFileSize || this.editForm.file_size,
          file_tree: (this.editForm as any).file_tree || []
        });
        this.editCoverPreview.set(coverDataUrl);
      } catch (e) {
        console.warn('Canvas cover generation error:', e);
      }
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.editForm.channel_slug || 'edu',
      title: this.editForm.title,
      cover_image: coverDataUrl || undefined,
      subtitle: this.editForm.subtitle || (this.editForm.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.editForm.description || this.editForm.title,
      stage: this.editForm.stage,
      grade: this.editForm.grade,
      subject: this.editForm.subject,
      edition: this.editForm.edition,
      region: this.editForm.region || '',
      school: this.editForm.school || '',
      file_type: this.editForm.has_video ? 'PDF+MP4视频' : this.editForm.file_type,
      file_size: this.editForm.quarkFileSize || this.editForm.baiduFileSize || this.editForm.file_size || '15.0 MB',
      page_count: Number(this.editForm.page_count) || 20,
      view_count: Number(this.editForm.view_count) || 0,
      save_count: Number(this.editForm.save_count) || 0,
      file_tree: (this.editForm as any).file_tree || [],
      is_published: this.editForm.is_published,
      links: [
        {
          drive_type: 'quark',
          share_url: this.editForm.quarkUrl,
          file_size: this.editForm.quarkFileSize || this.editForm.file_size || '15.0 MB',
          file_type: this.editForm.quarkFileType || (this.editForm.has_video ? '高清视频课' : 'PDF'),
          resource_desc: this.editForm.quarkDesc || (this.editForm.has_video ? '包含超清视频合集' : '手机转存立享原画'),
          is_primary: true,
          password_hint: this.editForm.has_video ? '夸克APP原画倍速看视频' : '手机转存立享原画'
        }
      ]
    };

    if (this.editForm.baiduUrl) {
      payload.links?.push({
        drive_type: 'baidu',
        share_url: this.editForm.baiduUrl,
        extract_code: this.editForm.baiduCode,
        file_size: this.editForm.baiduFileSize || '15.0 MB',
        file_type: this.editForm.baiduFileType || 'PDF',
        resource_desc: this.editForm.baiduDesc || '百度网盘备用转存',
        is_primary: false,
        password_hint: this.editForm.baiduCode ? `提取码：${this.editForm.baiduCode}` : ''
      });
    }

    this.resService.update(this.editForm.id, payload).subscribe({
      next: () => {
        this.closeEdit();
        this.loadResources();
        this.showToast('✅ 资料已保存更新！');
      },
      error: (err) => this.showToast('修改失败: ' + err.message, 'error')
    });
  }

  loadResources() {
    this.loading.set(true);
    this.resService.list(this.currentChannelFilter()).subscribe({
      next: (items) => {
        this.resources.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('加载资源列表失败:', err);
        this.loading.set(false);
      }
    });
  }

  switchTab(tab: 'list' | 'add' | 'stats' | 'crawler' | 'email' | 'seo' | 'accounts' | 'channels' | 'navmenus' | 'schools' | 'hotsearches' | 'settings' | 'requests') {
    this.currentTab.set(tab);
    if (tab === 'list') {
      this.loadResources();
    } else if (tab === 'stats') {
      this.loadDashboardStats();
    } else if (tab === 'accounts') {
      this.loadAccounts();
    } else if (tab === 'channels') {
      this.loadChannels();
    } else if (tab === 'navmenus') {
      this.loadNavMenus();
    } else if (tab === 'schools') {
      this.loadRegions();
    } else if (tab === 'hotsearches') {
      this.loadHotSearches();
    } else if (tab === 'settings') {
      this.loadSettings();
    } else if (tab === 'requests') {
      this.loadRequests();
    } else if (tab === 'crawler') {
      this.loadCrawlerDrafts();
      this.loadCrawlerConfigAndStats();
      this.loadCrawlerChannels();
      this.loadBroadcastChannels();
    }
  }

  // --- 顶级频道管理 ---
  channels = signal<ChannelDto[]>([]);
  currentChannelFilter = signal<string>('all');
  isChannelModalOpen = signal<boolean>(false);
  channelLoading = signal<boolean>(false);
  channelForm: ChannelDto = {
    id: '',
    slug: '',
    name: '',
    icon: '📦',
    description: '',
    sort_order: 1,
    is_active: true
  };

  loadChannels() {
    this.resService.getChannels().subscribe({
      next: (list) => this.channels.set(list),
      error: (err) => console.error('加载频道列表失败:', err)
    });
  }

  getChannel(slug?: string): ChannelDto | undefined {
    return this.channels().find(c => c.slug === (slug || 'edu'));
  }

  getChannelName(slug?: string): string {
    const ch = this.getChannel(slug);
    return ch ? ch.name : (slug || '教辅');
  }

  getChannelIcon(slug?: string): string {
    const ch = this.getChannel(slug);
    return ch ? ch.icon : '📚';
  }

  filterByChannel(slug: string) {
    this.currentChannelFilter.set(slug);
    this.loadResources();
  }

  openCreateChannelModal() {
    this.channelForm = {
      id: '',
      slug: '',
      name: '',
      icon: '📦',
      description: '',
      sort_order: this.channels().length + 1,
      is_active: true
    };
    this.isChannelModalOpen.set(true);
  }

  openEditChannelModal(ch: ChannelDto) {
    this.channelForm = { ...ch };
    this.isChannelModalOpen.set(true);
  }

  closeChannelModal() {
    this.isChannelModalOpen.set(false);
  }

  saveChannel() {
    if (!this.channelForm.slug || !this.channelForm.name) {
      this.showToast('请填写频道英文标识与展示名称！', 'error');
      return;
    }
    this.channelLoading.set(true);
    if (this.channelForm.id) {
      this.resService.updateChannel(this.channelForm.id, this.channelForm).subscribe({
        next: () => {
          this.channelLoading.set(false);
          this.closeChannelModal();
          this.loadChannels();
          this.showToast(`✅ 频道【${this.channelForm.name}】更新成功！`);
        },
        error: (err) => {
          this.channelLoading.set(false);
          this.showToast('更新频道失败: ' + err.message, 'error');
        }
      });
    } else {
      this.resService.createChannel(this.channelForm).subscribe({
        next: () => {
          this.channelLoading.set(false);
          this.closeChannelModal();
          this.loadChannels();
          this.showToast(`🎉 频道【${this.channelForm.name}】创建成功！`);
        },
        error: (err) => {
          this.channelLoading.set(false);
          this.showToast('创建频道失败: ' + err.message, 'error');
        }
      });
    }
  }

  toggleChannelActive(ch: ChannelDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!ch.id) return;
    this.resService.toggleChannel(ch.id).subscribe({
      next: (res) => {
        this.channels.update(list => list.map(item => item.id === ch.id ? { ...item, is_active: res.is_active } : item));
        this.showToast(res.message);
      },
      error: (err) => this.showToast('切换上线状态失败: ' + err.message, 'error')
    });
  }

  async deleteChannel(ch: ChannelDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!ch.id) return;
    const ok = await this.confirmDialog({
      title: '删除频道',
      message: `确定删除频道【${ch.name}】吗？删除前请确保该频道下没有关联资源。`,
      confirmText: '确定删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.resService.deleteChannel(ch.id).subscribe({
      next: () => {
        this.showToast(`🗑️ 频道【${ch.name}】已删除`);
        this.loadChannels();
      },
      error: (err) => this.showToast(err.error?.message || '删除失败: ' + err.message, 'error')
    });
  }

  togglePublish(item: ResourceItemDto) {
    this.resService.togglePublish(item.id).subscribe({
      next: (result) => {
        item.is_published = result.is_published;
        this.showToast(result.is_published ? '✅ 资料已上架展示' : 'ℹ️ 资料已转为下架');
      },
      error: (err) => this.showToast('切换状态失败: ' + err.message, 'error')
    });
  }

  async saveNewResource() {
    if (!this.newResource.title || !this.newResource.quarkUrl) {
      this.showToast('请至少填写资料标题和夸克推广链接！', 'error');
      return;
    }

    // 自动在浏览器中绘制 600×600 海报，保存时由后端直传 Cloudflare R2
    let coverDataUrl = this.newCoverPreview();
    if (!coverDataUrl || !coverDataUrl.startsWith('data:image/')) {
      try {
        coverDataUrl = await this.coverGen.generateCoverDataUrl({
          title: this.newResource.title,
          grade: this.newResource.grade,
          subject: this.newResource.subject,
          edition: this.newResource.edition,
          file_size: this.newResource.quarkFileSize || this.newResource.file_size,
          file_tree: (this.newResource as any).file_tree || []
        });
        this.newCoverPreview.set(coverDataUrl);
      } catch (e) {
        console.warn('Canvas cover generation error:', e);
      }
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.newResource.channel_slug || 'edu',
      title: this.newResource.title,
      cover_image: coverDataUrl || undefined,
      subtitle: this.newResource.subtitle || (this.newResource.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.newResource.description || this.newResource.title,
      stage: this.newResource.stage,
      grade: this.newResource.grade,
      subject: this.newResource.subject,
      edition: this.newResource.edition,
      region: this.newResource.region || '',
      school: this.newResource.school || '',
      file_type: this.newResource.has_video ? 'PDF+MP4视频' : this.newResource.file_type,
      file_size: this.newResource.quarkFileSize || this.newResource.baiduFileSize || this.newResource.file_size || '15.0 MB',
      page_count: Number(this.newResource.page_count) || 20,
      view_count: Number(this.newResource.view_count) || 0,
      save_count: Number(this.newResource.save_count) || 0,
      file_tree: (this.newResource as any).file_tree || [],
      is_published: true,
      is_recommended: true,
      links: [
        {
          drive_type: 'quark',
          share_url: this.newResource.quarkUrl,
          file_size: this.newResource.quarkFileSize || this.newResource.file_size || '15.0 MB',
          file_type: this.newResource.quarkFileType || (this.newResource.has_video ? '高清视频课' : 'PDF'),
          resource_desc: this.newResource.quarkDesc || (this.newResource.has_video ? '包含超清视频合集' : '手机转存立享原画'),
          is_primary: true,
          password_hint: this.newResource.has_video ? '夸克APP原画倍速看视频' : '手机转存立享原画'
        }
      ]
    };

    if (this.newResource.baiduUrl) {
      payload.links?.push({
        drive_type: 'baidu',
        share_url: this.newResource.baiduUrl,
        extract_code: this.newResource.baiduCode,
        file_size: this.newResource.baiduFileSize || '15.0 MB',
        file_type: this.newResource.baiduFileType || 'PDF',
        resource_desc: this.newResource.baiduDesc || '百度网盘备用转存',
        is_primary: false,
        password_hint: this.newResource.baiduCode ? `提取码：${this.newResource.baiduCode}` : ''
      });
    }

    this.resService.create(payload).subscribe({
      next: (createdRes: any) => {
        this.showToast('🎉 资料发布成功！已实时落库。');
        if (this.currentImportingDraftId) {
          const draftId = this.currentImportingDraftId;
          this.resService.updateCrawlerDraftStatus(draftId, 'approved').subscribe(() => {
            this.loadCrawlerConfigAndStats();
          });
          this.currentImportingDraftId = null;
        }
        this.newResource.title = '';
        this.newResource.subtitle = '';
        this.newResource.description = '';
        this.newResource.region = (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : null) || '广西-柳州';
        this.newResource.school = '';
        this.newResource.quarkUrl = '';
        this.newResource.baiduUrl = '';
        this.newResource.baiduCode = '';
        this.newResource.view_count = 0;
        this.newResource.save_count = 0;
        (this.newResource as any).file_tree = [];
        this.loadResources();
        this.switchTab('list');
      },
      error: (err) => this.showToast('创建失败: ' + err.message, 'error')
    });
  }

  async deleteResource(id: string) {
    const ok = await this.confirmDialog({
      title: '彻底删除资料',
      message: '确认彻底删除该学习资料吗？关联的网盘链接也将一并永久清理。',
      confirmText: '确定彻底删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.resService.delete(id).subscribe({
      next: () => {
        this.resources.update(list => list.filter(r => r.id !== id));
        this.showToast('🗑️ 资料已删除');
      },
      error: (err) => this.showToast('删除失败: ' + err.message, 'error')
    });
  }

  // 批量巡检状态与方法
  isBatchCheckModalOpen = signal<boolean>(false);
  batchCheckLoading = signal<boolean>(false);
  batchCheckSummary = signal<any>(null);

  // 巡检参数（频率调控：避免一天内频繁重复检测同一个链接）
  checkOptions = {
    min_interval_hours: 24, // 默认 24 小时冷却时间
    force: false,
    status_filter: '',      // '' 全部, 'reported' 仅用户报错, 'invalid' 仅失效
    limit: 50
  };

  openBatchCheckModal() {
    this.batchCheckSummary.set(null);
    this.isBatchCheckModalOpen.set(true);
  }

  closeBatchCheckModal() {
    this.isBatchCheckModalOpen.set(false);
  }

  // 触发批量巡检
  runBatchCheck() {
    this.batchCheckLoading.set(true);
    this.resService.batchCheckLinks({
      min_interval_hours: Number(this.checkOptions.min_interval_hours),
      force: this.checkOptions.force,
      status_filter: this.checkOptions.status_filter,
      limit: Number(this.checkOptions.limit)
    }).subscribe({
      next: (summary) => {
        this.batchCheckLoading.set(false);
        this.batchCheckSummary.set(summary);
        this.loadResources(); // 刷新表格数据
        this.showToast(`🛡️ 巡检完成！实测 ${summary.checked_count} 个，正常 ${summary.active_count} 个，失效 ${summary.invalid_count} 个，冷却跳过 ${summary.skipped_count} 个`);
      },
      error: () => {
        this.batchCheckLoading.set(false);
        this.showToast('批量巡检失败，请检查网络或后端状态', 'error');
      }
    });
  }

  // 单条链接立即手动检测
  checkSingleLink(link: any) {
    if (!link.id) return;
    this.showToast(`🔍 正在探测该网盘存活状态...`);
    this.resService.checkSingleLink(link.id).subscribe({
      next: (res) => {
        link.status = res.status;
        link.invalid_reason = res.invalid_reason;
        link.last_checked_at = res.last_checked_at;
        // 触发 resources signal 响应式更新，以便 computed 计算属性和表格 UI 立即反应
        this.resources.update(list => [...list]);
        if (res.status === 'active') {
          this.showToast(`✅ 检测通过：该链接正常可用！`);
        } else if (res.status === 'invalid') {
          this.showToast(`❌ 警告：该链接已失效 (${res.invalid_reason || '无法访问'})`, 'error');
        } else {
          this.showToast(`⚠️ 提示：${res.invalid_reason || '需人工复核'}`);
        }
      },
      error: () => {
        this.showToast('检测失败，请稍后重试', 'error');
      }
    });
  }

  // 从巡检报告直接一键跳转编辑补链
  openEditById(resourceId: string) {
    const item = this.resources().find(r => r.id === resourceId);
    if (item) {
      this.closeBatchCheckModal();
      this.openEdit(item);
    } else {
      this.showToast('未找到对应资料记录', 'error');
    }
  }

  // --- 网站多级导航与专区管理 ---
  navMenus = signal<NavMenuDto[]>([]);
  isNavMenuModalOpen = signal<boolean>(false);
  navMenuLoading = signal<boolean>(false);
  navMenuForm: NavMenuDto = {
    id: '',
    parent_id: '',
    title: '',
    icon: '📚',
    link_url: '/edu',
    badge_text: '',
    description: '',
    sort_order: 1,
    is_active: true,
    is_special_highlight: false
  };

  loadNavMenus() {
    this.resService.getNavMenus().subscribe({
      next: (list) => this.navMenus.set(list),
      error: (err) => console.error('加载导航菜单失败:', err)
    });
  }

  openCreateNavMenuModal(parentId: string = '') {
    this.navMenuForm = {
      id: '',
      parent_id: parentId,
      title: '',
      icon: parentId ? '🔹' : '📚',
      link_url: parentId ? '/edu?stage=primary' : '/edu',
      badge_text: '',
      description: '',
      sort_order: (this.navMenus().length + 1),
      is_active: true,
      is_special_highlight: false
    };
    this.isNavMenuModalOpen.set(true);
  }

  openEditNavMenuModal(menu: NavMenuDto) {
    this.navMenuForm = { ...menu };
    this.isNavMenuModalOpen.set(true);
  }

  closeNavMenuModal() {
    this.isNavMenuModalOpen.set(false);
  }

  saveNavMenu() {
    if (!this.navMenuForm.title || !this.navMenuForm.link_url) {
      this.showToast('请填写菜单标题与跳转链接！', 'error');
      return;
    }
    this.navMenuLoading.set(true);
    if (this.navMenuForm.id) {
      this.resService.updateNavMenu(this.navMenuForm.id, this.navMenuForm).subscribe({
        next: () => {
          this.navMenuLoading.set(false);
          this.closeNavMenuModal();
          this.loadNavMenus();
          this.showToast(`✅ 导航菜单【${this.navMenuForm.title}】更新成功！`);
        },
        error: (err) => {
          this.navMenuLoading.set(false);
          this.showToast('更新菜单失败: ' + err.message, 'error');
        }
      });
    } else {
      this.resService.createNavMenu(this.navMenuForm).subscribe({
        next: () => {
          this.navMenuLoading.set(false);
          this.closeNavMenuModal();
          this.loadNavMenus();
          this.showToast(`🎉 导航菜单【${this.navMenuForm.title}】创建成功！`);
        },
        error: (err) => {
          this.navMenuLoading.set(false);
          this.showToast('创建菜单失败: ' + err.message, 'error');
        }
      });
    }
  }

  toggleNavMenuActive(menu: NavMenuDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!menu.id) return;
    this.resService.toggleNavMenu(menu.id).subscribe({
      next: (res) => {
        menu.is_active = res.is_active;
        this.showToast(menu.is_active ? `👁️ 【${menu.title}】已在前台展示` : `🙈 【${menu.title}】已隐藏`);
      },
      error: (err) => this.showToast('切换状态失败: ' + err.message, 'error')
    });
  }

  async deleteNavMenu(id?: string, title?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!id) return;
    const ok = await this.confirmDialog({
      title: '删除导航项',
      message: `确认删除导航【${title || ''}】吗？若包含子菜单将同步清理。`,
      confirmText: '确定删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.resService.deleteNavMenu(id).subscribe({
      next: () => {
        this.loadNavMenus();
        this.showToast(`🗑️ 导航【${title || ''}】已删除`);
      },
      error: (err) => this.showToast('删除失败: ' + err.message, 'error')
    });
  }

  // --- 地区与重点名校字典库管理 ---
  regions = signal<RegionDto[]>([]);
  quickNewSchoolName = signal<string>('');
  quickNewSchoolStage = signal<string>('junior');
  selectedRegionFilter = signal<string>('all');

  loadRegions() {
    this.resService.getRegions().subscribe({
      next: (list) => this.regions.set(list),
      error: (err) => console.error('加载地区名校库失败:', err)
    });
  }

  getSchoolsForRegion(regionName: string): SchoolDto[] {
    if (!regionName) return [];
    const r = this.regions().find(x => x.name === regionName);
    return r?.schools || [];
  }

  selectRegion(regionName: string, mode: 'new' | 'edit') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('preferred_region', regionName);
    }
    if (mode === 'new') {
      this.newResource.region = regionName;
      this.newResource.school = '';
    } else {
      this.editForm.region = regionName;
      this.editForm.school = '';
    }
  }

  selectSchool(schoolName: string, mode: 'new' | 'edit') {
    if (mode === 'new') {
      this.newResource.school = this.newResource.school === schoolName ? '' : schoolName;
    } else {
      this.editForm.school = this.editForm.school === schoolName ? '' : schoolName;
    }
  }

  addQuickSchool(mode: 'new' | 'edit') {
    const regionName = mode === 'new' ? this.newResource.region : this.editForm.region;
    const schoolName = this.quickNewSchoolName().trim();
    if (!regionName) {
      this.showToast('请先选择或输入所属省市/地区！', 'error');
      return;
    }
    if (!schoolName) {
      this.showToast('请输入要添加的名校名称！', 'error');
      return;
    }

    this.resService.createSchool({
      region_name: regionName,
      school_name: schoolName,
      stage: this.quickNewSchoolStage()
    }).subscribe({
      next: () => {
        this.loadRegions();
        if (mode === 'new') {
          this.newResource.school = schoolName;
        } else {
          this.editForm.school = schoolName;
        }
        this.quickNewSchoolName.set('');
        this.showToast(`🎉 已将【${schoolName}】成功添加到【${regionName}】名校库中！`);
      },
      error: (err) => this.showToast('添加名校失败: ' + err.message, 'error')
    });
  }

  async deleteSchool(id?: number, name?: string) {
    if (!id) return;
    const ok = await this.confirmDialog({
      title: '移除名校',
      message: `确认从字典库中移除名校【${name}】吗？`,
      confirmText: '确定移除',
      type: 'danger',
      icon: '🏫'
    });
    if (!ok) return;

    this.resService.deleteSchool(id).subscribe({
      next: () => {
        this.loadRegions();
        this.showToast(`🗑️ 已移除名校【${name}】`);
      },
      error: (err) => this.showToast('删除失败: ' + err.message, 'error')
    });
  }

  // --- 🔥 高频热搜关键词配置管理 ---
  hotSearches = signal<HotSearchDto[]>([]);
  hotSearchLoading = signal<boolean>(false);
  hotSearchFilterStage = signal<string>('all');
  isHotSearchModalOpen = signal<boolean>(false);
  hotSearchForm: {
    id: string;
    title: string;
    keyword: string;
    stage: string;
    style_type: 'default' | 'highlight' | 'hot';
    sort_order: number;
    is_active: boolean;
  } = {
    id: '',
    title: '',
    keyword: '',
    stage: 'all',
    style_type: 'default',
    sort_order: 1,
    is_active: true
  };

  loadHotSearches() {
    this.hotSearchLoading.set(true);
    const stage = this.hotSearchFilterStage();
    this.resService.getAdminHotSearches(stage).subscribe({
      next: (list) => {
        this.hotSearches.set(list);
        this.hotSearchLoading.set(false);
      },
      error: (err) => {
        this.hotSearchLoading.set(false);
        console.error('加载高频热搜失败:', err);
      }
    });
  }

  onHotSearchFilterChange(stage: string) {
    this.hotSearchFilterStage.set(stage);
    this.loadHotSearches();
  }

  openAddHotSearchModal() {
    this.hotSearchForm = {
      id: '',
      title: '',
      keyword: '',
      stage: this.hotSearchFilterStage() === 'all' ? 'all' : this.hotSearchFilterStage(),
      style_type: 'default',
      sort_order: (this.hotSearches().length + 1),
      is_active: true
    };
    this.isHotSearchModalOpen.set(true);
  }

  openEditHotSearchModal(item: HotSearchDto) {
    this.hotSearchForm = {
      id: item.id || '',
      title: item.title,
      keyword: item.keyword,
      stage: item.stage,
      style_type: item.style_type || 'default',
      sort_order: item.sort_order || 0,
      is_active: item.is_active
    };
    this.isHotSearchModalOpen.set(true);
  }

  closeHotSearchModal() {
    this.isHotSearchModalOpen.set(false);
  }

  saveHotSearch() {
    if (!this.hotSearchForm.title) {
      this.showToast('请填写热搜展示标题！', 'error');
      return;
    }
    if (!this.hotSearchForm.keyword) {
      this.hotSearchForm.keyword = this.hotSearchForm.title;
    }
    this.hotSearchLoading.set(true);
    if (this.hotSearchForm.id) {
      this.resService.updateHotSearch(this.hotSearchForm.id, this.hotSearchForm).subscribe({
        next: () => {
          this.hotSearchLoading.set(false);
          this.closeHotSearchModal();
          this.loadHotSearches();
          this.showToast(this.i18n.t('hotsearch.saveSuccess'));
        },
        error: (err) => {
          this.hotSearchLoading.set(false);
          this.showToast('更新热搜失败: ' + err.message, 'error');
        }
      });
    } else {
      this.resService.createHotSearch(this.hotSearchForm).subscribe({
        next: () => {
          this.hotSearchLoading.set(false);
          this.closeHotSearchModal();
          this.loadHotSearches();
          this.showToast(this.i18n.t('hotsearch.saveSuccess'));
        },
        error: (err) => {
          this.hotSearchLoading.set(false);
          this.showToast('创建热搜失败: ' + err.message, 'error');
        }
      });
    }
  }

  toggleHotSearchActive(item: HotSearchDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!item.id) return;
    this.resService.toggleHotSearch(item.id).subscribe({
      next: (res) => {
        item.is_active = res.is_active;
        this.showToast(item.is_active ? `👁️ 【${item.title}】已在前台展示` : `🙈 【${item.title}】已隐藏`);
      },
      error: (err) => this.showToast('切换状态失败: ' + err.message, 'error')
    });
  }

  async deleteHotSearch(item: HotSearchDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!item.id) return;
    const ok = await this.confirmDialog({
      title: this.i18n.t('hotsearch.delete'),
      message: this.i18n.t('hotsearch.deleteConfirm') + `【${item.title}】`,
      confirmText: this.i18n.t('common.confirm'),
      type: 'danger',
      icon: '🔥'
    });
    if (!ok) return;

    this.resService.deleteHotSearch(item.id).subscribe({
      next: () => {
        this.loadHotSearches();
        this.showToast(this.i18n.t('hotsearch.deleteSuccess'));
      },
      error: (err) => this.showToast('删除失败: ' + err.message, 'error')
    });
  }

  // --- 批量多选管理逻辑 ---
  selectedHotSearchIds = signal<string[]>([]);

  isAllHotSearchesSelected(): boolean {
    const list = this.hotSearches();
    if (list.length === 0) return false;
    const selected = this.selectedHotSearchIds();
    return list.every(item => item.id && selected.includes(item.id));
  }

  toggleSelectAllHotSearches() {
    const list = this.hotSearches();
    if (this.isAllHotSearchesSelected()) {
      this.selectedHotSearchIds.set([]);
    } else {
      const allIds = list.map(item => item.id).filter((id): id is string => !!id);
      this.selectedHotSearchIds.set(allIds);
    }
  }

  toggleHotSearchSelection(id?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!id) return;
    const current = this.selectedHotSearchIds();
    if (current.includes(id)) {
      this.selectedHotSearchIds.set(current.filter(i => i !== id));
    } else {
      this.selectedHotSearchIds.set([...current, id]);
    }
  }

  isHotSearchSelected(id?: string): boolean {
    if (!id) return false;
    return this.selectedHotSearchIds().includes(id);
  }

  clearHotSearchSelection() {
    this.selectedHotSearchIds.set([]);
  }

  batchToggleHotSearches(isActive: boolean) {
    const ids = this.selectedHotSearchIds();
    if (ids.length === 0) return;

    this.hotSearchLoading.set(true);
    this.resService.batchToggleHotSearches(ids, isActive).subscribe({
      next: () => {
        this.hotSearchLoading.set(false);
        this.clearHotSearchSelection();
        this.loadHotSearches();
        this.showToast(this.i18n.t('hotsearch.batchSuccess'));
      },
      error: (err) => {
        this.hotSearchLoading.set(false);
        this.showToast('批量操作失败: ' + err.message, 'error');
      }
    });
  }

  async batchDeleteHotSearches() {
    const ids = this.selectedHotSearchIds();
    if (ids.length === 0) return;

    const confirmMsg = this.i18n.t('hotsearch.batchDeleteConfirm').replace('{count}', String(ids.length));
    const ok = await this.confirmDialog({
      title: '批量删除热搜',
      message: confirmMsg,
      confirmText: this.i18n.t('common.confirm'),
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.hotSearchLoading.set(true);
    this.resService.batchDeleteHotSearches(ids).subscribe({
      next: () => {
        this.hotSearchLoading.set(false);
        this.clearHotSearchSelection();
        this.loadHotSearches();
        this.showToast(this.i18n.t('hotsearch.batchSuccess'));
      },
      error: (err) => {
        this.hotSearchLoading.set(false);
        this.showToast('批量删除失败: ' + err.message, 'error');
      }
    });
  }

  // --- 资料库批量多选管理逻辑 ---
  selectedResourceIds = signal<string[]>([]);

  isAllResourcesSelected(): boolean {
    const list = this.filteredResources();
    if (list.length === 0) return false;
    const selected = this.selectedResourceIds();
    return list.every(item => item.id && selected.includes(item.id));
  }

  toggleSelectAllResources() {
    const list = this.filteredResources();
    if (this.isAllResourcesSelected()) {
      this.selectedResourceIds.set([]);
    } else {
      const allIds = list.map(item => item.id).filter((id): id is string => !!id);
      this.selectedResourceIds.set(allIds);
    }
  }

  toggleResourceSelection(id?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!id) return;
    const current = this.selectedResourceIds();
    if (current.includes(id)) {
      this.selectedResourceIds.set(current.filter(i => i !== id));
    } else {
      this.selectedResourceIds.set([...current, id]);
    }
  }

  isResourceSelected(id?: string): boolean {
    if (!id) return false;
    return this.selectedResourceIds().includes(id);
  }

  clearResourceSelection() {
    this.selectedResourceIds.set([]);
  }

  batchToggleResources(isPublished: boolean) {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) return;

    this.loading.set(true);
    this.resService.batchTogglePublish(ids, isPublished).subscribe({
      next: () => {
        this.loading.set(false);
        this.clearResourceSelection();
        this.loadResources();
        this.showToast(this.i18n.t('resource.batchSuccess'));
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('批量操作失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  async batchDeleteResources() {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) return;

    const confirmMsg = this.i18n.t('resource.batchDeleteConfirm').replace('{count}', String(ids.length));
    const ok = await this.confirmDialog({
      title: '批量彻底删除',
      message: confirmMsg,
      confirmText: '确定彻底删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.loading.set(true);
    this.resService.batchDelete(ids).subscribe({
      next: () => {
        this.loading.set(false);
        this.clearResourceSelection();
        this.loadResources();
        this.showToast(this.i18n.t('resource.batchSuccess'));
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('批量删除失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  // --- 系统全局配置 (Site Settings) ---
  siteSettings = signal<SiteSettingDto>({
    site_name: '学霸网',
    site_title: '学霸网 - 中小学同步教辅、网盘学习资源与考试真题平台',
    site_subtitle: '中小学名校期末冲刺卷、人教版同步教辅、实用工具素材与精品网盘学习资料，支持A4高清打印与极速网盘转存。',
    keywords: '学霸网,xuebaw.com,网盘资源,中小学试卷下载,期末冲刺卷,人教版同步教辅,夸克网盘学习资料,百度网盘资源,考试真题',
    qq_group: '625248438',
    qq_group_url: 'https://qm.qq.com/cgi-bin/qm/qr?k=&jump_from=webapi&authKey=&uin=625248438',
    contact_email: 'support@xuebaw.com',
    contact_wechat: '',
    icp_beian: '',
    gongan_beian: '',
    copyright_text: '© 2026 学霸网 (xuebaw.com). All rights reserved.',
    disclaimer_text: '免责声明：本站所有资源均来自互联网公开平台与公开考试题型归纳整理，仅供个人学习研究交流使用，版权归原作者所有。',
    announcement_active: false,
    announcement_text: '📢 欢迎来到学霸网！2026 最新各省中考高三一模二模卷及人教版教辅资料正在每日批量更新中，建议收藏本站防走失。',
    announcement_url: '',
    announcement_badge: 'HOT',
    announcement_type: 'blue'
  });
  settingsLoading = signal<boolean>(false);
  settingsSaving = signal<boolean>(false);
  settingsSaveMsg = signal<string>('');
  settingsActiveSubTab = signal<'brand' | 'social' | 'notice' | 'legal'>('brand');

  loadSettings() {
    this.settingsLoading.set(true);
    this.resService.getSettings().subscribe({
      next: (data) => {
        if (data) {
          this.siteSettings.set({
            ...data,
            announcement_type: (data.announcement_type || 'blue') as any
          });
        }
        this.settingsLoading.set(false);
      },
      error: (err) => {
        console.error('加载系统设置失败:', err);
        this.settingsLoading.set(false);
      }
    });
  }

  saveSettings() {
    if (this.settingsSaving()) return;
    this.settingsSaving.set(true);
    this.settingsSaveMsg.set('');

    this.resService.updateSettings(this.siteSettings()).subscribe({
      next: (res) => {
        this.settingsSaving.set(false);
        this.siteSettings.set(res);
        this.settingsSaveMsg.set(this.i18n.t('settings.saveSuccess'));
        this.showToast(this.i18n.t('settings.saveSuccess'));
        setTimeout(() => this.settingsSaveMsg.set(''), 4000);
      },
      error: (err) => {
        this.settingsSaving.set(false);
        const failMsg = this.i18n.t('settings.saveFailed') + ': ' + (err.error?.message || err.message);
        this.settingsSaveMsg.set(failMsg);
        this.showToast(failMsg, 'error');
      }
    });
  }

  // --- 求资料需求池 (Demand Pool) ---
  requests = signal<ResourceRequestDto[]>([]);
  requestsCounts = signal<{ all: number; pending: number; fulfilled: number; rejected: number }>({ all: 0, pending: 0, fulfilled: 0, rejected: 0 });
  requestsFilter = signal<'all' | 'pending' | 'fulfilled' | 'rejected'>('all');
  requestsStageFilter = signal<string>('all');
  requestsSearchKeyword = signal<string>('');
  requestsLoading = signal<boolean>(false);
  isFulfillModalOpen = signal<boolean>(false);
  fulfillTargetRequest = signal<ResourceRequestDto | null>(null);
  fulfillNoteInput = signal<string>('');
  submittingFulfill = signal<boolean>(false);

  loadRequests() {
    this.requestsLoading.set(true);
    this.resService.getAdminRequests({
      status: this.requestsFilter(),
      stage: this.requestsStageFilter(),
      q: this.requestsSearchKeyword()
    }).subscribe({
      next: (data) => {
        this.requests.set(data?.items || []);
        if (data?.counts) {
          this.requestsCounts.set({
            all: Number(data.counts['all']) || 0,
            pending: Number(data.counts['pending']) || 0,
            fulfilled: Number(data.counts['fulfilled']) || 0,
            rejected: Number(data.counts['rejected']) || 0
          });
        }
        this.requestsLoading.set(false);
      },
      error: (err) => {
        console.error('加载求资料需求失败:', err);
        this.requestsLoading.set(false);
      }
    });
  }

  filterRequestsByStatus(status: 'all' | 'pending' | 'fulfilled' | 'rejected') {
    this.requestsFilter.set(status);
    this.loadRequests();
  }

  onRequestsStageChange(stage: string) {
    this.requestsStageFilter.set(stage);
    this.loadRequests();
  }

  searchRequests() {
    this.loadRequests();
  }

  openFulfillModal(req: ResourceRequestDto) {
    this.fulfillTargetRequest.set(req);
    this.fulfillNoteInput.set(req.fulfilled_note || `已在相关学段专区上架《${req.title}》，欢迎转存学习！`);
    this.isFulfillModalOpen.set(true);
  }

  closeFulfillModal() {
    this.isFulfillModalOpen.set(false);
    this.fulfillTargetRequest.set(null);
  }

  submitFulfill() {
    const target = this.fulfillTargetRequest();
    if (!target || this.submittingFulfill()) return;

    this.submittingFulfill.set(true);
    this.resService.updateAdminRequest(target.id, {
      status: 'fulfilled',
      fulfilled_note: this.fulfillNoteInput()
    }).subscribe({
      next: (updated) => {
        this.submittingFulfill.set(false);
        this.closeFulfillModal();
        this.showToast(this.i18n.t('requests.fulfillSuccess'));
        this.loadRequests();
      },
      error: (err) => {
        this.submittingFulfill.set(false);
        this.showToast('处置失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  quickRejectRequest(req: ResourceRequestDto) {
    this.resService.updateAdminRequest(req.id, {
      status: 'rejected',
      fulfilled_note: '暂未搜集到有效版本'
    }).subscribe({
      next: () => {
        this.showToast(this.i18n.t('requests.rejectSuccess'));
        this.loadRequests();
      },
      error: (err) => this.showToast('操作失败: ' + (err.error?.message || err.message), 'error')
    });
  }

  async deleteRequest(req: ResourceRequestDto, event?: any) {
    if (event?.stopPropagation) event.stopPropagation();
    const ok = await this.confirmDialog({
      title: this.i18n.t('requests.delete'),
      message: this.i18n.t('requests.deleteConfirm'),
      confirmText: this.i18n.t('common.confirm'),
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.resService.deleteAdminRequest(req.id).subscribe({
      next: () => {
        this.showToast(this.i18n.t('requests.deleteSuccess'));
        this.loadRequests();
      },
      error: (err) => this.showToast('删除失败: ' + (err.error?.message || err.message), 'error')
    });
  }

  publishForThisRequest(req: ResourceRequestDto) {
    // 自动切换到“上架发布资料”标签页，并智能预填标题与学段科目！
    this.newResource.title = req.title;
    if (req.stage && req.stage !== 'all') {
      this.newResource.stage = req.stage;
      this.onStageChange('new');
    }
    if (req.subject) {
      this.newResource.subject = req.subject;
    }
    this.switchTab('add');
    this.showToast(`已为您将《${req.title}》自动填入发布表单！`);
  }

  // --- 📢 一键引流宣发文案生成器状态与逻辑 ---
  isCopyModalOpen = signal<boolean>(false);
  copyModalMode = signal<'single' | 'batch'>('single');
  copyActiveTab = signal<'xiaohongshu' | 'wechat' | 'forum'>('xiaohongshu');
  copyLinkTarget = signal<'landing' | 'direct'>('landing');
  currentCopyResource = signal<ResourceItemDto | null>(null);
  batchCopyResources = signal<ResourceItemDto[]>([]);
  generatedCopyText = signal<string>('');

  openCopyWriterModal(res: ResourceItemDto) {
    this.copyModalMode.set('single');
    this.currentCopyResource.set(res);
    this.batchCopyResources.set([]);
    this.generateCopyText();
    this.isCopyModalOpen.set(true);
  }

  openBatchCopyModal() {
    const selectedIds = this.selectedResourceIds();
    if (selectedIds.length === 0) {
      this.showToast('请先勾选需要生成合集文案的资料', 'error');
      return;
    }
    const items = this.resources().filter(r => r.id && selectedIds.includes(r.id));
    if (items.length === 0) return;
    this.copyModalMode.set('batch');
    this.batchCopyResources.set(items);
    this.currentCopyResource.set(items[0]);
    this.generateCopyText();
    this.isCopyModalOpen.set(true);
  }

  closeCopyModal() {
    this.isCopyModalOpen.set(false);
  }

  // --- 🎨 智能营销海报生成器状态与逻辑 ---
  isPosterModalOpen = signal<boolean>(false);
  activePosterResource = signal<ResourceItemDto | null>(null);
  activePosterBatch = signal<ResourceItemDto[]>([]);

  openPosterModal(res: ResourceItemDto) {
    this.activePosterResource.set(res);
    this.activePosterBatch.set([]);
    this.isPosterModalOpen.set(true);
  }

  openBatchPosterModal() {
    const selectedIds = this.selectedResourceIds();
    if (selectedIds.length === 0) {
      this.showToast('请先勾选需要生成海报的资料', 'error');
      return;
    }
    const items = this.resources().filter(r => r.id && selectedIds.includes(r.id));
    if (items.length === 0) return;
    this.activePosterBatch.set(items);
    this.activePosterResource.set(items[0]);
    this.isPosterModalOpen.set(true);
  }

  closePosterModal() {
    this.isPosterModalOpen.set(false);
    this.activePosterResource.set(null);
    this.activePosterBatch.set([]);
  }

  // --- 🎬 全渠道短视频爆款脚本生成中枢 ---
  isVideoModalOpen = signal<boolean>(false);
  activeVideoResource = signal<ResourceItemDto | null>(null);
  activeVideoBatch = signal<ResourceItemDto[]>([]);

  openVideoModal(res: ResourceItemDto) {
    this.activeVideoResource.set(res);
    this.activeVideoBatch.set([]);
    this.isVideoModalOpen.set(true);
  }

  openBatchVideoModal() {
    const selectedIds = this.selectedResourceIds();
    if (selectedIds.length === 0) {
      this.showToast('请先勾选需要生成视频脚本的资料', 'error');
      return;
    }
    const items = this.resources().filter(r => r.id && selectedIds.includes(r.id));
    if (items.length === 0) return;
    this.activeVideoBatch.set(items);
    this.activeVideoResource.set(items[0]);
    this.isVideoModalOpen.set(true);
  }

  closeVideoModal() {
    this.isVideoModalOpen.set(false);
    this.activeVideoResource.set(null);
    this.activeVideoBatch.set([]);
  }

  setCopyTab(tab: 'xiaohongshu' | 'wechat' | 'forum') {
    this.copyActiveTab.set(tab);
    this.generateCopyText();
  }

  setCopyLinkTarget(target: 'landing' | 'direct') {
    this.copyLinkTarget.set(target);
    this.generateCopyText();
  }

  generateCopyText() {
    const mode = this.copyModalMode();
    const tab = this.copyActiveTab();
    const target = this.copyLinkTarget();
    
    if (mode === 'single') {
      const res = this.currentCopyResource();
      if (!res) return;
      const primaryLink = (res.links && res.links.length > 0) 
        ? (res.links.find(l => l.is_primary) || res.links[0]) 
        : null;
      
      const landingUrl = `https://xuebaw.com/resource/${res.slug}`;
      let linkText = '';
      if (target === 'landing') {
        linkText = `🔗 站内极速直达通道：${landingUrl}`;
      } else {
        if (primaryLink && primaryLink.share_url) {
          linkText = `🔗 网盘直达链接：${primaryLink.share_url}` + (primaryLink.extract_code ? ` (提取码: ${primaryLink.extract_code})` : '');
        } else {
          linkText = `🔗 站内直达通道：${landingUrl}`;
        }
      }

      const stageName = this.stageOptions[res.stage]?.label?.split(' ')[0] || res.stage || '全学段';
      const grade = res.grade && res.grade !== '通用' ? res.grade : '';
      const subject = res.subject && res.subject !== '通用' ? res.subject : '';
      const fileSize = res.file_size || '高清完整版';
      const fileType = res.file_type || 'PDF/视频';

      let text = '';
      if (tab === 'xiaohongshu') {
        text = `整理到半夜！终于把这套【${grade}${subject} ${res.title}】整理齐了😭\n\n真的太全了！内含 100% 矢量无损高清真题（A4 纸打印超清晰、字体与公式绝不发虚模糊），配有手写详细解析步骤和名师高清微课，备考冲刺直接省下大几百辅导费！\n\n📁 资料已经打包放进网盘啦：\n${linkText}\n\n💡 划重点提醒：直接在线看会被网盘压缩画质，强烈建议点开后先【保存到网盘 / 转存】再下载，才是无损原版，微课还能直接解锁 1080P/4K 原画原声不卡顿，而且存入自己网盘永久防失效哦！\n\n需要的同学/家长赶紧存，避免以后链接失效！👇\n#备考冲刺 #${subject || '真题'} #${grade || '试卷'} #学霸秘籍 #考点复习 #夸克网盘`;
      } else if (tab === 'wechat') {
        text = `各位家长/同学们好，刚在学霸网找到了这套【${res.title}】优质资料，整理得很扎实：\n内含完整 A4 可打印高清试卷 + 名师视频微课解析，打印出来字迹非常清楚。\n\n大家各取所需，需要的直接点链接取走：\n${linkText}\n\n⚠️ 温馨提示：网盘在线预览会压低画质，建议点进去后一定要先点【保存到网盘 / 转存】再下载，这样拿到的才是 100% 无损原画文件，微课也能流畅看高清原画，还能永久防丢。\n\n祝孩子们复习顺利，考出理想好成绩！💪`;
      } else {
        text = `【优质教辅资源分享】${res.title}\n━━━━━━━━━━━━━━━━━━━\n📌 适用学段：${stageName} · ${grade} · ${subject}\n💾 文件规格：${fileSize} · ${fileType}\n✨ 资源特色：100% A4 矢量可打印无损真题 + 名师微课原画解析\n\n📥 获取链接：\n${linkText}\n\n💡 转存说明：网盘直链预览通常会被压缩画质，建议先【转存到个人网盘】后下载使用，即享无损原画及永久保存特权。\n来源：学霸网 (xuebaw.com)`;
      }
      this.generatedCopyText.set(text);
    } else {
      // 批量合集模式
      const items = this.batchCopyResources();
      const count = items.length;
      const itemsList = items.map((it, idx) => `${idx + 1}. 【${it.grade || ''}${it.subject || ''}】${it.title}`).join('\n');
      
      let batchLinksText = '';
      if (target === 'landing') {
        batchLinksText = items.map((it, idx) => `${idx + 1}. ${it.title} ➔ https://xuebaw.com/resource/${it.slug}`).join('\n');
      } else {
        batchLinksText = items.map((it, idx) => {
          const l = (it.links && it.links.length > 0) ? (it.links.find(x => x.is_primary) || it.links[0]) : null;
          return `${idx + 1}. ${it.title} ➔ ${l?.share_url || `https://xuebaw.com/resource/${it.slug}`}${l?.extract_code ? ` (密码:${l.extract_code})` : ''}`;
        }).join('\n');
      }

      let text = '';
      if (tab === 'xiaohongshu') {
        text = `🔥 熬夜整理！【${count} 套精选考点与名校真题密卷合集】免费分享！\n━━━━━━━━━━━━━━━━━━━\n全部涵盖完整 PDF 试卷与名师精讲微课，资料清单：\n${itemsList}\n\n📥 完整资料包传送门（建议先点转存防失效）：\n${batchLinksText}\n\n💡 学霸提醒：直接在线试看网盘会压缩画质，强烈建议点进去先点击【保存到网盘 / 转存】！转存后再下载才是 100% 矢量高清原画，A4 打印字迹绝不发虚，永久私存再也不怕链接被删啦～\n\n需要的家长和同学抓紧存，祝冲刺高分！💪\n#期末真题 #考前冲刺 #学霸笔记 #中小学试卷 #资料合集`;
      } else if (tab === 'wechat') {
        text = `各位家长/老师好，整理了一批很实用的备考资料合集，包含【${count} 套试卷与微课视频】：\n\n${itemsList}\n\n已汇总在网盘，需要的可以先转存到自己网盘慢慢看：\n${batchLinksText}\n\n⚠️ 提醒：建议先点【保存到网盘/转存】再下载，这样是高清无损格式，A4 打印超清晰，视频也是原画。祝孩子们学习进步！`;
      } else {
        text = `【${count} 套教辅与试卷精选合集包】\n━━━━━━━━━━━━━━━━━━━\n收录明细：\n${itemsList}\n\n📥 获取链接：\n${batchLinksText}\n\n💡 说明：建议先转存至个人网盘后再行下载，方可享受无损 A4 打印与高清原画微课。\n整理分享自：学霸网 (xuebaw.com)`;
      }
      this.generatedCopyText.set(text);
    }
  }

  async copyGeneratedText() {
    const text = this.generatedCopyText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(this.i18n.t('copyWriter.copied'), 'success');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast(this.i18n.t('copyWriter.copied'), 'success');
    }
  }

  // --- 📢 推广主站与整站宣发中心状态与逻辑 ---
  isSitePromoModalOpen = signal<boolean>(false);
  sitePromoActiveTab = signal<'xiaohongshu' | 'wechat' | 'forum' | 'bio'>('xiaohongshu');
  generatedSitePromoText = signal<string>('');

  openSitePromoModal() {
    this.generateSitePromoText();
    this.isSitePromoModalOpen.set(true);
  }

  closeSitePromoModal() {
    this.isSitePromoModalOpen.set(false);
  }

  setSitePromoTab(tab: 'xiaohongshu' | 'wechat' | 'forum' | 'bio') {
    this.sitePromoActiveTab.set(tab);
    this.generateSitePromoText();
  }

  generateSitePromoText() {
    const tab = this.sitePromoActiveTab();
    const count = this.resources().length || 3000;
    const countStr = count.toLocaleString();

    let text = '';
    if (tab === 'xiaohongshu') {
      text = `家有中小学/备考的速存！终于找到了这个良心教辅真题站😭\n\n挖到了宝藏学习资源库：【学霸网】(https://xuebaw.com)！\n\n📌 为什么一定要收藏？\n1. 超全收录：目前已整理 ${countStr}+ 套真题密卷，涵盖小学 1-6 年级、初中中考、高中高考、教师资格证、公务员省考国考！\n2. 100% 矢量无损排版：A4 纸直接打印超级清晰，公式和手写笔迹绝不模糊，内含名校名师高清微课解析视频。\n3. 免解压密码：直接一键转存到自己网盘，永久私存防失效！\n\n💡 备考冲刺直接省下几百块买试卷辅导书的费用，赶紧存到浏览器书签/网盘备用，随时随地调阅！\n#中小学试卷 #备考资料 #名校期末卷 #初中中考 #高考冲刺 #教师资格证 #学霸网`;
    } else if (tab === 'wechat') {
      text = `各位家长/考友们好，给大家分享一个非常实用的真题资源网站【学霸网】(https://xuebaw.com)。\n\n网站已收录整理了 ${countStr}+ 套中小学名校期末真题、中高考冲刺密卷、教资及公考备考资料，全部是 A4 矢量排版，打印出来字迹清晰，还配有名校名师微课讲解。\n\n全站资料免费调阅，建议大家点开后顺手先保存到自己的网盘备用，免去平时到处找试卷买资料的繁琐。祝孩子们学习进步！💪`;
    } else if (tab === 'forum') {
      text = `【资源汇总】中小学各学段名校真题密卷与备考微课全套免费调阅（持续更新中）\n━━━━━━━━━━━━━━━━━━━\n📚 站点名称：学霸网 (https://xuebaw.com)\n📊 在库规模：${countStr}+ 套精选题库，每日自动化巡检\n🎯 覆盖专区：小学(1-6年级) / 初中中考 / 高中高考 / 教师资格证 / 考公升学\n✨ 核心优势：100% 矢量 A4 纸极清可打印原版、名师微课原画、免解压密码、网盘一键极速转存\n\n📥 官网直达通道：https://xuebaw.com\n官方备考交流群：625248438\n建议收藏到浏览器书签备用！`;
    } else {
      text = `学霸网 (https://xuebaw.com) - 专注中小学名校期末真题与教资公考刚需教辅，收录 ${countStr}+ 套真题，支持无损 A4 极清打印与原画微课一键转存！`;
    }
    this.generatedSitePromoText.set(text);
  }

  async copySitePromoText() {
    const text = this.generatedSitePromoText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(this.i18n.t('sitePromo.copied'), 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast(this.i18n.t('sitePromo.copied'), 'success');
    }
  }

  async copySiteUrlOnly() {
    const url = 'https://xuebaw.com';
    try {
      await navigator.clipboard.writeText(url);
      this.showToast(this.i18n.t('sitePromo.urlCopied'), 'success');
    } catch {
      this.showToast('官方网址：' + url, 'success');
    }
  }
}


