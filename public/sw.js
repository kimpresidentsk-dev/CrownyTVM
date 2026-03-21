// CrownyTVM Service Worker v2.0
// Handles: push notifications, offline cache, network-first strategy

const CACHE_NAME = 'crowny-v2';
const OFFLINE_URL = '/offline.html';

// Precache critical assets
const PRECACHE = [
  '/',
  '/offline.html',
  '/css/base.css',
  '/css/home.css',
  '/img/icons/icon-192x192.png',
];

// Install — precache + offline page
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback, offline page for navigation
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  if (e.request.url.includes('/ws/')) return;

  const isNavigation = e.request.mode === 'navigate';

  e.respondWith(
    fetch(e.request).then(res => {
      // Cache successful static assets
      if (res.ok) {
        const url = e.request.url;
        if (url.endsWith('.css') || url.endsWith('.js') || url.endsWith('.png') || url.endsWith('.json') || isNavigation) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => {});
        }
      }
      return res;
    }).catch(() => {
      // Offline: try cache first, then offline page for navigation
      return caches.match(e.request).then(cached => {
        if (cached) return cached;
        if (isNavigation) return caches.match(OFFLINE_URL);
        return cached;
      });
    })
  );
});

// Push notification
self.addEventListener('push', (e) => {
  let data = { title: 'CROWNY', body: 'New message', tag: 'crowny-msg' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/img/icons/icon-192x192.png',
      badge: '/img/icons/icon-192x192.png',
      tag: data.tag || 'crowny-msg',
      renotify: true,
      vibrate: [100, 50, 100],
      data: data.data || {},
    })
  );
});

// Notification click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.registration.scope)) {
          client.focus();
          if (data.chatId) {
            client.postMessage({ type: 'open-chat', chatId: data.chatId, otherId: data.otherId });
          }
          return;
        }
      }
      return self.clients.openWindow('/');
    })
  );
});

// Message from client
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
