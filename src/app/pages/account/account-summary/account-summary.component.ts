import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { LabApiService } from '../../../core/services/lab-api';
import { AuthService } from '../../../core/services/auth';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface LedgerSummary {
  openingBalance: number;
  closingBalance: number;
  bookingAmount: number;
  cancellationRefund: number;
  commissionAmount: number;
  depositAmount: number;
  razorpayDepositAmount: number;
  inventoryDebit: number;
  debitedAdjustedAmount: number;
}

interface FranchiseOption {
  franchiseId: number;
  franchiseName: string;
}

interface TransactionRow {
  bookingId: number;
  franchiseId: number | null;
  franchiseName: string;
  createdOn: number;
  transactionType: 'DEBIT' | 'CREDIT';
  balance: number;
  description: string;
  customerName: string;
  testNames: string[];
  openingBalance: number;
  closingBalance: number;
}

@Component({
  selector: 'app-account-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  templateUrl: './account-summary.component.html',
  styleUrls: ['./account-summary.component.scss']
})
export class AccountSummaryComponent implements OnInit {

  franchises: FranchiseOption[] = [];
  selectedFranchise: FranchiseOption | null = null;
  franchiseSearchTerm = '';
  franchiseDropdownOpen = false;

  startDate: string = this.formatDate(this.defaultStartDate());
  endDate: string = this.formatDate(new Date());

  @ViewChild('rangePicker') rangePicker!: any;
  @ViewChild('dateFieldTrigger') dateFieldTrigger!: ElementRef<HTMLElement>;
  rangeStart: Date | null = null;
  rangeEnd: Date | null = null;

  ledgerSummary: LedgerSummary | null = null;
  loadingSummary = false;
  fromDate: string = this.todayIso();
  toDate: string = this.todayIso();
  transactions: TransactionRow[] = [];
  loadingTransactions = false;
  searchBookingId = '';
  sortBy: 'newest' | 'oldest' = 'newest';
  sortOptions = [
    { value: 'newest', label: 'Booking Date (Newest first)' },
    { value: 'oldest', label: 'Booking Date (Oldest first)' }
  ];

  currentPage = 0;
  pageSize = 100;
  totalPages = 1;
  totalEntries = 0;
  loadingMore = false;

  selectedRowIndex: number | null = null;

  franchiseLoadError = '';
  summaryLoadError = '';
  transactionsLoadError = '';

  constructor(
    private labApiService: LabApiService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadFranchises();
  }

  get hasMore(): boolean {
    return this.currentPage < this.totalPages - 1;
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------------- Franchise dropdown ----------------
  loadFranchises(): void {
    this.franchiseLoadError = '';

    this.labApiService.getFranchisesPage(this.authService.labId, 0, 20).subscribe({
      next: (res: any) => {
        const list: any[] =
          res?.content ??
          res?.data?.content ??
          res?.data ??
          (Array.isArray(res) ? res : []);

        this.franchises = list.map((f: any) => ({
          franchiseId: f.franchiseId ?? f.id,
          franchiseName: f.franchiseName ?? f.name
        }));

        if (!this.franchises.length) {
          this.franchiseLoadError = 'No franchises returned from API.';
        } else if (!this.selectedFranchise) {
          this.selectFranchise(this.franchises[0]);
        }
      },
      error: (err) => {
        this.franchiseLoadError = 'Failed to load franchises.';
        console.error('[AccountSummary] Franchise list load error:', err);
      }
    });
  }

  get filteredFranchises(): FranchiseOption[] {
    const term = this.franchiseSearchTerm.trim().toLowerCase();
    if (!term) return this.franchises;
    return this.franchises.filter(f => f.franchiseName?.toLowerCase().includes(term));
  }

  openFranchisePicker(): void {
    this.franchiseDropdownOpen = true;
    this.franchiseSearchTerm = '';
  }

  closeFranchisePicker(): void {
    this.franchiseDropdownOpen = false;
  }

  selectFranchise(f: FranchiseOption): void {
    this.selectedFranchise = f;
    this.franchiseDropdownOpen = false;
    this.franchiseSearchTerm = '';
    this.loadAll();
  }

  clearFranchise(): void {
    this.selectedFranchise = null;
    this.ledgerSummary = null;
    this.transactions = [];
  }

  private defaultStartDate(): Date {
    const d = new Date();
    d.setDate(1);
    return d;
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private toDateObj(dateStr: string): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00');
  }

  private toDateStr(d: Date | null): string {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
      if (this.selectedFranchise) {
        this.loadAll();
      }
    }
  }

  // ✅ NEW: calendar open zaल्यावर, tyachi position manually
  // date box chya khali force karto — Material/Ionic scroll-container
  // chya automatic-positioning conflict var depend na rahता.
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

