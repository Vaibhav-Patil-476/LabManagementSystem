import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root'
})
export class WalletService {

  private readonly BASE_URL = environment.BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getLabId(): number {
    return this.authService.labId;
  }

  private getFranchiseId(): number {
    return this.authService.franchiseId;
  }

  // GET /api/v1/wallet/:labId/:franchiseId  (transactions)
  getWallet(
    labId?: any,
    franchiseId?: any,
    page?: any,
    size?: any,
    transaction?: any,
    paymentMode?: any,
    startDate?: any,
    endDate?: any,
    groupByCommissionDate?: any
  ): Observable<any> {

    const lId = labId ?? this.getLabId();
    const fId = franchiseId ?? this.getFranchiseId();

    // ✅ FIX: he 'summary/' na jodta transactions cha actual endpoint
    // vaparte, getWalletSummary() peksha vegla.
    let url = `${this.BASE_URL}/api/v1/wallet/${lId}/${fId}?`;

    if (transaction != null && transaction !== '') {
      url += `transaction=${transaction}&`;
    }

    if (page != null) {
      url += `page=${page}&`;
    }

    if (size != null) {
      url += `size=${size}&`;
    }

    if (paymentMode != null && paymentMode !== '') {
      url += `paymentMode=${paymentMode}&`;
    }

    // ✅ FIX: startDate/endDate/groupByCommissionDate were missing
    // entirely before, so this call could never be date-filtered.
    // The company web app calls this exact endpoint with these three
    // params to populate the "Past Ledger" transaction list for a
    // date range — getLedger() alone only returns summary totals
    // with no transaction list at all.
    if (startDate) {
      url += `startDate=${startDate}&`;
    }

    if (endDate) {
      url += `endDate=${endDate}&`;
    }

    if (groupByCommissionDate != null) {
      url += `groupByCommissionDate=${groupByCommissionDate}&`;
    }

    url = url.replace(/&$/, '');

    return this.http.get(url);
  }

  // GET /api/v1/wallet/summary/:labId/:franchiseId
  getWalletSummary(labId?: any, franchiseId?: any, startDate?: any, endDate?: any, page?: any, size?: any): Observable<any> {
    const lId = labId ?? this.getLabId();
    const fId = franchiseId ?? this.getFranchiseId();
    let url = `${this.BASE_URL}/api/v1/wallet/summary/${lId}/${fId}?`;
    if (startDate) url += `startDate=${startDate}&`;
    if (endDate) url += `endDate=${endDate}&`;
    if (page != null) url += `page=${page}&`;
    if (size != null) url += `size=${size}`;
    return this.http.get(url);
  }

  // POST /api/v1/lab-wallet/create
  createWallet(payload: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/lab-wallet/create`, payload);
  }

  // POST /api/v1/lab-wallet/add-funds-to-lab-wallet
  // NOTE: match payload keys exactly to your Postman body (not invented here,
  // caller passes the object as-is).
  addFundsToLabWallet(payload: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/lab-wallet/add-funds-to-lab-wallet`, payload);
  }

  // POST /api/v1/lab-wallet/remove-funds-from-lab-wallet
  removeFundsFromLabWallet(payload: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/lab-wallet/remove-funds-from-lab-wallet`, payload);
  }

  // POST /api/v1/order/create-lab-recharge
  createLabRechargeOrder(payload: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/order/create-lab-recharge`, payload);
  }

  // POST /api/v1/order/create  (Franchise Wallet Razorpay Order)
  createRazorpayOrder(payload: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/order/create`, payload);
  }

  // POST /api/v1/order/approve-offline-order/:paymentId
  approveOfflineOrder(paymentId: any): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/v1/order/approve-offline-order/${paymentId}`, null);
  }

  // PUT /api/v1/order/update/{razorpayPaymentId}/{orderId}  (Verify wallet recharge payment)
  verifyWalletPayment(razorpayPaymentId: any, orderId: any, labId?: any, walletId?: any): Observable<any> {
    const lId = labId ?? this.getLabId();
    const body: any = { labId: lId };
    if (walletId != null) {
      body.walletId = walletId;
    }
    return this.http.put(`${this.BASE_URL}/api/v1/order/update/${razorpayPaymentId}/${orderId}`, body);
  }

  // GET /api/v1/wallet/get-ledger/:franchiseId
  getLedger(params: {
    franchiseId: any;
    startDate?: any;
    endDate?: any;
    page?: any;
    size?: any;
    search?: any;
  }): Observable<any> {
    const fId = params.franchiseId ?? this.getFranchiseId();
    let url = `${this.BASE_URL}/api/v1/wallet/get-ledger/${fId}?`;

    if (params.startDate) url += `startDate=${params.startDate}&`;
    if (params.endDate) url += `endDate=${params.endDate}&`;
    if (params.page != null) url += `page=${params.page}&`;
    if (params.size != null) url += `size=${params.size}&`;
    if (params.search) url += `search=${params.search}&`;

    url = url.replace(/&$/, '');

    return this.http.get(url);
  }
}