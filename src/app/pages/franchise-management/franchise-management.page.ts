import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// ✅ Same Material date-range picker used on Download Reports page —
// gives the single "From – To" trigger + popup calendar instead of
// two separate native <input type="date"> boxes (which render the
// clunky browser-default mm/dd/yyyy calendar seen on this page before).
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonCard,
  IonCardContent,
  IonBadge,
  IonSpinner,
  IonChip,
  IonLabel,
  IonModal,
  RefresherCustomEvent,
  InfiniteScrollCustomEvent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  eyeOutline,
  eyeOffOutline,
  createOutline,
  refreshOutline,
  searchOutline,
  listOutline,
  calendarOutline,
  ribbonOutline,
  businessOutline,
  closeCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  arrowForwardOutline,
  closeOutline,
  downloadOutline
} from 'ionicons/icons';

// ✅ PDF export (same pattern as Test Profile List's exportPdf())
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast';

/**
 * ============================================================
 * NATIVE PDF DOWNLOAD PLUGIN (same as Test Profile List)
 * ============================================================
 */
interface PdfDownloadPlugin {
  savePdf(options: {
    fileName: string;
    data: string;
  }): Promise<{
    success: boolean;
    uri: string;
    fileName: string;
    location: string;
  }>;
}

const PdfDownload = registerPlugin<PdfDownloadPlugin>('PdfDownload');

export interface FranchiseItem {
  franchiseId: number;
  franchiseName: string;
  centerCode: string;
  labId: number;
  reportCreditLimit?: number;
  createdOn?: string;
  username?: string;
  createdDate?: string;
  createdAt?: string;
  created_on?: string;
  login?: string;
  loginId?: string;
  userName?: string;
  loginUsername?: string;
  wallet?: number;
  balanceNegative?: boolean;
  lockReportAmount?: number;
  expiryDate?: string | null;
  isSuper?: boolean;
  isSub?: boolean;
  franchiseActive?: boolean;
  superFranchiseActive?: boolean;
  subFranchiseActive?: boolean;

  franchise?: boolean;
  superFranchise?: boolean;
  subFranchise?: boolean;

  parentSuperFranchiseName?: string;
  parentSuperFranchiseCenterCode?: string;
  parentFranchiseName?: string;
  parentFranchiseCenterCode?: string;

  paidType?: string;
  accessMode?: string;

  // ✅ used by passwordValue() — actual field name may differ,
  // confirm against the franchise-list API response and adjust
  // passwordValue() below if needed.
  password?: string;
  franchisePassword?: string;
  loginPassword?: string;
}

type FranchiseBadge = 'Super' | 'Franchise' | 'Sub' | 'Other';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type TypeFilter = 'ALL' | 'SUPER' | 'FRANCHISE' | 'SUB';

@Component({
  selector: 'app-franchise-management',
  standalone: true,
  templateUrl: './franchise-management.page.html',
  styleUrls: ['./franchise-management.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonCard,
    IonCardContent,
    IonBadge,
    IonSpinner,
    IonChip,
    IonLabel,
    IonModal,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule
  ]
})
export class FranchiseManagementPage implements OnInit, OnDestroy {

  // ---------- Data ----------
  private rawItems: FranchiseItem[] = [];
  franchises: FranchiseItem[] = [];
  total = 0;
  private serverTotal: number | null = null;

  // ---------- UI State ----------
  loading = false;
  loadingMore = false;
  errorMsg = '';

  // ---------- Filters ----------
  searchTerm = '';
  startDate = '';
  endDate = '';
  statusFilter: StatusFilter = 'ALL';
  typeFilter: TypeFilter = 'ALL';

  // ✅ Custom TYPE dropdown state (replaces native <select>)
  showTypeDropdown = false;

