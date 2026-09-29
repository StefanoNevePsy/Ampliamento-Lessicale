/**
 * Fusione a tre vie di un paziente modificato su due dispositivi.
 *
 * Il custode non legge i dati (sono cifrati), quindi quando due dispositivi
 * salvano lo stesso bambino è l'app a unire le due versioni, partendo da
 * quella che entrambi conoscevano ("base", l'ultima sincronizzata):
 *   - le sedute (history) si uniscono per id: nessuna seduta registrata va persa;
 *     una seduta cancellata da una parte e non toccata dall'altra resta cancellata;
 *   - le attività del programma e i loro target si uniscono per id, nell'ordine
 *     di questo dispositivo;
 *   - negli oggetti (note del giorno, soglie, etichette dei giorni...) ogni chiave
 *     prende il valore cambiato; se cambia da entrambe le parti vince questo
 *     dispositivo, che sta salvando adesso.
 *
 * Modulo puro: si prova in Node (tools/test-tice-sync.js).
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceUnisci = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Liste i cui elementi hanno un id e si uniscono elemento per elemento
  var PER_ID = { 'history': true, 'programma.attivita': true, 'programma.attivita.target': true, 'learnUnitStoriche': false };

  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
        .map(function (k) { return JSON.stringify(k) + ':' + stabile(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  var ASSENTE = {};   // "chiave o elemento che non c'è", diverso da {} vuoto
  function uguali(a, b) {
    if (a === ASSENTE || b === ASSENTE) return a === b;
    return stabile(a) === stabile(b);
  }
  function oggetto(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function unisci3(b, l, r, percorso) {
    if (uguali(l, r)) return l;
    if (b !== ASSENTE && uguali(l, b)) return r;
    if (b !== ASSENTE && uguali(r, b)) return l;
    if (l === ASSENTE) return r;
    if (r === ASSENTE) return l;
    if (Array.isArray(l) && Array.isArray(r) && PER_ID[percorso]) return perId(Array.isArray(b) ? b : [], l, r, percorso);
    if (oggetto(l) && oggetto(r)) return perChiave(oggetto(b) ? b : {}, l, r, percorso);
    return l; // modificato da entrambe le parti: vince chi salva adesso
  }

  function perChiave(b, l, r, percorso) {
    var out = {}, chiavi = {};
    Object.keys(l).concat(Object.keys(r)).forEach(function (k) { chiavi[k] = true; });
    Object.keys(chiavi).forEach(function (k) {
      var bk = k in b ? b[k] : ASSENTE, lk = k in l ? l[k] : ASSENTE, rk = k in r ? r[k] : ASSENTE;
      // tolta da una parte, non toccata dall'altra: resta tolta
      if (lk === ASSENTE && bk !== ASSENTE && uguali(rk, bk)) return;
      if (rk === ASSENTE && bk !== ASSENTE && uguali(lk, bk)) return;
      var v = unisci3(bk, lk, rk, percorso ? percorso + '.' + k : k);
      if (v !== ASSENTE) out[k] = v;
    });
    return out;
  }

  function perId(b, l, r, percorso) {
    function mappa(a) { var m = {}; a.forEach(function (x) { if (x && x.id != null) m[x.id] = x; }); return m; }
    var mb = mappa(b), ml = mappa(l), mr = mappa(r);
    var out = [], visti = {};
    function aggiungi(id) {
      if (visti[id]) return;
      visti[id] = true;
      var bi = id in mb ? mb[id] : ASSENTE, li = id in ml ? ml[id] : ASSENTE, ri = id in mr ? mr[id] : ASSENTE;
      if (li === ASSENTE && bi !== ASSENTE && uguali(ri, bi)) return;   // cancellata qui
      if (ri === ASSENTE && bi !== ASSENTE && uguali(li, bi)) return;   // cancellata altrove
      var v = unisci3(bi, li, ri, percorso);
      if (v !== ASSENTE) out.push(v);
    }
    l.forEach(function (x) { if (x && x.id != null) aggiungi(x.id); else out.push(x); });
    r.forEach(function (x) { if (x && x.id != null) aggiungi(x.id); });
    return out;
  }

  /** Unisce il paziente di questo dispositivo con quello del custode. */
  function unisci(base, locale, remoto) {
    return unisci3(base || ASSENTE, locale, remoto, '');
  }

  // Le sedute registrate prima di questa versione non hanno id: se ne dà uno
  // stabile, ricavato dal contenuto, così due dispositivi con la stessa copia
  // assegnano lo stesso id alla stessa seduta.
  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }
  function assegnaId(p) {
    var cambiati = 0, visti = {};
    (p.history || []).forEach(function (s) {
      if (s && s.id) { visti[s.id] = true; return; }
      var id = 'h_' + hash(stabile(s)), n = 1;
      while (visti[id]) id = 'h_' + hash(stabile(s)) + '_' + (n++);
      s.id = id;
      visti[id] = true;
      cambiati++;
    });
    return cambiati;
  }

  return { unisci: unisci, assegnaId: assegnaId, uguali: uguali, stabile: stabile };
});
