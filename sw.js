/* Bump the release when changing any cached frontend file. */
const CACHE = 'poker-nights-history-1';
const ASSETS = ['./', './index.html', './style.css?v=history-1', './settlement.js?v=history-1', './app.js?v=history-1', './history.js?v=history-1', './groups.js?v=history-1', './pwa.js?v=history-1', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const urls = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Wait for the user's Refresh action before replacing an open app.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('poker-nights-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  // Never intercept Google, API traffic, other GitHub projects, or user data.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const appRoot = new URL(self.registration.scope);
  const navigation = event.request.mode === 'navigate' && (url.pathname === appRoot.pathname || url.pathname === appRoot.pathname + 'index.html');
  if (!navigation && !urls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(navigation ? appRoot.href : event.request);
    return cached || fetch(event.request);
  })());
});
