import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  ResourceService, 
  EmailConfigDto, 
  EmailContactDto, 
  ContactExtractionResultDto, 
  EmailCampaignLogDto, 
  EmailStatsDto,
  ResourceItemDto
} from '../../services/resource.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-email-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-hub.component.html',
  styleUrls: ['./email-hub.component.css']
})
export class EmailHubComponent implements OnInit {
  resService = inject(ResourceService);
  i18n = inject(I18nService);

  @Input() set preselectedResource(res: ResourceItemDto | null) {
    if (res) {
      this.campaignForm.campaign_type = 'resource';
      this.campaignForm.resource_id = res.id;
      this.campaignForm.subject = `【备考精选真题】${res.title} - A4高清可打印`;
      this.activeSubTab.set('campaign');
    }
  }
  @Output() notify = new EventEmitter<{ message: string; type: 'success' | 'error' | 'info' }>();

  // Sub-Tab 状态（对齐 Telegram 运营中枢：默认进入名录与采集草稿池）
  activeSubTab = signal<'contacts' | 'campaign' | 'settings'>('contacts');

  // 统计看板
  stats = signal<EmailStatsDto>({
    total_contacts: 0,
    active_contacts: 0,
    total_sent_success: 0,
    total_campaigns: 0
  });

  // SMTP 配置
  config = signal<EmailConfigDto | null>(null);
  isSavingConfig = signal<boolean>(false);
  isTestingSMTP = signal<boolean>(false);
  testRecipient = '';

  // 邮箱名录
  contacts = signal<EmailContactDto[]>([]);
  contactsTotal = signal<number>(0);
  contactsPage = signal<number>(1);
  contactsPageSize = signal<number>(50);
  selectedTagFilter = signal<string>('all');
  contactSearch = signal<string>('');
  selectedContactIds = signal<string[]>([]);

  // 智能清洗提取器表单
  rawExtractText = '';
  extractGroupTag = 'gaokao';
  extractSource = 'qq_group';
  isExtracting = signal<boolean>(false);
  extractResult = signal<ContactExtractionResultDto | null>(null);
  showQQGuide = signal<boolean>(false);

  // 群发营销活动
  campaignForm = {
    campaign_type: 'site' as 'resource' | 'site',
    resource_id: '',
    subject: '',
    custom_message: '',
    target_type: 'all' as 'all' | 'tag' | 'manual',
    target_tag: 'gaokao',
    manual_emails: '',
    skip_recent_days: 3
  };
  isSendingCampaign = signal<boolean>(false);
  campaignLogs = signal<EmailCampaignLogDto[]>([]);

  // 快速挑选在库资料
  availableResources = signal<ResourceItemDto[]>([]);
  isLoadingResources = signal<boolean>(false);

  ngOnInit() {
    this.loadStats();
    this.loadConfig();
    this.loadContacts();
    this.loadCampaignLogs();
    this.loadResourcesList();
  }

  switchTab(tab: 'campaign' | 'contacts' | 'settings') {
    this.activeSubTab.set(tab);
    if (tab === 'contacts') {
      this.loadContacts();
    } else if (tab === 'settings') {
      this.loadConfig();
    } else if (tab === 'campaign') {
      this.loadCampaignLogs();
    }
  }

  loadStats() {
    this.resService.getEmailStats().subscribe({
      next: (res) => this.stats.set(res),
      error: () => {}
    });
  }

  loadConfig() {
    this.resService.getEmailConfig().subscribe({
      next: (res) => {
        this.config.set(res);
        if (!this.testRecipient && res.sender_email) {
          this.testRecipient = res.sender_email;
        }
      },
      error: () => {}
    });
  }

  saveConfig() {
    const cfg = this.config();
    if (!cfg) return;
    this.isSavingConfig.set(true);
    this.resService.saveEmailConfig(cfg).subscribe({
      next: (res) => {
        this.isSavingConfig.set(false);
        this.config.set(res);
        this.notify.emit({ message: '✅ SMTP 发信配置已成功保存', type: 'success' });
      },
      error: (err) => {
        this.isSavingConfig.set(false);
        this.notify.emit({ message: `❌ 保存配置失败: ${err.error?.error || err.message}`, type: 'error' });
      }
    });
  }

  sendTestEmail() {
    if (!this.testRecipient.trim()) {
      this.notify.emit({ message: '请输入接收测试邮件的邮箱地址', type: 'error' });
      return;
    }
    this.isTestingSMTP.set(true);
    this.resService.sendTestEmail(this.testRecipient.trim()).subscribe({
      next: (res) => {
        this.isTestingSMTP.set(false);
        this.notify.emit({ message: res.message || '✅ 测试邮件发送成功，请查收！', type: 'success' });
        this.loadConfig();
      },
      error: (err) => {
        this.isTestingSMTP.set(false);
        this.notify.emit({ message: `❌ 发送测试邮件失败: ${err.error?.error || err.message}`, type: 'error' });
        this.loadConfig();
      }
    });
  }

