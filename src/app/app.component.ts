import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet,ToastComponent],
})
export class AppComponent {}