import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

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

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 令牌过期或未登录：清空本地缓存
      if (error.status === 401) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
        }
      }
      return throwError(() => error);
    })
  );
};
