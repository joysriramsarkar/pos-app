import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lakhan.pos',
  appName: 'Lakhan POS',
  webDir: 'out',
  // server: {
  //   url: 'http://192.168.x.x:3000', // uncomment for live-reload dev only; never use prod URL here
  //   cleartext: true
  // },
  plugins: {
    StatusBar: {
      overlayWebView: false
    }
  }
};

export default config;
