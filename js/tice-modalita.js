/**
 * Modalità e categorie del Centro TICE: un solo elenco per i programmi dei
 * quaderni Numbers e per i giochi dell'app.
 *
 * Ogni quaderno chiama le cose a modo suo ("TACT", "Intensive tact",
 * "Echo to TACT", "Mandi si/no"...): qui ogni nome di tabella viene
 * ricondotto a una MODALITÀ (Tact, Mand, Indicare...) dentro una CATEGORIA
 * (Speaker, Listener, Motricità...). Quello che resta del nome diventa la
 * VARIANTE ("intensivo", "sì/no"), così la distinzione non si perde.
 *
 * Il DIZIONARIO del centro (condiviso dal custode) aggiunge modalità,
 * categorie e sinonimi decisi dalle persone: vince sempre su quello di serie.
 *   { version, categorie: [{id, nome}], modalita: [{id, nome, categoria}],
 *     sinonimi: { "nome normalizzato": { modalita, variante? } },
 *     modi: { "modo dell'app": idModalita } }
 *
 * Modulo puro (niente DOM, niente rete): si prova in Node.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceModalita = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATEGORIE = [
    { id: 'speaker', nome: 'Speaker' },
    { id: 'listener', nome: 'Listener' },
    { id: 'imitazione', nome: 'Imitazione' },
    { id: 'cognitivi', nome: 'Repertori cognitivi' },
    { id: 'motricita', nome: 'Motricità' },
    { id: 'autonomie', nome: 'Autonomie' },
    { id: 'sociale', nome: 'Gioco e abilità sociali' },
    { id: 'comportamento', nome: 'Comportamento e autoregolazione' },
    { id: 'altro', nome: 'Altre' },
  ];

  // [id, nome, categoria, sinonimi, modi dell'app]
  var MODALITA = [
    ['tact', 'Tact', 'speaker', ['tact', 'denominazione', 'denominare', 'naming', 'labeling', 'etichettare'], ['tact']],
    ['mand', 'Mand', 'speaker', ['mand', 'mandi', 'richiesta', 'richieste', 'request', 'requesting'], []],
    ['intraverbal', 'Intraverbal', 'speaker', ['intraverbal', 'intraverbale', 'intraverbali', 'conversazione', 'domande e risposte', 'wh'], ['intraverbal_scenari', 'pool_intraverbal']],
    ['echoic', 'Echoic', 'speaker', ['echoic', 'echo', 'ecoico', 'ecoica', 'ecoiche', 'imitazione vocale', 'ripetizione'], []],
    ['grammatica', 'Grammatica e frasi', 'speaker', ['grammatica', 'morfologia', 'plurali', 'singolare plurale', 'pronomi', 'frasi', 'autoclitici'], ['singolare_plurale']],
    ['indicare', 'Indicare (discriminazione)', 'listener', ['point', 'pointing', 'indicare', 'indica', 'ld', 'listener discrimination', 'discriminazione uditiva', 'riconoscimento', 'field'], ['tombola', 'tombola_sonora']],
    ['consegne', 'Eseguire consegne', 'listener', ['follow directions', 'follow direction', 'following directions', 'consegne', 'eseguire consegne', 'istruzioni', 'comandi', 'one step', 'two step'], []],
    ['comprensione', 'Comprensione', 'listener', ['comprensione', 'ascolto', 'listener'], []],
    ['lrffc', 'Funzioni, caratteristiche e classi', 'listener', ['lrffc', 'ffc', 'funzioni', 'caratteristiche', 'feature function class'], []],
    ['imitazione', 'Imitazione motoria', 'imitazione', ['imitazione', 'imitazione motoria', 'imitation', 'motor imitation', 'emulazione', 'costruzioni', 'block imitation'], []],
    ['abbinamento', 'Abbinamento (matching)', 'cognitivi', ['matching', 'abbinamento', 'abbinare', 'appaiamento', 'mts', 'vp mts', 'match to sample', 'puzzle', 'incastri'], []],
    ['categorizzazione', 'Categorizzazione', 'cognitivi', ['categorizzazione', 'categorie', 'classificazione', 'sorting', 'raggruppare', 'intruso'], ['categorizzazione', 'intruso']],
    ['numeri', 'Competenze numeriche', 'cognitivi', ['competenze numeriche', 'numeri', 'conteggio', 'contare', 'quantita', 'numerazione', 'matematica', 'calcolo'], []],
    ['visuospaziale', 'Orientamento visuospaziale', 'cognitivi', ['orientamento visuospaziale', 'visuospaziale', 'spaziale', 'topologia', 'concetti spaziali'], ['topologia', 'topologia_comp']],
    ['velocita', 'Denominazione rapida e fluenza', 'cognitivi', ['ran', 'denominazione rapida', 'fluenza', 'fluency', 'precision teaching'], ['ran', 'ran_intensivo', 'fluenza']],
    ['memoria', 'Memoria', 'cognitivi', ['memoria', 'memory', 'ricorda', 'memoria di lavoro'], ['memory', 'ricorda', 'memoria_lavoro']],
    ['attenzione', 'Attenzione e inibizione', 'cognitivi', ['attenzione', 'inibizione', 'go no go', 'stroop', 'cerca trova', 'ricerca visiva'], ['stroop_numerico', 'stroop_etichetta', 'go_nogo', 'search_find', 'zoom', 'pool_random']],
    ['sequenze', 'Sequenze', 'cognitivi', ['sequenze', 'sequenze temporali', 'storie in sequenza', 'prima dopo'], ['sequenze']],
    ['letto', 'Lettura e scrittura', 'cognitivi', ['lettura', 'scrittura', 'lettere', 'letto scrittura', 'sillabe', 'fonologia', 'alfabeto'], []],
    ['pregrafismi', 'Pregrafismi', 'motricita', ['pregrafismi', 'pregrafismo', 'grafomotricita', 'tracciare', 'tracciati'], []],
    ['prensione', 'Prensione', 'motricita', ['prensione', 'presa', 'pinza', 'motricita fine'], []],
    ['ritaglio', 'Ritaglio', 'motricita', ['ritaglia', 'ritagliare', 'ritaglio', 'taglio', 'forbici'], []],
    ['grosso-motoria', 'Motricità globale', 'motricita', ['motricita globale', 'motricita grossa', 'grosso motoria', 'equilibrio', 'coordinazione'], []],
    ['routine', 'Routine e autonomie personali', 'autonomie', ['routine', 'autonomie', 'autonomia', 'bagno', 'toilet', 'toilette', 'igiene', 'lavarsi', 'vestirsi', 'svestirsi', 'pranzo', 'tavola'], []],
    ['task-analysis', 'Task analysis', 'autonomie', ['task analysis', 'analisi del compito'], ['quaderno_task']],
    ['gioco', 'Gioco e turni', 'sociale', ['gioco', 'giochi', 'gioco simbolico', 'turni', 'turnazione', 'rubamazzo', 'carte', 'gioco da tavolo'], []],
    ['rinforzatori', 'Comunità di rinforzatori', 'sociale', ['comunita rinforzatori', 'comunita di rinforzatori', 'rinforzatori', 'pairing'], []],
    ['attesa', 'Attesa e tolleranza', 'comportamento', ['attesa', 'aspettare', 'wait', 'waiting', 'tolleranza', 'tolleranza attesa', 'tolleranza al no', 'accettare il no'], []],
  ].map(function (m) { return { id: m[0], nome: m[1], categoria: m[2], sinonimi: m[3], modi: m[4] }; });

  // Il foglio del quaderno suggerisce la categoria quando il nome non dice niente
  var AREE = [
    [/speaker|espressiv|linguaggio/, 'speaker'],
    [/listener|ricettiv|comprensione/, 'listener'],
    [/imitazion/, 'imitazione'],
    [/rep\w*\s*generali|repertori|cognitiv|accademic|scolastic/, 'cognitivi'],
    [/motricit|motori|grafo/, 'motricita'],
    [/autonomi/, 'autonomie'],
    [/rinforzator|gioco|social|comunita/, 'sociale'],
    [/comportament|regolazion|attesa/, 'comportamento'],
  ];

  // Parole che restano nel nome e sono solo una variante della modalità
  var MODIFICATORI = /^(intensive|intensivo|intensiva|verbale|vocale|con|img|immagini|immagine|si|no|copia|da|modello|linee|spezzate|forbici|di|del|della|e|a|in|per|base|avanzato|avanzata|generalizzazione|mantenimento|full|parziale|1|2|3|4|5|6)$/;
  // Nomi che cambiano significato col contesto: si chiedono sempre e non
  // finiscono nel dizionario ("FD" a volte è follow directions, più spesso field).
  var AMBIGUI = { fd: true };

  function normalizza(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function variante(parole) {
    var p = (parole || []).slice();
    while (p.length && /^(con|di|da|a|in|per|e|del|della)$/.test(p[0])) p.shift();
    return maiuscola(p.join(' ').replace(/\bsi no\b/, 'sì/no').replace(/\bimg\b/, 'immagini'));
  }
  function maiuscola(s) { s = String(s || '').trim().toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  /** Elenco completo: quello di serie più il dizionario del centro. */
  function elenco(diz) {
    diz = diz || {};
    var cat = CATEGORIE.slice();
    (diz.categorie || []).forEach(function (c) { if (c && c.id && !cat.some(function (x) { return x.id === c.id; })) cat.splice(cat.length - 1, 0, { id: c.id, nome: c.nome, centro: true }); });
    var mod = MODALITA.map(function (m) { return { id: m.id, nome: m.nome, categoria: m.categoria, sinonimi: m.sinonimi, modi: m.modi }; });
    (diz.modalita || []).forEach(function (m) {
      if (!m || !m.id) return;
      var i = -1;
      mod.forEach(function (x, k) { if (x.id === m.id) i = k; });
      var nuova = { id: m.id, nome: m.nome, categoria: m.categoria || 'altro', sinonimi: [], modi: [], centro: true };
      if (i >= 0) mod[i] = Object.assign({}, mod[i], { nome: m.nome || mod[i].nome, categoria: m.categoria || mod[i].categoria });
      else mod.push(nuova);
    });
    return { categorie: cat, modalita: mod };
  }
  function trovaModalita(id, diz) { return elenco(diz).modalita.filter(function (m) { return m.id === id; })[0] || null; }
  function trovaCategoria(id, diz) { return elenco(diz).categorie.filter(function (c) { return c.id === id; })[0] || null; }

  function categoriaDaArea(area) {
    var a = normalizza(area);
    for (var i = 0; i < AREE.length; i++) if (AREE[i][0].test(a)) return AREE[i][1];
    return null;
  }

  // Cerca una modalità di serie nel testo: sinonimo intero, poi sinonimo
  // contenuto come parole intere (il più lungo vince). Restituisce anche
  // le parole che avanzano.
  function cercaNelTesto(n, mod) {
    if (!n) return null;
    var esatto = null;
    mod.forEach(function (m) { if (!esatto && (m.sinonimi || []).some(function (s) { return s === n; })) esatto = m; });
    if (esatto) return { m: esatto, resto: [] };
    var parole = n.split(' '), migliore = null;
    mod.forEach(function (m) {
      (m.sinonimi || []).forEach(function (s) {
        var sp = s.split(' ');
        for (var i = 0; i + sp.length <= parole.length; i++) {
          if (sp.every(function (w, k) { return parole[i + k] === w; })) {
            if (!migliore || sp.length > migliore.lung) migliore = { m: m, lung: sp.length, resto: parole.slice(0, i).concat(parole.slice(i + sp.length)) };
            break;
          }
        }
      });
    });
    return migliore ? { m: migliore.m, resto: migliore.resto } : null;
  }

  /**
   * Riconosce la modalità di un'attività del quaderno.
   * att: { nome, descrizione, area, target: [{testo}] }
   * → { modalita, variante, categoria, certo, ambiguo, alternative, nuova, motivo, chiave }
   *   modalita null + nuova {nome, categoria}: da creare (o da unire a una esistente)
   */
  function riconosci(att, diz) {
    diz = diz || {};
    var E = elenco(diz);
    var nome = String(att && att.nome || '').trim();
    var n = normalizza(nome);
    var base = { modalita: null, variante: '', categoria: null, certo: false, ambiguo: false, alternative: [], nuova: null, motivo: '', chiave: n };

    // 1. il dizionario del centro
    var s = diz.sinonimi && diz.sinonimi[n];
    if (s && trovaModalita(s.modalita, diz)) {
      return Object.assign(base, { modalita: s.modalita, variante: s.variante || '', categoria: trovaModalita(s.modalita, diz).categoria, certo: true, motivo: 'dal dizionario del centro' });
    }

    // 2. nomi ambigui: si propone dal contesto, si chiede sempre
    if (AMBIGUI[n]) {
      var testi = normalizza([att.descrizione].concat((att.target || []).map(function (t) { return t.testo; })).join(' '));
      var consegne = /\b(prendi|dammi|metti|vai|siediti|alzati|apri|chiudi|porta|tocca|batti|consegn|istruzion|direction)/.test(testi);
      var prop = consegne ? 'consegne' : 'indicare';
      return Object.assign(base, {
        modalita: prop, variante: consegne ? 'follow directions' : 'field', categoria: 'listener', ambiguo: true,
        alternative: consegne ? ['indicare'] : ['consegne'],
        motivo: '"' + nome + '" può voler dire follow directions o field (quanti stimoli tra cui scegliere): ' + (consegne ? 'i target sembrano consegne' : 'proposto field') + ', controlla.',
      });
    }

    // 3. "X to Y": la modalità è quella d'arrivo (Echo to tact → Tact)
    var arrivo = /^(.+?)\s+to\s+(.+)$/.exec(n);
    if (arrivo) {
      var a2 = cercaNelTesto(arrivo[2], E.modalita);
      if (a2) return Object.assign(base, { modalita: a2.m.id, variante: maiuscola(nome), categoria: a2.m.categoria, certo: !a2.resto.length, motivo: 'modalità d\'arrivo di «' + nome + '»' });
    }

    // 4. sinonimi di serie e del centro nel nome della tabella
    var t = cercaNelTesto(n, E.modalita);
    if (t) {
      // parole avanzate: modificatori ("intensive") o altri sinonimi della stessa modalità ("bagno")
      var proprie = (t.m.sinonimi || []).join(' ').split(' ');
      var solo = t.resto.every(function (w) { return MODIFICATORI.test(w) || proprie.indexOf(w) >= 0; });
      return Object.assign(base, {
        modalita: t.m.id, variante: variante(t.resto), categoria: t.m.categoria, certo: solo,
        motivo: solo ? '' : 'nel nome c\'è «' + t.resto.join(' ') + '»: controlla che sia una variante di ' + t.m.nome,
      });
    }

    // 5. la descrizione ("Programma: COMPRENSIONE VERBI")
    var d = cercaNelTesto(normalizza(att && att.descrizione), E.modalita);
    var catArea = categoriaDaArea(att && att.area);
    if (d && (!catArea || catArea === d.m.categoria)) {
      return Object.assign(base, { modalita: d.m.id, variante: maiuscola(nome), categoria: d.m.categoria, motivo: 'dalla descrizione «' + att.descrizione + '»' });
    }

    // 6. niente: una modalità nuova, nella categoria suggerita dal foglio
    var cat = catArea || (d && d.m.categoria) || 'altro';
    return Object.assign(base, { categoria: cat, nuova: { nome: maiuscola(nome) || 'Nuova modalità', categoria: cat },
      motivo: 'modalità non ancora conosciuta' + (catArea ? ' (dal foglio «' + att.area + '»)' : '') });
  }

  /** La modalità di un gioco dell'app ('tact', 'ran'...): id o null. */
  function modalitaDiModo(modo, diz) {
    if (!modo) return null;
    if (diz && diz.modi && diz.modi[modo]) return diz.modi[modo];
    var m = elenco(diz).modalita.filter(function (x) { return (x.modi || []).indexOf(modo) >= 0; })[0];
    return m ? m.id : null;
  }

  /** "Tact · intensive tact" — per schede ed elenchi. */
  function etichetta(att, diz) {
    var m = att && att.modalita ? trovaModalita(att.modalita, diz) : null;
    if (!m) return '';
    var v = String(att.variante || '').trim();
    return v && normalizza(v) !== normalizza(m.nome) ? m.nome + ' · ' + v : m.nome;
  }
  /** La categoria in cui sta un'attività: dalla modalità, se no dal foglio. */
  function categoriaDi(att, diz) {
    var m = att && att.modalita ? trovaModalita(att.modalita, diz) : null;
    var id = m ? m.categoria : categoriaDaArea(att && att.area);
    return id ? trovaCategoria(id, diz) || { id: id, nome: maiuscola(id) } : null;
  }

  /**
   * Cosa aggiungere al dizionario del centro dopo le scelte fatte in
   * anteprima: i sinonimi nuovi (non quelli ambigui né quelli già noti
   * allo stesso modo) e le modalità create.
   * scelte: [{ chiave, modalita, variante, nuova: {id, nome, categoria} }]
   */
  function aggiunte(scelte, diz) {
    var patch = { sinonimi: {}, modalita: [] };
    (scelte || []).forEach(function (x) {
      if (!x || !x.chiave || !x.modalita) return;
      if (x.nuova && !trovaModalita(x.nuova.id, diz)) patch.modalita.push({ id: x.nuova.id, nome: x.nuova.nome, categoria: x.nuova.categoria });
      if (AMBIGUI[x.chiave]) return;
      var gia = diz && diz.sinonimi && diz.sinonimi[x.chiave];
      if (gia && gia.modalita === x.modalita && (gia.variante || '') === (x.variante || '')) return;
      // se il riconoscimento di serie dà già lo stesso risultato, non serve scriverlo
      var serie = riconosci({ nome: x.chiave }, { modalita: (diz && diz.modalita) || [], categorie: (diz && diz.categorie) || [] });
      if (!gia && serie.certo && serie.modalita === x.modalita && normalizza(serie.variante) === normalizza(x.variante)) return;
      patch.sinonimi[x.chiave] = { modalita: x.modalita };
      if (x.variante) patch.sinonimi[x.chiave].variante = x.variante;
    });
    return patch;
  }

  /** Applica al dizionario un insieme di aggiunte (come fa il custode). */
  function unisci(diz, patch) {
    var d = JSON.parse(JSON.stringify(diz || {}));
    d.categorie = d.categorie || []; d.modalita = d.modalita || []; d.sinonimi = d.sinonimi || {}; d.modi = d.modi || {};
    (patch.categorie || []).forEach(function (c) { if (!d.categorie.some(function (x) { return x.id === c.id; })) d.categorie.push(c); });
    (patch.modalita || []).forEach(function (m) {
      var i = -1; d.modalita.forEach(function (x, k) { if (x.id === m.id) i = k; });
      if (i >= 0) d.modalita[i] = m; else d.modalita.push(m);
    });
    Object.keys(patch.sinonimi || {}).forEach(function (k) { if (patch.sinonimi[k] == null) delete d.sinonimi[k]; else d.sinonimi[k] = patch.sinonimi[k]; });
    Object.keys(patch.modi || {}).forEach(function (k) { if (patch.modi[k] == null) delete d.modi[k]; else d.modi[k] = patch.modi[k]; });
    return d;
  }

  function nuovoId(nome) {
    var b = normalizza(nome).replace(/ /g, '-').slice(0, 24) || 'modalita';
    return 'c-' + b + '-' + Math.random().toString(36).slice(2, 6);
  }

  return {
    CATEGORIE: CATEGORIE, MODALITA: MODALITA, AMBIGUI: AMBIGUI,
    normalizza: normalizza, elenco: elenco, trovaModalita: trovaModalita, trovaCategoria: trovaCategoria,
    categoriaDaArea: categoriaDaArea, riconosci: riconosci, modalitaDiModo: modalitaDiModo,
    etichetta: etichetta, categoriaDi: categoriaDi, aggiunte: aggiunte, unisci: unisci, nuovoId: nuovoId,
  };
});
