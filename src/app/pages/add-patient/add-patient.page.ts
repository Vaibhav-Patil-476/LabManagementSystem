import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonInput, IonSelect, IonSelectOption,
  IonTextarea, IonCheckbox, IonModal, IonRadioGroup, IonRadio, IonItem,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline, addOutline, searchOutline,
  saveOutline, trashOutline, walletOutline,
  printOutline, calendarOutline, cameraOutline,
  closeOutline, scanOutline, attachOutline, documentOutline,
  checkmarkOutline, chevronDownOutline
} from 'ionicons/icons';
import { RoleService } from '../../services/role';
import { ToastService } from '../../services/toast';
import { BookingService } from '../../services/booking-status';
import { LabApiService } from '../../services/lab-api';
import { AuthService } from '../../services/auth';
import { BookingRefreshService } from '../../services/booking-refresh';

@Component({
  selector: 'app-add-patient',
  templateUrl: './add-patient.page.html',
  styleUrls: ['./add-patient.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonButton, IonIcon,
    IonInput, IonSelect, IonSelectOption,
    IonTextarea, IonCheckbox, IonModal, IonRadioGroup, IonRadio, IonItem
  ]
})
export class AddPatientComponent {

  // ---------- state ----------
  role: string = '';
  lastPatient = '—';
  patientRelation = 'self/ILS3505';

