import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PortalService, type NavMenuDto, type HotSearchItem } from '../../core/services/portal.service';
import { ChannelDto, ResourceItemDto } from '../../services/resource.service';
import { MemberService } from '../../services/member.service';

export interface LayoutNavItem {
  id?: string;
  name: string;
  path: string;
  icon: string;
  badge?: string;
  highlight?: boolean;
  children?: Array<{ id?: string; name: string; path: string; badge?: string; desc?: string }>;
}

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './portal-layout.component.html',
  styleUrls: ['./portal-layout.component.css']
})
export class PortalLayoutComponent implements OnInit {
  channels = signal<ChannelDto[]>([]);
  navMenus = signal<NavMenuDto[]>([]);
  isMobileMenuOpen = signal<boolean>(false);
  searchQuery = signal<string>('');
  isSearchFocused = signal<boolean>(false);
  searchSuggestions = signal<ResourceItemDto[]>([]);
  isSearchingSuggestions = signal<boolean>(false);
  hotSearches = signal<HotSearchItem[]>([]);
  private searchDebounceTimer: any;

  // 会员体系与卡密状态
  memberService = inject(MemberService);
  currentUser = this.memberService.currentUser;
  quotaStatus = this.memberService.quotaStatus;

  // 兑换卡密弹窗
  showRedeemModal = signal<boolean>(false);
  redeemCodeInput = signal<string>('');
  redeemSubmitting = signal<boolean>(false);
  redeemMsg = signal<string>('');
  redeemError = signal<string>('');

  // 登录/注册弹窗
  showAuthModal = signal<boolean>(false);
  authTab = signal<'login' | 'register'>('login');
  authUsername = signal<string>('');
  authPassword = signal<string>('');
  authNickname = signal<string>('');
  authEmail = signal<string>('');
  authSubmitting = signal<boolean>(false);
  authError = signal<string>('');

  constructor(
    private portalService: PortalService,
    private router: Router
  ) {}

  // 兜底本地默认导航 (简洁大气版)
  defaultNav: LayoutNavItem[] = [
    { name: '首页', path: '/', icon: '🏠' },
    { name: '小学', path: '/primary', icon: '🎒' },
    { name: '初中', path: '/junior', icon: '📘' },
    { name: '高中', path: '/senior', icon: '🎓', badge: '冲刺' },
    { name: '教师资格', path: '/cert', icon: '📜' },
    { name: '考公考研', path: '/exam', icon: '🏛️' },
    { name: '电子教材', path: '/book', icon: '📖', highlight: true }
  ];

  // 动态合并计算：以首页为首，动态载入后端导航API数据
  computedNavItems = computed<LayoutNavItem[]>(() => {
    const menus = this.navMenus();
    if (!menus || menus.length === 0) {
      return this.defaultNav;
    }

    const items: LayoutNavItem[] = [
      { name: '首页', path: '/', icon: '🏠' }
    ];

    for (const m of menus) {
      // 优化桌面端导航字数，去掉多余的“专区”后缀，使导航栏简洁轻盈
      const cleanName = (m.title || '').replace(/专区$/, '');
      items.push({
        id: m.id,
        name: cleanName || m.title,
        path: m.link_url || `/${m.id}`,
        icon: m.icon || '📚',
        badge: m.badge_text || '',
        highlight: m.is_special_highlight,
        children: (m.children || []).map(c => ({
          id: c.id,
          name: (c.title || '').replace(/专区$/, ''),
          path: c.link_url || `/${c.id}`,
          badge: c.badge_text,
          desc: c.description
        }))
      });
    }

    // 若后端菜单未包含电子教材专区且前台有书架模块，自动追加
    const hasBook = menus.some(m => m.link_url === '/book' || m.title.includes('教材') || m.title.includes('课本'));
    if (!hasBook) {
      items.push({
        name: '电子教材',
        path: '/book',
        icon: '📖',
        badge: '全套PDF',
        highlight: true
      });
    }

    return items;
  });

  // 推荐/求助模态窗
  showRecommendModal = signal<boolean>(false);
  showRequestModal = signal<boolean>(false);
  activeRecTab = signal<'parent' | 'moments' | 'direct'>('parent');
  copySuccess = signal<boolean>(false);

  // 求助表单
  requestForm = {
    title: '',
    stage: '初中',
    subject: '',
    description: '',
    contact_info: ''
  };
  isSubmittingRequest = signal<boolean>(false);
  requestSubmitSuccess = signal<boolean>(false);

  ngOnInit() {
    // 1. 获取在线频道
    this.portalService.getChannels().subscribe(list => {
      this.channels.set(list);
    });

    // 2. 动态拉取前台在线导航菜单树 (统一由后端数据库驱动)
    this.portalService.getNavMenus().subscribe(menus => {
      if (Array.isArray(menus) && menus.length > 0) {
        this.navMenus.set(menus);
      }
    });

    // 3. 拉取当前用户/访客每日额度与会员状态
    this.memberService.fetchQuotaStatus().subscribe();
  }

  // 会员认证与卡密动作
  openLoginModal() {
    this.authTab.set('login');
    this.authError.set('');
    this.showAuthModal.set(true);
  }

  openRegisterModal() {
    this.authTab.set('register');
    this.authError.set('');
    this.showAuthModal.set(true);
  }

  closeAuthModal() {
    this.showAuthModal.set(false);
  }

