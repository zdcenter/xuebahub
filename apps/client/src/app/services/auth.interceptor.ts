import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, timeout } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;
  if (typeof localStorage !== 'undefined') {
    token = localStorage.getItem('admin_token');
  }

  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // SSR 服务端渲染环境下限制最长 3.5s 超时，防止长时间挂起触发 Angular SSR 9s 稳定检测警告
  const isServer = typeof window === 'undefined';
  const pipeline = isServer ? next(authReq).pipe(timeout(3500)) : next(authReq);

  return pipeline.pipe(
    catchError((error: any) => {
      // 401 令牌过期或未登录：清空本地缓存
      if (error && error.status === 401) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
        }
      }
      return throwError(() => error);
    })
  );
};
