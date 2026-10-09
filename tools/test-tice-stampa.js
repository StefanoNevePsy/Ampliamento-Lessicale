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
prova('spazio: solo le previste, righe in più, LU chieste per attività', () => {
  const sole = S.html(pz, { ids: [tact.id], spazio: 'previste', mantenimento: false }, dip);
  assert.strictEqual(conta(sole, /<td class="st-c/g), 10);
  const piu = S.html(pz, { ids: [tact.id], spazio: 'piu2', mantenimento: false }, dip);
  assert.strictEqual(conta(piu, /<td class="st-c/g), 30);
  assert.ok(piu.includes('previste 10'), 'il target resta scritto');
  const cinquanta = S.html(pz, { ids: [perc.id], luPer: { [perc.id]: 50 } }, dip);
  assert.strictEqual(conta(cinquanta, /<td class="st-c/g), 50);
});
prova('riempi il foglio: più righe, prima ai dati in percentuale, senza superare una pagina', () => {
  const v = S.voci(pz, dip).filter((x) => !x.ta && x.attiva);
  S.pianificaRighe(v, { colonne: 10, spazio: 'riempi', mantenimento: true, prossimi: true });
  const per = (n) => v.find((x) => x.att.nome === n).righe;
  assert.ok(per('TACT') >= 2 && per('POINT') >= 3, 'righe oltre le previste');
  assert.ok(per('Correlazioni') >= per('TACT'), 'la percentuale ne ha almeno quante le altre');
  assert.ok(per('Correlazioni') <= 13, 'senza esagerare');
});

prova('più prese dati: la riga del target e sotto ogni presa con le sue caselle e il suo totale', () => {
  const pz2 = { id: 'pz_nest', name: 'Prova', history: [] };
  const c = P.nuovaAttivita(pz2, { nome: 'Categorizzazione', prove: 10, target: 'Ambienti mix' });
  c.misure = [{ id: 'm1', nome: 'Categorizza' }, { id: 'm2', nome: 'Tact mix' }];
  const t = S.html(pz2, { spazio: 'previste', ta: false }, dip);
  assert.ok(t.includes('– Categorizza') && t.includes('– Tact mix'));
  assert.strictEqual((t.match(/class="st-sub/g) || []).length, 2);
  assert.strictEqual((t.match(/st-tot/g) || []).length, 2, 'un totale per presa');
});
prova('sottoattività con le sue prove: caselle e totale suoi', () => {
  const pz3 = { id: 'pz_nest3', name: 'Prova', history: [] };
  const c = P.nuovaAttivita(pz3, { nome: 'Categorizzazione', prove: 10, target: 'Ambienti mix' });
  c.misure = [{ id: 'm1', nome: 'Categorizza' }, { id: 'm2', nome: 'Tact mix', prove: 20 }];
  const t = S.html(pz3, { spazio: 'previste', colonne: 10, ta: false }, dip);
  assert.ok(t.includes('/ 10') && t.includes('/ 20'));
  assert.strictEqual(conta(t, /class="st-c on"/g), 30, '10 + 20 caselle previste');
});

console.log(`\n${passati} test passati, ${falliti.length} falliti`);
process.exit(falliti.length ? 1 : 0);
