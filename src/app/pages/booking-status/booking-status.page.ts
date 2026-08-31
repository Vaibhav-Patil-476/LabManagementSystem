import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
  IonSelect, IonSelectOption, IonDatetime, AlertController
} from '@ionic/angular/standalone';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { addIcons } from 'ionicons';
import {
  flaskOutline, personOutline, printOutline, closeOutline, trashOutline,
  addOutline, checkmarkOutline, ellipsisVerticalOutline, cashOutline,
  documentTextOutline, timeOutline, qrCodeOutline, receiptOutline, attachOutline,
  refreshOutline, searchOutline, closeCircleOutline, logoWhatsapp, eyeOutline , copyOutline  
} from 'ionicons/icons';
import { ToastService } from '../../core/services/toast';
import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { Router } from '@angular/router';

export interface BookingSample {
  accessionId?: number;
  sampleAccessionId?: number;
  barcode: string;
  sampleType?: string;
  sampleTypeId?: number;
  status?: string;
  testId?: number;
}

export interface BookingTest {
  testId: number;
  testMappingId?: number;
  testName: string;
  testPrice?: number;
  testMrp?: number;
  discount?: number;
  sample?: string;
  method?: string;
  status?: string;
  reportId?: number;
  resultValue?: string | number;
  refRangeLow?: number;
  refRangeHigh?: number;
  referenceNote?: string;
  isNewlyAdded?: boolean;
}

export interface BookingListItem {
  id?: number;
  bookingId: number;
  patientId: string;
  title?: string;
  customerName: string;
  age?: number;
  ageType?: string;
  gender?: string;
  mobileNumber?: string;
  aadhaarNumber?: string;
  uhidNumber?: string;
  address?: string;
  history?: string;
  attachmentName?: string;
  customDoctorName?: string;
  customFranchiseLab?: string;
  subTotalAmount?: number;
  totalAmount?: number;
  discountAmount?: number;
  paidAmount?: number;
  dueAmount?: number;
  tests?: BookingTest[];
  samples?: BookingSample[];
  reports?: { reportId: number; reportStatus: string }[];
  doctor?: { doctorId?: number; doctor_name?: string };
  franchise?: { franchiseId?: number; franchiseName?: string };
  lab?: string;
  createdOn?: number;
  createdBy?: number;
  labId?: number;
  transactions?: any[];
  bookingDate?: string;
  doctorTitle?: string;
  overallReportStatus?: string;
}

@Component({
  selector: 'app-booking-status',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
    IonSelect, IonSelectOption, IonDatetime,
    MatDatepickerModule, MatFormFieldModule, MatInputModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './booking-status.page.html',
  styleUrls: ['./booking-status.page.scss']
})
export class BookingStatusPage implements OnInit, OnDestroy {

  bookings: BookingListItem[] = [];
  isLoadingList = false;
  isLoadingMore = false;
  hasMore = false;
  totalBookingsFromServer = 0;
  quickSearch = '';
  selectedFranchiseId: any = null;
  selectedReportStatus = 'all';
  fromDate = '';
  toDate = '';
  filterFranchises: any[] = [];
  private readonly SEARCH_START_DATE = '2015-01-01';
  private searchDebounceTimer: any = null;
  private readonly SEARCH_DEBOUNCE_MS = 400;

  isTestModalOpen = false;
  isTestLoading = false;
  selectedBooking: BookingListItem | null = null;
  searchTerm = '';
  filteredTests: BookingTest[] = [];
  selectedTests: BookingTest[] = [];
  discount = 0;
  basePaidAmount = 0;
  payNowAmount = 0;
  paidAmount = 0;
  paymentMethod = 'cash';
  isSavingTest = false;

  isPatientModalOpen = false;
  isPatientLoading = false;
  editPatientData: any = null;
  doctorSearch = '';
  customLabSearch = '';
  filteredCustomLabs: any[] = [];
  showCustomLabDropdown = false;
  showDoctorPicker = false;
  showLabPicker = false;
  doctors: any[] = [];
  labs: any[] = [];
  selectedDoctorPick: any = null;
  selectedLabPick: any = null;

  isNoteModalOpen = false;
  noteBooking: BookingListItem | null = null;
  noteText = '';
  isSavingNote = false;

  isHistoryModalOpen = false;
  historyBooking: BookingListItem | null = null;
  isLoadingHistory = false;

  isBarcodeModalOpen = false;
  barcodeBooking: BookingListItem | null = null;
  barcodeRows: {
    accessionId?: number; sampleTypeId?: number; testId?: number; sampleType: string;
    oldBarcode: string; newBarcode: string; receiveDate: string;
    status: string; canEditBarcode: boolean; saving: boolean;
  }[] = [];
  activeDateTimeRow: any = null;
  tempDateTimeValue = '';

  isBillHistoryModalOpen = false;
  billHistoryBooking: BookingListItem | null = null;

  openActionRowId: number | null = null;
  generatingBillId: number | null = null;
  sharingWhatsappId: number | null = null;
  openActionItem: BookingListItem | null = null;
  actionMenuPosition = { top: 0, left: 0 };
  role = '';

  // ✅ Reference to the rendered dropdown element — used to measure its
  // REAL height/width before finally positioning it (see toggleActionMenu).
  @ViewChild('actionDropdown') actionDropdownRef?: ElementRef<HTMLElement>;

  readonly statusTabs: { key: string; label: string; badgeClass: string }[] = [
    { key: 'all', label: 'All', badgeClass: 'badge-all' },
    { key: 'completed', label: 'Completed', badgeClass: 'badge-complete' },
    { key: 'CLINICAL', label: 'Clinical', badgeClass: 'badge-clinical' },
    { key: 'pending', label: 'Pending', badgeClass: 'badge-pending' },
    { key: 'snr', label: 'SNR', badgeClass: 'badge-snr' },
    { key: 'cancel', label: 'Cancel', badgeClass: 'badge-cancel' }
  ];

  get statusBucketCount(): Record<string, number> {
    const counts: Record<string, number> = { all: 0, completed: 0, CLINICAL: 0, pending: 0, snr: 0, cancel: 0 };

    let source = [...this.bookings];

    const q = this.quickSearch?.trim().toLowerCase();
    if (q) {
      source = source.filter(b =>
        String(b.bookingId).includes(q) ||
        (b.patientId || '').toLowerCase().includes(q) ||
        (b.customerName || '').toLowerCase().includes(q) ||
        (b.doctor?.doctor_name || '').toLowerCase().includes(q)
      );
    }

    counts['all'] = source.length;

    ['completed', 'CLINICAL', 'pending', 'snr', 'cancel'].forEach(key => {
      counts[key] = source.filter(b =>
        (b.tests || []).some(t => this.testMatchesTab(t.status, key))
      ).length;
    });

    return counts;
  }

  setStatusTab(key: string): void {
    this.selectedReportStatus = key;
  }

  private currentUserId = 0;

  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;
  franchiseSearchTerm = '';
  filteredFranchiseList: any[] = [];
  showFranchiseDropdown = false;

  onFranchiseBlur(): void {
    // Delay closing the dropdown so a click on a dropdown item
    // (which fires slightly after blur) is processed first.
    setTimeout(() => {
      this.showFranchiseDropdown = false;
    }, 200);
  }

