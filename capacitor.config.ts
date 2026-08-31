import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'ITLabSpeed',
  webDir: 'www',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#ffffffff'
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    SplashScreen: {
      launchShowDuration: 0,

      // ✅ FIX: false केलं — आता Angular ready होईपर्यंत native splash
      // आपोआप निघणार नाही, आपण code मधून control करू (app.component.ts).
      // यामुळे "native splash गायब -> blank stuck frame -> JS splash"
      // हा gap निघून जाईल.
      launchAutoHide: false,

      backgroundColor: '#087b76',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;