  loadContacts() {
    this.resService.getEmailContacts({
      page: this.contactsPage(),
      page_size: this.contactsPageSize(),
      group_tag: this.selectedTagFilter(),
      search: this.contactSearch().trim()
    }).subscribe({
      next: (res) => {
        this.contacts.set(res.items);
        this.contactsTotal.set(res.total);
        this.selectedContactIds.set([]);
      },
      error: () => {}
    });
  }

  extractContacts() {
    if (!this.rawExtractText.trim()) {
      this.notify.emit({ message: '请粘贴包含 QQ 群成员、QQ 号或邮箱的原始文本', type: 'error' });
      return;
    }
    this.isExtracting.set(true);
    this.resService.extractEmailContacts({
      raw_text: this.rawExtractText,
      group_tag: this.extractGroupTag,
      source: this.extractSource
    }).subscribe({
      next: (res) => {
        this.isExtracting.set(false);
        this.extractResult.set(res);
        this.rawExtractText = '';
        this.notify.emit({ 
          message: `✅ 提取完成：识别 ${res.total_found} 个，去重后 ${res.batch_unique_count} 个，全新入库 ${res.new_inserted_count} 个！`, 
          type: 'success' 
        });
        this.loadContacts();
        this.loadStats();
      },
      error: (err) => {
        this.isExtracting.set(false);
        this.notify.emit({ message: `❌ 提取入库失败: ${err.error?.error || err.message}`, type: 'error' });
      }
    });
  }