  // ---------- franchise search ----------
  onFranchiseSearch(): void {
    const q = this.franchiseSearchTerm.trim().toLowerCase();

    if (!q) {
      this.filteredFranchiseList = [];
      this.showFranchiseDropdown = false;

      /*
       * When the text box is cleared manually (not via the X icon),
       * clear the filter — except for franchise-role users — and
       * reload all data. Previously only the dropdown was hidden
       * and the data wasn't reloaded.
       */
      const isFranchiseUser =
        this.role === this.ROLE_FRANCHISE ||
        this.role === this.ROLE_FRANCHISE_STAFF;

      if (!isFranchiseUser && this.selectedFranchiseId !== null) {
        this.selectedFranchiseId = null;
        this.loadBookings();
      }

      return;
    }

    this.filteredFranchiseList = this.filterFranchises.filter((f: any) =>
      (f.franchiseName || f.name || '').toLowerCase().includes(q)
    );

    this.showFranchiseDropdown = true;
  }

  // ---------- select franchise ----------
  selectFranchise(f: any): void {
    const franchiseId = f?.franchiseId ?? f?.id ?? null;

    if (franchiseId === null || franchiseId === undefined || Number(franchiseId) <= 0) {
      return;
    }

    this.franchiseSearchTerm = f.franchiseName || f.name || '';
    this.selectedFranchiseId = Number(franchiseId);
    this.showFranchiseDropdown = false;
    this.filteredFranchiseList = [];

    this.applyFilters();
  }

  get isSearchMode(): boolean {
    return this.quickSearch.trim().length > 0;
  }

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  get isAdminRole(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get isStaffRole(): boolean { return this.role === this.ROLE_STAFF; }
  get isFranchiseOnlyRole(): boolean { return this.role === this.ROLE_FRANCHISE; }

  get canEditPatient(): boolean { return this.isAdminRole || this.isFranchiseOnlyRole; }
  get canViewAmount(): boolean { return this.isAdminRole || this.isFranchiseOnlyRole; }
  get canEditBilling(): boolean { return this.isAdminRole || this.isStaffRole; }
  get canViewPayment(): boolean { return this.isAdminRole || this.isFranchiseOnlyRole; }
  get canSaveBooking(): boolean {
    return [this.ROLE_LAB_ADMIN, this.ROLE_STAFF, this.ROLE_FRANCHISE, this.ROLE_FRANCHISE_STAFF].includes(this.role);
  }

  get subTotal(): number {
    return this.selectedTests.reduce((s, t) => s + Number(t.testPrice ?? t.testMrp ?? 0), 0);
  }
  get totalAmount(): number { return Math.max(0, this.subTotal - this.discount); }
  get dueAmount(): number { return Math.max(0, this.totalAmount - this.paidAmount); }

  get filteredBookings(): BookingListItem[] {
    let list: BookingListItem[] = [...this.bookings];

    /*
     * Report status filter — this is a TEST-level check, not booking-level:
     * a booking is shown if at least one of its tests matches the status.
     */
    if (this.selectedReportStatus && this.selectedReportStatus !== 'all') {
      list = list.filter((booking: BookingListItem) =>
        (booking.tests || []).some(t => this.testMatchesTab(t.status, this.selectedReportStatus))
      );
    }

    // Quick search filter
    const q = this.quickSearch?.trim().toLowerCase();

    if (q) {
      list = list.filter((booking: BookingListItem) => {
        const bookingId = String(booking.bookingId ?? '').toLowerCase();
        const patientId = String(booking.patientId ?? '').toLowerCase();
        const customerName = String(booking.customerName ?? '').toLowerCase();
        const doctorName = String(booking.doctor?.doctor_name ?? '').toLowerCase();

        return (
          bookingId.includes(q) ||
          patientId.includes(q) ||
          customerName.includes(q) ||
          doctorName.includes(q)
        );
      });
    }

    return list;
  }

  private testMatchesTab(status: string | undefined, tabKey: string): boolean {
    const s = this.normalizeStatus(status, 'snr');

    switch (tabKey) {
      case 'completed':
        return this.isCompleteOrReady(s);
      case 'cancel':
        return s === 'cancel' || s === 'cancelled';
      case 'snr':
        return s === 'snr';
      case 'CLINICAL':
        return s.includes('clinical');
      case 'pending':
        return !(
          this.isCompleteOrReady(s) ||
          s === 'cancel' || s === 'cancelled' ||
          s === 'snr' ||
          s.includes('clinical')
        );
      default:
        return false;
    }
  }

  /** Lower-cases a status string, falling back to `fallback` (default '') when empty/undefined. */
  private normalizeStatus(status: string | undefined, fallback: string = ''): string {
    return (status || fallback).toLowerCase();
  }

  /** True when an already-normalized (lower-cased) status string represents a completed/ready test. */
  private isCompleteOrReady(normalizedStatus: string): boolean {
    return normalizedStatus.includes('complete') || normalizedStatus.includes('ready');
  }

  get totalBookingsCount(): number {
    /*
     * While the user is searching, show the currently visible filtered
     * count. The status-tab filter (Completed/Pending/SNR/etc.) should
     * not affect this badge — it only filters the list below.
     */
    const hasQuickSearch = !!this.quickSearch?.trim();

    if (hasQuickSearch) {
      return this.filteredBookings.length;
    }

    // Otherwise show the backend total (stays fixed when the status tab changes).
    return this.totalBookingsFromServer;
  }

  get isDefaultTodayRange(): boolean {
    const today = this.formatDateForInput(new Date());
    return this.fromDate === today && this.toDate === today;
  }

  constructor(
    private toast: ToastService,
    private labApi: LabApiService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController,
    private authService: AuthService,
     private router: Router,
      private toastService: ToastService
  ) {
    addIcons({
      flaskOutline, personOutline, printOutline, closeOutline, trashOutline,
      addOutline, checkmarkOutline, ellipsisVerticalOutline, cashOutline,
      documentTextOutline, timeOutline, qrCodeOutline, receiptOutline, attachOutline,
      refreshOutline, searchOutline, closeCircleOutline, logoWhatsapp, eyeOutline , 'copy-outline': copyOutline 
    });
  }

  // ---------- lifecycle ----------
  ngOnInit(): void {
    const today = this.formatDateForInput(new Date());

    this.fromDate = today;
    this.toDate = today;

    this.loadCurrentUser();
  }

  ionViewWillEnter(): void {
    this.loadCurrentUser();
  }

  ionViewWillLeave(): void {
    this.closeActionMenu();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange(): void {
    if (this.openActionRowId !== null) {
      this.closeActionMenu();
    }
  }

  showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    if (type === 'success') {
      this.toast.success('Success', msg);
    } else if (type === 'error') {
      this.toast.error('Error', msg);
    } else {
      this.toast.warning('Warning', msg);
    }
  }

  // ---------- current user ----------
  private loadCurrentUser(): void {
    const cachedUser = this.authService.currentUserValue;

    if (cachedUser) {
      this.role = this.authService.role;
      this.currentUserId = cachedUser?.raw?.id ?? cachedUser?.userId ?? 0;

      /*
       * IMPORTANT: do not call loadBookings() here.
       * loadFilterFranchises() first resolves the logged-in franchise
       * ID and then loads bookings.
       */
      this.loadFilterFranchises();

      this.cdr.detectChanges();
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.role = this.authService.role;

          const currentUser = this.authService.currentUserValue;
          this.currentUserId = currentUser?.raw?.id ?? currentUser?.userId ?? 0;

          // Current user is now available — resolve franchise first, then load bookings.
          this.loadFilterFranchises();

          this.cdr.detectChanges();
        });
      },

