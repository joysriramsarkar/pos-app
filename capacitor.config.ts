import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lakhan.pos',
  appName: 'Lakhan POS',
  webDir: 'out',
  server: {
    url: 'https://lakhanb.vercel.app', // production URL — app loads same-origin, fixes WebView cookie/session issues
    cleartext: false
  },
  plugins: {
    StatusBar: {
      overlayWebView: false
    }
  }
};

export default config;
