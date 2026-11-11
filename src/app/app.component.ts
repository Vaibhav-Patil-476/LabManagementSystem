import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ToastComponent } from './shared/components/toast/toast.component';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  AppUpdate,
  AppUpdateAvailability,
  AppUpdateResultCode
} from '@capawesome/capacitor-app-update';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastComponent, CommonModule],
})
export class AppComponent implements OnInit {

  private checkingUpdate = false;

  async ngOnInit() {
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide();
      await StatusBar.setOverlaysWebView({ overlay: false });

      this.checkForcedUpdate();

      // background madhun parat app ughadla tari tapasa
      App.addListener('resume', () => this.checkForcedUpdate());
    }
  }

  private async checkForcedUpdate(): Promise<void> {

    // fakt Android app madhe chalto
    if (Capacitor.getPlatform() !== 'android' || this.checkingUpdate) return;

    this.checkingUpdate = true;

    try {
      const info = await AppUpdate.getAppUpdateInfo();

      if (
        info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE &&
        info.immediateUpdateAllowed
      ) {
        const result = await AppUpdate.performImmediateUpdate();

        // user ne cancel kela kinva update fail zala tar app band kar
        if (result.code !== AppUpdateResultCode.OK) {
          await App.exitApp();
        }
      }
    } catch (e) {
      console.warn('Update check failed', e);
    } finally {
      this.checkingUpdate = false;
    }
  }
}