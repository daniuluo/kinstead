// Fresh game files on every visit. GitHub Pages lets browsers keep each file
// for ten minutes, so a reload soon after an update could run the old page
// and code, or a mix of old and new files. This asks the server about the
// page and every file of the game each time (a quick "not modified" when
// nothing changed) and only falls back to the browser's copy when offline.
// Other sites (PeerJS, Google Drive, the CDN) are left alone.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const fresh = (url, credentials) => fetch(new Request(url, { cache: 'no-cache', credentials }));
const stored = (url, credentials) => fetch(new Request(url, { cache: 'force-cache', credentials }));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // the page itself: a redirect is handed back as one, as a page load expects
    e.respondWith(fresh(req.url, 'same-origin')
      .then((r) => (r.redirected ? Response.redirect(r.url, 302) : r))
      .catch(() => fetch(req)));
    return;
  }
  e.respondWith(fresh(req.url, req.credentials).catch(() => stored(req.url, req.credentials)));
});
