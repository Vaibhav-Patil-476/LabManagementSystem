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
  businessOutline, calendarOutline, calendarClearOutline, informationCircleOutline, qrCodeOutline
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { RoleService } from '../../core/services/role';
import { ToastService } from '../../core/services/toast';

export type ReportTabKey = 'ALL' | 'COMPLETE' | 'CLINICAL' | 'PARTIALLY_COMPLETE' | 'PENDING' | 'SNR' | 'CANCEL';

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
  file?: string;
  bucket?: ReportTabKey;   // 👈 add kara
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
    { key: 'ALL', label: 'All', badgeClass: 'badge-all' },
    { key: 'COMPLETE', label: 'Complete', badgeClass: 'badge-complete' },
    { key: 'CLINICAL', label: 'Clinical', badgeClass: 'badge-clinical' },
    { key: 'PARTIALLY_COMPLETE', label: 'Partially Complete', badgeClass: 'badge-partial' },
    { key: 'PENDING', label: 'Pending', badgeClass: 'badge-pending' },
    { key: 'SNR', label: 'SNR', badgeClass: 'badge-snr' },
    { key: 'CANCEL', label: 'Cancel', badgeClass: 'badge-cancel' },
  ];



  activeTab: ReportTabKey = 'COMPLETE';
  fromDate: string = this.todayIso();
  toDate: string = this.todayIso();
  quickSearch = '';
  franchiseId: any = null;
  franchises: any[] = [];
  franchiseSearchTerm = '';
  filteredFranchiseList: any[] = [];
  showFranchiseDropdown = false;
  isLoading = false;
  isLoadingMore = false;
  isGenerating = false;
  hasMore = false;
  totalBookingsFromServer = 0;
  expandedId: number | string | null = null;
  // ---------- Lab typeahead + add-lab modal ----------
  franchiseLabs: any[] = [];
  labSearchTerm = '';
  filteredLabList: any[] = [];
  showLabDropdown = false;

  isAddLabModalOpen = false;
  isSavingLab = false;
  newLabData = { labName: '', ownerName: '', mobileNumber: '', whatsappNumber: '', additionalDetails: '' };
  selectedIds = new Set<string>();

  private bookings: ReportBookingRow[] = [];
  private searchDataset: ReportBookingRow[] = [];
  private filteredDataset: ReportBookingRow[] = [];
  private hasSearchLoaded = false;
  private autoTabSwitched = false;
  private currentPage = 0;
  private readonly pageSize = 200;

  private readonly SEARCH_START_DATE = '2015-01-01';
  private readonly SEARCH_PAGE_SIZE = 500;
  private searchDebounceTimer: any = null;
  private readonly SEARCH_DEBOUNCE_MS = 400;

  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  get isSearchMode(): boolean {
    return this.quickSearch.trim().length > 0;
  }

  constructor(
    private labApi: LabApiService,
    public authService: AuthService,
    public roleService: RoleService,
    private toast: ToastService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,

  ) {
    addIcons({
      downloadOutline, documentTextOutline, checkmarkDoneOutline,
      refreshOutline, timeOutline, alertCircleOutline, flaskOutline, searchOutline,
      businessOutline, calendarOutline, calendarClearOutline, informationCircleOutline,
      qrCodeOutline
    });
  }

  // ---------- lifecycle ----------
  ngOnInit() {
    this.loadFilterFranchises();
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  // ---------- date helpers ----------
  private formatDateForInput(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private addOneDay(dateStr: string): string {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateForInput(d);
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private loadFilterFranchises(): void {
    const currentRole = this.authService?.role;
    const currentFranchiseId = this.authService?.franchiseId;
    const currentFranchiseName = this.authService?.franchiseName;

    const isFranchiseUser =
      currentRole === 'ROLE_FRANCHISE' ||
      currentRole === 'ROLE_FRANCHISE_STAFF';

    const canSearchAllFranchises =
      currentRole === 'ROLE_LAB_ADMIN' ||
      currentRole === 'ROLE_STAFF';

    this.labApi.getFranchises().subscribe({
      next: (res: any) => this.ngZone.run(() => {

        this.franchises = Array.isArray(res?.content)
          ? res.content
          : (Array.isArray(res) ? res : []);

        /*
         * =========================================================
         * FRANCHISE / FRANCHISE STAFF
         * =========================================================
         * स्वतःच्या franchise वरच filter locked राहील.
         */
        if (isFranchiseUser) {

          const matched = this.franchises.find((f: any) =>
            Number(f?.franchiseId) === Number(currentFranchiseId)
          );

          if (matched) {
            this.franchiseId = Number(matched.franchiseId);
            this.franchiseSearchTerm =
              matched.franchiseName ||
              currentFranchiseName ||
              '';
          } else if (
            currentFranchiseId !== null &&
            currentFranchiseId !== undefined &&
            Number(currentFranchiseId) > 0
          ) {
            this.franchiseId = Number(currentFranchiseId);
            this.franchiseSearchTerm = currentFranchiseName || '';
          } else {
            this.franchiseId = null;
            this.franchiseSearchTerm = '';
          }

          /*
           * =========================================================
           * LAB ADMIN / STAFF
           * =========================================================
           * All Franchises initially.
           * User franchise search करून specific franchise select करू शकतो.
           */
        } else if (canSearchAllFranchises) {

          this.franchiseId = null;
          this.franchiseSearchTerm = '';
          this.filteredFranchiseList = [];
          this.showFranchiseDropdown = false;

        } else {

          this.franchiseId = null;
          this.franchiseSearchTerm = '';

        }

        this.loadData();
        this.cdr.detectChanges();
      }),

      error: () => this.ngZone.run(() => {

        this.franchises = [];

        if (
          isFranchiseUser &&
          currentFranchiseId !== null &&
          currentFranchiseId !== undefined &&
          Number(currentFranchiseId) > 0
        ) {
          this.franchiseId = Number(currentFranchiseId);
          this.franchiseSearchTerm = currentFranchiseName || '';

        } else {
          this.franchiseId = null;
          this.franchiseSearchTerm = '';
        }

        this.loadData();
      })
    });
  }
  onFranchiseChange(id: any) {
    this.franchiseId = id;
    if (this.isSearchMode) this.runSearch();
    else this.loadData();
  }

  // ---------- date range picker ----------
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
    if (this.rangeStart && this.rangeEnd) {
      this.fromDate = this.toDateStr(this.rangeStart);
      this.toDate = this.toDateStr(this.rangeEnd);
      this.onDateRangeChange();
    }
  }

  onDateRangeChange() {
    if (this.isSearchMode) return;
    this.loadData();
  }

  // ---------- quick search ----------
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

  private runSearch(): void {
    this.autoTabSwitched = false;

    if (!this.hasSearchLoaded) {
      this.isLoading = true;
      const labId = this.authService.labId;
      const searchEndDate = this.addOneDay(this.todayIso());

      this.labApi.getBookingStatusNew(
        labId, 0, this.SEARCH_PAGE_SIZE, this.SEARCH_START_DATE, searchEndDate, this.franchiseId || undefined
      ).subscribe({
        next: (res: any) => this.ngZone.run(() => {
          let rows: ReportBookingRow[] = (res?.content ?? res ?? []).map((r: any) => this.mapToRow(r));

          if (this.roleService.isStaff) {
            rows = rows.filter(r => r.createdBy === this.authService.userId);
          }

          const seenIds = new Set<string>();
          this.searchDataset = rows.filter(r => {
            const key = String(r.bookingId);
            if (seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
          });
          this.hasSearchLoaded = true;
          this.applySearchFilter();
          this.isLoading = false;
        }),
        error: () => { this.isLoading = false; }
      });
      return;
    }

    this.applySearchFilter();
  }

  private applySearchFilter(): void {
    const q = this.quickSearch.trim().toLowerCase();

    if (!q) {
      this.filteredDataset = [];
      this.autoTabSwitched = false;
      this.selectedIds.clear();
      return;
    }

    const numeric = /^\d+$/.test(q);

    this.filteredDataset = this.searchDataset.filter(r => {
      if (numeric) {
        return String(r.bookingId) === q || String(r.patientId ?? '') === q;
      }
      return (
        r.name.toLowerCase().includes(q) ||
        String(r.bookingId).includes(q) ||
        String(r.patientId ?? '').includes(q) ||
        r.tests.some(t => t.name.toLowerCase().includes(q)) ||
        r.barcodes.some(b => b.toLowerCase().includes(q))
      );
    });

    this.selectedIds.clear();
    this.autoSwitchTab();
  }

  private autoSwitchTab() {
    if (this.autoTabSwitched) return;

    const order: ReportTabKey[] = ['ALL', 'COMPLETE', 'CLINICAL', 'PENDING', 'SNR', 'CANCEL'];
    const counts = this.bucketCount;

    if (counts[this.activeTab] === 0) {
      const tab = order.find(x => counts[x] > 0);
      if (tab) this.activeTab = tab;
    }

    this.autoTabSwitched = true;
  }

  // ---------- data loading ----------
  loadData() {
    this.hasSearchLoaded = false;
    this.searchDataset = [];
    this.filteredDataset = [];
    this.autoTabSwitched = false;
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

  loadMoreActiveTab(): void {
    this.loadMore();
  }

  private fetchPage(isLoadMore: boolean = false) {
    if (isLoadMore) this.isLoadingMore = true; else this.isLoading = true;

    const labId = this.authService.labId;
    const endDateExclusive = this.addOneDay(this.toDate);

    this.labApi.getBookingStatusNew(
      labId, this.currentPage, this.pageSize, this.fromDate, endDateExclusive, this.franchiseId || undefined
    ).subscribe({
      next: (res: any) => this.ngZone.run(() => {
        const rawList: any[] = Array.isArray(res?.content ?? res) ? (res?.content ?? res) : [];
        let rows = rawList.map((raw: any) => this.mapToRow(raw));

        if (this.roleService.isStaff) {
          const currentUserId = this.authService.userId;
          rows = rows.filter(r => r.createdBy === currentUserId);
        }

        const merged = isLoadMore ? [...this.bookings, ...rows] : rows;
        const seenIds = new Set<string>();
        this.bookings = merged.filter(r => {
          const key = String(r.bookingId);
          if (seenIds.has(key)) return false;
          seenIds.add(key);
          return true;
        });
        this.totalBookingsFromServer = res?.totalElements ?? res?.totalCount ?? this.bookings.length;
        this.hasMore = this.bookings.length < this.totalBookingsFromServer;
        this.isLoading = false;
        this.isLoadingMore = false;
        this.cdr.detectChanges();
      }),
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
  private testMatchesTab(status: string | undefined, tabKey: ReportTabKey): boolean {
    const s = (status || 'snr').toLowerCase();

    switch (tabKey) {
      case 'COMPLETE':
        return s.includes('complete') || s.includes('ready');
      case 'SNR':
        return s === 'snr';
      case 'CANCEL':
        return s === 'cancel' || s === 'cancelled';
      case 'CLINICAL':
        return s.includes('clinical');
      case 'PARTIALLY_COMPLETE':
        // "Partially complete" ha booking-level concept ahe (test-level nahi),
        // tyामुळे ha tab आता egzакt match करत नाही — 'pending' madhe merge kela.
        return false;
      case 'PENDING':
        return !(
          s.includes('complete') || s.includes('ready') ||
          s === 'snr' || s === 'cancel' || s === 'cancelled' ||
          s.includes('clinical')
        );
      default:
        return false;
    }
  }
  // ---------- mapping ----------
  private mapToRow(raw: any): ReportBookingRow {
    const rawTestMappings = (raw.bookingWithTestMappings || []).filter((t: any) => !!t.testName);

    const tests: ReportTestRow[] = rawTestMappings.map((t: any) => {
      const matchedSample = (raw.sampleAccessions || []).find(
        (s: any) => Number(s.testId) === Number(t.testId)
      );
      const sampleStatus = (matchedSample?.status || '').toUpperCase();
      const isSampleReceived = sampleStatus === 'RECEIVED';
      const defaultStatus = isSampleReceived ? 'inprocess' : 'snr';

      return {
        name: (t.testName || '').trim(),
        status: (t.cancelDate || t.deleted) ? 'cancel' :
          (t.reportStatus && t.reportStatus.toUpperCase() !== 'PENDING' ? t.reportStatus : defaultStatus),
        testCode: t.testCode
      };
    });

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

  private deriveBucket(tests: ReportTestRow[]): ReportTabKey {
    if (tests.length === 0) return 'PENDING';

    const statuses = tests.map(t => (t.status || '').toLowerCase());

    if (statuses.every(s => s.includes('complete') || s.includes('ready'))) return 'COMPLETE';
    if (statuses.some(s => s === 'snr')) return 'SNR';
    if (statuses.some(s => s.includes('clinical'))) return 'CLINICAL';
    if (statuses.some(s => s.includes('complete') || s.includes('ready'))) return 'PARTIALLY_COMPLETE';
    return 'PENDING';
  }

  // ---------- tabs / rows ----------
  setTab(tab: ReportTabKey) {
    this.activeTab = tab;
    this.autoTabSwitched = true;
    this.selectedIds.clear();
  }

  toggleExpand(item: ReportBookingRow) {
    this.expandedId = this.expandedId === item.bookingId ? null : item.bookingId;
  }

  get rowsForActiveTab(): ReportBookingRow[] {
    const source = this.isSearchMode ? this.filteredDataset : this.bookings;

    if (this.activeTab === 'ALL') {
      return source;
    }

    return source.filter(r =>
      (r.tests || []).some(t => this.testMatchesTab(t.status, this.activeTab))
    );
  }

  get totalBookings(): number {
    return this.isSearchMode ? this.filteredDataset.length : this.totalBookingsFromServer;
  }

  get bucketCount() {
    const counts: Record<ReportTabKey, number> = {
      ALL: 0, COMPLETE: 0, CLINICAL: 0, PARTIALLY_COMPLETE: 0, PENDING: 0, SNR: 0, CANCEL: 0
    };
    const source = this.isSearchMode ? this.filteredDataset : this.bookings;

    counts.ALL = source.length;

    (['COMPLETE', 'CLINICAL', 'PARTIALLY_COMPLETE', 'PENDING', 'SNR', 'CANCEL'] as ReportTabKey[]).forEach(key => {
      counts[key] = source.filter(r =>
        (r.tests || []).some(t => this.testMatchesTab(t.status, key))
      ).length;
    });

    return counts;
  }

  get hasMoreForActiveTab(): boolean {
    return this.hasMore;
  }

  reportsFraction(item: ReportBookingRow): string {
    const total = item.tests.length;
    const done = item.tests.filter(t =>
      (t.status || '').toLowerCase().includes('complete') || (t.status || '').toLowerCase().includes('ready')
    ).length;
    return `${done}/${total}`;
  }

  reportsComplete(item: ReportBookingRow): boolean {
    return item.bucket === 'COMPLETE';
  }
  testStatusClass(status?: string): string {
    const s = (status || 'snr').toLowerCase();

    if (s === 'cancel' || s === 'cancelled') return 'badge-cancel';
    if (s === 'snr') return 'badge-snr';
    if (s.includes('clinical')) return 'badge-clinical';
    if (s.includes('recheck') || s.includes('hold')) return 'badge-recheck';
    if (s.includes('complete') || s.includes('ready')) return 'badge-ready';
    if (
      s.includes('process') ||
      s.includes('outsource') ||
      s.includes('doctor approval')
    ) return 'badge-inprocess';

    return 'badge-pending';
  }

  testStatusLabel(status?: string): string {
    const s = (status || 'snr').toLowerCase();

    if (s === 'cancel' || s === 'cancelled') return 'CANCEL';
    if (s === 'snr') return 'SNR';
    if (s.includes('clinical')) return 'CLINICAL';
    if (s.includes('recheck') || s.includes('hold')) return 'RECHECK & HOLD';
    if (s.includes('complete') || s.includes('ready')) return 'COMPLETE';
    if (
      s.includes('process') ||
      s.includes('outsource') ||
      s.includes('doctor approval')
    ) return 'IN PROCESS';

    return 'PENDING';
  }
  getTestCountStatusClass(item: ReportBookingRow): string {
    const total = item.tests.length;
    if (total === 0) return 'pending';
    const done = item.tests.filter(t =>
      (t.status || '').toLowerCase().includes('complete') || (t.status || '').toLowerCase().includes('ready')
    ).length;
    return done === total ? 'completed' : 'pending';
  }

  // ---------- role gates ----------
  get canShowDownloadControls(): boolean {
    return this.roleService.canDownloadReports && this.activeTab === 'COMPLETE';
  }

  // ---------- selection ----------
  isSelected(item: ReportBookingRow): boolean {
    return this.selectedIds.has(String(item.bookingId));
  }

  toggleSelect(item: ReportBookingRow, checked: boolean) {
    if (!this.canShowDownloadControls) return;
    const id = String(item.bookingId);
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  get selectedReports(): ReportBookingRow[] {
    return this.rowsForActiveTab.filter(r => this.selectedIds.has(String(r.bookingId)));
  }

  // ---------- download ----------
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
        this.labApi.generatePdfReport(bookingIds, { single: bookingIds.length === 1 })
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

  onFranchiseBlur() {
    // ✅ Delay deऊन blur close kार — jेणेकरून dropdown item cha click
    // (jो blur peksha थोडा नंतर fire होतो) आधी process होईल,
    // ani मगच dropdown बंद होईल.
    setTimeout(() => {
      this.showFranchiseDropdown = false;
    }, 200);
  }

  onFranchiseSearch() {
    const q = this.franchiseSearchTerm.trim().toLowerCase();

    if (!q) {
      this.filteredFranchiseList = [];
      this.showFranchiseDropdown = false;
      // text clear zala tari selected franchise tashich rahil,
      // jopryant user explicitly clear (X icon) dabat nahi.
      return;
    }

    this.filteredFranchiseList = this.franchises.filter((f: any) =>
      (f.franchiseName || f.name || '').toLowerCase().includes(q)
    );
    this.showFranchiseDropdown = true;
  }

  selectFranchise(f: any) {
    const franchiseId = f?.franchiseId ?? f?.id ?? null;
    if (franchiseId === null || franchiseId === undefined || Number(franchiseId) <= 0) {
      return;
    }

    this.franchiseSearchTerm = f.franchiseName || f.name || '';
    this.showFranchiseDropdown = false;
    this.filteredFranchiseList = [];
    this.onFranchiseChange(Number(franchiseId));
  }
  clearFranchise() {
    const role = this.authService?.role;
    if (role === 'ROLE_FRANCHISE' || role === 'ROLE_FRANCHISE_STAFF') {
      // Franchise user cannot clear their own franchise filter
      const currentFranchiseId = this.authService?.franchiseId;
      const currentFranchiseName = this.authService?.franchiseName;
      this.franchiseId = currentFranchiseId ? Number(currentFranchiseId) : null;
      this.franchiseSearchTerm = currentFranchiseName || '';
      return;
    }

    this.franchiseSearchTerm = '';
    this.filteredFranchiseList = [];
    this.showFranchiseDropdown = false;
    this.onFranchiseChange(null);
  }
}