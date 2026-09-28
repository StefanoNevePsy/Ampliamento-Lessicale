/**
 * Quaderno TICE — archivio locale (IndexedDB).
 *
 * Un database per utente: su un tablet condiviso ognuno vede solo i propri
 * pazienti, e uscire con "cancella i dati" toglie solo i suoi. I materiali
 * (set e immagini) invece sono comuni e stanno in un database a parte: non sono
 * dati personali e non ha senso scaricarli una volta per ogni collega.
 */
var DB = (function () {
  'use strict';

  function req(r) {
    return new Promise(function (ok, ko) {
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }

  function apri(nome, versione, aggiorna) {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open(nome, versione);
      r.onupgradeneeded = function (e) { aggiorna(r.result, e.oldVersion); };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); };
        ok(db);
      };
      r.onerror = function () { ko(r.error); };
      r.onblocked = function () { ko(new Error('Il Quaderno e\' aperto in un\'altra scheda con una versione diversa: chiudila e riprova.')); };
    });
  }

  function negozio(db) {
    function tx(nomi, modo) { return db.transaction(nomi, modo || 'readonly'); }
    return {
      db: db,
      get: function (store, chiave) { return req(tx(store).objectStore(store).get(chiave)); },
      tutti: function (store) { return req(tx(store).objectStore(store).getAll()); },
      perIndice: function (store, indice, valore) { return req(tx(store).objectStore(store).index(indice).getAll(valore)); },
      put: function (store, valore) {
        var t = tx(store, 'readwrite');
        t.objectStore(store).put(valore);
        return new Promise(function (ok, ko) { t.oncomplete = function () { ok(valore); }; t.onerror = function () { ko(t.error); }; t.onabort = function () { ko(t.error); }; });
      },
      del: function (store, chiave) {
        var t = tx(store, 'readwrite');
        t.objectStore(store).delete(chiave);
        return new Promise(function (ok, ko) { t.oncomplete = function () { ok(); }; t.onerror = function () { ko(t.error); }; });
      },
      /** Piu' scritture tutte insieme o nessuna. fn(storesPerNome) */
      insieme: function (nomi, fn) {
        var t = tx(nomi, 'readwrite');
        var stores = {};
        nomi.forEach(function (n) { stores[n] = t.objectStore(n); });
        fn(stores);
        return new Promise(function (ok, ko) { t.oncomplete = function () { ok(); }; t.onerror = function () { ko(t.error); }; t.onabort = function () { ko(t.error); }; });
      },
      svuota: function (store) {
        var t = tx(store, 'readwrite');
        t.objectStore(store).clear();
        return new Promise(function (ok, ko) { t.oncomplete = function () { ok(); }; t.onerror = function () { ko(t.error); }; });
      },
    };
  }

  async function nomeUtente(email) {
    var dati = new TextEncoder().encode(String(email).toLowerCase());
    var hash = new Uint8Array(await crypto.subtle.digest('SHA-256', dati));
    return 'qt-u-' + Array.from(hash.slice(0, 10)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  async function perUtente(email) {
    var db = await apri(await nomeUtente(email), 1, function (db) {
      db.createObjectStore('pazienti', { keyPath: 'id' });
      var s = db.createObjectStore('sedute', { keyPath: 'id' });
      s.createIndex('pazienteId', 'pazienteId');
      db.createObjectStore('coda', { keyPath: 'id' });
      db.createObjectStore('bozze', { keyPath: 'pazienteId' });
      db.createObjectStore('meta', { keyPath: 'k' });
    });
    return negozio(db);
  }

  async function materiali() {
    var db = await apri('qt-materiali', 1, function (db) {
      db.createObjectStore('set', { keyPath: 'id' });
      db.createObjectStore('file', { keyPath: 'hash' });
      db.createObjectStore('meta', { keyPath: 'k' });
    });
    return negozio(db);
  }

  async function eliminaUtente(email) {
    var nome = await nomeUtente(email);
    return req(indexedDB.deleteDatabase(nome));
  }

  // Chiede al browser di non cancellare i dati per fare spazio: le sedute non
  // ancora inviate vivono solo qui finche' non torna la rete.
  async function chiediPersistenza() {
    try {
      if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch (e) { /* non supportato: pazienza */ }
    return false;
  }

  return { perUtente: perUtente, materiali: materiali, eliminaUtente: eliminaUtente, chiediPersistenza: chiediPersistenza };
})();
