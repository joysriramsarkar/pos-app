// Lakhan Bhandar POS - Service Worker for Offline Fallback & Network Fault Tolerance

const CACHE_NAME = 'lb-pos-cache-v1';
const OFFLINE_URLS = ['/', '/favicon.ico', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn('SW: Pre-cache warning', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Exclude API requests & web sockets from cache-fallback
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.url.startsWith('http')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          const rootCache = await caches.match('/');
          if (rootCache) return rootCache;
        }
        return new Response(
          '<html><head><meta charset="utf-8"/><title>Lakhan Bhandar - Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>ইন্টারনেট সংযোগ নেই (Offline)</h2><p>অনুগ্রহ করে আপনার ইন্টারনেট সংযোগ পরীক্ষা করুন। Network reconnected হলে পেজ স্বয়ংক্রিয়ভাবে লোড হবে।</p><button onclick="window.location.reload()" style="padding:10px 20px;font-size:16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">পুনরায় চেষ্টা করুন (Retry)</button></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
  );
});
