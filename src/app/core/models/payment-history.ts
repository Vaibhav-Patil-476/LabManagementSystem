export interface Franchise {
  franchiseId: number;
  franchiseName: string;
}

// ---------- Online Payments (Razorpay/Cashfree/UPI/etc.) ----------

export interface PaymentTransaction {
  id?: number;
  date: number | string | null;
  amount: number;
  centerCode?: string;
  orderId?: string;
  status?: string;
  pgName?: string;
  transactionId?: string;
  gatewayPaymentId?: string;
  approvedBy?: string;
  franchiseId?: number;
  franchiseName?: string;
}

export interface PaymentRow {
  dateLabel: string;
  amountLabel: string;
  centerCode: string;
  orderId: string;
  status: string;
  pgName: string;
  transactionId: string;
  gatewayPaymentId: string;
  approvedBy: string;
  raw: PaymentTransaction;
}

// ---------- From Lab transactions ----------

export interface LabPaymentTransaction {
  id?: number;
  date: number | string | null;
  amount: number;
  centerCode?: string;
  createdBy?: string;
  transactionType?: string;
  remark?: string;
  userRole?: string;
  franchiseId?: number;
}

export interface LabPaymentRow {
  dateLabel: string;
  amountLabel: string;
  centerCode: string;
  createdBy: string;
  transactionType: string;
  remark: string;
  raw: LabPaymentTransaction;
}

// ---------- Gateway summary cards (from /order-analysis) ----------

// Raw shape returned by GET /api/v1/order/order-analysis
export interface GatewayAnalysisItem {
  franchiseId: number;
  franchiseName: string;
  centerCode: string;
  totalRazorpayAmount: number;
  totalCashfreeAmount: number;
}

// One franchise's amount inside a gateway card
export interface GatewayFranchiseRow {
  label: string;
  amount: number;
}

// One gateway card (Razorpay / Cashfree / etc.) with per-franchise rows
export interface GatewaySummary {
  pgName: string;
  filterValue: string;
  rows: GatewayFranchiseRow[];
  total: number;
}