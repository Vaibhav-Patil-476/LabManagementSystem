import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonInput,
  IonButton,
  IonSpinner,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  fingerPrintOutline,
  scanOutline
} from 'ionicons/icons';

import { ToastService } from '../../services/toast';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonInput,
    IonButton,
    IonSpinner,
    IonIcon
  ]
})
export class LoginPage {

  email = '';
  password = '';
  loading = false;
  showPassword = false;
  rememberMe = false;
  emailFocus = false;
  passFocus = false;

  constructor(
    private router: Router,
    private toastService: ToastService,
    private authService: AuthService
  ) {
    addIcons({
      'mail-outline': mailOutline,
      'lock-closed-outline': lockClosedOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline,
      'finger-print-outline': fingerPrintOutline,
      'scan-outline': scanOutline
    });
  }

  login() {

    if (!this.email || !this.password) {
      this.toastService.error('Error', 'Username and Password required');
      return;
    }

    this.loading = true;

    this.authService.logout();

    const body = {
      username: this.email,
      password: this.password
    };

    this.authService.login(body).subscribe({

      next: (response) => {

        this.authService.setToken(response.token);

        this.authService.loadCurrentUser().subscribe({

          next: (user) => {
            this.loading = false;
            this.toastService.success('Success', 'Login Successful');
            this.router.navigate(['/dashboard']);
          },

          error: (err) => {
            this.loading = false;
            this.toastService.warning('Warning', 'Logged in, but role fetch failed.');
            this.router.navigate(['/dashboard']);
          }
        });
      },

      error: (error) => {
        this.loading = false;

        if (error.status === 401) {
          this.toastService.error('Login Failed', 'Invalid Username or Password');
        } else if (error.status === 0) {
          this.toastService.error('Server Error', 'Unable to connect server');
        } else {
          this.toastService.error(
            'Error',
            error.error?.message || 'Something went wrong'
          );
        }
      }
    });
  }
}