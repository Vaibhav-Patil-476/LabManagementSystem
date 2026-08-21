import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
  IonRefresher, IonRefresherContent, IonIcon, IonButton, IonSpinner, IonModal
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline, listOutline, refreshOutline, eyeOutline, closeOutline,
  alertCircleOutline, documentTextOutline, openOutline
} from 'ionicons/icons';
import { Browser } from '@capacitor/browser';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { RoleService } from '../../core/services/role';
import { environment } from '../../../environments/environment';

/** Mapped shape used only by this page's template. */
interface TestListItem {
  testId: number;
  testName: string;
  testCode: string;
  mrp: number;
  b2b: number;
  sampleType: string;
  source: string;
  tat: string;
}

type PreviewState = 'loading' | 'ready' | 'error';

// Same role constants/rule dashboard.page.ts madhe vaparleli.
const ROLE = {
  LAB_ADMIN: 'ROLE_LAB_ADMIN',
  STAFF: 'ROLE_STAFF',
  FRANCHISE: 'ROLE_FRANCHISE',
  FRANCHISE_STAFF: 'ROLE_FRANCHISE_STAFF'
} as const;

@Component({
  selector: 'app-test-list',
  standalone: true,
  templateUrl: './test-list.page.html',
  styleUrls: ['./test-list.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
    IonRefresher, IonRefresherContent, IonIcon, IonButton, IonSpinner, IonModal
  ]
})
export class TestListPage implements OnInit {

  // ============================================================
  // DATA
  // ============================================================
  private allTests: TestListItem[] = [];
  filteredTests: TestListItem[] = [];
  pagedTests: TestListItem[] = [];

  isLoading = false;
  searchTerm = '';
  private searchDebounce: any = null;

  private readonly batchSize = 20;
  visibleCount = this.batchSize;

  // ============================================================
  // ACTION BUTTON (eye icon) — Dummy Report Preview (actual company PDF)
  // ============================================================
  isDetailModalOpen = false;
  selectedTest: TestListItem | null = null;

  previewState: PreviewState = 'loading';
  previewDownloadUrl: string | null = null;
  previewFileName: string | null = null;

  constructor(
    private labApi: LabApiService,
    private authService: AuthService,
    private roleService: RoleService
  ) {
    addIcons({
      'search-outline': searchOutline,
      'list-outline': listOutline,
      'refresh-outline': refreshOutline,
      'eye-outline': eyeOutline,
      'close-outline': closeOutline,
      'alert-circle-outline': alertCircleOutline,
      'document-text-outline': documentTextOutline,
      'open-outline': openOutline
    });
  }

  ngOnInit(): void {
    this.loadTests();
  }

  // ============================================================
  // ROLE / PERMISSION
  // ============================================================
  get canViewAmount(): boolean {
    const role = this.authService.role;
    if (role === ROLE.STAFF || role === ROLE.FRANCHISE_STAFF) return false;
    return role === ROLE.LAB_ADMIN || role === ROLE.FRANCHISE;
  }

  get isAdminRole(): boolean {
    return this.roleService.isLabAdmin;
  }

