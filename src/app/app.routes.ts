import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard'; // ✅ ADDED — tumcha actual path check kara

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
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
    path: '**',
    redirectTo: 'login'
  }

];