import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError, from, of, switchMap } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return from(authService.tokenReady).pipe(
    switchMap(() => {
      if (!authService.isLoggedIn()) {
        return of(router.createUrlTree(['/login']));
      }

      if (authService.currentUserValue) {
        return of(true);
      }

      return authService.loadCurrentUser().pipe(
        map(() => true),
        catchError(() => {
          authService.logout();
          return of(router.createUrlTree(['/login']));
        })
      );
    })
  );
};