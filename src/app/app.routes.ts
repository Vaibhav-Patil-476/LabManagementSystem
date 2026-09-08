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

  // ✅ moved ABOVE the '**' wildcard — routes after '**' are unreachable
  {
    path: 'franchise-management',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/franchise-management/franchise-management.page').then(
        m => m.FranchiseManagementPage
      )
  },

  // ✅ alias — so goToPage('franchise') also works without changing the dashboard click handler
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

  

  // ✅ bottom-nav cha goToPage('account') hyach route la hit karto.
  // Ata temporarily ledger-search var alias kelay — pudhe ek separate
  // "Account hub" page (accordion: Ledger Search / Wallet Summary) banवायचं
  // asel tar tyala point kar, tovar he alias thevu shakto.
  {
    path: 'account',
    redirectTo: 'ledger-search',
    pathMatch: 'full'
  },

  // ✅ wildcard — EKACH, ani sagLyaat SHEVATI. Yachya khali kahihi
  // add kelas tar te kadhihi trigger honar nahi.
  {
    path: '**',
    redirectTo: 'login'
  },
  {
    path: 'payment-history',
    loadComponent: () => import('./pages/account/payment-history/payment-history.page').then( m => m.PaymentHistoryPage)
  },
  {
    path: 'commission-list',
    loadComponent: () => import('./pages/account/commission-list/commission-list.page').then( m => m.CommissionListPage)
  }
];