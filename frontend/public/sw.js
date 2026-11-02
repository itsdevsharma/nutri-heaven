/* Only the generic offline page and app icon are cached. Private pages, API
   responses, stock, carts and payment requests always use the network. */
const OFFLINE_CACHE = 'nutri-app-offline-__APP_VERSION__';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html', '/assets/pwa/icon-192.png'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nutri-app-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/assets/pwa/icon-192.png') {
    event.respondWith(caches.open(OFFLINE_CACHE).then(async cache => await cache.match('/assets/pwa/icon-192.png') || fetch(event.request)));
    return;
  }
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    return await cache.match('/offline.html') || new Response('You are offline. Reconnect and refresh to continue.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});
