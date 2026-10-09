// Test dei turni (js/tice-turni.js)
const path = require('path');
const assert = require('assert');
const T = require(path.join(__dirname, '..', 'js', 'tice-turni.js'));
let passati = 0; const falliti = [];
function prova(nome, fn) { try { fn(); passati++; console.log('  ✓ ' + nome); } catch (e) { falliti.push(nome); console.log('  ✗ ' + nome + '\n      ' + e.message); } }
const G = '2026-10-06';

prova('settimana dal lunedì e titolo', () => {
  assert.strictEqual(T.lunedi(G), '2026-10-05');
  assert.strictEqual(T.titoloSettimana('2026-09-28', true), '28 settembre – 4 ottobre 2026');
});
prova('giornata: di serie il pomeriggio (14:10–18:10), bambini in colonna, anche chi ha turni fuori elenco', () => {
  let s = T.impostaGiornata(T.vuota(), G, { bambini: ['a', 'b'] });
  s = T.impostaCella(s, G, 'c', '07:30', ['p1']);
  const g = T.giornata(s, G);
  assert.deepStrictEqual(g.bambini, ['c', 'a', 'b'], 'in ordine di arrivo: chi comincia prima (c alle 7:30) va per primo');
  assert.strictEqual(g.fasce[0], '07:30');
  assert.deepStrictEqual(g.fasce.slice(1), ['14:10', '15:10', '16:10', '17:10']);
});
prova('il foglio si adatta alle fasce riempite; l\'ultima si ferma alla chiusura', () => {
  let s = T.impostaGiornata(T.vuota(), G, { bambini: ['a', 'b'], da: '14:10', a: '18:00' });
  s = T.impostaCella(s, G, 'a', '15:10', ['p1']);
  s = T.impostaCella(s, G, 'b', '16:10', ['p2']);
  const g = T.giornata(s, G);
  assert.deepStrictEqual(g.usate, ['15:10', '16:10']);
  assert.strictEqual(T.fineFascia(g, '17:10'), '18:00');
  const html = T.stampaGiornata(s, G, { nomeBambino: () => 'x', persone: [] });
  assert.strictEqual((html.match(/class="st-ora"/g) || []).length, 2, 'stampate solo le fasce riempite');
  assert.ok(/height:30mm/.test(html), 'righe più alte per riempire il foglio');
  assert.strictEqual(T.leggiOra('14.10'), '14:10');
  assert.strictEqual(T.leggiOra('25'), null);
});
prova('celle: coppie, svuota, pennello che aggiunge e toglie', () => {
  let s = T.impostaCella(T.vuota(), G, 'a', '09:00', ['p1', 'p2']);
  assert.deepStrictEqual(T.giornata(s, G).celle['a|09:00'].persone, ['p1', 'p2']);
  s = T.alternaPersona(s, G, 'a', '09:00', 'p2');
  assert.deepStrictEqual(T.giornata(s, G).celle['a|09:00'].persone, ['p1']);
  s = T.impostaCella(s, G, 'a', '09:00', []);
  assert.strictEqual(s.voci.length, 0);
});
prova('sovrapposizioni: stessa persona su due bambini, bambino con due turni', () => {
  let s = T.impostaCella(T.vuota(), G, 'a', '09:00', ['p1']);
  s = T.impostaCella(s, G, 'b', '09:00', ['p1']);
  s = T.impostaCella(s, G, 'c', '10:00', ['p1']);
  const c = T.conflitti(s.voci);
  assert.strictEqual(Object.keys(c).length, 2, 'solo le due delle 9');
  assert.deepStrictEqual(T.occupati(s, G, '09:00', 'a'), { p1: 'b' });
});
prova('copia e ripeti una giornata: sostituisce la destinazione, nuovi id', () => {
  let s = T.impostaGiornata(T.vuota(), G, { bambini: ['a'], fascia: 30 });
  s = T.impostaCella(s, G, 'a', '09:00', ['p1']);
  let d = T.impostaCella(T.vuota(), '2026-10-13', 'z', '11:00', ['p9']);
  d = T.copiaGiornata(s, G, d, '2026-10-13');
  const g = T.giornata(d, '2026-10-13');
  assert.deepStrictEqual(g.bambini, ['a']);
  assert.strictEqual(g.fascia, 30);
  assert.strictEqual(g.voci.length, 1);
  assert.notStrictEqual(g.voci[0].id, s.voci[0].id);
});
prova('stampa: bambini in colonna, chi in cella, elenco per persona, testi protetti', () => {
  let s = T.impostaGiornata(T.vuota(), G, { bambini: ['a', 'b'] });
  s = T.impostaCella(s, G, 'a', '09:00', ['p1', 'p2'], { nota: 'piscina' });
  const html = T.stampaGiornata(s, G, { nomeBambino: (x) => (x === 'a' ? 'Luca <b>' : 'Sara'), persone: [{ id: 'p1', nome: 'Elisa', ruolo: 'terapeuta' }, { id: 'p2', nome: 'Greta', ruolo: 'tirocinante' }], perPersona: true });
  assert.ok(html.includes('Luca &lt;b&gt;') && html.includes('Elisa') && html.includes('piscina') && html.includes('Per persona'));
  const vuota = T.stampaGiornata(s, G, { nomeBambino: () => 'x', persone: [], vuota: true });
  assert.ok(!vuota.includes('Elisa'));
});
prova('settimana tipo: un bambino lun e mer, la giornata si riempie da sola', () => {
  let m = T.impostaModello(T.modelloVuoto(), 'a', 1, { da: '14:10', a: '16:10', persone: ['p1'] });
  m = T.impostaModello(m, 'a', 3, { da: '15:10', a: '17:10', persone: [] });
  m = T.impostaModello(m, 'b', 2, { da: '14:10', a: '15:10', persone: ['p2'] });
  const lun = T.giornata(T.vuota(), '2026-10-05', m), mar = T.giornata(T.vuota(), G, m), mer = T.giornata(T.vuota(), '2026-10-07', m);
  assert.ok(lun.virtuale);
  assert.deepStrictEqual(lun.bambini, ['a']);
  assert.deepStrictEqual(lun.voci.map((v) => v.ora), ['14:10', '15:10']);
  assert.deepStrictEqual(mar.bambini, ['b']);
  assert.deepStrictEqual([mer.bambini, mer.voci.length], [['a'], 0], 'il mercoledì viene ma senza persone fisse');
  assert.ok(T.presente(mer, 'a', '15:10') && !T.presente(mer, 'a', '14:10'));
  assert.deepStrictEqual(mer.usate, ['15:10', '16:10'], 'il foglio si adatta anche alle presenze');
});
prova('cambio dell\'ultimo minuto: la giornata diventa propria, le altre seguono il modello', () => {
  const m = T.impostaModello(T.modelloVuoto(), 'a', 1, { da: '14:10', a: '16:10', persone: ['p1'] });
  let s = T.materializza(T.vuota(), '2026-10-05', m);
  s = T.impostaCella(s, '2026-10-05', 'a', '14:10', ['p3']);
  const lun = T.giornata(s, '2026-10-05', m);
  assert.ok(!lun.virtuale && lun.propria);
  assert.deepStrictEqual(lun.celle['a|14:10'].persone, ['p3']);
  assert.deepStrictEqual(lun.celle['a|15:10'].persone, ['p1'], 'il resto copiato dal modello');
  const m2 = T.impostaModello(JSON.parse(JSON.stringify(m)), 'a', 1, { da: '14:10', a: '15:10', persone: ['p9'] });
  assert.strictEqual(T.giornata(s, '2026-10-05', m2).celle['a|14:10'].persone[0], 'p3', 'il modello cambiato non tocca la giornata propria');
  assert.strictEqual(T.giornata(T.vuota(), '2026-10-12', m2).celle['a|14:10'].persone[0], 'p9', 'ma vale per le prossime');
  s = T.ripristina(s, '2026-10-05');
  assert.ok(T.giornata(s, '2026-10-05', m2).virtuale, 'ripristinata');
});
prova('occupati e stampa tengono conto della settimana tipo', () => {
  let m = T.impostaModello(T.modelloVuoto(), 'a', 1, { da: '14:10', a: '15:10', persone: ['p1'] });
  m = T.impostaModello(m, 'b', 1, { da: '15:10', a: '16:10', persone: [] });
  assert.deepStrictEqual(T.occupati(T.vuota(), '2026-10-05', '14:10', 'b', m), { p1: 'a' });
  const html = T.stampaGiornata(T.vuota(), '2026-10-05', { nomeBambino: (x) => x, persone: [{ id: 'p1', nome: 'Elisa' }], modello: m });
  assert.ok(html.includes('Elisa') && html.includes('st-fuori'));
});

