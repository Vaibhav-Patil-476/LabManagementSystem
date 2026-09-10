
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CommissionRecord, Franchise, PageableResponse } from '../models/commission.model';


// Backend caps page size at 2000 regardless of what is requested.
const MAX_PAGE_SIZE = 2000;

@Injectable({ providedIn: 'root' })
export class CommissionService {

  constructor(private http: HttpClient) {}
 private readonly BASE_URL = environment.BASE_URL;
  /** Franchise / collection-center list for the dropdown filter */
  getFranchises(labId: number): Observable<Franchise[]> {
    const params = new HttpParams()
      .set('wallet', 'false')
      .set('page', 0)
      .set('size', 100);

    return this.http
      .get<PageableResponse<Franchise>>(`${environment.BASE_URL}/api/v1/lab/franchise/${labId}`, { params })
      .pipe(map(res => res.content ?? []));
  }

  /**
   * Fetches ONE page of the wallet/commission-history API.
   * (Kept separate from fetchAllCommissionHistory so callers doing
   * infinite-scroll can pull page-by-page instead of everything at once.)
   */
  getCommissionHistoryPage(
    labId: number,
    franchiseId: number,
    page: number,
    size: number = MAX_PAGE_SIZE
  ): Observable<PageableResponse<CommissionRecord>> {
    const params = new HttpParams()
      .set('transaction', 'true')
      .set('groupByBooking', 'true')
      .set('commission', 'true')
      .set('page', page)
      .set('size', Math.min(size, MAX_PAGE_SIZE));

    return this.http.get<PageableResponse<CommissionRecord>>(
      `${environment.BASE_URL}/api/v1/wallet/${labId}/${franchiseId}`,
      { params }
    );
  }

  /**
   * Loops page=0..totalPages-1 (2000 records per page, since the backend
   * ignores/caps any larger `size`) and returns the full merged record set.
   * Use for the Excel/PDF export, where you need everything in memory.
   */
  fetchAllCommissionHistory(labId: number, franchiseId: number): Observable<CommissionRecord[]> {
    return from(this.fetchAllPages(labId, franchiseId));
  }

  private async fetchAllPages(labId: number, franchiseId: number): Promise<CommissionRecord[]> {
    const all: CommissionRecord[] = [];
    let page = 0;
    let totalPages = 1;

    do {
      const res = await firstValueFrom(this.getCommissionHistoryPage(labId, franchiseId, page));
      if (!res) break;
      all.push(...(res.content ?? []));
      totalPages = res.totalPages || 0;
      page++;
    } while (page < totalPages);

    return all;
  }
}