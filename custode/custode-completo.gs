// ============================================================================
// Custode dell'edizione Centro TICE — FILE UNICO DA INCOLLARE IN APPS SCRIPT
// Generato da tools/componi-custode.js: non modificarlo a mano, modifica
// custode/core.js e custode/Code.gs e rigeneralo.
// ============================================================================

/**
 * Quaderno TICE — custode su Google Apps Script.
 *
 * Questo file collega la logica (core.gs, identica a custode/core.js) ai servizi
 * Google: Drive per i file, LockService per le scritture, UrlFetch per verificare
 * l'identita'. Tutte le regole su chi puo' fare cosa stanno in core.gs.
 *
 * Installazione: docs/configurazione.md. In breve:
 *   1. Proprieta' dello script: CARTELLA_RADICE, GOOGLE_CLIENT_ID
 *      (e GOOGLE_CLIENT_ID_DESKTOP per l'app installata su Mac e Windows).
 *   2. Esegui una volta `configura` dall'editor.
 *   3. Distribuisci come app web: "Esegui come: Me", "Chi ha accesso: Chiunque".
 */

var VERSIONE_CUSTODE = '2.0.0';
var PROP = PropertiesService.getScriptProperties();

// ---------------------------------------------------------------------------
// Ingresso HTTP
// ---------------------------------------------------------------------------
function doPost(e) {
  var risposta;
  try {
    var corpo = (e && e.postData && e.postData.contents) || '';
    if (corpo.length > 40 * 1024 * 1024) {
      risposta = { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta troppo grande.' };
    } else {
      var richiesta;
      try { richiesta = JSON.parse(corpo); } catch (e) { richiesta = undefined; }
      risposta = richiesta === undefined
        ? { ok: false, errore: 'richiesta-non-valida', messaggio: 'Richiesta non leggibile.' }
        : custode_().gestisci(richiesta);
    }
  } catch (err) {
    // Configurazione o servizi Google (Drive, cache) non disponibili: l'app riprova
    risposta = { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(err && err.message || err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(risposta)).setMimeType(ContentService.MimeType.JSON);
}

// Solo per verificare dal browser che il custode risponda. Non espone dati.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, servizio: 'custode Quaderno TICE', versione: VERSIONE_CUSTODE,
    configurato: !!(PROP.getProperty('CARTELLA_RADICE') && PROP.getProperty('GOOGLE_CLIENT_ID')),
  })).setMimeType(ContentService.MimeType.JSON);
}

// Chi ospita il custode, sempre admin. Lo si legge da Google una volta e lo si
// ricorda nelle proprieta' dello script: se Google per un attimo non lo dice,
// il proprietario non viene scambiato per uno sconosciuto.
function proprietario_() {
  var p = PROP.getProperty('PROPRIETARIO');
  if (p) return String(p).trim().toLowerCase();
  var e = '';
  try { e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (x) { e = ''; }
  if (e) { try { PROP.setProperty('PROPRIETARIO', e); } catch (x) { /* si riprova la prossima volta */ } }
  return e;
}

var _custode = null;
function custode_() {
  if (_custode) return _custode;
  _custode = QT.creaCustode({
    archivio: archivioDrive_(),
    verificaToken: verificaToken_,
    proprietario: proprietario_,
    ora: function () { return new Date().toISOString(); },
    sha256Hex: function (b64) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.base64Decode(b64))); },
    // Risposte alle scritture gia' fatte, per i reinvii dell'app (10 minuti)
    ricordo: {
      leggi: function (k) { return CacheService.getScriptCache().get(chiaveCache_(k)); },
      scrivi: function (k, v) { CacheService.getScriptCache().put(chiaveCache_(k), v, 600); },
    },
  });
  return _custode;
}

// ---------------------------------------------------------------------------
// Identita': verifica dell'ID token di "Accedi con Google"
// ---------------------------------------------------------------------------
function verificaToken_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('token mancante');
  // Client dell'app web e, se c'è, dell'app desktop (accesso dal browser di sistema)
  var clientIds = [PROP.getProperty('GOOGLE_CLIENT_ID'), PROP.getProperty('GOOGLE_CLIENT_ID_DESKTOP')].filter(Boolean);
  if (!clientIds.length) throw new Error('GOOGLE_CLIENT_ID non configurato');

  // Un token si verifica una volta e poi si ricorda fino alla sua scadenza:
  // evita una chiamata a Google per ogni richiesta dell'app.
  var cache = CacheService.getScriptCache();
  var chiave = 'tok:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var inCache = cache.get(chiave);
  if (inCache) return JSON.parse(inCache);

  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('token rifiutato da Google');
  var t = JSON.parse(r.getContentText());

  // Il token deve essere stato emesso da Google, per QUESTA app, non scaduto,
  // e riferito a un'email verificata.
  if (clientIds.indexOf(t.aud) < 0) throw new Error('token emesso per un\'altra app');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw new Error('emittente non valido');
  if (String(t.email_verified) !== 'true') throw new Error('email non verificata');
  var adesso = Math.floor(Date.now() / 1000);
  var scade = Number(t.exp);
  if (!(scade > adesso)) throw new Error('token scaduto');

  var identita = { email: String(t.email).toLowerCase(), nome: t.name || t.given_name || t.email };
  var durata = Math.max(1, Math.min(21600, scade - adesso - 60));
  cache.put(chiave, JSON.stringify(identita), durata);
  return identita;
}

// Le chiavi della cache di Apps Script hanno un limite di lunghezza
function chiaveCache_(k) {
  return 'r:' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k));
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