  // ============================================================
  // LOAD
  // ============================================================
  loadTests(): void {
    this.isLoading = true;
    const franchiseId = this.authService.franchiseId;

    this.labApi.getTests(franchiseId).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : (res?.content || []);
        this.allTests = list.map((t: any) => this.mapTest(t));
        this.applySearch();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('TEST LIST LOAD ERROR:', err);
        this.allTests = [];
        this.applySearch();
        this.isLoading = false;
      }
    });
  }

  private mapTest(t: any): TestListItem {
    return {
      testId: t.test_id ?? t.testId,
      testName: String(t.test_name ?? t.testName ?? 'Unnamed Test').trim(),
      testCode: String(t.test_code ?? t.short_code ?? '').trim(),
      mrp: Number(t.test_price ?? t.testMrp ?? 0),
      b2b: Number(this.isAdminRole ? (t.price2 ?? 0) : (t.assignedPrice ?? t.price2 ?? 0)),
      sampleType: String(
        t.sampleTypeName ?? t.sample_type_name ?? t.sampleType
        ?? (typeof t.sample_type === 'string' ? t.sample_type : '') ?? '-'
      ).trim() || '-',
      source: String(t.source ?? '-').trim() || '-',
      tat: String(t.tat ?? t.reportableTat ?? '-').trim() || '-'
    };
  }

  // ============================================================
  // SEARCH
  // ============================================================
  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applySearch(), 200);
  }

  applySearch(): void {
    const q = this.searchTerm.trim().toLowerCase();

    this.filteredTests = !q
      ? [...this.allTests]
      : this.allTests.filter(t =>
        t.testName.toLowerCase().includes(q) ||
        t.testCode.toLowerCase().includes(q) ||
        t.sampleType.toLowerCase().includes(q)
      );

    this.visibleCount = this.batchSize;
    this.updatePagedTests();
  }

  get totalEntries(): number {
    return this.filteredTests.length;
  }

  get hasMore(): boolean {
    return this.pagedTests.length < this.totalEntries;
  }

  private updatePagedTests(): void {
    this.pagedTests = this.filteredTests.slice(0, this.visibleCount);
  }

  loadMore(): void {
    this.visibleCount += this.batchSize;
    this.updatePagedTests();
  }

  // ============================================================
  // ACTION BUTTON — Dummy Report Preview
  // ============================================================
  openDetail(item: TestListItem): void {
    this.selectedTest = item;
    this.isDetailModalOpen = true;
    this.previewState = 'loading';
    this.previewDownloadUrl = null;
    this.previewFileName = null;

    const labId = this.authService.labId;

    // test-ranges nahi milale tarihi dummy report banवायचा prayatna karto
    // (fakt tya test cha parameters/results table rikama disel).
    this.labApi.getTestRanges(labId, item.testId).pipe(
      catchError(() => of([]))
    ).subscribe((ranges: any[]) => {
      const payload = this.buildDummyPreviewPayload(item, labId, Array.isArray(ranges) ? ranges : []);

      this.labApi.previewDummyReport(payload).subscribe({
        next: (res: any) => {
          if (res?.success && res?.downloadUrl) {
            this.previewDownloadUrl = res.downloadUrl;
            this.previewFileName = res.fileName ?? null;
            this.previewState = 'ready';
          } else {
            this.previewState = 'error';
          }
        },
        error: (err) => {
          console.error('DUMMY REPORT PREVIEW ERROR:', err);
          this.previewState = 'error';
        }
      });
    });
  }

  async openReport(url?: string | null): Promise<void> {
    const target = url ?? this.previewDownloadUrl;
    if (!target) return;
    await Browser.open({ url: target });
  }

  closeDetail(): void {
    this.isDetailModalOpen = false;
    this.selectedTest = null;
    this.previewState = 'loading';
    this.previewDownloadUrl = null;
    this.previewFileName = null;
  }

  retryPreview(): void {
    if (this.selectedTest) this.openDetail(this.selectedTest);
  }

  // ============================================================
  // DUMMY PAYLOAD BUILDER
  // ============================================================
  // ⚠️ NOTE: real booking object cha full shape (doctor/franchise/bill/user)
  // Network capture varun ghetla ahe. Ithe fakt values generic/dummy
  // theवlya ahet, structure exact same ठेवला ahे jenekarun backend/PDF
  // service la valid vatel.
  private buildDummyPreviewPayload(item: TestListItem, labId: number, ranges: any[]): any {
    const now = Date.now();
    const barcode = now.toString().slice(-10);

    const reportValues = ranges.map((tr: any) => ({ testRange: tr, value: null }));

    const dummyBooking = {
      bookingId: 0,
      patientId: null,
      qrcode: null,
      title: 'mr',
      qrUrl: '',
      customerName: 'John Doe',
      age: 28,
      ageType: 'years',
      gender: 'male',
      dob: null,
      mobileNumber: null,
      aadhaarNumber: '',
      address: '',
      history: '',
      uploadDoc: '',
      transfer: false,
      repeatId: 0,
      height: '',
      weight: '',
      urgent: false,
      onlineReport: false,
      homeCollection: false,
      membershipNo: '',
      subTotalAmount: item.mrp,
      totalAmount: item.mrp,
      discountType: null,
      discountAmount: 0,
      paymentCash: true,
      cashAmount: item.mrp,
      paymentUPI: false,
      upiAmount: 0,
      paymentOnline: false,
      onlineAmount: 0,
      paidAmount: item.mrp,
      dueAmount: 0,
      discountedAmount: 0,
      rateListDiscount: 0,
      discountFrom: 0,
      remark: '',
      bookingComment: null,
      paymentTransactionId: '',
      labId,
      createdBy: 0,
      createdOn: now,
      lastModifiedBy: 0,
      lastUpdatedOn: now,
      properties: null,
      version: 0,
      paymentmode: null,
      franchiseId: 0,
      doctorid: 0,
      customDoctorName: '',
      customFranchiseLabId: null,
      customFranchiseLab: '',
      customFranchiseLabData: null,

      tests: [{
        testMappingId: 0,
        testId: item.testId,
        testName: item.testName,
        testCode: item.testCode,
        tat: item.tat,
        testPrice: item.mrp,
        labPrice: 0,
        superFranchisePrice: 0,
        franchisePrice: 0,
        subFranchisePrice: 0,
        fluidId: 0,
        testMrp: item.mrp,
        isNew: false,
        testRepeat: false,
        testRepeated: false,
        discount: 0,
        samples: [{
          accessionId: 0,
          sampleId: barcode,
          sampleType: item.sampleType,
          status: 'RECEIVED'
        }],
        department: { departmentId: 0, departmentName: '' }
      }],

      samples: [{
        sampleAccessionId: 0,
        barcode,
        barcodeFile: '',
        bookingId: 0,
        sampleTypeId: 0,
        sampleType: item.sampleType,
        status: 'RECEIVED'
      }],

      bill: {
        billingId: 0, bookingId: 0, status: 'PAID', labId,
        createdBy: 0, createdOn: now, lastModifiedBy: 0, lastUpdatedOn: now,
        properties: null, version: 0, cancelled: false
      },

      transactions: [{
        billingTransactionMappingId: 0, billingId: 0,
        subTotalAmount: item.mrp, totalAmount: item.mrp, totalPaidAmount: item.mrp,
        currentPaidAmount: 0, currentDiscountAmount: 0, totalDueAmount: 0,
        paymentMode: null, labId, createdBy: 0, createdOn: now,
        lastModifiedBy: 0, lastUpdatedOn: now, properties: null, version: 0
      }],

      reports: [{
        reportId: 0,
        bookingId: 0,
        qcStatus: null,
        testId: item.testId,
        reportRepeat: false,
        profileId: 0,
        editing: true,
        reportValues,
        updateValues: null,
        labId,
        createdBy: 0,
        createdOn: now,
        lastModifiedBy: 0,
        lastUpdatedOn: now,
        properties: null,
        version: null,
        reportStatus: 'PENDING'
      }],

      user: { id: 0, username: 'demo', firstname: 'Demo', labId, labIds: String(labId), assingedLabs: null },
      doctor: { doctorId: 0, doctor_name: 'SELF', departmentId: '', labId },
      franchise: {
        franchiseId: 0, franchiseName: 'SELF', centerCode: '', lockReport: false, lockReportAmount: 0,
        accessMode: 'false', balanceNegative: false, paidType: null, wallet: null,
        superFranchiseActive: false, superFranchise: null,
        parentSuperFranchiseName: null, parentSuperFranchiseCenterCode: null,
        parentFranchiseName: null, parentFranchiseCenterCode: null,
        franchiseActive: false, franchise: null, subFranchiseActive: false, subFranchise: null, labId
      }
    };

    return {
      templateName: environment.reportTemplateName,
      params: {
        letterHead: true,
        domain: environment.domain,
        fLetterHead: false,
        waterMark: true,
        single: true,
        bookings: 0,
        token: this.authService.getToken(),
        bookingApi: null,
        labSettingsApi: `${environment.BASE_URL}/api/v1/lab/settings/${labId}`,
        reportTestId: 'null',
        cancelTest: '0',
        bookingData: [dummyBooking],
        preview: true
      }
    };
  }

  // ============================================================
  // REFRESH
  // ============================================================
  doRefresh(event: any): void {
    this.loadTests();
    setTimeout(() => event?.target?.complete(), 400);
  }

  // ============================================================
  // BADGE COLORS
  // ============================================================
  private readonly badgePalette = [
    '#db0d0d', '#bb09d6', '#0d7fdb', '#0dbf6d', '#e08b0d',
    '#0dbcbf', '#c2185b', '#5c6bc0', '#8d6e63', '#546e7a'
  ];

  private hashColor(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return this.badgePalette[hash % this.badgePalette.length];
  }

  sampleColor(sampleType: string): string {
    const known: Record<string, string> = {
      SERUM: '#db0d0d', EDTA: '#bb09d6', URINE: '#a3c910', CSF: '#7a0d1e',
      PUS: '#9acd00', TISSUE: '#e39fb0', SLIDE: '#f0b3c4', PLASMA: '#0d7fdb', SWAB: '#0dbf6d'
    };
    const key = sampleType.toUpperCase();
    return known[key] ?? this.hashColor(key);
  }

  sourceColor(source: string): string {
    const known: Record<string, string> = { RPL: '#0d7fdb', CPL: '#e85f8a' };
    const key = source.toUpperCase();
    if (known[key]) return known[key];
    for (const k of Object.keys(known)) {
      if (key.startsWith(k)) return known[k];
    }
    return this.hashColor(key);
  }
}