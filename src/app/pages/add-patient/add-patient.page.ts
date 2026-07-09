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
import { BookingService, Patient } from '../../services/booking-status';
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

  lastPatient = '—';

  patientRelation: string = 'self/ILS3505';
 labSearch: string = '';
  filteredLabs: any[] = [];
  customFranchiseName: string = '';
  staffLabSearch: string = '';
  filteredStaffLabs: any[] = [];
  showStaffLabDropdown = false;
  testSearch = '';
  showInvoice = false;
  showAddDoctor = false;

  // ✅ CHANGED — top-right box ata TYPE-AHEAD search आहे (click-toggle
  // नाही) — type kelyavar showLabDropdown auto true/false hoto.
  showLabDropdown = false;

  // ✅ ADDED — STAFF sathi OLD STYLE "Add Lab" modal (Lab name / Contact
  // / Address) — LAB/HOS field cha "+" button he ughadto.
  showAddLabModal = false;

  savedPatient: any = null;
  selectedSampleTests: any[] = [];

  drawnOn = new Date().toLocaleString('en-IN', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  patient: any = {
    title: 'mr',
    name: '',
    age: '',
    ageType: 'years',
    gender: 'male',
    doctorTitle: 'dr',
    doctor: '',
    lab: '',
    phone: '',
    aadhaar: '',
    address: '',
    uhid: '',
    history: '',
    otherCharges: 0,
    eReport: false,
    clinical: false,
    file: false,
    homeCollection: false
  };

  newDoctor = {
    type: 'Referral',
    name: '',
    mobile: '',
    degree: '',
    percentValue: '',
    percentType: 'percent'
  };

  newLab = {
    name: '',
    contact: '',
    address: ''
  };

  selectedTests: any[] = [];
  allTests: any[] = [];
  filteredTests: any[] = [];
  showSuggestions = false;

  doctors: any[] = [];
  selectedDoctor: any = null;

  labs: any[] = [];
  selectedLab: any = null;



  doctorSearch = '';
  filteredDoctors: any[] = [];
  showDoctorSuggestions = false;

  role: string = '';

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  get isTopAdmin(): boolean {
    return this.roleService.isLabSideUI;
  }

  get hideAmounts(): boolean {
    return this.roleService.isFranchiseSide;
  }

  get isAdminRole(): boolean {
    return this.roleService.isLabSideUI;
  }

  get isFranchiseRole(): boolean {
    return this.role === this.ROLE_FRANCHISE || this.role === this.ROLE_FRANCHISE_STAFF;
  }

  billing = {
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 0,
    discountAmount: 0,
    grandTotal: 0,
    paymentMode: 'cash',
    cashAmount: 0,
    upiAmount: 0,
    paidAmount: 0,
    dueAmount: 0,
    transactionId: '',
    discountFromDoctor: null as any
  };

  calculateBilling() {
    const subTotal = this.getSubTotal();

    if (this.billing.discountType === 'percent') {
      this.billing.discountAmount = Math.round((subTotal * (this.billing.discountValue || 0)) / 100);
    } else {
      this.billing.discountAmount = this.billing.discountValue || 0;
    }

    this.billing.grandTotal = subTotal - this.billing.discountAmount;
    if (this.billing.grandTotal < 0) this.billing.grandTotal = 0;

    if (this.billing.paymentMode === 'cash') {
      this.billing.cashAmount = this.billing.paidAmount || 0;
      this.billing.upiAmount = 0;
    } else if (this.billing.paymentMode === 'upi') {
      this.billing.upiAmount = this.billing.paidAmount || 0;
      this.billing.cashAmount = 0;
    }

    this.billing.dueAmount = this.billing.grandTotal - (this.billing.paidAmount || 0);
    if (this.billing.dueAmount < 0) this.billing.dueAmount = 0;
  }

  resetBilling() {
    this.billing = {
      discountType: 'percent',
      discountValue: 0,
      discountAmount: 0,
      grandTotal: 0,
      paymentMode: 'cash',
      cashAmount: 0,
      upiAmount: 0,
      paidAmount: 0,
      dueAmount: 0,
      transactionId: '',
      discountFromDoctor: null
    };
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
      'person-outline': personOutline,
      'add-outline': addOutline,
      'search-outline': searchOutline,
      'save-outline': saveOutline,
      'trash-outline': trashOutline,
      'wallet-outline': walletOutline,
      'print-outline': printOutline,
      'calendar-outline': calendarOutline,
      'camera-outline': cameraOutline,
      'close-outline': closeOutline,
      'scan-outline': scanOutline,
      'attach-outline': attachOutline,
      'document-outline': documentOutline,
      'checkmark-outline': checkmarkOutline,
      'chevron-down-outline': chevronDownOutline
    });
  }

  compareDoctors = (o1: any, o2: any): boolean => {
    if (!o1 || !o2) return o1 === o2;
    return this.getDoctorId(o1) === this.getDoctorId(o2);
  };

  compareLabs = (o1: any, o2: any): boolean => {
    if (!o1 || !o2) return o1 === o2;
    return (o1.id ?? o1.franchiseId) === (o2.id ?? o2.franchiseId);
  };

  openAddDoctor() {
    this.resetNewDoctorForm();
    this.showAddDoctor = true;
  }

  private resetNewDoctorForm() {
    this.newDoctor = {
      type: 'Referral',
      name: '',
      mobile: '',
      degree: '',
      percentValue: '',
      percentType: 'percent'
    };
  }

  // ✅ CHANGED — STAFF cha simplified "Add Doctor" modal (फक्त Doctor
  // Name / Percent Value / Percent Type) sathi Type + Mobile Number
  // required nahit — ते फक्त ADMIN sathi required raहतात.
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
            if (created) {
              this.selectDoctor(created);
            }
          }
        });

        this.resetNewDoctorForm();
      },
      error: (err) => {
        console.log('CREATE DOCTOR ERROR:', err);
        this.toastService.error('Error', 'Failed to add doctor: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  loadDoctors() {
    this.labApi.getDoctors().subscribe({
      next: (res: any) => {
        this.doctors = res || [];

        if (!this.selectedDoctor) {
          const selfDoctor = this.doctors.find((d: any) =>
            (d.doctor_name || '').toLowerCase() === 'self'
          );
          if (selfDoctor) {
            this.selectDoctor(selfDoctor);
          }
        }
      },
      error: (err) => {
        console.log(err);
        this.toastService.error('Error', 'Failed to load doctors');
      }
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

  private getDoctorId(doc: any): number {
    return Number(doc?.id ?? doc?.doctorId ?? doc?.doctor_id ?? 0);
  }

  // ✅ CHANGED — filteredLabs pan set kartoy, jenवढं picker list
  // lगेच populate होईल
  loadLabs() {
    if (this.isFranchiseRole) {
      const currentUser = this.authService.currentUserValue;

      if (currentUser && currentUser.franchiseId) {
        const ownFranchise = {
          id: currentUser.franchiseId,
          franchiseName: currentUser.franchiseName
        };
        this.labs = [ownFranchise];
        this.filteredLabs = this.labs;
        this.selectedLab = ownFranchise;
        this.patient.lab = ownFranchise.franchiseName;
      } else {
        this.labs = [];
        this.filteredLabs = [];
      }
      return;
    }

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.labs = res?.content || res || [];
        this.filteredLabs = this.labs;
      },
      error: (err) => {
        console.log('LABS ERROR:', err);
        this.toastService.error('Error', 'Failed to load labs');
      }
    });
  }

  selectLab(lab: any) {
    this.selectedLab = lab;
    this.patient.lab = lab?.franchiseName || lab?.name;
  }

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
      error: (err) => {
        console.log(err);
        this.toastService.error('Error', 'Failed to load tests from server.');
      }
    });
  }

  openAddLabApi() {
    this.loadLabs();
  }

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

  loadLastPatient() {
    this.labApi.getLastBooking().subscribe({
      next: (res: any) => {
        this.lastPatient =
          res?.customerName ?? res?.name ?? res?.patientName ?? '—';

        const uhid = res?.uhid ?? res?.UHID ?? '';
        this.patientRelation = uhid ? ('self/' + uhid) : 'self/ILS3505';
      },
      error: (err) => {
        console.log('LAST PATIENT ERROR:', err);
        this.lastPatient = '—';
        this.patientRelation = 'self/ILS3505';
      }
    });
  }

  // ==========================
  // ✅ CHANGED — Top-right box + Staff LAB/HOS field donhi ata
  // TYPE-AHEAD SEARCH (Image 1 प्रमाणे) — click-toggle nahi. Type
  // karताच list khali yете, khali empty kela tar list band hote.
  // ==========================
  searchLabInput() {
    const q = this.labSearch.trim().toLowerCase();

    if (q.length > 0) {
      this.filteredLabs = this.labs.filter(l =>
        (l.franchiseName || l.name || '').toLowerCase().includes(q)
      );
      this.showLabDropdown = true;
    } else {
      this.filteredLabs = [];
      this.showLabDropdown = false;
    }

    // typed text ला थेट patient.lab sobat sync ठेवतो, jenavढं list
    // madhe match nasel tar pan custom naव save hoईल
    this.selectedLab = null;
    this.patient.lab = this.labSearch;
  }

  // ==========================
  // ✅ ADDED — STAFF cha LAB/HOS field sathi VEGLA (independent)
  // search handler. Top box cha searchLabInput() la ata हात लावला
  // nahi — tो jasa hota tasaच rahtो.
  // ==========================
  searchStaffLabInput() {
    const q = this.staffLabSearch.trim().toLowerCase();

    if (q.length > 0) {
      this.filteredStaffLabs = this.labs.filter(l =>
        (l.franchiseName || l.name || '').toLowerCase().includes(q)
      );
      this.showStaffLabDropdown = true;
    } else {
      this.filteredStaffLabs = [];
      this.showStaffLabDropdown = false;
    }

    // ✅ typed text patient.lab sobat sync — top box प्रमाणेच
    this.selectedLab = null;
    this.patient.lab = this.staffLabSearch;
  }

  // ✅ LAB/HOS list item click kelyavar select karून list band
  selectStaffLabFromPicker(lab: any) {
    this.selectLab(lab);
    this.staffLabSearch = lab?.franchiseName || lab?.name || '';
    this.showStaffLabDropdown = false;
  }

  // ✅ input box la focus milalyavar (jar aधीच kahi text ahe) list
  // punha dakhaव्यासाठी
  onLabSearchFocus() {
    if (this.labSearch.trim().length > 0) {
      this.searchLabInput();
    }
  }

  // ✅ list item click kelyavar select karून list band
  selectLabFromPicker(lab: any) {
    this.selectLab(lab);
    this.labSearch = lab?.franchiseName || lab?.name || '';
    this.showLabDropdown = false;
  }

  // ✅ ADMIN — CUSTOM FRANCHISE text box (form madhe inline, DRAWN ON नंतर)
  onCustomFranchiseInput() {
    if (this.customFranchiseName.trim()) {
      this.selectedLab = null;
      this.patient.lab = this.customFranchiseName.trim();
      this.labSearch = this.customFranchiseName.trim();
    } else {
      this.patient.lab = '';
    }
  }

  // ✅ ADDED — STAFF "Add Lab" modal ughadण्यासाठी (Image 3 प्रमाणे)
  openAddLabModal() {
    this.newLab = { name: '', contact: '', address: '' };
    this.showAddLabModal = true;
  }

  // ✅ ADDED — STAFF "Add Lab" modal cha Add button (Image 3 प्रमाणे).
  // labSearch/top-box madhe pan navin lab नाव लगेच sync होते.
  saveLab() {
    if (!this.newLab.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter lab name.');
      return;
    }
    this.patient.lab = this.newLab.name;
    this.labSearch = this.newLab.name;

    // ✅ ADDED — staff cha independent field pan sync kara
    this.staffLabSearch = this.newLab.name;

    this.selectedLab = null;
    this.showAddLabModal = false;
    this.toastService.success('Lab Added', this.newLab.name + ' added successfully.');
  }

  searchTest() {
    if (this.testSearch.trim().length > 0) {
      this.filteredTests = this.allTests.filter(t =>
        t.name.toLowerCase().includes(this.testSearch.toLowerCase())
      );
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
      this.selectedSampleTests.push({
        barcode: '',
        sampleType: test.sampleType,
        testName: test.name,
        color: test.color
      });
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
            this.selectedSampleTests = this.selectedSampleTests.filter(
              x => x.testName !== test.name
            );
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

  resetForm() {
    this.patient = {
      title: 'mr', name: '', age: '',
      ageType: 'years', gender: 'male',
      doctorTitle: 'dr', doctor: '', lab: '',
      phone: '', aadhaar: '', address: '',
      uhid: '', history: '', otherCharges: 0,
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
        testId: t.id,
        test_name: t.name,
        test_price: t.mrp,
        assignedPrice: t.mrp
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
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          }),
          id: res?.bookingId ?? '—',
          phone: this.patient.phone,
          totalAmount: this.getSubTotal(),
          discount: this.billing.discountAmount,
          grandTotal: this.billing.grandTotal
        };

        try {
          const actualCreatorUsername = this.authService.currentUserValue?.raw?.username ?? '';
          const bookingId = res?.bookingId;

          if (bookingId && actualCreatorUsername) {
            const raw = localStorage.getItem('bookingCreatorOverride');
            const map = raw ? JSON.parse(raw) : {};
            map[bookingId] = actualCreatorUsername;
            localStorage.setItem('bookingCreatorOverride', JSON.stringify(map));
          }
        } catch (e) {
          console.log('bookingCreatorOverride save error:', e);
        }

        this.bookingRefresh.triggerRefresh();

        if (this.isAdminRole) {
          this.showInvoice = true;
        } else {
          this.toastService.success('Done!', 'Redirecting to dashboard...');
          this.resetForm();
          setTimeout(() => {
            this.ngZone.run(() => this.router.navigate(['/dashboard']));
          }, 800);
        }
      },
      error: (err) => {
        console.error('Booking Error:', err);
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
    setTimeout(() => {
      this.ngZone.run(() => this.router.navigate(['/dashboard']));
    }, 800);
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

  selectedFileName = '';
  selectedFileBase64 = '';

  triggerFileInput() {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    fileInput?.click();
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

}