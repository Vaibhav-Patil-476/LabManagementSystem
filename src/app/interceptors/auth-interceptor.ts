// import { HttpInterceptorFn } from '@angular/common/http';
// import { inject } from '@angular/core';
// import { AuthService } from '../services/auth';

// export const authInterceptor: HttpInterceptorFn = (req, next) => {
//   const authService = inject(AuthService);
//   const token = authService.getToken();

//   if (token) {
//     const clonedReq = req.clone({
//       setHeaders: {
//         Authorization: `Bearer ${token}`
//       }
//     });
//     return next(clonedReq);
//   }

//   return next(req);
// };
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  console.log('====================================');
  console.log('AUTH INTERCEPTOR');
  console.log('REQUEST URL:', req.url);
  console.log('TOKEN EXISTS:', !!token);
  console.log('TOKEN:', token ? 'TOKEN FOUND' : 'NO TOKEN');

  if (token) {
    const clonedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log(
      'AUTHORIZATION HEADER:',
      clonedReq.headers.get('Authorization') ? 'ADDED' : 'NOT ADDED'
    );

    return next(clonedReq);
  }

  console.warn('⚠️ NO AUTH TOKEN FOUND');

  return next(req);
};