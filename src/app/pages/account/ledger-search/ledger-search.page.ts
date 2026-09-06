import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';

import { WalletService } from '../../../core/services/wallet';
// NOTE: adjust this import path/filename to match your actual
// LabApiService file (same core/services folder as `wallet` & `auth`).
import { LabApiService } from '../../../core/services/lab-api';
import { AuthService } from '../../../core/services/auth';

import { LedgerResponse } from '../../../core/models/wallet.models';

interface FranchiseOption {
  id: number;
  label: string;
}

@Component({
  selector: 'app-ledger-search',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './ledger-search.page.html',
  styleUrls: ['./ledger-search.page.scss']
})
export class LedgerSearchPage implements OnInit, OnDestroy {
  franchiseId: number | null = null;
  franchiseLabel = ''; // e.g. "dar1/dar1"

  startDate = '';
  endDate = '';

  ledger: LedgerResponse | null = null;
  loading = false;
  errorMessage = '';

  // "Sort By" dropdown options for Past Ledger list
  sortOptions = [
    { value: 'date_desc', label: 'Booking Date (Newest first)' },
    { value: 'date_asc', label: 'Booking Date (Oldest first)' },
    { value: 'type', label: 'Type' }
  ];
  selectedSort = 'date_desc';
  franchiseSearchText = '';

  // ---- Franchise picker state (replaces the hard-coded demo id) ----
  franchiseDropdownOpen = false;
  franchiseOptions: FranchiseOption[] = [];
  franchiseLoading = false;
  franchisePickerQuery = '';
  private franchiseSearchTimer: any;

  constructor(
    private walletService: WalletService,
    private labApiService: LabApiService,
    private authService: AuthService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    // default: chalu mahinyacha 1 tarikh te aaj
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    this.startDate = this.toIsoDate(first);
    this.endDate = this.toIsoDate(today);

    this.initDefaultFranchise();
  }

