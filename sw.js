/**
 * Service worker dell'edizione Centro TICE: l'app si apre anche senza rete.
 *
 * Alla pubblicazione (build.js) qui vengono scritti la versione e l'elenco dei
 * file: al primo avvio si scaricano tutti, poi l'app parte dalla copia sul
 * dispositivo. Una pubblicazione nuova crea una versione nuova: si scarica in
 * sottofondo e l'app propone "Aggiorna".
 *
 * Mai in cache: le chiamate al custode (POST) e l'accesso Google.
 * In sviluppo (versione non scritta) si va sempre prima in rete.
 */
'use strict';
const VERSIONE = '__VERSIONE__';
const FILE = /*__FILE__*/[];
const SVILUPPO = VERSIONE.indexOf('__') === 0;
const CACHE = 'tice-app-' + VERSIONE;
const ESTERNI = 'tice-esterni';
// Librerie da CDN usate da alcune funzioni dell'app personale (sincronizzazioni)
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://unpkg.com/peerjs@'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)));
  // la prima installazione è subito attiva; gli aggiornamenti aspettano "Aggiorna"
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((n) => n.indexOf('tice-app-') === 0 && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'aggiorna') self.skipWaiting();
});

async function primaRete(req, cache) {
  try {
    const r = await fetch(req);
    if (r && r.ok) (await caches.open(cache)).put(req, r.clone());
    return r;
  } catch (err) {
    const c = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (c) return c;
    if (req.mode === 'navigate') { const i = await caches.match('./index.html') || await caches.match('./'); if (i) return i; }
    throw err;
  }
}
async function primaCache(req) {
  const c = await caches.match(req);
  if (c) return c;
  const r = await fetch(req);
  if (r && r.ok) (await caches.open(CACHE)).put(req, r.clone());
  return r;
}
async function copiaEAggiorna(req) {
  const cache = await caches.open(ESTERNI);
  const c = await cache.match(req);
  const rete = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => c);
  return c || rete;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (CDN.some((p) => req.url.indexOf(p) === 0)) e.respondWith(copiaEAggiorna(req));
    return;   // accesso Google, custode, servizi esterni: sempre dalla rete
  }
  if (SVILUPPO) { e.respondWith(primaRete(req, CACHE)); return; }
  // La pagina: dalla copia della versione installata (l'aggiornamento lo propone l'app)
  const radice = new URL('./', self.location).pathname;
  if (req.mode === 'navigate' && (url.pathname === radice || url.pathname === radice + 'index.html')) {
    e.respondWith(primaCache(new Request('./index.html')).catch(() => primaRete(req, CACHE)));
    return;
  }
  e.respondWith(primaCache(req));
});