      error: () => {
        this.ngZone.run(() => {
          this.role = this.authService.role || '';
          this.currentUserId = 0;

          // Even if the current-user API fails, still try loading the franchise filter.
          this.loadFilterFranchises();

          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---------- date helpers ----------
  private formatDateForInput(d: Date): string {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  private addOneDay(dateStr: string): string {
    if (!dateStr) return dateStr;

    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return this.formatDateForInput(d);
  }

  private toDateObj(dateStr: string): Date | null {
    return dateStr ? new Date(dateStr + 'T00:00:00') : null;
  }

  private toDateStr(d: Date | null): string {
    return d ? this.formatDateForInput(d) : '';
  }

  openDateRangePicker(): void {
    this.rangeStart = this.toDateObj(this.fromDate);
    this.rangeEnd = this.toDateObj(this.toDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any): void {
    this.rangeStart = event?.value || null;
  }

  onRangeEndChange(event: any): void {
    this.rangeEnd = event?.value || null;

    if (this.rangeStart && this.rangeEnd) {
      this.fromDate = this.toDateStr(this.rangeStart);
      this.toDate = this.toDateStr(this.rangeEnd);
      this.applyFilters();
    }
  }

  onQuickSearchChange(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.loadBookings();
    }, this.SEARCH_DEBOUNCE_MS);
  }

  // ---------- mapping ----------
  private mapBookingItem(raw: any): BookingListItem {
    if (!raw) return raw;

    const rawTestMappings = (raw.bookingWithTestMappings || raw.testMappings || raw.tests || [])
      .filter((t: any) => !!t.testName);

    const reportsRaw = raw.reports || [];

    const reports = reportsRaw
      .filter((r: any) => !!r.reportId)
      .map((r: any) => ({
        reportId: r.reportId,
        reportStatus: r.reportStatus || 'PENDING'
      }));

    const statusByTestId = new Map<number, string>();

    reportsRaw.forEach((r: any) => {
      if (r.testId != null) {
        statusByTestId.set(r.testId, r.reportStatus || 'PENDING');
      }
    });

    const tests: BookingTest[] = rawTestMappings.map((t: any) => {
      const mappingId = t.testMappingId ?? t.bookingWithTestMappingId;

      // Match the sample directly via testId — the sample object already carries testId.
      const matchedSample = (raw.sampleAccessions || raw.samples || [])
        .find((s: any) => Number(s.testId) === Number(t.testId));

      const sampleStatus = (matchedSample?.status || '').toUpperCase();
      const isSampleReceived = sampleStatus === 'RECEIVED';
      const defaultStatus = isSampleReceived ? 'inprocess' : 'snr';

      return {
        testId: t.testId,
        testMappingId: mappingId,
        testName: (t.testName || '').trim(),
        testPrice: t.assignedPrice ?? t.testPrice ?? t.test_price ?? t.price2 ?? 0,
        testMrp: t.testMrp ?? t.test_mrp ?? 0,

        method: t.testCode,
        status: (t.cancelDate || t.deleted) ? 'cancel' :
          (statusByTestId.get(t.testId) ||
            (t.reportStatus && t.reportStatus.toUpperCase() !== 'PENDING' ? t.reportStatus : null) ||
            defaultStatus),
        reportId: statusByTestId.has(t.testId) ? undefined : t.reportId,
        sample: t.sample || t.sampleTypeName || t.sampleType || t.sampleTypeData?.sample_type || '',
        resultValue: ''
      };
    });

    const seenBarcodes = new Set<string>();
    const samples: BookingSample[] = [];

    (raw.sampleAccessions || raw.samples || []).forEach((s: any) => {
      const barcode = s.barCode || s.barcode;
      if (!barcode || seenBarcodes.has(barcode)) return;

      seenBarcodes.add(barcode);

      samples.push({
        barcode,
        sampleType: s.sampleTypeData?.sample_type || s.sampleType || s.sampleTypeName,
        sampleTypeId: s.sampleTypeData?.sample_type_id ?? s.sampleTypeId,
        status: s.status,
        testId: Number(s.testId)
      });
    });

    let overallReportStatus = 'pending';

    if (tests.length > 0) {
      const statuses = tests.map(t => (t.status || '').toLowerCase());

      if (statuses.length > 0 && statuses.every(s => s === 'cancel')) {
        overallReportStatus = 'cancel';
      } else if (statuses.every(s => s.includes('complete'))) {
        overallReportStatus = 'completed';
      } else if (statuses.some(s => s === 'snr')) {
        overallReportStatus = 'snr';
      } else if (statuses.some(s => s.includes('process'))) {
        overallReportStatus = 'in_process';
      }
    }

    return {
      ...raw,
      bookingId: raw.bookingId,
      patientId: raw.patientId,
      customerName: raw.customerName,
      title: raw.title,
      age: raw.age,
      ageType: raw.ageType,
      gender: raw.gender,
      createdBy: raw.createdBy,
      tests,
      samples,
      reports,
      doctor: {
        doctorId: raw.doctorId,
        doctor_name: raw.customDoctorName?.trim() || raw.doctorName || raw.doctor?.doctor_name || 'self'
      },
      franchise: {
        franchiseId: raw.franchiseId,
        franchiseName: raw.customFranchiseLab?.trim() || raw.franchiseName || raw.franchise?.franchiseName || 'SELF'
      },
      overallReportStatus,
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : undefined
    };
  }

  // ---------- data loading ----------
  loadBookings(): void {
    this.isLoadingList = true;

    const labId = this.labApi.getCurrentLabId();
    const searchActive = !!this.isSearchMode;

    const startDate = searchActive ? this.SEARCH_START_DATE : this.fromDate;
    const endDateExclusive = searchActive
      ? this.addOneDay(this.formatDateForInput(new Date()))
      : this.addOneDay(this.toDate);

    const franchiseId =
      this.selectedFranchiseId !== null &&
        this.selectedFranchiseId !== undefined &&
        this.selectedFranchiseId !== '' &&
        Number(this.selectedFranchiseId) > 0
        ? Number(this.selectedFranchiseId)
        : undefined;

    /*
     * All cases (All / Completed / SNR / Cancel / search) share a single
     * path — fetch the entire date-range dataset up front. This removes
     * the separate Load More logic that could cause tab-count mismatches.
     */
    this.fetchAllPagesForRange(labId, startDate, endDateExclusive, franchiseId).then((allResults) => {
      this.ngZone.run(() => {
        this.bookings = allResults.map((booking: any) => this.mapBookingItem(booking));
        this.totalBookingsFromServer = this.bookings.length;
        this.hasMore = false;
        this.isLoadingList = false;
        this.isLoadingMore = false;
        this.cdr.detectChanges();
      });
    });
  }

  // ---------- template aliases ----------
  loadData(): void {
    this.loadBookings();
  }

  get isLoading(): boolean {
    return this.isLoadingList;
  }

  private fetchAllPagesForRange(labId: number, startDate: string, endDate: string, franchiseId: any): Promise<any[]> {
    return new Promise((resolve) => {
      let allResults: any[] = [];
      let page = 0;
      const size = 100;
      const MAX_PAGES = 50;

      const fetchPage = () => {
        this.labApi.getBookingStatusNew(labId, page, size, startDate, endDate, franchiseId).subscribe({
          next: (res: any) => {
            const content = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
            allResults = allResults.concat(content);

            if (content.length === 0 || content.length < size || page >= MAX_PAGES) {
              resolve(allResults);
            } else {
              page++;
              fetchPage();
            }
          },
          error: () => resolve(allResults)
        });
      };

      fetchPage();
    });
  }

  // ---------- load more ----------
  loadMoreBookings(): void {
  }

  // ---------- apply filters ----------
  applyFilters(): void {
    this.loadBookings();
  }

  // ---------- franchise filter loading ----------
  private loadFilterFranchises(): void {
    // Read the current logged-in user data dynamically from AuthService.
    const currentRole = this.authService?.role;
    const currentFranchiseId = this.authService?.franchiseId;
    const currentFranchiseName = this.authService?.franchiseName;

    // Franchise users should always have their own franchise selected.
    const isFranchiseUser =
      currentRole === 'ROLE_FRANCHISE' ||
      currentRole === 'ROLE_FRANCHISE_STAFF';

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.filterFranchises = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);

          if (isFranchiseUser) {
            // Find the logged-in franchise in the available franchise list.
            const matchedFranchise = this.filterFranchises.find((f: any) =>
              Number(f?.franchiseId) === Number(currentFranchiseId)
            );

            if (matchedFranchise) {
              this.selectedFranchiseId = Number(matchedFranchise.franchiseId);
              this.franchiseSearchTerm = matchedFranchise.franchiseName || currentFranchiseName || '';
            } else if (
              currentFranchiseId !== null &&
              currentFranchiseId !== undefined &&
              Number(currentFranchiseId) > 0
            ) {
              // Franchise not found in the dropdown, but AuthService has a valid ID — use it directly.
              this.selectedFranchiseId = Number(currentFranchiseId);
              this.franchiseSearchTerm = currentFranchiseName || '';
            } else {
              this.selectedFranchiseId = null;
              this.franchiseSearchTerm = '';
            }
          } else {
            // LAB_ADMIN / STAFF: null means All Franchises.
            this.selectedFranchiseId = null;
            this.franchiseSearchTerm = '';
          }

          // Important: the booking API is only called once franchise selection is ready.
          this.loadBookings();

          this.cdr.detectChanges();
        });
      },

