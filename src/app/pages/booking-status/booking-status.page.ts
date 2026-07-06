import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonModal, IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  flaskOutline, personOutline, printOutline,
  closeOutline, trashOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { BookingService, Patient, TestItem } from '../../services/booking-status';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-booking-status',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonModal, IonSearchbar
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

  // Catalog of tests available to add. Each entry carries sensible report
  // defaults (unit / reference range / method) which get copied onto the
  // test the moment it's added to a booking — the lab tech only needs to
  // type the actual RESULT value once the test is performed.
  availableTests: TestItem[] = [
    {
      name: 'Blood Test', b2b: '₹150', tat: '24hr', mrp: 200, fluid: 'Blood', sampleType: 'BLOOD', color: '#ef4444',
      unit: 'g/dL', refRangeLow: 12, refRangeHigh: 16, method: 'Automated'
    },
    {
      name: 'CBC', b2b: '₹120', tat: '6hr', mrp: 180, fluid: 'EDTA', sampleType: 'EDTA', color: '#a855f7',
      unit: 'cells/mcL', refRangeLow: 4500, refRangeHigh: 11000, method: 'Automated'
    },
    {
      name: 'Thyroid (T3T4)', b2b: '₹300', tat: '24hr', mrp: 450, fluid: 'Serum', sampleType: 'SERUM', color: '#ef4444',
      unit: 'ng/dL', refRangeLow: 80, refRangeHigh: 200, method: 'CLIA'
    },
    {
      name: '25-OH Vitamin D3 (Total)', b2b: '₹600', tat: '48hr', mrp: 800, fluid: 'Serum', sampleType: 'SERUM', color: '#ef4444',
      unit: 'ng/mL', refRangeLow: 30, refRangeHigh: 120, method: 'CLIA',
      referenceNote:
        'Deficiency     : < 20 ng/mL\n' +
        'Insufficiency  : 20–30 ng/mL\n' +
        'Sufficiency    : 30–100 ng/mL\n' +
        'Toxicity       : > 100 ng/mL'
    }
  ];

  constructor(
    private bookingService: BookingService,
    private toast: ToastService
  ) {
    addIcons({
      flaskOutline,
      personOutline,
      printOutline,
      closeOutline,
      trashOutline
    });
  }

  // ================= TOAST =================
  showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    if (type === 'success') this.toast.success('Success', msg);
    else if (type === 'error') this.toast.error('Error', msg);
    else this.toast.warning('Warning', msg);
  }

  ngOnInit() {
    this.sub = this.bookingService.patients$.subscribe(data => {
      this.bookings = data;
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // ================= TABLE HELPERS =================
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

  // ================= TEST MODAL =================
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
    // clone from catalog so unit/refRange/method come pre-filled,
    // but resultValue always starts blank — it gets typed in after testing
    this.selectedTests.push({ ...test, resultValue: '' });
    this.searchTerm = '';
    this.filteredTests = [];
    this.showToast(`${test.name} added`, 'success');
  }

  removeTest(test: TestItem) {
    this.selectedTests = this.selectedTests.filter(t => t.name !== test.name);
    this.showToast(`${test.name} removed`, 'warning');
  }

  // ================= RESULT / REPORT FIELDS =================
  // Used to visually flag a value outside the reference range while
  // the lab tech is typing it in (mirrors the highlight shown on the PDF).
  isAbnormal(test: TestItem): boolean {
    const val = parseFloat(String(test.resultValue));
    if (isNaN(val) || test.refRangeLow == null || test.refRangeHigh == null) {
      return false;
    }
    return val < test.refRangeLow || val > test.refRangeHigh;
  }

  // ================= FIXED FUNCTIONS =================
  onDiscountChange() {
    if (this.discount < 0) this.discount = 0;
    if (this.discount > this.subTotal) this.discount = this.subTotal;
  }

  onPaidChange() {
    if (this.paidAmount < 0) this.paidAmount = 0;
    if (this.paidAmount > this.totalAmount) this.paidAmount = this.totalAmount;
  }

  // ================= CALCULATIONS =================
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

  // ================= PATIENT =================
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

  // ================= FILE =================
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
}