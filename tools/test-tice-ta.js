#!/usr/bin/env node
// Task analysis nel programma: passi, seduta per lo storico (node tools/test-tice-ta.js)
'use strict';
const assert = require('assert');
const P = require('../js/tice-programma.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

const p = { history: [] };
const att = P.nuovaAttivita(p, { nome: 'Autonomie' });
const t = P.aggiungiTarget(att, { testo: 'Lavarsi le mani', passi: ['Apre il rubinetto', 'Bagna le mani', '', 'Chiude il rubinetto'] }, true);
prova('i passi vuoti si scartano, ognuno ha un id', () => {
  assert.deepStrictEqual(P.passiDi(t).map((x) => x.testo), ['Apre il rubinetto', 'Bagna le mani', 'Chiude il rubinetto']);
  assert.ok(P.passiDi(t).every((x) => /^ps_/.test(x.id)));
});
prova('un target senza passi non è una task analysis', () => {
  assert.deepStrictEqual(P.passiDi(P.aggiungiTarget(att, 'Altro', false)), []);
});
prova('modificando i passi, quelli uguali tengono il loro id', () => {
  const vecchi = P.passiDi(t);
  const nuovi = P.nuoviPassi(['Bagna le mani', 'Prende il sapone', 'Apre il rubinetto'], vecchi);
  assert.strictEqual(nuovi[0].id, vecchi[1].id);
  assert.strictEqual(nuovi[2].id, vecchi[0].id);
  assert.ok(!vecchi.some((x) => x.id === nuovi[1].id));
});
prova('la seduta va nello storico come Task Analysis, con il dettaglio dei passi', () => {
  const [a, b, c] = P.passiDi(t).map((x) => x.id);
  const voce = { v: 4, p: 1, x: 1, sequenza: 'VVPVXV', esiti: { [a]: 'VV', [b]: 'PX', [c]: 'VV' }, giri: 2, sessionType: 'independent' };
  const s = P.seduta(att, t, voce, '2026-10-02T10:00:00Z');
  assert.strictEqual(s.mode, 'quaderno_task');
  assert.strictEqual(s.percentage, 67);
  assert.strictEqual(s.targetId, t.id);
  assert.deepStrictEqual(s.taskSteps.map((x) => [x.name, x.v, x.p, x.x, x.scored]), [
    ['Apre il rubinetto', 2, 0, 0, 2], ['Bagna le mani', 0, 1, 1, 2], ['Chiude il rubinetto', 2, 0, 0, 2]]);
  assert.deepStrictEqual(s.taskSteps[1].results, ['prompt', false]);
  p.history.push(s);
  assert.strictEqual(P.sedute(p, att, t).length, 1, 'la seduta appartiene al target');
});
console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
