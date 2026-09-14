// Four Square service worker — caches only the app shell (this app's own files),
// so it can launch instantly and installably. Firebase reads/writes and Google Fonts
// always go straight to the network, since scores need to be live, not cached.
const CACHE_NAME = 'four-square-shell-v3';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './changelog.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only manage GET requests to this app's own origin (the shell). Everything else —
  // Firebase Realtime Database calls, Google Fonts — is left alone and goes to the network as normal.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline: fall back to whatever's cached
      return cached || networkFetch;
    })
  );
});
