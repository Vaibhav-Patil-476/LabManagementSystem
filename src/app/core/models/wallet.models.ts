// core/models/wallet.models.ts

export interface LedgerEntry {
  bookingDate: string;
  type: string;
  bookingId?: number | string;
  remark?: string;
  amount?: number;
  description?: string;
  [key: string]: any;
}

export interface LedgerResponse {
  pastLedger: LedgerEntry[];

  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  bookingAmount?: number;
  cancellationRefundAmount?: number;
  commissionAmount?: number;
  depositAmount?: number;
  razorpayDepositAmount?: number;
  cashfreeDepositAmount?: number;
  inventoryDebitAmount?: number;
  debitedAdjustedAmount?: number;

  [key: string]: any;
}

export interface WalletTransaction {
  id?: number;
  amount?: number;
  transaction?: string;
  paymentMode?: string;
  createdOn?: string;
  [key: string]: any;
}

export interface WalletSummary {
  balance?: number;
  totalCredit?: number;
  totalDebit?: number;
  [key: string]: any;
}
