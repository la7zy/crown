// Keeps the site's pages for reading without internet. Written by prototype/publish.mjs from
// this template: the version changes whenever a page changes.
const V='crown-f3c9be3fd3fe';
const SHELL=['./','index.html','episodes.json','manifest.webmanifest','icon-192.png','icon-512.png','hero.jpg','ep.html','reader.js','reader.css','immersive.js','immersive.css','ambient.js','after.js','after.css','thumb01.jpg','thumb02.jpg','thumb03.jpg','thumb04.jpg','thumb05.jpg','thumb06.jpg','thumb07.jpg','thumb08.jpg','thumb09.jpg','thumb10.jpg','thumb11.jpg','thumb12.jpg','thumb13.jpg','thumb14.jpg','thumb15.jpg'];
const EPISODES = 'crown-episodes';   // the locked episodes a phone has opened: kept from one version to the next

const isEpisode = (url) => /\/ep\d\d\.bin$/.test(new URL(url).pathname);

// A new version fetches every page afresh, past the browser's own cache, so that old and new pages are never mixed.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== V && k !== EPISODES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// The network first, so that an update is seen at once; the kept copy when there is no network.
// Only a page falls back to the home page: a missing episode file must stay missing.
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      // a phone with no room left simply keeps no copy for reading without internet
      caches.open(isEpisode(r.url) ? EPISODES : V).then((c) => c.put(r, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true })
    .then((m) => m || (r.mode === 'navigate' ? caches.match('index.html') : null))
    .then((m) => m || Response.error())));
});
