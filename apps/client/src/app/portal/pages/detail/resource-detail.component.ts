import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PortalService, SiteSettings } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceService, ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { MemberService } from '../../../services/member.service';
import { generateQRCodeSvg } from '../../../utils/qrcode.util';
import { WechatGuideModalComponent } from '../../components/wechat-guide-modal/wechat-guide-modal.component';
import { PosterGeneratorService, PosterOptions, PosterTheme } from '../../../services/poster-generator.service';
import { getStageTheme, StageThemeInfo } from '../../../utils/stage-theme.util';
import { parseMarkdown } from '../../../utils/markdown.util';

@Component({
  selector: 'app-resource-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, WechatGuideModalComponent],
  templateUrl: './resource-detail.component.html',
  styles: [`
    .btn-primary-transfer {
      background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%) !important;
      color: #ffffff !important;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 14px -2px rgba(5, 150, 105, 0.35);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      width: 100%;
      min-height: 48px;
    }
    .btn-primary-transfer:hover {
      background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%) !important;
      box-shadow: 0 6px 20px -2px rgba(5, 150, 105, 0.45);
      transform: translateY(-1px);
    }
    .btn-primary-transfer:active {
      transform: translateY(1px) scale(0.99);
      box-shadow: 0 2px 8px -2px rgba(5, 150, 105, 0.3);
    }
    .btn-baidu-transfer {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%) !important;
      color: #ffffff !important;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 14px -2px rgba(37, 99, 235, 0.35);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      width: 100%;
      min-height: 48px;
    }
    .btn-baidu-transfer:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%) !important;
      box-shadow: 0 6px 20px -2px rgba(37, 99, 235, 0.45);
      transform: translateY(-1px);
    }
    .btn-baidu-transfer:active {
      transform: translateY(1px) scale(0.99);
      box-shadow: 0 2px 8px -2px rgba(37, 99, 235, 0.3);
    }
    .btn-secondary-action {
      background: #f8fafc;
      color: #334155;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 14px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid #e2e8f0;
      transition: all 0.15s ease-in-out;
      user-select: none;
    }
    .btn-secondary-action:hover {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #cbd5e1;
    }
    .btn-emerald-download {
      background-color: #00965e !important;
      color: #ffffff !important;
      font-weight: 700;
      font-size: 14px;
      padding: 0 16px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      transition: all 0.15s ease-in-out;
      width: 140px;
      height: 38px;
      box-sizing: border-box;
      user-select: none;
    }
    .btn-emerald-download:hover {
      background-color: #008252 !important;
      color: #ffffff !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }
    .btn-emerald-download:active {
      transform: scale(0.97);
    }
    .btn-emerald-download svg {
      width: 16px;
      height: 16px;
      fill: #ffffff !important;
      flex-shrink: 0;
    }
    .btn-emerald-download span {
      color: #ffffff !important;
      font-weight: 700;
      font-size: 14px;
      line-height: 1;
    }
    .btn-share-recommend {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
      color: #ffffff !important;
      font-weight: 700;
      font-size: 13px;
      padding: 0 14px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      transition: all 0.15s ease-in-out;
      width: 140px;
      height: 38px;
      box-sizing: border-box;
      user-select: none;
    }
    .btn-share-recommend:hover {
      background: linear-gradient(135deg, #0369a1 0%, #075985 100%) !important;
      box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
    }
    .btn-share-recommend:active {
      transform: scale(0.97);
    }
    .btn-share-recommend svg {
      width: 15px;
      height: 15px;
      fill: #ffffff !important;
      flex-shrink: 0;
    }
    .btn-share-recommend span {
      color: #ffffff !important;
      font-weight: 700;
      font-size: 13px;
      line-height: 1;
    }
  `]
})
export class ResourceDetailComponent implements OnInit {
  resource = signal<ResourceItemDto | null>(null);
  links = signal<ResourceLinkDto[]>([]);
  isLoading = signal<boolean>(true);

  // 同科目/同学段关联精选资料推荐 (提升留存与转化大杀器)
  relatedResources = signal<ResourceItemDto[]>([]);
  isRelatedLoading = signal<boolean>(false);

  // PC 端右侧常驻热门转存飙升榜 (TOP 8)
  hotRankList = signal<ResourceItemDto[]>([]);
  isRankLoading = signal<boolean>(false);

  // 交互状态
  copiedLink = signal<string | null>(null);
  copiedCode = signal<string | null>(null);

