import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { ResourceService } from '../../services/resource.service';

export interface ParsedItem {
  id: string;
  title: string;
  driveType: string;
  shareUrl: string;
  extractCode: string;
  fileSize: string;
  stage: string;
  subject: string;
  selected: boolean;
}

@Component({
  selector: 'app-quick-paste-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-paste-modal.component.html',
  styleUrls: ['./quick-paste-modal.component.css']
})
export class QuickPasteModalComponent {
  i18n = inject(I18nService);
  private resService = inject(ResourceService);

  isOpen = input<boolean>(false);
  closed = output<void>();
  draftCreated = output<void>();
  directPublish = output<ParsedItem>();

  activeTab = signal<'paste' | 'extension'>('paste');

  rawText = signal<string>('');
  sourceName = signal<string>('网盘极速解析');
  defaultDrive = signal<string>('auto');

  // 支持单次粘贴多条网盘资源
  parsedItems = signal<ParsedItem[]>([]);
  isSubmitting = signal<boolean>(false);
  feedback = signal<string | null>(null);

  // 油猴脚本相关参数
  adminToken = signal<string>('');
  apiBaseUrl = signal<string>('');

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.feedback.set(null);
        if (typeof window !== 'undefined') {
          this.adminToken.set(localStorage.getItem('token') || '');
          const host = window.location.hostname;
          if (host === 'localhost' || host === '127.0.0.1') {
            this.apiBaseUrl.set('http://localhost:4001');
          } else {
            this.apiBaseUrl.set('https://api.xuebaw.com:8443');
          }
        }
        setTimeout(() => {
          const el = document.getElementById('quick-paste-box') as HTMLTextAreaElement | null;
          if (el) el.focus();
        }, 120);
      }
    });
  }

  onTextChange(text: string) {
    this.rawText.set(text);
    this.parseContent(text);
  }

  fillSampleText() {
    const sample = `【2026最新真题】人教版高中数学必修一期末考试密卷：https://pan.quark.cn/s/d8f2e9a1b4c6 提取码: 6688 文件规格: 38.5MB
【2025精选真题】苏教版高中数学必刷期末押题卷：https://pan.quark.cn/s/c7b1a2f3e4d5 提取码: 8899 大小: 25.0MB
【历年真题汇总】高考数学十年真题合集与名师大题微课：https://pan.baidu.com/s/1a2b3c4d5e6f?pwd=abcd 大小: 1.2GB`;
    this.onTextChange(sample);
  }

  // 纯客户端多链接全量正则解析
  parseContent(text: string) {
    if (!text || !text.trim()) {
      this.parsedItems.set([]);
      return;
    }

    const urlPattern = /https?:\/\/(?:pan\.quark\.cn\/s\/[a-zA-Z0-9_\-]+|pan\.baidu\.com\/s\/[a-zA-Z0-9_\-]+(?:\?pwd=[a-zA-Z0-9]+)?|(?:www\.)?(?:alipan|aliyundrive)\.com\/s\/[a-zA-Z0-9_\-]+|www\.123pan\.com\/s\/[a-zA-Z0-9_\-]+|pan\.xunlei\.com\/s\/[a-zA-Z0-9_\-]+|[a-zA-Z0-9\.\-_/]+(?:\/s\/[a-zA-Z0-9_\-]+|\/t\/[a-zA-Z0-9_\-]+|\?code=[a-zA-Z0-9_\-]+))/gi;

    const lines = text.split('\n');
    const items: ParsedItem[] = [];
    const seenUrls = new Set<string>();

    lines.forEach((line, lineIndex) => {
      const matches = line.match(urlPattern);
      if (matches) {
        matches.forEach(url => {
          const cleanUrl = url.trim();
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);

            // 1. 识别网盘类型
            let driveType = this.defaultDrive();
            if (driveType === 'auto') {
              if (cleanUrl.includes('quark.cn')) driveType = 'quark';
              else if (cleanUrl.includes('baidu.com')) driveType = 'baidu';
              else if (cleanUrl.includes('alipan.com') || cleanUrl.includes('aliyundrive.com')) driveType = 'alipan';
              else if (cleanUrl.includes('xunlei.com')) driveType = 'xunlei';
              else if (cleanUrl.includes('123pan.com')) driveType = '123pan';
              else driveType = 'quark';
            }

            // 2. 提取密码
            let extractCode = '';
            const codeMatch = line.match(/(?:提取码|密码|pwd|code|访问码)[:：\s]*([a-zA-Z0-9]{4,8})/i);
            if (codeMatch) {
              extractCode = codeMatch[1].trim();
            } else if (cleanUrl.includes('pwd=')) {
              try {
                const u = new URL(cleanUrl);
                extractCode = u.searchParams.get('pwd') || '';
              } catch {}
            }

            // 3. 提取文件容量大小
            const sizeMatch = line.match(/(?:大小|size|规格)[:：\s]*([0-9\.]+\s*(?:GB|MB|KB|G|M|K))/i);
            const fileSize = sizeMatch ? sizeMatch[1].trim() : '15.0 MB';

            // 4. 提取标题
            let title = line.replace(cleanUrl, '')
              .replace(/(?:夸克|百度|网盘|链接|下载|地址|提取码|密码|pwd|code)[:：\s]*/gi, '')
              .replace(/[《【]([^》】]{4,80})[》】]/, '$1')
              .trim();

            if (!title || title.length < 3) {
              if (lineIndex > 0 && lines[lineIndex - 1].trim().length >= 3 && !lines[lineIndex - 1].includes('http')) {
                title = lines[lineIndex - 1].trim().replace(/[《【]([^》】]{4,80})[》】]/, '$1');
              }
            }

            if (!title || title.length < 3) {
              title = '精选教学真题教辅资料';
              if (items.length > 0) {
                title += ` (资源 ${items.length + 1})`;
              }
            }

            // 5. 识别学段与学科
            const stage = this.detectStage(title);
            const subject = this.detectSubject(title);

            items.push({
              id: 'item_' + Math.random().toString(36).slice(2, 8),
              title: title.slice(0, 100),
              driveType,
              shareUrl: cleanUrl,
              extractCode,
              fileSize,
              stage,
              subject,
              selected: true
            });
          }
        });
      }
    });

    this.parsedItems.set(items);
  }

  private detectStage(title: string): string {
    if (title.includes('小学') || title.includes('小升初') || /([一二三四五六123456])年级/.test(title)) {
      return 'primary';
    } else if (title.includes('初中') || title.includes('中考') || /([七八九789])年级|初[一二三]/.test(title)) {
      return 'junior';
    } else if (title.includes('高中') || title.includes('高考') || /高[一二三123]/.test(title)) {
      return 'senior';
    } else if (title.includes('教资') || title.includes('教师资格')) {
      return 'cert';
    } else if (title.includes('公考') || title.includes('行测') || title.includes('申论') || title.includes('考研')) {
      return 'exam';
    }
    return 'primary';
  }

  private detectSubject(title: string): string {
    const subjects = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '科学', '道德与法治'];
    for (const sub of subjects) {
      if (title.includes(sub)) return sub;
    }
    return '数学';
  }

  toggleSelectAll(select: boolean) {
    const next = this.parsedItems().map(item => ({ ...item, selected: select }));
    this.parsedItems.set(next);
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

  // 操作 1：批量存入草稿池
  submitToDrafts() {
    const selected = this.parsedItems().filter(i => i.selected);
    if (selected.length === 0) {
      this.feedback.set('⚠️ 请至少勾选一个有效资源进行录入');
      return;
    }

    this.isSubmitting.set(true);

    // 将选中的所有资源拼装成批处理文本
    const combinedText = selected.map(it => {
      return `${it.title}\n${it.shareUrl} 提取码: ${it.extractCode}`;
    }).join('\n\n');

    this.resService.ingestCrawlerText({
      raw_text: combinedText,
      source_name: this.sourceName() || '快速粘贴多资源解析',
      drive_type: this.defaultDrive()
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.feedback.set(`✅ 成功批量录入 ${selected.length} 条资料至草稿池！`);
        this.draftCreated.emit();
        setTimeout(() => this.close(), 1000);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.feedback.set(`❌ 录入失败: ${err.error?.error || err.message}`);
      }
    });
  }

  // 操作 2：一键填入新增表单直接发布（取首个选中的资源）
  submitToDirectEdit(targetItem?: ParsedItem) {
    const item = targetItem || this.parsedItems().find(i => i.selected) || this.parsedItems()[0];
    if (!item || !item.shareUrl) {
      this.feedback.set('⚠️ 未检测到有效网盘链接，请检查粘贴文本');
      return;
    }
    this.directPublish.emit(item);
    this.close();
  }

  copyUserScript() {
    fetch('/xuebaw-collector.user.js')
      .then(r => r.text())
      .then(code => {
        navigator.clipboard.writeText(code).then(() => {
          this.feedback.set('✅ 油猴脚本代码已复制到剪贴板！可直接粘贴至 Tampermonkey 新建脚本中。');
        });
      })
      .catch(() => {
        this.feedback.set('⚠️ 获取脚本失败，请手动在 tools/xuebaw-collector.user.js 查看');
      });
  }

  downloadUserScript() {
    const link = document.createElement('a');
    link.href = '/xuebaw-collector.user.js';
    link.download = 'xuebaw-collector.user.js';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.feedback.set('📥 正在下载油猴安装脚本 (xuebaw-collector.user.js)...');
  }

  clear() {
    this.rawText.set('');
    this.parsedItems.set([]);
    this.feedback.set(null);
  }

  close() {
    this.closed.emit();
  }
}
