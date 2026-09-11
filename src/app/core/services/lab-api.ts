import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root'
})
export class LabApiService {

  private readonly BASE_URL = environment.BASE_URL;
  private readonly billUrl = 'https://pdf.hypatholab.in/bill-pdf';
  constructor(private http: HttpClient, private authService: AuthService) { }

  private getLabId(): number {
    return this.authService.labId;
  }

  getLastBooking(): Observable<any> {
    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/booking/patient/last-booking/${this.getLabId()}`
    );
  }


  getTests(franchiseId?: number | string): Observable<any[]> {
    let params = new HttpParams();

    if (franchiseId !== undefined && franchiseId !== null && franchiseId !== '') {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/report-master/tests/t/${this.getLabId()}`,
      { params }
    );
  }

  getDoctors(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/doctor/d/${this.getLabId()}/true?optimize=false`
    );
  }

  createDoctor(payload: any): Observable<any> {
    const formData = new FormData();

    formData.append(
      'type',
      String(payload.type ?? true)
    );

    formData.append(
      'doctor_name',
      String(payload.doctor_name ?? '')
    );

    formData.append(
      'mobileNumber',
      String(payload.mobileNumber ?? '')
    );

    // IMPORTANT:
    // Backend DoctorDto.getEmail() null होऊ नये म्हणून
    // email field नेहमी पाठवत आहोत.
    formData.append(
      'email',
      String(payload.email ?? '')
    );

    formData.append(
      'departmentId',
      String(payload.departmentId ?? 1)
    );

    formData.append(
      'address',
      String(payload.address ?? '')
    );

    formData.append(
      'signature',
      String(payload.signature ?? '')
    );

    formData.append(
      'username',
      String(payload.username ?? '')
    );

    formData.append(
      'password',
      String(payload.password ?? '')
    );

    // IMPORTANT:
    // Empty date_of_birth पाठवू नका.
    // Backend ला java.util.Date अपेक्षित आहे.
    if (payload.date_of_birth) {
      formData.append(
        'date_of_birth',
        String(payload.date_of_birth)
      );
    }

    formData.append(
      'level',
      String(payload.level ?? 1)
    );

    formData.append(
      'degree',
      String(payload.degree ?? '')
    );

    formData.append(
      'isReferral',
      String(payload.isReferral ?? true)
    );

    formData.append(
      'labId',
      String(
        payload.labId ??
        this.getCurrentLabId()
      )
    );

    console.log(
      'CREATE DOCTOR FORMDATA:',
      {
        type: payload.type ?? true,
        doctor_name: payload.doctor_name ?? '',
        mobileNumber: payload.mobileNumber ?? '',
        email: payload.email ?? '',
        departmentId: payload.departmentId ?? 1,
        address: payload.address ?? '',
        signature: payload.signature ?? '',
        username: payload.username ?? '',
        password: payload.password ?? '',
        date_of_birth: payload.date_of_birth ?? '(not sent)',
        level: payload.level ?? 1,
        degree: payload.degree ?? '',
        isReferral: payload.isReferral ?? true,
        labId: payload.labId ?? this.getCurrentLabId()
      }
    );

    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/doctor/create`,
      formData
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
    return this.http.post<any>(
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

  deleteTestFromBooking(labId: number, bookingId: number, testMappingId: number): Observable<any> {
    return this.http.delete(
      `${this.BASE_URL}/api/v1/lab/booking/patient/deleteTest/${labId}/${bookingId}/${testMappingId}`
    );
  }

   getBookingStatusNew(
    labId: number,
    page: number,
    size: number,
    startDate: string,
    endDate: string,
    franchiseId?: any
  ): Observable<any> {
    // ✅ FIX: '_t' cache-buster add kela (getBookingsPage() sarkha).
    // Ha nastana WebView same GET URL sathi cached response return
    // karat hota — mhanun Refresh click kelyavarhi navin booking /
    // status update disat navhta (date range same asel tar URL exact
    // sameच rahायचा, browser/WebView ekach cached reply detach).
    let params = new HttpParams()
      .set('_t', Date.now().toString())
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
  templateName: 'igen',
  params: {
    letterHead: options?.letterHead ?? true,
    domain,
    fLetterHead: options?.fLetterHead ?? false,
    waterMark: options?.waterMark ?? false,
    single: false,   // ✅ company web नेहमी false पाठवते, count काहीही असो
    bookings: bookingIds,
    bookingApi,
    labSettingsApi,
    token,
    reportTestId: 'null',
    cancelTest: 'null'   // ✅ '0' नाही, company 'null' पाठवते
  }
};

    return this.http.post('https://pdf.hypatholab.in/simple-pdf', payload);
  }

  printBill(payload: any): Observable<any> {
    return this.http.post(this.billUrl, payload);
  }

  // buildBillPayload(bookingId: number, billType: string = 'myprice', customBillAmount: any = null): any {
  //   const labId = this.getLabId();
  //   const token = this.authService.getToken();
  //   const domain = environment.domain;

  //   return {
  //     params: {
  //       bookingApi: `${this.BASE_URL}/api/v1/lab/booking/patient/${labId}/${bookingId}`,
  //       labSettingsApi: `${this.BASE_URL}/api/v1/lab/settings/${labId}`,
  //       currentUserApi: `${this.BASE_URL}/auth/current-user`,   // ✅ AuthService वरून confirm केलेला exact URL
  //       billType: billType,
  //       token,
  //       customBillAmount,
  //       domain
  //     }
  //   };
  // }
  // ✅ CONFIRMED Edit Barcode API — array payload accept karto

  buildBillPayload(
  bookingId: number,
  billType: string = 'myprice',
  customBillAmount: any = null,
  letterHead: boolean = true
): any {
    const labId = this.getLabId();
    const token = this.authService.getToken();
    const domain = environment.domain;

    return {
      params: {
        bookingApi: `${this.BASE_URL}/api/v1/lab/booking/patient/${labId}/${bookingId}`,
        labSettingsApi: `${this.BASE_URL}/api/v1/lab/settings/${labId}`,
        currentUserApi: `${this.BASE_URL}/auth/current-user`,
        billType: billType,
        letterHead: letterHead,   // ✅ NEW — company popup madhe "With/Without letterHead" sathi
        token,
        customBillAmount,
        domain
      }
    };
  }
  updateBarcode(bookingId: number, payload: any[]): Observable<any> {
    return this.http.put(
      `${this.BASE_URL}/api/v1/sampleaccession/updateBarcode/${bookingId}`,
      payload
    );
  }

  checkBarcode(payload: any): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/booking/patient/checkbarcode`,
      payload
    );
  }
  // ---------- Franchise Lab (custom lab / hospital) ----------
  getFranchiseLabs(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/lab/franchise/lab/`
    );
  }

  createFranchiseLab(payload: {
    labName: string;
    ownerName?: string | null;
    mobileNumber?: string | number | null;
    whatsappNumber?: string | number | null;
    additionalDetails?: string | null;
  }): Observable<any> {
    return this.http.post(
      `${this.BASE_URL}/api/v1/lab/franchise/lab/create`,
      payload
    );
  }

  // ✅ Delete booking API — labId + bookingId path pattern (deleteTest sarkha)
  deleteBooking(labId: number, bookingId: number): Observable<any> {
    return this.http.delete(
      `${this.BASE_URL}/api/v1/lab/booking/patient/delete-booking/${bookingId}`
    );
  }

  // ============================================================
  // PROFILE / PACKAGE (test-bundle) APIs
  // ============================================================

  // Lab/franchise sathi available packages cha list.
  // franchiseId dilyas backend franchise-specific pricing/list return
  // karto (jasa tests cha franchiseId based rate asto).
  getProfiles(labId: number, franchiseId?: number | string): Observable<any> {
    let params = new HttpParams();

    if (franchiseId !== undefined && franchiseId !== null && franchiseId !== '') {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/report-master/profile/p/${labId}`,
      { params }
    );
  }

  // specific profileIds cha paged/filtered list (comma separated ids).
  getProfilesByIds(labId: number, profileIds: (number | string)[]): Observable<any> {
    const params = new HttpParams().set(
      'profileIds',
      profileIds.join(',')
    );

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/report-master/profile/page/${labId}`,
      { params }
    );
  }

  // ============================================================
  // ✅ NEW: Franchise-aware LIVE search (company web sarkha)
  // ============================================================

  // Test search — franchiseId नुसार assignedPrice (real B2B) परत देतो
  searchTests(
    labId: number,
    franchiseId: any,
    searchData: string,
    page: number = 0,
    size: number = 30
  ): Observable<any> {
    let params = new HttpParams()
      .set('searchData', searchData)
      .set('page', page.toString())
      .set('size', size.toString());

    if (franchiseId !== undefined && franchiseId !== null && franchiseId !== '') {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/report-master/tests/page/${labId}`,
      { params }
    );
  }

  // Package/Profile search — franchiseId नुसार profileAssignedPrice परत देतो
  searchProfiles(
    labId: number,
    franchiseId: any,
    searchData: string,
    page: number = 0,
    size: number = 30
  ): Observable<any> {
    let params = new HttpParams()
      .set('searchData', searchData)
      .set('page', page.toString())
      .set('size', size.toString());

    if (franchiseId !== undefined && franchiseId !== null && franchiseId !== '') {
      params = params.set('franchiseId', franchiseId.toString());
    }

    return this.http.get(
      `${this.BASE_URL}/api/v1/lab/report-master/profile/page/${labId}`,
      { params }
    );
  }
  getPatientByBooking(labId: any, bookingId: any) {
  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/booking/patient/${labId}/${bookingId}`
  );
}

