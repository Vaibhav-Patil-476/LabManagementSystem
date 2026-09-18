import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Subscription } from 'rxjs';

import { LabApiService } from '../../../core/services/lab-api';
import { AuthService } from '../../../core/services/auth';
import {
  Franchise,
  PaymentTransaction,
  PaymentRow,
  LabPaymentTransaction,
  LabPaymentRow,
  GatewayAnalysisItem,
  GatewaySummary,
  GatewayFranchiseRow
} from '../../../core/models/payment-history';

type MainTab = 'ONLINE' | 'LAB';
type OnlineStatus = 'ALL' | 'SUCCESS' | 'ACTIVE' | 'CREATED' | 'FAILED';
type PaymentMode = 'ALL' | 'RAZORPAY' | 'CASHFREE' | 'UPI' | 'QR_CODE' | 'BANK_TRANSFER';
type UserRoleFilter = 'ALL' | 'LAB_ADMIN' | 'SUPER_FRANCHISE' | 'FRANCHISE';
type SortOrder = 'NEWEST' | 'OLDEST';

@Component({
  selector: 'app-payment-history',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: './payment-history.component.html',
  styleUrls: ['./payment-history.component.scss']
})

export class PaymentHistoryPage implements OnInit, OnDestroy {
  @ViewChild('tableScroll') tableScrollRef?: ElementRef<HTMLElement>;
  labId: number | null = null;
  private userSub?: Subscription;

  franchises: Franchise[] = [];
  selectedFranchiseId: number | null = null;

  startDate: string | null = null;
  endDate: string | null = null;
  pickedStartDate: Date | null = null;
  pickedEndDate: Date | null = null;

  @ViewChild('dateFieldTrigger') dateFieldTrigger!: ElementRef<HTMLElement>;

  hasSearched = false;
  isLoading = false;

  // ---------- Tabs ----------
  activeTab: MainTab = 'ONLINE';
  setTab(tab: MainTab): void {
    this.activeTab = tab;
    this.page = 0;
    this.selectedOnlineRowIndex = null;
    this.selectedLabRowIndex = null;
    if (tab === 'LAB' && this.hasSearched && this.labRecords.length === 0) {
      this.loadLabData();
    }
    // ✅ scroll डावीकडे रीसेट, थोड्या delay नंतर (DOM update झाल्यावर)
    setTimeout(() => {
      if (this.tableScrollRef?.nativeElement) {
        this.tableScrollRef.nativeElement.scrollLeft = 0;
      }
    }, 0);
  }

  // ---------- ONLINE tab: filters + data ----------
  quickSearchOnline = '';
  statusFilter: OnlineStatus = 'ALL';
  paymentModeFilter: PaymentMode = 'ALL';
  sortOrder: SortOrder = 'NEWEST';
  // ✅ UI filter value → API byUser param
  private readonly byUserMap: Record<UserRoleFilter, string> = {
    ALL: 'all',
    LAB_ADMIN: 'labAdmin',
    SUPER_FRANCHISE: 'superFranchise',
    FRANCHISE: 'franchise'
  };
  readonly statusOptions: { label: string; value: OnlineStatus }[] = [
    { label: 'All Status', value: 'ALL' },
    { label: 'Success', value: 'SUCCESS' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Created', value: 'CREATED' },
    { label: 'Fail', value: 'FAILED' }
  ];

  readonly paymentModeOptions: { label: string; value: PaymentMode }[] = [
    { label: 'All Modes', value: 'ALL' },
    { label: 'Razorpay', value: 'RAZORPAY' },
    { label: 'Cashfree', value: 'CASHFREE' },
    { label: 'UPI', value: 'UPI' },
    { label: 'QR Code', value: 'QR_CODE' },
    { label: 'BANK TRANSFER', value: 'BANK_TRANSFER' }
  ];

  readonly sortOptions: { label: string; value: SortOrder }[] = [
    { label: 'Newest First', value: 'NEWEST' },
    { label: 'Oldest First', value: 'OLDEST' }
  ];

  private allOnlineRecords: PaymentTransaction[] = [];
  onlineFilteredRows: PaymentRow[] = [];
  onlineVisibleRows: PaymentRow[] = [];

  // ---------- Gateway summary cards (Razorpay/Cashfree/etc.) ----------
  gatewaySummaries: GatewaySummary[] = [];
  selectedGatewayCard: string | null = null;

  // Maps each /order-analysis response field to a gateway card.
  // Add more entries here if the API starts returning
  // totalUpiAmount, totalBankAmount, etc.
  private readonly gatewayFieldMap: { field: keyof GatewayAnalysisItem; pgName: string; filterValue: PaymentMode }[] = [
    { field: 'totalRazorpayAmount', pgName: 'Razorpay', filterValue: 'RAZORPAY' },
    { field: 'totalCashfreeAmount', pgName: 'Cashfree', filterValue: 'CASHFREE' }
  ];

  private readonly gatewayLogoMap: Record<string, string> = {
  'Razorpay': 'assets/gateway-logos/razorpay.png',
  'Cashfree': 'assets/gateway-logos/cashfree.png'
};

getGatewayLogo(pgName: string): string {
  return this.gatewayLogoMap[pgName] || '';
}

  // ---------- LAB tab: filters + data ----------
  quickSearchLab = '';
  userRoleFilter: UserRoleFilter = 'ALL';
  sortOrderLab: SortOrder = 'NEWEST';

  readonly userRoleOptions: { label: string; value: UserRoleFilter }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Lab Admin', value: 'LAB_ADMIN' },
    { label: 'Super Franchise', value: 'SUPER_FRANCHISE' },
    { label: 'Franchise', value: 'FRANCHISE' }
  ];