  // ---------------- Load data ----------------
  loadAll(): void {
    if (!this.selectedFranchise) {
      console.warn('[AccountSummary] loadAll() called but selectedFranchise is null');
      return;
    }
    this.currentPage = 0;
    this.selectedRowIndex = null;
    this.loadLedgerSummary();
    this.loadTransactions(false);
  }

  loadLedgerSummary(): void {
    if (!this.selectedFranchise) return;
    this.loadingSummary = true;
    this.summaryLoadError = '';

    this.labApiService
      .getWalletLedger(this.selectedFranchise.franchiseId, this.startDate, this.endDate)
      .subscribe({
        next: (res: any) => {
          const summary = res?.data ?? res;
          this.ledgerSummary = summary ?? null;
          this.loadingSummary = false;

          if (!this.ledgerSummary) {
            this.summaryLoadError = 'Ledger summary response was empty.';
          }
        },
        error: (err) => {
          this.loadingSummary = false;
          this.summaryLoadError = 'Failed to load ledger summary.';
          console.error('[AccountSummary] getWalletLedger error:', err);
        }
      });
  }

  loadTransactions(append: boolean = false): void {
    if (!this.selectedFranchise) return;

    if (append) {
      this.loadingMore = true;
    } else {
      this.loadingTransactions = true;
    }
    this.transactionsLoadError = '';

    this.labApiService
      .getWalletSummary(
        this.authService.labId,
        this.selectedFranchise.franchiseId,
        this.startDate,
        this.endDate,
        this.currentPage,
        this.pageSize
      )
      .subscribe({
        next: (res: any) => {
          const page =
            res?.transaction ??
            res?.data?.transaction ??
            res?.data ??
            res;

          const rows: any[] = page?.content ?? (Array.isArray(page) ? page : []);

          const mapped: TransactionRow[] = rows.map((r: any) => ({
            bookingId: r.bookingId || 0,
            franchiseId:
              r.franchiseId ??
              r.bookingDto?.franchiseId ??
              r.franchise?.franchiseId ??
              r.company?.franchiseId ??
              this.selectedFranchise?.franchiseId ??
              null,
            franchiseName:
              r.company?.franchiseName ??
              r.company?.companyName ??
              r.company?.name ??
              r.franchise?.franchiseName ??
              r.franchiseName ??
              this.selectedFranchise?.franchiseName ??
              '-',
            createdOn: r.createdOn,
            transactionType: r.transactionType,
            balance: r.balance,
            description: r.description,
            customerName: r.bookingDto?.customerName ?? r.customerName ?? 'N/A',
            testNames: (r.bookingDto?.tests || r.testNames || []).map((t: any) =>
              typeof t === 'string' ? t : t.testName
            ),
            openingBalance: r.openingBalance,
            closingBalance: r.closingBalance
          }));

          this.transactions = append ? [...this.transactions, ...mapped] : mapped;

          this.totalPages = page?.totalPages ?? 1;
          this.totalEntries = page?.totalElements ?? rows.length;
          this.loadingTransactions = false;
          this.loadingMore = false;
        },
        error: (err) => {
          this.loadingTransactions = false;
          this.loadingMore = false;
          this.transactionsLoadError = 'Failed to load transactions.';
          console.error('[AccountSummary] getWalletSummary error:', err);
        }
      });
  }

  loadMore(): void {
    if (!this.hasMore || this.loadingMore) return;
    this.currentPage++;
    this.loadTransactions(true);
  }

  // ---------------- Table: search / sort ----------------
  get filteredTransactions(): TransactionRow[] {
    let rows = [...this.transactions];

    if (this.searchBookingId.trim()) {
      rows = rows.filter(r => String(r.bookingId).includes(this.searchBookingId.trim()));
    }

    rows.sort((a, b) =>
      this.sortBy === 'newest' ? b.createdOn - a.createdOn : a.createdOn - b.createdOn
    );

    return rows;
  }

  onSortChange(value: 'newest' | 'oldest'): void {
    this.sortBy = value;
  }

  selectRow(i: number): void {
    this.selectedRowIndex = this.selectedRowIndex === i ? null : i;
  }

  // ---------------- Net business (debit/credit totals) ----------------
  get netDebitTotal(): number {
    return this.transactions
      .filter(t => t.transactionType === 'DEBIT')
      .reduce((sum, t) => sum + (Number(t.balance) || 0), 0);
  }

  get netCreditTotal(): number {
    return this.transactions
      .filter(t => t.transactionType === 'CREDIT')
      .reduce((sum, t) => sum + (Number(t.balance) || 0), 0);
  }

  get netBusinessTotal(): number {
    return this.netCreditTotal - this.netDebitTotal;
  }

  // ---------------- Export (TODO: connect actual export API) ----------------
  exportPdf(): void {}
  exportExcel(): void {}

  // ---------------- Template helpers ----------------
  formatDateTime(ts: number): string {
    if (!ts) return '-';
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day}-${month}-${d.getFullYear()} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }

  formatCurrency(amount: number | undefined | null): string {
    return `₹${(amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}