import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalService, HotSearchItem } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceItemDto, CategoryDto } from '../../../services/resource.service';
import { ResourceCardComponent } from '../../components/resource-card/resource-card.component';

@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ResourceCardComponent],
  templateUrl: './channel.component.html'
})
export class ChannelComponent implements OnInit {
  channelSlug = signal<string>('all');
  stageParam = signal<string>('all');
  gradeParam = signal<string>('');
  termParam = signal<string>('');
  subjectParam = signal<string>('');
  editionParam = signal<string>('');
  queryParam = signal<string>('');

  page = signal<number>(1);
  pageSize = signal<number>(20);

  // 排序模式 ('latest': 最新收录/最新发布 [默认], 'popular': 转存最多/最受欢迎, 'views': 最多浏览)
  sortBy = signal<'popular' | 'latest' | 'views'>('latest');

  // 现代视图模式 (grid / list)
  viewMode = signal<'grid' | 'list'>('grid');
  // PC端高级筛选展开折叠
  desktopFilterExpanded = signal<boolean>(false);
  // 移动端全量筛选抽屉开关
  mobileDrawerOpen = signal<boolean>(false);
  // 顶部现代搜索输入框
  searchInput = signal<string>('');

  resources = signal<ResourceItemDto[]>([]);
  totalCount = signal<number>(0);
  isLoading = signal<boolean>(false);
  hotSearches = signal<HotSearchItem[]>([]);
  categoriesGroup = signal<Record<string, CategoryDto[]>>({});

  // 首页右侧常驻：全站/频道热门转存飙升榜 (TOP 8)
  hotRankList = signal<ResourceItemDto[]>([]);
  isRankLoading = signal<boolean>(false);
  searchHistory = signal<string[]>([]);

  // 根据当前 sortBy 响应式排序的主资源列表
  displayResources = computed(() => {
    const list = [...this.resources()];
    const sort = this.sortBy();
    if (sort === 'popular') {
      return list.sort((a, b) => ((b.save_count || 0) - (a.save_count || 0)) || ((b.view_count || 0) - (a.view_count || 0)));
    }
    if (sort === 'views') {
      return list.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    }
    if (sort === 'latest') {
      return list.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    }
    return list;
  });

  Math = Math;

