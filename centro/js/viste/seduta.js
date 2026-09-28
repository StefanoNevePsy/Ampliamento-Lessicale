/* Registrazione di una seduta: sostituisce il foglio cartaceo */
(function () {
  'use strict';
  var h = UI.html;

  var S = null;           // stato della seduta aperta
  var timerSalva = null;
  var timerOrologio = null;

  function voce(prId) {
    var pr = Modello.programma(S.paz, prId);
    var corrente = Modello.stoCorrente(pr);
    return S.bozza.voci[prId] || (S.bozza.voci[prId] = {
      programmaId: prId, stoId: corrente ? corrente.sto.id : null, strategia: pr.strategia,
      v: 0, p: 0, x: 0, sequenza: '', eventi: pr.evento ? [0, 0] : null, decisione: null, nota: '',
    });
  }
  function haDati(v) { return v && (v.v + v.p + v.x > 0 || (v.eventi && v.eventi[0] + v.eventi[1] > 0)); }

  function salvaPresto() {
    clearTimeout(timerSalva);
    timerSalva = setTimeout(salvaOra, 400);
  }
  function salvaOra() {
    clearTimeout(timerSalva);
    if (!S || !S.toccata) return Promise.resolve();
    return Sync.salvaBozza(S.bozza);
  }
  function suVisibilita() { if (document.visibilityState === 'hidden') salvaOra(); }

  function programmiSeduta(paz) {
    return (paz.programmi || []).filter(function (p) { return p.stato === 'attivo'; })
      .sort(function (a, b) {
        var aree = PazienteVista.AREE_NOTE;
        var ia = aree.indexOf(a.area), ib = aree.indexOf(b.area);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a.nome).localeCompare(b.nome, 'it');
      });
  }

  // Previsione: con i dati di oggi il criterio verrebbe raggiunto?
  function previsione(pr, v) {
    if (!v || !v.stoId || v.v + v.p + v.x === 0) return null;
    var serie = Modello.misure(S.paz, S.sedute.filter(function (s) { return s.id !== S.bozza.id && s.data !== S.bozza.data; }), pr.id, v.stoId);
    var pctOggi = Math.round(100 * v.v / (v.v + v.p + v.x));
    var c = Modello.criterio(serie.concat([{ data: S.bozza.data, pct: pctOggi }]), pr.criterio);
    if (Modello.criterio(serie, pr.criterio).raggiunto) return null;
    if (c.raggiunto === S.bozza.data) return 'Con questi dati oggi raggiunge il criterio.';
    return null;
  }

  function scheda(pr) {
    var corrente = Modello.stoCorrente(pr);
    var sto = corrente && corrente.sto;
    var v = S.bozza.voci[pr.id];
    var aperta = S.aperte[pr.id];
    var tot = v ? v.v + v.p + v.x : 0;
    var pct = tot ? Math.round(100 * v.v / tot) : null;
    if (!sto) {
      return h`<div class="prog" data-prog="${pr.id}"><div class="prog-testa"><span class="corpo">
        <span class="nome">${pr.nome}</span><span class="sto"><i>Nessuno STO in corso: aprine uno dalla scheda del programma.</i></span></span></div></div>`;
    }
    var prev = previsione(pr, v);
    return h`<div class="prog ${haDati(v) ? 'con-dati' : ''}" data-prog="${pr.id}">
      <button class="prog-testa" data-azione="apri" data-pr="${pr.id}" aria-expanded="${aperta ? 'true' : 'false'}">
        <span class="corpo">
          <span class="nome">${pr.nome} ${pr.strategia === 'timedelay' ? h`<span class="pill">T/D</span>` : ''}
            ${corrente.mantenimento ? h`<span class="pill arancio" title="Lo STO ha gia' raggiunto il criterio: si registra come mantenimento finche' non si apre il prossimo">mantenimento</span>` : ''}</span>
          <span class="sto">${sto.testo}</span>
        </span>
        <span class="conto" data-conto>
          ${tot ? h`<b class="pct ${UI.classePct(pct, pr.criterio.soglia)}">${pct}%</b><br><span class="piccolo sotto">${v.v}/${tot}${pr.prove ? ' di ' + pr.prove : ''}</span>`
                : h`<span class="piccolo sotto">${pr.prove ? pr.prove + ' prove' : 'tocca per iniziare'}</span>`}
        </span>
      </button>
      ${aperta ? h`<div class="prog-corpo">
        <div class="tasti">
          <button class="tasto v" data-azione="segna" data-pr="${pr.id}" data-r="V">✓<small>Corretta</small></button>
          <button class="tasto p" data-azione="segna" data-pr="${pr.id}" data-r="P">P<small>${pr.nomeP || (pr.strategia === 'timedelay' ? 'Promptata' : 'Con aiuto')}</small></button>
          <button class="tasto x" data-azione="segna" data-pr="${pr.id}" data-r="X">✗<small>Errata</small></button>
        </div>
        ${pr.evento ? h`<div class="tasti due" style="margin-top:8px">
          <button class="tasto e" data-azione="evento" data-pr="${pr.id}" data-i="0">${pr.evento[0]} <small data-ev="0">${v && v.eventi ? v.eventi[0] : 0}</small></button>
          <button class="tasto e" data-azione="evento" data-pr="${pr.id}" data-i="1">${pr.evento[1]} <small data-ev="1">${v && v.eventi ? v.eventi[1] : 0}</small></button>
        </div>` : ''}
        <div class="sotto-tasti">
          <div class="sequenza" data-seq aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map(function (c) { return h`<i class="${c}"></i>`; })}</div>
          <button class="icona-bottone" data-azione="annulla" data-pr="${pr.id}" aria-label="Annulla l'ultima">${UI.icona('annulla')}</button>
          <button class="icona-bottone" data-azione="nota-voce" data-pr="${pr.id}" aria-label="Nota">${UI.icona('nota')}</button>
        </div>
        <p class="avviso-criterio" data-prev ${prev ? '' : 'hidden'}>${UI.icona('bandiera')} ${prev || ''}</p>
        ${v && v.nota ? h`<p class="piccolo sotto" style="margin:8px 0 0">📝 ${v.nota}</p>` : ''}
      </div>` : ''}
    </div>`;
  }

  function riassunto() {
    var corrette = 0, prove = 0, programmi = 0;
    Object.keys(S.bozza.voci).forEach(function (k) {
      var v = S.bozza.voci[k];
      if (!haDati(v)) return;
      programmi++; corrette += v.v; prove += v.v + v.p + v.x;
    });
    return { corrette: corrette, prove: prove, programmi: programmi };
  }

  function testoPiede() {
    var r = riassunto();
    if (!r.programmi) return 'Nessuna risposta ancora';
    return '<b>' + r.prove + '</b> prove · <b>' + r.corrette + '</b> corrette · ' + r.programmi + (r.programmi === 1 ? ' programma' : ' programmi');
  }

  // Aggiorna solo la scheda toccata e il piede: niente salti dello scorrimento
  function aggiornaScheda(prId) {
    var el = document.querySelector('[data-prog="' + prId + '"]');
    if (el) el.outerHTML = String(scheda(Modello.programma(S.paz, prId)));
    var piede = document.getElementById('piede-riassunto');
    if (piede) piede.innerHTML = testoPiede();
  }

  function orologio() {
    var el = document.getElementById('cronometro');
    if (!el || !S) return;
    var min = Math.max(0, Math.round((Date.now() - new Date(S.bozza.inizio).getTime()) / 60000));
    el.textContent = S.modifica ? 'Correzione' : (min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min');
  }

  App.vista('seduta', {
    sezione: 'pazienti',
    senzaNav: true,
    largo: true,
    nonRidisegnare: true,
    titolo: function (p) { return p._titolo || 'Seduta'; },
    render: async function (p) {
      var d = await PazienteVista.carica(p.id);
      if (d.errore) return h`<div class="vuoto">${d.errore.message} <a href="#/pazienti">Pazienti</a></div>`;
      var io = Sync.stato().io || {};
      var bozza = await Sync.bozza(p.id);
      var modifica = null;
      if (p.modifica) {
        modifica = d.sedute.find(function (s) { return s.id === p.modifica; });
        if (!modifica) return h`<div class="vuoto">Seduta non trovata.</div>`;
        if (bozza && bozza.modifica !== p.modifica) {
          return h`<div class="banda attenzione">C'è una seduta in corso per questo paziente: terminala o annullala prima di correggerne un'altra.</div>
            <a class="bottone" href="#/p/${p.id}/seduta">Vai alla seduta in corso</a>`;
        }
      }
      if (!bozza) {
        var base = modifica ? JSON.parse(JSON.stringify(modifica)) : null;
        bozza = {
          pazienteId: p.id,
          id: base ? base.id : Modello.nuovoId('sd'),
          modifica: base ? base.id : null,
          data: base ? base.data : Modello.oggiISO(),
          inizio: base ? base.inizio : new Date().toISOString(),
          operatoreNome: base ? base.operatoreNome : (io.nome || ''),
          coOperatori: base ? (base.coOperatori || []) : [],
          nota: base ? base.nota : '',
          voci: {},
          fonte: base ? base.fonte : 'app',
        };
        if (base) (base.voci || []).forEach(function (v) {
          bozza.voci[v.programmaId] = Object.assign({ sequenza: '', eventi: null, nota: '' }, v, {
            v: Number(v.v) || 0, p: Number(v.p) || 0, x: Number(v.x) || 0, sequenza: v.sequenza || '',
          });
        });
      }
      S = { paz: d.paz, sedute: d.sedute, bozza: bozza, aperte: {}, toccata: !!modifica, modifica: !!bozza.modifica };
      Object.keys(bozza.voci).forEach(function (k) { if (haDati(bozza.voci[k])) S.aperte[k] = true; });
      var programmi = programmiSeduta(d.paz);
      if (programmi.length === 1) S.aperte[programmi[0].id] = true;
      p._titolo = d.paz.etichetta || d.paz.codice;

      return h`
        <div class="seduta-testa">
          <a class="icona-bottone" href="#/p/${p.id}" aria-label="Indietro (la seduta resta salvata)">${UI.icona('indietro')}</a>
          <div class="corpo">
            <div style="font-weight:700">${S.modifica ? 'Correzione della seduta' : 'Seduta'} del ${Modello.formatoData(bozza.data, true)}</div>
            <div class="cronometro">${UI.icona('orologio')} <span id="cronometro"></span></div>
          </div>
          <button class="icona-bottone" data-azione="data" aria-label="Cambia data">${UI.icona('calendario')}</button>
        </div>
        ${bozza.data !== Modello.oggiISO() && !S.modifica ? h`<div class="banda attenzione">${UI.icona('calendario')}<div>Stai registrando una seduta del <b>${Modello.formatoData(bozza.data, true)}</b>, non di oggi.</div></div>` : ''}
        ${!programmi.length ? h`<div class="vuoto scheda imbottita">Nessun programma attivo.</div>` : ''}
        <div class="programmi-seduta">${programmi.map(scheda)}</div>
        <div class="bottoni" style="margin-top:16px">
          <button class="bottone fantasma" data-azione="annulla-seduta">${UI.icona('cestino')} ${S.modifica ? 'Annulla la correzione' : 'Annulla seduta'}</button>
        </div>
        <div class="piede-seduta">
          <div class="riassunto" id="piede-riassunto">${UI.grezzo(testoPiede())}</div>
          <button class="bottone primario" data-azione="termina">${UI.icona('spunta')} ${S.modifica ? 'Salva correzione' : 'Termina'}</button>
        </div>`;
    },
    dopo: function () {
      orologio();
      clearInterval(timerOrologio);
      timerOrologio = setInterval(orologio, 20000);
      document.addEventListener('visibilitychange', suVisibilita);
      window.addEventListener('pagehide', salvaOra);
    },
    lascia: function () {
      clearInterval(timerOrologio);
      document.removeEventListener('visibilitychange', suVisibilita);
      window.removeEventListener('pagehide', salvaOra);
      return salvaOra().then(function () { S = null; });
    },
    azioni: {
      apri: function (b) {
        var id = b.getAttribute('data-pr');
        S.aperte[id] = !S.aperte[id];
        aggiornaScheda(id);
      },
      segna: function (b) {
        var id = b.getAttribute('data-pr');
        var r = b.getAttribute('data-r');
        var v = voce(id);
        v[r.toLowerCase()] += 1;
        v.sequenza += r;
        S.toccata = true;
        if (navigator.vibrate) navigator.vibrate(r === 'V' ? 8 : 18);
        aggiornaScheda(id);
        salvaPresto();
      },
      evento: function (b) {
        var id = b.getAttribute('data-pr');
        var v = voce(id);
        var i = Number(b.getAttribute('data-i'));
        v.eventi[i] += 1;
        S.toccata = true;
        aggiornaScheda(id);
        salvaPresto();
      },
      annulla: function (b) {
        var id = b.getAttribute('data-pr');
        var v = S.bozza.voci[id];
        if (!v || !v.sequenza) return;
        var ultima = v.sequenza.slice(-1);
        v.sequenza = v.sequenza.slice(0, -1);
        v[ultima.toLowerCase()] = Math.max(0, v[ultima.toLowerCase()] - 1);
        aggiornaScheda(id);
        salvaPresto();
      },
      'nota-voce': async function (b) {
        var id = b.getAttribute('data-pr');
        var v = voce(id);
        var pr = Modello.programma(S.paz, id);
        var testo = await UI.apriFoglio(h`<form><h2>Nota · ${pr.nome}</h2>
          <label class="campo"><span>Osservazioni per questo programma</span><textarea name="nota" maxlength="2000">${v.nota}</textarea></label>
          <label class="campo"><span>Decisione (facoltativa)</span><input name="decisione" maxlength="200" value="${v.decisione || ''}" placeholder="es. Passa a 1&quot; T/D" list="decisioni"></label>
          <datalist id="decisioni"><option value="Passa a 0&quot; T/D"><option value="Passa a 1&quot; T/D"><option value="Probe"><option value="Stop"></datalist>
          <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">Salva</button></div></form>`,
          { invia: function (f) { return Object.fromEntries(new FormData(f.querySelector('form'))); } });
        if (!testo) return;
        v.nota = testo.nota.trim();
        v.decisione = testo.decisione.trim() || null;
        S.toccata = true;
        aggiornaScheda(id);
        salvaPresto();
      },
      data: async function () {
        var r = await UI.apriFoglio(h`<form><h2>Data della seduta</h2>
          <p class="sotto piccolo">Per registrare dal foglio una seduta di un altro giorno.</p>
          <label class="campo"><span>Data</span><input type="date" name="data" required value="${S.bozza.data}" max="${Modello.oggiISO()}"></label>
          <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">Conferma</button></div></form>`,
          { invia: function (f) { return f.querySelector('input').value; } });
        if (!r) return;
        S.bozza.data = r;
        S.toccata = true;
        await salvaOra();
        App.ridisegna(true);
      },
      'annulla-seduta': async function (b, e, p) {
        var r = riassunto();
        if (r.prove && !await UI.conferma(S.modifica ? 'Annullare la correzione?' : 'Annullare la seduta?',
          S.modifica ? 'La seduta resta com\'era.' : 'Le ' + r.prove + ' risposte registrate andranno perse.', { ok: S.modifica ? 'Annulla correzione' : 'Annulla seduta', pericolo: true })) return;
        S.toccata = false;
        clearTimeout(timerSalva);
        await Sync.eliminaBozza(p.id);
        App.vai('#/p/' + p.id);
      },
      termina: async function (b, e, p) {
        var r = riassunto();
        if (!r.programmi) { UI.avviso('Nessuna risposta registrata.', 'errore'); return; }
        var io = Sync.stato().io || {};
        var noti = {};
        S.sedute.forEach(function (s) { [s.operatoreNome].concat(s.coOperatori || []).forEach(function (n) { if (n && n !== io.nome) noti[n] = true; }); });
        var righe = Object.keys(S.bozza.voci).filter(function (k) { return haDati(S.bozza.voci[k]); }).map(function (k) {
          var v = S.bozza.voci[k]; var pr = Modello.programma(S.paz, k); var tot = v.v + v.p + v.x;
          return h`<tr><td>${pr.nome}</td><td class="num">${v.v}/${tot}</td><td class="num"><b class="pct ${UI.classePct(tot ? Math.round(100 * v.v / tot) : null, pr.criterio.soglia)}">${tot ? Math.round(100 * v.v / tot) + '%' : '—'}</b></td></tr>`;
        });
        var dati = await UI.apriFoglio(h`<form>
          <h2>${S.modifica ? 'Salvare la correzione?' : 'Fine seduta'}</h2>
          <table class="tabella" style="margin-bottom:14px"><tbody>${righe}</tbody>
            <tfoot><tr><th>Learn unit</th><th class="num">${r.corrette}/${r.prove}</th><th class="num">${r.prove ? Math.round(100 * r.corrette / r.prove) + '%' : ''}</th></tr></tfoot></table>
          <label class="campo"><span>Con chi hai condotto la seduta</span>
            <input name="co" value="${S.bozza.coOperatori.join(', ')}" placeholder="Nessuno, oppure nomi separati da virgola" list="colleghi" autocomplete="off">
            <datalist id="colleghi">${Object.keys(noti).map(function (n) { return h`<option value="${n}">`; })}</datalist></label>
          <label class="campo"><span>Note sulla seduta</span><textarea name="nota" maxlength="5000" placeholder="Comportamento, rinforzatori, osservazioni…">${S.bozza.nota}</textarea></label>
          <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Continua la seduta</button><button class="bottone primario" type="submit">${UI.icona('spunta')} Salva</button></div>
        </form>`, { invia: function (f) { return Object.fromEntries(new FormData(f.querySelector('form'))); } });
        if (!dati) return;
        var seduta = {
          schema: 1,
          id: S.bozza.id,
          pazienteId: p.id,
          data: S.bozza.data,
          inizio: S.bozza.inizio,
          fine: S.modifica ? (S.sedute.find(function (s) { return s.id === S.bozza.id; }) || {}).fine || null : new Date().toISOString(),
          operatoreNome: S.bozza.operatoreNome || io.nome || '',
          coOperatori: String(dati.co || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8),
          voci: Object.keys(S.bozza.voci).filter(function (k) { return haDati(S.bozza.voci[k]); }).map(function (k) {
            var v = S.bozza.voci[k];
            return { programmaId: v.programmaId, stoId: v.stoId, strategia: v.strategia, v: v.v, p: v.p, x: v.x,
              sequenza: v.sequenza || null, eventi: v.eventi, decisione: v.decisione || null, nota: v.nota || '' };
          }),
          nota: String(dati.nota || '').trim(),
          fonte: S.bozza.fonte || 'app',
          eliminata: false,
        };
        clearTimeout(timerSalva);
        S.toccata = false;
        await Sync.registraSeduta(seduta);
        UI.avviso(navigator.onLine ? 'Seduta salvata' : 'Seduta salvata sul dispositivo: verrà inviata appena torna la rete', 'ok');
        App.vai('#/p/' + p.id + (S && S.modifica ? '/sd/' + seduta.id : ''));
      },
    },
  });
})();