// ---------------------------------------------------------------------------
// Archivio su Drive, con percorsi tipo "Pazienti/pz_x/paziente.json"
// ---------------------------------------------------------------------------
function archivioDrive_() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE');
  if (!radiceId) throw new Error('CARTELLA_RADICE non configurata');
  var cache = CacheService.getScriptCache();
  var memoria = {};   // cache della singola richiesta

  function radice() { return DriveApp.getFolderById(radiceId); }

  // Cartella di un percorso ("Pazienti/pz_x"), creandola se serve.
  function cartella(percorso, crea) {
    if (!percorso) return radice();
    if (memoria['d:' + percorso]) return memoria['d:' + percorso];
    var id = cache.get('d:' + percorso);
    if (id) {
      try {
        var f = DriveApp.getFolderById(id);
        memoria['d:' + percorso] = f;
        return f;
      } catch (e) { cache.remove('d:' + percorso); }
    }
    var parti = percorso.split('/');
    var nome = parti.pop();
    var genitore = cartella(parti.join('/'), crea);
    if (!genitore) return null;
    var it = genitore.getFoldersByName(nome);
    var trovata = it.hasNext() ? it.next() : (crea ? genitore.createFolder(nome) : null);
    if (trovata) {
      cache.put('d:' + percorso, trovata.getId(), 21600);
      memoria['d:' + percorso] = trovata;
    }
    return trovata;
  }

  function file(percorso) {
    if (memoria['f:' + percorso] !== undefined) return memoria['f:' + percorso];
    var id = cache.get('f:' + percorso);
    if (id) {
      try {
        var f = DriveApp.getFileById(id);
        if (!f.isTrashed()) { memoria['f:' + percorso] = f; return f; }
      } catch (e) { /* rimosso: si cerca per nome */ }
      cache.remove('f:' + percorso);
    }
    var parti = percorso.split('/');
    var nome = parti.pop();
    var dir = cartella(parti.join('/'), false);
    var trovato = null;
    if (dir) {
      var it = dir.getFilesByName(nome);
      while (it.hasNext()) {
        var cand = it.next();
        if (!cand.isTrashed()) { trovato = cand; break; }
      }
    }
    if (trovato) cache.put('f:' + percorso, trovato.getId(), 21600);
    memoria['f:' + percorso] = trovato;
    return trovato;
  }

  // Il contenuto dei file JSON si tiene anche nella cache di Apps Script (molto
  // più veloce di Drive) e si aggiorna a ogni scrittura, che passa sempre di qui.
  // I file grandi in pezzi da 90 KB (fino a ~900 KB); le versioni precedenti
  // dei pazienti no (si leggono di rado). Un pezzo perso o una cache svuotata
  // fanno rileggere da Drive, mai mezzo file.
  var PEZZO = 90000, MAX_PEZZI = 10;
  var daTenere = function (p) { return !/\/versioni\//.test(p); };
  // la generazione cambia con svuotaCache(): da lì tutto si rilegge da Drive
  function chiaveC(p) { return 'c' + generazioneCache_() + ':' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p)).slice(0, 40); }
  // undefined: la cache non sa niente; null: il file non c'è; testo: il contenuto
  function daCache(p) {
    if (!daTenere(p)) return undefined;
    var k = chiaveC(p), testa = cache.get(k);
    if (!testa) return undefined;
    try {
      var t = JSON.parse(testa);
      if (t.assente) return null;
      var chiavi = [];
      for (var i = 0; i < t.n; i++) chiavi.push(k + ':' + t.tag + ':' + i);
      var pezzi = cache.getAll(chiavi), out = '';
      for (var j = 0; j < chiavi.length; j++) { if (pezzi[chiavi[j]] == null) return undefined; out += pezzi[chiavi[j]]; }
      return out.length === t.len ? out : undefined;
    } catch (e) { return undefined; }
  }
  function inCache(p, testo) {
    if (!daTenere(p)) return;
    var k = chiaveC(p);
    try {
      if (testo == null) { cache.put(k, JSON.stringify({ assente: true }), 21600); return; }
      if (testo.length > PEZZO * MAX_PEZZI) { cache.remove(k); return; }
      var tag = Math.random().toString(36).slice(2, 8), n = Math.ceil(testo.length / PEZZO), pezzi = {};
      for (var i = 0; i < n; i++) pezzi[k + ':' + tag + ':' + i] = testo.slice(i * PEZZO, (i + 1) * PEZZO);
      cache.putAll(pezzi, 21600);
      cache.put(k, JSON.stringify({ tag: tag, n: n, len: testo.length }), 21600);
    } catch (e) { try { cache.remove(k); } catch (x) { /* solo una comodità */ } }
  }

  // Una copia letta da Drive entra in cache solo se nessuno può scrivere intanto:
  // dentro il lucchetto delle scritture, o prendendolo se è libero. Altrimenti una
  // lettura lenta potrebbe rimettere in cache la versione vecchia di un file
  // appena salvato da un'altra persona.
  var inLock = false;
  function testoDrive(p) { var f = file(p); return f ? f.getBlob().getDataAsString('UTF-8') : null; }
  function testoDaDrive(p) {
    if (inLock || !daTenere(p)) { var t = testoDrive(p); if (inLock) inCache(p, t); return t; }
    var lock = LockService.getScriptLock();
    if (lock.tryLock(0)) {
      try { var t2 = testoDrive(p); inCache(p, t2); return t2; } finally { lock.releaseLock(); }
    }
    return testoDrive(p);
  }

  function scriviTesto(percorso, contenuto, mime) {
    var f = file(percorso);
    if (f) {
      f.setContent(contenuto);
      inCache(percorso, contenuto);
      return;
    }
    var parti = percorso.split('/');
    var nome = parti.pop();
    var nuovo = cartella(parti.join('/'), true).createFile(nome, contenuto, mime);
    cache.put('f:' + percorso, nuovo.getId(), 21600);
    memoria['f:' + percorso] = nuovo;
    inCache(percorso, contenuto);
  }

  return {
    leggiJSON: function (percorso) {
      var c = daCache(percorso);
      if (c !== undefined) return c === null ? null : JSON.parse(c);
      var testo = testoDaDrive(percorso);
      return testo == null ? null : JSON.parse(testo);
    },
    scriviJSON: function (percorso, oggetto) {
      scriviTesto(percorso, JSON.stringify(oggetto), 'application/json');
    },
    elenca: function (percorso) {
      var dir = cartella(percorso, false);
      var out = { file: [], cartelle: [] };
      if (!dir) return out;
      var fi = dir.getFiles();
      while (fi.hasNext()) { var f = fi.next(); if (!f.isTrashed()) out.file.push(f.getName()); }
      var di = dir.getFolders();
      while (di.hasNext()) { var d = di.next(); if (!d.isTrashed()) out.cartelle.push(d.getName()); }
      return out;
    },
    leggiBinario: function (percorso) {
      var f = file(percorso);
      if (!f) return null;
      var blob = f.getBlob();
      return { base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
    },
    scriviBinario: function (percorso, base64, mime) {
      if (file(percorso)) return;   // le immagini sono nominate dal contenuto: se c'e', e' identica
      var parti = percorso.split('/');
      var nome = parti.pop();
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, nome);
      var nuovo = cartella(parti.join('/'), true).createFile(blob);
      cache.put('f:' + percorso, nuovo.getId(), 21600);
      memoria['f:' + percorso] = nuovo;
    },
    esiste: function (percorso) { var c = daCache(percorso); return c !== undefined ? c !== null : !!file(percorso); },
    // Solo i nomi, con una ricerca sola (senza chiedere a Drive file per file se e' nel cestino)
    nomiFile: function (percorso) {
      var dir = cartella(percorso, false);
      var out = [];
      if (!dir) return out;
      var cerca = !!dir.searchFiles;
      var it = cerca ? dir.searchFiles('trashed = false') : dir.getFiles();
      while (it.hasNext()) { var f = it.next(); if (cerca || !f.isTrashed()) out.push(f.getName()); }
      return out;
    },
    // Nel cestino di Drive, non cancellato per sempre: resta recuperabile per 30 giorni
    elimina: function (percorso) {
      var f = file(percorso);
      if (!f) return;
      f.setTrashed(true);
      cache.remove('f:' + percorso);
      memoria['f:' + percorso] = null;
      inCache(percorso, null);
    },
    conLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        var e = new Error('Il custode e\' occupato: riprova tra qualche secondo.');
        e.occupato = true;
        throw e;
      }
      inLock = true;
      try { return fn(); } finally { inLock = false; lock.releaseLock(); }
    },
  };
}

// ---------------------------------------------------------------------------
// Da eseguire a mano dall'editor
// ---------------------------------------------------------------------------

/** Prepara le cartelle nel Drive condiviso e verifica la configurazione. */
function configura() {
  var radiceId = PROP.getProperty('CARTELLA_RADICE');
  var clientId = PROP.getProperty('GOOGLE_CLIENT_ID');
  if (!radiceId) throw new Error('Imposta la proprieta\' CARTELLA_RADICE (id della cartella nel Drive condiviso).');
  if (!clientId) throw new Error('Imposta la proprieta\' GOOGLE_CLIENT_ID (dalla console Google Cloud).');
  var radice = DriveApp.getFolderById(radiceId);
  ['_config', 'Pazienti', 'Materiali', 'Materiali/set', 'Materiali/immagini'].forEach(function (p) {
    var dir = radice;
    p.split('/').forEach(function (nome) {
      var it = dir.getFoldersByName(nome);
      dir = it.hasNext() ? it.next() : dir.createFolder(nome);
    });
  });
  var proprietario = proprietario_();
  Logger.log('Cartella radice: ' + radice.getName());
  Logger.log('Proprietario (sempre admin): ' + proprietario);
  Logger.log('Client ID: ' + clientId);
  Logger.log('Client ID desktop: ' + (PROP.getProperty('GOOGLE_CLIENT_ID_DESKTOP') || '(nessuno: accesso solo dal browser)'));
  Logger.log('Pronto. Ora: Distribuisci > Nuova distribuzione > App web.');
}

/** Ricostruisce l'elenco dei pazienti dai loro file. */
function ricostruisciCache() {
  svuotaCache();
  _custode = null;
  var n = custode_().ricostruisci();
  Logger.log('Cache ricostruite per ' + n + ' pazienti.');
}

/**
 * Facoltativo, per un custode più pronto. Apps Script, quando nessuno lo usa
 * per un po', alla prima richiesta impiega qualche secondo a ripartire: un
 * risveglio ogni 10 minuti nelle ore di lavoro lo tiene pronto e rinfresca la
 * cache dei file di configurazione. Esegui una volta `attivaRisveglio` dall'editor
 * (chiede il permesso di creare un attivatore); `disattivaRisveglio` lo toglie.
 */
function attivaRisveglio() {
  disattivaRisveglio();
  ScriptApp.newTrigger('risveglio').timeBased().everyMinutes(10).create();
  Logger.log('Risveglio attivo: ogni 10 minuti, dalle 7 alle 21.');
}
function disattivaRisveglio() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'risveglio') ScriptApp.deleteTrigger(t); });
}
function risveglio() {
  var ora = Number(Utilities.formatDate(new Date(), 'Europe/Rome', 'H'));
  if (ora < 7 || ora >= 21) return;
  var a = archivioDrive_();
  ['_config/accessi.json', '_config/cifratura.json', '_config/dispositivi.json', 'Pazienti/_elenco.json', 'Materiali/indice.json', '_config/modalita.json']
    .forEach(function (p) { try { a.leggiJSON(p); } catch (e) { /* al prossimo giro */ } });
}

