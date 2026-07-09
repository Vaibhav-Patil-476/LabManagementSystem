import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CurrentUser {
  role: string;
  franchiseId: number;      // ✅ booking payload साठी (franchise.franchiseId → 2541)
  franchiseName: string;
  labId: number;            // ✅ tests/doctors fetch साठी (lab.labId → 3505)
  permissions: string[];
  raw: any;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private api = environment.BASE_URL;

  // ✅ Role/franchise/permissions — FAKTA in-memory (no storage)
  private currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ==========================
  // 🔑 TOKEN — sessionStorage madhe (refresh var tikto, tab close var jato)
  // ==========================
  setToken(token: string) {
    sessionStorage.setItem('token', token);
  }

  getToken(): string | null {
    return sessionStorage.getItem('token');
  }

  clearToken() {
    sessionStorage.removeItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  login(data: any): Observable<any> {
    return this.http.post(`${this.api}/auth/login`, data);
  }

  // ==========================
  // ✅ Login zalyavar / app refresh zalyavar he call kara
  // Response varun role/franchise/lab info parse karun in-memory saathavto
  // ==========================
  loadCurrentUser(): Observable<any> {
    return this.http.get(`${this.api}/auth/current-user`).pipe(
      tap((res: any) => {
        const parsed = this.parseCurrentUser(res);
        this.currentUserSubject.next(parsed);
      })
    );
  }

  // ==========================
  // ✅ CHANGED — franchise ani lab HE DOGHE VEGLE objects ahet
  // (confirmed backend response varun):
  //   res.franchise = { franchiseId: 2541, franchiseName: 'dar', ... }
  //   res.lab       = { labId: 3505, lab_name: 'itlab1', ... }
  // ==========================
  private parseCurrentUser(res: any): CurrentUser {
    const franchiseId = res?.franchise?.franchiseId ?? res?.franchiseId ?? 0;
    const franchiseName = res?.franchise?.franchiseName ?? '';
    const labId = res?.lab?.labId ?? res?.labId ?? 0;

    const role = res?.roles?.[0]?.name ?? '';
    const permissions = (res?.permissions || []).map((p: any) => p.name);

    return {
      role,
      franchiseId: Number(franchiseId) || 0,
      franchiseName: franchiseName || '',
      labId: Number(labId) || 0,
      permissions,
      raw: res
    };
  }

  get currentUserValue(): CurrentUser | null {
    return this.currentUserSubject.value;
  }

  get role(): string {
    return this.currentUserSubject.value?.role || '';
  }

  // ✅ labId — tests/doctors/reports (lab-api.ts) sathi
  get labId(): number {
    return this.currentUserSubject.value?.labId || 0;
  }

  // ✅ franchiseId — booking create payload sathi
  get franchiseId(): number {
    return this.currentUserSubject.value?.franchiseId || 0;
  }

  get franchiseName(): string {
    return this.currentUserSubject.value?.franchiseName || '';
  }

  logout() {
    this.clearToken();
    this.currentUserSubject.next(null);
  }
}