  private labRecords: LabPaymentTransaction[] = [];
  labFilteredRows: LabPaymentRow[] = [];
  labVisibleRows: LabPaymentRow[] = [];

  // ---------- Pagination (client-side, mirrors company's footer) ----------
  page = 0;
  pageSizeOnline = 1000;
  pageSizeLab = 10;
  // ---------- Row selection (ledger-style highlight) ----------
  selectedOnlineRowIndex: number | null = null;
  selectedLabRowIndex: number | null = null;

  selectOnlineRow(index: number): void {
    this.selectedOnlineRowIndex = this.selectedOnlineRowIndex === index ? null : index;
  }

  selectLabRow(index: number): void {
    this.selectedLabRowIndex = this.selectedLabRowIndex === index ? null : index;
  }
  readonly pageSizeOptions = [10, 25, 50, 100, 500, 1000];

  get pageSize(): number {
    return this.activeTab === 'ONLINE' ? this.pageSizeOnline : this.pageSizeLab;
  }

  set pageSize(val: number) {
    if (this.activeTab === 'ONLINE') this.pageSizeOnline = val;
    else this.pageSizeLab = val;
    this.page = 0;
    this.applyPagination();
  }

  get totalRows(): number {
    return this.activeTab === 'ONLINE' ? this.onlineFilteredRows.length : this.labFilteredRows.length;
  }

  get totalPages(): number {
    return this.totalRows === 0 ? 0 : Math.ceil(this.totalRows / this.pageSize);
  }

  get currentPageLabel(): number {
    return this.totalPages === 0 ? 1 : this.page + 1;
  }

  goFirstPage(): void { this.page = 0; this.applyPagination(); }
  goPrevPage(): void { if (this.page > 0) { this.page--; this.applyPagination(); } }
  goNextPage(): void { if (this.page < this.totalPages - 1) { this.page++; this.applyPagination(); } }
  goLastPage(): void { this.page = Math.max(0, this.totalPages - 1); this.applyPagination(); }

  private applyPagination(): void {
    const start = this.page * this.pageSize;
    const end = start + this.pageSize;

    if (this.activeTab === 'ONLINE') {
      this.onlineVisibleRows = this.onlineFilteredRows.slice(start, end);
    } else {
      this.labVisibleRows = this.labFilteredRows.slice(start, end);
    }
  }

private getApiEndDate(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return this.toIsoDate(d);
}


private getApiStartDate(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return this.toIsoDate(d);
}
  constructor(
    private labApi: LabApiService,
    private auth: AuthService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) { }

  ngOnInit(): void {
    const today = this.toIsoDate(new Date());
    this.startDate = today;
    this.endDate = today;
    this.pickedStartDate = new Date();
    this.pickedEndDate = new Date();

    if (this.auth.currentUserValue) {
      this.labId = this.auth.labId;
      this.applyDefaultFranchise();
      this.loadFranchises();
    } else {
      this.userSub = this.auth.currentUser$.subscribe(user => {
        if (user && this.labId == null) {
          this.labId = this.auth.labId;
          this.applyDefaultFranchise();
          this.loadFranchises();
        }
      });
    }
  }

