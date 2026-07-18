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
// hidden mat-form-field + calendar overlay) vaparला ahे, jenekarून
// donhi pages var eकach calendar UI/behaviour disеl.
//
// ✅ SEARCH-OVERRIDES-DATE FIX (this pass) — ADI problem: quickSearch
// FAKTA already-loaded `bookings` array var client-side filter karat
// hota, ani to array fromDate/toDate (default = AAJ) cha range madheच
// backend kadun yeत hota. Tyामुळे booking ID/name search kितीही barobar
// asली tarी, booking tya date-range cha baher aslyas result rikama
// disaycha (जरी booking exist karत असला तरी) — ha search cha bug nव्हता,
// FILTER-SCOPE cha bug hota.
//
// FIX: real industry apps (Swiggy/Zomato order-search, Gmail search)
// prмाणे — quickSearch madhe kahi type kela ki (debounced), date-filter
// TEMPORARILY BYPASS hoto ani wide-range fetch (SEARCH_START_DATE →
// tomorrow, moठा page-size) trigger hoto. Search box rikama kelyavar
// normal date-filtered view परत yeतो. Ha behaviour isSearchMode getter
// varून drive hoto — franchise-change sudhha search-aware ahे.
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
  private searchDataset: ReportBookingRow[] = [];
  private filteredDataset: ReportBookingRow[] = [];
  private hasSearchLoaded = false;
  private autoTabSwitched = false;
  private currentPage = 0;
  private readonly pageSize = 200;
  hasMore = false;
  totalBookingsFromServer: number = 0;

  // ✅ Search-mode cha wide-range fetch sathi — booking kितीही जुनी asли
  // tarी search la disावी mhanून far mागe cha lower-bound date. Upper
  // bound nehmi "tomorrow" (aajchi booking sudhha yaवी).
  private readonly SEARCH_START_DATE = '2015-01-01';
  private readonly SEARCH_PAGE_SIZE = 500;
  private searchDebounceTimer: any = null;
  private readonly SEARCH_DEBOUNCE_MS = 400;

  get isSearchMode(): boolean {
    return this.quickSearch.trim().length > 0;
  }

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
  private autoSwitchTab() {

    if (this.autoTabSwitched)
      return;

    const order: ReportTabKey[] = [
      'COMPLETE',
      'CLINICAL',
      'PARTIALLY_COMPLETE',
      'PENDING',
      'SNR'
    ];

    const counts: Record<ReportTabKey, number> = {
      COMPLETE: 0,
      CLINICAL: 0,
      PARTIALLY_COMPLETE: 0,
      PENDING: 0,
      SNR: 0
    };

    this.filteredDataset.forEach(r => counts[r.bucket]++);

    if (counts[this.activeTab] === 0) {

      const tab = order.find(x => counts[x] > 0);

      if (tab) {
        this.activeTab = tab;
      }

    }

    this.autoTabSwitched = true;

  }
  ngOnInit() {
    this.loadFranchises();
    this.loadData();
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

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

  // ================= QUICK SEARCH (date-filter override) =================
  // ✅ Ha wach fix cha core ahe. Search box madhe type kela ki, debounce
  // nantar isSearchMode true asel tar wide-range fetch (runSearch()),
  // nahitar normal date-filtered loadData() call hoto.
  onQuickSearchChange() {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      if (this.isSearchMode) {
        this.runSearch();
      } else {

        this.quickSearch = '';

        this.filteredDataset = [];

        this.searchDataset = [];

        this.hasSearchLoaded = false;

        this.autoTabSwitched = false;

        this.selectedIds.clear();

        this.loadData();

      }
    }, this.SEARCH_DEBOUNCE_MS);
  }

  // ✅ Search active astana date-filter cha ऐवजी wide range (2015 →
  // tomorrow) backend la pathvतो, jenekarून booking kितीही जुनी/नवीन
  // asली tarी ID/name/barcode search la sapadel. Page-size mोठा (500)
  // eकच batch madhे — load-more disable rahto search-mode madhе.
  private runSearch(): void {

    this.autoTabSwitched = false;

    // First search -> API
    if (!this.hasSearchLoaded) {

      this.isLoading = true;

      const labId = this.authService.labId;
      const searchEndDate = this.addOneDay(this.todayIso());

      this.labApi.getBookingStatusNew(
        labId,
        0,
        this.SEARCH_PAGE_SIZE,
        this.SEARCH_START_DATE,
        searchEndDate,
        this.franchiseId || undefined
      ).subscribe({

        next: (res: any) => {

          this.ngZone.run(() => {

            let rows: ReportBookingRow[] = (res?.content ?? res ?? [])
              .map((r: any): ReportBookingRow => this.mapToRow(r));

            if (this.roleService.isStaff) {
              rows = rows.filter((r: ReportBookingRow) =>
                r.createdBy === this.authService.userId
              );
            }

            this.searchDataset = rows;
            this.hasSearchLoaded = true;

            this.applySearchFilter();

            this.isLoading = false;

          });

        },

        error: () => {
          this.isLoading = false;
        }

      });

      return;
    }

    // Next search -> local only
    this.applySearchFilter();
  }

  // ================= DATA LOADING (fresh call, no cache carried over) =================
  loadData() {

    this.hasSearchLoaded = false;

    this.searchDataset = [];

    this.filteredDataset = [];

    this.autoTabSwitched = false;

    this.selectedIds.clear();

    this.bookings = [];

    this.currentPage = 0;

    this.hasMore = false;

    this.activeTab = 'COMPLETE';

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

          // ✅ backend cha totalPages field reliable nahi (kधी undefined,
          // kधी chukicha) — mhanun "mangitlela pageSize tevdhach data
          // aala ka" ha signal vaparला, totalPages var avlambun nahi.
          this.hasMore = rawList.length === this.pageSize;

          // ✅ server cha khara total (totalElements) capture kela —
          // "Total Bookings" ha loaded rows peksha vegla, actual total
          // dakhavel.
          this.totalBookingsFromServer = res?.totalElements ?? res?.totalCount ?? this.bookings.length;
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
    // ✅ Search active astana date-filter la kahihi effect nahi — search
    // already wide-range var chalto. Ha guard confusing double-fetch
    // टाळतो.
    if (this.isSearchMode) return;
    this.loadData();
  }

  onFranchiseChange(id: any) {
    this.franchiseId = id;
    if (this.isSearchMode) {
      this.runSearch();
    } else {
      this.loadData();
    }
  }

  reportsFraction(item: ReportBookingRow): string {
    const total = item.tests.length;
    const done = item.tests.filter(t => (t.status || '').toLowerCase().includes('complete') || (t.status || '').toLowerCase().includes('ready')).length;
    return `${done}/${total}`;
  }

  reportsComplete(item: ReportBookingRow): boolean {
    return item.bucket === 'COMPLETE';
  }

  get rowsForActiveTab(): ReportBookingRow[] {

    const source = this.isSearchMode
      ? this.filteredDataset
      : this.bookings;

    return source.filter(r => r.bucket === this.activeTab);

  }

