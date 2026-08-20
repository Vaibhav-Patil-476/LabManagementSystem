import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfilePage)
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then(m => m.LoginPage)
  },

  {
    path: 'dashboard',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage)
  },

  {
    path: 'add-patient',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/add-patient/add-patient.page').then(m => m.AddPatientComponent)
  },

  {
    path: 'booking-status',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/booking-status/booking-status.page').then(m => m.BookingStatusPage)
  },

  {
    path: 'download-reports',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(m => m.DownloadReportsPage)
  },

  {
    path: 'reports',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(m => m.DownloadReportsPage)
  },

  {
    path: 'notification',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () =>
      import('./pages/notification/notification.page').then(
        m => m.NotificationsPage
      )
  },

  {
    path: 'cancel-test',
    canActivate: [authGuard], // ✅ ADDED — hyach mule refresh var 400 auth error yet hota
    loadComponent: () => import('./pages/cancel-test/cancel-test.page').then(m => m.CancelTestPage)
  },
  {
    path: 'clinical-history',
    canActivate: [authGuard], // ✅ ADDED
    loadComponent: () => import('./pages/clinical-history/clinical-history.page').then(m => m.ClinicalHistoryPage)
  },

 
  {
    path: '**',
    redirectTo: 'login'
  }

];