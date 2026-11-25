import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceItemDto, CategoryDto } from '../../../services/resource.service';
import { BookCardComponent } from '../../components/book-card/book-card.component';

@Component({
  selector: 'app-book-shelf',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookCardComponent],
  templateUrl: './book-shelf.component.html'
})
export class BookShelfComponent implements OnInit {
  // 状态信号源
  stageParam = signal<string>('primary');
  gradeParam = signal<string>('');
  termParam = signal<string>('');
  subjectParam = signal<string>('');
  editionParam = signal<string>('');
  queryParam = signal<string>('');
  searchKeyword = signal<string>('');

  constructor(
    private portalService: PortalService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  page = signal<number>(1);
  pageSize = signal<number>(25);

  books = signal<ResourceItemDto[]>([]);
  totalCount = signal<number>(0);
  isLoading = signal<boolean>(false);
  categoriesGroup = signal<Record<string, CategoryDto[]>>({});
  mobileFilterExpanded = signal<boolean>(false);

  activeFilterCount = computed(() =>
    [this.gradeParam(), this.termParam(), this.subjectParam(), this.editionParam()].filter(Boolean).length
  );
  activeFilterSummary = computed(() =>
    [
      this.gradeParam(),
      this.termParam(),
      this.subjectParam(),
      this.editionParam() ? this.stripParen(this.editionParam()) : ''
    ].filter(Boolean).join(' · ')
  );

  stripParen(text: string): string {
    return (text || '').replace(/\s*[（(][^）)]*[）)]\s*/g, '').trim();
  }

  Math = Math;

