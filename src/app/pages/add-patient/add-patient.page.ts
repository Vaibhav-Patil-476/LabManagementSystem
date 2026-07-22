import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
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
  chevronDownOutline
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
  // FILE
  // ============================================================

  selectedFileName = '';

  selectedFileBase64 = '';

  // ============================================================
  // INVOICE
  // ============================================================

  showInvoice = false;

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

  get canViewAmount(): boolean {
    return this.isAdminRole || this.isFranchiseRole;
  }

  get isFranchiseRole(): boolean {
    return (
      this.role === this.ROLE_FRANCHISE ||
      this.role === this.ROLE_FRANCHISE_STAFF
    );
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
      'chevron-down-outline': chevronDownOutline
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

        this.loadLastPatient();
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

      percentType: 'percent'
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

  if (this.isAdminRole && !mobileNumber) {
    this.toastService.error(
      'Validation Error',
      'Please enter mobile number.'
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

  selectLab(
    lab: any
  ) {

    this.selectedLab =
      lab;

    this.patient.lab =
      lab?.franchiseName ||
      lab?.name ||
      '';
  }

  searchLabInput() {

    const q =
      String(
        this.labSearch || ''
      )
        .trim()
        .toLowerCase();

    if (
      q.length > 0
    ) {

      this.filteredLabs =
        this.labs.filter(
          (l: any) =>
            String(
              l?.franchiseName ||
              l?.name ||
              ''
            )
              .toLowerCase()
              .includes(q)
        );

      this.showLabDropdown =
        true;

    } else {

      this.filteredLabs = [];

      this.showLabDropdown =
        false;
    }

    this.selectedLab =
      null;

    this.patient.lab =
      this.labSearch;
  }

  searchStaffLabInput() {

    if (
      this.isStaffRole
    ) {
      return;
    }

    const q =
      String(
        this.staffLabSearch || ''
      )
        .trim()
        .toLowerCase();

    if (
      q.length > 0
    ) {

      this.filteredStaffLabs =
        this.labs.filter(
          (l: any) =>
            String(
              l?.franchiseName ||
              l?.name ||
              ''
            )
              .toLowerCase()
              .includes(q)
        );

      this.showStaffLabDropdown =
        true;

    } else {

      this.filteredStaffLabs = [];

      this.showStaffLabDropdown =
        false;
    }

    this.selectedLab =
      null;

    this.patient.lab =
      this.staffLabSearch;
  }

  selectStaffLabFromPicker(
    lab: any
  ) {

    this.selectLab(
      lab
    );

    this.staffLabSearch =
      lab?.franchiseName ||
      lab?.name ||
      '';

    this.showStaffLabDropdown =
      false;
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

  saveLab() {

    if (
      !this.newLab.name.trim()
    ) {

      this.toastService.error(
        'Validation Error',
        'Please enter lab name.'
      );

      return;
    }

    this.patient.lab =
      this.newLab.name;

    this.labSearch =
      this.newLab.name;

    this.staffLabSearch =
      this.newLab.name;

    this.selectedLab =
      null;

    this.showAddLabModal =
      false;

    this.toastService.success(
      'Lab Added',
      this.newLab.name +
      ' added successfully.'
    );
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

  selectLabFromPicker(
    lab: any
  ) {

    this.selectLab(
      lab
    );

    this.labSearch =
      lab?.franchiseName ||
      lab?.name ||
      '';

    this.showLabDropdown =
      false;
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

    this.labApi
      .getTests()
      .subscribe({

        next: (res: any) => {

          const apiTests =
            res || [];

          this.allTests =
            (
              Array.isArray(
                apiTests
              )
                ? apiTests
                : []
            ).map(
              (t: any) => ({

                id:
                  t.testId,

                sampleId:
                  t.sample_type,

                name:
                  t.test_name ||
                  'Unnamed Test',

                b2b:
                  t.price2 ??
                  0,

                tat:
                  t.tat ||
                  'N/A',

                mrp:
                  t.test_price ??
                  0,

                dis:
                  0,

                fluid:
                  t.sampleTypeName ||
                  'N/A',

                sampleType:
                  t.sampleTypeName ||
                  'OTHER',

                color:
                  t.sampleColor ||
                  '#a855f7'
              })
            );
        },

        error: () => {

          this.toastService.error(
            'Error',
            'Failed to load tests from server.'
          );
        }
      });
  }

  searchTest() {

    if (
      this.testSearch
        .trim()
        .length > 0
    ) {

      this.filteredTests =
        this.allTests.filter(
          (t: any) =>
            t.name
              .toLowerCase()
              .includes(
                this.testSearch
                  .toLowerCase()
              )
        );

      this.showSuggestions =
        true;

    } else {

      this.filteredTests = [];

      this.showSuggestions =
        false;
    }
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

      this.selectedSampleTests.push({

        barcode: '',

        sampleType:
          test.sampleType,

        testName:
          test.name,

        color:
          test.color,

        testId:
          test.id,

        sampleId:
          test.sampleId
      });

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

  async removeTest(
    index: number
  ) {

    const test =
      this.selectedTests[
      index
      ];

    const alert =
      await this.alertController.create({

        header:
          'Remove Test',

        message:
          `Are you sure you want to remove "${test.name}"?`,

        buttons: [

          {
            text: 'No',
            role: 'cancel'
          },

          {

            text: 'Yes',

            handler: () => {

              this.selectedTests.splice(
                index,
                1
              );

              this.selectedSampleTests =
                this.selectedSampleTests
                  .filter(
                    (x: any) =>
                      x.testName !==
                      test.name
                  );

              this.toastService.warning(
                'Test Removed',
                test.name +
                ' removed from bill.'
              );

              this.calculateBilling();
            }
          }
        ]
      });

    await alert.present();
  }

  getSubTotal() {

    return this.selectedTests.reduce(
      (
        sum: number,
        t: any
      ) =>
        sum +
        Number(
          t?.mrp ||
          0
        ),
      0
    );
  }

  // ============================================================
  // BILLING
  // ============================================================

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

    if (
      this.billing.paymentMode ===
      'cash'
    ) {

      this.billing.cashAmount =
        this.billing.paidAmount ||
        0;

      this.billing.upiAmount =
        0;

    } else if (
      this.billing.paymentMode ===
      'upi'
    ) {

      this.billing.upiAmount =
        this.billing.paidAmount ||
        0;

      this.billing.cashAmount =
        0;
    }

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

    this.selectedTests =
      [];

    this.selectedSampleTests =
      [];

    this.testSearch =
      '';

    this.filteredTests =
      [];

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

    this.selectedTests =
      [];

    this.selectedSampleTests =
      [];

    this.testSearch =
      '';

    this.filteredTests =
      [];

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
// SAVE PATIENT / BOOKING
// ============================================================

savePatient(): void {
  const patientName = String(this.patient?.name || '').trim();

  if (!patientName) {
    this.toastService.error('Validation Error', 'Please enter patient full name.');
    return;
  }

  if (
    this.patient?.age === null ||
    this.patient?.age === undefined ||
    String(this.patient.age).trim() === ''
  ) {
    this.toastService.error('Validation Error', 'Please enter patient age.');
    return;
  }

  if (!this.selectedTests || this.selectedTests.length === 0) {
    this.toastService.error('Validation Error', 'Please select at least one test.');
    return;
  }

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
    this.toastService.error(
      'Validation Error',
      'Please select or enter doctor.'
    );
    return;
  }

  if (!finalDoctorId || finalDoctorId <= 0) {
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

  const customFranchiseLab = String(
    this.customFranchiseName || ''
  ).trim();

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

    const sample = this.selectedSampleTests.find(
      (s: any) => Number(s?.testId) === testId
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

    const testPrice = Number(
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
      dob: null,
      height: null,
      weight: null,
      remark: null,
      history: null,
      fluid: null,
      document: null,
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
      '',

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

  this.savedPatient = {

    name:
      (
        this.patient?.title
          ? String(
              this.patient.title
            ).toUpperCase() + '. '
          : ''
      ) +
      (
        this.patient?.name ||
        '—'
      ),

    doctor:
      (
        this.patient?.doctorTitle
          ? String(
              this.patient.doctorTitle
            ).toUpperCase() + '. '
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

    bookingDate:
      new Date()
        .toLocaleString(
          'en-IN',
          {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }
        ),

    id:
      bookingId,

    phone:
      this.patient?.phone ||
      '',

    totalAmount:
      this.getSubTotal(),

    discount:
      this.billing?.discountAmount ||
      0,

    grandTotal:
      this.billing?.grandTotal ||
      0
  };

  if (
    this.isAdminRole
  ) {

    this.showInvoice =
      true;

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

  printInvoice() {

    window.print();
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
      'Redirecting to dashboard...'
    );

    setTimeout(
      () =>
        this.ngZone.run(
          () =>
            this.router.navigate([
              '/dashboard'
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
              'alert-btn-cancel'
          },

          {

            text:
              'Yes',

            cssClass:
              'alert-btn-danger',

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
  // BARCODE
  // ============================================================

  async scanBarcode(
    sample: any
  ) {

    this.toastService.warning(
      'Scanner',
      'Please enter barcode manually. Camera works on real device.'
    );
  }
}