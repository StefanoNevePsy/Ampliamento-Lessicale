// Test dell'import dei quaderni Numbers nell'app (js/tice-import.js).
//
//   node tools/test-tice-import.js
//       prove su un quaderno sintetico (sempre, anche in CI)
//   node tools/test-tice-import.js quaderno.numbers riferimento.json
//       in più confronta con tools/import_numbers.py su un file vero:
//       python3 tools/import_numbers.py quaderno.numbers --out riferimento.json
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const TiceImport = require(path.join(__dirname, '..', 'js', 'tice-import.js'));

let ok = 0, ko = 0;
function prova(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); } catch (e) { ko++; console.log('  ✗', nome, '\n    ', e.message); }
}
const D = (s) => new Date(s + 'T00:00:00Z');

// Un quaderno come lo restituisce NumbersReader
function quaderno() {
  return [
    { nome: 'LINGUAGGIO', tabelle: [
      { nome: 'TACT', righe: [
        ['Programma: denominazione di immagini', null, null, null, null],
        [null, '90/100% x 2', 'Strategia insegnamento:', 'Time delay', null],
        ['STO', 'DATA', 'CORRETTE', 'PROMPTATE', 'DECISIONE'],
        ['Animali 5 target', D('2025-03-03'), 6, 4, null],
        ['1"T/D', D('2025-03-04'), 9, 1, null],
        [null, D('2025-03-05'), 10, 0, 'CRITERIO'],
        [null, null, null, null, null],
        ['Frutta 5 target', D('2025-03-10'), 5, 5, null],
        [null, D('2025-03-11'), 7, 3, null],
        [null, null, null, null, null],
        ['Veicoli', null, null, null, null]
      ] },
      { nome: 'ECHOICO %', righe: [
        ['Programma: ripetizione', null, null, null],
        [null, '80% per 2 sessioni consecutive', null, null],
        ['STO', 'DATA', 'CORRETTE', 'PROMPTATE'],
        ['Sillabe', D('2025-03-03'), 60, 40],
        [null, D('2025-03-04'), 33, 77],
        [null, D('2025-03-05'), 85, 15],
        [null, D('2025-03-06'), 90, 10],
        [null, D('2025-03-07'), 95, 5]
      ] }
    ] },
    { nome: 'AUTONOMIE', tabelle: [
      { nome: 'VESTIRSI', righe: [
        ['Programma: giacca', null, null],
        [null, '90%', 'Indipendente'],
        ['STO', 'DATA', 'CORRETTE'],
        ['Infila una manica', D('2025-03-03'), 2],
        [null, D('2025-03-05'), 4]
      ] }
    ] },
    { nome: 'Learn unit giornaliere', tabelle: [
      { nome: 'LU', righe: [
        ['DATA', 'RISPOSTE CORRETTE', 'RISPOSTE TOTALI', 'PSICOLOGA'],
        [D('2025-03-03'), 40, 60, 'Anna + Luca'],
        [D('2025-03-04'), 45, 55, 'Anna']
      ] }
    ] },
    { nome: 'Modelli grafici', tabelle: [{ nome: 'x', righe: [['a']] }] }
  ];
}

console.log('Quaderno sintetico');
const pk = TiceImport.analizza(quaderno(), 'Mario_R_old.numbers');
prova('nome dal file', () => assert.strictEqual(pk.nome, 'Mario R'));
prova('tre attività, storico, fogli saltati', () => {
  assert.deepStrictEqual(pk.attivita.map((a) => a.nome), ['TACT', 'ECHOICO %', 'VESTIRSI']);
  assert.strictEqual(pk.storico.length, 2);
  assert.ok(pk.avvisi.some((a) => /Modelli grafici/.test(a)));
});
const tact = pk.attivita[0];
prova('target su più righe, criterio, pianificato', () => {
  assert.deepStrictEqual(tact.target.map((t) => [t.testo, t.stato]), [
    ['Animali 5 target — 1"T/D', 'criterio'], ['Frutta 5 target', 'attivo'], ['Veicoli', 'pianificato']]);
  assert.strictEqual(tact.target[0].fine, '2025-03-05');
  assert.strictEqual(tact.target[0].tdSeconds, 1);
});
prova('criterio e tipo di seduta dal foglio', () => {
  assert.deepStrictEqual(tact.criterio, { soglia: 90, sedute: 2 });
  assert.strictEqual(tact.sessionType, 'timedelay');
  assert.strictEqual(pk.attivita[1].criterio.soglia, 80);
  assert.strictEqual(pk.attivita[2].sessionType, 'independent');
});
prova('conteggi: prove dedotte e certe', () => {
  const c = pk.daConfermare.find((d) => d.attivitaId === tact.id);
  assert.strictEqual(c.proposta, 10);
  assert.strictEqual(c.certo, true);
});
prova('percentuali: refuso 33+77 corretto con avviso', () => {
  const echo = pk.attivita[1];
  assert.strictEqual(echo.scala, 'percentuale');
  const v = pk.voci.filter((x) => x.attivitaId === echo.id)[1];
  assert.strictEqual(v.v, 30);
  assert.ok(pk.avvisi.some((a) => /33\+77 = 110/.test(a)));
});
prova('solo corrette: prove da confermare, non certe', () => {
  const c = pk.daConfermare.find((d) => d.attivitaId === pk.attivita[2].id);
  assert.strictEqual(c.certo, false);
  assert.strictEqual(c.proposta, 5);
});