  submitAuth() {
    if (this.authSubmitting()) return;
    this.authError.set('');
    const u = this.authUsername().trim();
    const p = this.authPassword().trim();
    if (!u || !p) {
      this.authError.set('请输入用户名和密码');
      return;
    }

    this.authSubmitting.set(true);
    if (this.authTab() === 'login') {
      this.memberService.login({ username: u, password: p }).subscribe({
        next: () => {
          this.authSubmitting.set(false);
          this.showAuthModal.set(false);
        },
        error: (err) => {
          this.authSubmitting.set(false);
          this.authError.set(err.error?.message || '登录失败，请检查账号密码');
        }
      });
    } else {
      this.memberService.register({
        username: u,
        password: p,
        nickname: this.authNickname().trim(),
        email: this.authEmail().trim()
      }).subscribe({
        next: () => {
          this.authSubmitting.set(false);
          this.showAuthModal.set(false);
        },
        error: (err) => {
          this.authSubmitting.set(false);
          this.authError.set(err.error?.message || '注册失败，请更换用户名重试');
        }
      });
    }
  }

  logout() {
    this.memberService.logout();
  }

  openRedeemModal() {
    this.redeemCodeInput.set('');
    this.redeemMsg.set('');
    this.redeemError.set('');
    this.showRedeemModal.set(true);
  }

  closeRedeemModal() {
    this.showRedeemModal.set(false);
  }

  submitRedeem() {
    const code = this.redeemCodeInput().trim();
    if (!code) {
      this.redeemError.set('请输入卡密兑换码');
      return;
    }
    if (!this.currentUser()) {
      this.redeemError.set('请先登录账号，以便将 VIP 绑定至您的个人账号');
      return;
    }

    this.redeemSubmitting.set(true);
    this.redeemError.set('');
    this.redeemMsg.set('');
    this.memberService.redeemCode(code).subscribe({
      next: (res) => {
        this.redeemSubmitting.set(false);
        this.redeemMsg.set(res.message || '🎉 恭喜！VIP 权益兑换成功！');
        setTimeout(() => {
          this.showRedeemModal.set(false);
        }, 2200);
      },
      error: (err) => {
        this.redeemSubmitting.set(false);
        this.redeemError.set(err.error?.message || '兑换失败，请核对卡密');
      }
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen.update(v => !v);
  }

  closeMobileMenu() {
    this.isMobileMenuOpen.set(false);
  }

  onSearchSubmit() {
    const q = this.searchQuery().trim();
    if (q) {
      this.isSearchFocused.set(false);
      this.router.navigate(['/'], { queryParams: { q } });
      this.closeMobileMenu();
    }
  }

  onSearchFocus() {
    this.isSearchFocused.set(true);
    if (this.hotSearches().length === 0) {
      this.portalService.getHotSearches().subscribe(h => {
        this.hotSearches.set(h || []);
      });
    }
    if (this.searchQuery().trim()) {
      this.onSearchInput();
    }
  }

  onSearchBlur() {
    // 延迟 220ms 以免点击联想项时失焦导致点击失效
    setTimeout(() => {
      this.isSearchFocused.set(false);
    }, 220);
  }

  onSearchInput() {
    clearTimeout(this.searchDebounceTimer);
    const q = this.searchQuery().trim();
    if (!q) {
      this.searchSuggestions.set([]);
      this.isSearchingSuggestions.set(false);
      return;
    }
    this.isSearchingSuggestions.set(true);
    this.searchDebounceTimer = setTimeout(() => {
      this.portalService.searchSuggestions(q).subscribe({
        next: (items) => {
          this.searchSuggestions.set(items || []);
          this.isSearchingSuggestions.set(false);
        },
        error: () => {
          this.isSearchingSuggestions.set(false);
        }
      });
    }, 200);
  }

  selectSuggestion(item: ResourceItemDto) {
    this.isSearchFocused.set(false);
    this.searchQuery.set(item.title);
    this.router.navigate(['/resource', item.slug || item.id]);
    this.closeMobileMenu();
  }

  selectHotSearch(kw: string) {
    this.searchQuery.set(kw);
    this.onSearchSubmit();
  }

  get recommendText(): string {
    const siteUrl = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://xuebaw.com';
    const tab = this.activeRecTab();
    if (tab === 'parent') {
      return `群里的家长们好，分享一个很实用的免费真题网站【学霸网】(${siteUrl})，涵盖小学到高中的期中期末试卷、真题密卷，都是A4高清版可直接打印，有需要的可以自取或存到网盘备用~`;
    }
    if (tab === 'moments') {
      return `发现一个挺好用的试卷真题网站【学霸网】(${siteUrl})，中小学各年级真题和微课解析挺全的，可以免费保存和A4直接打印，家里有娃备考的推荐收藏下~`;
    }
    return `推荐你一个找真题试卷的网站：${siteUrl} （学霸网），期末考卷和解析视频都有，A4直接打印很清晰，顺手存网盘备用哈。`;
  }

  copyRecommendText() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.recommendText).then(() => {
        this.copySuccess.set(true);
        setTimeout(() => this.copySuccess.set(false), 2500);
      });
    }
  }

  submitRequest() {
    if (!this.requestForm.title.trim()) return;
    this.isSubmittingRequest.set(true);
    this.portalService.submitRequest(this.requestForm).subscribe({
      next: () => {
        this.isSubmittingRequest.set(false);
        this.requestSubmitSuccess.set(true);
        setTimeout(() => {
          this.requestSubmitSuccess.set(false);
          this.showRequestModal.set(false);
          this.requestForm = { title: '', stage: '初中', subject: '', description: '', contact_info: '' };
        }, 2000);
      },
      error: () => {
        this.isSubmittingRequest.set(false);
      }
    });
  }
}
