import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild, NgZone, ChangeDetectorRef } from "@angular/core";
import { Router, ActivatedRoute } from "@angular/router";

import { FormsModule } from "@angular/forms";

import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonProgressBar,
  IonModal,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonDatetime,
  IonButton,
  IonSearchbar,
  MenuController,
  AlertController   
} from "@ionic/angular/standalone";

import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";

import {
  Subscription,
  interval,
  forkJoin,
  Observable
} from "rxjs";

import { map } from "rxjs/operators";
import { firstValueFrom } from "rxjs";
import { StackedBarComponent } from "../../components/stacked-bar/stacked-bar.component";

import { addIcons } from "ionicons";

import {
  beakerOutline, calendarOutline, documentTextOutline, flaskOutline,
  logOutOutline, notificationsOutline, peopleOutline, personAddOutline,
  personCircleOutline, personOutline, shareSocialOutline, clipboardOutline,
  downloadOutline, listOutline, timeOutline, searchOutline, closeOutline,
  closeCircleOutline, chevronForwardOutline, chevronDownOutline,
  printOutline, cashOutline, qrCodeOutline, addOutline, attachOutline,
  checkmarkOutline
} from "ionicons/icons";

import { AuthService } from "../../services/auth";
import { LabApiService } from "../../services/lab-api";
import { ToastService } from "../../services/toast";
import { BookingRefreshService } from "../../services/booking-refresh";
import { RoleService } from "../../services/role";

// ✅ dashboard cha barcode row type — BookingListItem cha
// dashboard shi kahi sambandh nahi (to fakt booking-status.page.ts
// madhe define ahe), tyамुळे ithe 'any' based shape vaparlay.
type BarcodeRow = {
  accessionId?: number; sampleTypeId?: number; sampleType: string;
  oldBarcode: string; newBarcode: string; receiveDate: string;
  status: string; canEditBarcode: boolean; saving: boolean;
};

