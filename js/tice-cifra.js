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
 *
 * La frase la conoscono solo gli admin. Agli altri dispositivi la chiave
 * arriva cifrata per loro (consegnaA / riceviChiave) e non è esportabile:
 * la usano senza vederla, e quando perdono l'accesso non resta loro niente.
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
  /** Nuova chiave del centro: sale, verifica e chiave derivata (esportabile per gli admin). */
  function nuovaConfigurazione(frase, esportabile) {
    var r = casuali(4), kid = 'k' + Array.prototype.map.call(r, function (x) { return ALFABETO[x & 31].toLowerCase(); }).join('');
    var cfg = { kid: kid, kdf: { nome: 'PBKDF2-SHA256', iterazioni: ITERAZIONI, sale: aB64(casuali(16)) } };
    return derivaChiave(frase, cfg, esportabile).then(function (chiave) {
      return cifra(chiave, kid, VERIFICA, 'tice:verifica').then(function (b) {
        cfg.verifica = b;
        return { cfg: cfg, chiave: chiave };
      });
    });
  }
  /** Deriva la chiave dalla frase e controlla che sia quella del centro (o una precedente). */
  function apriConFrase(frase, cfg, esportabile) {
    return derivaChiave(frase, cfg, esportabile).then(function (chiave) {
      return decifra(chiave, cfg.verifica, 'tice:verifica').then(function (v) {
        if (!v || v.tice !== VERIFICA.tice) throw new Error('x');
        return chiave;
      }, function () { throw new Error('Questa non è la chiave del centro.'); });
    });
  }

  // ---------- consegna della chiave ai dispositivi ----------
  // Ogni dispositivo ha una coppia RSA-OAEP creata qui, con la parte privata
  // non esportabile. Un admin cifra la chiave del centro con la parte
  // pubblica; il dispositivo la apre come chiave non esportabile: la usa per
  // cifrare e decifrare, ma non la può mostrare né copiare.
  var RSA = { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  function nuovaCoppia() {
    var S = sottile();
    return S.generateKey(RSA, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']).then(function (k) {
      return S.exportKey('spki', k.publicKey).then(function (spki) {
        var r = casuali(12), id = '';
        for (var i = 0; i < 12; i++) id += ALFABETO[r[i] & 31].toLowerCase();
        return { id: 'd' + id, privata: k.privateKey, pubblica: aB64(new Uint8Array(spki)) };
      });
    });
  }
  function consegnaA(pubblicaB64, chiave) {
    var S = sottile();
    return Promise.all([
      S.importKey('spki', daB64(pubblicaB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']),
      S.exportKey('raw', chiave)
    ]).then(function (x) {
      return S.encrypt({ name: 'RSA-OAEP' }, x[0], x[1]).then(function (c) { return aB64(new Uint8Array(c)); });
    });
  }
  function riceviChiave(bustaB64, privata, esportabile) {
    return sottile().unwrapKey('raw', daB64(bustaB64), privata, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, !!esportabile, ['encrypt', 'decrypt']);
  }

  // ---------- sul dispositivo (IndexedDB) ----------
  //   portachiavi: { kid → CryptoKey }   dispositivo: { id, privata, pubblica }
  //   frase: la frase cifrata con una chiave locale non esportabile (solo admin)
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
  var leggi = function (k) { return operazione('readonly', function (s) { return s.get(k); }); };
  var scrivi = function (k, v) { return operazione('readwrite', function (s) { return s.put(v, k); }); };
  var togli = function (k) { return operazione('readwrite', function (s) { return s.delete(k); }); };

  function portachiavi() { return leggi('portachiavi').then(function (p) { return p || {}; }); }
  function ricordaChiave(kid, chiave, soloQuesta) {
    return portachiavi().then(function (p) {
      if (soloQuesta) p = {};
      p[kid] = chiave;
      return scrivi('portachiavi', p);
    });
  }
  function dispositivo() {
    return leggi('dispositivo').then(function (d) {
      if (d && d.privata) return d;
      return nuovaCoppia().then(function (n) { return scrivi('dispositivo', n).then(function () { return n; }); });
    });
  }
  function salvaFrase(frase) {
    return leggi('locale').then(function (k) {
      return k || sottile().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
        .then(function (n) { return scrivi('locale', n).then(function () { return n; }); });
    }).then(function (k) {
      return cifra(k, 'locale', { frase: frase }, 'tice:frase').then(function (b) { return scrivi('frase', b); });
    });
  }
  function frase() {
    return Promise.all([leggi('locale'), leggi('frase')]).then(function (x) {
      return x[0] && x[1] ? decifra(x[0], x[1], 'tice:frase').then(function (o) { return o.frase; }) : null;
    });
  }
  /** Tutto ciò che riguarda il centro, via da questo dispositivo. */
  function dimenticaTutto() {
    return Promise.all(['portachiavi', 'dispositivo', 'frase', 'locale', 'centro'].map(togli));
  }

  return {
    ITERAZIONI: ITERAZIONI,
    generaFrase: generaFrase, normalizzaFrase: normalizzaFrase, derivaChiave: derivaChiave,
    cifra: cifra, decifra: decifra, nuovaConfigurazione: nuovaConfigurazione, apriConFrase: apriConFrase,
    nuovaCoppia: nuovaCoppia, consegnaA: consegnaA, riceviChiave: riceviChiave,
    portachiavi: portachiavi, ricordaChiave: ricordaChiave, dispositivo: dispositivo,
    salvaFrase: salvaFrase, frase: frase, dimenticaTutto: dimenticaTutto,
    aB64: aB64, daB64: daB64
  };
});
