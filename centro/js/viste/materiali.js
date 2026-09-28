/* Materiali condivisi: set scaricati una volta, aggiornati solo se cambiano */
(function () {
  'use strict';
  var h = UI.html;

  // --------------------------------------------------------------------------
  // Logica
  // --------------------------------------------------------------------------
  var M = (function () {
    var A = null;
    async function archivio() { return A || (A = await DB.materiali()); }

    function hashRiferiti(obj) {
      var trovati = {};
      (function visita(v) {
        if (typeof v === 'string') { var m = /^img:([a-f0-9]{64})$/.exec(v); if (m) trovati[m[1]] = true; }
        else if (Array.isArray(v)) v.forEach(visita);
        else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { visita(v[k]); });
      })(obj);
      return Object.keys(trovati);
    }

    function b64InByte(b64) {
      var s = atob(b64); var out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    }
    async function sha256(b64) {
      var d = new Uint8Array(await crypto.subtle.digest('SHA-256', b64InByte(b64)));
      return Array.from(d).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    async function indiceLocale() { var r = await (await archivio()).get('meta', 'indice'); return r ? r.v : null; }
    async function indiceRemoto() {
      var ind = await Api.chiama('materiali.indice');
      await (await archivio()).put('meta', { k: 'indice', v: ind });
      return ind;
    }
    function setLocale(id) { return archivio().then(function (a) { return a.get('set', id); }); }
    async function tuttiLocali() {
      var out = {};
      (await (await archivio()).tutti('set')).forEach(function (s) { out[s.id] = s; });
      return out;
    }

    /** Scarica un set e solo i file che non sono gia' sul dispositivo. */
    async function scarica(id, progresso) {
      var a = await archivio();
      var set = await Api.chiama('materiali.set', { id: id });
      var hashes = hashRiferiti(set);
      var mancanti = [];
      for (var i = 0; i < hashes.length; i++) if (!(await a.get('file', hashes[i]))) mancanti.push(hashes[i]);
      for (var j = 0; j < mancanti.length; j += 20) {
        if (progresso) progresso(j, mancanti.length);
        var file = await Api.chiama('materiali.immagini', { hashes: mancanti.slice(j, j + 20) });
        await a.insieme(['file'], function (s) {
          Object.keys(file).forEach(function (hh) { s.file.put({ hash: hh, url: file[hh], byte: Math.round(file[hh].length * 0.75) }); });
        });
      }
      await a.put('set', set);
      return { set: set, scaricati: mancanti.length, totali: hashes.length };
    }

    /** Aggiorna i set gia' scaricati che sono cambiati. */
    async function aggiornaScaricati(progresso) {
      var ind = await indiceRemoto();
      var locali = await tuttiLocali();
      var cambiati = Object.keys(locali).filter(function (id) { return ind.sets[id] && ind.sets[id].versione !== locali[id].versione; });
      for (var i = 0; i < cambiati.length; i++) {
        if (progresso) progresso(i, cambiati.length);
        await scarica(cambiati[i]);
      }
      return cambiati.length;
    }

    async function rimuovi(id) { await (await archivio()).del('set', id); }

    async function spazio() {
      var file = await (await archivio()).tutti('file');
      return file.reduce(function (t, f) { return t + (f.byte || 0); }, 0);
    }

    /** Il set con le immagini vere al posto dei riferimenti (per l'anteprima). */
    async function urlFile(hash) { var f = await (await archivio()).get('file', hash); return f ? f.url : null; }

    function caricaJSZip() {
      if (window.JSZip) return Promise.resolve(window.JSZip);
      return new Promise(function (ok, ko) {
        var s = document.createElement('script'); s.src = 'vendor/jszip.min.js';
        s.onload = function () { ok(window.JSZip); };
        s.onerror = function () { ko(new Error('Libreria ZIP non caricata.')); };
        document.head.appendChild(s);
      });
    }

    var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav' };
    var EST = {};
    Object.keys(MIME).forEach(function (e) { if (!EST[MIME[e]]) EST[MIME[e]] = e; });

    /**
     * Legge un file esportato dall'app completa (ZIP o JSON) e restituisce i set
     * con i file gia' separati: { sets: [...], file: { hash: dataURL } }.
     */
    async function leggiEsportazione(file) {
      var sets = [], raccolti = {};
      async function sostituisci(obj, leggi) {
        if (typeof obj === 'string') {
          var dati = await leggi(obj);
          if (!dati) return obj;
          var hash = await sha256(dati.b64);
          raccolti[hash] = 'data:' + dati.mime + ';base64,' + dati.b64;
          return 'img:' + hash;
        }
        if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) obj[i] = await sostituisci(obj[i], leggi); return obj; }
        if (obj && typeof obj === 'object') { for (var k in obj) obj[k] = await sostituisci(obj[k], leggi); return obj; }
        return obj;
      }
      var daDataUrl = async function (s) {
        var m = /^data:([^;]+);base64,(.+)$/.exec(s);
        return m && EST[m[1]] ? { mime: m[1], b64: m[2] } : null;
      };

      if (/\.zip$/i.test(file.name) || file.type.indexOf('zip') >= 0) {
        var JSZip = await caricaJSZip();
        var zip = await JSZip.loadAsync(await UI.leggiFile(file, 'buffer'));
        var voci = [];
        zip.folder('sets').forEach(function (percorso, voce) { if (/\.json$/.test(percorso)) voci.push(voce); });
        var daZip = async function (s) {
          if (!/^(images|audio)\//.test(s)) return daDataUrl(s);
          var f = zip.file(s);
          if (!f) return null;
          var ext = s.split('.').pop().toLowerCase();
          return MIME[ext] ? { mime: MIME[ext], b64: await f.async('base64') } : null;
        };
        for (var i = 0; i < voci.length; i++) {
          var set = JSON.parse(await voci[i].async('text'));
          sets.push(await sostituisci(set, daZip));
        }
      } else {
        var dati = JSON.parse(await UI.leggiFile(file, 'text'));
        var lista = Array.isArray(dati) ? dati : dati.sets ? dati.sets : dati.items ? [dati] : [];
        for (var j = 0; j < lista.length; j++) sets.push(await sostituisci(lista[j], daDataUrl));
      }
      sets.forEach(function (s) { s.id = String(s.id || Modello.nuovoId('set')).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80); });
      return { sets: sets.filter(function (s) { return Array.isArray(s.items); }), file: raccolti };
    }

    /** Carica solo i file che il custode non ha, a gruppi, poi pubblica il set. */
    async function pubblica(set, file, progresso, sovrascrivi) {
      var hashes = hashRiferiti(set);
      var mancanti = await Api.chiama('materiali.mancanti', { hashes: hashes });
      var gruppo = {}, peso = 0, fatti = 0;
      async function invia() {
        if (!Object.keys(gruppo).length) return;
        await Api.chiama('materiali.caricaImmagini', { immagini: gruppo });
        fatti += Object.keys(gruppo).length;
        if (progresso) progresso(fatti, mancanti.length);
        gruppo = {}; peso = 0;
      }
      for (var i = 0; i < mancanti.length; i++) {
        var u = file[mancanti[i]];
        if (!u) throw new Error('Nel file manca un\'immagine riferita dal set.');
        if (peso + u.length > 6 * 1024 * 1024 || Object.keys(gruppo).length >= 30) await invia();
        gruppo[mancanti[i]] = u; peso += u.length;
      }
      await invia();
      var ind = await indiceRemoto();
      var base = ind.sets[set.id] ? ind.sets[set.id].versione : 0;
      try {
        return await Api.chiama('materiali.pubblica', { set: set, versioneBase: base });
      } catch (e) {
        if (e.codice === 'conflitto' && sovrascrivi) {
          return Api.chiama('materiali.pubblica', { set: set, versioneBase: e.extra.versioneAttuale });
        }
        throw e;
      }
    }

    /** ZIP nel formato dell'app completa: lo si importa da li' con "Importa". */
    async function esportaZip(id) {
      var set = JSON.parse(JSON.stringify(await setLocale(id)));
      var JSZip = await caricaJSZip();
      var zip = new JSZip();
      var a = await archivio();
      async function metti(obj) {
        if (typeof obj === 'string') {
          var m = /^img:([a-f0-9]{64})$/.exec(obj);
          if (!m) return obj;
          var f = await a.get('file', m[1]);
          if (!f) return '';
          var mm = /^data:([^;]+);base64,(.+)$/.exec(f.url);
          var cartella = mm[1].indexOf('audio') === 0 ? 'audio' : 'images/items';
          var nome = cartella + '/' + m[1] + '.' + (EST[mm[1]] || 'bin');
          zip.file(nome, mm[2], { base64: true });
          return nome;
        }
        if (Array.isArray(obj)) { for (var i = 0; i < obj.length; i++) obj[i] = await metti(obj[i]); return obj; }
        if (obj && typeof obj === 'object') { for (var k in obj) obj[k] = await metti(obj[k]); return obj; }
        return obj;
      }
      ['versione', 'aggiornato', 'aggiornatoDa'].forEach(function (k) { delete set[k]; });
      await metti(set);
      zip.file('sets/' + set.id + '.json', JSON.stringify(set, null, 1));
      zip.file('manifest.json', JSON.stringify({ version: 6, format: 'zip', singleSet: true, setCount: 1, timestamp: new Date().toISOString(), origine: 'Quaderno TICE' }));
      var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
      UI.scaricaFile('Set_' + String(set.name || set.id).replace(/[^\w-]+/g, '_') + '.zip', blob);
    }

    return {
      indiceLocale: indiceLocale, indiceRemoto: indiceRemoto, setLocale: setLocale, tuttiLocali: tuttiLocali,
      scarica: scarica, aggiornaScaricati: aggiornaScaricati, rimuovi: rimuovi, spazio: spazio, urlFile: urlFile,
      leggiEsportazione: leggiEsportazione, pubblica: pubblica, esportaZip: esportaZip, hashRiferiti: hashRiferiti,
    };
  })();
  window.Materiali = M;

  function statoSet(voce, locale) {
    if (!locale) return ['', 'da scaricare'];
    if (locale.versione !== voce.versione) return ['arancio', 'da aggiornare'];
    return ['acqua', 'sul dispositivo'];
  }

  // --------------------------------------------------------------------------
  App.vista('materiali', {
    sezione: 'materiali',
    titolo: function () { return 'Materiali'; },
    render: async function (p) {
      var permessi = (Sync.stato().io || {}).permessi || {};
      var ind = await M.indiceLocale();
      if (!ind && !p._provato) {
        p._provato = true;
        try { ind = await M.indiceRemoto(); } catch (e) { /* offline: si mostra cio' che c'e' */ }
      }
      var locali = await M.tuttiLocali();
      var sets = ind ? Object.keys(ind.sets).map(function (id) { return Object.assign({ id: id }, ind.sets[id]); }) : [];
      var perCat = {};
      sets.forEach(function (s) { (perCat[s.categoria || 'Senza categoria'] = perCat[s.categoria || 'Senza categoria'] || []).push(s); });
      var daAggiornare = sets.filter(function (s) { return locali[s.id] && locali[s.id].versione !== s.versione; }).length;
      var spazio = await M.spazio();

      return h`
        <h1>Materiali</h1>
        <p class="sotto" style="margin-top:-8px">I set condivisi del centro. Si scaricano una volta e si aggiornano solo quando qualcuno li modifica.</p>
        <div class="bottoni">
          <button class="bottone primario" data-azione="aggiorna">${UI.icona('aggiorna')} Aggiorna materiali${daAggiornare ? ' (' + daAggiornare + ')' : ''}</button>
          ${permessi.pubblicaMateriali ? h`<label class="bottone">${UI.icona('carica')} Pubblica un set<input type="file" accept=".zip,.json,application/zip,application/json" data-cambio="pubblica" hidden></label>` : ''}
        </div>
        <p class="sotto piccolo">${sets.length} set nel centro · ${Object.keys(locali).length} su questo dispositivo · ${UI.dimensione(spazio)}</p>
        ${!ind ? h`<div class="banda attenzione">Non ho ancora l'elenco dei materiali: serve la connessione.</div>` : ''}
        ${ind && !sets.length ? h`<div class="vuoto scheda imbottita"><p><b>Nessun set pubblicato.</b></p>
          <p class="piccolo">Dall'app completa esporta un set (è un file .zip) e pubblicalo da qui.</p></div>` : ''}
        ${Object.keys(perCat).sort().map(function (cat) {
          return h`<div class="gruppo-titolo"><h3>${cat}</h3></div>
            <ul class="lista scheda">${perCat[cat].sort(function (a, b) { return String(a.nome).localeCompare(b.nome, 'it'); }).map(function (s) {
              var st = statoSet(s, locali[s.id]);
              return h`<li><a class="riga" href="#/materiali/${s.id}">
                <span class="corpo"><span class="titolo">${s.nome}</span>
                  <span class="dettaglio">${s.nItems} item · aggiornato ${Modello.quando(s.aggiornato)}</span></span>
                <span class="fine"><span class="pill ${st[0]}">${st[1]}</span></span></a></li>`;
            })}</ul>`;
        })}`;
    },
    azioni: {
      aggiorna: async function (b) {
        b.disabled = true;
        try {
          var n = await M.aggiornaScaricati(function (i, t) { b.textContent = 'Aggiorno ' + (i + 1) + ' di ' + t + '…'; });
          UI.avviso(n ? n + (n === 1 ? ' set aggiornato' : ' set aggiornati') : 'Materiali già aggiornati', 'ok');
        } catch (e) { App.errore(e); }
        App.ridisegna();
      },
      pubblica: async function (input) {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        UI.avviso('Leggo il file…');
        var letto;
        try { letto = await M.leggiEsportazione(file); }
        catch (e) { return App.errore(new Error('File non riconosciuto: serve l\'esportazione di un set dall\'app completa (.zip).')); }
        if (!letto.sets.length) return UI.avviso('Nel file non ci sono set.', 'errore');
        var ind = await M.indiceLocale();
        var scelti = await UI.apriFoglio(h`<form><h2>Pubblica ${letto.sets.length === 1 ? 'il set' : letto.sets.length + ' set'}</h2>
          <ul class="lista scheda">${letto.sets.map(function (s) {
            var esiste = ind && ind.sets[s.id];
            return h`<li><label class="riga"><input type="checkbox" name="s" value="${s.id}" checked style="width:22px;height:22px">
              <span class="corpo"><span class="titolo">${s.name || s.nome || s.id}</span>
              <span class="dettaglio">${s.items.length} item${esiste ? ' · sostituisce la versione pubblicata' : ''}</span></span></label></li>`;
          })}</ul>
          <p class="sotto piccolo">${Object.keys(letto.file).length} file tra immagini e audio: carico solo quelli che il centro non ha già.</p>
          <div class="bottoni"><button type="button" class="bottone" data-foglio="chiudi">Annulla</button><button class="bottone primario" type="submit">Pubblica</button></div></form>`,
          { invia: function (f) { return Array.from(f.querySelectorAll('input[name=s]:checked')).map(function (x) { return x.value; }); } });
        if (!scelti || !scelti.length) return;
        for (var i = 0; i < letto.sets.length; i++) {
          var s = letto.sets[i];
          if (scelti.indexOf(s.id) < 0) continue;
          try {
            await M.pubblica(s, letto.file, function (fatti, tot) { UI.avviso('Carico i file di "' + (s.name || s.id) + '": ' + fatti + '/' + tot, '', 1500); }, true);
            UI.avviso('Pubblicato: ' + (s.name || s.id), 'ok');
          } catch (e) { App.errore(e); }
        }
        await M.indiceRemoto().catch(function () {});
        App.ridisegna();
      },
    },
  });

  App.vista('set', {
    sezione: 'materiali',
    titolo: function (p) { return p._titolo || 'Set'; },
    render: async function (p) {
      var ind = await M.indiceLocale();
      var voce = ind && ind.sets[p.id];
      if (!voce) return h`<div class="vuoto">Set non trovato. <a href="#/materiali">Materiali</a></div>`;
      p._titolo = voce.nome;
      var permessi = (Sync.stato().io || {}).permessi || {};
      var locale = await M.setLocale(p.id);
      var st = statoSet(voce, locale);
      var anteprima = '';
      if (locale) {
        var items = locale.items.slice(0, 60);
        var urls = await Promise.all(items.map(function (it) {
          var m = /^img:([a-f0-9]{64})$/.exec(it.url || '');
          return m ? M.urlFile(m[1]) : Promise.resolve(null);
        }));
        anteprima = h`<div class="griglia-img" style="margin-top:14px">${items.map(function (it, i) {
          return h`<figure>${urls[i] ? h`<img src="${urls[i]}" alt="" loading="lazy">` : h`<div style="aspect-ratio:1"></div>`}<figcaption>${it.label || ''}</figcaption></figure>`;
        })}</div>${locale.items.length > items.length ? h`<p class="sotto piccolo">e altri ${locale.items.length - items.length}…</p>` : ''}`;
      }
      return h`
        <a class="bottone fantasma piccolo" href="#/materiali" style="margin-left:-10px">${UI.icona('indietro')} Materiali</a>
        <h1>${voce.nome}</h1>
        <p class="sotto" style="margin-top:-8px">${voce.categoria || 'Senza categoria'} · ${voce.nItems} item · versione ${voce.versione} · ${voce.aggiornatoDa || ''} ${Modello.quando(voce.aggiornato)}</p>
        <p><span class="pill ${st[0]}">${st[1]}</span></p>
        <div class="bottoni">
          ${!locale || locale.versione !== voce.versione ? h`<button class="bottone primario" data-azione="scarica">${UI.icona('scarica')} ${locale ? 'Aggiorna' : 'Scarica sul dispositivo'}</button>` : ''}
          ${locale ? h`<button class="bottone" data-azione="esporta">${UI.icona('scarica')} Esporta per l'app completa</button>
            <button class="bottone fantasma" data-azione="rimuovi">Togli dal dispositivo</button>` : ''}
          ${permessi.eliminaMateriali ? h`<button class="bottone pericolo" data-azione="elimina">${UI.icona('cestino')} Elimina dal centro</button>` : ''}
        </div>
        ${locale ? h`<p class="sotto piccolo">L'esportazione è un file .zip che l'app completa apre con “Importa”.</p>` : ''}
        ${anteprima}`;
    },
    azioni: {
      scarica: async function (b, e, p) {
        b.disabled = true;
        try {
          var r = await M.scarica(p.id, function (i, t) { b.textContent = 'Scarico ' + i + '/' + t + '…'; });
          UI.avviso(r.scaricati ? 'Scaricati ' + r.scaricati + ' file nuovi su ' + r.totali : 'Set aggiornato: nessun file nuovo da scaricare', 'ok');
        } catch (err) { App.errore(err); }
        App.ridisegna();
      },
      esporta: async function (b, e, p) {
        b.disabled = true;
        try { await M.esportaZip(p.id); } catch (err) { App.errore(err); }
        b.disabled = false;
      },
      rimuovi: async function (b, e, p) { await M.rimuovi(p.id); App.ridisegna(); },
      elimina: async function (b, e, p) {
        if (!await UI.conferma('Eliminare il set dal centro?', 'Sparisce dall\'elenco per tutti. Il file resta nel Drive e si può recuperare.', { ok: 'Elimina', pericolo: true })) return;
        try {
          await Api.chiama('materiali.elimina', { id: p.id });
          await M.indiceRemoto();
          UI.avviso('Set eliminato', 'ok');
          App.vai('#/materiali');
        } catch (err) { App.errore(err); }
      },
    },
  });
})();
