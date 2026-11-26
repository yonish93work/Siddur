// Keeps the whole app on the phone, so it works without internet, and brings new versions in.
// tools/build.mjs fills in the two lines below; any change to any file changes VERSION.
const VERSION = '__VERSION__';
const FILES = __FILES__; // [address, fingerprint]
const CACHE = `siddur-${VERSION}`;

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const old = (await caches.keys()).filter(k => k.startsWith('siddur-') && k !== CACHE);
  for (const [url, hash] of FILES) {
    const key = `${url}?v=${hash}`;
    // A file that did not change (the 13MB PDF, for example) is copied from the previous version, not downloaded again.
    let res = await cache.match(key);
    if (res) continue;
    for (const k of old) { res = await (await caches.open(k)).match(key); if (res) break; }
    res ??= await fetch(key, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await cache.put(key, res);
  }
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('siddur-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('message', e => { if (e.data === 'activate') self.skipWaiting(); });

const byPath = new Map(FILES.map(([url, hash]) => [new URL(url, self.registration.scope).pathname, `${url}?v=${hash}`]));

self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if (event.request.method !== 'GET' || u.origin !== location.origin) return;
  let path = u.pathname;
  if (path === new URL('./', self.registration.scope).pathname) path += 'index.html';
  const key = byPath.get(path);
  if (!key) return;
  event.respondWith((async () => (await (await caches.open(CACHE)).match(key)) ?? fetch(event.request))());
});
