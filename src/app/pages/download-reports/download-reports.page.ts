import { Component, OnInit, OnDestroy, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonCheckbox, IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  downloadOutline, documentTextOutline, checkmarkDoneOutline,
  refreshOutline, timeOutline, alertCircleOutline, flaskOutline, searchOutline
} from 'ionicons/icons';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { LabApiService } from '../../services/lab-api';
import { AuthService } from '../../services/auth';
import { RoleService } from '../../services/role';
import { ToastService } from '../../services/toast';

// ---------------------------------------------------------------------------
// Status buckets — same 5 buckets shown on the Booking Status screen
// (Complete / Clinical / Partially Complete / Pending / SNR).
// Download is allowed ONLY on the COMPLETE bucket, and ONLY for Lab Admin.
// ---------------------------------------------------------------------------
export type ReportTabKey = 'COMPLETE' | 'CLINICAL' | 'PARTIALLY_COMPLETE' | 'PENDING' | 'SNR';

export interface ReportTestRow {
  name: string;
  status: string;       // e.g. IN PROCESS, COMPLETE, PENDING, SNR
  testCode?: string;
}

export interface ReportBookingRow {
  bookingId: number | string;
  patientId?: string;
  title?: string;
  name: string;
  genderAge?: string;
  barcodes: string[];       // one barcode per sample, e.g. ["ABC404089120 - EDTA", "ABC459730047 - CSF"]
  doctorName?: string;      // "(SELF) / Dr. self" style client-code/doctor label
  sampleCount: number;
  tests: ReportTestRow[];
  bookingDate?: string;
  createdBy?: number;       // id of the staff who booked this patient — used to scope staff view
  bucket: ReportTabKey;     // which of the 5 tabs this booking belongs to
}

@Component({
  selector: 'app-download-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonCheckbox, IonSpinner
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './download-reports.page.html',
  styleUrls: ['./download-reports.page.scss']
})
export class DownloadReportsPage implements OnInit, OnDestroy {

  readonly tabs: { key: ReportTabKey; label: string; badgeClass: string }[] = [
    { key: 'COMPLETE',            label: 'Complete',            badgeClass: 'badge-complete' },
    { key: 'CLINICAL',            label: 'Clinical',            badgeClass: 'badge-clinical' },
    { key: 'PARTIALLY_COMPLETE',  label: 'Partially Complete',  badgeClass: 'badge-partial' },
    { key: 'PENDING',             label: 'Pending',             badgeClass: 'badge-pending' },
    { key: 'SNR',                 label: 'SNR',                 badgeClass: 'badge-snr' },
  ];

  activeTab: ReportTabKey = 'COMPLETE';
  fromDate: string = this.todayIso();
  toDate: string = this.todayIso();
  quickSearch = '';
  franchiseId: any = null;

  allRows: ReportBookingRow[] = [];
  isLoading = false;
  isGenerating = false;

  selectedIds = new Set<string>();

  // single patient currently rendered into the hidden PDF template
  // (report is built one patient at a time so each gets its own page)
  currentPdfPatient: ReportBookingRow | null = null;

  @ViewChild('pdfTemplate') pdfTemplateRef!: ElementRef<HTMLDivElement>;

  constructor(
    private labApi: LabApiService,
    private authService: AuthService,
    public roleService: RoleService,
    private toast: ToastService
  ) {
    addIcons({ downloadOutline, documentTextOutline, checkmarkDoneOutline, refreshOutline, timeOutline, alertCircleOutline, flaskOutline, searchOutline });
  }

  ngOnInit() {
    this.loadData();
  }

  ngOnDestroy() { }

