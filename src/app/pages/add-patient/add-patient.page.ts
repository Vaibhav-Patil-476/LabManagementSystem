import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonInput, IonSelect, IonSelectOption,
  IonTextarea, IonCheckbox, IonModal,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline, addOutline, searchOutline,
  saveOutline, trashOutline, walletOutline,
  printOutline, calendarOutline, cameraOutline,
  closeOutline, scanOutline, attachOutline, documentOutline
} from 'ionicons/icons';

import { ToastService } from '../../services/toast';
import { BookingService, Patient } from '../../services/booking-status';
import { LabApiService } from '../../services/lab-api'; // ✅ ADDED

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
    IonTextarea, IonCheckbox, IonModal
  ]
})
export class AddPatientComponent {

  lastPatient = localStorage.getItem('lastPatient') || '—';
  testSearch = '';
  showInvoice = false;
  showAddDoctor = false;
  showAddLab = false;
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
    eReport: false,
    clinical: false,
    file: false,
    homeCollection: false
  };

  newDoctor = {
    title: 'dr',
    name: '',
    percentValue: '',
    percentType: ''
  };

  newLab = {
    name: '',
    contact: '',
    address: ''
  };

  selectedTests: any[] = [];

  // ⚠️ STATIC DATA REMOVED — ata purna API driven ahe.
  // loadTests() call zalyavar hach array API cha response ne bharla jail.
  allTests: any[] = [];

  filteredTests: any[] = [];
  showSuggestions = false;

  // ==========================
  // ➕ DOCTORS (FETCH ONLY ADDED)
  // ==========================
  doctors: any[] = [];
  selectedDoctor: any = null;

  // ==========================
  // ➕ LABS (NEW ADD ONLY)
  // ==========================
  labs: any[] = [];
  selectedLab: any = null;

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private alertController: AlertController,
    private toastService: ToastService,
    private bookingService: BookingService,
    private labApi: LabApiService // ✅ ADDED
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
      'document-outline': documentOutline
    });
  }

  // ==========================
  // OPEN DOCTOR MODAL (UNCHANGED)
  // ==========================
  openAddDoctor() {
    this.newDoctor = { title: 'dr', name: '', percentValue: '', percentType: '' };
    this.showAddDoctor = true;
     this.loadDoctors();
  }

  saveDoctor() {
    if (!this.newDoctor.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter doctor name.');
      return;
    }

    this.patient.doctorTitle = this.newDoctor.title;
    this.patient.doctor = this.newDoctor.name;

    this.showAddDoctor = false;

    this.toastService.success(
      'Doctor Added',
      this.newDoctor.title.charAt(0).toUpperCase() + this.newDoctor.title.slice(1) +
      '. ' + this.newDoctor.name + ' added successfully.'
    );
  }

  // ==========================
  // ➕ DOCTOR FETCH (NEW ADD ONLY)
  // ==========================
