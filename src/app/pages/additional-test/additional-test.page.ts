import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-additional-test',
  templateUrl: './additional-test.page.html',
  styleUrls: ['./additional-test.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, CommonModule, FormsModule]
})
export class AdditionalTestPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
