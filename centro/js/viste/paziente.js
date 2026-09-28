/* Scheda del paziente: programmi, sedute, dati. E dettaglio di una seduta. */
(function () {
  'use strict';
  var h = UI.html;

  var AREE_NOTE = ['Listener', 'Speaker', 'Repertori generali', 'Motricità', 'Comunità rinforzatori', 'Autonomie'];

  /** Paziente dal dispositivo; se non c'e' ancora lo scarica (serve la rete). */
  async function carica(pid) {
    var paz = await Sync.paziente(pid);
    if (!paz) {
      try { paz = await Sync.scaricaPaziente(pid, true); }
      catch (e) { return { errore: e }; }
    }
    var sedute = await Sync.sedute(pid);
    return { paz: paz, sedute: sedute };
  }

  function puoModificare(seduta) {
    var io = Sync.stato().io || {};
    var permessi = io.permessi || {};
    return permessi.modificaSeduteAltrui || !seduta.operatore || seduta.operatore === io.email;
  }

  function erroreCaricamento(e) {
    var offline = e && e.rete;
    return h`<div class="vuoto scheda imbottita">
      <div class="icona">${UI.icona(offline ? 'nuvola' : 'avviso')}</div>
      <p><b>${offline ? 'Questo paziente non è ancora sul dispositivo' : 'Non riesco ad aprire il paziente'}</b></p>
      <p class="piccolo">${offline ? 'Serve la connessione la prima volta che lo apri. Poi resta disponibile anche offline.' : (e && e.message)}</p>
      <a class="bottone" href="#/pazienti">Torna ai pazienti</a></div>`;
  }

  // --- Programmi ---------------------------------------------------------------
  function badgeCriterio(r) {
    if (!r.criterio) return '';
    if (r.criterio.raggiunto) return h`<span class="pill arancio">${UI.icona('bandiera')} criterio</span>`;
    if (r.criterio.striscia > 0) return h`<span class="pill acqua">${r.criterio.striscia}/${r.criterio.sedute}</span>`;
    return '';
  }

  function stoMancante(pr) {
    var ultimo = (pr.sto || []).slice().reverse().find(function (s) { return s.stato !== 'pianificato'; });
    if (pr.stato !== 'terminato' && ultimo && (ultimo.stato === 'criterio' || ultimo.stato === 'repertorio')) {
      return h`<i style="color:var(--arancio-forte)">ultimo STO a criterio: da aprire il prossimo</i>`;
    }
    return h`<i>nessuno STO in corso</i>`;
  }

  function rigaProgramma(pid, pr, r) {
    var ultima = r.ultima;
    return h`<li><a class="riga" href="#/p/${pid}/prog/${pr.id}">
      <span class="corpo">
        <span class="titolo">${pr.nome}</span>
        <span class="dettaglio a-capo">${r.sto ? r.sto.testo : stoMancante(pr)}</span>
      </span>
      <span class="fine">
        ${ultima && ultima.pct != null ? h`<div class="pct ${UI.classePct(ultima.pct, pr.criterio.soglia)}">${ultima.pct}%</div>` : ''}
        ${badgeCriterio(r)}
      </span>
    </a></li>`;
  }

  function tabProgrammi(paz, sedute, permessi) {
    var attivi = (paz.programmi || []).filter(function (p) { return p.stato !== 'terminato'; });
    var terminati = (paz.programmi || []).filter(function (p) { return p.stato === 'terminato'; });
    var perArea = {};
    attivi.forEach(function (p) { (perArea[p.area || 'Altro'] = perArea[p.area || 'Altro'] || []).push(p); });
    var aree = Object.keys(perArea).sort(function (a, b) {
      var ia = AREE_NOTE.indexOf(a), ib = AREE_NOTE.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'it');
    });
    var criteriDaChiudere = attivi.filter(function (p) {
      var r = Modello.riepilogoProgramma(paz, sedute, p);
      return r.criterio && r.criterio.raggiunto;
    });
    return h`
      ${criteriDaChiudere.length ? h`<div class="banda attenzione">${UI.icona('bandiera')}<div>
        <b>${criteriDaChiudere.length === 1 ? '1 programma ha' : criteriDaChiudere.length + ' programmi hanno'} raggiunto il criterio.</b>
        ${permessi.programmi ? 'Aprili per chiudere lo STO e passare al successivo.' : 'Segnalalo a chi segue il bambino.'}
      </div></div>` : ''}
      ${!attivi.length ? h`<div class="vuoto scheda imbottita"><p><b>Nessun programma attivo.</b></p>
        ${permessi.programmi ? h`<p class="piccolo">Aggiungi il primo programma per iniziare a registrare le sedute.</p>` : ''}</div>` : ''}
      ${aree.map(function (area) {
        return h`<div class="gruppo-titolo"><h3>${area}</h3></div>
          <ul class="lista scheda">${perArea[area].sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); }).map(function (pr) {
            return rigaProgramma(paz.id, pr, Modello.riepilogoProgramma(paz, sedute, pr));
          })}</ul>`;
      })}
      ${permessi.programmi ? h`<button class="bottone largo" style="margin-top:14px" data-azione="nuovo-programma">${UI.icona('piu')} Nuovo programma</button>` : ''}
      ${terminati.length ? h`<details style="margin-top:18px"><summary class="sotto" style="cursor:pointer;padding:8px 4px">Programmi terminati (${terminati.length})</summary>
        <ul class="lista scheda">${terminati.map(function (pr) { return rigaProgramma(paz.id, pr, Modello.riepilogoProgramma(paz, sedute, pr)); })}</ul>
      </details>` : ''}`;
  }

  // --- Sedute ------------------------------------------------------------------
  function tabSedute(paz, sedute) {
    var lista = sedute.filter(function (s) { return !s.eliminata; })
      .sort(function (a, b) { return (b.data + (b.inizio || '')).localeCompare(a.data + (a.inizio || '')); });
    if (!lista.length) return h`<div class="vuoto scheda imbottita"><p>Nessuna seduta registrata.</p></div>`;
    var mostra = lista.slice(0, 200);
    return h`<ul class="lista scheda">${mostra.map(function (s) {
      var r = Modello.riepilogoSeduta(paz, s);
      var chi = [s.operatoreNome].concat(s.coOperatori || []).filter(Boolean).join(' + ');
      return h`<li><a class="riga" href="#/p/${paz.id}/sd/${s.id}">
        <span class="corpo">
          <span class="titolo">${Modello.formatoData(s.data, true)}</span>
          <span class="dettaglio">${chi || '—'} · ${r.righe.length} ${r.righe.length === 1 ? 'programma' : 'programmi'}${s.fonte !== 'app' ? ' · importata' : ''}</span>
        </span>
        <span class="fine">
          ${r.totali ? h`<div><b>${r.corrette}</b>/${r.totali}</div>` : ''}
          ${s._locale ? h`<span class="pill arancio">${UI.icona('nuvola')} da inviare</span>` : ''}
        </span>
      </a></li>`;
    })}</ul>
    ${lista.length > mostra.length ? h`<p class="sotto piccolo">Mostrate le ultime ${mostra.length} sedute su ${lista.length}.</p>` : ''}`;
  }

  // --- Dati --------------------------------------------------------------------
  var PERIODI = { '1m': 31, '3m': 92, '6m': 183, 'tutto': 100000 };
  function tabDati(paz, sedute, periodo) {
    var lu = Modello.learnUnit(paz, sedute);
    var limite = Modello.oggiISO(new Date(Date.now() - PERIODI[periodo] * 86400000));
    var nel = lu.filter(function (g) { return g.data >= limite; });
    var corrette = nel.reduce(function (a, g) { return a + g.corrette; }, 0);
    var totali = nel.reduce(function (a, g) { return a + g.totali; }, 0);
    var criteri = nel.reduce(function (a, g) { return a + g.criteri; }, 0);
    return h`
      <div class="tab" role="tablist">${Object.keys(PERIODI).map(function (k) {
        var nomi = { '1m': '1 mese', '3m': '3 mesi', '6m': '6 mesi', 'tutto': 'Tutto' };
        return h`<button class="${k === periodo ? 'attiva' : ''}" data-azione="periodo" data-periodo="${k}">${nomi[k]}</button>`;
      })}</div>
      <div class="due-colonne" style="margin-bottom:12px">
        <div class="scheda imbottita"><div class="sotto piccolo">Giorni di lavoro</div><div style="font-size:24px;font-weight:750">${nel.length}</div></div>
        <div class="scheda imbottita"><div class="sotto piccolo">Criteri raggiunti</div><div style="font-size:24px;font-weight:750;color:var(--arancio-forte)">${criteri}</div></div>
        <div class="scheda imbottita"><div class="sotto piccolo">Learn unit al giorno</div><div style="font-size:24px;font-weight:750">${nel.length ? Math.round(totali / nel.length) : '—'}</div></div>
        <div class="scheda imbottita"><div class="sotto piccolo">Corrette</div><div class="pct ${UI.classePct(totali ? Math.round(100 * corrette / totali) : null, 80)}" style="font-size:24px">${totali ? Math.round(100 * corrette / totali) + '%' : '—'}</div></div>
      </div>
      <div class="scheda imbottita"><h3 style="margin-top:0">Learn unit giornaliere</h3>${Grafici.learnUnit(nel)}</div>
      <div class="scheda" style="margin-top:12px;overflow-x:auto">
        <table class="tabella"><thead><tr><th>Data</th><th class="num">Corrette</th><th class="num">Totali</th><th class="num">Criteri</th><th>Chi</th></tr></thead>
        <tbody>${nel.slice().reverse().slice(0, 60).map(function (g) {
          return h`<tr><td>${Modello.formatoData(g.data)}${g.fonte === 'storico' ? h` <span class="pill">storico</span>` : ''}</td>
            <td class="num">${g.corrette}</td><td class="num">${g.totali}</td><td class="num">${g.criteri || ''}</td>
            <td class="piccolo">${g.operatori.join(', ')}</td></tr>`;
        })}</tbody></table>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  App.vista('paziente', {
    sezione: 'pazienti',
    titolo: function (p) { return p._titolo || ''; },
    render: async function (p) {
      var d = await carica(p.id);
      if (d.errore) return erroreCaricamento(d.errore);
      var paz = d.paz, sedute = d.sedute;
      p._titolo = paz.etichetta || paz.codice;
      var permessi = (Sync.stato().io || {}).permessi || {};
      var bozza = await Sync.bozza(paz.id);
      var tab = p.t || 'programmi';
      var periodo = p.periodo || '3m';
      var haProgrammi = (paz.programmi || []).some(function (x) { return x.stato !== 'terminato'; });

      return h`
        <a class="bottone fantasma piccolo" href="#/pazienti" style="margin-left:-10px">${UI.icona('indietro')} Pazienti</a>
        <h1>${paz.etichetta || paz.codice}</h1>
        <p class="sotto" style="margin-top:-8px">${paz.codice}${paz.aula ? ' · ' + paz.aula : ''}</p>
        ${haProgrammi ? h`<a class="bottone ${bozza ? 'arancio' : 'primario'} grande largo" href="#/p/${paz.id}/seduta">
          ${UI.icona('play')} ${bozza ? 'Riprendi la seduta in corso' : 'Inizia seduta'}</a>` : ''}
        <div class="tab" role="tablist">
          <button class="${tab === 'programmi' ? 'attiva' : ''}" data-azione="tab" data-tab="programmi">Programmi</button>
          <button class="${tab === 'sedute' ? 'attiva' : ''}" data-azione="tab" data-tab="sedute">Sedute</button>
          <button class="${tab === 'dati' ? 'attiva' : ''}" data-azione="tab" data-tab="dati">Dati</button>
        </div>
        ${tab === 'programmi' ? tabProgrammi(paz, sedute, permessi) : tab === 'sedute' ? tabSedute(paz, sedute) : tabDati(paz, sedute, periodo)}`;
    },
    azioni: {
      tab: function (b, e, p) { App.vai('#/p/' + p.id + '?t=' + b.getAttribute('data-tab'), true); },
      periodo: function (b, e, p) { App.vai('#/p/' + p.id + '?t=dati&periodo=' + b.getAttribute('data-periodo'), true); },
      'nuovo-programma': async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var nuovo = await Programmi.modulo(null, paz);
        if (!nuovo) return;
        paz.programmi = (paz.programmi || []).concat([nuovo]);
        try {
          await Sync.salvaPaziente(paz);
          UI.avviso('Programma aggiunto', 'ok');
          App.ridisegna();
        } catch (err) { App.errore(err); }
      },
    },
  });

  // --- Dettaglio di una seduta ---------------------------------------------------
  App.vista('dettaglio-seduta', {
    sezione: 'pazienti',
    titolo: function () { return 'Seduta'; },
    render: async function (p) {
      var d = await carica(p.id);
      if (d.errore) return erroreCaricamento(d.errore);
      var s = d.sedute.find(function (x) { return x.id === p.sid; });
      if (!s) return h`<div class="vuoto">Seduta non trovata. <a href="#/p/${p.id}?t=sedute">Torna alle sedute</a></div>`;
      var r = Modello.riepilogoSeduta(d.paz, s);
      var chi = [s.operatoreNome].concat(s.coOperatori || []).filter(Boolean).join(' + ');
      return h`
        <a class="bottone fantasma piccolo" href="#/p/${p.id}?t=sedute" style="margin-left:-10px">${UI.icona('indietro')} ${d.paz.etichetta || d.paz.codice}</a>
        <h1>${Modello.formatoData(s.data, true)}</h1>
        <p class="sotto" style="margin-top:-8px">${chi || '—'}${s.fonte !== 'app' ? ' · importata da Numbers' : ''}</p>
        ${s.eliminata ? h`<div class="banda errore">Seduta eliminata.</div>` : ''}
        ${s._locale ? h`<div class="banda attenzione">${UI.icona('nuvola')}<div>Salvata su questo dispositivo, in attesa di invio.</div></div>` : ''}
        <ul class="lista scheda">${r.righe.map(function (x) {
          var pr = x.programma || { nome: 'Programma rimosso', criterio: { soglia: 90 } };
          var sto = x.programma && (x.programma.sto || []).find(function (t) { return t.id === x.voce.stoId; });
          return h`<li><div class="riga">
            <span class="corpo">
              <span class="titolo">${pr.nome}</span>
              <span class="dettaglio a-capo">${sto ? sto.testo : ''}</span>
              ${x.voce.decisione ? h`<span class="pill arancio">${x.voce.decisione}</span>` : ''}
              ${x.voce.nota ? h`<div class="piccolo sotto">${x.voce.nota}</div>` : ''}
            </span>
            <span class="fine">
              <div class="pct ${UI.classePct(x.pct, pr.criterio.soglia)}">${x.pct == null ? '—' : x.pct + '%'}</div>
              ${x.conti.percentuale ? '' : h`<div class="piccolo"><span style="color:var(--v)">${x.conti.v}</span> · <span style="color:var(--p)">${x.conti.p}</span> · <span style="color:var(--x)">${x.conti.x}</span></div>`}
              ${x.voce.eventi ? h`<div class="piccolo">${(pr.evento || ['Sì', 'No'])[0]}: ${x.voce.eventi[0]} · ${(pr.evento || ['Sì', 'No'])[1]}: ${x.voce.eventi[1]}</div>` : ''}
            </span>
          </div></li>`;
        })}</ul>
        ${r.totali ? h`<p class="sotto">Learn unit: <b>${r.corrette}</b> corrette su <b>${r.totali}</b> (${r.pct}%)</p>` : ''}
        ${s.nota ? h`<div class="scheda imbottita" style="margin-top:10px"><h3 style="margin-top:0">Note</h3><p style="margin:0;white-space:pre-wrap">${s.nota}</p></div>` : ''}
        ${!s.eliminata && puoModificare(s) ? h`<div class="bottoni" style="margin-top:16px">
          <a class="bottone" href="#/p/${p.id}/seduta?modifica=${s.id}">${UI.icona('matita')} Correggi</a>
          <button class="bottone pericolo" data-azione="elimina">${UI.icona('cestino')} Elimina</button>
        </div>` : ''}`;
    },
    azioni: {
      elimina: async function (b, e, p) {
        if (!await UI.conferma('Eliminare questa seduta?', 'Non comparirà più nei grafici e nei conteggi. Resta nello storico del Drive.', { ok: 'Elimina', pericolo: true })) return;
        var s = (await Sync.sedute(p.id)).find(function (x) { return x.id === p.sid; });
        await Sync.registraSeduta(s, true);
        UI.avviso('Seduta eliminata');
        App.vai('#/p/' + p.id + '?t=sedute');
      },
    },
  });

  window.PazienteVista = { carica: carica, AREE_NOTE: AREE_NOTE };
})();
