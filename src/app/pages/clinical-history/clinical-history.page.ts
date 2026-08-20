import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-clinical-history',
  templateUrl: './clinical-history.page.html',
  styleUrls: ['./clinical-history.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, CommonModule, FormsModule]
})
export class ClinicalHistoryPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
