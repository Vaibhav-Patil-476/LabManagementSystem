import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';

import {
  notificationsOffOutline
} from 'ionicons/icons';
import {  Router } from '@angular/router';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.page.html',
  styleUrls: ['./notification.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon
  ]
})
export class NotificationsPage {

  constructor(private router: Router) {

    addIcons({
      'notifications-off-outline': notificationsOffOutline
    });


    
  }
  goBack() {
    this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }

}