import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalService, HotSearchItem } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceItemDto, CategoryDto } from '../../../services/resource.service';
import { ResourceCardComponent } from '../../components/resource-card/resource-card.component';

@Component({
  selector: 'app-channel',
  standalone: true,
  imports: [CommonModule, RouterLink, ResourceCardComponent],
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

  resources = signal<ResourceItemDto[]>([]);
  totalCount = signal<number>(0);
  isLoading = signal<boolean>(false);
  hotSearches = signal<HotSearchItem[]>([]);
  categoriesGroup = signal<Record<string, CategoryDto[]>>({});

  Math = Math;

  constructor(
    private portalService: PortalService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  // 专区元数据映射
  channelMeta: Record<string, { title: string; desc: string; icon: string; badge: string }> = {
    all: {
      title: '全国中小学名校真题密卷与考点题库',
      desc: '精选海淀、黄冈、启东等全国名校期中期末试卷，高考一二模与中考冲刺真题。',
      icon: '📚',
      badge: '全网真题汇总'
    },
    primary: {
      title: '小学专区 (一年级至六年级期中期末真题)',
      desc: '小学 1-6 年级语文、数学、英语全科期中期末试卷，奥数思维启蒙与单元测试。',
      icon: '🎒',
      badge: '1-6年级同步'
    },
    junior: {
      title: '初中专区 (中考真题/名校模拟卷/微课)',
      desc: '初一、初二、初三年级九门核心科目期中期末真题、中考一二模密卷。',
      icon: '📘',
      badge: '中考冲刺备考'
    },
    senior: {
      title: '高中专区 (高考真题/名校一二三模)',
      desc: '高一至高三全科期末真题、高考各省模拟考与状元笔记提分秘籍。',
      icon: '🎓',
      badge: '高考九省联考'
    },
    cert: {
      title: '教师资格证专区 (国考真题/冲刺考点)',
      desc: '综合素质(科一)、教育知识(科二)、学科知识(科三)历年真题与面试教案模板。',
      icon: '📜',
      badge: '教资通关特训'
    },
    exam: {
      title: '考公考研专区 (国省考行测申论/统考真题)',
      desc: '国家公务员考试、多省联考行测高频技巧、申论热点范文与考研政治英语历年真题。',
      icon: '🏛️',
      badge: '体制内上岸题库'
    }
  };

  get currentMeta() {
    return this.channelMeta[this.channelSlug()] || this.channelMeta['all'];
  }

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
      { slug: 'exam', name: '考公考研', icon: '🏛️' }
    ];
  });

  // 2. 年级自适应计算 (依据所选学段联动展示)
  availableGrades = computed(() => {
    const s = this.stageParam().toLowerCase();
    const dbGrades = this.categoriesGroup()['grade'] || [];

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
      { name: '人教版 (教育部统编)', icon: '📚' },
      { name: '北师大版 (BNU)', icon: '📚' },
      { name: '苏教版 (江苏凤凰)', icon: '📚' },
      { name: '外研版 (英语)', icon: '🔤' },
      { name: '沪教版', icon: '📚' },
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
      !!this.termParam();
  });

  ngOnInit() {
    this.portalService.getHotSearches().subscribe(h => this.hotSearches.set(h));
    this.portalService.getCategoriesGrouped().subscribe(grp => this.categoriesGroup.set(grp));

    this.route.data.subscribe(data => {
      const slug = data['channel'] || 'all';
      this.channelSlug.set(slug);
      this.updateSeo();
    });

    this.route.queryParams.subscribe(params => {
      const slug = this.channelSlug();
      const isKnownStage = ['primary', 'junior', 'senior', 'cert', 'exam', 'kindergarten'].includes(slug);
      
      const defaultStage = isKnownStage ? slug : 'all';
      this.stageParam.set(params['stage'] || defaultStage);
      this.gradeParam.set(params['grade'] || '');
      this.termParam.set(params['term'] || '');
      this.subjectParam.set(params['subject'] || '');
      this.editionParam.set(params['edition'] || '');
      this.queryParam.set(params['q'] || '');
      this.page.set(parseInt(params['page'] || '1', 10) || 1);

      this.loadResources();
    });
  }

  updateSeo() {
    const meta = this.currentMeta;
    this.seoService.update({
      title: meta.title,
      description: meta.desc
    });
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
    const isKnownStage = ['primary', 'junior', 'senior', 'cert', 'exam', 'kindergarten'].includes(slug);

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
}