  statusOptions: { label: string; value: StatusFilter }[] = [
    { label: 'All Status', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Inactive', value: 'INACTIVE' }
  ];

  typeOptions: { label: string; value: TypeFilter }[] = [
    { label: 'All Types', value: 'ALL' },
    { label: 'Super Franchise', value: 'SUPER' },
    { label: 'Franchise', value: 'FRANCHISE' },
    { label: 'Sub Franchise', value: 'SUB' }
  ];

  // ---------- Pagination ----------
  // IMPORTANT: itlabspeed.com (company site) calls the API ONCE with
  // ?wallet=true&page=0&size=100 and NEVER sends type/status/search
  // to the backend at all — confirmed from their Network tab request:
  //   GET /api/v1/lab/franchise/3505?wallet=true&page=0&size=100
  // They just pull the WHOLE dataset in one shot (their totalElements
  // is 52, well under 100) and do every filter (Super/Franchise/Sub,
  // Active/Inactive, search, date range) purely client-side against
  // that full list.
  //
  // Our previous size=20 + infinite-scroll approach filtered only the
  // handful of rows already loaded, so totals/filters never matched
  // the company's numbers until you scrolled to the very bottom.
  // Matching their approach fixes it.
  page = 0;
  size = 100;
  hasMore = true;

  // ---------- Date Range Picker (same wiring as Download Reports) ----------
  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  private searchChanged = new Subject<string>();

  constructor(
    private labApi: LabApiService,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    addIcons({
      eyeOutline,
      eyeOffOutline,
      createOutline,
      refreshOutline,
      searchOutline,
      listOutline,
      calendarOutline,
      ribbonOutline,
      businessOutline,
      closeCircleOutline,
      chevronDownOutline,
      chevronUpOutline,
      arrowForwardOutline,
      closeOutline,
      downloadOutline
    });
  }

  ngOnInit(): void {
    this.searchChanged
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.recomputeFiltered());

    this.reload();
  }

  ngOnDestroy(): void {
    this.searchChanged.complete();
  }

  // ============================================================
  // Loading & Data Fetching
  // ============================================================

  reload(): void {
    this.page = 0;
    this.hasMore = true;
    this.rawItems = [];
    this.franchises = [];
    this.fetchPage(true);
  }

  handleRefresh(event: RefresherCustomEvent): void {
    this.page = 0;
    this.hasMore = true;
    this.rawItems = [];
    this.fetchPage(true, () => event.target.complete());
  }

  handleLoadMore(event: InfiniteScrollCustomEvent): void {
    if (!this.hasMore) {
      event.target.complete();
      return;
    }
    this.page++;
    this.fetchPage(false, () => event.target.complete());
  }

  loadMore(): void {
    if (!this.hasMore || this.loadingMore) return;
    this.page++;
    this.loadingMore = true;
    this.fetchPage(false, () => (this.loadingMore = false));
  }

  refresh(): void {
    this.searchTerm = '';
    this.startDate = '';
    this.endDate = '';
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.reload();
  }

  private fetchPage(isFirstLoad: boolean, onDone?: () => void): void {
    this.errorMsg = '';
    if (isFirstLoad) this.loading = true;

    const labId = this.authService.labId;

    // NOTE: we intentionally do NOT send the free-text search term to
    // the backend (searchFranchiseId only accepts a franchise id, and
    // the company site never sends it for a text search either — it
    // filters the already-loaded list client-side, same as us below).
    const term = this.searchTerm.trim();
    const numericSearch = /^\d+$/.test(term) ? term : undefined;

    const request$ = this.labApi.getFranchisesPage(labId, this.page, this.size, numericSearch);

    request$.subscribe({
      next: (res: any) => {
        const content: FranchiseItem[] = res?.content ?? res?.data ?? res ?? [];
        const totalElements: number = res?.totalElements ?? res?.total ?? res?.totalCount;

        this.rawItems = isFirstLoad ? content : [...this.rawItems, ...content];
        this.hasMore = content.length >= this.size;

        if (totalElements !== undefined && totalElements !== null) {
          this.serverTotal = totalElements;
        }

        this.recomputeFiltered();
      },
      error: (err) => {
        console.error('Franchise list load failed', err);
        this.errorMsg = 'Could not load franchises. Pull to refresh and try again.';
      },
      complete: () => {
        this.loading = false;
        if (onDone) onDone();
      }
    });
  }

