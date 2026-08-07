import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild, NgZone, ChangeDetectorRef } from "@angular/core";
import { Router } from "@angular/router";
import { Checkout } from 'capacitor-razorpay';
import { Capacitor } from '@capacitor/core';
import { FormsModule } from "@angular/forms";

import {
  IonContent, IonIcon, IonItem, IonLabel, IonList, IonMenu, IonMenuButton,
  IonProgressBar, IonModal, IonSpinner, IonSelect, IonSelectOption,
  IonDatetime, IonButton, IonSearchbar, MenuController, AlertController,
  LoadingController
} from "@ionic/angular/standalone";

import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

import { Subscription, interval, forkJoin, Observable } from "rxjs";
import { map } from "rxjs/operators";
import { firstValueFrom } from "rxjs";

import { StackedBarComponent } from "../../shared/components/stacked-bar/stacked-bar.component";
import { addIcons } from "ionicons";
import {
  beakerOutline, calendarOutline, documentTextOutline, flaskOutline,
  logOutOutline, notificationsOutline, peopleOutline, personAddOutline,
  personCircleOutline, personOutline, shareSocialOutline, clipboardOutline,
  downloadOutline, listOutline, timeOutline, searchOutline, closeOutline,
  closeCircleOutline, chevronForwardOutline, chevronDownOutline,
  printOutline, cashOutline, qrCodeOutline, addOutline, attachOutline,
  checkmarkOutline, walletOutline, cardOutline, removeCircleOutline,
  addCircleOutline, businessOutline, phonePortraitOutline, lockClosedOutline
} from "ionicons/icons";

import { AuthService } from "../../core/services/auth";
import { LabApiService } from "../../core/services/lab-api";
import { ToastService } from "../../core/services/toast";
import { BookingRefreshService } from "../../core/services/booking-refresh";
import { RoleService } from "../../core/services/role";
import { WalletService } from "../../core/services/wallet";

/** Barcode-edit row shape used only by this page's barcode modal. */
type BarcodeRow = {
  accessionId?: number;
  sampleTypeId?: number;
  sampleType: string;
  oldBarcode: string;
  newBarcode: string;
  receiveDate: string;
  status: string;
  canEditBarcode: boolean;
  saving: boolean;
};

const ROLE = {
  LAB_ADMIN: 'ROLE_LAB_ADMIN',
  STAFF: 'ROLE_STAFF',
  FRANCHISE: 'ROLE_FRANCHISE',
  FRANCHISE_STAFF: 'ROLE_FRANCHISE_STAFF'
} as const;

const WALLET_POLL_INTERVAL_MS = 3000;
const DASHBOARD_POLL_INTERVAL_MS = 15000;
const PAYMENT_VERIFY_INITIAL_DELAY_MS = 3000;
const PAYMENT_VERIFY_RETRY_DELAY_MS = 5000;
const PAYMENT_VERIFY_MAX_RETRIES = 8;
const ADMIN_GST_RATE = 0.18;

@Component({
  selector: "app-dashboard",
  templateUrl: "./dashboard.page.html",
  styleUrls: ["./dashboard.page.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent, IonIcon, IonItem, IonLabel, IonList, IonMenu, IonMenuButton,
    IonProgressBar, IonModal, IonSpinner, IonSelect, IonSelectOption,
    IonDatetime, IonButton, IonSearchbar,
    MatDatepickerModule, MatFormFieldModule, MatInputModule,
    StackedBarComponent
  ]
})
export class DashboardPage implements OnInit, OnDestroy {

  // ============================================================
  // USER / SUMMARY STATE
  // ============================================================
  user: any = {};

  totalPatients = 0;
  totalBookings = 0;
  totalReports = 0;
  totalSamples = 0;

  rawBookings: any[] = [];
  dailyBookings: any[] = [];
  doctors: any[] = [];
  labs: any[] = [];
  samplesCanceled = 0;

  patientsPending = 0;
  patientsCompleted = 0;
  samplesMissing = 0;
  samplesReceived = 0;
  reportsPending = 0;
  reportsCompleted = 0;
  totalCanceledAmount = 0;
  totalBusinessAmount = 0;
  loading = false;

  fromDate = '';
  toDate = '';

  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  packageSearchTerm = '';
  filteredPackages: any[] = [];
  showPackageSuggestions = false;
  private packageSearchTimer: any = null;
  // ============================================================
  // GLOBAL SEARCH
  // ============================================================
  globalSearchTerm = '';
  isSearchModalOpen = false;
  isSearching = false;
  searchResults: any[] = [];
  expandedSearchId: any = null;

  private currentFranchiseId: any = undefined;

  // ============================================================
  // EDIT TEST MODAL
  // ============================================================
  isEditTestModalOpen = false;
  isTestLoading = false;
  selectedBooking: any = null;
  testSearchTerm = '';
  filteredTests: any[] = [];
  selectedTests: any[] = [];
  removedTestMappingIds: number[] = [];
  availableTests: any[] = [];

  discount = 0;
  basePaidAmount = 0;
  payNowAmount = 0;
  paidAmount = 0;
  paymentMethod = 'cash';
  isSavingTest = false;

  // ============================================================
  // EDIT PATIENT MODAL
  // ============================================================
  isEditPatientModalOpen = false;
  isPatientLoading = false;
  editPatientData: any = null;

  doctorSearch = '';
  filteredDoctors: any[] = [];
  showDoctorSuggestions = false;

  labSearch = '';
  filteredLabs: any[] = [];
  customLabSearch = '';
  filteredCustomLabs: any[] = [];
  showCustomLabDropdown = false;
  showLabDropdown = false;

  // ============================================================
  // BARCODE MODAL
  // ============================================================
  isBarcodeModalOpen = false;
  isBarcodeLoading = false;
  barcodeBooking: any = null;
  barcodeRows: BarcodeRow[] = [];

  activeDateTimeRow: any = null;
  tempDateTimeValue = '';

  // ============================================================
  // WALLET
  // ============================================================
  wallet: any = null;
  isWalletModalOpen = false;
  isWalletLoading = false;
  walletTransactions: any[] = [];
  walletTotalRows = 0;
  walletPage = 0;
  walletSize = 20;

  isAddFundsModalOpen = false;
  addFundsAmount: any = null;
  isAddFundsSaving = false;

  // Wallet modal filters
  walletFilterScope: 'user' | 'lab' = 'user'; // ⚠️ UI-only for now — no backend param wired for this yet
  walletPaymentModeFilter = '';

  downloadingReportId: any = null;
  printingId: any = null;

  // ============================================================
  // ROLE CONSTANTS
  // ============================================================
  private readonly ROLE_STAFF = ROLE.STAFF;
  private readonly ROLE_FRANCHISE = ROLE.FRANCHISE;
  private readonly ROLE_FRANCHISE_STAFF = ROLE.FRANCHISE_STAFF;

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================
  private loadInProgress = false;
  private refreshSub?: Subscription;
  private pollSub?: Subscription;
  private walletPollSub?: Subscription;

  private orderId: any;

  private verifyLoading?: HTMLIonLoadingElement;

  constructor(
    private router: Router,
    private menuCtrl: MenuController,
    private authService: AuthService,
    private labApi: LabApiService,
    private toastService: ToastService,
    private bookingRefresh: BookingRefreshService,
    private roleService: RoleService,
    private ngZone: NgZone,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private walletService: WalletService,
    private cdr: ChangeDetectorRef,
  ) {
    this.registerIcons();
    this.fromDate = this.toKey(new Date());
    this.toDate = this.toKey(new Date());
  }

