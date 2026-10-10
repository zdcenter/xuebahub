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
  file_tree?: any[];
  links?: ResourceLinkDto[];
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

  // 获取后台全部资源列表（支持按频道过滤）
  list(channel?: string): Observable<ResourceItemDto[]> {
    let url = this.apiUrl;
    if (channel && channel !== 'all') {
      url += `?channel=${encodeURIComponent(channel)}`;
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

  // 更新资源
  update(id: string, data: Partial<ResourceItemDto>): Observable<ResourceItemDto> {
    return this.http.put<{ code: number; data: ResourceItemDto }>(`${this.apiUrl}/${id}`, data).pipe(
      map(res => res.data)
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

