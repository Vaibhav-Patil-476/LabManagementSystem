import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef, HostListener, ViewChild } from '@angular/core';
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
  refreshOutline, searchOutline, closeCircleOutline
} from 'ionicons/icons';
import { ToastService } from '../../services/toast';
import { LabApiService } from '../../services/lab-api';
import { AuthService } from '../../services/auth';

export interface BookingSample {
  accessionId?: number;
  sampleAccessionId?: number;
  barcode: string;
  sampleType?: string;
  sampleTypeId?: number;
  status?: string;
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

  currentPage = 0;
  pageSize = 20;

  private readonly SEARCH_START_DATE = '2015-01-01';
  private readonly SEARCH_PAGE_SIZE = 500;
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
    accessionId?: number; sampleTypeId?: number; sampleType: string;
    oldBarcode: string; newBarcode: string; receiveDate: string;
    status: string; saving: boolean;
  }[] = [];
  activeDateTimeRow: any = null;
  tempDateTimeValue = '';

  isBillHistoryModalOpen = false;
  billHistoryBooking: BookingListItem | null = null;

  openActionRowId: number | null = null;
  generatingBillId: number | null = null;
  openActionItem: BookingListItem | null = null;
  actionMenuPosition = { top: 0, left: 0 };
  expandedBookingId: number | null = null;
  role = '';

