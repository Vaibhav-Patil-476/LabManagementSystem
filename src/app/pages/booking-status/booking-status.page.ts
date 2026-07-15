import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef, HostListener, ViewChild } from '@angular/core';
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
export class BookingStatusPage implements OnInit {

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

  isTestModalOpen = false;
  isTestLoading = false;
  selectedBooking: BookingListItem | null = null;
  searchTerm = '';
  filteredTests: BookingTest[] = [];
  selectedTests: BookingTest[] = [];
  discount = 0;

  // ✅ Already Paid (read-only, from backend) + Pay Now (user input) =
  // Total Paid (computed). Due auto-recalculates from Total Paid.
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

  // ✅ role ata localStorage varun nahi — AuthService (real API cha
  // /current-user response) varun set hoto, in-memory only.
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

  // ✅ FIX: "Edit Patient" popup / icon ata FAKTA Lab Admin la disel.
  // Staff / Franchise / Franchise-Staff login sathi ha completely
  // hidden rahil (table cha person-icon button ani 3-dot menu cha
  // "Edit Patient" option — donhi ठिकाणी hach getter vaparला jato,
  // tyामुळे eकच jaga fix karून sagळीkade lagू hotay).
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
    // ✅ UI-only safety net: make sure we never leave the page with
    // scroll locked / a stray dropdown open if the user navigates
    // away while it was showing.
    this.closeActionMenu();
  }

  // ✅ FIX: if the device is rotated (or the browser is resized) while
  // the fixed-position 3-dot action dropdown is open, its JS-computed
  // top/left coordinates go stale relative to the new viewport and it
  // can end up detached from its row or partially off-screen. Simplest
  // safe fix: close it on resize/orientation change rather than trying
  // to re-anchor it to a row that may have moved or re-rendered.
  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange() {
    if (this.openActionRowId !== null) {
      this.closeActionMenu();
    }
  }

  // ✅ role + currentUserId ata AuthService (real API) varun ghetले
  // jातात. Cache asel tar tithun, nahitar loadCurrentUser() cha fresh
  // API call kela jato. localStorage la kahihi read/write nahi.
  //
  // ✅ FIX (auto-refresh bug): aधी 'cached' branch madhe loadBookings()
  // call nahi hota, tyामुळे page var परत yeताna table रिकामी disाyची
  // ani manually refresh karावं lagत होतं. Aता donhi (cached + fresh)
  // branches madhe loadBookings() call hoto.
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

  // ✅ Material date-range-picker cha state. Material Date objects vaparto,
  // tyामुळे existing fromDate/toDate ('YYYY-MM-DD' strings) shi convert
  // karava lagतो — baki sagळा component (applyFilters/loadBookings) tyाच
  // string format var chalto, tyामुळे to untouched thevla ahे.
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
    // ✅ donhi dates select झाल्यावर (start + end), filters apply
    // karायचे ani list reload karायची.
    if (this.rangeStart && this.rangeEnd) {
      this.fromDate = this.toDateStr(this.rangeStart);
      this.toDate = this.toDateStr(this.rangeEnd);
      this.applyFilters();
    }
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

    const endDateExclusive = this.addOneDay(this.toDate);

    this.labApi.getBookingStatusNew(
      labId,
      this.currentPage,
      this.pageSize,
      this.fromDate,
      endDateExclusive,
      this.selectedFranchiseId || undefined
    ).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          const list = res?.content || res || [];
          const rawList = Array.isArray(list) ? list : [];
          this.bookings = rawList.map((b: any) => this.mapBookingItem(b));
          this.totalPages = res?.totalPages ?? 1;
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

    // ✅ UI-only: the real scroll-lock now happens via [scrollY] bound
    // on <ion-content> in the template (ion-content owns its own
    // internal scroll container, so a CSS-only host class could never
    // reliably stop it). This body class is kept only as a hook for any
    // global/app-shell styles that may key off it elsewhere.
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
          console.log('EDIT TEST: single-booking fetch cha tests rikame ale, list cha (barobar) data vaparला');
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
    this.selectedTests.push({ ...test, resultValue: '' });
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

  // ⚠️ ha ajunही 'updatePatient' endpoint la call karto — je confirm
  // झाले आहे ki paidAmount/dueAmount properly SAVE करत नाही (backend
  // cha billingTransactionMappingEntities veगळा ledger ahे). Diagnostic
  // verification wadhu thevla ahе — backend team khare billing/payment
  // endpoint dettील tyaच divशी to endpoint ithe plug kela ki pura kaam
  // hoईल.
  updateTestBooking() {
    if (!this.selectedBooking || this.isSavingTest) return;

    if (this.selectedTests.length === 0) {
      this.showToast('Please add at least one test', 'warning');
      return;
    }

    this.isSavingTest = true;
    const labId = this.labApi.getCurrentLabId();
    const bookingId = this.selectedBooking.bookingId;

    const body: any = {
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

      tests: this.selectedTests.map(t => ({
        testId: t.testId,
        testMappingId: t.testMappingId,
        test_name: t.testName,
        test_price: t.testMrp,
        assignedPrice: t.testMrp
      })),

      subTotalAmount: this.subTotal,
      discountAmount: this.canEditBilling ? this.discount : (this.selectedBooking.discountAmount || 0),
      totalAmount: this.canEditBilling ? this.totalAmount : (this.selectedBooking.totalAmount || 0),
      paidAmount: this.canEditBilling ? this.paidAmount : (this.selectedBooking.paidAmount || 0),
      dueAmount: this.canEditBilling ? this.dueAmount : (this.selectedBooking.dueAmount || 0),
      payNowAmount: this.canEditBilling ? this.payNowAmount : 0,
      paymentMode: this.paymentMethod
    };

    console.log('🔵 SENDING TO updatePatient:', JSON.stringify(body, null, 2));

    this.labApi.updatePatient(labId, bookingId, body).subscribe({
      next: (res: any) => {
        console.log('🟢 RESPONSE FROM updatePatient:', JSON.stringify(res, null, 2));

        this.labApi.getSingleBooking(bookingId).subscribe({
          next: (freshRes: any) => {
            console.log('🟣 RE-FETCHED BOOKING AFTER SAVE:', JSON.stringify(freshRes, null, 2));
            console.log('🔍 Expected paidAmount:', this.paidAmount, '| Actual saved paidAmount:', freshRes.paidAmount);
            console.log('🔍 Expected dueAmount:', this.dueAmount, '| Actual saved dueAmount:', freshRes.dueAmount);

            this.ngZone.run(() => {
              this.isSavingTest = false;
              if (Number(freshRes.paidAmount) !== Number(this.paidAmount)) {
                this.showToast('⚠️ Payment save nahi zala — backend endpoint update havа (console pahaa)', 'error');
              } else {
                this.showToast('Booking updated successfully', 'success');
              }
              this.closeTestModal();
              this.loadBookings();
            });
          }
        });
      },
      error: (err) => {
        console.log('🔴 UPDATE TEST BOOKING ERROR:', err);
        this.ngZone.run(() => {
          this.isSavingTest = false;
          this.showToast('Failed to update booking: ' + (err.error?.message || 'Unknown error'), 'error');
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

        // ✅ FIXED — "doctorTitle" backend cडून kayam "dr" default yeत
        // hota, tyामुळे HTML cha blank-option fix काहीच काम karत nahi
        // hota (karan model madhe aधीच "dr" value hota). Aata donhi
        // (title + doctorTitle) explicitly blank thevली aहेत — user
        // manually select karepryant blank राहतील.
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