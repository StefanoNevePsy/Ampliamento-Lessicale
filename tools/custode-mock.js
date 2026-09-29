#!/usr/bin/env node
/**
 * Custode locale del Quaderno TICE, per sviluppo e test.
 *
 * Usa ESATTAMENTE la stessa logica del custode vero (custode/core.js); cambia
 * solo dove finiscono i file (una cartella su disco invece del Drive) e come si
 * verifica l'identita'.
 *
 *   node tools/custode-mock.js --dev
 *       login finto ("Accedi come..."), dati in ./.custode-dati, app su
 *       http://localhost:8787/
 *
 *   node tools/custode-mock.js --client-id <ID>.apps.googleusercontent.com --proprietario tu@centrotice.it
 *       login Google vero, verificato in locale con le chiavi pubbliche di Google
 *
 * Opzioni: --porta 8787  --dati <cartella>  --statico <cartella app>  --proprietario <email>
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QT = require('../custode/core.js');

// ---------------------------------------------------------------------------
function opzioni(argv) {
  const o = { porta: 8787, dati: '.custode-dati', statico: path.join(__dirname, '..'), dev: false, proprietario: 'admin@centro.test', clientId: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dev') o.dev = true;
    else if (a === '--porta') o.porta = Number(argv[++i]);
    else if (a === '--dati') o.dati = argv[++i];
    else if (a === '--statico') o.statico = argv[++i];
    else if (a === '--proprietario') o.proprietario = argv[++i];
    else if (a === '--client-id') o.clientId = argv[++i];
  }
  return o;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
function mimeDa(p) { return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'; }

// ---------------------------------------------------------------------------
// Archivio su disco, con la stessa interfaccia di quello su Drive.
function archivioSuDisco(radice) {
  const base = path.resolve(radice);
  const abs = (p) => {
    const r = path.resolve(base, p);
    if (r !== base && !r.startsWith(base + path.sep)) throw new Error('percorso fuori dall\'archivio: ' + p);
    return r;
  };
  const scriviAtomico = (f, dati) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, dati);
    fs.renameSync(tmp, f);
  };
  return {
    leggiJSON(p) {
      try { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    scriviJSON(p, o) { scriviAtomico(abs(p), JSON.stringify(o)); },
    elenca(p) {
      const d = abs(p);
      if (!fs.existsSync(d)) return { file: [], cartelle: [] };
      const voci = fs.readdirSync(d, { withFileTypes: true });
      return {
        file: voci.filter((e) => e.isFile() && !e.name.endsWith('.tmp')).map((e) => e.name),
        cartelle: voci.filter((e) => e.isDirectory()).map((e) => e.name),
      };
    },
    leggiBinario(p) {
      try { return { base64: fs.readFileSync(abs(p)).toString('base64'), mime: mimeDa(p) }; }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    scriviBinario(p, b64) { scriviAtomico(abs(p), Buffer.from(b64, 'base64')); },
    esiste(p) { return fs.existsSync(abs(p)); },
    elimina(p) { try { fs.unlinkSync(abs(p)); } catch (e) { if (e.code !== 'ENOENT') throw e; } },
    // Il core e' sincrono e Node esegue una richiesta alla volta fino in fondo:
    // le scritture non possono sovrapporsi.
    conLock(fn) { return fn(); },
  };
}

function sha256Hex(b64) {
  return crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');
}

// ---------------------------------------------------------------------------
// Verifica dei token Google in locale (chiavi pubbliche scaricate e tenute in cache)
let chiaviGoogle = {};
function aggiornaChiavi() {
  return new Promise((ok) => {
    https.get('https://www.googleapis.com/oauth2/v3/certs', (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        try {
          const jwks = JSON.parse(b);
          chiaviGoogle = {};
          for (const k of jwks.keys) chiaviGoogle[k.kid] = crypto.createPublicKey({ key: k, format: 'jwk' });
        } catch (e) { console.error('[mock] chiavi Google non leggibili:', e.message); }
        ok();
      });
    }).on('error', (e) => { console.error('[mock] chiavi Google non scaricate:', e.message); ok(); });
  });
}

function verificatore(o) {
  return function verificaToken(token) {
    if (typeof token !== 'string' || !token) throw new Error('token mancante');
    if (o.dev && token.startsWith('dev:')) {
      const [email, nome] = token.slice(4).split('|');
      return { email: email.trim().toLowerCase(), nome: (nome || email.split('@')[0]).trim() };
    }
    if (!o.clientId) throw new Error('login Google non configurato nel mock (--client-id)');
    const parti = token.split('.');
    if (parti.length !== 3) throw new Error('token malformato');
    const dec = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const intest = dec(parti[0]);
    const dati = dec(parti[1]);
    const chiave = chiaviGoogle[intest.kid];
    if (intest.alg !== 'RS256' || !chiave) throw new Error('chiave sconosciuta');
    const firmaOk = crypto.verify('RSA-SHA256', Buffer.from(parti[0] + '.' + parti[1]), chiave, Buffer.from(parti[2], 'base64url'));
    if (!firmaOk) throw new Error('firma non valida');
    if (String(o.clientId).split(',').indexOf(dati.aud) < 0) throw new Error('destinatario errato');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(dati.iss)) throw new Error('emittente errato');
    if (!(dati.exp > Date.now() / 1000)) throw new Error('scaduto');
    if (dati.email_verified !== true && dati.email_verified !== 'true') throw new Error('email non verificata');
    return { email: String(dati.email).toLowerCase(), nome: dati.name || dati.given_name || dati.email };
  };
}

// ---------------------------------------------------------------------------
function creaServer(o) {
  const custode = QT.creaCustode({
    archivio: archivioSuDisco(o.dati),
    verificaToken: verificatore(o),
    proprietario: () => o.proprietario,
    ora: () => (o.ora ? o.ora() : new Date().toISOString()),
    sha256Hex,
  });

  const configJs = () =>
    `window.TICE_CONFIG = Object.assign(window.TICE_CONFIG || {}, ${JSON.stringify({
      custodeUrl: '/api', googleClientId: String(o.clientId || '').split(',')[0], dev: !!o.dev, ambiente: 'locale',
    })});\n`;

  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api') {
      if (req.method !== 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, servizio: 'custode Quaderno TICE (locale)' }));
      }
      let corpo = '';
      req.on('data', (d) => {
        corpo += d;
        if (corpo.length > 40 * 1024 * 1024) req.destroy();
      });
      req.on('end', () => {
        let risposta;
        try { risposta = custode.gestisci(JSON.parse(corpo)); }
        catch (e) { risposta = { ok: false, errore: 'richiesta-non-valida', messaggio: 'JSON non valido' }; }
        if (o.ritardo) {
          return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(risposta)); }, o.ritardo);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(risposta));
      });
      return;
    }

    // File statici dell'app (con tice-config.js generato per puntare a questo custode)
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    if (path.basename(rel) === 'tice-config.js') {
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      return res.end(configJs());
    }
    // niente file nascosti (.git, .custode-dati...)
    if (rel.split('/').some((x) => x.startsWith('.'))) { res.writeHead(403); return res.end(); }
    const base = path.resolve(o.statico);
    const file = path.resolve(base, '.' + rel);
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, dati) => {
      if (e) { res.writeHead(404); return res.end('non trovato'); }
      res.writeHead(200, { 'Content-Type': mimeDa(file), 'Cache-Control': 'no-store' });
      res.end(dati);
    });
  });
}

module.exports = { creaServer, archivioSuDisco, sha256Hex };

if (require.main === module) {
  const o = opzioni(process.argv);
  (o.clientId ? aggiornaChiavi() : Promise.resolve()).then(() => {
    if (o.clientId) setInterval(aggiornaChiavi, 3600 * 1000).unref();
    creaServer(o).listen(o.porta, () => {
      console.log(`Custode locale su http://localhost:${o.porta}/  (dati in ${path.resolve(o.dati)})`);
      console.log(o.dev ? '  modalita\' sviluppo: login finto attivo' : '  login Google con client ' + o.clientId);
      console.log(`  proprietario (sempre admin): ${o.proprietario}`);
    });
  });
}