readonly statusTabs: { key: string; label: string; badgeClass: string }[] = [
  { key: 'all', label: 'All', badgeClass: 'badge-all' },
  { key: 'completed', label: 'Completed', badgeClass: 'badge-complete' },
  { key: 'pending', label: 'Pending', badgeClass: 'badge-pending' },
  { key: 'in_process', label: 'In Process', badgeClass: 'badge-clinical' },
  { key: 'snr', label: 'SNR', badgeClass: 'badge-snr' },
];

 get statusBucketCount(): Record<string, number> {
  const counts: Record<string, number> = { all: 0, completed: 0, in_process: 0, pending: 0, snr: 0 };

  let source = this.canViewAllBookings ? this.bookings : this.bookings.filter(b => b.createdBy === this.currentUserId);

  // ✅ NEW — quickSearch lagu asel tar counts pan tyaच matched data varunach kadha
  const q = this.quickSearch?.trim().toLowerCase();
  if (q) {
    source = source.filter(b =>
      String(b.bookingId).includes(q) ||
      (b.patientId || '').toLowerCase().includes(q) ||
      (b.customerName || '').toLowerCase().includes(q) ||
      (b.doctor?.doctor_name || '').toLowerCase().includes(q)
    );
  }

  source.forEach(b => {
    counts['all'] = counts['all'] + 1;
    const status = b.overallReportStatus || 'pending';
    if (counts[status] !== undefined) {
      counts[status] = counts[status] + 1;
    }
  });
  return counts;
}
  setStatusTab(key: string) {
    this.selectedReportStatus = key;
  }
  availableTests: BookingTest[] = [];
  private currentUserId = 0;

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;
  franchiseSearchTerm = '';
  filteredFranchiseList: any[] = [];
  showFranchiseDropdown = false;

  onFranchiseSearch() {
    const q = this.franchiseSearchTerm.trim().toLowerCase();
    if (!q) { this.filteredFranchiseList = []; this.selectedFranchiseId = null; this.applyFilters(); return; }
    this.filteredFranchiseList = this.filterFranchises.filter((f: any) =>
      (f.franchiseName || f.name || '').toLowerCase().includes(q)
    );
    this.showFranchiseDropdown = true;
  }

  selectFranchise(f: any) {
    this.franchiseSearchTerm = f.franchiseName || f.name;
    this.selectedFranchiseId = f.franchiseId;
    this.showFranchiseDropdown = false;
    this.applyFilters();
  }

  clearFranchise() {
    this.franchiseSearchTerm = '';
    this.selectedFranchiseId = null;
    this.filteredFranchiseList = [];
    this.applyFilters();
  }
  get isSearchMode(): boolean { return this.quickSearch.trim().length > 0; }
  get isAdminRole(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get canViewAmount(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get isFranchiseRole(): boolean { return this.role === this.ROLE_FRANCHISE || this.role === this.ROLE_FRANCHISE_STAFF; }
  get canEditBilling(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get canEditPatient(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get canViewAllBookings(): boolean { return this.role === this.ROLE_LAB_ADMIN; }
  get canSaveBooking(): boolean {
    return [this.ROLE_LAB_ADMIN, this.ROLE_STAFF, this.ROLE_FRANCHISE, this.ROLE_FRANCHISE_STAFF].includes(this.role);
  }
  get subTotal(): number {
    return this.selectedTests.reduce((s, t) => s + Number(t.testMrp || 0), 0);
  }
  get totalAmount(): number { return Math.max(0, this.subTotal - this.discount); }
  get dueAmount(): number { return Math.max(0, this.totalAmount - this.paidAmount); }

  get filteredBookings(): BookingListItem[] {
    let list = this.bookings;
    if (!this.canViewAllBookings) list = list.filter((b: any) => b.createdBy === this.currentUserId);
    if (this.selectedReportStatus !== 'all') {
      list = list.filter(b => (b.overallReportStatus || (b.reports?.length ? 'completed' : 'pending')) === this.selectedReportStatus);
    }
    const q = this.quickSearch?.trim().toLowerCase();
    if (q) {
      list = list.filter(b =>
        String(b.bookingId).includes(q) ||
        (b.patientId || '').toLowerCase().includes(q) ||
        (b.customerName || '').toLowerCase().includes(q) ||
        (b.doctor?.doctor_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

get totalBookingsCount(): number {
  const hasClientFilter = !!this.quickSearch?.trim();
  return hasClientFilter ? this.filteredBookings.length : this.totalBookingsFromServer;
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
    private authService: AuthService
  ) {
    addIcons({
      flaskOutline, personOutline, printOutline, closeOutline, trashOutline,
      addOutline, checkmarkOutline, ellipsisVerticalOutline, cashOutline,
      documentTextOutline, timeOutline, qrCodeOutline, receiptOutline, attachOutline,
      refreshOutline, searchOutline, closeCircleOutline
    });
  }

  // ---------- lifecycle ----------
  ngOnInit() {
    this.loadCurrentUser();
    const today = this.formatDateForInput(new Date());
    this.fromDate = today;
    this.toDate = today;
    this.loadAvailableTests();
    this.loadFilterFranchises();
  }

  ionViewWillEnter() { this.loadCurrentUser(); }
  ionViewWillLeave() { this.closeActionMenu(); }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    if (this.openActionRowId !== null) this.closeActionMenu();
  }

  showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    if (type === 'success') this.toast.success('Success', msg);
    else if (type === 'error') this.toast.error('Error', msg);
    else this.toast.warning('Warning', msg);
  }

  private loadCurrentUser() {
    const cached = this.authService.currentUserValue;
    if (cached) {
      this.role = this.authService.role;
      this.currentUserId = cached?.raw?.id || 0;
      this.loadBookings();
      this.cdr.detectChanges();
      return;
    }
    this.authService.loadCurrentUser().subscribe({
      next: () => this.ngZone.run(() => {
        this.role = this.authService.role;
        this.currentUserId = this.authService.currentUserValue?.raw?.id || 0;
        this.loadBookings();
        this.cdr.detectChanges();
      }),
      error: (err) => console.log('CURRENT USER (booking-status) ERROR:', err)
    });
  }

  // ---------- date helpers ----------
  private formatDateForInput(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  openDateRangePicker() {
    this.rangeStart = this.toDateObj(this.fromDate);
    this.rangeEnd = this.toDateObj(this.toDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any) { this.rangeStart = event?.value || null; }

  onRangeEndChange(event: any) {
    this.rangeEnd = event?.value || null;
    if (this.rangeStart && this.rangeEnd) {
      this.fromDate = this.toDateStr(this.rangeStart);
      this.toDate = this.toDateStr(this.rangeEnd);
      this.applyFilters();
    }
  }

  onQuickSearchChange() {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentPage = 0;
      this.loadBookings();
    }, this.SEARCH_DEBOUNCE_MS);
  }

  // ---------- mapping ----------
  private mapBookingItem(raw: any): BookingListItem {
    if (!raw) return raw;

    const rawTestMappings = (
      raw.bookingWithTestMappings || raw.testMappings || raw.tests || []
    ).filter((t: any) => !!t.testName);

    // ✅ आधी reports/statusByTestId तयार करा
    const reportsRaw = raw.reports || [];
    const reports = reportsRaw
      .filter((r: any) => !!r.reportId)
      .map((r: any) => ({ reportId: r.reportId, reportStatus: r.reportStatus || 'PENDING' }));

    const statusByTestId = new Map<number, string>();
    reportsRaw.forEach((r: any) => {
      if (r.testId != null) statusByTestId.set(r.testId, r.reportStatus || 'PENDING');
    });
    const tests: BookingTest[] = rawTestMappings.map((t: any) => {
      const mappingId = t.testMappingId ?? t.bookingWithTestMappingId;
      if (!mappingId) {
        console.log('MISSING testMappingId for test:', t.testName, t);
      }
      return {
        testId: t.testId,
        testMappingId: mappingId,
        testName: (t.testName || '').trim(),
        testPrice: t.testPrice,
        testMrp: t.testMrp,
        method: t.testCode,
        status: statusByTestId.get(t.testId) || t.reportStatus || 'pending',
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
        status: s.status
      });
    });



    let overallReportStatus = 'pending';
    if (tests.length > 0) {
      const statuses = tests.map(t => (t.status || '').toLowerCase());
      if (statuses.every(s => s.includes('complete'))) overallReportStatus = 'completed';
      else if (statuses.some(s => s === 'snr')) overallReportStatus = 'snr';
      else if (statuses.some(s => s.includes('process'))) overallReportStatus = 'in_process';
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
      tests, samples, reports,
      doctor: { doctorId: raw.doctorId, doctor_name: raw.doctorName },
      franchise: { franchiseId: raw.franchiseId, franchiseName: raw.franchiseName },
      overallReportStatus,
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : undefined
    };
  }

  // ---------- data loading ----------
  loadBookings(isLoadMore: boolean = false) {
    if (isLoadMore) this.isLoadingMore = true; else this.isLoadingList = true;
    const labId = this.labApi.getCurrentLabId();

    const searchActive = this.isSearchMode;
    const startDate = searchActive ? this.SEARCH_START_DATE : this.fromDate;
    const endDateExclusive = searchActive
      ? this.addOneDay(this.formatDateForInput(new Date()))
      : this.addOneDay(this.toDate);
    const pageToUse = searchActive ? 0 : this.currentPage;
    const pageSizeToUse = searchActive ? this.SEARCH_PAGE_SIZE : this.pageSize;

    this.labApi.getBookingStatusNew(labId, pageToUse, pageSizeToUse, startDate, endDateExclusive, this.selectedFranchiseId || undefined)
      .subscribe({
        next: (res: any) => this.ngZone.run(() => {
          const rawList = Array.isArray(res?.content ?? res) ? (res?.content ?? res) : [];
          const mapped = rawList.map((b: any) => this.mapBookingItem(b));

          this.bookings = (isLoadMore && !searchActive) ? [...this.bookings, ...mapped] : mapped;
          this.hasMore = !searchActive && rawList.length === pageSizeToUse;
          this.totalBookingsFromServer = searchActive
            ? mapped.length
            : (res?.totalElements ?? res?.totalCount ?? rawList.length);

          this.isLoadingList = false;
          this.isLoadingMore = false;
          this.cdr.detectChanges();
        }),
        error: (err) => {
          console.log('BOOKINGS LIST ERROR:', err);
          this.ngZone.run(() => {
            this.isLoadingList = false;
            this.isLoadingMore = false;
            this.showToast('Bookings load karayla fail zala', 'error');
          });
        }
      });
  }

  loadMoreBookings() {
    if (!this.hasMore || this.isLoadingMore || this.isSearchMode) return;
    this.currentPage++;
    this.loadBookings(true);
  }

  applyFilters() {
    this.currentPage = 0;
    this.loadBookings();
  }

  private loadFilterFranchises() {
    this.labApi.getFranchises().subscribe({
      next: (res: any) => this.ngZone.run(() => {
        this.filterFranchises = res?.content || res || [];
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => {
        this.filterFranchises = [];
        this.cdr.detectChanges();
      })
    });
  }

  trackByBookingId(index: number, item: BookingListItem): number {
    return item.bookingId ?? item.id ?? index;
  }

  trackByBarcode(index: number, s: BookingSample): string {
    return s.barcode || String(index);
  }

  private fetchSingleBooking(bookingId: number, cb: (b: BookingListItem) => void, onError?: () => void) {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (res: any) => this.ngZone.run(() => {

        console.log('RAW REPORTS ARRAY:', res?.reports);
        console.log('RAW TESTS ARRAY:', res?.tests);
        cb(this.mapBookingItem(res));
        this.cdr.detectChanges();
      }),
      error: (err) => {
        console.log('SINGLE BOOKING ERROR:', err);
        this.ngZone.run(() => {
          this.showToast('Booking detail load fail zala', 'error');
          onError?.();
          this.cdr.detectChanges();
        });
      }
    });
  }

  loadAvailableTests() {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        const apiTests = res || [];
        this.availableTests = (Array.isArray(apiTests) ? apiTests : []).map((t: any) => ({
          testId: t.test_id ?? t.testId,
          testName: t.test_name || 'Unnamed Test',
          testPrice: t.price2 ?? 0,
          testMrp: t.test_price ?? 0,
          sample: t.sampleTypeName || 'OTHER'
        }));
      },
      error: (err) => console.log('AVAILABLE TESTS ERROR:', err)
    });
  }

  // ---------- card / row helpers ----------
  toggleExpand(item: BookingListItem) {
    this.expandedBookingId = this.expandedBookingId === item.bookingId ? null : item.bookingId;
  }

  getSamples(item: BookingListItem): number {
    return (item.samples?.length || (item.tests || []).length) || 0;
  }

  getReportProgress(item: BookingListItem): string {
    const testCount = item.tests?.length || 0;
    const completedCount = (item.tests || []).filter(t => {
      const s = (t.status || '').toLowerCase();
      return s.includes('complete') || s.includes('ready');
    }).length;
    return `${completedCount}/${testCount}`;
  }

  getTestCountStatusClass(item: BookingListItem): string {
    const testCount = item.tests?.length || 0;
    if (testCount === 0) return 'pending';
    const completedCount = (item.tests || []).filter(t => {
      const s = (t.status || '').toLowerCase();
      return s.includes('complete') || s.includes('ready');
    }).length;
    return completedCount === testCount ? 'completed' : 'pending';
  }
  testStatusClass(status?: string): string {
    const s = (status || 'pending').toLowerCase();
    if (s.includes('process')) return 'badge-inprocess';
    if (s === 'snr') return 'badge-snr';
    if (s.includes('complete') || s.includes('ready')) return 'badge-ready';
    return 'badge-pending';
  }

  testStatusLabel(status?: string): string {
    const s = (status || 'pending').toLowerCase();
    if (s.includes('process')) return 'IN PROCESS';
    if (s === 'snr') return 'SNR';
    if (s.includes('complete') || s.includes('ready')) return 'COMPLETE';
    return 'PENDING';
  }

  // ---------- action menu ----------
  toggleActionMenu(item: BookingListItem, event: MouseEvent) {
    event.stopPropagation();
    if (this.openActionRowId === item.bookingId) {
      this.closeActionMenu();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 200;
    const menuHeightEstimate = 260;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;

    let top = rect.bottom + 6;
    if (top + menuHeightEstimate > window.innerHeight) top = Math.max(8, rect.top - menuHeightEstimate - 6);

    this.actionMenuPosition = { top, left };
    this.openActionRowId = item.bookingId;
    this.openActionItem = item;
    document.body.classList.add('action-menu-open');
  }

  closeActionMenu() {
    this.openActionRowId = null;
    this.openActionItem = null;
    document.body.classList.remove('action-menu-open');
  }

  // ---------- print bill ----------
  printBill(item: BookingListItem) {
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
      error: (err) => {
        console.log('PRINT BILL ERROR:', err);
        this.ngZone.run(() => {
          this.generatingBillId = null;
          this.showToast('Bill generate karnyat error aali', 'error');
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---------- edit test ----------
  editTest(item: BookingListItem) {
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

  closeTestModal() {
    this.isTestModalOpen = false;
    this.isTestLoading = false;
    this.isSavingTest = false;
    this.selectedBooking = null;
    this.selectedTests = [];
    this.basePaidAmount = 0;
    this.payNowAmount = 0;
    this.paidAmount = 0;
  }

  searchTests() {
    const t = this.searchTerm.trim().toLowerCase();
    if (!t) { this.filteredTests = []; return; }
    this.filteredTests = this.availableTests.filter(x =>
      x.testName.toLowerCase().includes(t) && !this.selectedTests.some(s => s.testName === x.testName)
    );
  }

  addTest(test: BookingTest) {
    this.selectedTests.push({ ...test, resultValue: '', isNewlyAdded: true });
    this.searchTerm = '';
    this.filteredTests = [];
    this.showToast(`${test.testName} added`, 'success');
  }

  async removeTest(test: BookingTest) {
    const alert = await this.alertController.create({
      cssClass: 'premium-alert',
      header: 'Delete Test',
      message: `Are you sure you want to delete "${test.testName}"?`,
      buttons: [
        { text: 'No', role: 'cancel', cssClass: 'alert-btn-cancel' },
        {
          text: 'Yes, Delete',
          cssClass: 'alert-btn-danger',
          handler: () => {
            if (test.isNewlyAdded) {
              this.selectedTests = this.selectedTests.filter(t => t !== test);
              this.showToast(`${test.testName} removed`, 'warning');
              return;
            }

            if (!test.testMappingId) {
              this.showToast('Test ID missing', 'error');
              return;
            }

            const labId = this.labApi.getCurrentLabId();
            const bookingId = this.selectedBooking!.bookingId;

            this.labApi.deleteTestFromBooking(labId, bookingId, test.testMappingId).subscribe({
              next: () => this.ngZone.run(() => {
                this.selectedTests = this.selectedTests.filter(t => t !== test);
                this.showToast(`${test.testName} deleted from patient`, 'success');
                this.fetchSingleBooking(bookingId, (fresh) => {
                  this.selectedBooking = fresh;
                  this.selectedTests = JSON.parse(JSON.stringify(fresh.tests || []));
                  this.loadBookings();
                  this.cdr.detectChanges();
                });
              }),
              error: (err) => this.ngZone.run(() => {
                console.log('DELETE TEST ERROR:', err);
                this.showToast('' + (err.error?.message || 'Unknown error'), 'error');
              })
            });
          }
        }
      ]
    });
    await alert.present();
  }
  onDiscountChange() {
    if (!this.canEditBilling) { this.discount = 0; return; }
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
    this.onPayNowChange();
  }

  onPayNowChange() {
    if (!this.canEditBilling) { this.payNowAmount = 0; this.paidAmount = this.basePaidAmount; return; }
    if (this.payNowAmount < 0) this.payNowAmount = 0;
    const maxPayable = Math.max(0, this.totalAmount - this.basePaidAmount);
    if (this.payNowAmount > maxPayable) this.payNowAmount = maxPayable;
    this.paidAmount = this.basePaidAmount + this.payNowAmount;
  }

  updateTestBooking() {
    if (!this.selectedBooking || this.isSavingTest) return;
    if (this.selectedTests.length === 0) {
      this.showToast('Please add at least one test', 'warning');
      return;
    }

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
      tests: existingTests.map(t => ({ testId: t.testId, profileId: 0 })),
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
              testPrice: t.testMrp,
              doctorTestDiscountPrice: 0,
              doctorTestCommissionPrice: 0,
              test_price: t.testPrice ?? t.testMrp,
              assignedPrice: [t.testPrice ?? t.testMrp],
              source: t.method || 'RPL',
              discount: 0,
              newTest: true
            }))
          };

          this.labApi.addTestToBooking(addTestBody).subscribe({
            next: () => this.verifyAndFinishSave(bookingId, newTests),
            error: (err) => {
              console.log('ADD TEST ERROR:', err);
              this.ngZone.run(() => {
                this.isSavingTest = false;
                this.showToast('Naveen test add nahi zala: ' + (err.error?.message || 'Unknown error'), 'error');
              });
            }
          });
        } else {
          this.verifyAndFinishSave(bookingId, []);
        }
      },
      error: (err) => {
        console.log('UPDATE PATIENT ERROR:', err);
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Failed to update booking: ' + (err.error?.message || 'Unknown error'), 'error');
        });
      }
    });
  }

  private verifyAndFinishSave(bookingId: number, newTests: BookingTest[]) {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (freshRes: any) => {
        const savedTestIds = new Set((freshRes.tests || []).map((t: any) => String(t.testId)));
        const missingNewTests = newTests.filter(t => !savedTestIds.has(String(t.testId)));

        this.ngZone.run(() => {
          this.isSavingTest = false;

          if (missingNewTests.length > 0) {
            const names = missingNewTests.map(t => t.testName).join(', ');
            this.showToast(`Yeh test add nahi zala: ${names}. Kripya thodya vela nantar punha try kara, ki system admin la sanga.`, 'error');
            this.selectedTests = this.selectedTests.filter(t => !t.isNewlyAdded || missingNewTests.some(m => m.testId === t.testId));
            this.loadBookings();
            return;
          }

          this.showToast('Booking updated successfully', 'success');
          this.closeTestModal();
          this.loadBookings();
        });
      },
      error: (err) => {
        console.log('RE-FETCH AFTER SAVE ERROR:', err);
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
  editPatient(item: BookingListItem) {
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
      this.editPatientData = data;
      this.isPatientLoading = false;
    }, () => {
      this.isPatientLoading = false;
      this.isPatientModalOpen = false;
    });
  }

  closePatientModal() {
    this.isPatientModalOpen = false;
    this.isPatientLoading = false;
    this.editPatientData = null;
  }

  updatePatient() {
    if (!this.canEditPatient || !this.editPatientData) return;

    const body = {
      bookingId: this.editPatientData.bookingId,
      customerName: this.editPatientData.name,
      ageType: this.editPatientData.ageType,
      age: this.editPatientData.age,
      gender: this.editPatientData.gender,
      mobileNumber: this.editPatientData.mobileNumber,
      aadhaarNumber: this.editPatientData.aadhaarNumber,
      doctorid: this.editPatientData.doctorId,
      franchiseId: this.editPatientData.franchiseId,
      createdOn: this.editPatientData.createdOn
    };

    this.labApi.updatePatient(this.labApi.getCurrentLabId(), this.editPatientData.bookingId, body).subscribe({
      next: () => this.ngZone.run(() => {
        this.showToast('Patient updated successfully', 'success');
        this.closePatientModal();
        this.loadBookings();
      }),
      error: (err) => {
        console.log('UPDATE PATIENT ERROR:', err);
        this.ngZone.run(() => this.showToast('Patient update fail zala', 'error'));
      }
    });
  }

  openDoctorPicker() {
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

  selectDoctorForEdit(doc: any) {
    if (!doc || !this.editPatientData) return;
    this.editPatientData.doctor = doc?.doctor_name;
    this.editPatientData.doctorId = doc?.doctorId;
    this.showDoctorPicker = false;
  }

  openLabPicker() {
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

  selectLabForEdit(lab: any) {
    if (!this.isAdminRole || !lab || !this.editPatientData) return;
    this.editPatientData.lab = lab?.franchiseName || lab?.name;
    this.editPatientData.franchiseId = lab?.franchiseId;
    this.showLabPicker = false;
  }

  onPatientFileSelected(event: any) {
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
  openNoteModal(item: BookingListItem) {
    this.closeActionMenu();
    this.noteBooking = item;
    this.noteText = '';
    this.isNoteModalOpen = true;
  }

  closeNoteModal() {
    this.isNoteModalOpen = false;
    this.noteBooking = null;
    this.noteText = '';
  }

  saveNote() {
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
        error: (err) => {
          console.log('ADD NOTE ERROR:', err);
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
  openHistoryModal(item: BookingListItem) {
    this.closeActionMenu();
    this.isLoadingHistory = true;
    this.isHistoryModalOpen = true;
    this.fetchSingleBooking(item.bookingId, (fresh) => {
      this.historyBooking = fresh;
      this.isLoadingHistory = false;
    });
  }

  closeHistoryModal() {
    this.isHistoryModalOpen = false;
    this.historyBooking = null;
  }

  // ---------- barcode ----------
  openBarcodeModal(item: BookingListItem) {
    this.closeActionMenu();
    this.barcodeBooking = item;
    this.barcodeRows = (item.samples || []).map((s: any) => ({
      accessionId: s.accessionId || s.sampleAccessionId,
      sampleTypeId: s.sampleTypeId,
      sampleType: s.sampleType || '-',
      oldBarcode: s.barcode,
      newBarcode: s.barcode,
      receiveDate: '',
      status: s.status || 'PENDING',
      saving: false
    }));
    this.isBarcodeModalOpen = true;
  }

  closeBarcodeModal() {
    this.isBarcodeModalOpen = false;
    this.barcodeBooking = null;
    this.barcodeRows = [];
  }

  openDateTimePicker(row: { receiveDate: string }) {
    this.activeDateTimeRow = row;
    this.tempDateTimeValue = row.receiveDate
      ? (row.receiveDate.length === 16 ? row.receiveDate + ':00' : row.receiveDate)
      : new Date().toISOString().slice(0, 19);
  }

  closeDateTimePicker() {
    this.activeDateTimeRow = null;
    this.tempDateTimeValue = '';
  }

  confirmDateTime() {
    if (this.activeDateTimeRow && this.tempDateTimeValue) {
      this.activeDateTimeRow.receiveDate = this.tempDateTimeValue.slice(0, 16);
    }
    this.closeDateTimePicker();
  }

  updateBarcodeRow(row: {
    sampleTypeId?: number; newBarcode: string; oldBarcode: string;
    receiveDate: string; status: string; saving: boolean;
  }) {
    if (!row.newBarcode?.trim()) {
      this.showToast('Barcode rikama thevu naka', 'warning');
      return;
    }
    if (!this.barcodeBooking) return;

    row.saving = true;
    const bookingId = this.barcodeBooking.bookingId;
    const payload = [{
      oldBarcode: row.oldBarcode,
      updatedBarcode: row.newBarcode.trim(),
      receiveDate: row.receiveDate || '',
      sampleTypeId: row.sampleTypeId,
      bookingId
    }];

    this.labApi.updateBarcode(bookingId, payload).subscribe({
      next: () => this.ngZone.run(() => {
        row.saving = false;
        row.oldBarcode = row.newBarcode;
        row.status = 'RECEIVED';
        this.showToast('Barcode updated successfully', 'success');
        this.cdr.detectChanges();
        this.fetchSingleBooking(bookingId, () => this.loadBookings());
      }),
      error: (err) => {
        console.log('UPDATE BARCODE ERROR:', err);
        this.ngZone.run(() => {
          row.saving = false;
          this.showToast('Barcode update fail zala: ' + (err.error?.message || 'Unknown error'), 'error');
        });
      }
    });
  }

  // ---------- bill history ----------
  openBillHistoryModal(item: BookingListItem) {
    this.closeActionMenu();
    this.fetchSingleBooking(item.bookingId, (fresh) => {
      this.billHistoryBooking = fresh;
      this.isBillHistoryModalOpen = true;
    });
  }

  closeBillHistoryModal() {
    this.isBillHistoryModalOpen = false;
    this.billHistoryBooking = null;
  }
}