import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../../environments/environment';
import { CurrentUser } from '../../models/user.model';

export type { CurrentUser };

const TOKEN_KEY = 'token';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private api = environment.BASE_URL;

  private currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  // In-memory cache so getToken()/isLoggedIn() can stay synchronous
  // (lab-api.ts and others call getToken() without awaiting).
  private tokenCache: string | null = null;

  // Resolves once the token has been loaded from secure storage on
  // app start. Route guards / app init can await this if needed.
  public tokenReady: Promise<void>;

  constructor(private http: HttpClient) {
    this.tokenReady = this.loadTokenFromStorage();
  }

  private async loadTokenFromStorage(): Promise<void> {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    this.tokenCache = value ?? null;
  }

  setToken(token: string) {
    this.tokenCache = token;
    Preferences.set({ key: TOKEN_KEY, value: token });
  }

  getToken(): string | null {
    return this.tokenCache;
  }

  clearToken() {
    this.tokenCache = null;
    Preferences.remove({ key: TOKEN_KEY });
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