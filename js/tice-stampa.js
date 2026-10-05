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
    if (a.scala === 'percentuale') parti.push('dato in %');
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
    var perc = a.scala === 'percentuale';
    var marcate = perc ? 0 : (+a.prove || 0);
    var righe = Math.max(1, Math.ceil(marcate / col));
    var stile = ' style="--c:' + colore + ';--t:' + tinta(colore, 0.16) + '"';
    var totale = function (r) {
      if (r < righe - 1) return '<td class="st-tot"></td>';
      var testo = perc ? '<b></b> %' : '<b></b> / ' + (marcate || '<b></b>');
      return '<td class="st-tot">' + testo + (a.cronometro ? '<div class="st-crono"><i class="fa-solid fa-stopwatch"></i> ____ s</div>' : '') + '</td>';
    };
    var etTarget = function (t, extra) {
      if (!t) return '<td class="st-target vuoto">target: ______________</td>';
      return '<td class="st-target">' + (extra ? '<span class="st-mini">' + extra + '</span> ' : '') + esc(t.testo) + '</td>';
    };
    var info = '<td class="st-info" rowspan="' + (righe + (opz.mantenimento && v.ultimoChiuso ? 1 : 0)) + '">' +
      '<div class="st-att-nome"><span class="st-pallino"></span>' + esc(a.nome) + '</div>' +
      (v.modalita && v.modalita.toLowerCase() !== String(a.nome).toLowerCase() ? '<div class="st-mod">' + esc(v.modalita) + '</div>' : '') +
      '<div class="st-meta">' + strategia(v) + (a.cronometro ? ' <span class="st-badge chiaro" title="Cronometrata"><i class="fa-solid fa-stopwatch"></i></span>' : '') +
      ' <span class="st-crit">' + esc(criterio(a)) + '</span></div>' +
      (opz.prossimi && v.prossimo ? '<div class="st-poi">poi: ' + esc(v.prossimo.testo) + '</div>' : '') + '</td>';
    var html = '<table class="st-att"' + stile + '><tbody>';
    for (var r = 0; r < righe; r++) {
      html += '<tr>' + (r === 0 ? info : '') +
        (r === 0 ? etTarget(v.corrente, v.mantenimento ? 'mant.' : '') : '<td class="st-target segue">↳ segue</td>') +
        rigaCaselle(col, marcate, r * col) + totale(r) + '</tr>';
    }
    if (opz.mantenimento && v.ultimoChiuso) {
      html += '<tr class="st-mant">' + etTarget(v.ultimoChiuso, 'mant.') + rigaCaselle(col, 0, 0) + '<td class="st-tot"><b></b> / <b></b></td></tr>';
    }
    return html + '</tbody></table>';
  }
  function foglioLU(p, elenco, colori, opz) {
    var html = '<section class="st-foglio st-lu">' + testata(p, 'Presa dati · learn unit', { data: opz.data, seduta: true }) +
      '<div class="st-legenda"><b>+</b> corretta <b>−</b> errore <b>P</b> con aiuto <b>NR</b> nessuna risposta' +
      '<span class="st-sep"></span><span class="st-c on demo"></span> prove previste' +
      '<span class="st-sep"></span><span class="st-badge">T/D</span> time delay <span class="st-badge chiaro">IND</span> indipendente</div>';
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

  /**
   * L'HTML da stampare.
   * opz: { ids: [idAttività], lu: bool, ta: bool, colonne: 10|15, colonneTA: 10|15|20,
   *        mantenimento: bool, prossimi: bool, data: 'gg/mm/aaaa' }
   */
  function html(p, opz, dip) {
    opz = Object.assign({ lu: true, ta: true, colonne: 10, colonneTA: 15, mantenimento: true, prossimi: true }, opz || {});
    var tutte = voci(p, dip);
    var scelte = tutte.filter(function (v) { return !opz.ids || opz.ids.indexOf(v.att.id) >= 0; });
    var colori = {};
    scelte.forEach(function (v, i) { colori[v.att.id] = PALETTE[i % PALETTE.length]; });
    var out = '';
    var lu = scelte.filter(function (v) { return !v.ta; });
    if (opz.lu && lu.length) out += foglioLU(p, lu, colori, opz);
    var ta = scelte.filter(function (v) { return v.ta; });
    if (opz.ta && ta.length) out += foglioTA(p, ta, colori, opz, dip.P);
    return out;
  }

  return { PALETTE: PALETTE, ICONE: ICONE, voci: voci, html: html };
});
