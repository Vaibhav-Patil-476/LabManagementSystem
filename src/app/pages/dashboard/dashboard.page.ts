import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuButton,
  IonProgressBar,
  IonSearchbar,
  MenuController
} from "@ionic/angular/standalone";

import { addIcons } from "ionicons";
import {
  beakerOutline,
  calendarOutline,
  documentTextOutline,
  flaskOutline,
  logOutOutline,
  notificationsOutline,
  peopleOutline,
  personAddOutline,
  personCircleOutline,
  personOutline,
  shareSocialOutline,
  clipboardOutline,
  downloadOutline,
  listOutline,
  timeOutline
} from "ionicons/icons";

interface Booking {
  bookingId: string;
  name: string;
  tests: string;
  doctor: string;
  reports: string;
  totalAmount: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonSearchbar,
    IonMenu,
    IonList,
    IonItem,
    IonLabel,
    IonMenuButton,
    IonProgressBar
  ]
})
export class DashboardPage implements OnInit {

  user: any = {};
  searchText = '';
  allBookings: Booking[] = [];
  filteredData: any[] = [];

  totalPatients = 0;
  totalBookings = 0;
  totalReports = 0;
  totalSamples = 0;

  patients: any[] = [];

  bookings: Booking[] = [];

  dailyBookings: any[] = [];

  // 👇 DATE FILTER sathi navin variables
  filterDate: string = '';          // input madhla selected date (yyyy-mm-dd)

  constructor(
    private router: Router,
    private menuCtrl: MenuController
  ) {

    addIcons({
      'people-outline': peopleOutline,
      'flask-outline': flaskOutline,
      'document-text-outline': documentTextOutline,
      'calendar-outline': calendarOutline,
      'person-add-outline': personAddOutline,
      'share-social-outline': shareSocialOutline,
      'notifications-outline': notificationsOutline,
      'person-outline': personOutline,
      'person-circle-outline': personCircleOutline,
      'log-out-outline': logOutOutline,
      'beaker-outline': beakerOutline,
      'clipboard-outline': clipboardOutline,
      'download-outline': downloadOutline,
      'list-outline': listOutline,
      'time-outline': timeOutline
    });

  }
  ngOnInit() {

    const username = localStorage.getItem('username');
    const franchise = JSON.parse(localStorage.getItem('franchise') || '{}');

    if (!username) {
      this.router.navigate(['/login']);
      return;
    }

    this.user = {
      name: username,
      email: franchise.email || '',
      role: 'Lab Administrator'
    };

    this.loadDashboard();
  }

  ionViewWillEnter() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.patients = JSON.parse(localStorage.getItem('patients') || '[]');
    this.calculateStats();

    this.bookings = this.patients
      .slice()
      .reverse()
      .slice(0, 10)
      .map((p: any) => ({
        bookingId: p.id,
        name: p.name,
        tests: p.tests?.map((t: any) => t.name).join(", "),
        doctor: p.doctor,
        reports: p.eReport ? "Completed" : "Pending",
        totalAmount: p.totalAmount
      }));

    this.allBookings = [...this.bookings];
    this.prepareDailyBookings();
  }

  // 👇 Stats calculate karnyacha function (filter la vaparto)
  calculateStats() {

    // Jar date select keli asel tar fakt tya date che patients ghe
    let data = this.patients;

    if (this.filterDate) {
      data = this.patients.filter((p: any) => {
        const rawDate = p.bookingDate || p.date || p.createdDate;
        if (!rawDate) return false;
        const d = this.parseDate(rawDate);
        return this.toKey(d) === this.filterDate;
      });
    }

    this.totalPatients = data.length;
    this.totalBookings = data.length;
    this.totalReports = data.filter((x: any) => x.eReport).length;
    this.totalSamples = data.reduce((sum: number, p: any) => {
      return sum + (p.tests ? p.tests.length : 0);
    }, 0);
  }

  // 👇 Date select/change zali ki call hoto
  onDateChange() {
    this.calculateStats();
  }

  // 👇 Filter clear karnyacha function
  clearFilter() {
    this.filterDate = '';
    this.calculateStats();
  }

  filterBookings() {
    const value = this.searchText.toLowerCase().trim();

    if (!value) {
      this.bookings = [...this.allBookings];
      return;
    }

    this.bookings = this.allBookings.filter(b =>
      b.name.toLowerCase().includes(value) ||
      b.bookingId.toLowerCase().includes(value) ||
      b.doctor.toLowerCase().includes(value) ||
      b.tests.toLowerCase().includes(value)
    );
  }

  goToPage(page: string) {
    this.menuCtrl.close();
    this.router.navigate(['/' + page]);
  }

  goToProfile() {
    this.menuCtrl.close();
    this.router.navigate(['/profile']);
  }

  logout() {
    this.menuCtrl.close();

    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('franchise');
    localStorage.removeItem('employee');
    localStorage.removeItem('isLoggedIn');

    this.router.navigate(['/login']);
  }

  prepareDailyBookings() {

    const grouped: any = {};

    this.patients.forEach((p: any) => {

      const rawDate = p.bookingDate || p.date || p.createdDate;

      let d: Date;

      if (rawDate) {
        d = this.parseDate(rawDate);
      } else {
        d = new Date();
      }

      if (isNaN(d.getTime())) {
        d = new Date();
      }

      const key = this.toKey(d);

      if (!grouped[key]) {
        grouped[key] = {
          dateKey: key,
          date: d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }),
          bookings: 0,
          samples: 0,
          received: 0,
          pending: 0,
          rejected: 0,
          tests: 0,
          amount: 0
        };
      }

      grouped[key].bookings++;

      const sampleCount = p.tests ? p.tests.length : 0;

      grouped[key].samples += sampleCount;
      grouped[key].tests += sampleCount;
      grouped[key].amount += Number(p.totalAmount || 0);

      if (p.tests && Array.isArray(p.tests)) {
        p.tests.forEach((test: any) => {
          switch ((test.status || '').toLowerCase()) {
            case 'received':
            case 'completed':
              grouped[key].received++;
              break;
            case 'rejected':
              grouped[key].rejected++;
              break;
            default:
              grouped[key].pending++;
              break;
          }
        });
      } else {
        if (p.eReport) {
          grouped[key].received += sampleCount;
        } else {
          grouped[key].pending += sampleCount;
        }
      }

    });

    this.dailyBookings = Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .map(key => grouped[key])
      .slice(0, 5);
  }

  // 👇 Date la yyyy-mm-dd key banavto (comparison sathi)
  toKey(d: Date): string {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  parseDate(dateStr: string): Date {
    // Format: "7/4/2026, 1:17:17 PM"  (M/D/YYYY)
    try {
      const datePart = dateStr.split(',')[0].trim();
      const parts = datePart.split('/');

      if (parts.length === 3) {
        const month = Number(parts[0]);
        const day = Number(parts[1]);
        const year = Number(parts[2]);
        return new Date(year, month - 1, day);
      }
    } catch (e) {
      console.error('Date parse error:', e);
    }
    return new Date(dateStr);
  }

  goToNotifications() {
    this.router.navigate(['/notification']);
  }

}