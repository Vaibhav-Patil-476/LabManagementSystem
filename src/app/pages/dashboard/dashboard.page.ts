import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonProgressBar,
  MenuController
} from "@ionic/angular/standalone";
import { Subscription, interval } from 'rxjs';

import { addIcons } from "ionicons";
import {
  beakerOutline,
  calendarOutline,
  documentTextOutline,
  flaskOutline,
  logOutOutline,
  notificationsOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  personOutline,
  shareSocialOutline,
  clipboardOutline,
  downloadOutline,
  listOutline,
  timeOutline
} from "ionicons/icons";

import { AuthService } from '../../services/auth';
import { LabApiService } from '../../services/lab-api';
import { ToastService } from '../../services/toast';
import { BookingRefreshService } from '../../services/booking-refresh';
import { RoleService } from '../../services/role';   // ✅ ADDED

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonMenu,
    IonList,
    IonItem,
    IonLabel,
    IonMenuButton,
    IonProgressBar
  ]
})
export class DashboardPage implements OnInit, OnDestroy {

  user: any = {};

  totalPatients = 0;
  totalBookings = 0;
  totalReports = 0;
  totalSamples = 0;

  rawBookings: any[] = [];
  dailyBookings: any[] = [];

  filterDate: string = '';
  loading = false;

  // ==========================
  // ✅ REMOVED — role constants ani manual role-check getters ata nahit.
  // Sagla role logic RoleService (central, enum-based) madhe aहे.
  // ==========================

  get isTopAdmin(): boolean {
    return this.roleService.isLabSideUI;
  }

  get hideAmounts(): boolean {
    return this.roleService.isFranchiseSide;
  }

  // ==========================
  // ✅ ADDED — "Aaj cha booking count" spotlight sathi.
  // dailyBookings madhun aajcha entry shodhun count/amount return karto.
  // ==========================
  get todayKey(): string {
    return this.toKey(new Date());
  }

  get todayBookingsCount(): number {
    const today = this.dailyBookings.find(d => d.dateKey === this.todayKey);
    return today ? today.bookings : 0;
  }

  get todayAmount(): number {
    const today = this.dailyBookings.find(d => d.dateKey === this.todayKey);
    return today ? today.amount : 0;
  }

  get todayKeyLabel(): string {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private refreshSub?: Subscription;
  private pollSub?: Subscription;

  constructor(
    private router: Router,
    private menuCtrl: MenuController,
    private authService: AuthService,
    private labApi: LabApiService,
    private toastService: ToastService,
    private bookingRefresh: BookingRefreshService,
    private roleService: RoleService   // ✅ ADDED
  ) {

    addIcons({
      'people-outline': peopleOutline,
      'flask-outline': flaskOutline,
      'document-text-outline': documentTextOutline,
      'calendar-outline': calendarOutline,
      'person-add-outline': personAddOutline,
      'share-social-outline': shareSocialOutline,
      'notifications-outline': notificationsOutline,
      'person-outline': personOutline,
      'person-circle-outline': personCircleOutline,
      'log-out-outline': logOutOutline,
      'beaker-outline': beakerOutline,
      'clipboard-outline': clipboardOutline,
      'download-outline': downloadOutline,
      'list-outline': listOutline,
      'time-outline': timeOutline
    });

  }

  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.initDashboard();

    // ✅ same-device/session var booking zalyavar instant refresh
    this.refreshSub = this.bookingRefresh.refresh$.subscribe(() => {
      this.initDashboard();
    });
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
    this.pollSub?.unsubscribe();
  }

  ionViewWillEnter() {
    this.initDashboard();
    this.startPolling();
  }

  ionViewWillLeave() {
    this.pollSub?.unsubscribe();
  }

  // ==========================
  // ✅ Dusऱ्या device/browser var (admin/staff vegle logged in) zalela
  // booking automatic disण्यासाठी polling. 15 sec ने silent auto-refresh.
  // ==========================
  private startPolling() {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(15000).subscribe(() => {
      this.loadDashboard(true);
    });
  }

  initDashboard() {
    this.loading = true;

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        const currentUser = this.authService.currentUserValue;

        this.user = {
          name: currentUser?.raw?.username ?? '',
          email: currentUser?.raw?.email ?? '',
          role: this.roleService.currentRole
        };

        this.loadDashboard();
      },
      error: (err) => {
        this.loading = false;
        console.log('CURRENT USER ERROR:', err);
        this.toastService.error('Error', 'Failed to load user info');
      }
    });
  }

