import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root'
})
export class SampleAccessionService {

  private readonly BASE_URL = environment.BASE_URL;

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getLabId(): number {
    return this.authService.labId;
  }

  // Barcode shodhayla (GET)
  getSampleByBarcode(barcode: string, labId: number = this.getLabId()): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE_URL}/api/v1/sampleaccession/receiveSample/${labId}/${encodeURIComponent(barcode)}`
    );
  }

  // Receive karayla (PUT)
  updateStatus(sampleAccessionId: number, body: any, labId: number = this.getLabId()): Observable<any> {
    return this.http.put<any>(
      `${this.BASE_URL}/api/v1/sampleaccession/updateStatus/${labId}/${sampleAccessionId}`,
      body
    );
  }

  // TODO: Restore API milala ki ithe add kara
}