  drawnOn = new Date().toLocaleString('en-IN', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  patient: any = {
    title: 'mr', name: '', age: '', ageType: 'years', gender: 'male',
    doctorTitle: 'dr', doctor: '', lab: '', phone: '', aadhaar: '',
    address: '', uhid: '', history: '', otherCharges: 0,
    eReport: false, clinical: false, file: false, homeCollection: false
  };

  billing = {
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 0, discountAmount: 0, grandTotal: 0,
    paymentMode: 'cash', cashAmount: 0, upiAmount: 0,
    paidAmount: 0, dueAmount: 0, transactionId: '',
    discountFromDoctor: null as any
  };

  // doctor
  doctors: any[] = [];
  selectedDoctor: any = null;
  doctorSearch = '';
  filteredDoctors: any[] = [];
  showDoctorSuggestions = false;
  showAddDoctor = false;
  newDoctor = { type: 'Referral', name: '', mobile: '', degree: '', percentValue: '', percentType: 'percent' };

  // lab / franchise
  labs: any[] = [];
  selectedLab: any = null;
  labSearch = '';
  filteredLabs: any[] = [];
  showLabDropdown = false;
  showAddLabModal = false;
  newLab = { name: '', contact: '', address: '' };
  customFranchiseName = '';
  staffLabSearch = '';
  filteredStaffLabs: any[] = [];
  showStaffLabDropdown = false;

  // tests
  selectedTests: any[] = [];
  allTests: any[] = [];
  filteredTests: any[] = [];
  showSuggestions = false;
  testSearch = '';
  selectedSampleTests: any[] = [];

  // file
  selectedFileName = '';
  selectedFileBase64 = '';

  // invoice
  showInvoice = false;
  savedPatient: any = null;

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';
  private readonly DEFAULT_FRANCHISE: any = {
    franchiseId: 2541, id: 2541, franchiseName: 'dar', name: 'dar', centerCode: 'dar',
    lockReport: false, lockReportAmount: 0.0, accessMode: 'false', balanceNegative: false,
    paidType: 'postpaid', wallet: null, superFranchiseActive: true, franchiseActive: false,
    subFranchiseActive: false, processAt: true, nablOnReport: true, labId: 3505
  };

  // ---------- getters ----------
  get isAdminRole(): boolean { return this.roleService.isLabSideUI; }
  get isFranchiseRole(): boolean { return this.role === this.ROLE_FRANCHISE || this.role === this.ROLE_FRANCHISE_STAFF; }
  get isStaffRole(): boolean { return this.role === this.ROLE_STAFF; }
  get isStaffSideUI(): boolean {
    return !this.isAdminRole; // ROLE_LAB_ADMIN सोडून बाकी सगळे (STAFF/FRANCHISE/FRANCHISE_STAFF) staff-side
  }

  get staffBarcodesFilled(): boolean {
    if (!this.isStaffSideUI) return true;
    if (this.selectedSampleTests.length === 0) return false;
    return this.selectedSampleTests.every(s => (s.barcode || '').trim().length > 0);
  }
  constructor(
    private router: Router,
    private ngZone: NgZone,
    private alertController: AlertController,
    private toastService: ToastService,
    private bookingService: BookingService,
    private labApi: LabApiService,
    private authService: AuthService,
    private bookingRefresh: BookingRefreshService,
    private roleService: RoleService
  ) {
    addIcons({
      'person-outline': personOutline, 'add-outline': addOutline, 'search-outline': searchOutline,
      'save-outline': saveOutline, 'trash-outline': trashOutline, 'wallet-outline': walletOutline,
      'print-outline': printOutline, 'calendar-outline': calendarOutline, 'camera-outline': cameraOutline,
      'close-outline': closeOutline, 'scan-outline': scanOutline, 'attach-outline': attachOutline,
      'document-outline': documentOutline, 'checkmark-outline': checkmarkOutline,
      'chevron-down-outline': chevronDownOutline
    });
  }

  // ---------- lifecycle ----------
  ionViewWillEnter() {
    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.role = this.authService.role;
        this.loadDoctors();
        this.loadLabs();
        this.loadTests();
        this.loadLastPatient();
      },
      error: (err) => {
        console.log('CURRENT USER ERROR:', err);
        this.toastService.error('Error', 'Failed to load user info');
      }
    });
  }

  // ---------- compare fns (for ngModel objects) ----------
  compareDoctors = (o1: any, o2: any): boolean => {
    if (!o1 || !o2) return o1 === o2;
    return this.getDoctorId(o1) === this.getDoctorId(o2);
  };

  compareLabs = (o1: any, o2: any): boolean => {
    if (!o1 || !o2) return o1 === o2;
    return (o1.id ?? o1.franchiseId) === (o2.id ?? o2.franchiseId);
  };

  private getDoctorId(doc: any): number {
    return Number(doc?.id ?? doc?.doctorId ?? doc?.doctor_id ?? 0);
  }

  // ---------- doctor ----------
  openAddDoctor() {
    this.resetNewDoctorForm();
    this.showAddDoctor = true;
  }

  private resetNewDoctorForm() {
    this.newDoctor = { type: 'Referral', name: '', mobile: '', degree: '', percentValue: '', percentType: 'percent' };
  }

  saveDoctor() {
    if (this.isAdminRole && !this.newDoctor.type) {
      this.toastService.error('Validation Error', 'Please select doctor type.');
      return;
    }
    if (!this.newDoctor.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter doctor name.');
      return;
    }
    if (this.isAdminRole && !this.newDoctor.mobile.trim()) {
      this.toastService.error('Validation Error', 'Please enter mobile number.');
      return;
    }

    const payload = {
      type: this.newDoctor.type || 'Referral',
      doctor_name: this.newDoctor.name,
      mobile_number: this.newDoctor.mobile || '',
      degree: this.newDoctor.degree || '',
      percentValue: Number(this.newDoctor.percentValue) || 0,
      percentType: this.newDoctor.percentType || 'percent'
    };

    this.labApi.createDoctor(payload).subscribe({
      next: () => {
        this.toastService.success('Doctor Added', this.newDoctor.name + ' added successfully.');
        this.showAddDoctor = false;

        this.labApi.getDoctors().subscribe({
          next: (docs: any) => {
            this.doctors = docs || [];
            const created = this.doctors.find((d: any) =>
              (d.doctor_name || '').toLowerCase() === payload.doctor_name.toLowerCase()
            );
            if (created) this.selectDoctor(created);
          }
        });

        this.resetNewDoctorForm();
      },
      error: (err) => {
        this.toastService.error('Error', 'Failed to add doctor: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  loadDoctors() {
    this.labApi.getDoctors().subscribe({
      next: (res: any) => {
        this.doctors = res || [];
        if (!this.selectedDoctor) {
          const selfDoctor = this.doctors.find((d: any) => (d.doctor_name || '').toLowerCase() === 'self');
          if (selfDoctor) this.selectDoctor(selfDoctor);
        }
      },
      error: () => this.toastService.error('Error', 'Failed to load doctors')
    });
  }

  selectDoctor(doc: any) {
    this.selectedDoctor = doc;
    this.patient.doctor = doc?.doctor_name;
    this.patient.doctorTitle = 'dr';
    this.doctorSearch = doc?.doctor_name || '';
  }

  searchDoctorInput() {
    this.selectedDoctor = null;
    this.patient.doctor = this.doctorSearch;

    if (this.doctorSearch.trim().length > 0) {
      this.filteredDoctors = this.doctors.filter(d =>
        (d.doctor_name || '').toLowerCase().includes(this.doctorSearch.toLowerCase())
      );
      this.showDoctorSuggestions = true;
    } else {
      this.filteredDoctors = [];
      this.showDoctorSuggestions = false;
    }
  }

  selectDoctorFromSearch(doc: any) {
    this.selectedDoctor = doc;
    this.patient.doctor = doc?.doctor_name;
    this.doctorSearch = doc?.doctor_name;
    this.showDoctorSuggestions = false;
  }

  // ---------- lab / franchise ----------
  loadLabs() {
    if (this.role === this.ROLE_STAFF) {
      const raw: any = (this.authService.currentUserValue as any)?.raw || {};
      const ownLab = {
        id: raw.labId, franchiseId: raw.labId,
        franchiseName: raw.labName || 'Lab', centerCode: raw.labCode || ''
      };
      this.labs = [ownLab];
      this.filteredLabs = [...this.labs];
      this.selectedLab = ownLab;
      this.patient.lab = ownLab.franchiseName;
      this.staffLabSearch = ownLab.franchiseName;
      this.labSearch = ownLab.franchiseName;
      return;
    }

    if (this.isFranchiseRole) {
      const currentUser = this.authService.currentUserValue;
      const fId = (currentUser as any)?.franchiseId ?? (currentUser as any)?.raw?.franchiseId;
      const fName = (currentUser as any)?.franchiseName ?? (currentUser as any)?.raw?.franchiseName;

      const own = fId
        ? { id: fId, franchiseId: fId, franchiseName: fName || 'SELF' }
        : this.DEFAULT_FRANCHISE;

      this.labs = [own];
      this.filteredLabs = [...this.labs];
      this.selectedLab = own;
      this.patient.lab = own.franchiseName;
      this.labSearch = own.franchiseName;
      return;
    }

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.labs = res?.content || res || [];
        this.filteredLabs = [...this.labs];

        let defaultLab = this.labs.find((x: any) => (x.franchiseId ?? x.id) === this.DEFAULT_FRANCHISE.franchiseId);
        if (!defaultLab) {
          defaultLab = this.DEFAULT_FRANCHISE;
          this.labs = [defaultLab, ...this.labs];
          this.filteredLabs = [...this.labs];
        }

        this.selectedLab = defaultLab;
        this.labSearch = defaultLab.franchiseName;
        this.staffLabSearch = defaultLab.franchiseName;
        this.patient.lab = defaultLab.franchiseName;
      },
      error: () => {
        this.labs = [this.DEFAULT_FRANCHISE];
        this.filteredLabs = [...this.labs];
        this.selectedLab = this.DEFAULT_FRANCHISE;
        this.labSearch = this.DEFAULT_FRANCHISE.franchiseName;
        this.staffLabSearch = this.DEFAULT_FRANCHISE.franchiseName;
        this.patient.lab = this.DEFAULT_FRANCHISE.franchiseName;
      }
    });
  }

  selectLab(lab: any) {
    this.selectedLab = lab;
    this.patient.lab = lab?.franchiseName || lab?.name;
  }

  searchLabInput() {
    const q = this.labSearch.trim().toLowerCase();
    if (q.length > 0) {
      this.filteredLabs = this.labs.filter(l => (l.franchiseName || l.name || '').toLowerCase().includes(q));
      this.showLabDropdown = true;
    } else {
      this.filteredLabs = [];
      this.showLabDropdown = false;
    }
    this.selectedLab = null;
    this.patient.lab = this.labSearch;
  }

  searchStaffLabInput() {
    if (this.isStaffRole) return;
    const q = this.staffLabSearch.trim().toLowerCase();
    if (q.length > 0) {
      this.filteredStaffLabs = this.labs.filter(l => (l.franchiseName || l.name || '').toLowerCase().includes(q));
      this.showStaffLabDropdown = true;
    } else {
      this.filteredStaffLabs = [];
      this.showStaffLabDropdown = false;
    }
    this.selectedLab = null;
    this.patient.lab = this.staffLabSearch;
  }

  selectStaffLabFromPicker(lab: any) {
    this.selectLab(lab);
    this.staffLabSearch = lab?.franchiseName || lab?.name || '';
    this.showStaffLabDropdown = false;
  }

  onLabSearchFocus() {
    this.filteredLabs = [...this.labs];
    this.showLabDropdown = true;
  }

  selectLabFromPicker(lab: any) {
    this.selectLab(lab);
    this.labSearch = lab?.franchiseName || lab?.name || '';
    this.showLabDropdown = false;
  }

  onCustomFranchiseInput() {
    if (this.customFranchiseName.trim()) {
      this.selectedLab = null;
      this.patient.lab = this.customFranchiseName.trim();
      this.labSearch = this.customFranchiseName.trim();
    } else {
      this.patient.lab = '';
    }
  }

  openAddLabModal() {
    if (this.isStaffRole) return;
    this.newLab = { name: '', contact: '', address: '' };
    this.showAddLabModal = true;
  }

  saveLab() {
    if (!this.newLab.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter lab name.');
      return;
    }
    this.patient.lab = this.newLab.name;
    this.labSearch = this.newLab.name;
    this.staffLabSearch = this.newLab.name;
    this.selectedLab = null;
    this.showAddLabModal = false;
    this.toastService.success('Lab Added', this.newLab.name + ' added successfully.');
  }

  toggleLabDropdown() {
    if (this.isStaffRole) return;
    this.filteredLabs = [...this.labs];
    this.showLabDropdown = !this.showLabDropdown;
  }

  // ---------- last patient ----------
  loadLastPatient() {
    const labId = this.labApi.getCurrentLabId();
    const currentUserId = (this.authService.currentUserValue as any)?.raw?.id;

    const today = new Date();
    const toDateExclusive = this.formatDateParam(this.addDays(today, 1));
    const fromDate = this.formatDateParam(this.addDays(today, -60));

    this.labApi.getBookingStatusNew(labId, 0, 500, fromDate, toDateExclusive).subscribe({
      next: (res: any) => {
        let list = res?.content || res || [];
        list = Array.isArray(list) ? list : [];

        if (this.role !== this.ROLE_LAB_ADMIN && currentUserId) {
          list = list.filter((b: any) => b.createdBy === currentUserId);
        }
        list.sort((a: any, b: any) => (b.createdOn || 0) - (a.createdOn || 0));

        const last = list[0];
        this.lastPatient = last?.customerName ?? '—';
        const uhid = last?.uhidNumber ?? last?.uhid ?? last?.UHID ?? '';
        this.patientRelation = uhid ? ('self/' + uhid) : 'self/ILS3505';
      },
      error: () => {
        this.lastPatient = '—';
        this.patientRelation = 'self/ILS3505';
      }
    });
  }

  private formatDateParam(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  private addDays(d: Date, days: number): Date {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  // ---------- tests ----------
  loadTests() {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        const apiTests = res || [];
        this.allTests = (Array.isArray(apiTests) ? apiTests : []).map((t: any) => ({
          id: t.testId,
          name: t.test_name || 'Unnamed Test',
          b2b: t.price2 ?? 0,
          tat: t.tat || 'N/A',
          mrp: t.test_price ?? 0,
          dis: 0,
          fluid: t.sampleTypeName || 'N/A',
          sampleType: t.sampleTypeName || 'OTHER',
          color: t.sampleColor || '#a855f7'
        }));
      },
      error: () => this.toastService.error('Error', 'Failed to load tests from server.')
    });
  }

  searchTest() {
    if (this.testSearch.trim().length > 0) {
      this.filteredTests = this.allTests.filter(t => t.name.toLowerCase().includes(this.testSearch.toLowerCase()));
      this.showSuggestions = true;
    } else {
      this.filteredTests = [];
      this.showSuggestions = false;
    }
  }

  addTest(test: any) {
    const exists = this.selectedTests.find(t => t.name === test.name);
    if (!exists) {
      this.selectedTests.push(test);
      this.selectedSampleTests.push({ barcode: '', sampleType: test.sampleType, testName: test.name, color: test.color });
      this.toastService.success('Test Added', test.name + ' added to bill.');
      this.calculateBilling();
    } else {
      this.toastService.warning('Already Added', test.name + ' already exists.');
    }
    this.testSearch = '';
    this.showSuggestions = false;
  }

  async removeTest(index: number) {
    const test = this.selectedTests[index];
    const alert = await this.alertController.create({
      header: 'Remove Test',
      message: `Are you sure you want to remove "${test.name}"?`,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Yes',
          handler: () => {
            this.selectedTests.splice(index, 1);
            this.selectedSampleTests = this.selectedSampleTests.filter(x => x.testName !== test.name);
            this.toastService.warning('Test Removed', test.name + ' removed from bill.');
            this.calculateBilling();
          }
        }
      ]
    });
    await alert.present();
  }

  getSubTotal() {
    return this.selectedTests.reduce((sum, t) => sum + t.mrp, 0);
  }

  // ---------- billing ----------
  calculateBilling() {
    const subTotal = this.getSubTotal();

    this.billing.discountAmount = this.billing.discountType === 'percent'
      ? Math.round((subTotal * (this.billing.discountValue || 0)) / 100)
      : (this.billing.discountValue || 0);

    this.billing.grandTotal = Math.max(0, subTotal - this.billing.discountAmount);

    if (this.billing.paymentMode === 'cash') {
      this.billing.cashAmount = this.billing.paidAmount || 0;
      this.billing.upiAmount = 0;
    } else if (this.billing.paymentMode === 'upi') {
      this.billing.upiAmount = this.billing.paidAmount || 0;
      this.billing.cashAmount = 0;
    }

    this.billing.dueAmount = Math.max(0, this.billing.grandTotal - (this.billing.paidAmount || 0));
  }

  resetBilling() {
    this.billing = {
      discountType: 'percent', discountValue: 0, discountAmount: 0, grandTotal: 0,
      paymentMode: 'cash', cashAmount: 0, upiAmount: 0, paidAmount: 0, dueAmount: 0,
      transactionId: '', discountFromDoctor: null
    };
  }

  // ---------- file ----------
  triggerFileInput() {
    (document.getElementById('fileInput') as HTMLInputElement)?.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toastService.error('File Too Large', 'Please select file under 5MB.');
      return;
    }

    this.selectedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.selectedFileBase64 = e.target.result;
      this.toastService.success('File Added', file.name + ' added successfully.');
    };
    reader.readAsDataURL(file);
  }

  removeFile() {
    this.selectedFileName = '';
    this.selectedFileBase64 = '';
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    this.toastService.warning('File Removed', 'File has been removed.');
  }

  // ---------- form / save ----------
  resetForm() {
    this.patient = {
      title: 'mr', name: '', age: '', ageType: 'years', gender: 'male',
      doctorTitle: 'dr', doctor: '', lab: '', phone: '', aadhaar: '',
      address: '', uhid: '', history: '', otherCharges: 0,
      eReport: false, clinical: false, file: false, homeCollection: false
    };
    this.selectedTests = [];
    this.selectedSampleTests = [];
    this.testSearch = '';
    this.filteredTests = [];
    this.selectedFileName = '';
    this.selectedFileBase64 = '';
    this.showSuggestions = false;

    this.selectedDoctor = null;
    this.doctorSearch = '';
    this.filteredDoctors = [];
    this.showDoctorSuggestions = false;

    this.selectedLab = null;
    this.customFranchiseName = '';
    this.labSearch = '';
    this.showLabDropdown = false;
    this.showAddLabModal = false;
    this.staffLabSearch = '';
    this.filteredStaffLabs = [];
    this.showStaffLabDropdown = false;

    this.resetBilling();
    this.loadDoctors();
    this.loadLabs();
    this.loadLastPatient();
  }

  async savePatient() {
    if (!this.patient.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter patient name.');
      return;
    }
    if (!this.patient.age) {
      this.toastService.error('Validation Error', 'Please enter age.');
      return;
    }
    if (!this.getDoctorId(this.selectedDoctor)) {
      this.toastService.error('Doctor Required', 'Please select doctor from the suggestion list.');
      return;
    }
    if (this.selectedTests.length === 0) {
      this.toastService.warning('No Tests', 'Please add at least one test.');
      return;
    }
    if (!this.selectedLab) {
      this.toastService.error('Franchise Required', 'Please select collection center.');
      return;
    }

    const franchiseId = this.selectedLab?.id ?? this.selectedLab?.franchiseId ?? 0;
    this.calculateBilling();

    const payload = {
      customerName: this.patient.name,
      age: Number(this.patient.age),
      ageType: this.patient.ageType,
      gender: this.patient.gender,
      mobileNumber: this.patient.phone ? Number(this.patient.phone) : 0,
      address: this.patient.address || "",
      customDoctorName: this.patient.doctor || "",
      doctorid: this.getDoctorId(this.selectedDoctor),
      customFranchiseLab: this.patient.lab || "",
      customFranchiseLabId: "",
      franchiseId: franchiseId,
      otherCharges: Number(this.patient.otherCharges) || 0,
      tests: this.selectedTests.map(t => ({
        testId: t.id, test_name: t.name, test_price: t.mrp, assignedPrice: t.mrp
      })),
      subTotalAmount: this.getSubTotal(),
      totalAmount: this.billing.grandTotal
    };

    this.labApi.createBooking(payload).subscribe({
      next: (res: any) => {
        this.toastService.success('Booking Saved', 'Patient booking created successfully.');

        this.savedPatient = {
          name: (this.patient.title ? this.capitalize(this.patient.title) + '. ' : '') + this.patient.name,
          doctor: (this.patient.doctorTitle ? this.capitalize(this.patient.doctorTitle) + '. ' : '') + (this.patient.doctor || '—'),
          bookingDate: new Date().toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
          }),
          id: res?.bookingId ?? '—',
          phone: this.patient.phone,
          totalAmount: this.getSubTotal(),
          discount: this.billing.discountAmount,
          grandTotal: this.billing.grandTotal
        };

        this.bookingRefresh.triggerRefresh();

        if (this.isAdminRole) {
          this.showInvoice = true;
        } else {
          this.toastService.success('Done!', 'Redirecting to dashboard...');
          this.resetForm();
          setTimeout(() => this.ngZone.run(() => this.router.navigate(['/dashboard'])), 800);
        }
      },
      error: (err) => {
        this.toastService.error('Error', 'Failed to save: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  private capitalize(str: string): string {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  printInvoice() {
    window.print();
  }

  closeInvoice() {
    this.showInvoice = false;
    this.resetForm();
    this.toastService.success('Done!', 'Redirecting to dashboard...');
    setTimeout(() => this.ngZone.run(() => this.router.navigate(['/dashboard'])), 800);
  }

  async cancel() {
    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: 'Are you sure you want to cancel?',
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Yes',
          handler: () => {
            this.toastService.warning('Cancelled', 'Booking was cancelled.');
            this.ngZone.run(() => this.router.navigate(['/dashboard']));
          }
        }
      ]
    });
    await alert.present();
  }

  async scanBarcode(sample: any) {
    this.toastService.warning('Scanner', 'Please enter barcode manually. Camera works on real device.');
  }
}