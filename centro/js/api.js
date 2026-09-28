/**
 * Quaderno TICE — chiamate al custode.
 *
 * Distingue tre esiti, perche' l'app reagisce in modo diverso:
 *   - ErroreRete: niente connessione. Si riprova piu' tardi, nulla va perso.
 *   - ErroreCustode: il custode ha risposto di no (permessi, conflitto...).
 *     Ripetere la stessa richiesta non servirebbe.
 *   - Auth.ErroreAccesso: serve rientrare con Google.
 */
var Api = (function () {
  'use strict';

  function ErroreRete(messaggio) { this.message = messaggio; this.rete = true; }
  function ErroreCustode(codice, messaggio, extra) {
    this.codice = codice; this.message = messaggio || codice; this.extra = extra || null; this.custode = true;
  }

  async function chiama(azione, dati) {
    var url = window.QT_CONFIG.custodeUrl;
    if (!url) throw new ErroreCustode('non-configurato', 'Indirizzo del custode mancante in config.js.');
    var token = await Auth.token();
    var risposta;
    try {
      // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
      risposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ v: 1, token: token, azione: azione, dati: dati || {} }),
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch (e) {
      throw new ErroreRete('Nessuna connessione con il custode.');
    }
    if (!risposta.ok) throw new ErroreRete('Il custode non risponde (HTTP ' + risposta.status + ').');
    var j;
    try { j = await risposta.json(); }
    catch (e) { throw new ErroreRete('Risposta del custode non leggibile.'); }
    if (!j.ok) {
      if (j.errore === 'non-autenticato') {
        Auth.invalida();
        throw new Auth.ErroreAccesso(j.messaggio);
      }
      throw new ErroreCustode(j.errore, j.messaggio, j.extra);
    }
    return j.dati;
  }

  return { chiama: chiama, ErroreRete: ErroreRete, ErroreCustode: ErroreCustode };
})();
