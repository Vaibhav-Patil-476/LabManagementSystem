import { Routes } from '@angular/router';

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
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage)
  },

  {
    path: 'add-patient',
    loadComponent: () =>
      import('./pages/add-patient/add-patient.page').then(m => m.AddPatientComponent)
  },

  {
    path: 'booking-status',
    loadComponent: () =>
      import('./pages/booking-status/booking-status.page').then(m => m.BookingStatusPage)
  },

  {
    path: 'download-reports',
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(m => m.DownloadReportsPage)
  },

  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(m => m.DownloadReportsPage)
  },

  {
    path: 'notification',
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