// Dopo una modifica fatta a mano sui file in Drive (da evitare: es. un file
// ripristinato da una versione precedente) il custode continuerebbe a usare la
// copia in cache per qualche ora. svuotaCache, eseguita dall'editor, la fa
// rileggere tutta da Drive.
var _generazione = null;
function generazioneCache_() {
  if (_generazione == null) _generazione = PropertiesService.getScriptProperties().getProperty('GENERAZIONE_CACHE') || '0';
  return _generazione;
}
function svuotaCache() {
  _generazione = Date.now().toString(36);
  PropertiesService.getScriptProperties().setProperty('GENERAZIONE_CACHE', _generazione);
  Logger.log('Cache svuotata: il custode rilegge tutto da Drive.');
}

// ============================================================================
// Logica del custode (custode/core.js)
// ============================================================================

/**
 * Quaderno TICE — logica del custode.
 *
 * Questo file NON usa nessun servizio Google: riceve dall'esterno un "ambiente"
 * (archivio, verifica del token, orologio) e decide tutto il resto. Cosi' la
 * stessa identica logica gira:
 *   - su Google Apps Script (Code.gs le passa Drive, LockService, UrlFetch);
 *   - in locale con tools/custode-mock.js, dove viene testata.
 *
 * Qui dentro stanno le regole che contano per la sicurezza: chi e'
 * autorizzato, a quali pazienti, cosa puo' fare. L'app mostra; decide il custode.
 *
 * I dati dei pazienti arrivano GIA' CIFRATI dall'app (AES-256-GCM, con la
 * chiave del centro che il custode non conosce): qui si vedono solo buste
 * opache con qualche metadato (identificativo, versione, chi e quando ha
 * salvato). Chi apre il Drive, compresi gli amministratori del dominio, vede
 * solo quelle. Per ogni paziente il custode tiene anche le versioni precedenti.
 *
 * Tutto e' sincrono di proposito: in Apps Script lo sono anche Drive e UrlFetch.
 */
