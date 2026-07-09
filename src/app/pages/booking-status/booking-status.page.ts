import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
  IonSelect, IonSelectOption, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  flaskOutline, personOutline, printOutline,
  closeOutline, trashOutline, addOutline, checkmarkOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { BookingService, Patient, TestItem } from '../../services/booking-status';
import { ToastService } from '../../services/toast';
import { LabApiService } from '../../services/lab-api';

@Component({
  selector: 'app-booking-status',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonModal, IonSearchbar,
    IonSelect, IonSelectOption
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './booking-status.page.html',
  styleUrls: ['./booking-status.page.scss']
})
export class BookingStatusPage implements OnInit, OnDestroy {

  bookings: Patient[] = [];
  private sub!: Subscription;

  isTestModalOpen = false;
  selectedBooking: Patient | null = null;

  searchTerm = '';
  filteredTests: TestItem[] = [];
  selectedTests: TestItem[] = [];

  discount = 0;
  paidAmount = 0;
  paymentMethod = 'cash';

  isPatientModalOpen = false;
  editPatientData: any = null;
  private originalPatientId: string | number | null = null;

  showDoctorPicker = false;
  showLabPicker = false;
  doctors: any[] = [];
  labs: any[] = [];
  selectedDoctorPick: any = null;
  selectedLabPick: any = null;

  // ==========================
  // ➕ ROLE BASE VISIBILITY
  // ==========================
  role: string = localStorage.getItem('role') || '';

  private readonly ROLE_LAB_ADMIN = 'ROLE_LAB_ADMIN';
  private readonly ROLE_STAFF = 'ROLE_STAFF';
  private readonly ROLE_FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF';
  private readonly ROLE_FRANCHISE = 'ROLE_FRANCHISE';

  get isAdminRole(): boolean {
    return this.role === this.ROLE_LAB_ADMIN || this.role === this.ROLE_STAFF;
  }

  get isFranchiseRole(): boolean {
    return this.role === this.ROLE_FRANCHISE || this.role === this.ROLE_FRANCHISE_STAFF;
  }

  // ==========================
  // ➕ REAL API TESTS (static catalog kadhla)
  // ==========================
  availableTests: TestItem[] = [];

  constructor(
    private bookingService: BookingService,
    private toast: ToastService,
    private labApi: LabApiService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController
  ) {
    addIcons({
      flaskOutline,
      personOutline,
      printOutline,
      closeOutline,
      trashOutline,
      addOutline,
      checkmarkOutline
    });
  }

  showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    if (type === 'success') this.toast.success('Success', msg);
    else if (type === 'error') this.toast.error('Error', msg);
    else this.toast.warning('Warning', msg);
  }

  ngOnInit() {
    this.role = localStorage.getItem('role') || ''; // ✅ role refresh
    this.loadAvailableTests();

    this.sub = this.bookingService.patients$.subscribe(data => {
      this.bookings = data;
    });
  }

  // ✅ ADDED — page var parat aalyavar (tab switch / navigation) role refresh
  ionViewWillEnter() {
    this.role = localStorage.getItem('role') || '';
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // ==========================
  // ➕ REAL TESTS API (Add Patient sarkha loadTests())
  // ==========================
  loadAvailableTests() {
    this.labApi.getTests().subscribe({
      next: (res: any) => {
        const apiTests = res || [];
        this.availableTests = (Array.isArray(apiTests) ? apiTests : []).map((t: any) => ({
          name: t.test_name || 'Unnamed Test',
          b2b: t.price2 ?? 0,
          tat: t.tat || 'N/A',
          mrp: t.test_price ?? 0,
          fluid: t.sampleTypeName || 'N/A',
          sampleType: t.sampleTypeName || 'OTHER',
          color: t.sampleColor || '#a855f7'
        }));
      },
      error: (err) => {
        console.log('AVAILABLE TESTS ERROR:', err);
      }
    });
  }

  getTests(item: Patient): string {
    return (item.tests || []).map(t => t.name).join(', ') || '-';
  }

  getSamples(item: Patient): number {
    return (item.tests || []).length;
  }

  getBarcode(i: number): string {
    return 'BC' + (1000 + i);
  }

  printBill(item: Patient) {
    window.print();
    this.showToast('Bill printing started', 'success');
  }

  editTest(item: Patient) {
    this.selectedBooking = item;
    this.selectedTests = JSON.parse(JSON.stringify(item.tests || []));
    this.discount = item.discount || 0;
    this.paidAmount = item.paidAmount || 0;

    this.searchTerm = '';
    this.filteredTests = [];
    this.isTestModalOpen = true;
  }



  closeTestModal() {
    this.isTestModalOpen = false;
    this.selectedBooking = null;
    this.selectedTests = [];
  }

  searchTests() {
    const t = this.searchTerm.trim().toLowerCase();

    if (!t) {
      this.filteredTests = [];
      return;
    }

    this.filteredTests = this.availableTests.filter(x =>
      x.name.toLowerCase().includes(t) &&
      !this.selectedTests.some(s => s.name === x.name)
    );
  }

  addTest(test: TestItem) {
    this.selectedTests.push({ ...test, resultValue: '' });
    this.searchTerm = '';
    this.filteredTests = [];
    this.showToast(`${test.name} added`, 'success');
  }

  // ==========================
  // ➕ DELETE CONFIRMATION POPUP
  // ==========================
  async removeTest(test: TestItem) {
    const alert = await this.alertController.create({
      header: 'Delete Test',
      message: `Are you sure you want to delete "${test.name}"?`,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Yes, Delete',
          handler: () => {
            this.selectedTests = this.selectedTests.filter(t => t.name !== test.name);
            this.showToast(`${test.name} removed`, 'warning');
          }
        }
      ]
    });
    await alert.present();
  }

  isAbnormal(test: TestItem): boolean {
    const val = parseFloat(String(test.resultValue));
    if (isNaN(val) || test.refRangeLow == null || test.refRangeHigh == null) {
      return false;
    }
    return val < test.refRangeLow || val > test.refRangeHigh;
  }

  // onDiscountChange() {
  //   if (this.isFranchiseRole) {
  //     this.discount = 0; // ✅ ADDED — franchise/staff kadhihi discount badlu shakat nahi
  //     return;
  //   }
  //   if (this.discount < 0) this.discount = 0;
  //   if (this.discount > this.subTotal) this.discount = this.subTotal;
  // }

  onDiscountChange() {
  if (!this.canEditBilling) {
    this.discount = 0;
    return;
  }

  if (this.discount < 0) this.discount = 0;
  if (this.discount > this.subTotal) this.discount = this.subTotal;
}

  // onPaidChange() {
  //   if (this.isFranchiseRole) {
  //     this.paidAmount = 0; // ✅ ADDED — franchise/staff kadhihi paid amount badlu shakat nahi
  //     return;
  //   }
  //   if (this.paidAmount < 0) this.paidAmount = 0;
  //   if (this.paidAmount > this.totalAmount) this.paidAmount = this.totalAmount;
  // }

  onPaidChange() {
  if (!this.canEditBilling) {
    this.paidAmount = 0;
    return;
  }

  if (this.paidAmount < 0) this.paidAmount = 0;
  if (this.paidAmount > this.totalAmount) this.paidAmount = this.totalAmount;
}

  get subTotal(): number {
    return this.selectedTests.reduce((s, t) => s + Number(t.mrp || 0), 0);
  }

  get totalAmount(): number {
    return Math.max(0, this.subTotal - this.discount);
  }

  get dueAmount(): number {
    return Math.max(0, this.totalAmount - this.paidAmount);
  }

  updateTestBooking() {
    if (!this.selectedBooking) return;

    const updated: Patient = {
      ...this.selectedBooking,
      tests: [...this.selectedTests],
      discount: this.discount,
      paidAmount: this.paidAmount,
      paymentMethod: this.paymentMethod,
      totalAmount: this.subTotal,
      grandTotal: this.totalAmount,
      dueAmount: this.dueAmount
    };

    this.bookingService.updatePatient(updated);

    this.showToast('Test updated successfully', 'success');
    this.closeTestModal();
  }

  editPatient(item: Patient) {
    this.editPatientData = JSON.parse(JSON.stringify(item));
    this.originalPatientId = item.id;
    this.isPatientModalOpen = true;
  }

  closePatientModal() {
    this.isPatientModalOpen = false;
    this.editPatientData = null;
    this.originalPatientId = null;
  }

  updatePatient() {
    const original = this.bookings.find(b => b.id === this.originalPatientId);
    if (!original) return;

    const updated: Patient = {
      ...original,
      ...this.editPatientData
    };

    this.bookingService.updatePatient(updated);

    this.showToast('Patient updated successfully', 'success');
    this.closePatientModal();
  }

  openDoctorPicker() {
    this.selectedDoctorPick = null;
    this.showDoctorPicker = true;
    this.loadDoctorsForEdit();
  }

  loadDoctorsForEdit() {
    this.labApi.getDoctors().subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.doctors = res?.content || res || [];
          this.cdr.detectChanges();
        });

        if (!this.doctors || this.doctors.length === 0) {
          this.showToast('No doctors found from server', 'warning');
        }
      },
      error: (err) => {
        console.log('DOCTORS FETCH ERROR:', err);
        this.ngZone.run(() => {
          this.showToast('Failed to load doctors', 'error');
        });
      }
    });
  }

  selectDoctorForEdit(doc: any) {
    if (!doc || !this.editPatientData) return;
    this.selectedDoctorPick = { ...doc };
    this.editPatientData.doctor = doc?.doctor_name;
    this.editPatientData.doctorTitle = 'dr';
    this.showDoctorPicker = false;
  }

  openLabPicker() {
    this.selectedLabPick = null;
    this.showLabPicker = true;
    this.loadLabsForEdit();
  }

  loadLabsForEdit() {
    if (this.isFranchiseRole) {
      const ownFranchise = JSON.parse(localStorage.getItem('franchise') || 'null');

      this.ngZone.run(() => {
        this.labs = ownFranchise ? [ownFranchise] : [];
        this.cdr.detectChanges();
      });

      console.log('OWN FRANCHISE (no API call):', this.labs);
      return;
    }

    this.labApi.getFranchises().subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.labs = res?.content || res || [];
          this.cdr.detectChanges();
        });

        if (!this.labs || this.labs.length === 0) {
          this.showToast('No labs found from server', 'warning');
        }
      },
      error: (err) => {
        console.log('LABS FETCH ERROR:', err);
        this.ngZone.run(() => {
          this.showToast('Failed to load labs', 'error');
        });
      }
    });
  }

  selectLabForEdit(lab: any) {
    if (!lab || !this.editPatientData) return;
    this.selectedLabPick = { ...lab };
    this.editPatientData.lab = lab?.franchiseName || lab?.name;
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
}