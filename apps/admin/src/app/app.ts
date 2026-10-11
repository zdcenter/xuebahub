import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceService, ResourceItemDto, NetdiskAccountDto, TransferShareResultDto, ChannelDto, NavMenuDto, RegionDto, SchoolDto, DashboardStatsDto } from './services/resource.service';

export interface StageConfigItem {
  grades: string[];
  subjects: string[];
  editions: string[];
}

export const STAGE_OPTIONS: Record<string, StageConfigItem> = {
  '小学阶段': {
    grades: ['通用 (1-6年级通用)', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
    subjects: ['通用/全科', '数学', '语文', '英语', '奥数思维培优', '科学'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '外研版 (英语)', '冀教版', '沪教版']
  },
  '初中冲刺': {
    grades: ['通用 (初中全阶段通用)', '初一/七年级', '初二/八年级', '初三/中考冲刺'],
    subjects: ['中考综合/全科', '数学', '语文', '英语', '物理', '化学', '道德与法治', '历史', '生物', '地理'],
    editions: ['通用版本', '人教版 (统编)', '北师大版', '苏教版', '华师大版', '外研版']
  },
  '高中专区': {
    grades: ['通用 (高中全阶段通用)', '高一', '高二', '高三/高考总复习'],
    subjects: ['高考综合/全科', '数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理'],
    editions: ['通用版本', '人教版 (新高考)', '北师大版', '苏教版', '外研版']
  },
  '成人考证': {
    grades: ['国家统考通用', '小学教师资格证', '中学教师资格证', '幼儿教师资格证', '普通话等级考试'],
    subjects: ['统考全套考点', '综合素质 (科一)', '教育知识与能力 (科二)', '保教知识与能力', '学科知识与教学能力 (科三)', '面试试讲教案'],
    editions: ['国家考试大纲通用', '中公教育配套', '粉笔教育配套']
  },
  '考公考研': {
    grades: ['国家/地方统一大纲', '国家公务员考试 (国考)', '多省联考/省考', '事业单位招聘', '全国硕士研究生统考 (考研)'],
    subjects: ['备考全套大礼包', '申论提分范文与热点', '行测高频速算与技巧', '考研政治核心背诵', '考研英语词汇与长难句', '考研数学'],
    editions: ['国家考试大纲通用', '华图教育版', '中公教育版', '粉笔教育版']
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private resService = inject(ResourceService);

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

  // --- 数据统计与全站转存监控看板 ---
  dashboardStats = signal<DashboardStatsDto | null>(null);
  statsLoading = signal<boolean>(false);

  currentTab = signal<'list' | 'add' | 'stats' | 'crawler' | 'accounts' | 'channels' | 'navmenus' | 'schools'>('list');
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

  filteredResources = computed(() => {
    const filter = this.listFilter();
    const list = this.resources();
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

  // 新增表单数据绑定（支持智能联动、精细与通用）
  newResource = {
    channel_slug: 'edu',
    title: '',
    subtitle: '',
    stage: '小学阶段',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    region: (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : null) || '广西-柳州',
    school: '',
    file_type: 'PDF',
    file_size: '15.0 MB',
    page_count: 24,
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
    stage: '小学阶段',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
    region: '',
    school: '',
    file_type: 'PDF',
    file_size: '15.0 MB',
    page_count: 24,
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

  // 获取当前选中学段的可选项配置
  getStageConfig(stage: string): StageConfigItem {
    return this.stageOptions[stage] || this.stageOptions['小学阶段'];
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

  deleteAccount(id: string) {
    if (confirm('确认删除该网盘账号配置吗？删除后将无法使用该账号执行自动转存。')) {
      this.resService.deleteAccount(id).subscribe({
        next: () => {
          this.showToast('🗑️ 账号已删除');
          this.loadAccounts();
        },
        error: (err) => this.showToast('删除失败: ' + err.message, 'error')
      });
    }
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

  deleteFolderInPicker(folder: { fid: string; file_name: string }, event: Event) {
    event.stopPropagation();
    const accId = this.folderPickerAccountId();
    if (!accId) return;

    if (!confirm(`确定要在网盘中彻底删除文件夹【${folder.file_name}】吗？\n请注意：此操作将在夸克网盘中移除该目录！`)) {
      return;
    }

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
    const quarkLink = item.links?.find(l => l.drive_type === 'quark');
    const baiduLink = item.links?.find(l => l.drive_type === 'baidu');

    this.editForm = {
      id: item.id,
      channel_slug: item.channel_slug || 'edu',
      title: item.title,
      subtitle: item.subtitle || '',
      stage: item.stage,
      grade: item.grade,
      subject: item.subject,
      edition: item.edition,
      region: item.region || '',
      school: item.school || '',
      file_type: item.file_type || 'PDF',
      file_size: item.file_size || '15 MB',
      page_count: item.page_count || 24,
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

  saveEdit() {
    if (!this.editForm.title || !this.editForm.quarkUrl) {
      this.showToast('请至少填写资料标题和夸克推广链接！', 'error');
      return;
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.editForm.channel_slug || 'edu',
      title: this.editForm.title,
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

  switchTab(tab: 'list' | 'add' | 'stats' | 'crawler' | 'accounts' | 'channels' | 'navmenus' | 'schools') {
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

  deleteChannel(ch: ChannelDto, event?: Event) {
    if (event) event.stopPropagation();
    if (!ch.id) return;
    if (confirm(`确定删除频道【${ch.name}】吗？删除前请确保该频道下没有关联资源。`)) {
      this.resService.deleteChannel(ch.id).subscribe({
        next: () => {
          this.showToast(`🗑️ 频道【${ch.name}】已删除`);
          this.loadChannels();
        },
        error: (err) => this.showToast(err.error?.message || '删除失败: ' + err.message, 'error')
      });
    }
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

  saveNewResource() {
    if (!this.newResource.title || !this.newResource.quarkUrl) {
      this.showToast('请至少填写资料标题和夸克推广链接！', 'error');
      return;
    }

    const payload: Partial<ResourceItemDto> = {
      channel_slug: this.newResource.channel_slug || 'edu',
      title: this.newResource.title,
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
      next: () => {
        this.showToast('🎉 资料发布成功！已实时落库。');
        this.newResource.title = '';
        this.newResource.subtitle = '';
        this.newResource.description = '';
        this.newResource.region = (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred_region') : null) || '广西-柳州';
        this.newResource.school = '';
        this.newResource.quarkUrl = '';
        this.newResource.baiduUrl = '';
        this.newResource.baiduCode = '';
        (this.newResource as any).file_tree = [];
        this.loadResources();
        this.switchTab('list');
      },
      error: (err) => this.showToast('创建失败: ' + err.message, 'error')
    });
  }

  deleteResource(id: string) {
    if (confirm('确认彻底删除该学习资料吗？关联的网盘链接也将一并清理。')) {
      this.resService.delete(id).subscribe({
        next: () => {
          this.resources.update(list => list.filter(r => r.id !== id));
          this.showToast('🗑️ 资料已删除');
        },
        error: (err) => this.showToast('删除失败: ' + err.message, 'error')
      });
    }
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

  deleteNavMenu(id?: string, title?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!id) return;
    if (confirm(`确认删除导航【${title || ''}】吗？若包含子菜单将同步清理。`)) {
      this.resService.deleteNavMenu(id).subscribe({
        next: () => {
          this.loadNavMenus();
          this.showToast(`🗑️ 导航【${title || ''}】已删除`);
        },
        error: (err) => this.showToast('删除失败: ' + err.message, 'error')
      });
    }
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

  deleteSchool(id?: number, name?: string) {
    if (!id) return;
    if (confirm(`确认从字典库中移除名校【${name}】吗？`)) {
      this.resService.deleteSchool(id).subscribe({
        next: () => {
          this.loadRegions();
          this.showToast(`🗑️ 已移除名校【${name}】`);
        },
        error: (err) => this.showToast('删除失败: ' + err.message, 'error')
      });
    }
  }
}
