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
prova('giornata: fasce dalle 8 alle 19, bambini in colonna, anche chi ha turni fuori elenco', () => {
  let s = T.impostaGiornata(T.vuota(), G, { bambini: ['a', 'b'] });
  s = T.impostaCella(s, G, 'c', '07:30', ['p1']);
  const g = T.giornata(s, G);
  assert.deepStrictEqual(g.bambini, ['a', 'b', 'c']);
  assert.strictEqual(g.fasce[0], '07:30');
  assert.strictEqual(g.fasce.length, 12);
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
console.log(`\n${passati} test passati, ${falliti.length} falliti`);
process.exit(falliti.length ? 1 : 0);
