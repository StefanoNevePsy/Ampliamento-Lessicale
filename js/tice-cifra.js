/**
 * Cifratura dei dati dei pazienti con la chiave del centro.
 *
 * I dati escono dal dispositivo solo cifrati: il custode e chi apre il Drive
 * (compresi gli amministratori del dominio) vedono buste illeggibili. Li
 * legge solo chi conosce la chiave del centro, una frase di 25 caratteri
 * generata una volta dall'amministratore e conservata dal centro (stampata,
 * in un gestore di password). Senza la frase i dati non si recuperano: il
 * custode non la conosce e non la può ricostruire.
 *
 *   frase ──PBKDF2-SHA256 (600 000 iterazioni, sale del centro)──▶ chiave AES-256
 *   dato  ──gzip──▶ AES-256-GCM (iv casuale, legato al paziente) ──▶ busta
 *
 * Busta: { v: 1, alg: 'A256GCM', kid, iv, comp: 'gzip'|'no', dati } (base64).
 * Il testo aggiuntivo autenticato (aad) lega la busta al suo posto, es.
 * "tice:paziente:<id>": una busta spostata su un altro paziente non si apre.
 *
 * Stesso formato in strumenti/apri-dati.html e tools/decifra_tice.py, per
 * aprire i file anche senza l'app.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceCifra = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ITERAZIONI = 600000;
  // Base32 di Crockford: niente I, L, O, U, che si confondono scrivendo a mano
  var ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var enc = new TextEncoder(), dec = new TextDecoder();
  function sottile() { return (typeof crypto !== 'undefined' && crypto.subtle) || require('crypto').webcrypto.subtle; }
  function casuali(n) {
    var a = new Uint8Array(n);
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : require('crypto').webcrypto).getRandomValues(a);
    return a;
  }

  function aB64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function daB64(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var b = atob(s), u8 = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
    return u8;
  }

  // ---------- la frase ----------
  /** Nuova chiave del centro: 25 caratteri in 5 gruppi (125 bit). */
  function generaFrase() {
    var r = casuali(25), s = '';
    for (var i = 0; i < 25; i++) s += ALFABETO[r[i] & 31] + (i % 5 === 4 && i < 24 ? '-' : '');
    return s;
  }
  /** Tollera minuscole, spazi e le lettere che si confondono con le cifre. */
  function normalizzaFrase(s) {
    var t = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    return t.length === 25 ? t.replace(/(.{5})(?!$)/g, '$1-') : null;
  }

  function derivaChiave(frase, cfg, esportabile) {
    var f = normalizzaFrase(frase);
    if (!f) return Promise.reject(new Error('La chiave del centro è di 25 caratteri (5 gruppi da 5).'));
    var S = sottile();
    return S.importKey('raw', enc.encode(f), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return S.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: daB64(cfg.kdf.sale), iterations: cfg.kdf.iterazioni },
        base, { name: 'AES-GCM', length: 256 }, !!esportabile, ['encrypt', 'decrypt']);
    });
  }

  // ---------- compressione ----------
  function trasforma(u8, Stream) {
    var s = new Blob([u8]).stream().pipeThrough(new Stream('gzip'));
    return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  var haGzip = typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined';

  // ---------- buste ----------
  function cifra(chiave, kid, oggetto, aad) {
    var dati = enc.encode(JSON.stringify(oggetto));
    var comp = haGzip && dati.length > 512;
    return (comp ? trasforma(dati, CompressionStream) : Promise.resolve(dati)).then(function (chiaro) {
      var iv = casuali(12);
      var alg = { name: 'AES-GCM', iv: iv };
      if (aad) alg.additionalData = enc.encode(aad);
      return sottile().encrypt(alg, chiave, chiaro).then(function (c) {
        return { v: 1, alg: 'A256GCM', kid: kid, iv: aB64(iv), comp: comp ? 'gzip' : 'no', dati: aB64(new Uint8Array(c)) };
      });
    });
  }
  function decifra(chiave, busta, aad) {
    if (!busta || busta.v !== 1 || busta.alg !== 'A256GCM') return Promise.reject(new Error('Formato di cifratura sconosciuto'));
    var alg = { name: 'AES-GCM', iv: daB64(busta.iv) };
    if (aad) alg.additionalData = enc.encode(aad);
    return sottile().decrypt(alg, chiave, daB64(busta.dati)).then(function (c) {
      var u8 = new Uint8Array(c);
      return busta.comp === 'gzip' ? trasforma(u8, DecompressionStream) : u8;
    }, function () {
      throw new Error('Impossibile aprire i dati: chiave del centro sbagliata o file alterato.');
    }).then(function (u8) { return JSON.parse(dec.decode(u8)); });
  }

  // ---------- configurazione del centro ----------
  var VERIFICA = { tice: 'chiave-del-centro' };
  /** Prima configurazione (la fa l'admin): sale, verifica e chiave derivata. */
  function nuovaConfigurazione(frase) {
    var r = casuali(4), kid = 'k' + Array.prototype.map.call(r, function (x) { return ALFABETO[x & 31].toLowerCase(); }).join('');
    var cfg = { kid: kid, kdf: { nome: 'PBKDF2-SHA256', iterazioni: ITERAZIONI, sale: aB64(casuali(16)) } };
    return derivaChiave(frase, cfg).then(function (chiave) {
      return cifra(chiave, kid, VERIFICA, 'tice:verifica').then(function (b) {
        cfg.verifica = b;
        return { cfg: cfg, chiave: chiave };
      });
    });
  }
  /** Deriva la chiave dalla frase e controlla che sia quella del centro. */
  function apriConFrase(frase, cfg) {
    return derivaChiave(frase, cfg).then(function (chiave) {
      return decifra(chiave, cfg.verifica, 'tice:verifica').then(function (v) {
        if (!v || v.tice !== VERIFICA.tice) throw new Error('x');
        return chiave;
      }, function () { throw new Error('Questa non è la chiave del centro.'); });
    });
  }

  // ---------- chiave sul dispositivo (IndexedDB, non esportabile) ----------
  function db() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('tice-chiavi', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('chiavi'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function operazione(modo, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, ko) {
        var t = d.transaction('chiavi', modo), req = fn(t.objectStore('chiavi'));
        t.oncomplete = function () { d.close(); ok(req && req.result); };
        t.onerror = function () { d.close(); ko(t.error); };
      });
    });
  }
  function ricordaChiave(chiave, cfg) { return operazione('readwrite', function (s) { return s.put({ chiave: chiave, kid: cfg.kid, sale: cfg.kdf.sale }, 'centro'); }); }
  function chiaveRicordata(cfg) {
    return operazione('readonly', function (s) { return s.get('centro'); }).then(function (r) {
      return r && cfg && r.kid === cfg.kid && r.sale === cfg.kdf.sale ? r.chiave : null;
    });
  }
  function dimenticaChiave() { return operazione('readwrite', function (s) { return s.delete('centro'); }); }

  return {
    ITERAZIONI: ITERAZIONI,
    generaFrase: generaFrase, normalizzaFrase: normalizzaFrase, derivaChiave: derivaChiave,
    cifra: cifra, decifra: decifra, nuovaConfigurazione: nuovaConfigurazione, apriConFrase: apriConFrase,
    ricordaChiave: ricordaChiave, chiaveRicordata: chiaveRicordata, dimenticaChiave: dimenticaChiave,
    aB64: aB64, daB64: daB64
  };
});