var QT = (function () {
  'use strict';

  var SCHEMA = 2;

  // Chi puo' fare cosa. E' l'unico posto da cambiare per modificare i ruoli.
  // "programmi" e "importa" sono rispettati dall'app: il custode non legge il
  // contenuto cifrato, quindi controlla chi puo' salvare un paziente, non cosa.
  var PERMESSI = {
    admin: {
      vediTutti: true, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: true, eliminaPazienti: true,
      pubblicaMateriali: true, eliminaMateriali: true, gestisciAccessi: true,
    },
    professionista: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: true, eliminaPazienti: false,
      pubblicaMateriali: true, eliminaMateriali: false, gestisciAccessi: false,
    },
    tirocinante: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: false,
      programmi: false, creaPazienti: false, importa: false, eliminaPazienti: false,
      pubblicaMateriali: false, eliminaMateriali: false, gestisciAccessi: false,
    },
  };
  var RUOLI = Object.keys(PERMESSI);

  // Versioni precedenti di ogni paziente: le ultime RECENTI, piu' l'ultima di
  // ciascun giorno per GIORNI giorni. Un errore si recupera anche settimane dopo.
  var VERSIONI = { recenti: 20, giorni: 60 };
  // salvataggi della stessa persona entro 30 minuti: una versione precedente sola
  var BOZZE_MS = 30 * 60000;

  var P = {
    accessi: '_config/accessi.json',
    cifratura: '_config/cifratura.json',
    dispositivi: '_config/dispositivi.json',
    elenco: 'Pazienti/_elenco.json',
    paziente: function (pid) { return 'Pazienti/' + pid + '/paziente.json'; },
    versioni: function (pid) { return 'Pazienti/' + pid + '/versioni'; },
    indiceVersioni: function (pid) { return 'Pazienti/' + pid + '/versioni.json'; },
    versione: function (pid, v) { return 'Pazienti/' + pid + '/versioni/v' + ('00000000' + v).slice(-8) + '.json'; },
    indiceMateriali: 'Materiali/indice.json',
    modalita: '_config/modalita.json',
    turni: function (k) { return 'Turni/' + k + '.json'; },
    cartellaImmagini: 'Materiali/immagini',
    set: function (id) { return 'Materiali/set/' + id + '.json'; },
    immagine: function (hash, ext) { return 'Materiali/immagini/' + hash + '.' + ext; },
  };

  var RE = {
    pz: /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/,
    set: /^[A-Za-z0-9_-]{1,80}$/,
    hash: /^[a-f0-9]{64}$/,
    data: /^\d{4}-\d{2}-\d{2}$/,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    kid: /^[a-z0-9-]{1,40}$/,
    dispositivo: /^[a-z0-9]{8,40}$/,
    b64: /^[A-Za-z0-9+/]*={0,2}$/,
    versione: /^v(\d{8})\.json$/,
    dataUrl: /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:audio\/(?:mpeg|mp4|webm|ogg|wav|x-m4a)));base64,([A-Za-z0-9+/=]+)$/,
  };
  // Tipi ammessi nell'archivio dei materiali. Niente SVG: puo' contenere script.
  var EST = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };

  // ------------------------------------------------------------------------
  // Errori
  // ------------------------------------------------------------------------
  function Errore(codice, messaggio, extra) {
    this.codice = codice;
    this.message = messaggio || codice;
    this.extra = extra || null;
  }
  function err(codice, messaggio, extra) { return new Errore(codice, messaggio, extra); }

  // ------------------------------------------------------------------------
  // Validazione: whitelist dei campi. L'endpoint e' pubblico, quindi ogni dato
  // che entra nel Drive passa di qui e i campi sconosciuti vengono scartati.
  // ------------------------------------------------------------------------
  function testoV(v, max, obbligatorio, campo) {
    if (v === undefined || v === null || v === '') {
      if (obbligatorio) throw err('richiesta-non-valida', 'Manca ' + campo);
      return obbligatorio ? '' : null;
    }
    if (typeof v !== 'string') throw err('richiesta-non-valida', campo + ' deve essere testo');
    if (v.length > max) throw err('richiesta-non-valida', campo + ' troppo lungo (max ' + max + ')');
    return v;
  }
  function interoV(v, min, max, campo, nullable) {
    if (v === null || v === undefined) {
      if (nullable) return null;
      throw err('richiesta-non-valida', 'Manca ' + campo);
    }
    if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < min || v > max) {
      throw err('richiesta-non-valida', campo + ' deve essere un intero tra ' + min + ' e ' + max);
    }
    return v;
  }

  function idV(v, re, campo) {
    if (typeof v !== 'string' || !re.test(v)) throw err('richiesta-non-valida', campo + ' non valido');
    return v;
  }
  function dataV(v, campo, nullable) {
    if ((v === null || v === undefined || v === '') && nullable) return null;
    if (typeof v !== 'string' || !RE.data.test(v)) throw err('richiesta-non-valida', campo + ' deve essere AAAA-MM-GG');
    return v;
  }

  function unoTra(v, valori, campo, predefinito) {
    if ((v === undefined || v === null) && predefinito !== undefined) return predefinito;
    if (valori.indexOf(v) < 0) throw err('richiesta-non-valida', campo + ' deve essere uno tra: ' + valori.join(', '));
    return v;
  }
  function listaV(v, max, campo) {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw err('richiesta-non-valida', campo + ' deve essere una lista');
    if (v.length > max) throw err('richiesta-non-valida', campo + ': troppi elementi (max ' + max + ')');
    return v;
  }
  function oggettoV(v, campo) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw err('richiesta-non-valida', campo + ' mancante o non valido');
    return v;
  }

  // Busta cifrata prodotta dall'app: il custode ne controlla solo la forma.
  function bustaV(b, maxCaratteri, campo) {
    oggettoV(b, campo);
    if (b.v !== 1 || b.alg !== 'A256GCM') throw err('richiesta-non-valida', campo + ': formato di cifratura non supportato');
    var kid = idV(b.kid, RE.kid, campo + '.kid');
    var iv = testoV(b.iv, 24, true, campo + '.iv');
    var dati = testoV(b.dati, maxCaratteri, true, campo + '.dati');
    if (!RE.b64.test(iv) || iv.length !== 16) throw err('richiesta-non-valida', campo + '.iv non valido');
    if (!RE.b64.test(dati) || dati.length % 4) throw err('richiesta-non-valida', campo + '.dati non valido');
    return { v: 1, alg: 'A256GCM', kid: kid, iv: iv, comp: unoTra(b.comp, ['gzip', 'no'], campo + '.comp', 'no'), dati: dati };
  }
  var MAX_PAZIENTE = 30 * 1024 * 1024;   // caratteri base64 (~22 MB): anni di sedute
  var MAX_ETICHETTA = 4096;
  var MAX_RISPOSTA = 8 * 1024 * 1024;     // caratteri: oltre, le immagini arrivano in piu' risposte

  // Scritture che l'app puo' ripetere quando la risposta si perde per strada
  // (con Apps Script capita: l'azione e' fatta ma l'app vede un errore).
  // Con lo stesso identificativo di richiesta il custode restituisce la
  // risposta di allora invece di rifare l'azione.
  var RIPETIBILI = {
    'cifratura.imposta': true, 'dispositivo.registra': true, 'dispositivi.abilita': true, 'dispositivo.togli': true,
    'paziente.crea': true, 'paziente.salva': true, 'paziente.archivia': true,
    'materiali.caricaImmagini': true, 'materiali.pubblica': true, 'materiali.elimina': true, 'accessi.salva': true,
    'modalita.aggiorna': true, 'turni.salva': true,
  };
  var RE_RICHIESTA = /^[A-Za-z0-9_-]{8,64}$/;

  function validaCifratura(c) {
    oggettoV(c, 'cifratura');
    var kdf = oggettoV(c.kdf, 'cifratura.kdf');
    if (kdf.nome !== 'PBKDF2-SHA256') throw err('richiesta-non-valida', 'Derivazione della chiave non supportata');
    var sale = testoV(kdf.sale, 100, true, 'sale');
    if (!RE.b64.test(sale) || sale.length < 22) throw err('richiesta-non-valida', 'sale non valido');
    return {
      schema: SCHEMA,
      kid: idV(c.kid, RE.kid, 'kid'),
      kdf: { nome: 'PBKDF2-SHA256', iterazioni: interoV(kdf.iterazioni, 100000, 5000000, 'iterazioni'), sale: sale },
      verifica: bustaV(c.verifica, 1000, 'verifica'),
      suggerimento: testoV(c.suggerimento, 200, false, 'suggerimento'),
    };
  }

  function validaAccessi(a) {
    oggettoV(a, 'accessi');
    var utenti = oggettoV(a.utenti || {}, 'accessi.utenti');
    var out = {};
    Object.keys(utenti).forEach(function (email) {
      var e = String(email).trim().toLowerCase();
      if (!RE.email.test(e)) throw err('richiesta-non-valida', 'Email non valida: ' + email);
      var u = oggettoV(utenti[email], 'utente ' + email);
      var pazienti = u.pazienti === '*' ? '*' : listaV(u.pazienti, 1000, 'pazienti').map(function (p) { return idV(p, RE.pz, 'pazienti'); });
      out[e] = {
        nome: testoV(u.nome, 60, false, 'nome') || e.split('@')[0],
        ruolo: unoTra(u.ruolo, RUOLI, 'ruolo'),
        pazienti: pazienti,
        attivo: u.attivo !== false,
        scadenza: dataV(u.scadenza, 'scadenza', true),
      };
    });
    return { schema: SCHEMA, utenti: out };
  }

  function validaSet(s) {
    oggettoV(s, 'set');
    var id = idV(s.id, RE.set, 'set.id');
    var items = listaV(s.items, 2000, 'set.items').map(function (it, i) {
      oggettoV(it, 'items[' + i + ']');
      return it;
    });
    // Immagini e audio viaggiano per riferimento (img:<hash>), mai incorporati:
    // si controlla ogni stringa, anche annidata (variantUrls, maschere, audio...).
    (function visita(v, percorso) {
      if (typeof v === 'string') {
        if (v.indexOf('data:') === 0) {
          throw err('richiesta-non-valida', percorso + ': immagini e audio vanno caricati a parte e riferiti come img:<hash>');
        }
      } else if (Array.isArray(v)) v.forEach(function (x, j) { visita(x, percorso + '[' + j + ']'); });
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { visita(v[k], percorso + '.' + k); });
    })(s, 'set');
    var testo = JSON.stringify(s);
    if (testo.length > 2 * 1024 * 1024) throw err('richiesta-non-valida', 'Set troppo grande');
    var o = JSON.parse(testo);
    o.id = id;
    o.items = items;
    return o;
  }

  // Riferimenti img:<hash> dentro un set (in qualunque campo, anche annidato)
  function hashRiferiti(obj) {
    var trovati = {};
    (function visita(v) {
      if (typeof v === 'string') {
        var m = /^img:([a-f0-9]{64})(?:\.([a-z0-9]+))?$/.exec(v);
        if (m) trovati[m[1]] = true;
      } else if (Array.isArray(v)) v.forEach(visita);
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { visita(v[k]); });
    })(obj);
    return Object.keys(trovati);
  }

  // JSON con chiavi ordinate: serve a riconoscere un reinvio identico.
  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stabile(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  // ------------------------------------------------------------------------
  // Il custode
  // ------------------------------------------------------------------------
  /**
   * amb = {
   *   archivio: { leggiJSON, scriviJSON, elenca, leggiBinario, scriviBinario, esiste, elimina, conLock },
   *   verificaToken(token) -> { email, nome }   (lancia se non valido)
   *   proprietario() -> email dell'account su cui gira il custode
   *   ora() -> ISO string
   *   sha256Hex(base64) -> hex dei byte decodificati
   *   ricordo?: { leggi(chiave) -> testo|null, scrivi(chiave, testo) }   (facoltativo)
   * }
   * archivio.nomiFile?(percorso) -> [nomi]  (facoltativo: elenco veloce dei soli file)
   */
  function creaCustode(amb) {
    var A = amb.archivio;

    // Lock rientrante: una ricostruzione di cache puo' partire sia da una
    // scrittura (gia' sotto lock) sia da una lettura (no). Tutte le scritture
    // passano di qui, cosi' non si sovrappongono mai.
    var inLock = false;
    function conLock(fn) {
      if (inLock) return fn();
      return A.conLock(function () {
        inLock = true;
        try { return fn(); } finally { inLock = false; }
      });
    }

    function oggi() { return amb.ora().slice(0, 10); }

    function leggiAccessi() {
      return A.leggiJSON(P.accessi) || { schema: SCHEMA, version: 0, utenti: {} };
    }

    function utenteDa(identita) {
      var email = String(identita.email || '').toLowerCase();
      var proprietario = String(amb.proprietario() || '').toLowerCase();
      var accessi = leggiAccessi();
      var voce = accessi.utenti[email];
      if (email && email === proprietario) {
        // Chi ospita il custode e' sempre admin: il primo accesso non richiede
        // configurazioni a mano e nessuno puo' chiuderlo fuori per errore.
        return { email: email, nome: (voce && voce.nome) || identita.nome || email, ruolo: 'admin', pazienti: '*', proprietario: true, scadenza: null };
      }
      if (!voce) throw err('non-autorizzato', 'L\'account ' + email + ' non è abilitato. Chiedi a un amministratore di aggiungerti.');
      if (voce.attivo === false) throw err('disattivato', 'L\'account ' + email + ' è stato disattivato.');
      if (voce.scadenza && oggi() > voce.scadenza) throw err('scaduto', 'L\'accesso di ' + email + ' è scaduto il ' + voce.scadenza + '.');
      return { email: email, nome: voce.nome || identita.nome || email, ruolo: voce.ruolo, pazienti: voce.pazienti, proprietario: false, scadenza: voce.scadenza || null };
    }

    function permessi(u) { return PERMESSI[u.ruolo] || PERMESSI.tirocinante; }
    function puo(u, cosa) {
      if (!permessi(u)[cosa]) throw err('vietato', 'Il tuo ruolo (' + u.ruolo + ') non consente questa operazione.');
    }
    function vede(u, pid) {
      return permessi(u).vediTutti || u.pazienti === '*' || (Array.isArray(u.pazienti) && u.pazienti.indexOf(pid) >= 0);
    }
    function richiediVisibile(u, pid) {
      if (!vede(u, pid)) throw err('vietato', 'Non sei assegnato a questo paziente.');
    }

    // --- Pazienti ---------------------------------------------------------------
    // Un file per paziente: { id, version, busta, etichetta, creato..., aggiornato... }.
    // L'elenco e' una cache ricostruibile dai file dei pazienti.
    function leggiRecord(pid) {
      var r = A.leggiJSON(P.paziente(pid));
      if (!r) throw err('non-trovato', 'Paziente non trovato.');
      return r;
    }
    function voceElenco(r) {
      return {
        id: r.id, version: r.version, etichetta: r.etichetta,
        aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa, eliminato: !!r.eliminato,
      };
    }
    function leggiElenco() {
      var e = A.leggiJSON(P.elenco);
      return e || conLock(ricostruisciElenco);
    }
    function ricostruisciElenco() {
      var elenco = { schema: SCHEMA, pazienti: {} };
      A.elenca('Pazienti').cartelle.forEach(function (pid) {
        if (!RE.pz.test(pid)) return;
        var r = A.leggiJSON(P.paziente(pid));
        if (r) elenco.pazienti[pid] = voceElenco(r);
      });
      A.scriviJSON(P.elenco, elenco);
      return elenco;
    }
    function aggiornaElenco(r) {
      var elenco = A.leggiJSON(P.elenco) || { schema: SCHEMA, pazienti: {} };
      elenco.pazienti[r.id] = voceElenco(r);
      A.scriviJSON(P.elenco, elenco);
    }

    // Le versioni precedenti di un paziente hanno un piccolo indice (numero, quando,
    // chi): per elencarle e potarle non si rileggono più i file uno per uno.
    function leggiIndiceVersioni(pid) {
      var x = A.leggiJSON(P.indiceVersioni(pid));
      if (x && Array.isArray(x.versioni)) return x;
      // la prima volta: dalle versioni già nella cartella (lette una volta sola)
      return { schema: SCHEMA, versioni: elencoVersioni(pid).map(function (v) {
        var r = A.leggiJSON(P.versioni(pid) + '/' + v.nome) || {};
        return { v: v.version, il: r.aggiornato || null, da: r.aggiornatoDa || null };
      }) };
    }
    // Prima di sovrascrivere, la versione attuale va nelle versioni precedenti.
    // Più salvataggi della stessa persona a pochi minuti l'uno dall'altro (si sta
    // lavorando al programma) sono una versione sola: se ne tiene l'ultima.
    function archiviaVersione(r) {
      var idx = leggiIndiceVersioni(r.id), l = idx.versioni, prec = l[0];
      A.scriviJSON(P.versione(r.id, r.version), r);
      var voce = { v: r.version, il: r.aggiornato || null, da: r.aggiornatoDa || null };
      if (prec && prec.v !== voce.v && prec.da && prec.da === voce.da && prec.il && voce.il &&
          Math.abs(Date.parse(voce.il) - Date.parse(prec.il)) < BOZZE_MS) {
        A.elimina(P.versione(r.id, prec.v));
        l[0] = voce;
      } else if (!prec || prec.v !== voce.v) l.unshift(voce);
      potaVersioni(r.id, idx);
      A.scriviJSON(P.indiceVersioni(r.id), idx);
    }
    function elencoVersioni(pid) {
      return A.elenca(P.versioni(pid)).file
        .map(function (nome) { var m = RE.versione.exec(nome); return m ? { nome: nome, version: parseInt(m[1], 10) } : null; })
        .filter(Boolean)
        .sort(function (a, b) { return b.version - a.version; });
    }
    function potaVersioni(pid, idx) {
      var tutte = idx.versioni;
      if (tutte.length <= VERSIONI.recenti) return;
      var limite = new Date(Date.parse(amb.ora()) - VERSIONI.giorni * 86400000).toISOString().slice(0, 10);
      var giorniVisti = {}, tenute = [];
      tutte.forEach(function (x, i) {
        if (i < VERSIONI.recenti) { tenute.push(x); return; }
        var giorno = x.il ? x.il.slice(0, 10) : '';
        // si tiene la piu' recente di ogni giorno (le versioni sono in ordine decrescente)
        if (giorno && giorno >= limite && !giorniVisti[giorno]) { giorniVisti[giorno] = true; tenute.push(x); return; }
        A.elimina(P.versione(pid, x.v));
      });
      idx.versioni = tenute;
    }

    // --- Azioni ---------------------------------------------------------------
    var azioni = {};

    azioni['io'] = function (u) {
      var c = A.leggiJSON(P.cifratura);
      // agli admin: quanti dispositivi aspettano la chiave (l'app chiede l'elenco solo se serve)
      var inAttesa;
      if (permessi(u).gestisciAccessi && c) {
        inAttesa = 0;
        var dd = leggiDispositivi().dispositivi;
        Object.keys(dd).forEach(function (id) { var x = dd[id]; if (!(x.chiavi && x.chiavi[c.kid]) && abilitato(x.email)) inAttesa++; });
      }
      return {
        email: u.email, nome: u.nome, ruolo: u.ruolo, pazienti: u.pazienti,
        proprietario: u.proprietario, scadenza: u.scadenza, permessi: permessi(u),
        cifratura: !!c, kid: (c || {}).kid || null, cfg: c || null, inAttesa: inAttesa,
      };
    };

    // La configurazione della chiave non e' segreta: sale e busta di verifica
    // servono a derivare la chiave dalla frase e a controllare che sia giusta.
    azioni['cifratura.leggi'] = function () { return A.leggiJSON(P.cifratura); };

    azioni['cifratura.imposta'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var c = validaCifratura(d.cifratura);
      return conLock(function () {
        var attuale = A.leggiJSON(P.cifratura);
        if (attuale) {
          // Reinvio identico (rete caduta dopo il salvataggio)
          if (stabile(attuale.verifica) === stabile(c.verifica) && attuale.kid === c.kid) return attuale;
          // Cambio della chiave: solo dichiarando quale si sostituisce. La
          // precedente resta descritta (non la chiave: sale e verifica) per
          // aprire le versioni vecchie con la frase di allora.
          if (!d.sostituisci || d.kidAttuale !== attuale.kid) {
            throw err('conflitto', 'La chiave del centro esiste già.', { attuale: attuale });
          }
          if (c.kid === attuale.kid || (attuale.precedenti || []).some(function (x) { return x.kid === c.kid; })) {
            throw err('richiesta-non-valida', 'Identificativo della chiave già usato.');
          }
          c.precedenti = [{ kid: attuale.kid, kdf: attuale.kdf, verifica: attuale.verifica, creato: attuale.creato, sostituita: amb.ora() }]
            .concat(attuale.precedenti || []);
          // I dispositivi abilitati con la vecchia chiave la perdono: gli admin la riconsegnano
          var disp = leggiDispositivi();
          Object.keys(disp.dispositivi).forEach(function (id) { disp.dispositivi[id].chiavi = {}; });
          A.scriviJSON(P.dispositivi, disp);
        }
        c.creato = amb.ora();
        c.creatoDa = u.email;
        A.scriviJSON(P.cifratura, c);
        return c;
      });
    };

    function richiediCifratura() {
      var c = A.leggiJSON(P.cifratura);
      if (!c) throw err('senza-chiave', 'Prima un amministratore deve creare la chiave del centro.');
      return c;
    }
    // Dopo un cambio di chiave nessuno salva piu' con quella vecchia
    function richiediChiaveAttuale(cfg) {
      for (var i = 1; i < arguments.length; i++) {
        var b = arguments[i];
        if (b && b.kid !== cfg.kid) throw err('chiave-cambiata', 'La chiave del centro è cambiata: l\'app si aggiorna e riprova.', { kid: cfg.kid });
      }
    }

    // --- Dispositivi ------------------------------------------------------------
    // Ogni dispositivo ha una coppia di chiavi RSA creata nel browser: la parte
    // privata non esce dal dispositivo. Un admin gli consegna la chiave del
    // centro cifrata con la parte pubblica: il dispositivo la usa senza che
    // nessuno la veda. Il custode conserva solo buste che non puo' aprire.
    function leggiDispositivi() {
      return A.leggiJSON(P.dispositivi) || { schema: SCHEMA, dispositivi: {} };
    }
    function abilitato(email) {
      if (email === String(amb.proprietario() || '').toLowerCase()) return true;
      var v = leggiAccessi().utenti[email];
      return !!v && v.attivo !== false && !(v.scadenza && oggi() > v.scadenza);
    }
    function mioDispositivo(u, id) {
      var disp = leggiDispositivi();
      var r = disp.dispositivi[id];
      if (!r || r.email !== u.email) throw err('non-trovato', 'Dispositivo non registrato.');
      return { disp: disp, r: r };
    }
    function b64V(v, max, campo) {
      var t = testoV(v, max, true, campo);
      if (!RE.b64.test(t) || t.length % 4) throw err('richiesta-non-valida', campo + ' non valido');
      return t;
    }

    azioni['dispositivo.registra'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      var pubblica = b64V(d.pubblica, 2000, 'pubblica');
      var nome = testoV(d.nome, 80, false, 'nome') || 'Dispositivo';
      return conLock(function () {
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (r && r.email !== u.email) throw err('conflitto', 'Identificativo di dispositivo già usato.');
        var ora = amb.ora();
        if (!r) r = disp.dispositivi[id] = { email: u.email, creato: ora, chiavi: {} };
        if (r.pubblica !== pubblica) { r.pubblica = pubblica; r.chiavi = {}; }
        r.nome = nome;
        r.ultimoAccesso = ora;
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: Object.keys(r.chiavi).length > 0 };
      });
    };

    azioni['dispositivo.chiave'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      var m = mioDispositivo(u, id);
      var cfg = A.leggiJSON(P.cifratura);
      // l'ultimo accesso si aggiorna al massimo una volta l'ora: non si riscrive a ogni sincronizzazione
      if (!m.r.ultimoAccesso || Date.parse(amb.ora()) - Date.parse(m.r.ultimoAccesso) > 3600000) {
        conLock(function () {
          var disp = leggiDispositivi();
          if (disp.dispositivi[id]) { disp.dispositivi[id].ultimoAccesso = amb.ora(); A.scriviJSON(P.dispositivi, disp); }
        });
      }
      return { kid: cfg ? cfg.kid : null, chiavi: m.r.chiavi || {} };
    };

    azioni['dispositivi.elenco'] = function (u) {
      puo(u, 'gestisciAccessi');
      var disp = leggiDispositivi(), cfg = A.leggiJSON(P.cifratura);
      return Object.keys(disp.dispositivi).map(function (id) {
        var r = disp.dispositivi[id];
        return {
          id: id, email: r.email, nome: r.nome, pubblica: r.pubblica, creato: r.creato, ultimoAccesso: r.ultimoAccesso,
          abilitato: !!(cfg && r.chiavi && r.chiavi[cfg.kid]), abilitatoDa: r.abilitatoDa || null, abilitatoIl: r.abilitatoIl || null,
          personaAbilitata: abilitato(r.email),
        };
      });
    };

    azioni['dispositivi.abilita'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var id = idV(d.id, RE.dispositivo, 'id');
      var kid = idV(d.kid, RE.kid, 'kid');
      var busta = b64V(d.chiave, 2000, 'chiave');
      return conLock(function () {
        var cfg = richiediCifratura();
        if (kid !== cfg.kid) throw err('chiave-cambiata', 'La chiave del centro è cambiata nel frattempo.');
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (!r) throw err('non-trovato', 'Dispositivo non registrato.');
        if (!abilitato(r.email)) throw err('vietato', 'La persona di questo dispositivo non è abilitata.');
        if (d.pubblica !== r.pubblica) throw err('conflitto', 'Il dispositivo ha cambiato chiavi: riprova.');
        r.chiavi = {};
        r.chiavi[kid] = busta;
        r.abilitatoDa = u.email;
        r.abilitatoIl = amb.ora();
        A.scriviJSON(P.dispositivi, disp);
        return { id: id, abilitato: true };
      });
    };

    azioni['dispositivo.togli'] = function (u, d) {
      var id = idV(d.id, RE.dispositivo, 'id');
      return conLock(function () {
        var disp = leggiDispositivi();
        var r = disp.dispositivi[id];
        if (!r) return true;
        if (r.email !== u.email) puo(u, 'gestisciAccessi');
        delete disp.dispositivi[id];
        A.scriviJSON(P.dispositivi, disp);
        return true;
      });
    };

    azioni['pazienti.elenco'] = function (u) {
      var elenco = leggiElenco();
      return Object.keys(elenco.pazienti)
        .filter(function (pid) { return vede(u, pid); })
        .map(function (pid) { return elenco.pazienti[pid]; });
    };

    azioni['paziente.leggi'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      return leggiRecord(pid);
    };

    azioni['paziente.crea'] = function (u, d) {
      puo(u, 'creaPazienti');
      var cfg = richiediCifratura();
      var pid = idV(d.id, RE.pz, 'id');
      var busta = bustaV(d.busta, MAX_PAZIENTE, 'busta');
      var etichetta = bustaV(d.etichetta, MAX_ETICHETTA, 'etichetta');
      richiediChiaveAttuale(cfg, busta, etichetta);
      return conLock(function () {
        var esistente = A.leggiJSON(P.paziente(pid));
        if (esistente) {
          // Reinvio della stessa creazione (rete caduta dopo il salvataggio)
          if (esistente.creatoDa === u.email && esistente.version === 1 && stabile(esistente.busta) === stabile(busta)) return esistente;
          throw err('conflitto', 'Esiste già un paziente con questo identificativo.', { attuale: vede(u, pid) ? esistente : null });
        }
        var ora = amb.ora();
        var r = { schema: SCHEMA, id: pid, version: 1, busta: busta, etichetta: etichetta,
          creato: ora, creatoDa: u.email, aggiornato: ora, aggiornatoDa: u.email };
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        assegnaSeServe(u, pid);
        return r;
      });
    };

    // Chi crea un paziente senza vederli tutti se lo ritrova assegnato.
    function assegnaSeServe(u, pid) {
      if (vede(u, pid) || u.proprietario) return;
      var accessi = leggiAccessi();
      var voce = accessi.utenti[u.email];
      if (!voce || voce.pazienti === '*') return;
      voce.pazienti = (voce.pazienti || []).concat([pid]);
      accessi.version = (accessi.version || 0) + 1;
      accessi.aggiornato = amb.ora();
      accessi.aggiornatoDa = u.email;
      A.scriviJSON(P.accessi, accessi);
      u.pazienti = voce.pazienti;
    }

    // Salvataggio con controllo di versione: se nel frattempo un altro
    // dispositivo ha salvato, risponde "conflitto" con la versione attuale e
    // l'app unisce le due (lei puo' leggerle, il custode no) e riprova.
    azioni['paziente.salva'] = function (u, d) {
      puo(u, 'registraSedute');
      var cfg = richiediCifratura();
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      var busta = bustaV(d.busta, MAX_PAZIENTE, 'busta');
      var etichetta = d.etichetta ? bustaV(d.etichetta, MAX_ETICHETTA, 'etichetta') : null;
      richiediChiaveAttuale(cfg, busta, etichetta);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiRecord(pid);
        if (attuale.version !== base) {
          throw err('conflitto', 'Nel frattempo qualcun altro ha modificato questo paziente.', { attuale: attuale });
        }
        if (attuale.eliminato && !permessi(u).eliminaPazienti) throw err('vietato', 'Questo paziente è stato archiviato.');
        archiviaVersione(attuale);
        var ora = amb.ora();
        var r = { schema: SCHEMA, id: pid, version: attuale.version + 1, busta: busta, etichetta: etichetta || attuale.etichetta,
          creato: attuale.creato, creatoDa: attuale.creatoDa, aggiornato: ora, aggiornatoDa: u.email };
        if (attuale.eliminato) r.eliminato = true;   // resta archiviato anche se ricifrato
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        return { id: r.id, version: r.version, aggiornato: r.aggiornato, aggiornatoDa: r.aggiornatoDa };
      });
    };

    azioni['paziente.versioni'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      return leggiIndiceVersioni(pid).versioni.map(function (x) {
        return { version: x.v, aggiornato: x.il, aggiornatoDa: x.da };
      });
    };

    azioni['paziente.versione'] = function (u, d) {
      var pid = idV(d.id, RE.pz, 'id');
      richiediVisibile(u, pid);
      var r = A.leggiJSON(P.versione(pid, interoV(d.version, 1, 1e9, 'version')));
      if (!r) throw err('non-trovato', 'Versione non trovata.');
      return r;
    };

    // Archivia (non cancella): il file resta, con tutte le versioni, e un admin
    // puo' riattivarlo. Sparisce dai dispositivi alla sincronizzazione successiva.
    azioni['paziente.archivia'] = function (u, d) {
      puo(u, 'eliminaPazienti');
      var pid = idV(d.id, RE.pz, 'id');
      var archiviato = d.archiviato !== false;
      return conLock(function () {
        var r = leggiRecord(pid);
        if (!!r.eliminato === archiviato) return voceElenco(r);
        archiviaVersione(r);
        r.version += 1;
        r.eliminato = archiviato;
        r.aggiornato = amb.ora();
        r.aggiornatoDa = u.email;
        A.scriviJSON(P.paziente(pid), r);
        aggiornaElenco(r);
        return voceElenco(r);
      });
    };

    // --- Materiali ------------------------------------------------------------
    function leggiIndiceMateriali() {
      return A.leggiJSON(P.indiceMateriali) || { schema: SCHEMA, version: 0, sets: {} };
    }

    azioni['materiali.indice'] = function () { return leggiIndiceMateriali(); };

    azioni['materiali.set'] = function (u, d) {
      var id = idV(d.id, RE.set, 'id');
      var voce = leggiIndiceMateriali().sets[id];
      if (!voce) throw err('non-trovato', 'Set non trovato.');
      return A.leggiJSON(P.set(id));
    };

    azioni['materiali.mancanti'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var hashes = listaV(d.hashes, 5000, 'hashes');
      hashes.forEach(function (h) { idV(h, RE.hash, 'hash'); });
      preparaImmagini(hashes.length);
      return hashes.filter(function (h) { return !immagineEsiste(h); });
    };

    // Quali immagini ci sono: con molti hash un solo elenco della cartella
    // costa molto meno di una ricerca per ogni hash e per ogni estensione.
    // Vale per la sola richiesta in corso (si azzera in gestisci).
    var registroImmagini = null;
    function preparaImmagini(quante) {
      if (registroImmagini || quante < 4) return;
      var nomi = A.nomiFile ? A.nomiFile(P.cartellaImmagini) : A.elenca(P.cartellaImmagini).file;
      registroImmagini = {};
      nomi.forEach(function (n) { var m = /^([a-f0-9]{64})\.(\w+)$/.exec(n); if (m) registroImmagini[m[1]] = m[2]; });
    }
    function immagineEsiste(hash) {
      if (registroImmagini) return registroImmagini[hash] || null;
      for (var mime in EST) if (A.esiste(P.immagine(hash, EST[mime]))) return EST[mime];
      return null;
    }

    azioni['materiali.caricaImmagini'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var imm = oggettoV(d.immagini, 'immagini');
      var chiavi = Object.keys(imm);
      if (chiavi.length > 40) throw err('richiesta-non-valida', 'Al massimo 40 immagini per richiesta.');
      preparaImmagini(chiavi.length);
      var caricate = [];
      chiavi.forEach(function (h) {
        idV(h, RE.hash, 'hash');
        var m = RE.dataUrl.exec(String(imm[h] || ''));
        if (!m) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ': solo immagini PNG/JPEG/WebP/GIF o audio.');
        if (m[2].length > 14 * 1024 * 1024) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ' troppo grande (max ~10 MB).');
        // L'hash lo ricalcola il custode: un client non puo' salvare un file
        // sotto il nome di un altro e contaminare le cache degli altri.
        if (amb.sha256Hex(m[2]) !== h) throw err('richiesta-non-valida', 'L\'hash del file ' + h.slice(0, 8) + ' non corrisponde al contenuto.');
        if (!immagineEsiste(h)) {
          A.scriviBinario(P.immagine(h, EST[m[1]]), m[2], m[1]);
          if (registroImmagini) registroImmagini[h] = EST[m[1]];
        }
        caricate.push(h);
      });
      return caricate;
    };

    azioni['materiali.immagini'] = function (u, d) {
      var hashes = listaV(d.hashes, 40, 'hashes');
      hashes.forEach(function (h) { idV(h, RE.hash, 'hash'); });
      preparaImmagini(hashes.length);
      // Risposte troppo grosse si perdono per strada: oltre ~8 MB ci si ferma e
      // l'app richiede le restanti (le trova assenti da questa risposta).
      var out = {}, peso = 0;
      for (var i = 0; i < hashes.length && peso < MAX_RISPOSTA; i++) {
        var ext = immagineEsiste(hashes[i]);
        if (!ext) continue;
        var b = A.leggiBinario(P.immagine(hashes[i], ext));
        if (b) { out[hashes[i]] = 'data:' + b.mime + ';base64,' + b.base64; peso += b.base64.length; }
      }
      return out;
    };

    azioni['materiali.pubblica'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var set = validaSet(d.set);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      var hashes = hashRiferiti(set);
      preparaImmagini(hashes.length);
      return conLock(function () {
        var mancanti = hashes.filter(function (h) { return !immagineEsiste(h); });
        if (mancanti.length) throw err('immagini-mancanti', 'Mancano ' + mancanti.length + ' immagini: caricale prima di pubblicare.', { mancanti: mancanti });
        var indice = leggiIndiceMateriali();
        var prima = indice.sets[set.id];
        var versioneAttuale = prima ? prima.versione : 0;
        if (versioneAttuale !== base) {
          throw err('conflitto', 'Questo set è stato aggiornato da ' + (prima && prima.aggiornatoDa) + ' nel frattempo.', { versioneAttuale: versioneAttuale });
        }
        var ora = amb.ora();
        set.versione = versioneAttuale + 1;
        set.aggiornato = ora; set.aggiornatoDa = u.email;
        A.scriviJSON(P.set(set.id), set);
        indice.sets[set.id] = {
          nome: String(set.name || set.nome || set.id).slice(0, 120),
          categoria: String(set.category || set.categoria || '').slice(0, 80),
          versione: set.versione, immagini: hashes,
          nItems: (set.items || []).length,
          aggiornato: ora, aggiornatoDa: u.email,
          pubblicatoDa: prima ? prima.pubblicatoDa : u.email,
        };
        indice.version = (indice.version || 0) + 1;
        indice.aggiornato = ora;
        A.scriviJSON(P.indiceMateriali, indice);
        return indice.sets[set.id];
      });
    };

    azioni['materiali.elimina'] = function (u, d) {
      puo(u, 'eliminaMateriali');
      var id = idV(d.id, RE.set, 'id');
      return conLock(function () {
        var indice = leggiIndiceMateriali();
        if (!indice.sets[id]) throw err('non-trovato', 'Set non trovato.');
        delete indice.sets[id];   // il file del set resta nel Drive: si puo' recuperare
        indice.version = (indice.version || 0) + 1;
        indice.aggiornato = amb.ora();
        A.scriviJSON(P.indiceMateriali, indice);
        return true;
      });
    };

    // --- Modalità e sinonimi del centro ------------------------------------------
    // Un solo dizionario per tutti: come si chiamano nei quaderni le modalità
    // (TACT, Intensive tact, Mandi sì/no...) e in quale categoria stanno. Non
    // contiene dati dei bambini: nomi di programmi, quindi in chiaro.
    var RE_MOD = /^[a-z0-9][a-z0-9-]{0,47}$/;
    function leggiModalita() {
      return A.leggiJSON(P.modalita) || { schema: SCHEMA, version: 0, categorie: [], modalita: [], sinonimi: {}, modi: {} };
    }
    azioni['modalita.leggi'] = function () { return leggiModalita(); };

    // Aggiunte, non sostituzioni: due persone che importano insieme non si
    // cancellano a vicenda. Un sinonimo o un modo a null si toglie.
    azioni['modalita.aggiorna'] = function (u, d) {
      if (!permessi(u).importa && !permessi(u).programmi) throw err('vietato', 'Non puoi modificare le modalità del centro.');
      var cat = listaV(d.categorie || [], 50, 'categorie').map(function (c) {
        oggettoV(c, 'categoria');
        return { id: idV(c.id, RE_MOD, 'categoria.id'), nome: testoV(c.nome, 60, true, 'categoria.nome') };
      });
      var mod = listaV(d.modalita || [], 200, 'modalita').map(function (m) {
        oggettoV(m, 'modalita');
        return { id: idV(m.id, RE_MOD, 'modalita.id'), nome: testoV(m.nome, 60, true, 'modalita.nome'), categoria: idV(m.categoria, RE_MOD, 'modalita.categoria') };
      });
      var sin = {}, modi = {};
      var sinIn = d.sinonimi ? oggettoV(d.sinonimi, 'sinonimi') : {};
      var chiaviSin = Object.keys(sinIn);
      if (chiaviSin.length > 500) throw err('richiesta-non-valida', 'Troppi sinonimi in una volta.');
      chiaviSin.forEach(function (k) {
        var kk = idV(k, /^[a-z0-9][a-z0-9 ]{0,79}$/, 'sinonimo');
        var v = sinIn[k];
        if (v === null) { sin[kk] = null; return; }
        oggettoV(v, 'sinonimo');
        sin[kk] = { modalita: idV(v.modalita, RE_MOD, 'sinonimo.modalita') };
        if (v.variante) sin[kk].variante = testoV(v.variante, 80, false, 'sinonimo.variante');
      });
      var modiIn = d.modi ? oggettoV(d.modi, 'modi') : {};
      Object.keys(modiIn).forEach(function (k) {
        idV(k, /^[a-z0-9_]{1,40}$/, 'modo');
        modi[k] = modiIn[k] === null ? null : idV(modiIn[k], RE_MOD, 'modi.modalita');
      });
      return conLock(function () {
        var x = leggiModalita();
        x.categorie = x.categorie || []; x.modalita = x.modalita || []; x.sinonimi = x.sinonimi || {}; x.modi = x.modi || {};
        cat.forEach(function (c) {
          var i = -1; x.categorie.forEach(function (y, k) { if (y.id === c.id) i = k; });
          if (i >= 0) x.categorie[i] = c; else x.categorie.push(c);
        });
        mod.forEach(function (m) {
          var i = -1; x.modalita.forEach(function (y, k) { if (y.id === m.id) i = k; });
          if (i >= 0) x.modalita[i] = m; else x.modalita.push(m);
        });
        Object.keys(sin).forEach(function (k) { if (sin[k] === null) delete x.sinonimi[k]; else x.sinonimi[k] = sin[k]; });
        Object.keys(modi).forEach(function (k) { if (modi[k] === null) delete x.modi[k]; else x.modi[k] = modi[k]; });
        if (Object.keys(x.sinonimi).length > 3000 || x.modalita.length > 500) throw err('richiesta-non-valida', 'Il dizionario delle modalità è troppo grande.');
        x.schema = SCHEMA;
        x.version = (x.version || 0) + 1;
        x.aggiornato = amb.ora();
        x.aggiornatoDa = u.email;
        A.scriviJSON(P.modalita, x);
        return x;
      });
    };

    // --- Turni -------------------------------------------------------------------
    // Chi segue quale bambino e quando: una busta cifrata con la chiave del
    // centro per ogni settimana (chiave = il lunedì) e una per le persone dei
    // turni e una per la settimana tipo. Li leggono tutti, li cambia chi gestisce i programmi.
    var RE_TURNI = /^(persone|modello|\d{4}-\d{2}-\d{2})$/;
    var MAX_TURNI = 2 * 1024 * 1024;
    azioni['turni.leggi'] = function (u, d) {
      var k = idV(d.chiave, RE_TURNI, 'chiave');
      var x = A.leggiJSON(P.turni(k));
      return x ? { chiave: k, version: x.version, busta: x.busta, aggiornato: x.aggiornato, aggiornatoDa: x.aggiornatoDa } : { chiave: k, version: 0, busta: null };
    };
    azioni['turni.salva'] = function (u, d) {
      puo(u, 'programmi');
      var cfg = richiediCifratura();
      var k = idV(d.chiave, RE_TURNI, 'chiave');
      var b = bustaV(d.busta, MAX_TURNI, 'busta');
      richiediChiaveAttuale(cfg, b);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var x = A.leggiJSON(P.turni(k));
        if (((x && x.version) || 0) !== base) {
          throw err('conflitto', 'I turni sono stati cambiati da ' + ((x && x.aggiornatoDa) || 'un\'altra persona') + ' nel frattempo.', { attuale: x });
        }
        var n = { chiave: k, version: base + 1, busta: b, aggiornato: amb.ora(), aggiornatoDa: u.email };
        A.scriviJSON(P.turni(k), n);
        return { chiave: k, version: n.version, aggiornato: n.aggiornato };
      });
    };

    // --- Accessi ----------------------------------------------------------------
    azioni['accessi.leggi'] = function (u) {
      puo(u, 'gestisciAccessi');
      var a = leggiAccessi();
      a.proprietario = String(amb.proprietario() || '').toLowerCase();
      return a;
    };

    azioni['accessi.salva'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      var nuovo = validaAccessi(d.accessi);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiAccessi();
        if ((attuale.version || 0) !== base) {
          throw err('conflitto', 'Gli accessi sono stati modificati da ' + (attuale.aggiornatoDa || 'un altro admin') + ' nel frattempo.', { attuale: attuale });
        }
        // Un admin non puo' togliersi da solo il ruolo: eviterebbe di restare
        // senza nessuno che gestisca gli accessi (il proprietario resta comunque admin).
        if (!u.proprietario) {
          var io = nuovo.utenti[u.email];
          if (!io || io.ruolo !== 'admin' || !io.attivo) {
            throw err('richiesta-non-valida', 'Non puoi togliere a te stesso il ruolo di admin.');
          }
        }
        nuovo.version = (attuale.version || 0) + 1;
        nuovo.aggiornato = amb.ora();
        nuovo.aggiornatoDa = u.email;
        A.scriviJSON(P.accessi, nuovo);
        // Chi esce dall'elenco perde anche la chiave consegnata ai suoi dispositivi
        var disp = leggiDispositivi(), cambiati = false;
        Object.keys(disp.dispositivi).forEach(function (id) {
          var e = disp.dispositivi[id].email;
          if (e !== String(amb.proprietario() || '').toLowerCase() && !nuovo.utenti[e]) { delete disp.dispositivi[id]; cambiati = true; }
        });
        if (cambiati) A.scriviJSON(P.dispositivi, disp);
        return nuovo;
      });
    };

    azioni['manutenzione.ricostruisci'] = function (u) {
      puo(u, 'gestisciAccessi');
      return conLock(function () { return { ricostruiti: Object.keys(ricostruisciElenco().pazienti).length }; });
    };

    // --- Ingresso -------------------------------------------------------------
    function gestisci(richiesta) {
      try {
        if (!richiesta || typeof richiesta !== 'object') throw err('richiesta-non-valida', 'Richiesta vuota.');
        if (richiesta.v !== 1) throw err('richiesta-non-valida', 'Versione del protocollo non supportata: aggiorna l\'app.');
        var fn = azioni[richiesta.azione];
        if (!fn) throw err('richiesta-non-valida', 'Azione sconosciuta: ' + String(richiesta.azione).slice(0, 40));
        var identita;
        try { identita = amb.verificaToken(richiesta.token); }
        catch (e) { throw err('non-autenticato', 'Accesso scaduto o non valido: rientra con Google.'); }
        var u = utenteDa(identita);
        var dati = richiesta.dati && typeof richiesta.dati === 'object' ? richiesta.dati : {};
        registroImmagini = null;
        var chiave = amb.ricordo && RIPETIBILI[richiesta.azione] && typeof richiesta.rid === 'string' && RE_RICHIESTA.test(richiesta.rid)
          ? 'rid:' + u.email + ':' + richiesta.azione + ':' + richiesta.rid : null;
        if (chiave) {
          var gia = null;
          try { gia = amb.ricordo.leggi(chiave); } catch (e0) { gia = null; }
          if (gia) return JSON.parse(gia);
        }
        var risposta = { ok: true, dati: fn(u, dati) };
        if (chiave) {
          var testo = JSON.stringify(risposta);
          // la cache di Apps Script tiene valori fino a 100 KB
          if (testo.length < 90000) { try { amb.ricordo.scrivi(chiave, testo); } catch (e1) { /* solo una comodita' */ } }
        }
        return risposta;
      } catch (e) {
        if (e instanceof Errore) return { ok: false, errore: e.codice, messaggio: e.message, extra: e.extra };
        if (e && e.occupato) return { ok: false, errore: 'occupato', messaggio: 'Il custode è occupato con un\'altra richiesta: riprova tra qualche secondo.' };
        return { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(e && e.message || e).slice(0, 300) };
      }
    }

    // Manutenzione richiamabile solo dal codice del server (editor di Apps
    // Script, test): non passa da gestisci, quindi non e' raggiungibile via HTTP.
    function ricostruisci() {
      return conLock(function () { return Object.keys(ricostruisciElenco().pazienti).length; });
    }

    return { gestisci: gestisci, azioni: Object.keys(azioni), ricostruisci: ricostruisci };
  }

  return {
    SCHEMA: SCHEMA, PERMESSI: PERMESSI, RUOLI: RUOLI, PERCORSI: P, RE: RE, VERSIONI: VERSIONI,
    creaCustode: creaCustode, stabile: stabile, hashRiferiti: hashRiferiti, bustaV: bustaV,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QT;
