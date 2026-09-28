/* Scheda di un programma: STO, criterio, grafico. E il modulo per crearlo/modificarlo. */
(function () {
  'use strict';
  var h = UI.html;

  var STATI_STO = {
    attivo: ['acqua', 'in corso'], pianificato: ['', 'pianificato'], criterio: ['arancio', 'criterio'],
    repertorio: ['v', 'repertorio'], chiuso: ['', 'chiuso'], sospeso: ['', 'sospeso'],
  };

  /** Modulo di creazione/modifica. Restituisce il programma o null. */
  async function modulo(esistente, paz) {
    var pr = esistente || { criterio: { soglia: 90, sedute: 2 }, strategia: 'timedelay', stato: 'attivo', sto: [] };
    var aree = PazienteVista.AREE_NOTE.slice();
    (paz.programmi || []).forEach(function (p) { if (p.area && aree.indexOf(p.area) < 0) aree.push(p.area); });
    var dati = await UI.apriFoglio(h`<form>
      <h2>${esistente ? 'Modifica programma' : 'Nuovo programma'}</h2>
      <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${pr.nome || ''}" placeholder="TACT, Point, Rubamazzo…"></label>
      <label class="campo"><span>Area</span><input name="area" maxlength="60" value="${pr.area || ''}" list="aree" placeholder="Speaker, Listener…">
        <datalist id="aree">${aree.map(function (a) { return h`<option value="${a}">`; })}</datalist></label>
      <label class="campo"><span>Strategia di insegnamento</span>
        <select name="strategia"><option value="timedelay" ${pr.strategia === 'timedelay' ? 'selected' : ''}>Time delay</option>
        <option value="indipendente" ${pr.strategia === 'indipendente' ? 'selected' : ''}>Indipendente</option></select></label>
      <div class="due-colonne">
        <label class="campo"><span>Criterio: soglia %</span><input name="soglia" type="number" min="1" max="100" required value="${pr.criterio.soglia}" inputmode="numeric"></label>
        <label class="campo"><span>per sedute consecutive</span><input name="sedute" type="number" min="1" max="10" required value="${pr.criterio.sedute}" inputmode="numeric"></label>
      </div>
      <label class="campo"><span>Prove per seduta (facoltativo)</span><input name="prove" type="number" min="1" max="1000" value="${pr.prove || ''}" inputmode="numeric">
        <div class="aiuto">Se è sempre lo stesso numero (es. 10), in seduta vedi a che punto sei.</div></label>
      <label class="campo"><span>Registrazione di eventi (facoltativo)</span>
        <input name="evento" maxlength="85" value="${pr.evento ? pr.evento.join(' / ') : ''}" placeholder="es. Pipì / No pipì">
        <div class="aiuto">Due etichette separate da “/”: compaiono due tasti in più con un contatore.</div></label>
      ${!esistente ? h`<label class="campo"><span>Primo STO</span><textarea name="sto" maxlength="1000" placeholder="es. TACT oggetti mix — divano, porta, frigo, sedia"></textarea></label>` : ''}
      <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">${esistente ? 'Salva' : 'Crea'}</button></div>
    </form>`, { invia: function (f) { return Object.fromEntries(new FormData(f.querySelector('form'))); } });
    if (!dati) return null;
    var evento = String(dati.evento || '').split('/').map(function (x) { return x.trim(); }).filter(Boolean);
    var out = Object.assign({}, pr, {
      id: pr.id || Modello.nuovoId('pr'),
      nome: dati.nome.trim(), area: dati.area.trim() || null, strategia: dati.strategia,
      criterio: { soglia: Number(dati.soglia), sedute: Number(dati.sedute) },
      prove: dati.prove ? Number(dati.prove) : null,
      evento: evento.length === 2 ? evento : null,
      scala: pr.scala || 'conteggio',
    });
    if (!esistente && String(dati.sto || '').trim()) {
      out.sto = [{ id: Modello.nuovoId('st'), testo: dati.sto.trim(), stato: 'attivo', inizio: Modello.oggiISO(), fine: null }];
    }
    return out;
  }

  async function salva(paz, pid, messaggio) {
    try {
      await Sync.salvaPaziente(paz);
      if (messaggio) UI.avviso(messaggio, 'ok');
    } catch (e) {
      if (e && e.codice === 'conflitto') {
        UI.avviso('Nel frattempo qualcuno ha modificato questo paziente: ho ricaricato la versione aggiornata, rifai la modifica.', 'errore', 8000);
        await Sync.scaricaPaziente(pid, true);
      } else App.errore(e);
    }
    App.ridisegna(true);
  }

  async function chiediTestoSTO(titolo, iniziale, suggerimento) {
    return UI.apriFoglio(h`<form><h2>${titolo}</h2>
      ${suggerimento ? h`<p class="sotto piccolo">${suggerimento}</p>` : ''}
      <label class="campo"><span>Obiettivo a breve termine</span><textarea name="t" required maxlength="1000">${iniziale || ''}</textarea></label>
      <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">Salva</button></div></form>`,
      { invia: function (f) { return f.querySelector('textarea').value.trim(); } });
  }

  App.vista('programma', {
    sezione: 'pazienti',
    titolo: function (p) { return p._titolo || 'Programma'; },
    render: async function (p) {
      var d = await PazienteVista.carica(p.id);
      if (d.errore) return h`<div class="vuoto">${d.errore.message}</div>`;
      var paz = d.paz;
      var pr = Modello.programma(paz, p.prid);
      if (!pr) return h`<div class="vuoto">Programma non trovato. <a href="#/p/${p.id}">Torna al paziente</a></div>`;
      p._titolo = pr.nome;
      var permessi = (Sync.stato().io || {}).permessi || {};
      var r = Modello.riepilogoProgramma(paz, d.sedute, pr);
      var tutte = Modello.misure(paz, d.sedute, pr.id);
      var soloSTO = p.vista !== 'tutto' && r.sto;
      var serie = soloSTO ? r.serie : tutte;
      var criteri = (pr.sto || []).map(function (s) {
        return Modello.criterio(Modello.misure(paz, d.sedute, pr.id, s.id), pr.criterio).raggiunto;
      }).filter(Boolean);
      var pianificati = (pr.sto || []).filter(function (s) { return s.stato === 'pianificato'; });

      return h`
        <a class="bottone fantasma piccolo" href="#/p/${p.id}" style="margin-left:-10px">${UI.icona('indietro')} ${paz.etichetta || paz.codice}</a>
        <h1>${pr.nome}</h1>
        <p class="sotto" style="margin-top:-8px">${[pr.area, pr.strategia === 'timedelay' ? 'Time delay' : 'Indipendente',
          'criterio ' + pr.criterio.soglia + '% per ' + pr.criterio.sedute + ' sedute', pr.prove ? pr.prove + ' prove' : ''].filter(Boolean).join(' · ')}
          ${pr.stato === 'terminato' ? h` <span class="pill">terminato</span>` : ''}</p>

        ${r.sto ? h`<div class="scheda imbottita">
          <div class="sotto piccolo">STO in corso dal ${Modello.formatoData(r.sto.inizio)}</div>
          <div style="font-weight:650;margin:4px 0 8px">${r.sto.testo}</div>
          ${r.criterio.raggiunto ? h`<div class="banda attenzione" style="margin-bottom:0">${UI.icona('bandiera')}<div>
              <b>Criterio raggiunto il ${Modello.formatoData(r.criterio.raggiunto, true)}.</b>
              ${permessi.programmi ? h`<div class="bottoni" style="margin-top:10px"><button class="bottone arancio" data-azione="chiudi-sto">Chiudi lo STO e passa al prossimo</button></div>` : ' Segnalalo a chi segue il bambino.'}
            </div></div>`
          : r.serie.length ? h`<div class="piccolo">${r.criterio.striscia ? h`<b>${r.criterio.striscia}</b> ${r.criterio.striscia === 1 ? 'seduta' : 'sedute'} di fila sopra il ${r.criterio.soglia}%: ${r.criterio.mancano === 1 ? 'ne manca 1' : 'ne mancano ' + r.criterio.mancano}.`
              : 'Ultima seduta sotto soglia.'}${r.criterio.repertorio ? ' La prima seduta era già sopra soglia (repertorio).' : ''}</div>`
          : h`<div class="piccolo sotto">Ancora nessuna seduta su questo STO.</div>`}
        </div>` : h`<div class="banda info">${UI.icona('avviso')}<div>Nessuno STO in corso: in seduta questo programma non si può registrare.
            ${permessi.programmi ? h`<div class="bottoni" style="margin-top:10px"><button class="bottone primario piccolo" data-azione="nuovo-sto">${UI.icona('piu')} Nuovo STO</button></div>` : ''}</div></div>`}

        <div class="scheda imbottita" style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h3 style="margin:0">Andamento</h3>
            ${r.sto ? h`<div class="tab" style="margin:0;flex:0 0 auto">
              <button class="${soloSTO ? 'attiva' : ''}" data-azione="vista" data-v="sto">STO</button>
              <button class="${soloSTO ? '' : 'attiva'}" data-azione="vista" data-v="tutto">Tutto</button></div>` : ''}
          </div>
          ${Grafici.programma(serie, { soglia: pr.criterio.soglia, criteri: criteri })}
        </div>

        <h2>Obiettivi a breve termine</h2>
        <ul class="lista scheda">${(pr.sto || []).slice().reverse().map(function (s) {
          var st = STATI_STO[s.stato] || ['', s.stato];
          var n = Modello.misure(paz, d.sedute, pr.id, s.id).length;
          return h`<li><div class="riga">
            <span class="corpo"><span class="dettaglio a-capo" style="color:var(--testo)">${s.testo}</span>
              <span class="dettaglio">${s.inizio ? Modello.formatoData(s.inizio) : ''}${s.fine ? ' → ' + Modello.formatoData(s.fine) : ''} · ${n} ${n === 1 ? 'seduta' : 'sedute'}</span></span>
            <span class="fine"><span class="pill ${st[0]}">${st[1]}</span>
              ${permessi.programmi ? h`<button class="icona-bottone" style="margin-top:6px" data-azione="modifica-sto" data-sto="${s.id}" aria-label="Modifica STO">${UI.icona('matita')}</button>` : ''}</span>
          </div></li>`;
        })}</ul>
        ${permessi.programmi ? h`<div class="bottoni" style="margin-top:12px">
          ${r.sto ? h`<button class="bottone" data-azione="nuovo-sto">${UI.icona('piu')} Nuovo STO</button>` : ''}
          <button class="bottone" data-azione="modifica">${UI.icona('matita')} Modifica programma</button>
          <button class="bottone ${pr.stato === 'terminato' ? '' : 'pericolo'}" data-azione="termina">${pr.stato === 'terminato' ? 'Riattiva' : 'Termina programma'}</button>
        </div>` : ''}

        <h2>Sedute</h2>
        <div class="scheda" style="overflow-x:auto"><table class="tabella">
          <thead><tr><th>Data</th><th class="num">${UI.grezzo('<span style="color:var(--v)">V</span>')}</th><th class="num">P</th><th class="num">X</th><th class="num">%</th><th>Decisione</th></tr></thead>
          <tbody>${tutte.slice().reverse().map(function (m) {
            return h`<tr><td>${Modello.formatoData(m.data)}</td>
              ${m.percentuale ? h`<td class="num" colspan="3" style="text-align:center">in percentuale</td>` : h`<td class="num">${m.v}</td><td class="num">${m.p}</td><td class="num">${m.x}</td>`}
              <td class="num"><b class="pct ${UI.classePct(m.pct, pr.criterio.soglia)}">${m.pct == null ? '—' : m.pct}</b></td>
              <td class="piccolo">${criteri.indexOf(m.data) >= 0 ? h`<span class="pill arancio">criterio</span> ` : ''}${m.decisioni.join(', ')}</td></tr>`;
          })}</tbody></table></div>
        ${pianificati.length ? h`<p class="sotto piccolo" style="margin-top:12px">STO già pianificati: ${pianificati.map(function (s) { return s.testo; }).join(' · ')}</p>` : ''}`;
    },
    azioni: {
      vista: function (b, e, p) { App.vai('#/p/' + p.id + '/prog/' + p.prid + (b.getAttribute('data-v') === 'tutto' ? '?vista=tutto' : ''), true); },
      'chiudi-sto': async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var pr = Modello.programma(paz, p.prid);
        var sto = Modello.stoAttivo(pr);
        var sedute = await Sync.sedute(p.id);
        var raggiunto = Modello.criterio(Modello.misure(paz, sedute, pr.id, sto.id), pr.criterio).raggiunto;
        var prossimo = (pr.sto || []).find(function (s) { return s.stato === 'pianificato'; });
        var testo = await chiediTestoSTO('Prossimo STO', prossimo ? prossimo.testo : '',
          'Lo STO attuale viene chiuso con criterio raggiunto il ' + Modello.formatoData(raggiunto) + '.' + (prossimo ? ' Proposto quello già pianificato.' : ''));
        if (!testo) return;
        sto.stato = 'criterio';
        sto.fine = raggiunto;
        if (prossimo && prossimo.testo === testo) {
          prossimo.stato = 'attivo'; prossimo.inizio = Modello.oggiISO();
        } else {
          pr.sto.push({ id: Modello.nuovoId('st'), testo: testo, stato: 'attivo', inizio: Modello.oggiISO(), fine: null });
        }
        await salva(paz, p.id, 'STO chiuso: nuovo obiettivo in corso');
      },
      'nuovo-sto': async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var pr = Modello.programma(paz, p.prid);
        var attivo = Modello.stoAttivo(pr);
        var testo = await chiediTestoSTO('Nuovo STO', '', attivo ? 'Lo STO in corso verrà chiuso (senza criterio) e sostituito da questo.' : '');
        if (!testo) return;
        if (attivo) { attivo.stato = 'chiuso'; attivo.fine = Modello.oggiISO(); }
        pr.sto = (pr.sto || []).concat([{ id: Modello.nuovoId('st'), testo: testo, stato: 'attivo', inizio: Modello.oggiISO(), fine: null }]);
        if (pr.stato === 'terminato') pr.stato = 'attivo';
        await salva(paz, p.id, 'Nuovo STO in corso');
      },
      'modifica-sto': async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var pr = Modello.programma(paz, p.prid);
        var sto = pr.sto.find(function (s) { return s.id === b.getAttribute('data-sto'); });
        var testo = await chiediTestoSTO('Modifica STO', sto.testo);
        if (!testo || testo === sto.testo) return;
        sto.testo = testo;
        await salva(paz, p.id, 'STO aggiornato');
      },
      modifica: async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var i = paz.programmi.findIndex(function (x) { return x.id === p.prid; });
        var nuovo = await modulo(paz.programmi[i], paz);
        if (!nuovo) return;
        paz.programmi[i] = nuovo;
        await salva(paz, p.id, 'Programma aggiornato');
      },
      termina: async function (b, e, p) {
        var paz = await Sync.paziente(p.id);
        var pr = Modello.programma(paz, p.prid);
        var terminare = pr.stato !== 'terminato';
        if (terminare && !await UI.conferma('Terminare il programma?', 'Non comparirà più in seduta. Lo storico resta e puoi riattivarlo quando vuoi.', { ok: 'Termina' })) return;
        pr.stato = terminare ? 'terminato' : 'attivo';
        await salva(paz, p.id, terminare ? 'Programma terminato' : 'Programma riattivato');
      },
    },
  });

  window.Programmi = { modulo: modulo };
})();