@Component({
  selector: "app-dashboard",
  templateUrl: "./dashboard.page.html",
  styleUrls: ["./dashboard.page.scss"],
  standalone: true,

  imports: [
    // Angular
    CommonModule,
    FormsModule,

    // Ionic
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonMenuButton,
    IonProgressBar,
    IonModal,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonButton,
    IonSearchbar,

    // Angular Material
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,

    // Custom Components
    StackedBarComponent
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

  samplesCanceled = 0;
  globalSearchTerm = '';
  isSearchModalOpen = false;
  isSearching = false;

  removedTestMappingIds: number[] = [];   // ✅ add
  searchResults: any[] = [];
  private searchDebounce: any = null;
  private currentFranchiseId: any = undefined;
  downloadingReportId: any = null;
  printingId: any = null;
  fromDate: string = '';
  toDate: string = '';
  patientsPending = 0;
  patientsCompleted = 0;
  samplesMissing = 0;
  samplesReceived = 0;
  reportsPending = 0;
  reportsCompleted = 0;
  totalCanceledAmount = 0;
  totalBusinessAmount = 0;
  loading = false;
  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;
  isEditTestModalOpen = false; isTestLoading = false; selectedBooking: any = null;
  testSearchTerm = ''; filteredTests: any[] = []; selectedTests: any[] = [];
  discount = 0; basePaidAmount = 0; payNowAmount = 0; paidAmount = 0;
  paymentMethod = 'cash'; isSavingTest = false; availableTests: any[] = [];

  isEditPatientModalOpen = false; isPatientLoading = false; editPatientData: any = null;

  isBarcodeModalOpen = false; isBarcodeLoading = false; barcodeBooking: any = null;
  barcodeRows: BarcodeRow[] = [];   // ✅ ekच declaration — duplicate kadhla

  activeDateTimeRow: any = null; tempDateTimeValue = '';

  // ---------- doctor / lab pickers (Edit Patient) ----------
  showDoctorPicker = false; showLabPicker = false;
  doctors: any[] = []; labs: any[] = [];
  selectedDoctorPick: any = null; selectedLabPick: any = null;

  doctorSearch = '';
  filteredDoctors: any[] = [];
  showDoctorSuggestions = false;

  labSearch = '';
  filteredLabs: any[] = [];
  customLabSearch = '';
  filteredCustomLabs: any[] = [];
  showCustomLabDropdown = false;
  showLabDropdown = false;
  get canEditPatient(): boolean {
    return this.authService.role === 'ROLE_LAB_ADMIN' ||
      this.authService.role === 'ROLE_FRANCHISE';
  }
  get canViewAmount(): boolean {
    return this.roleService.isLabAdmin || this.isFranchiseOnlyRole;
  }

  private readonly ROLE_STAFF = 'ROLE_STAFF';

  get isStaffRole(): boolean {
    return this.roleService.currentRole === this.ROLE_STAFF;
  }
  get canEditBilling(): boolean { return this.roleService.isLabAdmin || this.isStaffRole; }
  get isAdminRole(): boolean { return this.roleService.isLabAdmin; }
  get subTotal(): number { return this.selectedTests.reduce((s, t) => s + Number(t.testMrp || 0), 0); }
  get totalAmount(): number { return Math.max(0, this.subTotal - this.discount); }
  get dueAmount(): number { return Math.max(0, this.totalAmount - this.paidAmount); }

  onGlobalSearchChange() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    const q = this.globalSearchTerm.trim();
    if (!q) { this.isSearchModalOpen = false; this.searchResults = []; return; }
    this.searchDebounce = setTimeout(() => this.performGlobalSearch(q), 400);
  }

  clearGlobalSearch() {
    this.globalSearchTerm = '';
    this.isSearchModalOpen = false;
    this.searchResults = [];
  }

  closeSearchModal() {
    this.isSearchModalOpen = false;
  }

  private resolveFranchiseId(): number | undefined {
    const role = this.roleService.currentRole;
    const isFranchiseUser = role === this.ROLE_FRANCHISE || role === this.ROLE_FRANCHISE_STAFF;
    const franchiseId = this.authService?.currentUserValue?.raw?.franchiseId
      ?? (this.authService as any)?.franchiseId;

    if (isFranchiseUser && franchiseId !== null && franchiseId !== undefined && Number(franchiseId) > 0) {
      return Number(franchiseId);
    }
    return undefined;
  }

  private performGlobalSearch(q: string) {
    this.isSearching = true;
    this.isSearchModalOpen = true;
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;
    const start = '2015-01-01';
    const end = this.nextDay(this.formatDateParam(new Date()));

    this.labApi.getBookingStatusNew(labId, 0, 500, start, end, this.currentFranchiseId).subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];

        // Admin la ani Franchise/Franchise-Staff la tyanchya franchise cha
        // sagla data disel (createdBy koni pan asel tari). Fakt ROLE_STAFF
        // la swataha banवलेलेच bookings disले pahijet.
        const roleFiltered = this.isStaffRole
          ? list.filter((b: any) => {
            const usernameMatch = !!currentUsername && b.user?.username === currentUsername;
            const idMatch = !!currentUserId && b.createdBy === currentUserId;
            return usernameMatch || idMatch;
          })
          : list;

        const ql = q.toLowerCase();
        this.searchResults = roleFiltered
          .filter((b: any) =>
            String(b.bookingId).includes(ql) ||
            (b.patientId || '').toLowerCase().includes(ql) ||
            (b.customerName || '').toLowerCase().includes(ql) ||
            (b.doctorName || '').toLowerCase().includes(ql)
          )
          .map((b: any) => this.mapSearchItem(b));
        this.isSearching = false;
      },
      error: () => { this.isSearching = false; this.searchResults = []; }
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
      doctorName: raw.doctorName || 'self',
      franchiseName: raw.franchiseName || 'SELF',
      bookingDate: raw.createdOn ? new Date(raw.createdOn).toLocaleString() : '',
      progress: `${completedCount}/${testCount}`,
      statusClass: testCount > 0 && completedCount === testCount ? 'completed' : 'pending',
      hasCompletedTest: completedCount > 0,
      testsDisplay: b.tests.map((t: any) => ({
        name: t.testName, status: this.testStatusLabel(t.status), statusClass: this.testStatusClass(t.status)
      }))
    };
  }

  expandedSearchId: any = null;

  toggleSearchExpand(item: any) {
    this.expandedSearchId = this.expandedSearchId === item.bookingId ? null : item.bookingId;
  }

  printBillInline(item: any) {
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
  get canShowDownloadReport(): boolean {
    const role = this.authService?.role;
    // ✅ download-reports page cha ekच rule — fakt LAB_ADMIN /
    // FRANCHISE / FRANCHISE_STAFF la download allow, STAFF la kधीच nahi.
    return (
      role === 'ROLE_LAB_ADMIN' ||
      role === 'ROLE_FRANCHISE'
      // role === 'ROLE_FRANCHISE_STAFF'
    );
  }

  async downloadReportInline(item: any) {
    const role = this.authService?.role;
    const allowed = role === 'ROLE_LAB_ADMIN' || role === 'ROLE_FRANCHISE' || role === 'ROLE_FRANCHISE_STAFF';
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

  private loadInProgress = false;
  private refreshSub?: Subscription;
  private pollSub?: Subscription;

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

  get canViewCollection(): boolean {
    return this.roleService.isLabAdmin || this.isFranchiseOnlyRole;
  }
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
     private cdr: ChangeDetectorRef,
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
      'time-outline': timeOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
      'close-circle-outline': closeCircleOutline,
      'chevron-forward-outline': chevronForwardOutline, 'chevron-down-outline': chevronDownOutline,
      'print-outline': printOutline,
      'cash-outline': cashOutline,
      'qr-code-outline': qrCodeOutline,
      'add-outline': addOutline,
      'attach-outline': attachOutline,
      'checkmark-outline': checkmarkOutline,
      

    });

    this.fromDate = this.toKey(new Date());
    this.toDate = this.toKey(new Date());
  }
  // existing constants + add these
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';

  get isFranchiseOnlyRole(): boolean {
    return this.roleService.currentRole === this.ROLE_FRANCHISE;
  }

  get canViewPayment(): boolean {
    return this.isAdminRole || this.isFranchiseOnlyRole;
  }

  // ---------- lifecycle ----------
  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.refreshSub = this.bookingRefresh.refresh$.subscribe(() => this.initDashboard());
    this.loadAvailableTests();
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
    this.pollSub = interval(15000).subscribe(() => this.loadDashboard(true));
  }

  // ---------- init ----------
  initDashboard() {
    if (this.loadInProgress) return;
    this.loadInProgress = true;
    this.loading = true;

    const existingUser = this.authService.currentUserValue;

    if (existingUser) {
      this.setUser(existingUser);
      this.currentFranchiseId = this.resolveFranchiseId();
      this.loadDashboard();
    } else {
      this.authService.loadCurrentUser().subscribe({
        next: () => {
          this.setUser(this.authService.currentUserValue);
          this.currentFranchiseId = this.resolveFranchiseId();
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

  private setUser(currentUser: any) {
    this.user = {
      name: currentUser?.raw?.username ?? '',
      email: currentUser?.raw?.email ?? '',
      role: this.roleService.currentRole
    };
  }

  // ---------- date helpers ----------
  private formatDateParam(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  // ---------- date picker ----------

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
      this.fromDate = this.toKey(this.rangeStart);
      this.toDate = this.toKey(this.rangeEnd);
      this.onDateChange();
    }
  }
  onDateChange() {
    this.loadDashboard();
  }

  loadAvailableTests() {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        this.availableTests = (Array.isArray(res) ? res : []).map((t: any) => ({
          testId: t.test_id ?? t.testId, testName: t.test_name || 'Unnamed Test', testMrp: t.test_price ?? 0
        }));
      },
      error: (err) => { console.log('AVAILABLE TESTS LOAD ERROR:', err); }
    });
  }

  onEditPatientClick(item: any) {
    if (!this.canEditPatient) { return; }
    this.isSearchModalOpen = false;
    this.editPatientFromSearch(item);
  }
  onEditTestClick(item: any) { this.isSearchModalOpen = false; this.editTestFromSearch(item); }
  onEditBarcodeClick(item: any) { this.isSearchModalOpen = false; this.openBarcodeFromSearch(item); }

  closeTestModal() {
    this.isEditTestModalOpen = false; this.selectedBooking = null; this.selectedTests = [];
    if (this.globalSearchTerm.trim()) this.isSearchModalOpen = true;
  }

  searchTestsInline(val: string) {
    this.testSearchTerm = val ?? '';
    const t = this.testSearchTerm.trim().toLowerCase();
    if (!t) { this.filteredTests = []; return; }
    this.filteredTests = this.availableTests.filter(x =>
      x.testName.toLowerCase().includes(t) && !this.selectedTests.some(s => s.testName === x.testName));
  }

  addTestInline(test: any) {
    this.selectedTests.push({ ...test, isNewlyAdded: true });
    this.testSearchTerm = ''; this.filteredTests = [];
  }
// async removeTestInline(test: any) {

//   // ✅ Booking la kimaan 1 test asayla hava — shevatcha test delete karायला allow nahi
//   if (this.selectedTests.length <= 1) {
//     const alert = await this.alertController.create({
//       cssClass: 'premium-alert',
//       header: 'Not Allowed',
//       message: 'Booking madhe kimaan 1 test asayla have. Shevatcha test delete karta yenar nahi.',
//       buttons: [
//         { text: 'OK', role: 'cancel', cssClass: 'alert-btn-cancel' }
//       ]
//     });
//     await alert.present();
//     return;
//   }

//   // Newly added (not yet saved) test — direct local removal, no API call needed
//   if (test.isNewlyAdded) {
//     this.selectedTests = this.selectedTests.filter(t => t !== test);
//     this.toastService.warning('Warning', `${test.testName} removed`);
//     return;
//   }

//   // Existing/saved test — must confirm + go through backend before touching UI list
//   const alert = await this.alertController.create({
//     cssClass: 'premium-alert',
//     header: 'Delete Test',
//     message: `Are you sure you want to delete "${test.testName}"?`,
//     buttons: [
//       { text: 'No', role: 'cancel', cssClass: 'alert-btn-cancel' },
//       {
//         text: 'Yes, Delete',
//         cssClass: 'alert-btn-danger',
//         handler: () => {
//           if (!test.testMappingId) {
//             this.toastService.error('Error', 'Test ID missing');
//             return;
//           }

//           const labId = this.authService.currentUserValue?.raw?.labId;
//           const bookingId = this.selectedBooking.bookingId;

//           this.labApi.deleteTestFromBooking(labId, bookingId, test.testMappingId).subscribe({
//             next: () => {
//               this.selectedTests = this.selectedTests.filter(t => t !== test);
//               this.toastService.success('Success', `${test.testName} deleted from patient`);

//               this.labApi.getSingleBooking(bookingId).subscribe({
//                 next: (res: any) => {
//                   const fresh = this.mapBooking(res);
//                   this.selectedBooking = fresh;
//                   this.selectedTests = JSON.parse(JSON.stringify(fresh.tests || []));
//                   this.loadDashboard(true);
//                 },
//                 error: () => { /* silent */ }
//               });
//             },
//             error: (err) => {
//               this.toastService.error('Error', '' + (err.error?.message || 'Test delete karta yenar nahi'));
//             }
//           });
//         }
//       }
//     ]
//   });

//   await alert.present();
// }
async removeTestInline(test: any) {

  // =========================================================
  // CONFIRM DELETE POPUP
  // =========================================================
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

          // =====================================================
          // NEWLY ADDED TEST
          // Database मध्ये अजून save झालेला नाही.
          // फक्त selectedTests मधून हा specific test remove करायचा.
          // =====================================================
          if (test.isNewlyAdded) {

            this.selectedTests = this.selectedTests.filter(
              (t: any) => t !== test
            );

            // selectedBooking मधूनही फक्त हाच test remove करा
            if (this.selectedBooking?.tests) {
              this.selectedBooking.tests =
                this.selectedBooking.tests.filter(
                  (t: any) => t !== test
                );
            }

            this.toastService.warning(
              'Warning',
              `${test.testName} removed`
            );

            this.cdr.detectChanges();

            return;
          }

          // =====================================================
          // EXISTING DATABASE TEST
          // =====================================================
          if (!test.testMappingId) {

            this.toastService.error(
              'Error',
              'Test ID missing. Cannot delete this test.'
            );

            return;
          }

          // =====================================================
          // GET LAB ID
          // =====================================================
          const labId = this.labApi.getCurrentLabId();

          if (!labId) {

            this.toastService.error(
              'Error',
              'Lab ID missing. Cannot delete test.'
            );

            return;
          }

          // =====================================================
          // GET BOOKING ID
          // =====================================================
          const bookingId = this.selectedBooking?.bookingId;

          if (!bookingId) {

            this.toastService.error(
              'Error',
              'Booking ID missing. Cannot delete test.'
            );

            return;
          }

          // =====================================================
          // DELETE ONLY SELECTED TEST FROM DATABASE
          // =====================================================
          this.labApi
            .deleteTestFromBooking(
              labId,
              bookingId,
              test.testMappingId
            )
            .subscribe({

              // =================================================
              // SUCCESS
              // =================================================
              next: () => {

                this.ngZone.run(() => {

                  // =================================================
                  // ONLY SELECTED TEST REMOVE FROM selectedTests
                  // बाकीचे tests तसेच राहतील.
                  // =================================================
                  this.selectedTests =
                    this.selectedTests.filter(
                      (t: any) =>
                        t.testMappingId !==
                        test.testMappingId
                    );

                  // =================================================
                  // ONLY SELECTED TEST REMOVE FROM selectedBooking
                  // =================================================
                  if (this.selectedBooking?.tests) {

                    this.selectedBooking.tests =
                      this.selectedBooking.tests.filter(
                        (t: any) =>
                          t.testMappingId !==
                          test.testMappingId
                      );
                  }

                  // =================================================
                  // SUCCESS MESSAGE
                  // =================================================
                  this.toastService.success(
                    'Success',
                    `${test.testName} deleted successfully`
                  );

                  // =================================================
                  // UPDATE UI
                  // =================================================
                  this.cdr.detectChanges();

                  // =================================================
                  // REFRESH DASHBOARD / BOOKING DATA
                  // =================================================
                  this.loadDashboard(true);

                });

              },

              // =================================================
              // ERROR
              // =================================================
              error: (err) => {

                this.ngZone.run(() => {

                  console.error(
                    'DELETE TEST ERROR:',
                    err
                  );

                  this.toastService.error(
                    'Error',
                    err?.error?.message ||
                    'Failed to delete test from database.'
                  );

                });

              }

            });

        }
      }
    ]
  });

  // =========================================================
  // SHOW CONFIRMATION POPUP
  // =========================================================
  await alert.present();
}
  onDiscountChangeInline() {
    if (!this.canEditBilling) { this.discount = 0; return; }
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
    this.onPayNowChangeInline();
  }

  onPayNowChangeInline() {
    if (!this.canViewPayment) { this.payNowAmount = 0; this.paidAmount = this.basePaidAmount; return; }
    if (this.payNowAmount < 0) this.payNowAmount = 0;
    const maxPayable = Math.max(0, this.totalAmount - this.basePaidAmount);
    if (this.payNowAmount > maxPayable) this.payNowAmount = maxPayable;
    this.paidAmount = this.basePaidAmount + this.payNowAmount;
  }

