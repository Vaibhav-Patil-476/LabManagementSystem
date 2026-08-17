import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonButton, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, personOutline, businessOutline,
  ribbonOutline, keyOutline
} from 'ionicons/icons';

import { AuthService } from '../../core/services/auth';
import { LabApiService } from '../../core/services/lab-api';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  imports: [CommonModule, IonContent, IonIcon, IonButton, IonSpinner]
})
export class ProfilePage implements OnInit {

  loading = true;
  user: any = null;
  activePlan: any = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private labApi: LabApiService
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'person-outline': personOutline,
      'business-outline': businessOutline,
      'ribbon-outline': ribbonOutline,
      'key-outline': keyOutline
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.loading = true;

    const existing = this.authService.currentUserValue?.raw;
    if (existing) {
      this.user = existing;
      this.loadActivePlan();
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.user = this.authService.currentUserValue?.raw;
        this.loadActivePlan();
      },
      error: () => { this.loading = false; }
    });
  }

  private loadActivePlan(): void {
    this.labApi.getActivePlans().subscribe({
      next: (res: any) => {
        const content = res?.content || [];
        // सगळ्यात आधी active:true असलेला plan, नाहीतर पहिला
        this.activePlan = content.find((p: any) => p.active) || content[0] || null;
        this.loading = false;
      },
      error: () => {
        this.activePlan = null;
        this.loading = false;
      }
    });
  }

  formatDate(ts: number): string {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(',', '');
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  updatePassword(): void {
    this.router.navigate(['/update-password']); // तुमचं actual route टाका
  }
}