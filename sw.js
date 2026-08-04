/* Cineclube — Service Worker (cache de assets estáticos) */
const CACHE = 'cineclube-static-v3';
const PRECACHE = [
  './',
  './index.html',
  './worker.js',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Guarda cada arquivo individualmente: se um faltar (ex.: manifest.json ainda
      // não publicado), os outros continuam sendo cacheados normalmente. Com
      // cache.addAll, um único 404 cancelava o cache de tudo, silenciosamente.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs e Firestore: sempre rede (dados ao vivo)
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('omdbapi.com') ||
    url.hostname.includes('themoviedb.org') ||
    url.hostname.includes('image.tmdb.org')
  ) {
    return; // network default
  }

  // HTML: network-first (sempre tenta versão nova)
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // worker.js e outros JS do app: network-first (pega versão nova, fallback cache)
  if (url.pathname.endsWith('/worker.js') || url.pathname.endsWith('worker.js') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Outros estáticos: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      });
    })
  );
});
