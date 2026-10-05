// Test del riconoscimento delle modalità dei quaderni (js/tice-modalita.js)
const path = require('path');
const assert = require('assert');
const M = require(path.join(__dirname, '..', 'js', 'tice-modalita.js'));

let passati = 0; const falliti = [];
function prova(nome, fn) {
  try { fn(); passati++; console.log('  ✓ ' + nome); } catch (e) { falliti.push(nome); console.log('  ✗ ' + nome + '\n      ' + e.message); }
}
const r = (nome, extra, diz) => M.riconosci(Object.assign({ nome }, extra || {}), diz || {});

prova('i nomi di serie: TACT, POINT, CATEGORIZZAZIONE, ATTESA', () => {
  assert.strictEqual(r('TACT').modalita, 'tact');
  assert.strictEqual(r('POINT').modalita, 'indicare');
  assert.strictEqual(r('CATEGORIZZAZIONE').categoria, 'cognitivi');
  assert.strictEqual(r('ATTESA').categoria, 'comportamento');
  assert.ok(r('TACT').certo);
});
prova('le varianti restano come dettaglio', () => {
  const x = r('INTENSIVE TACT');
  assert.deepStrictEqual([x.modalita, x.variante, x.certo], ['tact', 'Intensive', true]);
  assert.strictEqual(r('MANDI SI/NO').variante, 'Sì/no');
  assert.strictEqual(r('PREGRAFISMI- COPIA DA MODELLO').variante, 'Copia da modello');
  assert.strictEqual(r('MAND VERBALE CON IMG').variante, 'Verbale con immagini');
});
prova('"X to Y": vale la modalità d\'arrivo', () => {
  assert.strictEqual(r('ECHO TO TACT').modalita, 'tact');
  assert.strictEqual(r('Point to MAND').modalita, 'mand');
  assert.strictEqual(r('Point to INTRAVERBAL').modalita, 'intraverbal');
});
prova('FD è ambiguo: field di solito, consegne se i target lo dicono, mai certo', () => {
  const f = r('FD', { area: 'LISTENER', target: [{ testo: 'Full echo + point F 0F 4' }] });
  assert.deepStrictEqual([f.modalita, f.ambiguo, f.certo], ['indicare', true, false]);
  const c = r('FD', { target: [{ testo: 'Prendi la palla' }, { testo: 'Siediti' }] });
  assert.strictEqual(c.modalita, 'consegne');
  assert.deepStrictEqual(M.aggiunte([{ chiave: 'fd', modalita: 'indicare', variante: 'field' }], {}).sinonimi, {}, 'FD non entra nel dizionario');
});
prova('sconosciuto: modalità nuova nella categoria del foglio', () => {
  const x = r('LETTURA GLOBALE DI PAROLE', { area: 'REP. GENERALI' });
  assert.strictEqual(x.modalita, 'letto');
  const y = r('GIOCO DEL SEMAFORO', { area: 'AUTONOMIE' });
  assert.ok(y.modalita === 'gioco' || y.nuova, 'riconosciuto o nuovo');
  const z = r('XYZ ABC', { area: 'Motricità' });
  assert.deepStrictEqual([z.modalita, z.nuova.categoria, z.certo], [null, 'motricita', false]);
});
prova('il dizionario del centro vince su quello di serie', () => {
  const diz = { modalita: [{ id: 'c-lego', nome: 'Costruzioni Lego', categoria: 'imitazione' }], sinonimi: { 'emulazione con lego': { modalita: 'c-lego' } } };
  const x = r('EMULAZIONE CON LEGO', {}, diz);
  assert.deepStrictEqual([x.modalita, x.certo, x.categoria], ['c-lego', true, 'imitazione']);
  assert.strictEqual(M.etichetta({ modalita: 'c-lego', variante: '' }, diz), 'Costruzioni Lego');
});
prova('aggiunte: solo quello che il riconoscimento di serie non sa già', () => {
  const a = M.aggiunte([
    { chiave: 'tact', modalita: 'tact', variante: '' },
    { chiave: 'emulazione con lego', modalita: 'imitazione', variante: 'Lego' },
    { chiave: 'nuovo gioco', modalita: 'c-x', variante: '', nuova: { id: 'c-x', nome: 'Nuovo gioco', categoria: 'sociale' } },
  ], {});
  assert.deepStrictEqual(Object.keys(a.sinonimi).sort(), ['emulazione con lego', 'nuovo gioco']);
  assert.strictEqual(a.modalita[0].id, 'c-x');
  const d = M.unisci({}, a);
  assert.strictEqual(r('Nuovo gioco', {}, d).modalita, 'c-x');
});
prova('i giochi dell\'app hanno la loro modalità', () => {
  assert.strictEqual(M.modalitaDiModo('tact'), 'tact');
  assert.strictEqual(M.modalitaDiModo('ran_intensivo'), 'velocita');
  assert.strictEqual(M.modalitaDiModo('quaderno_task'), 'task-analysis');
  assert.strictEqual(M.modalitaDiModo('tact', { modi: { tact: 'c-y' } }), 'c-y');
});
prova('categoria di un\'attività senza modalità: dal foglio', () => {
  assert.strictEqual(M.categoriaDi({ area: 'SPEAKER' }).id, 'speaker');
  assert.strictEqual(M.categoriaDi({ area: 'Comunità rinforzatori' }).id, 'sociale');
  assert.strictEqual(M.categoriaDi({ area: '' }), null);
});

console.log(`\n${passati} test passati, ${falliti.length} falliti`);
process.exit(falliti.length ? 1 : 0);
