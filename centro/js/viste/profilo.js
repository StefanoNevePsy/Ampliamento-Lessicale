/* Profilo: chi sei, stato della sincronizzazione, sedute in attesa, uscita */
(function () {
  'use strict';
  var h = UI.html;

  App.vista('profilo', {
    sezione: 'profilo',
    titolo: function () { return 'Profilo'; },
    render: async function () {
      var st = Sync.stato();
      var io = st.io || {};
      var utente = Auth.utente() || {};
      var coda = (await Sync.coda()).sort(function (a, b) { return a.creato < b.creato ? -1 : 1; });
      var bloccate = coda.filter(function (o) { return o.bloccata; });
      var inAttesa = coda.filter(function (o) { return !o.bloccata; });
      var fasi = {
        fermo: ['ok', 'Tutto sincronizzato'], lavoro: ['lavoro', 'Sincronizzo…'],
        offline: ['attesa', 'Offline: le sedute aspettano la rete'], accesso: ['errore', 'Serve rientrare con Google'],
        errore: ['errore', 'Errore di sincronizzazione'],
      };
      var fase = fasi[st.fase] || fasi.fermo;
      return h`
        <h1>${io.nome || utente.nome || 'Profilo'}</h1>
        <p class="sotto" style="margin-top:-8px">${io.email || utente.email || ''}</p>
        ${io.ruolo ? h`<p><span class="pill ${io.ruolo === 'admin' ? 'arancio' : 'acqua'}">${io.ruolo}</span>
          ${io.scadenza ? h` <span class="pill">accesso fino al ${Modello.formatoData(io.scadenza)}</span>` : ''}</p>` : ''}

        <div class="scheda imbottita">
          <h3 style="margin-top:0">Sincronizzazione</h3>
          <p style="margin:0"><b>${fase[1]}</b></p>
          ${st.messaggio && st.fase !== 'fermo' ? h`<p class="sotto piccolo">${st.messaggio}</p>` : ''}
          <p class="sotto piccolo">Ultima sincronizzazione: ${st.ultimoSync ? Modello.formatoData(st.ultimoSync) + ' alle ' + new Date(st.ultimoSync).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'mai'}</p>
          <div class="bottoni">
            <button class="bottone" data-azione="sincronizza">${UI.icona('aggiorna')} Sincronizza ora</button>
            ${st.fase === 'accesso' && !window.QT_CONFIG.dev ? h`<a class="bottone primario" href="#/accesso">Rientra con Google</a>` : ''}
          </div>
        </div>

        ${inAttesa.length ? h`<h2>In attesa di invio (${inAttesa.length})</h2>
          <p class="sotto">Salvate su questo dispositivo: partono da sole quando c'è rete.</p>
          <ul class="lista scheda">${inAttesa.map(function (o) {
            var paz = (st.elenco || []).find(function (p) { return p.id === o.pazienteId; }) || {};
            return h`<li><div class="riga"><span class="corpo">
              <span class="titolo">${o.tipo === 'seduta.elimina' ? 'Eliminazione' : 'Seduta'} · ${paz.etichetta || paz.codice || ''}</span>
              <span class="dettaglio">registrata ${Modello.quando(o.creato)} alle ${new Date(o.creato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
            </span></div></li>`;
          })}</ul>` : ''}

        ${bloccate.length ? h`<h2>Da risolvere (${bloccate.length})</h2>
          <p class="sotto">Il custode le ha rifiutate. Di solito è un permesso cambiato: chiedi a un amministratore, poi riprova. Scartarle cancella quei dati da questo dispositivo.</p>
          <ul class="lista scheda">${bloccate.map(function (o) {
            var paz = (st.elenco || []).find(function (p) { return p.id === o.pazienteId; }) || {};
            return h`<li><div class="riga"><span class="corpo">
              <span class="titolo">Seduta · ${paz.etichetta || paz.codice || o.pazienteId}</span>
              <span class="dettaglio a-capo" style="color:var(--x)">${o.errore ? o.errore.messaggio : ''}</span></span>
              <span class="fine"><div class="bottoni" style="flex-direction:column">
                <button class="bottone piccolo" data-azione="riprova" data-op="${o.id}">Riprova</button>
                <button class="bottone piccolo pericolo" data-azione="scarta" data-op="${o.id}">Scarta</button></div></span>
            </div></li>`;
          })}</ul>` : ''}

        <h2>Esci</h2>
        <div class="scheda imbottita">
          ${inAttesa.length ? h`<div class="banda attenzione" style="margin-top:0">${UI.icona('avviso')}<div>Hai ${inAttesa.length} ${inAttesa.length === 1 ? 'seduta' : 'sedute'} non ancora inviate: se cancelli i dati andranno perse.</div></div>` : ''}
          <div class="bottoni">
            <button class="bottone" data-azione="esci">${UI.icona('esci')} Esci</button>
            <button class="bottone pericolo" data-azione="esci-cancella">${UI.icona('cestino')} Esci e cancella i dati da questo dispositivo</button>
          </div>
          <p class="sotto piccolo">Su un dispositivo condiviso usa “Esci e cancella”: i dati dei bambini non restano sul tablet.</p>
        </div>
        <p class="sotto piccolo" style="text-align:center;margin-top:24px">${window.QT_CONFIG.nomeApp} · ${window.QT_CONFIG.ambiente || ''}</p>`;
    },
    azioni: {
      sincronizza: async function () { await Sync.esegui(); App.ridisegna(); },
      riprova: async function (b) { await Sync.riprovaOperazione(b.getAttribute('data-op')); App.ridisegna(); },
      scarta: async function (b) {
        if (!await UI.conferma('Scartare questa seduta?', 'Verrà cancellata da questo dispositivo e non sarà inviata.', { ok: 'Scarta', pericolo: true })) return;
        await Sync.scartaOperazione(b.getAttribute('data-op'));
        App.ridisegna();
      },
      esci: function () { App.esci(false); },
      'esci-cancella': async function () {
        var coda = await Sync.coda();
        var testo = coda.length ? 'Ci sono ' + coda.length + ' operazioni non inviate che andranno perse.' : 'Pazienti, sedute e bozze di questo account verranno tolti dal dispositivo. Sul Drive del centro non cambia nulla.';
        if (!await UI.conferma('Uscire e cancellare i dati?', testo, { ok: 'Esci e cancella', pericolo: true })) return;
        App.esci(true);
      },
    },
  });
})();