const conferme = { [pk.attivita[2].id]: 4 };
const s = TiceImport.sedute(pk, conferme);
prova('sedute nel formato Quaderno dell\'app', () => {
  const prima = s.find((x) => x.setName === 'TACT · Animali 5 target — 1"T/D' && x.date.startsWith('2025-03-05'));
  assert.ok(prima, 'seduta del 5/3 su Animali');
  assert.strictEqual(prima.mode, 'quaderno');
  assert.strictEqual(prima.sessionType, 'timedelay');
  assert.strictEqual(prima.timeDelaySeconds, 1);
  assert.deepStrictEqual([prima.correct, prima.prompts, prima.rawX, prima.total, prima.percentage], [10, 0, 0, 10, 100]);
  assert.strictEqual(prima.setCat, 'Linguaggio');
  assert.ok(/CRITERIO/.test(prima.note));
  assert.strictEqual(s.filter((x) => x.date.startsWith('2025-03-03'))[0].operatore, 'Anna + Luca');
});
prova('percentuali marcate (non contano come learn unit)', () => {
  const e = s.filter((x) => x.setName.startsWith('ECHOICO'));
  assert.ok(e.every((x) => x.scala === 'percentuale' && x.total === 100));
  assert.strictEqual(e[1].percentage, 30);
});
prova('prove confermate: gli errori sono la differenza', () => {
  const v = s.filter((x) => x.setName.startsWith('VESTIRSI'));
  assert.deepStrictEqual(v.map((x) => [x.correct, x.rawX, x.total]), [[2, 2, 4], [4, 0, 4]]);
});
prova('la data non slitta col fuso orario', () => {
  const d = new Date(s[0].date);
  assert.strictEqual(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, s[0].date.slice(0, 10));
});

console.log('Applicare a un paziente');
const paziente = { id: 'p1', name: 'Mario R', history: [
  { date: '2025-04-01T10:00:00.000Z', setName: 'Animali', mode: 'tact', correct: 5, total: 10, percentage: 50 }] };
const r1 = TiceImport.applica(paziente, TiceImport.analizza(quaderno(), 'Mario_R_old.numbers'), conferme);
prova('storico dell\'app intatto, sedute importate aggiunte', () => {
  assert.strictEqual(paziente.history.filter((h) => h.mode === 'tact').length, 1);
  assert.strictEqual(paziente.history.length, 1 + s.length);
  assert.strictEqual(r1.sedute, s.length);
  assert.strictEqual(paziente.programma.attivita.length, 3);
  assert.strictEqual(paziente.learnUnitStoriche.length, 2);
});
prova('soglia 80% del foglio diventa soglia dell\'attività', () => {
  assert.strictEqual(paziente.criterionOverrides['ECHOICO % · Sillabe::quaderno'], 80);
  assert.ok(!Object.keys(paziente.criterionOverrides).some((k) => k.startsWith('TACT')));
});
// nell'app: si chiude a mano un target e se ne aggiunge uno nuovo, poi si reimporta
const tactP = paziente.programma.attivita[0];
tactP.target[1].stato = 'criterio'; tactP.target[1].modificato = '2025-04-02';
tactP.target[2].stato = 'chiuso'; tactP.target.push({ id: 'tg_app1', testo: 'Colori', stato: 'attivo', origine: 'app' });
paziente.history.push({ date: '2025-04-03T10:00:00.000Z', setName: 'TACT · Colori', mode: 'quaderno', correct: 8, total: 10, percentage: 80, attivitaId: tactP.id, targetId: 'tg_app1', fonte: 'app' });
TiceImport.applica(paziente, TiceImport.analizza(quaderno(), 'Mario_R_old.numbers'), conferme);
prova('reimportare lo stesso file non duplica', () => {
  assert.strictEqual(paziente.history.filter((h) => h.fonte === 'numbers').length, s.length);
  assert.strictEqual(paziente.learnUnitStoriche.length, 2);
  assert.strictEqual(paziente.importazioni.length, 1);
});
prova('reimportare conserva quello fatto nell\'app', () => {
  const t = paziente.programma.attivita[0].target;
  assert.strictEqual(t[1].stato, 'criterio');
  assert.strictEqual(t[t.length - 1].id, 'tg_app1');
  assert.strictEqual(t.filter((x) => x.stato === 'attivo').length, 1);
  assert.strictEqual(paziente.history.filter((h) => h.fonte === 'app').length, 1);
});

