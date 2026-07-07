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
  ) { }

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

        localStorage.setItem('token', response.token);
        localStorage.setItem('username', response.username);
        localStorage.setItem('franchise', JSON.stringify(response.franchise));
        localStorage.setItem('employee', JSON.stringify(response.employee));
        localStorage.setItem('isLoggedIn', 'true');

        // ✅ role login response madhe nahi ythe, current-user API call kar
        this.authService.getCurrentUser().subscribe({

          next: (user) => {

            this.loading = false;

            const role = user?.roles?.[0]?.name || '';
            const permissions = (user?.permissions || []).map((p: any) => p.name);

            localStorage.setItem('role', role);
            localStorage.setItem('permissions', JSON.stringify(permissions));
            localStorage.setItem('currentUser', JSON.stringify(user));

            console.log('CURRENT USER:', user);
            console.log('ROLE:', role);
            console.log('PERMISSIONS:', permissions);

            this.toastService.success('Success', 'Login Successful');

            setTimeout(() => {
              this.router.navigateByUrl('/dashboard', { replaceUrl: true });
            }, 800);
          },

          error: (err) => {
            this.loading = false;
            console.log('CURRENT USER ERROR:', err);

            this.toastService.warning('Warning', 'Logged in, but role fetch failed.');

            setTimeout(() => {
              this.router.navigateByUrl('/dashboard', { replaceUrl: true });
            }, 800);
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