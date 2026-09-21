/* La Melosa: caché para que las visitas siguientes carguen casi al instante.
   Sube V cuando cambies imágenes con el mismo nombre. */
const V = 'melosa-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const cdn = /(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.host);
  if (u.origin !== location.origin && !cdn) return;
  if (r.mode === 'navigate') {            // la página: red primero (siempre al día), caché si no hay conexión
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); return res; }).catch(() => caches.match(r)));
    return;
  }
  e.respondWith(caches.open(V).then(ca => ca.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') ca.put(r, res.clone());
    return res;
  }))));
});
