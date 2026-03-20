// CrownyTVM Service Worker v1.0
// Handles: push notifications, background sync, offline cache

const CACHE_NAME = 'crowny-v1';
const OFFLINE_URL = '/offline.html';

// Minimal cache - only critical assets
const PRECACHE = [
  '/',
  '/css/base.css',
  '/img/icons/icon-192x192.png',
];

// Install
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
});

// Activate - clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - network first, cache fallback
self.addEventListener('fetch', (e) => {
  // Skip non-GET and API requests
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  if (e.request.url.includes('/ws/')) return;

  e.respondWith(
    fetch(e.request).then(res => {
      // Cache successful responses for static assets
      if (res.ok && (e.request.url.endsWith('.css') || e.request.url.endsWith('.js') || e.request.url.endsWith('.png'))) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Push notification received
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
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.registration.scope)) {
          client.focus();
          if (data.chatId) {
            client.postMessage({ type: 'open-chat', chatId: data.chatId, otherId: data.otherId });
          }
          return;
        }
      }
      // Open new window
      return self.clients.openWindow('/');
    })
  );
});

// Message from client
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
