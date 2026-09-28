/**
 * Quaderno TICE — logica del custode.
 *
 * Questo file NON usa nessun servizio Google: riceve dall'esterno un "ambiente"
 * (archivio, verifica del token, orologio) e decide tutto il resto. Cosi' la
 * stessa identica logica gira:
 *   - su Google Apps Script (Code.gs le passa Drive, LockService, UrlFetch);
 *   - in locale con tools/custode-mock.js, dove viene testata.
 *
 * Qui dentro stanno le regole che contano davvero per la sicurezza: chi e'
 * autorizzato, a quali pazienti, cosa puo' modificare. L'app mostra; decide il
 * custode.
 *
 * Tutto e' sincrono di proposito: in Apps Script lo sono anche Drive e UrlFetch.
 */
var QT = (function () {
  'use strict';

  var SCHEMA = 1;

  // Chi puo' fare cosa. E' l'unico posto da cambiare per modificare i ruoli.
  var PERMESSI = {
    admin: {
      vediTutti: true, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: true,
      pubblicaMateriali: true, eliminaMateriali: true, gestisciAccessi: true,
    },
    professionista: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: true,
      programmi: true, creaPazienti: true, importa: false,
      pubblicaMateriali: true, eliminaMateriali: false, gestisciAccessi: false,
    },
    tirocinante: {
      vediTutti: false, registraSedute: true, modificaSeduteAltrui: false,
      programmi: false, creaPazienti: false, importa: false,
      pubblicaMateriali: false, eliminaMateriali: false, gestisciAccessi: false,
    },
  };
  var RUOLI = Object.keys(PERMESSI);

  var P = {
    accessi: '_config/accessi.json',
    elenco: 'Pazienti/_elenco.json',
    paziente: function (pid) { return 'Pazienti/' + pid + '/paziente.json'; },
    indiceSedute: function (pid) { return 'Pazienti/' + pid + '/_sedute.json'; },
    cartellaSedute: function (pid) { return 'Pazienti/' + pid + '/sedute'; },
    seduta: function (pid, sid) { return 'Pazienti/' + pid + '/sedute/' + sid + '.json'; },
    indiceMateriali: 'Materiali/indice.json',
    set: function (id) { return 'Materiali/set/' + id + '.json'; },
    immagine: function (hash, ext) { return 'Materiali/immagini/' + hash + '.' + ext; },
  };

  var RE = {
    pz: /^pz_[A-Za-z0-9]{6,40}$/,
    sd: /^sd_[A-Za-z0-9]{6,40}$/,
    pr: /^pr_[A-Za-z0-9]{6,40}$/,
    st: /^st_[A-Za-z0-9]{6,40}$/,
    set: /^[A-Za-z0-9_-]{1,80}$/,
    hash: /^[a-f0-9]{64}$/,
    data: /^\d{4}-\d{2}-\d{2}$/,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    sequenza: /^[VPX]*$/,
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
  function numeroV(v, min, max, campo, nullable) {
    if (v === null || v === undefined) {
      if (nullable) return null;
      throw err('richiesta-non-valida', 'Manca ' + campo);
    }
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
      throw err('richiesta-non-valida', campo + ' deve essere un numero tra ' + min + ' e ' + max);
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
  function isoV(v, campo) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || v.length > 40 || isNaN(Date.parse(v))) throw err('richiesta-non-valida', campo + ' non è una data/ora valida');
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

  function validaSTO(s, i) {
    oggettoV(s, 'sto[' + i + ']');
    return {
      id: idV(s.id, RE.st, 'sto.id'),
      testo: testoV(s.testo, 1000, false, 'sto.testo') || '',
      stato: unoTra(s.stato, ['attivo', 'pianificato', 'criterio', 'repertorio', 'chiuso', 'sospeso'], 'sto.stato', 'attivo'),
      inizio: dataV(s.inizio, 'sto.inizio', true),
      fine: dataV(s.fine, 'sto.fine', true),
    };
  }

  function validaProgramma(p, i) {
    oggettoV(p, 'programmi[' + i + ']');
    var crit = oggettoV(p.criterio || { soglia: 90, sedute: 2 }, 'criterio');
    var evento = null;
    if (p.evento !== null && p.evento !== undefined) {
      var ev = listaV(p.evento, 2, 'evento');
      if (ev.length !== 2) throw err('richiesta-non-valida', 'evento deve avere due etichette');
      evento = [testoV(ev[0], 40, true, 'evento'), testoV(ev[1], 40, true, 'evento')];
    }
    return {
      id: idV(p.id, RE.pr, 'programma.id'),
      area: testoV(p.area, 60, false, 'area'),
      nome: testoV(p.nome, 120, true, 'programma.nome'),
      descrizione: testoV(p.descrizione, 500, false, 'descrizione') || '',
      criterio: {
        soglia: interoV(crit.soglia, 1, 100, 'criterio.soglia'),
        sedute: interoV(crit.sedute, 1, 10, 'criterio.sedute'),
      },
      strategia: unoTra(p.strategia, ['indipendente', 'timedelay'], 'strategia', 'indipendente'),
      prove: interoV(p.prove, 1, 1000, 'prove', true),
      scala: unoTra(p.scala, ['conteggio', 'percentuale'], 'scala', 'conteggio'),
      evento: evento,
      nomeP: testoV(p.nomeP, 30, false, 'nomeP'),
      stato: unoTra(p.stato, ['attivo', 'terminato', 'sospeso'], 'programma.stato', 'attivo'),
      sto: listaV(p.sto, 300, 'sto').map(validaSTO),
    };
  }

  function validaStorico(r) {
    oggettoV(r, 'learnUnitStoriche');
    var o = { data: dataV(r.data, 'storico.data') };
    ['criteri', 'assessment', 'corrette', 'totali', 'durata'].forEach(function (k) {
      if (r[k] !== undefined && r[k] !== null) o[k] = numeroV(r[k], 0, 100000, 'storico.' + k);
    });
    ['operatori', 'tipologia', 'compilatore', 'fonte'].forEach(function (k) {
      if (r[k]) o[k] = testoV(r[k], 200, false, 'storico.' + k);
    });
    return o;
  }

  function validaPaziente(p) {
    oggettoV(p, 'paziente');
    return {
      schema: SCHEMA,
      id: idV(p.id, RE.pz, 'paziente.id'),
      codice: testoV(p.codice, 30, true, 'codice'),
      etichetta: testoV(p.etichetta, 60, false, 'etichetta') || '',
      aula: testoV(p.aula, 60, false, 'aula') || '',
      note: testoV(p.note, 5000, false, 'note') || '',
      stato: unoTra(p.stato, ['attivo', 'archiviato'], 'paziente.stato', 'attivo'),
      programmi: listaV(p.programmi, 300, 'programmi').map(validaProgramma),
      learnUnitStoriche: listaV(p.learnUnitStoriche, 10000, 'learnUnitStoriche').map(validaStorico),
    };
  }

  function validaVoce(v, i) {
    oggettoV(v, 'voci[' + i + ']');
    var eventi = null;
    if (v.eventi !== null && v.eventi !== undefined) {
      var e = listaV(v.eventi, 2, 'eventi');
      eventi = [interoV(e[0] || 0, 0, 10000, 'eventi'), interoV(e[1] || 0, 0, 10000, 'eventi')];
    }
    return {
      programmaId: idV(v.programmaId, RE.pr, 'voce.programmaId'),
      stoId: v.stoId ? idV(v.stoId, RE.st, 'voce.stoId') : null,
      strategia: unoTra(v.strategia, ['indipendente', 'timedelay'], 'voce.strategia', 'indipendente'),
      scala: unoTra(v.scala, ['conteggio', 'percentuale'], 'voce.scala', 'conteggio'),
      v: numeroV(v.v, 0, 10000, 'voce.v', true),
      p: numeroV(v.p, 0, 10000, 'voce.p', true),
      x: numeroV(v.x, 0, 10000, 'voce.x', true),
      sequenza: (function () {
        var s = testoV(v.sequenza, 5000, false, 'voce.sequenza');
        if (s && !RE.sequenza.test(s)) throw err('richiesta-non-valida', 'voce.sequenza contiene caratteri non validi');
        return s || null;
      })(),
      eventi: eventi,
      decisione: testoV(v.decisione, 200, false, 'voce.decisione'),
      nota: testoV(v.nota, 2000, false, 'voce.nota') || '',
    };
  }

  function validaSeduta(s) {
    oggettoV(s, 'seduta');
    return {
      schema: SCHEMA,
      id: idV(s.id, RE.sd, 'seduta.id'),
      pazienteId: idV(s.pazienteId, RE.pz, 'seduta.pazienteId'),
      data: dataV(s.data, 'seduta.data'),
      inizio: isoV(s.inizio, 'inizio'),
      fine: isoV(s.fine, 'fine'),
      operatoreNome: testoV(s.operatoreNome, 60, false, 'operatoreNome'),
      coOperatori: listaV(s.coOperatori, 8, 'coOperatori').map(function (c) { return testoV(c, 60, true, 'coOperatori'); }),
      voci: listaV(s.voci, 200, 'voci').map(validaVoce),
      nota: testoV(s.nota, 5000, false, 'nota') || '',
      fonte: unoTra(s.fonte, ['app', 'import-numbers'], 'fonte', 'app'),
      eliminata: s.eliminata === true,
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
   *   archivio: { leggiJSON, scriviJSON, elenca, leggiBinario, scriviBinario, esiste, conLock },
   *   verificaToken(token) -> { email, nome }   (lancia se non valido)
   *   proprietario() -> email dell'account su cui gira il custode
   *   ora() -> ISO string
   *   sha256Hex(base64) -> hex dei byte decodificati
   * }
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

    // --- Cache ricostruibili -------------------------------------------------
    function leggiElenco() {
      var e = A.leggiJSON(P.elenco);
      return e || conLock(ricostruisciElenco);
    }
    function voceElenco(paz, indice) {
      var sedute = Object.keys(indice.sedute).map(function (k) { return indice.sedute[k]; }).filter(function (s) { return !s.eliminata; });
      var ultima = sedute.reduce(function (m, s) { return s.data > m ? s.data : m; }, '');
      // Quando e' cambiato qualcosa (anche una seduta eliminata o corretta):
      // l'app lo confronta con la sua copia e riscarica solo i pazienti cambiati.
      var ultimaModifica = Object.keys(indice.sedute).reduce(function (m, k) {
        var t = (indice.sedute[k]._srv && indice.sedute[k]._srv.modificato) || '';
        return t > m ? t : m;
      }, paz.aggiornato || '');
      return {
        id: paz.id, codice: paz.codice, etichetta: paz.etichetta, aula: paz.aula,
        stato: paz.stato || 'attivo', version: paz.version, aggiornato: paz.aggiornato,
        nSedute: sedute.length, ultimaSeduta: ultima || null, ultimaModifica: ultimaModifica || null,
        programmiAttivi: (paz.programmi || []).filter(function (p) { return p.stato === 'attivo'; }).length,
      };
    }
    function ricostruisciElenco() {
      var elenco = { schema: SCHEMA, pazienti: {} };
      A.elenca('Pazienti').cartelle.forEach(function (pid) {
        if (!RE.pz.test(pid)) return;
        var paz = A.leggiJSON(P.paziente(pid));
        if (!paz) return;
        elenco.pazienti[pid] = voceElenco(paz, leggiIndiceSedute(pid));
      });
      A.scriviJSON(P.elenco, elenco);
      return elenco;
    }
    function aggiornaElenco(paz) {
      var elenco = A.leggiJSON(P.elenco) || { schema: SCHEMA, pazienti: {} };
      elenco.pazienti[paz.id] = voceElenco(paz, leggiIndiceSedute(paz.id));
      A.scriviJSON(P.elenco, elenco);
    }

    function leggiIndiceSedute(pid) {
      return A.leggiJSON(P.indiceSedute(pid)) || conLock(function () { return ricostruisciIndiceSedute(pid); });
    }
    // La fonte di verita' sono i file in sedute/. Un file contiene una seduta
    // oppure un pacchetto { sedute: [...] } scritto dall'import; se lo stesso id
    // compare piu' volte vince la versione modificata per ultima.
    function ricostruisciIndiceSedute(pid) {
      var indice = { schema: SCHEMA, sedute: {} };
      var cartella = P.cartellaSedute(pid);
      A.elenca(cartella).file.forEach(function (nome) {
        var dati = A.leggiJSON(cartella + '/' + nome);
        if (!dati) return;
        var lista = Array.isArray(dati.sedute) ? dati.sedute : [dati];
        lista.forEach(function (s) {
          if (!s || !s.id) return;
          var prima = indice.sedute[s.id];
          var tNuovo = (s._srv && s._srv.modificato) || '';
          var tPrima = (prima && prima._srv && prima._srv.modificato) || '';
          if (!prima || tNuovo >= tPrima) indice.sedute[s.id] = s;
        });
      });
      A.scriviJSON(P.indiceSedute(pid), indice);
      return indice;
    }

    function leggiPaziente(pid) {
      var paz = A.leggiJSON(P.paziente(pid));
      if (!paz) throw err('non-trovato', 'Paziente non trovato.');
      return paz;
    }

    // --- Azioni ---------------------------------------------------------------
    var azioni = {};

    azioni['io'] = function (u) {
      return {
        email: u.email, nome: u.nome, ruolo: u.ruolo, pazienti: u.pazienti,
        proprietario: u.proprietario, scadenza: u.scadenza, permessi: permessi(u),
      };
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
      var ora = amb.ora();
      var paz = leggiPaziente(pid);
      var indice = leggiIndiceSedute(pid);
      var dopo = d.dopo ? isoV(d.dopo, 'dopo') : null;
      var sedute = Object.keys(indice.sedute).map(function (k) { return indice.sedute[k]; })
        .filter(function (s) { return !dopo || ((s._srv && s._srv.modificato) || '') >= dopo; });
      return { paziente: paz, sedute: sedute, ora: ora };
    };

    azioni['paziente.crea'] = function (u, d) {
      puo(u, 'creaPazienti');
      var paz = validaPaziente(d.paziente);
      return conLock(function () {
        var esistente = A.leggiJSON(P.paziente(paz.id));
        if (esistente) {
          // Reinvio della stessa creazione (rete caduta dopo il salvataggio)
          if (esistente.creatoDa === u.email && esistente.codice === paz.codice) return esistente;
          throw err('conflitto', 'Esiste già un paziente con questo identificativo.');
        }
        var ora = amb.ora();
        paz.version = 1;
        paz.creato = ora; paz.creatoDa = u.email;
        paz.aggiornato = ora; paz.aggiornatoDa = u.email;
        A.scriviJSON(P.paziente(paz.id), paz);
        A.scriviJSON(P.indiceSedute(paz.id), { schema: SCHEMA, sedute: {} });
        aggiornaElenco(paz);
        assegnaSeServe(u, paz.id);
        return paz;
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

    azioni['paziente.salva'] = function (u, d) {
      puo(u, 'programmi');
      var paz = validaPaziente(d.paziente);
      richiediVisibile(u, paz.id);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      return conLock(function () {
        var attuale = leggiPaziente(paz.id);
        if (attuale.version !== base) {
          throw err('conflitto', 'Nel frattempo qualcun altro ha modificato questo paziente.', { attuale: attuale });
        }
        var ora = amb.ora();
        paz.version = attuale.version + 1;
        paz.creato = attuale.creato; paz.creatoDa = attuale.creatoDa;
        paz.aggiornato = ora; paz.aggiornatoDa = u.email;
        A.scriviJSON(P.paziente(paz.id), paz);
        aggiornaElenco(paz);
        return paz;
      });
    };

    azioni['paziente.importa'] = function (u, d) {
      puo(u, 'importa');
      var pacchetto = oggettoV(d.pacchetto, 'pacchetto');
      var paz = validaPaziente(pacchetto.paziente);
      var sedute = listaV(pacchetto.sedute, 20000, 'sedute').map(validaSeduta);
      sedute.forEach(function (s) {
        if (s.pazienteId !== paz.id) throw err('richiesta-non-valida', 'Una seduta appartiene a un altro paziente.');
      });
      return conLock(function () {
        if (A.esiste(P.paziente(paz.id))) throw err('conflitto', 'Questo paziente è già stato importato.');
        var ora = amb.ora();
        paz.version = 1;
        paz.creato = ora; paz.creatoDa = u.email;
        paz.aggiornato = ora; paz.aggiornatoDa = u.email;
        var indice = { schema: SCHEMA, sedute: {} };
        sedute.forEach(function (s) {
          s.operatore = null;
          s._srv = { creato: ora, modificato: ora, da: u.email, importato: true };
          indice.sedute[s.id] = s;
        });
        A.scriviJSON(P.paziente(paz.id), paz);
        // Un solo file per tutto lo storico importato: scriverne centinaia
        // richiederebbe minuti su Drive. Le correzioni successive creano file
        // singoli, che in ricostruzione prevalgono su questo.
        A.scriviJSON(P.cartellaSedute(paz.id) + '/import-' + ora.slice(0, 10) + '.json', { schema: SCHEMA, sedute: sedute });
        A.scriviJSON(P.indiceSedute(paz.id), indice);
        aggiornaElenco(paz);
        return { paziente: paz, sedute: sedute.length };
      });
    };

    function salvaSeduta(u, pid, s, eliminando) {
      return conLock(function () {
        leggiPaziente(pid);
        var indice = leggiIndiceSedute(pid);
        var prima = indice.sedute[s.id];
        var ora = amb.ora();
        if (prima) {
          if (prima.pazienteId !== pid) throw err('conflitto', 'Identificativo di seduta già usato.');
          var puoModificare = prima.operatore === u.email || permessi(u).modificaSeduteAltrui;
          // Reinvio identico dello stesso autore: nessuna scrittura, stessa risposta.
          var confronto = JSON.parse(JSON.stringify(prima));
          delete confronto._srv; delete confronto.operatore;
          if (!eliminando && prima.operatore === u.email && stabile(confronto) === stabile(s)) return prima;
          if (!puoModificare) throw err('vietato', 'Puoi correggere solo le sedute che hai registrato tu.');
          s.operatore = prima.operatore;
          s._srv = { creato: prima._srv ? prima._srv.creato : ora, modificato: ora, da: u.email };
        } else {
          if (eliminando) throw err('non-trovato', 'Seduta non trovata.');
          // L'autore lo decide il custode, non il dispositivo.
          s.operatore = u.email;
          if (!s.operatoreNome) s.operatoreNome = u.nome;
          s._srv = { creato: ora, modificato: ora, da: u.email };
        }
        A.scriviJSON(P.seduta(pid, s.id), s);
        indice.sedute[s.id] = s;
        A.scriviJSON(P.indiceSedute(pid), indice);
        aggiornaElenco(leggiPaziente(pid));
        return s;
      });
    }

    azioni['seduta.salva'] = function (u, d) {
      puo(u, 'registraSedute');
      var pid = idV(d.pazienteId, RE.pz, 'pazienteId');
      richiediVisibile(u, pid);
      var s = validaSeduta(d.seduta);
      if (s.pazienteId !== pid) throw err('richiesta-non-valida', 'La seduta appartiene a un altro paziente.');
      return salvaSeduta(u, pid, s, false);
    };

    azioni['seduta.elimina'] = function (u, d) {
      puo(u, 'registraSedute');
      var pid = idV(d.pazienteId, RE.pz, 'pazienteId');
      richiediVisibile(u, pid);
      var sid = idV(d.id, RE.sd, 'id');
      var indice = leggiIndiceSedute(pid);
      var prima = indice.sedute[sid];
      if (!prima) throw err('non-trovato', 'Seduta non trovata.');
      var s = JSON.parse(JSON.stringify(prima));
      delete s._srv; delete s.operatore;
      s.eliminata = true;
      return salvaSeduta(u, pid, s, true);
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
      return listaV(d.hashes, 5000, 'hashes').filter(function (h) {
        idV(h, RE.hash, 'hash');
        return !immagineEsiste(h);
      });
    };

    function immagineEsiste(hash) {
      for (var mime in EST) if (A.esiste(P.immagine(hash, EST[mime]))) return EST[mime];
      return null;
    }

    azioni['materiali.caricaImmagini'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var imm = oggettoV(d.immagini, 'immagini');
      var chiavi = Object.keys(imm);
      if (chiavi.length > 40) throw err('richiesta-non-valida', 'Al massimo 40 immagini per richiesta.');
      var caricate = [];
      chiavi.forEach(function (h) {
        idV(h, RE.hash, 'hash');
        var m = RE.dataUrl.exec(String(imm[h] || ''));
        if (!m) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ': solo immagini PNG/JPEG/WebP/GIF o audio.');
        if (m[2].length > 14 * 1024 * 1024) throw err('richiesta-non-valida', 'File ' + h.slice(0, 8) + ' troppo grande (max ~10 MB).');
        // L'hash lo ricalcola il custode: un client non puo' salvare un file
        // sotto il nome di un altro e contaminare le cache degli altri.
        if (amb.sha256Hex(m[2]) !== h) throw err('richiesta-non-valida', 'L\'hash del file ' + h.slice(0, 8) + ' non corrisponde al contenuto.');
        if (!immagineEsiste(h)) A.scriviBinario(P.immagine(h, EST[m[1]]), m[2], m[1]);
        caricate.push(h);
      });
      return caricate;
    };

    azioni['materiali.immagini'] = function (u, d) {
      var hashes = listaV(d.hashes, 40, 'hashes');
      var out = {};
      hashes.forEach(function (h) {
        idV(h, RE.hash, 'hash');
        var ext = immagineEsiste(h);
        if (!ext) return;
        var b = A.leggiBinario(P.immagine(h, ext));
        if (b) out[h] = 'data:' + b.mime + ';base64,' + b.base64;
      });
      return out;
    };

    azioni['materiali.pubblica'] = function (u, d) {
      puo(u, 'pubblicaMateriali');
      var set = validaSet(d.set);
      var base = interoV(d.versioneBase, 0, 1e9, 'versioneBase');
      var hashes = hashRiferiti(set);
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
        return nuovo;
      });
    };

    azioni['manutenzione.ricostruisci'] = function (u, d) {
      puo(u, 'gestisciAccessi');
      return conLock(function () {
        var pids = d.pazienteId ? [idV(d.pazienteId, RE.pz, 'pazienteId')]
          : A.elenca('Pazienti').cartelle.filter(function (x) { return RE.pz.test(x); });
        pids.forEach(ricostruisciIndiceSedute);
        ricostruisciElenco();
        return { ricostruiti: pids.length };
      });
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
        return { ok: true, dati: fn(u, dati) };
      } catch (e) {
        if (e instanceof Errore) return { ok: false, errore: e.codice, messaggio: e.message, extra: e.extra };
        return { ok: false, errore: 'interno', messaggio: 'Errore interno del custode: ' + String(e && e.message || e).slice(0, 300) };
      }
    }

    // Manutenzione richiamabile solo dal codice del server (editor di Apps
    // Script, test): non passa da gestisci, quindi non e' raggiungibile via HTTP.
    function ricostruisci(pid) {
      return conLock(function () {
        var pids = pid ? [idV(pid, RE.pz, 'pazienteId')]
          : A.elenca('Pazienti').cartelle.filter(function (x) { return RE.pz.test(x); });
        pids.forEach(ricostruisciIndiceSedute);
        ricostruisciElenco();
        return pids.length;
      });
    }

    return { gestisci: gestisci, azioni: Object.keys(azioni), ricostruisci: ricostruisci };
  }

  return {
    SCHEMA: SCHEMA, PERMESSI: PERMESSI, RUOLI: RUOLI, PERCORSI: P, RE: RE,
    creaCustode: creaCustode, stabile: stabile, hashRiferiti: hashRiferiti,
    validaSeduta: validaSeduta, validaPaziente: validaPaziente,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QT;
