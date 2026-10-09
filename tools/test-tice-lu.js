#!/usr/bin/env node
// Learn unit contate: le prove aspettano di completare la LU (node tools/test-tice-lu.js)
'use strict';
const assert = require('assert');
const P = require('../js/tice-programma.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

prova('3 prove il primo giorno: nessuna LU, restano in attesa', () => {
  assert.deepStrictEqual(P.dividiLU('', 'VXV', 10), { blocchi: [], resto: 'VXV' });
});
prova('3 + 11: una LU da 10 il secondo giorno, 4 restano in attesa', () => {
  const d = P.dividiLU('VXV', 'VVVVVVVXVVV', 10);
  assert.deepStrictEqual(d.blocchi, ['VXVVVVVVVV']);
  assert.strictEqual(d.resto, 'XVVV');
});
prova('più LU nello stesso giorno', () => {
  const d = P.dividiLU('', 'V'.repeat(23), 10);
  assert.strictEqual(d.blocchi.length, 2);
  assert.strictEqual(d.resto.length, 3);
});
prova('conteggio delle risposte di un blocco', () => {
  assert.deepStrictEqual(P.contaRisposte('VVPXV'), { v: 3, p: 1, x: 1 });
});
prova('aspettano le attività con le prove per LU, con o senza stimoli', () => {
  const pz = {};
  const lu = P.nuovaAttivita(pz, { nome: 'Tact', prove: 10, target: 'Animali' });
  const senzaProve = P.nuovaAttivita(pz, { nome: 'Mand', target: 'Cibo' });
  const senzaTarget = P.nuovaAttivita(pz, { nome: 'Intraverbal', prove: 10 });
  const perc = P.nuovaAttivita(pz, { nome: 'Point', prove: 10, target: 'Colori' }); perc.scala = 'percentuale';
  const crono = P.nuovaAttivita(pz, { nome: 'Fluency', prove: 10, target: 'x', cronometro: true });
  assert.strictEqual(P.conAttesa(lu, lu.target[0]), true);
  assert.strictEqual(P.conAttesa(senzaProve, senzaProve.target[0]), false);
  // le prove per LU sono il «target» del quaderno: valgono anche senza stimoli specifici
  assert.strictEqual(P.conAttesa(senzaTarget, null), true);
  assert.strictEqual(P.inPercentuale(senzaTarget), false);
  const libera = P.nuovaAttivita(pz, { nome: 'Gioco libero' });
  assert.strictEqual(P.inPercentuale(libera), true);
  assert.strictEqual(P.conAttesa(libera, null), false);
  assert.strictEqual(P.conAttesa(perc, perc.target[0]), false);
  assert.strictEqual(P.conAttesa(crono, crono.target[0]), false);
  const ta = P.nuovaAttivita(pz, { nome: 'Autonomie', prove: 10 });
  const t = P.aggiungiTarget(ta, { testo: 'Mani', passi: ['Apre', 'Chiude'] }, true);
  assert.strictEqual(P.conAttesa(ta, t), false);
});
prova('le prove in attesa sono per target', () => {
  const att = P.nuovaAttivita({}, { nome: 'Tact', prove: 10, target: 'Animali' });
  att.inAttesa = { [att.target[0].id]: { seq: 'VVX', dal: '2026-10-07', note: [] } };
  assert.strictEqual(P.inAttesaDi(att, att.target[0]).seq, 'VVX');
  assert.strictEqual(P.inAttesaDi(att, null), null);
});

console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
