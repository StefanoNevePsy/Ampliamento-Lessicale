#!/usr/bin/env node
/**
 * Prova custode/Code.gs fuori da Google, con finti DriveApp, CacheService,
 * LockService, UrlFetchApp, Utilities. Serve a trovare qui, e non al primo
 * deploy, gli errori nel collegamento tra la logica e i servizi Google:
 * percorsi su Drive, cache degli id, file binari, verifica del token.
 *
 *   node tools/test-appsscript.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Drive finto
// ---------------------------------------------------------------------------
let contatore = 0;
const nuovoId = () => 'id' + (++contatore);
const tutti = {};           // id -> nodo
const statistiche = { letture: 0, scritture: 0, ricerche: 0 };

function iteratore(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}
const conSegno = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const senzaSegno = (arr) => Buffer.from(arr.map((b) => (b + 256) % 256));

function nuovoBlob(bytes, mime, nome) {
  const buf = Buffer.isBuffer(bytes) ? bytes : senzaSegno(bytes);
  return {
    _buf: buf, _mime: mime, _nome: nome,
    getDataAsString: () => buf.toString('utf8'),
    getBytes: () => conSegno(buf),
    getContentType: () => mime,
    getName: () => nome,
  };
}

function nuovoFile(nome, contenuto, mime) {
  const f = {
    _tipo: 'file', _id: nuovoId(), _nome: nome, _buf: Buffer.from(contenuto), _mime: mime, _cestino: false,
    getId: () => f._id, getName: () => f._nome, isTrashed: () => f._cestino,
    setTrashed: (v) => { f._cestino = v; },
    getBlob: () => { statistiche.letture++; return nuovoBlob(f._buf, f._mime, f._nome); },
    setContent: (t) => { statistiche.scritture++; f._buf = Buffer.from(t, 'utf8'); return f; },
  };
  tutti[f._id] = f;
  return f;
}

function nuovaCartella(nome) {
  const d = {
    _tipo: 'cartella', _id: nuovoId(), _nome: nome, _file: [], _cartelle: [], _cestino: false,
    getId: () => d._id, getName: () => d._nome, isTrashed: () => d._cestino,
    getFoldersByName: (n) => { statistiche.ricerche++; return iteratore(d._cartelle.filter((c) => c._nome === n)); },
    getFilesByName: (n) => { statistiche.ricerche++; return iteratore(d._file.filter((c) => c._nome === n)); },
    getFiles: () => iteratore(d._file.slice()),
    getFolders: () => iteratore(d._cartelle.slice()),
    createFolder: (n) => { const c = nuovaCartella(n); d._cartelle.push(c); return c; },
    createFile: (a, contenuto, mime) => {
      statistiche.scritture++;
      const f = typeof a === 'string' ? nuovoFile(a, contenuto, mime) : nuovoFile(a._nome, a._buf, a._mime);
      d._file.push(f);
      return f;
    },
  };
  tutti[d._id] = d;
  return d;
}

const radice = nuovaCartella('Quaderno TICE');
const CLIENT_ID = '123-test.apps.googleusercontent.com';
const CLIENT_ID_DESKTOP = '98765-desktop.apps.googleusercontent.com';
const PROPRIETARIO = 'stefano@centrotice.it';

// token finti: "tok-<email>" = valido; varianti per i casi di errore
function tokeninfo(token) {
  const adesso = Math.floor(Date.now() / 1000);
  const base = { iss: 'https://accounts.google.com', aud: CLIENT_ID, email_verified: 'true', exp: String(adesso + 3600) };
  if (token.startsWith('tok-altraapp-')) return { ...base, aud: 'altra-app', email: token.slice(13) };
  if (token.startsWith('tok-desktop-')) return { ...base, aud: CLIENT_ID_DESKTOP, email: token.slice(12) };
  if (token.startsWith('tok-scaduto-')) return { ...base, exp: String(adesso - 10), email: token.slice(12) };
  if (token.startsWith('tok-nonverif-')) return { ...base, email_verified: 'false', email: token.slice(13) };
  if (token.startsWith('tok-')) return { ...base, email: token.slice(4), name: token.slice(4).split('@')[0] };
  return null;
}
let chiamateTokeninfo = 0;

const cacheDati = {};
let emailSessione = PROPRIETARIO;
const proprieta = { CARTELLA_RADICE: radice._id, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_ID_DESKTOP: CLIENT_ID_DESKTOP };
let lucchettoAltrui = false;   // un'altra persona sta salvando
const contesto = {
  console,
  DriveApp: {
    getFolderById: (id) => { const n = tutti[id]; if (!n || n._tipo !== 'cartella') throw new Error('non trovato'); return n; },
    getFileById: (id) => { const n = tutti[id]; if (!n || n._tipo !== 'file') throw new Error('non trovato'); return n; },
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => proprieta[k] || null, setProperty: (k, v) => { proprieta[k] = v; } }) },
  CacheService: { getScriptCache: () => ({
    get: (k) => (k in cacheDati ? cacheDati[k] : null),
    put: (k, v) => { if (String(v).length > 100000) throw new Error('valore troppo grande'); cacheDati[k] = v; },
    remove: (k) => { delete cacheDati[k]; },
    getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in cacheDati) o[k] = cacheDati[k]; }); return o; },
    putAll: (o) => { Object.entries(o).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('valore troppo grande'); cacheDati[k] = v; }); },
  }) },
  LockService: { getScriptLock: () => ({ tryLock: () => !lucchettoAltrui, releaseLock: () => {} }) },
  UrlFetchApp: { fetch: (url) => {
    chiamateTokeninfo++;
    const tok = decodeURIComponent(url.split('id_token=')[1]);
    const info = tokeninfo(tok);
    return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: 'invalid_token' }) };
  } },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, dati) => conSegno(crypto.createHash('sha256').update(typeof dati === 'string' ? Buffer.from(dati, 'utf8') : senzaSegno(dati)).digest()),
    base64Decode: (s) => conSegno(Buffer.from(s, 'base64')),
    base64Encode: (b) => senzaSegno(b).toString('base64'),
    newBlob: (b, mime, nome) => nuovoBlob(b, mime, nome),
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }),
  },
  Session: { getEffectiveUser: () => ({ getEmail: () => emailSessione }) },
  Logger: { log: () => {} },
};
contesto.globalThis = contesto;
vm.createContext(contesto);
const dir = path.join(__dirname, '..', 'custode');
// Si prova il file unico che si incolla davvero in Apps Script
vm.runInContext(fs.readFileSync(path.join(dir, 'custode-completo.gs'), 'utf8'), contesto, { filename: 'custode-completo.gs' });

// Ogni richiesta HTTP e' un'esecuzione nuova di Apps Script: si azzera lo stato
// globale del custode, ma la cache dello script sopravvive (come in produzione).
function post(token, azione, dati) {
  vm.runInContext('_custode = null;', contesto);
  const out = contesto.doPost({ postData: { contents: JSON.stringify({ v: 1, token, azione, dati }) } });
  return JSON.parse(out.getContent());
}

// ---------------------------------------------------------------------------
let passati = 0, falliti = 0;
function prova(nome, fn) {
  try { fn(); passati++; console.log('  ✓ ' + nome); }
  catch (e) { falliti++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}
const ok = (r) => { assert.ok(r.ok, `${r.errore}: ${r.messaggio}`); return r.dati; };

console.log('\nCode.gs con servizi Google simulati');
prova('doGet risponde e dice se e\' configurato', () => {
  const r = JSON.parse(contesto.doGet().getContent());
  assert.strictEqual(r.configurato, true);
});
prova('configura crea le cartelle nel Drive', () => {
  contesto.configura();
  assert.deepStrictEqual(radice._cartelle.map((c) => c._nome).sort(), ['Materiali', 'Pazienti', '_config']);
});
prova('token per un\'altra app, scaduto o con email non verificata: rifiutati', () => {
  for (const t of ['tok-altraapp-' + PROPRIETARIO, 'tok-scaduto-' + PROPRIETARIO, 'tok-nonverif-' + PROPRIETARIO, 'spazzatura-lunga-abbastanza']) {
    assert.strictEqual(post(t, 'io').errore, 'non-autenticato', t);
  }
});
prova('accesso dall\'app desktop (client "App desktop") accettato', () => {
  assert.strictEqual(ok(post('tok-desktop-' + PROPRIETARIO, 'io')).ruolo, 'admin');
});
prova('il token valido viene verificato una volta sola e poi ricordato', () => {
  const prima = chiamateTokeninfo;
  assert.strictEqual(ok(post('tok-' + PROPRIETARIO, 'io')).ruolo, 'admin');
  ok(post('tok-' + PROPRIETARIO, 'io'));
  ok(post('tok-' + PROPRIETARIO, 'io'));
  assert.strictEqual(chiamateTokeninfo - prima, 1);
});

const PID = '1727000000000';
const busta = (t) => ({ v: 1, alg: 'A256GCM', kid: 'k1', iv: crypto.randomBytes(12).toString('base64'), comp: 'no', dati: Buffer.from(t).toString('base64') });
prova('crea un paziente: i file finiscono nelle cartelle giuste', () => {
  ok(post('tok-' + PROPRIETARIO, 'cifratura.imposta', { cifratura: { kid: 'k1', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: crypto.randomBytes(16).toString('base64') }, verifica: busta('ok') } }));
  ok(post('tok-' + PROPRIETARIO, 'paziente.crea', { id: PID, busta: busta('uno'), etichetta: busta('e') }));
  const conf = radice._cartelle.find((c) => c._nome === '_config');
  assert.ok(conf._file.find((f) => f._nome === 'cifratura.json'));
  const paz = radice._cartelle.find((c) => c._nome === 'Pazienti');
  const cart = paz._cartelle.find((c) => c._nome === PID);
  assert.ok(cart, 'cartella del paziente');
  assert.deepStrictEqual(cart._file.map((f) => f._nome), ['paziente.json']);
  assert.ok(paz._file.find((f) => f._nome === '_elenco.json'));
});
prova('un salvataggio aggiorna il file e mette la versione prima in versioni/', () => {
  ok(post('tok-' + PROPRIETARIO, 'paziente.salva', { id: PID, versioneBase: 1, busta: busta('due') }));
  const cart = radice._cartelle.find((c) => c._nome === 'Pazienti')._cartelle.find((c) => c._nome === PID);
  assert.strictEqual(cart._file.length, 1);
  assert.strictEqual(JSON.parse(cart._file[0]._buf.toString()).version, 2);
  const ver = cart._cartelle.find((c) => c._nome === 'versioni');
  assert.deepStrictEqual(ver._file.map((f) => f._nome), ['v00000001.json']);
});
prova('la cache degli id evita di cercare per nome a ogni richiesta', () => {
  const prima = statistiche.ricerche;
  ok(post('tok-' + PROPRIETARIO, 'paziente.leggi', { id: PID }));
  assert.ok(statistiche.ricerche - prima <= 1, `ricerche per nome: ${statistiche.ricerche - prima}`);
});
prova('se un file viene spostato nel cestino, dopo svuotaCache lo si ritrova per nome e non si legge quello vecchio', () => {
  const paz = radice._cartelle.find((c) => c._nome === 'Pazienti');
  const elenco = paz._file.find((f) => f._nome === '_elenco.json');
  elenco.setTrashed(true);
  // la copia in cache resta valida finché non si svuota (come dopo ogni modifica a mano su Drive)
  assert.strictEqual(ok(post('tok-' + PROPRIETARIO, 'pazienti.elenco')).length, 1, 'intanto si continua a lavorare');
  contesto.svuotaCache();
  const pazienti = ok(post('tok-' + PROPRIETARIO, 'pazienti.elenco'));
  assert.strictEqual(pazienti.length, 1);
  assert.ok(paz._file.some((f) => f._nome === '_elenco.json' && !f._cestino), 'elenco ricostruito');
});
prova('immagini: salvate come file binari veri e rilette identiche', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const h = crypto.createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex');
  ok(post('tok-' + PROPRIETARIO, 'materiali.caricaImmagini', { immagini: { [h]: 'data:image/png;base64,' + png } }));
  const imm = radice._cartelle.find((c) => c._nome === 'Materiali')._cartelle.find((c) => c._nome === 'immagini');
  assert.strictEqual(imm._file[0]._nome, h + '.png');
  assert.strictEqual(imm._file[0]._mime, 'image/png');
  assert.strictEqual(imm._file[0]._buf.toString('base64'), png);
  const r = ok(post('tok-' + PROPRIETARIO, 'materiali.immagini', { hashes: [h] }));
  assert.strictEqual(r[h], 'data:image/png;base64,' + png);
});
prova('molte immagini: un elenco solo della cartella, senza quelle nel cestino', () => {
  const imm = radice._cartelle.find((c) => c._nome === 'Materiali')._cartelle.find((c) => c._nome === 'immagini');
  const hs = imm._file.map((f) => f._nome.split('.')[0]);
  imm._file[0].setTrashed(true);
  const finti = [1, 2, 3].map((i) => crypto.createHash('sha256').update('x' + i).digest('hex'));
  const prima = statistiche.ricerche;
  const r = ok(post('tok-' + PROPRIETARIO, 'materiali.mancanti', { hashes: hs.concat(finti) }));
  assert.deepStrictEqual(r, [hs[0]].concat(finti));
  assert.ok(statistiche.ricerche - prima < 5, 'ricerche su Drive: ' + (statistiche.ricerche - prima));
  imm._file[0].setTrashed(false);
});
prova('una scrittura rimandata con lo stesso identificativo restituisce la risposta di allora', () => {
  const rid = 'rid-' + crypto.randomBytes(6).toString('hex');
  const invia = () => { vm.runInContext('_custode = null;', contesto); return JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify({ v: 1, token: 'tok-' + PROPRIETARIO, azione: 'materiali.elimina', rid, dati: { id: 'inesistente' } }) } }).getContent()); };
  const a = invia();
  assert.strictEqual(a.errore, 'non-trovato');   // gli errori non si ricordano: si rifanno
  const set = { id: 'prova-rid', name: 'Prova', items: [] };
  const pubblica = () => { vm.runInContext('_custode = null;', contesto); return JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify({ v: 1, token: 'tok-' + PROPRIETARIO, azione: 'materiali.pubblica', rid, dati: { set, versioneBase: 0 } }) } }).getContent()); };
  const p1 = pubblica(), p2 = pubblica();
  assert.ok(p1.ok && p2.ok, JSON.stringify(p2));
  assert.strictEqual(p2.dati.versione, 1);
});
prova('se Google per un attimo non dice chi e\' il proprietario, resta admin', () => {
  assert.strictEqual(proprieta.PROPRIETARIO, PROPRIETARIO, 'ricordato nelle proprieta\' dello script');
  emailSessione = '';
  try { assert.strictEqual(ok(post('tok-' + PROPRIETARIO, 'io')).ruolo, 'admin'); } finally { emailSessione = PROPRIETARIO; }
});
prova('ricostruisciCache dall\'editor funziona', () => {
  contesto.ricostruisciCache();
});
prova('JSON non valido: risposta di errore, non un\'eccezione', () => {
  const out = JSON.parse(contesto.doPost({ postData: { contents: '{rotto' } }).getContent());
  assert.strictEqual(out.errore, 'richiesta-non-valida');
});

// ---- cache del contenuto dei file: sempre coerente con Drive ----
prova('cache: si rilegge quello appena scritto, mai il vecchio', () => {
  const A = () => { vm.runInContext('_custode = null;', contesto); return vm.runInContext('archivioDrive_()', contesto); };
  A().scriviJSON('_config/prova.json', { a: 1 });
  assert.strictEqual(A().leggiJSON('_config/prova.json').a, 1);
  A().scriviJSON('_config/prova.json', { a: 2 });
  assert.strictEqual(A().leggiJSON('_config/prova.json').a, 2);
});
prova('cache: file grandi in pezzi; assente poi creato; eliminato', () => {
  const A = () => { vm.runInContext('_custode = null;', contesto); return vm.runInContext('archivioDrive_()', contesto); };
  A().scriviJSON('Pazienti/x/paziente.json', { t: 'x'.repeat(300000) });
  assert.strictEqual(A().leggiJSON('Pazienti/x/paziente.json').t.length, 300000);
  assert.strictEqual(A().leggiJSON('_config/manca.json'), null);
  assert.strictEqual(A().esiste('_config/manca.json'), false);
  A().scriviJSON('_config/manca.json', { c: 3 });
  assert.strictEqual(A().esiste('_config/manca.json'), true);
  A().elimina('_config/manca.json');
  assert.strictEqual(A().leggiJSON('_config/manca.json'), null);
});
prova('cache svuotata o con un pezzo perso: si rilegge da Drive, mai mezzo file', () => {
  const A = () => { vm.runInContext('_custode = null;', contesto); return vm.runInContext('archivioDrive_()', contesto); };
  A().scriviJSON('Pazienti/x/paziente.json', { t: 'y'.repeat(300000) });
  const pezzo = Object.keys(cacheDati).find((k) => /^c:.*:1$/.test(k) && String(cacheDati[k]).startsWith('y'));
  delete cacheDati[pezzo];
  assert.strictEqual(A().leggiJSON('Pazienti/x/paziente.json').t, 'y'.repeat(300000));
  Object.keys(cacheDati).filter((k) => k.startsWith('c:')).forEach((k) => delete cacheDati[k]);
  assert.strictEqual(A().leggiJSON('_config/prova.json').a, 2);
  assert.strictEqual(typeof contesto.attivaRisveglio, 'function');
});
prova('mentre un\'altra persona salva, una lettura da Drive non entra in cache', () => {
  const A = () => { vm.runInContext('_custode = null;', contesto); return vm.runInContext('archivioDrive_()', contesto); };
  Object.keys(cacheDati).filter((k) => k.startsWith('c')).forEach((k) => delete cacheDati[k]);
  lucchettoAltrui = true;
  try {
    assert.strictEqual(A().leggiJSON('_config/prova.json').a, 2);
    assert.ok(!Object.keys(cacheDati).some((k) => /^c[^:]*:/.test(k)), 'niente in cache');
  } finally { lucchettoAltrui = false; }
  A().leggiJSON('_config/prova.json');
  assert.ok(Object.keys(cacheDati).some((k) => /^c[^:]*:/.test(k)), 'con il lucchetto libero sì');
});

console.log(`\n${passati} test passati, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
