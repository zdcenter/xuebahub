import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceService, ResourceItemDto } from './services/resource.service';

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

  currentTab = signal<'list' | 'add' | 'stats' | 'crawler'>('list');
  loading = signal<boolean>(false);
  resources = signal<ResourceItemDto[]>([]);

  // 新增表单数据绑定（支持智能联动、精细与通用）
  newResource = {
    title: '',
    subtitle: '',
    stage: '小学阶段',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
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
    description: ''
  };

  // 编辑表单数据绑定
  isEditModalOpen = signal<boolean>(false);
  editForm = {
    id: '',
    title: '',
    subtitle: '',
    stage: '小学阶段',
    grade: '通用 (1-6年级通用)',
    subject: '数学',
    edition: '人教版 (统编)',
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
    description: ''
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
        if (info && info.file_size) {
          form.quarkFileSize = info.file_size;
          form.file_size = info.file_size;
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
          const timeTip = info.file_time ? ` · ${info.file_time}` : '';
          this.showToast(`⚡ 夸克网盘专属规格: ${info.file_size} (${info.file_type || 'PDF'}${timeTip})`);
        }
      },
      error: () => {
        this.parsingNetdisk.set(false);
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
        if (info && info.file_size) {
          form.baiduFileSize = info.file_size;
          if (!form.quarkFileSize || form.quarkFileSize === '15.0 MB') {
            form.file_size = info.file_size;
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
          const timeTip = info.file_time ? ` · ${info.file_time}` : '';
          this.showToast(`⚡ 百度网盘规格已提取: ${info.file_size} (${info.file_type || 'PDF'}${timeTip})`);
        }
      },
      error: () => {
        this.parsingBaidu.set(false);
        this.showToast('解析百度网盘失败，请核对链接有效性', 'error');
      }
    });
  }

  ngOnInit() {
    this.loadResources();
  }

  openEdit(item: ResourceItemDto) {
    const quarkLink = item.links?.find(l => l.drive_type === 'quark');
    const baiduLink = item.links?.find(l => l.drive_type === 'baidu');

    this.editForm = {
      id: item.id,
      title: item.title,
      subtitle: item.subtitle || '',
      stage: item.stage,
      grade: item.grade,
      subject: item.subject,
      edition: item.edition,
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
      description: item.description || ''
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
      title: this.editForm.title,
      subtitle: this.editForm.subtitle || (this.editForm.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.editForm.description || this.editForm.title,
      stage: this.editForm.stage,
      grade: this.editForm.grade,
      subject: this.editForm.subject,
      edition: this.editForm.edition,
      file_type: this.editForm.has_video ? 'PDF+MP4视频' : this.editForm.file_type,
      file_size: this.editForm.quarkFileSize || this.editForm.baiduFileSize || this.editForm.file_size || '15.0 MB',
      page_count: Number(this.editForm.page_count) || 20,
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
    this.resService.list().subscribe({
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

  switchTab(tab: 'list' | 'add' | 'stats' | 'crawler') {
    this.currentTab.set(tab);
    if (tab === 'list') {
      this.loadResources();
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
      title: this.newResource.title,
      subtitle: this.newResource.subtitle || (this.newResource.has_video ? '【含高清精讲视频】' : '【含手写解析】'),
      description: this.newResource.description || this.newResource.title,
      stage: this.newResource.stage,
      grade: this.newResource.grade,
      subject: this.newResource.subject,
      edition: this.newResource.edition,
      file_type: this.newResource.has_video ? 'PDF+MP4视频' : this.newResource.file_type,
      file_size: this.newResource.quarkFileSize || this.newResource.baiduFileSize || this.newResource.file_size || '15.0 MB',
      page_count: Number(this.newResource.page_count) || 20,
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
        this.newResource.quarkUrl = '';
        this.newResource.baiduUrl = '';
        this.newResource.baiduCode = '';
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
}