// ✅ NEW: WhatsApp report share
shareReportViaWhatsApp(bookingId: number): Observable<any> {
  return this.http.post(
    `${this.BASE_URL}/api/v1/lab/whatsapp/ShareReportViaWhatsApp?bookingId=${bookingId}`,
    {}
  );
}
getActivePlans(page = 0, size = 20): Observable<any> {
  return this.http.get(`${this.BASE_URL}/api/v1/plans/active-plans/get-all?page=${page}&size=${size}`);
}

getCancelTests(startDate: string, endDate: string, size: number = 500): Observable<any> {
  let params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate)
    .set('size', size.toString());
 
  const headers = new HttpHeaders().set('requestlabid', this.getLabId().toString());
 
  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/booking/patient/cancel-tests`,
    { params, headers }
  );
}
 
// Cancelled barcode resend
resendBarcode(payload: { bookingId: number; barcode: string; testMappingId?: number | null }): Observable<any> {
  return this.http.post(
    `${this.BASE_URL}/api/v1/lab/booking/patient/resend-barcode`,
    payload
  );
}

// getClinicalHistoryList(
//   page: number = 0,
//   size: number = 20,
//   search?: string,
//   startDate?: string,
//   endDate?: string
// ): Observable<any> {
//   let params = new HttpParams()
//     .set('page', page.toString())
//     .set('size', size.toString());
 
//   if (search) params = params.set('search', search);
//   if (startDate) params = params.set('startDate', startDate);
//   if (endDate) params = params.set('endDate', endDate);
 
//   return this.http.get(
//     `${this.BASE_URL}/api/v1/lab/booking/clinical/getAll`,
//     { params }
//   );
// }
 
// Ek specific booking + test chi full clinical-history thread

getClinicalHistoryList(
  page: number = 0,
  size: number = 20,
  search?: string,
  startDate?: string,
  endDate?: string
): Observable<any> {
  let params = new HttpParams()
    .set('labId', this.getLabId().toString())   // ✅ NEW — try as query param
    .set('page', page.toString())
    .set('size', size.toString());

  if (search) params = params.set('search', search);
  if (startDate) params = params.set('startDate', startDate);
  if (endDate) params = params.set('endDate', endDate);

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/booking/clinical/getAll`,
    { params }
  );
}