  // ✅ franchise user असेल तरच स्वतःचा franchiseId default सेट कर;
  // Lab Admin साठी franchiseId 0 येतो, तेव्हा "All Franchises" (null) राहील.
  private applyDefaultFranchise(): void {
    const loggedInFranchiseId = this.auth.franchiseId;
    if (loggedInFranchiseId && loggedInFranchiseId > 0) {
      this.selectedFranchiseId = loggedInFranchiseId;
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
        this.search();
      },
      error: () => this.showToast('Franchise list load करता आली नाही')
    });
  }

  get selectedFranchiseLabel(): string {
    const f = this.franchises.find(x => x.franchiseId === this.selectedFranchiseId);
    return f?.franchiseName ?? 'All Franchises';
  }

  get dateRangeLabel(): string {
    if (!this.startDate || !this.endDate) return 'All Dates';
    return `${this.shortDate(this.startDate)} – ${this.shortDate(this.endDate)}`;
  }

  private shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  clearFranchise(): void {
    this.selectedFranchiseId = null;
    this.search();
  }

  onFranchiseSelectChange(): void {
    this.search();
  }

  clearDateFilter(): void {
    this.pickedStartDate = null;
    this.pickedEndDate = null;
    this.onRangeDateChange();
  }

  onRangeDateChange(): void {
    this.startDate = this.pickedStartDate ? this.toIsoDate(this.pickedStartDate) : null;
    this.endDate = this.pickedEndDate ? this.toIsoDate(this.pickedEndDate) : null;
    this.search();
  }

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

  async search(): Promise<void> {
    if (!this.startDate || !this.endDate) {
      return;
    }
    this.hasSearched = true;
    this.page = 0;

    await Promise.all([
      this.loadOnlineData(),
      this.loadGatewaySummaries()
    ]);

    if (this.activeTab === 'LAB') {
      await this.loadLabData();
    }
  }

  // ---------- ONLINE data load + filters ----------

  private async loadOnlineData(): Promise<void> {
    if (!this.startDate || !this.endDate) return;
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Payment data loading...',
      cssClass: 'payment-loading-popup'
    });
    await loading.present();

    try {
const res: any = await this.labApi.getOrderPayments(
  this.startDate,
  this.getApiEndDate(this.endDate),
  this.selectedFranchiseId ?? undefined
).toPromise();

      console.log('RAW PAYMENT RESPONSE:', JSON.stringify(res, null, 2)); // TEMP debug

      const list: any[] = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
      this.allOnlineRecords = list.map((r: any) => this.toOnlineRecord(r));
      this.applyOnlineFilters();
    } catch {
      this.allOnlineRecords = [];
      this.applyOnlineFilters();   // ✅ यामुळे onlineFilteredRows रिकामे होतील, template आपोआप "no data" text दाखवेल
    } finally {
      this.isLoading = false;
      loading.dismiss();
    }
  }

  // ✅ actual field names प्रमाणे
  private toOnlineRecord(raw: any): PaymentTransaction {
    return {
      id: raw?.paymentId,
      date: raw?.createdOn ?? null,
      amount: Number(raw?.amount ?? 0),
      centerCode: raw?.centerCode ?? '',
      orderId: raw?.orderId ?? '',
      status: raw?.paymentStatus ?? '',
      pgName: raw?.pgName ?? '',
      transactionId: raw?.netbankingDetails?.transactionId
        ?? raw?.upiDetails?.transactionId
        ?? raw?.iciciTxnId
        ?? '',
      gatewayPaymentId: raw?.razorpayPaymentId ?? raw?.cashFreePaymentId ?? '',
      approvedBy: raw?.offlineApprovedByName ?? '',
      franchiseId: raw?.franchiseId,
      franchiseName: raw?.franchiseName
    };
  }

  onStatusFilterChange(): void { this.applyOnlineFilters(); }
  onPaymentModeFilterChange(): void { this.applyOnlineFilters(); }
  onSortOrderChange(): void { this.applyOnlineFilters(); }
  onQuickSearchOnlineChange(): void { this.applyOnlineFilters(); }

  clearStatusFilter(): void { this.statusFilter = 'ALL'; this.applyOnlineFilters(); }
  clearPaymentModeFilter(): void {
    this.paymentModeFilter = 'ALL';
  
    this.applyOnlineFilters();
  }

  private matchesStatus(status: string, filter: OnlineStatus): boolean {
    if (filter === 'ALL') return true;
    const s = (status || '').toLowerCase();
    if (filter === 'SUCCESS') return s.includes('success') || s.includes('paid') || s.includes('captured');
    if (filter === 'FAILED') return s.includes('fail');
    if (filter === 'ACTIVE') return s.includes('active');
    if (filter === 'CREATED') return s.includes('created');
    return true;
  }

  private matchesPaymentMode(pgName: string, filter: PaymentMode): boolean {
    if (filter === 'ALL') return true;
    const s = (pgName || '').toLowerCase();
    if (filter === 'RAZORPAY') return s.includes('razorpay');
    if (filter === 'CASHFREE') return s.includes('cashfree');
    if (filter === 'UPI') return s.includes('upi');
    if (filter === 'QR_CODE') return s.includes('qr');
    if (filter === 'BANK_TRANSFER') return s.includes('bank');
    return true;
  }

  private applyOnlineFilters(): void {
    let records = [...this.allOnlineRecords];

    records = records.filter(r =>
      this.matchesStatus(r.status || '', this.statusFilter) &&
      this.matchesPaymentMode(r.pgName || '', this.paymentModeFilter)
    );

    const q = this.quickSearchOnline.trim().toLowerCase();
    if (q) {
      records = records.filter(r =>
        (r.orderId || '').toLowerCase().includes(q) ||
        (r.transactionId || '').toLowerCase().includes(q) ||
        (r.gatewayPaymentId || '').toLowerCase().includes(q) ||
        (r.centerCode || '').toLowerCase().includes(q) ||
        (r.approvedBy || '').toLowerCase().includes(q)
      );
    }

    records.sort((a, b) => {
      const ta = this.toEpoch(a.date);
      const tb = this.toEpoch(b.date);
      return this.sortOrder === 'NEWEST' ? tb - ta : ta - tb;
    });

    this.onlineFilteredRows = records.map(r => this.toOnlineRow(r));
    this.page = 0;
    this.applyPagination();
  }

  private toEpoch(value: number | string | null): number {
    if (value == null) return 0;
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('success') || s.includes('paid') || s.includes('captured')) return 'status-success';
    if (s.includes('fail')) return 'status-fail';
    if (s.includes('active') || s.includes('created') || s.includes('pending')) return 'status-pending';
    return 'status-default';
  }

  private toOnlineRow(record: PaymentTransaction): PaymentRow {
    return {
      dateLabel: this.formatDate(record.date),
      amountLabel: `₹${(record.amount ?? 0).toFixed(2)}`,
      centerCode: record.centerCode || '-',
      orderId: record.orderId || '-',
      status: record.status || '-',
      pgName: record.pgName || '-',
      transactionId: record.transactionId || '-',
      gatewayPaymentId: record.gatewayPaymentId || '-',
      approvedBy: record.approvedBy || '-',
      raw: record
    };
  }

  // ---------- Gateway summary cards (Razorpay/Cashfree per franchise) ----------

  private async loadGatewaySummaries(): Promise<void> {
    if (!this.startDate || !this.endDate) return;
    try {
const res: any = await this.labApi.getOrderAnalysis(
  this.startDate,
  this.getApiEndDate(this.endDate),
  this.selectedFranchiseId ?? undefined
).toPromise();
console.log('ORDER ANALYSIS RAW:', JSON.stringify(res, null, 2)); // TEMP debug

      const list: GatewayAnalysisItem[] = Array.isArray(res) ? res : (res?.content ?? []);
      this.gatewaySummaries = this.buildGatewaySummaries(list);
    } catch {
      this.gatewaySummaries = [];
    }
  }

