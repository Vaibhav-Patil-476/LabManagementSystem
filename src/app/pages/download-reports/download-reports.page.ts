import { Component, OnInit, OnDestroy, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonButton, IonIcon, IonCheckbox
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { downloadOutline, documentTextOutline, checkmarkDoneOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BookingService, Patient, TestItem } from '../../services/booking-status';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-download-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonButton, IonIcon, IonCheckbox
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './download-reports.page.html',
  styleUrls: ['./download-reports.page.scss']
})
export class DownloadReportsPage implements OnInit, OnDestroy {

  // full list, needed to keep barcode index stable (same formula as booking-status)
  allBookings: Patient[] = [];

  // only bookings whose payment is fully cleared
  readyReports: Patient[] = [];

  // track which rows are checked (Patient.id is a string)
  selectedIds = new Set<string>();

  isGenerating = false;

  // the single patient currently rendered into the hidden PDF template
  // (report is built one patient at a time so each gets its own page)
  currentPdfPatient: Patient | null = null;

  @ViewChild('pdfTemplate') pdfTemplateRef!: ElementRef<HTMLDivElement>;

  private sub!: Subscription;

  constructor(
    private bookingService: BookingService,
    private toast: ToastService
  ) {
    addIcons({ downloadOutline, documentTextOutline, checkmarkDoneOutline });
  }

  ngOnInit() {
    this.sub = this.bookingService.patients$.subscribe(data => {
      this.allBookings = data || [];
      this.readyReports = this.allBookings.filter(p => this.isFullyPaid(p));

      // drop selections for reports that are no longer in the ready list
      const readyIds = new Set(this.readyReports.map(r => String(r.id)));
      this.selectedIds.forEach(id => {
        if (!readyIds.has(id)) this.selectedIds.delete(id);
      });
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // ================= CORE LOGIC =================
  // Report is "ready" only when tests/amount exist AND nothing is due.
  isFullyPaid(item: Patient): boolean {
    const total = Number((item as any).totalAmount || (item as any).grandTotal || 0);
    const due = Number(item.dueAmount || 0);
    const hasTests = (item.tests || []).length > 0;
    return hasTests && total > 0 && due === 0;
  }

  // ================= TABLE HELPERS =================
  getTests(item: Patient): string {
    return (item.tests || []).map(t => t.name).join(', ') || '-';
  }

  getBarcode(item: Patient): string {
    const idx = this.allBookings.findIndex(b => b.id === item.id);
    return 'BC' + (1000 + (idx >= 0 ? idx : 0));
  }

  // ================= REPORT / RESULT HELPERS (used in the PDF template) =================
  // A result is abnormal when it falls outside the test's reference range —
  // shown bold/red on the printed report, exactly like a real lab report.
  isAbnormal(test: TestItem): boolean {
    const val = parseFloat(String(test.resultValue));
    if (isNaN(val) || test.refRangeLow == null || test.refRangeHigh == null) {
      return false;
    }
    return val < test.refRangeLow || val > test.refRangeHigh;
  }

  getRangeText(test: TestItem): string {
    if (test.refRangeLow == null || test.refRangeHigh == null) return '-';
    return `${test.refRangeLow} - ${test.refRangeHigh}`;
  }

  getReferenceLines(test: TestItem): string[] {
    return (test.referenceNote || '').split('\n').filter(line => line.trim().length > 0);
  }

  // ================= SELECTION =================
  isSelected(item: Patient): boolean {
    return this.selectedIds.has(String(item.id));
  }

  toggleSelect(item: Patient, checked: boolean) {
    const id = String(item.id);
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  get allSelected(): boolean {
    return this.readyReports.length > 0 && this.selectedIds.size === this.readyReports.length;
  }

  toggleSelectAll(checked: boolean) {
    if (checked) {
      this.readyReports.forEach(r => this.selectedIds.add(String(r.id)));
    } else {
      this.selectedIds.clear();
    }
  }

  get selectedReports(): Patient[] {
    return this.readyReports.filter(r => this.selectedIds.has(String(r.id)));
  }

  // ================= DOWNLOAD (jsPDF + html2canvas) =================
  // Builds one PDF where every selected patient gets their own page(s),
  // rendered from the same hidden template used for the on-screen preview.
  async downloadSelected() {
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
        ? `Report_${selected[0].id}.pdf`
        : `Reports_${new Date().getTime()}.pdf`;

      pdf.save(fileName);

      this.toast.success('Success', `${selected.length} report(s) downloaded`);
    } catch (err) {
      console.error('PDF generation failed', err);
      this.toast.error('Error', 'Report download fail zhala, punha try kara');
    } finally {
      this.isGenerating = false;
      this.currentPdfPatient = null;
    }
  }
}