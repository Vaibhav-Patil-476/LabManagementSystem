import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonCheckbox,
  IonModal,
  IonRadioGroup,
  IonRadio,
  IonItem
} from '@ionic/angular/standalone';
import {
  HostListener
} from '@angular/core';
import { addIcons } from 'ionicons';
import {
  personOutline,
  addOutline,
  searchOutline,
  saveOutline,
  trashOutline,
  walletOutline,
  printOutline,
  calendarOutline,
  cameraOutline,
  closeOutline,
  scanOutline,
  attachOutline,
  documentOutline,
  checkmarkOutline,
  chevronDownOutline,
  eyeOutline
} from 'ionicons/icons';

import { RoleService } from '../../core/services/role';
import { ToastService } from '../../core/services/toast';
import { BookingService } from '../../core/services/booking-status';
import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { BookingRefreshService } from '../../core/services/booking-refresh';

@Component({
  selector: 'app-add-patient',
  templateUrl: './add-patient.page.html',
  styleUrls: ['./add-patient.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonCheckbox,
    IonModal,
    IonRadioGroup,
    IonRadio,
    IonItem
  ]
})
export class AddPatientComponent {

  // ============================================================
  // STATE
  // ============================================================

  role: string = '';

  lastPatient = '—';
  customDoctorName: string = '';
  patientRelation = 'self/ILS3505';

