import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { ResourceItemDto, ResourceLinkDto, ResourceService, ResourceTransferPackage } from '../../services/resource.service';

export interface ParsedTransferItem {
  id: string;
  title: string;
  subtitle: string;
  stage: string;
  grade: string;
  term?: string;
  subject: string;
  edition: string;
  file_size: string;
  primary_drive: string;
  primary_url: string;
  extract_code: string;
  link_count: number;
  selected: boolean;
  originalData: Partial<ResourceItemDto>;
}

@Component({
  selector: 'app-transfer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transfer-modal.component.html',
  styleUrls: ['./transfer-modal.component.css']
})
export class TransferModalComponent {
  i18n = inject(I18nService);
  private resService = inject(ResourceService);

  isOpen = input<boolean>(false);
  closed = output<void>();
  imported = output<{ total: number; imported: number }>();

  rawText = signal<string>('');
  parsedItems = signal<ParsedTransferItem[]>([]);
  isSubmitting = signal<boolean>(false);
  feedback = signal<string | null>(null);

  // 本地文件上传与拖拽状态
  selectedFileName = signal<string | null>(null);
  selectedFileSize = signal<string | null>(null);
  isDragging = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.feedback.set(null);
        setTimeout(() => {
          const el = document.getElementById('transfer-paste-box') as HTMLTextAreaElement | null;
          if (el) el.focus();
        }, 120);
      }
    });
  }

  close() {
    this.closed.emit();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.processFile(file);
    input.value = '';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processFile(file);
    }
  }

  private processFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json' && file.type !== 'text/plain') {
      this.feedback.set('⚠️ 请选择 .json 格式的资料备份文件');
      return;
    }
    this.selectedFileName.set(file.name);
    const sizeKb = (file.size / 1024).toFixed(1);
    this.selectedFileSize.set(file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' : sizeKb + ' KB');

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        this.rawText.set(content);
        this.parseContent(content);
        this.feedback.set(`✅ 成功从备份文件【${file.name}】(${this.selectedFileSize()}) 识别出 ${this.parsedItems().length} 套完整资料！`);
      }
    };
    reader.onerror = () => {
      this.feedback.set('❌ 读取备份文件失败，请确认文件完整后重试');
    };
    reader.readAsText(file);
  }

  onTextChange(text: string) {
    this.rawText.set(text);
    this.parseContent(text);
  }

  clear() {
    this.rawText.set('');
    this.parsedItems.set([]);
    this.selectedFileName.set(null);
    this.selectedFileSize.set(null);
    this.feedback.set(null);
  }

  async readClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        this.feedback.set('⚠️ 浏览器安全限制，无法自动读取剪贴板，请直接在文本框按 Ctrl+V 粘贴');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        this.feedback.set('⚠️ 当前剪贴板内容为空，请先在原后台点击【复制资料数据包】');
        return;
      }
      this.rawText.set(text);
      this.parseContent(text);
    } catch (err: any) {
      this.feedback.set('⚠️ 读取剪贴板受阻，请直接在输入框按 Ctrl+V 粘贴文本');
    }
  }

  fillSamplePackage() {
    const sample: ResourceTransferPackage = {
      type: 'XUEBA_RESOURCE_TRANSFER_PACKAGE',
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: '学霸网测试环境',
      count: 2,
      resources: [
        {
          title: '【2026最新高三一模】人教版高中数学冲刺精选题与名师大题微课全套',
          subtitle: '内含100%无损矢量高清试卷PDF与名师压轴大题逐题精讲微课，建议转存防失效',
          description: '针对2026新高考全国卷核心重难点量身定制，涵盖函数导数、立体几何与圆锥曲线大题精解。',
          channel_slug: 'edu',
          stage: 'senior',
          grade: '高三',
          term: '总复习',
          subject: '数学',
          edition: '人教版',
          file_type: 'PDF',
          file_size: '45.8 MB',
          page_count: 36,
          is_published: true,
          links: [
            {
              drive_type: 'quark',
              share_url: 'https://pan.quark.cn/s/demo_math_2026',
              extract_code: '8888',
              file_size: '45.8 MB',
              is_primary: true
            }
          ]
        },
        {
          title: '【人教版初二英语】八年级下册期中全真模拟达标卷(含听力MP3与手写答案)',
          subtitle: '原题高清排版可直接A4打印，附全真考场听力无损音频与名师手写精批解析',
          channel_slug: 'edu',
          stage: 'junior',
          grade: '初二',
          term: '下册',
          subject: '英语',
          edition: '人教版',
          file_type: 'PDF',
          file_size: '22.4 MB',
          page_count: 18,
          is_published: true,
          links: [
            {
              drive_type: 'quark',
              share_url: 'https://pan.quark.cn/s/demo_english_midterm',
              extract_code: '6666',
              file_size: '22.4 MB',
              is_primary: true
            }
          ]
        }
      ]
    };
    this.onTextChange(JSON.stringify(sample, null, 2));
  }

  parseContent(text: string) {
    if (!text || !text.trim()) {
      this.parsedItems.set([]);
      this.feedback.set(null);
      return;
    }

    let parsedResources: any[] = [];

    // 1. 尝试直接 JSON 解析
    try {
      const data = JSON.parse(text.trim());
      if (Array.isArray(data)) {
        parsedResources = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.resources)) {
          parsedResources = data.resources;
        } else if (data.title) {
          parsedResources = [data];
        }
      }
    } catch {
      // 2. 如果包含外层杂乱字符，尝试提取 JSON 块
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          const candidate = JSON.parse(text.substring(firstBracket, lastBracket + 1));
          if (Array.isArray(candidate)) parsedResources = candidate;
        } catch {}
      }

      if (parsedResources.length === 0) {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            const candidate = JSON.parse(text.substring(firstBrace, lastBrace + 1));
            if (Array.isArray(candidate.resources)) {
              parsedResources = candidate.resources;
            } else if (candidate.title) {
              parsedResources = [candidate];
            }
          } catch {}
        }
      }
    }

    if (parsedResources.length === 0) {
      this.parsedItems.set([]);
      this.feedback.set('⚠️ 未能识别有效的数据包格式，请核对是否复制了完整 JSON 数据');
      return;
    }

    const items: ParsedTransferItem[] = [];
    parsedResources.forEach((res, idx) => {
      if (!res || !res.title) return;
      const links: ResourceLinkDto[] = Array.isArray(res.links) ? res.links : [];
      const primaryLink = links.find(l => l.is_primary) || links[0] || {} as ResourceLinkDto;

      items.push({
        id: 'pkg_' + idx + '_' + Math.random().toString(36).slice(2, 7),
        title: res.title,
        subtitle: res.subtitle || '',
        stage: res.stage || 'senior',
        grade: res.grade || '',
        term: res.term || '',
        subject: res.subject || '',
        edition: res.edition || '',
        file_size: res.file_size || primaryLink.file_size || '',
        primary_drive: primaryLink.drive_type || 'quark',
        primary_url: primaryLink.share_url || '',
        extract_code: primaryLink.extract_code || '',
        link_count: links.length,
        selected: true,
        originalData: {
          ...res,
          term: res.term || '',
          channel_slug: res.channel_slug || 'edu',
          is_published: true // 严格按要求：直接设为已上架
        }
      });
    });

    this.parsedItems.set(items);
    if (items.length > 0) {
      this.feedback.set(`✅ 成功识别 ${items.length} 套资料！已全部默认勾选并设为【直接上架】状态。`);
    } else {
      this.feedback.set('⚠️ 未检测到有效资料，请检查数据包中的 title 字段');
    }
  }

  toggleSelectAll(select: boolean) {
    const next = this.parsedItems().map(item => ({ ...item, selected: select }));
    this.parsedItems.set(next);
  }

  isAllSelected(): boolean {
    const list = this.parsedItems();
    if (list.length === 0) return false;
    return list.every(i => i.selected);
  }

  toggleItem(id: string) {
    const next = this.parsedItems().map(item => {
      if (item.id === id) return { ...item, selected: !item.selected };
      return item;
    });
    this.parsedItems.set(next);
  }

  getSelectedCount(): number {
    return this.parsedItems().filter(i => i.selected).length;
  }

  submitImport() {
    const selected = this.parsedItems().filter(i => i.selected);
    if (selected.length === 0) {
      this.feedback.set('⚠️ 请至少勾选一套资料进行导入');
      return;
    }

    this.isSubmitting.set(true);
    const payload = selected.map(item => ({
      ...item.originalData,
      is_published: true
    }));

    this.resService.batchImport(payload, true).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.imported.emit(res);
        this.close();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.feedback.set(`❌ 导入失败: ${err.error?.message || err.message || '网络异常'}`);
      }
    });
  }

  getStageLabel(stage: string): string {
    switch (stage) {
      case 'primary': return '🎒 小学';
      case 'junior': return '📘 初中';
      case 'senior': return '🎓 高中';
      case 'cert': return '📋 资格证';
      case 'exam': return '🏛️ 公考升学';
      default: return '🌐 通用';
    }
  }

  getDriveLabel(type: string): string {
    switch (type) {
      case 'quark': return '夸克网盘';
      case 'baidu': return '百度网盘';
      case 'alipan': case 'aliyun': return '阿里网盘';
      case 'xunlei': return '迅雷云盘';
      case '123pan': return '123云盘';
      default: return '夸克网盘';
    }
  }
}
