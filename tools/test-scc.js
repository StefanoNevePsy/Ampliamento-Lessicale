#!/usr/bin/env node
// Test di js/scc.js (Standard Celeration Chart): node tools/test-scc.js
'use strict';
const S = require('../js/scc.js');
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'ok  ' : 'NO  ') + m); };
const vicino = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const seduta = (data, v, p, x, extra = {}) => Object.assign({ date: data + 'T10:00:00', rawV: v, rawP: p, rawX: x, correct: v, prompts: p, total: v + p + x }, extra);

// raddoppio esatto ogni settimana: celerazione ×2
const giorni = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21];
const sed = giorni.map((g) => seduta(S.piuGiorni('2026-09-07', g), Math.round(2 * Math.pow(2, g / 7) * 100) / 100, 0, 1));
let A = S.analisi(sed, { metodo: 'theilsen' });
ok(A.punti.length === 10 && A.punti[0].data === '2026-09-07', 'un punto per giorno con dati');
ok(vicino(A.serie.v.ultima.cel, 2, 0.02), 'Theil-Sen: raddoppio settimanale → ×2 (' + A.serie.v.ultima.testo + ')');
ok(A.serie.v.ultima.testo === '×2', 'etichetta ×2');
ok(vicino(S.analisi(sed, { metodo: 'minimiquadrati' }).serie.v.ultima.cel, 2, 0.02), 'minimi quadrati: ×2');
ok(vicino(S.analisi(sed, { metodo: 'splitmiddle' }).serie.v.ultima.cel, 2, 0.05), 'split-middle: ×2');
ok(A.serie.x.ultima.testo === '×1' && A.serie.x.ultima.verso === 'piatto', 'errori costanti: ×1, piatto');
ok(A.precisione && vicino(A.precisione.molt, 2, 0.05), 'precisione: corrette/errori migliora ×2');

// dimezzamento: ÷2
const giu = giorni.map((g) => seduta(S.piuGiorni('2026-09-07', g), 1, 0, 16 / Math.pow(2, g / 7)));
ok(S.analisi(giu).serie.x.ultima.testo === '÷2', 'errori che si dimezzano: ÷2');

// robustezza: un giorno anomalo non sposta Theil-Sen
const anomalo = sed.map((s, i) => (i === 5 ? seduta(s.date.slice(0, 10), 200, 0, 1) : s));
ok(vicino(S.analisi(anomalo).serie.v.ultima.cel, 2, 0.15), 'un giorno anomalo non rovina la celerazione (Theil-Sen)');

// pochi dati
ok(S.analisi(sed.slice(0, 4)).serie.v.ultima === null, 'meno di 5 giorni: nessuna linea');

// più sedute nello stesso giorno: si sommano
const doppie = [seduta('2026-09-07', 3, 1, 1), seduta('2026-09-07', 4, 0, 2)];
const P = S.punti(doppie);
ok(P.punti.length === 1 && P.punti[0].v === 7 && P.punti[0].x_ === 3 && P.punti[0].p === 1 && P.punti[0].sedute === 2, 'sedute dello stesso giorno sommate');

// zero sotto il pavimento
const vz = S.valori(S.punti([seduta('2026-09-07', 0, 0, 3)]).punti, 'v', false);
ok(vz[0].zero && vicino(vz[0].y, 0.75), 'zero corrette: disegnato a 0,75 sotto il pavimento');

// al minuto: frequenza e pavimento
const cron = [seduta('2026-09-07', 20, 0, 2, { durationSeconds: 120 })];
const pm = S.punti(cron).punti[0];
ok(pm.perMin && vicino(pm.perMin.v, 10) && vicino(pm.minuti, 2), '20 corrette in 2 minuti = 10/min');
const vm = S.valori([pm], 'x', true)[0];
ok(vicino(vm.y, 1) && vicino(vm.pavimento, 0.5), 'errori 1/min, pavimento 1/2 minuti = 0,5');
ok(!S.cronometrato(S.punti([seduta('2026-09-07', 2, 0, 0), seduta('2026-09-08', 2, 0, 0, { durationSeconds: 60 })]).punti), 'vista al minuto solo se tutte le giornate sono cronometrate');

