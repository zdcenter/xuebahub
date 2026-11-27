import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceService, ResourceItemDto, ResourceTransferPackage, NetdiskAccountDto, TransferShareResultDto, ChannelDto, CategoryDto, NavMenuDto, RegionDto, SchoolDto, DashboardStatsDto, HotSearchDto, SiteSettingDto, ResourceRequestDto, TelegramConfigDto, TelegramChannelDto, TelegramBroadcastChannelDto, ResourceDraftDto, CrawlerStatsDto, CollectionDto } from '../services/resource.service';
import { MemberService, MemberLevelDto, ActivationCodeDto, FrontUserDto } from '../services/member.service';
import { CoverGeneratorService } from '../services/cover-generator.service';
import { I18nService } from '../services/i18n.service';
import { SmartMetaHelperService, AiConfig } from '../services/smart-meta-helper.service';
import { APP_VERSION } from '../version';
import { parseMarkdown } from '../utils/markdown.util';

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
    label: '小学阶段',
    grades: ['通用 (1-6年级通用)', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
    subjects: ['通用/全科', '数学', '语文', '英语', '奥数思维培优', '科学'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '外研版 (英语)', '冀教版', '沪教版']
  },
  junior: {
    key: 'junior',
    label: '初中阶段',
    grades: ['通用 (初中全阶段通用)', '七年级', '八年级', '九年级', '初三/中考冲刺'],
    subjects: ['中考综合/全科', '数学', '语文', '英语', '物理', '化学', '道德与法治', '历史', '生物', '地理'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '华师大版', '外研版']
  },
  senior: {
    key: 'senior',
    label: '高中阶段',
    grades: ['通用 (高中全阶段通用)', '高一', '高二', '高三', '高三/高考总复习'],
    subjects: ['高考综合/全科', '数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理'],
    editions: ['通用版本', '人教版 (新高考)', '北师大版', '苏教版', '外研版']
  },
  kindergarten: {
    key: 'kindergarten',
    label: '幼小衔接',
    grades: ['学前通用', '大班幼小衔接', '拼音识字启蒙', '幼小思维拓展'],
    subjects: ['学前综合礼包', '拼音启蒙', '幼小衔接识字', '思维数学启蒙', '看图说话与专注力'],
    editions: ['通用版本', '教育部学前指导版', '幼教启蒙精选版']
  },
  cert: {
    key: 'cert',
    label: '教师资格证',
    grades: ['教师资格统考通用', '小学教师资格证', '中学教师资格证', '幼儿教师资格证', '普通话等级考试'],
    subjects: ['统考全套考点', '综合素质 (科一)', '教育知识与能力 (科二)', '保教知识与能力', '学科知识与教学能力 (科三)', '面试试讲教案'],
    editions: ['国家考试大纲通用', '中公教育配套', '粉笔教育配套']
  },
  exam: {
    key: 'exam',
    label: '考公考研',
    grades: ['统考大纲通用', '国家公务员考试 (国考)', '多省公务员联考 (省考)', '事业单位统考', '全国硕士研究生统考 (考研)'],
    subjects: ['备考全套大礼包', '申论提分范文与热点', '行测高频速算与技巧', '考研政治核心背诵', '考研英语词汇与长难句', '考研数学'],
    editions: ['国家考试大纲通用', '华图教育版', '中公教育版', '粉笔教育版']
  },
  classic: {
    key: 'classic',
    label: '学科经典/竞赛名著',
    grades: ['通用/典藏', '文史政典籍', '大学数理经典', '竞赛奥赛培优', '通识科学人文'],
    subjects: ['文史政经典', '大学物理与数理', '学科竞赛培优', '通识科学人文'],
    editions: ['权威典藏全集版', '影印原著权威版', '大学名校教材版', '中学生竞赛培优版', '国家通用版']
  }
};

