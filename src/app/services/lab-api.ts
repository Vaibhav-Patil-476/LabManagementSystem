import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth'; // ✅ tumcha actual path/filename confirm kara

@Injectable({
  providedIn: 'root'
})
export class LabApiService {

  private readonly BASE_URL = environment.BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) { }

  // ==========================
  // ✅ CHANGED — localStorage cha JSON.parse kadhla.
  // Ata AuthService cha in-memory currentUser varun labId ghetla jato.
  // ==========================
  private getLabId(): number {
    return this.authService.labId;
  }

  getLastBooking(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/last-booking/${this.getLabId()}`
    );
  }

  getTests(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/report-master/tests/t/${this.getLabId()}`
    );
  }

  getDoctors(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/doctor/d/${this.getLabId()}/true?optimize=false`
    );
  }

  getFranchisesWithWallet(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/franchise/${this.getLabId()}?wallet=true&page=0&size=20`
    );
  }

  getFranchises(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/franchise/${this.getLabId()}?wallet=true&page=0&size=20`
    );
  }

  createBooking(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/booking/patient/create`,
      body
    );
  }

  getBooking(id: number): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}/${id}`
    );
  }

  getAllBookings(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}`
    );
  }

  getSingleBooking(bookingId: number): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}/${bookingId}`
    );
  }

  searchBooking(params: any): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/search`,
      { params }
    );
  }

  getSampleNameByTestId(testId: number): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}/${testId}`
    );
  }

  createReportRemark(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/report/remark/create`,
      body
    );
  }

  updateReportRemark(bookingId: number, body: any): Observable<any> {
    return this.http.put(
      `${this.BASE_URL}/api/v1/lab/report/update-report-url/${bookingId}`,
      body
    );
  }

  getReportCount(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/report/allReportCount/${this.getLabId()}`
    );
  }

  createReport(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/report/create`,
      body
    );
  }

  updateReportValue(reportId: number, body: any): Observable<any> {
    return this.http.put(
      `${this.BASE_URL}/api/v1/lab/report/update/${reportId}`,
      body
    );
  }

  getAllPatientsDashboard(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/dashboard/patients`
    );
  }
}