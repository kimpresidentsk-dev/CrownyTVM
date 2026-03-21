// CrownyCore Service Worker — 오프라인 캐시
const CACHE = 'crownycore-v1';
const STATIC = ['/', '/css/코어.css', '/css/leaflet.css', '/js/d3.min.js', '/js/leaflet.js', '/js/milsymbol.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  // API는 네트워크 우선, 정적 파일은 캐시 우선
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: '오프라인' }), { headers: { 'Content-Type': 'application/json' } })));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); } return res; })));
  }
});
