/**
 * Centro TICE — schermate del collegamento con il Drive del centro:
 * accesso con Google, chiave del centro, sincronizzazione, persone e accessi,
 * versioni precedenti di un bambino, materiali condivisi.
 *
 * Si aggancia alla presa dati (tice-home.js) e usa il motore di tice-sync.js.
 * Se tice-config.js non indica un custode, non mostra niente: l'app resta
 * solo sul dispositivo.
 */
(function () {
    'use strict';
    const Y = window.TiceSync, C = window.TiceCifra;
    if (!Y || !window.TiceHome) return;
    const { h, grezzo, icona, foglio, conferma, avviso, barra, vai, paz, pazienti, formatoData, T } = TiceHome.strumenti;
    const S = Y.S;
    const io = () => S.io || {};
    const admin = () => !!(S.io && S.io.permessi && S.io.permessi.gestisciAccessi);
    const RUOLI = { admin: 'Amministratore', professionista: 'Professionista', tirocinante: 'Tirocinante' };
    const dataOra = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    // =====================================================================
    // Agganci nella presa dati
    // =====================================================================
    function chip() {
        if (!Y.attivo()) return '';
        let stato = 'ok', testo = '';
        if (!navigator.onLine) { stato = 'spento'; testo = 'Offline'; }
        else if (S.fase === 'fuori') { stato = 'spento'; testo = 'Accedi'; }
        else if (S.fase === 'chiave') { stato = 'attesa'; testo = 'Chiave'; }
        else if (S.fase === 'attesa') { stato = 'attesa'; testo = 'In attesa'; }
        else if (S.lavoro) { stato = 'lavoro'; }
        else if (S.errore) { stato = 'errore'; }
        else if (S.coda.size) { stato = 'attesa'; testo = String(S.coda.size); }
        return h`<button class="ib tice-stato" data-a="vai-account" data-stato="${stato}" aria-label="Collegamento con il centro" title="Collegamento con il centro">
            <i class="pallino"></i>${testo ? h`<span>${testo}</span>` : icona('cloud')}</button>`;
    }

    function banner() {
        if (!Y.attivo()) return '';
        if (S.fase === 'fuori') {
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('cloud')} Collega l'app al Drive del centro</b>
                <p class="sotto"><a href="privacy.html" target="_blank" rel="noopener">Informativa privacy</a></p>
                <p class="sotto">Con il tuo account Google vedi i bambini che ti sono assegnati e le sedute registrate da tutti. Senza accesso l'app funziona solo su questo dispositivo.</p>
                ${S.negato ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.negato}</div></div>` : ''}
                ${window.TICE_CONFIG.dev ? h`<form data-a-form="accesso-dev" style="display:flex;gap:8px;flex-wrap:wrap">
                    <input class="campo-in" name="email" type="email" placeholder="email (prova locale)" required style="flex:1;min-width:180px">
                    <button class="bt primario">Entra</button></form>` : h`<div id="tice-gis" style="min-height:44px"></div>`}
            </div>`;
        }
        if (S.fase === 'attesa') {
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('hourglass-half')} Questo dispositivo aspetta la chiave del centro</b>
                <p class="sotto">${io().cifratura
                    ? 'Non devi inserire niente: la riceve da solo appena un amministratore apre l\'app. Intanto puoi lavorare sui bambini di questo dispositivo.'
                    : 'Un amministratore deve ancora creare la chiave del centro.'}</p>
                <button class="bt piccolo" data-a="controlla-chiave">${icona('rotate')} Controlla adesso</button>
            </div>`;
        }
        if (S.fase === 'chiave') {
            const serveCrearla = !io().cifratura;
            return h`<div class="scheda imbottita" style="margin-bottom:12px">
                <b>${icona('key')} ${serveCrearla ? 'Manca la chiave del centro' : 'Chiave del centro su questo dispositivo'}</b>
                <p class="sotto">${serveCrearla
                    ? 'I dati dei bambini sul Drive sono cifrati con una chiave che conoscono solo gli amministratori. Creala adesso: conservala tu, agli altri dispositivi l\'app la consegna senza mostrarla.'
                    : 'Sei amministratore: inserisci la chiave del centro, oppure aspetta che la consegni l\'app di un altro amministratore.'}</p>
                ${serveCrearla ? h`<button class="bt primario" data-a="crea-chiave">${icona('key')} Crea la chiave del centro</button>`
                    : h`<div class="bottoni"><button class="bt primario" data-a="inserisci-chiave">${icona('key')} Inserisci la chiave</button>
                        <button class="bt" data-a="controlla-chiave">${icona('rotate')} Controlla se è arrivata</button></div>`}
            </div>`;
        }
        if (S.errore && !S.lavoro) {
            return h`<div class="banda" style="justify-content:space-between">${icona('triangle-exclamation')}<div style="flex:1">${S.errore}</div>
                <button class="bt piccolo" data-a="sincronizza">Riprova</button></div>`;
        }
        return '';
    }

    function pillola(p) {
        if (!Y.attivo() || S.fase === 'fuori') return '';
        if (!Y.condiviso(p.id)) return h`<span class="pill grigia">solo su questo dispositivo</span> `;
        if (Y.inAttesa(p.id)) return h`<span class="pill arancio">da inviare</span> `;
        return '';
    }

    function opzioniBambino(p) {
        if (!Y.pronto()) return '';
        const cond = Y.condiviso(p.id);
        return h`${!cond && Y.puo('creaPazienti') ? h`<button class="opzione" data-foglio="est:condividi">${icona('cloud-arrow-up')}<span class="corpo">Condividi con il centro<small>Lo vedranno le persone a cui verrà assegnato</small></span></button>` : ''}
            ${cond ? h`<button class="opzione" data-foglio="est:versioni">${icona('clock-rotate-left')}<span class="corpo">Versioni precedenti<small>Per recuperare dati cancellati o modificati per errore</small></span></button>` : ''}
            ${cond && Y.puo('eliminaPazienti') ? h`<button class="opzione" data-foglio="est:archivia">${icona('box-archive')}<span class="corpo">Archivia per tutti<small>Sparisce dai dispositivi; resta sul Drive con le sue versioni</small></span></button>` : ''}`;
    }
    async function sceltaBambino(k, p) {
        if (k === 'condividi') {
            try { await Y.condividi(p.id); avviso(`${p.name} ora è sul Drive del centro`); }
            catch (e) { avviso(e.message, 'errore'); }
            TiceHome.ridisegna();
        } else if (k === 'versioni') {
            T.versioniDi = p.id;
            vai('versioni');
        } else if (k === 'archivia') {
            if (!await conferma(`Archiviare ${p.name}?`, 'Sparisce dai dispositivi di tutti alla prossima sincronizzazione. Il file resta sul Drive con le versioni precedenti e un amministratore può recuperarlo.', { ok: 'Archivia', pericolo: true })) return;
            try {
                await Y.chiama('paziente.archivia', { id: p.id });
                await Y.sincronizza();
                vai('bambini');
                avviso(`${p.name} archiviato`);
            } catch (e) { avviso(e.message, 'errore'); }
        }
    }

    function opzioniMenu() {
        if (!Y.attivo()) return '';
        return h`<button class="opzione" data-foglio="est:account">${icona('cloud')}<span class="corpo">Account e sincronizzazione</span></button>
            ${Y.pronto() ? h`<button class="opzione" data-foglio="est:materiali">${icona('layer-group')}<span class="corpo">Materiali del centro<small>Set condivisi tra le professioniste</small></span></button>` : ''}
            ${admin() ? h`<button class="opzione" data-foglio="est:persone">${icona('users')}<span class="corpo">Persone e accessi</span></button>` : ''}`;
    }
    function sceltaMenu(k) {
        if (k === 'account') vai('account');
        else if (k === 'materiali') vai('materiali');
        else if (k === 'persone') vai('persone');
    }

    async function nuovoBambino(p) {
        if (!Y.pronto() || !Y.puo('creaPazienti')) return;
        try { await Y.condividi(p.id); } catch (e) { avviso('Salvato sul dispositivo; invio al centro non riuscito: ' + e.message, 'errore'); }
    }
    const puoProgrammi = (p) => !Y.attivo() || !Y.condiviso(p.id) || Y.puo('programmi');

    // =====================================================================
    // Versione semplice per le tirocinanti: presa dati, giochi, storico in
    // sola lettura. Niente import, programmi, archivio dei set, impostazioni,
    // condivisioni, export e report esterni.
    // =====================================================================
    const tirocinante = () => Y.attivo() && S.fase !== 'fuori' && Y.ruolo() === 'tirocinante';
    const VIETATE = ['openLibrary', 'openSettings', 'openFirebaseSettings', 'openActivityLayout', 'createNewPatient',
        'renamePatient', 'editPatientCategory', 'deletePatient', 'deleteSession', 'editSession', 'startPatientPhotoUpload',
        'openThresholdEditor', 'addCriterionOverride', 'generateAIReport', 'openReportHistoryStandalone', 'openReportHistory',
        'exportPatientExcel', 'quickSharePatientDirect', 'offlineSharePatient', 'openQuickShare', 'openP2PSync', 'openOfflineShare',
        'openDailyNoteEditor', 'deleteDailyNote', 'openSessionNoteEditor', 'toggleOutlierDay', 'openDayTagPicker', 'setDayTag',
        'exportAllSets', 'importSets', 'createEmptySet', 'openGeminiGenerator'];
    function limitaApp() {
        VIETATE.forEach((nome) => {
            const f = window[nome];
            if (typeof f !== 'function' || f._tice) return;
            const g = function () {
                if (tirocinante()) { avviso('Non disponibile nella versione per le tirocinanti.'); return undefined; }
                return f.apply(this, arguments);
            };
            g._tice = true;
            window[nome] = g;
        });
    }
    function aggiornaRuolo() { document.body.classList.toggle('tice-tirocinante', tirocinante()); }

    function dopo(vista, r) {
        const gis = r.querySelector('#tice-gis');
        if (gis) Y.Auth.pulsante(gis).catch((e) => { gis.innerHTML = String(h`<p class="sotto">${e.message}</p>`); });
        const f = r.querySelector('[data-a-form="accesso-dev"]');
        if (f) f.addEventListener('submit', (e) => { e.preventDefault(); Y.Auth.accessoDev(f.email.value); });
    }

    // =====================================================================
    // Chiave del centro
    // =====================================================================
    function scaricaTesto(nome, testo) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([testo], { type: 'text/plain;charset=utf-8' }));
        a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function testoChiave(frase, cfg) {
        return `CHIAVE DEL CENTRO TICE — Quaderno digitale\n\n    ${frase}\n\n` +
            `Dati tecnici (non segreti, servono ad aprire i file anche senza _config/cifratura.json):\n` +
            `    identificativo ${cfg.kid} · PBKDF2-SHA256 ${cfg.kdf.iterazioni} iterazioni · sale ${cfg.kdf.sale}\n\n` +
            `Serve ad aprire i dati dei bambini salvati sul Drive del centro.\n` +
            `- La conoscono solo gli amministratori: agli altri dispositivi l'app la consegna senza mostrarla.\n` +
            `- Senza questa chiave i dati NON si possono recuperare: nessuno la conosce oltre al centro,\n  nemmeno Google o gli amministratori del Drive.\n` +
            `- Per aprire un file senza l'app: strumenti/apri-dati.html (anche offline) oppure tools/decifra_tice.py.\n` +
            `- Conservala in un gestore di password e su carta in un luogo chiuso. Non mandarla per email o chat.\n\n` +
            `Creata il ${new Date().toLocaleDateString('it-IT')} da ${io().email || ''}.\n`;
    }
    // Mostra una frase nuova da conservare; conferma riscrivendo l'ultimo gruppo
    function foglioFrase(frase, cfg, { titolo, intro, bottone }) {
        return foglio(h`<form><h2>${icona('key')} ${titolo}</h2>
            <p class="sotto">${intro}</p>
            <div class="chiave-grande" aria-label="Chiave del centro">${frase}</div>
            <div class="bottoni" style="margin-top:8px">
                <button type="button" class="bt" data-copia>${icona('copy')} Copia</button>
                <button type="button" class="bt" data-scarica>${icona('download')} Scarica</button>
                <button type="button" class="bt" data-stampa>${icona('print')} Stampa</button>
            </div>
            <ul class="sotto piccolo" style="padding-left:18px">
                <li>Mettila in un gestore di password e su carta in un luogo chiuso. Il file scaricato serve anche ad aprire i dati senza l'app.</li>
                <li>La conoscono solo gli amministratori. Agli altri dispositivi l'app la consegna da sola, senza mostrarla.</li>
                <li>Se si perdono tutte le copie, i dati sul Drive non si recuperano più.</li>
            </ul>
            <label class="campo"><span>Per conferma, riscrivi l'ultimo gruppo (${'•'.repeat(5)})</span><input name="conferma" required autocomplete="off" maxlength="5" style="text-transform:uppercase;font-family:monospace;letter-spacing:2px"></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${bottone}</button></div></form>`,
        {
            invia: (f) => {
                const v = C.normalizzaFrase(frase.slice(0, -5) + f.conferma.value);
                if (v !== frase) { f.conferma.setCustomValidity('Non corrisponde'); f.conferma.reportValidity(); f.conferma.setCustomValidity(''); return undefined; }
                return true;
            },
            dopo: (f) => {
                f.querySelector('[data-copia]').onclick = () => navigator.clipboard && navigator.clipboard.writeText(frase).then(() => avviso('Chiave copiata'));
                f.querySelector('[data-scarica]').onclick = () => scaricaTesto('chiave-centro-tice-' + cfg.kid + '.txt', testoChiave(frase, cfg));
                f.querySelector('[data-stampa]').onclick = () => {
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write('<pre style="font:16px/1.5 monospace;padding:24px;white-space:pre-wrap">' + testoChiave(frase, cfg).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>');
                    w.document.close(); w.print();
                };
            }
        });
    }
    async function creaChiave() {
        const frase = C.generaFrase();
        avviso('Preparazione della chiave…');
        const preparata = await C.nuovaConfigurazione(frase, true);
        const r = await foglioFrase(frase, preparata.cfg, { titolo: 'La chiave del centro', bottone: 'Crea la chiave',
            intro: 'Questa è la chiave che apre i dati dei bambini. Conservala adesso: su questo dispositivo potrai rivederla, ma se lo perdi resta solo la tua copia.' });
        if (!r) return;
        try {
            await Y.creaChiave(frase, preparata);
            avviso('Chiave del centro creata');
        } catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }
    async function cambiaChiave() {
        const ok = await conferma('Cambiare la chiave del centro?',
            'Serve quando qualcuno potrebbe averla conservata (per esempio una persona che non collabora più). Tutti i bambini vengono cifrati con una chiave nuova; i dispositivi delle persone abilitate la ricevono da soli, quelli tolti no. La chiave vecchia apre ancora le versioni precedenti al cambio: conservala. Tieni l\'app aperta finché non finisce.',
            { ok: 'Continua' });
        if (!ok) return;
        const frase = C.generaFrase();
        avviso('Preparazione della chiave…');
        const preparata = await C.nuovaConfigurazione(frase, true);
        const r = await foglioFrase(frase, preparata.cfg, { titolo: 'Nuova chiave del centro', bottone: 'Cambia la chiave',
            intro: 'Questa sostituisce la chiave attuale. Conservala come la precedente, e tieni anche la vecchia: serve ad aprire le versioni salvate prima del cambio.' });
        if (!r) return;
        try {
            T.lavoroChiave = 'Cambio della chiave…'; TiceHome.ridisegna();
            const esito = await Y.cambiaChiave(frase, preparata, (i, n) => { T.lavoroChiave = `Ricifratura dei bambini: ${i} di ${n}…`; TiceHome.ridisegna(); });
            avviso(`Chiave cambiata: ${esito.bambini} bambini ricifrati`);
        } catch (e) { avviso('Cambio non completato: ' + e.message + '. Riprova: riprende da dove si è fermato.', 'errore'); }
        T.lavoroChiave = null;
        TiceHome.ridisegna();
    }
    async function mostraChiave() {
        const frase = await Y.mostraFrase();
        if (!frase) { avviso('Su questo dispositivo la chiave è arrivata già pronta: la frase non c\'è. Inseriscila una volta per poterla rivedere qui.', 'errore'); return; }
        const kid = S.cfg && S.cfg.kid;
        await foglio(h`<h2>${icona('key')} Chiave del centro</h2>
            <div class="chiave-grande">${frase}</div>
            <p class="sotto piccolo">Identificativo ${kid}. Serve agli amministratori e per aprire i file senza l'app: non darla a professioniste e tirocinanti (la ricevono dall'app) e non mandarla per email o chat.</p>
            <div class="bottoni"><button class="bt" data-foglio="scarica">${icona('download')} Scarica</button><button class="bt primario" data-foglio="chiudi">Chiudi</button></div>`)
            .then((v) => { if (v === 'scarica') scaricaTesto('chiave-centro-tice-' + kid + '.txt', testoChiave(frase, S.cfg)); });
    }
    async function inserisciChiave(b, kid) {
        const r = await foglio(h`<form><h2>${icona('key')} ${kid ? 'Chiave precedente' : 'Chiave del centro'}</h2>
            <p class="sotto">${kid ? `Questa versione è cifrata con la chiave ${kid}, sostituita in seguito. Inserisci quella frase: resta su questo dispositivo per le versioni vecchie.`
                : '25 caratteri, anche senza trattini. Si inserisce una volta su questo dispositivo.'}</p>
            <label class="campo"><input name="frase" required autocomplete="off" autofocus placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" style="font-family:monospace;letter-spacing:1px;text-transform:uppercase"></label>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Apri</button></div></form>`);
        if (!r) return;
        try {
            avviso('Controllo della chiave…');
            await Y.inserisciChiave(r.frase, kid);
            avviso(kid ? 'Chiave precedente aggiunta' : 'Chiave corretta: sincronizzazione in corso');
        } catch (e) { avviso(e.message, 'errore'); }
        TiceHome.ridisegna();
    }

    // =====================================================================
    // Account
    // =====================================================================
    function vistaAccount() {
        const u = Y.Auth.utente();
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Collegamento con il centro' })}
            <main class="tice-main">
                ${banner()}
                ${u ? h`<div class="scheda imbottita">
                    <b>${io().nome || u.nome}</b> <span class="sotto">${u.email}</span><br>
                    <span class="pill">${RUOLI[io().ruolo] || 'accesso da verificare'}</span>
                    ${io().scadenza ? h` <span class="pill arancio">fino al ${formatoData(io().scadenza, true)}</span>` : ''}
                    ${io().proprietario ? h` <span class="pill verde">proprietario del custode</span>` : ''}
                </div>` : ''}
                ${Y.pronto() ? h`<div class="scheda imbottita" style="margin-top:10px">
                    <table class="tabella"><tbody>
                        <tr><td>Bambini del centro su questo dispositivo</td><td class="num"><b>${S.condivisi.size}</b></td></tr>
                        <tr><td>Da inviare</td><td class="num"><b>${S.coda.size}</b></td></tr>
                        <tr><td>Ultima sincronizzazione</td><td class="num">${S.ultimo ? dataOra(S.ultimo) : '—'}</td></tr>
                    </tbody></table>
                    ${S.errore ? h`<p class="sotto">${icona('triangle-exclamation')} ${S.errore}</p>` : ''}
                    <button class="bt primario largo" style="margin-top:10px" data-a="sincronizza" ${S.lavoro ? grezzo('disabled') : ''}>${icona('rotate')} ${S.lavoro ? 'Sincronizzazione…' : 'Sincronizza ora'}</button>
                </div>` : ''}
                ${!u ? '' : admin() ? h`<div class="scheda imbottita" style="margin-top:10px">
                    <b>${icona('key')} Chiave del centro</b> <span class="sotto piccolo">${S.cfg ? S.cfg.kid : ''}</span>
                    <p class="sotto">La conoscono solo gli amministratori. Ai dispositivi delle persone abilitate l'app la consegna da sola, senza mostrarla: chi perde l'accesso non ha niente da conservare.</p>
                    ${T.lavoroChiave ? h`<p class="sotto">${icona('spinner fa-spin')} ${T.lavoroChiave}</p>` : ''}
                    <div class="bottoni">
                        <button class="bt" data-a="mostra-chiave">${icona('eye')} Mostra la chiave</button>
                        <button class="bt" data-a="vai-dispositivi">${icona('mobile-screen')} Dispositivi</button>
                        <button class="bt pericolo" data-a="cambia-chiave" ${T.lavoroChiave ? grezzo('disabled') : ''}>${icona('arrows-rotate')} Cambia la chiave</button>
                    </div>
                </div>` : !Y.pronto() ? '' : h`<div class="scheda imbottita" style="margin-top:10px">
                    <b>${icona('shield-halved')} Dati protetti</b>
                    <p class="sotto">Questo dispositivo ha ricevuto la chiave del centro e la usa senza mostrarla. I dati dei bambini sul Drive sono cifrati.</p>
                </div>`}
                <div class="bottoni" style="margin-top:14px">
                    ${admin() ? h`<button class="bt" data-a="vai-persone">${icona('users')} Persone e accessi</button>` : ''}
                    ${Y.pronto() ? h`<button class="bt" data-a="vai-materiali">${icona('layer-group')} Materiali del centro</button>` : ''}
                    ${u ? h`<button class="bt pericolo" data-a="esci">${icona('right-from-bracket')} Esci</button>` : ''}
                </div>
            </main>`;
    }

    // =====================================================================
    // Persone e accessi (admin)
    // =====================================================================
    function nomeBambino(pid) {
        const e = S.etichette[pid];
        const l = paz(pid);
        return (e && e.nome) || (l && l.name) || pid;
    }
    function vistaPersone() {
        const a = T.accessi;
        if (!a) {
            Y.chiama('accessi.leggi').then((x) => { T.accessi = x; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-account', titolo: 'Persone e accessi' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const oggi = new Date().toISOString().slice(0, 10);
        const persone = Object.keys(a.utenti).sort((x, y) => (a.utenti[x].nome || x).localeCompare(a.utenti[y].nome || y, 'it'));
        return h`${barra({ indietro: 'vai-account', titolo: 'Persone e accessi' })}
            <main class="tice-main">
                <p class="sotto">Chi è in elenco entra con il suo account Google (anche Gmail personale) e vede solo i bambini assegnati. Togliere l'accesso ha effetto alla richiesta successiva, e i dati del centro spariscono dal suo dispositivo alla prossima sincronizzazione.</p>
                <button class="bt primario largo" data-a="persona" data-email="">${icona('user-plus')} Aggiungi una persona</button>
                <div class="scheda" style="margin-top:12px">
                    <div class="riga" style="cursor:default"><span class="corpo"><span class="t1">${a.proprietario}</span><span class="t2">Amministratore · proprietario del custode, sempre abilitato</span></span></div>
                    ${persone.map((em) => {
                        const u = a.utenti[em];
                        const scaduto = u.scadenza && u.scadenza < oggi;
                        const n = u.pazienti === '*' ? 'tutti i bambini' : `${(u.pazienti || []).length} bambini`;
                        return h`<button class="riga" data-a="persona" data-email="${em}">
                            <span class="corpo"><span class="t1">${u.nome || em}${!u.attivo ? h` <span class="pill grigia">disattivato</span>` : ''}${scaduto ? h` <span class="pill arancio">scaduto</span>` : ''}</span>
                            <span class="t2">${em} · ${RUOLI[u.ruolo]} · ${n}${u.scadenza ? ' · fino al ' + formatoData(u.scadenza) : ''}</span></span>${icona('pen')}</button>`;
                    })}
                </div>
            </main>`;
    }
    async function persona(email) {
        const a = T.accessi;
        const u = email ? a.utenti[email] : { nome: '', ruolo: 'tirocinante', pazienti: [], attivo: true, scadenza: null };
        const bambini = Object.keys(S.etichette).sort((x, y) => nomeBambino(x).localeCompare(nomeBambino(y), 'it'));
        const tutti = u.pazienti === '*';
        const r = await foglio(h`<form><h2>${email ? u.nome || email : 'Nuova persona'}</h2>
            <label class="campo"><span>Email Google</span><input name="email" type="email" required value="${email || ''}" ${email ? grezzo('readonly') : grezzo('autofocus')}></label>
            <label class="campo"><span>Nome</span><input name="nome" maxlength="60" value="${u.nome || ''}"></label>
            <div class="campo"><span>Ruolo</span><div class="scelta">
                ${Object.keys(RUOLI).map((k) => h`<label><input type="radio" name="ruolo" value="${k}" ${u.ruolo === k ? grezzo('checked') : ''}><span>${RUOLI[k]}</span></label>`)}
            </div><span class="sotto piccolo">Tirocinante: registra le sedute e vede lo storico. Professionista: anche programmi e nuovi bambini. Amministratore: tutto, persone comprese.</span></div>
            <label class="campo"><span>Accesso fino al (facoltativo, per i tirocini)</span><input name="scadenza" type="date" value="${u.scadenza || ''}"></label>
            <div class="campo"><span>Bambini assegnati</span>
                <label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" name="tutti" ${tutti ? grezzo('checked') : ''}> Tutti</label>
                <div class="opzioni" style="max-height:30vh;overflow-y:auto">
                    ${bambini.length ? bambini.map((pid) => h`<label class="opzione"><input type="checkbox" name="p" value="${pid}" ${!tutti && (u.pazienti || []).includes(pid) ? grezzo('checked') : ''}><span class="corpo">${nomeBambino(pid)}</span></label>`)
                        : h`<p class="sotto">Nessun bambino sul Drive del centro.</p>`}
                </div></div>
            ${email ? h`<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" name="attivo" ${u.attivo !== false ? grezzo('checked') : ''}> Accesso attivo</label>` : ''}
            ${email ? h`<button type="button" class="bt pericolo" data-foglio="togli" style="width:100%;margin-top:6px">Togli dall'elenco</button>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { invia: (f) => { const d = new FormData(f); return { email: d.get('email'), nome: d.get('nome'), ruolo: d.get('ruolo'), scadenza: d.get('scadenza'), tutti: !!d.get('tutti'), p: d.getAll('p'), attivo: email ? !!d.get('attivo') : true }; } });
        if (!r) return;
        const nuovi = JSON.parse(JSON.stringify(a));
        const em = String(email || r.email).trim().toLowerCase();
        if (r === 'togli') {
            if (!await conferma(`Togliere ${em}?`, 'Non potrà più entrare; i dati del centro spariranno dal suo dispositivo.', { ok: 'Togli', pericolo: true })) return;
            delete nuovi.utenti[em];
        } else {
            nuovi.utenti[em] = { nome: r.nome.trim(), ruolo: r.ruolo, pazienti: r.tutti ? '*' : r.p, scadenza: r.scadenza || null, attivo: r.attivo };
        }
        try {
            T.accessi = await Y.chiama('accessi.salva', { accessi: { utenti: nuovi.utenti }, versioneBase: a.version || 0 });
            T.accessi.proprietario = a.proprietario;
            avviso('Accessi salvati');
        } catch (e) {
            avviso(e.message, 'errore');
            if (e.codice === 'conflitto') T.accessi = null;
        }
        TiceHome.ridisegna();
    }

    // =====================================================================
    // Dispositivi (admin)
    // =====================================================================
    function vistaDispositivi() {
        if (!T.elencoDisp) {
            Y.dispositivi().then((d) => { T.elencoDisp = d; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-account', titolo: 'Dispositivi' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const perPersona = {};
        T.elencoDisp.forEach((d) => { (perPersona[d.email] = perPersona[d.email] || []).push(d); });
        return h`${barra({ indietro: 'vai-account', titolo: 'Dispositivi' })}
            <main class="tice-main">
                <p class="sotto">Ogni dispositivo che accede riceve la chiave del centro dall'app di un amministratore, senza vederla. Qui controlli quali sono: se ne vedi uno che non riconosci, toglilo e valuta di cambiare la chiave.</p>
                ${Object.keys(perPersona).sort().map((em) => h`<h3>${em}</h3><div class="scheda">
                    ${perPersona[em].map((d) => h`<div class="riga" style="cursor:default">
                        <span class="corpo"><span class="t1">${d.nome}${!d.personaAbilitata ? h` <span class="pill grigia">persona non abilitata</span>` : ''}</span>
                        <span class="t2">${d.abilitato ? `chiave consegnata${d.abilitatoIl ? ' il ' + dataOra(d.abilitatoIl) : ''}` : 'in attesa della chiave'} · ultimo accesso ${dataOra(d.ultimoAccesso)}</span></span>
                        ${d.abilitato ? h`<span class="pill verde">${icona('check')}</span>` : h`<span class="pill arancio">attesa</span>`}
                        <button class="ib" data-a="togli-dispositivo" data-id="${d.id}" aria-label="Togli il dispositivo">${icona('trash')}</button>
                    </div>`)}
                </div>`)}
                ${!T.elencoDisp.length ? h`<div class="vuoto">Nessun dispositivo registrato.</div>` : ''}
            </main>`;
    }

    // =====================================================================
    // Versioni precedenti
    // =====================================================================
    function vistaVersioni() {
        const pid = T.versioniDi;
        const p = paz(pid);
        if (!T.elencoVersioni || T.elencoVersioni.pid !== pid) {
            Y.versioni(pid).then((v) => { T.elencoVersioni = { pid, v }; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-seduta', titolo: 'Versioni precedenti', sotto: { testo: p ? p.name : '' } })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const v = T.elencoVersioni.v;
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Versioni precedenti', sotto: { testo: p ? p.name : '' } })}
            <main class="tice-main">
                <p class="sotto">Ogni salvataggio conserva la versione di prima: le ultime 20, più l'ultima di ogni giorno per due mesi. Ripristinare una versione non cancella niente: diventa la versione attuale e quella di adesso resta tra le precedenti.</p>
                <div class="scheda">
                    ${v.length ? v.map((x) => h`<button class="riga" data-a="versione" data-v="${x.version}">
                        <span class="corpo"><span class="t1">${dataOra(x.aggiornato)}</span><span class="t2">versione ${x.version} · ${x.aggiornatoDa || ''}</span></span>${icona('chevron-right')}</button>`)
                        : h`<div class="vuoto">Ancora nessuna versione precedente.</div>`}
                </div>
            </main>`;
    }
    async function versione(b) {
        const pid = T.versioniDi, n = +b.dataset.v;
        let vecchia;
        try { vecchia = await Y.anteprimaVersione(pid, n); }
        catch (e) {
            if (e.senzaChiave && admin()) { await inserisciChiave(null, e.senzaChiave); return; }
            avviso(e.message, 'errore'); return;
        }
        const ora = paz(pid) || {};
        const conta = (p) => (p.history || []).length;
        const ultima = (p) => (p.history || []).reduce((m, s) => (s.date > m ? s.date : m), '');
        const r = await foglio(h`<h2>Versione ${n}</h2>
            <table class="tabella"><thead><tr><th></th><th class="num">Questa versione</th><th class="num">Adesso</th></tr></thead><tbody>
                <tr><td>Nome</td><td class="num">${vecchia.name}</td><td class="num">${ora.name || ''}</td></tr>
                <tr><td>Sedute</td><td class="num">${conta(vecchia)}</td><td class="num">${conta(ora)}</td></tr>
                <tr><td>Ultima seduta</td><td class="num">${formatoData((ultima(vecchia) || '').slice(0, 10))}</td><td class="num">${formatoData((ultima(ora) || '').slice(0, 10))}</td></tr>
                <tr><td>Attività nel programma</td><td class="num">${((vecchia.programma || {}).attivita || []).length}</td><td class="num">${((ora.programma || {}).attivita || []).length}</td></tr>
            </tbody></table>
            <div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button><button class="bt primario" data-foglio="ripristina">Ripristina questa versione</button></div>`);
        if (r !== 'ripristina') return;
        if (!await conferma('Ripristinare la versione ' + n + '?', 'Diventa la versione attuale per tutti. Quella di adesso resta tra le precedenti.', { ok: 'Ripristina' })) return;
        try {
            await Y.ripristina(pid, n);
            T.elencoVersioni = null;
            avviso('Versione ripristinata');
            vai('seduta', pid);
        } catch (e) { avviso(e.message, 'errore'); }
    }

    // =====================================================================
    // Materiali del centro: set condivisi. Immagini e audio viaggiano una volta
    // sola, per impronta (sha256): un set aggiornato scarica solo le novità.
    // =====================================================================
    const setLocali = () => (typeof state !== 'undefined' && state.savedSets) || [];
    async function sha256(b64) {
        const buf = await crypto.subtle.digest('SHA-256', C.daB64(b64));
        return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    // Sostituisce ogni "data:..." con "img:<hash>" e raccoglie i file
    async function perRiferimento(set) {
        const file = {};
        const RE = /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:audio\/(?:mpeg|mp4|webm|ogg|wav|x-m4a)));base64,(.+)$/;
        async function visita(v) {
            if (typeof v === 'string') {
                if (v.indexOf('data:') !== 0) return v;
                const m = RE.exec(v);
                if (!m) throw new Error('Nel set c\'è un file di tipo non ammesso (solo immagini PNG, JPEG, WebP, GIF e audio).');
                const hs = await sha256(m[2]);
                file[hs] = v;
                return 'img:' + hs;
            }
            if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await visita(x)); return o; }
            if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await visita(v[k]); return o; }
            return v;
        }
        return { set: await visita(set), file };
    }
    function hashDi(set) {
        const tr = {};
        (function visita(v) {
            if (typeof v === 'string') { const m = /^img:([a-f0-9]{64})/.exec(v); if (m) tr[m[1]] = true; }
            else if (Array.isArray(v)) v.forEach(visita);
            else if (v && typeof v === 'object') Object.keys(v).forEach((k) => visita(v[k]));
        })(set);
        return Object.keys(tr);
    }
    function sostituisci(v, mappa) {
        if (typeof v === 'string') { const m = /^img:([a-f0-9]{64})/.exec(v); return m && mappa[m[1]] ? mappa[m[1]] : v; }
        if (Array.isArray(v)) return v.map((x) => sostituisci(x, mappa));
        if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = sostituisci(v[k], mappa); }); return o; }
        return v;
    }
    async function ricaricaSet() {
        state.savedSets = await DB.getAllSets();
        const b = document.getElementById('lib-count');
        if (b) b.innerText = state.savedSets.length;
        if (typeof filterSetsByMode === 'function') filterSetsByMode();
    }

    function vistaMateriali() {
        if (!T.indiceMateriali) {
            Y.chiama('materiali.indice').then((x) => { T.indiceMateriali = x; TiceHome.ridisegna(); }).catch((e) => avviso(e.message, 'errore'));
            return h`${barra({ indietro: 'vai-bambini', titolo: 'Materiali del centro' })}<main class="tice-main"><p class="sotto">${icona('spinner fa-spin')} Caricamento…</p></main>`;
        }
        const ind = T.indiceMateriali.sets || {};
        const ids = Object.keys(ind).sort((a, b) => (ind[a].categoria + ind[a].nome).localeCompare(ind[b].categoria + ind[b].nome, 'it'));
        const stati = statiMateriali();
        const daPrendere = ids.filter((id) => stati[id] !== 'ok');
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Materiali del centro' })}
            <main class="tice-main">
                <p class="sotto">I set pubblicati qui si scaricano una volta e poi si usano anche senza rete, nei giochi e nei programmi.</p>
                ${Y.puo('pubblicaMateriali') ? h`<button class="bt primario largo" data-a="pubblica-set" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${icona('cloud-arrow-up')} Pubblica set del tuo archivio</button>` : ''}
                ${daPrendere.length > 1 ? h`<button class="bt largo" style="margin-top:8px" data-a="scarica-tutti" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${icona('cloud-arrow-down')} Scarica tutti i nuovi e gli aggiornati (${daPrendere.length})</button>` : ''}
                ${T.lavoroMateriali ? h`<p class="sotto" style="margin-top:10px" data-lavoro-materiali>${icona('spinner fa-spin')} ${T.lavoroMateriali}</p>` : ''}
                <div class="scheda" style="margin-top:12px">
                    ${ids.length ? ids.map((id) => {
                        const v = ind[id], stato = stati[id];
                        return h`<div class="riga" style="cursor:default">
                            <span class="corpo"><span class="t1">${v.nome}</span><span class="t2">${v.categoria ? v.categoria + ' · ' : ''}${v.nItems} elementi · ${v.aggiornatoDa || ''} · ${formatoData((v.aggiornato || '').slice(0, 10))}</span></span>
                            ${stato === 'ok' ? h`<span class="pill verde">${icona('check')} sul dispositivo</span>`
                                : h`<button class="bt piccolo ${stato === 'aggiorna' ? 'arancio' : ''}" data-a="scarica-set" data-id="${id}" ${T.lavoroMateriali ? grezzo('disabled') : ''}>${stato === 'aggiorna' ? 'Aggiorna' : 'Scarica'}</button>`}
                        </div>`;
                    }) : h`<div class="vuoto">Ancora nessun set pubblicato.</div>`}
                </div>
            </main>`;
    }
    // id del centro → 'scarica' | 'aggiorna' | 'ok'
    function statiMateriali() {
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const locali = {};
        setLocali().forEach((s) => { if (s.centro && s.centro.id) locali[s.centro.id] = s; });
        const out = {};
        Object.keys(ind).forEach((id) => { const l = locali[id]; out[id] = !l ? 'scarica' : l.centro.versione < ind[id].versione ? 'aggiorna' : 'ok'; });
        return out;
    }
    function lavoro(testo) {
        T.lavoroMateriali = testo;
        // durante i lotti si aggiorna solo la riga di avanzamento, non tutta la vista
        const p = testo && document.querySelector('#tice [data-lavoro-materiali]');
        if (p) p.innerHTML = String(h`${icona('spinner fa-spin')} ${testo}`);
        else TiceHome.ridisegna();
    }
    // Esito di un lavoro su più set: un avviso se è andato tutto bene, altrimenti il dettaglio
    async function esito(verbo, fatti, falliti) {
        if (!falliti.length) { avviso(fatti.length === 1 ? `«${fatti[0]}» ${verbo}` : `${fatti.length} set ${verbo.replace(/o$/, 'i')}`); return; }
        await foglio(h`<h2>${fatti.length} set ${verbo.replace(/o$/, 'i')}, ${falliti.length} no</h2>
            <div class="opzioni" style="max-height:50vh;overflow-y:auto">
                ${falliti.map((x) => h`<div class="opzione">${icona('triangle-exclamation')}<span class="corpo">${x.nome}<small>${x.errore}</small></span></div>`)}
            </div>
            <p class="sotto">Gli altri sono a posto: puoi riprovare solo questi.</p>
            <div class="bottoni"><button class="bt primario" data-foglio="chiudi">Ho capito</button></div>`);
    }

    // Scarica uno o più set; le immagini già prese per un set non si richiedono per gli altri
    async function scarica(ids) {
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const presi = {}, fatti = [], falliti = [];
        for (let n = 0; n < ids.length; n++) {
            const id = ids[n], pre = ids.length > 1 ? `Set ${n + 1} di ${ids.length} · ` : '';
            try {
                lavoro(pre + 'scaricamento…');
                const set = await Y.chiama('materiali.set', { id });
                const hs = hashDi(set), nuovi = hs.filter((x) => !presi[x]);
                for (let i = 0; i < nuovi.length; i += 40) {
                    lavoro(`${pre}immagini ${Math.min(i + 40, nuovi.length)} di ${nuovi.length}…`);
                    Object.assign(presi, await Y.chiama('materiali.immagini', { hashes: nuovi.slice(i, i + 40) }));
                }
                const locale = sostituisci(set, presi);
                const esistente = setLocali().find((s) => s.centro && s.centro.id === id);
                locale.id = esistente ? esistente.id : id;
                locale.centro = { id, versione: set.versione, aggiornato: set.aggiornato };
                delete locale.versione; delete locale.aggiornato; delete locale.aggiornatoDa;
                await DB.saveSet(locale);
                await ricaricaSet();
                fatti.push(locale.name);
            } catch (e) { falliti.push({ nome: (ind[id] && ind[id].nome) || id, errore: e.message }); }
        }
        lavoro(null);
        await esito('scaricato', fatti, falliti);
    }
    const scaricaSet = (b) => scarica([b.dataset.id]);
    function scaricaTutti() {
        const stati = statiMateriali();
        return scarica(Object.keys(stati).filter((id) => stati[id] !== 'ok'));
    }

    async function pubblicaSet() {
        const sets = setLocali().filter((s) => !(s.modes || []).some((m) => m === 'quaderno' || m === 'quaderno_task'))
            .slice().sort((a, b) => ((a.category || '') + a.name).localeCompare((b.category || '') + b.name, 'it'));
        if (!sets.length) { avviso('Nel tuo archivio non ci sono set da pubblicare.'); return; }
        const ind = (T.indiceMateriali && T.indiceMateriali.sets) || {};
        const categorie = [...new Set(sets.map((s) => s.category || ''))].filter(Boolean);
        const nota = (s) => {
            const c = s.centro && ind[s.centro.id];
            return c ? ' · già nel centro (v' + c.versione + ')' : s.centro ? ' · dal centro' : '';
        };
        const r = await foglio(h`<form><h2>Pubblica set</h2>
            <p class="sotto">Le colleghe li troveranno nei materiali del centro. Un set già pubblicato o scaricato dal centro viene aggiornato. Le immagini in comune tra più set viaggiano una volta sola.</p>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                <input type="search" placeholder="Cerca" data-filtro-set autocomplete="off" style="flex:1;min-width:140px">
                ${categorie.length > 1 ? h`<select data-filtro-cat style="flex:none;max-width:45%"><option value="">Tutte le categorie</option>${categorie.map((c) => h`<option value="${c}">${c}</option>`)}</select>` : ''}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
                <button type="button" class="bt piccolo" data-sel="tutti">Tutti quelli visibili</button>
                <button type="button" class="bt piccolo" data-sel="nuovi">Solo i nuovi</button>
                <button type="button" class="bt piccolo" data-sel="nessuno">Nessuno</button>
            </div>
            <div class="opzioni" style="max-height:44vh;overflow-y:auto" data-elenco-set>
                ${sets.map((s) => h`<label class="opzione" data-nome="${String(s.name + ' ' + (s.category || '')).toLowerCase()}" data-cat="${s.category || ''}" data-nuovo="${s.centro ? '' : '1'}"><input type="checkbox" name="id" value="${s.id}">
                    <span class="corpo">${s.name}<small>${[s.category, (s.items || []).length + ' elementi'].filter(Boolean).join(' · ')}${nota(s)}</small></span></label>`)}
            </div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario" data-conta disabled>Pubblica</button></div></form>`,
        {
            invia: (f) => ({ ids: new FormData(f).getAll('id') }),
            dopo: (f) => {
                const q = f.querySelector('[data-filtro-set]'), cat = f.querySelector('[data-filtro-cat]'), ok = f.querySelector('[data-conta]');
                const righe = [...f.querySelectorAll('[data-elenco-set] > label')];
                const conta = () => { const n = righe.filter((l) => l.querySelector('input').checked).length; ok.disabled = !n; ok.textContent = n > 1 ? `Pubblica ${n} set` : 'Pubblica'; };
                const filtra = () => {
                    const v = q.value.trim().toLowerCase(), c = cat ? cat.value : '';
                    righe.forEach((l) => { l.hidden = !l.querySelector('input').checked && ((!!v && !l.dataset.nome.includes(v)) || (!!c && l.dataset.cat !== c)); });
                };
                q.addEventListener('input', filtra);
                if (cat) cat.addEventListener('change', filtra);
                f.addEventListener('change', (e) => { if (e.target.name === 'id') conta(); });
                f.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => {
                    const modo = b.dataset.sel;
                    if (modo !== 'nessuno') filtra();
                    righe.forEach((l) => {
                        const i = l.querySelector('input');
                        if (modo === 'nessuno') i.checked = false;
                        else if (!l.hidden) i.checked = modo === 'tutti' || !!l.dataset.nuovo;
                    });
                    filtra(); conta();
                }));
            }
        });
        if (!r || !r.ids || !r.ids.length) return;
        await pubblica(r.ids);
    }
    async function pubblica(ids) {
        const fatti = [], falliti = [];
        const scelti = ids.map((id) => setLocali().find((s) => s.id === id)).filter(Boolean);
        try {
            // 1. ogni set con i file al posto delle immagini; i file di tutti in un solo elenco
            const pronti = [], file = {};
            for (let n = 0; n < scelti.length; n++) {
                const locale = scelti[n];
                lavoro(`Preparazione ${n + 1} di ${scelti.length}…`);
                try {
                    const copia = JSON.parse(JSON.stringify(locale));
                    const idCentro = (copia.centro && copia.centro.id) || String(copia.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
                    delete copia.centro;
                    copia.id = idCentro;
                    const p = await perRiferimento(copia);
                    Object.assign(file, p.file);
                    pronti.push({ locale, idCentro, set: p.set });
                } catch (e) { falliti.push({ nome: locale.name, errore: e.message }); }
            }
            // 2. le immagini che il centro non ha ancora, a lotti
            const tutti = Object.keys(file), mancanti = [];
            for (let i = 0; i < tutti.length; i += 5000) mancanti.push(...await Y.chiama('materiali.mancanti', { hashes: tutti.slice(i, i + 5000) }));
            let lotto = {}, peso = 0, inviati = 0;
            const invia = async () => {
                if (!Object.keys(lotto).length) return;
                await Y.chiama('materiali.caricaImmagini', { immagini: lotto });
                inviati += Object.keys(lotto).length; lotto = {}; peso = 0;
                lavoro(`Caricamento immagini ${inviati} di ${mancanti.length}…`);
            };
            if (mancanti.length) lavoro(`Caricamento immagini 0 di ${mancanti.length}…`);
            for (const hs of mancanti) {
                if (Object.keys(lotto).length >= 40 || peso + file[hs].length > 12e6) await invia();
                lotto[hs] = file[hs]; peso += file[hs].length;
            }
            await invia();
            // 3. i set, uno alla volta: se uno non passa, gli altri vanno avanti
            const indice = await Y.chiama('materiali.indice');
            for (let n = 0; n < pronti.length; n++) {
                const { locale, idCentro, set } = pronti[n];
                lavoro(pronti.length > 1 ? `Pubblicazione ${n + 1} di ${pronti.length}…` : 'Pubblicazione…');
                try {
                    const prima = (indice.sets || {})[idCentro];
                    const voce = await Y.chiama('materiali.pubblica', { set, versioneBase: prima ? prima.versione : 0 });
                    locale.centro = { id: idCentro, versione: voce.versione, aggiornato: voce.aggiornato };
                    await DB.saveSet(locale);
                    fatti.push(locale.name);
                } catch (e) { falliti.push({ nome: locale.name, errore: e.message }); }
            }
            await ricaricaSet();
        } catch (e) {
            // un errore prima della pubblicazione (rete, immagini) ferma tutto
            scelti.filter((s) => !fatti.includes(s.name) && !falliti.some((x) => x.nome === s.name)).forEach((s) => falliti.push({ nome: s.name, errore: e.message }));
        }
        T.indiceMateriali = null;
        lavoro(null);
        await esito('pubblicato', fatti, falliti);
    }

    // =====================================================================
    // Registrazione
    // =====================================================================
    TiceHome.estendi({
        viste: { account: vistaAccount, persone: vistaPersone, versioni: vistaVersioni, materiali: vistaMateriali, dispositivi: vistaDispositivi },
        azioni: {
            'vai-account': () => vai('account'),
            'vai-persone': () => { T.accessi = null; vai('persone'); },
            'vai-materiali': () => { T.indiceMateriali = null; vai('materiali'); },
            'crea-chiave': creaChiave,
            'inserisci-chiave': inserisciChiave,
            sincronizza: () => Y.sincronizza().then((ok) => avviso(ok ? 'Sincronizzato' : (S.errore || 'Sincronizzazione non riuscita'), ok ? undefined : 'errore')),
            'controlla-chiave': () => Y.preparaCentro().then(() => { if (!Y.pronto()) avviso('La chiave non è ancora arrivata.'); }).catch((e) => avviso(e.message, 'errore')),
            'mostra-chiave': mostraChiave,
            'cambia-chiave': cambiaChiave,
            'vai-dispositivi': () => { T.elencoDisp = null; vai('dispositivi'); },
            'togli-dispositivo': async (b) => {
                if (!await conferma('Togliere questo dispositivo?', 'Perde la chiave del centro. Se la persona è ancora abilitata e rientra, il dispositivo si registra di nuovo e la riceve. Per chiudere fuori qualcuno, toglila da Persone e accessi.', { ok: 'Togli', pericolo: true })) return;
                try { T.elencoDisp = await Y.togliDispositivo(b.dataset.id); } catch (e) { avviso(e.message, 'errore'); }
                TiceHome.ridisegna();
            },
            esci: async () => {
                const r = await foglio(h`<h2>Esci</h2>
                    <p class="sotto">Su un dispositivo personale puoi uscire lasciando i dati: ritrovi tutto al prossimo accesso. Su un dispositivo condiviso cancella i dati del centro.</p>
                    ${S.coda.size ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.coda.size} bambini hanno modifiche non ancora inviate: se cancelli i dati andranno perse.</div></div>` : ''}
                    <div class="opzioni">
                        <button class="opzione" data-foglio="tieni">${icona('right-from-bracket')}<span class="corpo">Esci e basta</span></button>
                        <button class="opzione" data-foglio="cancella">${icona('trash')}<span class="corpo">Esci e cancella i dati del centro da questo dispositivo<small>Anche la chiave del centro</small></span></button>
                    </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button></div>`);
                if (!r) return;
                await Y.esci(r === 'cancella');
                vai('bambini');
            },
            persona: (b) => persona(b.dataset.email),
            versione,
            'scarica-set': scaricaSet,
            'scarica-tutti': scaricaTutti,
            'pubblica-set': pubblicaSet
        },
        aggancio: { chip, banner, pillola, opzioniBambino, sceltaBambino, opzioniMenu, sceltaMenu, nuovoBambino, puoProgrammi, dopo, limitato: tirocinante }
    });

    Y.alCambio((cosa) => {
        if (cosa === 'stato') aggiornaRuolo();
        if (cosa === 'stato' || cosa === 'coda' || cosa === 'pazienti' || String(cosa).indexOf('paziente:') === 0) {
            if (cosa === 'pazienti' && typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            // non si ridisegna sotto le dita di chi sta segnando: solo il chip e gli elenchi
            const v = TiceHome.attuale().vista;
            if (v === 'seduta' && (cosa === 'stato' || cosa === 'coda')) {
                const c = document.querySelector('#tice .tice-stato');
                if (c) c.outerHTML = String(chip());
                return;
            }
            TiceHome.ridisegna();
        }
    });
    const parti = () => { limitaApp(); Y.avvia().catch((e) => console.error('avvio sincronizzazione', e)); };
    if (document.readyState === 'complete') parti(); else window.addEventListener('load', parti);
})();
