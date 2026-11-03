// Offline cache. Network-first so updates show up immediately when online.
const CACHE = 'hitcore-v4';
const FILES = ['./', 'index.html', 'config.js', 'css/style.css', 'js/calc.js', 'js/reports.js', 'js/auth.js', 'js/store.js', 'js/timer.js', 'js/worklet.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.includes('/api/')) return; // API is never cached by the service worker
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
