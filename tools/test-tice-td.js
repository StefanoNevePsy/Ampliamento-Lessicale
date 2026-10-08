#!/usr/bin/env node
// Time delay nel programma: secondi, cambi annotati, decisioni (node tools/test-tice-td.js)
'use strict';
const assert = require('assert');
const P = require('../js/tice-programma.js');
let ok = 0, ko = 0;
const prova = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { ko++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const voce = (x) => Object.assign({ v: 3, p: 1, x: 0, sequenza: 'VVVP' }, x);

prova('0" è un time delay valido, non si perde', () => {
  const att = P.nuovaAttivita({}, { nome: 'Tact', sessionType: 'timedelay', tdSeconds: 0, target: 'Animali' });
  assert.strictEqual(att.tdSeconds, 0);
  assert.strictEqual(P.seduta(att, att.target[0], voce(), '2026-10-08T10:00:00Z').timeDelaySeconds, 0);
});
prova('senza secondi indicati non se ne inventano', () => {
  const att = P.nuovaAttivita({}, { nome: 'Tact', sessionType: 'timedelay', target: 'Animali' });
  const s = P.seduta(att, att.target[0], voce(), '2026-10-08T10:00:00Z');
  assert.strictEqual(s.sessionType, 'timedelay');
  assert.ok(!('timeDelaySeconds' in s));
});
prova('i secondi della seduta prevalgono su target e attività', () => {
  const att = P.nuovaAttivita({}, { nome: 'Tact', sessionType: 'timedelay', tdSeconds: 1, target: 'Animali' });
  att.target[0].tdSeconds = 2;
  assert.strictEqual(P.tdDi(att), 2);
  assert.strictEqual(P.seduta(att, att.target[0], voce({ tdSeconds: 3 }), '2026-10-08').timeDelaySeconds, 3);
  assert.strictEqual(P.seduta(att, att.target[0], voce(), '2026-10-08').timeDelaySeconds, 2);
});
prova('un cambio di secondi resta segnato con data e chi; il target in corso segue', () => {
  const att = P.nuovaAttivita({}, { nome: 'Tact', sessionType: 'timedelay', tdSeconds: 1, target: 'Animali' });
  att.target[0].tdSeconds = 1;
  assert.strictEqual(P.impostaTD(att, 2, { chi: 'Sara', il: '2026-10-08' }), true);
  assert.strictEqual(att.target[0].tdSeconds, 2);
  assert.deepStrictEqual(att.tdCambi, [{ il: '2026-10-08', da: 1, a: 2, chi: 'Sara', targetId: att.target[0].id }]);
  assert.strictEqual(P.impostaTD(att, 2), false);
  assert.strictEqual(att.tdCambi.length, 1);
});
prova('le decisioni del quaderno dicono i secondi', () => {
  assert.strictEqual(P.tdDaDecisione('Passa a 1" T/D'), 1);
  assert.strictEqual(P.tdDaDecisione('passa a 0” TD'), 0);
  assert.strictEqual(P.tdDaDecisione("aumenta TD a 3''"), 3);
  assert.strictEqual(P.tdDaDecisione('Probe'), null);
  assert.strictEqual(P.tdDaDecisione(''), null);
});

console.log(`\n${ok} riuscite, ${ko} fallite`);
process.exit(ko ? 1 : 0);
