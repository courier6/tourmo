// The service worker: keeps a copy of the app on the device, so it opens
// with no signal once it has been opened with one. The two lines below are
// filled in when the app is built (see vite.config.ts).

const VERSION = '__VERSION__';
const FILES = ['__FILES__'];
const CACHE = 'tourmo-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

// A new build waits until every window of the old one is closed, so a screen
// that is open is never left holding files from two builds. It then drops the
// copy it replaces.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('tourmo-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// The app's own files come from the copy on the device. A file that is not in
// it (a font for another alphabet) is fetched and kept. The lookups under
// /api/ are left alone: a kept answer would pass for a fresh one. A static
// server may mark its files as varying by Origin, which the page's own script
// and stylesheet requests carry and the install did not, so that is ignored.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then(
      (kept) =>
        kept ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
