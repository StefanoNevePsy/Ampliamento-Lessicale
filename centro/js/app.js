/**
 * Quaderno TICE — avvio, instradamento, eventi.
 *
 * Ogni schermata (js/viste/*.js) si registra con App.vista(nome, {...}) e
 * dichiara le sue azioni; qui un solo ascoltatore per tipo di evento le
 * smista tramite data-azione / data-form / data-input / data-cambio.
 */
(function () {
  'use strict';

  var vistaEl = document.getElementById('vista');
  var corrente = null;
  var turno = 0;
  var emailAperta = null;

  function analizza(hash) {
    var pezzi = String(hash || '').replace(/^#/, '').split('?');
    var params = {};
    new URLSearchParams(pezzi[1] || '').forEach(function (v, k) { params[k] = v; });
    var p = pezzi[0].split('/').filter(Boolean).map(decodeURIComponent);
    if (!p.length || p[0] === 'pazienti') return { nome: 'pazienti', params: params };
    if (p[0] === 'accesso') return { nome: 'accesso', params: params };
    if (p[0] === 'p' && p[1]) {
      params.id = p[1];
      if (!p[2]) return { nome: 'paziente', params: params };
      if (p[2] === 'seduta') return { nome: 'seduta', params: params };
      if (p[2] === 'prog' && p[3]) { params.prid = p[3]; return { nome: 'programma', params: params }; }
      if (p[2] === 'sd' && p[3]) { params.sid = p[3]; return { nome: 'dettaglio-seduta', params: params }; }
    }
    if (p[0] === 'materiali') {
      if (p[1]) { params.id = p[1]; return { nome: 'set', params: params }; }
      return { nome: 'materiali', params: params };
    }
    if (p[0] === 'admin') return { nome: 'admin', params: params };
    if (p[0] === 'profilo') return { nome: 'profilo', params: params };
    return { nome: 'pazienti', params: params };
  }

  async function mostra(stessa) {
    var utente = Auth.utente();
    var r = analizza(location.hash);
    if (!utente && r.nome !== 'accesso') r = { nome: 'accesso', params: {} };
    if (utente && r.nome === 'accesso' && (Auth.haToken() || window.QT_CONFIG.dev)) r = { nome: 'pazienti', params: {} };
    var vista = App.viste[r.nome];

    if (corrente && corrente.vista.lascia) {
      try { await corrente.vista.lascia(); } catch (e) { console.error(e); }
    }
    var mio = ++turno;
    corrente = { nome: r.nome, params: r.params, vista: vista };
    document.body.classList.toggle('senza-nav', !!vista.senzaNav);
    document.body.classList.toggle('largo', !!vista.largo);

    var scorrimento = stessa ? window.scrollY : 0;
    var contenuto;
    try { contenuto = await vista.render(r.params); }
    catch (e) {
      console.error(e);
      contenuto = UI.html`<div class="banda errore">${UI.icona('avviso')}<div>Qualcosa non ha funzionato: ${e && e.message}</div></div>`;
    }
    if (mio !== turno) return;   // nel frattempo e' partita un'altra navigazione
    vistaEl.innerHTML = String(contenuto);
    var titolo = vista.titolo ? vista.titolo(r.params) : '';
    document.getElementById('barra-titolo').textContent = titolo;
    document.body.classList.toggle('con-titolo', !!titolo);
    document.body.classList.toggle('senza-utente', !Auth.utente());
    document.querySelectorAll('.navigazione a').forEach(function (a) {
      a.classList.toggle('attiva', a.getAttribute('data-sezione') === vista.sezione);
    });
    window.scrollTo(0, scorrimento);
    if (vista.dopo) vista.dopo(vistaEl, r.params);
  }

  // --- Eventi: un ascoltatore per tipo ------------------------------------------
  function gestore(nome) {
    return corrente && corrente.vista.azioni && corrente.vista.azioni[nome];
  }
  function esegui(nome, el, ev) {
    var f = gestore(nome);
    if (!f) return;
    Promise.resolve(f.call(corrente.vista.azioni, el, ev, corrente.params)).catch(App.errore);
  }
  vistaEl.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-azione]');
    if (!el || !vistaEl.contains(el)) return;
    ev.preventDefault();
    esegui(el.getAttribute('data-azione'), el, ev);
  });
  vistaEl.addEventListener('submit', function (ev) {
    var form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    esegui(form.getAttribute('data-form'), form, ev);
  });
  vistaEl.addEventListener('input', function (ev) {
    var el = ev.target.closest('[data-input]');
    if (el) esegui(el.getAttribute('data-input'), el, ev);
  });
  vistaEl.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-cambio]');
    if (el) esegui(el.getAttribute('data-cambio'), el, ev);
  });
  document.getElementById('stato-sync').addEventListener('click', function () { App.vai('#/profilo'); });

  // --- Stato della sincronizzazione nella barra ---------------------------------
  var faseVista = null;
  function aggiornaIndicatore(st) {
    if (st.fase === 'negato') {
      App.erroreAccesso = st.messaggio;
      st.fase = 'fermo';
      App.esci(false);
      return;
    }
    var el = document.getElementById('stato-sync');
    var stato, testo;
    if (st.fase === 'lavoro') { stato = 'lavoro'; testo = 'Sincronizzo'; }
    else if (st.fase === 'accesso') { stato = 'errore'; testo = 'Accedi'; }
    else if (st.bloccate) { stato = 'errore'; testo = st.bloccate + ' da risolvere'; }
    else if (st.inCoda) { stato = 'attesa'; testo = st.inCoda + ' da inviare'; }
    else if (st.fase === 'offline') { stato = 'attesa'; testo = 'Offline'; }
    else if (st.fase === 'errore') { stato = 'errore'; testo = 'Errore'; }
    else { stato = 'ok'; testo = 'Aggiornato'; }
    el.setAttribute('data-stato', stato);
    el.querySelector('.etichetta').textContent = testo;
    el.title = st.messaggio || testo;
    var admin = document.querySelector('.navigazione a[data-sezione="admin"]');
    admin.hidden = !(st.io && st.io.permessi && st.io.permessi.gestisciAccessi);

    // Quando una sincronizzazione finisce, la schermata mostra i dati nuovi.
    // Mai durante una seduta, mai mentre si sta scrivendo in un campo.
    var finita = faseVista === 'lavoro' && st.fase !== 'lavoro';
    faseVista = st.fase;
    if (finita && corrente && !corrente.vista.nonRidisegnare) {
      var attivo = document.activeElement;
      var scrive = attivo && vistaEl.contains(attivo) && /INPUT|TEXTAREA|SELECT/.test(attivo.tagName);
      var foglioAperto = !document.getElementById('foglio').hidden;
      if (!scrive && !foglioAperto) mostra(true);
    }
  }

  async function suCambioUtente(u) {
    if (u && u.email !== emailAperta) {
      emailAperta = u.email;
      await Sync.apri(u.email);
    }
    if (!u) { emailAperta = null; Sync.chiudi(); }
    if (u && /^#\/accesso/.test(location.hash)) { history.replaceState(null, '', '#/pazienti'); }
    if (u) App.erroreAccesso = '';
    await mostra();
    if (u) Sync.esegui();
  }

  // --- API per le schermate -------------------------------------------------------
  App.vai = function (hash, sostituisci) {
    if (sostituisci) { history.replaceState(null, '', hash); mostra(true); }
    else if (location.hash === hash) mostra(true);
    else location.hash = hash;
  };
  App.ridisegna = function (forza) {
    if (!corrente) return;
    if (corrente.vista.nonRidisegnare && !forza) return;
    mostra(true);
  };
  App.errore = function (e) {
    if (!e) return;
    console.error(e);
    if (e.accesso) {
      UI.avviso('Accesso scaduto: rientra con Google. Le sedute registrate restano salvate.', 'errore', 7000);
      Sync.esegui();
      return;
    }
    if (e.rete) return UI.avviso('Serve la connessione per questa operazione.', 'errore');
    UI.avviso(e.message || String(e), 'errore', 7000);
  };
  App.esci = async function (cancella) {
    var email = emailAperta;
    Sync.chiudi();
    if (cancella && email) {
      try { await DB.eliminaUtente(email); } catch (e) { console.error(e); }
    }
    Auth.esci();
  };

  // --- Avvio ------------------------------------------------------------------------
  async function avvia() {
    document.querySelectorAll('[data-icona]').forEach(function (el) { el.innerHTML = String(UI.icona(el.getAttribute('data-icona'))); });
    document.title = window.QT_CONFIG.nomeApp;
    Sync.alCambio(aggiornaIndicatore);
    Auth.alCambio(function (u) { suCambioUtente(u).catch(App.errore); });
    var u = Auth.inizia(window.QT_CONFIG);
    if (u) { emailAperta = u.email; await Sync.apri(u.email); }
    window.addEventListener('hashchange', function () { mostra(); });
    await mostra();
    if (u) Sync.esegui();
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('service worker', e); });
    }
  }

  avvia().catch(function (e) {
    console.error(e);
    vistaEl.innerHTML = '<div class="banda errore">Avvio non riuscito: ' + UI.esc(e.message) + '</div>';
  });
})();
