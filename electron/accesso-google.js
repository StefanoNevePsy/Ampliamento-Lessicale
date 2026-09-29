/**
 * Accesso con Google per l'app desktop (Electron), dal browser di sistema.
 *
 * Google non permette di accedere dentro le finestre delle app che incorporano
 * un browser (Electron, WebView). Per le app installate prevede invece questo
 * percorso, "loopback" con PKCE (RFC 8252):
 *   1. l'app apre una porta locale su 127.0.0.1 e il browser predefinito sulla
 *      pagina di accesso di Google;
 *   2. dopo l'accesso Google rimanda il browser alla porta locale con un codice;
 *   3. l'app scambia il codice (più il verificatore PKCE) con un ID token.
 * L'ID token è lo stesso tipo di prova che l'app web manda al custode: chi sei,
 * nient'altro (ambiti openid, email, profile; nessun accesso a Drive o posta).
 *
 * Il token dura un'ora; il "refresh token" permette di rinnovarlo senza
 * riaprire il browser e viene conservato cifrato dal sistema operativo
 * (Portachiavi su Mac, DPAPI su Windows) tramite safeStorage.
 *
 * Modulo Node puro: Electron gli passa come aprire il browser e dove salvare;
 * i test gli passano un Google finto (tools/test-accesso-desktop.js).
 */
'use strict';
const http = require('http');
const crypto = require('crypto');

const GOOGLE = {
  autorizza: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoca: 'https://oauth2.googleapis.com/revoke',
};

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function payload(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch (e) { return null; }
}
const PAGINA = (titolo, testo) => `<!doctype html><html lang="it"><meta charset="utf-8"><title>${titolo}</title>
<body style="font-family:system-ui,sans-serif;background:#eef2f3;color:#1c1f24;display:grid;place-items:center;height:100vh;margin:0">
<div style="background:#fff;padding:32px 40px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.1);max-width:420px;text-align:center">
<h1 style="font-size:1.3rem;margin:0 0 8px">${titolo}</h1><p style="color:#5b626e;margin:0">${testo}</p></div></body></html>`;

/**
 * opz = {
 *   apri(url)            apre il browser di sistema
 *   leggi() / scrivi(o) / cancella()   conservazione del refresh token (già cifrato fuori da qui)
 *   endpoint             per i test: { autorizza, token, revoca }
 *   attesaMs             tempo massimo per completare l'accesso nel browser (5 minuti)
 * }
 */
