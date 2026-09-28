#!/usr/bin/env node
/**
 * Test dei calcoli clinici (centro/js/modello.js).
 *
 *   node tools/test-modello.js [import-XXX.json]
 *
 * Con un file di import, confronta il criterio calcolato con le decisioni
 * "CRITERIO" scritte a mano sui fogli: e' la verifica che il calcolo segua la
 * pratica del centro, non solo la sua definizione.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const M = require('../centro/js/modello.js');

let passati = 0, falliti = 0;
function prova(nome, fn) {
  try { fn(); passati++; console.log('  ✓ ' + nome); }
  catch (e) { falliti++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

const PR = { id: 'pr_1', nome: 'TACT', criterio: { soglia: 90, sedute: 2 }, prove: 10, scala: 'conteggio', sto: [{ id: 'st_1', stato: 'attivo' }] };
const paz = { programmi: [PR], learnUnitStoriche: [] };
const sed = (data, v, p, x, extra) => Object.assign({ id: 'sd_' + data + v, data, fonte: 'app', voci: [{ programmaId: 'pr_1', stoId: 'st_1', v, p, x }] }, extra || {});

console.log('\nCalcoli');
prova('percentuale = corrette su tutte le prove', () => {
  assert.strictEqual(M.pctVoce({ v: 7, p: 2, x: 1 }, PR), 70);
});
prova('dati importati senza errate: le ricava dalle prove per seduta', () => {
  assert.deepStrictEqual(M.contiVoce({ v: 8, p: 0, x: null }, PR), { v: 8, p: 0, x: 2, tot: 10, percentuale: false });
});
prova('programma in percentuale: la % e\' il valore scritto', () => {
  assert.strictEqual(M.pctVoce({ v: 57, p: 0, x: 43 }, { scala: 'percentuale' }), 57);
});
prova('programma importato in % + seduta nuova a conteggio: 8 su 10 e\' l\'80%, non l\'8%', () => {
  const pr = { id: 'pr_p', scala: 'percentuale', criterio: { soglia: 90, sedute: 2 }, sto: [{ id: 'st_p', stato: 'attivo' }] };
  const pz = { programmi: [pr] };
  const vecchia = { id: 'sd_a', data: '2026-03-01', fonte: 'import-numbers', voci: [{ programmaId: 'pr_p', stoId: 'st_p', v: 93, p: 7, x: 0, scala: 'percentuale' }] };
  const legacy = { id: 'sd_l', data: '2026-03-02', fonte: 'import-numbers', voci: [{ programmaId: 'pr_p', stoId: 'st_p', v: 92, p: 8, x: 0 }] };
  const nuova = { id: 'sd_b', data: '2026-03-03', fonte: 'app', voci: [{ programmaId: 'pr_p', stoId: 'st_p', v: 8, p: 1, x: 1 }] };
  const serie = M.misure(pz, [vecchia, legacy, nuova], 'pr_p', 'st_p');
  assert.deepStrictEqual(serie.map((m) => m.pct), [93, 92, 80]);
  assert.strictEqual(M.riepilogoSeduta(pz, nuova).pct, 80);
  assert.strictEqual(M.learnUnit(pz, [vecchia, nuova]).find((g) => g.data === '2026-03-03').totali, 10);
});
prova('criterio: 2 sedute consecutive >= 90% in giorni diversi', () => {
  const s = [sed('2026-01-01', 9, 1, 0), sed('2026-01-02', 7, 3, 0), sed('2026-01-03', 9, 0, 1), sed('2026-01-05', 10, 0, 0)];
  const c = M.criterio(M.misure(paz, s, 'pr_1', 'st_1'), PR.criterio);
  assert.strictEqual(c.raggiunto, '2026-01-05');
  assert.strictEqual(c.repertorio, true);
});
prova('due misure nello stesso giorno contano come una seduta sola', () => {
  const s = [sed('2026-01-01', 9, 1, 0), Object.assign(sed('2026-01-01', 10, 0, 0), { id: 'sd_b' })];
  const c = M.criterio(M.misure(paz, s, 'pr_1', 'st_1'), PR.criterio);
  assert.strictEqual(c.raggiunto, null);
  assert.strictEqual(c.striscia, 1);
});
prova('le sedute eliminate non contano', () => {
  const s = [sed('2026-01-01', 10, 0, 0), sed('2026-01-02', 10, 0, 0, { eliminata: true })];
  assert.strictEqual(M.criterio(M.misure(paz, s, 'pr_1', 'st_1'), PR.criterio).raggiunto, null);
});
prova('learn unit: somma di tutte le voci del giorno', () => {
  const s = [sed('2026-02-01', 8, 1, 1), sed('2026-02-01', 5, 5, 0)];
  s[1].id = 'sd_x';
  const lu = M.learnUnit(paz, s);
  assert.strictEqual(lu.length, 1);
  assert.strictEqual(lu[0].corrette, 13);
  assert.strictEqual(lu[0].totali, 20);
});
prova('learn unit: lo storico importato vale solo nei giorni senza sedute dell\'app', () => {
  const p2 = { programmi: [PR], learnUnitStoriche: [{ data: '2026-02-01', corrette: 99, totali: 99 }, { data: '2026-01-15', corrette: 30, totali: 40, criteri: 1 }] };
  const lu = M.learnUnit(p2, [sed('2026-02-01', 8, 1, 1)]);
  assert.deepStrictEqual(lu.map((g) => [g.data, g.corrette, g.totali, g.fonte]), [['2026-01-15', 30, 40, 'storico'], ['2026-02-01', 8, 10, 'app']]);
});
prova('date: formato e distanze', () => {
  assert.strictEqual(M.formatoData('2026-06-18'), '18/06/26');
  assert.strictEqual(M.quando('2026-06-17', '2026-06-18'), 'ieri');
  assert.strictEqual(M.quando('2026-06-18', '2026-06-18'), 'oggi');
});

const file = process.argv[2];
if (file) {
  console.log('\nConfronto con le decisioni scritte a mano (' + require('path').basename(file) + ')');
  const pk = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = pk.paziente;
  // Le sedute importate con x mancante: stessa regola dell'app dopo la conferma
  const sedute = pk.sedute;
  let uguali = 0, diverse = [], soloFoglio = [], soloCalcolo = [];
  p.programmi.forEach((pr) => {
    pr.sto.forEach((sto) => {
      const serie = M.misure(p, sedute, pr.id, sto.id);
      const scritto = serie.find((m) => m.decisioni.some((d) => /CRITERIO/i.test(d)));
      const calcolato = M.criterio(serie, pr.criterio).raggiunto;
      const nome = `${pr.nome} / ${sto.testo.slice(0, 40)}`;
      if (scritto && calcolato) {
        if (scritto.data === calcolato) uguali++;
        else diverse.push(`${nome}: foglio ${scritto.data}, calcolo ${calcolato}`);
      } else if (scritto) soloFoglio.push(`${nome}: foglio ${scritto.data}`);
      else if (calcolato) soloCalcolo.push(`${nome}: calcolo ${calcolato}`);
    });
  });
  const tot = uguali + diverse.length + soloFoglio.length;
  console.log(`  STO con CRITERIO scritto a mano: ${tot}; stessa data calcolata: ${uguali}`);
  if (diverse.length) console.log('  Data diversa:\n    ' + diverse.join('\n    '));
  if (soloFoglio.length) console.log('  Scritto sul foglio ma non raggiunto dal calcolo:\n    ' + soloFoglio.join('\n    '));
  if (soloCalcolo.length) console.log('  Raggiunto secondo il calcolo ma non scritto sul foglio:\n    ' + soloCalcolo.join('\n    '));
  prova('il calcolo riproduce la maggior parte delle decisioni scritte a mano', () => {
    assert.ok(tot > 0, 'nessuna decisione trovata');
    assert.ok(uguali / tot >= 0.7, `solo ${uguali} su ${tot}`);
  });
  prova('learn unit calcolate sull\'intero storico', () => {
    const lu = M.learnUnit(p, sedute);
    assert.ok(lu.length > 100);
  });
}

console.log(`\n${passati} test passati, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