  // ================= DATA LOADING (real API only — no localStorage, no cache) =================
  loadData() {
    this.isLoading = true;
    this.selectedIds.clear();

    const labId = this.authService.labId;

    this.labApi.getBookingStatusNew(labId, 0, 200, this.fromDate, this.toDate, this.franchiseId)
      .subscribe({
        next: (res: any) => {
          // ASSUMPTION: response is either { content: [...] } (Spring Pageable) or a raw array.
          // Adjust the extraction below once the exact backend shape is confirmed.
          const list: any[] = res?.content ?? res?.data ?? (Array.isArray(res) ? res : []);

          let rows = list.map((item: any) => this.mapToRow(item));

          // Staff sees ONLY the patients they personally booked — never another staff's
          // patients, and never the admin-only actions (billing, download, etc.).
          if (this.roleService.isStaff) {
            const currentUserId = this.authService.userId;
            rows = rows.filter(r => r.createdBy === currentUserId);
          }

          this.allRows = rows;
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Failed to load report status data', err);
          this.toast.error('Error', 'Data load houu shakla nahi, punha try kara');
          this.isLoading = false;
        }
      });
  }

  onDateRangeChange() {
    this.loadData();
  }

  onFranchiseChange(id: any) {
    this.franchiseId = id;
    this.loadData();
  }

  // Maps one raw booking-status API record into the row shape this page uses.
  // ASSUMPTION: field names below (id/bookingId, patientName, tests[].testName,
  // tests[].status, createdBy, barcode) follow the same contract as the existing
  // Booking Status screen. Rename here if the real payload differs.
  private mapToRow(item: any): ReportBookingRow {
    const tests: ReportTestRow[] = (item.tests || item.testList || []).map((t: any) => ({
      name: t.testName ?? t.name ?? '-',
      status: (t.status ?? t.reportStatus ?? 'PENDING').toString().toUpperCase(),
      testCode: t.testCode ?? t.code
    }));

    const samples = item.samples || item.sampleList || [];
    const barcodes: string[] = samples.length
      ? samples.map((s: any) => `${s.barcode} - ${s.sampleType ?? s.type ?? ''}`.trim())
      : (item.barcode ? [item.barcode] : []);

    return {
      bookingId: item.bookingId ?? item.id,
      patientId: item.patientId ?? item.patientCode,
      title: item.title,
      name: item.patientName ?? item.name ?? '-',
      genderAge: item.gender && item.age ? `${item.gender}/${item.age}` : item.genderAge,
      barcodes,
      doctorName: item.doctorName ?? item.doctor?.name
        ? `(${item.clientCode ?? 'SELF'}) / Dr. ${item.doctorName ?? item.doctor?.name}`
        : '-',
      sampleCount: samples.length || barcodes.length,
      tests,
      bookingDate: item.bookingDate ?? item.createdOn,
      createdBy: item.createdBy ?? item.staffId ?? item.userId,
      bucket: this.deriveBucket(item, tests)
    };
  }

  // Completed-vs-total tests fraction shown as the "Reports" pill (e.g. "0/2").
  reportsFraction(item: ReportBookingRow): string {
    const total = item.tests.length;
    const done = item.tests.filter(t => t.status === 'COMPLETE').length;
    return `${done}/${total}`;
  }

  reportsComplete(item: ReportBookingRow): boolean {
    return item.tests.length > 0 && item.tests.every(t => t.status === 'COMPLETE');
  }

  // Buckets a booking into one of the 5 tabs, mirroring the Booking Status screen logic.
  // Prefer an explicit bucket/reportStatus field from the API if present; otherwise
  // derive it from the individual test statuses as a fallback.
  private deriveBucket(item: any, tests: ReportTestRow[]): ReportTabKey {
    const explicit = (item.bucket ?? item.overallStatus ?? '').toString().toUpperCase();
    if (['COMPLETE', 'CLINICAL', 'PARTIALLY_COMPLETE', 'PENDING', 'SNR'].includes(explicit)) {
      return explicit as ReportTabKey;
    }

    if (tests.length === 0) return 'PENDING';
    if (tests.every(t => t.status === 'SNR')) return 'SNR';
    if (tests.every(t => t.status === 'COMPLETE')) return 'COMPLETE';
    if (tests.some(t => t.status === 'COMPLETE') && tests.some(t => t.status !== 'COMPLETE')) return 'PARTIALLY_COMPLETE';
    if (tests.some(t => t.status === 'CLINICAL')) return 'CLINICAL';
    return 'PENDING';
  }