  constructor(
    private portalService: PortalService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  // 专区元数据映射 (客观真实，通俗亲和，说人话)
  channelMeta: Record<string, { title: string; desc: string; icon: string; badge: string }> = {
    all: {
      title: '中小学试卷与同步教辅资料库',
      desc: '期中期末真题、课后练习与电子课本，一键存网盘，支持手机查看与打印。',
      icon: '📚',
      badge: '免费整理 · 免密直存'
    },
    primary: {
      title: '小学专区 (1-6年级同步试卷与真题)',
      desc: '收录小学 1-6 年级语文、数学、英语期中期末试卷与课后练习。',
      icon: '🎒',
      badge: '小学 1-6 年级同步'
    },
    junior: {
      title: '初中专区 (中考真题与各科模拟卷)',
      desc: '初一到初三各科期中期末卷、中考冲刺真题与重难点解析。',
      icon: '📘',
      badge: '初中 · 中考备考'
    },
    senior: {
      title: '高中专区 (高考真题与各省模拟卷)',
      desc: '高一至高三全科期末模拟题、历年高考真题与冲刺密卷。',
      icon: '🎓',
      badge: '高中 · 高考冲刺'
    },
    cert: {
      title: '教师资格证专区 (真题与备考资料)',
      desc: '综合素质、教育教学知识与学科知识历年真题及答案解析。',
      icon: '📜',
      badge: '教师资格证备考'
    },
    exam: {
      title: '公考与事业单位专区 (国考省考真题)',
      desc: '收录公务员国考、各省联考行测与申论真题、事业单位考试备考资料。',
      icon: '🏛️',
      badge: '公考 · 事业单位'
    }
  };

  get currentMeta() {
    return this.channelMeta[this.channelSlug()] || this.channelMeta['all'];
  }

  // 是否为 K12 中小学学段 (若为公考、教资，则不展示学期分册等不相干选项)
  isK12Stage = computed(() => {
    const s = this.stageParam().toLowerCase();
    return !['cert', 'exam'].includes(s) && !s.includes('教师') && !s.includes('公考');
  });

  // 动态年级/分类标题 (非中小学时更符合常理)
  gradeSectionTitle = computed(() => {
    const s = this.stageParam().toLowerCase();
    if (s === 'cert' || s.includes('教师')) return '考试科目:';
    if (s === 'exam' || s.includes('公考')) return '考试分类:';
    return '年级阶段:';
  });

  // 1. 学段选项 (支持数据库分组与兜底配置)
  stages = computed<{ slug: string; name: string; icon: string }[]>(() => {
    const list = this.categoriesGroup()['stage'] || [];
    if (list.length > 0) {
      return list.map(c => ({ slug: c.slug || c.name, name: c.name, icon: c.icon || '📚' }));
    }
    return [
      { slug: 'primary', name: '小学专区', icon: '🎒' },
      { slug: 'junior', name: '初中专区', icon: '📘' },
      { slug: 'senior', name: '高中专区', icon: '🎓' },
      { slug: 'kindergarten', name: '幼小衔接', icon: '🧸' },
      { slug: 'cert', name: '教师资格证', icon: '📜' },
      { slug: 'exam', name: '考公考研', icon: '🏛️' },
      { slug: 'classic', name: '学科经典/名著', icon: '🏛️' }
    ];
  });

  // 2. 年级自适应计算 (依据所选学段联动展示)
  availableGrades = computed(() => {
    const s = this.stageParam().toLowerCase();
    const dbGrades = this.categoriesGroup()['grade'] || [];

    if (s === 'classic' || s.includes('经典') || s.includes('名著') || s.includes('竞赛')) {
      return [
        { name: '通用/典藏' }, { name: '文史政典籍' }, { name: '大学数理经典' },
        { name: '竞赛奥赛培优' }, { name: '通识科学人文' }
      ];
    }
    if (s === 'primary' || s.includes('小学')) {
      return [
        { name: '一年级' }, { name: '二年级' }, { name: '三年级' },
        { name: '四年级' }, { name: '五年级' }, { name: '六年级' }
      ];
    }
    if (s === 'junior' || s.includes('初中')) {
      return [
        { name: '七年级' }, { name: '八年级' }, { name: '九年级' }, { name: '中考总复习' }
      ];
    }
    if (s === 'senior' || s.includes('高中')) {
      return [
        { name: '高一' }, { name: '高二' }, { name: '高三' }, { name: '高考总复习' }
      ];
    }
    if (s === 'kindergarten' || s.includes('幼')) {
      return [
        { name: '学前通用' }, { name: '大班衔接' }, { name: '拼音启蒙' }, { name: '思维拓展' }
      ];
    }
    if (s === 'cert' || s.includes('教师') || s.includes('资格')) {
      return [
        { name: '综合素质(科一)' }, { name: '教育知识(科二)' }, { name: '学科知识(科三)' },
        { name: '面试教案试讲' }, { name: '普通话等级考试' }
      ];
    }
    if (s === 'exam' || s.includes('公考') || s.includes('考研')) {
      return [
        { name: '国家公务员考试(国考)' }, { name: '多省公务员联考(省考)' },
        { name: '事业单位统考' }, { name: '全国硕士研究生考试(考研)' }
      ];
    }
    if (dbGrades.length > 0) {
      return dbGrades.map(g => ({ name: g.name }));
    }
    return [
      { name: '一年级' }, { name: '二年级' }, { name: '三年级' }, { name: '四年级' }, { name: '五年级' }, { name: '六年级' },
      { name: '七年级' }, { name: '八年级' }, { name: '九年级' }, { name: '高一' }, { name: '高二' }, { name: '高三' }
    ];
  });

  // 3. 学科自适应计算
  availableSubjects = computed(() => {
    const s = this.stageParam().toLowerCase();
    if (s === 'classic' || s.includes('经典') || s.includes('名著') || s.includes('竞赛')) {
      return [
        { name: '文史政经典', icon: '📜' },
        { name: '大学物理与数理', icon: '⚡' },
        { name: '学科竞赛培优', icon: '🏆' },
        { name: '通识科学人文', icon: '💡' }
      ];
    }
    if (s === 'cert' || s.includes('教师') || s.includes('资格')) {
      return [
        { name: '综合素质', icon: '📘' }, { name: '教育知识与能力', icon: '📗' },
        { name: '幼儿保教知识', icon: '👶' }, { name: '语文学科知识', icon: '📖' },
        { name: '数学学科知识', icon: '📐' }, { name: '英语学科知识', icon: '🔤' }
      ];
    }
    if (s === 'exam' || s.includes('公考') || s.includes('考研')) {
      return [
        { name: '行测', icon: '⚡' }, { name: '申论', icon: '🖋️' },
        { name: '考研政治', icon: '🚩' }, { name: '考研英语', icon: '🔤' }, { name: '考研数学', icon: '📐' }
      ];
    }
    if (s === 'junior' || s === 'senior' || s.includes('初中') || s.includes('高中')) {
      return [
        { name: '语文', icon: '📖' }, { name: '数学', icon: '📐' }, { name: '英语', icon: '🔤' },
        { name: '物理', icon: '🔬' }, { name: '化学', icon: '🧪' }, { name: '生物', icon: '🧬' },
        { name: '历史', icon: '📜' }, { name: '道德与法治', icon: '⚖️' }, { name: '地理', icon: '🌍' }
      ];
    }
    return [
      { name: '语文', icon: '📖' }, { name: '数学', icon: '📐' }, { name: '英语', icon: '🔤' },
      { name: '科学', icon: '🔬' }, { name: '道德与法治', icon: '⚖️' }
    ];
  });

  // 4. 教材版本自适应计算
  availableEditions = computed(() => {
    const s = this.stageParam().toLowerCase();
    const dbEditions = this.categoriesGroup()['edition'] || [];
    if (s === 'classic' || s.includes('经典') || s.includes('名著') || s.includes('竞赛')) {
      return [
        { name: '权威典藏全集版', icon: '📚' },
        { name: '影印原著权威版', icon: '📖' },
        { name: '大学名校教材版', icon: '🎓' },
        { name: '中学生竞赛培优版', icon: '🏆' }
      ];
    }
    if (s === 'cert' || s === 'exam') {
      return [
        { name: '国家统考大纲', icon: '🏛️' }, { name: '中公版', icon: '📘' },
        { name: '粉笔版', icon: '✏️' }, { name: '华图版', icon: '📊' }
      ];
    }
    if (dbEditions.length > 0) {
      return dbEditions.map(e => ({ name: e.name, icon: e.icon || '📚' }));
    }
    return [
      { name: '人教版/统编版', icon: '📚' },
      { name: '北师大版', icon: '📚' },
      { name: '苏教版', icon: '📚' },
      { name: '外研版', icon: '🔤' },
      { name: '沪教版', icon: '📚' },
      { name: '鲁教版', icon: '📚' },
      { name: '教科版', icon: '🔬' },
      { name: '冀教版', icon: '📚' }
    ];
  });

  // 5. 学期分册
  availableTerms = [
    { name: '上册 (秋季)' },
    { name: '下册 (春季)' },
    { name: '全一册' },
    { name: '必修一' },
    { name: '必修二' },
    { name: '选择性必修' }
  ];

  // 分页总页数
  totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);