prova('inizio libero (14:20, ore da 50): il bambino c\'è nelle fasce di serie che tocca', () => {
  let m = T.modelloVuoto();
  const gL = T.lunedi(G);
  m = T.impostaModello(m, 'x', 1, { da: '14:20', a: '16:00', persone: ['p1'] });
  const gi = T.giornata(T.vuota(), gL, m);
  assert.ok(gi.bambini.includes('x'));
  assert.ok(T.presente(gi, 'x', '14:10') && T.presente(gi, 'x', '15:10'), 'nelle fasce 14:10 e 15:10');
  assert.ok(!T.presente(gi, 'x', '16:10'), 'non dalle 16:10');
  assert.deepStrictEqual(gi.voci.filter((v) => v.pid === 'x').map((v) => v.ora), ['14:10', '15:10']);
});
prova('orario preciso nelle fasce toccate a metà', () => {
  let m = T.modelloVuoto();
  const gL = T.lunedi(G);
  m = T.impostaModello(m, 'x', 1, { da: '14:20', a: '16:50' });
  const gi = T.giornata(T.vuota(), gL, m);
  assert.strictEqual(T.orarioPreciso(gi, 'x', '14:10'), 'dalle 14:20');
  assert.strictEqual(T.orarioPreciso(gi, 'x', '15:10'), '');
  assert.strictEqual(T.orarioPreciso(gi, 'x', '16:10'), 'fino alle 16:50');
});
console.log(`\n${passati} test passati, ${falliti.length} falliti`);
process.exit(falliti.length ? 1 : 0);
