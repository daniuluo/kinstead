// Fresh game files on every visit. GitHub Pages lets browsers keep each file
// for ten minutes, so a reload soon after an update could run the old code,
// or a mix of old and new files. This asks the server about every file of
// the game each time (a quick "not modified" when nothing changed) and only
// falls back to the browser's copy when offline. Other sites (PeerJS, Google
// Drive, the CDN) and page loads themselves are left alone.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode === 'navigate' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache', credentials: req.credentials }))
      .catch(() => fetch(new Request(req.url, { cache: 'force-cache', credentials: req.credentials }))),
  );
});