  // ============================================================
  // ✅ Default to the logged-in user's own franchise (instead of
  // requiring them to open the picker), and load its ledger data
  // right away. AuthService keeps currentUser in a BehaviorSubject,
  // so if it's already loaded elsewhere in the app (e.g. an auth
  // guard on boot) we use it directly; otherwise we fetch it here.
  // ============================================================
  private initDefaultFranchise(): void {
    const existing = this.authService.currentUserValue;

    if (existing && existing.franchiseId) {
      this.applyLoggedInFranchise(existing.franchiseId, existing.franchiseName);
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        const user = this.authService.currentUserValue;
        if (user?.franchiseId) {
          this.applyLoggedInFranchise(user.franchiseId, user.franchiseName);
        } else {
          // Not necessarily an error — some logged-in users (e.g. lab
          // admins) may not be tied to a single franchise. Leave the
          // picker empty so they choose one manually.
          console.warn('Logged-in user has no franchiseId — /auth/current-user response:', user?.raw);
        }
      },
      error: (err) => {
        console.error('loadCurrentUser failed', err);
      }
    });
  }

  private applyLoggedInFranchise(franchiseId: number, franchiseName: string): void {
    this.franchiseId = franchiseId;
    this.franchiseLabel = franchiseName || `Franchise #${franchiseId}`;
    this.searchLedger();
  }

  ngOnDestroy(): void {
    clearTimeout(this.franchiseSearchTimer);
  }

  onDateRangeChange(range: { start?: string; end?: string }): void {
    if (range.start) {
      this.startDate = range.start.slice(0, 10);
    }
    if (range.end) {
      this.endDate = range.end.slice(0, 10);
    }
  }

  async searchLedger(): Promise<void> {
    if (!this.franchiseId) {
      this.presentToast('Adhi franchise nivda (Search Ledger box madhe).');
      return;
    }
    if (!this.startDate || !this.endDate) {
      this.presentToast('Date range nivda.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const loading = await this.loadingCtrl.create({ message: 'Ledger load hoat aahe...' });
    await loading.present();

    // ============================================================
    // ✅ FIX: getLedger() alone only returns SUMMARY totals — it has
    // no `pastLedger` array at all (confirmed against the real API
    // response), which is why the Past Ledger table was always
    // empty regardless of what data existed. The actual transaction
    // list comes from getWallet() with transaction=true and the
    // same date range, so both calls are combined here.
    // ============================================================
    forkJoin({
      summary: this.walletService.getLedger({
        franchiseId: this.franchiseId,
        startDate: this.startDate,
        endDate: this.endDate
      }),
      transactions: this.walletService.getWallet(
        this.authService.labId,
        this.franchiseId,
        0,
        100,
        true,
        undefined,
        this.startDate,
        this.endDate,
        true
      )
    })
      .pipe(finalize(() => {
        this.loading = false;
        loading.dismiss();
      }))
      .subscribe({
        next: ({ summary, transactions }) => {
          const pastLedger = (transactions?.transaction?.content ?? []).map((t: any) => ({
            bookingId: t.bookingId,
            // Raw transaction has no `bookingDate` field — it has
            // `createdOn` as an epoch-ms timestamp instead.
            bookingDate: t.createdOn ? new Date(t.createdOn).toLocaleDateString() : '',
            type: t.transactionType,
            remark: t.description,
            // `balance` on the raw transaction is the amount for
            // THAT transaction (not the running wallet balance) —
            // needed for the Net Business debit/credit totals below.
            amount: t.balance
          }));

          this.ledger = {
            ...summary,
            // ✅ FIX: backend names these two fields WITHOUT the
            // "Amount" suffix (`cancellationRefund`, `inventoryDebit`)
            // — the template binds to `cancellationRefundAmount` /
            // `inventoryDebitAmount`, so they rendered as a bare ₹
            // with no number. Remap here instead of guessing again.
            cancellationRefundAmount: summary.cancellationRefund,
            inventoryDebitAmount: summary.inventoryDebit,
            pastLedger
          };
        },
        error: (err) => {
          console.error('getLedger/getWallet failed', err);
          this.errorMessage = 'Ledger fetch karताna error ala. Punha प्रयत्न करा.';
          this.presentToast(this.errorMessage);
        }
      });
  }

  get sortedPastLedger() {
    if (!this.ledger?.pastLedger) {
      return [];
    }
    const list = [...this.ledger.pastLedger];
    switch (this.selectedSort) {
      case 'date_asc':
        return list.sort(
          (a, b) => new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime()
        );
      case 'type':
        return list.sort((a, b) => a.type.localeCompare(b.type));
      case 'date_desc':
      default:
        return list.sort(
          (a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()
        );
    }
  }

  // ============================================================
  // NET BUSINESS bar — totals derived straight from the currently
  // loaded Past Ledger transactions, so it always matches whatever
  // date range / franchise is on screen (re-runs automatically
  // whenever `ledger` changes, since these are plain getters).
  // ============================================================
  get netDebitTotal(): number {
    return (this.ledger?.pastLedger ?? [])
      .filter((e) => e.type === 'DEBIT')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get netCreditTotal(): number {
    return (this.ledger?.pastLedger ?? [])
      .filter((e) => e.type === 'CREDIT')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get netBusinessTotal(): number {
    return this.netCreditTotal - this.netDebitTotal;
  }

  clearFranchise(): void {
    this.franchiseId = null;
    this.franchiseLabel = '';
    this.ledger = null;
  }

  // ============================================================
  // ✅ FIX: real franchise picker, wired to
  // LabApiService.getFranchisesPage() (backend: GET
  // /api/v1/lab/franchise/:labId?wallet=true&page=&size=&searchFranchiseId=)
  // instead of the old selectDemoFranchise() which hard-coded
  // franchiseId = 1 — an id that doesn't exist on the backend,
  // which is exactly why you were getting
  // { message: 'franchise not found!', success: false }.
  // ============================================================
  openFranchisePicker(): void {
    this.franchiseDropdownOpen = true;
    this.franchisePickerQuery = '';
    this.loadFranchiseOptions();
  }

  closeFranchisePicker(): void {
    this.franchiseDropdownOpen = false;
  }

  onFranchiseQueryChange(value: string | null | undefined): void {
    this.franchisePickerQuery = value ?? '';
    clearTimeout(this.franchiseSearchTimer);
    this.franchiseSearchTimer = setTimeout(() => this.loadFranchiseOptions(), 300);
  }

  private loadFranchiseOptions(): void {
    this.franchiseLoading = true;

    this.labApiService
      .getFranchisesPage(this.authService.labId, 0, 20, this.franchisePickerQuery || undefined)
      .pipe(finalize(() => (this.franchiseLoading = false)))
      .subscribe({
        next: (res: any) => {
          // Spring-style paged response: { content: [...] }.
          // Falls back to `data` / a bare array in case your API
          // wraps it differently — adjust here if the shape differs.
          const list = res?.content ?? res?.data ?? (Array.isArray(res) ? res : []);

          this.franchiseOptions = list.map((f: any) => {
            // ✅ FIX: id was read only from `f.id`. If the backend
            // actually returns a different key (franchiseId,
            // franchise_id, _id, etc.), `id` came back undefined,
            // franchiseId stayed falsy after "selecting" it, and the
            // picker silently looked like clicking did nothing.
            const id = f.id ?? f.franchiseId ?? f.franchise_id ?? f._id ?? f.uuid;

            if (id === undefined || id === null) {
              console.warn('Franchise item has no recognizable id field — inspect this object and update the id fallback chain:', f);
            }

            return {
              id,
              // NOTE: confirm the exact field name(s) your backend
              // returns (franchiseCode / code / name, etc.) and adjust
              // this label mapping to match — this is a defensive
              // fallback chain, not a guaranteed-correct format.
              label: f.franchiseCode
                ? `${f.franchiseCode}/${f.franchiseCode}`
                : (f.code && f.name
                    ? `${f.code}/${f.name}`
                    : (f.name || f.franchiseName || `Franchise #${id}`))
            };
          });
        },
        error: (err) => {
          console.error('getFranchisesPage failed', err);
          this.franchiseOptions = [];
          this.presentToast('Franchise list load karta ali nahi.');
        }
      });
  }

  selectFranchise(option: FranchiseOption): void {
    if (option.id === undefined || option.id === null) {
      // Guard against the mismatched-field-name case above — don't
      // silently "select" a franchise with no real id.
      this.presentToast('Ha franchise select karta ala nahi (id sapadla nahi). Console madhe object check kara.');
      return;
    }
    this.franchiseId = option.id;
    this.franchiseLabel = option.label;
    this.franchiseDropdownOpen = false;
    this.ledger = null; // clear ledger from a previously selected franchise
  }

  exportPdf(): void {
    this.presentToast('PDF export API doc madhe nahi ahe - backend var report/generate/itext/pdf sarkha endpoint asel tar tyala jodta yeil.');
  }

  exportExcel(): void {
    this.presentToast('Excel export sathi backend cha endpoint nirdharit karava lagel.');
  }

  private toIsoDate(d: Date): string {
    // ✅ FIX: the old `d.toISOString().slice(0, 10)` converts to UTC
    // first. For IST (UTC+5:30) that rolls local midnight back to the
    // previous day — e.g. "1 Sep 2026 00:00 local" became "2026-08-31"
    // instead of "2026-09-01". Build the yyyy-MM-dd string from local
    // getFullYear/getMonth/getDate instead, so no timezone shift happens.
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}