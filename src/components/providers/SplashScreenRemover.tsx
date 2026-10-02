'use client';

import { useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';

export function SplashScreenRemover() {
  useEffect(() => {
    // Hide native Capacitor Splash Screen smoothly once web page is mounted
    SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {
      // Ignored if running in browser
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      timer = setTimeout(() => {
        splash.remove();
      }, 300);
    }

    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
    }

    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return null;
}
