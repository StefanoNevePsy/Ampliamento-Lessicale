// Test della cifratura (js/tice-cifra.js) e della fusione tra dispositivi (js/tice-unisci.js).
//   node tools/test-tice-sync.js
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const C = require(path.join(__dirname, '..', 'js', 'tice-cifra.js'));
const U = require(path.join(__dirname, '..', 'js', 'tice-unisci.js'));

let ok = 0, ko = 0;
async function prova(nome, fn) {
  try { await fn(); ok++; console.log('  ✓', nome); } catch (e) { ko++; console.log('  ✗', nome, '\n     ', e.message); }
}
const copia = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  console.log('Chiave del centro');
  const frase = C.generaFrase();
  await prova('frase di 25 caratteri in 5 gruppi, senza lettere ambigue', () => {
    assert.match(frase, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    assert.notStrictEqual(C.generaFrase(), frase);
  });
  await prova('scritta a mano in minuscolo, con spazi e O al posto di 0: è la stessa', () => {
    const scritta = frase.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    assert.strictEqual(C.normalizzaFrase(scritta), frase);
    assert.strictEqual(C.normalizzaFrase('troppo corta'), null);
  });
  const { cfg, chiave } = await C.nuovaConfigurazione(frase);
  await prova('configurazione: sale, 600 000 iterazioni, verifica cifrata', () => {
    assert.strictEqual(cfg.kdf.iterazioni, 600000);
    assert.strictEqual(C.daB64(cfg.kdf.sale).length, 16);
    assert.strictEqual(cfg.verifica.alg, 'A256GCM');
    assert.ok(!JSON.stringify(cfg).includes(frase.replace(/-/g, '')));
  });
  await prova('con la frase giusta si apre, con un\'altra no', async () => {
    await C.apriConFrase(frase.toLowerCase(), cfg);
    await assert.rejects(C.apriConFrase(C.generaFrase(), cfg), /non è la chiave del centro/);
  });

  console.log('Buste');
  const paziente = { id: '1727', name: 'Mario Rossi', history: Array.from({ length: 400 }, (_, i) => ({ id: 'sx_' + i, setName: 'TACT · Animali', correct: 8, total: 10, date: '2026-09-01T10:00:00Z' })) };
  const b = await C.cifra(chiave, cfg.kid, paziente, 'tice:paziente:1727');
  await prova('cifrata e compressa: nessun dato leggibile', () => {
    assert.strictEqual(b.comp, 'gzip');
    assert.ok(!Buffer.from(b.dati, 'base64').toString('latin1').includes('Mario'));
    assert.ok(b.dati.length < JSON.stringify(paziente).length / 4, 'compressione ' + b.dati.length);
  });
  await prova('si riapre identica', async () => {
    assert.deepStrictEqual(await C.decifra(chiave, b, 'tice:paziente:1727'), paziente);
  });
  await prova('spostata su un altro paziente non si apre', async () => {
    await assert.rejects(C.decifra(chiave, b, 'tice:paziente:9999'));
  });
  await prova('un bit cambiato nel file: non si apre (niente dati alterati in silenzio)', async () => {
    const raw = C.daB64(b.dati); raw[10] ^= 1;
    await assert.rejects(C.decifra(chiave, Object.assign({}, b, { dati: C.aB64(raw) }), 'tice:paziente:1727'));
  });
  await prova('formato compatibile con altri strumenti: AES-256-GCM standard + gzip', async () => {
    // Stesso calcolo fatto con il modulo crypto di Node, come fa tools/decifra_tice.py
    const k = crypto.pbkdf2Sync(C.normalizzaFrase(frase), Buffer.from(cfg.kdf.sale, 'base64'), cfg.kdf.iterazioni, 32, 'sha256');
    const raw = Buffer.from(b.dati, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(b.iv, 'base64'));
    d.setAAD(Buffer.from('tice:paziente:1727'));
    d.setAuthTag(raw.subarray(raw.length - 16));
    const chiaro = require('zlib').gunzipSync(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]));
    assert.strictEqual(JSON.parse(chiaro).name, 'Mario Rossi');
  });

  console.log('Fusione tra due dispositivi');
  const base = {
    id: '1727', name: 'Mario', category: 'Aula 1',
    history: [{ id: 'a', correct: 5, total: 10 }, { id: 'b', correct: 6, total: 10 }],
    dailyNotes: { '2026-09-01': 'nota' },
    programma: { attivita: [{ id: 'at1', nome: 'TACT', stato: 'attivo', target: [{ id: 't1', testo: 'Animali', stato: 'attivo' }, { id: 't2', testo: 'Frutta', stato: 'pianificato' }] }] }
  };
  await prova('sedute registrate su due telefoni: ci sono tutte', () => {
    const l = copia(base); l.history.push({ id: 'c', correct: 9, total: 10 });
    const r = copia(base); r.history.push({ id: 'd', correct: 7, total: 10 });
    assert.deepStrictEqual(U.unisci(base, l, r).history.map((x) => x.id), ['a', 'b', 'c', 'd']);
  });
  await prova('una seduta cancellata da una parte resta cancellata', () => {
    const l = copia(base); l.history = l.history.filter((x) => x.id !== 'a');
    const r = copia(base); r.history.push({ id: 'd', correct: 7, total: 10 });
    assert.deepStrictEqual(U.unisci(base, l, r).history.map((x) => x.id), ['b', 'd']);
  });
  await prova('...ma se l\'altra parte l\'ha corretta, la correzione non si perde', () => {
    const l = copia(base); l.history = l.history.filter((x) => x.id !== 'a');
    const r = copia(base); r.history[0].correct = 6;
    assert.deepStrictEqual(U.unisci(base, l, r).history.map((x) => x.id), ['b', 'a']);
  });
  await prova('target chiuso su un dispositivo, nuovo target sull\'altro: entrambi', () => {
    const l = copia(base); l.programma.attivita[0].target[0].stato = 'criterio'; l.programma.attivita[0].target[1].stato = 'attivo';
    const r = copia(base); r.programma.attivita[0].target.push({ id: 't3', testo: 'Veicoli', stato: 'pianificato' });
    const t = U.unisci(base, l, r).programma.attivita[0].target;
    assert.deepStrictEqual(t.map((x) => [x.id, x.stato]), [['t1', 'criterio'], ['t2', 'attivo'], ['t3', 'pianificato']]);
  });
  await prova('note di giorni diversi scritte su due dispositivi: entrambe', () => {
    const l = copia(base); l.dailyNotes['2026-09-02'] = 'qui';
    const r = copia(base); r.dailyNotes['2026-09-03'] = 'là';
    assert.deepStrictEqual(Object.keys(U.unisci(base, l, r).dailyNotes).sort(), ['2026-09-01', '2026-09-02', '2026-09-03']);
  });
  await prova('stesso campo cambiato da entrambi: vince chi salva adesso', () => {
    const l = copia(base); l.category = 'Aula 2';
    const r = copia(base); r.category = 'Aula 3'; r.name = 'Mario R.';
    const u = U.unisci(base, l, r);
    assert.strictEqual(u.category, 'Aula 2');
    assert.strictEqual(u.name, 'Mario R.');
  });
  await prova('un campo tolto da una parte resta tolto; uno nuovo vuoto non si perde', () => {
    const l = copia(base); delete l.category;
    const r = copia(base); r.criterionOverrides = {};
    const u = U.unisci(base, l, r);
    assert.ok(!('category' in u));
    assert.deepStrictEqual(u.criterionOverrides, {});
  });
  await prova('prima sincronizzazione senza base: nessuna seduta persa', () => {
    const l = copia(base); l.history.push({ id: 'c' });
    const u = U.unisci(null, l, copia(base));
    assert.deepStrictEqual(u.history.map((x) => x.id), ['a', 'b', 'c']);
  });
  await prova('sedute vecchie senza id: id stabile, uguale su due dispositivi', () => {
    const p1 = { history: [{ date: 'x', correct: 1 }, { date: 'x', correct: 1 }, { date: 'y' }] };
    const p2 = copia(p1);
    assert.strictEqual(U.assegnaId(p1), 3);
    U.assegnaId(p2);
    assert.deepStrictEqual(p1.history.map((s) => s.id), p2.history.map((s) => s.id));
    assert.strictEqual(new Set(p1.history.map((s) => s.id)).size, 3);
    assert.strictEqual(U.assegnaId(p1), 0);
  });

  console.log(`\n${ok} riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
})();
