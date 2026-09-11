import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  ToastController,
  LoadingController,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonSearchbar,
  IonItem,
  IonInput,
  IonButton,
  IonSpinner,
  IonCard,
  IonChip,
  IonLabel,
  IonBadge,
  IonModal
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeCircleOutline,
  searchOutline,
  calendarOutline,
  refreshOutline,
  qrCodeOutline,
  documentTextOutline,
  alertCircleOutline,
  eyeOutline,
  closeOutline
} from 'ionicons/icons';

import { LabApiService } from '../../core/services/lab-api';

@Component({
  selector: 'app-cancel-test',
  standalone: true,
  templateUrl: './cancel-test.page.html',
  styleUrls: ['./cancel-test.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonSearchbar,
    IonItem,
    IonInput,
    IonButton,
    IonSpinner,
    IonCard,
    IonChip,
    IonLabel,
    IonBadge,
    IonModal,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule
  ]
})
export class CancelTestPage implements OnInit {

  allTests: any[] = [];
  filteredTests: any[] = [];

  searchTerm = '';
  startDate: string = this.firstDayOfMonth();
  endDate: string = this.today();

  isLoading = false;
  resendingId: number | null = null;   // kontya row cha resend chalu ahe, button disable karnyasathi

  // ---------- test preview modal (eye icon) ----------
  isTestPreviewModalOpen = false;
  previewItem: any = null;