  toggleSelectAllContacts(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedContactIds.set(this.contacts().map(c => c.id));
    } else {
      this.selectedContactIds.set([]);
    }
  }

  toggleSelectContact(id: string) {
    const list = [...this.selectedContactIds()];
    const idx = list.indexOf(id);
    if (idx > -1) {
      list.splice(idx, 1);
    } else {
      list.push(id);
    }
    this.selectedContactIds.set(list);
  }

  deleteContact(c: EmailContactDto) {
    if (!confirm(`确定要移除联系人 ${c.email} 吗？`)) return;
    this.resService.deleteEmailContact(c.id).subscribe({
      next: () => {
        this.notify.emit({ message: '✅ 联系人已移除', type: 'success' });
        this.loadContacts();
        this.loadStats();
      },
      error: () => {}
    });
  }

  batchDeleteContacts() {
    const ids = this.selectedContactIds();
    if (ids.length === 0) return;
    if (!confirm(`确定要批量删除选中的 ${ids.length} 个联系人吗？`)) return;
    this.resService.batchDeleteEmailContacts(ids).subscribe({
      next: () => {
        this.notify.emit({ message: `✅ 已批量删除 ${ids.length} 个联系人`, type: 'success' });
        this.loadContacts();
        this.loadStats();
      },
      error: () => {}
    });
  }

  loadResourcesList() {
    this.isLoadingResources.set(true);
    this.resService.list().subscribe({
      next: (items: ResourceItemDto[]) => {
        this.availableResources.set(items ? items.slice(0, 50) : []);
        this.isLoadingResources.set(false);
      },
      error: () => {
        this.isLoadingResources.set(false);
      }
    });
  }

  selectResourceForCampaign(res: ResourceItemDto) {
    this.campaignForm.campaign_type = 'resource';
    this.campaignForm.resource_id = res.id;
    this.campaignForm.subject = `【名校精选真题】${res.title} (A4矢量极清打印版)`;
  }

  sendCampaign() {
    if (this.campaignForm.target_type === 'manual' && !this.campaignForm.manual_emails.trim()) {
      this.notify.emit({ message: '临时发送模式下，请输入至少一个收件人邮箱', type: 'error' });
      return;
    }
    if (this.campaignForm.campaign_type === 'resource' && !this.campaignForm.resource_id) {
      this.notify.emit({ message: '资料推荐模式下，请选择一套在库真题资料', type: 'error' });
      return;
    }

    this.isSendingCampaign.set(true);
    this.resService.sendEmailCampaign(this.campaignForm).subscribe({
      next: (res) => {
        this.isSendingCampaign.set(false);
        this.notify.emit({ 
          message: `🚀 营销任务已启动！共 ${res.total_count} 个收件人，正在后台平滑发送...`, 
          type: 'success' 
        });
        this.loadCampaignLogs();
        this.loadStats();
      },
      error: (err) => {
        this.isSendingCampaign.set(false);
        this.notify.emit({ message: `❌ 启动群发失败: ${err.error?.error || err.message}`, type: 'error' });
      }
    });
  }

  loadCampaignLogs() {
    this.resService.getEmailCampaignLogs(1, 20).subscribe({
      next: (res) => {
        this.campaignLogs.set(res.items);
      },
      error: () => {}
    });
  }

  // QQ 群成员一键提取脚本拷贝
  copyQQScript() {
    const script = `// 打开电脑端 qun.qq.com/member.html 在开发者控制台 (F12) 粘贴此行回车即可瞬间导出所有QQ号:
var qqs = Array.from(document.querySelectorAll('.mb-num, .td-user-nick, td:nth-child(5)')).map(e=>e.innerText.trim()).filter(t=>/^\\d{5,11}$/.test(t));
var text = Array.from(new Set(qqs)).join('\\n');
copy(text);
alert('✅ 成功提取 ' + qqs.length + ' 个QQ号并已复制到剪贴板！请直接回到学霸网后台粘贴。');`;
    navigator.clipboard.writeText(script).then(() => {
      this.notify.emit({ message: '✅ QQ群极速提取代码已拷贝！在 qun.qq.com 按 F12 粘贴运行即可！', type: 'success' });
    });
  }

  getTagLabel(tag: string): string {
    switch (tag) {
      case 'gaokao': return '高考备战组';
      case 'zhongkao': return '中考备考组';
      case 'kaogong': return '考公考编组';
      case 'primary': return '小学期末组';
      case 'request': return '求资料留资';
      default: return '通用名录';
    }
  }

  // 快捷键支持 (Ctrl + Enter 立即提取)
  onFastExtractKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!this.isExtracting() && this.rawExtractText.trim()) {
        this.extractContacts();
      }
    }
  }

  clearFastExtract() {
    this.rawExtractText = '';
    this.extractResult.set(null);
  }

  // 名录全选与反选
  selectAllContacts(event: any) {
    if (event.target.checked) {
      this.selectedContactIds.set(this.contacts().map(c => c.id));
    } else {
      this.selectedContactIds.set([]);
    }
  }

  toggleContactSelection(id: string) {
    const current = this.selectedContactIds();
    if (current.includes(id)) {
      this.selectedContactIds.set(current.filter(item => item !== id));
    } else {
      this.selectedContactIds.set([...current, id]);
    }
  }

  isAllSelected(): boolean {
    const list = this.contacts();
    return list.length > 0 && this.selectedContactIds().length === list.length;
  }

  openCampaignWithSelected() {
    const selectedEmails = this.contacts()
      .filter(c => this.selectedContactIds().includes(c.id))
      .map(c => c.email);
    if (selectedEmails.length === 0) return;
    this.campaignForm.target_type = 'manual';
    this.campaignForm.manual_emails = selectedEmails.join('\n');
    this.activeSubTab.set('campaign');
    this.notify.emit({ message: `已将选中的 ${selectedEmails.length} 个邮箱带入群发活动！`, type: 'info' });
  }

  copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      this.notify.emit({ message: `已复制邮箱: ${email}`, type: 'success' });
    });
  }

  // SMTP 快捷预填模板
  fillQQPreset() {
    const c = this.config();
    if (c) {
      c.smtp_host = 'smtp.qq.com';
      c.smtp_port = 465;
      c.sender_name = '学霸网真题文库';
      this.notify.emit({ message: '已预填 QQ 邮箱 SMTP 参数（端口 465 SSL，密码请填写 QQ 邮箱授权码）', type: 'info' });
    }
  }

  fill163Preset() {
    const c = this.config();
    if (c) {
      c.smtp_host = 'smtp.163.com';
      c.smtp_port = 465;
      c.sender_name = '学霸网精选试卷';
      this.notify.emit({ message: '已预填 163 邮箱 SMTP 参数（端口 465 SSL，密码请填写 163 授权码）', type: 'info' });
    }
  }

  fillAliyunPreset() {
    const c = this.config();
    if (c) {
      c.smtp_host = 'smtpdm.aliyun.com';
      c.smtp_port = 465;
      c.sender_name = '学霸网 xuebaw.com';
      this.notify.emit({ message: '已预填 阿里云邮件推送 DirectMail 参数', type: 'info' });
    }
  }

  getSelectedResourceTitle(): string {
    if (this.campaignForm.campaign_type === 'site') {
      return '学霸网 (xuebaw.com) - 中小学与职考真题免费文库';
    }
    const res = this.availableResources().find(r => r.id === this.campaignForm.resource_id);
    return res ? res.title : '2026年全国重点名校冲刺模拟试卷汇编 (A4极清打印版)';
  }
}
