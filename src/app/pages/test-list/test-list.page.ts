import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
  IonRefresher, IonRefresherContent, IonIcon, IonButton, IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline, listOutline, refreshOutline, eyeOutline, closeOutline,
  alertCircleOutline, documentTextOutline, openOutline, downloadOutline
} from 'ionicons/icons';
import { registerPlugin, Capacitor } from '@capacitor/core';

import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { RoleService } from '../../core/services/role';

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// ✅ pdfmake 0.2.x ची vfs सेट करण्याची पद्धत (कंपनीच्या वेब कोडप्रमाणे)
pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

// Native Android plugin (PdfDownloadPlugin.java) register करणे
interface PdfDownloadPlugin {
  savePdf(options: { fileName: string; data: string }): Promise<{
    success: boolean;
    fileName: string;
    uri: string;
  }>;
}
const PdfDownload = registerPlugin<PdfDownloadPlugin>('PdfDownload');

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
    IonRefresher, IonRefresherContent, IonIcon, IonButton, IonSpinner
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
  // PDF EXPORT (client-side, backend ला call नाही)
  // ============================================================
  isExportingPdf = false;

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
      'open-outline': openOutline,
      'download-outline': downloadOutline
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

    // ✅ FIX: franchiseId फक्त तेव्हाच backend ला पाठवा जेव्हा login
    // केलेली entity प्रत्यक्ष एखादी franchise आहे (ROLE_FRANCHISE /
    // ROLE_FRANCHISE_STAFF). आधी role कुठलाही असो, नेहमी
    // authService.franchiseId पाठवला जायचा — त्यामुळे LAB_ADMIN /
    // STAFF login केल्यावरही backend तो franchiseId वापरून तिथल्या
    // franchise पुरताच (चुकीचा/मर्यादित) tests subset return करत होता,
    // आणि web वर दिसणाऱ्या full lab-wide count पेक्षा mobile वर कमी
    // count दिसत होता. आता LAB_ADMIN / STAFF साठी franchiseId
    // undefined राहील, त्यामुळे backend पूर्ण lab-wide master list
    // देईल (web शी match होईल), आणि franchise login चं जुनं
    // filtered behavior तसंच सुरक्षित राहील.
    const role = this.authService.role;
    const isFranchiseRole =
      role === ROLE.FRANCHISE || role === ROLE.FRANCHISE_STAFF;

    const franchiseId = isFranchiseRole
      ? this.authService.franchiseId
      : undefined;

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
  // PDF EXPORT — सगळ्या टेस्ट्सची यादी client-side (pdfmake) generate
  // करून डिव्हाइसवर डाउनलोड करते.
  // ============================================================
  async exportTestPortfolioPdf(): Promise<void> {
    console.log('EXPORT CLICKED');
    if (this.isExportingPdf) return;
    this.isExportingPdf = true;

    try {
      const showMRP = this.canViewAmount;
      const showB2B = this.canViewAmount;

      // ===== TABLE HEADER =====
      const headerRow: any[] = [
        { text: 'Sr. No.', style: 'tableHeader', alignment: 'center' },
        { text: 'Test Name', style: 'tableHeader', alignment: 'left' },
      ];
      if (showMRP) {
        headerRow.push({ text: 'MRP (₹)', style: 'tableHeader', alignment: 'right' });
      }
      if (showB2B) {
        headerRow.push({ text: 'B2B (₹)', style: 'tableHeader', alignment: 'right' });
      }
      headerRow.push(
        { text: 'Sample Type', style: 'tableHeader', alignment: 'center' },
        { text: 'TAT (min)', style: 'tableHeader', alignment: 'center' }
      );

      const tableBody: any[] = [headerRow];

      // ===== TABLE ROWS =====
      this.filteredTests.forEach((test: TestListItem, index: number) => {
        const row: any[] = [
          { text: (index + 1).toString(), style: 'tableCell', alignment: 'center' },
          { text: test.testName || '-', style: 'tableCell', alignment: 'left' },
        ];
        if (showMRP) {
          row.push({ text: `₹ ${test.mrp ?? '-'}`, style: 'tableCell', alignment: 'right' });
        }
        if (showB2B) {
          row.push({ text: `₹ ${test.b2b ?? '-'}`, style: 'tableCell', alignment: 'right' });
        }
        row.push(
          { text: test.sampleType || '-', style: 'tableCell', alignment: 'center' },
          { text: test.tat ?? '-', style: 'tableCell', alignment: 'center' }
        );
        tableBody.push(row);
      });

      // ===== DYNAMIC COLUMN WIDTHS =====
      const tableWidths: any[] = ['auto', '*'];
      if (showMRP) tableWidths.push('auto');
      if (showB2B) tableWidths.push('auto');
      tableWidths.push('auto', 'auto');

      // ===== PDF DEFINITION =====
      const docDefinition: any = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [30, 60, 30, 60],

        header: [
          {
            text: 'Lab Test Portfolio Report',
            style: 'mainHeader',
            alignment: 'center',
            margin: [0, 10, 0, 4],
          },
        ],

        footer: (currentPage: number, pageCount: number) => ({
          columns: [
            {
              text: `Generated on: ${new Date().toLocaleDateString()}`,
              alignment: 'left',
              margin: [30, 5, 0, 5],
              fontSize: 8,
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              alignment: 'right',
              margin: [0, 5, 30, 5],
              fontSize: 8,
            },
          ],
        }),

        content: [
          {
            table: {
              headerRows: 1,
              widths: tableWidths,
              body: tableBody,
            },
            layout: {
              fillColor: (rowIndex: number) => (rowIndex === 0 ? '#e0e0e0' : null),
              hLineWidth: () => 0.75,
              vLineWidth: () => 0.5,
              hLineColor: () => '#aaa',
              vLineColor: () => '#aaa',
              paddingLeft: () => 6,
              paddingRight: () => 6,
              paddingTop: () => 4,
              paddingBottom: () => 4,
            },
          },
        ],

        styles: {
          mainHeader: { fontSize: 16, bold: true, color: '#333' },
          tableHeader: { bold: true, fontSize: 11, color: '#000', fillColor: '#f5f5f5' },
          tableCell: { fontSize: 10, color: '#333' },
        },

        defaultStyle: { font: 'Roboto' },
      };

      // ===== GENERATE PDF (client-side) =====
      console.log('DOC DEFINITION READY');
      console.log('DOC DEFINITION READY');
console.log('VFS CHECK:', pdfMake.vfs ? Object.keys(pdfMake.vfs).length + ' fonts loaded' : 'VFS EMPTY');

      const fileName = `Test-Portfolio-${Date.now()}.pdf`;
      console.log('PLATFORM:', Capacitor.getPlatform());

      if (Capacitor.getPlatform() === 'android') {
        // ✅ Native Android — 0.2.x callback-style getBase64()
        const base64Data: string = await new Promise((resolve, reject) => {
          try {
            pdfMake.createPdf(docDefinition).getBase64((data: string) => {
              console.log('BASE64 GENERATED, length:', data?.length);
              resolve(data);
            });
          } catch (e) {
            console.error('createPdf THREW:', e);
            reject(e);
          }
        });
        const result = await PdfDownload.savePdf({ fileName, data: base64Data });
        console.log('NATIVE SAVE RESULT:', result);
     } else {
  console.log('CALLING createPdf().open()');
  pdfMake.createPdf(docDefinition).open();
  console.log('open() CALLED');
}
    } catch (err) {
      console.error('PDF EXPORT ERROR:', err);
    } finally {
      this.isExportingPdf = false;
    }
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