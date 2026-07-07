import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LabApiService {

  private readonly BASE_URL = environment.BASE_URL;
  private readonly LAB_ID = 3505;

  constructor(private http: HttpClient) { }

  // ==========================
  // LAST BOOKING
  // ==========================
  getLastBooking(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/last-booking/${this.LAB_ID}`
    );
  }

  // ==========================
  // TESTS
  // ==========================
  getTests(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/report-master/tests/t/${this.LAB_ID}`
    );
  }

  // ==========================
  // DOCTORS
  // ==========================
  getDoctors(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/doctor/d/${this.LAB_ID}/true?optimize=false`
    );
  }

  // ==========================
  // FRANCHISE data for Admin accordign to wallate 
  // ==========================
  getFranchisesWithWallet(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/franchise/${this.LAB_ID}?wallet=true&page=0&size=20`
    );
  }

  getFranchises(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/franchise/${this.LAB_ID}?wallet=true&page=0&size=20`
    );
  }
  // ==========================
  // SAVE BOOKING
  // ==========================
  createBooking(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/booking/patient/create`,
      body
    );
  }

  // ==========================
  // BOOKING DETAILS
  // ==========================
  getBooking(id: number): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.LAB_ID}/${id}`
    );
  }
}