// fasi: due linee separate
const fasiSed = [];
for (let g = 0; g < 10; g++) fasiSed.push(seduta(S.piuGiorni('2026-09-01', g), 2 + g, 0, 1));          // cresce
for (let g = 10; g < 20; g++) fasiSed.push(seduta(S.piuGiorni('2026-09-01', g), 12, 0, 1));           // piatto
A = S.analisi(fasiSed, { fasi: ['2026-09-11'] });
ok(A.serie.v.linee.length === 2 && A.serie.v.linee[0].verso === 'su' && A.serie.v.ultima.verso === 'piatto', 'una linea per fase');

// fasi automatiche
const auto = S.fasiAutomatiche([
  seduta('2026-09-01', 1, 0, 0, { targetId: 't1', sessionType: 'independent' }),
  seduta('2026-09-02', 1, 0, 0, { targetId: 't1', sessionType: 'timedelay', timeDelaySeconds: 3 }),
  seduta('2026-09-05', 1, 0, 0, { targetId: 't2', sessionType: 'timedelay', timeDelaySeconds: 3 }),
], { t2: 'Animali' });
ok(auto.length === 2 && /time delay 3s/.test(auto[0].etichetta) && auto[1].etichetta === 'Animali', 'cambi di condizione e di target come fasi automatiche');

// proiezione verso l'obiettivo
A = S.analisi(sed, { obiettivo: { v: 32 } });
ok(A.serie.v.arrivo && A.serie.v.arrivo.fra > 0 && A.serie.v.arrivo.fra < 21, 'proiezione: raggiunge 32 al giorno fra ' + (A.serie.v.arrivo && A.serie.v.arrivo.fra) + ' giorni');
ok(S.analisi(giu, { obiettivo: { v: 100 } }).serie.v.arrivo === null, 'nessuna proiezione se la linea non ci arriva');

// settimane: mediana dei giorni, celerazione al mese (4 settimane)
const W = S.analisi(sed, { scala: 'settimane' });
ok(W.punti.length === 4 && W.punti[0].data === '2026-09-07' && W.unita === 4, 'vista settimanale: 4 settimane, lunedì come inizio');

// bounce
const rum = giorni.map((g, i) => seduta(S.piuGiorni('2026-09-07', g), 5 * (i % 2 ? 2 : 1), 0, 0));
ok(S.analisi(rum).serie.v.ultima.bounce.molt > 1.5, 'variabilità (bounce) misurata: ×' + S.analisi(rum).serie.v.ultima.bounce.molt.toFixed(1));

// CSV
ok(S.csv(doppie) === 'Date,Corrects,Errors,Prompted,Minutes\n2026-09-07,7,3,1,\n', 'CSV compatibile con OpenCelerator');

// dati storici senza raw: correct/total
const vecchia = S.conteggi({ correct: 8, total: 10 });
ok(vecchia.v === 8 && vecchia.x === 2 && vecchia.p === 0, 'sedute vecchie senza V/P/X: errori = totale − corrette');

// i cambi di fase fatti su due dispositivi si sommano, non si sovrascrivono
const U = require('../js/tice-unisci.js');
const base = { id: 'p1', fasi: [{ id: 'f1', data: '2026-09-01', etichetta: 'a' }] };
const mio = { id: 'p1', fasi: base.fasi.concat([{ id: 'f2', data: '2026-09-10', etichetta: 'mia' }]) };
const loro = { id: 'p1', fasi: base.fasi.concat([{ id: 'f3', data: '2026-09-12', etichetta: 'sua' }]) };
const u = U.unisci(base, mio, loro);
const unito = (u && (u.risultato || u.paziente || u)).fasi || [];
ok(unito.map((x) => x.id).sort().join() === 'f1,f2,f3', 'fasi aggiunte su due dispositivi: si uniscono per id');

console.log(`\n${n - f} riuscite, ${f} fallite`);
process.exit(f ? 1 : 0);
