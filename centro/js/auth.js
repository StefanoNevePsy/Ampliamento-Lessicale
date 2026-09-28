/**
 * Quaderno TICE — accesso con Google.
 *
 * L'app chiede a Google solo un "ID token": una prova firmata di chi e'
 * l'utente (email e nome), valida un'ora. Nessun accesso al Drive o alla posta
 * dell'utente. Il token viaggia con ogni richiesta e il custode lo verifica.
 *
 * Senza rete l'app si apre comunque con l'ultimo utente e i suoi dati locali;
 * le sedute registrate aspettano in coda finche' non torna un token valido.
 */
var Auth = (function () {
  'use strict';

  var CHIAVE_TOKEN = 'qt:token';
  var CHIAVE_UTENTE = 'qt:ultimo-utente';

  var config = {};
  var token = null;
  var scadenza = 0;
  var utente = null;
  var ascoltatori = [];
  var gisPronto = null;
  var attesaCredenziale = null;

  function ErroreAccesso(messaggio) { this.message = messaggio; this.accesso = true; }

  function leggiPayload(jwt) {
    try {
      var p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = decodeURIComponent(atob(p).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function imposta(nuovoToken) {
    var dati = leggiPayload(nuovoToken);
    if (!dati || !dati.email) return false;
    token = nuovoToken;
    scadenza = (dati.exp || 0) * 1000;
    utente = { email: String(dati.email).toLowerCase(), nome: dati.given_name || dati.name || dati.email, foto: dati.picture || null };
    try {
      sessionStorage.setItem(CHIAVE_TOKEN, nuovoToken);
      localStorage.setItem(CHIAVE_UTENTE, JSON.stringify(utente));
    } catch (e) { /* archiviazione non disponibile */ }
    avvisa();
    return true;
  }

  function avvisa() { ascoltatori.forEach(function (f) { try { f(utente); } catch (e) { console.error(e); } }); }

  function valido() { return !!token && Date.now() < scadenza - 60 * 1000; }

  function caricaGIS() {
    if (gisPronto) return gisPronto;
    gisPronto = new Promise(function (ok, ko) {
      if (window.google && google.accounts && google.accounts.id) return ok();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = function () { ok(); };
      s.onerror = function () { gisPronto = null; ko(new ErroreAccesso('Non riesco a raggiungere Google: controlla la connessione.')); };
      document.head.appendChild(s);
    }).then(function () {
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: function (risposta) {
          if (risposta && risposta.credential && imposta(risposta.credential) && attesaCredenziale) {
            attesaCredenziale.ok(token);
            attesaCredenziale = null;
          }
        },
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
    });
    return gisPronto;
  }

  /** All'avvio: recupera un token ancora valido o l'ultimo utente per lavorare offline. */
  function inizia(cfg) {
    config = cfg || {};
    try {
      var salvato = sessionStorage.getItem(CHIAVE_TOKEN);
      if (salvato) imposta(salvato);
      if (!utente) {
        var u = JSON.parse(localStorage.getItem(CHIAVE_UTENTE) || 'null');
        if (u && u.email) utente = u;
      }
    } catch (e) { /* niente di salvato */ }
    if (!config.dev && config.googleClientId) caricaGIS().catch(function () { /* offline: si riprovera' */ });
    return utente;
  }

  /** Pulsante "Accedi con Google" dentro un elemento. */
  function mostraPulsante(el) {
    if (config.dev) return Promise.resolve();
    if (!config.googleClientId) {
      el.innerHTML = '<p class="banda errore">Manca il Client ID di Google in config.js: vedi docs/setup-custode.md.</p>';
      return Promise.resolve();
    }
    return caricaGIS().then(function () {
      google.accounts.id.renderButton(el, {
        type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill',
        text: 'signin_with', locale: 'it', width: Math.min(320, el.clientWidth || 320),
      });
    });
  }

  /** Accesso di sviluppo, solo con il custode locale in modalita' --dev. */
  function accessoDev(email, nome) {
    if (!config.dev) return false;
    token = 'dev:' + email.trim().toLowerCase() + '|' + (nome || email.split('@')[0]);
    scadenza = Date.now() + 365 * 86400000;
    utente = { email: email.trim().toLowerCase(), nome: nome || email.split('@')[0] };
    try {
      sessionStorage.setItem(CHIAVE_TOKEN + ':dev', token);
      localStorage.setItem(CHIAVE_UTENTE, JSON.stringify(utente));
    } catch (e) { /* ok */ }
    avvisa();
    return true;
  }

  /**
   * Un token valido per chiamare il custode. Se e' scaduto prova a rinnovarlo
   * in silenzio (Google lo concede se l'utente ha gia' dato il consenso); se
   * non ci riesce chiede di rientrare, senza perdere nulla di quanto registrato.
   */
  function prendiToken() {
    if (config.dev) {
      if (!token) {
        try { token = sessionStorage.getItem(CHIAVE_TOKEN + ':dev'); } catch (e) { /* ok */ }
      }
      if (token) return Promise.resolve(token);
      return Promise.reject(new ErroreAccesso('Serve l\'accesso.'));
    }
    if (valido()) return Promise.resolve(token);
    return caricaGIS().then(function () {
      return new Promise(function (ok, ko) {
        attesaCredenziale = { ok: ok };
        var timer = setTimeout(function () {
          if (attesaCredenziale) { attesaCredenziale = null; ko(new ErroreAccesso('Accesso scaduto: rientra con Google per inviare.')); }
        }, 8000);
        google.accounts.id.prompt(function (n) {
          var saltato = (n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment());
          if (saltato && attesaCredenziale) {
            clearTimeout(timer);
            attesaCredenziale = null;
            ko(new ErroreAccesso('Accesso scaduto: rientra con Google per inviare.'));
          }
        });
      });
    });
  }

  function invalida() {
    token = null; scadenza = 0;
    try { sessionStorage.removeItem(CHIAVE_TOKEN); sessionStorage.removeItem(CHIAVE_TOKEN + ':dev'); } catch (e) { /* ok */ }
  }

  function esci() {
    invalida();
    utente = null;
    try { localStorage.removeItem(CHIAVE_UTENTE); } catch (e) { /* ok */ }
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    avvisa();
  }

  return {
    inizia: inizia,
    mostraPulsante: mostraPulsante,
    accessoDev: accessoDev,
    token: prendiToken,
    haToken: function () { return config.dev ? !!token : valido(); },
    utente: function () { return utente; },
    invalida: invalida,
    esci: esci,
    alCambio: function (f) { ascoltatori.push(f); },
    ErroreAccesso: ErroreAccesso,
  };
})();
