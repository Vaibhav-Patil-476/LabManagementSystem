import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonCheckbox, IonSpinner,
  IonSelect, IonSelectOption
} from '@ionic/angular/standalone';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { addIcons } from 'ionicons';
import {
  downloadOutline, documentTextOutline, checkmarkDoneOutline,
  refreshOutline, timeOutline, alertCircleOutline, flaskOutline, searchOutline,
  businessOutline, calendarOutline, calendarClearOutline, informationCircleOutline
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { LabApiService } from '../../services/lab-api';
import { AuthService } from '../../services/auth';
import { RoleService } from '../../services/role';
import { ToastService } from '../../services/toast';

// ---------------------------------------------------------------------------
// ✅ REWRITE — booking-status page cha (proven, reliable) pattern vaparला:
// backend cha /report/all/{labId}?reportStatus=X param आधीच confirm झालं
// आहे ki तो काम करत नाहीये (COMPLETE tab madhе PENDING bookings yayचे,
// sगळ्या tabs madhे same data). Booking-status page ha problem आधीच
// टाळतो कारण tो कधीच backend status-filter var bharosा थेवत nahi —
// फक्त date+franchise backend कडून घेतो, status pratyek booking sathी
// tyacha tests cha statuses varून CLIENT-SIDE स्वतः काढतो.
//
// Ha page ata तेच exact karto: eकच call (getBookingStatusNew — booking
// status page वापरतो तोच fast/reliable endpoint), ani sगळे 5 buckets
// (COMPLETE/CLINICAL/PARTIALLY_COMPLETE/PENDING/SNR) client-side derive
// hotात. No localStorage kुठेही — फक्त in-memory (`bookings` array),
// component destroy झाल्यावर nिघून जातो.
//
// ✅ FILTER-BAR REWRITE (this pass) — franchise dropdown ata plain
// native <select> nahi, booking-status sarkhाच ion-select
// (interface="popover") ahе. Date range ata donhi native
// <input type="date"> nahi — booking-status page cha Angular Material
// mat-date-range-picker cha exact tach pattern (single trigger button +
// hidden mat-form-field + calendar overlay) vaparला ahе, jenekarून
// donhi pages var eकach calendar UI/behaviour disеl.
// ---------------------------------------------------------------------------
export type ReportTabKey = 'COMPLETE' | 'CLINICAL' | 'PARTIALLY_COMPLETE' | 'PENDING' | 'SNR';

export interface ReportTestRow {
  name: string;
  status: string;
  testCode?: string;
}

export interface ReportBookingRow {
  bookingId: number | string;
  patientId?: string;
  title?: string;
  name: string;
  genderAge?: string;
  barcodes: string[];
  doctorName?: string;
  sampleCount: number;
  tests: ReportTestRow[];
  bookingDate?: string;
  createdBy?: number;
  reportId?: number;
  remark?: string;
  file?: string;            // reportUrl — S3 PDF link, null jopryant report generate hot nahi
  bucket: ReportTabKey;      // ✅ client-side derived, backend cha reportStatus var bharosa nahi
}

@Component({
  selector: 'app-download-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonCheckbox, IonSpinner,
    IonSelect, IonSelectOption,
    MatDatepickerModule, MatFormFieldModule, MatInputModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './download-reports.page.html',
  styleUrls: ['./download-reports.page.scss']
})
export class DownloadReportsPage implements OnInit, OnDestroy {

  readonly tabs: { key: ReportTabKey; label: string; badgeClass: string }[] = [
    { key: 'COMPLETE', label: 'Complete', badgeClass: 'badge-complete' },
    { key: 'CLINICAL', label: 'Clinical', badgeClass: 'badge-clinical' },
    { key: 'PARTIALLY_COMPLETE', label: 'Partially Complete', badgeClass: 'badge-partial' },
    { key: 'PENDING', label: 'Pending', badgeClass: 'badge-pending' },
    { key: 'SNR', label: 'SNR', badgeClass: 'badge-snr' },
  ];

  activeTab: ReportTabKey = 'COMPLETE';
  fromDate: string = this.todayIso();
  toDate: string = this.todayIso();
  quickSearch = '';
  franchiseId: any = null;
  franchises: any[] = [];

  isLoading = false;
  isLoadingMore = false;
  isGenerating = false;

  selectedIds = new Set<string>();

  // ✅ Sगळा data eकच array madhे (in-memory only, localStorage nahi).
  // currentPage/hasMore booking-status page cha pattern.
  private bookings: ReportBookingRow[] = [];
  private currentPage = 0;
  private readonly pageSize = 200;
  hasMore = false;

  // ✅ Material date-range-picker cha state — booking-status page cha
  // exact tach pattern. fromDate/toDate ('YYYY-MM-DD' strings) hेच
  // loadData() vaparto, tyामुळे ha layer फक्त UI साठी convert-karto.
  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  constructor(
    private labApi: LabApiService,
    private authService: AuthService,
    public roleService: RoleService,
    private toast: ToastService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      downloadOutline, documentTextOutline, checkmarkDoneOutline,
      refreshOutline, timeOutline, alertCircleOutline, flaskOutline, searchOutline,
      businessOutline, calendarOutline, calendarClearOutline, informationCircleOutline
    });
  }

  ngOnInit() {
    this.loadFranchises();
    this.loadData();
  }

  ngOnDestroy() { }

  private formatDateForInput(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // booking-status page cha addOneDay logic — endDate exclusive kartो
  // jenekarून "toDate" cha divास पण data yईल.
  private addOneDay(dateStr: string): string {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateForInput(d);
  }

  // ================= FRANCHISE DROPDOWN DATA =================
  private loadFranchises() {
    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.franchises = res?.content || res || [];
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.franchises = [];
        });
      }
    });
  }

  // ================= MATERIAL DATE-RANGE-PICKER =================
  private toDateObj(dateStr: string): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00');
  }

  private toDateStr(d: Date | null): string {
    if (!d) return '';
    return this.formatDateForInput(d);
  }

  openDateRangePicker() {
    this.rangeStart = this.toDateObj(this.fromDate);
    this.rangeEnd = this.toDateObj(this.toDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any) {
    this.rangeStart = event?.value || null;
  }

  onRangeEndChange(event: any) {
    this.rangeEnd = event?.value || null;
    // ✅ donhi dates select झाल्यावर, filters apply karून list reload.
    if (this.rangeStart && this.rangeEnd) {
      this.fromDate = this.toDateStr(this.rangeStart);
      this.toDate = this.toDateStr(this.rangeEnd);
      this.onDateRangeChange();
    }
  }

  // ================= DATA LOADING (fresh call, no cache carried over) =================
  loadData() {
    this.selectedIds.clear();
    this.bookings = [];
    this.currentPage = 0;
    this.hasMore = false;
    this.fetchPage();
  }

  loadMore() {
    if (!this.hasMore || this.isLoadingMore) return;
    this.currentPage++;
    this.fetchPage(true);
  }

  private fetchPage(isLoadMore: boolean = false) {
    if (isLoadMore) this.isLoadingMore = true; else this.isLoading = true;

    const labId = this.authService.labId;
    const endDateExclusive = this.addOneDay(this.toDate);

    this.labApi.getBookingStatusNew(
      labId,
      this.currentPage,
      this.pageSize,
      this.fromDate,
      endDateExclusive,
      this.franchiseId || undefined
    ).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          const list = res?.content ?? res ?? [];
          const rawList: any[] = Array.isArray(list) ? list : [];

          let rows = rawList.map((raw: any) => this.mapToRow(raw));

          if (this.roleService.isStaff) {
            const currentUserId = this.authService.userId;
            rows = rows.filter(r => r.createdBy === currentUserId);
          }

          this.bookings = isLoadMore ? [...this.bookings, ...rows] : rows;

          const totalPages = res?.totalPages ?? 1;
          this.hasMore = this.currentPage < totalPages - 1;

          this.isLoading = false;
          this.isLoadingMore = false;
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.error('Failed to load bookings', err);
        this.ngZone.run(() => {
          this.toast.error('Error', 'Data load houu shakla nahi, punha try kara');
          this.isLoading = false;
          this.isLoadingMore = false;
        });
      }
    });
  }

  // Raw booking object -> display row + bucket. Raw shape booking-status
  // page cha mapBookingItem() sarkhाच ahे (bookingWithTestMappings,
  // sampleAccessions, franchiseName, doctorName, reportUrl — spread
  // varून raw madhून थेट).
  private mapToRow(raw: any): ReportBookingRow {
    const rawTestMappings = (raw.bookingWithTestMappings || []).filter((t: any) => !!t.testName);

    const tests: ReportTestRow[] = rawTestMappings.map((t: any) => ({
      name: (t.testName || '').trim(),
      status: t.reportStatus || 'pending',
      testCode: t.testCode
    }));

    const seenBarcodes = new Set<string>();
    const barcodes: string[] = [];
    (raw.sampleAccessions || []).forEach((s: any) => {
      const barcode = s.barCode || s.barcode;
      if (!barcode || seenBarcodes.has(barcode)) return;
      seenBarcodes.add(barcode);
      const sampleType = s.sampleTypeData?.sample_type || s.sampleType;
      barcodes.push(sampleType ? `${barcode} - ${sampleType}` : barcode);
    });

    const doctorName = raw.doctorName || raw.doctor?.doctor_name || 'self';
    const franchiseName = raw.franchiseName || raw.franchise?.franchiseName || 'SELF';

    return {
      bookingId: raw.bookingId,
      patientId: raw.patientId,
      title: raw.title,
      name: raw.customerName || '-',
      genderAge: raw.gender && raw.age ? `${raw.gender}/${raw.age}` : undefined,
      barcodes,
      doctorName: `(${franchiseName}) / Dr. ${doctorName}`,
      sampleCount: barcodes.length || tests.length,
      tests,
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : undefined,
      createdBy: raw.createdBy,
      reportId: rawTestMappings.find((t: any) => !!t.reportId)?.reportId,
      remark: raw.remark,
      file: raw.reportUrl || raw.pdfUrl || raw.file || raw.fileUrl,
      bucket: this.deriveBucket(tests)
    };
  }

  // ✅ booking-status page cha testStatusLabel()/overallReportStatus
  // logic cha 5-bucket version. Sगळे precedence (complete > snr >
  // partially-complete > pending) tyाच casing-insensitive pattern
  // vaparतो jो booking-status page madhे already काम करतोय.
  //
  // ⚠️ ASSUMPTION — "CLINICAL" status backend कडून kuठल्या exact
  // string madhे yeto he confirm nahi (booking-status page cha
  // testStatusLabel() madhे to bucket kधीच disत nahi). Jर kधी
  // CLINICAL tab रिकामाच राहिला तर backend cha raw t.reportStatus
  // value console.log करून खरं string confirm कर, mग ha check
  // update करू.
  private deriveBucket(tests: ReportTestRow[]): ReportTabKey {
    if (tests.length === 0) return 'PENDING';

    const statuses = tests.map(t => (t.status || '').toLowerCase());

    if (statuses.every(s => s.includes('complete') || s.includes('ready'))) return 'COMPLETE';
    if (statuses.some(s => s === 'snr')) return 'SNR';
    if (statuses.some(s => s.includes('clinical'))) return 'CLINICAL';
    if (statuses.some(s => s.includes('complete') || s.includes('ready'))) return 'PARTIALLY_COMPLETE';
    return 'PENDING';
  }

  onDateRangeChange() {
    this.loadData();
  }

  onFranchiseChange(id: any) {
    this.franchiseId = id;
    this.loadData();
  }

  reportsFraction(item: ReportBookingRow): string {
    const total = item.tests.length;
    const done = item.tests.filter(t => (t.status || '').toLowerCase().includes('complete') || (t.status || '').toLowerCase().includes('ready')).length;
    return `${done}/${total}`;
  }

  reportsComplete(item: ReportBookingRow): boolean {
    return item.bucket === 'COMPLETE';
  }

  // ================= TAB / TABLE HELPERS =================
  get rowsForActiveTab(): ReportBookingRow[] {
    const rows = this.bookings.filter(r => r.bucket === this.activeTab);
    const q = this.quickSearch.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter(r =>
      String(r.bookingId).toLowerCase().includes(q) ||
      (r.patientId || '').toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.barcodes.some(b => b.toLowerCase().includes(q))
    );
  }

  get totalBookings(): number {
    return this.bookings.length;
  }

  get bucketCount() {
    const counts: Record<ReportTabKey, number> = {
      COMPLETE: 0, CLINICAL: 0, PARTIALLY_COMPLETE: 0, PENDING: 0, SNR: 0
    };
    this.bookings.forEach(r => counts[r.bucket]++);
    return counts;
  }

  setTab(tab: ReportTabKey) {
    this.activeTab = tab;
    this.selectedIds.clear();
  }

  getTests(item: ReportBookingRow): string {
    return item.tests.map(t => t.name).join(', ') || '-';
  }

  // ================= ROLE GATES =================
  get canShowDownloadControls(): boolean {
    return this.roleService.canDownloadReports && this.activeTab === 'COMPLETE';
  }

  // ================= SELECTION (admin + Complete tab only) =================
  isSelected(item: ReportBookingRow): boolean {
    return this.selectedIds.has(String(item.bookingId));
  }

  toggleSelect(item: ReportBookingRow, checked: boolean) {
    if (!this.canShowDownloadControls) return;
    const id = String(item.bookingId);
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  get allSelected(): boolean {
    const rows = this.rowsForActiveTab;
    return rows.length > 0 && this.selectedIds.size === rows.length;
  }

  toggleSelectAll(checked: boolean) {
    if (!this.canShowDownloadControls) return;
    if (checked) {
      this.rowsForActiveTab.forEach(r => this.selectedIds.add(String(r.bookingId)));
    } else {
      this.selectedIds.clear();
    }
  }

  get selectedReports(): ReportBookingRow[] {
    return this.rowsForActiveTab.filter(r => this.selectedIds.has(String(r.bookingId)));
  }

  // ================= DOWNLOAD =================
  async downloadSelected() {
    if (!this.canShowDownloadControls) {
      this.toast.error('Not allowed', 'Download फक्त Admin ला, Complete tab वर उपलब्ध आहे');
      return;
    }

    const selected = this.selectedReports;

    if (selected.length === 0) {
      this.toast.warning('Warning', 'Kripya kimman ek report select kara');
      return;
    }

    this.isGenerating = true;
    let successCount = 0;

    try {
      for (const row of selected) {
        const bookingId = Number(row.bookingId);
        let fileUrl = row.file;

        if (!fileUrl) {
          try {
            const createRes: any = await firstValueFrom(this.labApi.createReport({ bookingId }));

            if (createRes && createRes.success === false) {
              this.toast.error('Error', `Booking ${bookingId}: ${createRes.message || 'report generate fail zala'}`);
              continue;
            }

            const fresh: any = await firstValueFrom(this.labApi.getSingleBooking(bookingId));
            fileUrl = fresh?.reportUrl || fresh?.pdfUrl || fresh?.reportPath || fresh?.file || fresh?.fileUrl;

            // ✅ in-memory row var pण navीn fileUrl update kर, jenekarून
            // list madhе परत lगेच dिसेल (परत सगळा data reload nahi करावं
            // lagत).
            const idx = this.bookings.findIndex(b => String(b.bookingId) === String(bookingId));
            if (idx !== -1 && fileUrl) this.bookings[idx].file = fileUrl;
          } catch (innerErr) {
            console.error('Report create/fetch fallback failed for booking', bookingId, innerErr);
          }
        }

        if (!fileUrl) {
          console.warn('report file sapadla nahi booking', bookingId);
          this.toast.error('Error', `Booking ${bookingId} cha report file sapadla nahi`);
          continue;
        }

        window.open(fileUrl, '_blank');
        successCount++;
      }

      if (successCount > 0) {
        this.toast.success('Success', `${successCount} report(s) ready`);
        this.selectedIds.clear();
      }
    } finally {
      this.isGenerating = false;
    }
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
  get hasMoreForActiveTab(): boolean {
    return this.hasMore;
  }

  loadMoreActiveTab(): void {
    this.loadMore();
  }
}