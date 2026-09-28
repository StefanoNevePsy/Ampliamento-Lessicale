/**
 * Quaderno TICE — utilita' dell'interfaccia.
 *
 * html`...` e' il modo di costruire il markup: ogni valore interpolato viene
 * sanificato, a meno che non sia a sua volta un html`...` (o una lista di essi).
 * Nomi, STO e note li scrivono le persone: niente finisce nella pagina senza
 * passare di qui.
 */
var UI = (function () {
  'use strict';

  function Sicuro(s) { this.s = s; }
  Sicuro.prototype.toString = function () { return this.s; };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
    });
  }
  function valore(v) {
    if (v instanceof Sicuro) return v.s;
    if (Array.isArray(v)) return v.map(valore).join('');
    if (v === false || v == null) return '';
    return esc(v);
  }
  function html(parti) {
    var out = parti[0];
    for (var i = 1; i < arguments.length; i++) out += valore(arguments[i]) + parti[i];
    return new Sicuro(out);
  }
  function grezzo(s) { return new Sicuro(String(s)); }

  // --- Icone (disegnate apposta, tratto 2px) ---------------------------------
  var ICONE = {
    persone: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.8.2 4.9 2.3 5.5 5.3"/>',
    cartella: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    chiave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    ingranaggio: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    indietro: '<path d="M15 18l-6-6 6-6"/>',
    avanti: '<path d="M9 18l6-6-6-6"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z"/>',
    spunta: '<path d="M4.5 12.5l5 5 10-11"/>',
    croce: '<path d="M6 6l12 12M18 6L6 18"/>',
    annulla: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    grafico: '<path d="M4 20V4M4 20h16"/><path d="M7.5 15l4-4.5 3 2.5 5-6"/>',
    nuvola: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.7 4.7 0 0 0 7 18.5z"/>',
    avviso: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
    matita: '<path d="M15.5 4.5l4 4L8 20H4v-4z"/><path d="M13.5 6.5l4 4"/>',
    cestino: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5A1.6 1.6 0 0 0 8 21h8a1.6 1.6 0 0 0 1.5-1.5L18.5 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
    scarica: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
    carica: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 20h15"/>',
    cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    aggiorna: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M5.8 9A7 7 0 0 1 19 10.5M18.2 15A7 7 0 0 1 5 13.5"/>',
    esci: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    bandiera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    lucchetto: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    nota: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M14.5 3.5V8h4.5M9 12.5h7M9 16h7"/>',
    orologio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  function icona(nome, classe) {
    return grezzo('<svg class="ic ' + (classe || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONE[nome] || '') + '</svg>');
  }

  // --- Avvisi temporanei ---------------------------------------------------------
  function avviso(testo, tipo, durata) {
    var box = document.getElementById('avvisi');
    var el = document.createElement('div');
    el.className = 'avviso ' + (tipo || '');
    el.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
    el.textContent = testo;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, durata || (tipo === 'errore' ? 6000 : 3200));
  }

  // --- Foglio dal basso ----------------------------------------------------------
  var chiusuraFoglio = null;
  function apriFoglio(contenuto, gestori) {
    var sfondo = document.getElementById('foglio-sfondo');
    var foglio = document.getElementById('foglio');
    foglio.innerHTML = String(contenuto);
    sfondo.hidden = false; foglio.hidden = false;
    var precedente = document.activeElement;
    return new Promise(function (risolvi) {
      function chiudi(valore) {
        sfondo.hidden = true; foglio.hidden = true; foglio.innerHTML = '';
        sfondo.onclick = null; foglio.onclick = null; foglio.onsubmit = null;
        document.removeEventListener('keydown', suTasto);
        chiusuraFoglio = null;
        if (precedente && precedente.focus) precedente.focus();
        risolvi(valore);
      }
      function suTasto(e) { if (e.key === 'Escape') chiudi(null); }
      chiusuraFoglio = chiudi;
      document.addEventListener('keydown', suTasto);
      sfondo.onclick = function () { chiudi(null); };
      foglio.onclick = function (e) {
        var b = e.target.closest('[data-foglio]');
        if (!b) return;
        var azione = b.getAttribute('data-foglio');
        if (azione === 'chiudi') return chiudi(null);
        if (gestori && gestori[azione]) {
          var r = gestori[azione](foglio, b, chiudi);
          if (r !== undefined) chiudi(r);
        }
      };
      foglio.onsubmit = function (e) {
        e.preventDefault();
        if (gestori && gestori.invia) {
          var r = gestori.invia(foglio, e.submitter, chiudi);
          if (r !== undefined) chiudi(r);
        }
      };
      var primo = foglio.querySelector('[autofocus], input, select, textarea, button');
      if (primo) setTimeout(function () { primo.focus(); }, 60);
    });
  }
  function chiudiFoglio() { if (chiusuraFoglio) chiusuraFoglio(null); }

  function conferma(titolo, testo, opzioni) {
    opzioni = opzioni || {};
    return apriFoglio(html`
      <h2>${titolo}</h2>
      ${testo ? html`<p class="sotto">${testo}</p>` : ''}
      <div class="bottoni" style="margin-top:18px">
        <button class="bottone" data-foglio="chiudi">${opzioni.annulla || 'Annulla'}</button>
        <button class="bottone ${opzioni.pericolo ? 'pieno-pericolo' : 'primario'}" data-foglio="si">${opzioni.ok || 'Conferma'}</button>
      </div>`, { si: function () { return true; } }).then(function (r) { return r === true; });
  }

  // --- Varie -------------------------------------------------------------------
  function classePct(pct, soglia) {
    if (pct == null) return '';
    soglia = soglia || 90;
    return pct >= soglia ? 'alta' : pct >= soglia - 25 ? 'media' : 'bassa';
  }
  function iniziali(testo) {
    var t = String(testo || '?').replace(/[^A-Za-zÀ-ÿ0-9 .]/g, ' ').trim();
    var parti = t.split(/[\s.]+/).filter(Boolean);
    return (parti.length > 1 ? parti[0][0] + parti[1][0] : t.slice(0, 2)).toUpperCase();
  }
  function scaricaFile(nome, contenuto, tipo) {
    var blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function leggiFile(file, come) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
      if (come === 'dataurl') r.readAsDataURL(file);
      else if (come === 'buffer') r.readAsArrayBuffer(file);
      else r.readAsText(file);
    });
  }
  function dimensione(byte) {
    if (byte < 1024) return byte + ' B';
    if (byte < 1024 * 1024) return Math.round(byte / 1024) + ' KB';
    return (byte / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  return {
    html: html, grezzo: grezzo, esc: esc, icona: icona, avviso: avviso,
    apriFoglio: apriFoglio, chiudiFoglio: chiudiFoglio, conferma: conferma,
    classePct: classePct, iniziali: iniziali, scaricaFile: scaricaFile, leggiFile: leggiFile, dimensione: dimensione,
  };
})();

// Registro delle schermate: le viste si registrano qui, app.js le usa.
window.App = window.App || {
  viste: {},
  vista: function (nome, definizione) { this.viste[nome] = definizione; },
};
