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
    path: 'franchise-management',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/franchise-management/franchise-management.page').then(
        m => m.FranchiseManagementPage
      )
  },

  {
    path: 'franchise',
    redirectTo: 'franchise-management',
    pathMatch: 'full'
  },

  // ============================================================
  // ACCOUNT section — ledger / wallet
  // ============================================================
  {
    path: 'ledger-search',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/account/ledger-search/ledger-search.page').then(
        m => m.LedgerSearchPage
      )
  },

  {
    path: 'account',
    redirectTo: 'ledger-search',
    pathMatch: 'full'
  },

  // ✅ MOVED above '**' — hyach mule aadhi login var redirect hot hota
{
  path: 'account-summary',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./pages/account/account-summary/account-summary.component').then(
      m => m.AccountSummaryComponent
    )
},
{
  path:'account-commission',
  canActivate:[authGuard],
  loadComponent:()=>
    import('./pages/account/commission-history/commission-history.component').then(
      m => m.CommissionHistoryPage
    )
},




  {
    path: '**',
    redirectTo: 'login'
  }
];