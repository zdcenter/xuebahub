import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface ResourceLinkDto {
  id?: string;
  drive_type: string;
  share_url: string;
  extract_code?: string;
  password_hint?: string;
  is_primary: boolean;
  click_count?: number;
  file_size?: string;
  file_type?: string;
  resource_desc?: string;
  status?: string; // active, invalid, reported
  report_count?: number;
  invalid_reason?: string;
  last_checked_at?: string;
  updated_at?: string;
}

export interface ResourceItemDto {
  id: string;
  slug: string;
  channel_slug?: string;
  title: string;
  subtitle?: string;
  description?: string;
  stage: string;
  grade: string;
  subject: string;
  edition: string;
  region?: string;
  school?: string;
  file_type?: string;
  file_size?: string;
  page_count?: number;
  view_count?: number;
  save_count?: number;
  is_published: boolean;
  is_recommended?: boolean;
  cover_image?: string;
  file_tree?: any[];
  links?: ResourceLinkDto[];
}

export interface OverviewStatsDto {
  total_resources: number;
  published_resources: number;
  total_views: number;
  total_saves: number;
  save_rate: number;
  total_links: number;
  active_links: number;
  invalid_links: number;
  reported_links: number;
  health_rate: number;
  total_clicks: number;
  total_accounts: number;
  valid_accounts: number;
}

export interface DriveStatItemDto {
  drive_type: string;
  name: string;
  icon: string;
  link_count: number;
  click_count: number;
  percentage: number;
}

export interface ChannelStatItemDto {
  channel_slug: string;
  channel_name: string;
  icon: string;
  resource_count: number;
  view_count: number;
  save_count: number;
  save_rate: number;
}

export interface TopResourceItemDto {
  id: string;
  slug: string;
  title: string;
  channel_slug: string;
  file_type: string;
  view_count: number;
  save_count: number;
  save_rate: number;
}

export interface SearchStatItemDto {
  keyword: string;
  count: number;
  result_count: number;
}

export interface DashboardStatsDto {
  overview: OverviewStatsDto;
  drives: DriveStatItemDto[];
  channels: ChannelStatItemDto[];
  top_resources: TopResourceItemDto[];
  searches: SearchStatItemDto[];
}

@Injectable({
  providedIn: 'root'
})
export class ResourceService {
  private http = inject(HttpClient);

