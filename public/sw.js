// Old root-scope service worker from before the game moved to /play/.
// It removes itself and its caches so returning players get the landing page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.map((c) => caches.delete(c))))
      .then(() => self.registration.unregister())
  );
});
