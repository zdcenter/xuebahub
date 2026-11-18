import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PortalService } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { MemberService } from '../../../services/member.service';
import { generateQRCodeSvg } from '../../../utils/qrcode.util';
import { WechatGuideModalComponent } from '../../components/wechat-guide-modal/wechat-guide-modal.component';
import { PosterGeneratorService, PosterOptions, PosterTheme } from '../../../services/poster-generator.service';
import { getStageTheme, StageThemeInfo } from '../../../utils/stage-theme.util';

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

  // 交互状态
  copiedLink = signal<string | null>(null);
  expandedDirs = signal<Set<number>>(new Set());
  allExpanded = signal<boolean>(true);
  activeQrModal = signal<{ url: string; driveType: string; extractCode: string } | null>(null);
  showTutorialModal = signal<boolean>(false);

  // 推荐/分享给好友与社群状态 (支持纯前端实时 Canvas 海报生成，零 R2 零云端依赖)
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

  // 估算总页数 (若有显式定义则取真实值，否则基于文件大小智能推算)
  estimatedPages = computed<number>(() => {
    const res = this.resource();
    if (res?.page_count && res.page_count > 0) return res.page_count;
    const size = parseFloat(res?.file_size || '15') || 15;
    return Math.max(18, Math.min(128, Math.round(size * 2.5)));
  });

  // 判定是否为主推夸克网盘
  get primaryLink(): ResourceLinkDto | null {
    const list = this.links();
    return list.find(l => l.drive_type === 'quark') || list[0] || null;
  }

  // 备用网盘 (百度)
  get baiduLink(): ResourceLinkDto | null {
    return this.links().find(l => l.drive_type === 'baidu') || null;
  }

  // 备用网盘列表 (除主推网盘外的所有可用网盘)
  get otherLinks(): ResourceLinkDto[] {
    const primary = this.primaryLink;
    if (!primary) return [];
    return this.links().filter(l => l !== primary && l.status !== 'invalid' && !!l.share_url);
  }

  getDriveLabel(type: string): { name: string; icon: string } {
    switch (type) {
      case 'quark': return { name: '夸克网盘', icon: '⚡' };
      case 'baidu': return { name: '百度网盘', icon: '☁️' };
      case 'xunlei': return { name: '迅雷云盘', icon: '⚡' };
      case 'aliyun': return { name: '阿里云盘', icon: '📦' };
      case 'uc': return { name: 'UC网盘', icon: '🐿️' };
      default: return { name: '备用通道', icon: '🔗' };
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

  closeTutorialModal() {
    this.showTutorialModal.set(false);
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

  // 文件树规范化
  displayTree = computed(() => {
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
          const subfileKeywords = this.extractSubfileKeywords(tree, 10);
          const keywords = [
            resourceItem.title,
            this.stageLabel,
            resourceItem.subject,
            resourceItem.grade,
            resourceItem.edition,
            ...subfileKeywords,
            '高清PDF下载',
            'A4无损打印',
            '夸克网盘转存',
            '百度网盘'
          ].filter(Boolean).join(', ');

          this.seoService.update({
            title: `${resourceItem.title} - 高清网盘下载与转存`,
            description: resourceItem.description || `${resourceItem.title}，正版高清PDF/视频课件，支持A4无损打印与极速转存。内含 ${totalFiles} 个精品教学资料与试卷。`,
            keywords
          });

          // 注入 Schema.org 结构化数据 (LearningResource / Book + BreadcrumbList)
          const isBook = resourceItem.stage === 'book' || resourceItem.channel === 'book';
          this.seoService.setJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': isBook ? 'Book' : 'LearningResource',
                '@id': this.currentUrl,
                'name': resourceItem.title,
                'description': resourceItem.description || resourceItem.title,
                'inLanguage': 'zh-CN',
                'educationalLevel': this.stageLabel,
                'datePublished': resourceItem.created_at || '2026-01-01',
                'provider': {
                  '@type': 'Organization',
                  'name': '学霸网',
                  'url': 'https://www.xuebaw.com'
                }
              },
              {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                  {
                    '@type': 'ListItem',
                    'position': 1,
                    'name': '首页',
                    'item': 'https://www.xuebaw.com'
                  },
                  {
                    '@type': 'ListItem',
                    'position': 2,
                    'name': this.stageLabel,
                    'item': `https://www.xuebaw.com${this.stageHref}`
                  },
                  {
                    '@type': 'ListItem',
                    'position': 3,
                    'name': resourceItem.title,
                    'item': this.currentUrl
                  }
                ]
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
  } | null>(null);
  private toastTimer: any = null;

  showDownloadFeedback(link: ResourceLinkDto) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const isQuark = link.drive_type === 'quark' || Boolean(link.share_url && link.share_url.includes('quark.cn'));
    const driveName = this.getDriveLabel(link.drive_type).name;
    this.downloadToast.set({
      extractCode: link.extract_code,
      targetUrl: link.share_url,
      isQuark,
      driveName
    });
    this.toastTimer = setTimeout(() => {
      this.closeDownloadToast();
    }, 5000);
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
    if (link.extract_code && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link.extract_code).catch(() => {});
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

  private normalizeFileTree(list: any[]): any[] {
    if (!Array.isArray(list)) return [];
    const hasNested = list.some(i => i.is_dir && Array.isArray(i.children));
    if (hasNested) {
      return list;
    }

    const folderMap = new Map<string, any>();
    const rootItems: any[] = [];

    for (const item of list) {
      const name = item.name || '';
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
          ...item,
          name: fileName
        });
      } else {
        rootItems.push(item);
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