import { EmailHubComponent } from '../components/email-hub/email-hub.component';
import { SeoHubComponent } from '../components/seo-hub/seo-hub.component';
import { PosterModalComponent } from '../components/poster-modal/poster-modal.component';
import { VideoScriptModalComponent } from '../components/video-script-modal/video-script-modal.component';
import { QuickPasteModalComponent, ParsedItem } from '../components/quick-paste-modal/quick-paste-modal.component';
import { TransferModalComponent } from '../components/transfer-modal/transfer-modal.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, EmailHubComponent, SeoHubComponent, PosterModalComponent, VideoScriptModalComponent, QuickPasteModalComponent, TransferModalComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit, OnDestroy {
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

  // 📝 内容介绍 Markdown 实时预览切换
  newPreviewDesc = signal<boolean>(false);
  editPreviewDesc = signal<boolean>(false);

  renderMarkdown(text: string | null | undefined): string {
    return parseMarkdown(text);
  }

  // 编译构建版本号信息
  appVersion = APP_VERSION;

  copyVersionInfo() {
    const text = `${this.appVersion.fullText} (构建时间: ${this.appVersion.buildTime})`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(`📋 ${this.i18n.t('system.versionCopied')} ${this.appVersion.fullText}`, 'success');
      }).catch(() => {
        this.showToast(text);
      });
    } else {
      this.showToast(text);
    }
  }

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

  currentTab = signal<'list' | 'add' | 'edit' | 'stats' | 'crawler' | 'collector' | 'drafts' | 'scout' | 'email' | 'seo' | 'accounts' | 'channels' | 'categories' | 'navmenus' | 'schools' | 'hotsearches' | 'searchlogs' | 'collections' | 'settings' | 'requests' | 'members'>('list');
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

  // 服务端真分页与总数聚合状态
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalCount = signal<number>(0);
  totalPages = signal<number>(1);
  jumpPageInput = signal<string>('1');
  channelCounts = signal<Record<string, number>>({ all: 0, edu: 0, book: 0 });
  stageCounts = signal<Record<string, number>>({ all: 0, primary: 0, junior: 0, senior: 0, cert: 0, exam: 0 });

  paginationRangeStart = computed(() => {
    if (this.totalCount() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  paginationRangeEnd = computed(() => {
    return Math.min(this.currentPage() * this.pageSize(), this.totalCount());
  });

  pageList = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: number[] = [];
    pages.push(1);
    if (current > 4) {
      pages.push(-1); // -1 表示省略号
    }
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (current < total - 3) {
      pages.push(-1);
    }
    pages.push(total);
    return pages;
  });

  // 列表筛选与统计：支持一键切换“全部 / 仅失效 / 仅用户报错 / 仅失效与报错”
  listFilter = signal<'all' | 'invalid' | 'reported' | 'dead_or_reported'>('all');

  invalidResourceCount = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'invalid')).length;
  });

  reportedResourceCount = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'reported')).length;
  });

  deadOrReportedCount = computed(() => {
    return this.resources().filter(r => r.links?.some(l => l.status === 'invalid' || l.status === 'reported')).length;
  });

  // 列表多维分类快捷筛选 (100% 动态读取数据库 categories 字典)
  currentStageFilter = signal<string>('all');
  currentGradeFilter = signal<string>('all');
  currentTermFilter = signal<string>('all');
  currentSubjectFilter = signal<string>('all');
  currentEditionFilter = signal<string>('all');
  currentSchoolFilter = signal<string>('');
  currentAccountFilter = signal<string>('all');
  currentCollectionFilter = signal<string>('all');
  adminKeyword = signal<string>('');

  // 📚 动态年级选项：跟随选中的学段严格物理隔离（数据库驱动）
  filterGradeOptions = computed(() => {
    const stage = this.currentStageFilter();
    return this.getGradesByStage(stage);
  });

  // 📚 动态学科选项：跟随选中的学段严格物理隔离（数据库驱动）
  filterSubjectOptions = computed(() => {
    const stage = this.currentStageFilter();
    return this.getSubjectsByStage(stage);
  });

  // 📚 动态教材版本选项：优先读取数据库 edition 字典
  filterEditionOptions = computed(() => {
    const stage = this.currentStageFilter();
    return this.getEditionsByStage(stage);
  });

  // 📚 动态学期分册选项：读取数据库 term 字典（如上册、下册、全一册、必修一等）
  filterTermOptions = computed(() => {
    const dbTerms = this.allCategories().filter(c => c.type === 'term');
    if (dbTerms.length > 0) {
      return dbTerms.map(t => ({ name: t.name, icon: t.icon || '📅' }));
    }
    return [
      { name: '上册', icon: '🍂' },
      { name: '下册', icon: '🌱' },
      { name: '全一册', icon: '📗' },
      { name: '必修一', icon: '📘' },
      { name: '必修二', icon: '📘' },
      { name: '必修三', icon: '📘' },
      { name: '选择性必修一', icon: '📙' },
      { name: '选择性必修二', icon: '📙' }
    ];
  });

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
    if (stage === 'all') return this.stageCounts()['all'] ?? this.totalCount();
    return this.stageCounts()[stage] ?? 0;
  }

  filterByStage(stage: string) {
    this.currentStageFilter.set(stage);
    // 切换学段时，年级和学科级联归零
    this.currentGradeFilter.set('all');
    this.currentSubjectFilter.set('all');
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterByGrade(grade: string) {
    this.currentGradeFilter.set(grade);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterByTerm(term: string) {
    this.currentTermFilter.set(term);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterBySubject(subject: string) {
    this.currentSubjectFilter.set(subject);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterByEdition(edition: string) {
    this.currentEditionFilter.set(edition);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

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
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterByAccount(accountId: string) {
    this.currentAccountFilter.set(accountId);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filterByCollection(collectionId: string) {
    this.currentCollectionFilter.set(collectionId);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  viewCollectionMembers(col: CollectionDto) {
    this.currentTab.set('list');
    this.currentChannelFilter.set('all');
    this.currentStageFilter.set('all');
    this.currentGradeFilter.set('all');
    this.currentTermFilter.set('all');
    this.currentSubjectFilter.set('all');
    this.currentEditionFilter.set('all');
    this.currentSchoolFilter.set('');
    this.currentAccountFilter.set('all');
    this.adminKeyword.set('');
    this.listFilter.set('all');
    this.currentCollectionFilter.set(col.id);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  getCollectionTitle(collectionId: string): string {
    if (collectionId === 'none') return '未归入任何专辑';
    return this.collections().find(c => c.id === collectionId)?.title || '指定专辑';
  }

  channelCount(channelSlug: string): number {
    if (channelSlug === 'all') return this.channelCounts()['all'] ?? 0;
    return this.channelCounts()[channelSlug] ?? 0;
  }

  clearAllFilters() {
    this.currentChannelFilter.set('all');
    this.currentStageFilter.set('all');
    this.currentGradeFilter.set('all');
    this.currentTermFilter.set('all');
    this.currentSubjectFilter.set('all');
    this.currentEditionFilter.set('all');
    this.currentSchoolFilter.set('');
    this.currentAccountFilter.set('all');
    this.currentCollectionFilter.set('all');
    this.adminKeyword.set('');
    this.listFilter.set('all');
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.jumpPageInput.set(String(page));
    this.loadResources();
  }

  changePageSize(newSize: string | number) {
    const size = typeof newSize === 'number' ? newSize : parseInt(String(newSize), 10);
    if (isNaN(size) || size <= 0) return;
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  applyJumpPage() {
    const p = parseInt(this.jumpPageInput(), 10);
    if (!isNaN(p) && p >= 1 && p <= this.totalPages()) {
      this.goToPage(p);
    } else {
      this.jumpPageInput.set(String(this.currentPage()));
    }
  }

  setListFilter(filter: 'all' | 'invalid' | 'reported' | 'dead_or_reported') {
    this.listFilter.set(filter);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  // --- 全站资料完整导出备份 (JSON) ---
  isExportingBackup = signal<boolean>(false);

  exportAllResourcesBackup() {
    this.isExportingBackup.set(true);
    this.showToast('正在导出全站资料及网盘链接备份...');
    this.resService.list({
      channel: 'all',
      stage: 'all',
      grade: 'all',
      term: 'all',
      subject: 'all',
      edition: 'all',
      account_id: 'all',
      page: 1,
      limit: 10000
    }).subscribe({
      next: (res) => {
        this.isExportingBackup.set(false);
        const data = {
          export_time: new Date().toISOString(),
          version: '1.0',
          total: res.items?.length || 0,
          channels: this.channels() || [],
          categories: this.categories() || [],
          resources: res.items || []
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.href = url;
        a.download = `xuebaw_resources_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`🎉 成功导出 ${data.total} 套资料的完整 JSON 备份！`, 'success');
      },
      error: (err) => {
        this.isExportingBackup.set(false);
        this.showToast('导出备份失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  // --- 草稿箱智能查重与多网盘合并 ---
  findDuplicateResource(title: string): ResourceItemDto | undefined {
    if (!title || !this.resources().length) return undefined;
    const clean = title.trim().toLowerCase().replace(/[\s\-_【】\[\]（）()]/g, '');
    if (clean.length < 3) return undefined;
    return this.resources().find(r => {
      const t = r.title.trim().toLowerCase().replace(/[\s\-_【】\[\]（）()]/g, '');
      return t === clean || (t.length >= 6 && clean.length >= 6 && (t.includes(clean) || clean.includes(t)));
    });
  }

  mergeDraftIntoResource(draft: any, existing: ResourceItemDto) {
    if (!draft || !existing?.id) return;
    const links = Array.isArray(existing.links) ? [...existing.links] : [];
    if (links.some(l => l.share_url === draft.share_url)) {
      this.showToast('该网盘链接已存在于《' + existing.title + '》中，无需重复合并', 'error');
      return;
    }
    links.push({
      drive_type: draft.drive_type || 'quark',
      share_url: draft.share_url,
      extract_code: draft.extract_code || '',
      file_size: draft.file_size || '',
      file_type: 'PDF',
      is_primary: false,
      status: 'active'
    });
    this.resService.update(existing.id, { title: existing.title, links }).subscribe({
      next: () => {
        this.resService.updateCrawlerDraftStatus(draft.id, 'approved').subscribe({
          next: () => {
            this.showToast(`🎉 成功将网盘链接追加至已有资料《${existing.title}》，已生成多网盘合集！`, 'success');
            this.loadCrawlerDrafts();
            this.loadCrawlerConfigAndStats();
            this.loadResources();
          }
        });
      },
      error: (err) => this.showToast(`合并失败: ${err.error?.message || err.message}`, 'error')
    });
  }

  // --- ⚡ 快速补链与换链微弹窗 (Quick In-Place Link Repair Modal) ---
  isQuickLinkModalOpen = signal<boolean>(false);
  quickLinkTarget = signal<ResourceItemDto | null>(null);
  quickLinkList = signal<any[]>([]);
  isSavingQuickLinks = signal<boolean>(false);
  quickLinkTransferringIndex = signal<number | null>(null);

  openQuickLinkModal(res: ResourceItemDto, event?: Event) {
    if (event) event.stopPropagation();
    this.quickLinkTarget.set(res);
    const rawLinks = res.links && res.links.length > 0 ? res.links : [];
    const list = rawLinks.length > 0
      ? rawLinks.map(l => ({
          id: l.id,
          drive_type: l.drive_type || 'quark',
          share_url: l.share_url || '',
          extract_code: l.extract_code || '',
          file_size: l.file_size || '15.0 MB',
          file_type: l.file_type || 'PDF',
          status: l.status || 'active',
          is_primary: Boolean(l.is_primary)
        }))
      : [{
          drive_type: 'quark',
          share_url: '',
          extract_code: '',
          file_size: '15.0 MB',
          file_type: 'PDF',
          status: 'active',
          is_primary: true
        }];

    if (!list.some(l => l.is_primary)) {
      list[0].is_primary = true;
    }
    this.quickLinkList.set(list);
    this.isQuickLinkModalOpen.set(true);
  }

  closeQuickLinkModal() {
    this.isQuickLinkModalOpen.set(false);
    this.quickLinkTarget.set(null);
    this.quickLinkList.set([]);
    this.quickLinkTransferringIndex.set(null);
  }

  addQuickLinkRow() {
    const list = [...this.quickLinkList()];
    const hasQuark = list.some(l => l.drive_type === 'quark');
    const defaultDrive = hasQuark ? 'baidu' : 'quark';
    list.push({
      drive_type: defaultDrive,
      share_url: '',
      extract_code: '',
      file_size: list[0]?.file_size || '15.0 MB',
      file_type: 'PDF',
      status: 'active',
      is_primary: false
    });
    this.quickLinkList.set(list);
  }

  removeQuickLinkRow(index: number) {
    const list = [...this.quickLinkList()];
    if (list.length <= 1) {
      this.showToast('至少需要保留一个网盘分享链接！', 'error');
      return;
    }
    const wasPrimary = list[index].is_primary;
    list.splice(index, 1);
    if (wasPrimary && list.length > 0) {
      list[0].is_primary = true;
    }
    this.quickLinkList.set(list);
  }

  setPrimaryQuickLink(index: number) {
    const list = this.quickLinkList().map((l, i) => ({
      ...l,
      is_primary: i === index
    }));
    this.quickLinkList.set(list);
  }

  quickTransferInModal(index: number) {
    const list = this.quickLinkList();
    const item = list[index];
    if (!item || !item.share_url || item.drive_type !== 'quark') return;

    this.quickLinkTransferringIndex.set(index);
    this.showToast('🔄 正在将该夸克链接转存至您的网盘并生成专属推广链接...');

    this.resService.autoTransferAndShare({
      share_url: item.share_url,
      passcode: item.extract_code || ''
    }).subscribe({
      next: (result) => {
        this.quickLinkTransferringIndex.set(null);
        if (result && result.new_share_url) {
          list[index].share_url = result.new_share_url;
          list[index].status = 'active';
          if (result.file_size) list[index].file_size = result.file_size;
          if (result.extract_code) list[index].extract_code = result.extract_code;
          this.quickLinkList.set([...list]);
          this.showToast('⚡ 转存换链成功！已自动替换为您专属的夸克分成推广链接！', 'success');
        } else {
          this.showToast('转存完成，但未返回新链接', 'error');
        }
      },
      error: (err) => {
        this.quickLinkTransferringIndex.set(null);
        this.showToast(err?.error?.message || '转存换链失败，请确认网盘账号管理中 Cookie 正常', 'error');
      }
    });
  }

  saveQuickLinks() {
    const target = this.quickLinkTarget();
    if (!target?.id) return;
    const list = this.quickLinkList();

    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l.share_url || !l.share_url.trim()) {
        this.showToast(`第 ${i + 1} 个网盘链接的分享地址不能为空！`, 'error');
        return;
      }
      if (!l.share_url.startsWith('http://') && !l.share_url.startsWith('https://')) {
        this.showToast(`第 ${i + 1} 个网盘链接必须以 http:// 或 https:// 开头！`, 'error');
        return;
      }
    }

    this.isSavingQuickLinks.set(true);
    this.resService.quickUpdateLinks(target.id, list).subscribe({
      next: () => {
        this.isSavingQuickLinks.set(false);
        this.closeQuickLinkModal();
        this.showToast(`🎉 成功修复《${target.title}》的网盘链接，已恢复为正常健康状态！`, 'success');
        this.loadResources();
        this.loadDashboardStats();
      },
      error: (err) => {
        this.isSavingQuickLinks.set(false);
        this.showToast('保存补链失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  // --- 🧹 批量提交死链至百度搜索资源平台下线 ---
  isPushingDeadLinks = signal<boolean>(false);

  batchPushSelectedDeadLinksToBaidu() {
    const ids = this.selectedResourceIds();
    if (!ids || ids.length === 0) {
      this.showToast('请先勾选需要向搜索引擎提交死链下线的资料！', 'error');
      return;
    }

    this.isPushingDeadLinks.set(true);
    this.showToast('正在向百度搜索资源平台提交死链下线...');
    this.resService.pushDeadLinksToSeo({ resource_ids: ids }).subscribe({
      next: (res: any) => {
        this.isPushingDeadLinks.set(false);
        this.showToast(res.summary_message || `🎉 成功向百度死链接口提交 ${res.total_urls || ids.length} 条死链删除申请！`, 'success');
        this.clearResourceSelection();
      },
      error: (err: any) => {
        this.isPushingDeadLinks.set(false);
        this.showToast('死链提交失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

  onKeywordSearch() {
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
    this.loadResources();
  }

  filteredResources = computed(() => {
    const school = this.currentSchoolFilter().trim();
    let list = this.resources();
    if (school) {
      list = list.filter(r => r.school && r.school.includes(school));
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

  isCheckingCurrentPage = signal<boolean>(false);

  // 立即并发探测当前页展示的全部网盘链接
  checkCurrentPageLinks() {
    const list = this.resources();
    if (!list || list.length === 0) {
      this.showToast('当前页暂无资料可巡检');
      return;
    }
    const resourceIds = list.map(r => r.id).filter((id): id is string => Boolean(id));
    this.isCheckingCurrentPage.set(true);
    this.showToast(`🔍 正在精准并发探测当前页 ${list.length} 套资料的网盘链接...`);

    this.resService.batchCheckLinks({
      resource_ids: resourceIds,
      force: true,
      limit: 100
    }).subscribe({
      next: (res) => {
        this.isCheckingCurrentPage.set(false);
        if (res.results && res.results.length > 0) {
          const resultMap = new Map<string, any>();
          for (const item of res.results) {
            resultMap.set(item.link_id, item);
          }
          const current = this.resources();
          for (const r of current) {
            if (r.links) {
              for (const l of r.links) {
                if (l.id) {
                  const checked = resultMap.get(l.id);
                  if (checked) {
                    l.status = checked.status;
                    l.invalid_reason = checked.invalid_reason;
                    l.last_checked_at = checked.checked_at;
                  }
                }
              }
            }
          }
          this.resources.set([...current]);
        }
        this.loadDashboardStats();
        if (res.invalid_count > 0) {
          this.showToast(`⚠️ 本页巡检完成：检测 ${res.checked_count} 条，存活 ${res.active_count} 条，发现 ${res.invalid_count} 条失效！已高亮标红`, 'error');
        } else {
          this.showToast(`✅ 本页巡检完毕：${res.checked_count} 条网盘链接全部存活正常！`, 'success');
        }
      },
      error: (err: any) => {
        this.isCheckingCurrentPage.set(false);
        this.showToast('本页链接巡检失败: ' + (err.error?.message || err.message), 'error');
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

  // --- 跨站资料包同步与导入导出控制 ---
  showTransferModal = signal<boolean>(false);

  openTransferModal() {
    this.showTransferModal.set(true);
  }

  closeTransferModal() {
    this.showTransferModal.set(false);
  }

  onTransferImported(result: { total: number; imported: number }) {
    this.showToast(this.i18n.t('transfer.importSuccess').replace('{count}', String(result.imported)));
    this.loadResources();
  }

  // 批量复制已勾选资料数据包至剪贴板
  copySelectedResourcesPackage() {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) {
      this.showToast(this.i18n.t('transfer.copyEmpty'), 'error');
      return;
    }

    const currentList = this.resources();
    const selectedItems = currentList.filter(item => item.id && ids.includes(item.id));
    if (selectedItems.length === 0) {
      this.showToast(this.i18n.t('transfer.copyEmpty'), 'error');
      return;
    }

    this.copyResourcesAsPackage(selectedItems);
  }

  // 复制单条资料数据包至剪贴板
  copySingleResourcePackage(item: ResourceItemDto) {
    if (!item) return;
    this.copyResourcesAsPackage([item]);
  }

  private copyResourcesAsPackage(items: ResourceItemDto[]) {
    const cleanResources = items.map(res => {
      return {
        title: res.title,
        subtitle: res.subtitle || '',
        description: res.description || '',
        channel_slug: res.channel_slug || 'edu',
        stage: res.stage,
        grade: res.grade,
        term: res.term || '',
        subject: res.subject,
        edition: res.edition,
        region: res.region || '',
        school: res.school || '',
        file_type: res.file_type || 'PDF',
        file_size: res.file_size || '',
        page_count: res.page_count || 0,
        cover_image: res.cover_image || '',
        file_tree: res.file_tree || [],
        is_published: true, // 严格按用户指示：直接设为已上架
        is_recommended: res.is_recommended || false,
        links: (res.links || []).map(l => ({
          drive_type: l.drive_type,
          share_url: l.share_url,
          extract_code: l.extract_code || '',
          password_hint: l.password_hint || '',
          is_primary: l.is_primary,
          file_size: l.file_size || res.file_size || '',
          file_type: l.file_type || res.file_type || 'PDF',
          resource_desc: l.resource_desc || ''
        }))
      };
    });

    const pkg: ResourceTransferPackage = {
      type: 'XUEBA_RESOURCE_TRANSFER_PACKAGE',
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: '学霸网后台管理',
      count: cleanResources.length,
      resources: cleanResources
    };

    const jsonStr = JSON.stringify(pkg, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonStr).then(() => {
        this.showToast(this.i18n.t('transfer.copySuccess').replace('{count}', String(cleanResources.length)));
      }).catch(() => {
        this.fallbackCopyPackage(jsonStr, cleanResources.length);
      });
    } else {
      this.fallbackCopyPackage(jsonStr, cleanResources.length);
    }
  }

  private fallbackCopyPackage(text: string, count: number) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    this.showToast(this.i18n.t('transfer.copySuccess').replace('{count}', String(count)));
  }

  onQuickPasteDraftCreated() {
    this.loadCrawlerDrafts();
    this.loadCrawlerConfigAndStats();
    this.loadResources();
  }

  onQuickPasteDirectPublish(item: ParsedItem) {
    this.switchTab('add');
    this.newResource.title = item.title;

    const raw = item.rawResource || {};
    const links = Array.isArray(raw.links) ? raw.links : [];
    const quarkLink = links.find((l: any) => l.drive_type === 'quark') || (item.driveType === 'quark' ? {
      share_url: item.shareUrl,
      extract_code: item.extractCode,
      file_size: item.fileSize,
      file_type: 'PDF'
    } : null);

    const baiduLink = links.find((l: any) => l.drive_type === 'baidu') || (item.driveType === 'baidu' ? {
      share_url: item.shareUrl,
      extract_code: item.extractCode,
      file_size: item.fileSize,
      file_type: 'PDF'
    } : null);

    // 真实文件大小：绝不虚假兜底 15.0 MB
    const realSize = item.fileSize || raw.file_size || quarkLink?.file_size || baiduLink?.file_size || '';
    this.newResource.file_size = realSize;

    // 全自动智能推断：学科、学段、年级、学期/分册、教材版本、通俗 SEO 副标题与结构化内容说明
    const meta = this.smartMeta.inferMeta(item.title);
    this.newResource.stage = item.stage || meta.stage;
    this.newResource.grade = item.grade || meta.grade;
    this.newResource.term = item.term || raw.term || meta.term || '';
    this.newResource.subject = item.subject || meta.subject;
    this.newResource.edition = item.edition || meta.edition;
    this.newResource.channel_slug = item.channelSlug || raw.channel_slug || meta.channel_slug;
    this.newResource.subtitle = item.subtitle || meta.selectedSubtitle;
    this.cachedNewSubtitles = meta.subtitles;
    this.newSubtitleIndex = 0;
    if (item.description) {
      this.newResource.description = item.description;
    } else if (!this.newResource.description || this.newResource.description.trim() === '') {
      this.newResource.description = meta.description;
    }
    if (meta.has_video) {
      this.newResource.has_video = true;
    }
    this.onStageChange('new');

    // 注入网盘链接、提取码以及夸克/百度文件大小！
    if (quarkLink) {
      this.newResource.quarkUrl = quarkLink.share_url || item.shareUrl || '';
      this.newResource.quarkFileSize = quarkLink.file_size || item.fileSize || realSize;
      this.newResource.quarkFileType = quarkLink.file_type || 'PDF';
      this.newResource.quarkDesc = quarkLink.resource_desc || '';
    } else {
      this.newResource.quarkUrl = '';
      this.newResource.quarkFileSize = '';
    }

    if (baiduLink) {
      this.newResource.baiduUrl = baiduLink.share_url || '';
      this.newResource.baiduCode = baiduLink.extract_code || item.extractCode || '';
      this.newResource.baiduFileSize = baiduLink.file_size || realSize;
      this.newResource.baiduFileType = baiduLink.file_type || 'PDF';
      this.newResource.baiduDesc = baiduLink.resource_desc || '';
    } else {
      this.newResource.baiduUrl = '';
      this.newResource.baiduCode = '';
      this.newResource.baiduFileSize = '';
    }

    // 注入网盘目录结构 file_tree
    if (raw.file_tree && Array.isArray(raw.file_tree)) {
      this.newResource.file_tree = raw.file_tree;
    } else {
      this.newResource.file_tree = [];
    }

    this.showToast('✅ 已将完整数据填入发布表单，已同步文件大小与目录结构！', 'success');
  }

  openCrawlerPasteModal() {
    this.openQuickPasteModal();
  }

  closeCrawlerPasteModal() {
    this.closeQuickPasteModal();
  }

  // --- 🧩 浏览器采集助手 (v1.4.0) 专属大屏与配置系统 ---
  collectorApiBaseUrl = computed(() => {
    if (typeof window === 'undefined') return 'http://localhost:4001';
    const host = window.location.hostname;
    return (host === 'localhost' || host === '127.0.0.1') ? 'http://localhost:4001' : 'https://api.xuebaw.com:8443';
  });

  collectorAdminToken = computed(() => {
    return this.resService.getToken() || (typeof window !== 'undefined' ? (localStorage.getItem('token') || '') : '');
  });

  installCollectorOnline() {
    if (typeof window !== 'undefined') {
      window.open('/xuebaw-collector.user.js', '_blank');
      this.showToast('🚀 已在新标签页调起油猴脚本安装！若已装 Tampermonkey 将自动弹出安装更新面板。', 'success');
    }
  }

  downloadCollectorScript() {
    const link = document.createElement('a');
    link.href = '/xuebaw-collector.user.js';
    link.target = '_blank';
    link.download = 'xuebaw-collector.user.js';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('📥 正在下载学霸网采集助手脚本 (xuebaw-collector.user.js)', 'success');
  }

  copyCollectorCode() {
    fetch('/xuebaw-collector.user.js')
      .then(r => r.text())
      .then(code => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => {
            this.showToast('✅ v1.4.0 脚本源码已完整复制到剪贴板！', 'success');
          });
        }
      })
      .catch(() => {
        this.showToast('⚠️ 获取脚本失败，请直接点击下载脚本', 'error');
      });
  }

  copyCollectorToken() {
    const token = this.collectorAdminToken();
    if (!token) {
      this.showToast('未检测到管理员凭据，请确保已登录', 'error');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(token).then(() => {
        this.showToast('✅ 管理员认证令牌 (JWT Auth Token) 已复制！', 'success');
      });
    }
  }

  copyCollectorApi() {
    const api = this.collectorApiBaseUrl();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(api).then(() => {
        this.showToast('✅ API 接口地址已复制到剪贴板！', 'success');
      });
    }
  }

  switchToCollectorTab() {
    this.closeQuickPasteModal();
    this.switchTab('collector');
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

  batchCleanDraftTitles() {
    const ids = this.selectedDraftIds();
    if (ids.length === 0) {
      this.showToast('请先勾选要净化标题的草稿');
      return;
    }
    this.resService.batchCrawlerDraftsAction('clean_titles', ids).subscribe({
      next: (res) => {
        this.showToast(res.message || '✅ 已成功净化选中的草稿标题', 'success');
        this.loadCrawlerDrafts();
      },
      error: (err) => {
        this.showToast('净化标题失败: ' + (err.error?.message || err.message), 'error');
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

  async batchApproveDrafts(autoTransfer: boolean = false) {
    const ids = this.selectedDraftIds();
    if (ids.length === 0) {
      this.showToast('请先勾选要入库的草稿');
      return;
    }
    const tip = autoTransfer 
      ? `确定要将选中的 ${ids.length} 条草稿全自动转存到您的夸克网盘并直接上架发布吗？` 
      : `确定要将选中的 ${ids.length} 条草稿直接使用原链接批量上架发布吗？`;
    const ok = await this.confirmDialog({
      title: '批量审核入库',
      message: tip,
      confirmText: autoTransfer ? '🚀 自动转存并上架' : '⚡ 直接上架',
      type: 'info',
      icon: '📦'
    });
    if (!ok) return;

    this.showToast('正在批量审核入库中，请稍候...');
    this.resService.batchApproveCrawlerDrafts({
      ids,
      auto_transfer: autoTransfer,
      auto_publish: true
    }).subscribe({
      next: (res) => {
        this.showToast(res.message || '✅ 批量入库成功！', 'success');
        this.selectedDraftIds.set([]);
        this.loadCrawlerDrafts();
        this.loadCrawlerConfigAndStats();
      },
      error: (err) => {
        this.showToast(err?.error?.message || '批量入库失败', 'error');
      }
    });
  }

  exportResourcesCSV() {
    this.showToast('正在准备全量资料导出...');
    this.resService.exportResourcesCSV().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xuebaw_resources_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.showToast('✅ 全站资料与链接 CSV 导出成功！', 'success');
      },
      error: () => {
        this.showToast('导出失败，请重试', 'error');
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

  transferringDraftId = signal<string | null>(null);

  // 草稿箱极速一键转存换链
  quickTransferDraft(draft: ResourceDraftDto) {
    if (!draft?.share_url) {
      this.showToast('该草稿无有效分享链接', 'error');
      return;
    }
    this.transferringDraftId.set(draft.id);
    this.showToast('🔄 正在将该资源转存到您的夸克网盘并生成专属推广链接...');

    this.resService.autoTransferAndShare({
      share_url: draft.share_url,
      passcode: draft.extract_code || ''
    }).subscribe({
      next: (result) => {
        this.transferringDraftId.set(null);
        if (result && result.new_share_url) {
          draft.share_url = result.new_share_url;
          if (result.file_size) draft.file_size = result.file_size;
          if (result.extract_code) draft.extract_code = result.extract_code;
          this.showToast(`🎉 转存成功！已自动替换为您专属的夸克推广链：${result.new_share_url}`);
        }
      },
      error: (err) => {
        this.transferringDraftId.set(null);
        this.showToast(err?.error?.message || '转存失败，请检查网盘账号管理中夸克 Cookie 是否有效', 'error');
      }
    });
  }

  // 搜索需求词雷达一键补录创建
  quickCreateFromSearch(keyword: string) {
    if (!keyword) return;
    this.switchTab('add');
    this.newResource.title = keyword.trim();
    this.runLocalInference('new');
    this.showToast(`🎯 已自动填充需求词【${keyword}】并推导学科，填入网盘即可发布！`);
  }

  importDraftToResource(draft: ResourceDraftDto) {
    this.currentImportingDraftId = draft.id;
    this.switchTab('add');
    this.newResource.title = draft.title;
    this.newResource.file_size = draft.file_size && draft.file_size !== '未知' ? draft.file_size : '';
    
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
    subtitle: (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_subtitle') : '') || '',
    stage: 'primary',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    term: '',
    region: (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : '') || '',
    school: '',
    collection_id: '',
    file_type: 'PDF',
    file_size: '',
    page_count: 0,
    view_count: 0,
    save_count: 0,
    has_video: false,
    quarkUrl: '',
    quarkAccountId: '',
    quarkAccountName: '',
    quarkFileSize: '',
    quarkFileType: 'PDF',
    quarkDesc: '',
    baiduUrl: '',
    baiduCode: '',
    baiduFileSize: '',
    baiduFileType: 'PDF',
    baiduDesc: '',
    description: '',
    slug: '',
    cover_image: '',
    poster_image: '',
    file_tree: [] as any[]
  };

  // 编辑表单数据绑定
  isEditModalOpen = signal<boolean>(false);
  editForm = {
    id: '',
    channel_slug: 'edu',
    title: '',
    subtitle: (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_subtitle') : '') || '',
    stage: 'primary',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    term: '',
    region: '',
    school: '',
    collection_id: '',
    file_type: 'PDF',
    file_size: '',
    page_count: 0,
    view_count: 0,
    save_count: 0,
    has_video: false,
    is_published: true,
    quarkUrl: '',
    quarkAccountId: '',
    quarkAccountName: '',
    quarkFileSize: '',
    quarkFileType: 'PDF',
    quarkDesc: '',
    baiduUrl: '',
    baiduCode: '',
    baiduFileSize: '',
    baiduFileType: 'PDF',
    baiduDesc: '',
    description: '',
    slug: '',
    cover_image: '',
    poster_image: '',
    file_tree: [] as any[]
  };

  // 标准化学段键值（完全兼容历史中文与规范英文字符）
  normalizeStageKey(stage: string): string {
    if (!stage) return 'primary';
    const s = String(stage).trim().toLowerCase();
    if (s === 'primary' || s.includes('小学')) return 'primary';
    if (s === 'junior' || s.includes('初中') || s.includes('初一') || s.includes('初二') || s.includes('初三') || s.includes('中考')) return 'junior';
    if (s === 'senior' || s.includes('高中') || s.includes('高一') || s.includes('高二') || s.includes('高三') || s.includes('高考')) return 'senior';
    if (s === 'cert' || s.includes('教师') || s.includes('资格') || s.includes('教资') || s.includes('考证')) return 'cert';
    if (s === 'exam' || s.includes('公考') || s.includes('考研') || s.includes('公务员') || s.includes('省考') || s.includes('国考')) return 'exam';
    if (s === 'kindergarten' || s.includes('幼') || s.includes('学前')) return 'kindergarten';
    if (s === 'classic' || s.includes('经典') || s.includes('名著') || s.includes('竞赛') || s.includes('奥赛')) return 'classic';
    return this.stageOptions[s] ? s : 'primary';
  }

  // 严格判断年级是否从属于特定学段，彻底杜绝跨学段数据污染
  isGradeBelongsToStage(gradeName: string, gradeSlug: string | undefined, stageKey: string): boolean {
    const key = this.normalizeStageKey(stageKey);
    const n = gradeName || '';
    const s = gradeSlug || '';

    if (key === 'classic') {
      return /经典|名著|典籍|文史|数理|大学|竞赛|奥赛|通识|培优|通用|典藏/.test(n) || /classic/.test(s);
    }
    if (key === 'junior') {
      if (/[一二三四五六]年级|小学|高[一二三]|高考|高中|考研|公考|教资|保教|幼小/.test(n)) return false;
      return /初[一二三]|七年级|八年级|九年级|中考|初中/.test(n) || /grade-[789]|junior/.test(s);
    }
    if (key === 'senior') {
      if (/[一二三四五六]年级|小学|初[一二三]|七年级|八年级|九年级|中考|初中|考研|公考|教资|保教|幼小/.test(n)) return false;
      return /高[一二三]|高考|高中/.test(n) || /grade-(10|11|12)|senior/.test(s);
    }
    if (key === 'primary') {
      if (/初[一二三]|七年级|八年级|九年级|中考|初中|高[一二三]|高考|高中|考研|公考|教资|保教|幼小/.test(n)) return false;
      return /[一二三四五六]年级|小学|1-6年级/.test(n) || /grade-[1-6]|primary/.test(s);
    }
    if (key === 'cert') {
      return /教资|教师|资格|普通话|保教|综合素质|教育知识/.test(n) || /cert/.test(s);
    }
    if (key === 'exam') {
      return /公考|国考|省考|事业|考研|公务员|行测|申论/.test(n) || /exam/.test(s);
    }
    if (key === 'kindergarten') {
      return /学前|幼|启蒙|拼音|大班|中班|小班/.test(n) || /kindergarten/.test(s);
    }
    return false;
  }

  // 严格判断学科是否从属于特定学段，彻底杜绝跨学段学科污染
  isSubjectBelongsToStage(subjectName: string, stageKey: string): boolean {
    const key = this.normalizeStageKey(stageKey);
    const n = subjectName || '';

    if (key === 'primary') {
      // 小学阶段：严禁物理、化学、生物、历史、地理、政治、中考、高考、教资、公考混入
      if (/物理|化学|生物|历史|地理|政治|中考|高考|教资|教师|资格|公考|国考|省考|考研|申论|行测|保教|综合素质|教育知识/.test(n)) {
        return false;
      }
      return /语文|数学|英语|科学|道德与法治|奥数|信息技术|编程|通用|全科|思维/.test(n);
    }

    if (key === 'junior') {
      // 初中阶段：严禁小学科学、高中思想政治、高考综合、教资、公考混入
      if (/科学|高考|思想政治|教资|教师|资格|公考|国考|省考|考研|申论|行测|保教|综合素质|教育知识/.test(n)) {
        return false;
      }
      return /语文|数学|英语|物理|化学|道德与法治|历史|生物|地理|中考|信息技术|编程|通用|全科/.test(n);
    }

    if (key === 'senior') {
      // 高中阶段：严禁小学科学、中考、道德与法治(初中)、教资、公考混入
      if (/科学|中考|道德与法治|教资|教师|资格|公考|国考|省考|考研|申论|行测|保教|综合素质|教育知识/.test(n)) {
        return false;
      }
      return /语文|数学|英语|物理|化学|生物|思想政治|政治|历史|地理|高考|信息技术|通用|全科/.test(n);
    }

    if (key === 'cert') {
      return /综合素质|教育知识|保教知识|学科知识|普通话|教资|教师|资格|试讲|面试/.test(n);
    }

    if (key === 'exam') {
      return (/申论|行测|政治|英语|数学|公考|国考|省考|考研|公务员|备考/.test(n)) && !/高考|中考/.test(n);
    }

    if (key === 'kindergarten') {
      return /拼音|识字|思维|启蒙|学前|绘本|专注力|手工/.test(n);
    }

    if (key === 'classic') {
      return /文史|经典|名著|典籍|大学|物理|数理|高数|微积分|奥林匹克|竞赛|奥赛|通识|培优/.test(n) || /classic|olympiad|general-studies/.test(key);
    }

    return false;
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
    const grades = this.getGradesByStage(form.stage);
    const subjects = this.getSubjectsByStage(form.stage);
    const editions = this.getEditionsByStage(form.stage);

    // 如果当前选中的年级不在新学段合法列表中，自动平滑重置为新学段第1项
    if (!grades.includes(form.grade)) {
      form.grade = grades[0] || '通用';
    }
    if (!subjects.some(s => s.name === form.subject)) {
      form.subject = subjects[0]?.name || '数学';
    }
    if (!editions.some(e => e.name === form.edition)) {
      form.edition = editions[0]?.name || '人教版 (统编)';
    }
  }

  // ⚡ 智能调用 API 解析网盘真实文件大小与属性
  parsingNetdisk = signal<boolean>(false);
  parsingBaidu = signal<boolean>(false);

  // 🎨 浏览器端 HTML5 Canvas 自动生成封面预览状态与 Cloudflare R2 自定义上传
  newCoverPreview = signal<string>('');
  editCoverPreview = signal<string>('');
  isUploadingCover = signal<boolean>(false);

  // 纯化频道名称，剔除前置重复的 emoji 图标，保证界面永远单图标
  cleanChannelName(name?: string, icon?: string): string {
    if (!name) return '';
    let cleaned = name.trim();
    if (icon && cleaned.startsWith(icon)) {
      cleaned = cleaned.substring(icon.length).trim();
    }
    // 剔除开头可能存在的 emoji
    cleaned = cleaned.replace(/^[\p{Emoji}\u200d\ufe0f\s]+/u, '').trim();
    return cleaned || name;
  }

  // 自主上传本地教材/资料封面图片直传 Cloudflare R2
  handleCoverUpload(event: Event, target: 'new' | 'edit') {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.showToast('请选择有效的图片文件（JPG/PNG/WebP）', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showToast('图片文件不能超过 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (!base64) return;
      if (target === 'new') {
        this.newCoverPreview.set(base64);
      } else {
        this.editCoverPreview.set(base64);
      }

      // 立即通过接口直传 Cloudflare R2
      this.isUploadingCover.set(true);
      const slug = target === 'new' ? (this.newResource.slug || `book-${Date.now()}`) : (this.editForm.slug || `book-${Date.now()}`);
      this.resService.uploadCover(base64, slug).subscribe({
        next: (res: any) => {
          this.isUploadingCover.set(false);
          if (res && res.url) {
            if (target === 'new') {
              this.newResource.cover_image = res.url;
              this.newCoverPreview.set(res.url);
            } else {
              this.editForm.cover_image = res.url;
              this.editCoverPreview.set(res.url);
            }
            this.showToast('🎉 封面已成功直传至 Cloudflare R2 并开启全球 CDN 加速！', 'success');
          }
        },
        error: (err: any) => {
          this.isUploadingCover.set(false);
          console.warn('Cover upload to R2 failed:', err);
          this.showToast('封面上传失败，保存资料时将再次尝试直传: ' + (err.message || '网络异常'), 'error');
        }
      });
    };
    reader.readAsDataURL(file);
    // 重置 input 允许选择同名文件
    input.value = '';
  }

  // 手动更新封面 URL
  onCoverUrlChange(url: string, target: 'new' | 'edit') {
    const trimmed = (url || '').trim();
    if (target === 'new') {
      this.newResource.cover_image = trimmed;
      this.newCoverPreview.set(trimmed);
    } else {
      this.editForm.cover_image = trimmed;
      this.editCoverPreview.set(trimmed);
    }
  }

  // 清空自定义封面
  clearCover(target: 'new' | 'edit') {
    if (target === 'new') {
      this.newResource.cover_image = '';
      this.newCoverPreview.set('');
    } else {
      this.editForm.cover_image = '';
      this.editCoverPreview.set('');
    }
    this.showToast('已清空封面，电子课本将呈现统编立体仿真书皮，普通资料呈现纯文本排版', 'success');
  }

  // 宣传海报 URL 变更
  onPosterUrlChange(url: string, target: 'new' | 'edit') {
    const trimmed = (url || '').trim();
    if (target === 'new') {
      this.newResource.poster_image = trimmed;
    } else {
      this.editForm.poster_image = trimmed;
    }
  }

  // 清空宣传海报
  clearPoster(target: 'new' | 'edit') {
    if (target === 'new') {
      this.newResource.poster_image = '';
    } else {
      this.editForm.poster_image = '';
    }
    this.showToast('已清空宣传海报直链，系统将根据文件属性随时动态实时排版', 'success');
  }

  // ⚡ 将外部网络图片直链一键转存下载至自己的 Cloudflare R2
  transferRemoteCoverToR2(target: 'new' | 'edit') {
    const url = target === 'new' ? this.newResource.cover_image : this.editForm.cover_image;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      this.showToast('请先输入有效的外部网络图片链接 (http/https)', 'error');
      return;
    }
    this.isUploadingCover.set(true);
    const slug = target === 'new' ? (this.newResource.slug || `book-${Date.now()}`) : (this.editForm.slug || `book-${Date.now()}`);
    this.resService.uploadCover(url, slug).subscribe({
      next: (res: any) => {
        this.isUploadingCover.set(false);
        if (res && res.url) {
          if (target === 'new') {
            this.newResource.cover_image = res.url;
            this.newCoverPreview.set(res.url);
          } else {
            this.editForm.cover_image = res.url;
            this.editCoverPreview.set(res.url);
          }
          this.showToast('🎉 已成功将外部图片转存至您的 Cloudflare R2 并开启全球 CDN 加速！', 'success');
        }
      },
      error: (err: any) => {
        this.isUploadingCover.set(false);
        this.showToast('网络图片转存失败: ' + (err.error?.message || err.message || '网络异常'), 'error');
      }
    });
  }

  // ⚡ 将外部网络宣传海报一键转存至 Cloudflare R2
  transferRemotePosterToR2(target: 'new' | 'edit') {
    const url = target === 'new' ? this.newResource.poster_image : this.editForm.poster_image;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      this.showToast('请先输入有效的外部海报图片链接 (http/https)', 'error');
      return;
    }
    this.isUploadingCover.set(true);
    const slug = (target === 'new' ? this.newResource.slug : this.editForm.slug) || `poster-${Date.now()}`;
    const resourceId = target === 'edit' ? this.editForm.id : undefined;
    this.resService.uploadPoster(url, slug, resourceId).subscribe({
      next: (res: any) => {
        this.isUploadingCover.set(false);
        if (res && res.url) {
          if (target === 'new') {
            this.newResource.poster_image = res.url;
          } else {
            this.editForm.poster_image = res.url;
          }
          this.showToast('🎉 宣传海报已成功转存至您的 Cloudflare R2！', 'success');
        }
      },
      error: (err: any) => {
        this.isUploadingCover.set(false);
        this.showToast('海报转存失败: ' + (err.error?.message || err.message || '网络异常'), 'error');
      }
    });
  }

  // 从新增/编辑表单中直接唤起宣传海报生成器
  openPosterModalFromForm(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const mockItem: any = {
      id: target === 'edit' ? (this.editForm.id || '') : '',
      slug: form.slug || (form.title ? 'preview' : ''),
      title: form.title || '精选学习资料',
      grade: form.grade,
      subject: form.subject,
      edition: form.edition,
      file_size: form.quarkFileSize || form.file_size,
      file_tree: (form as any).file_tree || [],
      poster_image: form.poster_image || ''
    };
    this.activePosterBatch.set([]);
    this.activePosterResource.set(mockItem);
    this.isPosterModalOpen.set(true);
  }

  // 📚 全量分类字典缓存（供表单级联与全站字典联动使用）
  allCategories = signal<CategoryDto[]>([]);

  loadAllCategories() {
    this.resService.getCategories('all', '').subscribe({
      next: (list) => {
        if (list && list.length > 0) {
          this.allCategories.set(list);
          this.categories.set(list);
        }
      },
      error: (e) => console.warn('Load all categories failed:', e)
    });
  }

  // 📚 动态从数据库分类字典 categories 派生分类选项
  stageCategories = computed(() => {
    const fromDb = this.allCategories().filter(c => c.type === 'stage');
    if (fromDb.length > 0) return fromDb;
    return [
      { id: 'primary', slug: 'primary', name: '小学阶段', icon: '🎒', type: 'stage' },
      { id: 'junior', slug: 'junior', name: '初中阶段', icon: '📘', type: 'stage' },
      { id: 'senior', slug: 'senior', name: '高中阶段', icon: '🎓', type: 'stage' },
      { id: 'kindergarten', slug: 'kindergarten', name: '幼小衔接', icon: '🧸', type: 'stage' },
      { id: 'cert', slug: 'cert', name: '教师资格证', icon: '📜', type: 'stage' },
      { id: 'exam', slug: 'exam', name: '考公考研', icon: '🏛️', type: 'stage' }
    ] as unknown as CategoryDto[];
  });

  gradeCategories = computed(() => {
    return this.allCategories().filter(c => c.type === 'grade');
  });

  subjectCategories = computed(() => {
    return this.allCategories().filter(c => c.type === 'subject');
  });

  editionCategories = computed(() => {
    return this.allCategories().filter(c => c.type === 'edition');
  });

  termCategories = computed(() => {
    const fromDb = this.allCategories().filter(c => c.type === 'term');
    if (fromDb.length > 0) return fromDb;
    return [
      { id: 't1', slug: 'up', name: '上册', icon: '🍁', type: 'term' },
      { id: 't2', slug: 'down', name: '下册', icon: '🌸', type: 'term' },
      { id: 't3', slug: 'full', name: '全一册', icon: '📖', type: 'term' },
      { id: 't4', slug: 'req1', name: '必修一', icon: '📘', type: 'term' },
      { id: 't5', slug: 'req2', name: '必修二', icon: '📗', type: 'term' },
      { id: 't6', slug: 'req3', name: '必修三', icon: '📙', type: 'term' },
      { id: 't7', slug: 'sel1', name: '选择性必修一', icon: '📑', type: 'term' },
      { id: 't8', slug: 'sel2', name: '选择性必修二', icon: '📑', type: 'term' }
    ] as unknown as CategoryDto[];
  });

  // 根据当前选中学段动态获取年级选项列表
  getGradesByStage(stageKey: string): string[] {
    const key = this.normalizeStageKey(stageKey);
    let defaults: string[] = [];
    if (key === 'junior') {
      defaults = ['通用 (初中全阶段通用)', '七年级', '八年级', '九年级', '初三/中考冲刺'];
    } else if (key === 'senior') {
      defaults = ['通用 (高中全阶段通用)', '高一', '高二', '高三/高考总复习'];
    } else if (key === 'cert') {
      defaults = ['教师资格统考通用', '小学教师资格证', '中学教师资格证', '幼儿教师资格证', '普通话等级考试'];
    } else if (key === 'exam') {
      defaults = ['统考大纲通用', '国家公务员考试 (国考)', '多省公务员联考 (省考)', '事业单位统考', '全国硕士研究生统考 (考研)'];
    } else if (key === 'kindergarten') {
      defaults = ['学前通用', '大班幼小衔接', '拼音识字启蒙', '幼小思维拓展'];
    } else {
      defaults = ['通用 (1-6年级通用)', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
    }

    const dbGrades = this.allCategories().filter(c => c.type === 'grade');
    const result = [...defaults];
    for (const g of dbGrades) {
      if (this.isGradeBelongsToStage(g.name, g.slug, key)) {
        if (!result.includes(g.name)) {
          result.push(g.name);
        }
      }
    }
    return result;
  }

  // 根据当前选中学段动态精准联动学科列表 (初中呈现中考9门课，高中呈现高考核心学科，小学呈现语数英等)
  getSubjectsByStage(stageKey: string): { name: string; icon: string }[] {
    const key = this.normalizeStageKey(stageKey);
    let defaultSubjects: { name: string; icon: string }[] = [];
    if (key === 'junior') {
      defaultSubjects = [
        { name: '数学', icon: '📐' },
        { name: '语文', icon: '📖' },
        { name: '英语', icon: '🔤' },
        { name: '物理', icon: '⚡' },
        { name: '化学', icon: '🧪' },
        { name: '道德与法治', icon: '⚖️' },
        { name: '历史', icon: '🏺' },
        { name: '生物', icon: '🧬' },
        { name: '地理', icon: '🌍' },
        { name: '中考综合/全科', icon: '🎯' }
      ];
    } else if (key === 'senior') {
      defaultSubjects = [
        { name: '数学', icon: '📐' },
        { name: '语文', icon: '📖' },
        { name: '英语', icon: '🔤' },
        { name: '物理', icon: '⚡' },
        { name: '化学', icon: '🧪' },
        { name: '生物', icon: '🧬' },
        { name: '思想政治', icon: '🏛️' },
        { name: '历史', icon: '🏺' },
        { name: '地理', icon: '🌍' },
        { name: '高考综合/全科', icon: '🏆' }
      ];
    } else if (key === 'cert') {
      defaultSubjects = [
        { name: '综合素质 (科一)', icon: '📘' },
        { name: '教育知识与能力 (科二)', icon: '📗' },
        { name: '保教知识与能力', icon: '👶' },
        { name: '学科知识与教学能力 (科三)', icon: '📙' },
        { name: '普通话等级考试', icon: '🎙️' },
        { name: '统考全套考点', icon: '📋' }
      ];
    } else if (key === 'exam') {
      defaultSubjects = [
        { name: '申论提分范文与热点', icon: '🖋️' },
        { name: '行测高频速算与技巧', icon: '⚡' },
        { name: '考研政治核心背诵', icon: '🚩' },
        { name: '考研英语词汇与长难句', icon: '🔤' },
        { name: '考研数学', icon: '📐' },
        { name: '备考全套大礼包', icon: '🎁' }
      ];
    } else if (key === 'kindergarten') {
      defaultSubjects = [
        { name: '学前综合礼包', icon: '🎁' },
        { name: '拼音启蒙', icon: '🔤' },
        { name: '幼小衔接识字', icon: '📖' },
        { name: '思维数学启蒙', icon: '📐' },
        { name: '看图说话与专注力', icon: '🎨' }
      ];
    } else {
      defaultSubjects = [
        { name: '数学', icon: '📐' },
        { name: '语文', icon: '📖' },
        { name: '英语', icon: '🔤' },
        { name: '奥数思维培优', icon: '💡' },
        { name: '科学', icon: '🔬' },
        { name: '道德与法治', icon: '⚖️' },
        { name: '通用/全科', icon: '📚' }
      ];
    }

    const dbSubjects = this.allCategories().filter(c => c.type === 'subject');
    const result = [...defaultSubjects];
    for (const d of dbSubjects) {
      // 核心防护：严格依据所属学段物理隔离，杜绝小学阶段混入物理化学或教资考公！
      if (this.isSubjectBelongsToStage(d.name, key)) {
        if (!result.some(r => r.name === d.name || (d.name.includes(r.name) && r.name.length >= 2))) {
          result.push({ name: d.name, icon: d.icon || '📖' });
        }
      }
    }
    return result;
  }

  // 根据当前选中学段动态获取教材版本列表（优先数据库标准字典，杜绝重复）
  getEditionsByStage(stageKey: string): { name: string; icon: string }[] {
    const key = this.normalizeStageKey(stageKey);
    if (key === 'cert' || key === 'exam') {
      return [
        { name: '国家考试大纲通用', icon: '🏛️' },
        { name: '中公教育版', icon: '📘' },
        { name: '粉笔教育版', icon: '✏️' },
        { name: '华图教育版', icon: '📊' }
      ];
    }

    const dbEditions = this.allCategories().filter(c => c.type === 'edition');
    if (dbEditions.length > 0) {
      const list = [{ name: '通用版本', icon: '🏷️' }];
      for (const d of dbEditions) {
        if (!list.some(r => r.name === d.name)) {
          list.push({ name: d.name, icon: d.icon || '📚' });
        }
      }
      return list;
    }

    return [
      { name: '通用版本', icon: '🏷️' },
      { name: '人教版 (教育部统编)', icon: '📚' },
      { name: '北师大版 (BNU)', icon: '📚' },
      { name: '苏教版 (江苏凤凰)', icon: '📚' },
      { name: '外研版 (英语)', icon: '🔤' },
      { name: '译林版 (英语)', icon: '🔤' },
      { name: '沪教版 (上海教育)', icon: '📚' },
      { name: '鲁教版 (山东教育)', icon: '📚' },
      { name: '冀教版 (河北教育)', icon: '📚' },
      { name: '湘教版 (湖南教育)', icon: '📚' },
      { name: '粤教版 (广东教育)', icon: '📚' },
      { name: '仁爱版 (英语)', icon: '🔤' },
      { name: '教科版 (科学为主)', icon: '🔬' },
      { name: '浙教版 (浙江教育)', icon: '📚' }
    ];
  }

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
            if (!form.quarkFileSize || form.quarkFileSize === '0 B') {
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

  // 切换网盘归属账号联动
  onQuarkAccountChange(target: 'new' | 'edit') {
    const form = target === 'new' ? this.newResource : this.editForm;
    const acc = this.accounts().find(a => a.id === form.quarkAccountId);
    if (acc) {
      form.quarkAccountName = acc.account_name;
    } else {
      form.quarkAccountName = '';
    }
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

    this.resService.autoTransferAndShare({ 
      share_url: url,
      account_id: form.quarkAccountId || undefined
    }).subscribe({
      next: (result: any) => {
        this.transferringQuark.set(false);
        const newUrl = result.new_share_url || result.my_share_url;
        if (newUrl) {
          form.quarkUrl = newUrl;
          if (result.account_id) form.quarkAccountId = result.account_id;
          if (result.account_name) form.quarkAccountName = result.account_name;
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
          this.showToast(`🎉 成功洗链！已转存到【${result.account_name || '我的夸克网盘'}】并生成专属链接：${newUrl}`);
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
    is_default: true,
    nickname: '',
    uid: ''
  };

  isAccountModalOpen = signal<boolean>(false);

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

  get currentSelectedAccount(): NetdiskAccountDto | undefined {
    return this.accounts().find(a => a.id === this.accountForm.id);
  }

  // 账号状态告警计算
  hasExpiredOrWarningAccounts = computed(() => {
    return this.accounts().some(a => a.status === 'expired' || a.status === 'invalid' || a.is_over_quota);
  });

  warningAccountsList = computed(() => {
    return this.accounts().filter(a => a.status === 'expired' || a.status === 'invalid' || a.is_over_quota);
  });

  verifyAllLoading = signal<boolean>(false);

  verifyAllAccounts() {
    this.verifyAllLoading.set(true);
    this.resService.verifyAllAccounts().subscribe({
      next: (res) => {
        this.verifyAllLoading.set(false);
        this.showToast(res.message || '全量网盘账号检测完成');
        this.loadAccounts(true);
      },
      error: (err) => {
        this.verifyAllLoading.set(false);
        this.showToast('检测失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  loadAccounts(preserveSelection = true) {
    this.accountLoading.set(true);
    this.resService.listAccounts().subscribe({
      next: (accs) => {
        this.accounts.set(accs);
        this.accountLoading.set(false);
        if (accs.length > 0) {
          const defAcc = accs.find(a => a.is_default && a.status === 'valid') || accs[0];
          if (!this.newResource.quarkAccountId && defAcc) {
            this.newResource.quarkAccountId = defAcc.id || '';
            this.newResource.quarkAccountName = defAcc.account_name;
          }
          const currentId = this.accountForm.id;
          const target = (preserveSelection && currentId) ? accs.find(a => a.id === currentId) : null;
          if (target) {
            this.selectAccount(target, false, false);
          } else if (!currentId || !preserveSelection) {
            const def = accs.find(a => a.is_default) || accs[0];
            this.selectAccount(def, false, false);
          }
        } else {
          this.resetAccountForm();
        }
      },
      error: () => {
        this.accountLoading.set(false);
      }
    });
  }

  selectAccount(acc: NetdiskAccountDto, smoothScroll = false, notify = false) {
    this.accountForm = {
      id: acc.id || '',
      drive_type: acc.drive_type || 'quark',
      account_name: acc.account_name,
      cookie: acc.cookie || '',
      target_folder_fid: acc.target_folder_fid || '0',
      target_folder_name: this.formatFolderPath(acc.target_folder_name),
      is_default: acc.is_default || false,
      nickname: acc.nickname || '',
      uid: acc.uid || ''
    };
    if (notify) {
      const msg = this.i18n.t('accounts.accountLoadedToast').replace('{name}', acc.account_name);
      this.showToast(msg);
    }
    if (smoothScroll) {
      const el = document.getElementById('account-config-card');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  openNewAccountModal() {
    this.resetAccountForm();
    this.isAccountModalOpen.set(true);
  }

  openEditAccountModal(acc: NetdiskAccountDto, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.accountForm = {
      id: acc.id || '',
      drive_type: acc.drive_type || 'quark',
      account_name: acc.account_name,
      cookie: acc.cookie || '',
      target_folder_fid: acc.target_folder_fid || '0',
      target_folder_name: this.formatFolderPath(acc.target_folder_name),
      is_default: acc.is_default || false,
      nickname: acc.nickname || '',
      uid: acc.uid || ''
    };
    this.isAccountModalOpen.set(true);
  }

  closeAccountModal() {
    this.isAccountModalOpen.set(false);
  }

  onCookieInputBlur() {
    if (!this.accountForm.cookie) return;
    // 仅当未填写或不是纯数字时，尝试从 Cookie 提取纯数字 UID（坚决不提取 b-user-id 等字母组合设备字符串）
    if (!this.accountForm.uid || !/^\d+$/.test(this.accountForm.uid)) {
      const match = this.accountForm.cookie.match(/(?:^|;\s*)(?:__uid|_up_uid|uid)=(\d+)(?:;|$)/);
      if (match && match[1]) {
        this.accountForm.uid = match[1].trim();
      }
    }
  }

  testAndFetchAccountInfoInModal() {
    if (!this.accountForm.cookie) {
      this.showToast('请先粘贴 Cookie 凭据后再进行检测', 'error');
      return;
    }
    this.onCookieInputBlur();
    this.showToast('🔍 正在连通夸克网盘并同步账号与UID信息...');
    this.saveAccountConfig(true);
  }

  copyAccountUID(uid?: string) {
    if (!uid) {
      this.showToast('该账号暂无 UID', 'error');
      return;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(uid).then(() => {
        this.showToast('📋 夸克 UID 已复制到剪贴板', 'success');
      }).catch(() => {
        this.showToast('复制失败', 'error');
      });
    } else {
      this.showToast('复制失败', 'error');
    }
  }

  copyCurrentCookie() {
    if (!this.accountForm.cookie) {
      this.showToast(this.i18n.t('accounts.cookieEmpty'), 'error');
      return;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(this.accountForm.cookie).then(() => {
        this.showToast(this.i18n.t('accounts.cookieCopied'), 'success');
      }).catch(() => {
        this.showToast(this.i18n.t('accounts.cookieCopyFailed'), 'error');
      });
    } else {
      this.showToast(this.i18n.t('accounts.cookieCopyFailed'), 'error');
    }
  }

  saveAccountConfig(keepModalOpen = false) {
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
      is_default: this.accountForm.is_default,
      nickname: this.accountForm.nickname,
      uid: this.accountForm.uid
    };
    if (this.accountForm.id) {
      payload.id = this.accountForm.id;
    }

    this.resService.saveAccount(payload).subscribe({
      next: (saved) => {
        this.accountLoading.set(false);
        this.accountForm.id = saved.id || this.accountForm.id;
        if (saved.nickname) {
          this.accountForm.nickname = saved.nickname;
        }
        if (saved.uid) {
          this.accountForm.uid = saved.uid;
        }
        if (!keepModalOpen) {
          this.isAccountModalOpen.set(false);
        }
        if (saved.status === 'valid') {
          this.showToast(`✅ 账号【${saved.account_name}】连通验证成功！用户: ${saved.nickname || '已同步'}，UID: ${saved.uid || '已获取'}`, 'success');
        } else {
          this.showToast(`⚠️ 账号已保存，但验证提示: ${saved.error_message}`, 'error');
        }
        this.loadAccounts(true);
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
    this.openEditAccountModal(acc, event);
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
        if (this.accountForm.id === acc.id) {
          this.accountForm.is_default = true;
        } else if (this.accountForm.id) {
          this.accountForm.is_default = false;
        }
        this.showToast(`⭐ 已成功将【${acc.account_name}】激活为当前默认网盘账号！`);
      },
      error: (err) => {
        this.showToast('切换激活账号失败: ' + err.message, 'error');
      }
    });
  }

  startAddNewAccount() {
    this.openNewAccountModal();
  }

  resetAccountForm() {
    this.accountForm = {
      id: '',
      drive_type: 'quark',
      account_name: '站长夸克主账号',
      cookie: '',
      target_folder_fid: '0',
      target_folder_name: '/',
      is_default: this.accounts().length === 0,
      nickname: '',
      uid: ''
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

  // 夸克网盘整目录批量建档上新
  isBatchImportModalOpen = signal<boolean>(false);
  batchImportAccountId = signal<string>('');
  batchImportPdirFid = signal<string>('0');
  batchImportFolderName = signal<string>('根目录');
  batchImportBreadcrumbs = signal<{ fid: string; name: string }[]>([{ fid: '0', name: '根目录' }]);
  batchImportFolders = signal<{ fid: string; file_name: string }[]>([]);
  batchImportLoading = signal<boolean>(false);
  batchImportSubmitting = signal<boolean>(false);
  batchImportChannel = signal<string>('edu');
  batchImportAutoPublish = signal<boolean>(true);
  batchImportProgressText = signal<string>('');

  openBatchImportModal(acc?: NetdiskAccountDto) {
    let targetAcc = acc;
    if (!targetAcc) {
      targetAcc = this.accounts().find(a => a.is_default) || this.accounts()[0];
    }
    if (!targetAcc || !targetAcc.id) {
      this.showToast('请先配置并选中一个有效的夸克网盘账号', 'error');
      return;
    }
    this.batchImportAccountId.set(targetAcc.id);
    this.batchImportPdirFid.set('0');
    this.batchImportFolderName.set('根目录');
    this.batchImportBreadcrumbs.set([{ fid: '0', name: '根目录' }]);
    this.batchImportChannel.set('edu');
    this.batchImportAutoPublish.set(true);
    this.batchImportProgressText.set('');
    this.isBatchImportModalOpen.set(true);
    this.fetchBatchImportFolders(targetAcc.id, '0');
  }

  closeBatchImportModal() {
    if (this.batchImportSubmitting()) return;
    this.isBatchImportModalOpen.set(false);
  }

  fetchBatchImportFolders(accId: string, pdirFid: string) {
    this.batchImportLoading.set(true);
    this.resService.listAccountFolders(accId, pdirFid).subscribe({
      next: (folders) => {
        this.batchImportFolders.set(folders || []);
        this.batchImportLoading.set(false);
      },
      error: (err) => {
        this.batchImportLoading.set(false);
        this.showToast('获取网盘目录失败: ' + err.message, 'error');
      }
    });
  }

  enterBatchImportFolder(folder: { fid: string; file_name: string }) {
    const accId = this.batchImportAccountId();
    if (!accId) return;
    this.batchImportPdirFid.set(folder.fid);
    this.batchImportFolderName.set(folder.file_name);
    this.batchImportBreadcrumbs.update(crumbs => [...crumbs, { fid: folder.fid, name: folder.file_name }]);
    this.fetchBatchImportFolders(accId, folder.fid);
  }

  navigateBatchImportBreadcrumb(index: number) {
    const crumbs = this.batchImportBreadcrumbs();
    if (index >= crumbs.length) return;
    const target = crumbs[index];
    const accId = this.batchImportAccountId();
    if (!accId) return;
    this.batchImportPdirFid.set(target.fid);
    this.batchImportFolderName.set(target.name);
    this.batchImportBreadcrumbs.set(crumbs.slice(0, index + 1));
    this.fetchBatchImportFolders(accId, target.fid);
  }

  executeBatchImportCurrentFolder() {
    const accId = this.batchImportAccountId();
    const pdirFid = this.batchImportPdirFid();
    const folderName = this.batchImportFolderName();
    if (!accId) {
      this.showToast('未选择网盘账号', 'error');
      return;
    }
    this.batchImportSubmitting.set(true);
    this.batchImportProgressText.set(`正在扫描【${folderName}】并自动推断元数据、生成分享链...`);
    
    this.resService.batchImportQuarkFolder({
      account_id: accId,
      pdir_fid: pdirFid,
      channel_slug: this.batchImportChannel(),
      auto_publish: this.batchImportAutoPublish()
    }).subscribe({
      next: (res: any) => {
        this.batchImportSubmitting.set(false);
        const msg = res.message || '批量建档导入成功！';
        this.showToast(msg, 'success');
        this.isBatchImportModalOpen.set(false);
        this.loadResources();
      },
      error: (err) => {
        this.batchImportSubmitting.set(false);
        this.showToast('批量建档上架失败: ' + (err.error?.message || err.message), 'error');
      }
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

  statsLastUpdated = signal<string>('');
  statsAutoRefresh = signal<boolean>(true);
  private statsRefreshTimer: any = null;

  loadDashboardStats(silent = false) {
    if (!silent) {
      this.statsLoading.set(true);
    }
    this.resService.getDashboardStats().subscribe({
      next: (data) => {
        this.dashboardStats.set(data);
        this.statsLoading.set(false);
        const now = new Date();
        this.statsLastUpdated.set(
          `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
        );
      },
      error: () => {
        this.statsLoading.set(false);
      }
    });
  }

  toggleStatsAutoRefresh() {
    this.statsAutoRefresh.update(v => !v);
    if (this.statsAutoRefresh() && this.currentTab() === 'stats') {
      this.startStatsAutoRefresh();
    } else {
      this.stopStatsAutoRefresh();
    }
  }

  private startStatsAutoRefresh() {
    this.stopStatsAutoRefresh();
    if (!this.statsAutoRefresh() || typeof window === 'undefined') return;
    this.statsRefreshTimer = setInterval(() => {
      if (this.currentTab() === 'stats' && this.statsAutoRefresh()) {
        this.loadDashboardStats(true);
      }
    }, 10000);
  }

  private stopStatsAutoRefresh() {
    if (this.statsRefreshTimer) {
      clearInterval(this.statsRefreshTimer);
      this.statsRefreshTimer = null;
    }
  }

  initDashboard() {
    this.loadChannels();
    this.loadResources();
    this.loadAccounts();
    this.loadNavMenus();
    this.loadRegions();
    this.loadDashboardStats();
    this.loadSearchLogs();
    this.loadCollections();
    this.loadCrawlerConfigAndStats();
    this.loadAllCategories();
  }

  ngOnDestroy() {
    this.stopStatsAutoRefresh();
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

    const defaultQuarkAcc = this.accounts().find(a => a.is_default && a.status === 'valid') || this.accounts()[0];
    const initialAccountId = quarkLink?.account_id || defaultQuarkAcc?.id || '';
    const initialAccountName = quarkLink?.account_name || defaultQuarkAcc?.account_name || '';

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
      collection_id: item.collection_id || '',
      file_type: item.file_type || 'PDF',
      file_size: item.file_size || '',
      page_count: item.page_count || 0,
      view_count: item.view_count || 0,
      save_count: item.save_count || 0,
      has_video: Boolean(item.file_type?.includes('视频') || item.file_type?.includes('MP4') || quarkLink?.file_type?.includes('视频')),
      is_published: item.is_published ?? true,
      quarkUrl: quarkLink?.share_url || '',
      quarkAccountId: initialAccountId,
      quarkAccountName: initialAccountName,
      quarkFileSize: quarkLink?.file_size || item.file_size || '',
      quarkFileType: quarkLink?.file_type || (quarkLink?.share_url ? '高清视频课' : 'PDF'),
      quarkDesc: quarkLink?.resource_desc || '',
      baiduUrl: baiduLink?.share_url || '',
      baiduCode: baiduLink?.extract_code || '',
      baiduFileSize: baiduLink?.file_size || '',
      baiduFileType: baiduLink?.file_type || 'PDF',
      baiduDesc: baiduLink?.resource_desc || '',
      description: item.description || '',
      slug: item.slug || '',
      cover_image: item.cover_image || '',
      poster_image: (item as any).poster_image || '',
      term: (item as any).term || '',
      file_tree: (item as any).file_tree || []
    };
    this.editCoverPreview.set(item.cover_image || '');
    this.isEditModalOpen.set(false);
    this.currentTab.set('edit');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  closeEdit() {
    this.isEditModalOpen.set(false);
    this.currentTab.set('list');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
    const hasQuark = !!this.editForm.quarkUrl?.trim();
    const hasBaidu = !!this.editForm.baiduUrl?.trim();
    if (!this.editForm.title?.trim() || (!hasQuark && !hasBaidu)) {
      this.showToast('请至少填写资料标题，并提供夸克网盘或百度网盘链接之一！', 'error');
      return;
    }

    // 封面确定：严格使用用户上传或转存的书本/资料真实封面（不再自动生成海报冲刷覆盖）
    const finalCover = (this.editForm.cover_image || this.editCoverPreview() || '').trim();

    const links: any[] = [];
    if (hasQuark) {
      links.push({
        drive_type: 'quark',
        share_url: this.editForm.quarkUrl.trim(),
        account_id: this.editForm.quarkAccountId || undefined,
        account_name: this.editForm.quarkAccountName || undefined,
        file_size: this.editForm.quarkFileSize || this.editForm.file_size || '',
        file_type: this.editForm.quarkFileType || (this.editForm.has_video ? '高清视频课' : 'PDF'),
        resource_desc: this.editForm.quarkDesc || (this.editForm.has_video ? '包含超清视频合集' : '手机转存立享原画'),
        is_primary: true,
        password_hint: this.editForm.has_video ? '夸克APP原画倍速看视频' : '手机转存立享原画'
      });
    }
    if (hasBaidu) {
      links.push({
        drive_type: 'baidu',
        share_url: this.editForm.baiduUrl.trim(),
        extract_code: this.editForm.baiduCode?.trim() || '',
        file_size: this.editForm.baiduFileSize || '',
        file_type: this.editForm.baiduFileType || 'PDF',
        resource_desc: this.editForm.baiduDesc || '百度网盘转存通道',
        is_primary: !hasQuark, // 若无夸克链接，则百度自动成为主推通道
        password_hint: this.editForm.baiduCode?.trim() ? `提取码：${this.editForm.baiduCode.trim()}` : ''
      });
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.editForm.channel_slug || 'edu',
      title: this.editForm.title,
      collection_id: this.editForm.collection_id || null,
      cover_image: finalCover || undefined,
      poster_image: (this.editForm.poster_image || '').trim() || undefined,
      subtitle: this.editForm.subtitle || (this.editForm.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.editForm.description || this.editForm.title,
      stage: this.editForm.stage,
      grade: this.editForm.grade,
      subject: this.editForm.subject,
      edition: this.editForm.edition,
      region: this.editForm.region || '',
      school: this.editForm.school || '',
      file_type: this.editForm.has_video ? 'PDF+MP4视频' : this.editForm.file_type,
      file_size: this.editForm.quarkFileSize || this.editForm.baiduFileSize || this.editForm.file_size || '',
      page_count: Number(this.editForm.page_count) || 0,
      view_count: Number(this.editForm.view_count) || 0,
      save_count: Number(this.editForm.save_count) || 0,
      file_tree: (this.editForm as any).file_tree || [],
      is_published: this.editForm.is_published,
      links: links
    };

    this.resService.update(this.editForm.id, payload).subscribe({
      next: () => {
        this.closeEdit();
        this.loadResources();
        this.showToast('✅ 资料已保存更新，已返回资料列表！');
      },
      error: (err) => this.showToast('修改失败: ' + err.message, 'error')
    });
  }

  loadResources() {
    this.loading.set(true);
    this.resService.list({
      channel: this.currentChannelFilter(),
      stage: this.currentStageFilter(),
      grade: this.currentGradeFilter(),
      term: this.currentTermFilter(),
      subject: this.currentSubjectFilter(),
      edition: this.currentEditionFilter(),
      school: this.currentSchoolFilter(),
      account_id: this.currentAccountFilter(),
      collection_id: this.currentCollectionFilter(),
      q: this.adminKeyword().trim(),
      filter: this.listFilter(),
      page: this.currentPage(),
      limit: this.pageSize()
    }).subscribe({
      next: (res) => {
        this.resources.set(res.items || []);
        this.totalCount.set(res.total || 0);
        this.totalPages.set(res.total_pages || Math.ceil((res.total || 0) / this.pageSize()) || 1);
        if (res.channel_counts) {
          this.channelCounts.set(res.channel_counts);
        }
        if (res.stage_counts) {
          this.stageCounts.set(res.stage_counts);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('加载资源列表失败:', err);
        this.loading.set(false);
      }
    });
  }

  switchTab(tab: 'list' | 'add' | 'edit' | 'stats' | 'crawler' | 'collector' | 'drafts' | 'scout' | 'email' | 'seo' | 'accounts' | 'channels' | 'categories' | 'navmenus' | 'schools' | 'hotsearches' | 'searchlogs' | 'collections' | 'settings' | 'requests' | 'members') {
    this.currentTab.set(tab);
    if (tab === 'stats') {
      this.loadDashboardStats();
      this.startStatsAutoRefresh();
    } else {
      this.stopStatsAutoRefresh();
    }
    if (tab === 'list') {
      this.loadResources();
    } else if (tab === 'collector') {
      // 切换至浏览器采集助手独立大屏
    } else if (tab === 'drafts') {
      this.loadCrawlerDrafts();
      this.loadCrawlerConfigAndStats();
    } else if (tab === 'scout') {
      this.loadScoutTopics();
      this.loadCollections();
    } else if (tab === 'accounts') {
      this.loadAccounts();
    } else if (tab === 'channels') {
      this.loadChannels();
    } else if (tab === 'categories') {
      this.loadCategories();
    } else if (tab === 'navmenus') {
      this.loadNavMenus();
    } else if (tab === 'schools') {
      this.loadRegions();
    } else if (tab === 'hotsearches') {
      this.loadHotSearches();
    } else if (tab === 'searchlogs') {
      this.loadSearchLogs();
    } else if (tab === 'collections') {
      this.loadCollections();
    } else if (tab === 'settings') {
      this.loadSettings();
    } else if (tab === 'requests') {
      this.loadRequests();
    } else if (tab === 'members') {
      this.loadMemberLevels();
      this.loadActivationCodes(1);
      this.loadMemberUsers(1);
      this.loadSettings();
    } else if (tab === 'crawler') {
      this.loadCrawlerConfigAndStats();
      this.loadCrawlerChannels();
      this.loadBroadcastChannels();
      if (this.crawlerSubTab() === 'drafts') {
        this.crawlerSubTab.set('ingestion');
      }
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
    return ch ? this.cleanChannelName(ch.name, ch.icon) : (slug || '教辅');
  }

  getChannelIcon(slug?: string): string {
    const ch = this.getChannel(slug);
    return ch ? ch.icon : '📚';
  }

  filterByChannel(slug: string) {
    this.currentChannelFilter.set(slug);
    this.currentPage.set(1);
    this.jumpPageInput.set('1');
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

  // --- 分类字典库管理 (学段、年级、学期/分册、学科、教材版本) ---
  categories = signal<CategoryDto[]>([]);
  categoryLoading = signal<boolean>(false);
  categoryFilterType = signal<string>('all');
  categorySearchKeyword = signal<string>('');
  isCategoryModalOpen = signal<boolean>(false);
  categoryForm: CategoryDto = {
    name: '',
    slug: '',
    type: 'edition',
    sort_order: 1,
    icon: '📚',
    is_hot: false
  };

  loadCategories() {
    this.categoryLoading.set(true);
    this.resService.getCategories(this.categoryFilterType(), this.categorySearchKeyword()).subscribe({
      next: (list) => {
        this.categories.set(list);
        this.categoryLoading.set(false);
      },
      error: (err) => {
        this.categoryLoading.set(false);
        this.showToast('加载分类字典失败: ' + err.message, 'error');
      }
    });
  }

  filterCategoryByType(type: string) {
    this.categoryFilterType.set(type);
    this.loadCategories();
  }

  onCategorySearch() {
    this.loadCategories();
  }

  openCreateCategoryModal(defaultType?: string) {
    const targetType = defaultType || (this.categoryFilterType() !== 'all' ? this.categoryFilterType() : 'edition');
    let defaultIcon = '🏷️';
    switch (targetType) {
      case 'stage': defaultIcon = '🎓'; break;
      case 'grade': defaultIcon = '🎒'; break;
      case 'term': defaultIcon = '📅'; break;
      case 'subject': defaultIcon = '📖'; break;
      case 'edition': defaultIcon = '📚'; break;
    }
    this.categoryForm = {
      name: '',
      slug: '',
      type: targetType,
      sort_order: this.categories().length + 1,
      icon: defaultIcon,
      is_hot: false
    };
    this.isCategoryModalOpen.set(true);
  }

  openEditCategoryModal(cat: CategoryDto) {
    this.categoryForm = { ...cat };
    this.isCategoryModalOpen.set(true);
  }

  closeCategoryModal() {
    this.isCategoryModalOpen.set(false);
  }

  saveCategory() {
    if (!this.categoryForm.name || !this.categoryForm.slug || !this.categoryForm.type) {
      this.showToast('请完整填写分类名称、标识Slug与所属类别！', 'error');
      return;
    }
    this.categoryLoading.set(true);
    if (this.categoryForm.id) {
      this.resService.updateCategory(this.categoryForm.id, this.categoryForm).subscribe({
        next: () => {
          this.categoryLoading.set(false);
          this.closeCategoryModal();
          this.loadCategories();
          this.showToast(`✅ 分类【${this.categoryForm.name}】更新成功！`);
        },
        error: (err) => {
          this.categoryLoading.set(false);
          this.showToast('更新分类失败: ' + (err.error?.message || err.message), 'error');
        }
      });
    } else {
      this.resService.createCategory(this.categoryForm).subscribe({
        next: () => {
          this.categoryLoading.set(false);
          this.closeCategoryModal();
          this.loadCategories();
          this.showToast(`🎉 分类【${this.categoryForm.name}】创建成功！`);
        },
        error: (err) => {
          this.categoryLoading.set(false);
          this.showToast('创建分类失败: ' + (err.error?.message || err.message), 'error');
        }
      });
    }
  }

  toggleCategoryHot(cat: CategoryDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!cat.id) return;
    this.resService.toggleCategoryHot(cat.id).subscribe({
      next: (res) => {
        this.categories.update(list => list.map(item => item.id === cat.id ? { ...item, is_hot: res.is_hot } : item));
        this.showToast(res.message);
      },
      error: (err) => {
        this.showToast('更新常用推荐状态失败: ' + err.message, 'error');
      }
    });
  }

  async deleteCategory(cat: CategoryDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!cat.id) return;
    const ok = await this.confirmDialog({
      title: '删除分类字典项',
      message: `确定彻底删除分类【${cat.name}】(slug: ${cat.slug}) 吗？`,
      confirmText: '确定删除',
      type: 'danger',
      icon: '🗑️'
    });
    if (!ok) return;

    this.categoryLoading.set(true);
    this.resService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.categoryLoading.set(false);
        this.showToast(`✅ 分类【${cat.name}】已成功删除！`);
        this.loadCategories();
      },
      error: (err) => {
        this.categoryLoading.set(false);
        this.showToast(err.error?.message || '删除分类失败: ' + err.message, 'error');
      }
    });
  }

  async resetStandardCategories() {
    const ok = await this.confirmDialog({
      title: '恢复全国标准教材字典库',
      message: '确定要一键同步并恢复全国中小学及高中全学段、年级、学期/分册、学科与全主流教材版本（人教版、北师大版、苏教版等）分类字典吗？已有分类不会丢失，将自动补齐缺失项。',
      confirmText: '立即同步',
      type: 'info',
      icon: '🔄'
    });
    if (!ok) return;

    this.categoryLoading.set(true);
    this.resService.resetDefaultCategories().subscribe({
      next: (res) => {
        this.categoryLoading.set(false);
        this.showToast(res.message);
        this.loadCategories();
      },
      error: (err) => {
        this.categoryLoading.set(false);
        this.showToast('同步分类字典失败: ' + err.message, 'error');
      }
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
    const hasQuark = !!this.newResource.quarkUrl?.trim();
    const hasBaidu = !!this.newResource.baiduUrl?.trim();
    if (!this.newResource.title?.trim() || (!hasQuark && !hasBaidu)) {
      this.showToast('请至少填写资料标题，并提供夸克网盘或百度网盘链接之一！', 'error');
      return;
    }

    // 封面确定：严格使用用户上传或转存的书本/资料真实封面（不再自动生成海报冲刷覆盖）
    const finalCover = (this.newResource.cover_image || this.newCoverPreview() || '').trim();

    const links: any[] = [];
    if (hasQuark) {
      links.push({
        drive_type: 'quark',
        share_url: this.newResource.quarkUrl.trim(),
        account_id: this.newResource.quarkAccountId || undefined,
        account_name: this.newResource.quarkAccountName || undefined,
        file_size: this.newResource.quarkFileSize || this.newResource.file_size || '',
        file_type: this.newResource.quarkFileType || (this.newResource.has_video ? '高清视频课' : 'PDF'),
        resource_desc: this.newResource.quarkDesc || (this.newResource.has_video ? '包含超清视频合集' : '手机转存立享原画'),
        is_primary: true,
        password_hint: this.newResource.has_video ? '夸克APP原画倍速看视频' : '手机转存立享原画'
      });
    }
    if (hasBaidu) {
      links.push({
        drive_type: 'baidu',
        share_url: this.newResource.baiduUrl.trim(),
        extract_code: this.newResource.baiduCode?.trim() || '',
        file_size: this.newResource.baiduFileSize || '',
        file_type: this.newResource.baiduFileType || 'PDF',
        resource_desc: this.newResource.baiduDesc || '百度网盘转存通道',
        is_primary: !hasQuark, // 若无夸克链接，则百度自动成为主推通道
        password_hint: this.newResource.baiduCode?.trim() ? `提取码：${this.newResource.baiduCode.trim()}` : ''
      });
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.newResource.channel_slug || 'edu',
      title: this.newResource.title,
      cover_image: finalCover || undefined,
      poster_image: (this.newResource.poster_image || '').trim() || undefined,
      subtitle: this.newResource.subtitle || (this.newResource.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.newResource.description || this.newResource.title,
      stage: this.newResource.stage,
      grade: this.newResource.grade,
      subject: this.newResource.subject,
      edition: this.newResource.edition,
      region: this.newResource.region || '',
      school: this.newResource.school || '',
      collection_id: this.newResource.collection_id || null,
      file_type: this.newResource.has_video ? 'PDF+MP4视频' : this.newResource.file_type,
      file_size: this.newResource.quarkFileSize || this.newResource.baiduFileSize || this.newResource.file_size || '',
      page_count: Number(this.newResource.page_count) || 0,
      view_count: Number(this.newResource.view_count) || 0,
      save_count: Number(this.newResource.save_count) || 0,
      file_tree: (this.newResource as any).file_tree || [],
      is_published: true,
      is_recommended: true,
      links: links
    };

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
        if (typeof localStorage !== 'undefined' && this.newResource.subtitle?.trim()) {
          localStorage.setItem('preferred_subtitle', this.newResource.subtitle.trim());
        }
        this.newResource.title = '';
        this.newResource.subtitle = (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_subtitle') : '') || '';
        this.newResource.description = '';
        this.newResource.region = (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : '') || '';
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
    const current = mode === 'new' ? this.newResource.region : this.editForm.region;
    const next = current === regionName ? '' : regionName;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('preferred_region', next);
    }
    if (mode === 'new') {
      this.newResource.region = next;
      this.newResource.school = '';
    } else {
      this.editForm.region = next;
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

  searchLogs = signal<{ keyword: string; search_count: number; result_count: number; last_searched_at: string }[]>([]);
  searchLogsLoading = signal<boolean>(false);
  searchLogFilter = signal<'missed' | 'all'>('missed');

  // ==================== 选题雷达 (竞品网站标题采集与一键寻源) ====================
  scoutUrl = '';
  scoutSourceName = '';
  scoutSelector = '';
  scoutFetching = signal<boolean>(false);
  scoutImportSource = '手动导入';
  scoutImportTextContent = '';
  scoutImporting = signal<boolean>(false);

  scoutTopics = signal<any[]>([]);
  scoutLoading = signal<boolean>(false);
  scoutStatusFilter = signal<'need_source' | 'approved' | 'ignored' | 'all'>('need_source');
  scoutSourceFilter = signal<string>('all');
  scoutKeyword = '';
  scoutPage = signal<number>(1);
  scoutTotal = signal<number>(0);
  scoutCounts = signal<{ need_source: number; approved: number; ignored: number }>({ need_source: 0, approved: 0, ignored: 0 });
  scoutSources = signal<string[]>([]);
  scoutPublishInputs: Record<string, { share_url: string; extract_code: string; collection_id: string; auto_transfer: boolean; publishing?: boolean }> = {};

  applyScoutPreset(url: string, name: string) {
    this.scoutUrl = url;
    this.scoutSourceName = name;
  }

  fetchScoutTitles() {
    const url = (this.scoutUrl || '').trim();
    if (!url) {
      this.showToast('请输入要采集的目标网站列表网址', 'error');
      return;
    }
    this.scoutFetching.set(true);
    this.resService.fetchScoutTitles({
      url,
      source_name: this.scoutSourceName.trim(),
      selector: this.scoutSelector.trim()
    }).subscribe({
      next: (data) => {
        this.scoutFetching.set(false);
        if (data?.message) {
          this.showToast(data.message, 'error');
        } else {
          this.showToast(`抓取完成：识别 ${data.fetched_count} 条，新增入库 ${data.added_count} 条（已去重跳过 ${data.skipped_count} 条）`);
        }
        this.scoutPage.set(1);
        this.loadScoutTopics();
      },
      error: (err) => {
        this.scoutFetching.set(false);
        this.showToast(err.error?.message || '采集失败，可使用下方粘贴标题导入', 'error');
      }
    });
  }

  importScoutText() {
    const text = (this.scoutImportTextContent || '').trim();
    if (!text) {
      this.showToast('请粘贴至少一条标题文本', 'error');
      return;
    }
    this.scoutImporting.set(true);
    this.resService.importScoutText({
      source_name: (this.scoutImportSource || '手动导入').trim(),
      text
    }).subscribe({
      next: (data) => {
        this.scoutImporting.set(false);
        this.scoutImportTextContent = '';
        this.showToast(`导入完成：识别 ${data.fetched_count} 条，新增 ${data.added_count} 条（去重跳过 ${data.skipped_count} 条）`);
        this.scoutPage.set(1);
        this.loadScoutTopics();
      },
      error: (err) => {
        this.scoutImporting.set(false);
        this.showToast(err.error?.message || '导入失败', 'error');
      }
    });
  }

  loadScoutTopics() {
    this.scoutLoading.set(true);
    this.resService.listScoutTopics({
      status: this.scoutStatusFilter(),
      source_name: this.scoutSourceFilter(),
      q: this.scoutKeyword.trim(),
      page: this.scoutPage(),
      page_size: 20
    }).subscribe({
      next: (data) => {
        const items = data?.items || [];
        for (const it of items) {
          if (!this.scoutPublishInputs[it.id]) {
            this.scoutPublishInputs[it.id] = { share_url: '', extract_code: '', collection_id: '', auto_transfer: true };
          }
        }
        this.scoutTopics.set(items);
        this.scoutTotal.set(data?.total || 0);
        this.scoutCounts.set({
          need_source: data?.need_source_count || 0,
          approved: data?.approved_count || 0,
          ignored: data?.ignored_count || 0
        });
        this.scoutSources.set(data?.sources || []);
        this.scoutLoading.set(false);
      },
      error: () => this.scoutLoading.set(false)
    });
  }

  openScoutSearch(title: string, engine: 'google' | 'baidu' | 'quark') {
    const clean = (title || '').replace(/【[^】]*】|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    let target = '';
    if (engine === 'google') {
      target = `https://www.google.com/search?q=${encodeURIComponent(`"${clean}" 夸克网盘 OR 百度网盘`)}`;
    } else if (engine === 'baidu') {
      target = `https://www.baidu.com/s?wd=${encodeURIComponent(`${clean} 夸克网盘`)}`;
    } else {
      target = `https://www.google.com/search?q=${encodeURIComponent(`${clean} site:pan.quark.cn OR pan.baidu.com`)}`;
    }
    window.open(target, '_blank', 'noopener');
  }

  publishScoutTopic(topic: any) {
    const form = this.scoutPublishInputs[topic.id];
    const url = (form?.share_url || '').trim();
    if (!url) {
      this.showToast('请先粘贴找到的网盘链接', 'error');
      return;
    }
    form.publishing = true;
    this.resService.publishScoutTopic(topic.id, {
      title: topic.title,
      share_url: url,
      extract_code: (form.extract_code || '').trim(),
      collection_id: form.collection_id || '',
      auto_transfer: form.auto_transfer
    }).subscribe({
      next: (res) => {
        form.publishing = false;
        this.showToast(res.message || '已发布到正式资料库');
        this.loadScoutTopics();
        this.loadCollections();
      },
      error: (err) => {
        form.publishing = false;
        this.showToast(err.error?.message || '发布失败', 'error');
      }
    });
  }

  setScoutTopicStatus(topic: any, status: 'need_source' | 'ignored') {
    this.resService.updateScoutTopicStatus(topic.id, status).subscribe({
      next: () => {
        this.showToast(status === 'ignored' ? '已标记为暂忽略（下次采集自动跳过）' : '已恢复到待寻源列表');
        this.loadScoutTopics();
      }
    });
  }

  deleteScoutTopic(topic: any) {
    this.resService.deleteScoutTopic(topic.id).subscribe({
      next: () => {
        this.showToast('已删除该选题记录');
        this.loadScoutTopics();
      }
    });
  }

  collections = signal<CollectionDto[]>([]);
  collectionsLoading = signal<boolean>(false);
  isCollectionModalOpen = signal<boolean>(false);
  collectionAssignMode: 'new' | 'edit' | 'batch' | null = null;
  isCollectionOrderModalOpen = signal<boolean>(false);
  orderingCollection = signal<CollectionDto | null>(null);
  collectionOrderItems = signal<ResourceItemDto[]>([]);
  collectionOrderLoading = signal<boolean>(false);
  collectionOrderSaving = signal<boolean>(false);
  draggedOrderIndex = signal<number | null>(null);
  private slugPreviewTimer: any = null;
  private slugManuallyEdited = false;
  collectionForm = {
    id: '',
    title: '',
    slug: '',
    description: '',
    sort_order: 0,
    sort_mode: 'created_asc',
    is_active: true
  };

  loadCollections() {
    this.collectionsLoading.set(true);
    this.resService.getAdminCollections().subscribe({
      next: (list) => {
        this.collections.set(list);
        this.collectionsLoading.set(false);
      },
      error: () => this.collectionsLoading.set(false)
    });
  }

  openCollectionModal(col?: CollectionDto, assignMode: 'new' | 'edit' | 'batch' | null = null) {
    this.collectionAssignMode = assignMode;
    if (col) {
      this.collectionForm = {
        id: col.id,
        title: col.title,
        slug: col.slug,
        description: col.description || '',
        sort_order: col.sort_order || 0,
        sort_mode: col.sort_mode || 'created_asc',
        is_active: col.is_active !== false
      };
    } else {
      this.collectionForm = { id: '', title: '', slug: '', description: '', sort_order: 0, sort_mode: 'created_asc', is_active: true };
    }
    this.slugManuallyEdited = !!col?.slug;
    this.isCollectionModalOpen.set(true);
  }

  onCollectionTitleInput(title: string) {
    if (this.collectionForm.id || this.slugManuallyEdited) return;
    const trimmed = (title || '').trim();
    if (!trimmed) {
      this.collectionForm.slug = '';
      return;
    }
    if (this.slugPreviewTimer) clearTimeout(this.slugPreviewTimer);
    this.slugPreviewTimer = setTimeout(() => {
      this.autoFillCollectionSlug(true);
    }, 300);
  }

  onCollectionSlugManualInput(val: string) {
    this.slugManuallyEdited = (val || '').trim().length > 0;
  }

  closeCollectionModal() {
    this.isCollectionModalOpen.set(false);
    this.collectionAssignMode = null;
  }

  autoFillCollectionSlug(force = false) {
    const title = (this.collectionForm.title || '').trim();
    if (!title) return;
    if (!force && (this.collectionForm.id || (this.collectionForm.slug || '').trim() !== '')) return;
    this.resService.previewCollectionSlug(title).subscribe({
      next: (slug) => {
        if (slug) this.collectionForm.slug = slug;
      }
    });
  }

  saveCollection() {
    if (!this.collectionForm.title.trim()) {
      this.showToast('请输入专辑名称', 'error');
      return;
    }
    const req$ = this.collectionForm.id
      ? this.resService.updateCollection(this.collectionForm.id, this.collectionForm)
      : this.resService.createCollection(this.collectionForm);

    req$.subscribe({
      next: (saved) => {
        const mode = this.collectionAssignMode;
        if (mode === 'new' && saved?.id) {
          this.newResource.collection_id = saved.id;
          this.showToast('专辑已创建并自动选中');
        } else if (mode === 'edit' && saved?.id) {
          this.editForm.collection_id = saved.id;
          this.showToast('专辑已创建并自动选中');
        } else if (mode === 'batch' && saved?.id) {
          const ids = this.selectedResourceIds();
          if (ids.length > 0) {
            this.resService.batchAssignCollection(ids, saved.id).subscribe({
              next: (res) => {
                this.clearResourceSelection();
                this.loadResources();
                this.loadCollections();
                this.showToast(`已新建专辑【${saved.title}】并将 ${res.affected} 篇资料加入`);
              },
              error: () => this.showToast('专辑已创建，但批量加入失败，请手动勾选加入', 'error')
            });
          } else {
            this.showToast('专辑已创建');
          }
        } else {
          this.showToast(this.collectionForm.id ? '专辑已更新' : '专辑已创建');
        }
        this.closeCollectionModal();
        this.loadCollections();
      },
      error: (err) => this.showToast('保存专辑失败: ' + (err.error?.message || err.message), 'error')
    });
  }

  async deleteCollectionItem(col: CollectionDto) {
    const ok = await this.confirmDialog({
      title: '删除专辑',
      message: `确定删除专辑「${col.title}」吗？不会删除专辑内的资料，仅解除关联。`,
      confirmText: '确认删除',
      type: 'danger',
      icon: '📚'
    });
    if (!ok) return;
    this.resService.deleteCollection(col.id).subscribe({
      next: () => {
        this.showToast('专辑已删除');
        this.loadCollections();
      },
      error: (err) => this.showToast('删除失败: ' + (err.error?.message || err.message), 'error')
    });
  }

  loadSearchLogs() {
    this.searchLogsLoading.set(true);
    this.resService.getAdminSearchLogs(this.searchLogFilter()).subscribe({
      next: (list) => {
        this.searchLogs.set(list);
        this.searchLogsLoading.set(false);
      },
      error: () => {
        this.searchLogsLoading.set(false);
      }
    });
  }

  onSearchLogFilterChange(filter: 'missed' | 'all') {
    this.searchLogFilter.set(filter);
    this.loadSearchLogs();
  }

  copySearchKeyword(kw: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(kw).then(() => {
        this.showToast(`已复制关键词「${kw}」`);
      }).catch(() => {});
    }
  }

  quickPublishFromKeyword(kw: string) {
    this.newResource.title = kw;
    this.switchTab('add');
    this.showToast(`已将「${kw}」填入标题，可直接补充网盘链接上架`);
  }

  dismissSearchLog(kw: string) {
    this.resService.deleteAdminSearchLog(kw).subscribe({
      next: () => {
        this.searchLogs.update(list => list.filter(i => i.keyword !== kw));
        this.showToast(`已移除「${kw}」`);
      },
      error: (err) => this.showToast('移除失败: ' + (err.message || ''), 'error')
    });
  }

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

  // 批量更换归属网盘账号
  async batchAssignAccount(targetAccountId: string) {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) return;
    if (!targetAccountId) return;

    const accName = targetAccountId === 'none' 
      ? '清除网盘绑定' 
      : (this.accounts().find(a => a.id === targetAccountId)?.account_name || '指定账号');

    const ok = await this.confirmDialog({
      title: '批量划转网盘账号归属',
      message: `确定要将选中的 ${ids.length} 篇资料的网盘归属统一设置为【${accName}】吗？`,
      confirmText: '确定修改',
      type: 'info',
      icon: '👤'
    });
    if (!ok) return;

    this.loading.set(true);
    this.resService.batchAssignAccount(ids, targetAccountId).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.clearResourceSelection();
        this.loadResources();
        this.showToast(`成功批量归属 ${res.affected} 篇资料至【${accName}】`);
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('批量设置网盘账号失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  // 批量划转频道 (学习资料 vs 统编电子教材)
  async batchAssignChannel(channel: string) {
    const ids = this.selectedResourceIds();
    if (ids.length === 0) return;
    if (!channel) return;

    const channelName = channel === 'book' ? '统编电子教材专区' : '刚需教材与学习资料';
    const ok = await this.confirmDialog({
      title: '批量调整所属频道',
      message: `确定要将选中的 ${ids.length} 篇资料统一划入【${channelName}】频道吗？`,
      confirmText: '确定划入',
      type: 'info',
      icon: '📁'
    });
    if (!ok) return;

    this.loading.set(true);
    this.resService.batchAssignChannel(ids, channel).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.clearResourceSelection();
        this.loadResources();
        this.showToast(`成功将 ${res.affected} 篇资料批量划入【${channelName}】`);
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('批量设置频道失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  // 批量将资料加入/移出专辑
  async batchAssignCollection(collectionId: string) {
    const ids = this.selectedResourceIds();
    if (ids.length === 0 || !collectionId) return;

    if (collectionId === '__create__') {
      this.openCollectionModal(undefined, 'batch');
      return;
    }

    const colName = collectionId === 'none'
      ? '移出所属专辑'
      : (this.collections().find(c => c.id === collectionId)?.title || '指定专辑');

    const ok = await this.confirmDialog({
      title: '批量设置所属专辑',
      message: collectionId === 'none'
        ? `确定要将选中的 ${ids.length} 篇资料移出当前专辑吗？`
        : `确定要将选中的 ${ids.length} 篇资料批量加入专辑【${colName}】吗？`,
      confirmText: '确定设置',
      type: 'info',
      icon: '📚'
    });
    if (!ok) return;

    this.loading.set(true);
    this.resService.batchAssignCollection(ids, collectionId).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.clearResourceSelection();
        this.loadResources();
        this.loadCollections();
        this.showToast(
          collectionId === 'none'
            ? `已将 ${res.affected} 篇资料移出专辑`
            : `成功将 ${res.affected} 篇资料加入专辑【${colName}】`
        );
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('批量设置专辑失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  // 行内一键将单个资源移出所属专辑
  removeResourceFromCollection(res: ResourceItemDto) {
    if (!res.collection) return;
    const colTitle = res.collection.title;
    this.resService.batchAssignCollection([res.id], 'none').subscribe({
      next: () => {
        this.showToast(`已将「${res.title}」移出专辑【${colTitle}】`);
        this.loadResources();
        this.loadCollections();
      },
      error: (err) => this.showToast('移出专辑失败: ' + (err.message || '网络错误'), 'error')
    });
  }

  // 打开专辑成员排序与管理弹窗（支持鼠标拖拽 + 移动端上下按钮）
  openCollectionOrderModal(col: CollectionDto) {
    this.orderingCollection.set(col);
    this.collectionOrderItems.set([]);
    this.collectionOrderLoading.set(true);
    this.isCollectionOrderModalOpen.set(true);

    this.resService.getCollectionItems(col.id).subscribe({
      next: (data) => {
        this.collectionOrderItems.set(data.items || []);
        this.collectionOrderLoading.set(false);
      },
      error: (err) => {
        this.collectionOrderLoading.set(false);
        this.showToast('加载专辑成员失败: ' + (err.message || '网络错误'), 'error');
      }
    });
  }

  closeCollectionOrderModal() {
    this.isCollectionOrderModalOpen.set(false);
    this.orderingCollection.set(null);
    this.draggedOrderIndex.set(null);
  }

  moveCollectionOrderItem(index: number, direction: -1 | 1) {
    const list = [...this.collectionOrderItems()];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    this.collectionOrderItems.set(list);
  }

  onCollectionDragStart(index: number) {
    this.draggedOrderIndex.set(index);
  }

  onCollectionDragOver(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    const fromIndex = this.draggedOrderIndex();
    if (fromIndex === null || fromIndex === targetIndex) return;
    const list = [...this.collectionOrderItems()];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(targetIndex, 0, moved);
    this.collectionOrderItems.set(list);
    this.draggedOrderIndex.set(targetIndex);
  }

  onCollectionDragEnd() {
    this.draggedOrderIndex.set(null);
  }

  removeMemberInOrderModal(item: ResourceItemDto) {
    const col = this.orderingCollection();
    if (!col) return;
    this.resService.batchAssignCollection([item.id], 'none').subscribe({
      next: () => {
        this.collectionOrderItems.set(this.collectionOrderItems().filter(x => x.id !== item.id));
        this.loadCollections();
        this.loadResources();
        this.showToast(`已从专辑移出「${item.title}」`);
      },
      error: (err) => this.showToast('移出失败: ' + (err.message || '网络错误'), 'error')
    });
  }

  saveCollectionOrder() {
    const col = this.orderingCollection();
    if (!col) return;
    const itemIds = this.collectionOrderItems().map(i => i.id);
    this.collectionOrderSaving.set(true);
    this.resService.reorderCollectionItems(col.id, itemIds).subscribe({
      next: () => {
        this.collectionOrderSaving.set(false);
        this.showToast('专辑成员排序已保存（已自动切换为手动排序模式）');
        this.closeCollectionOrderModal();
        this.loadCollections();
      },
      error: (err) => {
        this.collectionOrderSaving.set(false);
        this.showToast('保存排序失败: ' + (err.message || '网络错误'), 'error');
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

  // ==========================================
  // 会员等级与额度流控管理体系 (Member & Quotas Management)
  // ==========================================
  memberService = inject(MemberService);
  memberSubTab = signal<'levels' | 'codes' | 'users' | 'settings'>('levels');

  toggleMemberSystem() {
    const currentState = !!this.siteSettings().member_system_enabled;
    const nextState = !currentState;
    this.siteSettings.update(s => ({ ...s, member_system_enabled: nextState }));
    this.resService.updateSettings({ member_system_enabled: nextState }).subscribe({
      next: (res) => {
        this.siteSettings.set(res);
        this.showToast(nextState ? '🎉 会员与每日额度流控已开启！' : '🌿 已切换为全站纯免费放量模式！前台已隐藏会员与限制', 'success');
      },
      error: (err) => {
        this.showToast(`保存失败: ${err.error?.message || err.message}`);
      }
    });
  }

  // 1. 会员等级与额度配置
  memberLevels = signal<MemberLevelDto[]>([]);
  isLoadingMemberLevels = signal<boolean>(false);
  editingLevel = signal<MemberLevelDto | null>(null);
  isSavingLevel = signal<boolean>(false);

  // 2. 卡密/兑换码管理
  activationCodes = signal<ActivationCodeDto[]>([]);
  codesTotal = signal<number>(0);
  codesPage = signal<number>(1);
  codesPageSize = signal<number>(20);
  codesFilterStatus = signal<string>('');
  codesFilterBatch = signal<string>('');
  codesFilterKeyword = signal<string>('');
  isLoadingCodes = signal<boolean>(false);

  // 批量生成卡密弹窗
  showBatchGenerateModal = signal<boolean>(false);
  batchTargetLevel = signal<string>('vip_month');
  batchDurationDays = signal<number>(30);
  batchCount = signal<number>(50);
  batchBatchNo = signal<string>('');
  batchRemark = signal<string>('');
  isGeneratingCodes = signal<boolean>(false);
  generatedResultText = signal<string>('');
  showGeneratedResultModal = signal<boolean>(false);

  // 3. 注册会员用户管理
  memberUsers = signal<FrontUserDto[]>([]);
  memberUsersTotal = signal<number>(0);
  memberUsersPage = signal<number>(1);
  memberUsersKeyword = signal<string>('');
  memberUsersLevelFilter = signal<string>('');
  isLoadingMemberUsers = signal<boolean>(false);
  editingUser = signal<FrontUserDto | null>(null);
  editUserLevelId = signal<string>('');
  editUserVipExpireAt = signal<string>('');
  editUserIsActive = signal<boolean>(true);
  isSavingUser = signal<boolean>(false);

  loadMemberLevels() {
    this.isLoadingMemberLevels.set(true);
    this.memberService.getAdminMemberLevels().subscribe({
      next: (list) => {
        this.memberLevels.set(list || []);
        this.isLoadingMemberLevels.set(false);
      },
      error: () => this.isLoadingMemberLevels.set(false)
    });
  }

  startEditMemberLevel(lvl: MemberLevelDto) {
    this.editingLevel.set({ ...lvl });
  }

  cancelEditMemberLevel() {
    this.editingLevel.set(null);
  }

  saveMemberLevel() {
    const lvl = this.editingLevel();
    if (!lvl) return;
    this.isSavingLevel.set(true);
    this.memberService.updateAdminMemberLevel(lvl.id, lvl).subscribe({
      next: (updated) => {
        this.showToast(`✅ 角色【${updated.name}】额度配置已成功保存！`, 'success');
        this.editingLevel.set(null);
        this.isSavingLevel.set(false);
        this.loadMemberLevels();
      },
      error: (err) => {
        this.showToast(`❌ 更新失败: ${err.error?.message || '网络错误'}`);
        this.isSavingLevel.set(false);
      }
    });
  }

  loadActivationCodes(page = 1) {
    this.codesPage.set(page);
    this.isLoadingCodes.set(true);
    this.memberService.getAdminActivationCodes({
      page: this.codesPage(),
      page_size: this.codesPageSize(),
      status: this.codesFilterStatus(),
      batch_no: this.codesFilterBatch(),
      keyword: this.codesFilterKeyword()
    }).subscribe({
      next: (res) => {
        this.activationCodes.set(res?.items || []);
        this.codesTotal.set(res?.total || 0);
        this.isLoadingCodes.set(false);
      },
      error: () => this.isLoadingCodes.set(false)
    });
  }

  openBatchGenerateModal() {
    this.batchTargetLevel.set('vip_month');
    this.batchDurationDays.set(30);
    this.batchCount.set(50);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.batchBatchNo.set(`TB-${dateStr}-B1`);
    this.batchRemark.set('淘宝自动发卡批次');
    this.showBatchGenerateModal.set(true);
  }

  closeBatchGenerateModal() {
    this.showBatchGenerateModal.set(false);
  }

  submitBatchGenerateCodes() {
    if (this.isGeneratingCodes()) return;
    this.isGeneratingCodes.set(true);
    this.memberService.batchGenerateCodes({
      target_level_id: this.batchTargetLevel(),
      duration_days: this.batchDurationDays(),
      count: this.batchCount(),
      batch_no: this.batchBatchNo(),
      remark: this.batchRemark()
    }).subscribe({
      next: (res) => {
        this.isGeneratingCodes.set(false);
        this.showBatchGenerateModal.set(false);
        this.generatedResultText.set(res.plain_text || '');
        this.showGeneratedResultModal.set(true);
        this.loadActivationCodes(1);
        this.showToast(`🎉 成功批量生成 ${res.count} 张卡密！`, 'success');
      },
      error: (err) => {
        this.isGeneratingCodes.set(false);
        this.showToast(`生成失败: ${err.error?.message || '未知错误'}`);
      }
    });
  }

  copyGeneratedCodes() {
    const text = this.generatedResultText();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 全部卡密已复制到剪贴板，可直接粘贴到淘宝自动发卡系统！', 'success');
      });
    } else {
      this.showToast('请直接手动选中框中文本复制');
    }
  }

  voidActivationCode(code: ActivationCodeDto) {
    if (!confirm(`确定作废卡密 ${code.code} 吗？作废后无法再次兑换。`)) return;
    this.memberService.voidActivationCode(code.id).subscribe({
      next: () => {
        this.showToast('已作废该卡密', 'success');
        this.loadActivationCodes(this.codesPage());
      },
      error: (err) => this.showToast(err.error?.message || '作废失败')
    });
  }

  loadMemberUsers(page = 1) {
    this.memberUsersPage.set(page);
    this.isLoadingMemberUsers.set(true);
    this.memberService.getAdminUsers({
      page: this.memberUsersPage(),
      page_size: 20,
      keyword: this.memberUsersKeyword(),
      level_id: this.memberUsersLevelFilter()
    }).subscribe({
      next: (res) => {
        this.memberUsers.set(res?.items || []);
        this.memberUsersTotal.set(res?.total || 0);
        this.isLoadingMemberUsers.set(false);
      },
      error: () => this.isLoadingMemberUsers.set(false)
    });
  }

  startEditMemberUser(user: FrontUserDto) {
    this.editingUser.set(user);
    this.editUserLevelId.set(user.level_id || 'user');
    this.editUserVipExpireAt.set(user.vip_expire_at ? user.vip_expire_at.substring(0, 10) : '');
    this.editUserIsActive.set(user.is_active);
  }

  cancelEditMemberUser() {
    this.editingUser.set(null);
  }

  saveMemberUser() {
    const user = this.editingUser();
    if (!user) return;
    this.isSavingUser.set(true);
    const expireVal = this.editUserVipExpireAt() ? new Date(this.editUserVipExpireAt() + 'T23:59:59Z').toISOString() : null;
    this.memberService.updateAdminUser(user.id, {
      level_id: this.editUserLevelId(),
      vip_expire_at: expireVal,
      is_active: this.editUserIsActive()
    }).subscribe({
      next: () => {
        this.showToast(`✅ 用户 ${user.username} 属性已保存`, 'success');
        this.editingUser.set(null);
        this.isSavingUser.set(false);
        this.loadMemberUsers(this.memberUsersPage());
      },
      error: (err) => {
        this.isSavingUser.set(false);
        this.showToast(`保存失败: ${err.error?.message || '网络错误'}`);
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
  fulfillSendEmail = signal<boolean>(true);
  fulfillBoundResourceId = signal<string>('');
  fulfillResourceSearchKeyword = signal<string>('');
  fulfillResourceSearchResults = signal<any[]>([]);
  fulfillSearchingResources = signal<boolean>(false);
  selectedFulfillResource = signal<any>(null);
  sendingNotifyId = signal<string | null>(null);

  resolveContactEmail(contact?: string): string {
    if (!contact) return '';
    const c = contact.trim();
    const emailMatch = c.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return emailMatch[0].toLowerCase();
    const qqMatch = c.match(/^[1-9][0-9]{4,10}$/);
    if (qqMatch) return `${c}@qq.com`;
    const subQQ = c.match(/(?:qq|qq号|qq群)?[:：\s]*([1-9][0-9]{4,10})/i);
    if (subQQ && subQQ[1]) return `${subQQ[1]}@qq.com`;
    return '';
  }

  isPureDigits(val?: string): boolean {
    if (!val) return false;
    return /^[1-9][0-9]{4,10}$/.test(val.trim());
  }

  get fulfillTargetEmail(): string {
    return this.resolveContactEmail(this.fulfillTargetRequest()?.contact);
  }

  onFulfillResourceKeywordChange(val: string) {
    this.fulfillResourceSearchKeyword.set(val);
    const q = val.trim();
    if (!q) {
      this.fulfillResourceSearchResults.set([]);
      return;
    }
    this.fulfillSearchingResources.set(true);
    this.resService.list({ search: q, page: 1, pageSize: 6 } as any).subscribe({
      next: (res: any) => {
        this.fulfillResourceSearchResults.set(res?.items || []);
        this.fulfillSearchingResources.set(false);
      },
      error: () => this.fulfillSearchingResources.set(false)
    });
  }

  selectFulfillResource(res: any) {
    this.selectedFulfillResource.set(res);
    this.fulfillBoundResourceId.set(res.id);
    this.fulfillResourceSearchResults.set([]);
    this.fulfillResourceSearchKeyword.set('');
    if (!this.fulfillNoteInput() || this.fulfillNoteInput().includes('已在相关学段专区上架')) {
      this.fulfillNoteInput.set(`已为您核对并上线《${res.title}》，内附完整高清试卷与网盘转存链接，欢迎下载学习！`);
    }
  }

  clearFulfillResource() {
    this.selectedFulfillResource.set(null);
    this.fulfillBoundResourceId.set('');
  }

  manualNotifyRequest(req: ResourceRequestDto, event?: any) {
    if (event?.stopPropagation) event.stopPropagation();
    if (this.sendingNotifyId()) return;

    const email = this.resolveContactEmail(req.contact);
    if (!email) {
      this.showToast('该求助记录未留下有效的邮箱或QQ号，无法发信', 'error');
      return;
    }

    this.sendingNotifyId.set(req.id);
    this.resService.notifyAdminRequest(req.id).subscribe({
      next: (res) => {
        this.sendingNotifyId.set(null);
        this.showToast(res.message || `已向 ${res.email_to || email} 发送上架通知邮件！`, 'success');
        req.email_notified = true;
        req.email_notified_at = new Date().toISOString();
      },
      error: (err) => {
        this.sendingNotifyId.set(null);
        this.showToast('发信失败: ' + (err.error?.message || err.message), 'error');
      }
    });
  }

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
    this.fulfillSendEmail.set(!!this.resolveContactEmail(req.contact));
    this.fulfillBoundResourceId.set(req.fulfilled_resource_id || '');
    this.selectedFulfillResource.set(null);
    this.fulfillResourceSearchKeyword.set('');
    this.fulfillResourceSearchResults.set([]);
    this.isFulfillModalOpen.set(true);

    if (req.fulfilled_resource_id) {
      this.resService.get(req.fulfilled_resource_id).subscribe({
        next: (r: any) => this.selectedFulfillResource.set(r),
        error: () => {}
      });
    } else {
      const kw = req.title.slice(0, 10);
      this.onFulfillResourceKeywordChange(kw);
    }
  }

  closeFulfillModal() {
    this.isFulfillModalOpen.set(false);
    this.fulfillTargetRequest.set(null);
    this.selectedFulfillResource.set(null);
    this.fulfillResourceSearchResults.set([]);
  }

  submitFulfill() {
    const target = this.fulfillTargetRequest();
    if (!target || this.submittingFulfill()) return;

    this.submittingFulfill.set(true);
    this.resService.updateAdminRequest(target.id, {
      status: 'fulfilled',
      fulfilled_note: this.fulfillNoteInput(),
      fulfilled_resource_id: this.fulfillBoundResourceId() || null,
      send_email_notification: this.fulfillSendEmail()
    }).subscribe({
      next: (res: any) => {
        this.submittingFulfill.set(false);
        this.closeFulfillModal();
        const msg = res?.message || this.i18n.t('requests.fulfillSuccess');
        this.showToast(msg, res?.email_sent ? 'success' : undefined);
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
  copyLinkTarget = signal<'landing' | 'redirect' | 'direct'>('redirect');
  currentCopyResource = signal<ResourceItemDto | null>(null);
  batchCopyResources = signal<ResourceItemDto[]>([]);
  generatedCopyText = signal<string>('');

  // 纯自动推导当前访问域名 (访问什么地址就自动拼什么地址，无需人工配置)
  get currentSiteDomain(): string {
    return typeof window !== 'undefined' && window.location ? window.location.origin : '';
  }

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

  setCopyLinkTarget(target: 'landing' | 'redirect' | 'direct') {
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
      
      const domain = this.currentSiteDomain;
      const landingUrl = `${domain}/resource/${res.slug}`;
      const smartUrl = `${domain}/goto/${res.slug}`;
      let linkText = '';
      if (target === 'landing') {
        linkText = `🔗 站内极速直达通道：${landingUrl}`;
      } else if (target === 'redirect') {
        linkText = `🔗 专属网盘直达链接：${smartUrl}` + (primaryLink && primaryLink.extract_code ? ` (提取码: ${primaryLink.extract_code})` : '');
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
      
      const domain = this.currentSiteDomain;
      let batchLinksText = '';
      if (target === 'landing') {
        batchLinksText = items.map((it, idx) => `${idx + 1}. ${it.title} ➔ ${domain}/resource/${it.slug}`).join('\n');
      } else if (target === 'redirect') {
        batchLinksText = items.map((it, idx) => {
          const l = (it.links && it.links.length > 0) ? (it.links.find(x => x.is_primary) || it.links[0]) : null;
          return `${idx + 1}. ${it.title} ➔ ${domain}/goto/${it.slug}${l?.extract_code ? ` (密码:${l.extract_code})` : ''}`;
        }).join('\n');
      } else {
        batchLinksText = items.map((it, idx) => {
          const l = (it.links && it.links.length > 0) ? (it.links.find(x => x.is_primary) || it.links[0]) : null;
          return `${idx + 1}. ${it.title} ➔ ${l?.share_url || `${domain}/resource/${it.slug}`}${l?.extract_code ? ` (密码:${l.extract_code})` : ''}`;
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
    const count = this.totalCount() || this.resources().length || 3000;
    const countStr = count.toLocaleString();
    const siteUrl = this.currentSiteDomain;

    let text = '';
    if (tab === 'xiaohongshu') {
      text = `家有中小学/备考的速存！终于找到了这个良心教辅真题站😭\n\n挖到了宝藏学习资源库：【学霸网】(${siteUrl})！\n\n📌 为什么一定要收藏？\n1. 超全收录：目前已整理 ${countStr}+ 套真题密卷，涵盖小学 1-6 年级、初中中考、高中高考、教师资格证、公务员省考国考！\n2. 100% 矢量无损排版：A4 纸直接打印超级清晰，公式和手写笔迹绝不模糊，内含名校名师高清微课解析视频。\n3. 免解压密码：直接一键转存到自己网盘，永久私存防失效！\n\n💡 备考冲刺直接省下几百块买试卷辅导书的费用，赶紧存到浏览器书签/网盘备用，随时随地调阅！\n#中小学试卷 #备考资料 #名校期末卷 #初中中考 #高考冲刺 #教师资格证 #学霸网`;
    } else if (tab === 'wechat') {
      text = `各位家长/考友们好，给大家分享一个非常实用的真题资源网站【学霸网】(${siteUrl})。\n\n网站已收录整理了 ${countStr}+ 套中小学名校期末真题、中高考冲刺密卷、教资及公考备考资料，全部是 A4 矢量排版，打印出来字迹清晰，还配有名校名师微课讲解。\n\n全站资料免费调阅，建议大家点开后顺手先保存到自己的网盘备用，免去平时到处找试卷买资料的繁琐。祝孩子们学习进步！💪`;
    } else if (tab === 'forum') {
      text = `【资源汇总】中小学各学段名校真题密卷与备考微课全套免费调阅（持续更新中）\n━━━━━━━━━━━━━━━━━━━\n📚 站点名称：学霸网 (${siteUrl})\n📊 在库规模：${countStr}+ 套精选题库，每日自动化巡检\n🎯 覆盖专区：小学(1-6年级) / 初中中考 / 高中高考 / 教师资格证 / 考公升学\n✨ 核心优势：100% 矢量 A4 纸极清可打印原版、名师微课原画、免解压密码、网盘一键极速转存\n\n📥 官网直达通道：${siteUrl}\n官方备考交流群：625248438\n建议收藏到浏览器书签备用！`;
    } else {
      text = `学霸网 (${siteUrl}) - 专注中小学名校期末真题与教资公考刚需教辅，收录 ${countStr}+ 套真题，支持无损 A4 极清打印与原画微课一键转存！`;
    }
    this.generatedSitePromoText.set(text);
  }

  async copySitePromoUrl() {
    const url = this.currentSiteDomain;
    try {
      await navigator.clipboard.writeText(url);
      this.showToast(`✅ 站点网址已复制：${url}`, 'success');
    } catch {
      this.showToast(`✅ 站点网址已复制：${url}`, 'success');
    }
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
    const url = this.currentSiteDomain;
    try {
      await navigator.clipboard.writeText(url);
      this.showToast(this.i18n.t('sitePromo.urlCopied'), 'success');
    } catch {
      this.showToast('官方网址：' + url, 'success');
    }
  }
}