  private registerIcons(): void {
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
      'time-outline': timeOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
      'close-circle-outline': closeCircleOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'chevron-down-outline': chevronDownOutline,
      'print-outline': printOutline,
      'cash-outline': cashOutline,
      'qr-code-outline': qrCodeOutline,
      'add-outline': addOutline,
      'attach-outline': attachOutline,
      'checkmark-outline': checkmarkOutline,
      'wallet-outline': walletOutline,
      'card-outline': cardOutline,
      'remove-circle-outline': removeCircleOutline,
      'add-circle-outline': addCircleOutline,
      'business-outline': businessOutline,
      'phone-portrait-outline': phonePortraitOutline,
      'lock-closed-outline': lockClosedOutline,
    });
  }

  // ============================================================
  // ROLE / PERMISSION GETTERS
  // ============================================================
  get canViewWallet(): boolean {
    const role = this.authService.role;
    if (role === this.ROLE_STAFF || role === this.ROLE_FRANCHISE_STAFF) return false;
    return role === this.ROLE_FRANCHISE || role === ROLE.LAB_ADMIN;
  }

  get canEditPatient(): boolean {
    const role = this.authService.role;
    return role === ROLE.LAB_ADMIN || role === this.ROLE_FRANCHISE;
  }

  get canViewAmount(): boolean {
    return this.roleService.isLabAdmin || this.isFranchiseOnlyRole;
  }

  get isStaffRole(): boolean {
    return this.roleService.currentRole === this.ROLE_STAFF;
  }

  get canEditBilling(): boolean {
    return this.roleService.isLabAdmin || this.isStaffRole;
  }

  get isAdminRole(): boolean {
    return this.roleService.isLabAdmin;
  }

  get isFranchiseOnlyRole(): boolean {
    return this.roleService.currentRole === this.ROLE_FRANCHISE;
  }

  get canViewPayment(): boolean {
    return this.isAdminRole || this.isFranchiseOnlyRole;
  }

  get canViewCollection(): boolean {
    return this.roleService.isLabAdmin || this.isFranchiseOnlyRole;
  }

  get canShowDownloadReport(): boolean {
    const role = this.authService?.role;
    return role === ROLE.LAB_ADMIN || role === this.ROLE_FRANCHISE;
  }

  // ============================================================
  // DERIVED BILLING VALUES
  // ============================================================
  get subTotal(): number {
    return this.selectedTests.reduce((sum, t) => sum + Number(t.testPrice ?? t.testMrp ?? 0), 0);
  }

  get totalAmount(): number {
    return Math.max(0, this.subTotal - this.discount);
  }

  get dueAmount(): number {
    return Math.max(0, this.totalAmount - this.paidAmount);
  }

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

  get downloadingReportIdRef(): any {
    return this.downloadingReportId;
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================
  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.refreshSub = this.bookingRefresh.refresh$.subscribe(() => this.initDashboard());

    if (this.canViewWallet) {
      this.loadWallet();
      this.startWalletPolling();
    }
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.pollSub?.unsubscribe();
    this.walletPollSub?.unsubscribe();
    this.verifyLoading?.dismiss();
  }

  ionViewWillEnter(): void {
    this.initDashboard();
    this.startPolling();

    if (this.canViewWallet) {
      this.startWalletPolling();
    }
  }

  ionViewWillLeave(): void {
    this.pollSub?.unsubscribe();
    this.walletPollSub?.unsubscribe();
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(DASHBOARD_POLL_INTERVAL_MS).subscribe(() => this.loadDashboard(true));
  }

  private startWalletPolling(): void {
    this.walletPollSub?.unsubscribe();
    if (!this.canViewWallet) return;

    this.walletPollSub = interval(WALLET_POLL_INTERVAL_MS).subscribe(() => {
      this.refreshWalletSilently();
    });
  }

  // ============================================================
  // DASHBOARD INIT
  // ============================================================
  initDashboard(): void {
    if (this.loadInProgress) return;
    this.loadInProgress = true;
    this.loading = true;

    const existingUser = this.authService.currentUserValue;

    if (existingUser) {
      this.setUser(existingUser);
      this.currentFranchiseId = this.resolveFranchiseId();
      this.loadDashboard();
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.setUser(this.authService.currentUserValue);
        this.currentFranchiseId = this.resolveFranchiseId();
        this.loadDashboard();
      },
      error: (err) => {
        this.loading = false;
        this.loadInProgress = false;
        console.error('CURRENT USER ERROR:', err);
        this.toastService.error('Error', 'Failed to load user info');
      }
    });
  }

  private setUser(currentUser: any): void {
    this.user = {
      name: currentUser?.raw?.username ?? '',
      email: currentUser?.raw?.email ?? '',
      role: this.roleService.currentRole
    };
  }

  private resolveFranchiseId(): number | undefined {
    const role = this.roleService.currentRole;
    const isFranchiseUser = role === this.ROLE_FRANCHISE || role === this.ROLE_FRANCHISE_STAFF;
    const franchiseId = this.authService?.currentUserValue?.raw?.franchiseId
      ?? (this.authService as any)?.franchiseId;

    if (isFranchiseUser && franchiseId != null && Number(franchiseId) > 0) {
      return Number(franchiseId);
    }
    return undefined;
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================
  private formatDateParam(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // ============================================================
  // DATE RANGE PICKER
  // ============================================================
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
      this.fromDate = this.toKey(this.rangeStart);
      this.toDate = this.toKey(this.rangeEnd);
      this.onDateChange();
    }
  }

  onDateChange(): void {
    this.loadDashboard();
  }

  resetToToday(): void {
    this.fromDate = this.toKey(new Date());
    this.toDate = this.toKey(new Date());
    this.onDateChange();
  }

  // ============================================================
  // TESTS MASTER LIST
  // ============================================================
  loadAvailableTests(): void {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        this.availableTests = (Array.isArray(res) ? res : []).map((t: any) => ({
          testId: t.test_id ?? t.testId,
          testName: t.test_name || 'Unnamed Test',
          testMrp: t.test_price ?? 0
        }));
      },
      error: (err) => console.error('AVAILABLE TESTS LOAD ERROR:', err)
    });
  }

  // ============================================================
  // GLOBAL SEARCH
  // ============================================================
  clearGlobalSearch(): void {
    this.globalSearchTerm = '';
    this.isSearchModalOpen = false;
    this.searchResults = [];
  }

  closeSearchModal(): void {
    this.isSearchModalOpen = false;
  }

  onSearchButtonClick(): void {
    const q = this.globalSearchTerm.trim();
    if (!q) return;
    this.performGlobalSearch(q);
  }

  onSearchKeyup(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.onSearchButtonClick();
  }

  toggleSearchExpand(item: any): void {
    this.expandedSearchId = this.expandedSearchId === item.bookingId ? null : item.bookingId;
  }

  private applyStaffOwnershipFilter(list: any[]): any[] {
    if (!this.isStaffRole) return list || [];

    const currentUser = this.authService.currentUserValue;
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;

    return (list || []).filter((b: any) => {
      const usernameMatch = !!currentUsername && b.user?.username === currentUsername;
      const idMatch = !!currentUserId && b.createdBy === currentUserId;
      return usernameMatch || idMatch;
    });
  }

  private filterBookingsByQuery(list: any[], query: string): any[] {
    const ql = query.toLowerCase();
    return list.filter((b: any) =>
      String(b.bookingId).includes(ql) ||
      (b.patientId || '').toLowerCase().includes(ql) ||
      (b.customerName || '').toLowerCase().includes(ql) ||
      (b.doctorName || '').toLowerCase().includes(ql)
    );
  }

  private fetchAllBookingStatusForSearch(): Observable<any> {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const start = '2015-01-01';
    const end = this.nextDay(this.formatDateParam(new Date()));
    return this.labApi.getBookingStatusNew(labId, 0, 500, start, end, this.currentFranchiseId);
  }

  private performGlobalSearch(q: string): void {
    this.isSearching = true;
    this.isSearchModalOpen = true;

    this.fetchAllBookingStatusForSearch().subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];
        const roleFiltered = this.applyStaffOwnershipFilter(list);
        this.searchResults = this.filterBookingsByQuery(roleFiltered, q).map((b: any) => this.mapSearchItem(b));
        this.isSearching = false;
      },
      error: () => {
        this.isSearching = false;
        this.searchResults = [];
      }
    });
  }

  private refreshSearchResultsSilently(): void {
    const q = this.globalSearchTerm.trim();
    if (!q) return;

    this.fetchAllBookingStatusForSearch().subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];
        const roleFiltered = this.applyStaffOwnershipFilter(list);
        this.searchResults = this.filterBookingsByQuery(roleFiltered, q).map((b: any) => this.mapSearchItem(b));
      },
      error: () => { /* silent refresh — ignore failures */ }
    });
  }

  private mapSearchItem(raw: any) {
    const b = this.mapBooking(raw);
    const testCount = b.tests.length;
    const completedCount = b.tests.filter((t: any) => (t.status || '').toLowerCase().includes('complete')).length;

    return {
      ...b,
      title: raw.title,
      customerName: raw.customerName,
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : '',
      progress: `${completedCount}/${testCount}`,
      statusClass: testCount > 0 && completedCount === testCount ? 'completed' : 'pending',
      hasCompletedTest: completedCount > 0,
      testsDisplay: b.tests.map((t: any) => ({
        name: t.testName,
        status: this.testStatusLabel(t.status),
        statusClass: this.testStatusClass(t.status)
      }))
    };
  }

  // ============================================================
  // BILL PRINT / REPORT DOWNLOAD
  // ============================================================
  printBillInline(item: any): void {
    if (this.printingId === item.bookingId) return;
    this.printingId = item.bookingId;

    const payload = this.labApi.buildBillPayload(item.bookingId);
    this.labApi.printBill(payload).subscribe({
      next: (res: any) => {
        this.printingId = null;
        if (res?.downloadUrl) window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
      },
      error: () => { this.printingId = null; }
    });
  }

  async downloadReportInline(item: any): Promise<void> {
    const role = this.authService?.role;
    const allowed = role === ROLE.LAB_ADMIN || role === this.ROLE_FRANCHISE || role === this.ROLE_FRANCHISE_STAFF;

    if (!allowed) {
      this.toastService.error('Not allowed', 'Download फक्त Admin/Franchise ला उपलब्ध आहे');
      return;
    }
    if (!item.hasCompletedTest) return;
    if (this.downloadingReportId === item.bookingId) return;

    this.downloadingReportId = item.bookingId;

    try {
      const bookingId = Number(item.bookingId);
      const res: any = await firstValueFrom(
        this.labApi.generatePdfReport([bookingId], { single: true })
      );

      if (res?.success && res?.downloadUrl) {
        window.open(res.downloadUrl, '_blank');
        this.toastService.success('Success', 'Report ready');
      } else {
        this.toastService.error('Error', res?.message || 'PDF generate karta aala nahi');
      }
    } catch (err) {
      console.error('DOWNLOAD REPORT ERROR:', err);
      this.toastService.error('Error', 'PDF generate karnyat error aali');
    } finally {
      this.ngZone.run(() => { this.downloadingReportId = null; });
    }
  }

  // ============================================================
  // EDIT TEST / BILLING MODAL
  // ============================================================
  onEditTestClick(item: any): void {
    this.isSearchModalOpen = false;
    this.editTestFromSearch(item);
  }

  editTestFromSearch(item: any): void {
    this.selectedBooking = item;
    this.selectedTests = JSON.parse(JSON.stringify(item.tests || []));
    this.removedTestMappingIds = [];
    this.discount = item.discountAmount || 0;
    this.basePaidAmount = item.paidAmount || 0;
    this.payNowAmount = 0;
    this.paidAmount = this.basePaidAmount;
    this.paymentMethod = 'cash';
    this.testSearchTerm = '';
    this.filteredTests = [];
    this.isTestLoading = true;
    this.isEditTestModalOpen = true;

    if (this.availableTests.length === 0) this.loadAvailableTests();

    this.labApi.getSingleBooking(item.bookingId).subscribe({
      next: (res: any) => {
        const fresh = this.mapBooking(res);
        this.selectedBooking = fresh;
        this.selectedTests = JSON.parse(JSON.stringify(fresh.tests || []));
        this.discount = fresh.discountAmount || 0;
        this.basePaidAmount = fresh.paidAmount || 0;
        this.paidAmount = this.basePaidAmount;
        this.isTestLoading = false;
      },
      error: () => { this.isTestLoading = false; }
    });
  }

  closeTestModal(): void {
    this.isEditTestModalOpen = false;
    this.selectedBooking = null;
    this.selectedTests = [];
    if (this.globalSearchTerm.trim()) this.isSearchModalOpen = true;
  }

  searchTestsInline(val: string): void {
    this.testSearchTerm = val ?? '';
    const q = this.testSearchTerm.trim();

    if (!q) {
      this.filteredTests = [];
      return;
    }

    const labId = this.labApi.getCurrentLabId();

    // ✅ FIX: Ha booking konatya franchise cha ahe tyachyach franchiseId
    // varun b2b price yeil — this.currentFranchiseId (Admin साठी नेहमी
    // undefined असतो) kadhihi fallback mhanun vaparu naka, nahitar
    // wrong/admin default price2 yeto, actual franchise-specific
    // assignedPrice nahi. `??` वापरल्यास franchiseId = 0 astana pan te
    // "defined" mhanun pakडलं जातं, mhanun explicit > 0 check kelela ahe.
    const bookingFranchiseId = Number(this.selectedBooking?.franchiseId || 0);
    const franchiseId = bookingFranchiseId > 0 ? bookingFranchiseId : undefined;

    this.labApi.searchTests(labId, franchiseId, q).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.content) ? res.content : [];

        this.filteredTests = list
          .filter((t: any) =>
            !this.selectedTests.some((s: any) => s.testName === String(t.test_name || '').trim())
          )
          .map((t: any) => ({
            testId: t.testId,
            testName: String(t.test_name || 'Unnamed Test').trim(),
            testMrp: t.test_price ?? 0,

            // ✅ FIX: Admin la base rate (price2), Franchise/Staff la
            // franchise-specific assignedPrice — add-patient sarkhach rule.
            testPrice: this.isAdminRole ? (t.price2 ?? 0) : (t.assignedPrice ?? t.price2 ?? 0)
          }));
      },
      error: () => {
        this.filteredTests = [];
      }
    });
  }

  searchPackagesInline(val: string): void {
    this.packageSearchTerm = val ?? '';
    const q = this.packageSearchTerm.trim();

    if (this.packageSearchTimer) clearTimeout(this.packageSearchTimer);

    if (!q) {
      this.filteredPackages = [];
      this.showPackageSuggestions = false;
      return;
    }

    this.packageSearchTimer = setTimeout(() => {
      const labId = this.labApi.getCurrentLabId();

      // ✅ FIX: same as searchTestsInline — booking cha swतःचा franchiseId
      // strict वापरा, this.currentFranchiseId कडे कधीही fallback नाही.
      const bookingFranchiseId = Number(this.selectedBooking?.franchiseId || 0);
      const franchiseId = bookingFranchiseId > 0 ? bookingFranchiseId : undefined;

      this.labApi.searchProfiles(labId, franchiseId, q).subscribe({
        next: (res: any) => {
          this.filteredPackages = Array.isArray(res?.content) ? res.content : [];
          this.showPackageSuggestions = this.filteredPackages.length > 0;
        },
        error: () => {
          this.filteredPackages = [];
          this.showPackageSuggestions = false;
        }
      });
    }, 250);
  }

  addPackageInline(pkg: any): void {
    const packageTests: any[] = pkg?.withTest || pkg?.tests || pkg?.testList || pkg?.profileTests || [];

    if (!Array.isArray(packageTests) || packageTests.length === 0) {
      this.toastService.warning('Empty Package', 'No tests found inside this package.');
      this.packageSearchTerm = '';
      this.showPackageSuggestions = false;
      return;
    }

    let addedCount = 0;

    packageTests.forEach((pt: any) => {
      const testId = Number(pt?.testId ?? pt?.test_id ?? pt?.id ?? 0);
      const testName = String(pt?.testName ?? pt?.test_name ?? '').trim();

      if (!testId || !testName) return;
      if (this.selectedTests.some((s: any) => s.testName === testName)) return;

      this.selectedTests.push({
        testId,
        testName,
        testMrp: pt.test_price ?? 0,

        // ✅ FIX: searchTestsInline() sarkhach role-based rule ithe pan
        // lagu keli — Admin la price2 (base rate) pahile, Franchise/Staff
        // la assignedPrice pahile. Adhi role check nasल्यamule Admin
        // sathihi assignedPrice (franchise-specific rate) yet hota.
        testPrice: this.isAdminRole
          ? (pt.price2 ?? pt.assignedPrice ?? 0)
          : (pt.assignedPrice ?? pt.price2 ?? 0),
        isNewlyAdded: true
      });

      addedCount++;
    });

    if (addedCount > 0) {
      this.toastService.success('Package Added', `${addedCount} test(s) added.`);
    } else {
      this.toastService.warning('Already Added', 'All tests from this package already exist.');
    }

    this.packageSearchTerm = '';
    this.filteredPackages = [];
    this.showPackageSuggestions = false;
  }

  addTestInline(test: any): void {
    this.selectedTests.push({ ...test, isNewlyAdded: true });
    this.testSearchTerm = '';
    this.filteredTests = [];
  }

  async removeTestInline(test: any): Promise<void> {
    const alert = await this.alertController.create({
      cssClass: 'premium-alert',
      header: 'Delete Test',
      message: `Are you sure you want to delete "${test.testName}"?`,
      buttons: [
        { text: 'No', role: 'cancel', cssClass: 'alert-btn-cancel' },
        {
          text: 'Yes, Delete',
          role: 'destructive',
          cssClass: 'alert-btn-danger',
          handler: () => this.handleRemoveTestConfirmed(test)
        }
      ]
    });

    await alert.present();
  }

  private handleRemoveTestConfirmed(test: any): void {
    if (test.isNewlyAdded) {
      this.selectedTests = this.selectedTests.filter((t: any) => t !== test);
      if (this.selectedBooking?.tests) {
        this.selectedBooking.tests = this.selectedBooking.tests.filter((t: any) => t !== test);
      }
      this.toastService.warning('Warning', `${test.testName} removed`);
      this.cdr.detectChanges();
      return;
    }

    if (!test.testMappingId) {
      this.toastService.error('Error', 'Test ID missing. Cannot delete this test.');
      return;
    }

    const labId = this.labApi.getCurrentLabId();
    if (!labId) {
      this.toastService.error('Error', 'Lab ID missing. Cannot delete test.');
      return;
    }

    const bookingId = this.selectedBooking?.bookingId;
    if (!bookingId) {
      this.toastService.error('Error', 'Booking ID missing. Cannot delete test.');
      return;
    }

    this.labApi.deleteTestFromBooking(labId, bookingId, test.testMappingId).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.selectedTests = this.selectedTests.filter(
            (t: any) => t.testMappingId !== test.testMappingId
          );
          if (this.selectedBooking?.tests) {
            this.selectedBooking.tests = this.selectedBooking.tests.filter(
              (t: any) => t.testMappingId !== test.testMappingId
            );
          }
          this.toastService.success('Success', `${test.testName} deleted successfully`);
          this.cdr.detectChanges();
          this.loadDashboard(true);
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.error('DELETE TEST ERROR:', err);
          this.toastService.error(
            'Error',
            err?.error?.message || 'Failed to delete test from database.'
          );
        });
      }
    });
  }

  onDiscountChangeInline(): void {
    if (!this.canEditBilling) { this.discount = 0; return; }
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
    this.onPayNowChangeInline();
  }

  onPayNowChangeInline(): void {
    if (!this.canViewPayment) {
      this.payNowAmount = 0;
      this.paidAmount = this.basePaidAmount;
      return;
    }
    if (this.payNowAmount < 0) this.payNowAmount = 0;

    const maxPayable = Math.max(0, this.totalAmount - this.basePaidAmount);
    if (this.payNowAmount > maxPayable) this.payNowAmount = maxPayable;
    this.paidAmount = this.basePaidAmount + this.payNowAmount;
  }

  saveTestChanges(): void {
    if (!this.selectedBooking || this.isSavingTest) return;
    this.isSavingTest = true;

    const labId = this.authService.currentUserValue?.raw?.labId;
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
      doctorid: this.selectedBooking.doctorId,
      franchiseId: this.selectedBooking.franchiseId,
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
          this.addNewTestsToBooking(bookingId, newTests);
        } else {
          this.finishTestSave();
        }
      },
      error: () => {
        this.isSavingTest = false;
        this.toastService.error('Error', 'Update fail zala');
      }
    });
  }