getClinicalHistoryByBookingTest(bookingId: number, testId: number | string): Observable<any> {
  const params = new HttpParams()
    .set('bookingId', bookingId.toString())
    .set('testId', testId.toString());
 
  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/booking/clinical/get`,
    { params }
  );
}
 
// Navi history entry add karto (chat sarkha nava message pathvne)
// ⚠️ NOTE: Postman example body full booking-create schema dakhavtay
// (customerName, tests[], payment fields...) jo ithe lagu hot nahi
// vatoy — mhanun minimal logical payload vaparlay. Backend testing
// karun exact required fields confirm karava lagtil.
createClinicalHistory(payload: {
  bookingId: number;
  testId: number | string;
  history: string;
  [key: string]: any;
}): Observable<any> {
  return this.http.post(
    `${this.BASE_URL}/api/v1/lab/booking/clinical/create`,
    payload
  );
}
 
// Existing history entry (clinicalId) update karto
updateClinicalHistory(bookingId: number, clinicalId: number, payload: any): Observable<any> {
  return this.http.put(
    `${this.BASE_URL}/api/v1/lab/booking/clinical/update/${bookingId}/${clinicalId}`,
    payload
  );
}
 
// LabApiService madhe (getTests() method chya jawal add kara)


private readonly reportPreviewUrl = 'https://pdf.hypatholab.in/show-preview';



previewDummyReport(payload: any): Observable<any> {
  return this.http.post(this.reportPreviewUrl, payload);
}

getTestRanges(labId: number, testId: number): Observable<any[]> {
  return this.http.get<any[]>(
    `${this.BASE_URL}/api/v1/lab/report-master/master-report/test-ranges/getAllRanges/${labId}/${testId}`
  );
}

// ============================================================
// FRANCHISE APIs — add these methods inside LabApiService
// (paste them anywhere inside the class, e.g. right after
// getFranchisesWithWallet() / getFranchises())
// ============================================================

// 1) Get All Franchise (paged, with search) — Primary API
//    GET /api/v1/lab/franchise/:labId?wallet=true&page=&size=&searchFranchiseId=
getFranchisesPage(
  labId: number,
  page: number = 0,
  size: number = 20,
  search?: string
): Observable<any> {
  let params = new HttpParams()
    .set('wallet', 'true')
    .set('page', page.toString())
    .set('size', size.toString());

  if (search) {
    params = params.set('searchFranchiseId', search);
  }

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/franchise/${labId}`,
    { params }
  );
}

