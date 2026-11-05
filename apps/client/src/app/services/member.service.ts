import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { ResourceService } from './resource.service';

export interface MemberLevelDto {
  id: string;
  name: string;
  daily_quota: number;
  color: string;
  badge_text: string;
  price_hint?: string;
  description?: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface FrontUserDto {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  level_id: string;
  level?: MemberLevelDto;
  vip_expire_at?: string;
  is_active: boolean;
  last_login_at?: string;
  last_login_ip?: string;
  created_at?: string;
}

export interface ActivationCodeDto {
  id: string;
  code: string;
  target_level_id: string;
  target_level?: MemberLevelDto;
  duration_days: number;
  batch_no?: string;
  remark?: string;
  status: 'unused' | 'used' | 'void';
  used_by_user_id?: string;
  used_by_username?: string;
  used_at?: string;
  created_at?: string;
}

export interface QuotaStatusDto {
  enabled: boolean;
  is_authenticated: boolean;
  username?: string;
  level_id: string;
  level_name: string;
  badge_text: string;
  color: string;
  daily_quota: number;
  used_count: number;
  remain_quota: number;
  is_unlimited: boolean;
  is_unlocked: boolean;
  vip_expire_at?: string;
  taobao_shop_url?: string;
  quota_notice_text?: string;
}

export interface ConsumeQuotaResult {
  allowed: boolean;
  remain_quota?: number;
  used_count?: number;
  daily_quota?: number;
  is_unlimited?: boolean;
  already_unlocked?: boolean;
  reason?: string;
  taobao_shop_url?: string;
  quota_notice_text?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MemberService {
  private http = inject(HttpClient);
  private resService = inject(ResourceService);
  private platformId = inject(PLATFORM_ID);

  get baseUrl(): string {
    return this.resService.baseUrl;
  }

  get publicUrl(): string {
    return `${this.baseUrl}/api/v1/public/member`;
  }

  get adminUrl(): string {
    return `${this.baseUrl}/api/v1/admin`;
  }

  // 前台用户登录状态信号源
  currentUser = signal<FrontUserDto | null>(null);
  userToken = signal<string | null>(null);
  quotaStatus = signal<QuotaStatusDto | null>(null);

  constructor() {
    this.restoreUserSession();
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private restoreUserSession() {
    if (!this.isBrowser()) return;
    try {
      const token = localStorage.getItem('xuebaw_user_token');
      const userJson = localStorage.getItem('xuebaw_user_profile');
      if (token) {
        this.userToken.set(token);
        if (userJson) {
          this.currentUser.set(JSON.parse(userJson));
        }
        this.refreshProfile().subscribe();
      }
    } catch (_) {}
  }

  private saveUserSession(token: string, user: any) {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem('xuebaw_user_token', token);
      localStorage.setItem('xuebaw_user_profile', JSON.stringify(user));
      this.userToken.set(token);
      this.currentUser.set(user);
    } catch (_) {}
  }

  logout() {
    if (this.isBrowser()) {
      localStorage.removeItem('xuebaw_user_token');
      localStorage.removeItem('xuebaw_user_profile');
    }
    this.userToken.set(null);
    this.currentUser.set(null);
    this.fetchQuotaStatus().subscribe();
  }

  private getUserHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const token = this.userToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  // 1. 前台用户注册
  register(data: { username: string; password: string; email?: string; nickname?: string }): Observable<any> {
    return this.http.post<any>(`${this.publicUrl}/register`, data).pipe(
      tap(res => {
        if (res.data?.token) {
          this.saveUserSession(res.data.token, res.data.user);
          this.fetchQuotaStatus().subscribe();
        }
      })
    );
  }

  // 2. 前台用户登录
  login(data: { username: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.publicUrl}/login`, data).pipe(
      tap(res => {
        if (res.data?.token) {
          this.saveUserSession(res.data.token, res.data.user);
          this.fetchQuotaStatus().subscribe();
        }
      })
    );
  }

  // 3. 刷新个人资料
  refreshProfile(): Observable<any> {
    if (!this.isBrowser()) return of(null);
    const token = this.userToken();
    if (!token) return of(null);
    return this.http.get<any>(`${this.publicUrl}/me`, { headers: this.getUserHeaders() }).pipe(
      tap(res => {
        if (res.data) {
          this.currentUser.set(res.data);
          if (this.isBrowser()) {
            localStorage.setItem('xuebaw_user_profile', JSON.stringify(res.data));
          }
        }
      }),
      catchError(() => of(null))
    );
  }

  // 4. 获取当前访客/用户的额度状态
  fetchQuotaStatus(slug?: string): Observable<QuotaStatusDto> {
    if (!this.isBrowser()) {
      const defaultStatus: QuotaStatusDto = {
        enabled: true,
        is_authenticated: false,
        level_id: 'guest',
        level_name: '游客访问',
        badge_text: '游客',
        color: 'slate',
        daily_quota: 5,
        used_count: 0,
        remain_quota: 5,
        is_unlimited: false,
        is_unlocked: false
      };
      this.quotaStatus.set(defaultStatus);
      return of(defaultStatus);
    }
    const url = slug ? `${this.publicUrl}/quota-status?slug=${encodeURIComponent(slug)}` : `${this.publicUrl}/quota-status`;
    return this.http.get<{ code: number; data: QuotaStatusDto }>(url, { headers: this.getUserHeaders() }).pipe(
      map(res => res.data),
      tap(status => this.quotaStatus.set(status)),
      catchError(() => {
        const fallback: QuotaStatusDto = {
          enabled: true,
          is_authenticated: false,
          level_id: 'guest',
          level_name: '游客访问',
          badge_text: '游客',
          color: 'slate',
          daily_quota: 5,
          used_count: 0,
          remain_quota: 5,
          is_unlimited: false,
          is_unlocked: false
        };
        this.quotaStatus.set(fallback);
        return of(fallback);
      })
    );
  }

  // 5. 扣减资源获取额度 (同资源当日不重复扣除)
  consumeQuota(slug: string): Observable<ConsumeQuotaResult> {
    return this.http.post<{ code: number; data: ConsumeQuotaResult }>(
      `${this.publicUrl}/consume-quota`,
      { slug },
      { headers: this.getUserHeaders() }
    ).pipe(
      map(res => res.data),
      catchError(err => {
        if (err.status === 403 && err.error?.data) {
          return of(err.error.data as ConsumeQuotaResult);
        }
        return of({
          allowed: false,
          reason: 'network_error',
          message: err.error?.message || '额度校验失败，请重试'
        });
      })
    );
  }

  // 6. 卡密兑换
  redeemCode(code: string): Observable<any> {
    return this.http.post<any>(
      `${this.publicUrl}/redeem`,
      { code },
      { headers: this.getUserHeaders() }
    ).pipe(
      tap(() => {
        this.refreshProfile().subscribe();
        this.fetchQuotaStatus().subscribe();
      })
    );
  }

  // ==========================================
  // 后台管理员接口 (Admin)
  // ==========================================

  // 获取所有会员角色及额度规则列表
  getAdminMemberLevels(): Observable<MemberLevelDto[]> {
    return this.http.get<{ code: number; data: MemberLevelDto[] }>(`${this.adminUrl}/member-levels`).pipe(
      map(res => res.data)
    );
  }

  // 更新某个会员角色规则与额度
  updateAdminMemberLevel(id: string, data: Partial<MemberLevelDto>): Observable<MemberLevelDto> {
    return this.http.put<{ code: number; data: MemberLevelDto }>(`${this.adminUrl}/member-levels/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  // 创建自定义会员角色
  createAdminMemberLevel(data: MemberLevelDto): Observable<MemberLevelDto> {
    return this.http.post<{ code: number; data: MemberLevelDto }>(`${this.adminUrl}/member-levels`, data).pipe(
      map(res => res.data)
    );
  }

  // 分页获取卡密列表
  getAdminActivationCodes(params: { page?: number; page_size?: number; status?: string; batch_no?: string; keyword?: string }): Observable<{ total: number; page: number; page_size: number; items: ActivationCodeDto[] }> {
    let queryParts: string[] = [];
    if (params.page) queryParts.push(`page=${params.page}`);
    if (params.page_size) queryParts.push(`page_size=${params.page_size}`);
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params.batch_no) queryParts.push(`batch_no=${encodeURIComponent(params.batch_no)}`);
    if (params.keyword) queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    const qs = queryParts.length ? `?${queryParts.join('&')}` : '';
    return this.http.get<{ code: number; data: any }>(`${this.adminUrl}/activation-codes${qs}`).pipe(
      map(res => res.data)
    );
  }

  // 批量生成卡密并返回纯文本
  batchGenerateCodes(data: { target_level_id: string; duration_days: number; count: number; batch_no?: string; remark?: string }): Observable<{ batch_no: string; count: number; target_level: string; codes: string[]; plain_text: string }> {
    return this.http.post<{ code: number; data: any }>(`${this.adminUrl}/activation-codes/batch`, data).pipe(
      map(res => res.data)
    );
  }

  // 作废卡密
  voidActivationCode(id: string): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/activation-codes/${id}/void`, {});
  }

  // 查看前台注册会员
  getAdminUsers(params: { page?: number; page_size?: number; keyword?: string; level_id?: string }): Observable<{ total: number; page: number; page_size: number; items: FrontUserDto[] }> {
    let queryParts: string[] = [];
    if (params.page) queryParts.push(`page=${params.page}`);
    if (params.page_size) queryParts.push(`page_size=${params.page_size}`);
    if (params.keyword) queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    if (params.level_id) queryParts.push(`level_id=${encodeURIComponent(params.level_id)}`);
    const qs = queryParts.length ? `?${queryParts.join('&')}` : '';
    return this.http.get<{ code: number; data: any }>(`${this.adminUrl}/member-users${qs}`).pipe(
      map(res => res.data)
    );
  }

  // 修改会员属性（升级等级、调整VIP到期日、启用/停用）
  updateAdminUser(id: string, data: { level_id?: string; vip_expire_at?: string | null; is_active?: boolean; password?: string }): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/member-users/${id}`, data);
  }
}
