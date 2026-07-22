import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
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
  MenuController
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

  filterDate: string = '';
  globalSearchTerm = '';
  isSearchModalOpen = false;
  isSearching = false;
  searchResults: any[] = [];
  private searchDebounce: any = null;

  printingId: any = null;

  isEditTestModalOpen = false; isTestLoading = false; selectedBooking: any = null;
  testSearchTerm = ''; filteredTests: any[] = []; selectedTests: any[] = [];
  discount = 0; basePaidAmount = 0; payNowAmount = 0; paidAmount = 0;
  paymentMethod = 'cash'; isSavingTest = false; availableTests: any[] = [];

  isEditPatientModalOpen = false; isPatientLoading = false; editPatientData: any = null;

  isBarcodeModalOpen = false; barcodeBooking: any = null; barcodeRows: any[] = [];
  activeDateTimeRow: any = null; tempDateTimeValue = '';

  // ---------- doctor / lab pickers (Edit Patient) ----------
  showDoctorPicker = false; showLabPicker = false;
  doctors: any[] = []; labs: any[] = [];
  selectedDoctorPick: any = null; selectedLabPick: any = null;

  get canEditPatient(): boolean { return this.roleService.isLabAdmin; }
  get canViewAmount(): boolean { return this.roleService.isLabAdmin; }
  get canEditBilling(): boolean { return this.roleService.isLabAdmin; }
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

  private performGlobalSearch(q: string) {
    this.isSearching = true;
    this.isSearchModalOpen = true;
    const currentUser = this.authService.currentUserValue;
    const labId = currentUser?.raw?.labId;
    const currentUserId = currentUser?.raw?.id;
    const currentUsername = currentUser?.raw?.username;
    const start = '2015-01-01';
    const end = this.nextDay(this.formatDateParam(new Date()));

    this.labApi.getBookingStatusNew(labId, 0, 500, start, end).subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];

        // Admin la sagle disel, Staff/Franchise la fakt tyanchech booking disतील
        const roleFiltered = this.roleService.isLabAdmin
          ? list
          : list.filter((b: any) => {
            const usernameMatch = !!currentUsername && b.user?.username === currentUsername;
            const idMatch = !!currentUserId && b.createdBy === currentUserId;
            return usernameMatch || idMatch;
          });

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
  @ViewChild('datePicker') datePicker!: any;
  pickedDate: Date | null = null;
  loading = false;

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
    return this.roleService.isLabAdmin;
  }
  constructor(
    private router: Router,
    private menuCtrl: MenuController,
    private authService: AuthService,
    private labApi: LabApiService,
    private toastService: ToastService,
    private bookingRefresh: BookingRefreshService,
    private roleService: RoleService
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

    this.filterDate = this.toKey(new Date());
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
      this.loadDashboard();
    } else {
      this.authService.loadCurrentUser().subscribe({
        next: () => {
          this.setUser(this.authService.currentUserValue);
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
  openDatePicker() {
    this.pickedDate = this.toDateObj(this.filterDate);
    this.datePicker?.open();
  }

  onPickedDateChange(event: any) {
    const d: Date | null = event?.value || null;
    if (!d) return;
    this.filterDate = this.toKey(d);
    this.onDateChange();
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

  onEditPatientClick(item: any) { this.isSearchModalOpen = false; this.editPatientFromSearch(item); }
  onEditTestClick(item: any) { this.isSearchModalOpen = false; this.editTestFromSearch(item); }
  onEditBarcodeClick(item: any) { this.isSearchModalOpen = false; this.openBarcodeFromSearch(item); }

  closeTestModal() { this.isEditTestModalOpen = false; this.selectedBooking = null; this.selectedTests = []; }

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

  removeTestInline(test: any) { this.selectedTests = this.selectedTests.filter(t => t !== test); }

  onDiscountChangeInline() {
    if (!this.canEditBilling) { this.discount = 0; return; }
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
    this.onPayNowChangeInline();
  }

  onPayNowChangeInline() {
    if (!this.canEditBilling) { this.payNowAmount = 0; this.paidAmount = this.basePaidAmount; return; }
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
        } else this.finishTestSave();
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
        data.doctorId = fresh.doctorId || null;
        data.franchiseId = fresh.franchiseId || null;
        this.editPatientData = data;
        this.isPatientLoading = false;
      },
      error: () => { this.isPatientLoading = false; this.isEditPatientModalOpen = false; }
    });
  }

  closePatientModal() { this.isEditPatientModalOpen = false; this.editPatientData = null; }

  savePatientChanges() {
    if (!this.editPatientData) return;
    const labId = this.authService.currentUserValue?.raw?.labId;
    const body = {
      bookingId: this.editPatientData.bookingId, customerName: this.editPatientData.name,
      ageType: this.editPatientData.ageType, age: this.editPatientData.age,
      gender: this.editPatientData.gender, mobileNumber: this.editPatientData.mobileNumber,
      aadhaarNumber: this.editPatientData.aadhaarNumber, doctorid: this.editPatientData.doctorId,
      franchiseId: this.editPatientData.franchiseId, createdOn: this.editPatientData.createdOn
    };
    this.labApi.updatePatient(labId, this.editPatientData.bookingId, body).subscribe({
      next: () => {
        this.toastService.success('Success', 'Patient updated successfully');
        this.closePatientModal();
        if (this.globalSearchTerm.trim()) this.performGlobalSearch(this.globalSearchTerm.trim());
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
    if (!this.isAdminRole) return;
    this.selectedLabPick = null;
    this.showLabPicker = true;
    this.labApi.getFranchises().subscribe({
      next: (res: any) => { this.labs = res?.content || res || []; },
      error: () => { this.labs = []; }
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

  openBarcodeFromSearch(item: any) {
    this.barcodeBooking = item;
    this.barcodeRows = [];
    this.isBarcodeModalOpen = true;

    // fresh full booking fetch — barobar sampleTypeId/accessionId sathi
    this.labApi.getSingleBooking(item.bookingId).subscribe({
      next: (res: any) => {
        const fresh = this.mapBooking(res);
        this.barcodeBooking = fresh;
        this.barcodeRows = (fresh.samples || []).map((s: any) => ({
          accessionId: s.accessionId, sampleTypeId: s.sampleTypeId, sampleType: s.sampleType || '-',
          oldBarcode: s.barcode, newBarcode: s.barcode, receiveDate: '', status: s.status || 'PENDING', saving: false
        }));
      },
      error: () => {
        this.toastService.error('Error', 'Barcode detail load fail zala');
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

 updateBarcodeRow(row: any) {
  if (!row.newBarcode?.trim()) { this.toastService.warning('Warning', 'Barcode rikama thevu naka'); return; }
  if (!this.barcodeBooking) return;
  row.saving = true;
  const bookingId = this.barcodeBooking.bookingId;
  const payload = [{ oldBarcode: row.oldBarcode, updatedBarcode: row.newBarcode.trim(), receiveDate: row.receiveDate || '', sampleTypeId: row.sampleTypeId, bookingId }];
  this.labApi.updateBarcode(bookingId, payload).subscribe({
    next: () => {
      row.saving = false; row.oldBarcode = row.newBarcode; row.status = 'RECEIVED';
      this.toastService.success('Success', 'Barcode updated successfully');
      // ✅ farak — modal band karat nahi, tasach ughada rahil
      if (this.globalSearchTerm.trim()) this.refreshSearchResultsSilently();
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

    this.labApi.getBookingStatusNew(labId, 0, 500, start, end).subscribe({
      next: (res: any) => {
        const list = res?.content || res || [];
        const roleFiltered = this.roleService.isLabAdmin
          ? list
          : list.filter((b: any) => {
            const usernameMatch = !!currentUsername && b.user?.username === currentUsername;
            const idMatch = !!currentUserId && b.createdBy === currentUserId;
            return usernameMatch || idMatch;
          });
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
    this.filterDate = this.toKey(new Date());
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
    const calls = dayRanges.map(r => this.labApi.getBookingStatusNew(labId, 0, PAGE_SIZE, r.start, r.end));

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
    const selectedStart = this.filterDate;
    const selectedEnd = this.nextDay(this.filterDate);

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

    const selectedStart = this.filterDate;
    const selectedEnd = this.nextDay(this.filterDate);

    forkJoin({
      reportCount: this.labApi.getReportCount(labId, selectedStart, selectedEnd, currentUserId),
      selectedDayBookings: this.labApi.getBookingStatusNew(labId, 0, 500, selectedStart, selectedEnd),
      rollingWindowBookings: this.fetchBookingsForWindow(5)
    }).subscribe({
      next: ({ reportCount, selectedDayBookings, rollingWindowBookings }: any) => {
        this.loading = false;
        this.loadInProgress = false;

        this.totalReports = (reportCount?.completecount || 0) + (reportCount?.partiallycomplete || 0);

        const applyOverrideFilter = (list: any[]) => (list || []).filter((p: any) => {
          const usernameMatch = !!currentUsername && p.user?.username === currentUsername;
          const idMatch = !!currentUserId && p.createdBy === currentUserId;
          return usernameMatch || idMatch;
        });

        const selectedContent = selectedDayBookings?.content || selectedDayBookings || [];
        const selectedFiltered = applyOverrideFilter(selectedContent);

        this.totalPatients = selectedFiltered.length;
        this.totalBookings = selectedFiltered.length;
        this.totalSamples = selectedFiltered.reduce((sum: number, p: any) => sum + (p.tests ? p.tests.length : 0), 0);

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
    const tests = rawTests.map((t: any) => ({
      testId: t.testId,
      testMappingId: t.testMappingId ?? t.bookingWithTestMappingId,
      testName: (t.testName || '').trim(),
      testMrp: t.testMrp,
      status: t.reportStatus || 'pending'
    }));
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
        status: s.status
      });
    });
    return { ...raw, tests, samples };
  }

  private testStatusLabel(status?: string): string {
    const s = (status || 'pending').toLowerCase();
    if (s.includes('process')) return 'IN PROCESS';
    if (s === 'snr') return 'SNR';
    if (s.includes('complete') || s.includes('ready')) return 'COMPLETE';
    return 'PENDING';
  }

  private testStatusClass(status?: string): string {
    const s = (status || 'pending').toLowerCase();
    if (s.includes('process')) return 'badge-inprocess';
    if (s === 'snr') return 'badge-snr';
    if (s.includes('complete') || s.includes('ready')) return 'badge-ready';
    return 'badge-pending';
  }

}