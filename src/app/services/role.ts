import { Injectable } from '@angular/core';
import { AuthService } from './auth';

export enum AppRole {
  LAB_ADMIN = 'ROLE_LAB_ADMIN',
  STAFF = 'ROLE_STAFF',
  FRANCHISE = 'ROLE_FRANCHISE',
  FRANCHISE_STAFF = 'ROLE_FRANCHISE_STAFF'
}

@Injectable({
  providedIn: 'root'
})
export class RoleService {

  constructor(private authService: AuthService) {}

  get currentRole(): string {
    return this.authService.role;
  }

  get canViewBilling(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN;
  }

  get canEditPayment(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN;
  }

  get isFullAccess(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN;
  }

  get isFranchiseSide(): boolean {
    return this.currentRole === AppRole.FRANCHISE ||
           this.currentRole === AppRole.FRANCHISE_STAFF;
  }

  get isLabAdmin(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN;
  }

  get isStaff(): boolean {
    return this.currentRole === AppRole.STAFF;
  }

  get isLabSideUI(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN ||
           this.currentRole === AppRole.STAFF;
  }

  // Only Lab Admin can download the generated report PDFs.
  // Staff can view report status only (In Process / Pending / Complete etc.)
  get canDownloadReports(): boolean {
    return this.currentRole === AppRole.LAB_ADMIN;
  }

  hasRole(...roles: AppRole[]): boolean {
    return roles.includes(this.currentRole as AppRole);
  }
}