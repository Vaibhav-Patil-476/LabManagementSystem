import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private api = environment.BASE_URL;

  constructor(private http: HttpClient) {}

  login(data: any): Observable<any> {
    return this.http.post(`${this.api}/auth/login`, data);
  }

  // ✅ ADDED — role + permissions yasathi
  getCurrentUser(): Observable<any> {
    return this.http.get(`${this.api}/auth/current-user`);
  }
}