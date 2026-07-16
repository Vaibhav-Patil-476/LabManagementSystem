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

  // Juna generic/heavy endpoint. Booking-status page cha client-side
  // safety-net flow sathi ajun vaparat ahe, pan dashboard ata yavar
  // avlambun nahi.
  getBookingsPage(
    createdBy: number,
    page: number,
    size: number = 50,
    filters?: {
      fromDate?: string;
      toDate?: string;
      franchiseId?: any;
      reportStatus?: string;
      search?: string;
    }
  ): Observable<any> {
    let params = new HttpParams()
      .set('_t', Date.now().toString())
      .set('page', page.toString())
      .set('size', size.toString())
      .set('sort', 'createdOn,desc')
      .set('createdBy', createdBy.toString());

    if (filters) {
      if (filters.fromDate) params = params.set('fromDate', filters.fromDate);
      if (filters.toDate) params = params.set('toDate', filters.toDate);
      if (filters.franchiseId !== undefined && filters.franchiseId !== null) {
        params = params.set('franchiseId', filters.franchiseId.toString());
      }
      if (filters.reportStatus) params = params.set('reportStatus', filters.reportStatus);
      if (filters.search) params = params.set('search', filters.search);
    }

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/${this.getLabId()}`,
      { params }
    );
  }

  // FAST endpoint — company app pramane server-side date + franchise
  // filtering karto, tyamule payload halka ani jalad yeto.
  // booking-status page ani dashboard doghansathi hach vaparla jato.
  //
  // NOTE 1: 'page' 0-INDEXED AHE (Spring Pageable — response cha
  // pageable.pageNumber / offset confirm karto). Pahili/ekmev page sathi
  // 0 pathva, 1 nahi — nahitar backend "dusri page" (records 21-40)
  // magto ani thoda data aslelya divsansathi content rikama yeto.
  //
  // NOTE 2: 'createdBy' backend support karat nahi (real company
  // network request madhe to param nahiye) — pathvla tar backend
  // content rikama parat karto. Staff-specific filtering client-side
  // (dashboard.page.ts cha applyOverrideFilter) karaycha.
  getBookingStatusNew(
    labId: number,
    page: number,
    size: number,
    startDate: string,
    endDate: string,
    franchiseId?: any
  ): Observable<any> {
    let params = new HttpParams()
      .set('optimize', 'false')
      .set('page', page.toString())
      .set('size', size.toString())
      .set('startDate', startDate)
      .set('endDate', endDate);

    if (franchiseId !== undefined && franchiseId !== null) {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/booking-status/new/${labId}`,
      { params }
    );
  }

  getDashboardSummary(labId: number, startDate: string, endDate: string): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/dashboard/patients/new`,
      { params: { labId: labId.toString(), startDate, endDate } }
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

  updateSampleStatusBulk(body: { barcode: string; userId: number; status: string }[]): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/logistic/sample/update/bulk`,
      body
    );
  }

  updatePatient(labId: number, bookingId: number, body: any): Observable<any> {
    return this.http.put(
      `${this.BASE_URL}/api/v1/lab/booking/patient/updatePatient/${labId}/${bookingId}`,
      body
    );
  }

  updateTestMaster(testId: number, body: any): Observable<any> {
    return this.http.put(
      `${this.BASE_URL}/api/lab/report-master/tests/update/${testId}`,
      body
    );
  }

  getCurrentLabId(): number {
    return this.getLabId();
  }

  getReportsByStatus(
    labId: number,
    reportStatus: string,
    page: number = 0,
    size: number = 50,
    fromDate?: string,
    toDate?: string,
    franchiseId?: any
  ): Observable<any> {
    let params = new HttpParams()
      .set('reportStatus', reportStatus)
      .set('optimize', 'true')
      .set('page', page.toString())
      .set('size', size.toString());

    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);
    if (franchiseId !== undefined && franchiseId !== null) {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get(`${this.BASE_URL}/api/v1/lab/report/all/${labId}`, { params });
  }
  // ✅ CONFIRMED via Postman collection: dedicated insert-capable
  // endpoint for adding a NEW test to an existing booking. Unlike
  // updatePatient (update-only, confirmed via live testing), this
  // endpoint accepts newTest:true and actually creates a new
  // test-mapping row.
  addTestToBooking(body: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/booking/patient/addTest`,
      body
    );
  }

generatePdfReport(
  bookingIds: number[],
  options?: {
    single?: boolean;
    letterHead?: boolean;
    fLetterHead?: boolean;
    waterMark?: boolean;
  }
): Observable<any> {
  const labId = this.getLabId();
  const token = this.authService.getToken(); // तुझ्या AuthService प्रमाणे adjust कर
  const domain = environment.domain;

  const bookingApi = `${this.BASE_URL}/api/v1/lab/booking/patient/get-bookings/${labId}?bookingIds=${bookingIds.join(',')}`;
  const labSettingsApi = `${this.BASE_URL}/api/v1/lab/settings/${labId}`;

  const payload = {
    templateName: 'template1',
    params: {
      letterHead: options?.letterHead ?? true,
      domain,
      fLetterHead: options?.fLetterHead ?? false,
      waterMark: options?.waterMark ?? false,
      single: options?.single ?? (bookingIds.length === 1),
      bookings: bookingIds,
      bookingApi,
      labSettingsApi,
      token,
      reportTestId: 'null',   // ✅ हे मिसिंग होतं — company code मध्ये हे नेहमी पाठवलं जातं
      cancelTest: '0'          // ✅ हेही मिसिंग होतं
    }
  };

  return this.http.post('https://pdf.hypatholab.in/simple-pdf', payload);
}}