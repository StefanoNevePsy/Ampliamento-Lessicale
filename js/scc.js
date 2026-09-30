/**
 * Standard Celeration Chart (Precision Teaching) sui dati dell'app.
 *
 * Dai nostri dati (sedute a prove discrete: corrette V, con aiuto P, errate X)
 * si ricava per ogni giorno quante risposte di ciascun tipo ci sono state; se
 * la seduta è cronometrata (durationSeconds) anche le risposte al minuto.
 * Su scala logaritmica si traccia la "celerazione": di quanto si moltiplica
 * il valore ogni settimana (×2 = raddoppia, ÷2 = si dimezza).
 *
 * Scelte (vedi docs/grafici-scc.md):
 *   - un punto per giorno di calendario: somma dei conteggi del giorno
 *     (nella vista settimanale: mediana dei giorni della settimana);
 *   - giorni senza sedute: nessun punto; conteggio zero: disegnato sotto il
 *     "pavimento" (0,75 × pavimento), e usato così anche nel calcolo;
 *   - celerazione: Theil-Sen su log10 (robusta con pochi dati), in
 *     alternativa split-middle o minimi quadrati; almeno 5 giorni con dati;
 *   - una linea per ogni fase, tra due linee di cambio fase;
 *   - "bounce": ampiezza della fascia 5°–95° percentile dei residui.
 * La percentuale di corrette resta nei grafici di sempre: su scala
 * logaritmica non ha senso (è limitata a 100).
 *
 * Modulo puro: si prova in Node (tools/test-scc.js).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceSCC = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_PUNTI = 5;
  var GIORNO = 86400000;

  function due(n) { return (n < 10 ? '0' : '') + n; }
  function chiave(d) { return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }
  /** Giorno di calendario locale di una data ISO (come getDateKey dell'app). */
  function giorno(iso) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    var d = new Date(iso);
    return isNaN(d) ? String(iso).slice(0, 10) : chiave(d);
  }
  function daChiave(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  /** Giorni tra due chiavi AAAA-MM-GG (senza problemi di ora legale). */
  function distanza(a, b) { return Math.round((daChiave(b) - daChiave(a)) / GIORNO); }
  function piuGiorni(k, n) { var d = daChiave(k); d.setDate(d.getDate() + n); return chiave(d); }
  function lunedi(k) { var d = daChiave(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return chiave(d); }
  function mediana(a) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function percentile(a, q) {
    var s = a.slice().sort(function (x, y) { return x - y; });
    if (!s.length) return NaN;
    var i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }

  /** Conteggi di una seduta dell'app: V, P, X e minuti (se cronometrata). */
  function conteggi(h) {
    var v, p, x;
    if (h.rawV != null || h.rawP != null || h.rawX != null) { v = h.rawV || 0; p = h.rawP || 0; x = h.rawX || 0; }
    else {
      v = h.correct || 0; p = h.prompts || 0;
      x = Math.max(0, (h.total || 0) - v - p);
    }
    var minuti = h.durationSeconds > 0 ? h.durationSeconds / 60 : 0;
    return { v: v, p: p, x: x, minuti: minuti };
  }

  /**
   * Punti giornalieri (o settimanali) di un insieme di sedute.
   * opz: { scala: 'giorni' | 'settimane' }
   * → { origine, punti: [{ x, data, v, p, x_, minuti, sedute }] }
   *   x = giorni dall'origine (vista giornaliera) o settimane (settimanale).
   */
  function punti(sedute, opz) {
    opz = opz || {};
    var perGiorno = {};
    (sedute || []).forEach(function (h) {
      var k = giorno(h.date), c = conteggi(h);
      var g = perGiorno[k] || (perGiorno[k] = { data: k, v: 0, p: 0, x: 0, minuti: 0, sedute: 0, cronometrate: 0 });
      g.v += c.v; g.p += c.p; g.x += c.x; g.sedute++;
      if (c.minuti) { g.minuti += c.minuti; g.cronometrate++; }
    });
    var giorni = Object.keys(perGiorno).sort().map(function (k) { return perGiorno[k]; });
    if (!giorni.length) return { origine: null, punti: [], scala: opz.scala || 'giorni' };
    if (opz.scala === 'settimane') {
      var origineS = lunedi(giorni[0].data), perSett = {};
      giorni.forEach(function (g) { var s = lunedi(g.data); (perSett[s] = perSett[s] || []).push(g); });
      return {
        origine: origineS, scala: 'settimane',
        punti: Object.keys(perSett).sort().map(function (s) {
          var gg = perSett[s], cron = gg.filter(function (g) { return g.minuti > 0; });
          return {
            x: distanza(origineS, s) / 7, data: s,
            v: mediana(gg.map(function (g) { return g.v; })), p: mediana(gg.map(function (g) { return g.p; })),
            x_: mediana(gg.map(function (g) { return g.x; })),
            // al minuto: mediana dei giorni cronometrati (ognuno col suo tempo)
            minuti: cron.length === gg.length ? mediana(cron.map(function (g) { return g.minuti; })) : 0,
            perMin: cron.length === gg.length ? {
              v: mediana(cron.map(function (g) { return g.v / g.minuti; })), p: mediana(cron.map(function (g) { return g.p / g.minuti; })),
              x_: mediana(cron.map(function (g) { return g.x / g.minuti; }))
            } : null,
            sedute: gg.reduce(function (n, g) { return n + g.sedute; }, 0), giorni: gg.length
          };
        })
      };
    }
    var origine = giorni[0].data;
    return {
      origine: origine, scala: 'giorni',
      punti: giorni.map(function (g) {
        var tutte = g.cronometrate === g.sedute && g.minuti > 0;
        return {
          x: distanza(origine, g.data), data: g.data, v: g.v, p: g.p, x_: g.x,
          minuti: tutte ? g.minuti : 0,
          perMin: tutte ? { v: g.v / g.minuti, p: g.p / g.minuti, x_: g.x / g.minuti } : null,
          sedute: g.sedute
        };
      })
    };
  }
  /** Vale la pena la vista "al minuto"? Solo se tutte le giornate sono cronometrate. */
  function cronometrato(ps) { return ps.length > 0 && ps.every(function (p) { return !!p.perMin; }); }

  /**
   * Valori da disegnare per una serie ('v' | 'p' | 'x').
   * Al minuto: frequenza = conteggio / minuti, pavimento = 1 / minuti.
   * A conteggio: pavimento = 1. Lo zero va sotto il pavimento (0,75 ×).
   */
  function valori(ps, serie, perMinuto) {
    var k = serie === 'x' ? 'x_' : serie;
    return ps.map(function (pt) {
      var reale = perMinuto ? (pt.perMin ? pt.perMin[k] : null) : pt[k];
      if (reale == null || isNaN(reale)) return null;
      var pav = perMinuto ? (pt.minuti > 0 ? 1 / pt.minuti : null) : 1;
      var zero = reale <= 0;
      return { x: pt.x, data: pt.data, reale: reale, y: zero ? 0.75 * (pav || 1) : reale, zero: zero, pavimento: pav };
    }).filter(Boolean);
  }

  // ---- rette su log10 ----
  function theilSen(vs) {
    var pend = [];
    for (var i = 0; i < vs.length; i++) for (var j = i + 1; j < vs.length; j++) {
      if (vs[j].x !== vs[i].x) pend.push((Math.log10(vs[j].y) - Math.log10(vs[i].y)) / (vs[j].x - vs[i].x));
    }
    var b = pend.length ? mediana(pend) : 0;
    var a = mediana(vs.map(function (v) { return Math.log10(v.y) - b * v.x; }));
    return { b: b, a: a };
  }
  function minimiQuadrati(vs) {
    var n = vs.length, mx = 0, my = 0;
    vs.forEach(function (v) { mx += v.x; my += Math.log10(v.y); });
    mx /= n; my /= n;
    var num = 0, den = 0;
    vs.forEach(function (v) { num += (v.x - mx) * (Math.log10(v.y) - my); den += (v.x - mx) * (v.x - mx); });
    var b = den ? num / den : 0;
    return { b: b, a: my - b * mx };
  }
  /** Split-middle (quarter-intersect spostato sulla mediana dei residui), il metodo classico della PT. */
  function splitMiddle(vs) {
    var mx = mediana(vs.map(function (v) { return v.x; }));
    var s1 = vs.filter(function (v) { return v.x < mx; }), s2 = vs.filter(function (v) { return v.x > mx; });
    if (!s1.length || !s2.length) return theilSen(vs);
    var x1 = mediana(s1.map(function (v) { return v.x; })), y1 = mediana(s1.map(function (v) { return Math.log10(v.y); }));
    var x2 = mediana(s2.map(function (v) { return v.x; })), y2 = mediana(s2.map(function (v) { return Math.log10(v.y); }));
    var b = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0;
    var a = y1 - b * x1;
    a += mediana(vs.map(function (v) { return Math.log10(v.y) - (b * v.x + a); }));
    return { b: b, a: a };
  }
  var METODI = { theilsen: theilSen, splitmiddle: splitMiddle, minimiquadrati: minimiQuadrati };

  /**
   * Celerazione di una serie di valori (una fase).
   * unita: quante x fanno un periodo di celerazione (7 giorni; 4 settimane).
   */
  function celerazione(vs, metodo, unita) {
    if (!vs || vs.length < MIN_PUNTI) return null;
    var f = (METODI[metodo] || theilSen)(vs);
    var cel = Math.pow(10, f.b * unita);
    var res = vs.map(function (v) { return Math.log10(v.y) - (f.b * v.x + f.a); });
    var p5 = percentile(res, 0.05), p95 = percentile(res, 0.95);
    return {
      b: f.b, a: f.a, cel: cel, testo: etichetta(cel),
      verso: cel > 1.05 ? 'su' : cel < 1 / 1.05 ? 'giu' : 'piatto',
      bounce: { basso: p5, alto: p95, molt: Math.pow(10, p95 - p5) },
      da: vs[0].x, a_: vs[vs.length - 1].x, n: vs.length,
      valore: function (x) { return Math.pow(10, f.b * x + f.a); }
    };
  }
  function etichetta(cel) {
    if (!isFinite(cel)) return '—';
    return cel >= 1 ? '×' + arrot(cel) : '÷' + arrot(1 / cel);
  }
  function arrot(n) { return n >= 10 ? String(Math.round(n)) : n.toFixed(n >= 2 ? 1 : 2).replace(/\.?0+$/, '') || '1'; }

  /** Divide i valori nelle fasi: una fase inizia alla data di una linea di cambio fase. */
  function fasi(vs, dateFasi, origine, scala) {
    var confini = (dateFasi || []).map(function (d) {
      var x = distanza(origine, giorno(d));
      return scala === 'settimane' ? x / 7 : x;
    }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
    var segmenti = [[]], j = 0;
    vs.forEach(function (v) {
      while (j < confini.length && v.x >= confini[j]) { j++; segmenti.push([]); }
      segmenti[segmenti.length - 1].push(v);
    });
    return segmenti.filter(function (s) { return s.length; });
  }

  /**
   * Linee di cambio fase automatiche, dalle sedute: cambio di target, di
   * condizione (indipendente / time delay e secondi), inizio del mantenimento.
   */
  function fasiAutomatiche(sedute, nomi) {
    var ord = (sedute || []).slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var out = [], prec = null;
    ord.forEach(function (h) {
      var cond = (h.sessionType || 'independent') + (h.sessionType === 'timedelay' ? ':' + (h.timeDelaySeconds || '') : '');
      var tgt = h.targetId || h.setName || '';
      if (prec) {
        var d = giorno(h.date), et = [];
        if (tgt !== prec.tgt) et.push((nomi && nomi[h.targetId]) || h.setName || 'nuovo target');
        if (cond !== prec.cond) et.push(h.sessionType === 'timedelay' ? 'time delay ' + (h.timeDelaySeconds || '') + 's' : 'indipendente');
        if (!!h.mantenimento !== prec.mant) et.push(h.mantenimento ? 'mantenimento' : 'acquisizione');
        if (et.length && (!out.length || out[out.length - 1].data !== d)) out.push({ data: d, etichetta: et.join(' · '), auto: true });
      }
      prec = { tgt: tgt, cond: cond, mant: !!h.mantenimento };
    });
    return out;
  }

  /** Quando la linea di celerazione raggiunge l'obiettivo (in x), o null. */
  function proiezione(c, obiettivo, daX) {
    if (!c || !(obiettivo > 0) || !c.b) return null;
    var x = (Math.log10(obiettivo) - c.a) / c.b;
    if (!isFinite(x) || x < daX) return null;
    return x;
  }

  /**
   * Analisi pronta per lo schermo: per ogni serie, la celerazione dell'ultima
   * fase, la variabilità, la precisione (corrette rispetto agli errori) e,
   * se c'è un obiettivo, quando lo si raggiunge al ritmo attuale.
   * opz: { scala, perMinuto, metodo, fasi: [date], obiettivo: { v, x } }
   */
  function analisi(sedute, opz) {
    opz = opz || {};
    var scala = opz.scala === 'settimane' ? 'settimane' : 'giorni';
    var P = punti(sedute, { scala: scala });
    var perMinuto = !!opz.perMinuto && cronometrato(P.punti);
    var unita = scala === 'settimane' ? 4 : 7;
    var out = { origine: P.origine, scala: scala, perMinuto: perMinuto, punti: P.punti, unita: unita, serie: {} };
    ['v', 'p', 'x'].forEach(function (k) {
      var vs = valori(P.punti, k, perMinuto);
      var seg = P.origine ? fasi(vs, opz.fasi, P.origine, scala) : [];
      var tuttiZero = vs.length > 0 && vs.every(function (v) { return v.zero; });
      var linee = tuttiZero ? seg.map(function () { return null; }) : seg.map(function (s) { return celerazione(s, opz.metodo, unita); });
      var ultima = linee.length ? linee[linee.length - 1] : null;
      if (tuttiZero) ultima = null;
      var obiettivo = opz.obiettivo && opz.obiettivo[k];
      var fine = vs.length ? vs[vs.length - 1].x : 0;
      var arrivo = ultima && obiettivo ? proiezione(ultima, obiettivo, fine) : null;
      out.serie[k] = {
        valori: vs, fasi: seg, linee: linee, ultima: tuttiZero ? null : ultima, tuttiZero: tuttiZero, obiettivo: obiettivo || null,
        arrivo: arrivo == null ? null : {
          x: arrivo,
          data: P.origine ? piuGiorni(P.origine, Math.round(scala === 'settimane' ? arrivo * 7 : arrivo)) : null,
          fra: Math.round((arrivo - fine) * (scala === 'settimane' ? 7 : 1))
        }
      };
    });
    var cv = out.serie.v.ultima, cx = out.serie.x.ultima;
    // miglioramento della precisione: quanto cresce il rapporto corrette/errori
    out.precisione = cv && cx ? { molt: cv.cel / cx.cel, testo: etichetta(cv.cel / cx.cel) } : null;
    return out;
  }

  /** CSV compatibile con OpenCelerator: Date, Corrects, Errors, Prompted, Minutes. */
  function csv(sedute) {
    var P = punti(sedute, { scala: 'giorni' });
    var righe = ['Date,Corrects,Errors,Prompted,Minutes'];
    P.punti.forEach(function (p) { righe.push([p.data, p.v, p.x_, p.p, p.minuti ? p.minuti.toFixed(2) : ''].join(',')); });
    return righe.join('\n') + '\n';
  }

  return {
    MIN_PUNTI: MIN_PUNTI, giorno: giorno, distanza: distanza, piuGiorni: piuGiorni, lunedi: lunedi,
    conteggi: conteggi, punti: punti, cronometrato: cronometrato, valori: valori,
    theilSen: theilSen, splitMiddle: splitMiddle, minimiQuadrati: minimiQuadrati,
    celerazione: celerazione, etichetta: etichetta, fasi: fasi, fasiAutomatiche: fasiAutomatiche,
    proiezione: proiezione, analisi: analisi, csv: csv, mediana: mediana, percentile: percentile
  };
});