function creaAccesso(opz) {
  const E = Object.assign({}, GOOGLE, opz.endpoint || {});
  let corrente = null;   // { idToken, scade, email, nome }
  let inCorso = null;

  function valido(t) { return t && Date.now() < t.scade - 60000; }
  function daToken(idToken) {
    const p = payload(idToken);
    if (!p || !p.email) throw new Error('Risposta di Google senza identità');
    return { idToken, scade: (p.exp || 0) * 1000, email: String(p.email).toLowerCase(), nome: p.given_name || p.name || p.email };
  }
  async function chiediToken(corpo) {
    const r = await fetch(E.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(corpo).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id_token) {
      const e = new Error(j.error_description || j.error || ('Google ha risposto ' + r.status));
      e.codice = j.error;
      throw e;
    }
    return j;
  }

  /** Accesso interattivo: apre il browser e aspetta il ritorno sulla porta locale. */
  function accedi(cfg) {
    if (inCorso) return inCorso;
    if (!cfg || !cfg.clientId) return Promise.reject(new Error('Client ID desktop mancante in tice-config.js'));
    const verificatore = b64url(crypto.randomBytes(32));
    const sfida = b64url(crypto.createHash('sha256').update(verificatore).digest());
    const stato = b64url(crypto.randomBytes(16));
    inCorso = new Promise((ok, ko) => {
      let finito = false, timer = null;
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const fine = (codice, titolo, testo) => { res.writeHead(codice, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGINA(titolo, testo)); };
        if (u.searchParams.get('state') !== stato) { fine(400, 'Richiesta non valida', 'Riprova dall\'app.'); return; }
        if (u.searchParams.get('error')) {
          fine(200, 'Accesso annullato', 'Puoi chiudere questa scheda e tornare all\'app.');
          chiudi(new Error(u.searchParams.get('error') === 'access_denied' ? 'Accesso annullato.' : 'Google ha risposto: ' + u.searchParams.get('error')));
          return;
        }
        const codice = u.searchParams.get('code');
        if (!codice) { fine(400, 'Richiesta non valida', 'Riprova dall\'app.'); return; }
        try {
          const j = await chiediToken({
            code: codice, client_id: cfg.clientId, client_secret: cfg.clientSecret || '',
            redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verificatore,
          });
          corrente = daToken(j.id_token);
          if (j.refresh_token) await opz.scrivi({ refresh: j.refresh_token, email: corrente.email, nome: corrente.nome, clientId: cfg.clientId });
          fine(200, 'Accesso completato', 'Puoi chiudere questa scheda e tornare all\'app Centro TICE.');
          chiudi(null, { idToken: corrente.idToken, email: corrente.email, nome: corrente.nome });
        } catch (e) {
          fine(200, 'Accesso non riuscito', 'Torna all\'app e riprova.');
          chiudi(e);
        }
      });
      let redirect = '';
      function chiudi(err, v) {
        if (finito) return;
        finito = true;
        clearTimeout(timer);
        server.close();
        inCorso = null;
        if (err) ko(err); else ok(v);
      }
      server.on('error', (e) => chiudi(e));
      server.listen(0, '127.0.0.1', () => {
        redirect = 'http://127.0.0.1:' + server.address().port;
        const q = new URLSearchParams({
          client_id: cfg.clientId, redirect_uri: redirect, response_type: 'code',
          scope: 'openid email profile', code_challenge: sfida, code_challenge_method: 'S256',
          state: stato, access_type: 'offline', prompt: 'select_account',
        });
        timer = setTimeout(() => chiudi(new Error('Accesso non completato in tempo: riprova.')), opz.attesaMs || 5 * 60000);
        Promise.resolve(opz.apri(E.autorizza + '?' + q.toString())).catch((e) => chiudi(e));
      });
    });
    return inCorso;
  }

  /** Token valido senza interazione: dalla memoria o rinnovato con il refresh token. */
  async function token(cfg) {
    if (valido(corrente)) return { idToken: corrente.idToken, email: corrente.email, nome: corrente.nome };
    const s = await opz.leggi();
    if (!s || !s.refresh || (cfg && cfg.clientId && s.clientId !== cfg.clientId)) return null;
    try {
      const j = await chiediToken({ client_id: s.clientId, client_secret: (cfg && cfg.clientSecret) || '', refresh_token: s.refresh, grant_type: 'refresh_token' });
      corrente = daToken(j.id_token);
      return { idToken: corrente.idToken, email: corrente.email, nome: corrente.nome };
    } catch (e) {
      // refresh token revocato o scaduto: serve un nuovo accesso
      if (e.codice === 'invalid_grant') { await opz.cancella(); return null; }
      throw e;
    }
  }

  /** Chi ha fatto l'ultimo accesso (per aprire l'app senza rete). */
  async function utente() {
    if (corrente) return { email: corrente.email, nome: corrente.nome };
    const s = await opz.leggi();
    return s && s.email ? { email: s.email, nome: s.nome } : null;
  }

  async function esci() {
    const s = await opz.leggi();
    corrente = null;
    await opz.cancella();
    if (s && s.refresh) {
      try { await fetch(E.revoca, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(s.refresh) }); }
      catch (e) { /* senza rete: il token resta valido su Google ma non è più sul dispositivo */ }
    }
    return true;
  }

  return { accedi, token, utente, esci };
}

module.exports = { creaAccesso, GOOGLE };
