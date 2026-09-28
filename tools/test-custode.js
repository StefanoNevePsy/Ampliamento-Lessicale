#!/usr/bin/env node
/**
 * Test del custode: le regole di sicurezza e di integrita' dei dati.
 *
 *   node tools/test-custode.js [import-XXX.json]
 *
 * Gira sulla stessa logica che viene incollata in Apps Script (custode/core.js).
 * Se passi un file prodotto da tools/import_numbers.py, verifica anche che
 * l'import reale superi la validazione del custode.
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

// --- Pazienti ----------------------------------------------------------------
const PZ1 = id('pz'), PZ2 = id('pz'), PR = id('pr'), ST = id('st');
const paziente = (pid, codice) => ({
  id: pid, codice, etichetta: 'A. B.', aula: 'Aula 1',
  programmi: [{ id: PR, area: 'Speaker', nome: 'TACT', criterio: { soglia: 90, sedute: 2 }, strategia: 'timedelay', prove: 10,
    sto: [{ id: ST, testo: 'TACT oggetti', stato: 'attivo', inizio: '2026-09-01' }] }],
});

console.log('\nPazienti');
let versione;
prova('l\'admin crea due pazienti', () => {
  versione = ok(chiama(PROPRIETARIO, 'paziente.crea', { paziente: paziente(PZ1, 'PZ-001') })).version;
  ok(chiama(PROPRIETARIO, 'paziente.crea', { paziente: paziente(PZ2, 'PZ-002') }));
  assert.strictEqual(versione, 1);
});
prova('la creazione reinviata non duplica', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.crea', { paziente: paziente(PZ1, 'PZ-001') }));
  assert.strictEqual(r.version, 1);
  assert.strictEqual(ok(chiama(PROPRIETARIO, 'pazienti.elenco')).length, 2);
});
prova('un id che prova a uscire dalla cartella e\' rifiutato', () => {
  ko(chiama(PROPRIETARIO, 'paziente.leggi', { id: 'pz_../../_config' }), 'richiesta-non-valida');
});
prova('salvataggio da una versione vecchia: conflitto, con la versione attuale', () => {
  const p = paziente(PZ1, 'PZ-001'); p.note = 'prima modifica';
  const v2 = ok(chiama(PROPRIETARIO, 'paziente.salva', { paziente: p, versioneBase: 1 }));
  assert.strictEqual(v2.version, 2);
  p.note = 'modifica concorrente partita dalla 1';
  const r = chiama(PROPRIETARIO, 'paziente.salva', { paziente: p, versioneBase: 1 });
  ko(r, 'conflitto');
  assert.strictEqual(r.extra.attuale.note, 'prima modifica');
});
prova('campi sconosciuti nel paziente vengono scartati', () => {
  const p = paziente(PZ2, 'PZ-002'); p.campoInventato = '<script>'; p.programmi[0].xss = 1;
  const r = ok(chiama(PROPRIETARIO, 'paziente.salva', { paziente: p, versioneBase: 1 }));
  assert.strictEqual(r.campoInventato, undefined);
  assert.strictEqual(r.programmi[0].xss, undefined);
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
});
prova('la tirocinante non puo\' modificare i programmi', () => {
  const pz = ok(chiama(TIR, 'paziente.leggi', { id: PZ1 })).paziente;
  ko(chiama(TIR, 'paziente.salva', { paziente: pz, versioneBase: pz.version }), 'vietato');
});
prova('la tirocinante non gestisce gli accessi ne\' pubblica materiali', () => {
  ko(chiama(TIR, 'accessi.leggi'), 'vietato');
  ko(chiama(TIR, 'materiali.mancanti', { hashes: [] }), 'vietato');
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
  const PZ3 = id('pz');
  ok(chiama(PROF, 'paziente.crea', { paziente: paziente(PZ3, 'PZ-003') }));
  const el = ok(chiama(PROF, 'pazienti.elenco')).map((p) => p.id);
  assert.deepStrictEqual(el, [PZ3]);
});

// --- Sedute ------------------------------------------------------------------
const seduta = (sid, pid, v, extra) => Object.assign({
  id: sid, pazienteId: pid, data: '2026-10-01', operatoreNome: 'Tiro',
  voci: [{ programmaId: PR, stoId: ST, strategia: 'timedelay', v, p: 10 - v, x: 0, sequenza: 'V'.repeat(v) + 'P'.repeat(10 - v) }],
}, extra || {});

console.log('\nSedute');
const SD = id('sd');
let primaSalvata;
prova('la tirocinante registra una seduta: l\'autore lo decide il custode', () => {
  primaSalvata = ok(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(SD, PZ1, 8, { operatore: 'falso@x.it' }) }));
  assert.strictEqual(primaSalvata.operatore, TIR);
});
prova('il reinvio identico (rete caduta) non riscrive e non duplica', () => {
  tick(5000);
  const r = ok(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(SD, PZ1, 8) }));
  assert.strictEqual(r._srv.modificato, primaSalvata._srv.modificato);
  const sedute = ok(chiama(TIR, 'paziente.leggi', { id: PZ1 })).sedute;
  assert.strictEqual(sedute.length, 1);
});
prova('la tirocinante corregge la propria seduta', () => {
  tick();
  const r = ok(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(SD, PZ1, 9) }));
  assert.strictEqual(r.voci[0].v, 9);
  assert.strictEqual(r.operatore, TIR);
});
const SD_ADM = id('sd');
prova('...ma non quella di un\'altra persona', () => {
  ok(chiama(PROPRIETARIO, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(SD_ADM, PZ1, 7) }));
  tick();
  ko(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(SD_ADM, PZ1, 10) }), 'vietato');
  ko(chiama(TIR, 'seduta.elimina', { pazienteId: PZ1, id: SD_ADM }), 'vietato');
});
prova('non si registra una seduta su un paziente non assegnato', () => {
  ko(chiama(TIR, 'seduta.salva', { pazienteId: PZ2, seduta: seduta(id('sd'), PZ2, 5) }), 'vietato');
});
prova('non si nasconde una seduta dentro un altro paziente', () => {
  ko(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: seduta(id('sd'), PZ2, 5) }), 'richiesta-non-valida');
});
prova('sequenza con caratteri non ammessi: rifiutata', () => {
  const s = seduta(id('sd'), PZ1, 5); s.voci[0].sequenza = 'VV<img>';
  ko(chiama(TIR, 'seduta.salva', { pazienteId: PZ1, seduta: s }), 'richiesta-non-valida');
});
prova('lettura incrementale: solo le sedute cambiate dopo "ora"', () => {
  const r = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1 }));
  tick();
  ok(chiama(TIR, 'seduta.elimina', { pazienteId: PZ1, id: SD }));
  const inc = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1, dopo: r.ora }));
  assert.deepStrictEqual(inc.sedute.map((s) => s.id), [SD]);
  assert.strictEqual(inc.sedute[0].eliminata, true);
});
prova('l\'elenco riporta numero di sedute e ultima data (le eliminate non contano)', () => {
  const pz = ok(chiama(PROPRIETARIO, 'pazienti.elenco')).find((p) => p.id === PZ1);
  assert.strictEqual(pz.nSedute, 1);
  assert.strictEqual(pz.ultimaSeduta, '2026-10-01');
});
prova('le cache si ricostruiscono dai file delle sedute', () => {
  fs.rmSync(path.join(dir, 'Pazienti', PZ1, '_sedute.json'));
  fs.rmSync(path.join(dir, 'Pazienti', '_elenco.json'));
  const sedute = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: PZ1 })).sedute;
  assert.strictEqual(sedute.length, 2);
  assert.strictEqual(sedute.find((s) => s.id === SD).eliminata, true);
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

// --- Import -------------------------------------------------------------------
const fileImport = process.argv[2];
if (fileImport) {
  console.log('\nImport reale (' + path.basename(fileImport) + ')');
  const pacchetto = JSON.parse(fs.readFileSync(fileImport, 'utf8'));
  prova('l\'import prodotto da import_numbers.py supera la validazione del custode', () => {
    const r = ok(chiama(PROPRIETARIO, 'paziente.importa', { pacchetto }));
    assert.strictEqual(r.sedute, pacchetto.sedute.length);
  });
  prova('reimportare lo stesso paziente e\' rifiutato', () => {
    ko(chiama(PROPRIETARIO, 'paziente.importa', { pacchetto }), 'conflitto');
  });
  prova('lo storico importato si legge tutto, programmi compresi', () => {
    const r = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: pacchetto.paziente.id }));
    assert.strictEqual(r.sedute.length, pacchetto.sedute.length);
    assert.strictEqual(r.paziente.programmi.length, pacchetto.paziente.programmi.length);
    assert.strictEqual(r.paziente.learnUnitStoriche.length, pacchetto.paziente.learnUnitStoriche.length);
  });
  prova('una correzione a una seduta importata prevale anche dopo una ricostruzione', () => {
    const pid = pacchetto.paziente.id;
    const s = JSON.parse(JSON.stringify(pacchetto.sedute[0]));
    s.nota = 'corretta dopo l\'import';
    tick(60000);
    ok(chiama(PROPRIETARIO, 'seduta.salva', { pazienteId: pid, seduta: s }));
    ok(chiama(PROPRIETARIO, 'manutenzione.ricostruisci', { pazienteId: pid }));
    const letta = ok(chiama(PROPRIETARIO, 'paziente.leggi', { id: pid })).sedute.find((x) => x.id === s.id);
    assert.strictEqual(letta.nota, 'corretta dopo l\'import');
  });
}

console.log(`\n${passati} test passati, ${fallimenti.length} falliti`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fallimenti.length ? 1 : 0);