// 2) Get Single Franchise (used by the "eye" view button)
//    GET /api/v1/lab/franchise/:franchiseId
getSingleFranchise(franchiseId: number): Observable<any> {
  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/franchise/${franchiseId}`
  );
}

// 3) Inactive Franchises (optionally date-ranged + paged)
//    GET /api/v1/lab/franchise/inactive?startdate=&enddate=&page=&size=
getInactiveFranchises(
  startDate?: string,
  endDate?: string,
  page?: number,
  size?: number
): Observable<any> {
  let params = new HttpParams();

  if (startDate) params = params.set('startdate', startDate);
  if (endDate) params = params.set('enddate', endDate);
  if (page !== undefined) params = params.set('page', page.toString());
  if (size !== undefined) params = params.set('size', size.toString());

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/franchise/inactive`,
    { params }
  );
}

// 4) Inactive for 7 Days
//    GET /api/v1/lab/franchise/inactive-for-seven-days/:labId?endDate=
getInactiveForSevenDays(labId: number, endDate: string): Observable<any> {
  const params = new HttpParams().set('endDate', endDate);

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/franchise/inactive-for-seven-days/${labId}`,
    { params }
  );
}

// 5) Franchise Analysis (dashboard)
//    GET /api/v1/lab/dashboard/franchise-analysis?labId=&franchiseId=
getFranchiseAnalysis(labId: number, franchiseId: number): Observable<any> {
  const params = new HttpParams()
    .set('labId', labId.toString())
    .set('franchiseId', franchiseId.toString());

  return this.http.get(
    `${this.BASE_URL}/api/v1/lab/dashboard/franchise-analysis`,
    { params }
  );
}

// 6) Franchise Analytics (date range)
//    GET /api/v1/analytics/franchise-analysis/:labId?startDate=&endDate=
getFranchiseAnalytics(
  labId: number,
  startDate: string,
  endDate: string
): Observable<any> {
  const params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate);

  return this.http.get(
    `${this.BASE_URL}/api/v1/analytics/franchise-analysis/${labId}`,
    { params }
  );
}

// ============================================================
// ✅ NEW: WALLET / ACCOUNT SUMMARY APIs (Commission, Booking,
// Refund, Deposit etc.) — Account Summary screen sathi vaparले
// jातात.
// ============================================================

// 1) Wallet Ledger Summary — Opening/Closing Balance, Booking
//    Amount, Cancellation/Refund, Commission Amount, Deposit
//    Amount, Razorpay Deposit, Inventory Debit, Debited/Adjusted
//    Amount. Ha "Accounts Summary" box sathi vaparला jato.
//    GET /api/v1/wallet/get-ledger/:franchiseId?startDate=&endDate=
getWalletLedger(
  franchiseId: number,
  startDate: string,
  endDate: string
): Observable<any> {
  const params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate);

  return this.http.get(
    `${this.BASE_URL}/api/v1/wallet/get-ledger/${franchiseId}`,
    { params }
  );
}

// 2) Wallet Summary + Transaction list — "Past Account Summary"
//    table sathi vaparला jato (booking/refund/recharge history).
//    GET /api/v1/wallet/summary/:labId/:franchiseId?transaction=true&startDate=&endDate=&page=&size=
getWalletSummary(
  labId: number,
  franchiseId: number,
  startDate: string,
  endDate: string,
  page: number = 0,
  size: number = 100
): Observable<any> {
  const params = new HttpParams()
    .set('transaction', 'true')
    .set('startDate', startDate)
    .set('endDate', endDate)
    .set('page', page.toString())
    .set('size', size.toString());

  return this.http.get(
    `${this.BASE_URL}/api/v1/wallet/summary/${labId}/${franchiseId}`,
    { params }
  );
}
// ============================================================
// ✅ NEW: COMMISSION HISTORY (grouped-by-booking wallet API)
// "My Commission History" screen sathi. getWalletSummary()
// pasun vegla — ha groupByBooking + commission flags pathvto,
// je booking-wise commission breakdown detat (testList, bookedBy,
// commissionDate, etc.), transaction ledger nahi.
//
// Backend page `size` la 2000 var cap karto (jast pathvla tari
// response madhe max 2000 records/page yetat) — mhanun helper
// method design madhech clamp kela ahe.
// ============================================================

private readonly COMMISSION_PAGE_SIZE = 2000;

// Single page — infinite-scroll / lazy loading sathi vaparaycha
// asel tar hach vapar.
getCommissionHistoryPage(
  franchiseId: number,
  page: number = 0,
  size: number = this.COMMISSION_PAGE_SIZE
): Observable<any> {
  const params = new HttpParams()
    .set('transaction', 'true')
    .set('groupByBooking', 'true')
    .set('commission', 'true')
    .set('page', page.toString())
    .set('size', Math.min(size, this.COMMISSION_PAGE_SIZE).toString());

  return this.http.get(
    `${this.BASE_URL}/api/v1/wallet/${this.getLabId()}/${franchiseId}`,
    { params }
  );
}

// Sagle pages loop karun (page=0..totalPages-1) ekatra records
// return karto — Excel/PDF export sathi, jithe pura dataset
// memory madhe lagto.
//
// ⚠️ NOTE: ha wallet endpoint records thet `content` madhe deत
// nahi — te `groupedTransaction.content` chya aat nested aahet
// (response root la walletId/balance/franchiseId/etc. asto,
// aani records tyachya खाली groupedTransaction key madhe).
async getAllCommissionHistory(franchiseId: number): Promise<any[]> {
  const all: any[] = [];
  let page = 0;
  let totalPages = 1;

  do {
    const res: any = await firstValueFrom(this.getCommissionHistoryPage(franchiseId, page));
    if (!res) break;
    const grouped = res.groupedTransaction ?? {};
    all.push(...(grouped.content ?? []));
    totalPages = grouped.totalPages || 0;
    page++;
  } while (page < totalPages);

  return all;
}}