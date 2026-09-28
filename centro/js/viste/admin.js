/* Amministrazione: persone e accessi, import dai Numbers, manutenzione */
(function () {
  'use strict';
  var h = UI.html;

  var RUOLI = {
    admin: 'Admin — tutto, compresi accessi e import',
    professionista: 'Professionista — sedute, programmi, materiali',
    tirocinante: 'Tirocinante — registra sedute e vede i dati',
  };

  async function modificaUtente(accessi, email) {
    var nuovo = !email;
    var u = nuovo ? { ruolo: 'tirocinante', pazienti: [], attivo: true, scadenza: null, nome: '' } : accessi.utenti[email];
    var pazienti = (Sync.stato().elenco || []).slice().sort(function (a, b) {
      return String(a.aula + a.etichetta).localeCompare(b.aula + b.etichetta, 'it', { numeric: true });
    });
    var tutti = u.pazienti === '*';
    var assegnati = {};
    if (Array.isArray(u.pazienti)) u.pazienti.forEach(function (id) { assegnati[id] = true; });

    return UI.apriFoglio(h`<form>
      <h2>${nuovo ? 'Aggiungi una persona' : u.nome || email}</h2>
      ${nuovo ? h`<label class="campo"><span>Email Google</span><input name="email" type="email" required autocomplete="off" placeholder="nome@centrotice.it o Gmail personale"></label>`
              : h`<p class="sotto" style="margin-top:-6px">${email}</p>`}
      <label class="campo"><span>Nome da mostrare</span><input name="nome" maxlength="60" value="${u.nome || ''}" placeholder="es. Eli"></label>
      <label class="campo"><span>Ruolo</span><select name="ruolo">${Object.keys(RUOLI).map(function (r) {
        return h`<option value="${r}" ${u.ruolo === r ? 'selected' : ''}>${RUOLI[r]}</option>`;
      })}</select></label>
      <label class="campo"><span>Accesso fino al (facoltativo)</span><input name="scadenza" type="date" value="${u.scadenza || ''}">
        <div class="aiuto">Per i tirocini: dopo questa data l'accesso si chiude da solo.</div></label>
      <label class="interruttore"><span>Attivo</span><input type="checkbox" name="attivo" ${u.attivo !== false ? 'checked' : ''} style="width:24px;height:24px"></label>
      <h3>Bambini assegnati</h3>
      <label class="interruttore"><span>Tutti, anche quelli futuri</span><input type="checkbox" name="tutti" ${tutti ? 'checked' : ''} style="width:24px;height:24px"></label>
      <ul class="lista scheda" style="max-height:260px;overflow:auto">${pazienti.map(function (p) {
        return h`<li><label class="riga" style="min-height:48px"><input type="checkbox" name="p" value="${p.id}" ${assegnati[p.id] ? 'checked' : ''} style="width:22px;height:22px">
          <span class="corpo"><span class="titolo">${p.etichetta || p.codice}</span><span class="dettaglio">${p.codice}${p.aula ? ' · ' + p.aula : ''}</span></span></label></li>`;
      })}</ul>
      <p class="sotto piccolo">Gli admin vedono comunque tutti i bambini.</p>
      <div class="bottoni" style="margin-top:14px">
        ${!nuovo ? h`<button type="button" class="bottone pericolo" data-foglio="rimuovi">Rimuovi</button>` : ''}
        <button type="button" class="bottone" data-foglio="chiudi">Annulla</button>
        <button class="bottone primario" type="submit">Salva</button>
      </div></form>`, {
      rimuovi: function () { return { rimuovi: true }; },
      invia: function (f) {
        var form = f.querySelector('form');
        var fd = new FormData(form);
        return {
          email: nuovo ? String(fd.get('email')).trim().toLowerCase() : email,
          voce: {
            nome: String(fd.get('nome') || '').trim(),
            ruolo: String(fd.get('ruolo')),
            scadenza: String(fd.get('scadenza') || '') || null,
            attivo: !!fd.get('attivo'),
            pazienti: fd.get('tutti') ? '*' : fd.getAll('p').map(String),
          },
        };
      },
    });
  }

  // --- Import ------------------------------------------------------------------
  var inImport = null;

  function applicaConferme(pacchetto, prove) {
    var pk = JSON.parse(JSON.stringify(pacchetto));
    var perProgramma = {};
    pk.paziente.programmi.forEach(function (pr) {
      if (prove[pr.id] != null) pr.prove = prove[pr.id];
      perProgramma[pr.id] = pr;
    });
    pk.sedute.forEach(function (s) {
      s.voci.forEach(function (v) {
        var pr = perProgramma[v.programmaId];
        if (v.x == null && pr && pr.scala !== 'percentuale' && pr.prove) {
          v.x = Math.max(0, pr.prove - (v.v || 0) - (v.p || 0));
        }
      });
    });
    return pk;
  }

  function vistaImport() {
    if (!inImport) {
      return h`<div class="scheda imbottita">
        <p>Carica il file prodotto da <code>tools/import_numbers.py</code> a partire dal quaderno Numbers del bambino.</p>
        <label class="bottone primario">${UI.icona('carica')} Scegli il file import-….json<input type="file" accept=".json,application/json" data-cambio="scegli-import" hidden></label>
      </div>`;
    }
    var pk = inImport.pacchetto;
    var perArea = {};
    pk.paziente.programmi.forEach(function (pr) { var a = pr.area || 'Terminati'; perArea[a] = (perArea[a] || 0) + 1; });
    var giaPresente = (Sync.stato().elenco || []).find(function (p) { return p.codice === pk.paziente.codice; });
    return h`<form data-form="importa">
      <div class="scheda imbottita">
        <p class="sotto piccolo" style="margin-top:0">Da ${pk.origine.file}</p>
        <div class="due-colonne">
          <label class="campo"><span>Codice</span><input name="codice" required maxlength="30" value="${pk.paziente.codice}"></label>
          <label class="campo"><span>Come mostrarlo</span><input name="etichetta" maxlength="60" value="${pk.paziente.etichetta}"></label>
        </div>
        <label class="campo"><span>Aula</span><input name="aula" maxlength="60" value="${pk.paziente.aula || ''}"></label>
        ${giaPresente ? h`<div class="banda attenzione">Esiste già un paziente con codice ${giaPresente.codice}: se è lo stesso bambino, non importarlo due volte.</div>` : ''}
        <p><b>${pk.paziente.programmi.length}</b> programmi (${Object.keys(perArea).map(function (a) { return a + ' ' + perArea[a]; }).join(', ')}),
          <b>${pk.sedute.length}</b> sedute, <b>${pk.paziente.learnUnitStoriche.length}</b> giorni di learn unit.</p>
      </div>
      ${pk.daConfermare.length ? h`<h2>Prove per seduta</h2>
        <p class="sotto">I fogli non scrivono quante prove c'erano. Ho dedotto questi valori: correggi quelli sbagliati. Servono a calcolare le percentuali.</p>
        <ul class="lista scheda">${pk.daConfermare.map(function (d) {
          return h`<li><div class="riga">
            <span class="corpo"><span class="titolo">${d.certo ? '' : UI.icona('avviso')} ${d.programma}</span>
              <span class="dettaglio a-capo">${d.motivo}</span></span>
            <span class="fine"><input type="number" min="1" max="1000" name="prove-${d.programmaId}" value="${d.proposta}" inputmode="numeric" style="width:78px;min-height:42px;border-radius:10px;border:1px solid var(--bordo);padding:6px;font-size:16px;background:var(--superficie)"></span>
          </div></li>`;
        })}</ul>` : ''}
      ${pk.avvisi.length ? h`<h2>Da controllare</h2><ul class="lista scheda">${pk.avvisi.map(function (a) {
        return h`<li><div class="riga" style="min-height:0"><span class="corpo"><span class="dettaglio a-capo" style="color:var(--testo)">${a}</span></span></div></li>`;
      })}</ul>` : ''}
      <div class="bottoni" style="margin-top:16px">
        <button type="button" class="bottone" data-azione="annulla-import">Annulla</button>
        <button class="bottone primario" type="submit">${UI.icona('carica')} Importa</button>
      </div>
    </form>`;
  }

  App.vista('admin', {
    sezione: 'admin',
    titolo: function () { return 'Amministrazione'; },
    render: async function (p) {
      var io = Sync.stato().io || {};
      if (!io.permessi || !io.permessi.gestisciAccessi) return h`<div class="vuoto">Questa sezione è riservata agli amministratori.</div>`;
      var tab = p.t || 'persone';
      var corpo;
      if (tab === 'persone') {
        var accessi;
        try { accessi = await Api.chiama('accessi.leggi'); }
        catch (e) { return h`<h1>Amministrazione</h1><div class="banda errore">${e.rete ? 'Serve la connessione per gestire gli accessi.' : e.message}</div>`; }
        p._accessi = accessi;
        var oggi = Modello.oggiISO();
        var emails = Object.keys(accessi.utenti).sort(function (a, b) {
          var ua = accessi.utenti[a], ub = accessi.utenti[b];
          var ord = { admin: 0, professionista: 1, tirocinante: 2 };
          return (ord[ua.ruolo] - ord[ub.ruolo]) || String(ua.nome || a).localeCompare(ub.nome || b, 'it');
        });
        corpo = h`
          <div class="banda info">${UI.icona('lucchetto')}<div>Il custode gira con l'account <b>${accessi.proprietario}</b>, che è sempre admin.
            Chi non è in questo elenco non può entrare. Chi è in elenco vede solo i bambini assegnati.</div></div>
          <button class="bottone primario largo" data-azione="aggiungi">${UI.icona('piu')} Aggiungi una persona</button>
          <ul class="lista scheda" style="margin-top:12px">${emails.map(function (e) {
            var u = accessi.utenti[e];
            var scaduto = u.scadenza && oggi > u.scadenza;
            var quanti = u.pazienti === '*' ? 'tutti i bambini' : (u.pazienti || []).length + ((u.pazienti || []).length === 1 ? ' bambino' : ' bambini');
            return h`<li><button class="riga" data-azione="modifica" data-email="${e}">
              <span class="avatar">${UI.iniziali(u.nome || e)}</span>
              <span class="corpo"><span class="titolo">${u.nome || e}</span>
                <span class="dettaglio">${e}</span>
                <span class="dettaglio">${u.ruolo === 'admin' ? 'tutti i bambini' : quanti}${u.scadenza ? ' · fino al ' + Modello.formatoData(u.scadenza) : ''}</span></span>
              <span class="fine"><span class="pill ${u.ruolo === 'admin' ? 'arancio' : u.ruolo === 'professionista' ? 'acqua' : ''}">${u.ruolo}</span>
                ${!u.attivo ? h`<br><span class="pill x">disattivato</span>` : scaduto ? h`<br><span class="pill x">scaduto</span>` : ''}</span>
            </button></li>`;
          })}</ul>
          ${!emails.length ? h`<p class="sotto">Ancora nessuno oltre a te.</p>` : ''}`;
      } else if (tab === 'importa') {
        corpo = vistaImport();
      } else {
        corpo = h`<div class="scheda imbottita">
          <h3 style="margin-top:0">Ricostruisci le cache</h3>
          <p class="sotto">Il custode tiene un riepilogo dei pazienti e delle sedute per rispondere in fretta. Se qualcuno ha modificato a mano i file nel Drive, ricostruiscilo dai file delle sedute.</p>
          <button class="bottone" data-azione="ricostruisci">${UI.icona('aggiorna')} Ricostruisci</button></div>`;
      }
      return h`<h1>Amministrazione</h1>
        <div class="tab">
          <button class="${tab === 'persone' ? 'attiva' : ''}" data-azione="tab" data-tab="persone">Persone</button>
          <button class="${tab === 'importa' ? 'attiva' : ''}" data-azione="tab" data-tab="importa">Importa</button>
          <button class="${tab === 'manutenzione' ? 'attiva' : ''}" data-azione="tab" data-tab="manutenzione">Manutenzione</button>
        </div>${corpo}`;
    },
    azioni: {
      tab: function (b) { App.vai('#/admin?t=' + b.getAttribute('data-tab'), true); },
      aggiungi: function (b, e, p) { return this.modifica(null, e, p); },
      modifica: async function (b, e, p) {
        var accessi = p._accessi;
        var email = b ? b.getAttribute('data-email') : null;
        var r = await modificaUtente(accessi, email);
        if (!r) return;
        var copia = JSON.parse(JSON.stringify(accessi));
        if (r.rimuovi) {
          if (!await UI.conferma('Rimuovere ' + email + '?', 'Non potrà più entrare. Le sedute che ha registrato restano.', { ok: 'Rimuovi', pericolo: true })) return;
          delete copia.utenti[email];
        } else {
          if (!email && copia.utenti[r.email]) return UI.avviso('Questa email è già in elenco.', 'errore');
          copia.utenti[r.email] = r.voce;
        }
        try {
          await Api.chiama('accessi.salva', { accessi: { utenti: copia.utenti }, versioneBase: accessi.version || 0 });
          UI.avviso('Accessi aggiornati', 'ok');
        } catch (err) {
          if (err.codice === 'conflitto') UI.avviso('Un altro admin ha appena modificato gli accessi: ho ricaricato, rifai la modifica.', 'errore', 7000);
          else App.errore(err);
        }
        App.ridisegna();
      },
      'scegli-import': async function (input) {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        try {
          var pk = JSON.parse(await UI.leggiFile(file));
          if (pk.formato !== 'quaderno-tice-import') throw new Error('Non è un file prodotto da import_numbers.py.');
          inImport = { pacchetto: pk };
        } catch (e) { return App.errore(e); }
        App.ridisegna();
      },
      'annulla-import': function () { inImport = null; App.ridisegna(); },
      importa: async function (form) {
        var fd = new FormData(form);
        var prove = {};
        inImport.pacchetto.daConfermare.forEach(function (d) { prove[d.programmaId] = Number(fd.get('prove-' + d.programmaId)) || d.proposta; });
        var pk = applicaConferme(inImport.pacchetto, prove);
        pk.paziente.codice = String(fd.get('codice')).trim();
        pk.paziente.etichetta = String(fd.get('etichetta') || '').trim();
        pk.paziente.aula = String(fd.get('aula') || '').trim();
        var bottone = form.querySelector('[type=submit]');
        bottone.disabled = true; bottone.textContent = 'Importo…';
        try {
          await Api.chiama('paziente.importa', { pacchetto: pk });
          inImport = null;
          UI.avviso('Importato: ' + (pk.paziente.etichetta || pk.paziente.codice), 'ok');
          await Sync.esegui();
          App.vai('#/p/' + pk.paziente.id + '?t=dati');
        } catch (e) {
          bottone.disabled = false; bottone.textContent = 'Importa';
          App.errore(e);
        }
      },
      ricostruisci: async function (b) {
        b.disabled = true;
        try {
          var r = await Api.chiama('manutenzione.ricostruisci', {});
          UI.avviso('Cache ricostruite per ' + r.ricostruiti + ' pazienti', 'ok');
        } catch (e) { App.errore(e); }
        b.disabled = false;
      },
    },
  });

  window.AdminImport = { applicaConferme: applicaConferme };
})();
