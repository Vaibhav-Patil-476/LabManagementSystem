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
import { Subscription, interval, forkJoin, of, EMPTY, Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

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

  filterDate: string = '';

  loading = false;

  private loadInProgress = false;

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

    this.filterDate = this.toKey(new Date());
  }

  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

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
      if (this.roleService.isFullAccess) {
        this.loadDashboard(true);
      } else {
        // staff: heavy re-fetch नको, local recalc + हलका report-count refresh
        this.calculateStats();
        this.prepareDailyBookings();
        this.refreshReportCountOnly();
      }
    });
  }

  initDashboard() {
    if (this.loadInProgress) return;
    this.loadInProgress = true;
    this.loading = true;

    const existingUser = this.authService.currentUserValue;

    if (existingUser) {
      // ✅ आधीच in-memory मध्ये आहे — परत /auth/current-user call नको
      this.user = {
        name: existingUser?.raw?.username ?? '',
        email: existingUser?.raw?.email ?? '',
        role: this.roleService.currentRole
      };
      this.loadDashboard();
    } else {
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
          this.loadInProgress = false;
          console.log('CURRENT USER ERROR:', err);
          this.toastService.error('Error', 'Failed to load user info');
        }
      });
    }
  }

  private formatDateParam(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  private nextDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateParam(d);
  }

  // ✅ UPDATED — आधी हा method sequential expand() वापरत होता,
  // म्हणजे page 0 चा response आल्याशिवाय page 1 ची call जायचीच नाही,
  // ...आणि तसंच पुढे. प्रत्येक extra page = एक पूर्ण round-trip
  // (network + auth interceptor + मोठा nested JSON payload).
  // त्यामुळे 4-5 sequential calls मिळून 4-5 सेकंद लागत होते,
  // जरी प्रत्येक call स्वतः ५६ms ची असली तरी.
  //
  // आता: पहिलं page आणतो (जे लागतंच — totalPages कळण्यासाठी),
  // मग उरलेली आवश्यक pages PARALLEL (forkJoin) मध्ये मागवतो.
  // MAX_ADDITIONAL_PAGES ही एक safety cap आहे जेणेकरून एखाद्या
  // admin कडे खूप जास्त data असेल तर आपण चुकून खूप pages parallel
  // मध्ये hit करून बसणार नाही. गरज पडली तर हा number वाढवता येईल.
  private fetchBookingsForWindow(createdBy: number, daysBack: number = 5): Observable<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    cutoff.setHours(0, 0, 0, 0);

    // ⚠️ NOTE: PAGE_SIZE आधी 100 केला होता, पण backend response मध्ये
    // प्रत्येक booking च्या आत पूर्ण nested object (tests, samples, bill,
    // transactions, franchise, doctor, user) येतोय — त्यामुळे size=100
    // म्हणजे 5.2 MB चा response (8+ सेकंद फक्त download/parse साठी).
    // जोपर्यंत backend कडून हलका list DTO मिळत नाही, तोपर्यंत PAGE_SIZE
    // छोटा ठेवणं हाच frontend कडून करता येणारा तात्पुरता उपाय आहे.
    const PAGE_SIZE = 20;
    const MAX_ADDITIONAL_PAGES = 4;     // ✅ safety cap — एकूण जास्तीत जास्त 5 pages (0..4)

    return this.labApi.getBookingsPage(createdBy, 0, PAGE_SIZE).pipe(
      switchMap((firstPage: any) => {
        const firstContent: any[] = firstPage?.content || [];
        const totalPages: number = firstPage?.totalPages ?? 1;
        const isLast = firstPage?.last === true || totalPages <= 1;

        const lastRecord = firstContent[firstContent.length - 1];
        const lastDate = lastRecord ? new Date(lastRecord.createdOn) : null;
        const stillInWindow = !!lastDate && lastDate >= cutoff;

        // पहिल्याच page मध्ये window cover झालं / आणखी pages नाहीत
        if (isLast || !stillInWindow || firstContent.length === 0) {
          return of(this.filterByWindow(firstContent, cutoff));
        }

        const pagesToFetch = Math.min(totalPages - 1, MAX_ADDITIONAL_PAGES);
        if (pagesToFetch <= 0) {
          return of(this.filterByWindow(firstContent, cutoff));
        }

        const remainingCalls = Array.from({ length: pagesToFetch }, (_, i) =>
          this.labApi.getBookingsPage(createdBy, i + 1, PAGE_SIZE)
        );

        // ✅ इथेच खरा fix आहे — या सगळ्या calls एकाच वेळी (parallel) जातात,
        // एकामागोमाग एक (sequential) नाही
        return forkJoin(remainingCalls).pipe(
          map((pages: any[]) => {
            let all = [...firstContent];
            for (const pageRes of pages) {
              all = all.concat(pageRes?.content || []);
            }
            return this.filterByWindow(all, cutoff);
          })
        );
      })
    );
  }

  private filterByWindow(records: any[], cutoff: Date): any[] {
    return records.filter((r: any) => {
      if (!r?.createdOn) return true;
      return new Date(r.createdOn) >= cutoff;
    });
  }

  loadDashboard(silent: boolean = false) {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
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
          this.loadInProgress = false;

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
          this.loadInProgress = false;
          if (!silent) {
            console.log('DASHBOARD SUMMARY ERROR:', err);
            this.toastService.error('Error', 'Failed to load dashboard data');
          }
        }
      });

    } else {

      // ================================
      // ✅ STAFF — hybrid: हलका report-count call + filtered/windowed booking fetch
      // ================================
      const currentUserId = currentUser?.raw?.id;
      const currentUsername = currentUser?.raw?.username;

      const selectedStart = this.filterDate;
      const selectedEnd = this.nextDay(this.filterDate);

      forkJoin({
        reportCount: this.labApi.getReportCount(labId, selectedStart, selectedEnd, currentUserId),
        bookings: this.fetchBookingsForWindow(currentUserId, 5)
      }).subscribe({
        next: ({ reportCount, bookings }: any) => {
          this.loading = false;
          this.loadInProgress = false;

          // ✅ reports count थेट backend कडून — कुठलाही heavy record न ओढता
          this.totalReports =
            (reportCount?.completecount || 0) + (reportCount?.partiallycomplete || 0);

          let overrideMap: any = {};
          try {
            const raw = localStorage.getItem('bookingCreatorOverride');
            overrideMap = raw ? JSON.parse(raw) : {};
          } catch (e) {
            overrideMap = {};
          }

          // safety-net filter (backend आधीच createdBy filter करतोय,
          // पण override-case साठी हे अजून लागतं)
          this.rawBookings = (bookings || []).filter((p: any) => {
            const overrideUsername = overrideMap[p.bookingId];
            if (overrideUsername) return overrideUsername === currentUsername;
            const usernameMatch = !!currentUsername && p.user?.username === currentUsername;
            const idMatch = !!currentUserId && p.createdBy === currentUserId;
            return usernameMatch || idMatch;
          });

          this.calculateStats();       // totalBookings/totalPatients/totalSamples (totalReports overwrite करत नाही)
          this.prepareDailyBookings(); // rawBookings मधूनच 5-दिवसांचा breakdown (आधीच fetch झालाय, नवीन call नाही)
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
  }

  // ✅ NEW — polling वर फक्त reports count refresh (हलका call),
  // booking records परत ओढायचे नाहीत
  private refreshReportCountOnly() {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const currentUserId = currentUser?.raw?.id;
    const selectedStart = this.filterDate;
    const selectedEnd = this.nextDay(this.filterDate);

    this.labApi.getReportCount(labId, selectedStart, selectedEnd, currentUserId).subscribe({
      next: (reportCount: any) => {
        this.totalReports =
          (reportCount?.completecount || 0) + (reportCount?.partiallycomplete || 0);
      },
      error: () => { /* silent — polling error टाळा */ }
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
    // ✅ totalReports इथे यापुढे set होत नाही — तो आता
    // getReportCount() API कडून येतो (loadDashboard / refreshReportCountOnly मध्ये)
    this.totalSamples = data.reduce((sum: number, p: any) => {
      return sum + (p.tests ? p.tests.length : 0);
    }, 0);
  }

  onDateChange() {
    if (this.roleService.isFullAccess) {
      this.loadDashboard();
    } else {
      this.calculateStats();
      this.prepareDailyBookings();
      this.refreshReportCountOnly();   // date बदलली की reports count पण नव्याने आणा
    }
  }

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