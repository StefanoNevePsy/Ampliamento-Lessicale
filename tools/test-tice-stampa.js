// Test delle griglie da stampare (js/tice-stampa.js)
const path = require('path');
const assert = require('assert');
const J = (f) => require(path.join(__dirname, '..', 'js', f));
const P = J('tice-programma.js'), M = J('tice-modalita.js'), S = J('tice-stampa.js');

let passati = 0; const falliti = [];
function prova(nome, fn) { try { fn(); passati++; console.log('  ✓ ' + nome); } catch (e) { falliti.push(nome); console.log('  ✗ ' + nome + '\n      ' + e.message); } }

const pz = { id: 'p1', name: 'Prova <b>', history: [], programma: { attivita: [] } };
const tact = P.nuovaAttivita(pz, { nome: 'TACT', modalita: 'tact', sessionType: 'timedelay', tdSeconds: 1, prove: 10, target: 'Animali' });
const point = P.nuovaAttivita(pz, { nome: 'POINT', modalita: 'indicare', prove: 12, target: 'Verbi' });
const perc = P.nuovaAttivita(pz, { nome: 'Correlazioni', target: 'Cosa non c\'entra' }); perc.scala = 'percentuale';
const ta = P.nuovaAttivita(pz, { nome: 'Rubamazzo', modalita: 'gioco' });
P.aggiungiTarget(ta, { testo: 'Partita', passi: ['Dà le carte', 'Prende le carte', 'Aspetta il turno'] }, true);
const sosp = P.nuovaAttivita(pz, { nome: 'Sospesa', target: 'x' }); sosp.stato = 'sospeso';
const dip = { P, M, diz: {} };
const conta = (html, re) => (html.match(re) || []).length;

prova('le attività per categoria, con la task analysis riconosciuta', () => {
  const v = S.voci(pz, dip);
  assert.deepStrictEqual(v.filter((x) => x.ta).map((x) => x.att.nome), ['Rubamazzo']);
  assert.ok(v.findIndex((x) => x.att.nome === 'TACT') < v.findIndex((x) => x.att.nome === 'POINT'), 'Speaker prima di Listener');
  assert.strictEqual(v.find((x) => x.att.nome === 'Sospesa').attiva, false);
});
prova('le prove previste sono marcate: 10 per TACT, 12 per POINT su due righe', () => {
  const t = S.html(pz, { ids: [tact.id], ta: false }, dip);
  assert.strictEqual(conta(t, /class="st-c on"/g), 10);
  const p2 = S.html(pz, { ids: [point.id], ta: false }, dip);
  assert.strictEqual(conta(p2, /class="st-c on"/g), 12);
  assert.strictEqual(conta(p2, /↳ segue/g), 1, 'una riga che segue');
});
prova('con il dato in percentuale niente caselle marcate', () => {
  const t = S.html(pz, { ids: [perc.id] }, dip);
  assert.strictEqual(conta(t, /class="st-c on"/g), 0);
  assert.ok(t.includes('%'));
});
prova('task analysis: una riga per passo e le colonne scelte', () => {
  const t = S.html(pz, { ids: [ta.id], colonneTA: 20 }, dip);
  assert.ok(t.includes('st-ta') && t.includes('Aspetta il turno'));
  assert.strictEqual(conta(t, /<th class="st-n">/g), 20);
});
prova('i testi sono protetti (niente HTML dai nomi)', () => {
  const t = S.html(pz, {}, dip);
  assert.ok(t.includes('Prova &lt;b&gt;') && !t.includes('Prova <b>'));
});
prova('time delay e criterio scritti', () => {
  const t = S.html(pz, { ids: [tact.id] }, dip);
  assert.ok(t.includes('T/D 1″') && t.includes('90% × 2 gg · 10 prove'));
});

console.log(`\n${passati} test passati, ${falliti.length} falliti`);
process.exit(falliti.length ? 1 : 0);
