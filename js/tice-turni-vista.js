/**
 * Vista dei turni (js/tice-turni.js per i dati): la giornata come il foglio
 * fatto a mano, bambini in colonna e fasce orarie in riga; negli incroci chi
 * prende il bambino. Si assegna toccando una cella, oppure "a pennello":
 * si sceglie una persona (o una coppia) in alto e si toccano le celle.
 *
 * Nel centro i turni stanno sul custode, cifrati con la chiave del centro
 * (li vedono tutti, li cambia chi gestisce i programmi); senza centro
 * restano su questo dispositivo.
 */
(function () {
    'use strict';
    if (!window.TiceHome || !window.TiceTurni) return;
    const X = TiceHome.strumenti;
    const { h, grezzo, icona, foglio, conferma, avviso, barra } = X;
    const TT = window.TiceTurni;
    const Y = window.TiceSync;
    const oraT = (x) => (window.Orario ? Orario.oraTesto(x) : x);
    const oggi = () => TT.iso(new Date());

    const S = { giorno: oggi(), sett: null, chiave: null, persone: [], modello: null, personeCaricate: false, caricando: false, errore: '', offline: false, pennello: [] };

    // ---------- dove stanno i dati ----------
    const remoto = () => !!(Y && Y.attivo() && Y.S.io && Y.pronto && Y.pronto());
    const puo = () => !X.limitato() && (!remoto() || Y.puo('programmi'));
    function locale() { try { return JSON.parse(localStorage.getItem('tice_turni') || '{}'); } catch (e) { return {}; } }
    function salvaLocale(L) { localStorage.setItem('tice_turni', JSON.stringify(L)); }
    async function leggi(k) {
        if (remoto()) { const r = await Y.leggiTurni(k); return { dati: r.dati, offline: !!r.offline }; }
        return { dati: locale()[k] || null, offline: false };
    }
    async function modifica(k, fn) {
        if (remoto()) return Y.modificaTurni(k, fn);
        const L = locale();
        L[k] = fn(L[k] ? JSON.parse(JSON.stringify(L[k])) : null);
        salvaLocale(L);
        return L[k];
    }

    // ---------- caricamento ----------
    async function carica(forza) {
        const k = TT.lunedi(S.giorno);
        if (S.caricando || (!forza && S.chiave === k && S.personeCaricate)) return;
        S.caricando = true; S.errore = '';
        try {
            const serve = forza || !S.personeCaricate;
            const [sett, pers, mod] = await Promise.all([leggi(k), serve ? leggi('persone') : null, serve ? leggi('modello') : null]);
            S.sett = sett.dati || TT.vuota();
            S.offline = sett.offline;
            S.chiave = k;
            if (pers) { S.persone = (pers.dati && pers.dati.persone) || []; S.personeCaricate = true; setTimeout(() => allineaAlCentro(), 0); }
            if (mod) S.modello = mod.dati || TT.modelloVuoto();
        } catch (e) {
            S.errore = e.message || String(e);
        }
        S.caricando = false;
        TiceHome.ridisegna();
    }
    // Una modifica alla settimana: subito a schermo, poi salvata
    async function cambiaSettimana(fn, giorno) {
        const k = TT.lunedi(giorno || S.giorno);
        if (k === S.chiave) { S.sett = fn(JSON.parse(JSON.stringify(S.sett || TT.vuota()))); TiceHome.ridisegna(); }
        try {
            const nuova = await modifica(k, (d) => fn(d || TT.vuota()));
            if (k === S.chiave) { S.sett = nuova; TiceHome.ridisegna(); }
        } catch (e) {
            avviso('Turni non salvati: ' + (e.message || e), 'errore');
            S.chiave = null; carica(true);
        }
    }
    // Una modifica a una giornata: se seguiva la settimana tipo, prima diventa propria
    const cambiaGiorno = (g, fn) => cambiaSettimana((d) => fn(TT.materializza(d, g, S.modello)), g);
    async function cambiaModello(fn) {
        S.modello = fn(JSON.parse(JSON.stringify(S.modello || TT.modelloVuoto())));
        TiceHome.ridisegna();
        try { S.modello = await modifica('modello', (x) => fn(x || TT.modelloVuoto())); }
        catch (e) { avviso('Settimana tipo non salvata: ' + (e.message || e), 'errore'); S.personeCaricate = false; carica(true); }
        TiceHome.ridisegna();
    }
    async function cambiaPersone(fn) {
        S.persone = fn(S.persone.slice());
        TiceHome.ridisegna();
        try {
            const d = await modifica('persone', (x) => ({ persone: fn(((x && x.persone) || []).slice()) }));
            S.persone = d.persone;
        } catch (e) { avviso('Persone non salvate: ' + (e.message || e), 'errore'); S.personeCaricate = false; carica(true); }
        TiceHome.ridisegna();
    }

    // ---------- persone del centro: la lista si allinea a «Persone e accessi» ----------
    // Chi ha accesso entra da solo con il nome assegnato là (mai la mail); se il
    // nome cambia si aggiorna, se l'accesso viene tolto esce. Le persone aggiunte
    // a mano (senza account) restano come sono.
    function nomeLeggibile(nome, email) {
        const n = String(nome || '').trim(), locale = String(email || '').split('@')[0];
        if (n && !n.includes('@') && n.toLowerCase() !== locale.toLowerCase()) return n;
        // nessun nome assegnato: dalla mail, ma come nome ("mario.rossi" → "Mario Rossi")
        return locale.split(/[._-]+/).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ') || locale;
    }
    function personeDalCentro(a) {
        const out = [];
        const prop = String(a.proprietario || '').toLowerCase();
        Object.entries(a.utenti || {}).forEach(([email, u]) => {
            if (u.attivo === false || (u.scadenza && u.scadenza < oggi())) return;
            out.push({ email: email.toLowerCase(), nome: nomeLeggibile(u.nome, email), ruolo: u.ruolo === 'tirocinante' ? 'tirocinante' : 'terapeuta' });
        });
        if (prop && !out.some((x) => x.email === prop)) {
            const io = Y.S && Y.S.io && Y.S.io.email === prop ? Y.S.io.nome : '';
            out.push({ email: prop, nome: nomeLeggibile(io, prop), ruolo: 'terapeuta' });
        }
        return out;
    }
    function allinea(lista, centro) {
        const out = [];
        let cambiate = false;
        lista.forEach((p) => {
            const em = p.email ? p.email.toLowerCase() : null;
            // senza mail ma con la mail come nome (aggiunta prima): la si collega
            const c = centro.find((x) => x.email === em) || (!em && centro.find((x) => x.email === String(p.nome || '').trim().toLowerCase()));
            if (!c) { if (em) { cambiate = true; return; } out.push(p); return; }   // accesso tolto: esce
            const n = Object.assign({}, p, { email: c.email, nome: c.nome });
            if (n.nome !== p.nome || n.email !== p.email) cambiate = true;
            out.push(n);
        });
        centro.forEach((c) => {
            if (out.some((p) => p.email === c.email)) return;
            // una persona già scritta a mano con lo stesso nome diventa quella del centro
            const uguale = out.find((p) => !p.email && p.nome.toLowerCase() === c.nome.toLowerCase());
            if (uguale) uguale.email = c.email; else out.push({ id: TT.nuovoId('p'), nome: c.nome, ruolo: c.ruolo, email: c.email });
            cambiate = true;
        });
        return { lista: out, cambiate };
    }
    let ultimoAllineamento = 0;
    async function allineaAlCentro(forza) {
        if (!remoto() || !(Y.eAdmin && Y.eAdmin()) || !S.personeCaricate) return;
        if (!forza && Date.now() - ultimoAllineamento < 60000) return;
        ultimoAllineamento = Date.now();
        try {
            const centro = personeDalCentro(await Y.chiama('accessi.leggi'));
            if (allinea(S.persone, centro).cambiate) await cambiaPersone((l) => allinea(l, centro).lista);
        } catch (e) { console.warn('persone del centro', e); }
    }

    // ---------- nomi ----------
    const nomeBambino = (pid) => {
        const p = X.paz(pid);
        if (p) return p.name;
        const e = Y && Y.S && Y.S.etichette && Y.S.etichette[pid];
        return e && e.nome ? e.nome : '—';
    };
    const persona = (id) => S.persone.find((p) => p.id === id);
    const nomePersona = (id) => (persona(id) || {}).nome || '?';
    const breve = (nome) => { const p = String(nome || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : p[0] || '?'; };
    function lunga(g) {
        const d = TT.daIso(g);
        const s = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        return g === oggi() ? 'Oggi, ' + s : s.charAt(0).toUpperCase() + s.slice(1);
    }

    // ---------- vista ----------
    function vistaTurni() {
        if (S.chiave !== TT.lunedi(S.giorno) || !S.personeCaricate) carica();
        else allineaAlCentro();
        const modifica = puo();
        const gi = TT.giornata(S.sett, S.giorno, S.modello);
        const conf = TT.conflitti(gi.voci, nomePersona, nomeBambino, oraT);
        // chi organizza vede tutte le fasce (per riempirle); chi guarda e il foglio stampato solo quelle riempite
        const tutte = S.tutteOre == null ? modifica : S.tutteOre;
        const ridotte = !tutte && gi.usate.length && gi.usate.length < gi.fasce.length;
        const ora0 = new Date(), adesso = ora0.getHours() * 60 + ora0.getMinutes();
        const righe = ridotte ? gi.usate : gi.fasce;
        const terapeuti = S.persone.filter((p) => p.ruolo !== 'tirocinante'), tiro = S.persone.filter((p) => p.ruolo === 'tirocinante');
        const chip = (p) => h`<button class="tt-pers ${S.pennello.includes(p.id) ? 'attiva' : ''} ${p.ruolo === 'tirocinante' ? 'tiro' : ''}" data-a="tt-pennello" data-id="${p.id}" aria-pressed="${S.pennello.includes(p.id)}">${p.nome}</button>`;
        const cella = (pid, ora) => {
            const v = gi.celle[pid + '|' + ora];
            const c = TT.colore(pid);
            return h`<td class="tt-cella ${v && conf[v.id] ? 'conf' : ''} ${TT.presente(gi, pid, ora) ? '' : 'fuori'}" style="--c:${c};--t:${TT.tinta(c, 0.10)}">
                <button class="tt-in" ${modifica ? grezzo(`data-a="tt-cella" data-pid="${pid}" data-ora="${ora}"`) : X.paz(pid) ? grezzo(`data-a="apri-bambino" data-pid="${pid}"`) : grezzo('disabled')} title="${v && conf[v.id] ? conf[v.id].join(' · ') : nomeBambino(pid) + ', ' + oraT(ora)}">
                    ${v ? (v.persone || []).map((p) => h`<span class="tt-nome ${(persona(p) || {}).ruolo === 'tirocinante' ? 'tiro' : ''}">${breve(nomePersona(p))}</span>`) : ''}
                    ${v && v.nota ? h`<span class="tt-nota">${v.nota}</span>` : ''}
                    ${v && conf[v.id] ? h`<span class="tt-avviso">${icona('triangle-exclamation')}</span>` : ''}
                    ${!v && modifica ? h`<span class="tt-piu">+</span>` : ''}
                </button></td>`;
        };
        return h`${barra({ titolo: S.giorno === oggi() ? 'Oggi' : 'Turni', sotto: { testo: S.giorno === oggi() ? lunga(S.giorno).replace(/^Oggi, /, '') : lunga(S.giorno), azione: 'tt-data' },
                destra: h`<button class="ib" data-a="tt-stampa" aria-label="Stampa i turni" title="Stampa i turni">${icona('print')}</button>
                    <button class="ib" data-a="vai-elenco" aria-label="Tutti i bambini" title="Tutti i bambini">${icona('children')}</button>
                    <button class="ib" data-a="giochi" aria-label="Giochi e attività dell'app" title="Giochi e attività">${icona('gamepad')}</button>
                    <button class="ib" data-a="menu" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main tt-main">
                ${X.banner()}
                <div class="tt-nav">
                    <button class="bt piccolo" data-a="tt-giorno" data-d="-1" aria-label="Giorno prima">${icona('chevron-left')}</button>
                    <button class="bt piccolo" data-a="tt-oggi">Oggi</button>
                    <button class="bt piccolo" data-a="tt-giorno" data-d="1" aria-label="Giorno dopo">${icona('chevron-right')}</button>
                    <div class="tt-settimana">${TT.giorni(TT.lunedi(S.giorno), true).map((g) => h`<button class="tt-g ${g === S.giorno ? 'scelto' : ''} ${g === oggi() ? 'oggi' : ''}" data-a="tt-vai" data-g="${g}">
                        <small>${TT.breveGiorno(g)}</small>${TT.daIso(g).getDate()}${S.sett && TT.giornata(S.sett, g, S.modello).bambini.length ? h`<i class="tt-punto"></i>` : ''}</button>`)}</div>
                </div>
                ${S.errore ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.errore}</div></div>` : ''}
                ${S.offline ? h`<div class="banda">${icona('wifi')}<div>Senza connessione: vedi l'ultima versione scaricata, le modifiche quando torna la rete.</div></div>` : ''}
                ${!modifica ? h`<div class="banda">${icona('lock')}<div>I turni li organizzano le professioniste: qui li vedi.</div></div>` : ''}
                ${gi.virtuale ? h`<p class="sotto piccolo tt-origine">${icona('repeat')} Dalla settimana tipo. Le modifiche di oggi valgono solo per questo giorno.</p>` : ''}
                ${gi.propria && modifica && S.modello && (S.modello.voci || []).some((x) => x.dow === TT.dow(S.giorno)) ? h`<p class="sotto piccolo tt-origine">${icona('pen')} Giornata modificata rispetto alla settimana tipo · <button class="link" data-a="tt-ripristina">torna alla settimana tipo</button></p>` : ''}
                ${S.caricando && !S.sett ? h`<p class="sotto">${icona('spinner fa-spin')} Carico i turni…</p>` : ''}
                ${modifica && !S.persone.length && S.personeCaricate ? h`<div class="scheda imbottita"><b>Chi fa i turni?</b>
                    <p class="sotto">Aggiungi terapeuti e tirocinanti: poi li assegni ai bambini toccando le celle.</p>
                    <button class="bt primario" data-a="tt-persone">${icona('users')} Persone dei turni</button></div>` : ''}
                ${modifica && S.persone.length && gi.bambini.length ? h`<div class="tt-pennello">
                    <span class="sotto piccolo">${S.pennello.length ? 'Tocca le celle per mettere o togliere ' + S.pennello.map((id) => breve(nomePersona(id))).join(' + ') : 'Assegna veloce: scegli una persona (o due) e tocca le celle'}</span>
                    <div class="tt-chips">${terapeuti.map(chip)}${tiro.length ? h`<span class="tt-sep"></span>${tiro.map(chip)}` : ''}${S.pennello.length ? h`<button class="tt-pers fine" data-a="tt-pennello-fine">Fatto</button>` : ''}</div></div>` : ''}
                ${gi.bambini.length ? h`<div class="tt-griglia-box"><table class="tt-griglia">
                    <thead><tr><th class="tt-angolo"></th>${gi.bambini.map((pid) => { const c = TT.colore(pid); return h`<th class="tt-bambino" style="--c:${c};--t:${TT.tinta(c, 0.16)}">
                        ${X.paz(pid) ? h`<button class="tt-apri" data-a="apri-bambino" data-pid="${pid}" title="Apri la presa dati di ${nomeBambino(pid)}">${nomeBambino(pid)} ${icona('arrow-right')}</button>` : nomeBambino(pid)}</th>`; })}</tr></thead>
                    <tbody>${righe.map((ora) => h`<tr class="${S.giorno === oggi() && adesso >= TT.minuti(ora) && adesso < TT.minuti(TT.fineFascia(gi, ora)) ? 'adesso' : ''}"><th class="tt-ora">${oraT(ora)}<small>${oraT(TT.fineFascia(gi, ora))}</small></th>${gi.bambini.map((pid) => cella(pid, ora))}</tr>`)}</tbody>
                </table></div>
                ${gi.usate.length && gi.usate.length < gi.fasce.length ? h`<button class="bt piccolo fantasma tt-tutte" data-a="tt-tutte">${icona(ridotte ? 'up-down' : 'compress')} ${ridotte ? `Mostra tutte le ore (${oraT(gi.da)}–${oraT(gi.a)})` : 'Solo le ore con turni'}</button>` : ''}
                ${Object.keys(conf).length ? h`<p class="sotto piccolo tt-conf-nota">${icona('triangle-exclamation')} Celle in rosso: la stessa persona con due bambini insieme, o un bambino con due turni.</p>` : ''}`
                : S.sett ? h`<div class="vuoto">Nessun bambino in questa giornata.
                    ${modifica ? h`<div class="bottoni" style="justify-content:center;margin-top:12px">${!(S.modello && (S.modello.voci || []).length) ? h`<button class="bt primario" data-a="vai-modello">${icona('calendar-week')} Prepara la settimana tipo</button>` : ''}
                    <button class="bt ${S.modello && (S.modello.voci || []).length ? 'primario' : ''}" data-a="tt-bambini">${icona('child')} Scegli i bambini</button>
                    <button class="bt" data-a="tt-copia">${icona('copy')} Copia da un altro giorno</button></div>` : ''}</div>` : ''}
                <button class="bt largo tt-apri-altro" data-a="tt-apri">${icona('child-reaching')} Apri un bambino <span class="sotto piccolo">· anche se non è in calendario</span></button>
                ${modifica ? h`<div class="bottoni tt-strumenti">
                    <button class="bt" data-a="vai-modello">${icona('calendar-week')} Settimana tipo</button>
                    <button class="bt" data-a="tt-bambini">${icona('child')} Bambini del giorno</button>
                    <button class="bt" data-a="tt-copia">${icona('copy')} Copia / ripeti</button>
                    <button class="bt" data-a="tt-persone">${icona('users')} Persone</button>
                    <button class="bt" data-a="tt-orari">${icona('clock')} Orari</button></div>` : ''}
                ${riepilogo(gi)}
            </main>`;
    }
    // ---------- settimana tipo ----------
    // Righe = bambini, colonne = giorni; in ogni incrocio quando viene e con chi di solito.
    function vistaModello() {
        if (!S.personeCaricate) carica();
        const m = S.modello || TT.modelloVuoto();
        const modifica = puo();
        const conDom = (m.voci || []).some((x) => x.dow === 7);
        const giorniN = conDom ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
        const pids = (m.ordine || []).filter((pid) => (m.voci || []).some((x) => x.pid === pid));
        (m.voci || []).forEach((x) => { if (!pids.includes(x.pid)) pids.push(x.pid); });
        const cella = (pid, d) => {
            const x = (m.voci || []).find((y) => y.pid === pid && y.dow === d);
            const c = TT.colore(pid);
            return h`<td class="tt-mcella ${x ? 'pieno' : ''}" style="--c:${c};--t:${TT.tinta(c, 0.12)}">
                <button class="tt-in" ${modifica ? grezzo(`data-a="tt-mcella" data-pid="${pid}" data-dow="${d}"`) : grezzo('disabled')}>
                    ${x ? h`<span class="tt-mquando">${oraT(x.da)}–${oraT(x.a)}</span>${(x.persone || []).map((p) => h`<span class="tt-nome ${(persona(p) || {}).ruolo === 'tirocinante' ? 'tiro' : ''}">${breve(nomePersona(p))}</span>`)}` : modifica ? h`<span class="tt-piu">+</span>` : ''}
                </button></td>`;
        };
        const ore = (m.voci || []).reduce((t, x) => t + TT.minuti(x.a) - TT.minuti(x.da), 0);
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Settimana tipo', sotto: { testo: pids.length ? `${pids.length} bambini · ${Math.round(ore / 60)} ore a settimana` : 'Chi viene, quando, con chi' } })}
            <main class="tice-main tt-main">
                <p class="sotto">La settimana che si ripete: ogni giornata del calendario parte da qui. Un cambio dell'ultimo minuto si fa sulla giornata e vale solo per quel giorno; le modifiche qui valgono per tutti i giorni non ritoccati.</p>
                ${!modifica ? h`<div class="banda">${icona('lock')}<div>La settimana tipo la organizzano le professioniste: qui la vedi.</div></div>` : ''}
                ${pids.length ? h`<div class="tt-griglia-box"><table class="tt-griglia tt-modello">
                    <thead><tr><th class="tt-angolo"></th>${giorniN.map((d) => h`<th class="tt-giorno-m">${TT.GIORNI[d - 1]}</th>`)}</tr></thead>
                    <tbody>${pids.map((pid) => { const c = TT.colore(pid); return h`<tr><th class="tt-bambino tt-bambino-riga" style="--c:${c};--t:${TT.tinta(c, 0.16)}">${nomeBambino(pid)}</th>${giorniN.map((d) => cella(pid, d))}</tr>`; })}</tbody>
                </table></div>` : h`<div class="vuoto">Ancora nessun bambino nella settimana tipo.</div>`}
                ${modifica ? h`<div class="bottoni tt-strumenti">
                    <button class="bt primario" data-a="tt-maggiungi">${icona('plus')} Aggiungi un bambino</button>
                    <button class="bt" data-a="tt-morari">${icona('clock')} Orari di serie</button>
</div>` : ''}
            </main>`;
    }
    // Il foglio per un bambino in uno o più giorni della settimana tipo
    function moduloModello(pid, dowScelti, x) {
        const m = S.modello || TT.modelloVuoto();
        const c = Object.assign({}, TT.GIORNATA, m.orari || {});
        // inizio libero, ore a tagli (50, 60 minuti…) × quante: la fine si calcola da sola
        let ultimoTaglio = 0; try { ultimoTaglio = +localStorage.getItem('tice_turni_taglio') || 0; } catch (e) { /* niente */ }
        const taglio = (x && x.taglio) || ultimoTaglio || +c.fascia || 60;
        const da = (x && x.da) || c.da;
        const n = (x && x.n) || (x ? Math.max(1, Math.round((TT.minuti(x.a) - TT.minuti(x.da)) / taglio)) : 2);
        const a = (x && x.a) || TT.hhmm(TT.minuti(da) + n * taglio);
        const TAGLI = [30, 40, 45, 50, 55, 60, 90];
        const gia = (x && x.persone) || [];
        const riga = (p) => h`<label class="spunta-riga tt-scelta"><input type="checkbox" name="p" value="${p.id}" ${gia.includes(p.id) ? grezzo('checked') : ''}><span>${p.nome}</span></label>`;
        const tutti = X.pazienti().slice().sort((u, v) => String(u.name).localeCompare(String(v.name), 'it'));
        return foglio(h`<form><h2>${pid ? nomeBambino(pid) : 'Aggiungi un bambino'}</h2>
            ${pid ? '' : h`<label class="campo"><span>Bambino</span><select name="pid" class="campo-in" required><option value="">Scegli…</option>${tutti.map((p) => h`<option value="${p.id}">${p.name}</option>`)}</select></label>`}
            <div class="campo"><span>Giorni</span><div class="tt-dow">${[1, 2, 3, 4, 5, 6, 7].map((d) => h`<label><input type="checkbox" name="dow" value="${d}" ${dowScelti.includes(d) ? grezzo('checked') : ''}><span>${TT.GIORNI_BREVI[d - 1]}</span></label>`)}</div></div>
            <div class="riga-campi tt-orario">
                <label class="campo"><span>Inizio</span><input name="da" class="campo-in" inputmode="numeric" required value="${da}" placeholder="14:10" autocomplete="off" data-tt-calc></label>
                <label class="campo"><span>Ore da</span><select name="taglio" class="campo-in" data-tt-calc>${TAGLI.concat(TAGLI.includes(taglio) ? [] : [taglio]).map((t) => h`<option value="${t}" ${t === taglio ? grezzo('selected') : ''}>${t} min</option>`)}</select></label>
                <label class="campo"><span>Quante</span><input name="n" type="number" min="1" max="10" class="campo-in" inputmode="numeric" value="${n}" data-tt-calc></label>
                <label class="campo"><span>Fine</span><input name="a" class="campo-in" inputmode="numeric" required value="${a}" autocomplete="off" data-tt-fine></label></div>
            <p class="sotto piccolo" data-tt-spiega></p>
            ${S.persone.length ? h`<div class="campo scelte-stampa"><span>Di solito con (facoltativo)</span>${S.persone.map(riga)}</div>` : ''}
            <div class="bottoni">${x ? h`<button type="button" class="bt" data-foglio="togli">${icona('trash')} Non viene</button>` : ''}
                <button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        {
            dopo: (el) => {
                const fine = el.querySelector('[data-tt-fine]'), spiega = el.querySelector('[data-tt-spiega]');
                const calcola = () => {
                    const i = TT.leggiOra(el.querySelector('[name=da]').value), t = +el.querySelector('[name=taglio]').value, q = +el.querySelector('[name=n]').value;
                    if (!i || !(t > 0) || !(q > 0)) { spiega.textContent = 'Scrivi l\'inizio come 14:10.'; return; }
                    const m = TT.minuti(i) + t * q;
                    if (m >= 24 * 60) { spiega.textContent = 'Si va oltre la mezzanotte: controlla.'; return; }
                    fine.value = TT.hhmm(m);
                    spiega.textContent = `${q} ${q === 1 ? 'ora' : 'ore'} da ${t} minuti: dalle ${oraT(i)} alle ${oraT(fine.value)}.`;
                };
                el.querySelectorAll('[data-tt-calc]').forEach((x) => x.addEventListener('input', calcola));
                el.querySelectorAll('[data-tt-calc]').forEach((x) => x.addEventListener('change', calcola));
                fine.addEventListener('input', () => { spiega.textContent = 'Fine scritta a mano.'; });
                const i0 = TT.leggiOra(el.querySelector('[name=da]').value);
                spiega.textContent = i0 ? `${n} ${n === 1 ? 'ora' : 'ore'} da ${taglio} minuti: dalle ${oraT(i0)} alle ${oraT(a)}.` : '';
            },
            invia: (form) => {
                const fd = new FormData(form);
                const da = TT.leggiOra(fd.get('da')), a = TT.leggiOra(fd.get('a'));
                if (!da || !a) { avviso('Scrivi gli orari come 14:10.', 'errore'); return undefined; }
                try { localStorage.setItem('tice_turni_taglio', String(fd.get('taglio'))); } catch (e) { /* niente */ }
                return { pid: pid || fd.get('pid'), dow: fd.getAll('dow').map(Number), da, a, taglio: +fd.get('taglio'), n: +fd.get('n'), persone: fd.getAll('p') };
            }
        });
    }

    // Chi fa cosa oggi, in breve
    function riepilogo(gi) {
        const righe = S.persone.map((p) => ({ p, v: gi.voci.filter((v) => (v.persone || []).includes(p.id)).sort((a, b) => a.ora.localeCompare(b.ora)) })).filter((x) => x.v.length);
        if (!righe.length) return '';
        return h`<details class="tt-riepilogo" ${S.riepilogoAperto ? grezzo('open') : ''}><summary class="sotto">Per persona (${righe.length})</summary>
            <ul>${righe.map(({ p, v }) => h`<li><b>${p.nome}</b> ${v.map((x) => h`<span class="tt-rchip" style="--c:${TT.colore(x.pid)}">${oraT(x.ora)} ${nomeBambino(x.pid)}</span>`)}</li>`)}</ul></details>`;
    }

    // ---------- schede ----------
    function scegliPersone(v, gi, pid, ora) {
        const occ = TT.occupati(S.sett, S.giorno, ora, pid, S.modello);
        const gia = (v && v.persone) || [];
        const riga = (p) => h`<label class="spunta-riga tt-scelta"><input type="checkbox" name="p" value="${p.id}" ${gia.includes(p.id) ? grezzo('checked') : ''}>
            <span>${p.nome}${occ[p.id] ? h` <span class="pill arancio">con ${nomeBambino(occ[p.id])}</span>` : ''}</span></label>`;
        const t = S.persone.filter((p) => p.ruolo !== 'tirocinante'), r = S.persone.filter((p) => p.ruolo === 'tirocinante');
        return foglio(h`<form><h2>${nomeBambino(pid)}</h2><p class="sotto">${lunga(S.giorno)}, ${oraT(ora)}–${oraT(TT.hhmm(TT.minuti(ora) + gi.fascia))}</p>
            ${S.persone.length ? '' : h`<p class="sotto">Ancora nessuna persona: aggiungile da «Persone dei turni».</p>`}
            ${t.length ? h`<div class="campo scelte-stampa"><span>Terapeuti</span>${t.map(riga)}</div>` : ''}
            ${r.length ? h`<div class="campo scelte-stampa"><span>Tirocinanti</span>${r.map(riga)}</div>` : ''}
            <label class="campo"><span>Nota (facoltativa)</span><input name="nota" maxlength="80" value="${(v && v.nota) || ''}" placeholder="es. piscina, uscita, valutazione"></label>
            <div class="bottoni">${v ? h`<button type="button" class="bt" data-foglio="svuota">${icona('eraser')} Svuota</button>` : ''}
                <button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { invia: (form) => { const fd = new FormData(form); return { persone: fd.getAll('p'), nota: String(fd.get('nota') || '').trim() }; } });
    }

    const azioni = {
        'vai-modello': () => TiceHome.vai('turni-modello'),
        'tt-ripristina': async () => {
            if (!await conferma('Tornare alla settimana tipo?', 'Le modifiche fatte su ' + lunga(S.giorno).toLowerCase() + ' si perdono: la giornata riprende bambini, orari e persone della settimana tipo.', { ok: 'Torna alla settimana tipo' })) return;
            const g = S.giorno;
            cambiaSettimana((d) => TT.ripristina(d, g));
        },
        'tt-mcella': async (b) => {
            if (!puo()) return;
            const pid = b.dataset.pid, d = +b.dataset.dow;
            const x = ((S.modello || {}).voci || []).find((y) => y.pid === pid && y.dow === d);
            const r = await moduloModello(pid, [d], x);
            if (!r) return;
            if (r === 'togli') return cambiaModello((m) => TT.impostaModello(m, pid, d, null));
            if (r.a <= r.da) { avviso('L\'orario di fine viene prima di quello di inizio.', 'errore'); return; }
            cambiaModello((m) => {
                // i giorni tolti dalla scelta (se era quello toccato) e quelli aggiunti
                if (!r.dow.includes(d)) m = TT.impostaModello(m, pid, d, null);
                r.dow.forEach((k) => { m = TT.impostaModello(m, pid, k, { da: r.da, a: r.a, taglio: r.taglio, n: r.n, persone: r.persone }); });
                return m;
            });
        },
        'tt-maggiungi': async () => {
            const r = await moduloModello(null, [], null);
            if (!r || !r.pid || !r.dow.length) { if (r) avviso('Scegli il bambino e almeno un giorno.'); return; }
            if (r.a <= r.da) { avviso('L\'orario di fine viene prima di quello di inizio.', 'errore'); return; }
            cambiaModello((m) => { r.dow.forEach((k) => { m = TT.impostaModello(m, r.pid, k, { da: r.da, a: r.a, taglio: r.taglio, n: r.n, persone: r.persone }); }); return m; });
        },
        'tt-morari': async () => {
            const c = Object.assign({}, TT.GIORNATA, (S.modello || {}).orari || {});
            const r = await foglio(h`<form><h2>Orari di serie</h2><p class="sotto">Le fasce della settimana tipo. Per un solo giorno si cambiano dalla giornata.</p>
                <div class="riga-campi"><label class="campo"><span>Dalle</span><input name="da" class="campo-in" inputmode="numeric" required value="${c.da}"></label>
                <label class="campo"><span>Alle</span><input name="a" class="campo-in" inputmode="numeric" required value="${c.a}"></label>
                <label class="campo"><span>Fasce di</span><select name="fascia" class="campo-in">${[30, 40, 45, 50, 60, 90, 120].map((n) => h`<option value="${n}" ${n === +c.fascia ? grezzo('selected') : ''}>${n} minuti</option>`)}</select></label></div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r) return;
            const da = TT.leggiOra(r.da), a = TT.leggiOra(r.a);
            if (!da || !a || a <= da) { avviso('Scrivi gli orari come 14:10 e 18:10.', 'errore'); return; }
            cambiaModello((m) => Object.assign(m, { orari: { da, a, fascia: +r.fascia } }));
        },
        'tt-giorno': (b) => { S.giorno = TT.piu(S.giorno, +b.dataset.d); TiceHome.ridisegna(); },
        // apre il foglio di presa dati di un bambino qualsiasi (anche fuori calendario)
        'tt-apri': async () => {
            const tutti = X.pazienti().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
            if (!tutti.length) { TiceHome.vai('bambini'); return; }
            const gi = TT.giornata(S.sett, S.giorno, S.modello);
            const oggiCal = tutti.filter((p) => gi.bambini.includes(p.id)), altri = tutti.filter((p) => !gi.bambini.includes(p.id));
            const voce = (p) => h`<button class="opzione" data-foglio="${'p:' + p.id}"><span class="corpo">${p.name}${p.category ? h`<small>${p.category}</small>` : ''}</span>${icona('chevron-right')}</button>`;
            const r = await foglio(h`<h2>Apri un bambino</h2>
                ${tutti.length > 8 ? h`<input class="cerca" type="search" placeholder="Cerca" aria-label="Cerca un bambino" data-filtra-foglio>` : ''}
                ${oggiCal.length ? h`<p class="eti">In calendario ${S.giorno === oggi() ? 'oggi' : lunga(S.giorno).toLowerCase()}</p><div class="opzioni">${oggiCal.map(voce)}</div><p class="eti">Gli altri</p>` : ''}
                <div class="opzioni">${altri.map(voce)}</div>
                <div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button></div>`, {
                dopo: (f) => {
                    const c = f.querySelector('[data-filtra-foglio]');
                    if (c) c.oninput = () => { const q = c.value.trim().toLowerCase(); f.querySelectorAll('.opzione').forEach((o) => { o.hidden = q && !o.textContent.toLowerCase().includes(q); }); };
                }
            });
            if (r && r.indexOf('p:') === 0) { X.T.aperte = {}; TiceHome.vai('seduta', r.slice(2)); }
        },
        'tt-tutte': () => { S.tutteOre = !(S.tutteOre == null ? puo() : S.tutteOre); TiceHome.ridisegna(); },
        'tt-oggi': () => { S.giorno = oggi(); TiceHome.ridisegna(); },
        'tt-vai': (b) => { S.giorno = b.dataset.g; TiceHome.ridisegna(); },
        'tt-data': async () => {
            const r = await foglio(h`<form><h2>Vai al giorno</h2><label class="campo"><span>Data</span><input type="date" name="data" required value="${S.giorno}"></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Vai</button></div></form>`);
            if (r && r.data) { S.giorno = r.data; TiceHome.ridisegna(); }
        },
        'tt-pennello': (b) => {
            const id = b.dataset.id;
            S.pennello = S.pennello.includes(id) ? S.pennello.filter((x) => x !== id) : S.pennello.concat(id).slice(-2);
            TiceHome.ridisegna();
        },
        'tt-pennello-fine': () => { S.pennello = []; TiceHome.ridisegna(); },
        'tt-cella': async (b) => {
            if (!puo()) return;
            const { pid, ora } = b.dataset;
            const gi = TT.giornata(S.sett, S.giorno, S.modello);
            const v = gi.celle[pid + '|' + ora];
            if (S.pennello.length) {
                // a pennello: se ci sono già tutte le persone scelte si tolgono, se no si aggiungono
                const gia = (v && v.persone) || [];
                const tutte = S.pennello.every((x) => gia.includes(x));
                const nuove = tutte ? gia.filter((x) => !S.pennello.includes(x)) : gia.concat(S.pennello.filter((x) => !gia.includes(x)));
                const g = S.giorno;
                return cambiaGiorno(g, (d) => TT.impostaCella(d, g, pid, ora, nuove, v && v.nota ? { nota: v.nota } : null));
            }
            const r = await scegliPersone(v, gi, pid, ora);
            if (!r) return;
            const g = S.giorno;
            if (r === 'svuota') return cambiaGiorno(g, (d) => TT.impostaCella(d, g, pid, ora, []));
            cambiaGiorno(g, (d) => TT.impostaCella(d, g, pid, ora, r.persone, { nota: r.nota }));
        },
        'tt-bambini': async () => {
            const gi = TT.giornata(S.sett, S.giorno, S.modello);
            const tutti = X.pazienti().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
            const r = await foglio(h`<form><h2>Bambini del giorno</h2><p class="sotto">${lunga(S.giorno)}: le colonne del foglio, nell'ordine in cui li scegli.</p>
                <div class="campo scelte-stampa">${tutti.map((p) => h`<label class="spunta-riga"><input type="checkbox" name="b" value="${p.id}" ${gi.bambini.includes(p.id) ? grezzo('checked') : ''}><span>${p.name}</span></label>`)}</div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
            { invia: (form) => new FormData(form).getAll('b') });
            if (!r) return;
            const ordine = gi.bambini.filter((x) => r.includes(x)).concat(r.filter((x) => !gi.bambini.includes(x)));
            const tolti = gi.bambini.filter((x) => !r.includes(x) && gi.voci.some((v) => v.pid === x));
            if (tolti.length && !await conferma('Togliere i loro turni?', tolti.map(nomeBambino).join(', ') + ': i turni di questa giornata vengono cancellati.', { ok: 'Togli', pericolo: true })) return;
            const g = S.giorno;
            cambiaGiorno(g, (d) => {
                d.voci = (d.voci || []).filter((v) => !(v.giorno === g && tolti.includes(v.pid)));
                const pres = Object.assign({}, (d.giorni[g] || {}).presenze || {});
                Object.keys(pres).forEach((k) => { if (!ordine.includes(k)) delete pres[k]; });
                return TT.impostaGiornata(d, g, { bambini: ordine, presenze: pres });
            });
        },
        'tt-copia': async () => {
            const g = S.giorno, nomeG = TT.nomeGiorno(g);
            const r = await foglio(h`<form><h2>Copia e ripeti</h2>
                <div class="opzioni">
                    <button type="button" class="opzione" data-foglio="settimana">${icona('clock-rotate-left')}<span class="corpo">Copia da ${nomeG} scorso<small>${lunga(TT.piu(g, -7))}: bambini, orari e turni</small></span></button>
                    <button type="button" class="opzione" data-foglio="ieri">${icona('arrow-left')}<span class="corpo">Copia dal giorno prima<small>${lunga(TT.piu(g, -1))}</small></span></button>
                    <button type="button" class="opzione" data-foglio="ripeti">${icona('repeat')}<span class="corpo">Ripeti questa giornata<small>Ogni ${nomeG}, per le prossime settimane</small></span></button>
                </div><div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button></div></form>`);
            if (!r) return;
            if (r === 'ripeti') {
                const q = await foglio(h`<form><h2>Ripeti ogni ${nomeG}</h2><label class="campo"><span>Per quante settimane</span><select name="n" class="campo-in">${[1, 2, 3, 4, 6, 8, 12].map((n) => h`<option value="${n}" ${n === 4 ? grezzo('selected') : ''}>${n}</option>`)}</select></label>
                    <p class="sotto piccolo">I ${nomeG} che hanno già dei turni vengono sostituiti.</p>
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Ripeti</button></div></form>`);
                if (!q) return;
                const src = JSON.parse(JSON.stringify(S.sett || TT.vuota()));
                for (let i = 1; i <= +q.n; i++) {
                    const dst = TT.piu(g, 7 * i);
                    await cambiaSettimana((d) => TT.copiaGiornata(src, g, d, dst, S.modello), dst);
                }
                avviso(`Ripetuta per ${q.n} ${+q.n === 1 ? 'settimana' : 'settimane'}`);
                return;
            }
            const daG = r === 'settimana' ? TT.piu(g, -7) : TT.piu(g, -1);
            const gi = TT.giornata(S.sett, g, S.modello);
            if (gi.voci.length && !await conferma('Sostituire la giornata?', 'I turni di ' + lunga(g).toLowerCase() + ' vengono sostituiti con quelli copiati.', { ok: 'Sostituisci' })) return;
            try {
                const src = TT.lunedi(daG) === S.chiave ? S.sett : (await leggi(TT.lunedi(daG))).dati;
                if (!src || !TT.giornata(src, daG, S.modello).bambini.length) { avviso('In quel giorno non ci sono turni da copiare.'); return; }
                cambiaSettimana((d) => TT.copiaGiornata(src, daG, d, g, S.modello));
            } catch (e) { avviso(e.message || String(e), 'errore'); }
        },
        'tt-menu': async () => {
            const r = await foglio(h`<h2>Turni</h2><div class="opzioni">
                ${puo() ? h`<button class="opzione" data-foglio="persone">${icona('users')}<span class="corpo">Persone dei turni<small>Terapeuti e tirocinanti da assegnare</small></span></button>
                <button class="opzione" data-foglio="orari">${icona('clock')}<span class="corpo">Orari della giornata<small>Dalle, alle, durata delle fasce</small></span></button>
                <button class="opzione" data-foglio="bambini">${icona('child')}<span class="corpo">Bambini del giorno</span></button>` : ''}
                <button class="opzione" data-foglio="stampa">${icona('print')}<span class="corpo">Stampa</span></button>
                <button class="opzione" data-foglio="ricarica">${icona('rotate')}<span class="corpo">Aggiorna</span></button>
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r === 'persone') azioni['tt-persone']();
            else if (r === 'orari') azioni['tt-orari']();
            else if (r === 'bambini') azioni['tt-bambini']();
            else if (r === 'stampa') azioni['tt-stampa']();
            else if (r === 'ricarica') { S.personeCaricate = false; carica(true); }
        },
        'tt-orari': async () => {
            const gi = TT.giornata(S.sett, S.giorno, S.modello);
            const r = await foglio(h`<form><h2>Orari della giornata</h2><p class="sotto">${lunga(S.giorno)}. A schermo e sul foglio stampato compaiono solo le fasce con dei turni: qui c'è l'intervallo in cui si possono mettere.</p>
                <div class="riga-campi"><label class="campo"><span>Dalle</span><input name="da" class="campo-in" inputmode="numeric" required value="${gi.da}" placeholder="14:10"></label>
                <label class="campo"><span>Alle</span><input name="a" class="campo-in" inputmode="numeric" required value="${gi.a}" placeholder="18:00"></label>
                <label class="campo"><span>Fasce di</span><select name="fascia" class="campo-in">${[30, 40, 45, 50, 60, 90, 120].map((n) => h`<option value="${n}" ${n === gi.fascia ? grezzo('selected') : ''}>${n} minuti</option>`)}</select></label></div>
                <div class="opzioni-rapide"><span class="sotto piccolo">Rapidi:</span>
                    <button type="button" class="bt piccolo" data-orari="14:10|18:10">Pomeriggio</button>
                    <button type="button" class="bt piccolo" data-orari="08:30|13:30">Mattina</button>
                    <button type="button" class="bt piccolo" data-orari="08:30|17:30">Estate, tutto il giorno</button></div>
                <label class="spunta-riga"><input type="checkbox" name="tutti" checked> <span>Usa questi orari per tutta la settimana</span></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
                dopo: (f) => f.querySelectorAll('[data-orari]').forEach((b) => { b.onclick = () => { const [da, a] = b.dataset.orari.split('|'); f.querySelector('[name=da]').value = da; f.querySelector('[name=a]').value = a; }; })
            });
            if (!r) return;
            r.da = TT.leggiOra(r.da); r.a = TT.leggiOra(r.a);
            if (!r.da || !r.a || r.a <= r.da) { avviso('Scrivi gli orari come 14:10 e 18:00.', 'errore'); return; }
            const giorni = r.tutti ? TT.giorni(TT.lunedi(S.giorno), true) : [S.giorno];
            cambiaSettimana((d) => { giorni.forEach((g) => { d = TT.impostaGiornata(d, g, { da: r.da, a: r.a, fascia: +r.fascia }); }); return d; });
        },
        'tt-persone': async () => {
            const centro = remoto() && Y.eAdmin && Y.eAdmin();
            if (centro) await allineaAlCentro(true);
            const r = await foglio(h`<form><h2>Persone dei turni</h2><p class="sotto">Chi si può assegnare ai bambini. Il nome compare nelle celle e sui fogli stampati.</p>
                ${S.persone.map((p, i) => h`<div class="riga-campi tt-riga-p"><label class="campo"><span>Nome${p.email ? h` <small class="sotto">· dal centro</small>` : ''}</span><input name="${'nome' + i}" value="${p.nome}" maxlength="40" ${p.email ? grezzo('readonly') : ''}></label>
                    <label class="campo"><span>Ruolo</span><select name="${'ruolo' + i}" class="campo-in"><option value="terapeuta" ${p.ruolo !== 'tirocinante' ? grezzo('selected') : ''}>Terapeuta</option><option value="tirocinante" ${p.ruolo === 'tirocinante' ? grezzo('selected') : ''}>Tirocinante</option></select></label>
                    ${p.email ? h`<span class="sotto piccolo tt-dal-centro" title="Esce da sola quando le togli l'accesso">${icona('user-check')}</span>` : h`<label class="spunta-riga" title="Toglila dall'elenco"><input type="checkbox" name="${'via' + i}"> <span>togli</span></label>`}</div>`)}
                <div class="riga-campi"><label class="campo"><span>Nuova persona</span><input name="nuovo" maxlength="40" placeholder="Nome e iniziale del cognome"></label>
                    <label class="campo"><span>Ruolo</span><select name="nuovoRuolo" class="campo-in"><option value="terapeuta">Terapeuta</option><option value="tirocinante">Tirocinante</option></select></label></div>
                ${centro ? h`<p class="sotto piccolo">Chi ha accesso al centro è già qui, con il nome di «Persone e accessi»: per cambiarlo, cambialo là. Qui aggiungi chi lavora con i bambini senza usare l'app.</p>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r) return;
            const nuove = [];
            if (String(r.nuovo || '').trim()) nuove.push({ id: TT.nuovoId('p'), nome: r.nuovo.trim(), ruolo: r.nuovoRuolo });
            const vecchie = S.persone;
            cambiaPersone((lista) => {
                const out = lista.map((p) => {
                    const i = vecchie.findIndex((x) => x.id === p.id);
                    if (i < 0) return p;
                    if (r['via' + i]) return null;
                    return Object.assign({}, p, { nome: String(r['nome' + i] || p.nome).trim() || p.nome, ruolo: r['ruolo' + i] || p.ruolo });
                }).filter(Boolean);
                nuove.forEach((x) => out.push(x));
                return out;
            });
        },
        'tt-stampa': async () => {
            const r = await foglio(h`<form><h2>Stampa i turni</h2><p class="sotto">Fogli A4 orizzontali: bambini in colonna, fasce orarie in riga.</p>
                <div class="campo scelte-stampa"><span>Cosa</span>
                    <label class="spunta-riga"><input type="radio" name="cosa" value="giorno" checked> <span>${lunga(S.giorno)}</span></label>
                    <label class="spunta-riga"><input type="radio" name="cosa" value="settimana"> <span>Tutta la settimana <span class="sotto piccolo">(un foglio per giorno con turni)</span></span></label></div>
                <div class="campo scelte-stampa"><span>Come</span>
                    <label class="spunta-riga"><input type="checkbox" name="perPersona" checked> <span>Sotto, chi fa cosa: l'elenco per persona</span></label>
                    <label class="spunta-riga"><input type="checkbox" name="vuota"> <span>Griglia vuota, da compilare a mano</span></label></div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${icona('print')} Stampa</button></div></form>`);
            if (!r) return;
            const dip = { nomeBambino, persone: S.persone, modello: S.modello, oraTesto: oraT, vuota: !!r.vuota, perPersona: !!r.perPersona };
            const giorni = r.cosa === 'settimana' ? TT.giorni(TT.lunedi(S.giorno), true).filter((g) => TT.giornata(S.sett, g, S.modello).bambini.length) : [S.giorno];
            if (!giorni.length || !TT.giornata(S.sett, giorni[0], S.modello).bambini.length) { avviso('Scegli prima i bambini della giornata.'); return; }
            await X.stampa(giorni.map((g) => TT.stampaGiornata(S.sett, g, dip)).join(''));
        },
    };
    // il riepilogo aperto/chiuso resta com'era
    document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('tt-riepilogo')) S.riepilogoAperto = e.target.open; }, true);
    if (Y && Y.alCambio) Y.alCambio((cosa) => { if (cosa === 'turni' && TiceHome.attuale().vista === 'turni') TiceHome.ridisegna(); });

    // Chi è in turno con un bambino in un giorno (nell'ordine delle fasce): serve alla
    // seduta per sapere chi l'ha svolta senza chiederlo. Più l'elenco delle persone.
    async function chiDi(pid, g) {
        const k = TT.lunedi(g);
        const [sett, pers, mod] = await Promise.all([
            k === S.chiave && S.sett ? { dati: S.sett } : leggi(k),
            S.personeCaricate ? { dati: { persone: S.persone } } : leggi('persone'),
            S.modello ? { dati: S.modello } : leggi('modello')]);
        const elenco = (pers.dati && pers.dati.persone) || [];
        const gi = TT.giornata(sett.dati || TT.vuota(), g, mod.dati || null);
        const ids = [];
        gi.voci.filter((v) => v.pid === pid).sort((a, b) => (a.ora < b.ora ? -1 : 1))
            .forEach((v) => (v.persone || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
        return { nomi: ids.map((id) => (elenco.find((x) => x.id === id) || {}).nome).filter(Boolean), persone: elenco.map((x) => x.nome).filter(Boolean) };
    }

    TiceHome.estendi({ viste: { turni: vistaTurni, 'turni-modello': vistaModello }, azioni, aggancio: { chiDi } });
})();
