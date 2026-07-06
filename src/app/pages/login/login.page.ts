import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';

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
    IonicModule,
    RouterModule
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
  ) {}

  login() {

    if (!this.email || !this.password) {
      this.toastService.error('Error', 'Username and Password required');
      return;
    }

    this.loading = true;

    const body = {
      username: this.email,
      password: this.password
    };

    this.authService.login(body).subscribe({

      next: (response) => {

        this.loading = false;

        localStorage.setItem('token', response.token);
        localStorage.setItem('username', response.username);
        localStorage.setItem('franchise', JSON.stringify(response.franchise));
        localStorage.setItem('employee', JSON.stringify(response.employee));
        localStorage.setItem('isLoggedIn', 'true');

        this.toastService.success('Success', 'Login Successful');

        setTimeout(() => {
          this.router.navigateByUrl('/dashboard', {
            replaceUrl: true
          });
        }, 800);

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