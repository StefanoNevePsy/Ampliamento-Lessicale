/**
 * Import dei quaderni Numbers del Centro TICE nella struttura dell'app.
 *
 * Un quaderno Numbers ha un foglio per area e una tabella per attività
 * (programma), con i target (STO) uno dopo l'altro nella prima colonna.
 * Diventa:
 *   - patient.programma.attivita: le attività con i loro target, lo stato
 *     (in corso, a criterio, pianificato...), il criterio e il tipo di seduta;
 *   - patient.history: una seduta Quaderno (mode 'quaderno') per ogni riga con
 *     dati, con setName "Attività · Target", così grafici, criterio, giornate
 *     ed export dell'app la trattano come le sedute registrate nell'app;
 *   - patient.learnUnitStoriche: le tabelle "Frequenze" / "Learn unit
 *     giornaliere", che valgono più della somma delle righe per quei giorni.
 *
 * Quando un dato non si può ricavare con certezza (quante prove per seduta in
 * un foglio che registra solo le corrette), non lo inventa: finisce in
 * daConfermare e l'anteprima lo chiede a chi importa.
 *
 * Il modulo è puro (niente DOM, niente DB) per poterlo provare in Node.
 */
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.TiceImport = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOTALI_TIPICI = [5, 10, 12, 15, 20, 25, 30, 40, 50];
  var FOGLI_STORICO = ['frequenze', 'learn unit'];
  var FOGLI_SALTATI = ['modeli grafici', 'modelli grafici'];
  var FOGLIO_TERMINATI = 'programmi terminati';
  var RE_DECISIONE = /criterio|repertorio|stop|passa a|sospes|probe/i;

  // ---------- utilità ----------
  // Identificativi stabili: reimportare lo stesso file sostituisce le stesse
  // sedute invece di duplicarle.
  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }
  function testo(v) {
    if (v == null) return '';
    if (v instanceof Date) return dataIso(v) || '';
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function numero(v) {
    if (v == null || typeof v === 'boolean' || v instanceof Date) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    return parseFloat(s);
  }
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function dataIso(v) {
    // Le date di Numbers sono "ora locale scritta come UTC": si leggono in UTC.
    if (v instanceof Date) return isNaN(v) ? null : v.getUTCFullYear() + '-' + due(v.getUTCMonth() + 1) + '-' + due(v.getUTCDate());
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(testo(v));
    if (!m) return null;
    var g = +m[1], mm = +m[2], a = +m[3];
    if (a < 100) a += 2000;
    var d = new Date(Date.UTC(a, mm - 1, g));
    if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== g) return null;
    return a + '-' + due(mm) + '-' + due(g);
  }
  function areaLeggibile(nome) {
    var s = testo(nome).toLowerCase();
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return s.replace(/rep\. generali/i, 'Repertori generali');
  }
  function leggiCriterio(t) {
    t = testo(t);
    var soglia = 90, sedute = 2, m;
    if ((m = /(\d{2,3})\s*(?:\/\s*100)?\s*%/.exec(t))) soglia = +m[1];
    if ((m = /(?:x|per)\s*(\d+)/i.exec(t))) sedute = +m[1];
    return { soglia: soglia, sedute: sedute };
  }
  function leggiStrategia(riga1, colonne) {
    var valori = riga1.map(function (x) { return testo(x).toLowerCase(); });
    if (valori.some(function (v) { return v.indexOf('time delay') >= 0 || v === 'td' || v === 't/d'; })) return 'timedelay';
    if (valori.some(function (v) { return v.indexOf('indipendente') >= 0; })) return 'independent';
    // Nessuna strategia scritta: se c'è la colonna dei promptati si lavorava in T/D
    return colonne.p != null ? 'timedelay' : 'independent';
  }
  function mappaColonne(intest) {
    var col = { sto: 0, data: null, v: null, p: null, evento: null, decisione: null }, nomeP = null;
    intest.forEach(function (h, i) {
      var t = testo(h).toLowerCase();
      if (!t) return;
      if (t === 'data' || t.indexOf('gg/') === 0) col.data = i;
      else if (t.indexOf('corrett') >= 0) col.v = i;
      else if (t.indexOf('prompt') >= 0 || t.indexOf('echo') >= 0) { col.p = i; nomeP = t.indexOf('echo') >= 0 ? 'Echo' : null; }
      else if (t.indexOf('x:') === 0 || t.indexOf('event') >= 0) col.evento = i;
      else if (t.indexOf('decision') >= 0) col.decisione = i;
    });
    return { col: col, nomeP: nomeP };
  }
  function etichetteEvento(intest) {
    var m = /^\s*X\s*:\s*(.+?)\s*✔️?\s*(.+)$/.exec(testo(intest));
    return m ? [m[2].trim(), m[1].trim()] : ['Sì', 'No'];
  }
  // Secondi di time delay scritti nel target: 1"T/D, 2” TD, 3'' t/d
  function secondiTD(t) {
    var m = /(\d+)\s*(?:["”″]|'')\s*T\s*\/?\s*D/i.exec(t || '');
    return m ? +m[1] : null;
  }
  function cella(tab, r, c) { return c == null || !tab.righe[r] ? null : tab.righe[r][c]; }
  function eTabellaAttivita(tab) {
    return tab.righe.length >= 4 && testo(cella(tab, 0, 0)).toLowerCase().indexOf('programma') === 0;
  }

  // ---------- un'attività (tabella) ----------
  function leggiAttivita(tab, area, terminato, avvisi) {
    var nc = tab.righe[0] ? tab.righe[0].length : 0;
    var r0 = tab.righe[0], r1 = tab.righe[1], r2 = tab.righe[2];
    var mc = mappaColonne(r2), colonne = mc.col;
    var nome = testo(tab.nome);
    var chiave = (area || 'terminati') + '|' + nome.toLowerCase();
    var critTxt = '';
    for (var i = 1; i < r1.length; i++) if (testo(r1[i]).indexOf('%') >= 0) { critTxt = testo(r1[i]); break; }
    var att = {
      id: 'at_' + hash(chiave),
      nome: nome,
      area: area || '',
      descrizione: testo(r0[0]).replace(/^programma\s*:?\s*/i, ''),
      criterio: leggiCriterio(critTxt),
      sessionType: leggiStrategia(r1, colonne),
      prove: null,
      scala: 'conteggio',
      stato: terminato ? 'terminato' : 'attivo',
      target: [],
      origine: 'numbers'
    };
    if (mc.nomeP) att.nomeP = mc.nomeP;
    if (r1.some(function (x) { return testo(x).toLowerCase().indexOf('event') >= 0; }) || colonne.evento != null) {
      att.evento = colonne.evento != null ? etichetteEvento(r2[colonne.evento]) : ['Sì', 'No'];
    }
    var etich = (area || 'Terminati') + ' / ' + nome;
    if (colonne.data == null || colonne.v == null) {
      avvisi.push(etich + ': colonne DATA o CORRETTE non trovate, tabella saltata.');
      return null;
    }

    // Righe → target. Un target nuovo comincia quando c'è testo nella prima
    // colonna e: è la prima riga utile, o la riga prima era vuota o aveva una
    // decisione, o il target corrente ha già diverse righe di dati (i testi su
    // più righe stanno all'inizio del blocco), o la data torna indietro
    // (target paralleli nella stessa tabella).
    var corrente = null, righeDati = 0, precVuota = true, precDecisione = false, ultimaData = null;
    var voci = [];
    var mappate = Object.keys(colonne).map(function (k) { return colonne[k]; }).filter(function (c) { return c != null; });
    function nuovoTarget(t, d) {
      corrente = { id: 'tg_' + hash(att.id + '|' + att.target.length + '|' + t), testo: t, stato: 'chiuso', inizio: d, fine: null };
      att.target.push(corrente);
      righeDati = 0;
    }
    for (var r = 3; r < tab.righe.length; r++) {
      var tSto = testo(cella(tab, r, colonne.sto));
      var d = dataIso(cella(tab, r, colonne.data));
      var vRaw = cella(tab, r, colonne.v);
      var v = numero(vRaw);
      var p = colonne.p != null ? numero(cella(tab, r, colonne.p)) : null;
      var dec = colonne.decisione != null ? testo(cella(tab, r, colonne.decisione)) : '';
      if (!dec) {
        // A volte la decisione è in una colonna senza intestazione
        for (var c = 0; c < nc; c++) {
          if (mappate.indexOf(c) >= 0) continue;
          var tc = testo(cella(tab, r, c));
          if (tc && RE_DECISIONE.test(tc)) { dec = tc; break; }
        }
      }
      var evRaw = colonne.evento != null ? cella(tab, r, colonne.evento) : null;

      if (!tSto && !d && v == null && p == null && !dec) { precVuota = true; continue; }

      var tornaIndietro = !!(d && ultimaData && d < ultimaData && righeDati >= 3);
      if (tSto) {
        if (!corrente || precVuota || precDecisione || righeDati >= 3 || tornaIndietro) nuovoTarget(tSto, d);
        else corrente.testo += ' — ' + tSto;
      } else if (!corrente) nuovoTarget('(senza titolo)', d);

      if (d && (v != null || p != null || dec)) {
        if (!corrente.inizio || d < corrente.inizio) corrente.inizio = d;
        var voce = {
          riga: r, attivitaId: att.id, targetId: corrente.id, data: d,
          v: v, p: p != null ? p : (colonne.p != null ? 0 : null), x: null,
          decisione: dec || null, nota: ''
        };
        if (v == null && testo(vRaw)) {
          voce.nota = 'valore non leggibile nel file originale: "' + testo(vRaw) + '"';
          avvisi.push(etich + ' ' + d + ': valore "' + testo(vRaw) + '" non numerico, lasciato vuoto.');
        }
        if (testo(evRaw)) voce.nota = (voce.nota ? voce.nota + ' ' : '') + 'evento: ' + testo(evRaw);
        var u = dec.toUpperCase();
        if (u.indexOf('CRITERIO') >= 0) { corrente.stato = 'criterio'; corrente.fine = d; }
        else if (u.indexOf('REPERTORIO') >= 0) { corrente.stato = 'repertorio'; corrente.fine = d; }
        voci.push(voce);
        righeDati++;
        ultimaData = d;
      } else if (dec) {
        var u2 = dec.toUpperCase();
        if (u2.indexOf('CRITERIO') >= 0) corrente.stato = 'criterio';
        else if (u2.indexOf('REPERTORIO') >= 0) corrente.stato = 'repertorio';
      }
      precVuota = false;
      precDecisione = !!dec;
    }

    // Target scritti ma ancora senza dati: sono il piano successivo.
    var conDati = {};
    voci.forEach(function (x) { conDati[x.targetId] = true; });
    var ultimo = -1;
    att.target.forEach(function (t, i) { if (conDati[t.id]) ultimo = i; });
    att.target.forEach(function (t, i) { if (i > ultimo && !conDati[t.id]) t.stato = 'pianificato'; });
    if (!terminato && att.target.length) {
      if (ultimo >= 0 && att.target[ultimo].stato === 'chiuso') att.target[ultimo].stato = 'attivo';
      else if (!att.target.some(function (t) { return t.stato === 'attivo'; })) {
        var prossimo = att.target.filter(function (t) { return t.stato === 'pianificato'; })[0];
        if (prossimo) prossimo.stato = 'attivo';
      }
    }
    att.target.forEach(function (t) {
      var s = secondiTD(t.testo);
      if (s) t.tdSeconds = s;
    });
    return { attivita: att, voci: voci };
  }

  // Percentuali o conteggi, e quante prove per seduta. Mai inventato in silenzio.
  function deduciScala(att, voci, daConfermare, avvisi) {
    var utili = voci.filter(function (x) { return x.v != null; });
    if (!utili.length) return;
    var haP = utili.some(function (x) { return x.p != null; });
    var somme = utili.map(function (x) { return x.v + (x.p || 0); });
    var etich = (att.area || 'Terminati') + ' / ' + att.nome;
    var aCento = somme.filter(function (s) { return Math.abs(s - 100) <= 1; }).length;

    if (haP && aCento / somme.length >= 0.8) {
      att.scala = 'percentuale';
      utili.forEach(function (x) {
        x.scala = 'percentuale';
        var tot = x.v + (x.p || 0);
        if (Math.abs(tot - 100) > 1) {
          var pct = tot ? Math.round(100 * x.v / tot) : 0;
          avvisi.push(etich + ' ' + x.data + ': ' + x.v + '+' + (x.p || 0) + ' = ' + tot + ', non 100. Probabile refuso: importato come ' + pct + '% corrette.');
          x.nota = (x.nota ? x.nota + ' ' : '') + 'nel file: ' + x.v + ' corrette + ' + (x.p || 0) + ' promptate (somma ' + tot + ')';
          x.v = pct; x.p = 100 - pct;
        }
        x.x = Math.max(0, 100 - x.v - (x.p || 0));
      });
      return;
    }
    var massimo = Math.max.apply(null, somme);
    if (!haP && massimo > 20 && massimo <= 100) {
      // Una sola colonna con valori oltre 20: sono percentuali (57, 91, 100…)
      att.scala = 'percentuale';
      utili.forEach(function (x) { x.scala = 'percentuale'; x.p = 0; x.x = Math.max(0, 100 - x.v); });
      return;
    }
    // Conteggi: il totale per seduta non è scritto, lo si deduce dal massimo.
    var candidato = TOTALI_TIPICI.filter(function (t) { return t >= massimo; })[0] || Math.round(massimo);
    var pieni = somme.filter(function (s) { return s === candidato; }).length;
    var motivo, certo;
    att.prove = candidato;
    if (haP && pieni / somme.length >= 0.8) {
      motivo = pieni + ' righe su ' + somme.length + ' sommano esattamente a ' + candidato;
      certo = true;
    } else if (haP) {
      motivo = 'il massimo di corrette + promptate è ' + massimo + '; nelle righe sotto ' + candidato + ' la differenza viene contata come errori';
      certo = false;
    } else {
      motivo = 'il foglio registra solo le corrette (massimo ' + massimo + '): il numero di prove non è scritto';
      certo = false;
    }
    daConfermare.push({ attivitaId: att.id, attivita: etich, campo: 'prove', proposta: candidato, motivo: motivo, certo: certo });
  }

  // ---------- storico learn unit / frequenze ----------
  var MAPPA_STORICO = [
    ['data', ['data', 'gg/mese']],
    ['criteri', ['criteri']],
    ['assessment', ['assessment']],
    ['corrette', ['risposte corrette']],
    ['totali', ['risposte totali']],
    ['durata', ['durata']],
    ['operatori', ['psico', 'psicolog']],
    ['tipologia', ['tipologia']],
    ['compilatore', ['iniziali']]
  ];
  function leggiStorico(tab, fonte) {
    var intest = (tab.righe[0] || []).map(function (x) { return testo(x).toLowerCase(); });
    var idx = {}, usate = [];
    MAPPA_STORICO.forEach(function (m) {
      for (var i = 0; i < intest.length; i++) {
        var h = intest[i];
        if (usate.indexOf(i) < 0 && m[1].some(function (p) { return h.indexOf(p) === 0 || h.indexOf(p) >= 0; })) { idx[m[0]] = i; usate.push(i); break; }
      }
    });
    if (idx.data == null) return [];
    var righe = [];
    for (var r = 1; r < tab.righe.length; r++) {
      var d = dataIso(cella(tab, r, idx.data));
      if (!d) continue;
      var riga = { data: d, fonte: fonte };
      ['criteri', 'assessment', 'corrette', 'totali', 'durata'].forEach(function (k) {
        if (idx[k] == null) return;
        var n = numero(cella(tab, r, idx[k]));
        if (n != null) riga[k] = n;
      });
      ['operatori', 'tipologia', 'compilatore'].forEach(function (k) {
        if (idx[k] == null) return;
        var s = testo(cella(tab, r, idx[k]));
        if (s) riga[k] = s;
      });
      righe.push(riga);
    }
    return righe;
  }

  /** Nome da mostrare dal nome del file: "Mario_R_old.numbers" → "Mario R". */
  function nomeDaFile(file) {
    var base = String(file || '').replace(/^.*[\\/]/, '').replace(/\.numbers$/i, '');
    var parti = base.split(/[_\s\-]+/).filter(function (p) { return p && !/^(old|vecchio|copia|copy|backup)$/i.test(p); });
    return parti.join(' ') || base || 'Senza nome';
  }

  /**
   * Analizza un documento letto da NumbersReader.
   * @returns {{nome, file, attivita, voci, storico, avvisi, daConfermare}}
   */
  function analizza(doc, file) {
    var avvisi = [], daConfermare = [], attivita = [], voci = [], storico = [];
    doc.forEach(function (foglio) {
      var nome = testo(foglio.nome), basso = nome.toLowerCase();
      if (FOGLI_SALTATI.some(function (s) { return basso.indexOf(s) === 0; })) {
        avvisi.push('Foglio "' + nome + '" saltato: contiene modelli, non dati.');
        return;
      }
      if (FOGLI_STORICO.some(function (s) { return basso.indexOf(s) >= 0; })) {
        foglio.tabelle.forEach(function (tab) {
          var righe = leggiStorico(tab, nome + ' / ' + testo(tab.nome));
          if (righe.length) storico.push.apply(storico, righe);
          else avvisi.push('"' + nome + ' / ' + testo(tab.nome) + '": nessuna data riconosciuta, saltata.');
        });
        return;
      }
      var terminato = basso.indexOf(FOGLIO_TERMINATI) === 0;
      var area = terminato ? null : areaLeggibile(nome);
      foglio.tabelle.forEach(function (tab) {
        if (!eTabellaAttivita(tab)) {
          if (tab.righe.length) avvisi.push('"' + nome + ' / ' + testo(tab.nome) + '" non sembra un\'attività, saltata.');
          return;
        }
        var ris = leggiAttivita(tab, area, terminato, avvisi);
        if (!ris) return;
        deduciScala(ris.attivita, ris.voci, daConfermare, avvisi);
        attivita.push(ris.attivita);
        voci.push.apply(voci, ris.voci);
      });
    });

    var oggi = new Date().toISOString().slice(0, 10);
    var nomi = {};
    attivita.forEach(function (a) { nomi[a.id] = (a.area || 'Terminati') + ' / ' + a.nome; });
    voci.forEach(function (x) {
      if (x.data > oggi || x.data < '2015-01-01') avvisi.push(nomi[x.attivitaId] + ': data ' + x.data + ' nel futuro o troppo vecchia, probabile refuso nel foglio originale.');
    });
    storico.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return { nome: nomeDaFile(file), file: String(file || '').replace(/^.*[\\/]/, ''), attivita: attivita, voci: voci, storico: storico, avvisi: avvisi, daConfermare: daConfermare };
  }

  /** "Attività · Target": il nome con cui le sedute compaiono nell'app. */
  function nomeSet(att, target) {
    return target && target.testo ? att.nome + ' · ' + target.testo : att.nome;
  }

  /**
   * Trasforma le voci in sedute dello storico dell'app.
   * @param conferme {attivitaId: prove} dall'anteprima
   */
  function sedute(pacchetto, conferme) {
    conferme = conferme || {};
    var perAtt = {}, perTarget = {};
    pacchetto.attivita.forEach(function (a) {
      perAtt[a.id] = a;
      a.target.forEach(function (t) { perTarget[t.id] = t; });
    });
    var operatori = {};
    pacchetto.storico.forEach(function (r) { if (r.operatori && !operatori[r.data]) operatori[r.data] = r.operatori; });
    var visti = {};
    var out = [];
    pacchetto.voci.forEach(function (x) {
      var a = perAtt[x.attivitaId], t = perTarget[x.targetId];
      if (x.v == null) return; // niente numeri: resta solo l'eventuale decisione sul target
      var perc = x.scala === 'percentuale';
      var prove = conferme[a.id] != null ? conferme[a.id] : a.prove;
      var v = x.v, p = x.p || 0, xx;
      if (perc) xx = x.x != null ? x.x : Math.max(0, 100 - v - p);
      else xx = prove ? Math.max(0, prove - v - p) : 0;
      var tot = v + p + xx;
      if (!tot) return;
      var id = 'nx_' + hash(a.id + '|' + t.id + '|' + x.data + '|' + x.riga);
      if (visti[id]) return;
      visti[id] = true;
      var s = {
        id: id,
        date: x.data + 'T12:00:00',
        setId: 'tice_' + t.id,
        setName: nomeSet(a, t),
        setCat: a.area || 'Terminati',
        mode: 'quaderno',
        correct: v,
        prompts: p,
        total: tot,
        percentage: Math.round(v / tot * 100),
        sessionType: a.sessionType,
        rawV: v, rawP: p, rawX: xx,
        attivitaId: a.id,
        targetId: t.id,
        fonte: 'numbers',
        fonteFile: pacchetto.file
      };
      if (perc) s.scala = 'percentuale';
      if (a.sessionType === 'timedelay' && t.tdSeconds) s.timeDelaySeconds = t.tdSeconds;
      if (operatori[x.data]) s.operatore = operatori[x.data];
      var nota = [];
      if (x.decisione) nota.push('**' + x.decisione + '**');
      if (x.nota) nota.push(x.nota);
      if (nota.length) s.note = nota.join(' — ');
      out.push(s);
    });
    return out;
  }

  /**
   * Applica un pacchetto a un paziente (nuovo o esistente) e lo restituisce.
   * Reimportare lo stesso file sostituisce le sedute importate da quel file;
   * le sedute registrate nell'app e le attività create nell'app restano.
   */
  function applica(paziente, pacchetto, conferme, opzioni) {
    opzioni = opzioni || {};
    var p = paziente;
    if (!p.history) p.history = [];
    conferme = conferme || {};
    pacchetto.attivita.forEach(function (a) { if (conferme[a.id] != null) a.prove = conferme[a.id]; });

    // Programma: le attività del file sostituiscono quelle con lo stesso id
    // (stessa area e nome); quelle create nell'app restano. I target creati
    // nell'app dentro un'attività importata restano anche loro, in coda.
    var prog = p.programma || (p.programma = { attivita: [] });
    pacchetto.attivita.forEach(function (a) {
      var i = -1;
      prog.attivita.forEach(function (x, k) { if (x.id === a.id) i = k; });
      if (i < 0) { prog.attivita.push(a); return; }
      var vecchia = prog.attivita[i];
      var nuovi = {};
      a.target.forEach(function (t) { nuovi[t.id] = true; });
      var dallApp = (vecchia.target || []).filter(function (t) { return t.origine === 'app' && !nuovi[t.id]; });
      if (dallApp.length) {
        // se l'app ha già aperto un target successivo, quello resta il corrente
        a.target.forEach(function (t) { if (t.stato === 'attivo' && dallApp.some(function (x) { return x.stato === 'attivo'; })) t.stato = 'chiuso'; });
        a.target = a.target.concat(dallApp);
      }
      // quello che è stato cambiato nell'app (stato, prove, target chiusi) vince sul foglio
      ['prove', 'tdSeconds', 'nota'].forEach(function (k) { if (vecchia[k] != null && a[k] == null) a[k] = vecchia[k]; });
      if (vecchia.modificato) { a.stato = vecchia.stato; a.prove = vecchia.prove; a.sessionType = vecchia.sessionType; a.modificato = vecchia.modificato; }
      var vecchiT = {};
      (vecchia.target || []).forEach(function (t) { vecchiT[t.id] = t; });
      a.target.forEach(function (t) {
        var vt = vecchiT[t.id];
        if (vt && vt.modificato) { t.stato = vt.stato; t.fine = vt.fine; t.modificato = vt.modificato; }
      });
      prog.attivita[i] = a;
    });
    prog.aggiornato = new Date().toISOString();

    // Storico: fuori le sedute importate prima da questo file, dentro le nuove
    var nuove = sedute(pacchetto, conferme);
    p.history = p.history.filter(function (s) { return !(s.fonte === 'numbers' && s.fonteFile === pacchetto.file); });
    p.history = p.history.concat(nuove);

    // Soglie diverse dal 90% scritte nel foglio
    pacchetto.attivita.forEach(function (a) {
      if (!a.criterio || !a.criterio.soglia) return;
      var predef = p.criterionThreshold || opzioni.sogliaPredefinita || 90;
      if (a.criterio.soglia === predef) return;
      p.criterionOverrides = p.criterionOverrides || {};
      a.target.forEach(function (t) { p.criterionOverrides[nomeSet(a, t) + '::quaderno'] = a.criterio.soglia; });
    });

    // Learn unit storiche: sostituite quelle dello stesso file
    var lu = (p.learnUnitStoriche || []).filter(function (r) { return r.fonteFile !== pacchetto.file; });
    pacchetto.storico.forEach(function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.fonteFile = pacchetto.file; lu.push(c); });
    lu.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    p.learnUnitStoriche = lu;
    p.importazioni = (p.importazioni || []).filter(function (x) { return x.file !== pacchetto.file; });
    p.importazioni.push({ file: pacchetto.file, data: new Date().toISOString(), sedute: nuove.length, attivita: pacchetto.attivita.length });
    return { paziente: p, sedute: nuove.length };
  }

  return {
    analizza: analizza, sedute: sedute, applica: applica, nomeSet: nomeSet, nomeDaFile: nomeDaFile,
    _interni: { dataIso: dataIso, numero: numero, leggiCriterio: leggiCriterio, secondiTD: secondiTD, hash: hash }
  };
});
