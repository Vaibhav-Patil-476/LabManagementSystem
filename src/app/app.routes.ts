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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/profile/profile.component').then(
        m => m.ProfilePage
      )
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then(
        m => m.LoginPage
      )
  },

  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then(
        m => m.DashboardPage
      )
  },

  {
    path: 'add-patient',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/add-patient/add-patient.page').then(
        m => m.AddPatientComponent
      )
  },

  {
    path: 'booking-status',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/booking-status/booking-status.page').then(
        m => m.BookingStatusPage
      )
  },

  {
    path: 'download-reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(
        m => m.DownloadReportsPage
      )
  },

  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/download-reports/download-reports.page').then(
        m => m.DownloadReportsPage
      )
  },

  {
    path: 'notification',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/notification/notification.page').then(
        m => m.NotificationsPage
      )
  },

  {
    path: 'cancel-test',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/cancel-test/cancel-test.page').then(
        m => m.CancelTestPage
      )
  },

  {
    path: 'clinical-history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/clinical-history/clinical-history.page').then(
        m => m.ClinicalHistoryPage
      )
  },

  {
    path: 'test-list',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/test-list/test-list.page').then(
        m => m.TestListPage
      )
  },

  {
    path: 'profile-list',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/profile-list/profile-list.page').then(
        m => m.ProfileListPage
      )
  },

  {
    path: '**',
    redirectTo: 'login'
  }
];