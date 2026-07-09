import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root'
})
export class LabApiService {

  private readonly BASE_URL = environment.BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) { }

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

  createDoctor(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/doctor/create`,
      body
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

  // ==========================
  // ✅ FIXED — MAIN SUSPECTED BUG.
  // Ha GET call PRATYEK VELA TOCH URL hit karत hota
  // (`/booking/patient/{labId}`), konतahi cache-busting shivaय.
  // Tyamule browser/webview/proxy ha jुना (STALE/CACHED) response
  // परत वापरू शकतो — jarी backend madhe navीn booking save
  // झालेली असली तरी.
  //
  // Ata `_t` (current timestamp) navacha query param add kela aहे,
  // jो PRATYEK call वेळी VEGLA असतो — tyamule browser cha कोणताही
  // GET cache ha URL "navीन/unique" mानून SKIP karel ani backend
  // la EKDAM FRESH request jaईल. Sobatच explicit no-cache headers
  // pan add kele aहेत.
  // ==========================
  // getAllBookings(): Observable<any> {
  //   const params = new HttpParams()
  //     .set('_t', Date.now().toString())
  //     .set('page', '0')
  //     .set('size', '5000')          // ✅ ADDED — default page size cutoff टाळण्यासाठी
  //     .set('sort', 'createdOn,desc'); // ✅ ADDED — navीन records सर्वात आधी yeतील

  //   return this.http.get(
  //     `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}`,
  //     {
  //       params,
  //       headers: {
  //         'Cache-Control': 'no-cache, no-store, must-revalidate',
  //         'Pragma': 'no-cache'
  //       }
  //     }
  //   );

// ✅ booking records — createdBy filter सह, pagination साठी
getBookingsPage(createdBy: number, page: number, size: number = 100): Observable<any> {
  const params = new HttpParams()
    .set('_t', Date.now().toString())
    .set('page', page.toString())
    .set('size', size.toString())
    .set('sort', 'createdOn,desc')
    .set('createdBy', createdBy.toString());

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}`,
    { params }
  );
}

getDashboardSummary(labId: number, startDate: string, endDate: string): Observable<any> {
  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/dashboard/patients/new`,
    { params: { labId: labId.toString(), startDate, endDate } }
  );
}
  // }

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

// ✅ NEW — reports चे counts थेट backend कडून, हलका call
getReportCount(labId: number, startDate: string, endDate: string, createdBy?: number): Observable<any> {
  let params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate);

  if (createdBy) {
    params = params.set('createdBy', createdBy.toString());
  }

  return this.http.get(`${this.BASE_URL}/api/v1/lab/report/allReportCount/${labId}`, { params });
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