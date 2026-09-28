/**
 * Quaderno TICE — dati locali, coda d'invio e sincronizzazione.
 *
 * Cosa funziona senza rete: aprire i pazienti gia' scaricati, registrare e
 * correggere sedute. Le sedute entrano in una coda e partono appena possibile.
 *
 * Cosa richiede la rete: modificare programmi e STO, creare pazienti, gestire
 * accessi e materiali. Li' un conflitto con un collega va risolto subito,
 * non scoperto ore dopo.
 */
var Sync = (function () {
  'use strict';

  var A = null;           // archivio dell'utente
  var email = null;
  var ascoltatori = [];
  var lavoro = null;
  var timer = null;

  var stato = {
    io: null, elenco: [], inCoda: 0, bloccate: 0,
    ultimoSync: null, fase: 'fermo',       // fermo | lavoro | offline | accesso | errore
    messaggio: '',
  };

  function avvisa() { ascoltatori.forEach(function (f) { try { f(stato); } catch (e) { console.error(e); } }); }
  function adesso() { return new Date().toISOString(); }
  function pulita(s) {
    var c = JSON.parse(JSON.stringify(s));
    delete c._locale; delete c._srv; delete c.operatore;
    return c;
  }

  async function meta(k, v) {
    if (v === undefined) { var r = await A.get('meta', k); return r ? r.v : null; }
    return A.put('meta', { k: k, v: v });
  }

  async function contaCoda() {
    var coda = await A.tutti('coda');
    stato.inCoda = coda.filter(function (o) { return !o.bloccata; }).length;
    stato.bloccate = coda.filter(function (o) { return o.bloccata; }).length;
  }

  // ---------------------------------------------------------------------------
  async function apri(emailUtente) {
    email = emailUtente;
    A = await DB.perUtente(email);
    stato.io = await meta('io');
    stato.elenco = (await meta('elenco')) || [];
    stato.ultimoSync = await meta('ultimoSync');
    await contaCoda();
    avvisa();
    DB.chiediPersistenza();
    if (!timer) {
      timer = setInterval(function () { if (document.visibilityState === 'visible') esegui(); }, 60000);
      window.addEventListener('online', function () { esegui(); });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') esegui(); });
    }
  }

  function chiudi() {
    // La connessione va chiusa davvero: finche' e' aperta il browser non
    // permette di cancellare il database ("Esci e cancella i dati").
    if (A && A.db) { try { A.db.close(); } catch (e) { /* gia' chiusa */ } }
    A = null; email = null;
    stato.io = null; stato.elenco = []; stato.inCoda = 0; stato.bloccate = 0; stato.fase = 'fermo';
    avvisa();
  }

  // --- Letture locali ------------------------------------------------------------
  function paziente(pid) { return A.get('pazienti', pid); }
  function sedute(pid) { return A.perIndice('sedute', 'pazienteId', pid); }
  function bozza(pid) { return A.get('bozze', pid); }
  function tutteLeBozze() { return A.tutti('bozze'); }
  function coda() { return A.tutti('coda'); }
  function salvaBozza(b) { b.aggiornata = adesso(); return A.put('bozze', b); }
  function eliminaBozza(pid) { return A.del('bozze', pid); }

  // --- Sedute: in locale subito, poi in coda ---------------------------------
  async function registraSeduta(seduta, eliminare) {
    var op = {
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      tipo: eliminare ? 'seduta.elimina' : 'seduta.salva',
      pazienteId: seduta.pazienteId,
      sedutaId: seduta.id,
      dati: eliminare ? { pazienteId: seduta.pazienteId, id: seduta.id } : { pazienteId: seduta.pazienteId, seduta: pulita(seduta) },
      creato: adesso(), tentativi: 0,
    };
    var locale = JSON.parse(JSON.stringify(seduta));
    locale._locale = 'in-attesa';
    if (eliminare) locale.eliminata = true;
    if (!locale.operatore) locale.operatore = email;
    await A.insieme(['sedute', 'coda', 'bozze'], function (s) {
      s.sedute.put(locale);
      s.coda.put(op);
      if (!eliminare) s.bozze.delete(seduta.pazienteId);
    });
    await contaCoda();
    avvisa();
    esegui();
    return locale;
  }

  async function scartaOperazione(opId) {
    var op = await A.get('coda', opId);
    if (!op) return;
    await A.del('coda', opId);
    // Se la seduta locale era solo in attesa e mai arrivata, si riporta allo stato del custode
    if (op.sedutaId) {
      var s = await A.get('sedute', op.sedutaId);
      if (s && s._locale && !s._srv) await A.del('sedute', op.sedutaId);
      else if (s && s._locale) { delete s._locale; await A.put('sedute', s); }
    }
    await contaCoda();
    avvisa();
  }

  async function riprovaOperazione(opId) {
    var op = await A.get('coda', opId);
    if (!op) return;
    op.bloccata = false; op.errore = null;
    await A.put('coda', op);
    await contaCoda();
    avvisa();
    return esegui();
  }

  // --- Operazioni solo online ------------------------------------------------------
  async function salvaPaziente(paz) {
    var base = paz.version;
    var copia = JSON.parse(JSON.stringify(paz));
    delete copia._sync;
    var salvato = await Api.chiama('paziente.salva', { paziente: copia, versioneBase: base });
    var locale = await A.get('pazienti', salvato.id);
    salvato._sync = (locale && locale._sync) || {};
    await A.put('pazienti', salvato);
    await aggiornaElenco();
    return salvato;
  }

  async function creaPaziente(paz) {
    var creato = await Api.chiama('paziente.crea', { paziente: paz });
    creato._sync = { ora: null };
    await A.put('pazienti', creato);
    await aggiornaElenco();
    return creato;
  }

  // --- Sincronizzazione -------------------------------------------------------------
  async function inviaCoda() {
    var ops = (await A.tutti('coda')).filter(function (o) { return !o.bloccata; })
      .sort(function (a, b) { return a.creato < b.creato ? -1 : 1; });
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      try {
        var r = await Api.chiama(op.tipo, op.dati);
        // Aggiorna la copia locale con quella del custode, a meno che nel frattempo
        // non ci sia un'altra modifica della stessa seduta ancora in coda.
        var altre = (await A.tutti('coda')).filter(function (o) { return o.id !== op.id && o.sedutaId === op.sedutaId; });
        await A.insieme(['sedute', 'coda'], function (s) {
          if (r && r.id && !altre.length) s.sedute.put(r);
          s.coda.delete(op.id);
        });
      } catch (e) {
        if (e && e.custode) {
          // Rifiuto definitivo (permessi, dati non validi): non blocca le altre, resta da risolvere
          op.bloccata = true;
          op.errore = { codice: e.codice, messaggio: e.message };
          op.tentativi = (op.tentativi || 0) + 1;
          await A.put('coda', op);
          continue;
        }
        throw e;   // rete o accesso: si riprova tutto piu' tardi, nell'ordine
      }
    }
    await contaCoda();
  }

  async function aggiornaElenco() {
    stato.io = await Api.chiama('io');
    await meta('io', stato.io);
    var elenco = await Api.chiama('pazienti.elenco');
    stato.elenco = elenco;
    await meta('elenco', elenco);

    // Pazienti tolti a questo utente: via dal dispositivo (le operazioni in coda
    // restano visibili come "da risolvere", non spariscono in silenzio).
    var visibili = {};
    elenco.forEach(function (p) { visibili[p.id] = true; });
    var locali = await A.tutti('pazienti');
    for (var i = 0; i < locali.length; i++) {
      if (visibili[locali[i].id]) continue;
      var pid = locali[i].id;
      var ss = await sedute(pid);
      await A.insieme(['pazienti', 'sedute', 'bozze'], function (s) {
        s.pazienti.delete(pid);
        ss.forEach(function (x) { s.sedute.delete(x.id); });
        s.bozze.delete(pid);
      });
    }
  }

  /** Scarica un paziente: tutto la prima volta, poi solo le sedute cambiate. */
  async function scaricaPaziente(pid, completo) {
    var locale = await A.get('pazienti', pid);
    var dopo = !completo && locale && locale._sync && locale._sync.ora;
    var r = await Api.chiama('paziente.leggi', dopo ? { id: pid, dopo: dopo } : { id: pid });
    var inCoda = {};
    (await A.tutti('coda')).forEach(function (o) { if (o.sedutaId) inCoda[o.sedutaId] = true; });
    var voce = stato.elenco.find(function (p) { return p.id === pid; });
    r.paziente._sync = { ora: r.ora, ultimaModifica: voce ? voce.ultimaModifica : null };
    await A.insieme(['pazienti', 'sedute'], function (s) {
      s.pazienti.put(r.paziente);
      r.sedute.forEach(function (x) { if (!inCoda[x.id]) s.sedute.put(x); });
    });
    return r.paziente;
  }

  async function aggiornaPazienti() {
    var locali = {};
    (await A.tutti('pazienti')).forEach(function (p) { locali[p.id] = p; });
    var io = stato.io || {};
    // Chi segue pochi bambini se li porta tutti sul dispositivo, per lavorare
    // offline in stanza. Chi li vede tutti scarica solo quelli che apre.
    var tutti = !(io.permessi && io.permessi.vediTutti) && io.pazienti !== '*';
    for (var i = 0; i < stato.elenco.length; i++) {
      var p = stato.elenco[i];
      var loc = locali[p.id];
      var cambiato = !loc || !loc._sync || (p.ultimaModifica && p.ultimaModifica !== loc._sync.ultimaModifica);
      if ((loc || tutti) && cambiato) await scaricaPaziente(p.id, !loc);
    }
  }

  function esegui() {
    if (!A) return Promise.resolve();
    if (lavoro) return lavoro;
    stato.fase = 'lavoro'; stato.messaggio = '';
    avvisa();
    lavoro = (async function () {
      try {
        if (!navigator.onLine) throw new Api.ErroreRete('Offline');
        await inviaCoda();
        await aggiornaElenco();
        await aggiornaPazienti();
        stato.ultimoSync = adesso();
        await meta('ultimoSync', stato.ultimoSync);
        stato.fase = 'fermo';
      } catch (e) {
        if (e && e.rete) { stato.fase = 'offline'; stato.messaggio = e.message; }
        else if (e && e.accesso) { stato.fase = 'accesso'; stato.messaggio = e.message; }
        else { stato.fase = 'errore'; stato.messaggio = (e && e.message) || String(e); console.error(e); }
      } finally {
        await contaCoda().catch(function () {});
        lavoro = null;
        avvisa();
      }
    })();
    return lavoro;
  }

  return {
    apri: apri, chiudi: chiudi, esegui: esegui, stato: function () { return stato; },
    alCambio: function (f) { ascoltatori.push(f); },
    paziente: paziente, sedute: sedute, bozza: bozza, tutteLeBozze: tutteLeBozze,
    salvaBozza: salvaBozza, eliminaBozza: eliminaBozza, coda: coda,
    registraSeduta: registraSeduta, scartaOperazione: scartaOperazione, riprovaOperazione: riprovaOperazione,
    salvaPaziente: salvaPaziente, creaPaziente: creaPaziente, scaricaPaziente: scaricaPaziente,
    meta: function (k, v) { return meta(k, v); },
  };
})();
