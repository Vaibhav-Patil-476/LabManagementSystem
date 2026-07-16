import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
  IonSelect, IonSelectOption, AlertController
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
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
    IonSelect, IonSelectOption,
    MatDatepickerModule, MatFormFieldModule, MatInputModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './booking-status.page.html',
  styleUrls: ['./booking-status.page.scss']
})
export class BookingStatusPage implements OnInit, OnDestroy {

  bookings: BookingListItem[] = [];
  isLoadingList = false;

  quickSearch = '';
  selectedFranchiseId: any = null;
  selectedReportStatus: string = 'all';
  fromDate: string = '';
  toDate: string = '';

  filterFranchises: any[] = [];

  reportStatusOptions = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_process', label: 'In Process' },
    { value: 'snr', label: 'SNR' },
    { value: 'completed', label: 'Completed' }
  ];

  currentPage = 0;
  pageSize = 20;
  totalPages = 1;

  private readonly SEARCH_START_DATE = '2015-01-01';
  private readonly SEARCH_PAGE_SIZE = 500;
  private searchDebounceTimer: any = null;
  private readonly SEARCH_DEBOUNCE_MS = 400;

  get isSearchMode(): boolean {
    return this.quickSearch.trim().length > 0;
  }

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
    sampleType: string;
    oldBarcode: string;
    newBarcode: string;
    status: string;
    saving: boolean;
  }[] = [];

  isBillHistoryModalOpen = false;
  billHistoryBooking: BookingListItem | null = null;

  openActionRowId: number | null = null;
  openActionItem: BookingListItem | null = null;
  actionMenuPosition = { top: 0, left: 0 };

  role: string = '';

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  get isAdminRole(): boolean {
    return this.role === this.ROLE_LAB_ADMIN;
  }

  get canViewAmount(): boolean {
    return this.role === this.ROLE_LAB_ADMIN;
  }

  get isFranchiseRole(): boolean {
    return this.role === this.ROLE_FRANCHISE || this.role === this.ROLE_FRANCHISE_STAFF;
  }

  get canEditBilling(): boolean {
    return this.role === this.ROLE_LAB_ADMIN;
  }

  get canSaveBooking(): boolean {
    return (
      this.role === this.ROLE_LAB_ADMIN ||
      this.role === this.ROLE_STAFF ||
      this.role === this.ROLE_FRANCHISE ||
      this.role === this.ROLE_FRANCHISE_STAFF
    );
  }

  get canEditPatient(): boolean {
    return this.role === this.ROLE_LAB_ADMIN;
  }

  get canViewAllBookings(): boolean {
    return this.role === this.ROLE_LAB_ADMIN;
  }

  availableTests: BookingTest[] = [];

  private currentUserId: number = 0;

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

  showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    if (type === 'success') this.toast.success('Success', msg);
    else if (type === 'error') this.toast.error('Error', msg);
    else this.toast.warning('Warning', msg);
  }

  ngOnInit() {
    this.loadCurrentUser();

    const today = this.formatDateForInput(new Date());
    this.fromDate = today;
    this.toDate = today;

    this.loadAvailableTests();
    this.loadFilterFranchises();
  }

  ionViewWillEnter() {
    this.loadCurrentUser();
  }

  ionViewWillLeave() {
    this.closeActionMenu();
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    if (this.openActionRowId !== null) {
      this.closeActionMenu();
    }
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
      next: () => {
        this.ngZone.run(() => {
          this.role = this.authService.role;
          this.currentUserId = this.authService.currentUserValue?.raw?.id || 0;
          this.loadBookings();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.log('CURRENT USER (booking-status) ERROR:', err);
      }
    });
  }

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

  @ViewChild('rangePicker') rangePicker!: any;

  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

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

  private mapBookingItem(raw: any): BookingListItem {
    if (!raw) return raw;

    const rawTestMappings = (raw.bookingWithTestMappings || []).filter((t: any) => !!t.testName);

    const tests: BookingTest[] = rawTestMappings.map((t: any) => ({
      testId: t.testId,
      testMappingId: t.bookingWithTestMappingId,
      testName: (t.testName || '').trim(),
      testPrice: t.testPrice,
      testMrp: t.testMrp,
      method: t.testCode,
      status: t.reportStatus || 'pending',
      reportId: t.reportId,
      resultValue: ''
    }));

    const seenBarcodes = new Set<string>();
    const samples: BookingSample[] = [];
    (raw.sampleAccessions || []).forEach((s: any) => {
      const barcode = s.barCode || s.barcode;
      if (!barcode || seenBarcodes.has(barcode)) return;
      seenBarcodes.add(barcode);
      samples.push({
        barcode,
        sampleType: s.sampleTypeData?.sample_type || s.sampleType,
        status: s.status
      });
    });

    const reports = rawTestMappings
      .filter((t: any) => !!t.reportId)
      .map((t: any) => ({ reportId: t.reportId, reportStatus: t.reportStatus || 'PENDING' }));

    let overallReportStatus = 'pending';
    if (tests.length > 0) {
      const statuses = tests.map(t => (t.status || '').toLowerCase());
      if (statuses.every(s => s.includes('complete'))) overallReportStatus = 'completed';
      else if (statuses.some(s => s === 'snr')) overallReportStatus = 'snr';
      else if (statuses.some(s => s.includes('process'))) overallReportStatus = 'in_process';
      else overallReportStatus = 'pending';
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
      doctor: { doctorId: raw.doctorId, doctor_name: raw.doctorName },
      franchise: { franchiseId: raw.franchiseId, franchiseName: raw.franchiseName },
      overallReportStatus,
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : undefined
    };
  }

  loadBookings() {
    this.isLoadingList = true;
    const labId = this.labApi.getCurrentLabId();

    const searchActive = this.isSearchMode;
    const startDate = searchActive ? this.SEARCH_START_DATE : this.fromDate;
    const endDateExclusive = searchActive
      ? this.addOneDay(this.formatDateForInput(new Date()))
      : this.addOneDay(this.toDate);
    const pageToUse = searchActive ? 0 : this.currentPage;
    const pageSizeToUse = searchActive ? this.SEARCH_PAGE_SIZE : this.pageSize;

    this.labApi.getBookingStatusNew(
      labId,
      pageToUse,
      pageSizeToUse,
      startDate,
      endDateExclusive,
      this.selectedFranchiseId || undefined
    ).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          const list = res?.content || res || [];
          const rawList = Array.isArray(list) ? list : [];
          this.bookings = rawList.map((b: any) => this.mapBookingItem(b));
          this.totalPages = searchActive ? 1 : (res?.totalPages ?? 1);
          this.isLoadingList = false;
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.log('BOOKINGS LIST ERROR:', err);
        this.ngZone.run(() => {
          this.isLoadingList = false;
          this.showToast('Bookings load karayla fail zala', 'error');
        });
      }
    });
  }

  refreshBookings() {
    this.loadBookings();
  }

  applyFilters() {
    this.currentPage = 0;
    this.loadBookings();
  }

  resetFilters() {
    this.quickSearch = '';
    this.selectedFranchiseId = null;
    this.selectedReportStatus = 'all';
    const today = this.formatDateForInput(new Date());
    this.fromDate = today;
    this.toDate = today;
    this.currentPage = 0;
    this.loadBookings();
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadBookings();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadBookings();
    }
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

  get filteredBookings(): BookingListItem[] {
    let list = this.bookings;

    if (!this.canViewAllBookings) {
      list = list.filter((b: any) => b.createdBy === this.currentUserId);
    }

    if (this.selectedReportStatus && this.selectedReportStatus !== 'all') {
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
    return this.filteredBookings.length;
  }

  get isDefaultTodayRange(): boolean {
    const today = this.formatDateForInput(new Date());
    return this.fromDate === today && this.toDate === today;
  }

  trackByBookingId(index: number, item: BookingListItem): number {
    return item.bookingId ?? item.id ?? index;
  }

  private fetchSingleBooking(bookingId: number, cb: (b: BookingListItem) => void, onError?: () => void) {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          const mapped = this.mapBookingItem(res);
          cb(mapped);
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.log('SINGLE BOOKING ERROR:', err);
        this.ngZone.run(() => {
          this.showToast('Booking detail load fail zala', 'error');
          if (onError) onError();
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

  getTests(item: BookingListItem): string {
    return (item.tests || []).map(t => t.testName).join(', ') || '-';
  }

  getSamples(item: BookingListItem): number {
    return (item.samples?.length || (item.tests || []).length) || 0;
  }

  getReportProgress(item: BookingListItem): string {
    const reportCount = item.reports?.length || 0;
    const testCount = item.tests?.length || 0;
    const total = testCount || reportCount;
    return `${reportCount}/${total}`;
  }

  getSampleLines(item: BookingListItem): { barcode: string; sampleType: string }[] {
    return (item.samples || []).map(s => ({
      barcode: s.barcode || '-',
      sampleType: s.sampleType || ''
    }));
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
    if (s.includes('complete') || s.includes('ready')) return 'READY';
    return 'PENDING';
  }

  toggleActionMenu(item: BookingListItem, event: MouseEvent) {
    event.stopPropagation();

    if (this.openActionRowId === item.bookingId) {
      this.closeActionMenu();
      return;
    }

    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeightEstimate = 260;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    let top = rect.bottom + 6;
    if (top + menuHeightEstimate > window.innerHeight) {
      top = Math.max(8, rect.top - menuHeightEstimate - 6);
    }

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

  printBill(item: BookingListItem) {
    window.print();
    this.showToast('Bill printing started', 'success');
    this.closeActionMenu();
  }

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

    this.fetchSingleBooking(
      item.bookingId,
      (fresh) => {
        if (fresh.tests && fresh.tests.length > 0) {
          this.selectedBooking = fresh;
          this.selectedTests = JSON.parse(JSON.stringify(fresh.tests || []));
          this.discount = fresh.discountAmount || 0;

          this.basePaidAmount = fresh.paidAmount || 0;
          this.payNowAmount = 0;
          this.paidAmount = this.basePaidAmount;
        } else {
          console.log('EDIT TEST: single-booking fetch cha tests rikame ale, list cha (barobar) data vaparла');
        }
        this.isTestLoading = false;
      },
      () => {
        this.isTestLoading = false;
      }
    );
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
      x.testName.toLowerCase().includes(t) &&
      !this.selectedTests.some(s => s.testName === x.testName)
    );
  }

  addTest(test: BookingTest) {
    // ✅ Marked isNewlyAdded so we can later tell the user precisely
    // which tests failed to persist (backend doesn't support inserting
    // new test-mapping rows via updatePatient — see updateTestBooking()).
    this.selectedTests.push({ ...test, resultValue: '', isNewlyAdded: true });
    this.searchTerm = '';
    this.filteredTests = [];
    this.showToast(`${test.testName} added`, 'success');
  }

  async removeTest(test: BookingTest) {
    const alert = await this.alertController.create({
      header: 'Delete Test',
      message: `Are you sure you want to delete "${test.testName}"?`,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Yes, Delete',
          handler: () => {
            this.selectedTests = this.selectedTests.filter(t => t.testName !== test.testName);
            this.showToast(`${test.testName} removed`, 'warning');
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

  get subTotal(): number {
    return this.selectedTests.reduce((s, t) => s + Number(t.testMrp || 0), 0);
  }

  get totalAmount(): number {
    return Math.max(0, this.subTotal - this.discount);
  }

  get dueAmount(): number {
    return Math.max(0, this.totalAmount - this.paidAmount);
  }

  // ⚠️ CONFIRMED via live console logs (2 separate real test runs):
  // updatePatient endpoint only updates EXISTING test-mapping rows
  // (matched by testMappingId). It has no insert path for brand-new
  // tests — sending testMappingId:null for a new test is silently
  // ignored by the backend every time, regardless of payload field
  // names. This is a backend limitation, not fixable from the
  // frontend alone.
  //
  // Fix strategy (frontend-safe, no data loss, no false "success"):
  // 1. Still send the full test list (existing + attempted-new) — if
  //    backend is ever updated to support insert, this starts working
  //    with zero frontend changes.
  // 2. After save, diff re-fetched tests by testId to find exactly
  //    which NEWLY ADDED tests did NOT persist.
  // 3. If any new test failed to persist: show a clear, staff-facing
  //    error naming those tests, do NOT close the modal (so the user
  //    doesn't lose their in-progress edit), and keep only the
  //    unsaved new test(s) in the list so they can retry/report it.
  // 4. If all requested tests persisted, proceed with the original
  //    success/payment-mismatch flow unchanged.
// ✅ FINAL FIX: split save flow.
  // - Existing tests (already have testMappingId) → updatePatient
  //   (confirmed working for price/discount edits across all prior tests).
  // - Newly added tests (isNewlyAdded, no testMappingId) → dedicated
  //   addTest endpoint (confirmed insert-capable via Postman collection,
  //   uses newTest:true flag).
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

      tests: existingTests.map(t => ({
        testId: t.testId,
        profileId: 0
      })),

      subTotalAmount: this.subTotal,
      discountAmount: this.canEditBilling ? this.discount : (this.selectedBooking.discountAmount || 0),
      totalAmount: this.canEditBilling ? this.totalAmount : (this.selectedBooking.totalAmount || 0),
      paidAmount: this.canEditBilling ? this.paidAmount : (this.selectedBooking.paidAmount || 0),
      dueAmount: this.canEditBilling ? this.dueAmount : (this.selectedBooking.dueAmount || 0),
      payNowAmount: this.canEditBilling ? this.payNowAmount : 0,
      paymentMode: this.paymentMethod
    };

    console.log('🔵 SENDING TO updatePatient (existing tests):', JSON.stringify(patientBody, null, 2));

    this.labApi.updatePatient(labId, bookingId, patientBody).subscribe({
      next: () => {
        // ✅ If there are newly-added tests, call the dedicated
        // addTest endpoint for them (confirmed insert-capable).
        if (newTests.length > 0) {
          const addTestBody: any = {
            bookingId,
            customerName: this.selectedBooking!.customerName,
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

          console.log('🟣 SENDING TO addTest (new tests):', JSON.stringify(addTestBody, null, 2));

          this.labApi.addTestToBooking(addTestBody).subscribe({
            next: (addRes: any) => {
              console.log('🟢 RESPONSE FROM addTest:', JSON.stringify(addRes, null, 2));
              this.verifyAndFinishSave(bookingId, newTests);
            },
            error: (err) => {
              console.log('🔴 ADD TEST ERROR:', err);
              this.ngZone.run(() => {
                this.isSavingTest = false;
                this.showToast('Naveen test add nahi zala: ' + (err.error?.message || 'Unknown error'), 'error');
              });
            }
          });
        } else {
          // No new tests — existing-only save, verify and close as before.
          this.verifyAndFinishSave(bookingId, []);
        }
      },
      error: (err) => {
        console.log('🔴 UPDATE PATIENT ERROR:', err);
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Failed to update booking: ' + (err.error?.message || 'Unknown error'), 'error');
        });
      }
    });
  }

  // ✅ Shared verification step — re-fetches booking and confirms every
  // requested test (existing + newly-added) actually persisted, using
  // the same honest diff-based approach as before.
  private verifyAndFinishSave(bookingId: number, newTests: BookingTest[]) {
    this.labApi.getSingleBooking(bookingId).subscribe({
      next: (freshRes: any) => {
        console.log('🟣 RE-FETCHED BOOKING AFTER SAVE:', JSON.stringify(freshRes, null, 2));

        const savedTestIds = new Set(
          (freshRes.tests || []).map((t: any) => String(t.testId))
        );

        const missingNewTests = newTests.filter(
          t => !savedTestIds.has(String(t.testId))
        );

        console.log('🔍 Newly-added tests requested:', newTests.length);
        console.log('🔍 Newly-added tests NOT persisted:', missingNewTests.map(t => t.testName));

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
      error: (err) => {
        console.log('🔴 RE-FETCH AFTER SAVE ERROR:', err);
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Saved, but refresh failed — please reopen', 'warning');
          this.closeTestModal();
          this.loadBookings();
        });
      }
    });
  }
  editPatient(item: BookingListItem) {
    if (!this.canEditPatient) return;
    this.closeActionMenu();

    this.editPatientData = null;
    this.isPatientLoading = true;
    this.isPatientModalOpen = true;

    this.fetchSingleBooking(
      item.bookingId,
      (fresh) => {
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
      },
      () => {
        this.isPatientLoading = false;
        this.isPatientModalOpen = false;
      }
    );
  }

  closePatientModal() {
    this.isPatientModalOpen = false;
    this.isPatientLoading = false;
    this.editPatientData = null;
  }

  updatePatient() {
    if (!this.canEditPatient) return;
    if (!this.editPatientData) return;

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

    const labId = this.labApi.getCurrentLabId();

    this.labApi.updatePatient(labId, this.editPatientData.bookingId, body).subscribe({
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
    if (!this.isAdminRole) {
      return;
    }

    this.selectedLabPick = null;
    this.showLabPicker = true;

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.labs = res?.content || res || [];
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.showToast('Failed to load labs', 'error');
        });
      }
    });
  }

  selectLabForEdit(lab: any) {
    if (!this.isAdminRole) {
      return;
    }

    if (!lab || !this.editPatientData) {
      return;
    }

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
    const body = {
      bookingId: this.noteBooking.bookingId,
      remark: this.noteText.trim(),
      createdBy: this.currentUserId
    };
    this.labApi.createReportRemark(body).subscribe({
      next: () => this.ngZone.run(() => {
        this.isSavingNote = false;
        this.showToast('Note added successfully', 'success');
        this.closeNoteModal();
      }),
      error: (err) => {
        console.log('ADD NOTE ERROR:', err);
        this.ngZone.run(() => {
          this.isSavingNote = false;
          this.showToast('Note save fail zala', 'error');
        });
      }
    });
  }

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

  openBarcodeModal(item: BookingListItem) {
    this.closeActionMenu();
    this.fetchSingleBooking(item.bookingId, (fresh) => {
      this.barcodeBooking = fresh;
      this.barcodeRows = (fresh.samples || []).map(s => ({
        sampleType: s.sampleType || '-',
        oldBarcode: s.barcode,
        newBarcode: s.barcode,
        status: s.status || 'PENDING',
        saving: false
      }));
      this.isBarcodeModalOpen = true;
    });
  }

  closeBarcodeModal() {
    this.isBarcodeModalOpen = false;
    this.barcodeBooking = null;
    this.barcodeRows = [];
  }

  updateBarcodeRow(row: { newBarcode: string; oldBarcode: string; saving: boolean }) {
    if (!row.newBarcode?.trim()) {
      this.showToast('Barcode rikama thevu naka', 'warning');
      return;
    }
    row.saving = true;
    setTimeout(() => {
      row.saving = false;
      this.showToast('Barcode update API ajun connect nahi kela — endpoint dile ki save honar', 'warning');
    }, 400);
  }

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