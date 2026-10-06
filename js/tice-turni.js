/**
 * Turni del Centro TICE, come il foglio fatto a mano: per ogni giornata le
 * colonne sono i bambini in carico, le righe le fasce orarie, negli incroci
 * chi prende il bambino (un terapeuta, un tirocinante o una coppia).
 * Si salva una settimana per volta (chiave = il lunedì, AAAA-MM-GG); le
 * persone dei turni a parte.
 *   settimana: { giorni: { 'AAAA-MM-GG': { bambini: [pid], da: 'HH:MM', a: 'HH:MM', fascia: 60 } },
 *                voci: [{ id, pid, giorno, ora: 'HH:MM', durata, persone: [idPersona], nota }] }
 *   persone:   { persone: [{ id, nome, ruolo: 'terapeuta' | 'tirocinante', email? }] }
 * Modulo puro (niente DOM): calendario, conflitti, copie e la griglia da
 * stampare. Si prova in Node (tools/test-tice-turni.js).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceTurni = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  var GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var COLORI = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#148f77', '#a93279', '#5d6d7e', '#3949ab', '#8d6e63', '#d35400', '#0e6655'];
  var RUOLI = { terapeuta: 'Terapeuta', tirocinante: 'Tirocinante' };

  var due = function (n) { return String(n).padStart(2, '0'); };
  function daIso(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function iso(d) { return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }
  function piu(s, n) { var d = daIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function lunedi(s) { var d = daIso(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
  function giorni(lun, conDomenica) { var out = []; for (var i = 0; i < (conDomenica ? 7 : 6); i++) out.push(piu(lun, i)); return out; }
  function minuti(hhmm) { var p = String(hhmm || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function hhmm(m) { return due(Math.floor(m / 60) % 24) + ':' + due(m % 60); }
  function fine(v) { return hhmm(minuti(v.ora) + (+v.durata || 60)); }
  function nuovoId(p) { return (p || 't') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nomeGiorno(s) { return GIORNI[(daIso(s).getDay() + 6) % 7]; }
  function breveGiorno(s) { return GIORNI_BREVI[(daIso(s).getDay() + 6) % 7]; }
  /** "5–11 ottobre 2026", "28 settembre – 4 ottobre 2026" */
  function titoloSettimana(lun, conDomenica) {
    var a = daIso(lun), b = daIso(piu(lun, conDomenica ? 6 : 5));
    if (a.getMonth() === b.getMonth()) return a.getDate() + '–' + b.getDate() + ' ' + MESI[a.getMonth()] + ' ' + a.getFullYear();
    return a.getDate() + ' ' + MESI[a.getMonth()] + ' – ' + b.getDate() + ' ' + MESI[b.getMonth()] + ' ' + b.getFullYear();
  }
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function colore(pid) { return COLORI[hash(pid) % COLORI.length]; }
  function tinta(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function ordina(voci) {
    return (voci || []).slice().sort(function (a, b) { return a.giorno.localeCompare(b.giorno) || a.ora.localeCompare(b.ora); });
  }

  /**
   * Sovrapposizioni: la stessa persona o lo stesso bambino in due turni che
   * si accavallano. → { idTurno: ['Elisa è già con Luca alle 9:00', ...] }
   */
  function conflitti(voci, nomePersona, nomeBambino, oraTesto) {
    var out = {}, l = ordina(voci);
    oraTesto = oraTesto || function (x) { return x; };
    var segna = function (id, m) { (out[id] = out[id] || []).push(m); };
    for (var i = 0; i < l.length; i++) {
      for (var j = i + 1; j < l.length; j++) {
        var a = l[i], b = l[j];
        if (a.giorno !== b.giorno) break;
        if (minuti(b.ora) >= minuti(a.ora) + (+a.durata || 60)) continue;
        (a.persone || []).forEach(function (p) {
          if ((b.persone || []).indexOf(p) < 0) return;
          var n = nomePersona ? nomePersona(p) : p;
          segna(a.id, n + ' è anche con ' + (nomeBambino ? nomeBambino(b.pid) : b.pid) + ' alle ' + oraTesto(b.ora));
          segna(b.id, n + ' è anche con ' + (nomeBambino ? nomeBambino(a.pid) : a.pid) + ' alle ' + oraTesto(a.ora));
        });
        if (a.pid && a.pid === b.pid) {
          segna(a.id, 'Il bambino ha già un turno alle ' + oraTesto(b.ora));
          segna(b.id, 'Il bambino ha già un turno alle ' + oraTesto(a.ora));
        }
      }
    }
    return out;
  }

  /** Le ore da mostrare: dalle 8 alle 19, allargate per far stare tutti i turni. */
  function intervallo(voci) {
    var da = 8 * 60, a = 19 * 60;
    (voci || []).forEach(function (v) { da = Math.min(da, Math.floor(minuti(v.ora) / 60) * 60); a = Math.max(a, Math.ceil((minuti(v.ora) + (+v.durata || 60)) / 60) * 60); });
    var ore = [];
    for (var m = da; m < a; m += 60) ore.push(m);
    return ore;
  }

  /** I turni di una settimana spostati su un'altra (nuovi id), senza doppioni. */
  function copia(voci, daLun, aLun, esistenti) {
    var spost = Math.round((daIso(aLun) - daIso(daLun)) / 86400000);
    var gia = {};
    (esistenti || []).forEach(function (v) { gia[v.pid + '|' + v.giorno + '|' + v.ora] = true; });
    return (voci || []).map(function (v) {
      return { id: nuovoId(), pid: v.pid, giorno: piu(v.giorno, spost), ora: v.ora, durata: v.durata, persone: (v.persone || []).slice(), nota: v.nota || '' };
    }).filter(function (v) { return !gia[v.pid + '|' + v.giorno + '|' + v.ora]; });
  }

  /** Ore di turno per persona nella settimana: { idPersona: minuti } */
  function oreDi(voci) {
    var out = {};
    (voci || []).forEach(function (v) { (v.persone || []).forEach(function (p) { out[p] = (out[p] || 0) + (+v.durata || 60); }); });
    return out;
  }

  // ---------- la giornata ----------
  var GIORNATA = { da: '08:00', a: '19:00', fascia: 60 };
  function vuota() { return { giorni: {}, voci: [] }; }
  /** Impostazioni e bambini della giornata (anche quelli con turni ma non in elenco). */
  function giornata(sett, g) {
    sett = sett || vuota();
    var c = Object.assign({}, GIORNATA, (sett.giorni || {})[g] || {});
    var voci = (sett.voci || []).filter(function (v) { return v.giorno === g; });
    var bambini = (c.bambini || []).slice();
    voci.forEach(function (v) { if (bambini.indexOf(v.pid) < 0) bambini.push(v.pid); });
    var fasce = [];
    for (var m = minuti(c.da); m < minuti(c.a); m += (+c.fascia || 60)) fasce.push(hhmm(m));
    // fasce fuori orario che hanno turni restano visibili
    voci.forEach(function (v) { if (fasce.indexOf(v.ora) < 0) fasce.push(v.ora); });
    fasce.sort();
    var celle = {};
    voci.forEach(function (v) { celle[v.pid + '|' + v.ora] = v; });
    return { giorno: g, da: c.da, a: c.a, fascia: +c.fascia || 60, bambini: bambini, fasce: fasce, celle: celle, voci: voci };
  }
  /** Chi è in una cella: imposta (o toglie, con persone vuote) il turno. Restituisce la settimana cambiata. */
  function impostaCella(sett, g, pid, ora, persone, opz) {
    sett = sett || vuota();
    sett.voci = sett.voci || [];
    var i = -1;
    sett.voci.forEach(function (v, k) { if (v.giorno === g && v.pid === pid && v.ora === ora) i = k; });
    var fascia = (giornata(sett, g).fascia) || 60;
    if (!persone || !persone.length) {
      if (i >= 0 && !(opz && opz.nota)) sett.voci.splice(i, 1);
      else if (i >= 0) { sett.voci[i].persone = []; sett.voci[i].nota = opz.nota; }
      return sett;
    }
    if (i >= 0) { sett.voci[i].persone = persone.slice(); if (opz && opz.nota != null) sett.voci[i].nota = opz.nota; }
    else sett.voci.push({ id: nuovoId(), pid: pid, giorno: g, ora: ora, durata: fascia, persone: persone.slice(), nota: (opz && opz.nota) || '' });
    return sett;
  }
  /** Una persona in più o in meno in una cella (per l'assegnazione a pennello). */
  function alternaPersona(sett, g, pid, ora, persona) {
    var v = giornata(sett, g).celle[pid + '|' + ora];
    var p = v ? (v.persone || []).slice() : [];
    var k = p.indexOf(persona);
    if (k >= 0) p.splice(k, 1); else p.push(persona);
    return impostaCella(sett, g, pid, ora, p, v && v.nota ? { nota: v.nota } : null);
  }
  function impostaGiornata(sett, g, campi) {
    sett = sett || vuota();
    sett.giorni = sett.giorni || {};
    sett.giorni[g] = Object.assign({}, GIORNATA, sett.giorni[g] || {}, campi);
    return sett;
  }
  /** Chi è già occupato in quella fascia (con quale bambino): { idPersona: pid } */
  function occupati(sett, g, ora, tranne) {
    var out = {}, m = minuti(ora);
    ((sett && sett.voci) || []).forEach(function (v) {
      if (v.giorno !== g || v.pid === tranne) return;
      if (m >= minuti(v.ora) && m < minuti(v.ora) + (+v.durata || 60)) (v.persone || []).forEach(function (p) { out[p] = v.pid; });
    });
    return out;
  }
  /** Copia una giornata (bambini, orari e turni) su un'altra; la destinazione viene sostituita. */
  function copiaGiornata(da, gDa, verso, gVerso) {
    verso = verso || vuota();
    var src = giornata(da, gDa);
    verso.voci = (verso.voci || []).filter(function (v) { return v.giorno !== gVerso; }).concat(src.voci.map(function (v) {
      return { id: nuovoId(), pid: v.pid, giorno: gVerso, ora: v.ora, durata: v.durata, persone: (v.persone || []).slice(), nota: v.nota || '' };
    }));
    verso = impostaGiornata(verso, gVerso, { bambini: src.bambini.slice(), da: src.da, a: src.a, fascia: src.fascia });
    return verso;
  }

  // ---------- la griglia da stampare (A4 orizzontale) ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /**
   * dip: { nomeBambino(pid), persone: [...], oraTesto(hhmm), conDomenica, perPersona, vuota }
   * vuota: la griglia senza turni, da compilare a mano.
   */
  function stampa(lun, voci, dip) {
    var gg = giorni(lun, dip.conDomenica);
    var l = dip.vuota ? [] : ordina(voci);
    var ore = intervallo(l);
    var oraT = dip.oraTesto || function (x) { return x; };
    var perId = {};
    (dip.persone || []).forEach(function (p) { perId[p.id] = p; });
    var nomeP = function (id) { return perId[id] ? perId[id].nome : '?'; };
    var conf = conflitti(l, nomeP, dip.nomeBambino, oraT);
    var html = '<section class="st-foglio st-turni"><header class="st-testa"><div class="st-tit"><img class="st-logo" src="img/tice/logo-scuro.svg" alt="">' +
      '<div><div class="st-eti">Turni della settimana</div><div class="st-bambino">' + esc(titoloSettimana(lun, dip.conDomenica)) + '</div></div></div>' +
      '<div class="st-legenda st-legenda-turni">' + (dip.persone || []).length + ' persone · ' + l.length + ' turni</div></header>' +
      '<table class="st-tturni"><colgroup><col class="st-colora">' + gg.map(function () { return '<col>'; }).join('') + '</colgroup>' +
      '<thead><tr><th></th>' + gg.map(function (g) { return '<th><span class="st-gg">' + esc(breveGiorno(g)) + '</span> ' + daIso(g).getDate() + '</th>'; }).join('') + '</tr></thead><tbody>';
    ore.forEach(function (m) {
      html += '<tr><th class="st-ora">' + esc(oraT(hhmm(m))) + '</th>';
      gg.forEach(function (g) {
        var qui = l.filter(function (v) { return v.giorno === g && minuti(v.ora) >= m && minuti(v.ora) < m + 60; });
        html += '<td>' + qui.map(function (v) {
          var c = colore(v.pid);
          return '<div class="st-turno" style="--c:' + c + ';--t:' + tinta(c, 0.14) + '">' +
            '<b>' + esc(dip.nomeBambino(v.pid)) + '</b> <span class="st-quando">' + esc(oraT(v.ora)) + '–' + esc(oraT(fine(v))) + '</span>' +
            (conf[v.id] ? ' <span class="st-attenzione" title="' + esc(conf[v.id].join(' · ')) + '">!</span>' : '') +
            '<div class="st-chi">' + ((v.persone || []).map(nomeP).map(esc).join(' + ') || '<i>da assegnare</i>') + '</div>' +
            (v.nota ? '<div class="st-nota-t">' + esc(v.nota) + '</div>' : '') + '</div>';
        }).join('') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></section>';
    if (dip.perPersona && !dip.vuota && (dip.persone || []).length) {
      var ore2 = oreDi(l);
      html += '<section class="st-foglio st-turni"><header class="st-testa"><div class="st-tit"><img class="st-logo" src="img/tice/logo-scuro.svg" alt="">' +
        '<div><div class="st-eti">Turni per persona</div><div class="st-bambino">' + esc(titoloSettimana(lun, dip.conDomenica)) + '</div></div></div></header>' +
        '<table class="st-tturni st-perpersona"><colgroup><col class="st-colnome">' + gg.map(function () { return '<col>'; }).join('') + '<col class="st-colore"></colgroup>' +
        '<thead><tr><th>Persona</th>' + gg.map(function (g) { return '<th><span class="st-gg">' + esc(breveGiorno(g)) + '</span> ' + daIso(g).getDate() + '</th>'; }).join('') + '<th>Ore</th></tr></thead><tbody>';
      dip.persone.forEach(function (p) {
        html += '<tr><th class="st-pnome">' + esc(p.nome) + '<div class="st-ruolo">' + esc(RUOLI[p.ruolo] || '') + '</div></th>';
        gg.forEach(function (g) {
          html += '<td>' + l.filter(function (v) { return v.giorno === g && (v.persone || []).indexOf(p.id) >= 0; }).map(function (v) {
            var c = colore(v.pid);
            return '<div class="st-turno" style="--c:' + c + ';--t:' + tinta(c, 0.14) + '"><span class="st-quando">' + esc(oraT(v.ora)) + '</span> <b>' + esc(dip.nomeBambino(v.pid)) + '</b></div>';
          }).join('') + '</td>';
        });
        var mm = ore2[p.id] || 0;
        html += '<td class="st-ore">' + (mm ? Math.floor(mm / 60) + (mm % 60 ? ':' + due(mm % 60) : '') + ' h' : '—') + '</td></tr>';
      });
      html += '</tbody></table></section>';
    }
    return html;
  }

  /**
   * La giornata da stampare: bambini in colonna, fasce in riga, nelle celle
   * chi li prende. dip: { nomeBambino, persone, oraTesto, vuota, perPersona }
   */
  function stampaGiornata(sett, g, dip) {
    var gi = giornata(sett, g);
    var oraT = dip.oraTesto || function (x) { return x; };
    var perId = {};
    (dip.persone || []).forEach(function (p) { perId[p.id] = p; });
    var nomeP = function (id) { return perId[id] ? perId[id].nome : '?'; };
    var conf = conflitti(gi.voci, nomeP, dip.nomeBambino, oraT);
    var d = daIso(g);
    var titolo = GIORNI[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
    var html = '<section class="st-foglio st-turni"><header class="st-testa"><div class="st-tit"><img class="st-logo" src="img/tice/logo-scuro.svg" alt="">' +
      '<div><div class="st-eti">Turni della giornata</div><div class="st-bambino">' + esc(titolo) + '</div></div></div>' +
      '<div class="st-legenda st-legenda-turni">' + gi.bambini.length + ' bambini · fasce di ' + gi.fascia + ' minuti</div></header>' +
      '<table class="st-tturni st-giornata"><colgroup><col class="st-colora">' + gi.bambini.map(function () { return '<col>'; }).join('') + '</colgroup>' +
      '<thead><tr><th></th>' + gi.bambini.map(function (pid) { var c = colore(pid); return '<th class="st-bcol" style="--c:' + c + ';--t:' + tinta(c, 0.16) + '">' + esc(dip.nomeBambino(pid)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    gi.fasce.forEach(function (ora) {
      html += '<tr><th class="st-ora">' + esc(oraT(ora)) + '<span class="st-ora-fine">' + esc(oraT(hhmm(minuti(ora) + gi.fascia))) + '</span></th>';
      gi.bambini.forEach(function (pid) {
        var v = dip.vuota ? null : gi.celle[pid + '|' + ora];
        var c = colore(pid);
        html += '<td class="st-cella' + (v && conf[v.id] ? ' st-conf' : '') + '" style="--c:' + c + ';--t:' + tinta(c, 0.10) + '">' +
          (v ? (v.persone || []).map(function (p) { return '<div class="st-pers">' + esc(nomeP(p)) + '</div>'; }).join('') + (v.nota ? '<div class="st-nota-t">' + esc(v.nota) + '</div>' : '') : '') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (dip.perPersona && !dip.vuota && (dip.persone || []).length) {
      var righe = (dip.persone || []).map(function (p) {
        var suoi = gi.voci.filter(function (v) { return (v.persone || []).indexOf(p.id) >= 0; }).sort(function (a, b) { return a.ora.localeCompare(b.ora); });
        if (!suoi.length) return '';
        return '<tr><th class="st-pnome">' + esc(p.nome) + '<div class="st-ruolo">' + esc(RUOLI[p.ruolo] || '') + '</div></th><td>' +
          suoi.map(function (v) { return '<span class="st-pchip" style="--c:' + colore(v.pid) + '"><b>' + esc(oraT(v.ora)) + '</b> ' + esc(dip.nomeBambino(v.pid)) + '</span>'; }).join(' ') + '</td></tr>';
      }).join('');
      if (righe) html += '<div class="st-eti st-sottot">Per persona</div><table class="st-tturni st-perpersona"><colgroup><col class="st-colnome"><col></colgroup><tbody>' + righe + '</tbody></table>';
    }
    return html + '</section>';
  }

  return {
    vuota: vuota, giornata: giornata, impostaCella: impostaCella, alternaPersona: alternaPersona, impostaGiornata: impostaGiornata,
    occupati: occupati, copiaGiornata: copiaGiornata, stampaGiornata: stampaGiornata, GIORNATA: GIORNATA,
    GIORNI: GIORNI, GIORNI_BREVI: GIORNI_BREVI, RUOLI: RUOLI,
    daIso: daIso, iso: iso, piu: piu, lunedi: lunedi, giorni: giorni, minuti: minuti, hhmm: hhmm, fine: fine,
    nuovoId: nuovoId, nomeGiorno: nomeGiorno, breveGiorno: breveGiorno, titoloSettimana: titoloSettimana,
    colore: colore, tinta: tinta, ordina: ordina, conflitti: conflitti, intervallo: intervallo, copia: copia, oreDi: oreDi, stampa: stampa,
  };
});
