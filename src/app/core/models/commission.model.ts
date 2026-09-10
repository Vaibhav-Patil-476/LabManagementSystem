// commission.model.ts

export interface Franchise {
  franchiseId: number;
  franchiseName: string;
  balance?: number;
  reportCreditLimit?: number;
  expiryDate?: number;
}

export interface TestItem {
  testId?: number;
  testName: string;
  profileId?: number;
  profileName?: string | null;
}

export interface CommissionRecord {
  bookingId: number;
  commissionDate: number | null;   // epoch millis
  bookingDate: number | null;      // epoch millis
  bookingAmount: number | null;
  commission: number | null;
  testList: TestItem[];
  bookedBy: string | null;
}

export interface PageableResponse<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    offset: number;
    paged: boolean;
    unpaged: boolean;
  };
  totalPages: number;
  totalElements: number;
  last: boolean;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  empty: boolean;
}

export interface CommissionFilter {
  franchiseId: number | null;
  startDate: number | null; // epoch millis, null = no filter (client-side)
  endDate: number | null;
}

// Row shape used by the table after grouping/formatting is applied
export interface CommissionRow {
  bookingId: number;
  commissionDateLabel: string;
  bookingDateLabel: string;
  bookingAmountLabel: string;
  commission: number | null;
  testsLabel: string;   // plain comma-joined test names
  isProfile: boolean;   // true => show testsLabel in bold (profile name)
  bookedByLabel: string;
  raw: CommissionRecord;
}