import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonIcon, IonItem, IonLabel, IonList, IonMenu,
  IonMenuButton, IonProgressBar, MenuController
} from "@ionic/angular/standalone";
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Subscription, interval, forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StackedBarComponent } from '../../components/stacked-bar/stacked-bar.component';
import { addIcons } from "ionicons";
import {
  beakerOutline, calendarOutline, documentTextOutline, flaskOutline,
  logOutOutline, notificationsOutline, peopleOutline, personAddOutline,
  personCircleOutline, personOutline, shareSocialOutline, clipboardOutline,
  downloadOutline, listOutline, timeOutline
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
    CommonModule, FormsModule,
    IonContent, IonIcon, IonMenu, IonList, IonProgressBar,
    StackedBarComponent,
    MatDatepickerModule, MatFormFieldModule, MatInputModule,
    IonItem, IonLabel, IonMenuButton
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
  @ViewChild('datePicker') datePicker!: any;
  pickedDate: Date | null = null;
  loading = false;

  private loadInProgress = false;
  private refreshSub?: Subscription;
  private pollSub?: Subscription;

  get todayKey(): string {
    return this.toKey(new Date());
  }

  get todayBookingsCount(): number {
    return this.dailyBookings.find(d => d.dateKey === this.todayKey)?.bookings ?? 0;
  }

  get todayAmount(): number {
    return this.dailyBookings.find(d => d.dateKey === this.todayKey)?.amount ?? 0;
  }

  get todayKeyLabel(): string {
    return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get canViewCollection(): boolean {
    return this.roleService.isLabAdmin;
  }

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

    this.filterDate = this.toKey(new Date());
  }

  // ---------- lifecycle ----------
  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.refreshSub = this.bookingRefresh.refresh$.subscribe(() => this.initDashboard());
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
    this.pollSub = interval(15000).subscribe(() => this.loadDashboard(true));
  }

  // ---------- init ----------
  initDashboard() {
    if (this.loadInProgress) return;
    this.loadInProgress = true;
    this.loading = true;

    const existingUser = this.authService.currentUserValue;

    if (existingUser) {
      this.setUser(existingUser);
      this.loadDashboard();
    } else {
      this.authService.loadCurrentUser().subscribe({
        next: () => {
          this.setUser(this.authService.currentUserValue);
          this.loadDashboard();
        },
        error: (err) => {
          this.loading = false;
          this.loadInProgress = false;
          console.log('CURRENT USER ERROR:', err);
          this.toastService.error('Error', 'Failed to load user info');
        }
      });
    }
  }

  private setUser(currentUser: any) {
    this.user = {
      name: currentUser?.raw?.username ?? '',
      email: currentUser?.raw?.email ?? '',
      role: this.roleService.currentRole
    };
  }

  // ---------- date helpers ----------
  private formatDateParam(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  private nextDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateParam(d);
  }

  private toDateObj(dateStr: string): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00');
  }

  toKey(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  // ---------- date picker ----------
  openDatePicker() {
    this.pickedDate = this.toDateObj(this.filterDate);
    this.datePicker?.open();
  }

  onPickedDateChange(event: any) {
    const d: Date | null = event?.value || null;
    if (!d) return;
    this.filterDate = this.toKey(d);
    this.onDateChange();
  }

  onDateChange() {
    this.loadDashboard();
  }

  resetToToday() {
    this.filterDate = this.toKey(new Date());
    this.onDateChange();
  }

  // ---------- data fetch: rolling window (staff role) ----------
  private fetchBookingsForWindow(daysBack: number = 5): Observable<any[]> {
    const labId = this.authService.currentUserValue?.raw?.labId;
    const today = new Date();

    const dayRanges = Array.from({ length: daysBack }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = this.formatDateParam(d);
      return { start: dateStr, end: this.nextDay(dateStr) };
    });

    const PAGE_SIZE = 200;
    const calls = dayRanges.map(r => this.labApi.getBookingStatusNew(labId, 0, PAGE_SIZE, r.start, r.end));

    return forkJoin(calls).pipe(
      map((pages: any[]) => {
        let all: any[] = [];
        for (const pageRes of pages) all = all.concat(pageRes?.content || pageRes || []);
        return all;
      })
    );
  }

  // ---------- main load ----------
  loadDashboard(silent: boolean = false) {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const today = new Date();

    if (this.roleService.isFullAccess) {
      this.loadFullAccessDashboard(labId, today, silent);
    } else {
      this.loadStaffDashboard(currentUser, labId, silent);
    }
  }

  private loadFullAccessDashboard(labId: any, today: Date, silent: boolean) {
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
        this.loadInProgress = false;

        this.totalBookings = selected.totalBookingsCount || 0;
        this.totalPatients = selected.totalBookingsCount || 0;

        const s = selected.samples?.[0];
        const totalReceived = Number(s?.received || 0);
        const totalPending = Number(s?.notReceived || 0);
        const totalOutSourced = Number(s?.outSourced || 0);
        const totalRejected = Number(s?.rejected || 0);
        this.totalSamples = totalReceived + totalPending + totalOutSourced + totalRejected;

        this.totalReports = selected.reports?.[0]?.completed || 0;

        this.dailyBookings = days.map((d, idx) => {
          const resp: any = daily[idx];
          const smp = resp.samples?.[0];

          const received = Number(smp?.received || 0);
          const pending = Number(smp?.notReceived || 0);
          const outSourced = Number(smp?.outSourced || 0);
          const rejected = Number(smp?.rejected || 0);

          return {
            dateKey: d.key,
            date: d.display.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            bookings: resp.totalBookingsCount || 0,
            samples: received + pending + outSourced + rejected,
            received, pending, outSourced, rejected,
            amount: Number(resp.totalPaid || 0)
          };
        });

        this.rawBookings = [];
      },
      error: (err) => {
        this.loading = false;
        this.loadInProgress = false;
        if (!silent) {
          console.log('DASHBOARD SUMMARY ERROR:', err);
          this.toastService.error('Error', 'Failed to load dashboard data');
        }
      }
    });
  }

  private loadStaffDashboard(currentUser: any, labId: any, silent: boolean) {
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;

    const selectedStart = this.filterDate;
    const selectedEnd = this.nextDay(this.filterDate);

    forkJoin({
      reportCount: this.labApi.getReportCount(labId, selectedStart, selectedEnd, currentUserId),
      selectedDayBookings: this.labApi.getBookingStatusNew(labId, 0, 500, selectedStart, selectedEnd),
      rollingWindowBookings: this.fetchBookingsForWindow(5)
    }).subscribe({
      next: ({ reportCount, selectedDayBookings, rollingWindowBookings }: any) => {
        this.loading = false;
        this.loadInProgress = false;

        this.totalReports = (reportCount?.completecount || 0) + (reportCount?.partiallycomplete || 0);

        const applyOverrideFilter = (list: any[]) => (list || []).filter((p: any) => {
          const usernameMatch = !!currentUsername && p.user?.username === currentUsername;
          const idMatch = !!currentUserId && p.createdBy === currentUserId;
          return usernameMatch || idMatch;
        });

        const selectedContent = selectedDayBookings?.content || selectedDayBookings || [];
        const selectedFiltered = applyOverrideFilter(selectedContent);

        this.totalPatients = selectedFiltered.length;
        this.totalBookings = selectedFiltered.length;
        this.totalSamples = selectedFiltered.reduce((sum: number, p: any) => sum + (p.tests ? p.tests.length : 0), 0);

        this.rawBookings = applyOverrideFilter(rollingWindowBookings);
        this.prepareDailyBookings();
      },
      error: (err) => {
        this.loading = false;
        this.loadInProgress = false;
        if (!silent) {
          console.log('DASHBOARD STAFF ERROR:', err);
          this.toastService.error('Error', 'Failed to load dashboard data');
        }
      }
    });
  }

  prepareDailyBookings() {
    const grouped: any = {};

    this.rawBookings.forEach((p: any) => {
      const rawDate = p.createdOn || p.bookingDate || p.date;
      let d: Date = rawDate
        ? (typeof rawDate === 'number' ? new Date(rawDate) : this.parseDate(rawDate))
        : new Date();

      if (isNaN(d.getTime())) d = new Date();

      const key = this.toKey(d);

      if (!grouped[key]) {
        grouped[key] = {
          dateKey: key,
          date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          bookings: 0, samples: 0, received: 0, pending: 0, rejected: 0, tests: 0, amount: 0
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

  // ---------- navigation ----------
  goToPage(page: string) {
    this.menuCtrl.close();
    this.router.navigate(['/' + page]);
  }

  goToProfile() {
    this.menuCtrl.close();
    this.router.navigate(['/profile']);
  }

  goToNotifications() {
    this.router.navigate(['/notification']);
  }

  logout() {
    this.menuCtrl.close();
    this.pollSub?.unsubscribe();
    this.authService.logout();
    window.location.href = '/login';
  }
}