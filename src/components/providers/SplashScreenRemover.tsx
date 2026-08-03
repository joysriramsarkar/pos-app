'use client';

import { useEffect } from 'react';

export function SplashScreenRemover() {
  useEffect(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      const timer = setTimeout(() => {
        splash.remove();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}
