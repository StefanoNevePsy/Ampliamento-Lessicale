/**
 * Quaderno TICE — service worker: l'app si apre anche senza rete.
 *
 * Pagina principale: prima la rete (per ricevere subito gli aggiornamenti),
 * altrimenti la copia salvata. Script, stili e immagini: la copia salvata
 * subito, aggiornata in sottofondo. Le chiamate al custode (POST) non passano
 * di qui: i dati clinici stanno in IndexedDB, non nella cache.
 */
var CACHE = 'quaderno-tice-v1';
var GUSCIO = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/modello.js', 'js/ui.js', 'js/db.js', 'js/auth.js', 'js/api.js', 'js/sync.js', 'js/grafici.js', 'js/app.js',
  'js/viste/accesso.js', 'js/viste/pazienti.js', 'js/viste/paziente.js', 'js/viste/seduta.js',
  'js/viste/programma.js', 'js/viste/materiali.js', 'js/viste/admin.js', 'js/viste/profilo.js',
  'img/logo-bianco.png', 'img/favicon.png', 'img/icona-192.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(GUSCIO); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chiavi) {
    return Promise.all(chiavi.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(function (risp) {
      var copia = risp.clone();
      caches.open(CACHE).then(function (c) { c.put('index.html', copia); });
      return risp;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (salvata) {
    var rete = fetch(r).then(function (risp) {
      if (risp.ok) { var copia = risp.clone(); caches.open(CACHE).then(function (c) { c.put(r, copia); }); }
      return risp;
    }).catch(function () { return salvata; });
    return salvata || rete;
  }));
});