      error: () => {
        this.ngZone.run(() => {
          this.filterFranchises = [];

          /*
           * Even if the franchise list API fails, franchise users can still
           * load their own bookings using the dynamic AuthService franchise ID.
           */
          if (
            isFranchiseUser &&
            currentFranchiseId !== null &&
            currentFranchiseId !== undefined &&
            Number(currentFranchiseId) > 0
          ) {
            this.selectedFranchiseId = Number(currentFranchiseId);
            this.franchiseSearchTerm = currentFranchiseName || '';
          } else {
            // Admin / Staff: no franchise filter.
            this.selectedFranchiseId = null;
            this.franchiseSearchTerm = '';
          }

          this.loadBookings();

          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---------- clear franchise ----------
  clearFranchise(): void {
    // Franchise users cannot clear their own franchise filter.
    if (this.role === 'ROLE_FRANCHISE' || this.role === 'ROLE_FRANCHISE_STAFF') {
      const currentFranchiseId = this.authService?.franchiseId;
      const currentFranchiseName = this.authService?.franchiseName;

      this.selectedFranchiseId = currentFranchiseId ? Number(currentFranchiseId) : null;
      this.franchiseSearchTerm = currentFranchiseName || '';
      return;
    }

    // Admin / Staff: clear means All Franchises.
    this.franchiseSearchTerm = '';
    this.selectedFranchiseId = null;
    this.filteredFranchiseList = [];
    this.showFranchiseDropdown = false;

    this.loadBookings();
  }

  // ---------- track by ----------
  trackByBookingId(index: number, item: BookingListItem): number {
    return item.bookingId ?? item.id ?? index;
  }

  trackByBarcode(index: number, s: BookingSample): string {
    return s.barcode || String(index);
  }

  // ---------- single booking ----------
  private fetchSingleBooking(bookingId: number, cb: (b: BookingListItem) => void, onError?: () => void): void {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          cb(this.mapBookingItem(res));
          this.cdr.detectChanges();
        });
      },

      error: () => {
        this.ngZone.run(() => {
          this.showToast('Booking detail load fail zala', 'error');
          onError?.();
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---------- test preview modal (eye icon) ----------
  isTestPreviewModalOpen = false;
  previewBooking: BookingListItem | null = null;

  openTestPreview(item: BookingListItem, event?: MouseEvent): void {
    event?.stopPropagation(); // prevent the card-level click from firing
    this.previewBooking = item;
    this.isTestPreviewModalOpen = true;
  }

  closeTestPreview(): void {
    this.isTestPreviewModalOpen = false;
    this.previewBooking = null;
  }

  getReportProgress(item: BookingListItem): string {
    const testCount = item.tests?.length || 0;
    const completedCount = (item.tests || [])
      .filter(t => this.isCompleteOrReady(this.normalizeStatus(t.status)))
      .length;
    return `${completedCount}/${testCount}`;
  }

  getTestCountStatusClass(item: BookingListItem): string {
    const testCount = item.tests?.length || 0;
    if (testCount === 0) return 'pending';

    const completedCount = (item.tests || [])
      .filter(t => this.isCompleteOrReady(this.normalizeStatus(t.status)))
      .length;
    return completedCount === testCount ? 'completed' : 'pending';
  }

  testStatusClass(status?: string): string {
    const s = this.normalizeStatus(status, 'snr');

    if (s === 'cancel' || s === 'cancelled') return 'badge-cancel';
    if (s === 'snr') return 'badge-snr';
    if (s.includes('clinical')) return 'badge-clinical';
    if (s.includes('recheck') || s.includes('hold')) return 'badge-recheck';
    if (this.isCompleteOrReady(s)) return 'badge-ready';
    if (s.includes('process') || s.includes('outsource') || s.includes('doctor approval')) return 'badge-inprocess';

    return 'badge-pending';
  }

  testStatusLabel(status?: string): string {
    const s = this.normalizeStatus(status, 'snr');

    if (s === 'cancel' || s === 'cancelled') return 'CANCEL';
    if (s === 'snr') return 'SNR';
    if (s.includes('clinical')) return 'CLINICAL';
    if (s.includes('recheck') || s.includes('hold')) return 'RECHECK & HOLD';
    if (this.isCompleteOrReady(s)) return 'COMPLETE';
    if (s.includes('process') || s.includes('outsource') || s.includes('doctor approval')) return 'IN PROCESS';

    return 'PENDING';
  }

  // ---------- action menu ----------

  /**
   * ✅ FIXED VERSION
   * The old logic guessed the dropdown's height with a hardcoded
   * `menuHeightEstimate = 260`. The real menu now has up to 9 items
   * (~350-400px), so the guess was wrong and the menu could render
   * partially off the bottom of the screen (web + Capacitor APK both).
   *
   * Fix: open the menu off-screen first (invisible), let Angular render
   * it, measure its REAL height/width on the next animation frame, and
   * only then calculate the final on-screen position (flip up if it
   * doesn't fit below, clamp inside viewport as a last resort).
   */
  toggleActionMenu(item: BookingListItem, event: MouseEvent): void {
    event.stopPropagation();

    if (this.openActionRowId === item.bookingId) {
      this.closeActionMenu();
      return;
    }

    const anchorRect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    // Render off-screen first so we can measure the real size.
    this.actionMenuPosition = { top: -9999, left: -9999 };
    this.openActionRowId = item.bookingId;
    this.openActionItem = item;
    document.body.classList.add('action-menu-open');
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      // Guard: user might have closed the menu again before this frame runs.
      if (this.openActionRowId !== item.bookingId) return;
      this.positionActionMenu(anchorRect);
      this.cdr.detectChanges();
    });
  }

  private positionActionMenu(anchorRect: DOMRect): void {
    const menuEl = this.actionDropdownRef?.nativeElement;

    // Real measured size — fallback estimate only if the element wasn't found.
    const menuWidth = menuEl?.offsetWidth || 216;
    const menuHeight = menuEl?.offsetHeight || 320;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 8;

    // ---- horizontal ----
    let left = anchorRect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > viewportW - margin) left = viewportW - menuWidth - margin;

    // ---- vertical: try below the button first ----
    let top = anchorRect.bottom + 6;

    // Doesn't fit below → flip above the button.
    if (top + menuHeight > viewportH - margin) {
      top = anchorRect.top - menuHeight - 6;
    }

    // Still doesn't fit (e.g. button is near the top of a short screen) →
    // clamp inside the viewport. CSS max-height + overflow-y:auto on
    // .action-dropdown handles scrolling for whatever doesn't fit.
    if (top < margin) top = margin;
    if (top + menuHeight > viewportH - margin) {
      top = Math.max(margin, viewportH - menuHeight - margin);
    }

    this.actionMenuPosition = { top, left };
  }

  closeActionMenu(): void {
    this.openActionRowId = null;
    this.openActionItem = null;
    document.body.classList.remove('action-menu-open');
  }

  // ---------- print bill ----------
  printBill(item: BookingListItem): void {
    this.closeActionMenu();
    if (this.generatingBillId === item.bookingId) return;
    this.generatingBillId = item.bookingId;

    const payload = this.labApi.buildBillPayload(item.bookingId);
    this.labApi.printBill(payload).subscribe({
      next: (res: any) => this.ngZone.run(() => {
        this.generatingBillId = null;
        if (res?.downloadUrl) {
          window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
          this.showToast('Bill ready', 'success');
        } else {
          this.showToast(res?.message || 'Bill PDF banवता aala nahi', 'error');
        }
        this.cdr.detectChanges();
      }),
      error: () => {
        this.ngZone.run(() => {
          this.generatingBillId = null;
          this.showToast('Bill generate karnyat error aali', 'error');
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---------- share report via whatsapp ----------
  shareViaWhatsApp(item: BookingListItem): void {
    this.closeActionMenu();

    if (this.sharingWhatsappId === item.bookingId) return;
    this.sharingWhatsappId = item.bookingId;

    this.labApi.shareReportViaWhatsApp(item.bookingId).subscribe({
      next: (res: any) => this.ngZone.run(() => {
        this.sharingWhatsappId = null;

        if (res?.success === false) {
          this.showToast(res?.message || 'Failed to share the report via WhatsApp.', 'error');
          return;
        }

        this.showToast('Report shared via WhatsApp successfully.', 'success');
        this.cdr.detectChanges();
      }),
      error: (err) => {
        this.ngZone.run(() => {
          this.sharingWhatsappId = null;
          this.showToast(
            err?.error?.message || 'Failed to share the report via WhatsApp. Please try again.',
            'error'
          );
        });
      }
    });
  }

  // ---------- edit test ----------
  editTest(item: BookingListItem): void {
    this.closeActionMenu();
    this.selectedBooking = item;
    this.selectedTests = JSON.parse(JSON.stringify(item.tests || []));
    this.discount = item.discountAmount || 0;
    this.basePaidAmount = item.paidAmount || 0;
    this.payNowAmount = 0;
    this.paidAmount = this.basePaidAmount;
    this.paymentMethod = 'cash';
    this.searchTerm = '';
    this.filteredTests = [];
    this.isTestLoading = true;
    this.isTestModalOpen = true;

    this.fetchSingleBooking(item.bookingId, (fresh) => {
      if (fresh.tests && fresh.tests.length > 0) {
        this.selectedBooking = fresh;
        this.selectedTests = JSON.parse(JSON.stringify(fresh.tests || []));
        this.discount = fresh.discountAmount || 0;
        this.basePaidAmount = fresh.paidAmount || 0;
        this.payNowAmount = 0;
        this.paidAmount = this.basePaidAmount;
      }
      this.isTestLoading = false;
    }, () => { this.isTestLoading = false; });
  }

  closeTestModal(): void {
    this.isTestModalOpen = false;
    this.isTestLoading = false;
    this.isSavingTest = false;
    this.selectedBooking = null;
    this.selectedTests = [];
    this.basePaidAmount = 0;
    this.payNowAmount = 0;
    this.paidAmount = 0;
  }

  searchTests(): void {
    const q = this.searchTerm.trim();

    if (!q) {
      this.filteredTests = [];
      return;
    }

    const labId = this.labApi.getCurrentLabId();

    // The booking's own franchise decides the B2B price shown here
    // (not the list filter) — that's the actual franchise this booking belongs to.
    const franchiseId =
      this.selectedBooking?.franchise?.franchiseId ??
      this.selectedFranchiseId ??
      undefined;

    this.labApi.searchTests(labId, franchiseId, q).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.content) ? res.content : [];

        this.filteredTests = list
          .filter((t: any) =>
            !this.selectedTests.some(s => s.testName === String(t.test_name || '').trim())
          )
          .map((t: any) => ({
            testId: t.testId,
            testName: String(t.test_name || 'Unnamed Test').trim(),
            testMrp: t.test_price ?? 0,

            // Admin always sees the base rate (price2); Franchise/Staff see their
            // franchise-specific assignedPrice — same rule as add-patient.
            testPrice: this.isAdminRole ? (t.price2 ?? 0) : (t.assignedPrice ?? t.price2 ?? 0)
          }));
      },
      error: () => {
        this.filteredTests = [];
      }
    });
  }

  addTest(test: BookingTest): void {
    this.selectedTests.push({ ...test, resultValue: '', isNewlyAdded: true });
    this.searchTerm = '';
    this.filteredTests = [];
    this.showToast(`${test.testName} added`, 'success');
  }

  async removeTest(test: BookingTest): Promise<void> {
    // ---------------------------------------------------------------
    // Confirm-delete popup
    // ---------------------------------------------------------------
    const alert = await this.alertController.create({
      cssClass: 'premium-alert',
      header: 'Delete Test',
      message: `Are you sure you want to delete "${test.testName}"?`,
      buttons: [
        {
          text: 'No',
          role: 'cancel',
          cssClass: 'alert-btn-cancel'
        },
        {
          text: 'Yes, Delete',
          role: 'destructive',
          cssClass: 'alert-btn-danger',

          handler: () => {
            /*
             * Newly added test — not yet saved to the database.
             * Only remove the selected test from the UI.
             */
            if (test.isNewlyAdded) {
              this.selectedTests = this.selectedTests.filter(t => t !== test);

              if (this.selectedBooking?.tests) {
                this.selectedBooking.tests = this.selectedBooking.tests.filter((t: BookingTest) => t !== test);
              }

              // Emptying the booking (selectedTests = []) is allowed.

              this.showToast(`${test.testName} removed`, 'warning');
              this.cdr.detectChanges();
              return;
            }

            // ---------------------------------------------------------
            // Existing database test
            // ---------------------------------------------------------
            if (!test.testMappingId) {
              this.showToast('Test ID missing. Cannot delete this test.', 'error');
              return;
            }

            const labId = this.labApi.getCurrentLabId();

            if (!labId) {
              this.showToast('Lab ID missing. Cannot delete test.', 'error');
              return;
            }

            const bookingId = this.selectedBooking?.bookingId;

            if (!bookingId) {
              this.showToast('Booking ID missing. Cannot delete test.', 'error');
              return;
            }

            // Delete only the selected test from the database.
            this.labApi.deleteTestFromBooking(labId, bookingId, test.testMappingId).subscribe({
              next: () => {
                this.ngZone.run(() => {
                  // Remove only the selected test — the rest stay as-is.
                  // If it was the last test, this results in [].
                  this.selectedTests = this.selectedTests.filter(t => t.testMappingId !== test.testMappingId);

                  if (this.selectedBooking?.tests) {
                    this.selectedBooking.tests = this.selectedBooking.tests.filter(
                      (t: BookingTest) => t.testMappingId !== test.testMappingId
                    );
                  }

                  this.showToast(`${test.testName} deleted successfully`, 'success');
                  this.cdr.detectChanges();
                  this.loadBookings();
                });
              },

              error: (err) => {
                this.ngZone.run(() => {
                  this.showToast(err?.error?.message || 'Failed to delete test from database.', 'error');
                });
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  onDiscountChange(): void {
    if (!this.canEditBilling) { this.discount = 0; return; }
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
    this.onPayNowChange();
  }

  onPayNowChange(): void {
    if (!this.canViewPayment) { this.payNowAmount = 0; this.paidAmount = this.basePaidAmount; return; }
    if (this.payNowAmount < 0) this.payNowAmount = 0;

    const maxPayable = Math.max(0, this.totalAmount - this.basePaidAmount);
    if (this.payNowAmount > maxPayable) this.payNowAmount = maxPayable;

    this.paidAmount = this.basePaidAmount + this.payNowAmount;
  }

  updateTestBooking(): void {
    if (!this.selectedBooking || this.isSavingTest) return;

    // Empty test lists are allowed — a user can delete all tests and still save/update the booking.

    this.isSavingTest = true;

    const labId = this.labApi.getCurrentLabId();
    const bookingId = this.selectedBooking.bookingId;

    const newTests = this.selectedTests.filter(t => t.isNewlyAdded);
    const existingTests = this.selectedTests.filter(t => !t.isNewlyAdded);

    const patientBody: any = {
      bookingId,
      customerName: this.selectedBooking.customerName,
      ageType: this.selectedBooking.ageType,
      age: this.selectedBooking.age,
      gender: this.selectedBooking.gender,
      mobileNumber: this.selectedBooking.mobileNumber,
      aadhaarNumber: this.selectedBooking.aadhaarNumber,
      doctorid: this.selectedBooking.doctor?.doctorId,
      franchiseId: this.selectedBooking.franchise?.franchiseId,
      createdOn: this.selectedBooking.createdOn,

      // Existing tests — [] if all tests were deleted (this is allowed).
      tests: existingTests.map(t => ({
        testId: t.testId,
        profileId: 0
      })),

      // Billing
      subTotalAmount: this.subTotal,
      discountAmount: this.canEditBilling ? this.discount : (this.selectedBooking.discountAmount || 0),
      totalAmount: this.canEditBilling ? this.totalAmount : (this.selectedBooking.totalAmount || 0),
      paidAmount: this.canEditBilling ? this.paidAmount : (this.selectedBooking.paidAmount || 0),
      dueAmount: this.canEditBilling ? this.dueAmount : (this.selectedBooking.dueAmount || 0),
      payNowAmount: this.canEditBilling ? this.payNowAmount : 0,
      paymentMode: this.paymentMethod
    };

    this.labApi.updatePatient(labId, bookingId, patientBody).subscribe({
      next: () => {
        // If new tests are present, add only the newly added ones.
        if (newTests.length > 0) {
          const addTestBody: any = {
            bookingId,
            customerName: this.selectedBooking!.customerName,
            age: this.selectedBooking!.age,
            ageType: this.selectedBooking!.ageType,
            gender: this.selectedBooking!.gender,
            aadhaarNumber: this.selectedBooking!.aadhaarNumber || '',
            tests: newTests.map(t => ({
              testId: t.testId,
              testName: t.testName,
              // B2B/billing price goes into "testPrice".
              testPrice: t.testPrice ?? t.testMrp,
              doctorTestDiscountPrice: 0,
              doctorTestCommissionPrice: 0,
              // MRP goes into "test_price" — naming kept consistent with the
              // convention used elsewhere for test pricing.
              test_price: t.testMrp,
              assignedPrice: [t.testPrice ?? t.testMrp],
              source: t.method || 'RPL',
              discount: 0,
              newTest: true
            }))
          };

          this.labApi.addTestToBooking(addTestBody).subscribe({
            next: () => {
              this.verifyAndFinishSave(bookingId, newTests);
            },

            error: (err) => {
              this.ngZone.run(() => {
                this.isSavingTest = false;
                this.showToast('Naveen test add nahi zala: ' + (err.error?.message || 'Unknown error'), 'error');
              });
            }
          });
        } else {
          // No new tests — also covers selectedTests = []. The booking is still saved/updated.
          this.verifyAndFinishSave(bookingId, []);
        }
      },

      error: (err) => {
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Failed to update booking: ' + (err.error?.message || 'Unknown error'), 'error');
        });
      }
    });
  }

  private verifyAndFinishSave(bookingId: number, newTests: BookingTest[]): void {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (freshRes: any) => {
        const savedTestIds = new Set((freshRes.tests || []).map((t: any) => String(t.testId)));
        const missingNewTests = newTests.filter(t => !savedTestIds.has(String(t.testId)));

        this.ngZone.run(() => {
          this.isSavingTest = false;

          if (missingNewTests.length > 0) {
            const names = missingNewTests.map(t => t.testName).join(', ');
            this.showToast(
              `Yeh test add nahi zala: ${names}. Kripya thodya vela nantar punha try kara, ki system admin la sanga.`,
              'error'
            );
            this.selectedTests = this.selectedTests.filter(
              t => !t.isNewlyAdded || missingNewTests.some(m => m.testId === t.testId)
            );
            this.loadBookings();
            return;
          }

          this.showToast('Booking updated successfully', 'success');
          this.closeTestModal();
          this.loadBookings();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Saved, but refresh failed — please reopen', 'warning');
          this.closeTestModal();
          this.loadBookings();
        });
      }
    });
  }

  // ---------- edit patient ----------
  editPatient(item: BookingListItem): void {
    if (!this.canEditPatient) return;
    this.closeActionMenu();
    this.editPatientData = null;
    this.isPatientLoading = true;
    this.isPatientModalOpen = true;

    this.fetchSingleBooking(item.bookingId, (fresh) => {
      const data: any = JSON.parse(JSON.stringify(fresh));
      data.name = fresh.customerName;
      data.doctor = fresh.doctor?.doctor_name || '';
      data.doctorId = fresh.doctor?.doctorId || null;
      data.lab = fresh.franchise?.franchiseName || 'SELF';
      data.franchiseId = fresh.franchise?.franchiseId || null;
      data.title = fresh.title || '';
      data.doctorTitle = '';
      data.customDoctorName = fresh.customDoctorName || '';
      data.customFranchiseLab = fresh.customFranchiseLab || '';
      this.editPatientData = data;

      this.doctorSearch = data.doctor;
      this.customLabSearch = data.customFranchiseLab || '';
      this.isPatientLoading = false;
    }, () => {
      this.isPatientLoading = false;
      this.isPatientModalOpen = false;
    });
  }

  closePatientModal(): void {
    this.isPatientModalOpen = false;
    this.isPatientLoading = false;
    this.editPatientData = null;
    this.doctorSearch = '';
    this.customLabSearch = '';
    this.filteredCustomLabs = [];
    this.showCustomLabDropdown = false;
  }

  updatePatient(): void {
    if (!this.canEditPatient || !this.editPatientData) return;

    const doctorId = Number(this.editPatientData.doctorId || 0);
    const doctorName = String(this.editPatientData.doctor || '').trim();
    const franchiseId = Number(this.editPatientData.franchiseId || 0);
    const labName = String(this.editPatientData.lab || '').trim();

    const body = {
      bookingId: this.editPatientData.bookingId,
      customerName: this.editPatientData.name,
      title: this.editPatientData.title,
      ageType: this.editPatientData.ageType,
      age: this.editPatientData.age,
      gender: this.editPatientData.gender,
      mobileNumber: this.editPatientData.mobileNumber,
      aadhaarNumber: this.editPatientData.aadhaarNumber,
      uhidNumber: this.editPatientData.uhidNumber,
      doctorid: doctorId > 0 ? doctorId : 0,
      customDoctorName: String(this.editPatientData.customDoctorName || '').trim(),
      franchiseId: franchiseId > 0 ? franchiseId : (this.editPatientData.franchiseId || 0),
      customFranchiseLab: String(this.editPatientData.customFranchiseLab || '').trim(),
      createdOn: this.editPatientData.createdOn
    };

    const bookingId = this.editPatientData.bookingId;

    this.labApi.updatePatient(this.labApi.getCurrentLabId(), bookingId, body).subscribe({
      next: () => this.ngZone.run(() => {
        this.showToast('Patient updated successfully', 'success');
        const idx = this.bookings.findIndex(b => b.bookingId === bookingId);

        if (idx > -1) {
          const updated: BookingListItem = { ...this.bookings[idx] };
          const customDoctorName = String(this.editPatientData.customDoctorName || '').trim();
          const customFranchiseLab = String(this.editPatientData.customFranchiseLab || '').trim();

          updated.customerName = this.editPatientData.name;
          updated.title = this.editPatientData.title;
          updated.age = this.editPatientData.age;
          updated.ageType = this.editPatientData.ageType;
          updated.gender = this.editPatientData.gender;
          updated.aadhaarNumber = this.editPatientData.aadhaarNumber;
          updated.uhidNumber = this.editPatientData.uhidNumber;
          updated.customDoctorName = customDoctorName;
          updated.customFranchiseLab = customFranchiseLab;

          updated.doctor = {
            doctorId: doctorId > 0 ? doctorId : undefined,
            doctor_name: customDoctorName || doctorName || 'self'
          };
          updated.franchise = {
            franchiseId: franchiseId > 0 ? franchiseId : undefined,
            franchiseName: customFranchiseLab || labName || 'SELF'
          };

          this.bookings = [
            ...this.bookings.slice(0, idx),
            updated,
            ...this.bookings.slice(idx + 1)
          ];
        }

        this.closePatientModal();
        this.cdr.detectChanges();
      }),
      error: () => {
        this.ngZone.run(() => this.showToast('Patient update fail zala', 'error'));
      }
    });
  }

  openDoctorPicker(): void {
    this.selectedDoctorPick = null;
    this.showDoctorPicker = true;
    this.labApi.getDoctors().subscribe({
      next: (res: any) => this.ngZone.run(() => {
        this.doctors = res?.content || res || [];
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => this.showToast('Failed to load doctors', 'error'))
    });
  }

  selectDoctorForEdit(doc: any): void {
    if (!doc || !this.editPatientData) return;
    this.editPatientData.doctor = doc?.doctor_name;
    this.editPatientData.doctorId = doc?.doctorId;
    this.showDoctorPicker = false;
  }

  openLabPicker(): void {
    if (!this.isAdminRole) return;
    this.selectedLabPick = null;
    this.showLabPicker = true;
    this.labApi.getFranchises().subscribe({
      next: (res: any) => this.ngZone.run(() => {
        this.labs = res?.content || res || [];
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => this.showToast('Failed to load labs', 'error'))
    });
  }

  selectLabForEdit(lab: any): void {
    if (!this.isAdminRole || !lab || !this.editPatientData) return;
    this.editPatientData.lab = lab?.franchiseName || lab?.name;
    this.editPatientData.franchiseId = lab?.franchiseId;
    this.showLabPicker = false;
  }

  searchCustomLabInput(): void {
    const q = String(this.customLabSearch || '').trim().toLowerCase();
    if (!this.editPatientData) return;

    this.editPatientData.customFranchiseLab = this.customLabSearch;

    if (!q) {
      this.filteredCustomLabs = [];
      this.showCustomLabDropdown = false;
      return;
    }

    this.labApi.getFranchiseLabs().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.content || []);
        this.filteredCustomLabs = list.filter((lab: any) => {
          const name = String(lab?.labName || lab?.franchiseName || lab?.name || '').trim().toLowerCase();
          return name.includes(q);
        });
        this.showCustomLabDropdown = this.filteredCustomLabs.length > 0;
      },
      error: () => { this.filteredCustomLabs = []; this.showCustomLabDropdown = false; }
    });
  }

  selectCustomLabFromSearch(lab: any): void {
    if (!lab || !this.editPatientData) return;
    const name = String(lab?.labName || lab?.franchiseName || lab?.name || '').trim();
    this.editPatientData.customFranchiseLab = name;
    this.customLabSearch = name;
    this.showCustomLabDropdown = false;
  }

  onPatientFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.editPatientData.attachment = reader.result;
      this.editPatientData.attachmentName = file.name;
    };
    reader.readAsDataURL(file);
  }

  // ---------- notes ----------
  openNoteModal(item: BookingListItem): void {
    this.closeActionMenu();
    this.noteBooking = item;
    this.noteText = '';
    this.isNoteModalOpen = true;
  }

  closeNoteModal(): void {
    this.isNoteModalOpen = false;
    this.noteBooking = null;
    this.noteText = '';
  }

  saveNote(): void {
    if (!this.noteBooking || !this.noteText.trim()) {
      this.showToast('Kripya note lihi', 'warning');
      return;
    }
    this.isSavingNote = true;
    const labId = this.labApi.getCurrentLabId();
    const bookingId = this.noteBooking.bookingId;

    this.fetchSingleBooking(bookingId, (fresh) => {
      const body: any = {
        bookingId,
        customerName: fresh.customerName,
        ageType: fresh.ageType,
        age: fresh.age,
        gender: fresh.gender,
        mobileNumber: fresh.mobileNumber,
        aadhaarNumber: fresh.aadhaarNumber,
        doctorid: fresh.doctor?.doctorId,
        franchiseId: fresh.franchise?.franchiseId,
        createdOn: fresh.createdOn,
        remark: this.noteText.trim(),
        bookingComment: this.noteText.trim()
      };

      this.labApi.updatePatient(labId, bookingId, body).subscribe({
        next: () => this.ngZone.run(() => {
          this.isSavingNote = false;
          this.showToast('Note added successfully', 'success');
          this.closeNoteModal();
          this.loadBookings();
        }),
        error: () => {
          this.ngZone.run(() => {
            this.isSavingNote = false;
            this.showToast('Note save fail zala', 'error');
          });
        }
      });
    }, () => {
      this.isSavingNote = false;
      this.showToast('Booking detail load fail zala', 'error');
    });
  }

  // ---------- history ----------
  openHistoryModal(item: BookingListItem): void {
    this.closeActionMenu();
    this.isLoadingHistory = true;
    this.isHistoryModalOpen = true;
    this.fetchSingleBooking(item.bookingId, (fresh) => {
      this.historyBooking = fresh;
      this.isLoadingHistory = false;
    });
  }

  closeHistoryModal(): void {
    this.isHistoryModalOpen = false;
    this.historyBooking = null;
  }

  // ---------- barcode ----------
  openBarcodeModal(item: BookingListItem): void {
    this.closeActionMenu();
    this.barcodeBooking = item;

    this.barcodeRows = (item.samples || []).map((s: any) => {
      const matchedTest = (item.tests || []).find(t => Number(t.testId) === Number(s.testId));
      const testStatus = (matchedTest?.status || '').toLowerCase();

      let displayStatus: string;
      let canEdit: boolean;

      if (testStatus === 'cancel' || testStatus === 'cancelled') {
        displayStatus = 'CANCEL';
        canEdit = false;
      } else if (testStatus === 'snr') {
        displayStatus = 'PENDING';
        canEdit = true;
      } else {
        displayStatus = 'RECEIVED';
        canEdit = false;
      }

      return {
        accessionId: s.accessionId || s.sampleAccessionId,
        sampleTypeId: s.sampleTypeId,
        testId: Number(s.testId),
        sampleType: s.sampleType || '-',
        oldBarcode: s.barcode,
        newBarcode: s.barcode,
        receiveDate: '',
        status: displayStatus,
        canEditBarcode: canEdit,
        saving: false
      };
    });

    this.isBarcodeModalOpen = true;
  }

  closeBarcodeModal(): void {
    this.isBarcodeModalOpen = false;
    this.barcodeBooking = null;
    this.barcodeRows = [];
  }

  openDateTimePicker(row: { receiveDate: string }): void {
    this.activeDateTimeRow = row;
    this.tempDateTimeValue = row.receiveDate
      ? (row.receiveDate.length === 16 ? row.receiveDate + ':00' : row.receiveDate)
      : new Date().toISOString().slice(0, 19);
  }

  closeDateTimePicker(): void {
    this.activeDateTimeRow = null;
    this.tempDateTimeValue = '';
  }

  confirmDateTime(): void {
    if (this.activeDateTimeRow && this.tempDateTimeValue) {
      this.activeDateTimeRow.receiveDate = this.tempDateTimeValue.slice(0, 16);
    }
    this.closeDateTimePicker();
  }

  canDeleteBooking(item: BookingListItem): boolean {
    const tests = item.tests || [];
    if (tests.length === 0) return false;

    // Delete is only allowed when every test is SNR — if any test is
    // complete/in-process/cancel, deletion is not shown.
    return tests.every(t => (t.status || '').toLowerCase() === 'snr');
  }

  async deleteBooking(item: BookingListItem): Promise<void> {
    this.closeActionMenu();

    const alert = await this.alertController.create({
      cssClass: 'premium-alert',
      header: 'Confirmation',
      message: 'Are you sure you want to Delete this booking? Deleting a booking will remove all associated data, including tests, samples, and reports.',
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'alert-btn-cancel' },
        {
          text: 'Delete',
          cssClass: 'alert-btn-danger',
          handler: () => {
            const labId = this.labApi.getCurrentLabId();
            this.labApi.deleteBooking(labId, item.bookingId).subscribe({
              next: () => this.ngZone.run(() => {
                this.showToast('Booking deleted successfully', 'success');
                this.loadBookings();
              }),
              error: (err) => this.ngZone.run(() => {
                this.showToast('Booking delete fail zala: ' + (err.error?.message || 'Unknown error'), 'error');
              })
            });
          }
        }
      ]
    });
    await alert.present();
  }

  updateBarcodeRow(row: {
    sampleTypeId?: number; testId?: number; newBarcode: string; oldBarcode: string;
    receiveDate: string; status: string; canEditBarcode: boolean; saving: boolean;
  }): void {
    if (!row.canEditBarcode) {
      this.showToast('Ha barcode edit karayla allowed nahi (test in-process/complete ahe)', 'warning');
      return;
    }
    if (!row.newBarcode?.trim()) {
      this.showToast('Barcode rikama thevu naka', 'warning');
      return;
    }
    if (!this.barcodeBooking) {
      return;
    }

    const trimmedNewBarcode = row.newBarcode.trim();

    if (trimmedNewBarcode === row.oldBarcode) {
      this.showToast('Barcode unchanged.', 'warning');
      return;
    }

    // Confirm another row in this same booking doesn't already use this barcode (local check).
    const isDuplicateLocally = this.barcodeRows.some(
      r => r !== row && String(r.oldBarcode || '').trim() === trimmedNewBarcode
    );

    if (isDuplicateLocally) {
      this.showToast('This barcode is already used for another sample in this booking.', 'error');
      return;
    }

    row.saving = true;
    const bookingId = this.barcodeBooking.bookingId;
    const payload = [{
      oldBarcode: row.oldBarcode,
      updatedBarcode: trimmedNewBarcode,
      receiveDate: row.receiveDate || '',
      sampleTypeId: row.sampleTypeId,
      bookingId
    }];

    this.labApi.updateBarcode(bookingId, payload).subscribe({
      next: () => {

        // The backend can occasionally return HTTP 200 for a duplicate barcode
        // without actually updating the row (silent no-op). Re-fetch the
        // booking to verify the new barcode really was saved before trusting
        // the HTTP success.
        this.labApi.getSingleBooking(bookingId).subscribe({

          next: (freshRes: any) => {

            this.ngZone.run(() => {

              row.saving = false;

              const freshSamples = freshRes?.sampleAccessions || freshRes?.samples || [];

              const matchedFreshSample = freshSamples.find(
                (s: any) =>
                  Number(s?.testId) === Number(row.testId) &&
                  Number(s?.sampleTypeId ?? s?.sampleTypeData?.sample_type_id) === Number(row.sampleTypeId)
              );

              const savedBarcode = String(
                matchedFreshSample?.barCode || matchedFreshSample?.barcode || ''
              ).trim();

              if (savedBarcode && savedBarcode === trimmedNewBarcode) {

                // Confirmed saved in the backend.
                row.oldBarcode = trimmedNewBarcode;
                row.status = 'RECEIVED';
                this.showToast('Barcode updated successfully', 'success');
                this.cdr.detectChanges();
                this.fetchSingleBooking(bookingId, () => this.loadBookings());

              } else {

                // Backend silently rejected it (barcode already used elsewhere) —
                // revert the UI instead of showing a false success.
                row.newBarcode = row.oldBarcode;
                this.showToast(
                  'This barcode has already been used elsewhere. Please enter a different barcode.',
                  'error'
                );
                this.cdr.detectChanges();
              }
            });
          },

          error: () => {
            this.ngZone.run(() => {
              row.saving = false;
              this.showToast('Barcode update sent, but could not confirm. Please refresh and check.', 'warning');
            });
          }
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          row.saving = false;
          this.showToast('Barcode update fail zala: ' + (err.error?.message || 'Unknown error'), 'error');
        });
      }
    });
  }

  // ---------- bill history ----------
  openBillHistoryModal(item: BookingListItem): void {
    this.closeActionMenu();
    this.fetchSingleBooking(item.bookingId, (fresh) => {
      this.billHistoryBooking = fresh;
      this.isBillHistoryModalOpen = true;
    });
  }

  closeBillHistoryModal(): void {
    this.isBillHistoryModalOpen = false;
    this.billHistoryBooking = null;
  }

  // ============================================================
// COPY BARCODE TO CLIPBOARD
// ============================================================

async copyBarcode(barcode: string): Promise<void> {

  const value = String(barcode || '').trim();

  if (!value || value === '—') {
    this.toastService.warning(
      'Nothing to Copy',
      'No barcode available.'
    );
    return;
  }

  try {

    await navigator.clipboard.writeText(value);

    this.toastService.success(
      'Copied',
      'Barcode ' + value + ' copied to clipboard.'
    );

  } catch (err) {

    console.error('COPY BARCODE ERROR:', err);

    // Fallback for older WebViews where navigator.clipboard is unavailable
    const tempInput = document.createElement('textarea');
    tempInput.value = value;
    tempInput.style.position = 'fixed';
    tempInput.style.opacity = '0';
    document.body.appendChild(tempInput);
    tempInput.focus();
    tempInput.select();

    try {
      document.execCommand('copy');
      this.toastService.success(
        'Copied',
        'Barcode ' + value + ' copied to clipboard.'
      );
    } catch {
      this.toastService.error(
        'Copy Failed',
        'Could not copy barcode. Please copy manually.'
      );
    } finally {
      document.body.removeChild(tempInput);
    }
  }
}
}