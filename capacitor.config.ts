import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hypatholab.app',
  appName: 'HyPatho Lab',
  webDir: 'www',

  // फक्त testing साठी. Release build आधी हा block काढा आणि https/wss वापरा.
  server: {
    androidScheme: 'http',
    cleartext: true
  },

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
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false
    },
    android: {
    webContentsDebuggingEnabled: true
  }

    
  }
};

export default config;