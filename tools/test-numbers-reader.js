// Confronta js/numbers-reader.js con numbers-parser (Python), cella per cella.
// Uso: node tools/test-numbers-reader.js file.numbers riferimento.json
// (riferimento.json si ottiene con: python3 tools/numbers-riferimento.py file.numbers riferimento.json)
const fs = require('fs');
const path = require('path');
const JSZip = require(path.join(__dirname, '..', 'vendor', 'js', 'jszip.min.js'));
const NumbersReader = require(path.join(__dirname, '..', 'js', 'numbers-reader.js'));

(async () => {
  const [file, rif] = process.argv.slice(2);
  const t0 = Date.now();
  const doc = await NumbersReader.leggi(fs.readFileSync(file), JSZip);
  const ms = Date.now() - t0;
  const atteso = JSON.parse(fs.readFileSync(rif, 'utf8'));
  let celle = 0, diverse = 0;
  const norm = (v) => v instanceof Date ? { d: v.toISOString().replace(/\.000Z$/, '').replace(/Z$/, '') }
    : typeof v === 'boolean' ? { b: v } : v === '' ? null : v;
  const uguali = (a, b) => {
    if (a && b && a.d && b.d) return a.d.slice(0, 19) === b.d.slice(0, 19);
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
    return JSON.stringify(a) === JSON.stringify(b);
  };
  if (doc.length !== atteso.length) console.log('fogli:', doc.length, 'attesi', atteso.length);
  atteso.forEach((f, i) => {
    const g = doc[i] || { tabelle: [] };
    if (g.nome !== f.nome) console.log('foglio', i, JSON.stringify(g.nome), '≠', JSON.stringify(f.nome));
    if (g.tabelle.length !== f.tabelle.length) console.log(f.nome, 'tabelle', g.tabelle.length, 'attese', f.tabelle.length);
    // l'ordine delle tabelle in numbers-parser è quello interno del file: si confronta per nome
    const libere = g.tabelle.slice();
    f.tabelle.forEach((t) => {
      const k = libere.findIndex((x) => x.nome === t.nome);
      const u = k >= 0 ? libere.splice(k, 1)[0] : { righe: [] };
      if (k < 0) console.log(f.nome, 'manca la tabella', JSON.stringify(t.nome));
      t.righe.forEach((r, ri) => r.forEach((v, ci) => {
        celle++;
        const w = norm((u.righe[ri] || [])[ci]);
        if (!uguali(w, v)) {
          if (++diverse <= 15) console.log(`${f.nome}/${t.nome} [${ri},${ci}]`, JSON.stringify(w), '≠', JSON.stringify(v));
        }
      }));
    });
  });
  console.log(`${celle} celle confrontate, ${diverse} diverse, lettura in ${ms} ms`);
  process.exit(diverse ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
