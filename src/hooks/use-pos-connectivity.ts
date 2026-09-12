import { useEffect } from 'react';
import { useSyncStore } from '@/stores/pos-store';

export function usePosConnectivity() {
  // Monitor online status - check both navigator.onLine AND actual API connectivity
  useEffect(() => {
    const checkConnectivity = async () => {
      const setOnline = useSyncStore.getState().setOnline;

      // First check navigator.onLine
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }

      // Try to verify connection by testing a simple API call
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            setOnline(true);
          } else {
            setOnline(false);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      } catch (error) {
        setOnline(false);
      }
    };

    // Register Service Worker only in production to prevent dev HMR reload loops
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch((swErr) => {
          console.warn('Service Worker registration skipped/failed:', swErr);
        });
      } else {
        // In development, unregister any active service worker so HMR & Next.js work cleanly
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
    }

    // Check on mount
    checkConnectivity();

    // Check periodically (every 5 minutes — reduced to avoid background load)
    const interval = setInterval(checkConnectivity, 300000);

    // Listen to navigator online/offline events
    const handleOnline = async () => {
      await checkConnectivity();
      // If page had failed DNS or network state previously, auto refresh when back online
      if (navigator.onLine && useSyncStore.getState().isOnline) {
        console.log('Network restored, refreshing session');
      }
    };
    const handleOffline = () => {
      useSyncStore.getState().setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}