loadDoctors() {
  this.labApi.getDoctors().subscribe({
    next: (res: any) => {
      this.doctors = res || [];

      console.log('DOCTORS:', this.doctors); // keep for debug
    },
    error: (err) => {
      console.log(err);
      this.toastService.error('Error', 'Failed to load doctors');
    }
  });
}
selectDoctor(doc: any) {
  this.selectedDoctor = { ...doc };  // change detection fix

  this.patient.doctor = doc?.doctor_name; // IMPORTANT FIX
  this.patient.doctorTitle = 'dr';
}

  // ==========================
  // ➕ LAB FETCH (NEW ADD ONLY)
  // ==========================
  loadLabs() {
    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        // API kadhi array dete kadhi { content: [...] } dete, dohnhi handle
        this.labs = res?.content || res || [];

        console.log('LABS:', this.labs); // keep for debug
      },
      error: (err) => {
        console.log(err);
        this.toastService.error('Error', 'Failed to load labs');
      }
    });
  }

  selectLab(lab: any) {
    this.selectedLab = { ...lab }; // change detection fix

    this.patient.lab = lab?.franchiseName || lab?.name; // IMPORTANT FIX
  }

  // ==========================
  // ➕ TESTS FETCH (NEW ADD ONLY)
  // ==========================
  loadTests() {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        const apiTests = res || [];

        // ✅ ACTUAL API FIELD NAMES CONFIRMED (real response check kela):
        // test_name -> Test Name
        // test_price -> MRP/Price
        // price2 -> B2B Price
        // tat -> TAT
        // sampleTypeName -> Fluid / Sample Type
        // sampleColor -> Color dot
        // testId -> unique id
        this.allTests = (Array.isArray(apiTests) ? apiTests : []).map((t: any) => ({
          id: t.testId,
          name: t.test_name || 'Unnamed Test',
          b2b: t.price2 ?? 0,
          tat: t.tat || 'N/A',
          mrp: t.test_price ?? 0,
          fluid: t.sampleTypeName || 'N/A',
          sampleType: t.sampleTypeName || 'OTHER',
          color: t.sampleColor || '#a855f7'
        }));

        console.log('TESTS:', this.allTests); // keep for debug
      },
      error: (err) => {
        console.log(err);
        this.toastService.error('Error', 'Failed to load tests from server.');
      }
    });
  }

  // ==========================
  // OPEN LAB MODAL (NEW ADD ONLY)
  // ==========================
  openAddLabApi() {
    this.loadLabs();
  }

  // ==========================
  // INIT (ONLY ADD CALL)
  // ==========================
  ionViewWillEnter() {
    this.loadDoctors(); // ✅ ADDED ONLY
    this.loadLabs();    // ✅ ADDED ONLY
    this.loadTests();   // ✅ ADDED ONLY
  }

  // ==========================
  // बाकी FULL CODE SAME AS IT IS
  // ==========================

  openAddLab() {
    this.newLab = { name: '', contact: '', address: '' };
    this.showAddLab = true;
    this.loadLabs(); // ✅ ADDED ONLY (doctor pattern sarkha)
  }

  saveLab() {
    if (!this.newLab.name.trim()) {
      this.toastService.error('Validation Error', 'Please enter lab name.');
      return;
    }
    this.patient.lab = this.newLab.name;
    this.showAddLab = false;
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
    } else {
      this.toastService.warning('Already Added', test.name + ' already exists.');
    }
    this.testSearch = '';
    this.showSuggestions = false;
  }

  removeTest(index: number) {
    const removed = this.selectedTests[index];
    this.selectedTests.splice(index, 1);
    this.selectedSampleTests = this.selectedSampleTests.filter(
      x => x.testName !== removed.name
    );
    this.toastService.warning('Test Removed', removed.name + ' removed from bill.');
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
      uhid: '', history: '', eReport: false,
      clinical: false, file: false, homeCollection: false
    };
    this.selectedTests = [];
    this.selectedSampleTests = [];
    this.testSearch = '';
    this.filteredTests = [];
    this.selectedFileName = '';
    this.selectedFileBase64 = '';
    this.showSuggestions = false;
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
    if (!this.patient.doctor.trim()) {
      this.toastService.error('Validation Error', 'Please enter doctor name.');
      return;
    }
    if (!this.patient.phone.trim()) {
      this.toastService.error('Validation Error', 'Please enter mobile number.');
      return;
    }
    if (!/^\d{10}$/.test(this.patient.phone)) {
      this.toastService.error('Invalid Mobile', 'Please enter valid 10 digit mobile number.');
      return;
    }
    if (this.selectedTests.length === 0) {
      this.toastService.warning('No Tests', 'Please add at least one test.');
      return;
    }

    const patientData: Patient = {
      id: this.bookingService.generateNextId(),
      bookingDate: new Date().toLocaleString(),
      ...this.patient,
      tests: this.selectedTests,
      totalAmount: this.getSubTotal(),
      discount: 0,
      grandTotal: this.getSubTotal(),
      paidAmount: 0,
      dueAmount: this.getSubTotal(),
      paymentMethod: 'cash'
    };

    this.bookingService.addPatient(patientData);
    localStorage.setItem('lastPatient', this.patient.name);

    this.lastPatient = this.patient.name;
    this.savedPatient = patientData;

    this.toastService.success('Booking Saved!', 'Patient ' + this.patient.name + ' saved successfully.');

    setTimeout(() => { this.showInvoice = true; }, 500);
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