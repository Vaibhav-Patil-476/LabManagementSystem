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

  // ✅ Overlay logic — login page आधीच खाली render होत असतो,
  // हा overlay फक्त वरती दिसतो आणि नंतर fade होतो.
  showSplash = true;
  splashLeaving = false;

  async ngOnInit() {

    if (Capacitor.isNativePlatform()) {
      await StatusBar.setOverlaysWebView({ overlay: false });

      // ✅ FIX: Angular चा हा component पूर्ण ready झाल्यावरच native
      // splash hide करा — capacitor.config.ts madhе launchAutoHide:
      // false केल्यामुळे हे आता गरजेचं आहे, नाहीतर native splash
      // कधीच जाणार नाही आणि app तसाच अडकून राहील.
      await SplashScreen.hide();
    }

    // 3 sec सामान्य float animation दाखवा
    setTimeout(() => {
      this.splashLeaving = true; // ✅ lift-off + fade-out animation सुरू

      // Animation पूर्ण झाल्यावर (600ms) overlay पूर्ण काढून टाका
      setTimeout(() => {
        this.showSplash = false;
      }, 600);

    }, 3000);
  }
}