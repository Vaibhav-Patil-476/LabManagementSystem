import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonSpinner
} from '@ionic/angular/standalone';

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
    IonItem,
    IonInput,
    IonButton,
    IonSpinner
  ]
})
export class LoginPage {

  email = '';
  password = '';
  loading = false;

  constructor(
    private router: Router,
    private toastService: ToastService,
    private authService: AuthService
  ) { }

  login() {

    if (!this.email || !this.password) {
      this.toastService.error('Error', 'Username and Password required');
      return;
    }

    this.loading = true;

    // ✅ jhuna session clear
    this.authService.logout();

    const body = {
      username: this.email,
      password: this.password
    };

    this.authService.login(body).subscribe({

      next: (response) => {

        // ✅ FAKTA token sessionStorage madhe
        this.authService.setToken(response.token);

        // ✅ role/franchise/permissions — API varun fresh ghenar, save nahi karat
        this.authService.loadCurrentUser().subscribe({

          next: (user) => {
            this.loading = false;

            console.log('CURRENT USER:', user);
            console.log('ROLE:', this.authService.role);

            this.toastService.success('Success', 'Login Successful');

            // ✅ router.navigate vaparla — full page reload nako,
            // token sessionStorage madhe ahech, in-memory user data pan lगेच bharla
            this.router.navigate(['/dashboard']);
          },

          error: (err) => {
            this.loading = false;
            console.log('CURRENT USER ERROR:', err);
            this.toastService.warning('Warning', 'Logged in, but role fetch failed.');
            this.router.navigate(['/dashboard']);
          }
        });
      },

      error: (error) => {
        this.loading = false;
        console.log(error);

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