  // ---------- date range picker (booking-status sarkha) ----------
  @ViewChild('rangePicker') rangePicker!: any;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  constructor(
    private labApiService: LabApiService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {
    addIcons({
      closeCircleOutline,
      searchOutline,
      calendarOutline,
      refreshOutline,
      qrCodeOutline,
      documentTextOutline,
      alertCircleOutline,
      eyeOutline,
      closeOutline
    });
  }

  ngOnInit(): void {
    this.loadCancelTests();
  }

  /** Current month chi range default */
  firstDayOfMonth(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }
today(): string {
  return new Date().toISOString().slice(0, 10);
}

  /** epoch millis -> "12 Aug, 2026, 09:05 PM" sarkha readable format */
  private formatDate(ms: number | null | undefined): string {
    if (!ms) return '-';
    try {
      return new Date(ms).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch {
      return '-';
    }
  }

  // ---------- date range picker helpers ----------
  private formatDateForInput(d: Date): string {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  private nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return this.formatDateForInput(d);
}

  private toDateObj(dateStr: string): Date | null {
    return dateStr ? new Date(dateStr + 'T00:00:00') : null;
  }

  private toDateStr(d: Date | null): string {
    return d ? this.formatDateForInput(d) : '';
  }

  openDateRangePicker(): void {
    this.rangeStart = this.toDateObj(this.startDate);
    this.rangeEnd = this.toDateObj(this.endDate);
    this.rangePicker?.open();
  }

  onRangeStartChange(event: any): void {
    this.rangeStart = event?.value || null;
  }

  onRangeEndChange(event: any): void {
    this.rangeEnd = event?.value || null;

    if (this.rangeStart && this.rangeEnd) {
      this.startDate = this.toDateStr(this.rangeStart);
      this.endDate = this.toDateStr(this.rangeEnd);
      this.loadCancelTests();
    }
  }

  private mapRawItem(raw: any): any {
    const testInfo = Array.isArray(raw?.tests) ? raw.tests[0] : null;
    const barcode = raw?.samples?.[0]?.sampleId ?? testInfo?.samples?.[0]?.sampleId ?? '';
    const refunded = !!raw?.refundAfterCancelTest;
    const refundAmount = testInfo?.testPrice ?? raw?.testPrice ?? 0;

    // ✅ NEW: full test list for the eye-icon preview popup
    const allTests = Array.isArray(raw?.tests) && raw.tests.length > 0
      ? raw.tests.map((t: any) => ({
          testName: t?.testName ?? '-',
          status: (t?.cancelDate || t?.deleted) ? 'CANCELLED' : (t?.status ?? 'CANCELLED')
        }))
      : [{ testName: raw?.testName ?? testInfo?.testName ?? '-', status: 'CANCELLED' }];

    return {
      bookingId: raw?.bookingId,
      bookingDate: this.formatDate(raw?.created_on),
      patientName: `${raw?.title ? this.capitalize(raw.title) + ' ' : ''}${raw?.customerName ?? ''}`.trim(),
      gender: raw?.gender,
      age: raw?.age,
      testName: raw?.testName ?? testInfo?.testName ?? '',
      tests: allTests, // ✅ NEW

      // ✅ FIX: booking-status.page.ts sarkha full fallback cascade —
      // customFranchiseLab -> flat franchiseName -> nested franchise.franchiseName -> 'SELF'
      labName: raw?.customFranchiseLab?.trim()
        || raw?.franchiseName
        || raw?.franchise?.franchiseName
        || raw?.franchise?.centerCode
        || 'SELF',

      // ✅ FIX: customDoctorName -> flat doctorName -> nested doctor.doctor_name -> 'N/A'
      doctorName: raw?.customDoctorName?.trim()
        || raw?.doctorName
        || raw?.doctor?.doctor_name
        || 'N/A',

      barcode,
      reason: raw?.comment ?? '',
      cancelDate: this.formatDate(raw?.cancelDate),
      refundStatus: refunded ? 'REFUNDED' : null,
      refundAmount,
      testMappingId: raw?.bookingWithTestMappingId ?? testInfo?.testMappingId ?? null
    };
  }

  private capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

async loadCancelTests() {
  this.isLoading = true;
  try {
    const res: any = await this.labApiService
      .getCancelTests(this.startDate, this.nextDay(this.endDate), 500)   // ✅ NEW — end date + 1 day
      .toPromise();

    console.log('CANCEL TESTS RAW RESPONSE:', res);

    let rawList: any[] = [];
    if (Array.isArray(res)) {
      rawList = res;
    } else if (Array.isArray(res?.data)) {
      rawList = res.data;
    } else if (Array.isArray(res?.content)) {
      rawList = res.content;
    } else if (Array.isArray(res?.data?.content)) {
      rawList = res.data.content;
    } else {
      console.warn('CANCEL TESTS: recognized array sapadli nahi response madhe.');
      rawList = [];
    }

    this.allTests = rawList.map(raw => this.mapRawItem(raw));
    this.applySearch();
  } catch (err) {
    console.error('Cancel test list fetch failed', err);
    this.showToast('Data load karta ala nahi. Parat try kara.', 'danger');
  } finally {
    this.isLoading = false;
  }
}
  onDateChange() {
    this.loadCancelTests();
  }

  applySearch() {
    if (!Array.isArray(this.allTests)) {
      this.allTests = [];
    }
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredTests = [...this.allTests];
      return;
    }
    this.filteredTests = this.allTests.filter(t =>
      t.patientName?.toLowerCase().includes(term) ||
      t.testName?.toLowerCase().includes(term) ||
      t.barcode?.toLowerCase().includes(term) ||
      String(t.bookingId).includes(term)
    );
  }

  async resend(item: any) {
    this.resendingId = item.bookingId;
    const loading = await this.loadingCtrl.create({ message: 'Barcode resend hot ahe...' });
    await loading.present();

    try {
      await this.labApiService
        .resendBarcode({ bookingId: item.bookingId, barcode: item.barcode, testMappingId: item.testMappingId })
        .toPromise();
      this.showToast('Barcode yashasvi resend zala ✅', 'success');
    } catch (err) {
      console.error('Resend barcode failed', err);
      this.showToast('Resend fail zala. Parat try kara.', 'danger');
    } finally {
      await loading.dismiss();
      this.resendingId = null;
    }
  }

  async doRefresh(event: any) {
    await this.loadCancelTests();
    event?.target?.complete();
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }

  // ---------- test preview modal (eye icon) ----------
  openTestPreview(item: any, event?: MouseEvent): void {
    event?.stopPropagation();
    this.previewItem = item;
    this.isTestPreviewModalOpen = true;
  }

  closeTestPreview(): void {
    this.isTestPreviewModalOpen = false;
    this.previewItem = null;
  }
}