  drawnOn = new Date().toLocaleString('en-IN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  patient: any = {
    title: 'mr',
    name: '',
    age: '',
    ageType: 'years',
    gender: 'male',

    doctorTitle: 'dr',
    doctor: '',
    doctorId: null,

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

  // ============================================================
  // FIELD-LEVEL VALIDATION ERRORS
  //
  // Each key here maps to one input's [class.field-error] binding
  // in the HTML. validatePatientForm() sets these to `true` for
  // whichever field fails first (and resets all of them at the
  // start of every validation run). clearFieldError() is wired to
  // each input's (ionInput) so the red border disappears the
  // moment the user starts typing again.
  // ============================================================

  fieldErrors: any = {
    name: false,
    age: false,
    doctor: false,
    mobile: false,
    aadhaar: false,
    uhid: false,
    address: false,
    history: false,
    otherCharges: false,
    customFranchise: false,
    tests: false
  };

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

  // ============================================================
  // DOCTOR
  // ============================================================

  doctors: any[] = [];
  selectedDoctorId: number | null = null;
  hasExistingDoctor = false;

  selectedDoctor: any = null;

  doctorSearch = '';

  filteredDoctors: any[] = [];

  showDoctorSuggestions = false;

  showAddDoctor = false;

  newDoctor = {
    type: 'Referral',
    name: '',
    mobile: '',
    degree: '',
    percentValue: '',
    percentType: 'percent'
  };



  // ============================================================
  // LAB / FRANCHISE
  // ============================================================

  labs: any[] = [];

  selectedLab: any = null;

  selectedStaffLab: any = null;

  labSearch = '';

  filteredLabs: any[] = [];

  showLabDropdown = false;

  showAddLabModal = false;

  newLab = {
    name: '',
    contact: '',
    address: ''
  };

  // IMPORTANT:
  // Custom Franchise is completely independent
  // from Collection Center / Lab dropdown.
  customFranchiseName = '';

  staffLabSearch = '';

  filteredStaffLabs: any[] = [];

  showStaffLabDropdown = false;

  // ============================================================
  // TESTS
  // ============================================================

  selectedTests: any[] = [];

  allTests: any[] = [];

  filteredTests: any[] = [];

  showSuggestions = false;

  testSearch = '';

  selectedSampleTests: any[] = [];

  // ============================================================
  // PACKAGES / PROFILES (test bundles)
  // ============================================================

  allPackages: any[] = [];

  filteredPackages: any[] = [];

  packageSearch = '';

  showPackageSuggestions = false;

  // ✅ NEW: A package added to the bill is kept as ONE collapsed row
  // (name + eye icon) instead of exploding into every individual
  // test — matches company web. Each entry keeps the underlying
  // tests so billing/barcode/invoice logic still has everything it
  // needs, they're just not rendered as separate rows.
  selectedPackages: any[] = [];

  showPackageTestsModal = false;

  activePackageForPreview: any = null;

  // ============================================================
  // FILE
  // ============================================================

  selectedFileName = '';

  selectedFileBase64 = '';

  // ============================================================
  // INVOICE
  // ============================================================

  showInvoice = false;

  // ✅ NEW: toggles the branded header on the invoice (matches the
  // "Show Header" switch on the company web app invoice screen).
  showInvoiceHeader = true;

  savedPatient: any = null;

  // ============================================================
  // ROLES
  // ============================================================

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';

  private readonly ROLE_STAFF = 'ROLE_STAFF';

  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';

  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  // ============================================================
  // DEFAULT FRANCHISE
  // ============================================================

  private readonly DEFAULT_FRANCHISE: any = {
    franchiseId: 2541,
    id: 2541,
    franchiseName: 'dar',
    name: 'dar',
    centerCode: 'dar',

    lockReport: false,
    lockReportAmount: 0.0,

    accessMode: 'false',

    balanceNegative: false,

    paidType: 'postpaid',

    wallet: null,

    superFranchiseActive: true,

    franchiseActive: false,

    subFranchiseActive: false,

    processAt: true,

    nablOnReport: true,

    labId: 3505
  };

  // ============================================================
  // GETTERS
  // ============================================================

  get isAdminRole(): boolean {
    return this.roleService.isLabSideUI;
  }
  get canEditPayment(): boolean {
    return this.isAdminRole || this.isStaffRole;
  }
  get canViewAmount(): boolean {
    return this.isAdminRole || this.isFranchiseRole;
  }

  get canViewAmountAdmin(): boolean {
    return this.isAdminRole
  }

  get isFranchiseRole(): boolean {
    return (
      this.role === this.ROLE_FRANCHISE ||
      this.role === this.ROLE_FRANCHISE_STAFF
    );
  }

  get isFranchiseOnlyRole(): boolean {
    return this.role === this.ROLE_FRANCHISE;
  }

  get isFranchiseStaffRole(): boolean {
    return this.role === this.ROLE_FRANCHISE_STAFF;
  }

  get isStaffRole(): boolean {
    return this.role === this.ROLE_STAFF;
  }

  get isStaffSideUI(): boolean {
    return !this.isAdminRole;
  }

  get staffBarcodesFilled(): boolean {

    if (!this.isStaffSideUI) {
      return true;
    }

    if (this.selectedSampleTests.length === 0) {
      return false;
    }

    return this.selectedSampleTests.every(
      (s: any) =>
        String(s?.barcode || '').trim().length > 0
    );
  }

  getB2BSubTotal(): number {
    return this.getSubTotal();
  }

get displayTestRows(): any[] {


    const individualRows = this.selectedTests
      .filter((t: any) => !t.packageName)
      .map((t: any) => ({ ...t, isPackage: false }));

    const packageRows = this.selectedPackages.map((p: any) => ({
      name: p.profileName,
      b2b: p.b2b,
      mrp: p.mrp,
      dis: 0,
      tat: '-',
      fluid: '-',
      isPackage: true,
      packageRef: p
    }));

    return [...individualRows, ...packageRows];
  }

  trackByRow(index: number, row: any): any {
    return row?.isPackage ? ('pkg-' + row.name) : ('test-' + row.name);
  }
  // ============================================================
  // CONSTRUCTOR
  // ============================================================

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
      'chevron-down-outline': chevronDownOutline,
      'eye-outline': eyeOutline
    });
  }


  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {

    const target = event.target as HTMLElement;

    // Doctor search/dropdown च्या आत click असेल
    // तर dropdown open ठेवा
    if (
      target.closest('.doctor-search-wrapper') ||
      target.closest('.doctor-dropdown')
    ) {
      return;
    }

    // Doctor suggestions close करा
    this.showDoctorSuggestions = false;

    // Filtered doctors clear करा
    this.filteredDoctors = [];
  }

  // ============================================================
  // ✅ FIELD ERROR HELPERS
  //
  // clearFieldError(field) is bound to (ionInput) on every required
  // input in the HTML. The moment the user types, the red border
  // for that specific field disappears — no need to re-submit the
  // form to see it clear.
  // ============================================================

  clearFieldError(field: string): void {
    if (this.fieldErrors[field]) {
      this.fieldErrors[field] = false;
    }
  }

  private resetFieldErrors(): void {
    this.fieldErrors = {
      name: false,
      age: false,
      doctor: false,
      mobile: false,
      aadhaar: false,
      uhid: false,
      address: false,
      history: false,
      otherCharges: false,
      customFranchise: false,
      tests: false
    };
  }

  private doctorSearchTimer: any = null;
  private extractDoctorsResponse(res: any): any[] {
    if (Array.isArray(res)) {
      return res;
    }

    if (Array.isArray(res?.content)) {
      return res.content;
    }

    if (Array.isArray(res?.data)) {
      return res.data;
    }

    if (Array.isArray(res?.doctors)) {
      return res.doctors;
    }

    if (Array.isArray(res?.data?.content)) {
      return res.data.content;
    }

    if (res?.doctor) {
      return [res.doctor];
    }

    if (res?.data?.doctor) {
      return [res.data.doctor];
    }

    return [];
  }
  // ============================================================
  // LIFECYCLE
  // ============================================================

  ionViewWillEnter() {

    this.authService.loadCurrentUser().subscribe({

      next: () => {

        this.role = this.authService.role;

        this.loadDoctors();

        this.loadLabs();

        this.loadTests();

        this.loadPackages();

        this.loadLastPatient();
        console.log('MY ROLE:', this.role);
        console.log('RAW USER:', (this.authService.currentUserValue as any)?.raw);
      },

      error: (err) => {

        console.error(
          'CURRENT USER ERROR:',
          err
        );


        this.toastService.error(
          'Error',
          'Failed to load user info'
        );
      }
    });
  }

  // ============================================================
  // COMPARE FUNCTIONS
  // ============================================================

  compareDoctors = (
    o1: any,
    o2: any
  ): boolean => {

    if (!o1 || !o2) {
      return o1 === o2;
    }

    return (
      this.getDoctorId(o1) ===
      this.getDoctorId(o2)
    );
  };

  compareLabs = (
    o1: any,
    o2: any
  ): boolean => {

    if (!o1 || !o2) {
      return o1 === o2;
    }

    return (
      Number(
        o1?.id ??
        o1?.franchiseId ??
        0
      ) ===
      Number(
        o2?.id ??
        o2?.franchiseId ??
        0
      )
    );
  };

  private getDoctorId(doc: any): number {
    return Number(
      doc?.doctorId ??
      doc?.id ??
      doc?.doctor_id ??
      0
    );
  }

  private getDoctorName(doc: any): string {
    return String(
      doc?.doctor_name ??
      doc?.doctorName ??
      doc?.name ??
      ''
    ).trim();
  }

  private normalizeDoctor(doc: any): any | null {
    if (!doc) {
      return null;
    }

    const doctorId = Number(
      doc?.doctorId ??
      doc?.id ??
      doc?.doctor_id ??
      doc?.data?.doctorId ??
      doc?.data?.id ??
      0
    );

    const doctorName = String(
      doc?.doctor_name ??
      doc?.doctorName ??
      doc?.name ??
      ''
    ).trim();

    if (!doctorName && !doctorId) {
      return null;
    }

    return {
      ...doc,

      id: doctorId || doc?.id,
      doctorId: doctorId || doc?.doctorId,
      doctor_id: doctorId || doc?.doctor_id,

      doctor_name: doctorName,
      doctorName: doctorName,
      name: doctorName
    };
  }


  // ============================================================
  // EXTRACT DOCTOR LIST
  // ============================================================

  private extractDoctors(res: any): any[] {

    let list: any[] = [];

    if (Array.isArray(res)) {

      list = res;

    } else if (Array.isArray(res?.content)) {

      list = res.content;

    } else if (Array.isArray(res?.data)) {

      list = res.data;

    } else if (Array.isArray(res?.data?.content)) {

      list = res.data.content;

    } else if (Array.isArray(res?.doctors)) {

      list = res.doctors;
    }

    return list
      .map((d: any) =>
        this.normalizeDoctor(d)
      )
      .filter((d: any) =>
        !!d?.doctor_name
      );
  }

  // ============================================================
  // OPEN ADD DOCTOR
  // ============================================================

  openAddDoctor() {

    this.resetNewDoctorForm();

    this.showAddDoctor = true;
  }

  // ============================================================
  // RESET NEW DOCTOR FORM
  // ============================================================

  private resetNewDoctorForm() {

    this.newDoctor = {

      type: 'Referral',

      name: '',

      mobile: '',

      degree: '',

      percentValue: '',

      percentType: 'commission'
    };
  }

  // ============================================================
  // SAVE DOCTOR
  //
  // IMPORTANT:
  // 1. Doctor is saved in database.
  // 2. Doctor list is updated immediately.
  // 3. No page refresh required.
  // 4. Newly created doctor is selected automatically.
  // ============================================================

  // ============================================================
  // SAVE DOCTOR
  // ============================================================

  saveDoctor(): void {
    const doctorName = String(
      this.newDoctor?.name || ''
    ).trim();

    const mobileNumber = String(
      this.newDoctor?.mobile || ''
    ).trim();

    if (!doctorName) {
      this.toastService.error(
        'Validation Error',
        'Please enter doctor name.'
      );
      return;
    }

    if (!/^[A-Za-z][A-Za-z\s.]{1,59}$/.test(doctorName)) {
      this.toastService.error(
        'Validation Error',
        'Doctor name should contain only letters and be 2-60 characters long.'
      );
      return;
    }

    if (this.isAdminRole && !mobileNumber) {
      this.toastService.error(
        'Validation Error',
        'Please enter mobile number.'
      );
      return;
    }

    if (this.isAdminRole && !/^[6-9]\d{9}$/.test(mobileNumber)) {
      this.toastService.error(
        'Validation Error',
        'Mobile number must be exactly 10 digits and start with 6-9.'
      );
      return;
    }

    const labId = this.labApi.getCurrentLabId();

    if (!labId) {
      this.toastService.error(
        'Lab Error',
        'Lab ID not found. Please login again.'
      );
      return;
    }

    const payload: any = {
      type: true,

      doctor_name:
        doctorName,

      mobileNumber:
        mobileNumber,

      email:
        '',

      departmentId:
        1,

      doctorid:
        this.hasExistingDoctor &&
          Number(this.selectedDoctorId) > 0
          ? Number(this.selectedDoctorId)
          : 0,

      customDoctorName:
        this.hasExistingDoctor
          ? ''
          : doctorName,

      address:
        '',

      signature:
        '',

      username:
        '',

      password:
        '',

      level:
        1,

      degree:
        String(
          this.newDoctor?.degree || ''
        ).trim(),

      isReferral:
        true,

      labId:
        labId
    };

    console.log(
      'CREATE DOCTOR PAYLOAD:',
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    this.labApi.createDoctor(payload).subscribe({

      next: (res: any) => {

        console.log(
          'CREATE DOCTOR SUCCESS:',
          res
        );

        const createdDoctorId =
          Number(
            res?.doctorid ??
            res?.doctorId ??
            res?.id ??
            res?.data?.doctorid ??
            res?.data?.doctorId ??
            res?.data?.id ??
            res?.doctor?.doctorid ??
            res?.doctor?.doctorId ??
            res?.doctor?.id ??
            0
          );

        console.log(
          'CREATED DOCTOR ID:',
          createdDoctorId
        );

        const immediateDoctor =
          this.normalizeDoctor({

            ...(res?.doctor || {}),

            ...(res?.data || {}),

            ...(res || {}),

            id:
              createdDoctorId > 0
                ? createdDoctorId
                : undefined,

            doctorId:
              createdDoctorId > 0
                ? createdDoctorId
                : undefined,

            doctorid:
              createdDoctorId > 0
                ? createdDoctorId
                : undefined,

            doctor_name:
              doctorName,

            doctorName:
              doctorName,

            name:
              doctorName,

            mobileNumber:
              mobileNumber,

            degree:
              this.newDoctor?.degree || '',

            labId:
              labId

          });

        if (immediateDoctor) {

          const doctorNameLower =
            doctorName
              .trim()
              .toLowerCase();

          const existingIndex =
            this.doctors.findIndex(
              (doctor: any) => {

                const existingDoctorId =
                  Number(
                    doctor?.doctorid ??
                    doctor?.doctorId ??
                    doctor?.id ??
                    doctor?.doctor_id ??
                    0
                  );

                const existingDoctorName =
                  String(
                    doctor?.doctor_name ||
                    doctor?.doctorName ||
                    doctor?.name ||
                    ''
                  )
                    .trim()
                    .toLowerCase();

                return (
                  (
                    createdDoctorId > 0 &&
                    existingDoctorId ===
                    createdDoctorId
                  ) ||
                  existingDoctorName ===
                  doctorNameLower
                );
              }
            );

          if (existingIndex >= 0) {

            this.doctors[
              existingIndex
            ] = {

              ...this.doctors[
              existingIndex
              ],

              ...immediateDoctor,

              doctorid:
                createdDoctorId > 0
                  ? createdDoctorId
                  : this.doctors[
                    existingIndex
                  ]?.doctorid

            };

          } else {

            this.doctors = [

              immediateDoctor,

              ...this.doctors

            ];

          }

          this.filteredDoctors = [
            ...this.doctors
          ];

          const savedDoctor =
            this.doctors.find(
              (doctor: any) => {

                const id =
                  Number(
                    doctor?.doctorid ??
                    doctor?.doctorId ??
                    doctor?.id ??
                    0
                  );

                const name =
                  String(
                    doctor?.doctor_name ||
                    doctor?.doctorName ||
                    doctor?.name ||
                    ''
                  )
                    .trim()
                    .toLowerCase();

                return (
                  (
                    createdDoctorId > 0 &&
                    id === createdDoctorId
                  ) ||
                  name ===
                  doctorNameLower
                );
              }
            );

          if (savedDoctor) {

            this.selectedDoctor =
              savedDoctor;

            this.selectedDoctorId =
              Number(
                savedDoctor?.doctorid ??
                savedDoctor?.doctorId ??
                savedDoctor?.id ??
                createdDoctorId
              );

            this.patient.doctorId =
              this.selectedDoctorId;

            this.patient.doctor =
              doctorName;

            this.doctorSearch =
              doctorName;

            this.showDoctorSuggestions =
              false;
          }

        } else {

          this.selectedDoctor =
            null;

          this.selectedDoctorId =
            createdDoctorId > 0
              ? createdDoctorId
              : null;

          this.patient.doctorId =
            createdDoctorId > 0
              ? createdDoctorId
              : null;

          this.patient.doctor =
            doctorName;

          this.doctorSearch =
            doctorName;

        }

        this.showAddDoctor =
          false;

        this.resetNewDoctorForm();

        this.toastService.success(
          'Doctor Added',
          `${doctorName} added successfully.`
        );

        this.refreshDoctorsInBackground(
          doctorName,
          createdDoctorId
        );
      },

      error: (err: any) => {

        console.error(
          'CREATE DOCTOR API ERROR:',
          err
        );

        const errorMessage =
          err?.error?.message ||
          err?.error?.error ||
          err?.error?.detail ||
          'Failed to add doctor.';

        this.toastService.error(
          'Error',
          errorMessage
        );
      }

    });
  }

  // ============================================================
  // BACKGROUND DOCTOR REFRESH
  //
  // Does not block UI.
  // Newly created doctor remains selected.
  // ============================================================

  // ============================================================
  // BACKGROUND DOCTOR REFRESH
  //
  // DB मधून latest doctors आणतो.
  // Page refresh लागत नाही.
  // Newly selected doctor preserve केला जातो.
  // ============================================================

  refreshDoctorsInBackground(
    doctorName: string,
    doctorId: number
  ): void {
    this.labApi.getDoctors().subscribe({
      next: (res: any) => {

        const doctors =
          res?.data ||
          res?.doctors ||
          res?.content ||
          res ||
          [];

        if (!Array.isArray(doctors)) {
          return;
        }

        this.doctors = doctors;

        this.filteredDoctors = [
          ...doctors
        ];

        const matchedDoctor =
          doctors.find((doctor: any) => {

            const id = Number(
              doctor?.doctorid ??
              doctor?.doctorId ??
              doctor?.id ??
              doctor?.doctor_id ??
              0
            );

            const name = String(
              doctor?.doctor_name ??
              doctor?.doctorName ??
              doctor?.name ??
              ''
            )
              .trim()
              .toLowerCase();

            return (
              (doctorId > 0 && id === doctorId) ||
              name === doctorName.trim().toLowerCase()
            );
          });

        if (matchedDoctor) {
          this.selectDoctor(
            matchedDoctor
          );

          this.doctorSearch =
            this.getDoctorName(
              matchedDoctor
            );
        }

        console.log(
          'Doctors refreshed from backend:',
          this.doctors
        );
      },

      error: (err: any) => {
        console.error(
          'Background doctor refresh failed:',
          err
        );
      }
    });
  }

  // ============================================================
  // LOAD DOCTORS
  // ============================================================

  loadDoctors(): void {

    this.labApi.getDoctors().subscribe({

      next: (res: any) => {

        const loadedDoctors =
          this.extractDoctorsResponse(res)
            .map((d: any) =>
              this.normalizeDoctor(d)
            )
            .filter(
              (d: any) => !!d
            );

        this.doctors =
          loadedDoctors;

        console.log(
          'LATEST DOCTORS:',
          this.doctors
        );

        // ======================================================
        // DEFAULT SELF DOCTOR
        // ======================================================

        if (
          !this.selectedDoctor
        ) {

          const selfDoctor =
            this.doctors.find(
              (d: any) =>
                this.getDoctorName(d)
                  .toLowerCase() ===
                'self'
            );

          if (selfDoctor) {

            this.selectDoctor(
              selfDoctor
            );

          }

        }

      },

      error: (err: any) => {

        console.error(
          'LOAD DOCTORS ERROR:',
          err
        );

        this.toastService.error(
          'Error',
          'Failed to load doctors'
        );

      }

    });

  }

  // ============================================================
  // SELECT DOCTOR
  // ============================================================

  selectDoctor(doc: any): void {

    const normalizedDoctor =
      this.normalizeDoctor(doc);

    if (
      !normalizedDoctor
    ) {
      return;
    }

    this.selectedDoctor =
      normalizedDoctor;

    const doctorId =
      this.getDoctorId(
        normalizedDoctor
      );

    const doctorName =
      this.getDoctorName(
        normalizedDoctor
      );

    this.patient.doctor =
      doctorName;

    this.patient.doctorId =
      doctorId || null;

    this.patient.doctorTitle =
      'dr';

    this.doctorSearch =
      doctorName;

    this.showDoctorSuggestions =
      false;

  }

  searchDoctorInput(): void {
    const searchTerm = String(
      this.doctorSearch || ''
    ).trim().toLowerCase();

    this.selectedDoctor = null;
    this.selectedDoctorId = 0;

    if (!searchTerm) {
      this.filteredDoctors = [];
      this.showDoctorSuggestions = false;
      return;
    }

    // Always fetch latest doctors from backend.
    // त्यामुळे Company Web वर नवीन Doctor save केल्यानंतर
    // Page Refresh करण्याची गरज नाही.
    this.labApi.getDoctors().subscribe({
      next: (res: any) => {

        const doctors =
          res?.data ||
          res?.doctors ||
          res?.content ||
          res ||
          [];

        if (!Array.isArray(doctors)) {
          this.filteredDoctors = [];
          this.showDoctorSuggestions = false;
          return;
        }

        // Update main doctor list with latest backend data
        this.doctors = doctors;

        // Search latest doctors
        this.filteredDoctors = doctors.filter(
          (doctor: any) => {

            const doctorName = String(
              doctor?.doctor_name ||
              doctor?.doctorName ||
              doctor?.name ||
              ''
            )
              .trim()
              .toLowerCase();

            return doctorName.includes(
              searchTerm
            );
          }
        );

        this.showDoctorSuggestions =
          this.filteredDoctors.length > 0;

        console.log(
          'LATEST DOCTORS FROM BACKEND:',
          this.doctors
        );

        console.log(
          'FILTERED DOCTORS:',
          this.filteredDoctors
        );
      },

      error: (err: any) => {

        console.error(
          'GET LATEST DOCTORS ERROR:',
          err
        );

        this.filteredDoctors = [];
        this.showDoctorSuggestions = false;
      }
    });
  }


  // ============================================================
  // SELECT DOCTOR FROM SEARCH
  // ============================================================

  selectDoctorFromSearch(
    doctor: any
  ): void {

    if (!doctor) {
      return;
    }

    const doctorId =
      Number(
        doctor?.doctorid ??
        doctor?.doctorId ??
        doctor?.id ??
        doctor?.doctor_id ??
        0
      );

    const doctorName =
      String(
        doctor?.doctor_name ||
        doctor?.doctorName ||
        doctor?.name ||
        ''
      ).trim();

    if (!doctorId || doctorId <= 0) {

      this.toastService.error(
        'Doctor Error',
        'Selected doctor ID not found.'
      );

      return;
    }

    this.selectedDoctor =
      doctor;

    this.selectedDoctorId =
      doctorId;

    this.patient.doctorId =
      doctorId;

    this.patient.doctor =
      doctorName;

    this.doctorSearch =
      doctorName;

    this.showDoctorSuggestions =
      false;

    console.log(
      'SELECTED DOCTOR:',
      doctor
    );

    console.log(
      'SELECTED DOCTOR ID:',
      doctorId
    );
  }

  // ============================================================
  // RESOLVE DOCTOR BEFORE BOOKING
  //
  // This is the MAIN FIX for:
  // "Doctor is required please reload or select doctor."
  // ============================================================

  private resolveDoctorForBooking(): any {

    // ==========================================================
    // CASE 1: Selected Doctor object
    // ==========================================================

    if (
      this.selectedDoctor
    ) {

      const selectedId =
        this.getDoctorId(
          this.selectedDoctor
        );

      if (
        selectedId > 0
      ) {

        return {

          doctorId:
            selectedId,

          doctorName:
            String(
              this.selectedDoctor?.doctor_name ||
              this.selectedDoctor?.doctorName ||
              this.selectedDoctor?.name ||
              this.patient?.doctor ||
              ''
            ).trim()
        };
      }
    }

    // ==========================================================
    // CASE 2: patient.doctorId already exists
    // ==========================================================

    const patientDoctorId =
      Number(
        this.patient?.doctorId ||
        0
      );

    if (
      patientDoctorId > 0
    ) {

      return {

        doctorId:
          patientDoctorId,

        doctorName:
          String(
            this.patient?.doctor ||
            this.doctorSearch ||
            ''
          ).trim()
      };
    }

    // ==========================================================
    // CASE 3: Find doctor by typed name
    // ==========================================================

    const typedDoctorName =
      String(
        this.doctorSearch ||
        this.patient?.doctor ||
        ''
      ).trim();

    if (
      typedDoctorName
    ) {

      const matchingDoctor =
        this.doctors.find(
          (d: any) => {

            const name =
              String(
                d?.doctor_name ||
                d?.doctorName ||
                d?.name ||
                ''
              )
                .trim()
                .toLowerCase();

            return (
              name ===
              typedDoctorName
                .toLowerCase()
            );
          }
        );

      if (
        matchingDoctor
      ) {

        const matchingId =
          this.getDoctorId(
            matchingDoctor
          );

        if (
          matchingId > 0
        ) {

          this.selectedDoctor =
            matchingDoctor;

          this.patient.doctorId =
            matchingId;

          this.patient.doctor =
            String(
              matchingDoctor?.doctor_name ||
              matchingDoctor?.doctorName ||
              matchingDoctor?.name ||
              typedDoctorName
            ).trim();

          return {

            doctorId:
              matchingId,

            doctorName:
              this.patient.doctor
          };
        }
      }
    }

    // ==========================================================
    // CASE 4: No doctor selected
    // ==========================================================

    return null;
  }

  // ============================================================
  // LAB / FRANCHISE
  // ============================================================

  loadLabs() {

    if (
      this.role ===
      this.ROLE_STAFF
    ) {

      const raw: any =
        (
          this.authService
            .currentUserValue as any
        )?.raw || {};

      const ownLab = {

        id:
          raw.labId,

        franchiseId:
          raw.labId,

        franchiseName:
          raw.labName ||
          'Lab',

        centerCode:
          raw.labCode ||
          ''
      };

      this.labs = [
        ownLab
      ];

      this.filteredLabs = [
        ...this.labs
      ];

      this.selectedLab =
        ownLab;

      this.patient.lab =
        ownLab.franchiseName;

      this.staffLabSearch =
        ownLab.franchiseName;

      this.labSearch =
        ownLab.franchiseName;

      return;
    }

    if (
      this.isFranchiseRole
    ) {

      const currentUser =
        this.authService
          .currentUserValue;

      const fId =
        (currentUser as any)
          ?.franchiseId ??
        (currentUser as any)
          ?.raw?.franchiseId;

      const fName =
        (currentUser as any)
          ?.franchiseName ??
        (currentUser as any)
          ?.raw?.franchiseName;

      const own =
        fId
          ? {
            id: fId,
            franchiseId: fId,
            franchiseName:
              fName ||
              'SELF'
          }
          : this.DEFAULT_FRANCHISE;

      this.labs = [
        own
      ];

      this.filteredLabs = [
        ...this.labs
      ];

      this.selectedLab =
        own;

      this.patient.lab =
        own.franchiseName;

      this.labSearch =
        own.franchiseName;

      return;
    }

    this.labApi
      .getFranchises()
      .subscribe({

        next: (res: any) => {

          this.labs =
            res?.content ||
            res ||
            [];

          this.filteredLabs =
            [
              ...this.labs
            ];

          let defaultLab =
            this.labs.find(
              (x: any) =>
                Number(
                  x?.franchiseId ??
                  x?.id ??
                  0
                ) ===
                Number(
                  this.DEFAULT_FRANCHISE
                    .franchiseId
                )
            );

          if (!defaultLab) {

            defaultLab =
              this.DEFAULT_FRANCHISE;

            this.labs = [

              defaultLab,

              ...this.labs
            ];

            this.filteredLabs = [
              ...this.labs
            ];
          }

          this.selectedLab =
            defaultLab;

          this.labSearch =
            defaultLab.franchiseName;

          this.staffLabSearch =
            defaultLab.franchiseName;

          this.patient.lab =
            defaultLab.franchiseName;
        },

        error: () => {

          this.labs = [
            this.DEFAULT_FRANCHISE
          ];

          this.filteredLabs = [
            ...this.labs
          ];

          this.selectedLab =
            this.DEFAULT_FRANCHISE;

          this.labSearch =
            this.DEFAULT_FRANCHISE
              .franchiseName;

          this.staffLabSearch =
            this.DEFAULT_FRANCHISE
              .franchiseName;

          this.patient.lab =
            this.DEFAULT_FRANCHISE
              .franchiseName;
        }
      });
  }

  selectLab(lab: any): void {
    if (!lab) {
      return;
    }

    this.selectedLab = lab;

    const labName = String(
      lab?.labName ||
      lab?.franchiseName ||
      lab?.name ||
      ''
    ).trim();

    this.patient.lab = labName;

    this.labSearch = labName;

    console.log(
      'LAB SELECTED:',
      lab
    );
  }

  selectStaffLab(lab: any): void {
    if (!lab) {
      return;
    }

    this.selectedStaffLab = lab;

    const labName = String(
      lab?.labName || lab?.franchiseName || lab?.name || ''
    ).trim();

    this.patient.lab = labName;
    this.staffLabSearch = labName;
  }

  searchLabInput(): void {
    const q = String(this.labSearch || '')
      .trim()
      .toLowerCase();

    // User ने काही type केले नसेल
    if (!q) {
      this.filteredLabs = [];
      this.showLabDropdown = false;
      this.selectedLab = null;
      this.patient.lab = '';
      return;
    }

    // User typing करताना selected lab reset
    this.selectedLab = null;
    this.patient.lab = this.labSearch;

    // ✅ FIX: Collection Center साठी actual FRANCHISES varun search
    // व्हायला हवं (getFranchises) — getFranchiseLabs() नाही, तो
    // वेगळाच "staff sub-lab" list आहे (franchiseLabId वापरतो, real
    // franchiseId नाही). त्यामुळेच booking चुकीच्या collection center
    // ला जात होता.
    this.labApi.getFranchises().subscribe({
      next: (res: any) => {

        const list: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.content)
            ? res.content
            : [];

        // Latest backend list update
        this.labs = list;

        // Search by real franchiseName
        this.filteredLabs = list.filter((lab: any) => {
          const labName = String(
            lab?.franchiseName ||
            lab?.name ||
            ''
          )
            .trim()
            .toLowerCase();

          return labName.includes(q);
        });

        this.showLabDropdown =
          this.filteredLabs.length > 0;

        console.log(
          'LATEST FRANCHISES FROM BACKEND:',
          this.labs
        );

        console.log(
          'SEARCHED LAB:',
          q
        );

        console.log(
          'FILTERED LABS:',
          this.filteredLabs
        );
      },

      error: (err: any) => {
        console.error(
          'GET LATEST FRANCHISES ERROR:',
          err
        );

        this.filteredLabs = [];
        this.showLabDropdown = false;
      }
    });
  }

  searchStaffLabInput() {
    if (this.isStaffRole) {
      return;
    }

    const q = String(this.staffLabSearch || '').trim().toLowerCase();

    // ✅ FIX: फक्त staff-lab selection reset, Collection Center la touch नाही
    this.selectedStaffLab = null;
    this.patient.lab = this.staffLabSearch;

    if (!q) {
      this.filteredStaffLabs = [];
      this.showStaffLabDropdown = false;
      return;
    }
    this.labApi.getFranchiseLabs().subscribe({
      next: (res: any) => {
        console.log('RAW RESPONSE:', res);

        const list = Array.isArray(res) ? res : (res?.content || []);

        const mapped = list.map((l: any) => ({
          id: l.franchiseLabId,
          franchiseLabId: l.franchiseLabId,
          franchiseName: l.labName,
          name: l.labName,
          centerCode: '',
          additionalDetails: l.additionalDetails || ''
        }));

        this.filteredStaffLabs = mapped.filter((l: any) =>
          String(l?.franchiseName || l?.name || '').toLowerCase().includes(q)
        );

        this.showStaffLabDropdown = this.filteredStaffLabs.length > 0;
      },
      error: () => {
        this.filteredStaffLabs = [];
        this.showStaffLabDropdown = false;
      },
    });
  }
  selectStaffLabFromPicker(lab: any) {
    // ✅ FIX: selectLab() नाही, selectStaffLab() वापर
    this.selectStaffLab(lab);
    this.showStaffLabDropdown = false;
  }

  onCustomFranchiseInput(
    event?: any
  ): void {

    if (
      event?.detail?.value !==
      undefined
    ) {

      this.customFranchiseName =
        String(
          event.detail.value ||
          ''
        );
    }
  }

  openAddLabModal() {

    if (
      this.isStaffRole
    ) {
      return;
    }

    this.newLab = {

      name: '',

      contact: '',

      address: ''
    };

    this.showAddLabModal =
      true;
  }

  isSavingLab = false;

  saveLab() {

    const labName = String(this.newLab?.name || '').trim();

    if (!labName) {
      this.toastService.error(
        'Validation Error',
        'Please enter lab name.'
      );
      return;
    }

    const labContact = String(this.newLab?.contact || '').trim();

    if (labContact && !/^\d{10}$/.test(labContact)) {
      this.toastService.error(
        'Validation Error',
        'Lab contact number must be exactly 10 digits.'
      );
      return;
    }

    if (this.isSavingLab) {
      return;
    }

    this.isSavingLab = true;

    const payload = {
      labName: labName,
      ownerName: null,
      mobileNumber: this.newLab.contact
        ? Number(this.newLab.contact)
        : null,
      whatsappNumber: null,
      additionalDetails: String(this.newLab?.address || '').trim() || null
    };

    this.labApi.createFranchiseLab(payload).subscribe({
      next: (res: any) => {
        this.isSavingLab = false;

        const newFranchiseLab = {
          id: res?.franchiseLabId,
          franchiseId: res?.franchiseLabId,
          franchiseName: res?.labName || labName,
          name: res?.labName || labName,
          centerCode: '',
          additionalDetails: res?.additionalDetails || this.newLab?.address || ''
        };

        // ✅ Naveen lab फक्त staff-lab list madhe add — Collection
        // Center cha this.labs/filteredLabs/selectedLab/labSearch
        // touch नाही.
        this.filteredStaffLabs = [newFranchiseLab, ...this.filteredStaffLabs];

        this.selectStaffLab(newFranchiseLab);

        this.showAddLabModal = false;

        this.toastService.success(
          'Lab Added',
          newFranchiseLab.franchiseName + ' added successfully.'
        );

        // Background madhe latest labs sync kara (company web var
        // add kelele labs pan yenar text kelyavar).
        this.refreshFranchiseLabsInBackground();
      },
      error: (err: any) => {
        this.isSavingLab = false;
        console.error('CREATE LAB ERROR:', err);
        const message = err?.error?.message || err?.error?.error || 'Failed to add lab.';
        this.toastService.error('Error', message);
      }
    });
  }

  private refreshFranchiseLabsInBackground(): void {
    this.labApi.getFranchiseLabs().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.content || []);
        const mapped = list.map((l: any) => ({
          id: l.franchiseLabId,
          franchiseLabId: l.franchiseLabId,
          franchiseName: l.labName,
          name: l.labName,
          centerCode: ''
        }));
        // ✅ FIX: फक्त filteredStaffLabs
        this.filteredStaffLabs = mapped;
      },
      error: () => { }
    });
  }
  toggleLabDropdown() {

    if (
      this.isStaffRole
    ) {
      return;
    }

    this.filteredLabs =
      [
        ...this.labs
      ];

    this.showLabDropdown =
      !this.showLabDropdown;
  }

  onLabSearchFocus() {

    this.filteredLabs =
      [
        ...this.labs
      ];

    this.showLabDropdown =
      true;
  }

  selectLabFromPicker(lab: any): void {
    if (!lab) {
      return;
    }

    this.selectLab(lab);

    const labName = String(
      lab?.labName ||
      lab?.franchiseName ||
      lab?.name ||
      ''
    ).trim();

    // Textbox clear करू नका.
    // Selected lab चा name textbox मध्ये राहील.
    this.labSearch = labName;

    this.patient.lab = labName;

    this.selectedLab = lab;

    this.showLabDropdown = false;

    console.log(
      'SELECTED LAB:',
      lab
    );

    this.loadTests();

    // ✅ Collection center badalla ki current test/package search
    // franchise-specific price sobat refresh vhaycha.
    if (this.testSearch.trim()) this.searchTest();
    if (this.packageSearch.trim()) this.searchPackage();
  }

  // ============================================================
  // LAST PATIENT
  // ============================================================

  loadLastPatient() {

    const labId =
      this.labApi.getCurrentLabId();

    const currentUserId =
      (
        this.authService
          .currentUserValue as any
      )?.raw?.id;

    const today =
      new Date();

    const toDateExclusive =
      this.formatDateParam(
        this.addDays(
          today,
          1
        )
      );

    const fromDate =
      this.formatDateParam(
        this.addDays(
          today,
          -60
        )
      );

    this.labApi
      .getBookingStatusNew(
        labId,
        0,
        500,
        fromDate,
        toDateExclusive
      )
      .subscribe({

        next: (res: any) => {

          let list =
            res?.content ||
            res ||
            [];

          list =
            Array.isArray(list)
              ? list
              : [];

          if (
            this.role !==
            this.ROLE_LAB_ADMIN &&
            currentUserId
          ) {

            list =
              list.filter(
                (b: any) =>
                  b.createdBy ===
                  currentUserId
              );
          }

          list.sort(
            (a: any, b: any) =>
              (
                b.createdOn ||
                0
              ) -
              (
                a.createdOn ||
                0
              )
          );

          const last =
            list[0];

          this.lastPatient =
            last?.customerName ??
            '—';

          const uhid =
            last?.uhidNumber ??
            last?.uhid ??
            last?.UHID ??
            '';

          this.patientRelation =
            uhid
              ? 'self/' + uhid
              : 'self/ILS3505';
        },

        error: () => {

          this.lastPatient =
            '—';

          this.patientRelation =
            'self/ILS3505';
        }
      });
  }

  private formatDateParam(
    d: Date
  ): string {

    return (
      d.getFullYear() +
      '-' +
      String(
        d.getMonth() + 1
      ).padStart(
        2,
        '0'
      ) +
      '-' +
      String(
        d.getDate()
      ).padStart(
        2,
        '0'
      )
    );
  }

  private addDays(
    d: Date,
    days: number
  ): Date {

    const copy =
      new Date(d);

    copy.setDate(
      copy.getDate() +
      days
    );

    return copy;
  }

  // ============================================================
  // TESTS
  // ============================================================

  loadTests() {

    const franchiseId =
      this.selectedLab?.franchiseId ??
      this.selectedLab?.id ??
      undefined;

    this.labApi.getTests(franchiseId).subscribe({
      next: (res: any) => {
        const apiTests = res || [];

        this.allTests = (Array.isArray(apiTests) ? apiTests : []).map((t: any) => ({
          id: t.testId,
          sampleId: t.sample_type,
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
      error: () => {
        this.toastService.error('Error', 'Failed to load tests from server.');
      }
    });
  }

  private testSearchTimer: any = null;

  searchTest(): void {
    const q = String(this.testSearch || '').trim();

    if (this.testSearchTimer) {
      clearTimeout(this.testSearchTimer);
    }

    if (!q) {
      this.filteredTests = [];
      this.showSuggestions = false;
      return;
    }

    this.testSearchTimer = setTimeout(() => {

      const labId = this.labApi.getCurrentLabId();

      const franchiseId =
        this.selectedLab?.franchiseId ??
        this.selectedLab?.id ??
        undefined;

      this.labApi.searchTests(labId, franchiseId, q).subscribe({
        next: (res: any) => {

          const list = Array.isArray(res?.content) ? res.content : [];

          this.filteredTests = list
            .filter((t: any) =>
              !this.selectedTests.some(
                (s: any) => s.name === String(t.test_name || '').trim()
              )
            )
            .map((t: any) => ({
              id: t.testId,
              sampleId: t.sample_type,
              name: String(t.test_name || 'Unnamed Test').trim(),

              b2b: this.isAdminRole
                ? (t.price2 ?? 0)
                : (t.assignedPrice ?? t.price2 ?? 0),

              tat: t.tat || 'N/A',
              mrp: t.test_price ?? 0,
              dis: 0,
              fluid: t.sampleTypeName || 'N/A',
              sampleType: t.sampleTypeName || 'OTHER',
              color: t.sampleColor || '#a855f7'
            }));

          this.showSuggestions = this.filteredTests.length > 0;
        },
        error: () => {
          this.filteredTests = [];
          this.showSuggestions = false;
        }
      });

    }, 250);
  }

  // ============================================================
  // BARCODE GENERATION
  //
  // Company web app auto-generates a random Barcode Id per sample
  // (image 2 reference). We mirror that here: every time a test /
  // package is added, a 10-digit random barcode is generated once
  // and used to seed BOTH:
  //   - barcode         -> the auto/random one (readonly display)
  //   - confirmBarcode  -> the editable "update barcode" value
  //
  // NOTE: confirmBarcode is already what savePatient()/proceedBookingSave()
  // sends to the backend (see `barcode: String(sample?.confirmBarcode || barcode)`
  // in savePatient()), so editing it here already flows into the booking
  // payload with zero extra wiring.
  // ============================================================

  private generateBarcode(): string {
    // 10-digit random numeric barcode, e.g. "0793594204"
    return Math.floor(Math.random() * 10000000000)
      .toString()
      .padStart(10, '0');
  }

  // ============================================================
  // ✅ SAMPLE-TYPE GROUPED BARCODES
  //
  // Company web gives ONE barcode per SAMPLE TYPE (e.g. one for
  // all EDTA tests, one for all SERUM tests) — not one barcode
  // per individual test. Every test that shares a sample type
  // joins the same group and the same barcode; only a brand-new
  // sample type gets a freshly generated barcode.
  //
  // ✅ FIX: addTest() / addPackage() / removeRow() / removeTest()
  // were pushing/filtering selectedSampleTests directly (one entry
  // per TEST) instead of calling these two helpers — that's why 11
  // tests produced 11 separate barcodes instead of grouping by
  // sample type (2 barcodes: EDTA + SERUM), unlike company web.
  // Every add/remove now routes through these two functions only.
  // ============================================================

  private addTestToSampleGroup(test: any): void {

    const sampleId = Number(test?.sampleId || 0);
    const sampleType = String(test?.sampleType || 'OTHER');

    let group = this.selectedSampleTests.find(
      (g: any) => Number(g.sampleId) === sampleId && g.sampleType === sampleType
    );

    if (!group) {

      const generatedBarcode = this.generateBarcode();

      group = {
        sampleId: test?.sampleId,
        sampleType,
        color: test?.color,
        barcode: generatedBarcode,
        confirmBarcode: generatedBarcode,
        testNames: [],
        testIds: []
      };

      this.selectedSampleTests.push(group);
    }

    const testId = Number(test?.id ?? test?.testId ?? 0);

    if (!group.testIds.includes(testId)) {
      group.testIds.push(testId);
      group.testNames.push(test?.name);
    }
  }

  private removeTestFromSampleGroup(test: any): void {

    const testId = Number(test?.id ?? test?.testId ?? 0);

    const group = this.selectedSampleTests.find(
      (g: any) => (g.testIds || []).includes(testId)
    );

    if (!group) {
      return;
    }

    const idx = group.testIds.indexOf(testId);

    if (idx >= 0) {
      group.testIds.splice(idx, 1);
      group.testNames.splice(idx, 1);
    }

    if (group.testIds.length === 0) {
      this.selectedSampleTests = this.selectedSampleTests.filter(
        (g: any) => g !== group
      );
    }
  }

  // ============================================================
  // UPDATE BARCODE (invoice screen)
  //
  // User edits the "Update Barcode" box, taps Save -> the edited
  // value becomes the sample's actual barcode (shown in the
  // "Barcode Id" column too) AND stays as confirmBarcode, which is
  // what savePatient()/proceedBookingSave() already sends to the
  // backend.
  // ============================================================

updateSampleBarcode(sample: any): void {

  const newBarcode = String(sample?.confirmBarcode || '').trim();

  if (!newBarcode) {
    this.toastService.error('Invalid Barcode', 'Please enter a barcode before saving.');
    return;
  }

  const bookingId = Number(this.savedPatient?.id || 0);

  if (!bookingId) {
    this.toastService.error('Update Error', 'Booking not found. Cannot update barcode.');
    return;
  }

  const oldBarcode = String(sample?.barcode || '').trim();

  if (newBarcode === oldBarcode) {
    this.toastService.warning('No Change', 'Barcode is unchanged.');
    return;
  }

  // ✅ याच booking मधल्या दुसऱ्या sample ला हाच barcode आधीच दिलेला नाहीये ना
  const isDuplicateLocally = (this.savedPatient?.sampleTests || []).some(
    (s: any) => s !== sample && String(s?.barcode || '').trim() === newBarcode
  );

  if (isDuplicateLocally) {
    this.toastService.error(
      'Duplicate Barcode',
      'This barcode is already used for another sample in this booking.'
    );
    return;
  }

  const payload = [{
    oldBarcode: oldBarcode,
    updatedBarcode: newBarcode,
    receiveDate: '',
    sampleTypeId: sample?.sampleId,
    bookingId
  }];

  sample.saving = true;

  this.labApi.updateBarcode(bookingId, payload).subscribe({

    next: () => {

      // ✅ FIX: backend कधी कधी duplicate barcode वर पण HTTP 200
      // देतो पण प्रत्यक्षात row update करत नाही (silent no-op).
      // त्यामुळे HTTP success वर आंधळेपणे विश्वास न ठेवता, booking
      // परत fetch करून खरंच नवीन barcode save झालाय का verify करतो.
      this.labApi.getSingleBooking(bookingId).subscribe({

        next: (freshRes: any) => {

          sample.saving = false;

          const freshSamples =
            freshRes?.sampleAccessions ||
            freshRes?.samples ||
            [];

          const matchedFreshSample = freshSamples.find(
            (s: any) =>
              Number(s?.sampleTypeId ?? s?.sampleTypeData?.sample_type_id) === Number(sample?.sampleId)
          );

          const savedBarcode = String(
            matchedFreshSample?.barCode ||
            matchedFreshSample?.barcode ||
            ''
          ).trim();

          if (savedBarcode && savedBarcode === newBarcode) {

            // ✅ खरंच backend मध्ये save झालं
            sample.barcode = newBarcode;
            sample.confirmBarcode = newBarcode;

            this.toastService.success(
              'Barcode Updated',
              'Barcode updated to ' + newBarcode + '.'
            );

          } else {

            // ❌ backend नी silently reject केलं (duplicate barcode
            // दुसऱ्या कुठल्या तरी booking मध्ये आधीच वापरलेला आहे) —
            // UI revert करा, चुकीचा success दाखवू नका.
            sample.confirmBarcode = sample.barcode;

            this.toastService.error(
              'Barcode Already Used',
              'This barcode has already been used elsewhere. Please enter a different barcode.'
            );
          }
        },

        error: () => {
          sample.saving = false;

          // Verify call fail झाली तरी update झालं असण्याची शक्यता आहे,
          // पण खात्री नाही म्हणून optimistic success न दाखवता warn करा.
          this.toastService.warning(
            'Please Verify',
            'Barcode update sent, but could not confirm. Please refresh and check.'
          );
        }
      });
    },

    error: (err: any) => {

      sample.saving = false;

      console.error('UPDATE BARCODE ERROR:', err);

      const message = String(
        err?.error?.message || err?.error?.error || ''
      ).toLowerCase();

      const isDuplicateOnServer =
        message.includes('barcode') &&
        (message.includes('already') || message.includes('exist') || message.includes('duplicate') || message.includes('used'));

      if (isDuplicateOnServer) {
        this.toastService.error(
          'Barcode Already Used',
          'This barcode has already been used elsewhere. Please enter a different barcode.'
        );
        return;
      }

      this.toastService.error(
        'Update Error',
        err?.error?.message || err?.error?.error || 'Failed to update barcode on server.'
      );
    }
  });
}

  addTest(
    test: any
  ) {

    const exists =
      this.selectedTests.find(
        (t: any) =>
          t.name ===
          test.name
      );

    if (!exists) {

      this.selectedTests.push(
        test
      );

      // ✅ FIX: group by sample type instead of pushing a fresh
      // barcode entry per test.
      this.addTestToSampleGroup(test);

      this.toastService.success(
        'Test Added',
        test.name +
        ' added to bill.'
      );

      this.calculateBilling();

    } else {

      this.toastService.warning(
        'Already Added',
        test.name +
        ' already exists.'
      );
    }

    this.testSearch =
      '';

    this.showSuggestions =
      false;
  }

  // ============================================================
  // PACKAGES / PROFILES (test bundles)
  // ============================================================

  loadPackages(): void {

    const labId =
      this.labApi.getCurrentLabId();

    const franchiseId =
      this.selectedLab?.franchiseId ??
      this.selectedLab?.id ??
      undefined;

    this.labApi.getProfiles(labId, franchiseId).subscribe({

      next: (res: any) => {

        const list =
          Array.isArray(res)
            ? res
            : (
              res?.content ||
              res?.data ||
              []
            );

        this.allPackages =
          Array.isArray(list)
            ? list
            : [];

        console.log(
          'LOADED PACKAGES:',
          this.allPackages
        );
      },

      error: (err: any) => {

        console.error(
          'LOAD PACKAGES ERROR:',
          err
        );

        this.toastService.error(
          'Error',
          'Failed to load packages.'
        );
      }
    });
  }

  private packageSearchTimer: any = null;

  searchPackage(): void {
    const q = String(this.packageSearch || '').trim();

    if (this.packageSearchTimer) {
      clearTimeout(this.packageSearchTimer);
    }

    if (!q) {
      this.filteredPackages = [];
      this.showPackageSuggestions = false;
      return;
    }

    this.packageSearchTimer = setTimeout(() => {

      const labId = this.labApi.getCurrentLabId();

      const franchiseId =
        this.selectedLab?.franchiseId ??
        this.selectedLab?.id ??
        undefined;

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

  // ============================================================
  // ✅ PACKAGE PREVIEW (eye icon click -> shows bundled tests)
  // ============================================================

addPackage(pkg: any): void {

    const packageName = String(
      pkg?.profileName ||
      pkg?.profile_name ||
      pkg?.name ||
      'Package'
    );

    const packageTests: any[] =
      pkg?.withTest ||
      pkg?.tests ||
      pkg?.testList ||
      pkg?.profileTests ||
      [];

    if (!Array.isArray(packageTests) || packageTests.length === 0) {
      this.toastService.warning('Empty Package', 'No tests found inside this package.');
      this.packageSearch = '';
      this.showPackageSuggestions = false;
      return;
    }

    let addedCount = 0;
    const matchedTestsForPreview: any[] = [];

    packageTests.forEach((pt: any) => {

      const testId = Number(
        pt?.testId ?? pt?.test_id ?? pt?.masterTestId ?? pt?.testMasterId ??
        pt?.test?.testId ?? pt?.test?.id ?? pt?.id ?? 0
      );

      let test = this.allTests.find((t: any) => Number(t.id) === testId);

      if (!test) {

        // ✅ FIX: testId `allTests` (getTests() cha active/franchise
        // list) madhe sapadla nahi (bahuteka inactive/deleted test —
        // profile-list.page.ts madhe same testId sathi confirm zalay,
        // e.g. testId 46951 "LIVER FUNCTION TESTS") mhanun aadhi ithe
        // silently `return` hot hote ani to test bill madhe kadhach
        // yet navhta (count ani names donhi kami distayche, exactly
        // profile-list.page.ts sarkhach issue, pan ithe patient cha
        // bill madhe). Pan raw package item (`pt`) madheच
        // testName/price/tat/sampleType aadhichach astat, tyamule to
        // drop na karता, ekach synthetic test object banवून pudhe
        // vaparaycha — barobar tyachach pattern jasa
        // profile-list.page.ts madhe fallback lावlay.
        const fallbackName = String(
          pt?.testName ?? pt?.test_name ?? ''
        ).trim();

        if (!fallbackName) {
          console.warn('PACKAGE TEST NOT MATCHED IN allTests (no fallback name available, skipping):', pt);
          return;
        }

        const fallbackSampleType = String(
          pt?.sampleTypeName ?? pt?.sample_type_name ?? pt?.sampleType
          ?? (typeof pt?.sample_type === 'string' ? pt.sample_type : '') ?? 'OTHER'
        ).trim().toUpperCase() || 'OTHER';

        test = {
          id: testId,
          sampleId: pt?.sampleTypeId ?? pt?.sample_type ?? 0,
          name: fallbackName,
          b2b: Number(pt?.price2 ?? pt?.b2b ?? pt?.assignedPrice ?? 0),
          tat: String(pt?.tat ?? 'N/A'),
          mrp: Number(pt?.test_price ?? pt?.mrp ?? 0),
          dis: 0,
          fluid: fallbackSampleType,
          sampleType: fallbackSampleType,
          color: pt?.sampleColor ?? '#a855f7'
        };

        console.warn(
          `PACKAGE TEST NOT MATCHED IN allTests — using fallback name "${fallbackName}" from raw item:`,
          pt
        );
      }

      matchedTestsForPreview.push({
        name: test.name,
        tat: test.tat,
        mrp: test.mrp,
        isAdditional: !!(pt?.additionalPrice || pt?.isAdditional || pt?.extra)
      });

      const exists = this.selectedTests.find((t: any) => t.name === test.name);
      if (exists) {
        return;
      }

      this.selectedTests.push({ ...test, packageName });

      // ✅ FIX: group by sample type instead of pushing a fresh
      // barcode entry per test.
      this.addTestToSampleGroup(test);

      addedCount++;
    });

    const existingPkg = this.selectedPackages.find(
      (p: any) => p.profileName === packageName
    );

    if (!existingPkg) {
      this.selectedPackages.push({
        profileName: packageName,
        b2b: pkg?.profileAssignedPrice ?? 0,
        mrp: pkg?.mrp ?? pkg?.total_amount ?? 0,
        tests: matchedTestsForPreview
      });
    }

    this.calculateBilling();

    if (addedCount > 0) {
      this.toastService.success('Package Added', `${addedCount} test(s) from "${packageName}" added.`);
    } else {
      this.toastService.warning('Already Added', `All tests from "${packageName}" already exist in bill.`);
    }

    this.packageSearch = '';
    this.showPackageSuggestions = false;
  }
openPackagePreview(pkg: any): void {
    this.activePackageForPreview = pkg;
    this.showPackageTestsModal = true;
  }

removeRow(index: number): void {

    const individualTests = this.selectedTests.filter((t: any) => !t.packageName);
    const individualCount = individualTests.length;

    if (index < individualCount) {

      const test = individualTests[index];

      this.selectedTests = this.selectedTests.filter((t: any) => t !== test);

      // ✅ FIX: remove this ONE test from its sample-type group
      // instead of clearing the whole group by name.
      this.removeTestFromSampleGroup(test);

      this.toastService.warning('Test Removed', test.name + ' removed from bill.');

    } else {

      const pkgIndex = index - individualCount;
      const pkg = this.selectedPackages[pkgIndex];

      if (!pkg) {
        return;
      }

      const pkgTestNames: string[] = (pkg?.tests || []).map((t: any) => t.name);

      // Capture the actual test objects (with id) before filtering
      // them out of selectedTests, so we can update the barcode
      // groups correctly for each removed test.
      const removedTests = this.selectedTests.filter(
        (t: any) => pkgTestNames.includes(t.name)
      );

      this.selectedTests = this.selectedTests.filter(
        (t: any) => !pkgTestNames.includes(t.name)
      );

      removedTests.forEach((t: any) => this.removeTestFromSampleGroup(t));

      this.selectedPackages.splice(pkgIndex, 1);

      this.toastService.warning('Package Removed', (pkg?.profileName || 'Package') + ' removed from bill.');
    }

    this.calculateBilling();
  }

  async removeTest(
    index: number
  ) {

    const test =
      this.selectedTests[
      index
      ];

    const alert =
      await this.alertController.create({

        cssClass:
          'premium-alert',

        header:
          'Remove Test',

        message:
          `Are you sure you want to remove "${test.name}"?`,

        buttons: [

          {
            text: 'No',
            role: 'cancel',
            cssClass: 'alert-btn-cancel'
          },

          {

            text: 'Yes',

            cssClass: 'alert-btn-danger',

            handler: () => {

              // ✅ FIX: AlertController buttons run OUTSIDE Angular's
              // zone. Without ngZone.run(), splicing the array actually
              // changes the data, but Angular never re-renders the
              // view — so the row stays visible even though it's
              // logically deleted. Wrapping forces change detection.
              this.ngZone.run(() => {

                this.selectedTests.splice(
                  index,
                  1
                );

                // ✅ FIX: remove this ONE test from its sample-type
                // group instead of clearing the whole group by name.
                this.removeTestFromSampleGroup(test);

                this.toastService.warning(
                  'Test Removed',
                  test.name +
                  ' removed from bill.'
                );

                this.calculateBilling();
              });
            }
          }
        ]
      });

    await alert.present();
  }
getSubTotal() {

    const individualTotal = this.selectedTests
      .filter((t: any) => !t.packageName)
      .reduce((sum: number, t: any) => sum + Number(t?.b2b || 0), 0);

    const packageTotal = this.selectedPackages
      .reduce((sum: number, p: any) => sum + Number(p?.b2b || 0), 0);

    return individualTotal + packageTotal;
  }

  // ============================================================
  // BILLING
  // ============================================================
  get isCashEditable(): boolean {
    return this.canEditPayment && this.billing.paymentMode === 'cash';
  }

  get isUpiEditable(): boolean {
    return this.canEditPayment && this.billing.paymentMode === 'upi';
  }

  calculateBilling() {

    const subTotal =
      this.getSubTotal();

    this.billing.discountAmount =
      this.billing.discountType ===
        'percent'

        ? Math.round(
          (
            subTotal *
            (
              this.billing
                .discountValue ||
              0
            )
          ) /
          100
        )

        : (
          this.billing
            .discountValue ||
          0
        );

    this.billing.grandTotal =
      Math.max(
        0,
        subTotal -
        this.billing
          .discountAmount
      );

    if (this.billing.paymentMode === 'cash') {

      this.billing.cashAmount =
        this.billing.grandTotal;

      this.billing.upiAmount = 0;

    } else {

      this.billing.upiAmount =
        this.billing.grandTotal;

      this.billing.cashAmount = 0;
    }

    this.updatePaidAndDue();
  }

  private updatePaidAndDue(): void {

    this.billing.paidAmount =
      this.billing.paymentMode ===
        'cash'
        ? (
          this.billing.cashAmount ||
          0
        )
        : (
          this.billing.upiAmount ||
          0
        );

    this.billing.dueAmount =
      Math.max(
        0,
        this.billing.grandTotal -
        (
          this.billing
            .paidAmount ||
          0
        )
      );
  }

  onPaymentAmountInput(): void {
    this.updatePaidAndDue();
  }

  onPaymentModeChange(): void {

    // Mode switch झाल्यावर active box मध्ये Grand Total auto-fill,
    // दुसरा box 0.
    this.billing.cashAmount =
      this.billing.paymentMode === 'cash'
        ? this.billing.grandTotal
        : 0;

    this.billing.upiAmount =
      this.billing.paymentMode === 'upi'
        ? this.billing.grandTotal
        : 0;

    this.updatePaidAndDue();
  }

  resetBilling() {

    this.billing = {

      discountType:
        'percent',

      discountValue:
        0,

      discountAmount:
        0,

      grandTotal:
        0,

      paymentMode:
        'cash',

      cashAmount:
        0,

      upiAmount:
        0,

      paidAmount:
        0,

      dueAmount:
        0,

      transactionId:
        '',

      discountFromDoctor:
        null
    };
  }
  // ============================================================
  // FILE
  // ============================================================

  triggerFileInput() {

    (
      document.getElementById(
        'fileInput'
      ) as HTMLInputElement
    )?.click();
  }

  onFileSelected(
    event: any
  ) {

    const file =
      event.target.files[0];

    if (!file) {
      return;
    }

    if (
      file.size >
      5 *
      1024 *
      1024
    ) {

      this.toastService.error(
        'File Too Large',
        'Please select file under 5MB.'
      );

      return;
    }

    this.selectedFileName =
      file.name;

    const reader =
      new FileReader();

    reader.onload =
      (e: any) => {

        this.selectedFileBase64 =
          e.target.result;

        this.toastService.success(
          'File Added',
          file.name +
          ' added successfully.'
        );
      };

    reader.readAsDataURL(
      file
    );
  }

  removeFile() {

    this.selectedFileName =
      '';

    this.selectedFileBase64 =
      '';

    const fileInput =
      document.getElementById(
        'fileInput'
      ) as HTMLInputElement;

    if (fileInput) {

      fileInput.value =
        '';
    }

    this.toastService.warning(
      'File Removed',
      'File has been removed.'
    );
  }

  // ============================================================
  // RESET FORM
  // ============================================================

  resetForm() {

    this.patient = {

      title: 'mr',

      name: '',

      age: '',

      ageType: 'years',

      gender: 'male',

      doctorTitle: 'dr',

      doctor: '',

      doctorId: null,

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

    // ✅ Field-level red-border errors reset karाycha, nahitar
    // reset form नंतर पण जुने errors dikhat rahtil.
    this.resetFieldErrors();

    this.selectedTests =
      [];

    this.selectedSampleTests =
      [];

    this.selectedPackages =
      [];

    this.testSearch =
      '';

    this.filteredTests =
      [];

    this.packageSearch =
      '';

    this.filteredPackages =
      [];

    this.showPackageSuggestions =
      false;

    this.selectedFileName =
      '';

    this.selectedFileBase64 =
      '';

    this.showSuggestions =
      false;

    this.selectedDoctor =
      null;

    this.doctorSearch =
      '';

    this.filteredDoctors =
      [];

    this.showDoctorSuggestions =
      false;

    this.selectedLab =
      null;

    this.customFranchiseName =
      '';

    this.labSearch =
      '';

    this.showLabDropdown =
      false;

    this.showAddLabModal =
      false;

    this.staffLabSearch =
      '';

    this.filteredStaffLabs =
      [];

    this.showStaffLabDropdown =
      false;

    this.resetBilling();

    this.loadDoctors();

    this.loadLabs();

    this.loadLastPatient();
  }

  // ============================================================
  // RESET AFTER BOOKING
  //
  // Keeps selected doctor + collection center + custom franchise
  // ============================================================

  resetFormKeepingDoctorAndFranchise() {

    this.patient.name =
      '';

    this.patient.age =
      '';

    this.patient.phone =
      '';

    this.patient.aadhaar =
      '';

    this.patient.address =
      '';

    this.patient.uhid =
      '';

    this.patient.history =
      '';

    this.patient.otherCharges =
      0;

    this.patient.eReport =
      false;

    this.patient.clinical =
      false;

    this.patient.file =
      false;

    this.patient.homeCollection =
      false;

    // ✅ Field-level red-border errors reset karाycha next booking
    // suरू करताना.
    this.resetFieldErrors();

    this.selectedTests =
      [];

    this.selectedSampleTests =
      [];

    this.selectedPackages =
      [];

    this.testSearch =
      '';

    this.filteredTests =
      [];

    this.packageSearch =
      '';

    this.filteredPackages =
      [];

    this.showPackageSuggestions =
      false;

    this.selectedFileName =
      '';

    this.selectedFileBase64 =
      '';

    this.resetBilling();

    // Doctor, doctorSearch, doctorId,
    // selectedLab, patient.lab,
    // customFranchiseName
    // intentionally remain unchanged.
  }

  // ============================================================
  // ✅ VALIDATION (industry-style form validation)
  //
  // RULES:
  //  - REQUIRED (must be filled, always checked):
  //      • Patient Full Name
  //      • Age
  //      • Ref. Doctor (selected or typed)
  //      • Mobile Number
  //      • At least 1 Test selected
  //
  //  - OPTIONAL (fine to leave blank — but if the user DOES fill
  //    it in, the value must match the correct format/length for
  //    that field type):
  //      • Aadhaar Number -> exactly 12 digits, numeric only
  //      • UHID           -> 2-30 chars (letters/numbers/-//)
  //      • Address        -> max 200 chars
  //      • Clinical History -> max 500 chars
  //      • Other Charges  -> valid non-negative number
  //      • Custom Franchise (Admin) -> max 60 chars
  //
  // Every failing field also flips its `fieldErrors.xxx` flag to
  // `true` so the matching input gets a red border in the HTML.
  // All flags are reset at the very start of every validation run.
  //
  // Returns the first validation error message found, or null if
  // the form is valid.
  // ============================================================

  private validatePatientForm(): string | null {

    // ✅ Sagle field-level errors reset karा suरुवातीला
    this.resetFieldErrors();

    // ---------- Patient Name (REQUIRED) ----------
    const name = String(this.patient?.name || '').trim();

    if (!name) {
      this.fieldErrors.name = true;
      return 'Please enter patient full name.';
    }

    if (!/^[A-Za-z][A-Za-z\s.]{1,59}$/.test(name)) {
      this.fieldErrors.name = true;
      return 'Patient name should contain only letters and be 2-60 characters long.';
    }

    // ---------- Age (REQUIRED) ----------
    const ageRaw = String(this.patient?.age ?? '').trim();

    if (!ageRaw) {
      this.fieldErrors.age = true;
      return 'Please enter patient age.';
    }

    if (!/^\d+$/.test(ageRaw)) {
      this.fieldErrors.age = true;
      return 'Age must contain numbers only.';
    }

    const ageNum = Number(ageRaw);
    const ageType = this.patient?.ageType || 'years';

    if (ageType === 'years' && (ageNum < 1 || ageNum > 120)) {
      this.fieldErrors.age = true;
      return 'Age (in years) must be between 1 and 120.';
    }

    if (ageType === 'months' && (ageNum < 1 || ageNum > 11)) {
      this.fieldErrors.age = true;
      return 'Age (in months) must be between 1 and 11.';
    }

    if (ageType === 'days' && (ageNum < 1 || ageNum > 31)) {
      this.fieldErrors.age = true;
      return 'Age (in days) must be between 1 and 31.';
    }

    // ---------- Ref. Doctor (REQUIRED) ----------
    const doctorTyped = String(
      this.doctorSearch || this.patient?.doctor || ''
    ).trim();

    if (!doctorTyped) {
      this.fieldErrors.doctor = true;
      return 'Please select or enter Ref. Doctor name.';
    }

    if (!/^[A-Za-z][A-Za-z\s.]{1,59}$/.test(doctorTyped)) {
      this.fieldErrors.doctor = true;
      return 'Doctor name should contain only letters and be 2-60 characters long.';
    }

    // ---------- Mobile Number (REQUIRED) ----------
    const mobile = String(this.patient?.phone || '').trim();

    if (!mobile) {
      this.fieldErrors.mobile = true;
      return 'Please enter mobile number.';
    }

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      this.fieldErrors.mobile = true;
      return 'Mobile number must be exactly 10 digits and start with 6-9.';
    }

    // ---------- Aadhaar Number (OPTIONAL, format checked if filled) ----------
    const aadhaar = String(this.patient?.aadhaar || '').trim();

    if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
      this.fieldErrors.aadhaar = true;
      return 'Aadhaar number must be exactly 12 digits.';
    }

    // ---------- UHID (OPTIONAL, format checked if filled) ----------
    const uhid = String(this.patient?.uhid || '').trim();

    if (uhid && !/^[A-Za-z0-9\-\/]{2,30}$/.test(uhid)) {
      this.fieldErrors.uhid = true;
      return 'UHID should be 2-30 characters (letters, numbers, - or / only).';
    }

    // ---------- Address (OPTIONAL, length checked if filled) ----------
    const address = String(this.patient?.address || '').trim();

    if (address && address.length > 200) {
      this.fieldErrors.address = true;
      return 'Address should not exceed 200 characters.';
    }

    // ---------- Clinical History (OPTIONAL, length checked if filled) ----------
    const history = String(this.patient?.history || '').trim();

    if (history && history.length > 500) {
      this.fieldErrors.history = true;
      return 'Clinical history should not exceed 500 characters.';
    }

    // ---------- Other Charges (OPTIONAL, valid number if filled) ----------
    const otherChargesRaw = this.patient?.otherCharges;

    if (
      otherChargesRaw !== null &&
      otherChargesRaw !== undefined &&
      String(otherChargesRaw).trim() !== '' &&
      Number(otherChargesRaw) !== 0
    ) {
      if (isNaN(Number(otherChargesRaw)) || Number(otherChargesRaw) < 0) {
        this.fieldErrors.otherCharges = true;
        return 'Other charges must be a valid positive number.';
      }
    }

    // ---------- Custom Franchise (Admin only, OPTIONAL) ----------
    if (this.isAdminRole) {

      const customFranchise = String(
        this.customFranchiseName || ''
      ).trim();

      if (customFranchise && customFranchise.length > 60) {
        this.fieldErrors.customFranchise = true;
        return 'Custom franchise name should not exceed 60 characters.';
      }
    }

    // ---------- Tests (REQUIRED — at least 1) ----------
    if (!this.selectedTests || this.selectedTests.length === 0) {
      this.fieldErrors.tests = true;
      return 'Please select at least one test.';
    }

    return null;
  }

  // ============================================================
  // SAVE PATIENT / BOOKING
  // ============================================================

  savePatient(): void {

    // ============================================================
    // ✅ CENTRALIZED VALIDATION (industry-style)
    // Required fields are always checked. Optional fields are only
    // checked for correct format/length WHEN the user has filled
    // them in — leaving them blank is fine. Whichever field fails
    // first also gets `fieldErrors.xxx = true`, which the HTML
    // uses to show a red border on that input.
    // ============================================================
    const validationError = this.validatePatientForm();

    if (validationError) {
      this.toastService.error('Validation Error', validationError);
      return;
    }

    const patientName = String(this.patient?.name || '').trim();

    const selectedDoctorId = Number(
      this.selectedDoctor?.doctorid ??
      this.selectedDoctor?.doctorId ??
      this.selectedDoctor?.id ??
      this.selectedDoctor?.doctor_id ??
      this.patient?.doctorId ??
      0
    );

    const customDoctorName = String(
      this.selectedDoctor
        ? ''
        : this.doctorSearch || this.patient?.doctor || ''
    ).trim();

    const hasExistingDoctor = selectedDoctorId > 0;
    const hasCustomDoctor = customDoctorName.length > 0;

    const selfDoctor = (this.doctors || []).find((doctor: any) => {
      const name = String(
        doctor?.doctor_name ||
        doctor?.doctorName ||
        doctor?.name ||
        ''
      ).trim().toLowerCase();

      return name === 'self' || name === 'self doctor';
    });

    const selfDoctorId = Number(
      selfDoctor?.doctorid ??
      selfDoctor?.doctorId ??
      selfDoctor?.id ??
      selfDoctor?.doctor_id ??
      0
    );

    const finalDoctorId = hasExistingDoctor
      ? selectedDoctorId
      : selfDoctorId > 0
        ? selfDoctorId
        : 3916;

    if (!hasExistingDoctor && !hasCustomDoctor) {
      this.fieldErrors.doctor = true;
      this.toastService.error(
        'Validation Error',
        'Please select or enter doctor.'
      );
      return;
    }

    if (!finalDoctorId || finalDoctorId <= 0) {
      this.fieldErrors.doctor = true;
      this.toastService.error(
        'Doctor Error',
        'Doctor is required please reload or select doctor.'
      );
      return;
    }

    const selectedFranchiseId = Number(
      this.selectedLab?.franchiseId ??
      this.selectedLab?.id ??
      0
    );

    const franchiseId = selectedFranchiseId;

    // ✅ FIX: Admin cha "Custom Franchise" input, ani staff/franchise-staff
    // cha LAB/HOS typed/selected lab — donhi sathi backend cha same
    // customFranchiseLab / customFranchiseLabId fields vaparto.
    const customFranchiseLab = this.isAdminRole
      ? String(this.customFranchiseName || '').trim()
      : String(this.patient?.lab || '').trim();

    const customFranchiseLabId = this.isAdminRole
      ? ''
      : String(
        this.selectedStaffLab?.franchiseLabId ??
        this.selectedStaffLab?.id ??
        ''
      );

    if (!franchiseId || franchiseId <= 0) {
      this.toastService.error(
        'Validation Error',
        'Please select a collection center / franchise from the dropdown.'
      );
      return;
    }

    const tests = this.selectedTests.map((t: any) => {
      const testId = Number(
        t?.id ??
        t?.testId ??
        0
      );

      // ✅ FIX: selectedSampleTests entries are now sample-type
      // GROUPS holding a `testIds` array (not a single `testId`),
      // so we look up the group that contains this test's id.
      const sample = this.selectedSampleTests.find(
        (s: any) => Array.isArray(s?.testIds) && s.testIds.includes(testId)
      );

      const barcode = String(
        sample?.barcode || ''
      ).trim();

      const testName = String(
        t?.name ??
        t?.test_name ??
        'NA'
      ).trim();

      const testMrp = Number(
        t?.mrp ??
        t?.test_mrp ??
        t?.price ??
        0
      );

      // ✅ FIX: t.b2b (API cha price2 field, actual selling price)
      // sagalya pahile check karaycha — nahitar fallback chain
      // seedha t?.mrp (raw MRP 400) var yeun padte, karan
      // t?.price / t?.test_price he fields loadTests() madhe
      // set hotach nahiyet.
      const testPrice = Number(
        t?.b2b ??
        t?.price ??
        t?.test_price ??
        t?.mrp ??
        0
      );

      const assignedPrice = Number(
        t?.assignedPrice ??
        testPrice
      );

      const sampleId = Number(
        sample?.sampleId ??
        t?.sampleId ??
        0
      );

      const sampleName = String(
        sample?.sampleType ??
        t?.sampleType ??
        'OTHER'
      ).trim();

      const sampleColor = String(
        sample?.color ??
        t?.color ??
        ''
      );

      return {
        testId,
        test_name: testName,
        test_mrp: testMrp,
        test_price: testPrice,
        selectedFluids: [],
        selectedFluid: 0,
        sampleId,
        sampleName,
        sampleColor,
        barcode,
        confirmBarcode: String(
          sample?.confirmBarcode || barcode
        ).trim(),
        assignedPrice,
        source: t?.source || 'RPL',
        outSourceLocations: t?.outSourceLocations ?? null,
        discount: Number(t?.discount || 0),
        tat: String(t?.tat ?? 'N/A'),
        testPrice,
        // ✅ FIX: Company payload madhe he flags nehmi `false` astat
        // (null nahi). Backend kadhi kadhi strict boolean check
        // karto, tyamule null pathvne ऐवजी false pathvto ahot.
        dob: false,
        height: false,
        weight: false,
        remark: false,
        history: false,
        fluid: false,
        document: false,
        // drawnOnTime he company payload madhe pan null astach —
        // te tasach thevla ahe.
        drawnOnTime: null
      };
    });

    const subTotalAmount = Number(
      this.getSubTotal() || 0
    );

    const totalAmount = Number(
      this.billing?.grandTotal || 0
    );

    const discountAmount = Number(
      this.billing?.discountAmount || 0
    );

    const paidAmount = Number(
      this.billing?.paidAmount || 0
    );

    const dueAmount = Number(
      this.billing?.dueAmount || 0
    );

    const isCashPayment =
      this.billing?.paymentMode === 'cash';

    const isUpiPayment =
      this.billing?.paymentMode === 'upi';

    const payload: any = {
      title: String(
        this.patient?.title || 'mr'
      ).trim(),

      customerName: patientName,

      age: String(
        this.patient?.age ?? ''
      ).trim(),

      ageType: String(
        this.patient?.ageType || 'years'
      ).trim(),

      gender: String(
        this.patient?.gender || 'male'
      ).trim(),

      mobileNumber: String(
        this.patient?.phone || ''
      ).trim(),

      aadhaarNumber: String(
        this.patient?.aadhaar || ''
      ).trim(),

      address: String(
        this.patient?.address || ''
      ).trim(),

      history: String(
        this.patient?.history || ''
      ).trim(),

      uploadDoc: String(
        this.selectedFileBase64 || ''
      ).trim(),

      height: '',
      weight: '',
      urgent: false,

      onlineReport:
        !!this.patient?.eReport,

      homeCollection:
        !!this.patient?.homeCollection,

      membershipNo: '',

      subTotalAmount,

      totalAmount,

      discountAmount,

      paymentCash:
        isCashPayment,

      cashAmount:
        isCashPayment
          ? paidAmount
          : 0,

      paymentUPI:
        isUpiPayment,

      upiAmount:
        isUpiPayment
          ? paidAmount
          : 0,

      paymentOnline:
        false,

      onlineAmount:
        '0',

      paidAmount,

      dueAmount,

      discountedAmount:
        discountAmount,

      discountFrom:
        this.billing?.discountFromDoctor?.doctor_name ||
        this.billing?.discountFromDoctor?.name ||
        '',

      remark: '',

      doctorid:
        finalDoctorId,

      customDoctorName:
        customDoctorName,

      customFranchiseLab:
        customFranchiseLab,

      customFranchiseLabId:
        customFranchiseLabId,
      franchiseId:
        franchiseId,

      paymentTransactionId:
        String(
          this.billing?.transactionId || ''
        ).trim(),

      uhidNumber:
        String(
          this.patient?.uhid || ''
        ).trim(),

      rateListDiscount:
        0,

      drawnOnTime:
        '',

      commissionToDoctor:
        false,

      otherCharges:
        Number(
          this.patient?.otherCharges || 0
        ),

      createdOn:
        new Date().toISOString(),

      tests
    };

    // ✅ FIX: Company backend flat fields sobat ha stringified
    // 'request' field pan expect karto — company web cha payload
    // madhe ha field asto, apla madhe missing hota. Payload complete
    // zalyavarach (sagle fields set zalyavar) generate karaycha, ani
    // he sagle assignments/pushes zalya nantar shevatach karaycha
    // jenekaruna string snapshot flat fields sarkhach rahil.
    payload.request = JSON.stringify(payload);

    console.log(
      'SELECTED DOCTOR:',
      this.selectedDoctor
    );

    console.log(
      'SELECTED DOCTOR ID:',
      selectedDoctorId
    );

    console.log(
      'SELF DOCTOR:',
      selfDoctor
    );

    console.log(
      'SELF DOCTOR ID:',
      selfDoctorId
    );

    console.log(
      'FINAL DOCTOR ID:',
      finalDoctorId
    );

    console.log(
      'CUSTOM DOCTOR NAME:',
      customDoctorName
    );

    console.log(
      'FINAL BOOKING PAYLOAD:',
      JSON.stringify(payload, null, 2)
    );

    this.proceedBookingSave(payload);
  }


  private proceedBookingSave(
    payload: any
  ): void {

    console.log(
      'SENDING CREATE BOOKING BODY:',
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    this.labApi.createBooking(
      payload
    ).subscribe({

      // ==========================================================
      // SUCCESS
      // ==========================================================

      next: (res: any) => {

        console.log(
          'BOOKING SUCCESS:',
          res
        );

        this.bookingRefresh
          .triggerRefresh();

        setTimeout(() => {

          this.ngZone.run(() => {

            console.log(
              'Refreshing Last Patient without page reload...'
            );

            this.loadLastPatient();

          });

        }, 300);

        this.toastService.success(
          'Booking Saved',
          'Patient booking created successfully.'
        );

        const bookingId =
          res?.bookingId ??
          res?.id ??
          res?.data?.bookingId ??
          res?.data?.id ??
          '—';

        // ============================================================
        // ✅ FIX: Actual auto-generated Patient Id (e.g. 3505001062)
        // create-booking cha response madhe nasto — company web app
        // booking save zalyavar vegळa GET
        // /api/v1/lab/booking/patient/{labId}/{bookingId} call marun
        // to id anta. Tyamule apla app pan tach call karun, response
        // milalyavarach invoice banवayचा — nahitar Patient Id
        // "—" / empty distel.
        // ============================================================

        const labId = this.labApi.getCurrentLabId();

        this.labApi.getPatientByBooking(labId, bookingId).subscribe({

          next: (patientRes: any) => {

            console.log(
              'PATIENT DETAILS RES:',
              patientRes
            );

            this.buildInvoiceAndShow(
              res,
              bookingId,
              patientRes
            );
          },

          error: (err: any) => {

            console.error(
              'GET PATIENT DETAILS ERROR:',
              err
            );

            // Patient details call fail zali tari booking successful
            // ahech — invoice patientId shivay dakhva, booking flow
            // adkun raha nahi.
            this.buildInvoiceAndShow(
              res,
              bookingId,
              null
            );
          }
        });

      },


      // ==========================================================
      // ERROR
      // ==========================================================

      error: (err: any) => {

        console.error(
          'CREATE BOOKING ERROR:',
          err
        );

        console.error(
          'STATUS:',
          err?.status
        );

        console.error(
          'STATUS TEXT:',
          err?.statusText
        );

        console.error(
          'ERROR BODY:',
          err?.error
        );

        const message = String(
          err?.error?.message ||
          err?.error?.error ||
          err?.error?.detail ||
          ''
        ).trim();

        const normalizedMessage =
          message.toLowerCase();

        // ========================================================
        // BARCODE ALREADY USED
        // ========================================================

        const isBarcodeAlreadyUsed =
          normalizedMessage.includes('barcode') &&
          (
            normalizedMessage.includes('already') ||
            normalizedMessage.includes('used') ||
            normalizedMessage.includes('exist') ||
            normalizedMessage.includes('duplicate') ||
            normalizedMessage.includes('assigned') ||
            normalizedMessage.includes('taken')
          );

        if (
          isBarcodeAlreadyUsed
        ) {

          this.toastService.error(
            'Barcode Already Used',
            'This barcode has already been used. Please enter a different barcode.'
          );

          return;
        }

        // ========================================================
        // BARCODE DUPLICATE / UNIQUE CONSTRAINT
        // ========================================================

        const isDuplicateBarcode =
          normalizedMessage.includes('duplicate') &&
          normalizedMessage.includes('barcode');

        if (
          isDuplicateBarcode
        ) {

          this.toastService.error(
            'Invalid Barcode',
            'This barcode is already assigned. Please use another barcode.'
          );

          return;
        }

        // ========================================================
        // DEFAULT BOOKING ERROR
        // ========================================================

        this.toastService.error(
          'Booking Error',
          message ||
          'Failed to save booking.'
        );

      }

    });
  }

private buildInvoiceAndShow(
    res: any,
    bookingId: any,
    patientRes: any
  ): void {

    const collectionCenter = String(
      this.patient?.lab ||
      this.selectedLab?.franchiseName ||
      this.selectedStaffLab?.franchiseName ||
      this.customFranchiseName ||
      '—'
    ).trim();

    const billCreatedBy = String(
      (this.authService.currentUserValue as any)?.raw?.name ||
      (this.authService.currentUserValue as any)?.raw?.username ||
      (this.authService.currentUserValue as any)?.raw?.fullName ||
      this.role ||
      '—'
    ).trim();

    // ============================================================
    // ✅ FIX: khara auto-generated Patient Id (e.g. "3505001064")
    // GET /api/v1/lab/booking/patient/{labId}/{bookingId} cha
    // response madhe TOP-LEVEL "patientId" field madhech asto —
    // confirm zala console log varun. UHID var fallback purna
    // kadhla, कारण UHID rikami thevli tari he ID yetach (backend
    // auto-generate karto).
    // ============================================================

    const patientId = String(
      patientRes?.patientId ??
      res?.patientId ??
      '—'
    ).trim() || '—';

    // ============================================================
    // ✅ FIX: Bill Id patientRes cha nested "bill.billingId" madhe
    // asto (bill: { billingId: 104797, bookingId: 2557, ... }),
    // create-booking cha response madhe nahi.
    // ============================================================

    const billId =
      patientRes?.bill?.billingId ??
      res?.billId ??
      res?.bill?.id ??
      res?.data?.billId ??
      bookingId;

    // ============================================================
    // ✅ FIX: Invoice cha TEST NAME table pahilyanda package chi
    // sagli tests explode karून dakhavत होता (12 separate rows).
    // Company web / bill-table sarkha, package ata EK collapsed
    // row banते (name + eye icon), tichyat bundled tests
    // openPackagePreview() cha same modal madhe distat —
    // individual (non-package) tests aधीच्यासारखेच वेगळे rows रहतात.
    // ============================================================

    const invoiceTests = [

      ...this.selectedTests
        .filter((t: any) => !t.packageName)
        .map((t: any) => {

          const price = Number(t?.b2b || 0);
          const dis = Number(t?.dis || 0);

          return {
            name: t?.name || 'NA',
            price,
            dis,
            total: Math.max(0, price - dis),
            isPackage: false
          };
        }),

      ...this.selectedPackages.map((p: any) => {

        const price = Number(p?.b2b || 0);

        return {
          name: p?.profileName || 'Package',
          price,
          dis: 0,
          total: price,
          isPackage: true,
          packageRef: p
        };
      })
    ];

    // ✅ FIX: selectedSampleTests entries are now sample-type GROUPS
    // (barcode + testNames[] for every test that shares that sample
    // type) instead of one entry per test — the invoice's sample
    // table already renders `s.testNames`, so we pass that array
    // straight through instead of a single `testId`.
    const invoiceSampleTests = this.selectedSampleTests.map((s: any) => ({
      sampleType: s?.sampleType || 'OTHER',
      barcode: s?.barcode || '',
      confirmBarcode: s?.confirmBarcode || s?.barcode || '',
      color: s?.color || '#a855f7',
      sampleId: Number(s?.sampleId || 0),
      testNames: s?.testNames || []
    }));

    this.savedPatient = {

      name:
        (
          this.patient?.title
            ? String(this.patient.title).toUpperCase() + '. '
            : ''
        ) +
        (this.patient?.name || '—'),

      doctor:
        (
          this.patient?.doctorTitle
            ? String(this.patient.doctorTitle).toUpperCase() + '. '
            : ''
        ) +
        (
          this.doctorSearch ||
          this.patient?.doctor ||
          this.selectedDoctor?.doctor_name ||
          this.selectedDoctor?.doctorName ||
          this.selectedDoctor?.name ||
          '—'
        ),

      collectionCenter,

      billCreatedBy,

      bookingDate:
        new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),

      id: bookingId,

      billId,

      patientId,

      phone: this.patient?.phone || '',

      tests: invoiceTests,

      sampleTests: invoiceSampleTests,

      totalAmount: this.getSubTotal(),

      discount: this.billing?.discountAmount || 0,

      grandTotal: this.billing?.grandTotal || 0,

      paidAmount: this.billing?.paidAmount || 0,

      dueAmount: this.billing?.dueAmount || 0
    };

    if (this.isAdminRole) {

      this.showInvoice = true;

    } else {

      this.toastService.success(
        'Done!',
        'You can create the next booking now.'
      );

      this.resetFormKeepingDoctorAndFranchise();

      setTimeout(() => {
        this.ngZone.run(() => {
          this.loadLastPatient();
        });
      }, 300);

    }
  }

  // ============================================================
  // CAPITALIZE
  // ============================================================

  private capitalize(
    str: string
  ): string {

    return str
      ? str.charAt(0)
        .toUpperCase() +
      str.slice(1)
      : '';
  }

  // ============================================================
  // PRINT INVOICE
  // ============================================================

  // ============================================================
  // PRINT INVOICE
  //
  // ✅ FIX: window.print() cha jaga khara "bill-pdf" API vaparat
  // ahot — booking-status.page.ts madhe printBill() function
  // confirm karto ki PDF URL response.downloadUrl field madhe
  // yeto, tyach pattern ithe vaparla ahe.
  // ============================================================

  isPrintingInvoice = false;

  printInvoice(): void {

    const bookingId = Number(
      this.savedPatient?.id ||
      0
    );

    if (!bookingId) {

      this.toastService.error(
        'Print Error',
        'Booking not found for printing.'
      );

      return;
    }

    if (this.isPrintingInvoice) {
      return;
    }

    this.isPrintingInvoice = true;

    const payload = this.labApi.buildBillPayload(
      bookingId
    );

    this.labApi.printBill(payload).subscribe({

      next: (res: any) => {

        this.isPrintingInvoice = false;

        console.log(
          'PRINT BILL RESPONSE:',
          res
        );

        if (res?.downloadUrl) {

          window.open(
            res.downloadUrl,
            '_blank',
            'noopener,noreferrer'
          );

          this.toastService.success(
            'Bill Ready',
            'Bill PDF opened successfully.'
          );

        } else {

          console.warn(
            'PRINT BILL: No downloadUrl in response:',
            res
          );

          this.toastService.error(
            'Print Error',
            res?.message ||
            'Could not generate bill PDF.'
          );
        }
      },

      error: (err: any) => {

        this.isPrintingInvoice = false;

        console.error(
          'PRINT BILL ERROR:',
          err
        );

        this.toastService.error(
          'Print Error',
          'Failed to print bill. Please try again.'
        );
      }
    });
  }

  receiveSample(
    sample: any,
    alsoPrint: boolean = false
  ): void {

    this.toastService.success(
      'Sample Received',
      (sample?.sampleType || 'Sample') +
      ' marked as received.'
    );

    if (alsoPrint) {
      this.printInvoice();
    }
  }

  // ============================================================
  // CLOSE INVOICE
  // ============================================================

  closeInvoice() {

    this.showInvoice =
      false;

    this.resetForm();

    this.toastService.success(
      'Done!',
      'Redirecting to booking...'
    );

    setTimeout(
      () =>
        this.ngZone.run(
          () =>
            this.router.navigate([
              '/add-patient'
            ])
        ),
      800
    );
  }

  // ============================================================
  // CANCEL
  // ============================================================

  async cancel() {

    const alert =
      await this.alertController.create({

        cssClass:
          'premium-alert',

        header:
          'Cancel Booking',

        message:
          'Are you sure you want to cancel?',

        buttons: [

          {
            text:
              'No',

            role:
              'cancel',

            cssClass:
              'alert-button-cancel'
          },

          {

            text:
              'Yes',

            cssClass:
              'alert-button-danger',

            handler: () => {

              this.toastService.warning(
                'Cancelled',
                'Booking was cancelled.'
              );

              this.ngZone.run(
                () =>
                  this.router.navigate([
                    '/dashboard'
                  ])
              );
            }
          }
        ]
      });

    await alert.present();
  }

  // ============================================================
  // BARCODE SCAN (camera)
  //
  // ✅ FIX: previously this just showed a static warning toast and
  // never actually opened the camera. Now it uses
  // @capacitor-mlkit/barcode-scanning (already installed in the
  // project) to check/request camera permission, open the scanner,
  // and write the scanned value straight into this sample group's
  // barcode + confirmBarcode fields — both of which already flow
  // into savePatient()/updateSampleBarcode() with zero extra wiring.
  // ============================================================

  async scanBarcode(
    sample: any
  ) {

    try {

      const { camera } = await BarcodeScanner.checkPermissions();

      if (camera !== 'granted' && camera !== 'limited') {

        const { camera: newStatus } = await BarcodeScanner.requestPermissions();

        if (newStatus !== 'granted' && newStatus !== 'limited') {

          this.toastService.error(
            'Permission Denied',
            'Camera permission is required to scan barcode.'
          );

          return;
        }
      }

      const { barcodes } = await BarcodeScanner.scan();

      if (barcodes && barcodes.length > 0) {

        const scannedValue = String(
          barcodes[0].rawValue ||
          barcodes[0].displayValue ||
          ''
        ).trim();

        if (!scannedValue) {

          this.toastService.warning(
            'Empty Barcode',
            'Scanned barcode was empty. Please try again.'
          );

          return;
        }

        this.ngZone.run(() => {

          sample.barcode = scannedValue;

          sample.confirmBarcode = scannedValue;
        });

        this.toastService.success(
          'Barcode Scanned',
          'Barcode set to ' + scannedValue + '.'
        );
      }

    } catch (err) {

      console.error(
        'SCAN BARCODE ERROR:',
        err
      );

      this.toastService.error(
        'Scan Failed',
        'Could not scan barcode. Please try again.'
      );
    }
  }
}