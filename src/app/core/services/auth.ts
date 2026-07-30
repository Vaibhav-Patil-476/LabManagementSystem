import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CurrentUser {
  userId: number;
  role: string;
  franchiseId: number;
  franchiseName: string;
  labId: number;
  permissions: string[];
  raw: any;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private api = environment.BASE_URL;

  private currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

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

  loadCurrentUser(): Observable<any> {
    return this.http.get(`${this.api}/auth/current-user`).pipe(
      tap((res: any) => {
        const parsed = this.parseCurrentUser(res);
        this.currentUserSubject.next(parsed);
      })
    );
  }

  private parseCurrentUser(res: any): CurrentUser {
    const franchiseId = res?.franchise?.franchiseId ?? res?.franchiseId ?? 0;
    const franchiseName = res?.franchise?.franchiseName ?? '';
    const labId = res?.lab?.labId ?? res?.labId ?? 0;

    // TODO: confirm the exact key against the real /auth/current-user payload
    // (log `res` once and check) — falls back through the common names so this
    // keeps working even if it's nested under a different key than expected.
    const userId = res?.id ?? res?.userId ?? res?.staffId ?? res?.user?.id ?? 0;

    const role = res?.roles?.[0]?.name ?? '';
    const permissions = (res?.permissions || []).map((p: any) => p.name);

    return {
      userId: Number(userId) || 0,
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

  get userId(): number {
    return this.currentUserSubject.value?.userId || 0;
  }

  get role(): string {
    return this.currentUserSubject.value?.role || '';
  }

  get labId(): number {
    return this.currentUserSubject.value?.labId || 0;
  }

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