// ==========================
// ✅ FIXED — DATA VISIBILITY फक्त Admin ला full access.
// Staff (lab-side असला तरी) फक्त स्वतःचा data बघेल.
// Admin cha data staff ला kadhihi disणार नाही.
// ==========================
loadDashboard(silent: boolean = false) {
  this.labApi.getAllBookings().subscribe({
    next: (res: any) => {
      this.loading = false;

      const allData = res?.content || res || [];
      const currentUsername = this.authService.currentUserValue?.raw?.username;

      if (this.roleService.isFullAccess) {
        // ✅ FAKTA Lab Admin -> sagla data (staff cha pan)
        this.rawBookings = allData;
      } else {
        // ✅ Staff / Franchise / Franchise-Staff -> FAKTA swतःचाच data
        this.rawBookings = currentUsername
          ? allData.filter((p: any) => p.user?.username === currentUsername)
          : [];
      }

      this.calculateStats();
      this.prepareDailyBookings();
    },
    error: (err) => {
      this.loading = false;
      if (!silent) {
        console.log('DASHBOARD BOOKINGS ERROR:', err);
        this.toastService.error('Error', 'Failed to load dashboard data');
      }
    }
  });
}

  calculateStats() {
    let data = this.rawBookings;

    if (this.filterDate) {
      data = this.rawBookings.filter((p: any) => {
        const rawDate = p.createdOn || p.bookingDate || p.date;
        if (!rawDate) return false;
        const d = typeof rawDate === 'number' ? new Date(rawDate) : this.parseDate(rawDate);
        return this.toKey(d) === this.filterDate;
      });
    }

    this.totalPatients = data.length;
    this.totalBookings = data.length;
    this.totalReports = data.filter((x: any) => x.reports && x.reports.length > 0).length;
    this.totalSamples = data.reduce((sum: number, p: any) => {
      return sum + (p.tests ? p.tests.length : 0);
    }, 0);
  }

  onDateChange() {
    this.calculateStats();
  }

  clearFilter() {
    this.filterDate = '';
    this.calculateStats();
  }

  goToPage(page: string) {
    this.menuCtrl.close();
    this.router.navigate(['/' + page]);
  }

  goToProfile() {
    this.menuCtrl.close();
    this.router.navigate(['/profile']);
  }

  logout() {
    this.menuCtrl.close();
    this.pollSub?.unsubscribe();
    this.authService.logout();
    window.location.href = '/login';
  }

  prepareDailyBookings() {
    const grouped: any = {};

    this.rawBookings.forEach((p: any) => {
      const rawDate = p.createdOn || p.bookingDate || p.date;

      let d: Date;

      if (rawDate) {
        d = typeof rawDate === 'number' ? new Date(rawDate) : this.parseDate(rawDate);
      } else {
        d = new Date();
      }

      if (isNaN(d.getTime())) {
        d = new Date();
      }

      const key = this.toKey(d);

      if (!grouped[key]) {
        grouped[key] = {
          dateKey: key,
          date: d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }),
          bookings: 0,
          samples: 0,
          received: 0,
          pending: 0,
          rejected: 0,
          tests: 0,
          amount: 0
        };
      }

      grouped[key].bookings++;

      const sampleCount = p.tests ? p.tests.length : 0;

      grouped[key].samples += sampleCount;
      grouped[key].tests += sampleCount;
      grouped[key].amount += Number(p.totalAmount || 0);

      if (p.samples && Array.isArray(p.samples)) {
        p.samples.forEach((sample: any) => {
          switch ((sample.status || '').toLowerCase()) {
            case 'received':
            case 'completed':
              grouped[key].received++;
              break;
            case 'rejected':
              grouped[key].rejected++;
              break;
            default:
              grouped[key].pending++;
              break;
          }
        });
      } else {
        grouped[key].pending += sampleCount;
      }
    });

    this.dailyBookings = Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(key => grouped[key])
      .slice(0, 5);
  }

  toKey(d: Date): string {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  parseDate(dateStr: string): Date {
    try {
      const datePart = dateStr.split(',')[0].trim();
      const parts = datePart.split('/');

      if (parts.length === 3) {
        const month = Number(parts[0]);
        const day = Number(parts[1]);
        const year = Number(parts[2]);
        return new Date(year, month - 1, day);
      }
    } catch (e) {
      console.error('Date parse error:', e);
    }
    return new Date(dateStr);
  }

  goToNotifications() {
    this.router.navigate(['/notification']);
  }
}