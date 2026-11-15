import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, catchError } from 'rxjs';
import { ResourceService, ChannelDto, CategoryDto, ResourceItemDto, ResourceLinkDto, NavMenuDto } from '../../services/resource.service';
export type { NavMenuDto };

export interface PublicResourceQuery {
  channel?: string;
  stage?: string;
  grade?: string;
  term?: string;
  subject?: string;
  edition?: string;
  school?: string;
  region?: string;
  q?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

export interface HotSearchItem {
  id: string;
  title: string;
  keyword: string;
  stage: string;
  style_type: string;
  sort_order: number;
}

export interface SiteSettings {
  qq_group?: string;
  qq_group_url?: string;
  site_title?: string;
  site_keywords?: string;
  site_description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PortalService {
  constructor(
    private http: HttpClient,
    private resService: ResourceService
  ) {}

  get baseUrl(): string {
    return this.resService.baseUrl;
  }

  get siteOrigin(): string {
    return this.resService.siteOrigin;
  }

  // 1. 获取全站可用频道专区 (仅已上线)
  getChannels(): Observable<ChannelDto[]> {
    return this.http.get<{ code: number; data: ChannelDto[] }>(`${this.baseUrl}/api/v1/public/channels`).pipe(
      map(res => res.data || []),
      catchError(() => of([]))
    );
  }

  // 2. 获取分组分类字典 (五维级联基础)
  getCategoriesGrouped(): Observable<Record<string, CategoryDto[]>> {
    return this.http.get<{ code: number; data: Record<string, CategoryDto[]> }>(`${this.baseUrl}/api/v1/public/categories?grouped=true`).pipe(
      map(res => res.data || {}),
      catchError(() => of({}))
    );
  }

  // 3. 搜索与查询前台公开资源
  getResources(query: PublicResourceQuery = {}): Observable<{ items: ResourceItemDto[]; total: number }> {
    let params = new HttpParams();
    if (query.channel && query.channel !== 'all') params = params.set('channel', query.channel);
    if (query.stage && query.stage !== 'all') params = params.set('stage', query.stage);
    if (query.grade) params = params.set('grade', query.grade);
    if (query.term) params = params.set('term', query.term);
    if (query.subject) params = params.set('subject', query.subject);
    if (query.edition) params = params.set('edition', query.edition);
    if (query.school) params = params.set('school', query.school);
    if (query.region) params = params.set('region', query.region);
    if (query.q) params = params.set('q', query.q);
    if (query.page) params = params.set('page', query.page.toString());
    if (query.limit) params = params.set('limit', query.limit.toString());
    if (query.offset) params = params.set('offset', query.offset.toString());

    return this.http.get<{ code: number; data: { items?: ResourceItemDto[]; list?: ResourceItemDto[]; total: number } | ResourceItemDto[] }>(
      `${this.baseUrl}/api/v1/public/resources`,
      { params }
    ).pipe(
      map(res => {
        if (!res || !res.data) return { items: [], total: 0 };
        if (Array.isArray(res.data)) {
          return { items: res.data, total: res.data.length };
        }
        const items = res.data.items || res.data.list || [];
        return { items, total: res.data.total || items.length };
      }),
      catchError(() => of({ items: [], total: 0 }))
    );
  }

  // 4. 获取资源详情与网盘转存直链
  getResourceDetail(idOrSlug: string): Observable<{ resource: ResourceItemDto; links: ResourceLinkDto[] } | null> {
    return this.http.get<{ code: number; data: any }>(
      `${this.baseUrl}/api/v1/public/resources/${encodeURIComponent(idOrSlug)}`
    ).pipe(
      map(res => {
        if (!res || !res.data) return null;
        if (res.data.resource) {
          return {
            resource: res.data.resource,
            links: res.data.links || res.data.resource.links || []
          };
        }
        return {
          resource: res.data,
          links: res.data.links || []
        };
      }),
      catchError(() => of(null))
    );
  }

  // 5. 热门搜索热词
  getHotSearches(): Observable<HotSearchItem[]> {
    return this.http.get<{ code: number; data: HotSearchItem[] }>(`${this.baseUrl}/api/v1/public/hot-searches`).pipe(
      map(res => res.data || []),
      catchError(() => of([]))
    );
  }

  // 5.1 搜索输入框实时联想推荐 (Debounced Suggestions)
  searchSuggestions(q: string): Observable<ResourceItemDto[]> {
    if (!q || !q.trim()) return of([]);
    let params = new HttpParams().set('q', q.trim()).set('limit', '6');
    return this.http.get<{ code: number; data: any }>(`${this.baseUrl}/api/v1/public/resources`, { params }).pipe(
      map(res => {
        if (!res || !res.data) return [];
        if (Array.isArray(res.data)) return res.data.slice(0, 6);
        return (res.data.items || res.data.list || []).slice(0, 6);
      }),
      catchError(() => of([]))
    );
  }

  // 6. 站点全局设置 (QQ 群、转存指引)
  getSiteSettings(): Observable<SiteSettings> {
    return this.http.get<{ code: number; data: SiteSettings }>(`${this.baseUrl}/api/v1/public/settings`).pipe(
      map(res => res.data || {}),
      catchError(() => of({}))
    );
  }

  // 7. 提交求助找卷申请
  submitRequest(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/public/requests`, data);
  }

  // 8. 获取热门求助愿望池
  getTrendingRequests(): Observable<any[]> {
    return this.http.get<{ code: number; data: any[] }>(`${this.baseUrl}/api/v1/public/requests/trending`).pipe(
      map(res => res.data || []),
      catchError(() => of([]))
    );
  }

  // 9. 获取前台公开在线的动态层级导航菜单
  getNavMenus(): Observable<NavMenuDto[]> {
    return this.http.get<{ code: number; data: NavMenuDto[] }>(`${this.baseUrl}/api/v1/public/nav-menus`).pipe(
      map(res => res.data || []),
      catchError(() => of([]))
    );
  }
}

