import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TestItem {
  name: string;
  b2b?: string;
  tat?: string;
  mrp: number;
  fluid?: string;
  sampleType?: string;
  color?: string;
  discount?: number;

  // ===== Report-specific fields =====
  resultValue?: string | number;   // value entered after the test is performed
  unit?: string;                   // e.g. ng/mL, mg, g/dL
  refRangeLow?: number;            // lower bound of BIO. REF. RANGE
  refRangeHigh?: number;           // upper bound of BIO. REF. RANGE
  method?: string;                 // e.g. CLIA, Automated, Test
  referenceNote?: string;          // multi-line clinical reference text (Deficiency/Insufficiency/etc.)
}

export interface Patient {
  id: string;
  bookingDate: string;
  title: string;
  name: string;
  age: string | number;
  ageType?: string;
  gender?: string;
  doctorTitle?: string;
  doctor: string;
  lab?: string;
  phone?: string;
  aadhaar?: string;
  address?: string;
  uhid?: string;
  history?: string;
  eReport?: boolean;
  clinical?: boolean;
  file?: boolean;
  homeCollection?: boolean;
  attachment?: any;
  attachmentName?: string;
  tests: TestItem[];
  totalAmount: number;
  discount: number;
  grandTotal: number;

  paidAmount?: number;
  dueAmount?: number;
  paymentMethod?: string;
}

const STORAGE_KEY = 'patients';

@Injectable({
  providedIn: 'root'
})
export class BookingService {

  private patientsSubject = new BehaviorSubject<Patient[]>(this.loadFromStorage());
  patients$: Observable<Patient[]> = this.patientsSubject.asObservable();

  constructor() { }

  private loadFromStorage(): Patient[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];

      const parsed: Patient[] = JSON.parse(saved);

      return parsed.map(p => ({
        ...p,
        paidAmount: p.paidAmount ?? 0,
        dueAmount: p.dueAmount ?? ((p.grandTotal || 0) - (p.paidAmount ?? 0)),
        paymentMethod: p.paymentMethod ?? 'cash'
      }));

    } catch (err) {
      console.error('patients localStorage parse error:', err);
      return [];
    }
  }

  private saveToStorage(patients: Patient[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
  }

  getPatients(): Patient[] {
    return this.patientsSubject.value;
  }

  addPatient(patient: Patient) {
    const updated = [...this.patientsSubject.value, patient];
    this.patientsSubject.next(updated);
    this.saveToStorage(updated);
  }

  updatePatient(updatedPatient: Patient) {
    const current = this.patientsSubject.value;
    const index = current.findIndex(p => p.id === updatedPatient.id);

    if (index > -1) {
      const updated = [...current];
      updated[index] = updatedPatient;
      this.patientsSubject.next(updated);
      this.saveToStorage(updated);
    }
  }

  deletePatient(id: string) {
    const updated = this.patientsSubject.value.filter(p => p.id !== id);
    this.patientsSubject.next(updated);
    this.saveToStorage(updated);
  }

  generateNextId(): string {
    const current = this.patientsSubject.value;
    return 'BK' + String(current.length + 1).padStart(3, '0');
  }

  refreshFromStorage() {
    this.patientsSubject.next(this.loadFromStorage());
  }
}