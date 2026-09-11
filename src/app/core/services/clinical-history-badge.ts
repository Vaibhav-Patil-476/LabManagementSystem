import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ClinicalHistoryBadgeService {
  private unreadCountSubject = new BehaviorSubject<number>(0);
  unreadCount$ = this.unreadCountSubject.asObservable();

  setUnreadCount(count: number): void {
    this.unreadCountSubject.next(count);
  }

  get currentUnreadCount(): number {
    return this.unreadCountSubject.value;
  }
}