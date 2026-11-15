import { Component, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { ResourceLinkDto } from '../../../services/resource.service';
import { MemberService } from '../../../services/member.service';
import { WechatGuideModalComponent } from '../../components/wechat-guide-modal/wechat-guide-modal.component';

@Component({
  selector: 'app-smart-redirect',
  standalone: true,
  imports: [CommonModule, WechatGuideModalComponent],
  template: `
    <!-- 1. 微信 / QQ 环境拦截指引：带右上角发光弯箭头 + 沉浸式毛玻璃步骤指引 -->
    <app-wechat-guide-modal 
      [isOpen]="isWechat() && !!targetLink()" 
      [targetUrl]="targetLink()?.share_url" 
      [extractCode]="targetLink()?.extract_code" 
      (close)="goToDetail()">
    </app-wechat-guide-modal>

    <!-- 2. 今日额度耗尽提示 -->
    @if (showQuotaLimit()) {
      <div class="redirect-overlay">
        <div class="redirect-box">
          <div class="status-icon">⏳</div>
          <h2 class="status-title">今日获取额度已达上限</h2>
          <p class="status-desc">{{ quotaNoticeText() || '今日免费直达额度已用尽，开通 VIP 畅享无限次高速下载！' }}</p>
          <div style="margin: 16px 0; background: #f8fafc; padding: 12px; border-radius: 12px; font-size: 13px; color: #475569;">
            今日已用：<b style="color: #0f172a;">{{ usedCount() }} / {{ dailyQuota() }} 次</b>
          </div>
          @if (taobaoShopUrl()) {
            <a [href]="taobaoShopUrl()" target="_blank" rel="noopener noreferrer" class="btn-action" style="background: #ea580c; margin-bottom: 10px;">
              🛒 前往淘宝购买 VIP 卡密 (全自动秒发)
            </a>
          }
          <button type="button" class="btn-action" style="background: #475569;" (click)="goToDetail()">
            前往本资料站内主页查看详情与兑换
          </button>
        </div>
      </div>
    }

    <!-- 3. 异常/失效提示：仅在网盘链接缺失或已失效时才展示，并自动回退到站内主页 -->
    @if (showFallback()) {
      <div class="redirect-overlay">
        <div class="redirect-box">
          <div class="status-icon">🔄</div>
          <h2 class="status-title">网盘链接更新中</h2>
          <p class="status-desc">该资料网盘正在智能维护补链，正在为您跳转至站内资料主页...</p>
          <button type="button" class="btn-action" (click)="goToDetail()">
            立即前往资料主页
          </button>
        </div>
      </div>
    }

    <!-- 4. 正常情况 (有网盘地址且普通浏览器且额度充足)：完全不渲染任何中间卡片与弹窗，纯静默毫秒级直达网盘！ -->
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background-color: transparent;
    }

    .redirect-overlay {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: #f8fafc;
    }

    .redirect-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      padding: 32px 24px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      text-align: center;
    }

    .status-icon {
      font-size: 40px;
      margin-bottom: 16px;
    }

    .status-title {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 8px 0;
    }

    .status-desc {
      font-size: 13px;
      color: #64748b;
      margin: 0 0 20px 0;
      line-height: 1.6;
    }

    .highlight {
      color: #047857;
    }

    .code-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 14px;
      margin-bottom: 20px;
    }

    .code-label {
      font-size: 12px;
      color: #475569;
    }

    .code-val {
      font-family: monospace;
      font-size: 14px;
      font-weight: 700;
      color: #047857;
      letter-spacing: 1px;
    }

    .btn-action {
      display: block;
      width: 100%;
      background: #059669;
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      padding: 12px 20px;
      border-radius: 12px;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: background 0.15s;
      box-sizing: border-box;
    }

    .btn-action:hover {
      background: #047857;
    }
  `]
})
export class SmartRedirectComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private portalService = inject(PortalService);
  private memberService = inject(MemberService);
  private platformId = inject(PLATFORM_ID);

  targetLink = signal<ResourceLinkDto | null>(null);
  isWechat = signal<boolean>(false);
  showFallback = signal<boolean>(false);
  showQuotaLimit = signal<boolean>(false);
  quotaNoticeText = signal<string>('');
  taobaoShopUrl = signal<string>('');
  usedCount = signal<number>(0);
  dailyQuota = signal<number>(5);
  private slugOrId = '';

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.slugOrId = params['id'] || '';
      if (this.slugOrId) {
        this.resolveAndRedirect(this.slugOrId);
      } else {
        this.goToHome();
      }
    });
  }

  private resolveAndRedirect(idOrSlug: string) {
    if (isPlatformBrowser(this.platformId)) {
      const ua = navigator.userAgent.toLowerCase();
      this.isWechat.set(/micromessenger/i.test(ua) || /qq\//i.test(ua));
    }

    this.portalService.getResourceDetail(idOrSlug).subscribe({
      next: res => {
        const item = res?.resource || (res as any);
        const links: ResourceLinkDto[] = res?.links || item?.links || [];

        if (!item || (!item.id && !item.title)) {
          this.triggerFallback();
          return;
        }

        // 筛选可用网盘链接 (优先 primary 且非 invalid)
        const validLinks = links.filter(l => l.status !== 'invalid' && !!l.share_url);
        const primary = validLinks.find(l => l.is_primary) || validLinks[0] || null;

        if (primary && primary.share_url) {
          this.targetLink.set(primary);

          // 额度校验与消耗检查
          this.memberService.consumeQuota(idOrSlug).subscribe({
            next: (quotaRes) => {
              if (quotaRes.allowed) {
                // 若有提取码，后台静默写入剪贴板
                if (primary.extract_code && isPlatformBrowser(this.platformId)) {
                  try {
                    navigator.clipboard?.writeText(primary.extract_code).catch(() => {});
                  } catch (_) {}
                }

                // 如果在微信/QQ环境，展示指引
                if (this.isWechat()) {
                  return;
                }

                // 正常浏览器环境：完全静默，0ms立即直跳网盘！不弹出任何中间卡片界面
                if (isPlatformBrowser(this.platformId)) {
                  window.location.replace(primary.share_url);
                }
              } else {
                // 额度超限
                this.usedCount.set(quotaRes.used_count ?? 5);
                this.dailyQuota.set(quotaRes.daily_quota ?? 5);
                this.quotaNoticeText.set(quotaRes.quota_notice_text || '');
                this.taobaoShopUrl.set(quotaRes.taobao_shop_url || '');
                this.showQuotaLimit.set(true);
              }
            },
            error: () => {
              // 容错直接放行
              if (isPlatformBrowser(this.platformId)) {
                window.location.replace(primary.share_url);
              }
            }
          });

        } else {
          // 无网盘地址或链接已失效，才展示提示并平滑跳转到站内资料主页
          this.triggerFallback();
        }
      },
      error: () => {
        this.triggerFallback();
      }
    });
  }

  private triggerFallback() {
    this.showFallback.set(true);
    setTimeout(() => {
      this.goToDetail();
    }, 600);
  }

  goToDetail() {
    const slug = this.slugOrId;
    this.router.navigate(['/resource', slug]);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
