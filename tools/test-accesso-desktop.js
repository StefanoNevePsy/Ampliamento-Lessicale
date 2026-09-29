// Test dell'accesso Google per l'app desktop (electron/accesso-google.js)
// contro un Google finto: consenso, PKCE, rinnovo silenzioso, annullamento,
// risposta manomessa, token revocato, uscita.
//   node tools/test-accesso-desktop.js
'use strict';
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { creaAccesso } = require(path.join(__dirname, '..', 'electron', 'accesso-google.js'));

const CLIENT = '123-desktop.apps.googleusercontent.com', SEGRETO = 'GOCSPX-prova';
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (o) => 'x.' + b64url(Buffer.from(JSON.stringify(o))) + '.firma';

// ---------- Google finto ----------
const G = { codici: {}, refresh: {}, revocati: [], chiamateToken: 0, scelta: 'consenti', durata: 3600 };
const google = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/auth') {
    const p = u.searchParams;
    assert.strictEqual(p.get('client_id'), CLIENT);
    assert.match(p.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.strictEqual(p.get('code_challenge_method'), 'S256');
    assert.ok(/openid/.test(p.get('scope')) && !/drive|gmail/.test(p.get('scope')), 'solo identità');
    let dest;
    if (G.scelta === 'nega') dest = p.get('redirect_uri') + '/?error=access_denied&state=' + p.get('state');
    else if (G.scelta === 'stato-falso') dest = p.get('redirect_uri') + '/?code=zzz&state=manomesso';
    else {
      const codice = crypto.randomBytes(8).toString('hex');
      G.codici[codice] = { sfida: p.get('code_challenge'), redirect: p.get('redirect_uri') };
      dest = p.get('redirect_uri') + '/?code=' + codice + '&state=' + p.get('state');
    }
    res.writeHead(302, { Location: dest }); res.end();
    return;
  }
  let corpo = '';
  req.on('data', (d) => { corpo += d; });
  req.on('end', () => {
    const p = new URLSearchParams(corpo);
    const rispondi = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/revoke') { G.revocati.push(p.get('token')); return rispondi(200, {}); }
    if (u.pathname !== '/token') return rispondi(404, {});
    G.chiamateToken++;
    if (p.get('client_id') !== CLIENT || p.get('client_secret') !== SEGRETO) return rispondi(401, { error: 'invalid_client' });
    const id = () => jwt({ email: 'Giulia@Gmail.com', given_name: 'Giulia', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + G.durata });
    if (p.get('grant_type') === 'authorization_code') {
      const c = G.codici[p.get('code')];
      if (!c) return rispondi(400, { error: 'invalid_grant' });
      delete G.codici[p.get('code')];
      if (b64url(crypto.createHash('sha256').update(p.get('code_verifier')).digest()) !== c.sfida) return rispondi(400, { error: 'invalid_grant', error_description: 'PKCE' });
      if (p.get('redirect_uri') !== c.redirect) return rispondi(400, { error: 'redirect_uri_mismatch' });
      const r = 'rt-' + crypto.randomBytes(6).toString('hex');
      G.refresh[r] = true;
      return rispondi(200, { id_token: id(), refresh_token: r, expires_in: 3600 });
    }
    if (p.get('grant_type') === 'refresh_token') {
      if (!G.refresh[p.get('refresh_token')]) return rispondi(400, { error: 'invalid_grant' });
      return rispondi(200, { id_token: id(), expires_in: 3600 });
    }
    rispondi(400, { error: 'unsupported_grant_type' });
  });
});

let ok = 0, ko = 0;
async function prova(nome, fn) {
  try { await fn(); ok++; console.log('  ✓', nome); } catch (e) { ko++; console.log('  ✗', nome, '\n     ', e.message); }
}

google.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + google.address().port;
  const deposito = { v: null };
  const nuovo = (extra) => creaAccesso(Object.assign({
    // "il browser": segue il rimando di Google fino alla porta locale dell'app
    apri: (url) => { fetch(url).catch(() => {}); },
    leggi: async () => deposito.v,
    scrivi: async (o) => { deposito.v = o; },
    cancella: async () => { deposito.v = null; },
    endpoint: { autorizza: base + '/auth', token: base + '/token', revoca: base + '/revoke' },
    attesaMs: 2000,
  }, extra || {}));
  const cfg = { clientId: CLIENT, clientSecret: SEGRETO };

  console.log('Accesso dall\'app desktop');
  let A = nuovo();
  await prova('accesso nel browser: torna l\'ID token, con PKCE verificato da Google', async () => {
    const r = await A.accedi(cfg);
    assert.strictEqual(r.email, 'giulia@gmail.com');
    assert.ok(r.idToken.split('.').length === 3);
    assert.ok(deposito.v && deposito.v.refresh, 'refresh token conservato');
  });
  await prova('il token si riusa finché è valido, senza chiamare Google', async () => {
    const prima = G.chiamateToken;
    await A.token(cfg); await A.token(cfg);
    assert.strictEqual(G.chiamateToken, prima);
  });
  await prova('riaprendo l\'app si rinnova in silenzio, senza browser', async () => {
    const B = nuovo({ apri: () => { throw new Error('non doveva aprire il browser'); } });
    assert.strictEqual((await B.utente()).email, 'giulia@gmail.com');
    const r = await B.token(cfg);
    assert.strictEqual(r.email, 'giulia@gmail.com');
  });
  await prova('token scaduto: rinnovato', async () => {
    G.durata = 30;   // meno del margine di un minuto: va rinnovato subito
    const C = nuovo();
    await C.token(cfg);
    const prima = G.chiamateToken;
    await C.token(cfg);
    assert.strictEqual(G.chiamateToken, prima + 1);
    G.durata = 3600;
  });
  await prova('accesso annullato nel browser: errore chiaro', async () => {
    G.scelta = 'nega';
    await assert.rejects(nuovo().accedi(cfg), /annullato/);
    G.scelta = 'consenti';
  });
  await prova('risposta con uno stato diverso (manomessa): ignorata', async () => {
    G.scelta = 'stato-falso';
    await assert.rejects(nuovo({ attesaMs: 800 }).accedi(cfg), /non completato in tempo/);
    G.scelta = 'consenti';
  });
  await prova('refresh token revocato su Google: serve un nuovo accesso', async () => {
    G.refresh = {};
    const D = nuovo();
    assert.strictEqual(await D.token(cfg), null);
    assert.strictEqual(deposito.v, null);
  });
  await prova('uscita: token revocato su Google e tolto dal dispositivo', async () => {
    await A.accedi(cfg);
    const rt = deposito.v.refresh;
    await A.esci();
    assert.strictEqual(deposito.v, null);
    assert.ok(G.revocati.includes(rt));
    assert.strictEqual(await nuovo().token(cfg), null);
  });

  google.close();
  console.log(`\n${ok} riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
});
