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
  updated_at?: string;
}

export interface ResourceItemDto {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  stage: string;
  grade: string;
  subject: string;
  edition: string;
  file_type?: string;
  file_size?: string;
  page_count?: number;
  view_count?: number;
  save_count?: number;
  is_published: boolean;
  is_recommended?: boolean;
  links?: ResourceLinkDto[];
}

@Injectable({
  providedIn: 'root'
})
export class ResourceService {
  private http = inject(HttpClient);
  private apiUrl = 'http://127.0.0.1:8080/api/v1/admin/resources';

  // 获取后台全部资源列表
  list(): Observable<ResourceItemDto[]> {
    return this.http.get<{ code: number; data: { items: ResourceItemDto[] } }>(this.apiUrl).pipe(
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
        success: boolean;
        message: string;
      };
    }>('http://127.0.0.1:8080/api/v1/admin/parse-netdisk', {
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
}