  copyExtractCode(code: string, event?: Event) {
    if (event?.stopPropagation) event.stopPropagation();
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        this.copiedCode.set(code);
        setTimeout(() => this.copiedCode.set(null), 2500);
      });
    }
  }
  shareTextCopied = signal<boolean>(false);
  isReportingLink = signal<boolean>(false);
  linkReported = signal<boolean>(false);
  expandedDirs = signal<Set<number>>(new Set());
  allExpanded = signal<boolean>(true);
  activeQrModal = signal<{ url: string; driveType: string; extractCode: string } | null>(null);
  showTutorialModal = signal<boolean>(false);

  // 推荐/分享给好友与社群状态 (支持纯前端实时 Canvas 海报生成，零 R2 零云端依赖)
  private resourceService = inject(ResourceService);
  posterService = inject(PosterGeneratorService);
  showShareModal = signal<boolean>(false);
  activeShareTab = signal<'poster' | 'parent' | 'moments' | 'direct'>('poster');
  shareCopySuccess = signal<boolean>(false);
  posterDataUrl = signal<string>('');
  isPosterRendering = signal<boolean>(false);
  selectedPosterTheme = signal<PosterTheme>('academic');

  // 转存量呈现 (以数据库真实统计为准)
  saveCount = computed(() => {
    const res = this.resource();
    if (!res) return 0;
    return res.save_count || 0;
  });

  // 当前资料页完整 URL
  get currentUrl(): string {
    if (typeof window !== 'undefined' && window.location.href) {
      return window.location.href;
    }
    const res = this.resource();
    return `https://www.xuebaw.com/resource/${res?.slug || res?.id || ''}`;
  }

  // 动态推荐文案
  shareText = computed(() => {
    const res = this.resource();
    const title = res?.title || '精选学习资料';
    const url = this.currentUrl;
    const tab = this.activeShareTab();

    if (tab === 'parent') {
      return `【学霸网资料推荐】《${title}》\n精选同步教辅与备考复习资源，直接转存到网盘即可免解压随时查阅下载：\n👉 ${url}`;
    }
    if (tab === 'moments') {
      return `📚 分享一份整理超全的备考学习资料《${title}》！期中期末复习备考精选，网盘免密极速转存：\n🔗 ${url}`;
    }
    return `你要的《${title}》精选资料包在此！网盘免密极速转存地址：${url} \n建议先保存到自己网盘再查看或下载，防失效~`;
  });

  private qrCache = new Map<string, SafeHtml>();

  getQrSvg(url: string, size = 160): SafeHtml {
    if (!url) return '';
    const cacheKey = `${url}_${size}`;
    if (this.qrCache.has(cacheKey)) {
      return this.qrCache.get(cacheKey)!;
    }
    const svgStr = generateQRCodeSvg(url, size, 4);
    const safe = this.sanitizer.bypassSecurityTrustHtml(svgStr);
    this.qrCache.set(cacheKey, safe);
    return safe;
  }

  openQrModal(url: string, driveType: string, extractCode = '') {
    this.activeQrModal.set({ url, driveType, extractCode });
  }

  closeQrModal() {
    this.activeQrModal.set(null);
  }

  constructor(
    private portalService: PortalService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer
  ) {}

  siteSettings = signal<SiteSettings>({});

  // 📝 解析并渲染 Markdown 内容介绍
  renderedDescription = computed<SafeHtml>(() => {
    const desc = this.resource()?.description;
    if (!desc) return '';
    return this.sanitizer.bypassSecurityTrustHtml(parseMarkdown(desc));
  });

  // 估算总页数 (若有显式定义则取真实值，否则基于文件大小智能推算)
  estimatedPages = computed<number>(() => {
    const res = this.resource();
    if (res?.page_count && res.page_count > 0) return res.page_count;
    const size = parseFloat(res?.file_size || '15') || 15;
    return Math.max(18, Math.min(128, Math.round(size * 2.5)));
  });

  // 检查是否存在至少一个有效未失效的网盘链接
  get hasActiveLinks(): boolean {
    return this.links().some(l => l.status !== 'invalid' && !!l.share_url);
  }

  // 判定主推网盘（优先存活正常的夸克网盘；若夸克失效则自动将可用备用网盘提升为主推；若全部失效则回退首条展示维护态）
  get primaryLink(): ResourceLinkDto | null {
    const list = this.links();
    if (!list || list.length === 0) return null;

    // 1. 优先找存活正常的夸克网盘
    const activeQuark = list.find(l => l.drive_type === 'quark' && l.status !== 'invalid' && !!l.share_url);
    if (activeQuark) return activeQuark;

    // 2. 若夸克失效，自动升格其他可用存活网盘为主要入口
    const activeBackup = list.find(l => l.status !== 'invalid' && !!l.share_url);
    if (activeBackup) return activeBackup;

    // 3. 若所有链接均失效，回退首条以展示维护状态
    return list[0] || null;
  }

  // 备用网盘 (百度)
  get baiduLink(): ResourceLinkDto | null {
    return this.links().find(l => l.drive_type === 'baidu') || null;
  }

  // 所有带分享链接的网盘列表 (按夸克优先、百度次之排序，确保各网盘地址完整呈现)
  allDriveLinks = computed<ResourceLinkDto[]>(() => {
    const list = this.links().filter(l => !!l.share_url);
    return [...list].sort((a, b) => {
      if (a.drive_type === 'quark') return -1;
      if (b.drive_type === 'quark') return 1;
      if (a.drive_type === 'baidu') return -1;
      if (b.drive_type === 'baidu') return 1;
      return 0;
    });
  });

  // 备用网盘列表 (除主推网盘外的所有可用未失效网盘)
  get otherLinks(): ResourceLinkDto[] {
    const primary = this.primaryLink;
    if (!primary) return [];
    return this.links().filter(l => l !== primary && l.status !== 'invalid' && !!l.share_url);
  }

  getDriveLabel(type: string): { name: string; icon: string; badge: string; isQuark: boolean; isBaidu: boolean } {
    switch (type) {
      case 'quark': return { name: '夸克网盘', icon: '⚡', badge: '官方推荐 · 极速直存', isQuark: true, isBaidu: false };
      case 'baidu': return { name: '百度网盘', icon: '☁️', badge: '备用转存通道', isQuark: false, isBaidu: true };
      case 'xunlei': return { name: '迅雷云盘', icon: '⚡', badge: '备用云盘', isQuark: false, isBaidu: false };
      case 'aliyun': return { name: '阿里云盘', icon: '📦', badge: '备用通道', isQuark: false, isBaidu: false };
      case 'uc': return { name: 'UC网盘', icon: '🐿️', badge: '备用通道', isQuark: false, isBaidu: false };
      default: return { name: '网盘分发通道', icon: '🔗', badge: '转存通道', isQuark: false, isBaidu: false };
    }
  }

  // 5大考学阶段专属精装教材立体书皮渐变色系 (蓝=小学/小升初, 绿=初中/中考, 紫=高中/高考, 橙=教资, 红=公考)
  get stageTheme(): StageThemeInfo {
    return getStageTheme(this.resource() || undefined);
  }

  get stageShortLabel(): string {
    return this.stageTheme.shortLabel;
  }

  get subjectBgColor(): string {
    return this.stageTheme.gradientClass;
  }

  openTutorialModal() {
    this.showTutorialModal.set(true);
  }

  copyWechatShareText() {
    const res = this.resource();
    if (!res) return;

    const gradeSubject = [res.grade, res.subject].filter(Boolean).join('');
    const editionText = res.edition ? ` · ${res.edition}` : '';
    const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://www.xuebaw.com/resource/${res.slug || res.id}`;

    const text = `【学霸网资料整理】《${res.title}》
适用：${gradeSubject || this.stageLabel}${editionText} · 含完整解析 · 支持A4无损打印
夸克网盘免密直存：${shareUrl}
（手机、电脑、平板随时查阅与复习，速存防失效！）`;

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.shareTextCopied.set(true);
        setTimeout(() => this.shareTextCopied.set(false), 2500);
      });
    } else if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.shareTextCopied.set(true);
      setTimeout(() => this.shareTextCopied.set(false), 2500);
    }
  }

  closeTutorialModal() {
    this.showTutorialModal.set(false);
  }

  reportDeadLink(link: ResourceLinkDto) {
    if (!link || !link.id || this.isReportingLink() || this.linkReported()) return;
    this.isReportingLink.set(true);
    this.resourceService.reportLink(link.id, '前台用户反馈网盘链接失效').subscribe({
      next: () => {
        this.isReportingLink.set(false);
        this.linkReported.set(true);
        setTimeout(() => this.linkReported.set(false), 5000);
      },
      error: () => {
        this.isReportingLink.set(false);
      }
    });
  }

  openShareModal(tab: 'poster' | 'parent' | 'moments' | 'direct' = 'poster') {
    this.activeShareTab.set(tab);
    this.showShareModal.set(true);
    this.shareCopySuccess.set(false);
    if (tab === 'poster') {
      this.generatePoster();
    }
  }

  closeShareModal() {
    this.showShareModal.set(false);
  }

  setShareTab(tab: 'poster' | 'parent' | 'moments' | 'direct') {
    this.activeShareTab.set(tab);
    if (tab === 'poster' && !this.posterDataUrl()) {
      this.generatePoster();
    }
  }

  // 纯客户端实时生成分享海报 (零 R2 零云端依赖，毫秒级出图，带专属直达二维码)
  generatePoster() {
    const res = this.resource();
    if (!res || typeof window === 'undefined') return;

    this.isPosterRendering.set(true);

    try {
      // 提取网盘目录树前 4 项真实文件展示
      const fileItems: { name: string; icon: string; size?: string }[] = [];
      const tree = this.displayTree();
      if (tree && tree.length > 0) {
        for (const item of tree.slice(0, 4)) {
          fileItems.push({
            name: item.name,
            icon: item.is_dir ? '📁' : '📄',
            size: item.size
          });
        }
      }

      // 主题自适应学科色彩
      let theme: PosterTheme = this.selectedPosterTheme();
      const sub = res.subject || '';
      if (!this.selectedPosterTheme()) {
        if (sub.includes('语')) theme = 'xiaohongshu';
        else if (sub.includes('英')) theme = 'emerald';
        else theme = 'academic';
        this.selectedPosterTheme.set(theme);
      }

      const opts: PosterOptions = {
        ratio: 'exam', // 750x1000 黄金试卷知识卡片比例
        theme: theme,
        title: res.title || '精选学习资料',
        subtitle: res.description ? res.description.replace(/^[:：\s\-_]+/, '').slice(0, 70) : '精选名校期中期末试卷及考点解析，网盘免密极速转存！',
        grade: res.grade || res.stage || '',
        subject: res.subject || '全科',
        edition: res.edition || '精选同步教材/讲义',
        file_size: res.file_size || '免密直存',
        targetUrl: this.currentUrl, // 包含 xuebaw.com 的精准详情页 URL
        brandName: '学霸网',
        brandSlogan: 'XUEBAW.COM · 全国名校题库与同步备考智汇',
        fileItems: fileItems.length > 0 ? fileItems : undefined
      };

      const canvas = this.posterService.generatePosterCanvas(opts);
      const dataUrl = canvas.toDataURL('image/png');
      this.posterDataUrl.set(dataUrl);
      this.isPosterRendering.set(false);
    } catch (err) {
      console.error('Failed to generate real-time poster', err);
      this.isPosterRendering.set(false);
    }
  }

  // 切换海报配色主题 (实时换肤)
  changePosterTheme(theme: PosterTheme) {
    this.selectedPosterTheme.set(theme);
    this.generatePoster();
  }

  // 下载海报图片 (PC端一键保存)
  downloadPoster() {
    const dataUrl = this.posterDataUrl();
    if (!dataUrl || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const cleanTitle = (this.resource()?.title || '资料海报').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 25);
    a.download = `学霸网_${cleanTitle}_分享海报.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  copyShareText() {
    const text = this.shareText();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.shareCopySuccess.set(true);
        setTimeout(() => this.shareCopySuccess.set(false), 3000);
      });
    }
  }

  get stageLabel(): string {
    const stage = this.resource()?.stage || '';
    const map: Record<string, string> = {
      primary: '小学专区',
      junior: '初中专区',
      senior: '高中专区',
      cert: '教师资格证',
      exam: '考公考研',
      book: '电子课本'
    };
    return map[stage] || stage || '资料专区';
  }

  get stageHref(): string {
    const stage = this.resource()?.stage || '';
    if (['primary', 'junior', 'senior', 'cert', 'exam', 'book'].includes(stage)) {
      return `/${stage}`;
    }
    return '/';
  }

  get formattedDate(): string {
    const res = this.resource() as any;
    const d = res?.created_at || res?.createdAt;
    return d ? d.substring(0, 10) : '2026-10-18';
  }

  // 是否为正版统编电子教材专区资源
  isBookResource = computed(() => {
    const r = this.resource();
    return r?.channel_slug === 'book' || r?.stage === 'book';
  });

  // 电子教材专用：将章节目录字符串数组智能解析为结构化【单元 -> 课文】列表
  bookChapterUnits = computed(() => {
    const r = this.resource();
    if (!r || !Array.isArray(r.file_tree) || r.file_tree.length === 0) return [];

    const units: { unitTitle: string; lessons: string[] }[] = [];
    let currentUnit = { unitTitle: '第一单元 / 核心导读', lessons: [] as string[] };

    for (const rawItem of r.file_tree) {
      const text = (typeof rawItem === 'string' ? rawItem : (rawItem?.name || '')).trim();
      if (!text) continue;

      const isHeader = text.includes('单元') ||
                       (text.includes('第') && (text.includes('章') || text.includes('模块') || text.includes('篇'))) ||
                       text.startsWith('模块') ||
                       text.startsWith('专题') ||
                       text.startsWith('附录');

      if (isHeader) {
        if (currentUnit.lessons.length > 0 || (currentUnit.unitTitle !== '第一单元 / 核心导读' && currentUnit.unitTitle !== '全书课文目录')) {
          units.push(currentUnit);
        }
        currentUnit = { unitTitle: text, lessons: [] };
      } else {
        currentUnit.lessons.push(text);
      }
    }
    if (currentUnit.lessons.length > 0 || units.length === 0) {
      if (units.length === 0 && currentUnit.unitTitle === '第一单元 / 核心导读') {
        currentUnit.unitTitle = '全书课文目录';
      }
      units.push(currentUnit);
    }
    return units;
  });

  // 电子教材课文总数
  totalLessonCount = computed(() => {
    const units = this.bookChapterUnits();
    return units.reduce((acc, u) => acc + u.lessons.length, 0);
  });

  // 电子教材课文即时搜索过滤词
  lessonSearchKeyword = signal<string>('');

  // 过滤后的章节单元列表
  filteredBookChapterUnits = computed(() => {
    const kw = this.lessonSearchKeyword().trim().toLowerCase();
    const units = this.bookChapterUnits();
    if (!kw) return units;
    return units
      .map(u => {
        const matchTitle = u.unitTitle.toLowerCase().includes(kw);
        const matchingLessons = u.lessons.filter(l => l.toLowerCase().includes(kw));
        if (matchTitle) return u;
        if (matchingLessons.length > 0) return { ...u, lessons: matchingLessons };
        return null;
      })
      .filter((u): u is { unitTitle: string; lessons: string[] } => u !== null);
  });

  // 文件树规范化 (非教材类教辅/微课使用)
  displayTree = computed(() => {
    if (this.isBookResource()) return [];
    const res = this.resource();
    const tree = res?.file_tree;
    if (!Array.isArray(tree) || tree.length === 0) return [];
    return this.normalizeFileTree(tree);
  });

  // 目录树即时过滤检索
  treeSearchQuery = signal<string>('');

  filteredDisplayTree = computed(() => {
    const query = this.treeSearchQuery().trim().toLowerCase();
    const fullTree = this.displayTree();
    if (!query) {
      return fullTree;
    }

    const filterNodes = (nodes: any[]): any[] => {
      const filtered: any[] = [];
      for (const node of nodes) {
        if (node.is_dir) {
          const matchedChildren = Array.isArray(node.children) ? filterNodes(node.children) : [];
          if ((node.name || '').toLowerCase().includes(query) || matchedChildren.length > 0) {
            filtered.push({
              ...node,
              children: matchedChildren.length > 0 ? matchedChildren : (node.children || [])
            });
          }
        } else {
          if ((node.name || '').toLowerCase().includes(query)) {
            filtered.push(node);
          }
        }
      }
      return filtered;
    };

    return filterNodes(fullTree);
  });

  // 搜索匹配文件数统计
  searchMatchCount = computed<number>(() => {
    const query = this.treeSearchQuery().trim();
    if (!query) return 0;
    return this.countTotalFiles(this.filteredDisplayTree());
  });

  onTreeSearchChange(val: string) {
    this.treeSearchQuery.set(val);
    if (val.trim()) {
      // 搜索时自动全量展开所有匹配目录，方便一眼定位
      const allPaths = this.collectAllDirPaths(this.filteredDisplayTree());
      this.expandedPaths.set(new Set(allPaths));
    }
  }

  clearTreeSearch() {
    this.treeSearchQuery.set('');
    const firstLevelPaths = this.collectFirstLevelDirPaths(this.displayTree());
    this.expandedPaths.set(new Set(firstLevelPaths));
    this.allExpanded.set(false);
  }

  // 统计文件总数
  totalFileCount = computed(() => {
    const res = this.resource();
    const tree = res?.file_tree;
    if (!Array.isArray(tree)) return 0;
    return this.countTotalFiles(tree);
  });

  // 提取目录树中的代表性子文件名（用于深层 SEO 关键词）
  private extractSubfileKeywords(nodes: any[], limit = 12): string[] {
    const names: string[] = [];
    const walk = (items: any[]) => {
      for (const item of items) {
        if (names.length >= limit) return;
        if (!item.is_dir && item.name) {
          const cleanName = item.name.replace(/\.[a-zA-Z0-9]+$/, '').trim();
          if (cleanName && cleanName.length > 1 && !names.includes(cleanName)) {
            names.push(cleanName);
          }
        } else if (item.children) {
          walk(item.children);
        }
      }
    };
    walk(nodes);
    return names;
  }

  ngOnInit() {
    this.portalService.getSiteSettings().subscribe(s => this.siteSettings.set(s));
    this.loadHotRankList();
    this.route.params.subscribe(params => {
      const idOrSlug = params['id'];
      if (idOrSlug) {
        this.loadDetail(idOrSlug);
      }
    });
  }

  loadDetail(idOrSlug: string) {
    this.isLoading.set(true);
    this.portalService.getResourceDetail(idOrSlug).subscribe({
      next: res => {
        const resourceItem = res?.resource || (res as any);
        if (resourceItem && (resourceItem.id || resourceItem.title)) {
          this.resource.set(resourceItem);
          this.links.set(res?.links || resourceItem.links || []);

          const tree = Array.isArray(resourceItem.file_tree) ? resourceItem.file_tree : [];
          const totalFiles = this.countTotalFiles(tree);

          // 提取长尾 SEO 关键词与生成富媒体 Schema.org
          const isBook = resourceItem.channel_slug === 'book' || resourceItem.stage === 'book';
          const subfileKeywords = this.extractSubfileKeywords(tree, 10);
          const editionText = resourceItem.edition ? `【${resourceItem.edition}】` : '';
          const gradeSubject = [resourceItem.grade, resourceItem.subject].filter(Boolean).join('');

          // 课本针对性 SEO 黄金长尾词与描述规范化
          let seoTitle: string;
          let seoDesc: string;
          let keywords: string;

          if (isBook) {
            seoTitle = `《${resourceItem.title}》电子课本PDF下载_最新审定版高清课文目录`;
            seoDesc = `学霸网提供正版《${resourceItem.title}》高清矢量电子课本PDF免费在线阅读与夸克网盘免密下载，涵盖全书完整章节目录与课文导航，支持手机免下载全屏翻页阅读与A4纸张高清双面打印，全国中小学正版教科书数字书架。`;
            keywords = [
              resourceItem.title,
              `${resourceItem.title}电子课本`,
              `${resourceItem.title}PDF下载`,
              `${resourceItem.grade || ''}${resourceItem.subject || ''}电子课本`,
              `${resourceItem.edition || '统编版'}${resourceItem.grade || ''}${resourceItem.term || ''}教材`,
              '正版中小学电子教材',
              '统编版电子教科书',
              '夸克网盘免密直存',
              '手机免下载翻页阅读',
              'A4高清打印课本'
            ].filter(Boolean).join(', ');
          } else {
            seoTitle = `${resourceItem.title}${editionText} - ${gradeSubject ? gradeSubject + ' ' : ''}高清PDF下载与网盘转存 - 学霸网`;
            const fileDesc = totalFiles > 0 ? `内含 ${totalFiles} 个真题与教学资料文件` : '全套高清资料整理';
            const fallbackDesc = `${resourceItem.title}${editionText}，正版高清PDF/视频课件，支持A4无损打印与极速转存。${fileDesc}，含详细解析与答案，免费一键转存至个人网盘。`;
            const rawDesc = (resourceItem.description || '').trim();
            seoDesc = rawDesc.length >= 70
              ? rawDesc
              : (rawDesc ? `${rawDesc}。${fallbackDesc}` : fallbackDesc);
            keywords = [
              resourceItem.title,
              this.stageLabel,
              resourceItem.subject,
              resourceItem.grade,
              resourceItem.edition,
              gradeSubject,
              ...subfileKeywords,
              '试卷真题',
              '含答案详解',
              '高清PDF下载',
              'A4无损打印',
              '夸克网盘免密直存',
              '百度网盘',
              '电子课本教材'
            ].filter(Boolean).join(', ');
          }

          this.seoService.update({
            title: seoTitle,
            description: seoDesc,
            keywords,
            canonicalUrl: `https://www.xuebaw.com/resource/${resourceItem.slug || resourceItem.id}`
          });

          // 注入 Schema.org 结构化数据 (LearningResource / Book + BreadcrumbList)
          const breadcrumbItems: any[] = [
            {
              '@type': 'ListItem',
              'position': 1,
              'name': '首页',
              'item': 'https://www.xuebaw.com'
            }
          ];

          if (isBook) {
            breadcrumbItems.push({
              '@type': 'ListItem',
              'position': 2,
              'name': '电子教材数字书架',
              'item': 'https://www.xuebaw.com/book'
            });
            if (resourceItem.grade) {
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 3,
                'name': `${resourceItem.grade}教材`,
                'item': `https://www.xuebaw.com/book?stage=${resourceItem.stage || 'primary'}&grade=${encodeURIComponent(resourceItem.grade)}`
              });
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 4,
                'name': resourceItem.title,
                'item': this.currentUrl
              });
            } else {
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 3,
                'name': resourceItem.title,
                'item': this.currentUrl
              });
            }
          } else {
            breadcrumbItems.push({
              '@type': 'ListItem',
              'position': 2,
              'name': this.stageLabel,
              'item': `https://www.xuebaw.com${this.stageHref}`
            });

            if (resourceItem.subject) {
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 3,
                'name': `${resourceItem.subject}专栏`,
                'item': `https://www.xuebaw.com${this.stageHref}?subject=${encodeURIComponent(resourceItem.subject)}`
              });
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 4,
                'name': resourceItem.title,
                'item': this.currentUrl
              });
            } else {
              breadcrumbItems.push({
                '@type': 'ListItem',
                'position': 3,
                'name': resourceItem.title,
                'item': this.currentUrl
              });
            }
          }

          // 教材专享 Book Schema vs 试卷专享 LearningResource Schema
          const schemaEntity = isBook
            ? {
                '@type': ['Book', 'EducationalResource'],
                '@id': this.currentUrl,
                'name': resourceItem.title,
                'description': seoDesc,
                'inLanguage': 'zh-CN',
                'educationalLevel': [resourceItem.grade, resourceItem.stage].filter(Boolean).join(' ') || '基础教育课程',
                'learningResourceType': '电子课本/教科书',
                'bookFormat': 'https://schema.org/EBook',
                'encodingFormat': 'application/pdf',
                'numberOfPages': resourceItem.page_count || 120,
                'about': resourceItem.subject || '学科课程',
                'bookEdition': resourceItem.edition || '统编版',
                'author': {
                  '@type': 'Organization',
                  'name': resourceItem.edition || '教育部统编审定/人民教育出版社'
                },
                'datePublished': resourceItem.created_at || '2026-01-01',
                'provider': {
                  '@type': 'Organization',
                  'name': '学霸网',
                  'url': 'https://www.xuebaw.com'
                }
              }
            : {
                '@type': 'LearningResource',
                '@id': this.currentUrl,
                'name': resourceItem.title,
                'description': seoDesc,
                'inLanguage': 'zh-CN',
                'educationalLevel': [this.stageLabel, resourceItem.grade].filter(Boolean).join(' ') || this.stageLabel,
                'learningResourceType': resourceItem.format || '试卷/课件',
                'datePublished': resourceItem.created_at || '2026-01-01',
                'provider': {
                  '@type': 'Organization',
                  'name': '学霸网',
                  'url': 'https://www.xuebaw.com'
                }
              };

          this.seoService.setJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
              schemaEntity,
              {
                '@type': 'BreadcrumbList',
                'itemListElement': breadcrumbItems
              }
            ]
          });

          // 默认展示策略：大文件集默认仅展开第1级主文件夹（保持页面清爽优雅，避免撑爆高度）
          // 同时底层 DOM 全量渲染并由 CSS 进行折叠控制，确保百度/Google 爬虫可以 100% 收录全部长尾文件名！
          if (totalFiles <= 10) {
            // 文件总数 <= 10 时，直接全部展开
            const allPaths = this.collectAllDirPaths(tree);
            this.expandedPaths.set(new Set(allPaths));
            this.allExpanded.set(true);
          } else {
            // 文件总数较多时，默认仅展开第 0 级（顶层根目录），让直接子分类（如语文、数学）可见，孙级内容默认收起
            const firstLevelPaths = this.collectFirstLevelDirPaths(tree);
            this.expandedPaths.set(new Set(firstLevelPaths));
            this.allExpanded.set(false);
          }

          // 加载同科目/同学段精选推荐资料 (打造连环转存闭环)
          this.loadRelatedResources(resourceItem.slug || resourceItem.id || idOrSlug);
        }
        // 若参数指定 share=poster 则自动唤起海报生成弹窗
        if (this.route.snapshot.queryParams['share'] === 'poster') {
          setTimeout(() => this.openShareModal('poster'), 100);
        }

        this.isLoading.set(false);
      },
      error: () => {
        // 若参数指定 share=poster 则自动唤起海报生成弹窗
        if (this.route.snapshot.queryParams['share'] === 'poster') {
          setTimeout(() => this.openShareModal('poster'), 100);
        }

        this.isLoading.set(false);
      }
    });
  }

  // 加载同类推荐资料
  loadRelatedResources(idOrSlug: string) {
    this.isRelatedLoading.set(true);
    this.portalService.getRelatedResources(idOrSlug).subscribe({
      next: (list) => {
        // 排除自身 ID/slug
        const currentSlug = this.resource()?.slug || idOrSlug;
        const filtered = (list || []).filter(item => item.slug !== currentSlug && item.id !== currentSlug);
        this.relatedResources.set(filtered.slice(0, 8));
        this.isRelatedLoading.set(false);
      },
      error: () => {
        this.relatedResources.set([]);
        this.isRelatedLoading.set(false);
      }
    });
  }

  // 加载全站热门转存飙升榜 (TOP 8)
  loadHotRankList() {
    this.isRankLoading.set(true);
    this.portalService.getResources({
      channel: 'edu',
      sort: 'popular',
      page: 1,
      limit: 15
    }).subscribe({
      next: (res) => {
        const sorted = (res.items || []).sort((a, b) => ((b.save_count || 0) - (a.save_count || 0)) || ((b.view_count || 0) - (a.view_count || 0)));
        const currentSlug = this.resource()?.slug || '';
        const filtered = sorted.filter(item => item.slug !== currentSlug && item.id !== currentSlug);
        this.hotRankList.set(filtered.slice(0, 8));
        this.isRankLoading.set(false);
      },
      error: () => {
        this.hotRankList.set([]);
        this.isRankLoading.set(false);
      }
    });
  }

  // 记录所有展开文件夹的唯一路径标识 (支持无限级目录独立折叠展开)
  expandedPaths = signal<Set<string>>(new Set());

  // 切换单个文件夹路径展开/折叠
  toggleDirPath(path: string) {
    const current = new Set(this.expandedPaths());
    if (current.has(path)) {
      current.delete(path);
    } else {
      current.add(path);
    }
    this.expandedPaths.set(current);
  }

  isPathExpanded(path: string): boolean {
    return this.expandedPaths().has(path);
  }

  // 收集仅第一级（根级）文件夹路径
  private collectFirstLevelDirPaths(nodes: any[]): string[] {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.is_dir) {
        paths.push(node.name);
      }
    }
    return paths;
  }

  // 递归收集目录树中所有文件夹的唯一路径标识
  private collectAllDirPaths(nodes: any[], parent = ''): string[] {
    let paths: string[] = [];
    for (const node of nodes) {
      if (node.is_dir) {
        const curr = parent ? `${parent}/${node.name}` : node.name;
        paths.push(curr);
        if (Array.isArray(node.children) && node.children.length > 0) {
          paths = paths.concat(this.collectAllDirPaths(node.children, curr));
        }
      }
    }
    return paths;
  }

  // 切换所有文件夹展开/折叠
  toggleAll() {
    const tree = this.displayTree();
    if (this.allExpanded()) {
      this.expandedPaths.set(new Set());
      this.allExpanded.set(false);
    } else {
      const allPaths = this.collectAllDirPaths(tree);
      this.expandedPaths.set(new Set(allPaths));
      this.allExpanded.set(true);
    }
  }

  // 会员额度与卡密状态
  memberService = inject(MemberService);
  currentUser = this.memberService.currentUser;
  quotaStatus = this.memberService.quotaStatus;

  // 额度耗尽提示与卡密快捷兑换弹窗
  showQuotaLimitModal = signal<boolean>(false);
  quotaLimitInfo = signal<any>(null);
  quickRedeemCode = signal<string>('');
  quickRedeemSubmitting = signal<boolean>(false);
  quickRedeemMsg = signal<string>('');
  quickRedeemError = signal<string>('');

  // 微信与 QQ 客户端打开指引
  showWechatGuide = signal<boolean>(false);
  wechatGuideTargetLink = signal<ResourceLinkDto | null>(null);

  // 单文件点击“转存即看”友好引导弹窗状态 (高转化率触点)
  selectedFileForPreview = signal<{
    name: string;
    size?: string;
    ext?: string;
    icon: string;
    badgeClass: string;
    typeTitle: string;
    tipDesc: string;
  } | null>(null);

  onFileNodeClick(node: any) {
    if (node.is_dir) return;
    const ext = (node.ext || '').toUpperCase();
    let typeTitle = '学习资料文件';
    let tipDesc = '该文件已完整收录在网盘合集中。一键转存至您的网盘后，即可在线查阅或高速下载。';

    if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV', 'TS'].includes(ext)) {
      typeTitle = '视频教程课件';
      tipDesc = '该视频课程已收录在完整合集包内。一键转存到网盘后，手机与电脑均支持免下载直接原画播放、倍速学习，不占手机内存！';
    } else if (['PDF'].includes(ext)) {
      typeTitle = 'PDF电子讲义 / 试卷';
      tipDesc = '高清讲义与真题试卷已整理就绪。转存至网盘后支持免下载即开即读、高清矢量缩放，随时随地查阅复习并支持打印！';
    } else if (['DOC', 'DOCX', 'TXT', 'WPS'].includes(ext)) {
      typeTitle = 'Word文档 / 备课教案';
      tipDesc = '试卷及精编教案已收录。保存到网盘后随时随地调取，电脑端支持直接下载与二次编辑排版使用。';
    } else if (['PPT', 'PPTX'].includes(ext)) {
      typeTitle = 'PPT演示课件';
      tipDesc = '同步教学幻灯片课件已包含在合集内。转存到网盘后手机、平板可快速浏览演示，电脑端下载即用。';
    } else if (['XLS', 'XLSX', 'CSV'].includes(ext)) {
      typeTitle = '表格数据 / 知识点清单';
      tipDesc = '数据统计与清单表格已打包。转存后可在线查看或下载至本地查看完整公式与明细排版。';
    } else if (['ZIP', 'RAR', '7Z', 'TAR'].includes(ext)) {
      typeTitle = '完整归档压缩包';
      tipDesc = '大容量综合资料包已整理归档。转存到网盘后支持在线免解压快速浏览各分卷，告别繁琐的下载与解压！';
    } else if (['MP3', 'WAV', 'FLAC', 'AAC', 'M4A'].includes(ext)) {
      typeTitle = '听力音频 / 原声听读';
      tipDesc = '标准音频文件已就绪。转存到网盘后支持息屏磨耳朵、单曲循环与分段复读，随时随地高效学习。';
    }

    this.selectedFileForPreview.set({
      name: node.name,
      size: node.size,
      ext: node.ext,
      icon: this.getFileIcon(node.ext || '', false),
      badgeClass: this.getFileBadgeClass(node.ext || ''),
      typeTitle,
      tipDesc
    });
  }

  closeFilePreviewModal() {
    this.selectedFileForPreview.set(null);
  }

  onSaveFileDirectly(link: ResourceLinkDto, event: MouseEvent) {
    this.closeFilePreviewModal();
    this.onDownloadClick(link, event);
  }

  // 试卷与封面高清全屏画廊 (Lightbox)
  isLightboxOpen = signal<boolean>(false);
  lightboxIndex = signal<number>(0);
  lightboxZoom = signal<number>(1);

  allPreviewImages = computed<string[]>(() => {
    const res = this.resource();
    if (!res) return [];
    const list: string[] = [];
    if (res.cover_image) list.push(res.cover_image);
    if (res.poster_image && !list.includes(res.poster_image)) list.push(res.poster_image);
    if (Array.isArray(res.preview_images)) {
      for (const img of res.preview_images) {
        if (img && !list.includes(img)) list.push(img);
      }
    }
    return list;
  });

  openLightbox(index: number = 0) {
    if (this.allPreviewImages().length === 0) return;
    this.lightboxIndex.set(Math.max(0, Math.min(index, this.allPreviewImages().length - 1)));
    this.lightboxZoom.set(1);
    this.isLightboxOpen.set(true);
  }

  closeLightbox() {
    this.isLightboxOpen.set(false);
    this.lightboxZoom.set(1);
  }

  zoomIn(e?: Event) {
    if (e) e.stopPropagation();
    this.lightboxZoom.update(z => Math.min(3, +(z + 0.3).toFixed(1)));
  }

  zoomOut(e?: Event) {
    if (e) e.stopPropagation();
    this.lightboxZoom.update(z => Math.max(0.6, +(z - 0.3).toFixed(1)));
  }

  resetZoom(e?: Event) {
    if (e) e.stopPropagation();
    this.lightboxZoom.set(1);
  }

  nextImage(e?: Event) {
    if (e) e.stopPropagation();
    const total = this.allPreviewImages().length;
    if (total <= 1) return;
    this.lightboxIndex.update(i => (i + 1) % total);
    this.lightboxZoom.set(1);
  }

  prevImage(e?: Event) {
    if (e) e.stopPropagation();
    const total = this.allPreviewImages().length;
    if (total <= 1) return;
    this.lightboxIndex.update(i => (i - 1 + total) % total);
    this.lightboxZoom.set(1);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (!this.isLightboxOpen()) return;
    if (event.key === 'Escape') {
      this.closeLightbox();
    } else if (event.key === 'ArrowRight') {
      this.nextImage();
    } else if (event.key === 'ArrowLeft') {
      this.prevImage();
    }
  }

  isWeChatOrQQ(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return /micromessenger/i.test(ua) || /qq\//i.test(ua) || /mqqbrowser/i.test(ua);
  }

  // 下载与转存友好反馈 Toast / 快捷操作
  downloadToast = signal<{
    extractCode?: string;
    targetUrl: string;
    isQuark: boolean;
    driveName: string;
    suggestedItem?: ResourceItemDto | null;
  } | null>(null);
  private toastTimer: any = null;

  showDownloadFeedback(link: ResourceLinkDto) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const isQuark = link.drive_type === 'quark' || Boolean(link.share_url && link.share_url.includes('quark.cn'));
    const driveName = this.getDriveLabel(link.drive_type).name;
    const suggestedItem = this.relatedResources().length > 0 ? this.relatedResources()[0] : null;
    this.downloadToast.set({
      extractCode: link.extract_code,
      targetUrl: link.share_url,
      isQuark,
      driveName,
      suggestedItem
    });
    this.toastTimer = setTimeout(() => {
      this.closeDownloadToast();
    }, 6500);
  }

  closeDownloadToast() {
    this.downloadToast.set(null);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  openQuarkApp(shareUrl: string) {
    if (typeof window === 'undefined') return;
    const encoded = encodeURIComponent(shareUrl);
    // 调起夸克 App scheme
    window.location.href = `quark://browser?url=${encoded}`;
    // 延迟兜底
    setTimeout(() => {
      window.location.href = shareUrl;
    }, 1200);
  }

  // 点击直达/下载时校验额度
  onDownloadClick(link: ResourceLinkDto, event: MouseEvent) {
    event.preventDefault();
    const res = this.resource();
    const slug = res?.slug || res?.id || '';

    // 无论前置校验结果，第一时间同步将提取码写入剪贴板（符合浏览器安全策略）
    if (link.extract_code) {
      this.copiedCode.set(link.extract_code);
      setTimeout(() => this.copiedCode.set(null), 3000);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(link.extract_code).catch(() => {});
      }
    }

    this.memberService.consumeQuota(slug).subscribe({
      next: (result) => {
        if (result.allowed) {
          // 若在微信或 QQ 内置浏览器中，拦截并调起右上角蒙层指引 (防链接屏蔽与白屏)
          if (this.isWeChatOrQQ()) {
            this.wechatGuideTargetLink.set(link);
            this.showWechatGuide.set(true);
            this.memberService.fetchQuotaStatus(slug).subscribe();
            return;
          }

          // 浮现提取码与快速转存反馈条
          this.showDownloadFeedback(link);

          // 在新标签页中打开网盘直达地址
          if (typeof window !== 'undefined') {
            window.open(link.share_url, '_blank');
          }
          this.memberService.fetchQuotaStatus(slug).subscribe();
        } else {
          // 额度耗尽，弹出引导升级/卡密兑换模态框
          this.quotaLimitInfo.set(result);
          this.quickRedeemCode.set('');
          this.quickRedeemMsg.set('');
          this.quickRedeemError.set('');
          this.showQuotaLimitModal.set(true);
        }
      },
      error: () => {
        // 网络兜底
        if (this.isWeChatOrQQ()) {
          this.wechatGuideTargetLink.set(link);
          this.showWechatGuide.set(true);
          return;
        }
        this.showDownloadFeedback(link);
        if (typeof window !== 'undefined') {
          window.open(link.share_url, '_blank');
        }
      }
    });
  }

  submitQuickRedeem() {
    const code = this.quickRedeemCode().trim();
    if (!code) {
      this.quickRedeemError.set('请输入卡密');
      return;
    }
    this.quickRedeemSubmitting.set(true);
    this.quickRedeemError.set('');
    this.quickRedeemMsg.set('');
    this.memberService.redeemCode(code).subscribe({
      next: (res) => {
        this.quickRedeemSubmitting.set(false);
        this.quickRedeemMsg.set(res.message || '🎉 恭喜！VIP 兑换成功，已即刻解除额度限制！');
        setTimeout(() => {
          this.showQuotaLimitModal.set(false);
        }, 1500);
      },
      error: (err) => {
        this.quickRedeemSubmitting.set(false);
        this.quickRedeemError.set(err.error?.message || '兑换失败，请检查卡密');
      }
    });
  }

  // 复制网盘地址
  copyShareUrl(url: string, pwd?: string) {
    const text = pwd ? `${url} (密码: ${pwd})` : url;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.copiedLink.set(url);
        setTimeout(() => this.copiedLink.set(null), 2500);
      });
    }
  }

  // 顶部分享推荐
  shareResource() {
    const res = this.resource();
    if (!res) return;
    const url = typeof window !== 'undefined' ? window.location.href : `https://xuebaw.com/resource/${res.slug || res.id}`;
    const text = `【学霸网】精选学习资料推荐：${res.title}\n网盘高速转存地址：${url}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert('资料推荐文案与链接已复制到剪贴板，可直接粘贴分享到微信群、家长群或考友圈！');
      });
    }
  }

  // 文件图标匹配
  getFileIcon(ext: string, isDir?: boolean): string {
    if (isDir) return '📁';
    const e = (ext || '').toUpperCase();
    if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV', 'TS'].includes(e)) return '🎬';
    if (['PDF'].includes(e)) return '📄';
    if (['DOC', 'DOCX', 'TXT', 'WPS'].includes(e)) return '📝';
    if (['PPT', 'PPTX'].includes(e)) return '📑';
    if (['XLS', 'XLSX', 'CSV'].includes(e)) return '📊';
    if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(e)) return '📦';
    if (['MP3', 'WAV', 'FLAC', 'AAC', 'M4A'].includes(e)) return '🎵';
    if (['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(e)) return '🖼️';
    return '📄';
  }

  // 文件类型徽章色系
  getFileBadgeClass(ext: string): string {
    const e = (ext || '').toUpperCase();
    if (e === 'DIR') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (['MP4', 'MKV', 'AVI', 'MOV', 'FLV', 'TS'].includes(e)) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (['PDF'].includes(e)) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (['DOC', 'DOCX', 'TXT', 'WPS'].includes(e)) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (['PPT', 'PPTX'].includes(e)) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (['XLS', 'XLSX', 'CSV'].includes(e)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (['ZIP', 'RAR', '7Z', 'TAR'].includes(e)) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (['MP3', 'WAV', 'FLAC'].includes(e)) return 'bg-teal-50 text-teal-700 border-teal-200';
    if (['JPG', 'JPEG', 'PNG', 'WEBP'].includes(e)) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  // 识别文件特殊属性徽章 (答案解析 / 听力音频 / 讲义课件 / 高清原卷)
  getFileHighlightBadge(name: string): { label: string; class: string } | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (lower.includes('答案') || lower.includes('解析') || lower.includes('详析') || lower.includes('参考答案') || lower.includes('答题卡')) {
      return { label: '含答案解析', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    if (lower.includes('音频') || lower.includes('听力') || lower.includes('mp3') || lower.includes('录音')) {
      return { label: '含听力音频', class: 'bg-teal-50 text-teal-700 border-teal-200' };
    }
    if (lower.includes('课件') || lower.includes('ppt') || lower.includes('讲义') || lower.includes('教案')) {
      return { label: '讲义课件', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (lower.includes('答题卷') || lower.includes('真题卷') || lower.includes('原卷') || lower.includes('试卷') || lower.includes('空白卷')) {
      return { label: '高清试卷', class: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    return null;
  }

  // 快捷触发主网盘链接转存
  triggerPrimaryLinkDownload(event?: MouseEvent) {
    const res = this.resource();
    const link = this.primaryLink || (res && res.links && res.links.length > 0 ? res.links[0] : null);
    if (link) {
      const e = event || ({ preventDefault: () => {} } as any);
      this.onDownloadClick(link, e);
    }
  }

  private normalizeFileTree(list: any[]): any[] {
    if (!Array.isArray(list)) return [];
    const hasNested = list.some(i => i.is_dir && Array.isArray(i.children));
    if (hasNested) {
      return list;
    }

    const folderMap = new Map<string, any>();
    const rootItems: any[] = [];

    for (const item of list) {
      const isStr = typeof item === 'string';
      const name = (isStr ? item : (item.name || '')).trim();
      if (!name) continue;

      const nodeObj = isStr ? { name, is_dir: false, ext: name.split('.').pop() || 'PDF' } : item;

      if (name.includes('/') || name.includes('\\')) {
        const parts = name.split(/[/\\]/);
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
          ...nodeObj,
          name: fileName
        });
      } else {
        rootItems.push(nodeObj);
      }
    }

    const result = [...rootItems];
    for (const folder of folderMap.values()) {
      folder.size = `${folder.children.length} 项`;
      result.push(folder);
    }
    return result;
  }

  private countTotalFiles(list: any[]): number {
    let count = 0;
    const countItems = (items: any[]) => {
      for (const item of items) {
        if (item.is_dir && Array.isArray(item.children) && item.children.length > 0) {
          countItems(item.children);
        } else {
          count++;
        }
      }
    };
    countItems(list);
    return count;
  }
}