  get baseUrl(): string {
    if (typeof window !== 'undefined') {
      // 1. 允许通过 localStorage 手动指定 API 地址，便于随时在线调试
      const customApi = localStorage.getItem('API_BASE_URL');
      if (customApi) {
        return customApi.replace(/\/$/, '');
      }

      // 2. 本地开发环境检测 (localhost / 127.0.0.1)
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return `http://${host}:4001`;
      }
    }
    // 3. 部署在 Cloudflare Pages 或公网时的远程 API 服务端地址
    return 'https://api.xuebaw.com:8443';
  }

  get apiUrl(): string {
    return `${this.baseUrl}/api/v1/admin/resources`;
  }

  // --- 身份认证与权限 API ---
  login(username: string, password: string): Observable<{ token: string; username: string; nickname: string; role: string }> {
    return this.http.post<{ code: number; message: string; data: any }>(
      `${this.baseUrl}/api/v1/auth/login`,
      { username, password }
    ).pipe(
      map(res => {
        if (res.code === 200 && res.data?.token) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('admin_token', res.data.token);
            localStorage.setItem('admin_user', JSON.stringify({
              username: res.data.username,
              nickname: res.data.nickname,
              role: res.data.role
            }));
          }
        }
        return res.data;
      })
    );
  }

  getMe(): Observable<any> {
    return this.http.get<{ code: number; data: any }>(`${this.baseUrl}/api/v1/admin/me`).pipe(
      map(res => res.data)
    );
  }

  updateProfile(nickname: string): Observable<any> {
    return this.http.put<{ code: number; message: string; data: any }>(
      `${this.baseUrl}/api/v1/admin/me/profile`,
      { nickname }
    ).pipe(
      map(res => {
        if (res.code === 200 && res.data) {
          if (typeof localStorage !== 'undefined') {
            const cached = this.getCurrentUser();
            if (cached) {
              cached.nickname = res.data.nickname;
              localStorage.setItem('admin_user', JSON.stringify(cached));
            }
          }
        }
        return res.data;
      })
    );
  }

  changePassword(oldPassword: string, newPassword: string): Observable<any> {
    return this.http.put<{ code: number; message: string }>(
      `${this.baseUrl}/api/v1/admin/me/password`,
      { old_password: oldPassword, new_password: newPassword }
    );
  }

  getDashboardStats(): Observable<DashboardStatsDto> {
    return this.http.get<{ code: number; data: DashboardStatsDto }>(
      `${this.baseUrl}/api/v1/admin/stats`
    ).pipe(
      map(res => res.data)
    );
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    }
  }

  getToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('admin_token');
    }
    return null;
  }

  getCurrentUser(): { username: string; nickname: string; role: string } | null {
    if (typeof localStorage !== 'undefined') {
      const u = localStorage.getItem('admin_user');
      if (u) {
        try {
          return JSON.parse(u);
        } catch {}
      }
    }
    return null;
  }

  // 获取后台全部资源列表（支持按频道和学段过滤）
  list(channel?: string, stage?: string): Observable<ResourceItemDto[]> {
    let url = this.apiUrl;
    const params: string[] = [];
    if (channel && channel !== 'all') {
      params.push(`channel=${encodeURIComponent(channel)}`);
    }
    if (stage && stage !== 'all') {
      params.push(`stage=${encodeURIComponent(stage)}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.http.get<{ code: number; data: { items: ResourceItemDto[] } }>(url).pipe(
      map(res => res.data?.items || [])
    );
  }

  // 创建新资源（支持试卷与视频）
  create(data: Partial<ResourceItemDto>): Observable<ResourceItemDto> {
    return this.http.post<{ code: number; data: ResourceItemDto }>(this.apiUrl, data).pipe(
      map(res => res.data)
    );
  }

  // 一键切换上下架
  togglePublish(id: string): Observable<{ id: string; is_published: boolean }> {
    return this.http.post<{ code: number; data: { id: string; is_published: boolean } }>(
      `${this.apiUrl}/${id}/toggle`,
      {}
    ).pipe(
      map(res => res.data)
    );
  }

  // 批量上架/下架
  batchTogglePublish(ids: string[], is_published: boolean): Observable<{ affected: number }> {
    return this.http.post<{ code: number; data: { affected: number } }>(
      `${this.apiUrl}/batch-toggle`,
      { ids, is_published }
    ).pipe(
      map(res => res.data)
    );
  }

  // 批量删除
  batchDelete(ids: string[]): Observable<{ deleted_count: number }> {
    return this.http.post<{ code: number; data: { deleted_count: number } }>(
      `${this.apiUrl}/batch-delete`,
      { ids }
    ).pipe(
      map(res => res.data)
    );
  }

  // 更新资源
  update(id: string, data: Partial<ResourceItemDto>): Observable<ResourceItemDto> {
    return this.http.put<{ code: number; data: ResourceItemDto }>(`${this.apiUrl}/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  // 快速更新资源统计量（浏览量与转存量）
  updateStats(id: string, data: { view_count?: number; save_count?: number }): Observable<any> {
    return this.http.patch<{ code: number; message: string; data: any }>(
      `${this.apiUrl}/${id}/stats`,
      data
    );
  }

  // 智能解析网盘分享链接，获取真实文件大小、名称、格式与更新时间
  parseNetdisk(shareUrl: string, driveType: string = 'quark', passcode: string = ''): Observable<{
    file_name: string;
    file_size: string;
    file_type: string;
    file_time?: string;
    resource_desc?: string;
    has_video: boolean;
    file_list?: any[];
    file_count?: number;
    success: boolean;
    message: string;
  }> {
    return this.http.post<{
      code: number;
      data: {
        file_name: string;
        file_size: string;
        file_type: string;
        file_time?: string;
        resource_desc?: string;
        has_video: boolean;
        file_list?: any[];
        file_count?: number;
        success: boolean;
        message: string;
      };
    }>(`${this.baseUrl}/api/v1/admin/parse-netdisk`, {
      share_url: shareUrl,
      drive_type: driveType,
      passcode: passcode
    }).pipe(
      map(res => res.data)
    );
  }

  // 删除资源
  delete(id: string): Observable<boolean> {
    return this.http.delete<{ code: number; message: string }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.code === 200)
    );
  }

  // 单链接手动立即检测
  checkSingleLink(linkId: string): Observable<{ id: string; status: string; invalid_reason: string; last_checked_at: string }> {
    return this.http.post<{ code: number; data: any }>(`${this.baseUrl}/api/v1/admin/links/${linkId}/check`, {}).pipe(
      map(res => res.data)
    );
  }

  // 批量巡检（受频率调控保护）
  batchCheckLinks(options: { min_interval_hours?: number; force?: boolean; status_filter?: string; limit?: number }): Observable<{
    total_eligible: number;
    checked_count: number;
    active_count: number;
    invalid_count: number;
    skipped_count: number;
    results: any[];
  }> {
    return this.http.post<{ code: number; message: string; data: any }>(`${this.baseUrl}/api/v1/admin/links/batch-check`, options).pipe(
      map(res => res.data)
    );
  }

  // 修改网盘链接状态或补链
  updateLinkStatus(linkId: string, data: { status: string; invalid_reason?: string; share_url?: string; extract_code?: string }): Observable<any> {
    return this.http.put<{ code: number; data: any }>(`${this.baseUrl}/api/v1/admin/links/${linkId}/status`, data).pipe(
      map(res => res.data)
    );
  }

  // --- 网盘账号与一键自动转存换链 API ---

  listAccounts(): Observable<NetdiskAccountDto[]> {
    return this.http.get<{ code: number; data: NetdiskAccountDto[] }>(`${this.baseUrl}/api/v1/admin/netdisk/accounts`).pipe(
      map(res => res.data || [])
    );
  }

  saveAccount(account: Partial<NetdiskAccountDto>): Observable<NetdiskAccountDto> {
    return this.http.post<{ code: number; message: string; data: NetdiskAccountDto }>(`${this.baseUrl}/api/v1/admin/netdisk/accounts`, account).pipe(
      map(res => res.data)
    );
  }

  deleteAccount(id: string): Observable<boolean> {
    return this.http.delete<{ code: number }>(`${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}`).pipe(
      map(res => res.code === 200)
    );
  }

  verifyAccount(id: string): Observable<NetdiskAccountDto> {
    return this.http.post<{ code: number; message: string; data: NetdiskAccountDto }>(`${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}/verify`, {}).pipe(
      map(res => res.data)
    );
  }

  setDefaultAccount(id: string): Observable<NetdiskAccountDto> {
    return this.http.post<{ code: number; message: string; data: NetdiskAccountDto }>(
      `${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}/default`,
      {}
    ).pipe(
      map(res => res.data)
    );
  }

  listAccountFolders(id: string, pdirFid: string = '0'): Observable<{ fid: string; file_name: string; dir: boolean }[]> {
    const ts = Date.now();
    return this.http.get<{ code: number; data: any[] }>(`${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}/folders?pdir_fid=${pdirFid}&_t=${ts}`).pipe(
      map(res => res.data || [])
    );
  }

  createAccountFolder(id: string, folderName: string, pdirFid: string = '0'): Observable<{ fid: string; file_name: string; dir: boolean }> {
    return this.http.post<{ code: number; message: string; data: any }>(
      `${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}/folders`,
      { pdir_fid: pdirFid, folder_name: folderName }
    ).pipe(
      map(res => res.data)
    );
  }

  deleteAccountFolder(id: string, fid: string): Observable<boolean> {
    return this.http.delete<{ code: number; message: string }>(
      `${this.baseUrl}/api/v1/admin/netdisk/accounts/${id}/folders/${fid}`
    ).pipe(
      map(res => res.code === 200)
    );
  }

  autoTransferAndShare(params: {
    account_id?: string;
    share_url: string;
    passcode?: string;
    target_folder_fid?: string;
  }): Observable<TransferShareResultDto> {
    return this.http.post<{ code: number; message: string; data: TransferShareResultDto }>(
      `${this.baseUrl}/api/v1/admin/netdisk/transfer-share`,
      params
    ).pipe(
      map(res => res.data)
    );
  }

  // --- 顶级频道管理接口 ---
  getChannels(): Observable<ChannelDto[]> {
    return this.http.get<{ code: number; data: ChannelDto[] }>(`${this.baseUrl}/api/v1/admin/channels`).pipe(
      map(res => res.data || [])
    );
  }

  createChannel(data: Partial<ChannelDto>): Observable<ChannelDto> {
    return this.http.post<{ code: number; data: ChannelDto }>(`${this.baseUrl}/api/v1/admin/channels`, data).pipe(
      map(res => res.data)
    );
  }

  updateChannel(id: string, data: Partial<ChannelDto>): Observable<ChannelDto> {
    return this.http.put<{ code: number; data: ChannelDto }>(`${this.baseUrl}/api/v1/admin/channels/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  toggleChannel(id: string): Observable<{ is_active: boolean; message: string }> {
    return this.http.patch<{ code: number; is_active: boolean; message: string }>(`${this.baseUrl}/api/v1/admin/channels/${id}/toggle`, {}).pipe(
      map(res => ({ is_active: res.is_active, message: res.message }))
    );
  }

  deleteChannel(id: string): Observable<void> {
    return this.http.delete<{ code: number; message: string }>(`${this.baseUrl}/api/v1/admin/channels/${id}`).pipe(
      map(() => void 0)
    );
  }

  // --- 网站多级导航管理接口 ---
  getNavMenus(): Observable<NavMenuDto[]> {
    return this.http.get<{ code: number; data: NavMenuDto[] }>(`${this.baseUrl}/api/v1/admin/nav-menus`).pipe(
      map(res => res.data || [])
    );
  }

  createNavMenu(data: Partial<NavMenuDto>): Observable<NavMenuDto> {
    return this.http.post<{ code: number; data: NavMenuDto }>(`${this.baseUrl}/api/v1/admin/nav-menus`, data).pipe(
      map(res => res.data)
    );
  }

  updateNavMenu(id: string, data: Partial<NavMenuDto>): Observable<NavMenuDto> {
    return this.http.put<{ code: number; data: NavMenuDto }>(`${this.baseUrl}/api/v1/admin/nav-menus/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  toggleNavMenu(id: string): Observable<{ is_active: boolean; message: string }> {
    return this.http.patch<{ code: number; data: { is_active: boolean }; message: string }>(`${this.baseUrl}/api/v1/admin/nav-menus/${id}/toggle`, {}).pipe(
      map(res => ({ is_active: res.data?.is_active ?? true, message: res.message }))
    );
  }

  deleteNavMenu(id: string): Observable<void> {
    return this.http.delete<{ code: number; message: string }>(`${this.baseUrl}/api/v1/admin/nav-menus/${id}`).pipe(
      map(() => void 0)
    );
  }

  getRegions(): Observable<RegionDto[]> {
    return this.http.get<{ code: number; data: RegionDto[] }>(`${this.baseUrl}/api/v1/public/regions`).pipe(
      map(res => res.data || [])
    );
  }

  createSchool(payload: { region_name: string; school_name: string; stage?: string }): Observable<SchoolDto> {
    return this.http.post<{ code: number; data: SchoolDto }>(`${this.baseUrl}/api/v1/admin/schools`, payload).pipe(
      map(res => res.data)
    );
  }

  deleteSchool(id: number): Observable<void> {
    return this.http.delete<{ code: number }>(`${this.baseUrl}/api/v1/admin/schools/${id}`).pipe(
      map(() => void 0)
    );
  }

  // 📂 浏览默认夸克网盘目录结构
  getDefaultAccountFiles(pdirFid?: string): Observable<{ account_id: string; account_name: string; nickname: string; pdir_fid: string; items: any[] }> {
    const url = pdirFid && pdirFid !== '0' 
      ? `${this.baseUrl}/api/v1/admin/netdisk/default-account/files?pdir_fid=${encodeURIComponent(pdirFid)}` 
      : `${this.baseUrl}/api/v1/admin/netdisk/default-account/files`;
    return this.http.get<{ code: number; data: any }>(url).pipe(
      map(res => res.data)
    );
  }

  // ⚡ 为网盘内选中文件/文件夹直接生成永久公开无密分享链接
  createShareFromDefaultAccount(fid: string, title?: string): Observable<{ share_id: string; share_url: string; extract_code: string; share_title: string }> {
    return this.http.post<{ code: number; message: string; data: any }>(`${this.baseUrl}/api/v1/admin/netdisk/default-account/create-share`, { fid, title }).pipe(
      map(res => res.data)
    );
  }

  // --- 🔥 高频热搜管理 ---
  getAdminHotSearches(stage?: string, keyword?: string): Observable<HotSearchDto[]> {
    let url = `${this.baseUrl}/api/v1/admin/hot-searches`;
    const params: string[] = [];
    if (stage && stage !== 'all') params.push(`stage=${encodeURIComponent(stage)}`);
    if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return this.http.get<{ code: number; data: HotSearchDto[] }>(url).pipe(map(r => r.data || []));
  }

  createHotSearch(item: Partial<HotSearchDto>): Observable<HotSearchDto> {
    return this.http.post<{ code: number; data: HotSearchDto }>(`${this.baseUrl}/api/v1/admin/hot-searches`, item).pipe(map(r => r.data));
  }

  updateHotSearch(id: string, item: Partial<HotSearchDto>): Observable<HotSearchDto> {
    return this.http.put<{ code: number; data: HotSearchDto }>(`${this.baseUrl}/api/v1/admin/hot-searches/${id}`, item).pipe(map(r => r.data));
  }

  deleteHotSearch(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/admin/hot-searches/${id}`);
  }

  toggleHotSearch(id: string): Observable<{ id: string; is_active: boolean }> {
    return this.http.patch<{ code: number; data: { id: string; is_active: boolean } }>(`${this.baseUrl}/api/v1/admin/hot-searches/${id}/toggle`, {}).pipe(map(r => r.data));
  }

  batchToggleHotSearches(ids: string[], isActive: boolean): Observable<{ affected: number }> {
    return this.http.post<{ code: number; data: { affected: number } }>(
      `${this.baseUrl}/api/v1/admin/hot-searches/batch-toggle`,
      { ids, is_active: isActive }
    ).pipe(map(r => r.data));
  }

  batchDeleteHotSearches(ids: string[]): Observable<{ affected: number }> {
    return this.http.post<{ code: number; data: { affected: number } }>(
      `${this.baseUrl}/api/v1/admin/hot-searches/batch-delete`,
      { ids }
    ).pipe(map(r => r.data));
  }

  getSettings(): Observable<SiteSettingDto> {
    return this.http.get<{ code: number; data: SiteSettingDto }>(`${this.baseUrl}/api/v1/admin/settings`).pipe(map(r => r.data));
  }

  updateSettings(data: Partial<SiteSettingDto>): Observable<SiteSettingDto> {
    return this.http.put<{ code: number; message: string; data: SiteSettingDto }>(`${this.baseUrl}/api/v1/admin/settings`, data).pipe(map(r => r.data));
  }

  getAdminRequests(params?: { status?: string; stage?: string; q?: string }): Observable<{ items: ResourceRequestDto[]; counts: Record<string, number> }> {
    let url = `${this.baseUrl}/api/v1/admin/requests`;
    const qList: string[] = [];
    if (params?.status && params.status !== 'all') qList.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.stage && params.stage !== 'all') qList.push(`stage=${encodeURIComponent(params.stage)}`);
    if (params?.q) qList.push(`q=${encodeURIComponent(params.q)}`);
    if (qList.length > 0) url += `?${qList.join('&')}`;
    return this.http.get<{ code: number; data: { items: ResourceRequestDto[]; counts: Record<string, number> } }>(url).pipe(map(r => r.data));
  }

  updateAdminRequest(id: string, data: Partial<ResourceRequestDto>): Observable<ResourceRequestDto> {
    return this.http.put<{ code: number; message: string; data: ResourceRequestDto }>(`${this.baseUrl}/api/v1/admin/requests/${id}`, data).pipe(map(r => r.data));
  }

  deleteAdminRequest(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/admin/requests/${id}`);
  }

  // --- 电报智能采集与草稿池 (Telegram Ingestion & Drafts) ---
  getCrawlerConfig(): Observable<{ config: TelegramConfigDto; stats: CrawlerStatsDto }> {
    return this.http.get<{ config: TelegramConfigDto; stats: CrawlerStatsDto }>(`${this.baseUrl}/api/v1/admin/crawler/config`);
  }

  updateCrawlerConfig(data: Partial<TelegramConfigDto>): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/admin/crawler/config`, data);
  }

  syncCrawlerNow(): Observable<{ success: boolean; result: any }> {
    return this.http.post<{ success: boolean; result: any }>(`${this.baseUrl}/api/v1/admin/crawler/sync`, {});
  }

  getCrawlerChannels(): Observable<{ channels: TelegramChannelDto[] }> {
    return this.http.get<{ channels: TelegramChannelDto[] }>(`${this.baseUrl}/api/v1/admin/crawler/channels`);
  }

  createCrawlerChannel(data: { channel_id: string; name: string; drive_type: string; remark?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/admin/crawler/channels`, data);
  }

  updateCrawlerChannel(id: string, data: Partial<TelegramChannelDto>): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/admin/crawler/channels/${id}`, data);
  }

  toggleCrawlerChannel(id: string): Observable<{ message: string; is_active: boolean; channel: TelegramChannelDto }> {
    return this.http.patch<{ message: string; is_active: boolean; channel: TelegramChannelDto }>(`${this.baseUrl}/api/v1/admin/crawler/channels/${id}/toggle`, {});
  }

  registerCrawlerWebhook(webhookUrl?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/admin/crawler/webhook/register`, { webhook_url: webhookUrl });
  }

  removeCrawlerWebhook(): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/admin/crawler/webhook/remove`, {});
  }

  getCrawlerWebhookInfo(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/admin/crawler/webhook/info`);
  }

  deleteCrawlerChannel(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/admin/crawler/channels/${id}`);
  }

  getCrawlerDrafts(params?: { page?: number; page_size?: number; status?: string; drive_type?: string; search?: string }): Observable<{ items: ResourceDraftDto[]; total: number; page: number; limit: number }> {
    let url = `${this.baseUrl}/api/v1/admin/crawler/drafts`;
    const qList: string[] = [];
    if (params?.page) qList.push(`page=${params.page}`);
    if (params?.page_size) qList.push(`page_size=${params.page_size}`);
    if (params?.status && params.status !== 'all') qList.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.drive_type && params.drive_type !== 'all') qList.push(`drive_type=${encodeURIComponent(params.drive_type)}`);
    if (params?.search) qList.push(`search=${encodeURIComponent(params.search)}`);
    if (qList.length > 0) url += `?${qList.join('&')}`;
    return this.http.get<{ items: ResourceDraftDto[]; total: number; page: number; limit: number }>(url);
  }

  ingestCrawlerText(data: { raw_text: string; source_name?: string; drive_type?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/admin/crawler/drafts/ingest-text`, data);
  }

  updateCrawlerDraftStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/admin/crawler/drafts/${id}/status`, { status });
  }

  deleteCrawlerDraft(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/admin/crawler/drafts/${id}`);
  }

  batchCrawlerDraftsAction(action: 'ignore' | 'delete', ids: string[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/admin/crawler/drafts/batch`, { action, ids });
  }
}

export interface HotSearchDto {
  id?: string;
  title: string;
  keyword: string;
  stage: string;
  style_type: 'default' | 'highlight' | 'hot';
  sort_order: number;
  is_active: boolean;
  click_count?: number;
  created_at?: string;
  updated_at?: string;
}


export interface SchoolDto {
  id?: number;
  region_id?: number;
  name: string;
  stage?: string;
  sort_order?: number;
  is_hot?: boolean;
  region_name?: string;
}

export interface RegionDto {
  id: number;
  name: string;
  sort_order: number;
  is_hot: boolean;
  schools?: SchoolDto[];
}

export interface NavMenuDto {
  id?: string;
  parent_id?: string | null;
  title: string;
  icon: string;
  link_url: string;
  badge_text?: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  is_special_highlight?: boolean;
  created_at?: string;
  updated_at?: string;
  children?: NavMenuDto[];
}

export interface ChannelDto {
  id?: string;
  slug: string;
  name: string;
  icon: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  resource_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface NetdiskAccountDto {
  id?: string;
  drive_type: string;
  account_name: string;
  cookie?: string;
  has_cookie?: boolean;
  cookie_masked?: string;
  target_folder_fid?: string;
  target_folder_name?: string;
  is_default?: boolean;
  nickname?: string;
  total_capacity?: string;
  used_capacity?: string;
  free_capacity?: string;
  is_over_quota?: boolean;
  status?: string;
  error_message?: string;
  last_verified_at?: string;
  created_at?: string;
}

export interface TransferShareResultDto {
  original_url: string;
  new_share_url: string;
  extract_code?: string;
  share_title?: string;
  file_name?: string;
  file_size?: string;
  file_type?: string;
  file_time?: string;
  resource_desc?: string;
  saved_fid?: string;
  target_folder_fid?: string;
}

export interface SiteSettingDto {
  id?: string;
  site_name: string;
  site_title: string;
  site_subtitle: string;
  keywords: string;
  qq_group: string;
  qq_group_url: string;
  contact_email: string;
  contact_wechat?: string;
  icp_beian?: string;
  gongan_beian?: string;
  copyright_text: string;
  disclaimer_text: string;
  announcement_active: boolean;
  announcement_text: string;
  announcement_url?: string;
  announcement_badge: string;
  announcement_type: 'blue' | 'amber' | 'emerald' | 'rose';
  updated_at?: string;
}

export interface ResourceRequestDto {
  id: string;
  title: string;
  stage: string;
  subject?: string;
  note?: string;
  contact?: string;
  status: 'pending' | 'fulfilled' | 'rejected';
  fulfilled_resource_id?: string | null;
  fulfilled_note?: string;
  vote_count: number;
  client_ip?: string;
  created_at: string;
  updated_at: string;
}

export interface TelegramConfigDto {
  id?: number;
  bot_token: string;
  bot_username?: string;
  sync_mode?: 'polling' | 'webhook';
  webhook_url?: string;
  proxy_url?: string;
  api_base_url?: string;
  auto_sync: boolean;
  sync_interval_seconds: number;
  last_update_id?: number;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_message?: string;
}

export interface TelegramChannelDto {
  id: string;
  channel_id: string;
  name: string;
  drive_type: string;
  is_active: boolean;
  item_count: number;
  remark?: string;
  created_at?: string;
}

export interface ResourceDraftDto {
  id: string;
  title: string;
  source_name: string;
  channel_id: string;
  message_id: number;
  drive_type: string;
  share_url: string;
  extract_code?: string;
  file_size?: string;
  raw_text: string;
  status: 'pending' | 'approved' | 'ignored';
  approved_resource_id?: string;
  is_safe: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CrawlerStatsDto {
  total_drafts: number;
  pending_drafts: number;
  approved_drafts: number;
  ignored_drafts: number;
  monitored_channels: number;
}