  // ================= TAB / TABLE HELPERS =================
  get rowsForActiveTab(): ReportBookingRow[] {
    const bucketRows = this.allRows.filter(r => r.bucket === this.activeTab);
    const q = this.quickSearch.trim().toLowerCase();
    if (!q) return bucketRows;

    return bucketRows.filter(r =>
      String(r.bookingId).toLowerCase().includes(q) ||
      (r.patientId || '').toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.barcodes.some(b => b.toLowerCase().includes(q))
    );
  }

  get totalBookings(): number {
    return this.allRows.length;
  }

  get bucketCount() {
    const counts: Record<ReportTabKey, number> = {
      COMPLETE: 0, CLINICAL: 0, PARTIALLY_COMPLETE: 0, PENDING: 0, SNR: 0
    };
    this.allRows.forEach(r => counts[r.bucket]++);
    return counts;
  }

  setTab(tab: ReportTabKey) {
    this.activeTab = tab;
    this.selectedIds.clear();
  }

  getTests(item: ReportBookingRow): string {
    return item.tests.map(t => t.name).join(', ') || '-';
  }

  // ================= ROLE GATES =================
  // Download button + selection checkboxes are ONLY available to Lab Admin,
  // and ONLY while looking at the Complete tab — a report can only be
  // downloaded once every test on the booking is actually complete.
  get canShowDownloadControls(): boolean {
    return this.roleService.canDownloadReports && this.activeTab === 'COMPLETE';
  }

  // ================= SELECTION (admin + Complete tab only) =================
  isSelected(item: ReportBookingRow): boolean {
    return this.selectedIds.has(String(item.bookingId));
  }

  toggleSelect(item: ReportBookingRow, checked: boolean) {
    if (!this.canShowDownloadControls) return;
    const id = String(item.bookingId);
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  get allSelected(): boolean {
    const rows = this.rowsForActiveTab;
    return rows.length > 0 && this.selectedIds.size === rows.length;
  }

  toggleSelectAll(checked: boolean) {
    if (!this.canShowDownloadControls) return;
    if (checked) {
      this.rowsForActiveTab.forEach(r => this.selectedIds.add(String(r.bookingId)));
    } else {
      this.selectedIds.clear();
    }
  }

  get selectedReports(): ReportBookingRow[] {
    return this.rowsForActiveTab.filter(r => this.selectedIds.has(String(r.bookingId)));
  }

  // ================= DOWNLOAD (jsPDF + html2canvas) =================
  // Builds one PDF where every selected patient gets their own page(s),
  // rendered from the same hidden template used for the on-screen preview.
  async downloadSelected() {
    if (!this.canShowDownloadControls) {
      // Defensive guard — UI already hides this action for non-admins / non-complete tabs.
      this.toast.error('Not allowed', 'Download फक्त Admin ला, Complete tab वर उपलब्ध आहे');
      return;
    }

    const selected = this.selectedReports;

    if (selected.length === 0) {
      this.toast.warning('Warning', 'Kripya kimman ek report select kara');
      return;
    }

    this.isGenerating = true;

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;

      for (let i = 0; i < selected.length; i++) {
        this.currentPdfPatient = selected[i];

        // let Angular finish rendering the template for this patient
        await new Promise(resolve => setTimeout(resolve, 80));

        const element = this.pdfTemplateRef.nativeElement;

        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) pdf.addPage();

        // handles the rare case where one patient's report itself
        // overflows a single A4 page (many tests / long notes)
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      const fileName = selected.length === 1
        ? `Report_${selected[0].bookingId}.pdf`
        : `Reports_${new Date().getTime()}.pdf`;

      pdf.save(fileName);

      // Persist the fact that this booking's report was downloaded/generated —
      // real API call, nothing kept in localStorage.
      selected.forEach(row => {
        this.labApi.updateReportRemark(Number(row.bookingId), {
          url: `generated-locally-${fileName}`
        }).subscribe({
          error: (err) => console.warn('Could not persist report-url for booking', row.bookingId, err)
        });
      });

      this.toast.success('Success', `${selected.length} report(s) downloaded`);
      this.selectedIds.clear();
    } catch (err) {
      console.error('PDF generation failed', err);
      this.toast.error('Error', 'Report download fail zhala, punha try kara');
    } finally {
      this.isGenerating = false;
      this.currentPdfPatient = null;
    }
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}