get totalBookings(): number {

    return this.isSearchMode
      ? this.filteredDataset.length
      : this.totalBookingsFromServer;

  }

  get bucketCount() {

    const counts: Record<ReportTabKey, number> = {
      COMPLETE: 0,
      CLINICAL: 0,
      PARTIALLY_COMPLETE: 0,
      PENDING: 0,
      SNR: 0
    };

    const source = this.isSearchMode
      ? this.filteredDataset
      : this.bookings;

    for (const row of source) {
      counts[row.bucket]++;
    }

    return counts;
  }
  setTab(tab: ReportTabKey) {

    this.activeTab = tab;

    this.autoTabSwitched = true;

    this.selectedIds.clear();

  }

  getTests(item: ReportBookingRow): string {
    return item.tests.map(t => t.name).join(', ') || '-';
  }

  // ================= ROLE GATES =================
  get canShowDownloadControls(): boolean {

    return this.roleService.canDownloadReports &&
      this.activeTab === 'COMPLETE';

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

    try {
      const bookingIds = selected.map(r => Number(r.bookingId));

      const res: any = await firstValueFrom(
        this.labApi.generatePdfReport(bookingIds, {
          single: bookingIds.length === 1
        })
      );

      if (res?.success && res?.downloadUrl) {
        window.open(res.downloadUrl, '_blank');
        this.toast.success('Success', `${bookingIds.length} report(s) ready`);
        this.selectedIds.clear();
      } else {
        this.toast.error('Error', res?.message || 'PDF generate karta aala nahi');
      }
    } catch (err) {
      console.error('PDF generation failed', err);
      this.toast.error('Error', 'PDF generate karnyat error aali, punha try kara');
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

  private applySearchFilter(): void {

    const q = this.quickSearch.trim().toLowerCase();

    // Search cleared
    if (!q) {
      this.filteredDataset = [];
      this.autoTabSwitched = false;
      this.selectedIds.clear();
      return;
    }

    const numeric = /^\d+$/.test(q);

    this.filteredDataset = this.searchDataset.filter(r => {

      if (numeric) {
        return (
          String(r.bookingId) === q ||
          String(r.patientId ?? '') === q
        );
      }

      return (
        r.name.toLowerCase().includes(q) ||
        String(r.bookingId).includes(q) ||
        String(r.patientId ?? '').includes(q) ||
        r.tests.some(t =>
          t.name.toLowerCase().includes(q)
        ) ||
        r.barcodes.some(b =>
          b.toLowerCase().includes(q)
        )
      );

    });

    this.selectedIds.clear();

    this.autoSwitchTab();
  }
}