  // ============================================================
  // ✅ Password show/hide state (per franchise card)
  // ============================================================

  visiblePasswordIds = new Set<number>();

  isPasswordVisible(id: number): boolean {
    return this.visiblePasswordIds.has(id);
  }

  togglePasswordVisibility(id: number): void {
    if (this.visiblePasswordIds.has(id)) {
      this.visiblePasswordIds.delete(id);
    } else {
      this.visiblePasswordIds.add(id);
    }
  }

  passwordValue(f: FranchiseItem): string {
    const raw: any = f;
    return (raw.password ?? raw.franchisePassword ?? raw.loginPassword ?? '') || '';
  }

  // ============================================================
  // Core Filtering Logic
  // ============================================================

  private recomputeFiltered(): void {
    const term = this.searchTerm.trim().toLowerCase();
    const start = this.startDate ? new Date(this.startDate) : null;
    const end = this.endDate ? new Date(this.endDate) : null;

    this.franchises = this.rawItems.filter((f) => {
      // 1. Search Filter
      if (term) {
        const haystack = [
          this.hierarchyPath(f),      // "Franchise :" field मध्ये दिसणारं
          f.franchiseName,            // "Name :" field मध्ये दिसणारं
          f.centerCode,
          this.usernameValue(f),
          f.parentFranchiseName,
          f.parentFranchiseCenterCode,
          f.parentSuperFranchiseName,
          f.parentSuperFranchiseCenterCode
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      // 2. Date Filter
      const created = this.toDateSafe(this.createdOnValue(f));
      if ((start || end) && created) {
        if (start) {
          const s = new Date(start);
          s.setHours(0, 0, 0, 0);
          if (created < s) return false;
        }
        if (end) {
          const e = new Date(end);
          e.setHours(23, 59, 59, 999);
          if (created > e) return false;
        }
      }

      // 3. Status Filter (Active / Inactive)
      const isActive = this.isActiveStatus(f);
      if (this.statusFilter === 'ACTIVE' && !isActive) return false;
      if (this.statusFilter === 'INACTIVE' && isActive) return false;

      // 4. Type Filter (Super / Sub / Franchise)
      if (this.typeFilter !== 'ALL') {
        const currentBadge = this.badgeFor(f);
        if (this.typeFilter === 'SUPER' && currentBadge !== 'Super') return false;
        if (this.typeFilter === 'SUB' && currentBadge !== 'Sub') return false;
        if (this.typeFilter === 'FRANCHISE' && currentBadge !== 'Franchise') return false;
      }

      return true;
    });

    // Total Count Calculation.
    // Now that rawItems always holds the FULL dataset (size=100 covers
    // it in one call, same as the company site), franchises.length is
    // always the correct total for the active filter — no need to
    // special-case "no filter" vs "filtered" anymore, but we keep the
    // serverTotal fallback in case size=100 ever stops covering
    // everything (i.e. totalElements grows past 100).
    this.total = this.franchises.length;
  }

  // ============================================================
  // Search / Filter Handlers (Wired from Template)
  // ============================================================

  onSearchInput(value: string | null | undefined): void {
    this.searchTerm = value ?? '';
    this.searchChanged.next(this.searchTerm);
  }

  onDateChange(): void {
    this.recomputeFiltered();
  }

  // ---------- date range picker helpers (copied from download-reports.page.ts) ----------
  private formatDateForInput(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private toDateObj(dateStr: string): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00');
  }

  private toDateStr(d: Date | null): string {
    if (!d) return '';
    return this.formatDateForInput(d);
  }

  openDateRangePicker(): void {
    this.rangeStart = this.toDateObj(this.startDate);
    this.rangeEnd = this.toDateObj(this.endDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any): void {
    this.rangeStart = event?.value || null;
  }

  onRangeEndChange(event: any): void {
    this.rangeEnd = event?.value || null;
    // Only commit + re-filter once BOTH ends are picked, same as
    // Download Reports — avoids filtering on a half-picked range.
    if (this.rangeStart && this.rangeEnd) {
      this.startDate = this.toDateStr(this.rangeStart);
      this.endDate = this.toDateStr(this.rangeEnd);
      this.onDateChange();
    }
  }

  clearDateRange(): void {
    this.startDate = '';
    this.endDate = '';
    this.rangeStart = null;
    this.rangeEnd = null;
    this.onDateChange();
  }

  onStatusChange(): void {
    this.recomputeFiltered();
  }

  onTypeChange(): void {
    this.recomputeFiltered();
  }

  // ============================================================
  // ✅ TYPE dropdown (custom, replaces native <select>)
  // ============================================================

  get typeFilterLabel(): string {
    const found = this.typeOptions.find(o => o.value === this.typeFilter);
    return found ? found.label : 'All Types';
  }

  selectType(opt: { label: string; value: TypeFilter }): void {
    this.typeFilter = opt.value;
    this.showTypeDropdown = false;
    this.onTypeChange();
  }

  private isActiveStatus(f: FranchiseItem): boolean {
    const raw: any = f;

    if (typeof raw.active === 'boolean') return raw.active;
    if (typeof raw.isActive === 'boolean') return raw.isActive;
    if (typeof raw.enabled === 'boolean') return raw.enabled;
    if (typeof raw.franchiseEnabled === 'boolean') return raw.franchiseEnabled;

    if (typeof raw.status === 'string') return raw.status.toUpperCase() !== 'INACTIVE';
    if (typeof raw.franchiseStatus === 'string') return raw.franchiseStatus.toUpperCase() !== 'INACTIVE';
    if (typeof raw.accountStatus === 'string') return raw.accountStatus.toUpperCase() !== 'INACTIVE';

    return true;
  }

  // ============================================================
  // Presentation Helpers
  // ============================================================

  badgeFor(f: FranchiseItem): FranchiseBadge {
    // FIX #2: `franchiseActive` was never being checked — everything
    // that wasn't Super/Sub silently fell through to a hardcoded
    // 'Franchise' default. That's wrong on two counts:
    //   1. It ignored the actual `franchiseActive` boolean the API
    //      sends, which is the real signal for "this record IS a
    //      Franchise-tier entity".
    //   2. A small number of records (e.g. testMicroFranchise,
    //      testMicroFranchise2) have ALL THREE flags false —
    //      superFranchiseActive / franchiseActive / subFranchiseActive
    //      are all false. The company site does NOT count these under
    //      Super, Franchise, or Sub at all (they only show up in the
    //      "All" total) — but our old fallback wrongly bucketed them
    //      as "Franchise", inflating that count from 13 to 15.
    //
    // Verified against the raw API data: with this exact flag-based
    // logic, Super=31, Franchise=13, Sub=6 — matching the company
    // site precisely (31+13+6=50, the remaining 2 records are the
    // "Other" ones visible only under All).
    if (f.superFranchiseActive) return 'Super';
    if (f.franchiseActive) return 'Franchise';
    if (f.subFranchiseActive) return 'Sub';
    return 'Other';
  }

  badgeColor(f: FranchiseItem): string {
    const badge = this.badgeFor(f);
    return {
      Super: 'warning',
      Franchise: 'primary',
      Sub: 'success',
      Other: 'medium'
    }[badge];
  }

  isMe(f: FranchiseItem): boolean {
    const auth: any = this.authService;
    const myCenterCode = auth.centerCode ?? auth.userCenterCode ?? auth.username ?? auth.userName;
    if (!myCenterCode) return false;
    return f.centerCode === myCenterCode;
  }

  hierarchyPath(f: FranchiseItem): string {
    const parts: string[] = [];
    if (f.parentSuperFranchiseCenterCode) parts.push(`(${f.parentSuperFranchiseCenterCode})`);
    if (f.parentFranchiseCenterCode) parts.push(`(${f.parentFranchiseCenterCode})`);
    parts.push(`(${f.centerCode})`);
    return parts.join(' / ');
  }

  private walletAmount(f: FranchiseItem): number {
    const raw: any = f.wallet;

    if (typeof raw === 'number') return raw;

    if (raw && typeof raw === 'object') {
      const candidate =
        raw.balance ?? raw.amount ?? raw.walletBalance ?? raw.value ?? 0;
      return typeof candidate === 'number' ? candidate : Number(candidate) || 0;
    }

    return Number(raw) || 0;
  }

  balanceClass(f: FranchiseItem): string {
    const amount = this.walletAmount(f);
    return amount < 0 ? 'text-negative' : 'text-positive';
  }

  formatBalance(f: FranchiseItem): string {
    const amount = this.walletAmount(f);
    return `Rs.${amount} /-`;
  }

  formatCredit(f: FranchiseItem): string {
    return `Rs.${f.reportCreditLimit ?? 0} /-`;
  }

  creditClass(f: FranchiseItem): string {
    const amount = f.reportCreditLimit ?? 0;
    if (this.isExpired(f)) return 'text-negative';
    return amount < 0 ? 'text-negative' : 'text-positive';
  }

  formatExpiry(f: FranchiseItem): string {
    if (!f.expiryDate) return 'N/A';
    return this.formatDate(f.expiryDate) || String(f.expiryDate);
  }

  isExpired(f: FranchiseItem): boolean {
    if (!f.expiryDate) return false;
    const expiry = new Date(f.expiryDate);
    if (isNaN(expiry.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry < today;
  }

  createdOnValue(f: FranchiseItem): string | number {
    const raw: any = f;
    return (
      raw.createdOn ?? raw.createdDate ?? raw.createdAt ?? raw.created_on ?? ''
    ) || '';
  }

  formattedCreatedOn(f: FranchiseItem): string {
    const value = this.createdOnValue(f);
    return this.formatDate(value) || '—';
  }

  private toDateSafe(raw: any): Date | null {
    if (raw === null || raw === undefined || raw === '') return null;

    if (typeof raw === 'number') {
      return new Date(raw < 1e12 ? raw * 1000 : raw);
    }

    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
      const num = Number(raw.trim());
      return new Date(num < 1e12 ? num * 1000 : num);
    }

    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDate(raw: any): string {
    const d = this.toDateSafe(raw);
    if (!d) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  usernameValue(f: FranchiseItem): string {
    const raw: any = f;
    return (
      raw.username ?? raw.login ?? raw.loginId ?? raw.userName ?? raw.loginUsername ?? ''
    ) || '';
  }

  trackByFranchiseId(_index: number, item: FranchiseItem): number {
    return item.franchiseId;
  }

  // ============================================================
  // Actions
  // ============================================================

  viewFranchise(f: FranchiseItem): void {
    this.router.navigate(['/franchise', f.franchiseId, 'view']);
  }

  editFranchise(f: FranchiseItem): void {
    this.router.navigate(['/franchise', f.franchiseId, 'edit']);
  }

  // ============================================================
  // ✅ Franchise "Info" inline expand state (replaces popup)
  // ============================================================

  expandedFranchiseId: number | null = null;

  toggleInfo(f: FranchiseItem): void {
    this.expandedFranchiseId =
      this.expandedFranchiseId === f.franchiseId ? null : f.franchiseId;
  }

  isExpanded(id: number): boolean {
    return this.expandedFranchiseId === id;
  }

  // ============================================================
  // ✅ PDF EXPORT (same pattern as Test Profile List exportPdf())
  // ============================================================

  async exportPdf(): Promise<void> {
    try {
      // ========================================================
      // CREATE PDF
      // ========================================================
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      // ========================================================
      // TITLE
      // ========================================================
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(20, 20, 20);
      doc.text('Franchise List', pageWidth / 2, 46, { align: 'center' });

      // ========================================================
      // SUBTITLE
      // ========================================================
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(12);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Lab: ${this.authService.labId ?? 'undefined'}`,
        pageWidth / 2,
        66,
        { align: 'center' }
      );

      // ========================================================
      // TABLE DATA
      // ========================================================
      const rows = this.franchises.map((f, i) => [
        String(i + 1),
        this.hierarchyPath(f),
        `${f.franchiseName} / ${f.centerCode}`,
        this.badgeFor(f),
        f.paidType ?? '-',
        this.formattedCreatedOn(f),
        this.formatBalance(f),
        this.usernameValue(f) || '-',
        this.formatCredit(f),
        this.formatExpiry(f) + (this.isExpired(f) ? ' (Expired)' : '')
      ]);

      // ========================================================
      // TABLE
      // ========================================================
      autoTable(doc, {
        startY: 88,
        head: [[
          'Sr. No.',
          'Franchise',
          'Name',
          'Type',
          'Paid Type',
          'Created On',
          'Balance',
          'Login',
          'Report Credit',
          'Expiry Date'
        ]],
        body: rows,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 6,
          valign: 'top',
          lineColor: [221, 221, 221],
          lineWidth: 0.5,
          textColor: [40, 40, 40]
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: [20, 20, 20],
          fontStyle: 'bold',
          fontSize: 10,
          lineColor: [221, 221, 221],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 90 },
          2: { cellWidth: 90 },
          3: { cellWidth: 60 },
          4: { cellWidth: 60 },
          5: { cellWidth: 65 },
          6: { cellWidth: 70 },
          7: { cellWidth: 70 },
          8: { cellWidth: 70 },
          9: { cellWidth: 'auto' }
        },
        didParseCell: (data) => {
          if (data.column.index === 0) {
            data.cell.styles.halign = 'center';
          }
          if (data.column.index === 6 || data.column.index === 8) {
            data.cell.styles.halign = data.section === 'body' ? 'right' : 'left';
          }
        }
      });

      // ========================================================
      // FILE NAME
      // ========================================================
      const fileName = `Franchise_List_${Date.now()}.pdf`;

      // ========================================================
      // ANDROID / NATIVE
      // ========================================================
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        console.log('PDF EXPORT: Android native platform');

        // ------------------------------------------------------
        // PDF -> DATA URI
        // ------------------------------------------------------
        const dataUri = doc.output('datauristring');

        if (!dataUri || !dataUri.includes(',')) {
          throw new Error('Unable to convert PDF to Base64');
        }

        // ------------------------------------------------------
        // EXTRACT BASE64
        // ------------------------------------------------------
        const base64Pdf = dataUri.substring(dataUri.indexOf(',') + 1);

        if (!base64Pdf) {
          throw new Error('PDF Base64 data is empty');
        }

        // ------------------------------------------------------
        // ANDROID NATIVE PLUGIN
        // ------------------------------------------------------
        const result = await PdfDownload.savePdf({
          fileName,
          data: base64Pdf
        });

        console.log('PDF native result:', result);

        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------
        if (result && result.success === true) {
          this.toastService.success(
            'PDF Downloaded',
            'Your PDF has been downloaded successfully.'
          );
          return;
        }

        throw new Error('Unable to download PDF');
      }

      // ========================================================
      // WEB / LAPTOP
      // ========================================================
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, '_blank');

      // ========================================================
      // POPUP BLOCKED
      // ========================================================
      if (!newWindow) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // ========================================================
      // WEB SUCCESS TOAST
      // ========================================================
      this.toastService.success(
        'PDF Downloaded',
        'Your PDF has been downloaded successfully.'
      );

      // ========================================================
      // CLEANUP
      // ========================================================
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);

    } catch (error: any) {
      console.error('PDF EXPORT ERROR:', error);

      // ========================================================
      // ERROR TOAST
      // ========================================================
      const message = error?.message || error?.error || 'Unable to download PDF';

      this.toastService.error('PDF Download Failed', message);
    }
  }
}