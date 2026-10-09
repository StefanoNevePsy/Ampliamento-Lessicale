/**
 * Griglie da stampare (A4) per prendere i dati su carta e ricopiarli dopo:
 *   - presa dati delle learn unit: una riga per attività, con il target in
 *     corso e tante caselle; le prove previste (es. 10 LU) sono già marcate
 *     col colore dell'attività;
 *   - task analysis: un passo per riga, una colonna per ogni presentazione,
 *     in fondo indipendenti, data e operatore.
 * Le attività sono raggruppate per categoria (js/tice-modalita.js), ognuna
 * col suo colore e i simboli della strategia (T/D, IND, cronometro).
 *
 * Modulo puro: riceve programma e modalità, restituisce l'HTML del foglio
 * (gli stili sono in css/tice.css, sezione "stampa"). Si prova in Node.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceStampa = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Colori ben distinguibili anche stampati e fotocopiati in bianco e nero (luminosità diverse)
  var PALETTE = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#148f77', '#a93279', '#5d6d7e', '#3949ab', '#8d6e63', '#d35400', '#0e6655'];
  var ICONE = {
    speaker: 'comment-dots', listener: 'ear-listen', imitazione: 'clone', cognitivi: 'brain',
    motricita: 'hand', autonomie: 'person-walking', sociale: 'people-group', comportamento: 'hourglass-half', altro: 'shapes',
  };
  var CHIUSI = ['criterio', 'repertorio', 'chiuso'];
  // in percentuale: per scelta, o perché l'attività non ha target
  var perc = function (a) { return a.scala === 'percentuale' || (!(+a.prove > 0) && !(a.target || []).length); };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function tinta(hex, alfa) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alfa + ')';
  }

  /**
   * Le attività da stampare, con quello che serve al foglio.
   * dip: { P: TiceProgramma, M: TiceModalita, diz }
   */
  function voci(p, dip) {
    var P = dip.P, M = dip.M, diz = dip.diz || {};
    var ordine = M.elenco(diz).categorie.map(function (c) { return c.id; });
    var lista = P.programma(p).attivita.filter(function (a) { return a.stato !== 'terminato'; }).map(function (a, i) {
      var c = P.targetCorrente(a);
      var corrente = c ? c.target : null;
      var cat = M.categoriaDi(a, diz) || { id: 'altro', nome: a.area || 'Altre attività' };
      var t = a.target || [];
      var chiusi = t.filter(function (x) { return CHIUSI.indexOf(x.stato) >= 0; });
      return {
        att: a, indice: i,
        categoria: cat, icona: ICONE[cat.id] || ICONE.altro,
        modalita: M.etichetta(a, diz),
        corrente: corrente, mantenimento: c ? c.mantenimento : false,
        prossimo: P.prossimoTarget(a),
        ultimoChiuso: c && !c.mantenimento && chiusi.length ? chiusi[chiusi.length - 1] : null,
        ta: !!(corrente && P.passiDi(corrente).length) || a.mode === 'quaderno_task',
        attiva: a.stato === 'attivo',
      };
    });
    var pos = function (v) { var k = ordine.indexOf(v.categoria.id); return k < 0 ? 500 : k; };
    return lista.sort(function (x, y) { return pos(x) - pos(y) || x.indice - y.indice; });
  }

  function strategia(v) {
    var a = v.att;
    if (a.risposte === 'ecoico') return '<span class="st-badge" title="Echo to tact">ECO</span>';
    if (a.sessionType === 'timedelay') {
      var s = (v.corrente && v.corrente.tdSeconds) || a.tdSeconds;
      return '<span class="st-badge" title="Time delay">T/D' + (s ? ' ' + esc(s) + '″' : '') + '</span>';
    }
    return '<span class="st-badge chiaro" title="Indipendente">IND</span>';
  }
  function criterio(a) {
    var c = a.criterio || {};
    var parti = [];
    if (c.soglia) parti.push(c.soglia + '% × ' + (c.sedute || 2) + ' gg');
    if (a.prove) parti.push(a.prove + ' prove');
    if (perc(a)) parti.push('dato in %');
    return parti.join(' · ');
  }
  function testata(p, titolo, opz) {
    return '<header class="st-testa">' +
      '<div class="st-tit"><img class="st-logo" src="img/tice/logo-scuro.svg" alt="">' +
      '<div><div class="st-eti">' + esc(titolo) + '</div><div class="st-bambino">' + esc(p.name) + '</div></div></div>' +
      '<table class="st-campi"><tr><th>Data</th><td>' + esc(opz.data || '') + '</td></tr><tr><th>Operatore</th><td></td></tr>' +
      (opz.seduta ? '<tr><th>Seduta</th><td></td></tr>' : '') + '</table></header>';
  }

  // ---------- presa dati delle learn unit ----------
  function rigaCaselle(n, marcate, inizio) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var k = inizio + i;
      out += '<td class="st-c' + (k < marcate ? ' on' : '') + '"><span>' + (k + 1) + '</span></td>';
    }
    return out;
  }
  function bloccoLU(v, colore, opz) {
    var a = v.att, col = opz.colonne;
    var inPerc = perc(a);
    var marcate = inPerc ? 0 : (+a.prove || 0);
    var base = Math.max(1, Math.ceil(marcate / col));
    var righe = Math.max(base, v.righe || 0);
    var stile = ' style="--c:' + colore + ';--t:' + tinta(colore, 0.16) + '"';
    var totale = function (r) {
      if (r < righe - 1) return '<td class="st-tot"></td>';
      var testo = inPerc ? '<b></b> %' : righe > base || !marcate ? '<b></b> / <b></b>' + (marcate ? '<div class="st-min">previste ' + marcate + '</div>' : '') : '<b></b> / ' + marcate;
      return '<td class="st-tot">' + testo + (a.cronometro ? '<div class="st-crono"><i class="fa-solid fa-stopwatch"></i> ____ s</div>' : '') + '</td>';
    };
    var etTarget = function (t, extra) {
      if (!t) return '<td class="st-target vuoto">target: ______________</td>';
      return '<td class="st-target">' + (extra ? '<span class="st-mini">' + extra + '</span> ' : '') + esc(t.testo) + '</td>';
    };
    // più prese dati nella stessa attività (Categorizza, Tact mix…): come sul quaderno,
    // la riga del target e sotto ogni presa con le sue righe di caselle e il suo totale
    var misure = (a.misure || []).length >= 2 ? a.misure : null;
    var nRighe = misure ? 1 + misure.length * righe : righe;
    var info = '<td class="st-info" rowspan="' + (nRighe + (opz.mantenimento && v.ultimoChiuso ? 1 : 0)) + '">' +
      '<div class="st-att-nome"><span class="st-pallino"></span>' + esc(a.nome) + '</div>' +
      (v.modalita && v.modalita.toLowerCase() !== String(a.nome).toLowerCase() ? '<div class="st-mod">' + esc(v.modalita) + '</div>' : '') +
      '<div class="st-meta">' + strategia(v) + (a.cronometro ? ' <span class="st-badge chiaro" title="Cronometrata"><i class="fa-solid fa-stopwatch"></i></span>' : '') +
      ' <span class="st-crit">' + esc(criterio(a)) + '</span></div>' +
      (opz.prossimi && v.prossimo ? '<div class="st-poi">poi: ' + esc(v.prossimo.testo) + '</div>' : '') + '</td>';
    var html = '<table class="st-att"' + stile + '><tbody>';
    if (misure) {
      html += '<tr class="st-capo">' + info + etTarget(v.corrente, v.mantenimento ? 'mant.' : '') + '<td class="st-capo-spazio" colspan="' + (col + 1) + '"></td></tr>';
      misure.forEach(function (m) {
        for (var rm = 0; rm < righe; rm++) {
          html += '<tr class="st-sub' + (rm === 0 ? ' inizio' : '') + (rm === righe - 1 ? ' fine' : '') + '">' +
            '<td class="st-target st-presa">' + (rm === 0 ? '– ' + esc(m.nome) + (m.tipo ? ' <span class="st-badge' + (m.tipo === 'independent' ? ' chiaro' : '') + '">' + ({ independent: 'IND', timedelay: 'T/D', ecoico: 'ECO' })[m.tipo] + '</span>' : '') + (m.mantenimento ? ' <span class="st-mini">mant.</span>' : '') : '') + '</td>' +
            rigaCaselle(col, marcate, rm * col) + totale(rm) + '</tr>';
        }
      });
    }
    for (var r = 0; r < (misure ? 0 : righe); r++) {
      html += '<tr>' + (r === 0 ? info : '') +
        (r === 0 ? etTarget(v.corrente, v.mantenimento ? 'mant.' : '') : '<td class="st-target segue">' + (r === 1 ? '↳ segue' : '') + '</td>') +
        rigaCaselle(col, marcate, r * col) + totale(r) + '</tr>';
    }
    if (opz.mantenimento && v.ultimoChiuso) {
      html += '<tr class="st-mant">' + etTarget(v.ultimoChiuso, 'mant.') + rigaCaselle(col, 0, 0) + '<td class="st-tot"><b></b> / <b></b></td></tr>';
    }
    return html + '</tbody></table>';
  }
  function foglioLU(p, elenco, colori, opz) {
    var html = '<section class="st-foglio st-lu">' + testata(p, 'Presa dati · learn unit', { data: opz.data, seduta: true }) +
      '<div class="st-legenda"><b>+</b> corretta' +
      '<span class="st-sep"></span><span class="st-badge">T/D</span> time delay: <b>P</b> promptata' +
      '<span class="st-sep"></span><span class="st-badge chiaro">IND</span> indipendente: <b>−</b> errata' +
      '<span class="st-sep"></span><span class="st-badge">ECO</span> echo to tact: <b>e+</b> ecoica, <b>−</b> errata' +
      '<span class="st-sep"></span><span class="st-c on demo"></span> prove previste</div>';
    var cat = null;
    elenco.forEach(function (v) {
      if (!cat || cat !== v.categoria.id) {
        cat = v.categoria.id;
        html += '<div class="st-cat"><i class="fa-solid fa-' + v.icona + '"></i> ' + esc(v.categoria.nome) + '</div>';
      }
      html += bloccoLU(v, colori[v.att.id], opz);
    });
    html += '<div class="st-note"><div class="st-eti">Note della seduta</div></div>';
    return html + '</section>';
  }

  // ---------- task analysis ----------
  function bloccoTA(v, colore, opz, P) {
    var a = v.att, t = v.corrente, passi = t ? P.passiDi(t) : [], col = opz.colonneTA;
    var stile = ' style="--c:' + colore + ';--t:' + tinta(colore, 0.16) + '"';
    var testaCol = '';
    for (var i = 0; i < col; i++) testaCol += '<th class="st-n">' + (i + 1) + '</th>';
    var vuote = function (cls) { var s = ''; for (var i = 0; i < col; i++) s += '<td class="st-c ' + (cls || '') + '"></td>'; return s; };
    var cols = '<colgroup><col class="st-num"><col class="st-passo-t">';
    for (var j = 0; j < col; j++) cols += '<col>';
    var html = '<div class="st-blocco-ta"><table class="st-tabta"' + stile + '>' + cols + '</colgroup><thead>' +
      '<tr><th colspan="' + (col + 2) + '" class="st-banda"><span class="st-pallino"></span>' + esc(a.nome) + (t ? ' — ' + esc(t.testo) : '') +
      ' <span class="st-meta">' + strategia(v) + ' <span class="st-crit">' + esc(criterio(a)) + '</span></span></th></tr>' +
      '<tr><th class="st-num">#</th><th class="st-passo-t">Passo</th>' + testaCol + '</tr></thead><tbody>';
    (passi.length ? passi : [{ testo: '' }, { testo: '' }, { testo: '' }, { testo: '' }, { testo: '' }]).forEach(function (x, k) {
      html += '<tr><th class="st-num">' + (k + 1) + '</th><td class="st-passo">' + esc(x.testo) + '</td>' + vuote() + '</tr>';
    });
    html += '<tr class="st-piede primo"><th colspan="2">Indipendenti / passi</th>' + vuote('tot') + '</tr>' +
      '<tr class="st-piede"><th colspan="2">Data</th>' + vuote('data') + '</tr>' +
      '<tr class="st-piede"><th colspan="2">Operatore</th>' + vuote('data') + '</tr>' +
      '</tbody></table>' +
      (t && t.suggerimento ? '<div class="st-note piccola"><div class="st-eti">Suggerimenti</div>' + esc(t.suggerimento) + '</div>' : '') +
      '</div>';
    return html;
  }
  function foglioTA(p, elenco, colori, opz, P) {
    return '<section class="st-foglio st-ta">' + testata(p, 'Task analysis', { data: opz.data }) +
      '<div class="st-legenda"><b>+</b> indipendente <b>P</b> con aiuto <b>−</b> non eseguito <b>/</b> non proposto<span class="st-sep"></span>una colonna per ogni presentazione</div>' +
      elenco.map(function (v) { return bloccoTA(v, colori[v.att.id], opz, P); }).join('') + '</section>';
  }

  // ---------- quante righe per attività ----------
  // Misure in mm come nel CSS: servono a riempire il foglio senza sforare.
  var MM = { pagina: 278, testata: 31, note: 28, cat: 9, riga: 8.5, mant: 6.5, spazio: 1.4, margine: 4 };
  function righeBase(v, col) {
    var a = v.att, marcate = perc(a) ? 0 : (+a.prove || 0);
    return Math.max(1, Math.ceil(marcate / col));
  }
  function altezzaInfo(v, opz) {
    var a = v.att, h = 2.4 + 4.2 * Math.max(1, Math.ceil(String(a.nome).length / 26)) + 3.8;
    if (v.modalita && v.modalita.toLowerCase() !== String(a.nome).toLowerCase()) h += 3;
    if (opz.prossimi && v.prossimo) h += 3.2;
    return h;
  }
  function altezzaBlocco(v, righe, opz) {
    var mant = opz.mantenimento && v.ultimoChiuso ? MM.mant : 0;
    var n = (v.att.misure || []).length >= 2 ? v.att.misure.length : 1;
    return Math.max(righe * n * MM.riga + (n > 1 ? MM.mant : 0) + mant, altezzaInfo(v, opz)) + MM.spazio;
  }
  /**
   * Righe per ogni attività (v.righe):
   *   spazio 'previste' → solo le prove previste; 'piu1' / 'piu2' → righe in più;
   *   'riempi' → le righe libere del foglio (o dell'ultimo foglio) distribuite,
   *   prima alle attività in percentuale, che a volte arrivano a 40-50 LU.
   * opz.lu_<id>: LU da prevedere per quell'attività (vince sul resto).
   */
  function pianificaRighe(elenco, opz) {
    var col = opz.colonne, spazio = opz.spazio || 'riempi';
    var fisse = {};
    elenco.forEach(function (v) {
      var base = righeBase(v, col), chieste = +(opz.luPer && opz.luPer[v.att.id]) || 0;
      if (chieste) { v.righe = Math.max(base, Math.ceil(chieste / col)); fisse[v.att.id] = true; }
      else v.righe = base + (spazio === 'piu1' ? 1 : spazio === 'piu2' ? 2 : 0);
    });
    if (spazio !== 'riempi') return;
    var categorie = {};
    elenco.forEach(function (v) { categorie[v.categoria.id] = true; });
    var usato = function () {
      return MM.testata + MM.note + Object.keys(categorie).length * MM.cat +
        elenco.reduce(function (t, v) { return t + altezzaBlocco(v, v.righe, opz); }, 0);
    };
    var pagine = Math.max(1, Math.ceil(usato() / (MM.pagina - MM.margine)));
    var limite = pagine * MM.pagina - pagine * MM.margine;
    var libere = elenco.filter(function (v) { return !fisse[v.att.id]; })
      .sort(function (x, y) { return perc(y.att) - perc(x.att); });
    if (!libere.length) return;
    // al massimo 6 righe (60-90 LU) per attività: oltre si sceglie a mano
    for (var giro = 0; giro < 6; giro++) {
      var aggiunte = 0;
      for (var i = 0; i < libere.length; i++) {
        var v = libere[i];
        // le attività in percentuale prendono due righe a giro
        var passo = perc(v.att) ? 2 : 1;
        var prima = v.righe;
        v.righe += passo;
        if (usato() > limite) { v.righe = prima; continue; }
        aggiunte++;
      }
      if (!aggiunte) break;
    }
  }

  /**
   * L'HTML da stampare.
   * opz: { ids: [idAttività], lu: bool, ta: bool, colonne: 10|15, colonneTA: 10|15|20,
   *        spazio: 'riempi'|'previste'|'piu1'|'piu2', luPer: { idAttività: LU },
   *        mantenimento: bool, prossimi: bool, data: 'gg/mm/aaaa' }
   */
  function html(p, opz, dip) {
    opz = Object.assign({ lu: true, ta: true, colonne: 10, colonneTA: 15, mantenimento: true, prossimi: true }, opz || {});
    var tutte = voci(p, dip);
    var scelte = tutte.filter(function (v) { return !opz.ids || opz.ids.indexOf(v.att.id) >= 0; });
    var colori = {};
    scelte.forEach(function (v, i) { colori[v.att.id] = dip && dip.P && dip.P.coloreDi ? dip.P.coloreDi(p, v.att) : PALETTE[i % PALETTE.length]; });
    var out = '';
    var lu = scelte.filter(function (v) { return !v.ta; });
    if (opz.lu && lu.length) { pianificaRighe(lu, opz); out += foglioLU(p, lu, colori, opz); }
    var ta = scelte.filter(function (v) { return v.ta; });
    if (opz.ta && ta.length) out += foglioTA(p, ta, colori, opz, dip.P);
    return out;
  }

  return { PALETTE: PALETTE, ICONE: ICONE, voci: voci, html: html, pianificaRighe: pianificaRighe };
});