private addNewTestsToBooking(bookingId: number, newTests: any[]): void {
    const addTestBody: any = {
      bookingId,
      customerName: this.selectedBooking.customerName,
      age: this.selectedBooking.age,
      ageType: this.selectedBooking.ageType,
      gender: this.selectedBooking.gender,
      aadhaarNumber: this.selectedBooking.aadhaarNumber || '',
      tests: newTests.map(t => ({
        testId: t.testId,
        testName: t.testName,
        // ✅ FIX: b2b/billing price ata "testPrice" field madhe jato —
        // adhi ithe t.testMrp (MRP) chukिने jat hota, tyamule Admin
        // re-fetch nantar mapBooking() cha price2-fallback chain
        // (price2 ?? testPrice ?? test_price) la MRP milत hota, b2b nahi.
        testPrice: t.testPrice ?? t.testMrp,
        // ✅ FIX: MRP ata "test_price" field madhe — naming consistent
        // keli loadAvailableTests()/mapBooking() varlya conventionshi.
        test_price: t.testMrp,
        assignedPrice: [t.testPrice ?? t.testMrp],
        source: 'RPL',
        discount: 0,
        newTest: true
      }))
    };

    this.labApi.addTestToBooking(addTestBody).subscribe({
      next: () => this.finishTestSave(),
      error: () => {
        this.isSavingTest = false;
        this.toastService.error('Error', 'Test add fail zala');
      }
    });
  }

  private finishTestSave(): void {
    this.isSavingTest = false;
    this.toastService.success('Success', 'Booking updated successfully');
    this.closeTestModal();
    if (this.globalSearchTerm.trim()) this.performGlobalSearch(this.globalSearchTerm.trim());
    this.loadDashboard(true);
  }

  // ============================================================
  // EDIT PATIENT MODAL
  // ============================================================
  onEditPatientClick(item: any): void {
    if (!this.canEditPatient) return;
    this.isSearchModalOpen = false;
    this.editPatientFromSearch(item);
  }

  editPatientFromSearch(item: any): void {
    this.editPatientData = null;
    this.isPatientLoading = true;
    this.isEditPatientModalOpen = true;

    this.labApi.getSingleBooking(item.bookingId).subscribe({
      next: (res: any) => {
        const fresh = this.mapBooking(res);
        const data: any = JSON.parse(JSON.stringify(fresh));
        data.name = fresh.customerName;
        data.doctor = fresh.doctorName || '';
        data.lab = fresh.franchiseName || 'SELF';
        data.title = fresh.title || '';
        data.doctorTitle = '';
        data.customDoctorName = fresh.customDoctorName || '';
        data.customFranchiseLab = fresh.customFranchiseLab || '';
        data.doctorId = fresh.doctorId || null;
        data.franchiseId = fresh.franchiseId || null;

        this.editPatientData = data;
        this.doctorSearch = data.doctor;
        this.labSearch = data.lab;
        this.customLabSearch = data.customFranchiseLab || '';
        this.isPatientLoading = false;
      },
      error: () => {
        this.isPatientLoading = false;
        this.isEditPatientModalOpen = false;
      }
    });
  }

  closePatientModal(): void {
    this.isEditPatientModalOpen = false;
    this.editPatientData = null;
    this.doctorSearch = '';
    this.labSearch = '';
    this.filteredDoctors = [];
    this.filteredLabs = [];
    this.showDoctorSuggestions = false;
    this.showLabDropdown = false;
    this.customLabSearch = '';
    this.filteredCustomLabs = [];
    this.showCustomLabDropdown = false;
    if (this.globalSearchTerm.trim()) this.isSearchModalOpen = true;
  }

  savePatientChanges(): void {
    if (!this.editPatientData) return;

    const labId = this.authService.currentUserValue?.raw?.labId;
    const doctorId = Number(this.editPatientData.doctorId || 0);
    const doctorName = String(this.editPatientData.doctor || '').trim();
    const franchiseId = Number(this.editPatientData.franchiseId || 0);
    const labName = String(this.editPatientData.lab || '').trim();
    const customDoctorName = String(this.editPatientData.customDoctorName || '').trim();
    const customFranchiseLab = String(this.editPatientData.customFranchiseLab || '').trim();

    const body = {
      bookingId: this.editPatientData.bookingId,
      customerName: this.editPatientData.name,
      title: this.editPatientData.title,
      ageType: this.editPatientData.ageType,
      age: this.editPatientData.age,
      gender: this.editPatientData.gender,
      mobileNumber: this.editPatientData.mobileNumber,
      aadhaarNumber: this.editPatientData.aadhaarNumber,
      doctorid: doctorId > 0 ? doctorId : 0,
      customDoctorName,
      franchiseId: franchiseId > 0 ? franchiseId : (this.editPatientData.franchiseId || 0),
      customFranchiseLab,
      createdOn: this.editPatientData.createdOn
    };

    const bookingId = this.editPatientData.bookingId;

    this.labApi.updatePatient(labId, bookingId, body).subscribe({
      next: () => {
        this.toastService.success('Success', 'Patient updated successfully');
        this.patchSearchResultAfterPatientEdit(bookingId, {
          customDoctorName, customFranchiseLab, doctorName, labName
        });
        this.closePatientModal();
      },
      error: () => this.toastService.error('Error', 'Patient update fail zala')
    });
  }

  private patchSearchResultAfterPatientEdit(
    bookingId: number,
    ctx: { customDoctorName: string; customFranchiseLab: string; doctorName: string; labName: string }
  ): void {
    const idx = this.searchResults.findIndex((b: any) => b.bookingId === bookingId);
    if (idx === -1) return;

    const updated = { ...this.searchResults[idx] };
    updated.customerName = this.editPatientData.name;
    updated.title = this.editPatientData.title;
    updated.age = this.editPatientData.age;
    updated.ageType = this.editPatientData.ageType;
    updated.gender = this.editPatientData.gender;
    updated.mobileNumber = this.editPatientData.mobileNumber;
    updated.aadhaarNumber = this.editPatientData.aadhaarNumber;
    updated.uhidNumber = this.editPatientData.uhidNumber;
    updated.customDoctorName = ctx.customDoctorName;
    updated.customFranchiseLab = ctx.customFranchiseLab;
    updated.doctorName = ctx.customDoctorName || ctx.doctorName || 'self';
    updated.franchiseName = ctx.customFranchiseLab || ctx.labName || 'SELF';

    this.searchResults = [
      ...this.searchResults.slice(0, idx),
      updated,
      ...this.searchResults.slice(idx + 1)
    ];
  }

  searchDoctorInput(): void {
    const searchTerm = String(this.doctorSearch || '').trim().toLowerCase();
    if (!this.editPatientData) return;

    this.editPatientData.doctorId = null;

    if (!searchTerm) {
      this.filteredDoctors = [];
      this.showDoctorSuggestions = false;
      return;
    }

    this.labApi.getDoctors().subscribe({
      next: (res: any) => {
        const doctors = res?.data || res?.doctors || res?.content || res || [];
        if (!Array.isArray(doctors)) {
          this.filteredDoctors = [];
          this.showDoctorSuggestions = false;
          return;
        }

        this.doctors = doctors;
        this.filteredDoctors = doctors.filter((doctor: any) => {
          const name = String(doctor?.doctor_name || doctor?.doctorName || doctor?.name || '').trim().toLowerCase();
          return name.includes(searchTerm);
        });
        this.showDoctorSuggestions = this.filteredDoctors.length > 0;
      },
      error: () => {
        this.filteredDoctors = [];
        this.showDoctorSuggestions = false;
      }
    });
  }

  selectDoctorFromSearch(doc: any): void {
    if (!doc || !this.editPatientData) return;

    const doctorId = Number(doc?.doctorid ?? doc?.doctorId ?? doc?.id ?? 0);
    const doctorName = String(doc?.doctor_name || doc?.doctorName || doc?.name || '').trim();

    this.editPatientData.doctor = doctorName;
    this.editPatientData.doctorId = doctorId;
    this.doctorSearch = doctorName;
    this.showDoctorSuggestions = false;
  }

  searchLabInput(): void {
    const q = String(this.labSearch || '').trim().toLowerCase();
    if (!this.editPatientData) return;

    this.editPatientData.franchiseId = null;

    if (!q) {
      this.filteredLabs = [];
      this.showLabDropdown = false;
      return;
    }

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.content || []);
        this.labs = list;
        this.filteredLabs = list.filter((lab: any) => {
          const name = String(lab?.franchiseName || lab?.name || '').trim().toLowerCase();
          return name.includes(q);
        });
        this.showLabDropdown = this.filteredLabs.length > 0;
      },
      error: () => {
        this.filteredLabs = [];
        this.showLabDropdown = false;
      }
    });
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
      error: () => {
        this.filteredCustomLabs = [];
        this.showCustomLabDropdown = false;
      }
    });
  }

  selectCustomLabFromSearch(lab: any): void {
    if (!lab || !this.editPatientData) return;

    const name = String(lab?.labName || lab?.franchiseName || lab?.name || '').trim();
    this.editPatientData.customFranchiseLab = name;
    this.customLabSearch = name;
    this.showCustomLabDropdown = false;
  }

  selectLabFromSearch(lab: any): void {
    if (!lab || !this.editPatientData) return;

    const franchiseId = Number(lab?.franchiseId ?? lab?.id ?? 0);
    const franchiseName = String(lab?.franchiseName || lab?.name || '').trim();

    this.editPatientData.lab = franchiseName;
    this.editPatientData.franchiseId = franchiseId;
    this.labSearch = franchiseName;
    this.showLabDropdown = false;
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

  // ============================================================
  // BARCODE MODAL
  // ============================================================
  onEditBarcodeClick(item: any): void {
    this.isSearchModalOpen = false;
    this.openBarcodeFromSearch(item);
  }

  private buildBarcodeRows(fresh: any): BarcodeRow[] {
    return (fresh.samples || []).map((s: any) => {
      const matchedTest = (fresh.tests || []).find((t: any) => Number(t.testId) === Number(s.testId));
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
        accessionId: s.accessionId,
        sampleTypeId: s.sampleTypeId,
        sampleType: s.sampleType || '-',
        oldBarcode: s.barcode,
        newBarcode: s.barcode,
        receiveDate: '',
        status: displayStatus,
        canEditBarcode: canEdit,
        saving: false
      };
    });
  }

  openBarcodeFromSearch(item: any): void {
    this.barcodeBooking = item;
    this.barcodeRows = [];
    this.isBarcodeLoading = true;
    this.isBarcodeModalOpen = true;

    this.labApi.getSingleBooking(item.bookingId).subscribe({
      next: (res: any) => {
        const fresh = this.mapBooking(res);
        this.barcodeBooking = fresh;
        this.barcodeRows = this.buildBarcodeRows(fresh);
        this.isBarcodeLoading = false;
      },
      error: () => {
        this.toastService.error('Error', 'Barcode detail load fail zala');
        this.isBarcodeLoading = false;
        this.isBarcodeModalOpen = false;
      }
    });
  }

  closeBarcodeModal(): void {
    this.isBarcodeModalOpen = false;
    this.barcodeBooking = null;
    this.barcodeRows = [];
    if (this.globalSearchTerm.trim()) this.isSearchModalOpen = true;
  }

  openDateTimePicker(row: any): void {
    this.activeDateTimeRow = row;
    this.tempDateTimeValue = new Date().toISOString().slice(0, 19);
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

  updateBarcodeRow(row: BarcodeRow): void {
    if (this.roleService.currentRole === this.ROLE_STAFF ||
      this.roleService.currentRole === this.ROLE_FRANCHISE_STAFF) {
      this.toastService.warning('Warning', 'You are not authorized to edit the barcode');
      return;
    }
    if (!row.canEditBarcode) {
      this.toastService.warning('Warning', 'This barcode cannot be edited (test is in-process/completed)');
      return;
    }
    if (!row.newBarcode?.trim()) {
      this.toastService.warning('Warning', 'Barcode cannot be empty');
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
      next: () => {
        this.toastService.success('Success', 'Barcode updated successfully');
        this.labApi.getSingleBooking(bookingId).subscribe({
          next: (res: any) => {
            const fresh = this.mapBooking(res);
            this.barcodeBooking = fresh;
            this.barcodeRows = this.buildBarcodeRows(fresh);
            if (this.globalSearchTerm.trim()) this.refreshSearchResultsSilently();
            this.loadDashboard(true);
          },
          error: () => { row.saving = false; }
        });
      },
      error: () => {
        row.saving = false;
        this.toastService.error('Error', 'Failed to update barcode');
      }
    });
  }

  // ============================================================
  // DASHBOARD DATA LOAD
  // ============================================================
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
    const calls = dayRanges.map(r =>
      this.labApi.getBookingStatusNew(labId, 0, PAGE_SIZE, r.start, r.end, this.currentFranchiseId)
    );

    return forkJoin(calls).pipe(
      map((pages: any[]) => {
        let all: any[] = [];
        for (const pageRes of pages) all = all.concat(pageRes?.content || pageRes || []);
        return all;
      })
    );
  }

  loadDashboard(silent: boolean = false): void {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const today = new Date();

    if (this.roleService.isFullAccess) {
      this.loadFullAccessDashboard(labId, today, silent);
    } else {
      this.loadStaffDashboard(currentUser, labId, silent);
    }
  }

  private loadFullAccessDashboard(labId: any, today: Date, silent: boolean): void {
    const selectedStart = this.fromDate;
    const selectedEnd = this.nextDay(this.toDate);

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
        // ✅ FIX: cancelled samples aadhi kadhich vachle jat navhte,
        // tyamule totalSamples ani samplesCanceled donhi chukiche yet hote.
        const totalCancelled = Number(s?.cancel ?? s?.cancelled ?? s?.canceled ?? 0);

        // ✅ FIX: totalSamples madhe cancelled add kela
        this.totalSamples = totalReceived + totalPending + totalOutSourced + totalRejected + totalCancelled;
        // ✅ FIX: samplesCanceled full-access dashboard sathi ithech set kela
        // (aadhi ha property फक्त staff dashboard madhe set hot hota)
        this.samplesCanceled = totalCancelled;

        this.totalReports = selected.reports?.[0]?.completed || 0;

        this.dailyBookings = days.map((d, idx) => {
          const resp: any = daily[idx];
          const smp = resp.samples?.[0];

          const received = Number(smp?.received || 0);
          const pending = Number(smp?.notReceived || 0);
          const outSourced = Number(smp?.outSourced || 0);
          const rejected = Number(smp?.rejected || 0);
          // ✅ FIX: cancelled ithe pan add kela
          const cancelled = Number(smp?.cancel ?? smp?.cancelled ?? smp?.canceled ?? 0);

          return {
            dateKey: d.key,
            date: d.display.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            bookings: resp.totalBookingsCount || 0,
            // ✅ FIX: samples cha total madhe cancelled include kela
            samples: received + pending + outSourced + rejected + cancelled,
            received, pending, outSourced, rejected, cancelled,
            amount: Number(resp.totalPaid || 0)
          };
        });

        this.rawBookings = [];
      },
      error: (err) => {
        this.loading = false;
        this.loadInProgress = false;
        if (!silent) {
          console.error('DASHBOARD SUMMARY ERROR:', err);
          this.toastService.error('Error', 'Failed to load dashboard data');
        }
      }
    });
  }

  private loadStaffDashboard(currentUser: any, labId: any, silent: boolean): void {
    const selectedStart = this.fromDate;
    const selectedEnd = this.nextDay(this.toDate);

    forkJoin({
      selectedDayBookings: this.labApi.getBookingStatusNew(labId, 0, 500, selectedStart, selectedEnd, this.currentFranchiseId),
      rollingWindowBookings: this.fetchBookingsForWindow(5)
    }).subscribe({
      next: ({ selectedDayBookings, rollingWindowBookings }: any) => {
        this.loading = false;
        this.loadInProgress = false;

        const selectedContent = selectedDayBookings?.content || selectedDayBookings || [];
        const selectedFiltered = this.applyStaffOwnershipFilter(selectedContent);
        const mappedBookings = selectedFiltered.map((raw: any) => this.mapBooking(raw));

        this.totalPatients = selectedFiltered.length;
        this.totalBookings = selectedFiltered.length;

        this.computeStaffDashboardStats(mappedBookings);

        // ✅ FIX: map raw bookings so `tests`/`samples` field names are normalized
        // (raw API returns bookingWithTestMappings/sampleAccessions, not tests/samples)
        const mappedRollingWindow = (rollingWindowBookings || []).map((raw: any) => this.mapBooking(raw));
        this.rawBookings = this.applyStaffOwnershipFilter(mappedRollingWindow);
        this.prepareDailyBookings();
      },
      error: (err) => {
        this.loading = false;
        this.loadInProgress = false;
        if (!silent) {
          console.error('DASHBOARD STAFF ERROR:', err);
          this.toastService.error('Error', 'Failed to load dashboard data');
        }
      }
    });
  }

  // ✅ NEW HELPER: ekach jaga varun sagle sample/test counts consistently
  // classify karnyasathi. `tests` array reliable ahe karan cancel-status
  // ithech (t.cancelDate / t.deleted) yeto — `samples` array madhe
  // cancelled cha record backend kadhun kadhikadhi missing asto, tyamule
  // top summary card ani daily-breakdown card वेगळे counts dakhavत hote.
  private classifyTestStatus(status: string): 'received' | 'pending' | 'outSourced' | 'rejected' | 'cancelled' {
    const st = (status || '').toLowerCase();
    if (st === 'cancel' || st === 'cancelled') return 'cancelled';
    if (st.includes('reject')) return 'rejected';
    if (st.includes('process') || st.includes('outsource') || st.includes('doctor approval')) return 'outSourced';
    if (st.includes('complete') || st.includes('ready')) return 'received';
    return 'pending'; // snr / default
  }

  private computeStaffDashboardStats(mappedBookings: any[]): void {
    let patientsCompleted = 0, patientsPending = 0;
    // ✅ FIX: outSourced/rejected/cancelled buckets add kele, ani sagle
    // counts ata `tests` array varun (samples array ऐवजी) kadhले jataहेत.
    let receivedCount = 0, pendingCount = 0, outSourcedCount = 0, rejectedCount = 0, cancelledCount = 0;
    let reportsCompletedCount = 0, reportsPendingCount = 0;
    let businessAmount = 0;

    mappedBookings.forEach((b: any) => {
      const tests = b.tests || [];
      const allComplete = tests.length > 0 && tests.every((t: any) => {
        const st = (t.status || '').toLowerCase();
        return st.includes('complete') || st.includes('ready');
      });
      if (allComplete) patientsCompleted++; else patientsPending++;

      // ✅ FIX: samples array ऐवजी tests array वापरला — cancelled reliably
      // count होईल, ani top-card cha total daily-breakdown shी match होईल.
      tests.forEach((t: any) => {
        const bucket = this.classifyTestStatus(t.status);
        if (bucket === 'received') receivedCount++;
        else if (bucket === 'outSourced') outSourcedCount++;
        else if (bucket === 'rejected') rejectedCount++;
        else if (bucket === 'cancelled') cancelledCount++;
        else pendingCount++;

        const st = (t.status || '').toLowerCase();
        if (st.includes('complete') || st.includes('ready')) reportsCompletedCount++;
        else reportsPendingCount++;
      });

      businessAmount += Number(b.totalAmount || 0);
    });

    this.patientsPending = patientsPending;
    this.patientsCompleted = patientsCompleted;
    this.samplesMissing = pendingCount;
    this.samplesReceived = receivedCount;
    // ✅ FIX: cancelled ata staff dashboard sathi barobar count hoto
    this.samplesCanceled = cancelledCount;
    // ✅ FIX: totalSamples madhe cancelled (ani outSourced/rejected) include kele —
    // aadhi फक्त received+missing hote, tyamule cancelled sample total madhun
    // "गायब" व्हायचा.
    this.totalSamples = receivedCount + pendingCount + outSourcedCount + rejectedCount + cancelledCount;
    this.reportsPending = reportsPendingCount;
    this.reportsCompleted = reportsCompletedCount;
    this.totalReports = reportsCompletedCount;
    this.totalBusinessAmount = businessAmount;
    this.totalCanceledAmount = 0;
  }

  prepareDailyBookings(): void {
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
          // ✅ FIX: cancelled field add kela, tests-based counting sathi
          bookings: 0, samples: 0, received: 0, pending: 0, outSourced: 0, rejected: 0, cancelled: 0, tests: 0, amount: 0
        };
      }

      grouped[key].bookings++;
      grouped[key].amount += Number(p.totalAmount || 0);

      // ✅ FIX: p.samples ऐवजी p.tests हाच single source वापरला — top summary
      // card (computeStaffDashboardStats) shी susangat rahण्यasathi, ani
      // cancelled backend kadhun missing yeto tya problem madhun sutka.
      const tests = p.tests || [];
      grouped[key].tests += tests.length;
      grouped[key].samples += tests.length;

      tests.forEach((t: any) => {
        const bucket = this.classifyTestStatus(t.status);
        if (bucket === 'received') grouped[key].received++;
        else if (bucket === 'outSourced') grouped[key].outSourced++;
        else if (bucket === 'rejected') grouped[key].rejected++;
        else if (bucket === 'cancelled') grouped[key].cancelled++;
        else grouped[key].pending++;
      });
    });

    this.dailyBookings = Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(key => grouped[key])
      .slice(0, 5);
  }

  // ============================================================
  // BOOKING MAPPING / STATUS LABELS
  // ============================================================
  private mapBooking(raw: any): any {
    const rawTests = (raw.bookingWithTestMappings || raw.tests || []).filter((t: any) => !!t.testName);
    const reportsRaw = raw.reports || [];
    const statusByTestId = new Map<number, string>();
    reportsRaw.forEach((r: any) => {
      if (r.testId != null) statusByTestId.set(r.testId, r.reportStatus || 'PENDING');
    });

    const tests = rawTests.map((t: any) => {
      const matchedSample = (raw.sampleAccessions || raw.samples || []).find(
        (s: any) => Number(s.testId) === Number(t.testId)
      );
      const isSampleReceived = (matchedSample?.status || '').toUpperCase() === 'RECEIVED';
      const defaultStatus = isSampleReceived ? 'inprocess' : 'snr';

      return {
        testId: t.testId,
        testMappingId: t.testMappingId ?? t.bookingWithTestMappingId,
        testName: (t.testName || '').trim(),

        // ✅ FIX: Admin/Franchise/Staff sathi price kalatana tefarak
        // yeत hota — searchTestsInline() cha rule ithe pan lagu kelay:
        // Admin la nehmi price2 (base rate) pahile milava, franchise-
        // specific assignedPrice nahi; Franchise/Staff sathi ulta.
        // Adhi assignedPrice sagalyat pahile hota, tyamule Admin login
        // asतानाही Edit Test modal madhe existing test cha price
        // franchise-specific yeत hota (add-patient/searchTestsInline
        // peksha veगळा) — hach tumcha "edit test madhe price different"
        // cha mool karan hota.
        testPrice: this.isAdminRole
          ? (t.price2 ?? t.testPrice ?? t.test_price ?? 0)
          : (t.assignedPrice ?? t.testPrice ?? t.test_price ?? t.price2 ?? 0),
        testMrp: t.testMrp ?? t.test_mrp ?? 0,

        status: (t.cancelDate || t.deleted) ? 'cancel' :
          (statusByTestId.get(t.testId) ||
            (t.reportStatus && t.reportStatus.toUpperCase() !== 'PENDING' ? t.reportStatus : null) ||
            defaultStatus)
      };
    });

    const seen = new Set<string>();
    const samples: any[] = [];
    (raw.sampleAccessions || raw.samples || []).forEach((s: any) => {
      const barcode = s.barCode || s.barcode;
      if (!barcode || seen.has(barcode)) return;
      seen.add(barcode);

      samples.push({
        accessionId: s.accessionId || s.sampleAccessionId,
        barcode,
        sampleType: s.sampleTypeData?.sample_type || s.sampleType,
        sampleTypeId: s.sampleTypeData?.sample_type_id ?? s.sampleTypeId,
        status: s.status,
        testId: Number(s.testId)
      });
    });

    return {
      ...raw,
      tests,
      samples,
      // FIX: custom name/lab must win over raw.doctorName/raw.franchiseName —
      // matches booking-status.page.ts's mapBookingItem() priority order, so
      // this page no longer reverts to the old doctor/lab name after refresh.
      doctorName: raw.customDoctorName?.trim() || raw.doctorName || 'self',
      franchiseName: raw.customFranchiseLab?.trim() || raw.franchiseName || 'SELF'
    };
  }

  private testStatusLabel(status?: string): string {
    const s = (status || 'snr').toLowerCase();
    if (s === 'cancel' || s === 'cancelled') return 'CANCEL';
    if (s === 'snr') return 'SNR';
    if (s.includes('recheck') || s.includes('hold')) return 'RECHECK & HOLD';
    if (s.includes('complete') || s.includes('ready')) return 'COMPLETE';
    if (s.includes('process') || s.includes('outsource') || s.includes('doctor approval')) return 'IN PROCESS';
    return 'PENDING';
  }

  private testStatusClass(status?: string): string {
    const s = (status || 'snr').toLowerCase();
    if (s === 'cancel' || s === 'cancelled') return 'badge-cancel';
    if (s === 'snr') return 'badge-snr';
    if (s.includes('recheck') || s.includes('hold')) return 'badge-recheck';
    if (s.includes('complete') || s.includes('ready')) return 'badge-ready';
    if (s.includes('process') || s.includes('outsource') || s.includes('doctor approval')) return 'badge-inprocess';
    return 'badge-pending';
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  goToPage(page: string): void {
    this.menuCtrl.close();
    this.router.navigate(['/' + page]);
  }

  goToProfile(): void {
    this.menuCtrl.close();
    this.router.navigate(['/profile']);
  }

  goToNotifications(): void {
    this.router.navigate(['/notification']);
  }

  logout(): void {
    this.menuCtrl.close();
    this.pollSub?.unsubscribe();
    this.authService.logout();
    window.location.href = '/login';
  }

  // ============================================================
  // WALLET — LOAD / POLL
  // ============================================================
  loadWallet(): void {
    const labId = this.authService.labId;
    const franchiseId = this.authService.franchiseId;

    this.walletService.getWallet(labId, franchiseId, 0, 1).subscribe({
      next: (res: any) => {
        this.wallet = res?.content ? { ...res, ...(res.content[0] || {}) } : res;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('WALLET LOAD ERROR:', err)
    });
  }

  private refreshWalletSilently(): void {
    const labId = this.authService.labId;
    const franchiseId = this.authService.franchiseId;
    if (!labId || !franchiseId) return;

    this.walletService.getWallet(labId, franchiseId, 0, 1).subscribe({
      next: (res: any) => {
        this.wallet = res?.content ? { ...res, ...(res.content[0] || {}) } : res;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('SILENT WALLET REFRESH ERROR:', err)
    });

    if (this.isWalletModalOpen) {
      this.walletService.getWallet(labId, franchiseId, 0, this.walletSize, true, this.walletPaymentModeFilter)
        .subscribe({
          next: (res: any) => {
            const content = res?.transaction?.content || [];
            this.walletTransactions = content;
            this.walletTotalRows = res?.transaction?.totalElements ?? content.length;
            this.cdr.detectChanges();
          },
          error: (err) => console.error('SILENT WALLET TRANSACTION REFRESH ERROR:', err)
        });
    }
  }

  // ============================================================
  // WALLET MODAL / TRANSACTIONS
  // ============================================================
  openWalletModal(): void {
    this.isWalletModalOpen = true;
    this.walletPage = 0;
    this.walletTransactions = [];
    this.loadWalletTransactions();
  }

  closeWalletModal(): void {
    this.isWalletModalOpen = false;
  }

  onWalletFilterChange(): void {
    this.walletPage = 0;
    this.walletTransactions = [];
    this.loadWalletTransactions();
  }

  loadWalletTransactions(): void {
    const labId = this.authService.labId;
    const franchiseId = this.authService.franchiseId;

    this.isWalletLoading = true;

    this.walletService.getWallet(
      labId, franchiseId, this.walletPage, this.walletSize, true, this.walletPaymentModeFilter
    ).subscribe({
      next: (res: any) => {
        const content = res?.transaction?.content || [];
        this.walletTransactions = [...this.walletTransactions, ...content];
        this.walletTotalRows = res?.transaction?.totalElements ?? this.walletTransactions.length;
        this.isWalletLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('WALLET TRANSACTIONS ERROR:', err);
        this.isWalletLoading = false;
        this.toastService.error('Error', 'Wallet transactions load fail zala');
        this.cdr.detectChanges();
      }
    });
  }

  onWalletScroll(): void {
    if (this.walletTransactions.length >= this.walletTotalRows) return;
    this.walletPage++;
    this.loadWalletTransactions();
  }

  // ============================================================
  // ADD FUNDS MODAL — ✅ SIMPLIFIED: only Razorpay, for both Admin
  // and Franchise. No ICICI/UPI/QR/Bank Transfer, no manual flow.
  // ============================================================
  openAddFundsModal(): void {
    this.addFundsAmount = null;
    this.isAddFundsModalOpen = true;
  }

  closeAddFundsModal(): void {
    this.isAddFundsModalOpen = false;
  }

  submitAddFunds(): void {
    if (!this.addFundsAmount || Number(this.addFundsAmount) <= 0) {
      this.toastService.warning('Warning', 'Please enter a valid amount');
      return;
    }
    this.confirmAddFunds();
  }

  /** Amount confirm करणारा premium Yes/No popup — Yes दाबल्यावर
   *  थेट Razorpay flow सुरू होतो, No दाबलं तर Add Funds modal वरच राहतो. */
  private async confirmAddFunds(): Promise<void> {
    const amount = Number(this.addFundsAmount);

    const alert = await this.alertController.create({
      cssClass: 'premium-alert payment-confirm-alert',
      header: 'Confirm Payment',
      message: `Add ₹${amount} via Razorpay?`,
      buttons: [
        { text: 'No', role: 'cancel', cssClass: 'alert-btn-cancel' },
        {
          text: 'Yes',
          cssClass: 'alert-btn-confirm',
          handler: () => this.submitOnlineAddFunds()
        }
      ]
    });

    await alert.present();
  }

  private submitOnlineAddFunds(): void {
    this.isAddFundsSaving = true;

    const baseAmount = Number(this.addFundsAmount);
    const gstAmount = this.isAdminRole ? +(baseAmount * ADMIN_GST_RATE).toFixed(2) : 0;
    const finalAmount = this.isAdminRole ? +(baseAmount + gstAmount).toFixed(2) : baseAmount;

    const buildAndSendOrder = () => {
      const payload: any = {
        totalAmount: finalAmount,
        gst: gstAmount,
        pgName: 'razorpay',
        type: 'walletRecharge',
        walletId: this.wallet?.walletId,
        remark: 'Wallet recharge',
        returnUrl: window.location.origin + '/'
      };

      if (!payload.walletId) {
        this.isAddFundsSaving = false;
        this.toastService.error('Error', 'Wallet not loaded yet, please try again');
        return;
      }

      const orderCall$ = this.isAdminRole
        ? this.walletService.createLabRechargeOrder(payload)
        : this.walletService.createRazorpayOrder(payload);

      orderCall$.subscribe({
        next: (orderRes: any) => {
          this.isAddFundsSaving = false;

          if (!orderRes?.paymentDetails?.razorpayOrderId) {
            this.toastService.error('Error', 'Order create झाला पण payment details missing आहेत');
            return;
          }

          if (Capacitor.isNativePlatform()) {
            this.openRazorpayCheckout(orderRes);
          } else {
            this.isAddFundsModalOpen = false;
            setTimeout(() => this.openRazorpayCheckout(orderRes), 300);
          }
        },
        error: (err) => {
          this.isAddFundsSaving = false;
          this.toastService.error('Error', err?.error?.message || 'Order create fail zala');
        }
      });
    };

    if (!this.wallet?.walletId) {
      const labId = this.authService.labId;
      const franchiseId = this.authService.franchiseId;
      this.walletService.getWallet(labId, franchiseId, 0, 1).subscribe({
        next: (res: any) => {
          this.wallet = res?.content ? { ...res, ...(res.content[0] || {}) } : res;
          this.cdr.detectChanges();
          buildAndSendOrder();
        },
        error: () => {
          this.isAddFundsSaving = false;
          this.toastService.error('Error', 'Wallet load fail zala');
        }
      });
    } else {
      buildAndSendOrder();
    }
  }

  // ============================================================
  // RAZORPAY CHECKOUT
  // ============================================================
  private ensureRazorpayScriptLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Razorpay) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject('Razorpay script load fail zala');
      document.body.appendChild(script);
    });
  }

  private async openRazorpayCheckout(orderRes: any): Promise<void> {
    this.orderId = orderRes.orderId;

    const options: any = {
      key: orderRes.keyId,
      amount: (orderRes.totalAmount * 100).toString(),
      currency: 'INR',
      order_id: orderRes.paymentDetails.razorpayOrderId,
      name: 'Franchise Wallet Recharge',
      description: 'Add funds to wallet',
      theme: { color: '#087b76' }
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const data: any = await Checkout.open(options);
        this.ngZone.run(() => {
          this.isAddFundsModalOpen = false;
          this.verifyWalletPayment(data.razorpay_payment_id, this.orderId);
        });
      } catch {
        this.ngZone.run(() => this.toastService.warning('Warning', 'Payment cancelled or failed'));
      }
      return;
    }

    try {
      await this.ensureRazorpayScriptLoaded();
    } catch {
      this.toastService.error('Error', 'Payment gateway load fale');
      return;
    }

    const webOptions: any = {
      ...options,
      handler: (response: any) => {
        this.ngZone.run(() => {
          this.isAddFundsModalOpen = false;
          this.verifyWalletPayment(response.razorpay_payment_id, this.orderId);
        });
      },
      modal: {
        ondismiss: () => {
          this.ngZone.run(() => this.toastService.warning('Warning', 'Payment cancelled'));
        }
      }
    };

    const rzp = new (window as any).Razorpay(webOptions);
    rzp.open();
  }

  // ============================================================
  // PAYMENT VERIFICATION
  // ============================================================
  async verifyWalletPayment(razorpayPaymentId: any, orderId: any): Promise<void> {
    const walletId = this.wallet?.walletId;

    this.verifyLoading = await this.loadingController.create({
      message: 'We are verifying your payment, please wait...',
      spinner: 'crescent',
      backdropDismiss: false,
      cssClass: 'payment-verify-loading'
    });
    await this.verifyLoading.present();

    let retryCount = 0;

    const attempt = () => {
      this.walletService.verifyWalletPayment(
        razorpayPaymentId, orderId, this.authService.labId, walletId
      ).subscribe({
        next: (data: any) => {
          const isPaid = this.isPaymentPaid(data);

          if (isPaid) {
            this.onPaymentVerified();
            return;
          }

          retryCount++;
          if (retryCount < PAYMENT_VERIFY_MAX_RETRIES) {
            setTimeout(attempt, PAYMENT_VERIFY_RETRY_DELAY_MS);
          } else {
            this.dismissVerifyLoading();
            this.isAddFundsModalOpen = false;
            this.isWalletModalOpen = true;
            this.toastService.error('Error', 'Payment verification failed, please contact support');
            this.cdr.detectChanges();
          }
        },
        error: (err: any) => this.handleVerifyError(err, razorpayPaymentId)
      });
    };

    setTimeout(attempt, PAYMENT_VERIFY_INITIAL_DELAY_MS);
  }

  private dismissVerifyLoading(): void {
    this.verifyLoading?.dismiss();
    this.verifyLoading = undefined;
  }

  private isPaymentPaid(data: any): boolean {
    if (!data) return false;
    return (
      data.status === 'PAID' ||
      data.status === 'SUCCESS' ||
      data.paymentDetails?.paymentStatus === 'success' ||
      data.paymentDetails?.status === 'PAID' ||
      data.paymentStatus === 'success' ||
      data.paid === true ||
      data.success === true
    );
  }

  private onPaymentVerified(): void {
    this.dismissVerifyLoading();
    this.isAddFundsModalOpen = false;
    this.isWalletModalOpen = true;
    this.toastService.success('Success', 'Wallet recharge successful');
    this.cdr.detectChanges();

    this.walletService.getWallet(this.authService.labId, this.authService.franchiseId, 0, 1).subscribe({
      next: (walletRes: any) => {
        const normalizedWallet = walletRes?.content ? { ...walletRes, ...(walletRes.content[0] || {}) } : walletRes;
        this.wallet = normalizedWallet;
        this.walletPage = 0;
        this.walletTransactions = [];
        this.loadWalletTransactions();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      }
    });
  }

  private handleVerifyError(err: any, razorpayPaymentId: any): void {
    this.dismissVerifyLoading();
    this.isAddFundsModalOpen = false;
    this.isWalletModalOpen = true;

    if (err?.status === 401 || err?.status === 400) {
      this.toastService.error(
        'Session Expired',
        'Payment झाला आहे, पण session expire झाल्याने verify करता आला नाही. ' +
        'Krupya पुन्हा login करून Wallet cha balance check kara. Payment ID: ' + razorpayPaymentId
      );
    } else {
      this.toastService.error('Error', err?.error?.message || 'Payment verification error');
    }

    this.cdr.detectChanges();
  }

  // ============================================================
  // OFFLINE ORDER APPROVAL (LAB ADMIN ACTION)
  // ============================================================
  approveOfflinePayment(paymentId: any): void {
    this.walletService.approveOfflineOrder(paymentId).subscribe({
      next: () => {
        this.toastService.success('Success', 'Offline payment approved');
        this.loadWallet();
        if (this.isWalletModalOpen) {
          this.walletPage = 0;
          this.walletTransactions = [];
          this.loadWalletTransactions();
        }
      },
      error: (err) => {
        this.toastService.error('Error', err?.error?.message || 'Approve fail zala');
      }
    });
  }
}