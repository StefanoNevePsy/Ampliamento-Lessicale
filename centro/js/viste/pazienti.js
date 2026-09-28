/* Elenco dei pazienti visibili all'utente */
(function () {
  'use strict';
  var h = UI.html;

  App.vista('pazienti', {
    sezione: 'pazienti',
    titolo: function () { return 'Pazienti'; },
    render: async function () {
      var st = Sync.stato();
      var permessi = (st.io && st.io.permessi) || {};
      var bozze = {};
      (await Sync.tutteLeBozze()).forEach(function (b) { bozze[b.pazienteId] = b; });
      var inAttesa = {};
      (await Sync.coda()).forEach(function (o) { inAttesa[o.pazienteId] = (inAttesa[o.pazienteId] || 0) + 1; });

      var elenco = (st.elenco || []).filter(function (p) { return p.stato !== 'archiviato'; });
      if (!elenco.length) {
        if (!st.ultimoSync) {
          return h`<div class="caricamento"><div class="ruota"></div><p>Scarico l'elenco dei pazienti…</p></div>`;
        }
        return h`<h1>Pazienti</h1>
          <div class="vuoto scheda imbottita">
            <div class="icona">${UI.icona('persone')}</div>
            <p><b>Nessun paziente assegnato a te.</b></p>
            <p class="piccolo">Se ti aspetti di vederne, chiedi a un amministratore di assegnarteli.</p>
          </div>
          ${permessi.creaPazienti ? h`<button class="bottone primario largo" style="margin-top:14px" data-azione="nuovo">${UI.icona('piu')} Nuovo paziente</button>` : ''}`;
      }

      var perAula = {};
      elenco.forEach(function (p) { (perAula[p.aula || 'Senza aula'] = perAula[p.aula || 'Senza aula'] || []).push(p); });
      var aule = Object.keys(perAula).sort(function (a, b) { return a.localeCompare(b, 'it', { numeric: true }); });

      return h`
        <div style="display:flex;gap:10px;align-items:center">
          <input class="cerca" type="search" placeholder="Cerca per nome, codice o aula" data-input="filtra" aria-label="Cerca paziente">
          ${permessi.creaPazienti ? h`<button class="icona-bottone" data-azione="nuovo" aria-label="Nuovo paziente">${UI.icona('piu')}</button>` : ''}
        </div>
        ${aule.map(function (aula) {
          var lista = perAula[aula].sort(function (a, b) { return String(a.etichetta || a.codice).localeCompare(String(b.etichetta || b.codice), 'it'); });
          return h`<div class="gruppo-aula">
            <div class="gruppo-titolo"><h3>${aula}</h3><span class="sotto piccolo">${lista.length}</span></div>
            <ul class="lista scheda">${lista.map(function (p) {
              var chiave = [p.etichetta, p.codice, p.aula].join(' ').toLowerCase();
              return h`<li data-cerca="${chiave}"><a class="riga" href="#/p/${p.id}">
                <span class="avatar">${UI.iniziali(p.etichetta || p.codice)}</span>
                <span class="corpo">
                  <span class="titolo">${p.etichetta || p.codice}</span>
                  <span class="dettaglio">${p.codice} · ultima seduta ${Modello.quando(p.ultimaSeduta)}</span>
                </span>
                <span class="fine">
                  ${bozze[p.id] ? h`<span class="pill arancio">${UI.icona('play')} in corso</span>` : ''}
                  ${inAttesa[p.id] ? h`<span class="pill">${UI.icona('nuvola')} ${inAttesa[p.id]}</span>` : ''}
                </span>
              </a></li>`;
            })}</ul></div>`;
        })}`;
    },
    azioni: {
      filtra: function (input) {
        var q = input.value.trim().toLowerCase();
        document.querySelectorAll('[data-cerca]').forEach(function (li) {
          li.hidden = q && li.getAttribute('data-cerca').indexOf(q) < 0;
        });
        document.querySelectorAll('.gruppo-aula').forEach(function (g) {
          g.hidden = !g.querySelector('[data-cerca]:not([hidden])');
        });
      },
      nuovo: async function () {
        var dati = await UI.apriFoglio(h`<form>
          <h2>Nuovo paziente</h2>
          <p class="sotto piccolo">Consigliato: un codice e le iniziali, non nome e cognome.</p>
          <label class="campo"><span>Codice</span><input name="codice" required maxlength="30" placeholder="PZ-014" autocomplete="off"></label>
          <label class="campo"><span>Come mostrarlo</span><input name="etichetta" maxlength="60" placeholder="M. R." autocomplete="off"></label>
          <label class="campo"><span>Aula</span><input name="aula" maxlength="60" placeholder="Aula 1" list="aule-note" autocomplete="off"></label>
          <datalist id="aule-note">${[...new Set((Sync.stato().elenco || []).map(function (p) { return p.aula; }).filter(Boolean))].map(function (a) { return h`<option value="${a}">`; })}</datalist>
          <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">Crea</button></div>
        </form>`, { invia: function (f) { return Object.fromEntries(new FormData(f.querySelector('form'))); } });
        if (!dati) return;
        try {
          var p = await Sync.creaPaziente({
            id: Modello.nuovoId('pz'), codice: dati.codice.trim(), etichetta: dati.etichetta.trim(),
            aula: dati.aula.trim(), programmi: [],
          });
          UI.avviso('Paziente creato', 'ok');
          App.vai('#/p/' + p.id + '?t=programmi');
        } catch (e) { App.errore(e); }
      },
    },
  });
})();
