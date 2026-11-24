// Service worker for "ליומן": receives shared text / images and hands them to the page.
// Cache names are prefixed with "yoman-" so they never clash with other apps on the same github.io site.
const VERSION = 'v5';
const SHELL_CACHE = 'yoman-shell-' + VERSION;
const SHARE_CACHE = 'yoman-shared';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys())
      if (k.startsWith('yoman-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const cache = await caches.open(SHARE_CACHE);
      for (const k of await cache.keys()) await cache.delete(k);       // leftovers from an earlier share
      const text = ['title', 'text', 'url'].map(k => form.get(k) || '').filter(Boolean).join('\n');
      if (text) await cache.put('shared-text', new Response(text, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } }));
      let i = 0;
      for (const f of form.getAll('media')) {
        if (f && f.size) await cache.put(`shared-img-${i++}`, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  // The manifest (app name/icon) always comes from the network, so renames and new icons show up at install time.
  if (e.request.method === 'GET' && url.pathname.endsWith('/manifest.json')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  // App files: answer instantly from the phone's cache and refresh it in the background.
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request).then(r => {
        if (r.ok) cache.put(e.request.url.split('?')[0], r.clone());
        return r;
      }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      return (await fresh) || new Response('offline', { status: 503 });
    })());
  }
});
