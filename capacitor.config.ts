import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.onuron.pos',
  appName: 'Onuron POS',
  webDir: 'out',
  server: {
    url: 'https://pos.onuron.org', // production URL — app loads same-origin, fixes WebView cookie/session issues
    cleartext: false
  },
  plugins: {
    StatusBar: {
      overlayWebView: false
    },
    SplashScreen: {
      launchShowDuration: 4000,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: "#1E1B4B",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    }
  }
};

export default config;
