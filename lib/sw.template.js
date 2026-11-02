// DevX Control service worker. Caches the app shell only. Nothing from /api, login or another origin is ever stored.
const VERSION = '__VERSION__';
const SHELL = `dc-shell-${VERSION}`;
const RUNTIME = 'dc-runtime';
const PRECACHE = __PRECACHE__;
const NEVER = /^\/(api|jarvis|healthz|sw\.js|client\.html|whatsnew|themes|preview|p\/)/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(PRECACHE.map(async (u) => {
      const r = await fetch(new Request(u, { cache: 'reload', credentials: 'same-origin' }));
      if (r.ok) await cache.put(u, r);
    }));
    // First install takes over at once; an update waits for the user to tap Reload.
    if (!(await caches.keys()).some((k) => k.startsWith('dc-shell-') && k !== SHELL)) self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('dc-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range') || NEVER.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await timeout(fetch(req), 4000); }
      catch { return (await caches.match('/', { cacheName: SHELL })) || Response.error(); }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: SHELL }) || await caches.match(req, { cacheName: RUNTIME });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') (await caches.open(RUNTIME)).put(req, res.clone());
    return res;
  })());
});
