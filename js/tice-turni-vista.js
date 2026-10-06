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

    const S = { giorno: oggi(), sett: null, chiave: null, persone: [], personeCaricate: false, caricando: false, errore: '', offline: false, pennello: [] };

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
            const [sett, pers] = await Promise.all([leggi(k), forza || !S.personeCaricate ? leggi('persone') : Promise.resolve(null)]);
            S.sett = sett.dati || TT.vuota();
            S.offline = sett.offline;
            S.chiave = k;
            if (pers) { S.persone = (pers.dati && pers.dati.persone) || []; S.personeCaricate = true; }
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
    async function cambiaPersone(fn) {
        S.persone = fn(S.persone.slice());
        TiceHome.ridisegna();
        try {
            const d = await modifica('persone', (x) => ({ persone: fn(((x && x.persone) || []).slice()) }));
            S.persone = d.persone;
        } catch (e) { avviso('Persone non salvate: ' + (e.message || e), 'errore'); S.personeCaricate = false; carica(true); }
        TiceHome.ridisegna();
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
        const modifica = puo();
        const gi = TT.giornata(S.sett, S.giorno);
        const conf = TT.conflitti(gi.voci, nomePersona, nomeBambino, oraT);
        const terapeuti = S.persone.filter((p) => p.ruolo !== 'tirocinante'), tiro = S.persone.filter((p) => p.ruolo === 'tirocinante');
        const chip = (p) => h`<button class="tt-pers ${S.pennello.includes(p.id) ? 'attiva' : ''} ${p.ruolo === 'tirocinante' ? 'tiro' : ''}" data-a="tt-pennello" data-id="${p.id}" aria-pressed="${S.pennello.includes(p.id)}">${p.nome}</button>`;
        const cella = (pid, ora) => {
            const v = gi.celle[pid + '|' + ora];
            const c = TT.colore(pid);
            return h`<td class="tt-cella ${v && conf[v.id] ? 'conf' : ''}" style="--c:${c};--t:${TT.tinta(c, 0.10)}">
                <button class="tt-in" ${modifica ? grezzo(`data-a="tt-cella" data-pid="${pid}" data-ora="${ora}"`) : grezzo('disabled')} title="${v && conf[v.id] ? conf[v.id].join(' · ') : nomeBambino(pid) + ', ' + oraT(ora)}">
                    ${v ? (v.persone || []).map((p) => h`<span class="tt-nome ${(persona(p) || {}).ruolo === 'tirocinante' ? 'tiro' : ''}">${breve(nomePersona(p))}</span>`) : ''}
                    ${v && v.nota ? h`<span class="tt-nota">${v.nota}</span>` : ''}
                    ${v && conf[v.id] ? h`<span class="tt-avviso">${icona('triangle-exclamation')}</span>` : ''}
                    ${!v && modifica ? h`<span class="tt-piu">+</span>` : ''}
                </button></td>`;
        };
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Turni', sotto: { testo: lunga(S.giorno), azione: 'tt-data' },
                destra: h`<button class="ib" data-a="tt-stampa" aria-label="Stampa" title="Stampa">${icona('print')}</button>
                    <button class="ib" data-a="tt-menu" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main tt-main">
                <div class="tt-nav">
                    <button class="bt piccolo" data-a="tt-giorno" data-d="-1" aria-label="Giorno prima">${icona('chevron-left')}</button>
                    <button class="bt piccolo" data-a="tt-oggi">Oggi</button>
                    <button class="bt piccolo" data-a="tt-giorno" data-d="1" aria-label="Giorno dopo">${icona('chevron-right')}</button>
                    <div class="tt-settimana">${TT.giorni(TT.lunedi(S.giorno), true).map((g) => h`<button class="tt-g ${g === S.giorno ? 'scelto' : ''} ${g === oggi() ? 'oggi' : ''}" data-a="tt-vai" data-g="${g}">
                        <small>${TT.breveGiorno(g)}</small>${TT.daIso(g).getDate()}${(S.sett && (S.sett.voci || []).some((v) => v.giorno === g)) ? h`<i class="tt-punto"></i>` : ''}</button>`)}</div>
                </div>
                ${S.errore ? h`<div class="banda">${icona('triangle-exclamation')}<div>${S.errore}</div></div>` : ''}
                ${S.offline ? h`<div class="banda">${icona('wifi')}<div>Senza connessione: vedi l'ultima versione scaricata, le modifiche quando torna la rete.</div></div>` : ''}
                ${!modifica ? h`<div class="banda">${icona('lock')}<div>I turni li organizzano le professioniste: qui li vedi.</div></div>` : ''}
                ${S.caricando && !S.sett ? h`<p class="sotto">${icona('spinner fa-spin')} Carico i turni…</p>` : ''}
                ${modifica && !S.persone.length && S.personeCaricate ? h`<div class="scheda imbottita"><b>Chi fa i turni?</b>
                    <p class="sotto">Aggiungi terapeuti e tirocinanti: poi li assegni ai bambini toccando le celle.</p>
                    <button class="bt primario" data-a="tt-persone">${icona('users')} Persone dei turni</button></div>` : ''}
                ${modifica && S.persone.length && gi.bambini.length ? h`<div class="tt-pennello">
                    <span class="sotto piccolo">${S.pennello.length ? 'Tocca le celle per mettere o togliere ' + S.pennello.map((id) => breve(nomePersona(id))).join(' + ') : 'Assegna veloce: scegli una persona (o due) e tocca le celle'}</span>
                    <div class="tt-chips">${terapeuti.map(chip)}${tiro.length ? h`<span class="tt-sep"></span>${tiro.map(chip)}` : ''}${S.pennello.length ? h`<button class="tt-pers fine" data-a="tt-pennello-fine">Fatto</button>` : ''}</div></div>` : ''}
                ${gi.bambini.length ? h`<div class="tt-griglia-box"><table class="tt-griglia">
                    <thead><tr><th class="tt-angolo"></th>${gi.bambini.map((pid) => { const c = TT.colore(pid); return h`<th class="tt-bambino" style="--c:${c};--t:${TT.tinta(c, 0.16)}">${nomeBambino(pid)}</th>`; })}</tr></thead>
                    <tbody>${gi.fasce.map((ora) => h`<tr><th class="tt-ora">${oraT(ora)}</th>${gi.bambini.map((pid) => cella(pid, ora))}</tr>`)}</tbody>
                </table></div>
                ${Object.keys(conf).length ? h`<p class="sotto piccolo tt-conf-nota">${icona('triangle-exclamation')} Celle in rosso: la stessa persona con due bambini insieme, o un bambino con due turni.</p>` : ''}`
                : S.sett ? h`<div class="vuoto">Nessun bambino in questa giornata.
                    ${modifica ? h`<div class="bottoni" style="justify-content:center;margin-top:12px"><button class="bt primario" data-a="tt-bambini">${icona('child')} Scegli i bambini</button>
                    <button class="bt" data-a="tt-copia">${icona('copy')} Copia da un altro giorno</button></div>` : ''}</div>` : ''}
                ${modifica && gi.bambini.length ? h`<div class="bottoni" style="margin-top:12px">
                    <button class="bt" data-a="tt-bambini">${icona('child')} Bambini del giorno</button>
                    <button class="bt" data-a="tt-copia">${icona('copy')} Copia / ripeti</button></div>` : ''}
                ${riepilogo(gi)}
            </main>`;
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
        const occ = TT.occupati(S.sett, S.giorno, ora, pid);
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
        'tt-giorno': (b) => { S.giorno = TT.piu(S.giorno, +b.dataset.d); TiceHome.ridisegna(); },
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
            const gi = TT.giornata(S.sett, S.giorno);
            const v = gi.celle[pid + '|' + ora];
            if (S.pennello.length) {
                // a pennello: se ci sono già tutte le persone scelte si tolgono, se no si aggiungono
                const gia = (v && v.persone) || [];
                const tutte = S.pennello.every((x) => gia.includes(x));
                const nuove = tutte ? gia.filter((x) => !S.pennello.includes(x)) : gia.concat(S.pennello.filter((x) => !gia.includes(x)));
                const g = S.giorno;
                return cambiaSettimana((d) => TT.impostaCella(d, g, pid, ora, nuove, v && v.nota ? { nota: v.nota } : null));
            }
            const r = await scegliPersone(v, gi, pid, ora);
            if (!r) return;
            const g = S.giorno;
            if (r === 'svuota') return cambiaSettimana((d) => TT.impostaCella(d, g, pid, ora, []));
            cambiaSettimana((d) => TT.impostaCella(d, g, pid, ora, r.persone, { nota: r.nota }));
        },
        'tt-bambini': async () => {
            const gi = TT.giornata(S.sett, S.giorno);
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
            cambiaSettimana((d) => {
                d.voci = (d.voci || []).filter((v) => !(v.giorno === g && tolti.includes(v.pid)));
                return TT.impostaGiornata(d, g, { bambini: ordine });
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
                    await cambiaSettimana((d) => TT.copiaGiornata(src, g, d, dst), dst);
                }
                avviso(`Ripetuta per ${q.n} ${+q.n === 1 ? 'settimana' : 'settimane'}`);
                return;
            }
            const daG = r === 'settimana' ? TT.piu(g, -7) : TT.piu(g, -1);
            const gi = TT.giornata(S.sett, g);
            if (gi.voci.length && !await conferma('Sostituire la giornata?', 'I turni di ' + lunga(g).toLowerCase() + ' vengono sostituiti con quelli copiati.', { ok: 'Sostituisci' })) return;
            try {
                const src = TT.lunedi(daG) === S.chiave ? S.sett : (await leggi(TT.lunedi(daG))).dati;
                if (!src || !TT.giornata(src, daG).bambini.length) { avviso('In quel giorno non ci sono turni da copiare.'); return; }
                cambiaSettimana((d) => TT.copiaGiornata(src, daG, d, g));
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
            const gi = TT.giornata(S.sett, S.giorno);
            const ore = (da, a) => { const o = []; for (let m = da * 60; m <= a * 60; m += 30) o.push(TT.hhmm(m)); return o; };
            const sel = (nome, opz, v) => h`<select name="${nome}" class="campo-in">${opz.map((x) => h`<option value="${x}" ${x === v ? grezzo('selected') : ''}>${oraT(x)}</option>`)}</select>`;
            const r = await foglio(h`<form><h2>Orari della giornata</h2><p class="sotto">${lunga(S.giorno)}</p>
                <div class="riga-campi"><label class="campo"><span>Dalle</span>${sel('da', ore(6, 13), gi.da)}</label><label class="campo"><span>Alle</span>${sel('a', ore(12, 22), gi.a)}</label>
                <label class="campo"><span>Fasce di</span><select name="fascia" class="campo-in">${[30, 45, 60, 90, 120].map((n) => h`<option value="${n}" ${n === gi.fascia ? grezzo('selected') : ''}>${n} minuti</option>`)}</select></label></div>
                <label class="spunta-riga"><input type="checkbox" name="tutti" checked> <span>Usa questi orari per tutta la settimana</span></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r || r.a <= r.da) return;
            const giorni = r.tutti ? TT.giorni(TT.lunedi(S.giorno), true) : [S.giorno];
            cambiaSettimana((d) => { giorni.forEach((g) => { d = TT.impostaGiornata(d, g, { da: r.da, a: r.a, fascia: +r.fascia }); }); return d; });
        },
        'tt-persone': async () => {
            const centro = remoto() && Y.eAdmin && Y.eAdmin();
            const r = await foglio(h`<form><h2>Persone dei turni</h2><p class="sotto">Chi si può assegnare ai bambini. Il nome compare nelle celle e sui fogli stampati.</p>
                ${S.persone.map((p, i) => h`<div class="riga-campi tt-riga-p"><label class="campo"><span>Nome</span><input name="${'nome' + i}" value="${p.nome}" maxlength="40"></label>
                    <label class="campo"><span>Ruolo</span><select name="${'ruolo' + i}" class="campo-in"><option value="terapeuta" ${p.ruolo !== 'tirocinante' ? grezzo('selected') : ''}>Terapeuta</option><option value="tirocinante" ${p.ruolo === 'tirocinante' ? grezzo('selected') : ''}>Tirocinante</option></select></label>
                    <label class="spunta-riga" title="Toglila dall'elenco"><input type="checkbox" name="${'via' + i}"> <span>togli</span></label></div>`)}
                <div class="riga-campi"><label class="campo"><span>Nuova persona</span><input name="nuovo" maxlength="40" placeholder="Nome e iniziale del cognome"></label>
                    <label class="campo"><span>Ruolo</span><select name="nuovoRuolo" class="campo-in"><option value="terapeuta">Terapeuta</option><option value="tirocinante">Tirocinante</option></select></label></div>
                ${centro ? h`<label class="spunta-riga"><input type="checkbox" name="centro"> <span>Aggiungi anche le persone del centro che mancano<br><span class="sotto piccolo">da «Persone e accessi»: admin e professioniste come terapeuti, tirocinanti come tirocinanti</span></span></label>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r) return;
            let aggiunte = [];
            if (r.centro) {
                try {
                    const a = await Y.chiama('accessi.leggi');
                    aggiunte = Object.entries(a.utenti || {}).filter(([, u]) => u.attivo !== false)
                        .map(([email, u]) => ({ id: TT.nuovoId('p'), nome: u.nome || email.split('@')[0], ruolo: u.ruolo === 'tirocinante' ? 'tirocinante' : 'terapeuta', email }));
                } catch (e) { avviso('Persone del centro non lette: ' + (e.message || e), 'errore'); }
            }
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
                aggiunte.forEach((x) => { if (!out.some((p) => (x.email && p.email === x.email) || p.nome.toLowerCase() === x.nome.toLowerCase())) out.push(x); });
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
            const dip = { nomeBambino, persone: S.persone, oraTesto: oraT, vuota: !!r.vuota, perPersona: !!r.perPersona };
            const giorni = r.cosa === 'settimana' ? TT.giorni(TT.lunedi(S.giorno), true).filter((g) => TT.giornata(S.sett, g).bambini.length) : [S.giorno];
            if (!giorni.length || !TT.giornata(S.sett, giorni[0]).bambini.length) { avviso('Scegli prima i bambini della giornata.'); return; }
            await X.stampa(giorni.map((g) => TT.stampaGiornata(S.sett, g, dip)).join(''));
        },
    };
    // il riepilogo aperto/chiuso resta com'era
    document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('tt-riepilogo')) S.riepilogoAperto = e.target.open; }, true);
    if (Y && Y.alCambio) Y.alCambio((cosa) => { if (cosa === 'turni' && TiceHome.attuale().vista === 'turni') TiceHome.ridisegna(); });

    TiceHome.estendi({ viste: { turni: vistaTurni }, azioni });
})();
