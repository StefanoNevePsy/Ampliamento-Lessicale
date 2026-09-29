#!/usr/bin/env node
/**
 * Test del custode: le regole di sicurezza e di integrita' dei dati.
 *
 *   node tools/test-custode.js
 *
 * Gira sulla stessa logica che viene incollata in Apps Script (custode/core.js).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QT = require('../custode/core.js');
const { archivioSuDisco, sha256Hex } = require('./custode-mock.js');

const PROPRIETARIO = 'stefano@centrotice.it';
let adesso = new Date('2026-10-01T09:00:00Z');
const tick = (ms = 1000) => { adesso = new Date(adesso.getTime() + ms); };

function nuovoCustode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custode-test-'));
  const custode = QT.creaCustode({
    archivio: archivioSuDisco(dir),
    verificaToken: (t) => {
      if (!t || !t.startsWith('dev:')) throw new Error('no');
      const [email, nome] = t.slice(4).split('|');
      return { email, nome: nome || email };
    },
    proprietario: () => PROPRIETARIO,
    ora: () => adesso.toISOString(),
    sha256Hex,
  });
  return { dir, custode };
}

const id = (p) => p + '_' + crypto.randomBytes(8).toString('hex');

let passati = 0;
const fallimenti = [];
function prova(nome, fn) {
  try { fn(); passati++; console.log('  ✓ ' + nome); }
  catch (e) { fallimenti.push(nome); console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
}

const { dir, custode } = nuovoCustode();
const chiama = (email, azione, dati) => custode.gestisci({ v: 1, token: email ? 'dev:' + email : '', azione, dati });
const ok = (r) => { assert.ok(r.ok, `atteso ok, ricevuto ${r.errore}: ${r.messaggio}`); return r.dati; };
const ko = (r, codice) => { assert.ok(!r.ok, 'atteso un errore, ricevuto ok'); assert.strictEqual(r.errore, codice, `atteso ${codice}, ricevuto ${r.errore}: ${r.messaggio}`); };

console.log('\nIdentita\' e accessi');
prova('senza token: non autenticato', () => ko(chiama('', 'io'), 'non-autenticato'));
prova('il proprietario e\' admin anche ad archivio vuoto', () => {
  const io = ok(chiama(PROPRIETARIO, 'io'));
  assert.strictEqual(io.ruolo, 'admin');
  assert.strictEqual(io.proprietario, true);
});
prova('un account sconosciuto e\' rifiutato', () => ko(chiama('sconosciuto@gmail.com', 'io'), 'non-autorizzato'));
prova('versione di protocollo sbagliata e\' rifiutata', () => {
  const r = custode.gestisci({ v: 99, token: 'dev:' + PROPRIETARIO, azione: 'io' });
  ko(r, 'richiesta-non-valida');
});

// --- Buste cifrate (come le produce l'app: AES-256-GCM) ---------------------------
const CHIAVE = crypto.randomBytes(32);
function busta(oggetto, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CHIAVE, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const dati = Buffer.concat([c.update(JSON.stringify(oggetto)), c.final(), c.getAuthTag()]);
  return { v: 1, alg: 'A256GCM', kid: 'k1', iv: iv.toString('base64'), comp: 'no', dati: dati.toString('base64') };
}
function apri(b, aad) {
  const raw = Buffer.from(b.dati, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', CHIAVE, Buffer.from(b.iv, 'base64'));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString());
}
const CIFRATURA = { kid: 'k1', kdf: { nome: 'PBKDF2-SHA256', iterazioni: 600000, sale: crypto.randomBytes(16).toString('base64') }, verifica: busta({ tice: 'ok' }) };

// --- Pazienti ----------------------------------------------------------------
const PZ1 = String(Date.now()), PZ2 = String(Date.now() + 1);
const paziente = (pid, nome, extra) => Object.assign({ id: pid, name: nome, history: [] }, extra || {});
const salvaP = (email, pid, oggetto, base) => chiama(email, 'paziente.salva', {
  id: pid, versioneBase: base, busta: busta(oggetto, 'tice:paziente:' + pid), etichetta: busta({ nome: oggetto.name }, 'tice:etichetta:' + pid),
});

console.log('\nChiave del centro');
prova('senza chiave del centro non si salvano pazienti', () => {
  ko(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ1, busta: busta({}), etichetta: busta({}) }), 'senza-chiave');
});
prova('l\'admin crea la chiave; la configurazione e\' leggibile, la chiave no', () => {
  ok(chiama(PROPRIETARIO, 'cifratura.imposta', { cifratura: CIFRATURA }));
  const c = ok(chiama(PROPRIETARIO, 'cifratura.leggi'));
  assert.strictEqual(c.kdf.sale, CIFRATURA.kdf.sale);
  assert.strictEqual(JSON.stringify(c).indexOf(CHIAVE.toString('base64')), -1);
  assert.strictEqual(ok(chiama(PROPRIETARIO, 'io')).cifratura, true);
});
prova('la chiave non si sostituisce per sbaglio', () => {
  const altra = Object.assign({}, CIFRATURA, { verifica: busta({ tice: 'altra' }) });
  ko(chiama(PROPRIETARIO, 'cifratura.imposta', { cifratura: altra }), 'conflitto');
});
prova('una busta malformata o in chiaro e\' rifiutata', () => {
  ko(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ1, busta: { nome: 'Mario Rossi' }, etichetta: busta({}) }), 'richiesta-non-valida');
  ko(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ1, busta: Object.assign(busta({}), { dati: '<script>' }), etichetta: busta({}) }), 'richiesta-non-valida');
});

console.log('\nPazienti');
let bustaPZ1;
prova('l\'admin crea due pazienti', () => {
  bustaPZ1 = busta(paziente(PZ1, 'Mario Rossi'), 'tice:paziente:' + PZ1);
  const r = ok(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ1, busta: bustaPZ1, etichetta: busta({ nome: 'Mario Rossi' }, 'tice:etichetta:' + PZ1) }));
  assert.strictEqual(r.version, 1);
  ok(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ2, busta: busta(paziente(PZ2, 'Anna Bianchi')), etichetta: busta({ nome: 'Anna Bianchi' }) }));
});
prova('la creazione reinviata non duplica', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.crea', { id: PZ1, busta: bustaPZ1, etichetta: busta({ nome: 'Mario Rossi' }) }));
  assert.strictEqual(r.version, 1);
  assert.strictEqual(ok(chiama(PROPRIETARIO, 'pazienti.elenco')).length, 2);
});
prova('nel Drive non c\'e\' nessun dato leggibile: solo buste cifrate', () => {
  const tutto = [];
  (function giro(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? giro(path.join(d, e.name)) : tutto.push(fs.readFileSync(path.join(d, e.name), 'utf8'))); })(dir);
  assert.ok(!tutto.join('\n').includes('Mario'), 'il nome compare in chiaro');
  assert.ok(!tutto.join('\n').includes('Bianchi'), 'il nome compare in chiaro');
});
prova('chi ha la chiave legge nome e dati', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1 }));
  assert.strictEqual(apri(r.busta, 'tice:paziente:' + PZ1).name, 'Mario Rossi');
  const el = ok(chiama(PROPRIETARIO, 'pazienti.elenco')).find((x) => x.id === PZ1);
  assert.strictEqual(apri(el.etichetta, 'tice:etichetta:' + PZ1).nome, 'Mario Rossi');
});
prova('una busta spostata su un altro paziente non si apre (dati legati al paziente)', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1 }));
  assert.throws(() => apri(r.busta, 'tice:paziente:' + PZ2));
});
prova('un id che prova a uscire dalla cartella e\' rifiutato', () => {
  ko(chiama(PROPRIETARIO, 'paziente.leggi', { id: '../../_config' }), 'richiesta-non-valida');
  ko(chiama(PROPRIETARIO, 'paziente.leggi', { id: 'pz/../x' }), 'richiesta-non-valida');
});
prova('salvataggio da una versione vecchia: conflitto, con la versione attuale da unire', () => {
  const v2 = ok(salvaP(PROPRIETARIO, PZ1, paziente(PZ1, 'Mario Rossi', { note: 'prima modifica' }), 1));
  assert.strictEqual(v2.version, 2);
  const r = salvaP(PROPRIETARIO, PZ1, paziente(PZ1, 'Mario Rossi', { note: 'concorrente' }), 1);
  ko(r, 'conflitto');
  assert.strictEqual(r.extra.attuale.version, 2);
  assert.strictEqual(apri(r.extra.attuale.busta, 'tice:paziente:' + PZ1).note, 'prima modifica');
});

console.log('\nVersioni precedenti');
prova('ogni salvataggio conserva la versione prima', () => {
  const v = ok(chiama(PROPRIETARIO, 'paziente.versioni', { id: PZ1 }));
  assert.deepStrictEqual(v.map((x) => x.version), [1]);
  const vecchia = ok(chiama(PROPRIETARIO, 'paziente.versione', { id: PZ1, version: 1 }));
  assert.strictEqual(apri(vecchia.busta, 'tice:paziente:' + PZ1).note, undefined);
});
prova('si tengono le ultime 20 e una al giorno per 60 giorni', () => {
  let ver = 2;
  // 10 giorni con 5 salvataggi al giorno
  for (let g = 0; g < 10; g++) {
    for (let k = 0; k < 5; k++) { tick(60000); ver = ok(salvaP(PROPRIETARIO, PZ1, paziente(PZ1, 'Mario Rossi', { note: `g${g}k${k}` }), ver)).version; }
    tick(86400000);
  }
  const v = ok(chiama(PROPRIETARIO, 'paziente.versioni', { id: PZ1 }));
  const giorni = new Set(v.map((x) => x.aggiornato.slice(0, 10)));
  assert.ok(v.length >= 20 && v.length <= 20 + 11, 'versioni tenute: ' + v.length);
  assert.ok(giorni.size >= 10, 'giorni coperti: ' + giorni.size);
  assert.strictEqual(v[0].version, ver - 1);
});
prova('dopo 60 giorni restano le ultime 20', () => {
  tick(90 * 86400000);
  let ver = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1 })).version;
  ver = ok(salvaP(PROPRIETARIO, PZ1, paziente(PZ1, 'Mario Rossi', { note: 'dopo tre mesi' }), ver)).version;
  const v = ok(chiama(PROPRIETARIO, 'paziente.versioni', { id: PZ1 }));
  assert.strictEqual(v.length, 20);
});

// --- Utenti e ruoli ----------------------------------------------------------
const TIR = 'tirocinante@gmail.com', PROF = 'elisa@centrotice.it', ADM2 = 'monica@centrotice.it';
console.log('\nRuoli');
prova('l\'admin assegna una tirocinante (solo PZ1, con scadenza) e una professionista', () => {
  ok(chiama(PROPRIETARIO, 'accessi.salva', {
    versioneBase: 0,
    accessi: { utenti: {
      [TIR]: { nome: 'Tiro', ruolo: 'tirocinante', pazienti: [PZ1], scadenza: '2027-02-28' },
      [PROF]: { nome: 'Eli', ruolo: 'professionista', pazienti: [] },
      [ADM2.toUpperCase()]: { nome: 'Moni', ruolo: 'admin', pazienti: '*' },
    } },
  }));
});
prova('la tirocinante vede solo il paziente assegnato', () => {
  const el = ok(chiama(TIR, 'pazienti.elenco'));
  assert.deepStrictEqual(el.map((p) => p.id), [PZ1]);
  ko(chiama(TIR, 'paziente.leggi', { id: PZ2 }), 'vietato');
  ko(chiama(TIR, 'paziente.versioni', { id: PZ2 }), 'vietato');
});
prova('la tirocinante registra le sedute sul paziente assegnato', () => {
  const v = ok(chiama(TIR, 'paziente.leggi', { id: PZ1 })).version;
  const r = ok(salvaP(TIR, PZ1, paziente(PZ1, 'Mario Rossi', { history: [{ id: 'sx_1', correct: 8, total: 10 }] }), v));
  assert.strictEqual(r.aggiornatoDa, TIR);
});
prova('...ma non su un altro, non crea pazienti e non archivia', () => {
  ko(salvaP(TIR, PZ2, paziente(PZ2, 'x'), 1), 'vietato');
  ko(chiama(TIR, 'paziente.crea', { id: String(Date.now() + 5), busta: busta({}), etichetta: busta({}) }), 'vietato');
  ko(chiama(TIR, 'paziente.archivia', { id: PZ1 }), 'vietato');
});
prova('la tirocinante non gestisce gli accessi ne\' pubblica materiali', () => {
  ko(chiama(TIR, 'accessi.leggi'), 'vietato');
  ko(chiama(TIR, 'materiali.mancanti', { hashes: [] }), 'vietato');
  ko(chiama(TIR, 'cifratura.imposta', { cifratura: CIFRATURA }), 'vietato');
});
prova('le email degli accessi sono normalizzate in minuscolo', () => {
  assert.strictEqual(ok(chiama(ADM2, 'io')).ruolo, 'admin');
});
prova('un admin non puo\' togliersi da solo il ruolo', () => {
  const a = ok(chiama(ADM2, 'accessi.leggi'));
  a.utenti[ADM2].ruolo = 'professionista';
  ko(chiama(ADM2, 'accessi.salva', { accessi: a, versioneBase: a.version }), 'richiesta-non-valida');
});
prova('la professionista che crea un paziente se lo ritrova assegnato', () => {
  const PZ3 = String(Date.now() + 3);
  ok(chiama(PROF, 'paziente.crea', { id: PZ3, busta: busta({}), etichetta: busta({}) }));
  assert.deepStrictEqual(ok(chiama(PROF, 'pazienti.elenco')).map((p) => p.id), [PZ3]);
});

console.log('\nArchiviazione e ricostruzione');
prova('un paziente archiviato resta nel Drive con le sue versioni', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.archivia', { id: PZ2 }));
  assert.strictEqual(r.eliminato, true);
  assert.ok(ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ2 })).busta);
  ok(chiama(PROPRIETARIO, 'paziente.archivia', { id: PZ2, archiviato: false }));
});
prova('l\'elenco si ricostruisce dai file dei pazienti', () => {
  fs.unlinkSync(path.join(dir, 'Pazienti', '_elenco.json'));
  assert.strictEqual(ok(chiama(PROPRIETARIO, 'pazienti.elenco')).length, 3);
});

console.log('\nScadenza');
prova('dopo la scadenza la tirocinante non entra piu\'', () => {
  const salvato = adesso;
  adesso = new Date('2027-03-01T08:00:00Z');
  ko(chiama(TIR, 'io'), 'scaduto');
  adesso = salvato;
});
prova('un utente disattivato non entra', () => {
  const a = ok(chiama(PROPRIETARIO, 'accessi.leggi'));
  a.utenti[PROF].attivo = false;
  ok(chiama(PROPRIETARIO, 'accessi.salva', { accessi: a, versioneBase: a.version }));
  ko(chiama(PROF, 'pazienti.elenco'), 'disattivato');
});

// --- Materiali -----------------------------------------------------------------
console.log('\nMateriali');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const H = sha256Hex(PNG);
const SET = { id: 'animali', name: 'Animali', category: 'Lessico', items: [{ label: 'gatto', url: 'img:' + H }] };
prova('un\'immagine con hash falso e\' rifiutata', () => {
  const falso = 'a'.repeat(64);
  ko(chiama(PROPRIETARIO, 'materiali.caricaImmagini', { immagini: { [falso]: 'data:image/png;base64,' + PNG } }), 'richiesta-non-valida');
});
prova('pubblicare un set con immagini non caricate: le elenca', () => {
  const r = chiama(PROPRIETARIO, 'materiali.pubblica', { set: SET, versioneBase: 0 });
  ko(r, 'immagini-mancanti');
  assert.deepStrictEqual(r.extra.mancanti, [H]);
});
prova('un set con l\'immagine dentro (non per riferimento) e\' rifiutato', () => {
  const s = JSON.parse(JSON.stringify(SET)); s.items[0].url = 'data:image/png;base64,' + PNG;
  ko(chiama(PROPRIETARIO, 'materiali.pubblica', { set: s, versioneBase: 0 }), 'richiesta-non-valida');
});
prova('...neanche annidata (varianti, maschere)', () => {
  const s = JSON.parse(JSON.stringify(SET)); s.items[0].variantUrls = { 1: 'data:image/png;base64,' + PNG };
  ko(chiama(PROPRIETARIO, 'materiali.pubblica', { set: s, versioneBase: 0 }), 'richiesta-non-valida');
});
prova('un SVG (puo\' contenere script) non e\' ammesso tra i materiali', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  const h = sha256Hex(svg);
  ko(chiama(PROPRIETARIO, 'materiali.caricaImmagini', { immagini: { [h]: 'data:image/svg+xml;base64,' + svg } }), 'richiesta-non-valida');
});
prova('caricamento, pubblicazione e scaricamento', () => {
  assert.deepStrictEqual(ok(chiama(PROPRIETARIO, 'materiali.mancanti', { hashes: [H] })), [H]);
  ok(chiama(PROPRIETARIO, 'materiali.caricaImmagini', { immagini: { [H]: 'data:image/png;base64,' + PNG } }));
  assert.deepStrictEqual(ok(chiama(PROPRIETARIO, 'materiali.mancanti', { hashes: [H] })), []);
  const voce = ok(chiama(PROPRIETARIO, 'materiali.pubblica', { set: SET, versioneBase: 0 }));
  assert.strictEqual(voce.versione, 1);
  const indice = ok(chiama(TIR, 'materiali.indice'));
  assert.strictEqual(indice.sets.animali.versione, 1);
  const img = ok(chiama(TIR, 'materiali.immagini', { hashes: [H] }));
  assert.strictEqual(img[H], 'data:image/png;base64,' + PNG);
});
prova('due modifiche concorrenti allo stesso set: la seconda va in conflitto', () => {
  ok(chiama(PROPRIETARIO, 'materiali.pubblica', { set: SET, versioneBase: 1 }));
  ko(chiama(ADM2, 'materiali.pubblica', { set: SET, versioneBase: 1 }), 'conflitto');
});

console.log(`\n${passati} test passati, ${fallimenti.length} falliti`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fallimenti.length ? 1 : 0);
