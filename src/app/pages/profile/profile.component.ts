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

interface DisplayOrgInfo {
  sectionTitle: string;
  name: string;
  ownerName: string;
  mobileNumber: string;
  address: string;
  pincode: string;
  state: string;
  city: string;
  email: string;
}

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

  // Role नुसार dynamically तयार होणारी company/org info
  displayInfo: DisplayOrgInfo | null = null;
  roleName = '';

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

  private async loadProfile(): Promise<void> {
    this.loading = true;

    // ✅ token storage मधून पूर्ण load होईपर्यंत थांबा
    // (अन्यथा native app मध्ये race condition मुळे Authorization
    // header न लागताच API call जातो आणि backend 500 देतं)
    await this.authService.tokenReady;

    const existing = this.authService.currentUserValue?.raw;
    if (existing) {
      this.user = existing;
      this.buildDisplayInfo();
      this.loadActivePlan();
      return;
    }

    this.authService.loadCurrentUser().subscribe({
      next: () => {
        this.user = this.authService.currentUserValue?.raw;
        this.buildDisplayInfo();
        this.loadActivePlan();
      },
      error: (err) => {
        console.error('Profile load failed:', err);
        this.loading = false;
      }
    });
  }

  /**
   * Role नुसार (Admin / Franchise / Sub-Franchise / Super-Franchise)
   * योग्य organization object निवडून एक common shape मध्ये तयार करतो,
   * त्यामुळे template मध्ये एकच generic section वापरता येतो.
   *
   * ⚠️ Email नेहमी user.email (top-level login email) पासूनच घेतो —
   * franchise.email / lab.email वेगळे असू शकतात आणि ते इथे दाखवायचे नाहीत
   * (admin panel च्या "Email" field शी match करण्यासाठी).
   */
  private buildDisplayInfo(): void {
    if (!this.user) {
      this.displayInfo = null;
      return;
    }

    this.roleName = this.user.roles?.[0]?.name || '';

    // वेगवेगळ्या role response मध्ये org data वेगवेगळ्या key खाली असू शकतो
    const org =
      this.user.franchise ||
      this.user.subFranchise ||
      this.user.superFranchise ||
      this.user.franchiseDto ||
      null;

    if (org) {
      this.displayInfo = {
        sectionTitle: this.getSectionTitle(this.roleName),
        name: org.franchiseName || org.name || '-',
        ownerName: org.ownerName || '-',
        mobileNumber: org.mobileNumber || this.user.mobileNumber || '-',
        address: org.address || '-',
        pincode: org.pincode != null ? String(org.pincode) : '-',
        state: org.state || '-',
        city: org.city || '-',
        email: this.user.email || '-'
      };
    } else if (this.user.lab) {
      // Admin / pure lab-level user
      this.displayInfo = {
        sectionTitle: 'Lab Information',
        name: this.user.lab.lab_name || '-',
        ownerName: this.user.lab.lab_owner_name || '-',
        mobileNumber: this.user.lab.owner_contact_number || this.user.mobileNumber || '-',
        address: this.user.lab.lab_address || '-',
        pincode: this.user.lab.pincode != null ? String(this.user.lab.pincode) : '-',
        state: this.user.lab.state || '-',
        city: this.user.lab.city || '-',
        email: this.user.email || '-'
      };
    } else {
      this.displayInfo = null;
    }
  }

  private getSectionTitle(role: string): string {
    switch (role) {
      case 'ROLE_SUPER_FRANCHISE': return 'Super Franchise Information';
      case 'ROLE_SUB_FRANCHISE': return 'Sub Franchise Information';
      case 'ROLE_FRANCHISE': return 'Franchise Information';
      case 'ROLE_ADMIN': return 'Admin / Lab Information';
      default: return 'Organization Information';
    }
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