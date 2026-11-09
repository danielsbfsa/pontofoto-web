// Funciona sem internet: guarda o app e as bibliotecas no aparelho.
const VERSION = 'pontofoto-web-7';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'js/ocr.js', 'js/plans.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/fonts/manrope.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // bibliotecas grandes (leitor de texto, PDF): cache primeiro
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // app: rede primeiro (pega atualizações), cache se estiver sem internet
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
