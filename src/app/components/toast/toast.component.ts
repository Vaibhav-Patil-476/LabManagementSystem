import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Toast, ToastService } from '../../services/toast';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class ToastComponent implements OnInit {
  toasts: Toast[] = [];

  constructor(private toastService: ToastService) {}

  ngOnInit() {
    this.toastService.toasts.subscribe(toasts => {
      this.toasts = toasts;
    });
  }

  dismiss(id: number) {
    this.toastService.remove(id);
  }
}