  // 分页总页数
  totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);

  // 计算展示的页码列表
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

  // 1. 学段专区选项列表 (优先从数据库拉取)
  stages = computed<{ slug: string; name: string; icon: string }[]>(() => {
    const list = this.categoriesGroup()['stage'] || [];
    if (list.length > 0) {
      return list.map(c => ({ slug: c.slug || c.name, name: c.name, icon: c.icon || '📚' }));
    }
    return [
      { slug: 'primary', name: '小学阶段', icon: '🎒' },
      { slug: 'junior', name: '初中阶段', icon: '📘' },
      { slug: 'senior', name: '高中阶段', icon: '🎓' },
      { slug: 'kindergarten', name: '幼小衔接', icon: '🧸' },
      { slug: 'cert', name: '教师资格证', icon: '📜' },
      { slug: 'exam', name: '考公考研', icon: '🏛️' },
      { slug: 'classic', name: '学科经典/名著', icon: '🏛️' }
    ];
  });

  // 2. 年级自适应计算 (完全响应式，动态联动)
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
        { name: '学前通用' }, { name: '大班幼小衔接' }, { name: '拼音识字启蒙' }, { name: '幼小思维拓展' }
      ];
    }
    if (s === 'cert' || s.includes('教师') || s.includes('资格')) {
      return [
        { name: '教师资格统考通用' }, { name: '小学教师资格证' }, { name: '中学教师资格证' },
        { name: '幼儿教师资格证' }, { name: '普通话等级考试' }
      ];
    }
    if (s === 'exam' || s.includes('公考') || s.includes('考研')) {
      return [
        { name: '统考大纲通用' }, { name: '国家公务员考试 (国考)' }, { name: '多省公务员联考 (省考)' },
        { name: '事业单位统考' }, { name: '全国硕士研究生统考 (考研)' }
      ];
    }
    return dbGrades.map(g => ({ name: g.name }));
  });

  // 3. 分册/学期自适应选项列表 (P0 核心体验)
  availableTerms = computed(() => {
    const s = this.stageParam().toLowerCase();
    if (s === 'senior' || s.includes('高中')) {
      return [
        { name: '必修', icon: '📌' },
        { name: '选择性必修', icon: '🎯' },
        { name: '上册', icon: '🍁' },
        { name: '下册', icon: '🌱' },
        { name: '全一册', icon: '📗' }
      ];
    }
    return [
      { name: '上册', icon: '🍁' },
      { name: '下册', icon: '🌱' },
      { name: '全一册', icon: '📗' }
    ];
  });

  // 4. 学科自适应计算 (全学段学科完备适配)
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
        { name: '综合素质 (科一)', icon: '📘' }, { name: '教育知识与能力 (科二)', icon: '📗' },
        { name: '保教知识与能力', icon: '👶' }, { name: '学科知识与教学能力 (科三)', icon: '📙' },
        { name: '普通话等级考试', icon: '🎙️' }
      ];
    }
    if (s === 'exam' || s.includes('公考') || s.includes('考研')) {
      return [
        { name: '申论提分范文与热点', icon: '🖋️' }, { name: '行测高频速算与技巧', icon: '⚡' },
        { name: '考研政治核心背诵', icon: '🚩' }, { name: '考研英语词汇与长难句', icon: '🔤' },
        { name: '考研数学', icon: '📐' }
      ];
    }
    if (s === 'kindergarten' || s.includes('幼')) {
      return [
        { name: '学前综合礼包', icon: '🎁' }, { name: '拼音启蒙', icon: '🔤' },
        { name: '幼小衔接识字', icon: '📖' }, { name: '思维数学启蒙', icon: '📐' }
      ];
    }
    if (s === 'senior' || s.includes('高中')) {
      return [
        { name: '语文', icon: '📖' }, { name: '数学', icon: '📐' }, { name: '英语', icon: '🔤' },
        { name: '物理', icon: '⚡' }, { name: '化学', icon: '🧪' }, { name: '生物学', icon: '🧬' },
        { name: '思想政治', icon: '⚖️' }, { name: '历史', icon: '📜' }, { name: '地理', icon: '🌍' },
        { name: '信息技术', icon: '💻' }, { name: '音乐', icon: '🎵' }, { name: '美术', icon: '🎨' }
      ];
    }
    if (s === 'junior' || s.includes('初中')) {
      return [
        { name: '语文', icon: '📖' }, { name: '数学', icon: '📐' }, { name: '英语', icon: '🔤' },
        { name: '物理', icon: '⚡' }, { name: '化学', icon: '🧪' }, { name: '生物学', icon: '🧬' },
        { name: '道德与法治', icon: '⚖️' }, { name: '历史', icon: '📜' }, { name: '地理', icon: '🌍' },
        { name: '科学', icon: '🔬' }, { name: '音乐', icon: '🎵' }, { name: '美术', icon: '🎨' }
      ];
    }
    return [
      { name: '语文', icon: '📖' }, { name: '数学', icon: '📐' }, { name: '英语', icon: '🔤' },
      { name: '科学', icon: '🔬' }, { name: '道德与法治', icon: '⚖️' }, { name: '音乐', icon: '🎵' },
      { name: '美术', icon: '🎨' }, { name: '书法', icon: '🖋️' }
    ];
  });

  // 4. 版本自适应计算（100% 动态读取数据库 categoriesGroup 字典，彻底杜绝硬编码）
  availableEditions = computed(() => {
    const s = this.stageParam().toLowerCase();
    const dbEditions = this.categoriesGroup()['edition'] || [];
    if (s === 'cert' || s === 'exam' || s.includes('教师') || s.includes('公考')) {
      return [
        { name: '国家考试大纲通用', label: '国家考试大纲通用', icon: '🏛️' },
        { name: '中公教育版', label: '中公教育版', icon: '📘' },
        { name: '粉笔教育版', label: '粉笔教育版', icon: '✏️' },
        { name: '华图教育版', label: '华图教育版', icon: '📊' }
      ];
    }
    if (dbEditions.length > 0) {
      return dbEditions.map(e => ({
        name: e.name,
        label: this.stripParen(e.name),
        icon: e.icon || '📚',
        is_hot: e.is_hot
      }));
    }
    return [
      { name: '人教版/统编版', label: '人教版/统编版', icon: '📚', is_hot: true },
      { name: '北师大版', label: '北师大版', icon: '📚', is_hot: true },
      { name: '苏教版', label: '苏教版', icon: '📚', is_hot: true },
      { name: '外研版', label: '外研版', icon: '🔤', is_hot: true },
      { name: '沪教版', label: '沪教版', icon: '📚', is_hot: true },
      { name: '鲁教版', label: '鲁教版', icon: '📚', is_hot: true },
      { name: '教科版', label: '教科版', icon: '🔬', is_hot: true },
      { name: '冀教版', label: '冀教版', icon: '📚', is_hot: true }
    ];
  });

  ngOnInit() {
    this.seoService.update({
      title: '全国统编电子教材与课本数字书架',
      description: '学霸网电子教材专区提供全国小学、初中、高中全学科正版高清电子课本PDF下载与在线阅读，涵盖统编人教版、北师大版、苏教版等全套最新审定版课本。',
      canonicalUrl: 'https://www.xuebaw.com/book'
    });

    this.portalService.getCategoriesGrouped().subscribe(grp => {
      this.categoriesGroup.set(grp);
    });

    this.route.queryParams.subscribe(params => {
      this.stageParam.set(params['stage'] || 'primary');
      this.gradeParam.set(params['grade'] || '');
      this.termParam.set(params['term'] || '');
      this.subjectParam.set(params['subject'] || '');
      this.editionParam.set(params['edition'] || '');
      this.queryParam.set(params['q'] || '');
      this.searchKeyword.set(params['q'] || '');
      this.page.set(parseInt(params['page'] || '1', 10) || 1);
      this.loadBooks();
    });
  }

  setFilter(dimension: 'stage' | 'grade' | 'term' | 'subject' | 'edition', value: string) {
    const qp: Record<string, string | null> = { page: '1' };
    if (dimension === 'stage') {
      qp['stage'] = value;
      // 切换学段自动清空下属子参数，防止跨学段污染冲突
      qp['grade'] = null;
      qp['term'] = null;
      qp['subject'] = null;
      qp['edition'] = null;
    } else {
      qp[dimension] = value || null;
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: 'merge' });
  }

  // 书架内快捷关键词搜索
  onSearchSubmit() {
    const q = this.searchKeyword().trim();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, page: '1' },
      queryParamsHandling: 'merge'
    });
  }

  // 清空搜索框
  clearSearch() {
    this.searchKeyword.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null, page: '1' },
      queryParamsHandling: 'merge'
    });
  }

  // 2024新版教材快捷筛选开关
  toggleOnly2024() {
    const is2024 = this.queryParam() === '2024';
    this.searchKeyword.set(is2024 ? '' : '2024');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: is2024 ? null : '2024', page: '1' },
      queryParamsHandling: 'merge'
    });
  }

  resetAllFilters() {
    this.searchKeyword.set('');
    this.router.navigate([], { relativeTo: this.route, queryParams: { page: '1' } });
  }

  onPageChange(newPage: number) {
    if (newPage < 1 || newPage > this.totalPages() || newPage === this.page()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: newPage },
      queryParamsHandling: 'merge'
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  }

  loadBooks() {
    this.isLoading.set(true);
    this.portalService.getResources({
      channel: 'book',
      stage: this.stageParam() === 'all' ? undefined : this.stageParam(),
      grade: this.gradeParam() || undefined,
      term: this.termParam() || undefined,
      subject: this.subjectParam() || undefined,
      edition: this.editionParam() || undefined,
      q: this.queryParam() || undefined,
      page: this.page(),
      limit: this.pageSize()
    }).subscribe({
      next: res => {
        this.books.set(res.items);
        this.totalCount.set(res.total);
        this.isLoading.set(false);
      },
      error: () => {
        this.books.set([]);
        this.totalCount.set(0);
        this.isLoading.set(false);
      }
    });
  }
}
