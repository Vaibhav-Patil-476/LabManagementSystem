// commission-history.page.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Subscription } from 'rxjs';

import { LabApiService } from '../../../core/services/lab-api';
import { CommissionRecord, CommissionRow, Franchise } from '../../../core/models/commission.model';


import { AuthService } from '../../../core/services/auth';

const PAGE_SIZE = 50; // rows per "page" shown in the UI (client-side slice)

@Component({
  selector: 'app-commission-history',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: './commission-history.component.html',  
  styleUrls: ['./commission-history.component.scss']  
})
export class CommissionHistoryPage implements OnInit, OnDestroy {

  labId: number | null = null;
  private userSub?: Subscription;

  franchises: Franchise[] = [];
  selectedFranchiseId: number | null = null;

  // NEW: tracks which booking row is currently highlighted/selected in the table
  selectedRowIndex: number | null = null;

  // UI मध्ये दाखवायला/filter करायला वापरले जाणारे ISO string dates.
  // सुरुवातीपासूनच current month (1 तारीख -> आज) असे pre-filled असतील --
  // "From - To" placeholder ऐवजी लगेच actual date-range दिसेल (ledger सारखं).
  startDate: string | null = null;
  endDate: string | null = null;

  // mat-date-range-picker ला bind करण्यासाठी Date objects
  pickedStartDate: Date | null = null;
  pickedEndDate: Date | null = null;

  private allRecords: CommissionRecord[] = [];   // full dataset for the selected franchise
  filteredRows: CommissionRow[] = [];             // after date filter + formatting
  visibleRows: CommissionRow[] = [];              // after client-side "pagination" slice

  isLoading = false;
  isExporting = false;
  hasSearched = false; // controls when the summary cards / list first appear

  // Summary stat values shown in the colored cards
  totalCommission = 0;
  totalBookings = 0;
  totalBookingAmount = 0;
  avgCommission = 0;

  // date-range field चा trigger box -- calendar panel ला याच्याखाली position करण्यासाठी
  @ViewChild('dateFieldTrigger') dateFieldTrigger!: ElementRef<HTMLElement>;