private buildGatewaySummaries(list: GatewayAnalysisItem[]): GatewaySummary[] {
  return this.gatewayFieldMap.map(gw => {
    let rows: GatewayFranchiseRow[];

    if (this.selectedFranchiseId != null) {
      // एक franchise select केलेली असेल तर: स्वतःची entry + बाकी सगळ्यांची बेरीज
      const selfItem = list.find(item => (item as any).franchiseId === this.selectedFranchiseId);
      const otherItems = list.filter(item => (item as any).franchiseId !== this.selectedFranchiseId);

      const selfAmount = Number((selfItem?.[gw.field] as number) ?? 0);
      const othersAmount = otherItems.reduce(
        (sum, item) => sum + Number((item?.[gw.field] as number) ?? 0), 0
      );

      rows = [
        { label: selfItem?.centerCode || this.selectedFranchiseLabel, amount: selfAmount },
        { label: 'Franchise Clients', amount: othersAmount }
      ];
    } else {
      // "All Franchises" असेल तर सगळ्यांची वेगळी row (जसं आधी होतं)
      rows = list.map(item => ({
        label: item?.franchiseName || item?.centerCode || 'Unknown',
        amount: Number((item?.[gw.field] as number) ?? 0)
      }));
    }

    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return { pgName: gw.pgName, filterValue: gw.filterValue, rows, total };
  });
}

  selectGatewayCard(summary: GatewaySummary): void {
    if (this.selectedGatewayCard === summary.pgName) {
      this.selectedGatewayCard = null;
      this.paymentModeFilter = 'ALL';
    } else {
      this.selectedGatewayCard = summary.pgName;
      this.paymentModeFilter = summary.filterValue as PaymentMode;
    }
    this.applyOnlineFilters();
  }

  selectAllGateways(): void {
    this.selectedGatewayCard = null;
    this.paymentModeFilter = 'ALL';
    this.applyOnlineFilters();
  }

  formatGatewayAmount(amount: number): string {
    return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ---------- LAB tab data load + filters ----------

  private async loadLabData(): Promise<void> {
    if (!this.startDate || !this.endDate) return;
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Lab payment data loading...',
      cssClass: 'payment-loading-popup'
    });
    await loading.present();

    try {
const res: any = await this.labApi.getLabPayments(
  this.startDate,
  this.getApiEndDate(this.endDate),
  this.selectedFranchiseId ?? undefined,
  this.byUserMap[this.userRoleFilter]
).toPromise();

      const list: any[] = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
      this.labRecords = list.map((r: any) => this.toLabRecord(r));
      this.applyLabFilters();
    } catch {
      this.labRecords = [];
      this.applyLabFilters();
    } finally {
      this.isLoading = false;
      loading.dismiss();
    }
  }

  private toLabRecord(raw: any): LabPaymentTransaction {
    return {
      id: raw?.walletTransactionId,
      date: raw?.createdOn ?? null,
      amount: Number(raw?.balance ?? 0),
      centerCode: raw?.centreCode ?? '',
      createdBy: raw?.userName ?? '',
      transactionType: raw?.transactionType ?? '',
      remark: raw?.description ?? '',
      userRole: raw?.paymentMode ?? '',
      franchiseId: undefined
    };
  }
  onUserRoleFilterChange(): void {
    this.loadLabData();
  }
  onSortOrderLabChange(): void { this.applyLabFilters(); }
  onQuickSearchLabChange(): void { this.applyLabFilters(); }

  onDateRangeClosed(): void {
    this.startDate = this.pickedStartDate ? this.toIsoDate(this.pickedStartDate) : null;
    this.endDate = this.pickedEndDate ? this.toIsoDate(this.pickedEndDate) : null;

    if (this.startDate && this.endDate) {
      this.search();
    }
  }
  private applyLabFilters(): void {
    let records = [...this.labRecords];

    const q = this.quickSearchLab.trim().toLowerCase();
    if (q) {
      records = records.filter(r =>
        (r.centerCode || '').toLowerCase().includes(q) ||
        (r.createdBy || '').toLowerCase().includes(q) ||
        (r.transactionType || '').toLowerCase().includes(q) ||
        (r.remark || '').toLowerCase().includes(q)
      );
    }

    records.sort((a, b) => {
      const ta = this.toEpoch(a.date);
      const tb = this.toEpoch(b.date);
      return this.sortOrderLab === 'NEWEST' ? tb - ta : ta - tb;
    });

    this.labFilteredRows = records.map(r => this.toLabRow(r));
    this.page = 0;
    this.applyPagination();
  }

  private toLabRow(record: LabPaymentTransaction): LabPaymentRow {
    return {
      dateLabel: this.formatDate(record.date),
      amountLabel: `₹${(record.amount ?? 0).toFixed(2)}`,
      centerCode: record.centerCode || '-',
      createdBy: record.createdBy || '-',
      transactionType: record.transactionType || '-',
      remark: record.remark || '-',
      raw: record
    };
  }

  private formatDate(value: number | string | null): string {
    if (value == null) return '-';
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---------- Export (stubs — wire to real PDF/Excel later) ----------

  exportPdf(): void {
    this.showToast('PDF export लवकरच येत आहे');
  }

  exportExcel(): void {
    this.showToast('Excel export लवकरच येत आहे');
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2000, position: 'bottom' });
    await toast.present();
  }

  getLabelFor<T extends string>(options: { label: string; value: T }[], value: T): string {
    return options.find(o => o.value === value)?.label ?? '';
  }

}