// ---------- confronto con import_numbers.py su un file vero ----------
async function confrontoFile(file, rif) {
  console.log('Confronto con import_numbers.py su', path.basename(file));
  const JSZip = require(path.join(__dirname, '..', 'vendor', 'js', 'jszip.min.js'));
  const NumbersReader = require(path.join(__dirname, '..', 'js', 'numbers-reader.js'));
  const doc = await NumbersReader.leggi(fs.readFileSync(file), JSZip);
  const js = TiceImport.analizza(doc, file);
  const py = JSON.parse(fs.readFileSync(rif, 'utf8'));
  // l'ordine delle tabelle di numbers-parser è quello interno del file: si abbina per area e nome
  const k = (area, nome) => (area || '') + '|' + nome;
  const perNome = Object.fromEntries(py.paziente.programmi.map((p) => [k(p.area, p.nome), p]));
  const progPy = js.attivita.map((a) => perNome[k(a.area, a.nome)]);
  prova('stesse attività', () => {
    assert.deepStrictEqual(js.attivita.map((a) => k(a.area, a.nome)).sort(), py.paziente.programmi.map((p) => k(p.area, p.nome)).sort());
  });
  prova('stessi target e stati', () => {
    js.attivita.forEach((a, i) => assert.deepStrictEqual(
      a.target.map((t) => [t.testo, t.stato, t.inizio, t.fine]),
      progPy[i].sto.map((t) => [t.testo, t.stato, t.inizio, t.fine]), a.nome));
  });
  prova('stessi criteri, tipi di seduta, scale e prove', () => {
    js.attivita.forEach((a, i) => {
      const p = progPy[i];
      assert.deepStrictEqual([a.criterio, a.sessionType === 'independent' ? 'indipendente' : a.sessionType, a.scala, a.prove],
        [p.criterio, p.strategia, p.scala, p.prove], a.nome);
    });
  });
  const vociPy = py.sedute.flatMap((s) => s.voci.map((v) => ({ ...v, data: s.data })));
  prova('stesse misure (data, V, P, X, decisione)', () => {
    const chiave = (x, nomi) => [nomi[x.programmaId || x.attivitaId], x.data, x.v, x.p, x.x == null ? null : x.x, x.decisione || null].join('|');
    const nomiPy = Object.fromEntries(progPy.map((p) => [p.id, p.nome]));
    const nomiJs = Object.fromEntries(js.attivita.map((a) => [a.id, a.nome]));
    const a = js.voci.map((x) => chiave(x, nomiJs)).sort();
    const b = vociPy.map((x) => chiave(x, nomiPy)).sort();
    assert.strictEqual(a.length, b.length, 'numero di misure');
    assert.deepStrictEqual(a, b);
  });
  prova('stesse prove da confermare e stessi avvisi', () => {
    const dc = (l) => l.map((d) => [d.attivita || d.programma, d.proposta, d.certo].join('|')).sort();
    assert.deepStrictEqual(dc(js.daConfermare), dc(py.daConfermare));
    assert.strictEqual(js.avvisi.length, py.avvisi.length);
  });
  prova('storico learn unit', () => assert.strictEqual(js.storico.length, py.paziente.learnUnitStoriche.length));
  const sed = TiceImport.sedute(js, {});
  console.log(`    ${js.attivita.length} attività, ${js.voci.length} misure → ${sed.length} sedute Quaderno, ${js.storico.length} giorni di learn unit, ${js.avvisi.length} avvisi`);
}

(async () => {
  const [file, rif] = process.argv.slice(2);
  if (file && rif) await confrontoFile(file, rif);
  console.log(`\n${ok} riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
})();
