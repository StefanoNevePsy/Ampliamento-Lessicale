/**
 * Quaderno TICE — calcoli clinici. Nessun DOM, nessuna rete: solo dati in,
 * risultati fuori, cosi' si possono testare (tools/test-modello.js).
 *
 * Le regole sono le stesse dell'app personale e dei fogli del centro:
 *   - percentuale = corrette / (corrette + promptate + errate);
 *   - criterio = le ultime N sedute di uno STO, in giorni diversi e
 *     consecutive, tutte sopra soglia (di solito 90% per 2 sedute);
 *   - repertorio = la prima seduta di uno STO e' gia' sopra soglia;
 *   - learn unit del giorno = somma di corrette e di prove di tutte le voci.
 */
var Modello = (function () {
  'use strict';

  function prog(paziente, id) {
    return (paziente.programmi || []).find(function (p) { return p.id === id; }) || null;
  }

  /**
   * La scala appartiene alla singola misura, non al programma: lo storico
   * importato da un foglio in percentuale resta in percentuale, mentre le sedute
   * registrate con l'app sono sempre conteggi, anche sullo stesso programma.
   * (Le misure importate prima di questa regola non hanno "scala": per quelle
   * decide il programma, ma mai per una seduta registrata con l'app.)
   */
  function inPercentuale(voce, programma, seduta) {
    if (voce.scala) return voce.scala === 'percentuale';
    if (seduta && seduta.fonte === 'app') return false;
    return !!(programma && programma.scala === 'percentuale');
  }

  /** Corrette e totale di una voce, gestendo i dati importati. */
  function contiVoce(voce, programma, seduta) {
    var v = Number(voce.v) || 0;
    var p = Number(voce.p) || 0;
    var x = voce.x;
    if (inPercentuale(voce, programma, seduta)) {
      return { v: v, p: p, x: x == null ? Math.max(0, 100 - v - p) : Number(x), tot: 100, percentuale: true };
    }
    if (x == null) {
      // Import da fogli che non scrivono le errate: le si ricava dal numero di prove
      x = programma && programma.prove ? Math.max(0, programma.prove - v - p) : 0;
    }
    x = Number(x) || 0;
    return { v: v, p: p, x: x, tot: v + p + x, percentuale: false };
  }

  function pctVoce(voce, programma, seduta) {
    var c = contiVoce(voce, programma, seduta);
    if (c.percentuale) return Math.round(c.v);
    return c.tot > 0 ? Math.round(100 * c.v / c.tot) : null;
  }

  function sedutaValida(s) { return s && !s.eliminata; }

  /**
   * Misure di un programma (opzionalmente di un solo STO), una per giorno:
   * se nello stesso giorno ci sono piu' misure si sommano, come si fa sul foglio.
   */
  function misure(paziente, sedute, programmaId, stoId) {
    var programma = prog(paziente, programmaId);
    var perGiorno = {};
    (sedute || []).filter(sedutaValida).forEach(function (s) {
      (s.voci || []).forEach(function (voce) {
        if (voce.programmaId !== programmaId) return;
        if (stoId && voce.stoId !== stoId) return;
        var c = contiVoce(voce, programma, s);
        if (!c.percentuale && c.tot === 0) return;
        var g = perGiorno[s.data] || (perGiorno[s.data] = { data: s.data, v: 0, p: 0, x: 0, tot: 0, n: 0, pctSomma: 0, nPct: 0, sedute: [], stoId: voce.stoId, decisioni: [] });
        if (c.percentuale) { g.pctSomma += c.v; g.nPct += 1; }
        else { g.v += c.v; g.p += c.p; g.x += c.x; g.tot += c.tot; g.n += 1; }
        g.sedute.push(s.id);
        if (voce.decisione) g.decisioni.push(voce.decisione);
      });
    });
    return Object.keys(perGiorno).sort().map(function (d) {
      var g = perGiorno[d];
      // In un giorno con misure a conteggio e in percentuale valgono i conteggi
      g.percentuale = g.n === 0 && g.nPct > 0;
      if (g.percentuale) { g.pct = Math.round(g.pctSomma / g.nPct); g.v = g.pct; g.tot = 100; }
      else g.pct = g.tot ? Math.round(100 * g.v / g.tot) : null;
      delete g.pctSomma; delete g.nPct;
      return g;
    });
  }

  /**
   * Stato del criterio su una serie di misure giornaliere.
   * Restituisce la PRIMA data in cui e' stato raggiunto (come si scrive
   * "CRITERIO" sul foglio), la serie in corso e se era gia' in repertorio.
   */
  function criterio(serie, crit) {
    var soglia = (crit && crit.soglia) || 90;
    var n = (crit && crit.sedute) || 2;
    var striscia = 0;
    var raggiunto = null;
    serie.forEach(function (m) {
      if (m.pct == null) return;
      striscia = m.pct >= soglia ? striscia + 1 : 0;
      if (!raggiunto && striscia >= n) raggiunto = m.data;
    });
    var prima = serie.find(function (m) { return m.pct != null; });
    return {
      raggiunto: raggiunto,
      repertorio: !!(prima && prima.pct >= soglia),
      striscia: striscia,
      mancano: raggiunto ? 0 : Math.max(0, n - striscia),
      soglia: soglia, sedute: n,
    };
  }

  function stoAttivo(programma) {
    var sto = programma.sto || [];
    return sto.find(function (s) { return s.stato === 'attivo'; }) || null;
  }

  /**
   * Lo STO su cui si registra in seduta. Di solito quello in corso; se non c'e'
   * ma l'ultimo e' gia' a criterio, si continua su quello come mantenimento:
   * sui fogli del centro si registrano sedute anche dopo "CRITERIO", finche'
   * qualcuno non scrive lo STO successivo.
   */
  function stoCorrente(programma) {
    var attivo = stoAttivo(programma);
    if (attivo) return { sto: attivo, mantenimento: false };
    var ultimo = (programma.sto || []).slice().reverse().find(function (s) { return s.stato !== 'pianificato'; });
    if (ultimo && (ultimo.stato === 'criterio' || ultimo.stato === 'repertorio')) return { sto: ultimo, mantenimento: true };
    return null;
  }

  /** Riepilogo di un programma per le liste: STO in corso, ultima %, criterio. */
  function riepilogoProgramma(paziente, sedute, programma) {
    var sto = stoAttivo(programma);
    var serie = sto ? misure(paziente, sedute, programma.id, sto.id) : [];
    var tutte = misure(paziente, sedute, programma.id);
    var ultima = tutte[tutte.length - 1] || null;
    return {
      sto: sto,
      serie: serie,
      ultima: ultima,
      criterio: sto ? criterio(serie, programma.criterio) : null,
    };
  }

  /**
   * Learn unit giornaliere, come il foglio "Learn unit totali giornaliere".
   * Per ogni giorno: dalle sedute registrate con l'app se ci sono; altrimenti
   * dalla riga di storico importata; altrimenti dalle sedute importate a
   * conteggio (quelle in percentuale non si possono sommare).
   */
  function learnUnit(paziente, sedute) {
    var giorni = {};
    function g(d) { return giorni[d] || (giorni[d] = { data: d, corrette: 0, totali: 0, criteri: 0, operatori: [], fonte: null, sedute: 0 }); }

    var validi = (sedute || []).filter(sedutaValida);
    var conApp = {};
    validi.forEach(function (s) { if (s.fonte === 'app') conApp[s.data] = true; });

    validi.forEach(function (s) {
      var importata = s.fonte !== 'app';
      if (importata && conApp[s.data]) return;
      var giorno = g(s.data);
      var contate = false;
      (s.voci || []).forEach(function (voce) {
        var c = contiVoce(voce, prog(paziente, voce.programmaId), s);
        if (c.percentuale) return;
        giorno.corrette += c.v; giorno.totali += c.tot; contate = true;
      });
      if (!contate && importata) return;
      giorno.sedute += 1;
      giorno.fonte = importata ? (giorno.fonte || 'import') : 'app';
      [s.operatoreNome].concat(s.coOperatori || []).forEach(function (o) {
        if (o && giorno.operatori.indexOf(o) < 0) giorno.operatori.push(o);
      });
    });

    // Storico importato: solo per i giorni senza sedute registrate con l'app
    (paziente.learnUnitStoriche || []).forEach(function (r) {
      if (conApp[r.data]) return;
      if (r.corrette == null && r.totali == null) return;
      var giorno = g(r.data);
      giorno.corrette = r.corrette || 0;
      giorno.totali = r.totali || 0;
      giorno.criteri = r.criteri || 0;
      giorno.fonte = 'storico';
      giorno.operatori = r.operatori ? [r.operatori] : giorno.operatori;
    });

    // Criteri del giorno: STO che raggiungono il criterio proprio in quella data
    (paziente.programmi || []).forEach(function (programma) {
      (programma.sto || []).forEach(function (sto) {
        var c = criterio(misure(paziente, validi, programma.id, sto.id), programma.criterio);
        if (c.raggiunto && giorni[c.raggiunto] && giorni[c.raggiunto].fonte !== 'storico') giorni[c.raggiunto].criteri += 1;
      });
    });

    return Object.keys(giorni).sort().map(function (d) { return giorni[d]; });
  }

  /** Riepilogo di una singola seduta (per la conferma a fine seduta e per lo storico). */
  function riepilogoSeduta(paziente, seduta) {
    var corrette = 0, totali = 0;
    var righe = (seduta.voci || []).map(function (voce) {
      var programma = prog(paziente, voce.programmaId);
      var c = contiVoce(voce, programma, seduta);
      if (!c.percentuale) { corrette += c.v; totali += c.tot; }
      return { programma: programma, voce: voce, conti: c, pct: pctVoce(voce, programma, seduta) };
    });
    return { righe: righe, corrette: corrette, totali: totali, pct: totali ? Math.round(100 * corrette / totali) : null };
  }

  // --- Date -----------------------------------------------------------------
  function oggiISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatoData(iso, lungo) {
    if (!iso) return '—';
    var p = iso.slice(0, 10).split('-');
    if (lungo) {
      var mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
      return Number(p[2]) + ' ' + mesi[Number(p[1]) - 1] + ' ' + p[0];
    }
    return p[2] + '/' + p[1] + '/' + p[0].slice(2);
  }
  function giorniFa(iso, oggi) {
    if (!iso) return null;
    var a = new Date(iso.slice(0, 10) + 'T12:00:00');
    var b = new Date((oggi || oggiISO()) + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }
  function quando(iso, oggi) {
    var n = giorniFa(iso, oggi);
    if (n == null) return 'mai';
    if (n <= 0) return 'oggi';
    if (n === 1) return 'ieri';
    if (n < 14) return n + ' giorni fa';
    return formatoData(iso);
  }

  function nuovoId(prefisso) {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var buf = new Uint8Array(14);
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : require('crypto').webcrypto).getRandomValues(buf);
    for (var i = 0; i < buf.length; i++) out += abc[buf[i] % abc.length];
    return prefisso + '_' + out;
  }

  return {
    contiVoce: contiVoce, pctVoce: pctVoce, misure: misure, criterio: criterio,
    stoAttivo: stoAttivo, stoCorrente: stoCorrente, riepilogoProgramma: riepilogoProgramma,
    learnUnit: learnUnit, riepilogoSeduta: riepilogoSeduta, programma: prog,
    oggiISO: oggiISO, formatoData: formatoData, giorniFa: giorniFa, quando: quando, nuovoId: nuovoId,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Modello;
