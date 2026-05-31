import { Provider, APP_INITIALIZER, inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};

export function initializeApp(authService: AuthService): () => Promise<void> {
  return () => {
    return new Promise((resolve) => {
      if (authService.isAuthenticated()) {
        authService.currentUser$;
      }
      resolve();
    });
  };
}

export const appInitializerProvider: Provider = {
  provide: APP_INITIALIZER,
  useFactory: initializeApp,
  deps: [AuthService],
  multi: true
};
