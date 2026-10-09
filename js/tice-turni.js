/**
 * Turni del Centro TICE, come il foglio fatto a mano: per ogni giornata le
 * colonne sono i bambini in carico, le righe le fasce orarie, negli incroci
 * chi prende il bambino (un terapeuta, un tirocinante o una coppia).
 * Si salva una settimana per volta (chiave = il lunedì, AAAA-MM-GG); le
 * persone dei turni a parte.
 *   settimana: { giorni: { 'AAAA-MM-GG': { bambini: [pid], da: 'HH:MM', a: 'HH:MM', fascia: 60 } },
 *                voci: [{ id, pid, giorno, ora: 'HH:MM', durata, persone: [idPersona], nota }] }
 *   persone:   { persone: [{ id, nome, ruolo: 'terapeuta' | 'tirocinante', email? }] }
 *   modello:   la settimana tipo { orari: {da, a, fascia}, ordine: [pid],
 *              voci: [{ id, pid, dow: 1..7 (lunedì = 1), da, a, persone: [] }] }
 * Una giornata che nessuno ha toccato si costruisce dalla settimana tipo
 * ("virtuale"); alla prima modifica diventa propria (giorni[g].proprio) e da
 * lì non segue più la settimana tipo, finché non la si ripristina.
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
  // Di solito si lavora il pomeriggio; d'estate si cambia dagli orari della giornata
  var GIORNATA = { da: '14:10', a: '18:10', fascia: 60 };
  function vuota() { return { giorni: {}, voci: [] }; }
  // ---------- la settimana tipo ----------
  function modelloVuoto() { return { orari: Object.assign({}, GIORNATA), ordine: [], voci: [] }; }
  function dow(g) { return ((daIso(g).getDay() + 6) % 7) + 1; }
  function fasceDi(c) {
    var out = [];
    for (var m = minuti(c.da); m < minuti(c.a); m += (+c.fascia || 60)) out.push(hhmm(m));
    return out;
  }
  /** Dalla settimana tipo: chi viene quel giorno, quando, e con chi di solito. */
  function dalModello(modello, g, c) {
    var out = { bambini: [], presenze: {}, voci: [] };
    if (!modello || (modello.dal && g < modello.dal)) return out;
    var qui = (modello.voci || []).filter(function (x) { return x.dow === dow(g); });
    var ordine = modello.ordine || [];
    qui.sort(function (x, y) { var a = ordine.indexOf(x.pid), b = ordine.indexOf(y.pid); return (a < 0 ? 999 : a) - (b < 0 ? 999 : b) || x.da.localeCompare(y.da); });
    var fasce = fasceDi(c);
    qui.forEach(function (x) {
      if (out.bambini.indexOf(x.pid) < 0) out.bambini.push(x.pid);
      (out.presenze[x.pid] = out.presenze[x.pid] || []).push([x.da, x.a]);
      if (!(x.persone || []).length) return;
      fasce.forEach(function (f) {
        if (f >= x.da && f < x.a) out.voci.push({ id: 'm:' + x.id + ':' + f, pid: x.pid, giorno: g, ora: f, durata: +c.fascia || 60, persone: x.persone.slice(), nota: '', modello: true });
      });
    });
    return out;
  }
  function impostaModello(modello, pid, dowN, dati) {
    modello = modello || modelloVuoto();
    modello.voci = (modello.voci || []).filter(function (x) { return !(x.pid === pid && x.dow === dowN); });
    if (dati) {
      var v = { id: nuovoId('m'), pid: pid, dow: dowN, da: dati.da, a: dati.a, persone: (dati.persone || []).slice() };
      // come è stato calcolato l'orario (tagli di N minuti × quante), per riproporlo
      if (+dati.taglio > 0 && +dati.n > 0) { v.taglio = +dati.taglio; v.n = +dati.n; }
      modello.voci.push(v);
    }
    modello.ordine = modello.ordine || [];
    if (dati && modello.ordine.indexOf(pid) < 0) modello.ordine.push(pid);
    if (!modello.voci.some(function (x) { return x.pid === pid; })) modello.ordine = modello.ordine.filter(function (x) { return x !== pid; });
    return modello;
  }
  /** Il bambino è al centro in quella fascia? (senza orari indicati: sì) */
  function presente(gi, pid, ora) {
    var r = gi.presenze && gi.presenze[pid];
    if (!r || !r.length) return true;
    return r.some(function (x) { return ora >= x[0] && ora < x[1]; });
  }

  /** Impostazioni e bambini della giornata (anche quelli con turni ma non in elenco). */
  function giornata(sett, g, modello) {
    sett = sett || vuota();
    var propria = (sett.giorni || {})[g] || {};
    var c = Object.assign({}, GIORNATA, (modello && modello.orari) || {}, propria);
    var voci = (sett.voci || []).filter(function (v) { return v.giorno === g; });
    // una giornata mai toccata segue la settimana tipo
    var virtuale = !!modello && !propria.proprio && !(propria.bambini || []).length && !voci.length && !!(modello.voci || []).length;
    var presenze = propria.presenze || {};
    if (virtuale) { var dm = dalModello(modello, g, c); voci = dm.voci; presenze = dm.presenze; c.bambini = dm.bambini; }
    var bambini = (c.bambini || []).slice();
    voci.forEach(function (v) { if (bambini.indexOf(v.pid) < 0) bambini.push(v.pid); });
    var fasce = [];
    for (var m = minuti(c.da); m < minuti(c.a); m += (+c.fascia || 60)) fasce.push(hhmm(m));
    // fasce fuori orario che hanno turni restano visibili
    voci.forEach(function (v) { if (fasce.indexOf(v.ora) < 0) fasce.push(v.ora); });
    fasce.sort();
    var celle = {};
    voci.forEach(function (v) { celle[v.pid + '|' + v.ora] = v; });
    // le fasce davvero riempite: dalla prima all'ultima con almeno un turno
    var piene = fasce.filter(function (f) {
      return voci.some(function (v) { return v.ora === f && (v.persone || []).length; }) ||
        Object.keys(presenze).some(function (pid) { return (presenze[pid] || []).some(function (x) { return f >= x[0] && f < x[1]; }); });
    });
    var usate = piene.length ? fasce.slice(fasce.indexOf(piene[0]), fasce.indexOf(piene[piene.length - 1]) + 1) : [];
    return { giorno: g, da: c.da, a: c.a, fascia: +c.fascia || 60, bambini: bambini, fasce: fasce, usate: usate, celle: celle, voci: voci,
      presenze: presenze, virtuale: virtuale, propria: !!propria.proprio };
  }
  /** La giornata virtuale diventa propria (prima di ogni modifica): da qui non segue più la settimana tipo. */
  function materializza(sett, g, modello) {
    sett = sett || vuota();
    var gi = giornata(sett, g, modello);
    sett.giorni = sett.giorni || {};
    if (!gi.virtuale) { sett.giorni[g] = Object.assign({}, sett.giorni[g] || {}, { proprio: true }); return sett; }
    sett.giorni[g] = Object.assign({}, sett.giorni[g] || {}, { da: gi.da, a: gi.a, fascia: gi.fascia, bambini: gi.bambini.slice(), presenze: JSON.parse(JSON.stringify(gi.presenze)), proprio: true });
    sett.voci = (sett.voci || []).filter(function (v) { return v.giorno !== g; }).concat(gi.voci.map(function (v) {
      return { id: nuovoId(), pid: v.pid, giorno: g, ora: v.ora, durata: v.durata, persone: v.persone.slice(), nota: '' };
    }));
    return sett;
  }
  /** Torna alla settimana tipo: via i turni e le impostazioni propri di quel giorno. */
  function ripristina(sett, g) {
    sett = sett || vuota();
    sett.voci = (sett.voci || []).filter(function (v) { return v.giorno !== g; });
    if (sett.giorni) delete sett.giorni[g];
    return sett;
  }
  /** Dove finisce una fascia (l'ultima si ferma all'orario di chiusura). */
  function fineFascia(gi, ora) {
    var f = minuti(ora) + gi.fascia, a = minuti(gi.a);
    return hhmm(minuti(ora) < a && f > a ? a : f);
  }
  /** "14.10", "1410", "9" → "HH:MM" (null se non è un'ora) */
  function leggiOra(t) {
    var x = /^\s*(\d{1,2})(?:[:.,h]?(\d{2}))?\s*$/.exec(String(t || ''));
    if (!x || +x[1] > 23 || +(x[2] || 0) > 59) return null;
    return due(+x[1]) + ':' + due(+(x[2] || 0));
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
  function occupati(sett, g, ora, tranne, modello) {
    var out = {}, m = minuti(ora);
    giornata(sett, g, modello).voci.forEach(function (v) {
      if (v.pid === tranne) return;
      if (m >= minuti(v.ora) && m < minuti(v.ora) + (+v.durata || 60)) (v.persone || []).forEach(function (p) { out[p] = v.pid; });
    });
    return out;
  }
  /** Copia una giornata (bambini, orari e turni) su un'altra; la destinazione viene sostituita. */
  function copiaGiornata(da, gDa, verso, gVerso, modello) {
    verso = verso || vuota();
    var src = giornata(da, gDa, modello);
    verso.voci = (verso.voci || []).filter(function (v) { return v.giorno !== gVerso; }).concat(src.voci.map(function (v) {
      return { id: nuovoId(), pid: v.pid, giorno: gVerso, ora: v.ora, durata: v.durata, persone: (v.persone || []).slice(), nota: v.nota || '' };
    }));
    verso = impostaGiornata(verso, gVerso, { bambini: src.bambini.slice(), da: src.da, a: src.a, fascia: src.fascia, presenze: JSON.parse(JSON.stringify(src.presenze || {})), proprio: true });
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
    var gi = giornata(sett, g, dip.modello);
    var oraT = dip.oraTesto || function (x) { return x; };
    // il foglio si adatta alle ore riempite; vuoto (da compilare) tutte le fasce
    var righeF = dip.vuota || !gi.usate.length ? gi.fasce : gi.usate;
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
    // righe alte quanto serve a riempire la pagina (A4 orizzontale: ~150 mm per la griglia)
    var nPers = dip.perPersona && !dip.vuota ? (dip.persone || []).filter(function (p) { return gi.voci.some(function (v) { return (v.persone || []).indexOf(p.id) >= 0; }); }).length : 0;
    var spazio = 150 - (nPers ? 12 + nPers * 8 : 0);
    var alta = Math.max(11, Math.min(30, Math.floor(spazio / Math.max(1, righeF.length))));
    // nomi tanto più grandi quanto più sono alte le righe
    var fs = alta >= 24 ? 15 : alta >= 18 ? 13 : alta >= 14 ? 11.5 : 10;
    html = html.replace('<table class="st-tturni st-giornata">', '<table class="st-tturni st-giornata" style="--fs:' + fs + 'pt">');
    righeF.forEach(function (ora) {
      html += '<tr style="height:' + alta + 'mm"><th class="st-ora">' + esc(oraT(ora)) + '<span class="st-ora-fine">' + esc(oraT(fineFascia(gi, ora))) + '</span></th>';
      gi.bambini.forEach(function (pid) {
        var v = dip.vuota ? null : gi.celle[pid + '|' + ora];
        var c = colore(pid);
        html += '<td class="st-cella' + (v && conf[v.id] ? ' st-conf' : '') + (!presente(gi, pid, ora) ? ' st-fuori' : '') + '" style="--c:' + c + ';--t:' + tinta(c, 0.10) + '">' +
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
    vuota: vuota, giornata: giornata, modelloVuoto: modelloVuoto, dow: dow, dalModello: dalModello, impostaModello: impostaModello,
    presente: presente, materializza: materializza, ripristina: ripristina, fineFascia: fineFascia, leggiOra: leggiOra, impostaCella: impostaCella, alternaPersona: alternaPersona, impostaGiornata: impostaGiornata,
    occupati: occupati, copiaGiornata: copiaGiornata, stampaGiornata: stampaGiornata, GIORNATA: GIORNATA,
    GIORNI: GIORNI, GIORNI_BREVI: GIORNI_BREVI, RUOLI: RUOLI,
    daIso: daIso, iso: iso, piu: piu, lunedi: lunedi, giorni: giorni, minuti: minuti, hhmm: hhmm, fine: fine,
    nuovoId: nuovoId, nomeGiorno: nomeGiorno, breveGiorno: breveGiorno, titoloSettimana: titoloSettimana,
    colore: colore, tinta: tinta, ordina: ordina, conflitti: conflitti, intervallo: intervallo, copia: copia, oreDi: oreDi, stampa: stampa,
  };
});
