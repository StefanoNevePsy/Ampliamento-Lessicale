/**
 * Centro TICE — schermata iniziale per la presa dati.
 *
 * Si apre all'avvio sopra l'app: si sceglie il bambino, compaiono le attività
 * del suo programma con il target in corso, e si segna ✓ / P / ✗ con un tocco.
 * A fine seduta ogni attività diventa una seduta Quaderno nello storico
 * (stessa struttura di quelle registrate dal Quaderno dell'app), quindi
 * cartella clinica, grafici, criterio ed export funzionano come sempre.
 *
 * Tutto il resto dell'app resta raggiungibile: giochi e attività, cartelle,
 * archivio dei set, impostazioni.
 *
 * Dati in memoria: si lavora sempre sugli oggetti di state.patients, gli
 * stessi che usa il resto dell'app, così un salvataggio non ne sovrascrive
 * un altro con una copia vecchia.
 */
(function () {
    'use strict';
    const P = window.TiceProgramma;

    // ---------- HTML con escape ----------
    class Grezzo { constructor(s) { this.s = s; } toString() { return this.s; } }
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function val(v) {
        if (v == null || v === false) return '';
        if (v instanceof Grezzo) return v.s;
        if (Array.isArray(v)) return v.map(val).join('');
        return esc(v);
    }
    function h(parti, ...valori) {
        let s = parti[0];
        valori.forEach((v, i) => { s += val(v) + parti[i + 1]; });
        return new Grezzo(s);
    }
    const grezzo = (s) => new Grezzo(s);
    const icona = (n) => grezzo(`<i class="fa-solid fa-${n}"></i>`);

    // ---------- stato ----------
    const T = { vista: 'bambini', pid: null, aperte: {}, chiusiAperti: {}, cerca: '', importazioni: [] };
    const radice = () => document.getElementById('tice');

    function pazienti() { return (typeof state !== 'undefined' && state.patients) || []; }
    function paz(pid) { return pazienti().find((x) => x.id === pid) || null; }
    async function caricaPazienti() {
        if (!pazienti().length) state.patients = await DB.getAllPatients();
    }
    async function salvaPaziente(p) {
        T.salvandoQui = true;
        try { await DB.savePatient(p); } finally { T.salvandoQui = false; }
        // se il resto dell'app ha ricaricato l'elenco nel frattempo, rimette questo oggetto
        const i = state.patients.findIndex((x) => x.id === p.id);
        if (i >= 0) state.patients[i] = p; else state.patients.push(p);
        if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
    }
    const oggi = () => P.oggi();
    function formatoData(iso, lungo) {
        if (!iso) return '';
        const [a, m, g] = iso.slice(0, 10).split('-');
        if (!lungo) return `${g}/${m}`;
        const d = new Date(+a, +m - 1, +g);
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    function classePct(pct, soglia) {
        if (pct == null) return '';
        return pct >= (soglia || 90) ? 'pct-ok' : pct >= 60 ? 'pct-medio' : 'pct-basso';
    }
    const iniziali = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

    // ---------- bozza della seduta (sopravvive a chiusure e ricariche) ----------
    const chiaveBozza = (pid) => 'tice_bozza_' + pid;
    function leggiBozza(pid) {
        try { const b = JSON.parse(localStorage.getItem(chiaveBozza(pid)) || 'null'); if (b && b.voci) return b; } catch (e) { /* bozza illeggibile: si riparte */ }
        return null;
    }
    function bozza(pid) {
        if (!T.bozza || T.bozza.pid !== pid) {
            T.bozza = leggiBozza(pid) || { pid, data: oggi(), inizio: new Date().toISOString(), voci: {}, extra: [], temp: [] };
        }
        return T.bozza;
    }
    function salvaBozza() {
        if (!T.bozza) return;
        const b = T.bozza;
        const vuota = !Object.values(b.voci).some(haDati) && !b.extra.length && !b.temp.length;
        try {
            if (vuota && b.data === oggi()) localStorage.removeItem(chiaveBozza(b.pid));
            else localStorage.setItem(chiaveBozza(b.pid), JSON.stringify(b));
        } catch (e) { console.warn('Bozza non salvata', e); }
    }
    function eliminaBozza(pid) {
        localStorage.removeItem(chiaveBozza(pid));
        if (T.bozza && T.bozza.pid === pid) T.bozza = null;
    }
    const haDati = (v) => v && (v.v + v.p + v.x) > 0;

    // Attività della seduta: il programma attivo, più quelle aggiunte solo per oggi
    function attivitaSeduta(p) {
        const b = bozza(p.id);
        const prog = P.programma(p).attivita;
        const lista = P.attiveOggi(p).slice();
        b.extra.forEach((id) => {
            const a = prog.find((x) => x.id === id);
            if (a && !lista.includes(a)) lista.push(a);
        });
        b.temp.forEach((t) => lista.push(Object.assign({ temporanea: true, target: [], criterio: { soglia: 90, sedute: 2 } }, t)));
        return lista;
    }
    function attivitaDi(p, id) {
        const a = P.attivita(p, id);
        if (a) return a;
        const t = bozza(p.id).temp.find((x) => x.id === id);
        return t ? Object.assign({ temporanea: true, target: [], criterio: { soglia: 90, sedute: 2 } }, t) : null;
    }
    function voce(p, att) {
        const b = bozza(p.id);
        if (!b.voci[att.id]) {
            const c = att.temporanea ? null : P.targetCorrente(att);
            b.voci[att.id] = { v: 0, p: 0, x: 0, sequenza: '', nota: '', decisione: '', targetId: c ? c.target.id : null,
                mantenimento: !!(c && c.mantenimento), sessionType: att.sessionType || 'independent' };
        }
        return b.voci[att.id];
    }

    // ---------- fogli, conferme, avvisi ----------
    function foglio(contenuto, opzioni = {}) {
        return new Promise((risolvi) => {
            const sfondo = document.createElement('div');
            sfondo.className = 'tice-foglio-sfondo';
            sfondo.innerHTML = `<div class="tice-foglio" role="dialog" aria-modal="true">${val(contenuto)}</div>`;
            document.body.appendChild(sfondo);
            const f = sfondo.firstChild;
            const chiudi = (v) => { sfondo.remove(); document.removeEventListener('keydown', tasto); risolvi(v); };
            const tasto = (e) => { if (e.key === 'Escape') chiudi(null); };
            document.addEventListener('keydown', tasto);
            sfondo.addEventListener('click', (e) => {
                if (e.target === sfondo) return chiudi(null);
                const b = e.target.closest('[data-foglio]');
                if (!b) return;
                e.preventDefault();
                const v = b.getAttribute('data-foglio');
                chiudi(v === 'chiudi' ? null : v);
            });
            const form = f.querySelector('form');
            if (form) form.addEventListener('submit', (e) => {
                e.preventDefault();
                const r = opzioni.invia ? opzioni.invia(form, e.submitter) : Object.fromEntries(new FormData(form));
                if (r !== undefined) chiudi(r);
            });
            if (opzioni.dopo) opzioni.dopo(f);
            const primo = f.querySelector('[autofocus]');
            if (primo) setTimeout(() => primo.focus(), 60);
        });
    }
    function conferma(titolo, testo, { ok = 'Conferma', pericolo = false } = {}) {
        return foglio(h`<h2>${titolo}</h2>${testo ? h`<p class="sotto">${testo}</p>` : ''}
            <div class="bottoni"><button class="bt" data-foglio="chiudi">Annulla</button>
            <button class="bt ${pericolo ? 'pericolo' : 'primario'}" data-foglio="si">${ok}</button></div>`).then((v) => v === 'si');
    }
    let timerAvviso = null;
    function avviso(testo, tipo) {
        document.querySelectorAll('.tice-avviso').forEach((x) => x.remove());
        const d = document.createElement('div');
        d.className = 'tice-avviso' + (tipo === 'errore' ? ' errore' : '');
        d.textContent = testo;
        document.body.appendChild(d);
        clearTimeout(timerAvviso);
        timerAvviso = setTimeout(() => d.remove(), 3200);
    }

    // =====================================================================
    // Viste
    // =====================================================================
    function barra({ indietro, titolo, sotto, destra }) {
        return h`<header class="tice-barra">
            ${indietro ? h`<button class="ib" data-a="${indietro}" aria-label="Indietro">${icona('arrow-left')}</button>`
                : h`<button class="marchio" data-a="vai-bambini" aria-label="Centro TICE"><img src="img/tice/logo-bianco.svg" alt="TICE"></button>`}
            <div class="titolo">${titolo}${sotto ? h`<span class="sotto-titolo" ${sotto.azione ? grezzo(`data-a="${sotto.azione}" style="cursor:pointer"`) : ''}>${sotto.testo}</span>` : ''}</div>
            ${EST.chip ? EST.chip() : ''}
            ${destra || ''}
        </header>`;
    }

    // ---------- elenco bambini ----------
    function ultimaSeduta(p) {
        let u = null;
        (p.history || []).forEach((s) => { if (!u || s.date > u) u = s.date; });
        return u;
    }
    function vistaBambini() {
        const q = T.cerca.trim().toLowerCase();
        const elenco = pazienti()
            .filter((p) => !q || String(p.name || '').toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q))
            .map((p) => ({ p, b: leggiBozza(p.id), u: ultimaSeduta(p) }))
            .sort((a, b) => (!!b.b - !!a.b) || String(b.u || '').localeCompare(String(a.u || '')) || String(a.p.name).localeCompare(String(b.p.name), 'it'));
        const righe = elenco.map(({ p, b, u }) => {
            const attive = P.attiveOggi(p).length;
            const risposte = b ? Object.values(b.voci).reduce((n, v) => n + v.v + v.p + v.x, 0) : 0;
            return h`<button class="riga" data-a="apri-bambino" data-pid="${p.id}">
                <span class="avatar">${p.photo ? h`<img src="${p.photo}" alt="">` : iniziali(p.name)}</span>
                <span class="corpo"><span class="t1">${p.name}</span>
                    <span class="t2">${EST.pillola ? EST.pillola(p) : ''}${b && risposte ? h`<span class="pill arancio">seduta in corso · ${risposte} risposte</span> ` : ''}${attive ? `${attive} attività in corso` : 'nessun programma'}${u ? ' · ultima ' + formatoData(P.giorno(u)) : ''}${p.category ? ' · ' + p.category : ''}</span></span>
                ${icona('chevron-right')}
            </button>`;
        });
        return h`${barra({ titolo: 'Presa dati', destra: h`
                <button class="ib" data-a="giochi" aria-label="Giochi e attività dell'app" title="Giochi e attività">${icona('gamepad')}</button>
                <button class="ib" data-a="menu" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${EST.banner ? EST.banner() : ''}
                ${pazienti().length > 6 ? h`<input class="cerca" type="search" placeholder="Cerca un bambino" value="${T.cerca}" data-cambio="cerca" aria-label="Cerca">` : ''}
                ${righe.length ? h`<div class="scheda">${righe}</div>`
                    : h`<div class="vuoto">${q ? 'Nessun bambino con questo nome.' : 'Ancora nessun bambino.'}</div>`}
                ${limitato() ? '' : h`<div class="bottoni" style="margin-top:14px">
                    <button class="bt" data-a="nuovo-bambino">${icona('user-plus')} Nuovo bambino</button>
                    <button class="bt" data-a="vai-import">${icona('file-import')} Importa quaderni</button>
                </div>`}
            </main>`;
    }

    // ---------- presa dati ----------
    function previsione(p, att, v) {
        if (att.temporanea || !v || !v.targetId || !haDati(v)) return null;
        const t = att.target.find((x) => x.id === v.targetId);
        if (!t) return null;
        const b = bozza(p.id);
        const serie = P.sedute(p, att, t);
        if (P.criterioRaggiunto(serie, att.criterio)) return null;
        const tot = v.v + v.p + v.x;
        const oggiS = { date: b.data + 'T12:00:00', percentage: Math.round(100 * v.v / tot) };
        return P.criterioRaggiunto(serie.concat([oggiS]), att.criterio) === b.data ? 'Con questi dati oggi raggiunge il criterio.' : null;
    }
    function schedaAttivita(p, att) {
        const b = bozza(p.id);
        const v = b.voci[att.id];
        const c = att.temporanea ? null : P.targetCorrente(att);
        const t = v && v.targetId ? att.target.find((x) => x.id === v.targetId) : (c && c.target);
        const mant = v ? v.mantenimento : (c && c.mantenimento);
        const aperta = T.aperte[att.id];
        const tot = v ? v.v + v.p + v.x : 0;
        const pct = tot ? Math.round(100 * v.v / tot) : null;
        const soglia = (att.criterio && att.criterio.soglia) || 90;
        const tipo = (v && v.sessionType) || att.sessionType;
        const aCriterio = !att.temporanea && t && t.stato === 'attivo' && P.criterioRaggiunto(P.sedute(p, att, t), att.criterio);
        const giocabile = t && t.setId && setArchivio().some((x) => x.id === t.setId);
        const giaOggi = !att.temporanea && t ? P.sedute(p, att, t).filter((x) => P.giorno(x.date) === b.data) : [];
        const oggiV = giaOggi.reduce((n, x) => n + (x.correct || 0), 0), oggiT = giaOggi.reduce((n, x) => n + (x.total || 0), 0);
        const prev = previsione(p, att, v);
        return h`<div class="att ${haDati(v) ? 'con-dati' : ''}" data-att="${att.id}">
            <button class="att-testa" data-a="apri-att" data-id="${att.id}" aria-expanded="${aperta ? 'true' : 'false'}">
                <span class="corpo">
                    <span class="nome">${att.nome}
                        ${tipo === 'timedelay' ? h` <span class="pill">T/D</span>` : ''}
                        ${att.temporanea ? h` <span class="pill grigia">solo oggi</span>` : ''}
                        ${att.stato && att.stato !== 'attivo' ? h` <span class="pill grigia">${att.stato}</span>` : ''}
                        ${mant ? h` <span class="pill arancio" title="Il target ha già raggiunto il criterio: si registra come mantenimento finché non si apre il prossimo">mantenimento</span>` : ''}
                        ${aCriterio ? h` <span class="pill verde">${icona('flag-checkered')} criterio</span>` : ''}
                    </span>
                    ${t ? h`<span class="target">${t.setId ? h`${icona(giocabile ? 'layer-group' : 'triangle-exclamation')} ` : ''}${t.testo}${t.setId ? h` · ${etichettaModo(P.modoTarget(att, t))}` : ''}</span>` : (!att.temporanea ? h`<span class="target"><i>Nessun target in corso: aggiungilo dal programma.</i></span>` : '')}
                    ${oggiT ? h`<span class="target">${icona('circle-check')} già oggi: ${oggiV}/${oggiT} (${Math.round(100 * oggiV / oggiT)}%)</span>` : ''}
                </span>
                <span class="conto">${tot ? h`<b class="${classePct(pct, soglia)}">${pct}%</b><br><span class="piccolo sotto">${v.v}/${tot}${att.prove ? ' di ' + att.prove : ''}</span>`
                    : h`<span class="piccolo sotto">${att.prove ? att.prove + ' prove' : 'tocca'}</span>`}</span>
            </button>
            ${aperta ? h`<div class="att-corpo">
                ${giocabile ? h`<button class="bt primario largo" style="margin-bottom:10px" data-a="gioca" data-id="${att.id}">${icona('play')} Somministra con l'app · ${etichettaModo(P.modoTarget(att, t))}</button>` : ''}
                ${t && t.setId && !giocabile ? h`<p class="sotto piccolo">Il set «${t.testo}» non è su questo dispositivo: scaricalo dai materiali o segna qui sotto.</p>` : ''}
                <div class="tasti">
                    <button class="tasto v" data-a="segna" data-id="${att.id}" data-r="V">✓<small>Corretta</small></button>
                    <button class="tasto p" data-a="segna" data-id="${att.id}" data-r="P">P<small>${att.nomeP || (tipo === 'timedelay' ? 'Promptata' : 'Con aiuto')}</small></button>
                    <button class="tasto x" data-a="segna" data-id="${att.id}" data-r="X">✗<small>Errata</small></button>
                </div>
                <div class="sotto-tasti">
                    <div class="sequenza" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                    <button class="ib" data-a="annulla" data-id="${att.id}" aria-label="Annulla l'ultima" title="Annulla l'ultima">${icona('rotate-left')}</button>
                    <button class="ib" data-a="nota-voce" data-id="${att.id}" aria-label="Nota e opzioni" title="Nota e opzioni">${icona('pen')}</button>
                </div>
                ${prev ? h`<p class="avviso-criterio">${icona('flag-checkered')} ${prev}</p>` : ''}
                ${aCriterio ? h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}. <button class="bt piccolo" data-a="chiudi-target" data-id="${att.id}" data-t="${t.id}">Passa al prossimo target</button></p>` : ''}
                ${v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${v.nota}</p>` : ''}
            </div>` : ''}
        </div>`;
    }
    function riassunto(p) {
        const b = bozza(p.id);
        let corrette = 0, prove = 0, n = 0;
        Object.values(b.voci).forEach((v) => { if (haDati(v)) { n++; corrette += v.v; prove += v.v + v.p + v.x; } });
        return { corrette, prove, n };
    }
    function testoPiede(p) {
        const r = riassunto(p);
        if (!r.n) return 'Nessuna risposta ancora';
        return `<b>${r.prove}</b> prove · <b>${r.corrette}</b> corrette · ${r.n} attività`;
    }
    function vistaSeduta() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return vistaBambini(); }
        const b = bozza(p.id);
        const lista = attivitaSeduta(p);
        const unica = lista.length === 1 && lista[0];
        const unicaGioco = unica && !unica.temporanea && schermoGrande() && ((P.targetCorrente(unica) || {}).target || {}).setId;
        if (unica && !unicaGioco && T.aperte[unica.id] === undefined) T.aperte[unica.id] = true;
        const perArea = [];
        lista.forEach((a) => {
            const area = a.temporanea ? 'Aggiunte per oggi' : (a.area || 'Altre attività');
            let g = perArea.find((x) => x.area === area);
            if (!g) perArea.push(g = { area, att: [] });
            g.att.push(a);
        });
        const nonOggi = b.data !== oggi();
        return h`${barra({ indietro: 'vai-bambini', titolo: p.name,
                sotto: { testo: (nonOggi ? 'Seduta del ' : 'Oggi, ') + formatoData(b.data, true), azione: 'data' },
                destra: h`<button class="ib" data-a="vai-programma" aria-label="Programma" title="Programma">${icona('list-check')}</button>
                    <button class="ib" data-a="menu-bambino" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${nonOggi ? h`<div class="banda">${icona('calendar-day')}<div>Stai registrando una seduta del <b>${formatoData(b.data, true)}</b>, non di oggi.</div></div>` : ''}
                ${!P.programma(p).attivita.length ? h`<div class="scheda imbottita">
                    <b>Nessun programma per ${p.name}.</b>
                    <p class="sotto">Crea le attività su cui lavorate, con i loro target, oppure importa il suo quaderno Numbers. Intanto puoi aggiungere attività solo per oggi.</p>
                    ${limitato() ? '' : h`<div class="bottoni"><button class="bt primario" data-a="vai-programma">${icona('list-check')} Crea il programma</button>
                    <button class="bt" data-a="vai-import">${icona('file-import')} Importa quaderno</button></div>`}</div>` : ''}
                ${perArea.map((g) => h`${perArea.length > 1 ? h`<h3>${g.area}</h3>` : ''}${g.att.map((a) => schedaAttivita(p, a))}`)}
                <button class="bt largo fantasma" style="margin-top:12px" data-a="aggiungi-oggi">${icona('plus')} Aggiungi un'attività per questa seduta</button>
            </main>
            <div class="piede"><div class="piede-dentro">
                <div class="riassunto" id="tice-riassunto">${grezzo(testoPiede(p))}</div>
                <button class="bt primario" data-a="termina">${icona('check')} Salva seduta</button>
            </div></div>`;
    }
    function aggiornaScheda(p, id) {
        const el = radice().querySelector(`[data-att="${CSS.escape(id)}"]`);
        const att = attivitaDi(p, id);
        if (el && att) el.outerHTML = String(schedaAttivita(p, att));
        const r = document.getElementById('tice-riassunto');
        if (r) r.innerHTML = testoPiede(p);
    }

    // ---------- programma ----------
    const ETICHETTE_STATO = { attivo: 'in corso', sospeso: 'sospesa', terminato: 'terminata' };
    function schedaProgramma(p, att) {
        const t = att.target || [];
        const modifica = puoProgrammi(p);
        const ultimo = (tg) => {
            const s = P.sedute(p, att, tg);
            if (!s.length) return '';
            const u = s[s.length - 1];
            return ` · ${s.length} ${s.length === 1 ? 'seduta' : 'sedute'}, ultima ${formatoData(P.giorno(u.date))} ${u.percentage}%`;
        };
        const CHIUSI = ['criterio', 'repertorio', 'chiuso'];
        const chiusi = t.filter((tg) => CHIUSI.includes(tg.stato));
        const aperti = t.filter((tg) => !CHIUSI.includes(tg.stato));
        const riga = (tg) => h`<li class="${CHIUSI.includes(tg.stato) ? 'chiuso' : ''}">
                    <span class="punto ${tg.stato}"></span>
                    <span class="tt">${tg.testo}<small>${P.STATI_TARGET[tg.stato] || tg.stato}${tg.fine ? ' il ' + formatoData(tg.fine) : ''}${ultimo(tg)}</small></span>
                    ${modifica || tg.setId ? h`<button class="ib" data-a="menu-target" data-id="${att.id}" data-t="${tg.id}" aria-label="Opzioni del target">${icona('ellipsis')}</button>` : ''}
                </li>`;
        return h`<div class="scheda" data-prog="${att.id}">
            <button class="att-testa" ${modifica ? grezzo(`data-a="mod-att" data-id="${esc(att.id)}"`) : ''}>
                <span class="corpo"><span class="nome">${att.nome}
                    ${att.sessionType === 'timedelay' ? h` <span class="pill">T/D</span>` : h` <span class="pill grigia">Indip.</span>`}
                    ${att.stato !== 'attivo' ? h` <span class="pill arancio">${ETICHETTE_STATO[att.stato] || att.stato}</span>` : ''}</span>
                    <span class="target">Criterio ${att.criterio.soglia}% per ${att.criterio.sedute} giorni${att.prove ? ' · ' + att.prove + ' prove' : ''}${att.descrizione ? ' · ' + att.descrizione : ''}</span></span>
                ${modifica ? icona('pen') : ''}
            </button>
            <ul class="targets">
                ${chiusi.length ? h`<li><details class="chiusi" ${T.chiusiAperti[att.id] ? grezzo('open') : ''} data-chiusi="${att.id}"><summary class="sotto piccolo">${chiusi.length} ${chiusi.length === 1 ? 'target chiuso' : 'target chiusi'}</summary>
                    <ul class="targets" style="padding:0">${chiusi.map(riga)}</ul></details></li>` : ''}
                ${aperti.map(riga)}
                ${modifica ? h`<li><button class="bt piccolo fantasma" data-a="nuovo-target" data-id="${att.id}">${icona('plus')} Target</button></li>` : ''}
            </ul>
        </div>`;
    }
    function vistaProgramma() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return vistaBambini(); }
        const tutte = P.programma(p).attivita;
        const modifica = puoProgrammi(p);
        const attive = tutte.filter((a) => a.stato === 'attivo');
        const altre = tutte.filter((a) => a.stato !== 'attivo');
        const gruppi = [];
        attive.forEach((a) => {
            const area = a.area || 'Altre attività';
            let g = gruppi.find((x) => x.area === area);
            if (!g) gruppi.push(g = { area, att: [] });
            g.att.push(a);
        });
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Programma', sotto: { testo: p.name } })}
            <main class="tice-main">
                <p class="sotto">Le attività in corso compaiono nella presa dati con il loro target. Quando un target raggiunge il criterio l'app propone di passare al successivo.</p>
                ${modifica ? h`<button class="bt primario largo" data-a="nuova-att">${icona('plus')} Nuova attività</button>`
                    : h`<div class="banda">${icona('lock')}<div>Il programma lo modificano le professioniste: tu registri le sedute.</div></div>`}
                ${gruppi.map((g) => h`<h3>${g.area}</h3>${g.att.map((a) => schedaProgramma(p, a))}`)}
                ${!attive.length ? h`<div class="vuoto">Nessuna attività in corso.</div>` : ''}
                ${altre.length ? h`<details style="margin-top:18px"><summary>Sospese e terminate (${altre.length})</summary>${altre.map((a) => schedaProgramma(p, a))}</details>` : ''}
            </main>`;
    }

    // ---------- import ----------
    const normNome = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    function schedaImport(it, i) {
        if (it.errore) return h`<div class="scheda imbottita"><b>${it.file}</b><p class="sotto">${icona('triangle-exclamation')} ${it.errore}</p></div>`;
        const pk = it.pk;
        if (it.fatto) return h`<div class="scheda imbottita"><b>${icona('circle-check')} ${it.nome}</b>
            <p class="sotto">${it.fatto}</p>
            <button class="bt piccolo" data-a="apri-bambino" data-pid="${it.pazienteId}">Apri la presa dati</button></div>`;
        const attive = pk.attivita.filter((a) => a.stato === 'attivo');
        const nSedute = TiceImport.sedute(pk, it.conferme).length;
        const esistente = it.pazienteId ? paz(it.pazienteId) : null;
        const giaFatto = esistente && (esistente.importazioni || []).find((x) => x.file === pk.file);
        const terminata = {};
        pk.attivita.forEach((a) => { terminata[a.id] = a.stato !== 'attivo'; });
        const daConf = pk.daConfermare.filter((d) => !terminata[d.attivitaId]).sort((a, b) => a.certo - b.certo);
        const daConfTerm = pk.daConfermare.filter((d) => terminata[d.attivitaId]);
        const campoProve = (d) => h`<label style="display:flex;gap:10px;align-items:center;margin:6px 0">
                    <span style="flex:1;min-width:0"><b>${d.attivita}</b>${d.certo ? h` <span class="pill verde">quasi certo</span>` : ''}<br><span class="sotto piccolo">${d.motivo}</span></span>
                    <input class="campo-in" style="width:76px" type="number" min="1" max="200" inputmode="numeric" value="${it.conferme[d.attivitaId] != null ? it.conferme[d.attivitaId] : d.proposta}" data-cambio="imp-prove" data-i="${i}" data-att="${d.attivitaId}">
                </label>`;
        return h`<div class="scheda imbottita" data-imp="${i}">
            <div class="sotto piccolo">${icona('file')} ${pk.file}</div>
            <label style="display:block;margin:10px 0"><span class="sotto piccolo">Bambino</span>
                <select class="campo-in" data-cambio="imp-paziente" data-i="${i}">
                    <option value="">Nuovo: ${it.nome}</option>
                    ${pazienti().map((x) => h`<option value="${x.id}" ${x.id === it.pazienteId ? grezzo('selected') : ''}>${x.name}</option>`)}
                </select></label>
            ${!it.pazienteId ? h`<label style="display:block;margin:0 0 10px"><span class="sotto piccolo">Nome del nuovo bambino</span>
                <input class="campo-in" value="${it.nome}" data-cambio="imp-nome" data-i="${i}"></label>` : ''}
            ${giaFatto ? h`<div class="banda">${icona('rotate')}<div>Questo file è già stato importato il ${formatoData(P.giorno(giaFatto.data))}: le sedute importate allora vengono sostituite, quelle registrate nell'app restano.</div></div>` : ''}
            <table class="tabella"><tbody>
                <tr><td>Attività in corso</td><td class="num"><b>${attive.length}</b></td></tr>
                <tr><td>Attività terminate</td><td class="num">${pk.attivita.length - attive.length}</td></tr>
                <tr><td>Sedute</td><td class="num"><b>${nSedute}</b></td></tr>
                <tr><td>Giorni di learn unit</td><td class="num">${pk.storico.length}</td></tr>
            </tbody></table>
            <details><summary>Attività in corso e target</summary><ul>
                ${attive.map((a) => { const c = P.targetCorrente(a); return h`<li><b>${a.nome}</b>${a.area ? ' (' + a.area + ')' : ''}${c ? ': ' + c.target.testo : ''}</li>`; })}
            </ul></details>
            ${daConf.length + daConfTerm.length ? h`<h3 style="margin-left:0">Prove per seduta da confermare</h3>
                <p class="sotto piccolo">Questi fogli non scrivono quante prove c'erano: la differenza con le corrette diventa errori.</p>
                ${daConf.map(campoProve)}
                ${daConfTerm.length ? h`<details><summary class="sotto">Attività terminate (${daConfTerm.length})</summary>${daConfTerm.map(campoProve)}</details>` : ''}` : ''}
            ${pk.avvisi.length ? h`<details><summary>${pk.avvisi.length} avvisi</summary><ul>${pk.avvisi.map((a) => h`<li>${a}</li>`)}</ul></details>` : ''}
            <button class="bt primario largo" style="margin-top:12px" data-a="importa" data-i="${i}">${icona('file-import')} Importa</button>
        </div>`;
    }
    function vistaImport() {
        const daFare = T.importazioni.filter((x) => x.pk && !x.fatto).length;
        return h`${barra({ indietro: 'vai-bambini', titolo: 'Importa quaderni Numbers' })}
            <main class="tice-main">
                <p class="sotto">Scegli uno o più file <b>.numbers</b> (anche direttamente da Drive). Ogni file diventa il programma del bambino e il suo storico, dentro le cartelle cliniche dell'app. Prima di salvare puoi controllare cosa è stato letto.</p>
                <label class="file-scelta">${icona('file-arrow-up')} <b>Scegli i file</b><br><span class="sotto piccolo">Si legge tutto sul dispositivo: nulla viene inviato.</span>
                    <input type="file" multiple data-cambio="file-numbers"></label>
                ${T.leggendo ? h`<p class="sotto" style="margin-top:12px">${icona('spinner fa-spin')} Lettura di ${T.leggendo}…</p>` : ''}
                ${daFare > 1 ? h`<button class="bt arancio largo" style="margin-top:12px" data-a="importa-tutti">${icona('file-import')} Importa tutti (${daFare})</button>` : ''}
                <div style="margin-top:12px">${T.importazioni.map(schedaImport)}</div>
            </main>`;
    }

    // ---------- viste e punti di aggancio per le estensioni (tice-centro.js) ----------
    const VISTE = { bambini: vistaBambini, seduta: vistaSeduta, programma: vistaProgramma, import: vistaImport };
    const EST = {};
    // Chi può cambiare il programma: sul dispositivo tutti; per i bambini del
    // centro lo decide il ruolo (le tirocinanti registrano, non modificano).
    const puoProgrammi = (p) => !EST.puoProgrammi || EST.puoProgrammi(p);
    // Versione semplice per le tirocinanti: presa dati, giochi e storico
    const limitato = () => !!(EST.limitato && EST.limitato());

    // ---------- disegno ----------
    function disegna() {
        const r = radice();
        if (!r) return;
        const alto = r.scrollTop;
        const f = VISTE[T.vista] || vistaBambini;
        r.innerHTML = String(f());
        if (EST.dopo) EST.dopo(T.vista, r);
        if (T.mantieniScroll) r.scrollTop = alto;
        T.mantieniScroll = false;
    }
    function vai(vista, pid) {
        T.vista = vista;
        if (pid !== undefined) T.pid = pid;
        radice().scrollTop = 0;
        disegna();
    }

    // =====================================================================
    // Azioni
    // =====================================================================
    const azioni = {
        'vai-bambini': () => vai('bambini'),
        'vai-seduta': () => vai('seduta'),
        'vai-programma': () => vai('programma'),
        'vai-import': () => { if (!limitato()) vai('import'); },
        'apri-bambino': (b) => { T.aperte = {}; vai('seduta', b.dataset.pid); },
        giochi: () => chiudi(),
        menu: async () => {
            const r = await foglio(h`<h2>Centro TICE</h2><div class="opzioni">
                <button class="opzione" data-foglio="giochi">${icona('gamepad')}<span class="corpo">Giochi e attività<small>Tutte le attività dell'app, con i set</small></span></button>
                <button class="opzione" data-foglio="cartelle">${icona('chart-line')}<span class="corpo">Cartelle cliniche<small>Grafici, giornate, diario, report</small></span></button>
                ${limitato() ? '' : h`<button class="opzione" data-foglio="import">${icona('file-import')}<span class="corpo">Importa quaderni Numbers</span></button>
                <button class="opzione" data-foglio="archivio">${icona('folder-open')}<span class="corpo">Archivio set</span></button>
                <button class="opzione" data-foglio="opzioni">${icona('gear')}<span class="corpo">Impostazioni e tema</span></button>`}
                ${EST.opzioniMenu ? EST.opzioniMenu() : ''}
                ${window.TicePwa && TicePwa.puoInstallare() ? h`<button class="opzione" data-foglio="installa">${icona('download')}<span class="corpo">Installa l'app<small>Si apre come un'app e funziona anche senza rete</small></span></button>` : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaMenu) return EST.sceltaMenu(r.slice(4));
            if (r === 'installa') { TicePwa.installa(); return; }
            if (r === 'giochi') chiudi();
            else if (r === 'cartelle') apriDaQui(openPatients);
            else if (r === 'import') vai('import');
            else if (r === 'archivio') apriDaQui(openLibrary);
            else if (r === 'opzioni') apriDaQui(openSettings);
        },
        'menu-bambino': async () => {
            const p = paz(T.pid);
            const r = await foglio(h`<h2>${p.name}</h2><div class="opzioni">
                <button class="opzione" data-foglio="programma">${icona('list-check')}<span class="corpo">Programma<small>Attività e target</small></span></button>
                <button class="opzione" data-foglio="cartella">${icona('chart-line')}<span class="corpo">Cartella clinica<small>Grafici, giornate, diario</small></span></button>
                <button class="opzione" data-foglio="giochi">${icona('gamepad')}<span class="corpo">Giochi con ${p.name}<small>Le sedute dei giochi vanno nella sua cartella</small></span></button>
                <button class="opzione" data-foglio="data">${icona('calendar-day')}<span class="corpo">Cambia la data della seduta<small>Per ricopiare un foglio di un altro giorno</small></span></button>
                <button class="opzione" data-foglio="annulla">${icona('trash')}<span class="corpo">Annulla la seduta in corso</span></button>
                ${EST.opzioniBambino ? EST.opzioniBambino(p) : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaBambino) return EST.sceltaBambino(r.slice(4), p);
            if (r === 'programma') vai('programma');
            else if (r === 'cartella') apriCartella(p.id);
            else if (r === 'giochi') { if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id); chiudi(); }
            else if (r === 'data') azioni.data();
            else if (r === 'annulla') azioni['annulla-seduta']();
        },
        'nuovo-bambino': async () => {
            if (limitato()) return;
            const r = await foglio(h`<form><h2>Nuovo bambino</h2>
                <label class="campo"><span>Nome (o iniziali)</span><input name="nome" required maxlength="80" autofocus autocomplete="off"></label>
                <label class="campo"><span>Categoria (facoltativa)</span><input name="cat" maxlength="60" placeholder="es. Aula 1" list="tice-categorie"></label>
                <datalist id="tice-categorie">${[...new Set(pazienti().map((x) => x.category).filter(Boolean))].map((c) => h`<option value="${c}">`)}</datalist>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Crea</button></div></form>`);
            if (!r || !r.nome.trim()) return;
            const p = { id: Date.now().toString(), name: r.nome.trim(), history: [], programma: { attivita: [] } };
            if (r.cat.trim()) p.category = r.cat.trim();
            await salvaPaziente(p);
            if (EST.nuovoBambino) await EST.nuovoBambino(p);
            vai('programma', p.id);
        },
        'apri-att': (b) => {
            const id = b.dataset.id;
            // Su tablet e computer un'attività collegata a un set si apre direttamente nel gioco
            const p0 = paz(T.pid), a0 = attivitaDi(p0, id);
            const c0 = a0 && !a0.temporanea && P.targetCorrente(a0);
            const v0 = bozza(p0.id).voci[id];
            if (c0 && c0.target.setId && !haDati(v0) && schermoGrande() && setArchivio().some((x) => x.id === c0.target.setId)) {
                lancia(p0, a0, c0.target);
                return;
            }
            T.aperte[id] = !T.aperte[id];
            aggiornaScheda(paz(T.pid), id);
        },
        segna: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            if (!att) return;
            const v = voce(p, att);
            const r = b.dataset.r;
            v[r.toLowerCase()] += 1;
            v.sequenza += r;
            if (navigator.vibrate) navigator.vibrate(r === 'V' ? 8 : 18);
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        gioca: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = bozza(p.id).voci[att.id];
            const t = v && v.targetId ? att.target.find((x) => x.id === v.targetId) : (P.targetCorrente(att) || {}).target;
            if (t) lancia(p, att, t);
        },
        annulla: (b) => {
            const p = paz(T.pid);
            const v = bozza(p.id).voci[b.dataset.id];
            if (!v || !v.sequenza) return;
            const u = v.sequenza.slice(-1);
            v.sequenza = v.sequenza.slice(0, -1);
            v[u.toLowerCase()] = Math.max(0, v[u.toLowerCase()] - 1);
            salvaBozza();
            aggiornaScheda(p, b.dataset.id);
        },
        'nota-voce': async (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att);
            const targets = (att.target || []).filter((t) => t.stato === 'attivo' || t.stato === 'criterio' || t.stato === 'repertorio' || t.id === v.targetId);
            const r = await foglio(h`<form><h2>${att.nome}</h2>
                ${targets.length > 1 ? h`<label class="campo"><span>Target registrato</span><select name="targetId">
                    ${targets.map((t) => h`<option value="${t.id}" ${t.id === v.targetId ? grezzo('selected') : ''}>${t.testo} (${P.STATI_TARGET[t.stato]})</option>`)}</select></label>` : ''}
                <div class="campo"><span>Tipo di seduta</span><div class="scelta">
                    <label><input type="radio" name="tipo" value="independent" ${v.sessionType !== 'timedelay' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                    <label><input type="radio" name="tipo" value="timedelay" ${v.sessionType === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label>
                </div></div>
                <label class="campo"><span>Correggi i conteggi</span><div class="riga-campi">
                    <input name="v" type="number" min="0" max="999" inputmode="numeric" value="${v.v}" aria-label="Corrette">
                    <input name="p" type="number" min="0" max="999" inputmode="numeric" value="${v.p}" aria-label="Promptate">
                    <input name="x" type="number" min="0" max="999" inputmode="numeric" value="${v.x}" aria-label="Errate">
                </div><span class="sotto piccolo">✓ corrette · P promptate · ✗ errate</span></label>
                <label class="campo"><span>Decisione (facoltativa)</span><input name="decisione" maxlength="200" value="${v.decisione || ''}" placeholder="es. Passa a 1&quot; T/D" list="tice-decisioni"></label>
                <datalist id="tice-decisioni"><option value='Passa a 0" T/D'><option value='Passa a 1" T/D'><option value='Passa a 2" T/D'><option value="Probe"><option value="Stop"></datalist>
                <label class="campo"><span>Nota</span><textarea name="nota" maxlength="2000">${v.nota || ''}</textarea></label>
                ${att.temporanea ? h`<button type="button" class="bt pericolo" data-foglio="togli" style="width:100%">Togli dalla seduta</button>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (r === 'togli') {
                const bz = bozza(p.id);
                bz.temp = bz.temp.filter((x) => x.id !== att.id);
                delete bz.voci[att.id];
                salvaBozza(); T.mantieniScroll = true; disegna();
                return;
            }
            if (!r) return;
            if (r.targetId && r.targetId !== v.targetId) {
                v.targetId = r.targetId;
                const tt = att.target.find((x) => x.id === r.targetId);
                v.mantenimento = !!(tt && tt.stato !== 'attivo');
            }
            v.sessionType = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
            ['v', 'p', 'x'].forEach((k) => {
                const n = Math.max(0, Math.min(999, parseInt(r[k], 10) || 0));
                if (n !== v[k]) {
                    // la sequenza non corrisponde più ai conteggi: la si ricostruisce in blocco
                    v[k] = n;
                    v.sequenza = 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x);
                }
            });
            v.decisione = r.decisione.trim();
            v.nota = r.nota.trim();
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        data: async () => {
            const p = paz(T.pid);
            const b = bozza(p.id);
            const r = await foglio(h`<form><h2>Data della seduta</h2>
                <p class="sotto">Per registrare dal foglio una seduta di un altro giorno.</p>
                <label class="campo"><span>Data</span><input type="date" name="data" required value="${b.data}" max="${oggi()}"></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Conferma</button></div></form>`);
            if (!r || !r.data) return;
            b.data = r.data;
            salvaBozza();
            disegna();
        },
        'annulla-seduta': async () => {
            const p = paz(T.pid);
            const r = riassunto(p);
            if (r.prove && !await conferma('Annullare la seduta?', `Le ${r.prove} risposte registrate andranno perse.`, { ok: 'Annulla seduta', pericolo: true })) return;
            eliminaBozza(p.id);
            T.aperte = {};
            disegna();
        },
        'aggiungi-oggi': async () => {
            const p = paz(T.pid);
            const b = bozza(p.id);
            const inSeduta = new Set(attivitaSeduta(p).map((a) => a.id));
            const dalProgramma = P.programma(p).attivita.filter((a) => !inSeduta.has(a.id));
            const nomiTemp = new Set(b.temp.map((t) => t.nome));
            const liste = (state.savedSets || []).filter((s) => (s.modes || []).includes('quaderno') && !(s.modes || []).includes('quaderno_task'));
            const daListe = [];
            liste.forEach((s) => (s.items || []).forEach((it) => {
                const n = String(it.name || it.label || '').trim();
                if (n && !nomiTemp.has(n) && !daListe.some((x) => x.nome === n)) daListe.push({ nome: n, lista: s.name, sessionType: it.sessionType });
            }));
            const opz = (a) => h`<button type="button" class="opzione" data-foglio="${'p:' + a.id}"><span class="corpo">${a.nome}<small>${ETICHETTE_STATO[a.stato] || a.stato}${a.area ? ' · ' + a.area : ''}</small></span>${icona('plus')}</button>`;
            const sospese = dalProgramma.filter((a) => a.stato !== 'terminato');
            const terminate = dalProgramma.filter((a) => a.stato === 'terminato');
            const r = await foglio(h`<form><h2>Aggiungi per questa seduta</h2>
                <label class="campo"><span>Nuova attività</span><input name="nome" maxlength="120" placeholder="Nome dell'attività" list="tice-liste" autocomplete="off" autofocus></label>
                <datalist id="tice-liste">${daListe.map((x) => h`<option value="${x.nome}">${x.lista}</option>`)}</datalist>
                <div class="scelta" style="margin-bottom:10px">
                    <label><input type="radio" name="tipo" value="independent" checked><span>Indipendente</span></label>
                    <label><input type="radio" name="tipo" value="timedelay"><span>Time delay</span></label></div>
                ${puoProgrammi(p) ? h`<label style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="programma"> Aggiungila anche al programma</label>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div>
                ${sospese.length ? h`<h3>Sospese nel programma</h3><div class="opzioni">${sospese.map(opz)}</div>` : ''}
                ${terminate.length ? h`<details style="margin-top:12px"><summary class="sotto">Riprendi un'attività terminata (${terminate.length})</summary><div class="opzioni" style="margin-top:6px">${terminate.map(opz)}</div></details>` : ''}
                </form>`);
            if (!r) return;
            if (typeof r === 'string' && r.startsWith('p:')) {
                b.extra.push(r.slice(2));
                T.aperte[r.slice(2)] = true;
            } else {
                const nome = String(r.nome || '').trim();
                if (!nome) return;
                const tipo = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
                if (r.programma) {
                    const att = P.nuovaAttivita(p, { nome, sessionType: tipo });
                    await salvaPaziente(p);
                    T.aperte[att.id] = true;
                } else {
                    const id = P.nuovoId('tmp');
                    b.temp.push({ id, nome, sessionType: tipo });
                    T.aperte[id] = true;
                }
            }
            salvaBozza();
            T.mantieniScroll = true;
            disegna();
        },
        termina: async () => {
            const p = paz(T.pid);
            const b = bozza(p.id);
            const r0 = riassunto(p);
            if (!r0.n) { avviso('Nessuna risposta registrata.', 'errore'); return; }
            const righe = Object.keys(b.voci).filter((k) => haDati(b.voci[k])).map((k) => {
                const v = b.voci[k], a = attivitaDi(p, k), tot = v.v + v.p + v.x, pct = Math.round(100 * v.v / tot);
                return h`<tr><td>${a ? a.nome : '?'}</td><td class="num">${v.v}/${tot}</td><td class="num"><b class="${classePct(pct, a && a.criterio && a.criterio.soglia)}">${pct}%</b></td></tr>`;
            });
            let operatore = '';
            try { operatore = localStorage.getItem('tice_operatore') || ''; } catch (e) { /* niente */ }
            const dati = await foglio(h`<form><h2>Fine seduta</h2>
                <table class="tabella" style="margin-bottom:14px"><tbody>${righe}</tbody>
                    <tfoot><tr><th>Learn unit</th><th class="num">${r0.corrette}/${r0.prove}</th><th class="num">${Math.round(100 * r0.corrette / r0.prove)}%</th></tr></tfoot></table>
                <label class="campo"><span>Chi ha condotto la seduta</span><input name="operatore" maxlength="120" value="${operatore}" placeholder="Nome, o più nomi separati da +"></label>
                <label class="campo"><span>Note sulla seduta (vanno nel diario del giorno)</span><textarea name="nota" maxlength="5000" placeholder="Comportamento, rinforzatori, osservazioni…"></textarea></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Continua</button><button class="bt primario">${icona('check')} Salva</button></div></form>`);
            if (!dati) return;
            try { localStorage.setItem('tice_operatore', dati.operatore.trim()); } catch (e) { /* niente */ }
            await salvaSeduta(p, b, dati);
        },
        'chiudi-target': async (b) => {
            const p = paz(T.pid);
            const att = P.attivita(p, b.dataset.id);
            const t = att && att.target.find((x) => x.id === b.dataset.t);
            if (!t) return;
            await proponiProssimo(p, att, t, P.criterioRaggiunto(P.sedute(p, att, t), att.criterio));
            disegna();
        },

        // --- programma ---
        'nuova-att': async () => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const r = await moduloAttivita(p, null);
            if (!r) return;
            const righe = String(r.target || '').split('\n').map((x) => x.trim()).filter(Boolean);
            const att = P.nuovaAttivita(p, Object.assign({}, r, { target: null }));
            righe.forEach((x, i) => P.aggiungiTarget(att, x, i === 0));
            await salvaPaziente(p);
            if (!righe.length) {
                // nessun target scritto: si sceglie subito da set, liste o a mano
                const rt = await moduloTarget(att);
                if (rt) { aggiungiTargetDaModulo(att, rt); await salvaPaziente(p); }
            }
            T.mantieniScroll = true;
            disegna();
        },
        'mod-att': async (b) => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const att = P.attivita(p, b.dataset.id);
            const r = await moduloAttivita(p, att);
            if (!r) return;
            if (r === 'elimina') {
                const n = P.sedute(p, att).length;
                if (!await conferma(`Eliminare «${att.nome}»?`, n ? `Le sue ${n} sedute restano nella cartella clinica, ma non saranno più collegate a un'attività del programma.` : 'Non ha ancora sedute registrate.', { ok: 'Elimina', pericolo: true })) return;
                const prog = P.programma(p);
                prog.attivita = prog.attivita.filter((x) => x.id !== att.id);
            } else if (typeof r === 'string') {
                att.stato = r;
            } else {
                const vecchioNome = att.nome;
                att.nome = r.nome.trim() || att.nome;
                att.area = r.area.trim();
                att.descrizione = r.descrizione.trim();
                att.sessionType = r.sessionType;
                att.criterio = { soglia: +r.soglia || 90, sedute: +r.sedute || 2 };
                att.prove = +r.prove || null;
                if (vecchioNome !== att.nome) rinominaSedute(p, att);
            }
            att.modificato = new Date().toISOString();
            await salvaPaziente(p);
            T.mantieniScroll = true;
            disegna();
        },
        'nuovo-target': async (b) => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const att = P.attivita(p, b.dataset.id);
            const r = await moduloTarget(att);
            if (!r) return;
            aggiungiTargetDaModulo(att, r);
            await salvaPaziente(p);
            T.mantieniScroll = true;
            disegna();
        },
        'menu-target': async (b) => {
            const p = paz(T.pid);
            const att = P.attivita(p, b.dataset.id);
            const t = att.target.find((x) => x.id === b.dataset.t);
            const n = P.sedute(p, att, t).length;
            const crit = P.criterioRaggiunto(P.sedute(p, att, t), att.criterio);
            const r = await foglio(h`<h2>${t.testo}</h2>
                <p class="sotto">${P.STATI_TARGET[t.stato]}${n ? ` · ${n} sedute` : ''}${crit ? ` · criterio raggiunto il ${formatoData(crit)}` : ''}</p>
                <div class="opzioni">
                    ${!puoProgrammi(p) && t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>` : ''}
                    ${!puoProgrammi(p) ? '' : h`${t.stato !== 'attivo' ? h`<button class="opzione" data-foglio="corrente">${icona('play')}<span class="corpo">Lavora su questo target<small>Diventa quello della presa dati</small></span></button>` : ''}
                    ${t.stato === 'attivo' ? h`<button class="opzione" data-foglio="criterio">${icona('flag-checkered')}<span class="corpo">Chiudi a criterio<small>E passa al successivo</small></span></button>` : ''}
                    ${t.stato === 'attivo' || t.stato === 'pianificato' ? h`<button class="opzione" data-foglio="repertorio">${icona('star')}<span class="corpo">Già in repertorio</span></button>` : ''}
                    ${t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>`
                        : h`<button class="opzione" data-foglio="testo">${icona('pen')}<span class="corpo">Modifica il testo</span></button>`}
                    <button class="opzione" data-foglio="su">${icona('arrow-up')}<span class="corpo">Sposta prima</span></button>
                    <button class="opzione" data-foglio="giu">${icona('arrow-down')}<span class="corpo">Sposta dopo</span></button>
                    ${!n ? h`<button class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina</span></button>` : ''}`}
                </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (!r) return;
            if (r === 'gioca') { lancia(p, att, t); return; }
            if (!puoProgrammi(p)) return;
            if (r === 'corrente') P.rendiCorrente(att, t.id);
            else if (r === 'criterio') { await proponiProssimo(p, att, t, crit); T.mantieniScroll = true; disegna(); return; }
            else if (r === 'repertorio') P.chiudiTarget(att, t.id, 'repertorio');
            else if (r === 'su' || r === 'giu') P.spostaTarget(att, t.id, r === 'su' ? -1 : 1);
            else if (r === 'elimina') { att.target = att.target.filter((x) => x.id !== t.id); att.modificato = new Date().toISOString(); }
            else if (r === 'testo') {
                const nt = await foglio(h`<form><h2>Testo del target</h2>
                    <label class="campo"><textarea name="t" required autofocus>${t.testo}</textarea></label>
                    ${n ? h`<p class="sotto piccolo">Le ${n} sedute già registrate prendono il nuovo nome.</p>` : ''}
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                if (!nt || !nt.t.trim()) return;
                t.testo = nt.t.trim().replace(/\s+/g, ' ');
                t.modificato = att.modificato = new Date().toISOString();
                rinominaSedute(p, att);
            }
            await salvaPaziente(p);
            T.mantieniScroll = true;
            disegna();
        },

        // --- import ---
        importa: async (b) => { await importaUno(+b.dataset.i); disegna(); },
        'importa-tutti': async () => {
            for (let i = 0; i < T.importazioni.length; i++) {
                if (T.importazioni[i].pk && !T.importazioni[i].fatto) await importaUno(i);
            }
            disegna();
        }
    };

    // ---------- target: scritti a mano, set dell'archivio, liste del Quaderno ----------
    const MODI_ESCLUSI = ['quaderno', 'quaderno_task', 'pool_random', 'pool_intraverbal'];
    const eLista = (s) => (s.modes || []).some((m) => m === 'quaderno' || m === 'quaderno_task');
    function setArchivio() {
        return ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => !eLista(s))
            .sort((a, b) => String(a.cat || a.category || '').localeCompare(String(b.cat || b.category || ''), 'it') || String(a.name).localeCompare(String(b.name), 'it'));
    }
    function listeQuaderno() {
        return ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => (s.modes || []).includes('quaderno') && !(s.modes || []).includes('quaderno_task'));
    }
    const etichettaModo = (m) => (typeof getModeLabel === 'function' ? getModeLabel(m) : m);
    function moduloTarget(att) {
        const sets = setArchivio();
        const liste = listeQuaderno();
        const modi = [...new Set(sets.flatMap((x) => x.modes || []))].filter((m) => !MODI_ESCLUSI.includes(m));
        const modoPred = att.mode || (modi.includes('tact') ? 'tact' : modi[0]);
        return foglio(h`<form><h2>Nuovi target · ${att.nome}</h2>
            <label class="campo"><span>Scritti a mano, uno per riga, nell'ordine in cui lavorarli</span><textarea name="t" placeholder="es. Battere le mani&#10;Toccare la testa"></textarea></label>
            ${sets.length ? h`<h3>Dall'archivio dei set</h3>
                <p class="sotto piccolo">Su tablet e computer, toccando l'attività si apre direttamente il gioco con il set, pronto da somministrare.</p>
                <input type="search" placeholder="Cerca un set" data-filtro-set autocomplete="off" style="margin-bottom:6px">
                <div class="opzioni" style="max-height:34vh;overflow-y:auto" data-elenco-set>
                    ${sets.map((x) => h`<label class="opzione" data-nome="${String(x.name + ' ' + (x.cat || x.category || '')).toLowerCase()}">
                        <input type="checkbox" name="s" value="${x.id}"><span class="corpo">${x.name}<small>${x.cat || x.category || ''}${x.items ? ' · ' + x.items.length + ' elementi' : ''}</small></span></label>`)}
                </div>
                <label class="campo" style="margin-top:8px"><span>Con il gioco</span><select name="modo">
                    ${modi.map((m) => h`<option value="${m}" ${m === modoPred ? grezzo('selected') : ''}>${etichettaModo(m)}</option>`)}</select></label>` : ''}
            ${liste.length ? h`<label class="campo"><span>Da una lista del Quaderno</span><select name="lista"><option value="">—</option>
                ${liste.map((x) => h`<option value="${x.id}">${x.name} (${(x.items || []).length})</option>`)}</select></label>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div></form>`,
        {
            invia: (f) => {
                const fd = new FormData(f);
                return { t: fd.get('t') || '', set: fd.getAll('s'), modo: fd.get('modo') || '', lista: fd.get('lista') || '' };
            },
            dopo: (f) => {
                const filtro = f.querySelector('[data-filtro-set]');
                if (filtro) filtro.addEventListener('input', () => {
                    const q = filtro.value.trim().toLowerCase();
                    f.querySelectorAll('[data-elenco-set] > label').forEach((l) => { l.hidden = !!q && !l.dataset.nome.includes(q) && !l.querySelector('input').checked; });
                });
            }
        });
    }
    function aggiungiTargetDaModulo(att, r) {
        String(r.t || '').split('\n').map((x) => x.trim()).filter(Boolean).forEach((x) => P.aggiungiTarget(att, x, true));
        const sets = setArchivio();
        r.set.forEach((id) => {
            const x = sets.find((y) => y.id === id);
            if (!x) return;
            const modi = (x.modes || []).filter((m) => !MODI_ESCLUSI.includes(m));
            const modo = modi.includes(r.modo) ? r.modo : (modi[0] || r.modo);
            P.aggiungiTarget(att, { testo: x.name, setId: x.id, mode: modo }, true);
            if (!att.mode && modo) att.mode = modo;
        });
        if (r.lista) {
            const l = listeQuaderno().find((y) => y.id === r.lista);
            ((l && l.items) || []).forEach((it) => {
                const n = String(it.name || it.label || '').trim();
                if (n) P.aggiungiTarget(att, n, true);
            });
        }
    }

    // Il nome delle sedute segue quello dell'attività e del target
    function rinominaSedute(p, att) {
        const perTarget = {};
        (att.target || []).forEach((t) => { perTarget[t.id] = t; });
        (p.history || []).forEach((s) => {
            if (s.attivitaId !== att.id) return;
            const t = s.targetId ? perTarget[s.targetId] : null;
            if (t && t.setId) return; // le sedute di un set portano il nome del set
            s.setName = P.nomeSet(att, t);
            s.setCat = att.area || s.setCat;
        });
    }

    function moduloAttivita(p, att) {
        const aree = [...new Set(P.programma(p).attivita.map((a) => a.area).filter(Boolean))];
        const a = att || { nome: '', area: '', descrizione: '', sessionType: 'independent', criterio: { soglia: 90, sedute: 2 }, prove: null };
        return foglio(h`<form><h2>${att ? 'Modifica attività' : 'Nuova attività'}</h2>
            <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${a.nome}" ${att ? '' : grezzo('autofocus')} placeholder="es. TACT, Imitazione motoria"></label>
            <label class="campo"><span>Area</span><input name="area" maxlength="60" value="${a.area}" list="tice-aree" placeholder="es. Linguaggio"></label>
            <datalist id="tice-aree">${aree.map((x) => h`<option value="${x}">`)}</datalist>
            <label class="campo"><span>Descrizione (facoltativa)</span><input name="descrizione" maxlength="300" value="${a.descrizione || ''}"></label>
            <div class="campo"><span>Tipo di seduta</span><div class="scelta">
                <label><input type="radio" name="sessionType" value="independent" ${a.sessionType !== 'timedelay' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                <label><input type="radio" name="sessionType" value="timedelay" ${a.sessionType === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label></div></div>
            <div class="riga-campi">
                <label class="campo"><span>Criterio %</span><input name="soglia" type="number" min="10" max="100" inputmode="numeric" value="${a.criterio.soglia}"></label>
                <label class="campo"><span>Giorni di fila</span><input name="sedute" type="number" min="1" max="10" inputmode="numeric" value="${a.criterio.sedute}"></label>
                <label class="campo"><span>Prove</span><input name="prove" type="number" min="1" max="200" inputmode="numeric" value="${a.prove || ''}" placeholder="—"></label>
            </div>
            ${att ? '' : h`<label class="campo"><span>Target, uno per riga (il primo è quello da cui si parte)</span><textarea name="target" placeholder="es. Animali: cane, gatto&#10;Frutta: mela, banana"></textarea>
                <span class="sotto piccolo">Lascia vuoto per sceglierli dall'archivio dei set o da una lista del Quaderno.</span></label>`}
            ${att ? h`<div class="opzioni" style="margin-top:6px">
                ${att.stato === 'attivo' ? h`<button type="button" class="opzione" data-foglio="sospeso">${icona('pause')}<span class="corpo">Sospendi<small>Non compare più nella presa dati</small></span></button>
                    <button type="button" class="opzione" data-foglio="terminato">${icona('flag-checkered')}<span class="corpo">Termina l'attività</span></button>`
                    : h`<button type="button" class="opzione" data-foglio="attivo">${icona('play')}<span class="corpo">Riprendi l'attività</span></button>`}
                <button type="button" class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina dal programma</span></button>
            </div>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
    }

    async function salvaSeduta(p, b, dati) {
        const quando = b.data === oggi() ? new Date().toISOString() : b.data + 'T12:00:00';
        const operatore = String(dati.operatore || '').trim();
        const nuove = [];
        const controlla = [];
        Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k];
            if (!haDati(v)) return;
            const att = attivitaDi(p, k);
            if (!att) return;
            const voceS = Object.assign({}, v, { operatore });
            let s;
            if (att.temporanea) {
                s = P.seduta({ id: null, nome: att.nome, area: '', sessionType: att.sessionType }, null, voceS, quando);
                s.attivitaId = null;
                s.setId = 'quaderno_' + att.nome.replace(/\s+/g, '_').toLowerCase();
            } else {
                const t = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
                const prima = t ? P.criterioRaggiunto(P.sedute(p, att, t), att.criterio) : null;
                s = P.seduta(att, t, voceS, quando);
                if (t && !t.inizio) t.inizio = b.data;
                if (t && t.stato === 'attivo' && !prima) controlla.push({ att, t });
            }
            nuove.push(s);
        });
        if (!p.history) p.history = [];
        p.history.push(...nuove);
        const nota = String(dati.nota || '').trim();
        if (nota) {
            p.dailyNotes = p.dailyNotes || {};
            p.dailyNotes[b.data] = p.dailyNotes[b.data] ? p.dailyNotes[b.data] + '\n\n' + nota : nota;
        }
        await salvaPaziente(p);
        eliminaBozza(p.id);
        T.aperte = {};
        avviso(`Seduta salvata: ${nuove.length} attività`);
        disegna();
        // Criteri raggiunti con questa seduta: si propone il passo successivo
        for (const { att, t } of controlla) {
            const data = P.criterioRaggiunto(P.sedute(p, att, t), att.criterio);
            if (data) await proponiProssimo(p, att, t, data);
        }
        disegna();
    }

    async function proponiProssimo(p, att, t, data) {
        if (!puoProgrammi(p)) {
            avviso(`${att.nome}: criterio raggiunto su «${t.testo}». Il passaggio al prossimo target lo decide la referente.`);
            return;
        }
        const pianificati = att.target.filter((x) => x.stato === 'pianificato');
        const r = await foglio(h`<form><h2>${icona('flag-checkered')} ${att.nome}</h2>
            <p>${data ? h`Il target <b>${t.testo}</b> ha raggiunto il criterio (${att.criterio.soglia}% per ${att.criterio.sedute} giorni di fila) il ${formatoData(data)}.`
                : h`Chiudere a criterio il target <b>${t.testo}</b>?`}</p>
            ${pianificati.length ? h`<h3>Passa a</h3><div class="opzioni">${pianificati.map((x, i) => h`
                <button type="button" class="opzione" data-foglio="${'t:' + x.id}">${icona(i === 0 ? 'circle-play' : 'circle')}<span class="corpo">${x.testo}${i === 0 ? h`<small>il prossimo in programma</small>` : ''}</span></button>`)}</div>` : ''}
            <h3>${pianificati.length ? 'Oppure un target nuovo' : 'Prossimo target'}</h3>
            <div style="display:flex;gap:8px"><input name="nuovo" maxlength="300" placeholder="Scrivi il prossimo target" style="flex:1;min-width:0">
                <button class="bt primario" style="flex:0 0 auto">Apri</button></div>
            <div class="bottoni" style="margin-top:18px">
                <button type="button" class="bt" data-foglio="dopo">Più tardi</button>
                <button type="button" class="bt" data-foglio="solo">Chiudi e basta</button>
            </div>
            <p class="sotto piccolo">"Più tardi" lascia il target in corso: si chiude quando si vuole dalla presa dati o dal programma. "Chiudi e basta" lo segna a criterio senza aprirne un altro.</p></form>`,
            { invia: (f) => { const n = f.querySelector('[name=nuovo]').value.trim(); if (!n) { f.querySelector('[name=nuovo]').focus(); return undefined; } return 'n:' + n; } });
        if (!r || r === 'dopo') return;
        if (r === 'solo') P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), null);
        else if (r.startsWith('t:')) P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), r.slice(2));
        else if (r.startsWith('n:')) {
            const nuovo = P.aggiungiTarget(att, r.slice(2), false);
            P.chiudiTarget(att, t.id, 'criterio', data || P.oggi(), nuovo.id);
        }
        await salvaPaziente(p);
        const c = P.targetCorrente(att);
        avviso(c && !c.mantenimento ? `${att.nome}: ora «${c.target.testo}»` : `${att.nome}: target chiuso`);
    }

    async function importaUno(i) {
        const it = T.importazioni[i];
        if (!it || !it.pk || it.fatto) return;
        let p = it.pazienteId ? paz(it.pazienteId) : null;
        if (!p) {
            p = { id: Date.now().toString() + i, name: (it.nome || it.pk.nome).trim() || it.pk.nome, history: [], programma: { attivita: [] } };
        }
        try {
            const soglia = typeof DEFAULT_CRITERION !== 'undefined' ? DEFAULT_CRITERION : 90;
            const nuovo = !paz(p.id);
            const r = TiceImport.applica(p, it.pk, it.conferme, { sogliaPredefinita: soglia });
            await salvaPaziente(p);
            if (nuovo && EST.nuovoBambino) await EST.nuovoBambino(p);
            it.pazienteId = p.id;
            it.nome = p.name;
            it.fatto = `${r.sedute} sedute e ${it.pk.attivita.length} attività nella cartella di ${p.name}.`;
        } catch (e) {
            console.error(e);
            avviso('Import non riuscito: ' + e.message, 'errore');
        }
    }

    async function leggiFile(files) {
        for (const f of files) {
            if (!/\.numbers$/i.test(f.name)) {
                T.importazioni.push({ file: f.name, errore: 'Non è un file .numbers.' });
                continue;
            }
            T.leggendo = f.name; disegna();
            try {
                const doc = await NumbersReader.leggi(await f.arrayBuffer());
                const pk = TiceImport.analizza(doc, f.name);
                if (!pk.attivita.length) throw new Error('Nessuna tabella di attività riconosciuta in questo file.');
                const n = normNome(pk.nome);
                const esistente = pazienti().find((x) => normNome(x.name) === n);
                const conferme = {};
                pk.daConfermare.forEach((d) => { conferme[d.attivitaId] = d.proposta; });
                T.importazioni.push({ file: f.name, pk, nome: pk.nome, pazienteId: esistente ? esistente.id : '', conferme });
            } catch (e) {
                console.error(e);
                T.importazioni.push({ file: f.name, errore: e.message || String(e) });
            }
        }
        T.leggendo = null;
        disegna();
    }

    // ---------- somministrare con l'app un target collegato a un set ----------
    const schermoGrande = () => window.matchMedia('(min-width: 768px)').matches;
    function lancia(p, att, t) {
        const modo = P.modoTarget(att, t);
        const set = setArchivio().find((x) => x.id === t.setId);
        if (!set || !modo) { avviso('Set o gioco non disponibili su questo dispositivo.', 'errore'); return; }
        const v = bozza(p.id).voci[att.id];
        const tipo = (v && v.sessionType) || att.sessionType || 'independent';
        T.lancio = { pid: p.id, attId: att.id, targetId: t.id, setId: t.setId, mode: modo, n: (p.history || []).length, nome: att.nome, testo: t.testo };
        salvaLancio();
        chiudi();
        try {
            if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            selectModeFromDropdown(modo);
            const campo = document.getElementById('session-type-select');
            if (campo) { campo.value = tipo === 'timedelay' ? 'timedelay' : 'independent'; onSessionTypeChange(); }
            const sec = document.getElementById('td-seconds-ctrl');
            if (sec && (t.tdSeconds || att.tdSeconds)) sec.value = t.tdSeconds || att.tdSeconds;
            selectSetFromDropdown(t.setId);
        } catch (e) {
            console.error(e);
            avviso('Non sono riuscito ad aprire il gioco: ' + e.message, 'errore');
        }
        aggiornaLinguetta();
    }
    function salvaLancio() {
        try { if (T.lancio) sessionStorage.setItem('tice_lancio', JSON.stringify(T.lancio)); else sessionStorage.removeItem('tice_lancio'); } catch (e) { /* niente */ }
    }
    function aggiornaLinguetta() {
        let l = document.getElementById('tice-linguetta');
        if (!l) {
            l = document.createElement('button');
            l.id = 'tice-linguetta';
            l.className = 'tice-linguetta';
            l.type = 'button';
            l.addEventListener('click', () => apri());
            // trascinandola verso il basso si apre la presa dati, come una tendina
            let y0 = null;
            l.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
            l.addEventListener('touchmove', (e) => { if (y0 != null && e.touches[0].clientY - y0 > 30) { y0 = null; apri(); } }, { passive: true });
            document.body.appendChild(l);
        }
        const L = T.lancio;
        l.innerHTML = String(h`${icona('chevron-down')} <b>Presa dati</b>${L ? h` <span>· ${L.nome} · ${L.testo}</span>` : ''}`);
        l.hidden = !radice().hidden;
    }
    // Le sedute salvate dal gioco lanciato da qui vengono collegate all'attività
    // e al target del programma; poi si torna alla presa dati.
    function agganciaSalvataggi() {
        if (typeof DB === 'undefined' || DB._tice) return;
        const originale = DB.savePatient.bind(DB);
        DB._tice = true;
        DB.savePatient = async (p) => {
            const L = T.lancio;
            let nuove = [];
            if (L && p && p.id === L.pid && !T.salvandoQui) {
                nuove = (p.history || []).slice(L.n).filter((s) => !s.attivitaId && (s.setId === L.setId || s.mode === L.mode));
                nuove.forEach((s) => { s.attivitaId = L.attId; s.targetId = L.targetId; s.fonte = 'app-gioco'; });
            }
            const r = await originale(p);
            if (nuove.length) {
                T.lancio = null;
                salvaLancio();
                const tot = nuove.reduce((n, s) => n + (s.total || 0), 0), ok = nuove.reduce((n, s) => n + (s.correct || 0), 0);
                setTimeout(async () => {
                    await apri();
                    vai('seduta', L.pid);
                    avviso(`${L.nome}: ${ok}/${tot} salvato dal gioco`);
                    const pp = paz(L.pid), att = pp && P.attivita(pp, L.attId), t = att && att.target.find((x) => x.id === L.targetId);
                    if (t && t.stato === 'attivo') {
                        const data = P.criterioRaggiunto(P.sedute(pp, att, t), att.criterio);
                        if (data === P.oggi()) { await proponiProssimo(pp, att, t, data); disegna(); }
                    }
                }, 350);
            }
            return r;
        };
    }

    // Cartelle, archivio e impostazioni aperti da qui: alla chiusura si torna qui
    let tornaQui = false;
    function apriDaQui(apertura) { chiudi(); tornaQui = true; return apertura(); }
    ['closePatients', 'closeLibrary', 'closeSettings'].forEach((nome) => {
        const originale = window[nome];
        if (typeof originale !== 'function') return;
        window[nome] = function () {
            const r = originale.apply(this, arguments);
            if (tornaQui) { tornaQui = false; apri(); }
            return r;
        };
    });
    function apriCartella(pid) {
        apriDaQui(() => openPatients().then(() => { if (typeof selectPatientModal === 'function') selectPatientModal(pid); }));
    }

    // ---------- eventi ----------
    function suClick(e) {
        const b = e.target.closest('[data-a]');
        if (!b || !radice().contains(b)) return;
        const f = azioni[b.dataset.a];
        if (!f) return;
        e.preventDefault();
        Promise.resolve(f(b, e)).catch((err) => { console.error(err); avviso(err.message || String(err), 'errore'); });
    }
    function suCambio(e) {
        const el = e.target;
        const c = el.dataset && el.dataset.cambio;
        if (!c) return;
        if (c === 'cerca') {
            T.cerca = el.value;
            const pos = el.selectionStart;
            disegna();
            const n = radice().querySelector('[data-cambio=cerca]');
            if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* niente */ } }
        } else if (c === 'file-numbers' && e.type === 'change') {
            const files = [...el.files];
            el.value = '';
            leggiFile(files);
        } else if (c === 'imp-paziente' && e.type === 'change') {
            T.importazioni[+el.dataset.i].pazienteId = el.value;
            T.mantieniScroll = true; disegna();
        } else if (c === 'imp-nome') {
            T.importazioni[+el.dataset.i].nome = el.value;
        } else if (c === 'imp-prove' && e.type === 'change') {
            const it = T.importazioni[+el.dataset.i];
            const n = parseInt(el.value, 10);
            if (n > 0) it.conferme[el.dataset.att] = n;
            T.mantieniScroll = true; disegna();
        }
    }

    // ---------- apertura e chiusura ----------
    async function apri() {
        await caricaPazienti();
        const r = radice();
        r.hidden = false;
        document.body.classList.add('tice-aperto');
        disegna();
        aggiornaLinguetta();
    }
    function chiudi() {
        salvaBozza();
        radice().hidden = true;
        document.body.classList.remove('tice-aperto');
        if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
        aggiornaLinguetta();
    }
    async function avvia() {
        const r = radice();
        if (!r) return;
        r.addEventListener('click', suClick);
        r.addEventListener('input', suCambio);
        r.addEventListener('change', suCambio);
        r.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.chiusi) T.chiusiAperti[d.dataset.chiusi] = d.open; }, true);
        window.addEventListener('pagehide', salvaBozza);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvaBozza(); });
        agganciaSalvataggi();
        try { T.lancio = JSON.parse(sessionStorage.getItem('tice_lancio') || 'null'); } catch (e) { T.lancio = null; }
        await apri();
    }

    window.TiceHome = {
        apri, chiudi, vai: (v, pid) => { apri().then(() => vai(v, pid)); },
        estendi(e) {
            Object.assign(VISTE, e.viste || {});
            Object.assign(azioni, e.azioni || {});
            Object.assign(EST, e.aggancio || {});
        },
        attuale: () => ({ vista: T.vista, pid: T.pid }),
        ridisegna: () => { if (!radice().hidden) { T.mantieniScroll = true; disegna(); } },
        strumenti: { h, grezzo, icona, foglio, conferma, avviso, barra, vai: (v, pid) => vai(v, pid), paz, pazienti, salvaPaziente, formatoData, T }
    };
    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})();
