/* Schermata di accesso */
(function () {
  'use strict';
  var h = UI.html;

  App.vista('accesso', {
    senzaNav: true,
    titolo: function () { return ''; },
    render: function (p) {
      var cfg = window.QT_CONFIG;
      var errore = p.errore || App.erroreAccesso || '';
      return h`<div class="accesso"><div class="contenuto">
        <div class="logo"><img src="img/logo-bianco.png" alt="TICE"></div>
        <h1>${cfg.nomeApp}</h1>
        <p class="sotto">Il quaderno delle sedute del Centro TICE. Accedi con l'account Google che ti ha abilitato un amministratore.</p>
        ${errore ? h`<div class="banda errore">${UI.icona('avviso')}<div>${errore}</div></div>` : ''}
        ${cfg.dev ? h`
          <form data-form="dev" class="scheda imbottita" style="text-align:left;margin-top:18px">
            <p class="banda attenzione" style="margin-top:0">Modalità sviluppo: accesso senza Google, solo con il custode locale.</p>
            <label class="campo"><span>Email</span><input name="email" type="email" required value="admin@centro.test" autocomplete="off"></label>
            <label class="campo"><span>Nome</span><input name="nome" value="" placeholder="facoltativo"></label>
            <button class="bottone primario largo" type="submit">Entra</button>
          </form>` : h`<div id="pulsante-google"></div>`}
        <p class="sotto piccolo" style="margin-top:24px">${UI.icona('lucchetto')} L'app legge solo nome ed email del tuo account Google. Non accede alla tua posta né al tuo Drive.</p>
      </div></div>`;
    },
    dopo: function () {
      var el = document.getElementById('pulsante-google');
      if (el) Auth.mostraPulsante(el).catch(function (e) { el.innerHTML = '<p class="banda errore">' + UI.esc(e.message) + '</p>'; });
    },
    azioni: {
      dev: function (form) {
        var dati = new FormData(form);
        Auth.accessoDev(String(dati.get('email')), String(dati.get('nome') || ''));
      },
    },
  });
})();
