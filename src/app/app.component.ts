import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ToastComponent } from './shared/components/toast/toast.component';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastComponent, CommonModule],
})
export class AppComponent implements OnInit {

async ngOnInit() {
  if (Capacitor.isNativePlatform()) {
    SplashScreen.hide();
    await StatusBar.setOverlaysWebView({ overlay: false });
  }
}
}