import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toasts$ = new BehaviorSubject<Toast[]>([]);
  toasts = this.toasts$.asObservable();
  private counter = 0;

  show(type: 'success' | 'error' | 'warning', title: string, message: string) {
    const id = ++this.counter;
    const toast: Toast = { id, type, title, message };
    this.toasts$.next([...this.toasts$.value, toast]);

    // Auto remove after 3 seconds
    setTimeout(() => this.remove(id), 3000);
  }

  success(title: string, message: string) {
    this.show('success', title, message);
  }

  error(title: string, message: string) {
    this.show('error', title, message);
  }

  warning(title: string, message: string) {
    this.show('warning', title, message);
  }

  remove(id: number) {
    this.toasts$.next(
      this.toasts$.value.filter(t => t.id !== id)
    );
  }
}