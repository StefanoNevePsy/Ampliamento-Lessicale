/**
 * Programma del bambino: le attività su cui si lavora, ognuna con i suoi
 * target in sequenza. Quando un target raggiunge il criterio si passa al
 * successivo. L'app lo propone, non lo decide da sola.
 *
 * patient.programma = { attivita: [{
 *   id, nome, area, descrizione,
 *   sessionType: 'independent' | 'timedelay',
 *   criterio: { soglia: 90, sedute: 2 },
 *   prove: 10 | null,          // prove per seduta, se fisse
 *   stato: 'attivo' | 'sospeso' | 'terminato',
 *   target: [{ id, testo, stato, inizio, fine, tdSeconds? }],
 *   // stato del target: 'attivo' | 'pianificato' | 'criterio' | 'repertorio' | 'chiuso'
 * }] }
 *
 * Le sedute restano nello storico dell'app (patient.history) come sedute
 * Quaderno con setName "Attività · Target", più attivitaId e targetId.
 *
 * Modulo puro (niente DOM, niente DB): si prova in Node.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceProgramma = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATI_TARGET = {
    attivo: 'In corso', pianificato: 'In programma', criterio: 'A criterio',
    repertorio: 'In repertorio', chiuso: 'Chiuso'
  };
  var CHIUSI = ['criterio', 'repertorio', 'chiuso'];

  function nuovoId(prefisso) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var r = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(10)) : null;
    for (var i = 0; i < 10; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % a.length];
    return prefisso + '_' + s;
  }
  function due(n) { return (n < 10 ? '0' : '') + n; }
  /** Giorno di calendario locale, come getDateKey dell'app. */
  function giorno(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }
  function oggi() { return giorno(new Date().toISOString()); }

  function programma(p) {
    if (!p.programma) p.programma = { attivita: [] };
    if (!p.programma.attivita) p.programma.attivita = [];
    return p.programma;
  }
  function attivita(p, id) {
    return programma(p).attivita.filter(function (a) { return a.id === id; })[0] || null;
  }
  function nomeSet(att, target) {
    return target && target.testo ? att.nome + ' · ' + target.testo : att.nome;
  }

  /**
   * Il target su cui si registra oggi: quello in corso; se non c'è, l'ultimo
   * chiuso a criterio (mantenimento, finché non si apre il successivo).
   */
  function targetCorrente(att) {
    var t = att.target || [];
    var attivo = t.filter(function (x) { return x.stato === 'attivo'; })[0];
    if (attivo) return { target: attivo, mantenimento: false };
    for (var i = t.length - 1; i >= 0; i--) {
      if (t[i].stato === 'criterio' || t[i].stato === 'repertorio') return { target: t[i], mantenimento: true };
    }
    return null;
  }
  function prossimoTarget(att) {
    return (att.target || []).filter(function (x) { return x.stato === 'pianificato'; })[0] || null;
  }

  /** Sedute dello storico che appartengono a un target (o all'attività). */
  function sedute(p, att, target) {
    var nome = target ? nomeSet(att, target) : null;
    return (p.history || []).filter(function (s) {
      if (target) return s.targetId ? s.targetId === target.id : (s.mode === 'quaderno' && s.setName === nome);
      return s.attivitaId === att.id || (s.mode === 'quaderno' && (s.setName === att.nome || String(s.setName).indexOf(att.nome + ' · ') === 0));
    }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  }

  /**
   * Primo giorno in cui il criterio è raggiunto: `sedute` giorni diversi di
   * fila con percentuale ≥ soglia (una seduta sotto soglia azzera il conto,
   * come checkCriterion dell'app). Restituisce la data o null.
   */
  function criterioRaggiunto(elenco, criterio) {
    var soglia = (criterio && criterio.soglia) || 90, n = (criterio && criterio.sedute) || 2;
    var fila = 0, ultimo = null;
    var ord = elenco.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    for (var i = 0; i < ord.length; i++) {
      var s = ord[i], g = giorno(s.date);
      if (s.percentage >= soglia) {
        if (g !== ultimo) { fila++; ultimo = g; }
      } else { fila = 0; ultimo = null; }
      if (fila >= n) return g;
    }
    return null;
  }

  /** Crea le sedute Quaderno di un'attività per lo storico dell'app. */
  function seduta(att, target, voce, quando) {
    var v = voce.v || 0, pp = voce.p || 0, x = voce.x || 0, tot = v + pp + x;
    if (!tot) return null;
    var s = {
      id: nuovoId('sx'),
      date: quando,
      setId: 'tice_' + (target ? target.id : att.id),
      setName: nomeSet(att, target),
      setCat: att.area || '',
      mode: 'quaderno',
      correct: v,
      prompts: pp,
      total: tot,
      percentage: Math.round(v / tot * 100),
      sessionType: voce.sessionType || att.sessionType || 'independent',
      rawV: v, rawP: pp, rawX: x,
      attivitaId: att.id,
      targetId: target ? target.id : null,
      fonte: 'app'
    };
    if (s.sessionType === 'timedelay') s.timeDelaySeconds = voce.tdSeconds || (target && target.tdSeconds) || att.tdSeconds || 5;
    if (voce.sequenza) s.sequenza = voce.sequenza;
    if (voce.operatore) s.operatore = voce.operatore;
    var nota = [];
    if (voce.decisione) nota.push('**' + voce.decisione + '**');
    if (voce.nota) nota.push(voce.nota);
    if (nota.length) s.note = nota.join(' — ');
    if (voce.mantenimento) s.mantenimento = true;
    return s;
  }

  // ---------- modifiche al programma ----------
  function nuovaAttivita(p, dati) {
    var att = {
      id: nuovoId('at'),
      nome: String(dati.nome || '').trim() || 'Attività',
      area: String(dati.area || '').trim(),
      descrizione: String(dati.descrizione || '').trim(),
      sessionType: dati.sessionType === 'timedelay' ? 'timedelay' : 'independent',
      criterio: { soglia: +dati.soglia || 90, sedute: +dati.sedute || 2 },
      prove: +dati.prove || null,
      stato: dati.stato || 'attivo',
      target: [],
      origine: 'app',
      creato: new Date().toISOString(),
      modificato: new Date().toISOString()
    };
    if (dati.tdSeconds) att.tdSeconds = +dati.tdSeconds;
    if (dati.setId) att.setId = dati.setId;
    programma(p).attivita.push(att);
    if (dati.target) aggiungiTarget(att, dati.target, true);
    return att;
  }
  function aggiungiTarget(att, testo, attiva) {
    var corrente = (att.target || []).filter(function (x) { return x.stato === 'attivo'; })[0];
    var t = {
      id: nuovoId('tg'), testo: String(testo).trim(),
      stato: attiva && !corrente ? 'attivo' : 'pianificato',
      inizio: null, fine: null, origine: 'app', modificato: new Date().toISOString()
    };
    (att.target || (att.target = [])).push(t);
    att.modificato = t.modificato;
    return t;
  }
  /** Chiude un target e apre il successivo in programma, quello indicato, o nessuno. */
  function chiudiTarget(att, targetId, stato, data, prossimoId) {
    var t = (att.target || []).filter(function (x) { return x.id === targetId; })[0];
    if (!t) return null;
    var ora = new Date().toISOString();
    t.stato = CHIUSI.indexOf(stato) >= 0 ? stato : 'criterio';
    t.fine = data || oggi();
    t.modificato = ora;
    // prossimoId: undefined = il prossimo in programma, null = nessuno
    var prossimo = prossimoId === undefined ? prossimoTarget(att)
      : prossimoId ? att.target.filter(function (x) { return x.id === prossimoId; })[0] : null;
    if (prossimo) { prossimo.stato = 'attivo'; prossimo.inizio = prossimo.inizio || oggi(); prossimo.modificato = ora; }
    att.modificato = ora;
    return prossimo || null;
  }
  /** Rende corrente un target qualsiasi (anche riaprire uno chiuso). */
  function rendiCorrente(att, targetId) {
    var ora = new Date().toISOString();
    (att.target || []).forEach(function (x) {
      if (x.id === targetId) { x.stato = 'attivo'; x.inizio = x.inizio || oggi(); x.fine = null; x.modificato = ora; }
      else if (x.stato === 'attivo') { x.stato = 'pianificato'; x.modificato = ora; }
    });
    att.modificato = ora;
  }
  function spostaTarget(att, targetId, verso) {
    var t = att.target || [], i = -1;
    t.forEach(function (x, k) { if (x.id === targetId) i = k; });
    var j = i + verso;
    if (i < 0 || j < 0 || j >= t.length) return;
    var tmp = t[i]; t[i] = t[j]; t[j] = tmp;
    att.modificato = new Date().toISOString();
  }

  /** Attività da mostrare nella presa dati, nell'ordine del programma. */
  function attiveOggi(p) {
    return programma(p).attivita.filter(function (a) { return a.stato === 'attivo'; });
  }

  return {
    STATI_TARGET: STATI_TARGET,
    nuovoId: nuovoId, giorno: giorno, oggi: oggi,
    programma: programma, attivita: attivita, nomeSet: nomeSet,
    targetCorrente: targetCorrente, prossimoTarget: prossimoTarget,
    sedute: sedute, criterioRaggiunto: criterioRaggiunto, seduta: seduta,
    nuovaAttivita: nuovaAttivita, aggiungiTarget: aggiungiTarget,
    chiudiTarget: chiudiTarget, rendiCorrente: rendiCorrente, spostaTarget: spostaTarget,
    attiveOggi: attiveOggi
  };
});