  constructor(
    private labApi: LabApiService,
    private auth: AuthService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    // CHANGED: यापुढे कुठलाही default date-range सेट केला जात नाही --
    // पेज उघडल्यावर लगेच "All Dates" साठी auto-search होईल, user ला
    // date select/clear करायची गरज नाही.
    if (this.auth.currentUserValue) {
      this.labId = this.auth.labId;
      this.loadFranchises();
    } else {
      this.userSub = this.auth.currentUser$.subscribe(user => {
        if (user && this.labId == null) {
          this.labId = this.auth.labId;
          this.loadFranchises();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  loadFranchises(): void {
    if (this.labId == null) return;
    this.labApi.getFranchisesPage(this.labId, 0, 100).subscribe({
      next: (res: any) => {
        this.franchises = res?.content ?? [];
        if (this.franchises.length && this.selectedFranchiseId === null) {
          this.selectedFranchiseId = this.franchises[0].franchiseId;
          // NEW: franchise + date दोन्ही आधीच ठरलेले आहेत -- त्यामुळे इथेच
          // auto-search करून टाक, user ला "SEARCH" बटण दाबायची गरज नाही.
          this.search();
        }
      },
      error: () => this.showToast('Franchise list load करता आली नाही')
    });
  }

  get selectedFranchiseLabel(): string {
    const f = this.franchises.find(x => x.franchiseId === this.selectedFranchiseId);
    return f?.franchiseName ?? 'Select franchise';
  }

  get dateRangeLabel(): string {
    if (!this.startDate || !this.endDate) return 'All Dates';
    return `${this.shortDate(this.startDate)} – ${this.shortDate(this.endDate)}`;
  }

  private shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  clearFranchise(): void {
    this.selectedFranchiseId = null;
    this.hasSearched = false;
    this.filteredRows = [];
    this.visibleRows = [];
  }

  // NEW: franchise dropdown मधून निवड बदलल्यावर लगेच auto-search व्हावं
  // म्हणून (ionChange) ने हे कॉल केलं जातं.
  onFranchiseSelectChange(): void {
    if (this.selectedFranchiseId != null) {
      this.search();
    }
  }

  clearDateFilter(): void {
    // NEW: date पूर्ण null कर -- म्हणजे कुठलंही date select न करता
    // सगळा (all-time) data दिसेल. onRangeDateChange() आपोआप
    // startDate/endDate ला null सेट करून auto-search करेल.
    this.pickedStartDate = null;
    this.pickedEndDate = null;
    this.onRangeDateChange();
  }

  onDateFilterChange(): void {
    // Pill label आपोआप dateRangeLabel getter मधून अपडेट होतो.
  }

  // NEW: mat-date-range-input मधून (dateChange) आल्यावर pickedStartDate/pickedEndDate
  // (Date objects) -> startDate/endDate (ISO strings, जुनं logic वापरतं ते) sync कर,
  // आणि लगेच auto-search करून टाक -- user ला वेगळं "SEARCH" बटण दाबायची गरज नाही.
  onRangeDateChange(): void {
    this.startDate = this.pickedStartDate ? this.toIsoDate(this.pickedStartDate) : null;
    this.endDate = this.pickedEndDate ? this.toIsoDate(this.pickedEndDate) : null;
    this.onDateFilterChange();

    if (this.selectedFranchiseId != null) {
      this.search();
    }
  }

  // calendar overlay open झाल्यावर त्याची position manually
  // date-field trigger box च्या खाली force करायची.
  onPickerOpened(): void {
    setTimeout(() => {
      const panel = document.querySelector('.cdk-overlay-pane') as HTMLElement;
      const trigger = this.dateFieldTrigger?.nativeElement;
      if (panel && trigger) {
        const rect = trigger.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.top = `${rect.bottom + 6}px`;
        panel.style.left = `${rect.left}px`;
        panel.style.right = 'auto';
        panel.style.transform = 'none';
        panel.style.margin = '0';
      }
    });
  }

  private toIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Search entry point -- आता manual क्लिक व्यतिरिक्त franchise/date बदलल्यावर,
   *  आणि पहिल्यांदा पेज उघडल्यावरही (button click शिवाय) auto-call होतो. */
  async search(): Promise<void> {
    if (this.selectedFranchiseId == null) {
      this.showToast('आधी franchise निवड');
      return;
    }
    this.hasSearched = true;
    await this.loadCommissionData();
  }

  private async loadCommissionData(): Promise<void> {
    if (this.selectedFranchiseId == null || this.labId == null) return;
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: 'Loading...' });
    await loading.present();

    try {
      this.allRecords = await this.labApi.getAllCommissionHistory(this.selectedFranchiseId);
      this.applyFilters();
    } catch {
      this.showToast('Commission data load करताना error आली');
    } finally {
      this.isLoading = false;
      loading.dismiss();
    }
  }

  /** Re-applies the date-range filter (client-side -- API has no date params
   *  for this endpoint) and rebuilds the display rows + summary stats. */
  private applyFilters(): void {
    const startMs = this.startDate ? new Date(this.startDate).setHours(0, 0, 0, 0) : null;
    const endMs = this.endDate ? new Date(this.endDate).setHours(23, 59, 59, 999) : null;

    const filtered = this.allRecords.filter(r => {
      if (startMs != null && (r.commissionDate == null || r.commissionDate < startMs)) return false;
      if (endMs != null && (r.commissionDate == null || r.commissionDate > endMs)) return false;
      return true;
    });

    this.filteredRows = filtered.map(r => this.toRow(r));
    this.visibleRows = this.filteredRows.slice(0, PAGE_SIZE);

    this.totalBookings = filtered.length;
    this.totalCommission = filtered.reduce((sum, r) => sum + (r.commission ?? 0), 0);
    this.totalBookingAmount = filtered.reduce((sum, r) => sum + (r.bookingAmount ?? 0), 0);
    this.avgCommission = this.totalBookings ? this.totalCommission / this.totalBookings : 0;
  }

  loadMore(event: any): void {
    const nextLength = this.visibleRows.length + PAGE_SIZE;
    this.visibleRows = this.filteredRows.slice(0, nextLength);
    event.target.complete();
    if (this.visibleRows.length >= this.filteredRows.length) {
      event.target.disabled = true;
    }
  }

  // NEW: toggles the highlighted/selected state of a row in the booking table.
  // Clicking the same row again clears the selection.
  selectRow(index: number): void {
    this.selectedRowIndex = this.selectedRowIndex === index ? null : index;
  }

  /** Converts a raw API record into a display-ready row: date formatting,
   *  null placeholders, and profile-vs-individual-test grouping. */
  private toRow(record: CommissionRecord): CommissionRow {
    const tests = record.testList ?? [];
    let testsLabel = '—';
    let isProfile = false;

    if (tests.length) {
      const firstProfileId = tests[0].profileId ?? 0;
      const allSameProfile = firstProfileId !== 0 && tests.every(t => (t.profileId ?? 0) === firstProfileId);

      if (allSameProfile && tests[0].profileName) {
        testsLabel = tests[0].profileName;
        isProfile = true;
      } else {
        testsLabel = tests.map(t => t.testName).join(', ');
      }
    }

    return {
      bookingId: record.bookingId,
      commissionDateLabel: this.formatDate(record.commissionDate),
      bookingDateLabel: this.formatDate(record.bookingDate),
      bookingAmountLabel: record.bookingAmount != null ? `₹ ${record.bookingAmount}` : 'Rs./-',
      commission: record.commission,
      testsLabel,
      isProfile,
      bookedByLabel: record.bookedBy && record.bookedBy.trim() ? record.bookedBy : '////',
      raw: record
    };
  }

  private formatDate(epochMs: number | null): string {
    if (epochMs == null) return '-';
    const d = new Date(epochMs);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }


  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'bottom' });
    await toast.present();
  }
}