  // 计算展示的页码列表（对称分页算法，包含省略号 -1）
  visiblePages = computed(() => {
    const current = this.page();
    const total = this.totalPages();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: number[] = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push(-1);
      pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1);
      pages.push(-1);
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push(-1);
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push(-1);
      pages.push(total);
    }
    return pages;
  });

  // 检查是否有任何激活的筛选条件
  hasActiveFilters = computed(() => {
    return (this.stageParam() !== 'all' && this.channelSlug() === 'all') ||
      !!this.gradeParam() ||
      !!this.subjectParam() ||
      !!this.editionParam() ||
      !!this.termParam() ||
      !!this.queryParam();
  });

  // 活跃筛选标签胶囊列表（支持单项直接移除）
  activeFilterChips = computed<{ key: 'stage' | 'grade' | 'subject' | 'edition' | 'term' | 'q'; label: string; value: string }[]>(() => {
    const chips: { key: 'stage' | 'grade' | 'subject' | 'edition' | 'term' | 'q'; label: string; value: string }[] = [];
    if (this.channelSlug() === 'all' && this.stageParam() && this.stageParam() !== 'all') {
      const match = this.stages().find(s => s.slug === this.stageParam());
      chips.push({ key: 'stage', label: '学段', value: match ? match.name : this.stageParam() });
    }
    if (this.gradeParam()) {
      chips.push({ key: 'grade', label: '年级', value: this.gradeParam() });
    }
    if (this.subjectParam()) {
      chips.push({ key: 'subject', label: '学科', value: this.subjectParam() });
    }
    if (this.editionParam()) {
      chips.push({ key: 'edition', label: '版本', value: this.editionParam() });
    }
    if (this.termParam()) {
      chips.push({ key: 'term', label: '学期', value: this.termParam() });
    }
    if (this.queryParam()) {
      chips.push({ key: 'q', label: '搜索', value: this.queryParam() });
    }
    return chips;
  });

  removeFilterChip(key: 'stage' | 'grade' | 'subject' | 'edition' | 'term' | 'q') {
    if (key === 'stage') {
      this.setFilter('stage', 'all');
    } else if (key === 'q') {
      this.clearSearch();
    } else {
      this.setFilter(key, '');
    }
  }

  // 统计已激活的筛选维度数量 (用于手机端筛选徽标展示)
  activeFilterCount = computed(() => {
    return this.activeFilterChips().length;
  });

  ngOnInit() {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('portal_view_mode');
      if (savedMode === 'list' || savedMode === 'grid') {
        this.viewMode.set(savedMode);
      }
    }

    this.portalService.getHotSearches().subscribe(h => this.hotSearches.set(h));
    this.portalService.getCategoriesGrouped().subscribe(grp => this.categoriesGroup.set(grp));
    this.loadHotRankList();
    this.loadSearchHistory();

    this.route.data.subscribe(data => {
      const slug = data['channel'] || 'all';
      this.channelSlug.set(slug);
      this.updateSeo();
    });

    this.route.queryParams.subscribe(params => {
      const slug = this.channelSlug();
      const isKnownStage = ['primary', 'junior', 'senior', 'cert', 'exam', 'kindergarten', 'classic'].includes(slug);
      
      const defaultStage = isKnownStage ? slug : 'all';
      this.stageParam.set(params['stage'] || defaultStage);
      this.gradeParam.set(params['grade'] || '');
      this.termParam.set(params['term'] || '');
      this.subjectParam.set(params['subject'] || '');
      this.editionParam.set(params['edition'] || '');
      this.queryParam.set(params['q'] || '');
      this.searchInput.set(params['q'] || '');
      this.page.set(parseInt(params['page'] || '1', 10) || 1);

      this.loadResources();
    });
  }

  // 切换网格 / 列表视图
  setViewMode(mode: 'grid' | 'list') {
    this.viewMode.set(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('portal_view_mode', mode);
    }
  }

  // 展开/收起桌面端高级筛选
  toggleDesktopFilter() {
    this.desktopFilterExpanded.update(v => !v);
  }

  // 移动端全量抽屉开关
  openMobileDrawer() {
    this.mobileDrawerOpen.set(true);
  }

  closeMobileDrawer() {
    this.mobileDrawerOpen.set(false);
  }

  // 顶部现代搜索提交
  onSearchSubmit() {
    const q = this.searchInput().trim();
    if (q) {
      this.saveSearchKeyword(q);
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, page: '1' },
      queryParamsHandling: 'merge'
    });
  }

  loadSearchHistory() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('xuebaw_search_history');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            this.searchHistory.set(list.slice(0, 6));
          }
        }
      } catch (e) {}
    }
  }

  saveSearchKeyword(keyword: string) {
    const k = keyword.trim();
    if (!k || typeof localStorage === 'undefined') return;
    try {
      const cur = this.searchHistory().filter(item => item !== k);
      const next = [k, ...cur].slice(0, 6);
      this.searchHistory.set(next);
      localStorage.setItem('xuebaw_search_history', JSON.stringify(next));
    } catch (e) {}
  }

  clearSearchHistory() {
    this.searchHistory.set([]);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('xuebaw_search_history');
    }
  }

  removeSearchHistoryItem(item: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const next = this.searchHistory().filter(i => i !== item);
    this.searchHistory.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xuebaw_search_history', JSON.stringify(next));
    }
  }

  applyHistorySearch(keyword: string) {
    this.searchInput.set(keyword);
    this.onSearchSubmit();
  }

  clearSearch() {
    this.searchInput.set('');
    this.onSearchSubmit();
  }

  updateSeo() {
    const meta = this.currentMeta;
    const ch = this.channelSlug();
    const path = (!ch || ch === 'all') ? '' : `/${ch}`;

    // 动态多维关键词聚合
    const channelKeywordsMap: Record<string, string> = {
      all: '中小学试卷, 期末复习资料, 历年真题, 统编教材电子课本, 夸克网盘转存, A4打印版试卷, 名校密卷',
      primary: '小学试卷, 小学期中期末考试卷, 小学语文数学英语, 1-6年级真题, 单元练习卷, 夸克免密直存',
      junior: '初中试卷, 中考真题, 初一初二初三期末卷, 中考模拟卷, 中考满分作文, 高清PDF打印',
      senior: '高中试卷, 高考真题, 高三一模二模, 历年高考卷, 高中全科复习讲义, 夸克网盘',
      cert: '教师资格证真题, 综合素质真题, 教育教学知识与能力, 教资笔试历年真题, 面试备考',
      exam: '公务员考试真题, 国考行测申论真题, 省考历年真题, 事业单位公共基础知识'
    };

    this.seoService.update({
      title: meta.title,
      description: meta.desc,
      keywords: channelKeywordsMap[ch] || channelKeywordsMap['all'],
      canonicalUrl: `https://www.xuebaw.com${path}`
    });

    if (!ch || ch === 'all') {
      this.seoService.setJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': 'https://www.xuebaw.com/#website',
            'url': 'https://www.xuebaw.com',
            'name': '学霸网 - 中小学试卷与教辅资料库',
            'description': meta.desc,
            'potentialAction': {
              '@type': 'SearchAction',
              'target': 'https://www.xuebaw.com/?q={search_term_string}',
              'query-input': 'required name=search_term_string'
            }
          },
          {
            '@type': 'FAQPage',
            'mainEntity': [
              {
                '@type': 'Question',
                'name': '学霸网的试卷和教辅资料如何免费下载？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': '学霸网所有教辅试卷均支持一键免密转存至夸克网盘或百度网盘，手机、电脑、平板均可随时在线查阅并支持A4高清无损打印。'
                }
              },
              {
                '@type': 'Question',
                'name': '学霸网涵盖哪些学段与学科的资料？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': '涵盖幼小衔接、小学1-6年级、初中七八九年级中考、高中高考各学科（语文、数学、英语、物理、化学、生物、历史、地理、道德与法治），以及教师资格证、考公考研核心资料与人教版等主流电子教材。'
                }
              }
            ]
          }
        ]
      });
    } else {
      this.seoService.setJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            '@id': `https://www.xuebaw.com${path}`,
            'name': meta.title,
            'description': meta.desc,
            'url': `https://www.xuebaw.com${path}`
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
                'name': meta.title.split('(')[0].trim(),
                'item': `https://www.xuebaw.com${path}`
              }
            ]
          }
        ]
      });
    }
  }

  openRequestHelp() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-request-modal'));
    }
  }

  setFilter(dimension: 'stage' | 'grade' | 'term' | 'subject' | 'edition', value: string) {
    const qp: Record<string, string | null> = { page: '1' };
    if (dimension === 'stage') {
      qp['stage'] = value === 'all' ? null : value;
      qp['grade'] = null;
      qp['term'] = null;
      qp['subject'] = null;
      qp['edition'] = null;
    } else {
      qp[dimension] = value || null;
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: 'merge' });
  }

  resetAllFilters() {
    const qp: Record<string, any> = { page: '1' };
    if (this.queryParam()) {
      qp['q'] = this.queryParam();
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: qp });
  }

  onPageChange(newPage: number) {
    if (newPage < 1 || newPage > this.totalPages() || newPage === this.page()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: newPage },
      queryParamsHandling: 'merge'
    });
    if (typeof window !== 'undefined') {
      const el = document.getElementById('resource-list-anchor');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 380, behavior: 'smooth' });
      }
    }
  }

  loadResources() {
    this.isLoading.set(true);
    const slug = this.channelSlug();
    const isKnownStage = ['primary', 'junior', 'senior', 'cert', 'exam', 'kindergarten', 'classic'].includes(slug);

    let stageVal: string | undefined = undefined;
    if (this.stageParam() && this.stageParam() !== 'all') {
      stageVal = this.stageParam();
    } else if (isKnownStage) {
      stageVal = slug;
    }

    // 频道判定：
    // 若在全局搜索状态（queryParam 存在且未指定 channel），不传 channel 以实现全站联合搜索（同时搜出学习资料与电子教材）；
    // 若为常规浏览（首页、小学、初中等专区），明确指定 channel = 'edu'，锁定学习资料专区，杜绝电子课本混入。
    const hasKeyword = !!this.queryParam();
    let channelVal: string | undefined = undefined;
    if (hasKeyword) {
      channelVal = undefined; // 全局通搜模式 (跨频道)
    } else if (slug && slug !== 'all' && !isKnownStage) {
      channelVal = slug;
    } else {
      channelVal = 'edu';     // 常规学习资料模式 (排除电子教材)
    }

    this.portalService.getResources({
      channel: channelVal,
      stage: stageVal,
      grade: this.gradeParam() || undefined,
      term: this.termParam() || undefined,
      subject: this.subjectParam() || undefined,
      edition: this.editionParam() || undefined,
      q: this.queryParam() || undefined,
      sort: this.sortBy(),
      page: this.page(),
      limit: this.pageSize()
    }).subscribe({
      next: res => {
        this.resources.set(res.items);
        this.totalCount.set(res.total);
        this.isLoading.set(false);
      },
      error: () => {
        this.resources.set([]);
        this.totalCount.set(0);
        this.isLoading.set(false);
      }
    });
  }

  // 切换排序方式
  setSortBy(sort: 'popular' | 'latest' | 'views') {
    if (this.sortBy() === sort) return;
    this.sortBy.set(sort);
    this.loadResources();
  }

  // 加载全站热门转存榜 (TOP 8)
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
        this.hotRankList.set(sorted.slice(0, 8));
        this.isRankLoading.set(false);
      },
      error: () => {
        this.hotRankList.set([]);
        this.isRankLoading.set(false);
      }
    });
  }
}
