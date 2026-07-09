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
import { Subscription, interval, forkJoin } from 'rxjs';

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
import { RoleService } from '../../services/role';

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

  // ✅ CHANGED — filterDate ata KADHIHI empty rahat nahi. Default
  // "aaj cha date" ahे. Clear button kadhला — tyामुळे "all data"
  // cha heavy/hang karnara query kadhihi trigger hoत nahi.
  filterDate: string = '';

  loading = false;

  get isTopAdmin(): boolean {
    return this.roleService.isLabSideUI;
  }

  get hideAmounts(): boolean {
    return this.roleService.isFranchiseSide;
  }

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
    private roleService: RoleService
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

    // ✅ ADDED — default filterDate = आजचा date (yyyy-mm-dd), input box
    // madhे hach current date pहिल्यांदाच dिसेल.
    this.filterDate = this.toKey(new Date());
  }

  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.initDashboard();

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

  private formatDateParam(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  private nextDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateParam(d);
  }

  // ==========================
  // ✅ FINAL FIX
  // Admin (isFullAccess): fast pre-aggregated endpoint
  // (/dashboard/patients/new) vaparतो — top cards `filterDate`
  // (default aaj) cha data dakhavतात, ani "Daily Bookings" list
  // NEHMI last 5 calendar days cha (filter shivाय) — dogही
  // parallel madhे, size-limit cha bhog nahi, hang होत nahi.
  //
  // Staff/Franchise: per-user data confirm nahi ha fast endpoint
  // deto ka, tyामुळे जुनाच getAllBookings() (size=150, sort desc)
  // + client-side filterDate filter vaparला ahे — filterDate
  // kadhihi empty nasल्यामुळे "all data" cha heavy scenario
  // kधीच trigger hoत nahi.
  // ==========================
  loadDashboard(silent: boolean = false) {
    const labId = this.authService.currentUserValue?.raw?.labId;
    const today = new Date();

    if (this.roleService.isFullAccess) {

      const selectedStart = this.filterDate;
      const selectedEnd = this.nextDay(this.filterDate);

      const days = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = this.formatDateParam(d);
        return { key: dateStr, dateStr, nextStr: this.nextDay(dateStr), display: d };
      });

      forkJoin({
        selected: this.labApi.getDashboardSummary(labId, selectedStart, selectedEnd),
        daily: forkJoin(days.map(d => this.labApi.getDashboardSummary(labId, d.dateStr, d.nextStr)))
      }).subscribe({
        next: ({ selected, daily }: any) => {
          this.loading = false;

          this.totalBookings = selected.totalBookingsCount || 0;
          this.totalPatients = selected.totalBookingsCount || 0;

          const s = selected.samples?.[0];
          this.totalSamples = (s?.received || 0) + (s?.notReceived || 0) + (s?.outSourced || 0);

          const r = selected.reports?.[0];
          this.totalReports = r?.completed || 0;

          this.dailyBookings = days.map((d, idx) => {
            const resp: any = daily[idx];
            const smp = resp.samples?.[0];
            return {
              dateKey: d.key,
              date: d.display.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
              bookings: resp.totalBookingsCount || 0,
              samples: (smp?.received || 0) + (smp?.notReceived || 0) + (smp?.outSourced || 0),
              received: smp?.received || 0,
              pending: smp?.notReceived || 0,
              rejected: 0,
              amount: resp.totalPaid || 0
            };
          });

          this.rawBookings = [];
        },
        error: (err) => {
          this.loading = false;
          if (!silent) {
            console.log('DASHBOARD SUMMARY ERROR:', err);
            this.toastService.error('Error', 'Failed to load dashboard data');
          }
        }
      });

    } else {

      this.labApi.getAllBookings().subscribe({
        next: (res: any) => {
          this.loading = false;

          const allData = res?.content || res || [];
          const currentUser = this.authService.currentUserValue;
          const currentUsername = currentUser?.raw?.username;
          const currentUserId = currentUser?.raw?.id;

          let overrideMap: any = {};
          try {
            const raw = localStorage.getItem('bookingCreatorOverride');
            overrideMap = raw ? JSON.parse(raw) : {};
          } catch (e) {
            overrideMap = {};
          }

          this.rawBookings = allData.filter((p: any) => {
            const overrideUsername = overrideMap[p.bookingId];
            if (overrideUsername) return overrideUsername === currentUsername;
            const usernameMatch = !!currentUsername && p.user?.username === currentUsername;
            const idMatch = !!currentUserId && p.createdBy === currentUserId;
            return usernameMatch || idMatch;
          });

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
  }

  // ✅ CHANGED — Staff sathi filterDate ata KADHIHI empty nasel,
  // tyामुळे "if (this.filterDate)" cha empty/all-data path
  // effectively kधीच hit hoत nahi — pण safety sathi filter tसाच.
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
    // ✅ CHANGED — date badalli ki fresh data mागाव (admin sathi
    // navीन API call, staff sathi already-fetched rawBookings
    // varun re-calculate)
    if (this.roleService.isFullAccess) {
      this.loadDashboard();
    } else {
      this.calculateStats();
    }
  }

  // ✅ CHANGED — "Clear" ata data empty/all karत nahi, tर seedha
  // aajच्या date var परत nेतो (safe default).
  resetToToday() {
    this.filterDate = this.toKey(new Date());
    this.onDateChange();
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