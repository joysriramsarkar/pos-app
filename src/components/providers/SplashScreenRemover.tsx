'use client';

import { useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';

export function SplashScreenRemover() {
  useEffect(() => {
    // Hide native Capacitor Splash Screen smoothly once web page is mounted
    SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {
      // Ignored if running in browser
    });

    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      const timer = setTimeout(() => {
        splash.remove();
      }, 300);
      return () => clearTimeout(timer);
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
  }, []);

  return null;
}
