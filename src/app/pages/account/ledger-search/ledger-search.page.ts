import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController, RefresherCustomEvent } from '@ionic/angular';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';

import { WalletService } from '../../../core/services/wallet';
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
export class LedgerSearchPage implements OnDestroy {
  franchiseId: number | null = null;
  franchiseLabel = '';

  startDate = '';
  endDate = '';

  ledger: LedgerResponse | null = null;
  loading = false;
  errorMessage = '';

  summaryExpanded = true;

  sortOptions = [
    { value: 'date_desc', label: 'Booking Date (Newest first)' },
    { value: 'date_asc', label: 'Booking Date (Oldest first)' },
    { value: 'type', label: 'Type' }
  ];
  selectedSort = 'date_desc';
  franchiseSearchText = '';

  franchiseDropdownOpen = false;
  franchiseOptions: FranchiseOption[] = [];
  franchiseLoading = false;
  franchisePickerQuery = '';
  private franchiseSearchTimer: any;

  private hasInitialized = false;

  // ✅ NEW: कुठली row selected/highlighted आहे ते track करण्यासाठी
  selectedRowIndex: number | null = null;

  constructor(
    private walletService: WalletService,
    private labApiService: LabApiService,
    private authService: AuthService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter(): void {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    this.startDate = this.toIsoDate(first);
    this.endDate = this.toIsoDate(today);

    if (this.hasInitialized && this.franchiseId) {
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.hasInitialized = true;
        this.initDefaultFranchise();
      },
      error: (err) => {
        console.error('CURRENT USER ERROR:', err);
        this.presentToast('Failed to load user info.');
      }
    });
  }

  async handleRefresh(event: RefresherCustomEvent): Promise<void> {
    if (!this.franchiseId) {
      event.target.complete();
      this.presentToast('Please select a franchise first.');
      return;
    }

    await this.searchLedger(true);
    event.target.complete();
  }

  private initDefaultFranchise(): void {
    const user = this.authService.currentUserValue;

    if (user?.franchiseId) {
      this.applyLoggedInFranchise(user.franchiseId, user.franchiseName);
    } else {
      console.warn('Logged-in user has no franchiseId — /auth/current-user response:', user?.raw);
    }
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

  toggleSummary(): void {
    this.summaryExpanded = !this.summaryExpanded;
  }

  async searchLedger(fromRefresher: boolean = false): Promise<void> {
    if (!this.franchiseId) {
      this.presentToast('Please select a franchise first (in the Search Ledger box).');
      return;
    }
    if (!this.startDate || !this.endDate) {
      this.presentToast('Please select a date range.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.selectedRowIndex = null; // ✅ नवीन search वर आधीची highlight clear कर

    let popup: HTMLIonLoadingElement | null = null;

    if (!fromRefresher) {
      popup = await this.loadingCtrl.create({
        message: 'Ledger data loading...',
        spinner: 'crescent',
        cssClass: 'ledger-loading-popup',
        backdropDismiss: false
      });
      await popup.present();
    }

    // ✅ NEW: endDate exclusive असल्याने आजच्या (शेवटच्या दिवसाच्या) entries चुकत होत्या —
    // API ला endDate चा पुढचा दिवस पाठवतो जेणेकरून निवडलेला शेवटचा दिवस पूर्ण cover होईल
    const apiEndDate = this.toApiEndDate(this.endDate);

    forkJoin({
      summary: this.walletService.getLedger({
        franchiseId: this.franchiseId,
        startDate: this.startDate,
        endDate: apiEndDate
      }),
      transactions: this.walletService.getWallet(
        this.authService.labId,
        this.franchiseId,
        0,
        100,
        true,
        undefined,
        this.startDate,
        apiEndDate,
        true
      )
    })
      .pipe(finalize(() => {
        this.loading = false;
        popup?.dismiss();
      }))
      .subscribe({
        next: ({ summary, transactions }) => {
          const pastLedger = (transactions?.transaction?.content ?? []).map((t: any) => {
            const booking = t.bookingDto;

            // patient name — booking नसेल (उदा. wallet recharge) तर '-'
            const patientName = booking?.customerName?.trim() || '-';

            // एका booking मध्ये multiple tests असू शकतात — सगळ्यांची नावं जोडून दाखव
            const testNames = (booking?.tests ?? [])
              .map((test: any) => test.testName?.trim())
              .filter(Boolean);
            const testName = testNames.length ? testNames.join(', ') : '-';

            // barcode पण per-test असतो — unique barcodes जोडून दाखव
            const barcodes = (booking?.samples ?? [])
              .map((sample: any) => sample.barcode)
              .filter(Boolean);
            const uniqueBarcodes = [...new Set(barcodes)];
            const barcode = uniqueBarcodes.length ? uniqueBarcodes.join(', ') : '-';

            return {
              bookingId: t.bookingId,
              bookingDate: t.createdOn ? new Date(t.createdOn).toLocaleDateString() : '',
              type: t.transactionType,
              remark: t.description,
              amount: t.balance,
              patientName,
              testName,
              barcode,
              openingBalance: t.openingBalance,
              closingBalance: t.closingBalance
            };
          });

          this.ledger = {
            ...summary,
            cancellationRefundAmount: summary.cancellationRefund,
            inventoryDebitAmount: summary.inventoryDebit,
            pastLedger
          };
        },
        error: (err) => {
          console.error('getLedger/getWallet failed', err);
          this.errorMessage = 'Something went wrong while fetching the ledger. Please try again.';
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
          const list = res?.content ?? res?.data ?? (Array.isArray(res) ? res : []);

          this.franchiseOptions = list.map((f: any) => {
            const id = f.id ?? f.franchiseId ?? f.franchise_id ?? f._id ?? f.uuid;

            if (id === undefined || id === null) {
              console.warn('Franchise item has no recognizable id field — inspect this object and update the id fallback chain:', f);
            }

            return {
              id,
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
          this.presentToast('Could not load the franchise list.');
        }
      });
  }

  selectFranchise(option: FranchiseOption): void {
    if (option.id === undefined || option.id === null) {
      this.presentToast('Could not select this franchise (no id found). Check the object in the console.');
      return;
    }
    this.franchiseId = option.id;
    this.franchiseLabel = option.label;
    this.franchiseDropdownOpen = false;
    this.ledger = null;
  }

  // ✅ NEW: row वर click केल्यावर highlight toggle कर
  selectRow(i: number): void {
    this.selectedRowIndex = this.selectedRowIndex === i ? null : i;
  }

  exportPdf(): void {
    this.presentToast('PDF export isn\'t in the API docs — if the backend adds a report/generate/itext/pdf-style endpoint, it can be wired up.');
  }

  exportExcel(): void {
    this.presentToast('Excel export needs a backend endpoint to be defined first.');
  }

  private toIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ✅ NEW: endDate exclusive असल्याचा संशय असल्याने, API ला पाठवायच्या आधी
  // निवडलेल्या शेवटच्या दिवसाच्या पुढचा दिवस देतो — जेणेकरून तो दिवस पूर्ण cover होईल.
  // UI मधलं this.endDate field (जे user ला दिसतं) यामुळे बदलत नाही.
  private toApiEndDate(dateStr: string): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return this.toIsoDate(d);
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}