saveTestChanges() {
  if (!this.selectedBooking || this.isSavingTest) return;
  this.isSavingTest = true;
  const labId = this.authService.currentUserValue?.raw?.labId;
  const bookingId = this.selectedBooking.bookingId;
  const newTests = this.selectedTests.filter(t => t.isNewlyAdded);
  const existingTests = this.selectedTests.filter(t => !t.isNewlyAdded);

  const patientBody: any = {
    bookingId, customerName: this.selectedBooking.customerName,
    ageType: this.selectedBooking.ageType, age: this.selectedBooking.age,
    gender: this.selectedBooking.gender, mobileNumber: this.selectedBooking.mobileNumber,
    aadhaarNumber: this.selectedBooking.aadhaarNumber, doctorid: this.selectedBooking.doctorId,
    franchiseId: this.selectedBooking.franchiseId, createdOn: this.selectedBooking.createdOn,
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
          bookingId, customerName: this.selectedBooking.customerName,
          age: this.selectedBooking.age, ageType: this.selectedBooking.ageType,
          gender: this.selectedBooking.gender, aadhaarNumber: this.selectedBooking.aadhaarNumber || '',
          tests: newTests.map(t => ({
            testId: t.testId, testName: t.testName, testPrice: t.testMrp,
            test_price: t.testMrp, assignedPrice: [t.testMrp], source: 'RPL', discount: 0, newTest: true
          }))
        };
        this.labApi.addTestToBooking(addTestBody).subscribe({
          next: () => this.finishTestSave(),
          error: () => { this.isSavingTest = false; this.toastService.error('Error', 'Test add fail zala'); }
        });
      } else {
        this.finishTestSave();
      }
    },
    error: () => { this.isSavingTest = false; this.toastService.error('Error', 'Update fail zala'); }
  });
}

  private finishTestSave() {
    this.isSavingTest = false;
    this.toastService.success('Success', 'Booking updated successfully');
    this.closeTestModal();
    if (this.globalSearchTerm.trim()) this.performGlobalSearch(this.globalSearchTerm.trim());
    this.loadDashboard(true);
  }

  editPatientFromSearch(item: any) {
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
      error: () => { this.isPatientLoading = false; this.isEditPatientModalOpen = false; }
    });
  }

  closePatientModal() {
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

  savePatientChanges() {
    if (!this.editPatientData) return;
    const labId = this.authService.currentUserValue?.raw?.labId;

    const doctorId = Number(this.editPatientData.doctorId || 0);
    const doctorName = String(this.editPatientData.doctor || '').trim();
    const franchiseId = Number(this.editPatientData.franchiseId || 0);
    const labName = String(this.editPatientData.lab || '').trim();
    const customDoctorName = String(this.editPatientData.customDoctorName || '').trim();
    const customFranchiseLab = String(this.editPatientData.customFranchiseLab || '').trim();

    const body = {
      bookingId: this.editPatientData.bookingId, customerName: this.editPatientData.name,
      title: this.editPatientData.title,
      ageType: this.editPatientData.ageType, age: this.editPatientData.age,
      gender: this.editPatientData.gender, mobileNumber: this.editPatientData.mobileNumber,
      aadhaarNumber: this.editPatientData.aadhaarNumber,
      doctorid: doctorId > 0 ? doctorId : 0,
      customDoctorName: customDoctorName,
      franchiseId: franchiseId > 0 ? franchiseId : (this.editPatientData.franchiseId || 0),
      customFranchiseLab: customFranchiseLab,
      createdOn: this.editPatientData.createdOn
    };

    const bookingId = this.editPatientData.bookingId;

    this.labApi.updatePatient(labId, bookingId, body).subscribe({
      next: () => {
        this.toastService.success('Success', 'Patient updated successfully');

        const idx = this.searchResults.findIndex((b: any) => b.bookingId === bookingId);
        if (idx > -1) {
          const updated = { ...this.searchResults[idx] };
          updated.customerName = this.editPatientData.name;
          updated.title = this.editPatientData.title;
          updated.age = this.editPatientData.age;
          updated.ageType = this.editPatientData.ageType;
          updated.gender = this.editPatientData.gender;
          updated.mobileNumber = this.editPatientData.mobileNumber;
          updated.aadhaarNumber = this.editPatientData.aadhaarNumber;
          updated.uhidNumber = this.editPatientData.uhidNumber;
          updated.customDoctorName = customDoctorName;
          updated.customFranchiseLab = customFranchiseLab;
          updated.doctorName = customDoctorName || doctorName || 'self';
          updated.franchiseName = customFranchiseLab || labName || 'SELF';

          this.searchResults = [
            ...this.searchResults.slice(0, idx),
            updated,
            ...this.searchResults.slice(idx + 1)
          ];
        }

        this.closePatientModal();
      },
      error: () => this.toastService.error('Error', 'Patient update fail zala')
    });
  }
  // ---------- doctor / lab pickers ----------
  openDoctorPicker() {
    this.selectedDoctorPick = null;
    this.showDoctorPicker = true;
    this.labApi.getDoctors().subscribe({
      next: (res: any) => { this.doctors = res?.content || res || []; },
      error: () => { this.doctors = []; }
    });
  }

  selectDoctorForEdit(doc: any) {
    if (!doc || !this.editPatientData) return;
    this.editPatientData.doctor = doc?.doctor_name;
    this.editPatientData.doctorId = doc?.doctorId;
    this.showDoctorPicker = false;
  }

  openLabPicker() {
    if (this.isAdminRole) return;
    this.selectedLabPick = null;
    this.showLabPicker = true;
    this.labApi.getFranchises().subscribe({
      next: (res: any) => { this.labs = res?.content || res || []; },
      error: () => { this.labs = []; }
    });
  }

  selectLabForEdit(lab: any) {
    if (this.isAdminRole || !lab || !this.editPatientData) return;
    this.editPatientData.lab = lab?.franchiseName || lab?.name;
    this.editPatientData.franchiseId = lab?.franchiseId;
    this.showLabPicker = false;
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

  selectLabFromSearch(lab: any): void {
    if (!lab || !this.editPatientData) return;
    const franchiseId = Number(lab?.franchiseId ?? lab?.id ?? 0);
    const franchiseName = String(lab?.franchiseName || lab?.name || '').trim();
    this.editPatientData.lab = franchiseName;
    this.editPatientData.franchiseId = franchiseId;
    this.labSearch = franchiseName;
    this.showLabDropdown = false;
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

  // ---------- barcode ----------
  // ✅ dashboard madhe barcode row nehmi fresh booking varunच banto —
  // 'BookingListItem' cha vapar nahi (te fakt booking-status page cha type ahe).
  private buildBarcodeRows(fresh: any): BarcodeRow[] {
    return (fresh.samples || []).map((s: any) => {
      const matchedTest = (fresh.tests || []).find((t: any) => Number(t.testId) === Number(s.testId));
      const testStatus = (matchedTest?.status || '').toLowerCase();
      let displayStatus: string; let canEdit: boolean;
      if (testStatus === 'cancel' || testStatus === 'cancelled') { displayStatus = 'CANCEL'; canEdit = false; }
      else if (testStatus === 'snr') { displayStatus = 'PENDING'; canEdit = true; }
      else { displayStatus = 'RECEIVED'; canEdit = false; }
      return {
        accessionId: s.accessionId, sampleTypeId: s.sampleTypeId, sampleType: s.sampleType || '-',
        oldBarcode: s.barcode, newBarcode: s.barcode, receiveDate: '',
        status: displayStatus, canEditBarcode: canEdit, saving: false
      };
    });
  }

  openBarcodeFromSearch(item: any) {
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

  closeBarcodeModal() {
    this.isBarcodeModalOpen = false;
    this.barcodeBooking = null;
    this.barcodeRows = [];
    if (this.globalSearchTerm.trim()) this.isSearchModalOpen = true;
  }

  openDateTimePicker(row: any) { this.activeDateTimeRow = row; this.tempDateTimeValue = new Date().toISOString().slice(0, 19); }
  closeDateTimePicker() { this.activeDateTimeRow = null; this.tempDateTimeValue = ''; }
  confirmDateTime() {
    if (this.activeDateTimeRow && this.tempDateTimeValue) this.activeDateTimeRow.receiveDate = this.tempDateTimeValue.slice(0, 16);
    this.closeDateTimePicker();
  }

  updateBarcodeRow(row: BarcodeRow) {
    if (!row.canEditBarcode) { this.toastService.warning('Warning', 'Ha barcode edit karayla allowed nahi (test in-process/complete ahe)'); return; }
    if (!row.newBarcode?.trim()) { this.toastService.warning('Warning', 'Barcode rikama thevu naka'); return; }
    if (!this.barcodeBooking) return;

    row.saving = true;
    const bookingId = this.barcodeBooking.bookingId;
    const payload = [{ oldBarcode: row.oldBarcode, updatedBarcode: row.newBarcode.trim(), receiveDate: row.receiveDate || '', sampleTypeId: row.sampleTypeId, bookingId }];

    this.labApi.updateBarcode(bookingId, payload).subscribe({
      next: () => {
        this.toastService.success('Success', 'Barcode updated successfully');
        // ✅ hardcode status nahi — save झाल्यावर fresh booking परत fetch
        // karun khara status dakhavतो (backend cha decision).
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
      error: () => { row.saving = false; this.toastService.error('Error', 'Barcode update fail zala'); }
    });
  }

  private refreshSearchResultsSilently() {
    const q = this.globalSearchTerm.trim();
    if (!q) return;
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;
    const start = '2015-01-01';
    const end = this.nextDay(this.formatDateParam(new Date()));

    this.labApi.getBookingStatusNew(labId, 0, 500, start, end, this.currentFranchiseId).subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];
        const roleFiltered = this.isStaffRole
          ? list.filter((b: any) => {
            const usernameMatch = !!currentUsername && b.user?.username === currentUsername;
            const idMatch = !!currentUserId && b.createdBy === currentUserId;
            return usernameMatch || idMatch;
          })
          : list;
        const ql = q.toLowerCase();
        this.searchResults = roleFiltered
          .filter((b: any) =>
            String(b.bookingId).includes(ql) ||
            (b.patientId || '').toLowerCase().includes(ql) ||
            (b.customerName || '').toLowerCase().includes(ql) ||
            (b.doctorName || '').toLowerCase().includes(ql)
          )
          .map((b: any) => this.mapSearchItem(b));
      },
      error: () => { }
    });
  }

  editTestFromSearch(item: any) {
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

  resetToToday() {
    this.fromDate = this.toKey(new Date());
    this.toDate = this.toKey(new Date());
    this.onDateChange();
  }

  // ---------- data fetch: rolling window (staff role) ----------
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
    const calls = dayRanges.map(r => this.labApi.getBookingStatusNew(labId, 0, PAGE_SIZE, r.start, r.end, this.currentFranchiseId));

    return forkJoin(calls).pipe(
      map((pages: any[]) => {
        let all: any[] = [];
        for (const pageRes of pages) all = all.concat(pageRes?.content || pageRes || []);
        return all;
      })
    );
  }

  // ---------- main load ----------
  loadDashboard(silent: boolean = false) {
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const today = new Date();

    if (this.roleService.isFullAccess) {
      this.loadFullAccessDashboard(labId, today, silent);
    } else {
      this.loadStaffDashboard(currentUser, labId, silent);
    }
  }

  private loadFullAccessDashboard(labId: any, today: Date, silent: boolean) {
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
        this.totalSamples = totalReceived + totalPending + totalOutSourced + totalRejected;

        this.totalReports = selected.reports?.[0]?.completed || 0;

        this.dailyBookings = days.map((d, idx) => {
          const resp: any = daily[idx];
          const smp = resp.samples?.[0];

          const received = Number(smp?.received || 0);
          const pending = Number(smp?.notReceived || 0);
          const outSourced = Number(smp?.outSourced || 0);
          const rejected = Number(smp?.rejected || 0);

          return {
            dateKey: d.key,
            date: d.display.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            bookings: resp.totalBookingsCount || 0,
            samples: received + pending + outSourced + rejected,
            received, pending, outSourced, rejected,
            amount: Number(resp.totalPaid || 0)
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
  }

  private loadStaffDashboard(currentUser: any, labId: any, silent: boolean) {
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;

    const selectedStart = this.fromDate;
    const selectedEnd = this.nextDay(this.toDate);

    const shouldFilterByOwnUser = this.isStaffRole;

    forkJoin({
      selectedDayBookings: this.labApi.getBookingStatusNew(labId, 0, 500, selectedStart, selectedEnd, this.currentFranchiseId),
      rollingWindowBookings: this.fetchBookingsForWindow(5)
    }).subscribe({
      next: ({ selectedDayBookings, rollingWindowBookings }: any) => {
        this.loading = false;
        this.loadInProgress = false;

        const applyOverrideFilter = (list: any[]) => {
          if (!shouldFilterByOwnUser) return list || [];
          return (list || []).filter((p: any) => {
            const usernameMatch = !!currentUsername && p.user?.username === currentUsername;
            const idMatch = !!currentUserId && p.createdBy === currentUserId;
            return usernameMatch || idMatch;
          });
        };

        const selectedContent = selectedDayBookings?.content || selectedDayBookings || [];
        const selectedFiltered = applyOverrideFilter(selectedContent);
        const mappedBookings = selectedFiltered.map((raw: any) => this.mapBooking(raw));

        this.totalPatients = selectedFiltered.length;
        this.totalBookings = selectedFiltered.length;
        // ✅ Company-style dual stats — client-side, booking-status
        // peksha vegla source nasल्याने ithun sagla derive kartoy.
        let patientsCompleted = 0, patientsPending = 0;
        let samplesReceived = 0, samplesMissing = 0, samplesCanceled = 0;
        let reportsCompleted = 0, reportsPending = 0;
        let businessAmount = 0;

        mappedBookings.forEach((b: any) => {
          const tests = b.tests || [];
          const allComplete = tests.length > 0 && tests.every((t: any) => {
            const st = (t.status || '').toLowerCase();
            return st.includes('complete') || st.includes('ready');
          });
          if (allComplete) patientsCompleted++; else patientsPending++;

          (b.samples || []).forEach((s: any) => {
            const st = (s.status || '').toLowerCase();
            if (st.includes('cancel')) {
              samplesCanceled++;
            } else if (st.includes('received') || st.includes('complete')) {
              samplesReceived++;
            } else {
              samplesMissing++;
            }
          });

          tests.forEach((t: any) => {
            const st = (t.status || '').toLowerCase();
            if (st.includes('complete') || st.includes('ready')) reportsCompleted++;
            else reportsPending++;
          });

          businessAmount += Number(b.totalAmount || 0);
        });

        this.patientsPending = patientsPending;
        this.patientsCompleted = patientsCompleted;
        this.samplesMissing = samplesMissing;
        this.totalSamples = samplesReceived + samplesMissing;
        this.samplesCanceled = samplesCanceled;
        this.samplesReceived = samplesReceived;
        this.reportsPending = reportsPending;
        this.reportsCompleted = reportsCompleted;
        this.totalReports = reportsCompleted;
        this.totalBusinessAmount = businessAmount;
        this.totalCanceledAmount = 0;

        this.rawBookings = applyOverrideFilter(rollingWindowBookings);
        this.prepareDailyBookings();
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

  prepareDailyBookings() {
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
          bookings: 0, samples: 0, received: 0, pending: 0, outSourced: 0, rejected: 0, tests: 0, amount: 0
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

  // ---------- navigation ----------
  goToPage(page: string) {
    this.menuCtrl.close();
    this.router.navigate(['/' + page]);
  }

  goToProfile() {
    this.menuCtrl.close();
    this.router.navigate(['/profile']);
  }

  goToNotifications() {
    this.router.navigate(['/notification']);
  }

  logout() {
    this.menuCtrl.close();
    this.pollSub?.unsubscribe();
    this.authService.logout();
    window.location.href = '/login';
  }

  onSearchButtonClick() {
    const q = this.globalSearchTerm.trim();
    if (!q) return;
    this.performGlobalSearch(q);
  }

  onSearchKeyup(e: KeyboardEvent) {
    if (e.key === 'Enter') this.onSearchButtonClick();
  }

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
        testMrp: t.testMrp,
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
      doctorName: raw.doctorName || raw.customDoctorName || 'self',
      franchiseName: raw.franchiseName || raw.customFranchiseLab || 'SELF'
    };
  }
  
private testStatusLabel(status?: string): string {
    const s = (status || 'snr').toLowerCase();
    if (s === 'cancel' || s === 'cancelled') return 'CANCEL';
    if (s === 'snr') return 'SNR';   // ⬅️ changed from 'SAMPLE NOT RECEIVED'
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

}