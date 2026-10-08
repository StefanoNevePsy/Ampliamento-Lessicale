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
    const T = { vista: 'turni', pid: null, aperte: {}, chiusiAperti: {}, suggerimenti: {}, cerca: '', importazioni: [] };
    // Suggerimenti per chi somministra: dell'attività e del target in corso
    const suggerimentiDi = (att, t) => [att && att.suggerimenti, t && t.suggerimento].map((x) => String(x || '').trim()).filter(Boolean);
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
        if (T.ta && T.ta.pid === pid) T.ta = null;
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

    // ---------- task analysis: un passo alla volta ----------
    // Nella voce della seduta: esiti = { passoId: 'VPX…' }, passo = indice del
    // passo da segnare, giri = giri completati, ordine = passo di ogni risposta
    // (parallelo a sequenza), per poter annullare l'ultima.
    function targetVoce(att, v) {
        if (v && v.targetId) return (att.target || []).find((x) => x.id === v.targetId) || null;
        const c = att.temporanea ? null : P.targetCorrente(att);
        return c ? c.target : null;
    }
    const passiVoce = (att, v) => P.passiDi(targetVoce(att, v));
    function statoTA(v, passi) {
        const i = Math.min((v && v.passo) || 0, Math.max(0, passi.length - 1));
        return { i, passo: passi[i], giri: (v && v.giri) || 0 };
    }
    // Ultime risposte della seduta, in ordine, per l'annulla sempre a portata
    function ultimeDi(b) { return b.ultime || (b.ultime = []); }
    function descriviUltima(p) {
        const b = bozza(p.id), u = ultimeDi(b);
        for (let k = u.length - 1; k >= 0; k--) {
            const att = attivitaDi(p, u[k]), v = b.voci[u[k]];
            if (!att || !v || !v.sequenza) continue;
            const r = v.sequenza.slice(-1);
            const passi = passiVoce(att, v);
            const ps = passi.length && v.ordine ? passi.find((x) => x.id === v.ordine[v.ordine.length - 1]) : null;
            return { att, r, testo: att.nome + (ps ? ' · ' + ps.testo : '') };
        }
        return null;
    }
    function tastoAnnulla(p) {
        const d = descriviUltima(p);
        const SEGNO = { V: '✓', P: 'P', X: '✗' };
        return h`<button id="tice-annulla" class="tice-annulla ${d ? '' : 'nascosto'}" data-a="annulla-ultima" ${d ? '' : grezzo('hidden')}
            aria-label="${d ? 'Annulla l\'ultima: ' + SEGNO[d.r] + ' ' + d.testo : 'Annulla'}" title="${d ? 'Annulla: ' + d.testo : ''}">
            ${icona('rotate-left')}<span class="cosa"><b class="${d ? d.r : ''}">${d ? SEGNO[d.r] : ''}</b> ${d ? d.testo : ''}</span></button>`;
    }

    // La lista dei passi a tutto schermo; "Quaderno" la mette da parte e
    // lascia una linguetta per tornarci.
    function pannelloTA(p) {
        if (!T.ta || T.ta.pid !== p.id) return h`<div id="tice-ta"></div>`;
        const att = attivitaDi(p, T.ta.attId);
        const v = att && bozza(p.id).voci[att.id];
        const passi = att ? passiVoce(att, v) : [];
        if (!att || !passi.length) { T.ta = null; return h`<div id="tice-ta"></div>`; }
        const t = targetVoce(att, v), st = statoTA(v, passi);
        const tipo = (v && v.sessionType) || att.sessionType;
        if (T.ta.nascosta) {
            return h`<div id="tice-ta"><button class="ta-linguetta" data-a="mostra-ta">${icona('list-ol')}
                <span><b>${t.testo}</b><br><small>passo ${st.i + 1} di ${passi.length} · ${st.passo.testo}</small></span>${icona('chevron-up')}</button></div>`;
        }
        const tot = v ? v.v + v.p + v.x : 0;
        const anima = T.ta.anima;
        T.ta.anima = false;   // solo all'apertura, non a ogni punteggio
        return h`<div id="tice-ta" class="ta-strato ${anima ? 'anima' : ''}" role="dialog" aria-label="Task analysis ${t.testo}">
            <div class="ta-testa">
                <button class="ib" data-a="chiudi-ta" aria-label="Chiudi la lista">${icona('xmark')}</button>
                <div class="ta-titolo"><b>${t.testo}</b><small>${att.nome} · giro ${st.giri + 1}${tot ? ` · ${v.v}/${tot} (${Math.round(100 * v.v / tot)}%)` : ''}</small></div>
                <button class="bt piccolo" data-a="nascondi-ta" title="Torna al quaderno della seduta, la lista resta a portata">${icona('book-open')} Quaderno</button>
            </div>
            <ol class="ta-passi">
                ${passi.map((ps, k) => {
                    const e = (v && v.esiti && v.esiti[ps.id]) || '';
                    return h`<li class="${k === st.i ? 'corrente' : ''}" ${k === st.i ? grezzo('data-corrente') : ''}>
                        <button class="ta-passo" data-a="vai-passo" data-id="${att.id}" data-k="${k}">
                            <span class="n">${k + 1}</span><span class="tt">${ps.testo}</span>
                            <span class="esiti">${e.split('').map((r) => h`<i class="${r}"></i>`)}</span>
                        </button></li>`;
                })}
            </ol>
            <div class="ta-piede">
                <div class="ta-ora"><small>Passo ${st.i + 1} di ${passi.length}</small><b>${st.passo.testo}</b></div>
                <div class="tasti">
                    <button class="tasto v" data-a="segna" data-id="${att.id}" data-r="V">✓<small>Corretta</small></button>
                    <button class="tasto p" data-a="segna" data-id="${att.id}" data-r="P">P<small>${att.nomeP || (tipo === 'timedelay' ? 'Promptata' : 'Con aiuto')}</small></button>
                    <button class="tasto x" data-a="segna" data-id="${att.id}" data-r="X">✗<small>Errata</small></button>
                </div>
                <button class="bt piccolo fantasma" data-a="salta-passo" data-id="${att.id}">Salta il passo ${icona('forward')}</button>
            </div>
        </div>`;
    }
    function aggiornaSovra(p) {
        const ta = document.getElementById('tice-ta');
        if (ta) {
            const scroll = (ta.querySelector('.ta-passi') || {}).scrollTop;
            ta.outerHTML = String(pannelloTA(p));
            const nuovo = document.querySelector('#tice-ta .ta-passi');
            if (nuovo) {
                if (scroll != null) nuovo.scrollTop = scroll;
                const c = nuovo.querySelector('[data-corrente]');
                if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        const a = document.getElementById('tice-annulla');
        if (a) a.outerHTML = String(tastoAnnulla(p));
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
        return h`${barra({ indietro: VISTE.turni ? 'vai-bambini' : null, titolo: 'Tutti i bambini', destra: h`
                <button class="ib" data-a="vai-turni" aria-label="Turni" title="Turni della settimana">${icona('calendar-week')}</button>
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
        const hint = suggerimentiDi(att, t).length;
        const passi = P.passiDi(t);
        const st = passi.length ? statoTA(v, passi) : null;
        const tdS = tipo === 'timedelay' ? tdOggi(att, v, t || null) : null;
        return h`<div class="att ${haDati(v) ? 'con-dati' : ''} ${hint ? 'con-hint' : ''}" data-att="${att.id}">
            ${hint ? h`<button class="ib hint-tasto ${T.suggerimenti[att.id] ? 'on' : ''}" data-a="suggerimenti" data-id="${att.id}" aria-expanded="${T.suggerimenti[att.id] ? 'true' : 'false'}" aria-label="Suggerimenti" title="Suggerimenti per chi somministra">${icona('lightbulb')}</button>` : ''}
            <button class="att-testa" data-a="apri-att" data-id="${att.id}" aria-expanded="${aperta ? 'true' : 'false'}">
                <span class="corpo">
                    <span class="nome">${att.nome}
                        ${tipo === 'timedelay' ? h` <span class="pill">T/D${tdS != null ? ' ' + sec(tdS) : ''}</span>` : ''}
                        ${att.temporanea ? h` <span class="pill grigia">solo oggi</span>` : ''}
                        ${att.stato && att.stato !== 'attivo' ? h` <span class="pill grigia">${att.stato}</span>` : ''}
                        ${mant ? h` <span class="pill arancio" title="Il target ha già raggiunto il criterio: si registra come mantenimento finché non si apre il prossimo">mantenimento</span>` : ''}
                        ${aCriterio ? h` <span class="pill verde">${icona('flag-checkered')} criterio</span>` : ''}
                    </span>
                    ${t ? h`<span class="target">${t.setId ? h`${icona(giocabile ? 'layer-group' : 'triangle-exclamation')} ` : ''}${t.testo}${t.setId ? h` · ${etichettaModo(P.modoTarget(att, t))}` : ''}</span>` : (!att.temporanea ? h`<span class="target"><i>Nessun target in corso: aggiungilo dal programma.</i></span>` : '')}
                    ${st ? h`<span class="target ta-riga">${icona('list-ol')} passo <b>${st.i + 1}/${passi.length}</b> · ${st.passo.testo}${st.giri ? h` <span class="pill grigia">giro ${st.giri + 1}</span>` : ''}</span>` : ''}
                    ${oggiT ? h`<span class="target">${icona('circle-check')} già oggi: ${oggiV}/${oggiT} (${Math.round(100 * oggiV / oggiT)}%)</span>` : ''}
                </span>
                <span class="conto">${tot ? h`<b class="${classePct(pct, soglia)}">${pct}%</b><br><span class="piccolo sotto">${v.v}/${tot}${att.prove ? ' di ' + att.prove : ''}</span>`
                    : h`<span class="piccolo sotto">${att.prove ? att.prove + ' prove' : 'tocca'}</span>`}</span>
            </button>
            ${hint && T.suggerimenti[att.id] ? h`<div class="att-suggerimenti aperti">
                ${h`<div class="sugg-testo">
                    ${att.suggerimenti ? h`<p>${att.suggerimenti}</p>` : ''}
                    ${t && t.suggerimento ? h`<p>${att.suggerimenti ? h`<b>${t.testo}:</b> ` : ''}${t.suggerimento}</p>` : ''}
                </div>`}
            </div>` : ''}
            ${aperta ? h`<div class="att-corpo">
                ${giocabile ? h`<button class="bt primario largo" style="margin-bottom:10px" data-a="gioca" data-id="${att.id}">${icona('play')} Somministra con l'app · ${etichettaModo(P.modoTarget(att, t))}</button>` : ''}
                ${t && t.setId && !giocabile ? h`<p class="sotto piccolo">Il set «${t.testo}» non è su questo dispositivo: scaricalo dai materiali o segna qui sotto.</p>` : ''}
                ${att.cronometro ? cronometro(att, v) : ''}
                ${st ? h`<div class="ta-ora in-scheda">
                    <small>Passo ${st.i + 1} di ${passi.length}${st.giri ? ` · giro ${st.giri + 1}` : ''}</small><b>${st.passo.testo}</b>
                    <span class="ta-punti">${passi.map((ps, k) => h`<i class="${k === st.i ? 'qui' : ''} ${((v && v.esiti && v.esiti[ps.id]) || '').slice(-1)}"></i>`)}</span>
                </div>` : ''}
                <div class="tasti">
                    <button class="tasto v" data-a="segna" data-id="${att.id}" data-r="V">✓<small>Corretta</small></button>
                    <button class="tasto p" data-a="segna" data-id="${att.id}" data-r="P">P<small>${att.nomeP || (tipo === 'timedelay' ? 'Promptata' : 'Con aiuto')}</small></button>
                    <button class="tasto x" data-a="segna" data-id="${att.id}" data-r="X">✗<small>Errata</small></button>
                </div>
                <div class="sotto-tasti">
                    <div class="sequenza" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                    ${st ? h`<button class="ib" data-a="salta-passo" data-id="${att.id}" aria-label="Salta il passo" title="Salta il passo">${icona('forward')}</button>
                    <button class="ib" data-a="apri-ta" data-id="${att.id}" aria-label="Lista dei passi" title="Lista dei passi">${icona('list-ol')}</button>` : ''}
                    ${tipo === 'timedelay' ? h`<button class="bt piccolo fantasma td-voce" data-a="td-voce" data-id="${att.id}" title="Cambia il time delay">${icona('stopwatch')} ${tdS != null ? sec(tdS) : 'T/D ?'}</button>` : ''}
                    <button class="ib" data-a="annulla" data-id="${att.id}" aria-label="Annulla l'ultima" title="Annulla l'ultima">${icona('rotate-left')}</button>
                    <button class="ib" data-a="nota-voce" data-id="${att.id}" aria-label="Nota e opzioni" title="Nota e opzioni">${icona('pen')}</button>
                </div>
                ${prev ? h`<p class="avviso-criterio">${icona('flag-checkered')} ${prev}</p>` : ''}
                ${aCriterio ? h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}. <button class="bt piccolo" data-a="chiudi-target" data-id="${att.id}" data-t="${t.id}">Passa al prossimo target</button></p>` : ''}
                ${v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${v.nota}</p>` : ''}
            </div>` : ''}
        </div>`;
    }
    // ---------- cronometro per le attività di fluency ----------
    const tempoDi = (v) => (v && v.tempo ? (v.tempo.ms || 0) + (v.tempo.da ? Date.now() - v.tempo.da : 0) : 0);
    const mmss = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    function alMinuto(v) {
        const min = tempoDi(v) / 60000;
        return min >= 0.25 && v ? (v.v / min).toFixed(1).replace('.', ',') : '—';
    }
    function cronometro(att, v) {
        const va = !!(v && v.tempo && v.tempo.da);
        return h`<div class="cronometro" data-crono="${att.id}">
            <span class="t">${mmss(tempoDi(v))}</span>
            <button class="bt piccolo ${va ? '' : 'primario'}" data-a="crono" data-id="${att.id}">${icona(va ? 'pause' : 'play')} ${va ? 'Pausa' : (tempoDi(v) ? 'Riprendi' : 'Avvia')}</button>
            <span class="sotto piccolo"><b data-al-minuto>${alMinuto(v)}</b> corrette al minuto</span>
        </div>`;
    }
    setInterval(() => {
        const r = document.querySelectorAll('#tice [data-crono]');
        if (!r.length) return;
        const p = paz(T.pid);
        if (!p) return;
        r.forEach((el) => {
            const v = bozza(p.id).voci[el.dataset.crono];
            if (!v || !v.tempo || !v.tempo.da) return;
            el.querySelector('.t').textContent = mmss(tempoDi(v));
            el.querySelector('[data-al-minuto]').textContent = alMinuto(v);
        });
    }, 1000);

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
        const perArea = perCategoria(lista);
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
            ${tastoAnnulla(p)}
            ${pannelloTA(p)}
            <div class="piede"><div class="piede-dentro">
                <div class="riassunto" id="tice-riassunto">${grezzo(testoPiede(p))}</div>
                <button class="bt primario" data-a="termina">${icona('check')} Salva seduta</button>
            </div></div>`;
    }
    function annullaUltima(p, id) {
        const b = bozza(p.id), v = b.voci[id];
        if (!v || !v.sequenza) return;
        const u = v.sequenza.slice(-1);
        v.sequenza = v.sequenza.slice(0, -1);
        v[u.toLowerCase()] = Math.max(0, v[u.toLowerCase()] - 1);
        // task analysis: si torna sul passo annullato, da risegnare
        if (v.ordine && v.ordine.length) {
            const ps = v.ordine.pop(), giri = (v.giriPrima || []).pop();
            if (v.esiti && v.esiti[ps]) v.esiti[ps] = v.esiti[ps].slice(0, -1);
            const att = attivitaDi(p, id), passi = att ? passiVoce(att, v) : [];
            const k = passi.findIndex((x) => x.id === ps);
            if (k >= 0) v.passo = k;
            if (giri != null) v.giri = giri;
        }
        const ul = ultimeDi(b), k = ul.lastIndexOf(id);
        if (k >= 0) ul.splice(k, 1);
        if (navigator.vibrate) navigator.vibrate([6, 40, 6]);
        salvaBozza();
        aggiornaScheda(p, id);
    }
    function aggiornaScheda(p, id) {
        const el = radice().querySelector(`[data-att="${CSS.escape(id)}"]`);
        const att = attivitaDi(p, id);
        if (el && att) el.outerHTML = String(schedaAttivita(p, att));
        const r = document.getElementById('tice-riassunto');
        if (r) r.innerHTML = testoPiede(p);
        aggiornaSovra(p);
    }

    // ---------- modalità e categorie (js/tice-modalita.js) ----------
    // Nel centro il dizionario è condiviso dal custode; sul dispositivo da solo resta qui.
    const M = window.TiceModalita;
    function dizionario() {
        const d = EST.dizionario && EST.dizionario();
        if (d) return d;
        try { return JSON.parse(localStorage.getItem('tice_modalita') || 'null') || {}; } catch (e) { return {}; }
    }
    async function salvaDizionario(aggiunte) {
        if (!aggiunte || (!Object.keys(aggiunte.sinonimi || {}).length && !(aggiunte.modalita || []).length)) return;
        if (EST.dizionario && EST.dizionario()) return EST.salvaDizionario(aggiunte);
        localStorage.setItem('tice_modalita', JSON.stringify(M.unisci(dizionario(), aggiunte)));
    }
    // Le attività raggruppate per categoria, nell'ordine delle categorie
    function perCategoria(lista) {
        const diz = dizionario();
        const ordine = M.elenco(diz).categorie.map((c) => c.id);
        const gruppi = [];
        lista.forEach((a) => {
            const c = a.temporanea ? { id: '~oggi', nome: 'Aggiunte per oggi' }
                : M.categoriaDi(a, diz) || (a.area ? { id: '~' + a.area, nome: a.area } : { id: '~altre', nome: 'Altre attività' });
            let g = gruppi.find((x) => x.id === c.id);
            if (!g) gruppi.push(g = { id: c.id, area: c.nome, att: [] });
            g.att.push(a);
        });
        const pos = (g) => { const i = ordine.indexOf(g.id); return i >= 0 ? i : g.id === '~oggi' ? 999 : 500; };
        return gruppi.sort((a, b) => pos(a) - pos(b));
    }
    // Stato di una scelta di modalità (anteprima di import o riordino)
    function statoModalita(att) {
        const r = M.riconosci(att, dizionario());
        return Object.assign(r, {
            nome: att.nome, area: att.area || (att.stato && att.stato !== 'attivo' ? 'terminata' : ''),
            nuova: r.nuova ? Object.assign({ id: M.nuovoId(r.nuova.nome) }, r.nuova) : null,
            iniziale: r.certo,
        });
    }
    function sceltaModalita(k) {
        if (k === 'c') return T.classifica && T.classifica.righe;
        const it = T.importazioni[+String(k).slice(1)];
        return it && it.modalita;
    }
    function opzioniModalita(scelta) {
        const E = M.elenco(dizionario());
        return E.categorie.map((c) => {
            const ms = E.modalita.filter((m) => m.categoria === c.id);
            return ms.length ? h`<optgroup label="${c.nome}">${ms.map((m) => h`<option value="${m.id}" ${scelta === m.id ? grezzo('selected') : ''}>${m.nome}</option>`)}</optgroup>` : '';
        });
    }
    function rigaModalita(k, id, st) {
        const E = M.elenco(dizionario());
        const da = (c) => grezzo(`data-cambio="${c}" data-k="${esc(k)}" data-att="${esc(id)}"`);
        const stato = st.ambiguo ? h`<span class="pill arancio">da scegliere</span>`
            : !st.modalita ? h`<span class="pill arancio">nuova</span>`
            : !st.certo ? h`<span class="pill arancio">da controllare</span>` : '';
        return h`<div class="riga-mod">
            <div><b>${st.nome}</b>${st.area ? h` <span class="sotto piccolo">· ${st.area}</span>` : ''} ${stato}</div>
            ${st.motivo && !st.certo ? h`<div class="sotto piccolo">${st.motivo}</div>` : ''}
            <div class="riga-campi">
                <label class="campo"><span>Modalità</span><select class="campo-in" ${da('mod-scelta')}>
                    <option value="+" ${!st.modalita ? grezzo('selected') : ''}>Nuova modalità…</option>${opzioniModalita(st.modalita)}</select></label>
                ${st.modalita ? h`<label class="campo"><span>Variante</span><input class="campo-in" maxlength="80" value="${st.variante || ''}" placeholder="—" ${da('mod-variante')}></label>`
                    : h`<label class="campo"><span>Nome</span><input class="campo-in" maxlength="60" value="${st.nuova.nome}" ${da('mod-nuova-nome')}></label>
                    <label class="campo"><span>Categoria</span><select class="campo-in" ${da('mod-nuova-cat')}>${E.categorie.map((c) => h`<option value="${c.id}" ${st.nuova.categoria === c.id ? grezzo('selected') : ''}>${c.nome}</option>`)}</select></label>`}
            </div>
        </div>`;
    }
    // Le scelte fatte → attività classificate e aggiunte al dizionario.
    // Due tabelle con lo stesso nome nuovo diventano la stessa modalità.
    function applicaScelte(coppie) {
        const diz = dizionario();
        const nuoveNome = {};
        M.elenco(diz).modalita.forEach((m) => { nuoveNome[M.normalizza(m.nome)] = m.id; });
        const scelte = coppie.map(([att, st]) => {
            let id = st.modalita, nuova = null;
            if (!id) {
                const nn = M.normalizza(st.nuova.nome);
                if (nuoveNome[nn]) id = nuoveNome[nn];
                else { nuova = { id: st.nuova.id, nome: st.nuova.nome.trim() || 'Nuova modalità', categoria: st.nuova.categoria || 'altro' }; id = nuova.id; nuoveNome[nn] = id; }
            }
            att.modalita = id;
            att.variante = st.modalita ? String(st.variante || '').trim() : '';
            return { chiave: st.chiave, modalita: id, variante: att.variante, nuova };
        });
        const aggiunte = M.aggiunte(scelte, diz);
        const dopo = M.unisci(diz, aggiunte);
        coppie.forEach(([att]) => { const c = M.categoriaDi(att, dopo); if (c) att.setCat = c.nome; });
        return aggiunte;
    }
    async function condividiScelte(aggiunte) {
        try { await salvaDizionario(aggiunte); }
        catch (e) { avviso('Modalità non condivise con il centro: ' + (e.message || e), 'errore'); }
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
                    <span class="tt">${P.passiDi(tg).length ? h`${icona('list-ol')} ` : ''}${tg.testo}${P.passiDi(tg).length ? h` <span class="sotto piccolo">· ${P.passiDi(tg).length} passi</span>` : ''}${tg.suggerimento ? h` <span class="sotto" title="Ha dei suggerimenti">${icona('lightbulb')}</span>` : ''}${celerazioneTarget(p, att, tg)}<small>${P.STATI_TARGET[tg.stato] || tg.stato}${tg.fine ? ' il ' + formatoData(tg.fine) : ''}${ultimo(tg)}</small></span>
                    ${modifica || tg.setId ? h`<button class="ib" data-a="menu-target" data-id="${att.id}" data-t="${tg.id}" aria-label="Opzioni del target">${icona('ellipsis')}</button>` : ''}
                </li>`;
        return h`<div class="scheda" data-prog="${att.id}">
            <button class="att-testa" ${modifica ? grezzo(`data-a="mod-att" data-id="${esc(att.id)}"`) : ''}>
                <span class="corpo"><span class="nome">${att.nome}
                    ${(() => { const e = M.etichetta(att, dizionario()); return e && M.normalizza(e) !== M.normalizza(att.nome) ? h` <span class="pill grigia">${e}</span>` : ''; })()}
                    ${att.sessionType === 'timedelay' ? (() => {
                        const d = P.tdDi(att), u = (att.tdCambi || []).slice(-1)[0];
                        return h` <span class="pill" title="${u ? `Cambiato il ${formatoData(u.il)}${u.da != null ? ' da ' + sec(u.da) : ''} a ${sec(u.a)}` : 'Time delay'}">T/D${d != null ? ' ' + sec(d) : ''}</span>`;
                    })() : h` <span class="pill grigia">Indip.</span>`}
                    ${att.stato !== 'attivo' ? h` <span class="pill arancio">${ETICHETTE_STATO[att.stato] || att.stato}</span>` : ''}
                    ${att.suggerimenti ? h` <span class="pill grigia" title="${att.suggerimenti}">${icona('lightbulb')} suggerimenti</span>` : ''}</span>
                    <span class="target">Criterio ${att.criterio.soglia}% per ${att.criterio.sedute} giorni${att.prove ? ' · ' + att.prove + ' prove' : ''}${att.descrizione ? ' · ' + att.descrizione : ''}</span></span>
                ${modifica ? icona('pen') : ''}
            </button>
            <ul class="targets">
                ${chiusi.length ? h`<li><details class="chiusi" ${T.chiusiAperti[att.id] ? grezzo('open') : ''} data-chiusi="${att.id}"><summary class="sotto piccolo">${chiusi.length} ${chiusi.length === 1 ? 'target chiuso' : 'target chiusi'}</summary>
                    <ul class="targets" style="padding:0">${chiusi.map(riga)}</ul></details></li>` : ''}
                ${aperti.map(riga)}
                <li class="azioni-att">${modifica ? h`<button class="bt piccolo fantasma" data-a="nuovo-target" data-id="${att.id}">${icona('plus')} Target</button>` : ''}
                    ${P.sedute(p, att).length ? h`<button class="bt piccolo fantasma" data-a="scc-att" data-id="${att.id}">${icona('chart-line')} Andamento</button>` : ''}</li>
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
        const gruppi = perCategoria(attive);
        const senza = tutte.filter((a) => !a.modalita || !M.trovaModalita(a.modalita, dizionario()));
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Programma', sotto: { testo: p.name } })}
            <main class="tice-main">
                <p class="sotto">Le attività in corso compaiono nella presa dati con il loro target. Quando un target raggiunge il criterio l'app propone di passare al successivo.</p>
                <button class="bt largo fantasma" data-a="stampa-griglie" style="margin-bottom:8px">${icona('print')} Stampa le griglie per la presa dati su carta</button>
                ${modifica ? h`<button class="bt primario largo" data-a="nuova-att">${icona('plus')} Nuova attività</button>`
                    : h`<div class="banda">${icona('lock')}<div>Il programma lo modificano le professioniste: tu registri le sedute.</div></div>`}
                ${modifica && senza.length ? h`<div class="banda">${icona('layer-group')}<div>${senza.length} ${senza.length === 1 ? 'attività non ha' : 'attività non hanno'} ancora una modalità del centro.
                    <button class="bt piccolo" style="margin-top:6px" data-a="classifica">Riordina le modalità</button></div></div>` : ''}
                ${gruppi.map((g) => h`<h3>${g.area}</h3>${g.att.map((a) => schedaProgramma(p, a))}`)}
                ${!attive.length ? h`<div class="vuoto">Nessuna attività in corso.</div>` : ''}
                ${altre.length ? h`<details style="margin-top:18px"><summary>Sospese e terminate (${altre.length})</summary>${altre.map((a) => schedaProgramma(p, a))}</details>` : ''}
            </main>`;
    }

    // ---------- riordino delle modalità per le attività già nel programma ----------
    function vistaClassifica() {
        const p = paz(T.pid);
        if (!p || !T.classifica || T.classifica.pid !== p.id) { T.vista = 'programma'; return vistaProgramma(); }
        const tutte = P.programma(p).attivita.filter((a) => T.classifica.righe[a.id]);
        const vedere = tutte.filter((a) => !T.classifica.righe[a.id].iniziale), ok = tutte.filter((a) => T.classifica.righe[a.id].iniziale);
        return h`${barra({ indietro: 'vai-programma', titolo: 'Modalità', sotto: { testo: p.name } })}
            <main class="tice-main">
                <p class="sotto">Ogni attività va in una modalità del centro, dentro la sua categoria. Le sedute non cambiano: cambiano solo il nome della categoria e il raggruppamento. Le scelte valgono anche per i prossimi quaderni.</p>
                ${vedere.map((a) => rigaModalita('c', a.id, T.classifica.righe[a.id]))}
                ${ok.length ? h`<details data-chiusi="mod-c" ${T.chiusiAperti['mod-c'] ? grezzo('open') : ''}><summary class="sotto">${ok.length} riconosciute: ${ok.map((a) => a.nome + ' → ' + M.etichetta({ modalita: T.classifica.righe[a.id].modalita, variante: T.classifica.righe[a.id].variante }, dizionario())).join(' · ')}</summary>
                    ${ok.map((a) => rigaModalita('c', a.id, T.classifica.righe[a.id]))}</details>` : ''}
                <button class="bt primario largo" style="margin-top:14px" data-a="salva-classifica">${icona('check')} Salva</button>
            </main>`;
    }

    // ---------- import ----------
    const normNome = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    // Fusione con un programma già creato nell'app: per ogni attività del quaderno
    // quella del programma che le somiglia (proposta), o "nuova attività".
    function proponiUnione(it) {
        const p = it.pazienteId ? paz(it.pazienteId) : null;
        it.unisci = {}; it.proposte = {};
        if (!p || !(P.programma(p).attivita || []).length) return;
        const diz = dizionario();
        // i nomi ambigui (FD) non si abbinano per modalità: solo per nome
        const mod = (a) => { if (a.modalita) return a.modalita; const r = M.riconosci(a, diz); return r.ambiguo ? null : r.modalita; };
        const r = TiceImport.abbina(it.pk, p, { modalita: mod });
        Object.entries(r).forEach(([id, x]) => { if (x.id) { it.unisci[id] = x.id; it.proposte[id] = x.punteggio; } });
    }
    function sezioneUnione(it, i) {
        const p = it.pazienteId ? paz(it.pazienteId) : null;
        const esistenti = p ? (P.programma(p).attivita || []).filter((a) => a.origine !== 'numbers' || (a.unitoDa || []).length) : [];
        if (!p || !esistenti.length) return '';
        const giaImportate = new Set((P.programma(p).attivita || []).map((a) => a.id));
        const righe = it.pk.attivita.filter((a) => !giaImportate.has(a.id));
        if (!righe.length) return '';
        const diz = dizionario();
        const opz = (scelto) => perCategoria(esistenti).map((g) => h`<optgroup label="${g.area}">${g.att.map((x) => h`<option value="${x.id}" ${scelto === x.id ? grezzo('selected') : ''}>${x.nome}${x.stato !== 'attivo' ? ' (' + (ETICHETTE_STATO[x.stato] || x.stato) + ')' : ''}</option>`)}</optgroup>`);
        const n = righe.filter((a) => it.unisci[a.id]).length;
        return h`<h3 style="margin-left:0">Unisci con il programma di ${p.name}</h3>
            <p class="sotto piccolo">${p.name} ha già un programma nell'app. Ogni attività del quaderno si può unire a una già esistente (i target uguali si uniscono, gli altri entrano come storia chiusa, le sedute nello stesso grafico) o aggiungere come nuova. ${n ? `Proposte ${n} unioni per nome simile: controllale.` : ''}</p>
            ${(() => {
                const riga = (a) => h`<div class="riga-dato"><div><b>${(a.area || 'Terminati') + ' / ' + a.nome}</b>
                    ${it.proposte[a.id] && it.unisci[a.id] ? h` <span class="pill verde">proposta</span>` : ''}</div>
                <div class="riga-campi"><label class="campo"><span>Nel programma</span>
                    <select class="campo-in" data-cambio="imp-unisci" data-i="${i}" data-att="${a.id}">
                        <option value="" ${!it.unisci[a.id] ? grezzo('selected') : ''}>Aggiungi come nuova attività</option>${opz(it.unisci[a.id])}</select></label></div></div>`;
                const unite = righe.filter((a) => it.unisci[a.id] || it.proposte[a.id]), altre = righe.filter((a) => !unite.includes(a));
                return h`${unite.map(riga)}
                    ${altre.length ? h`<details data-chiusi="${'unisci-i' + i}" ${T.chiusiAperti['unisci-i' + i] ? grezzo('open') : ''}><summary class="sotto">${unite.length ? 'Le altre' : 'Tutte le'} ${altre.length} attività: aggiunte come nuove (si possono unire anche queste)</summary>${altre.map(riga)}</details>` : ''}`;
            })()}`;
    }
    // Come si raccoglieva il dato di ogni attività: strategia, tipo di dato, prove per seduta, criterio.
    // Precompilato da quello che si legge nel quaderno; prima le attività da controllare.
    function sezioneDato(it, i, terminata) {
        const pk = it.pk;
        const dubbi = {};
        pk.daConfermare.forEach((d) => { dubbi[d.attivitaId] = d; });
        const riga = (a) => {
            const st = it.impost[a.id], d = dubbi[a.id];
            const da = (campo) => grezzo(`data-cambio="imp-imp" data-i="${i}" data-att="${esc(a.id)}" data-campo="${campo}"`);
            const sel = (campo, opz) => h`<select class="campo-in" ${da(campo)}>${opz.map(([v, n]) => h`<option value="${v}" ${String(st[campo]) === v ? grezzo('selected') : ''}>${n}</option>`)}</select>`;
            return h`<div class="riga-dato">
                <div><b>${(a.area || 'Terminati') + ' / ' + a.nome}</b>
                    ${d && !d.certo ? h` <span class="pill arancio">da controllare</span>` : d ? h` <span class="pill verde">quasi certo</span>` : ''}</div>
                ${d ? h`<div class="sotto piccolo">${d.motivo}</div>` : ''}
                <div class="riga-campi">
                    <label class="campo"><span>Strategia</span>${sel('sessionType', [['independent', 'Indipendente'], ['timedelay', 'Time delay']])}</label>
                    ${st.sessionType === 'timedelay' ? h`<label class="campo stretto"><span>Secondi T/D</span><input class="campo-in" type="number" min="1" max="30" inputmode="numeric" value="${st.tdSeconds || ''}" placeholder="—" ${da('tdSeconds')}></label>` : ''}
                    <label class="campo"><span>Dato</span>${sel('scala', [['conteggio', 'LU contate'], ['percentuale', 'Percentuale']])}</label>
                    ${st.scala !== 'percentuale' ? h`<label class="campo stretto"><span>Prove per seduta</span><input class="campo-in" type="number" min="1" max="200" inputmode="numeric" value="${st.prove || ''}" ${da('prove')}></label>` : ''}
                    <label class="campo stretto"><span>Criterio %</span><input class="campo-in" type="number" min="10" max="100" inputmode="numeric" value="${st.soglia}" ${da('soglia')}></label>
                    <label class="campo stretto"><span>Giorni di fila</span><input class="campo-in" type="number" min="1" max="10" inputmode="numeric" value="${st.sedute}" ${da('sedute')}></label>
                </div></div>`;
        };
        const attive = pk.attivita.filter((a) => !terminata[a.id]), finite = pk.attivita.filter((a) => terminata[a.id]);
        const vedere = attive.filter((a) => dubbi[a.id] && !dubbi[a.id].certo), resto = attive.filter((a) => !vedere.includes(a));
        return h`<h3 style="margin-left:0">Come si raccoglie il dato</h3>
            <p class="sotto piccolo">Per ogni attività: la <b>strategia</b> (indipendente o time delay), il <b>dato</b> (LU contate, o percentuale come «dato in %»), le <b>prove per seduta</b> (quante LU si fanno in una seduta: dove il quaderno scrive solo le corrette, la differenza diventa errori) e il <b>criterio</b> per chiudere un target. Precompilato da quello che c'è nel quaderno: cambiando il tipo di dato i valori si convertono (7 su 10 → 70%).</p>
            ${vedere.map(riga)}
            ${resto.length ? h`<details data-chiusi="${'dato-i' + i}" ${T.chiusiAperti['dato-i' + i] ? grezzo('open') : ''}><summary class="sotto">${vedere.length ? 'Le altre' : 'Tutte le'} ${resto.length} attività in corso</summary>${resto.map(riga)}</details>` : ''}
            ${finite.length ? h`<details data-chiusi="${'dato-t' + i}" ${T.chiusiAperti['dato-t' + i] ? grezzo('open') : ''}><summary class="sotto">Attività terminate (${finite.length})</summary>${finite.map(riga)}</details>` : ''}`;
    }
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
            ${sezioneUnione(it, i)}
            ${sezioneDato(it, i, terminata)}
            ${(() => {
                const righe = pk.attivita.map((a) => [a, it.modalita[a.id]]);
                const vedere = righe.filter(([, st]) => !st.iniziale), ok = righe.filter(([, st]) => st.iniziale);
                return h`<h3 style="margin-left:0">Modalità</h3>
                    <p class="sotto piccolo">Ogni tabella del quaderno va in una modalità del centro, dentro la sua categoria: quaderni diversi e giochi dell'app finiscono insieme. Le scelte valgono anche per i prossimi quaderni.</p>
                    ${vedere.map(([a, st]) => rigaModalita('i' + i, a.id, st))}
                    ${ok.length ? h`<details data-chiusi="${'mod-i' + i}" ${T.chiusiAperti['mod-i' + i] ? grezzo('open') : ''}><summary class="sotto">${ok.length} riconosciute: ${ok.map(([a, st]) => a.nome + ' → ' + M.etichetta({ modalita: st.modalita, variante: st.variante }, dizionario())).join(' · ')}</summary>${ok.map(([a, st]) => rigaModalita('i' + i, a.id, st))}</details>` : ''}`;
            })()}
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
    const VISTE = { bambini: vistaBambini, seduta: vistaSeduta, programma: vistaProgramma, import: vistaImport, classifica: vistaClassifica };
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
        // "casa" sono i turni del giorno; l'elenco completo dei bambini resta a un tocco
        'vai-bambini': () => vai(VISTE.turni ? 'turni' : 'bambini'),
        'vai-elenco': () => vai('bambini'),
        'vai-turni': () => vai('turni'),
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
                <button class="opzione" data-foglio="stampa">${icona('print')}<span class="corpo">Stampa le griglie<small>Per prendere i dati su carta e ricopiarli dopo</small></span></button>
                <button class="opzione" data-foglio="data">${icona('calendar-day')}<span class="corpo">Cambia la data della seduta<small>Per ricopiare un foglio di un altro giorno</small></span></button>
                <button class="opzione" data-foglio="annulla">${icona('trash')}<span class="corpo">Annulla la seduta in corso</span></button>
                ${EST.opzioniBambino ? EST.opzioniBambino(p) : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaBambino) return EST.sceltaBambino(r.slice(4), p);
            if (r === 'programma') vai('programma');
            else if (r === 'cartella') apriCartella(p.id);
            else if (r === 'giochi') { if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id); chiudi(); }
            else if (r === 'data') azioni.data();
            else if (r === 'stampa') azioni['stampa-griglie']();
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
        'scc-att': async (b) => { const p = paz(T.pid); await graficoSCC(p, P.attivita(p, b.dataset.id), null); },
        'scc-target': async (b) => { const p = paz(T.pid); const att = P.attivita(p, b.dataset.id); await graficoSCC(p, att, att.target.find((x) => x.id === b.dataset.t)); },
        suggerimenti: (b) => {
            T.suggerimenti[b.dataset.id] = !T.suggerimenti[b.dataset.id];
            T.mantieniScroll = true;
            disegna();
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
            ultimeDi(bozza(p.id)).push(att.id);
            // task analysis: si segna il passo corrente e si passa al successivo
            const passi = passiVoce(att, v);
            if (passi.length) {
                const st = statoTA(v, passi);
                v.esiti = v.esiti || {};
                v.esiti[st.passo.id] = (v.esiti[st.passo.id] || '') + r;
                (v.ordine || (v.ordine = [])).push(st.passo.id);
                (v.giriPrima || (v.giriPrima = [])).push(st.giri);
                if (st.i + 1 >= passi.length) { v.passo = 0; v.giri = st.giri + 1; } else v.passo = st.i + 1;
            }
            // fluency: il cronometro parte da solo alla prima risposta
            if (att.cronometro && !v.tempo) v.tempo = { ms: 0, da: Date.now() };
            if (navigator.vibrate) navigator.vibrate(r === 'V' ? 8 : 18);
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        crono: (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            if (!att) return;
            const v = voce(p, att);
            const t = v.tempo || (v.tempo = { ms: 0, da: null });
            if (t.da) { t.ms += Date.now() - t.da; t.da = null; } else t.da = Date.now();
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
        annulla: (b) => annullaUltima(paz(T.pid), b.dataset.id),
        'annulla-ultima': () => {
            const p = paz(T.pid);
            const u = ultimeDi(bozza(p.id));
            // la più recente ancora annullabile (un'attività tolta non conta)
            while (u.length) {
                const id = u[u.length - 1], v = bozza(p.id).voci[id];
                if (v && v.sequenza) { annullaUltima(p, id); return; }
                u.pop();
            }
        },
        'salta-passo': (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att), passi = passiVoce(att, v);
            if (!passi.length) return;
            const st = statoTA(v, passi);
            if (st.i + 1 >= passi.length) { v.passo = 0; v.giri = st.giri + 1; } else v.passo = st.i + 1;
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        'vai-passo': (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att);
            v.passo = +b.dataset.k || 0;
            salvaBozza();
            aggiornaScheda(p, att.id);
        },
        'apri-ta': (b) => { T.ta = { pid: T.pid, attId: b.dataset.id, nascosta: false, anima: true }; aggiornaSovra(paz(T.pid)); },
        'chiudi-ta': () => { T.ta = null; aggiornaSovra(paz(T.pid)); },
        'nascondi-ta': () => { if (T.ta) T.ta.nascosta = true; aggiornaSovra(paz(T.pid)); },
        'mostra-ta': () => { if (T.ta) { T.ta.nascosta = false; T.ta.anima = true; } aggiornaSovra(paz(T.pid)); },
        'td-voce': async (b) => {
            const p = paz(T.pid);
            const att = attivitaDi(p, b.dataset.id);
            const v = voce(p, att);
            const t = v.targetId ? (att.target || []).find((x) => x.id === v.targetId) : null;
            const ora = tdOggi(att, v, t);
            const prog = att.temporanea ? null : P.tdDi(att);
            const aggiorna = !att.temporanea && puoProgrammi(p);
            const r = await foglio(h`<form><h2>Time delay · ${att.nome}</h2>
                <label class="campo"><span>Secondi di attesa prima dell'aiuto</span><input name="sec" type="number" min="0" max="60" inputmode="numeric" required value="${ora != null ? ora : ''}" autofocus></label>
                <div class="scelta-rapida">${[0, 1, 2, 3, 4, 5].map((n) => h`<button type="button" class="bt piccolo ${n === ora ? 'primario' : ''}" data-td-rapido="${n}">${sec(n)}</button>`)}</div>
                ${aggiorna ? h`<label class="spunta-riga"><input type="checkbox" name="programma" checked> <span><b>Da oggi in poi</b><br><span class="sotto piccolo">Aggiorna il programma${prog != null ? ` (ora ${sec(prog)})` : ''}: il cambio resta segnato con la data. Senza spunta vale solo per questa seduta.</span></span></label>`
                    : h`<p class="sotto piccolo">Vale per questa seduta: il programma lo aggiorna la referente.</p>`}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
                dopo: (el) => el.querySelectorAll('[data-td-rapido]').forEach((x) => x.addEventListener('click', () => {
                    el.querySelector('[name=sec]').value = x.dataset.tdRapido;
                    el.querySelectorAll('[data-td-rapido]').forEach((y) => y.classList.toggle('primario', y === x));
                }))
            });
            if (!r) return;
            const n = P.secondiTD(r.sec);
            if (n == null) return;
            v.tdSeconds = n;
            salvaBozza();
            if (r.programma && aggiorna && P.impostaTD(att, n, { chi: chiOpera(), il: bozza(p.id).data })) {
                att.modificato = new Date().toISOString();
                await salvaPaziente(p);
                avviso(`${att.nome}: time delay a ${sec(n)} da oggi`);
            }
            aggiornaScheda(p, att.id);
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
        classifica: () => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const righe = {};
            P.programma(p).attivita.filter((a) => !a.modalita || !M.trovaModalita(a.modalita, dizionario())).forEach((a) => { righe[a.id] = statoModalita(a); });
            T.classifica = { pid: p.id, righe };
            vai('classifica', p.id);
        },
        'salva-classifica': async () => {
            const p = paz(T.pid);
            if (!p || !T.classifica || !puoProgrammi(p)) return;
            const coppie = P.programma(p).attivita.filter((a) => T.classifica.righe[a.id]).map((a) => [a, T.classifica.righe[a.id]]);
            const aggiunte = applicaScelte(coppie);
            const ora = new Date().toISOString();
            coppie.forEach(([a]) => {
                a.modificato = ora;
                (p.history || []).forEach((x) => { if (x.attivitaId === a.id && a.setCat) x.setCat = a.setCat; });
                delete a.setCat;
            });
            await salvaPaziente(p);
            await condividiScelte(aggiunte);
            T.classifica = null;
            avviso('Modalità salvate');
            vai('programma', p.id);
        },
        'stampa-griglie': async () => {
            const p = paz(T.pid);
            if (!p) return;
            const elenco = TiceStampa.voci(p, { P, M, diz: dizionario() });
            if (!elenco.length) { avviso('Il programma non ha ancora attività da stampare.'); return; }
            const nTA = elenco.filter((v) => v.ta).length, nLU = elenco.length - nTA;
            const maxProve = Math.max(0, ...elenco.filter((v) => !v.ta).map((v) => +v.att.prove || 0));
            const r = await foglio(h`<form><h2>Griglie da stampare</h2>
                <p class="sotto">Fogli A4 per prendere i dati su carta quando serve, con le attività del programma, i target in corso e le prove già marcate. Si ricopiano poi nella presa dati.</p>
                <div class="campo scelte-stampa"><span>Attività</span>
                    ${elenco.map((v) => h`<div class="riga-stampa"><label class="spunta-riga"><input type="checkbox" name="att" value="${v.att.id}" ${v.attiva ? grezzo('checked') : ''}>
                        <span><b>${v.att.nome}</b> <span class="sotto piccolo">${v.categoria.nome}${v.ta ? ' · task analysis' : v.att.scala === 'percentuale' ? ' · dato in %' : v.att.prove ? ' · ' + v.att.prove + ' prove' : ''}${v.attiva ? '' : ' · sospesa'}</span></span></label>
                        ${v.ta ? '' : h`<input class="campo-in lu-per" type="number" name="${'lu_' + v.att.id}" min="1" max="200" inputmode="numeric" placeholder="auto" aria-label="${'LU da prevedere per ' + v.att.nome}" title="LU da prevedere sul foglio (vuoto: in automatico)">`}</div>`)}
                    ${nLU ? h`<span class="sotto piccolo">Il numero accanto all'attività: quante LU prevedere sul foglio. Vuoto: in automatico, secondo la scelta qui sotto.</span>` : ''}
                </div>
                ${nLU ? h`<label class="campo"><span>Spazio per ogni attività</span><select name="spazio" class="campo-in">
                    <option value="riempi" selected>Riempi il foglio (righe in più, soprattutto ai dati in %)</option>
                    <option value="piu1">Le prove previste e una riga in più</option>
                    <option value="piu2">Le prove previste e due righe in più</option>
                    <option value="previste">Solo le prove previste</option></select></label>` : ''}
                <div class="campo scelte-stampa"><span>Fogli</span>
                    ${nLU ? h`<label class="spunta-riga"><input type="checkbox" name="lu" checked> <span>Presa dati delle learn unit <span class="sotto piccolo">(${nLU} attività su un foglio)</span></span></label>` : ''}
                    ${nTA ? h`<label class="spunta-riga"><input type="checkbox" name="ta" checked> <span>Task analysis <span class="sotto piccolo">(${nTA}, due o tre per foglio)</span></span></label>` : ''}
                </div>
                <div class="riga-campi">
                    ${nLU ? h`<label class="campo"><span>Caselle per riga</span><select name="colonne" class="campo-in">${[10, 15].map((n) => h`<option value="${n}" ${n === (maxProve > 10 && maxProve % 15 === 0 ? 15 : 10) ? grezzo('selected') : ''}>${n}</option>`)}</select></label>` : ''}
                    ${nTA ? h`<label class="campo"><span>Colonne task analysis</span><select name="colonneTA" class="campo-in">${[10, 15, 20].map((n) => h`<option value="${n}" ${n === 15 ? grezzo('selected') : ''}>${n}</option>`)}</select></label>` : ''}
                    <label class="campo"><span>Data (facoltativa)</span><input type="date" name="data" class="campo-in"></label>
                </div>
                <div class="campo scelte-stampa"><span>Righe</span>
                <label class="spunta-riga"><input type="checkbox" name="prossimi" checked> <span>Scrivi il target successivo</span></label>
                <label class="spunta-riga"><input type="checkbox" name="mantenimento" checked> <span>Una riga per il mantenimento dell'ultimo target a criterio</span></label></div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${icona('print')} Stampa</button></div></form>`, {
                invia: (form) => {
                    const fd = new FormData(form);
                    const ids = fd.getAll('att');
                    if (!ids.length) { avviso('Scegli almeno un\'attività.'); return undefined; }
                    const d = fd.get('data');
                    const luPer = {};
                    ids.forEach((id) => { const n = parseInt(fd.get('lu_' + id), 10); if (n > 0) luPer[id] = Math.min(n, 200); });
                    return { ids, luPer, spazio: fd.get('spazio') || 'riempi', lu: fd.has('lu'), ta: fd.has('ta'), colonne: +fd.get('colonne') || 10, colonneTA: +fd.get('colonneTA') || 15,
                        prossimi: fd.has('prossimi'), mantenimento: fd.has('mantenimento'), data: d ? d.split('-').reverse().join('/') : '' };
                }
            });
            if (r) await stampa(TiceStampa.html(p, r, { P, M, diz: dizionario() }));
        },
        'nuova-att': async () => {
            const p = paz(T.pid);
            if (!puoProgrammi(p)) return;
            const r = await moduloAttivita(p, null);
            if (!r) return;
            const righe = String(r.target || '').split('\n').map((x) => x.trim()).filter(Boolean);
            const att = P.nuovaAttivita(p, Object.assign({}, r, { target: null }));
            modalitaDaModulo(att, r);
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
                att.nome = r.nome.trim() || att.nome;
                modalitaDaModulo(att, r);
                att.descrizione = r.descrizione.trim();
                att.suggerimenti = String(r.suggerimenti || '').trim();
                att.cronometro = !!r.cronometro;
                att.sessionType = r.sessionType;
                if (P.secondiTD(r.tdSeconds) != null) P.impostaTD(att, r.tdSeconds, { chi: chiOpera() });
                att.criterio = { soglia: +r.soglia || 90, sedute: +r.sedute || 2 };
                att.prove = +r.prove || null;
                rinominaSedute(p, att);   // nome e categoria delle sedute
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
                    ${n ? h`<button class="opzione" data-foglio="grafico">${icona('chart-line')}<span class="corpo">Grafico e celerazione<small>Standard Celeration Chart: andamento, fasi, previsione</small></span></button>` : ''}
                    ${!puoProgrammi(p) && t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>` : ''}
                    ${!puoProgrammi(p) ? '' : h`${t.stato !== 'attivo' ? h`<button class="opzione" data-foglio="corrente">${icona('play')}<span class="corpo">Lavora su questo target<small>Diventa quello della presa dati</small></span></button>` : ''}
                    ${t.stato === 'attivo' ? h`<button class="opzione" data-foglio="criterio">${icona('flag-checkered')}<span class="corpo">Chiudi a criterio<small>E passa al successivo</small></span></button>` : ''}
                    ${t.stato === 'attivo' || t.stato === 'pianificato' ? h`<button class="opzione" data-foglio="repertorio">${icona('star')}<span class="corpo">Già in repertorio</span></button>` : ''}
                    ${t.setId ? h`<button class="opzione" data-foglio="gioca">${icona('play')}<span class="corpo">Somministra con l'app<small>${etichettaModo(P.modoTarget(att, t))} · set ${t.testo}</small></span></button>`
                        : h`<button class="opzione" data-foglio="testo">${icona('pen')}<span class="corpo">Modifica il testo</span></button>`}
                    <button class="opzione" data-foglio="passi">${icona('list-ol')}<span class="corpo">${P.passiDi(t).length ? 'Passi della task analysis' : 'Trasforma in task analysis'}<small>${P.passiDi(t).length ? P.passiDi(t).length + ' passi: modifica, aggiungi, riordina' : 'Un passo alla volta in seduta'}</small></span></button>
                    <button class="opzione" data-foglio="suggerimento">${icona('lightbulb')}<span class="corpo">Suggerimenti per questo target<small>${t.suggerimento ? 'Modifica' : 'Note su come somministrarlo, visibili in seduta'}</small></span></button>
                    <button class="opzione" data-foglio="su">${icona('arrow-up')}<span class="corpo">Sposta prima</span></button>
                    <button class="opzione" data-foglio="giu">${icona('arrow-down')}<span class="corpo">Sposta dopo</span></button>
                    ${!n ? h`<button class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina</span></button>` : ''}`}
                </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (!r) return;
            if (r === 'gioca') { lancia(p, att, t); return; }
            if (r === 'grafico') { await graficoSCC(p, att, t); return; }
            if (!puoProgrammi(p)) return;
            if (r === 'corrente') P.rendiCorrente(att, t.id);
            else if (r === 'criterio') { await proponiProssimo(p, att, t, crit); T.mantieniScroll = true; disegna(); return; }
            else if (r === 'repertorio') P.chiudiTarget(att, t.id, 'repertorio');
            else if (r === 'su' || r === 'giu') P.spostaTarget(att, t.id, r === 'su' ? -1 : 1);
            else if (r === 'elimina') { att.target = att.target.filter((x) => x.id !== t.id); att.modificato = new Date().toISOString(); }
            else if (r === 'suggerimento') {
                const ns = await foglio(h`<form><h2>Suggerimenti · ${t.testo}</h2>
                    <label class="campo"><span>Come somministrare questo target</span><textarea name="s" maxlength="3000" rows="5" autofocus placeholder="es. Presentare la carta a sinistra; aiuto gestuale prima del verbale">${t.suggerimento || ''}</textarea></label>
                    <p class="sotto piccolo">In seduta si aprono dal tasto «Suggerimenti», insieme a quelli dell'attività.</p>
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                if (!ns) return;
                t.suggerimento = String(ns.s || '').trim();
                t.modificato = att.modificato = new Date().toISOString();
            }
            else if (r === 'passi') {
                const ora = P.passiDi(t);
                const np = await foglio(h`<form><h2>Passi · ${t.testo}</h2>
                    <label class="campo"><span>Uno per riga, nell'ordine in cui si fanno</span><textarea name="p" rows="9" autofocus placeholder="Apre il rubinetto&#10;Mette le mani sotto l'acqua">${ora.map((x) => x.testo).join('\n')}</textarea></label>
                    <p class="sotto piccolo">I passi con lo stesso testo tengono il loro storico. Svuota per tornare a un target normale.</p>
                    <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
                if (!np) return;
                const nuovi = P.nuoviPassi(String(np.p || '').split('\n'), ora);
                if (nuovi.length) t.passi = nuovi; else delete t.passi;
                t.modificato = att.modificato = new Date().toISOString();
            }
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
    const listeTA = () => ((typeof state !== 'undefined' && state.savedSets) || []).filter((s) => (s.modes || []).includes('quaderno_task'));
    function moduloTarget(att) {
        const sets = setArchivio();
        const liste = listeQuaderno();
        const ta = listeTA();
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
            <details class="ta-nuova" ${ta.length ? '' : grezzo('open')}><summary><b>${icona('list-ol')} Task analysis</b> <span class="sotto piccolo">un target fatto di passi, segnati uno alla volta</span></summary>
                <label class="campo"><span>Nome</span><input name="ta_nome" placeholder="es. Lavarsi le mani" autocomplete="off"></label>
                <label class="campo"><span>Passi, uno per riga, nell'ordine</span><textarea name="ta_passi" rows="5" placeholder="Apre il rubinetto&#10;Mette le mani sotto l'acqua&#10;Prende il sapone"></textarea></label>
                ${ta.length ? h`<label class="campo"><span>Oppure da una task analysis dell'archivio</span><select name="ta_lista"><option value="">—</option>
                    ${ta.map((x) => h`<option value="${x.id}">${x.name} (${(x.items || []).length} passi)</option>`)}</select></label>` : ''}
            </details>
            ${liste.length ? h`<label class="campo"><span>Da una lista del Quaderno</span><select name="lista"><option value="">—</option>
                ${liste.map((x) => h`<option value="${x.id}">${x.name} (${(x.items || []).length})</option>`)}</select></label>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Aggiungi</button></div></form>`,
        {
            invia: (f) => {
                const fd = new FormData(f);
                return { t: fd.get('t') || '', set: fd.getAll('s'), modo: fd.get('modo') || '', lista: fd.get('lista') || '',
                    taNome: fd.get('ta_nome') || '', taPassi: fd.get('ta_passi') || '', taLista: fd.get('ta_lista') || '' };
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
        const passiScritti = String(r.taPassi || '').split('\n').map((x) => x.trim()).filter(Boolean);
        if (passiScritti.length) P.aggiungiTarget(att, { testo: String(r.taNome || '').trim() || 'Task analysis', passi: passiScritti }, true);
        if (r.taLista) {
            const l = listeTA().find((y) => String(y.id) === String(r.taLista));
            const passi = ((l && l.items) || []).map((it) => String(it.name || it.label || '').trim()).filter(Boolean);
            if (passi.length) P.aggiungiTarget(att, { testo: (passiScritti.length ? '' : String(r.taNome || '').trim()) || l.name, passi }, true);
        }
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
            s.setCat = (M.categoriaDi(att, dizionario()) || {}).nome || att.area || s.setCat;
        });
    }

    // ---------- Standard Celeration Chart di un target o di un'attività ----------
    function celerazioneTarget(p, att, t) {
        if (!window.TiceSCCGrafico || !window.TiceSCCDati) return '';
        const sedute = P.sedute(p, att, t);
        if (sedute.length < TiceSCC.MIN_PUNTI) return '';
        const d = TiceSCCGrafico.distintivo(sedute, TiceSCCDati.fasiPer(p, { chiave: 't:' + t.id, att }), TiceSCCDati.nomiTarget(p));
        return d ? h` <button class="scc-distintivo ${d.verso}" data-a="scc-target" data-id="${att.id}" data-t="${t.id}" title="${d.titolo}">${d.testo}</button>` : '';
    }
    async function graficoSCC(p, att, t) {
        if (!window.TiceSCCGrafico) return;
        const chiave = t ? 't:' + t.id : 'a:' + att.id;
        const sedute = P.sedute(p, att, t || undefined);
        const g = { chiave, att, target: t };
        await foglio(h`<h2>${t ? t.testo : att.nome}</h2>
            <p class="sotto piccolo">${t ? att.nome + ' · ' : 'Tutta l\'attività · '}${sedute.length} ${sedute.length === 1 ? 'seduta' : 'sedute'}</p>
            <div class="scc" data-scc></div>
            <div class="bottoni" style="margin-top:12px"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`, {
            dopo: (f) => TiceSCCGrafico.pannello(f.querySelector('[data-scc]'), {
                titolo: t ? t.testo : att.nome, sedute, fasi: TiceSCCDati.fasiPer(p, g), nomi: TiceSCCDati.nomiTarget(p),
                obiettivo: TiceSCCDati.obiettivo(att, sedute), puoModificare: puoProgrammi(p),
                nomeFile: p.name + ' - ' + (t ? t.testo : att.nome),
                alAggiungiFase: (fs) => TiceSCCDati.aggiungiFase(p, chiave, fs), alTogliFase: (id) => TiceSCCDati.togliFase(p, id)
            })
        });
        T.mantieniScroll = true;
        disegna();
    }

    // Modalità scelta nel modulo, o riconosciuta dal nome quando è sicura
    function modalitaDaModulo(att, r) {
        if (r.modalita) { att.modalita = r.modalita; att.variante = String(r.variante || '').trim(); return; }
        const x = M.riconosci(att, dizionario());
        if (x.modalita && x.certo) { att.modalita = x.modalita; att.variante = String(r.variante || '').trim() || x.variante; }
        else { delete att.modalita; att.variante = String(r.variante || '').trim(); }
    }
    function moduloAttivita(p, att) {
        const a = att || { nome: '', area: '', descrizione: '', sessionType: 'independent', criterio: { soglia: 90, sedute: 2 }, prove: null };
        const tdA = att ? P.tdDi(att) : null;
        return foglio(h`<form><h2>${att ? 'Modifica attività' : 'Nuova attività'}</h2>
            <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${a.nome}" ${att ? '' : grezzo('autofocus')} placeholder="es. TACT, Imitazione motoria"></label>
            <div class="riga-campi">
                <label class="campo"><span>Modalità</span><select name="modalita" class="campo-in"><option value="">Dal nome, in automatico</option>${opzioniModalita(a.modalita)}</select></label>
                <label class="campo"><span>Variante</span><input name="variante" maxlength="80" value="${a.variante || ''}" placeholder="es. intensivo"></label>
            </div>
            <label class="campo"><span>Descrizione (facoltativa)</span><input name="descrizione" maxlength="300" value="${a.descrizione || ''}"></label>
            <label class="campo"><span>Suggerimenti per chi somministra (facoltativi)</span><textarea name="suggerimenti" maxlength="3000" rows="3" placeholder="Come presentare lo stimolo, che aiuto dare, quando rinforzare, errori da evitare…">${a.suggerimenti || ''}</textarea>
                <span class="sotto piccolo">In seduta compaiono sotto l'attività con il tasto «Suggerimenti». Per un solo target: dal target, «Suggerimenti per questo target».</span></label>
            <div class="campo"><span>Tipo di seduta</span><div class="scelta">
                <label><input type="radio" name="sessionType" value="independent" ${a.sessionType !== 'timedelay' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                <label><input type="radio" name="sessionType" value="timedelay" ${a.sessionType === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label></div></div>
            <label class="spunta-riga"><input type="checkbox" name="cronometro" ${a.cronometro ? grezzo('checked') : ''}> <span><b>Cronometra (fluency)</b><br><span class="sotto piccolo">In seduta compare un cronometro che parte alla prima risposta: il grafico SCC mostra le risposte al minuto.</span></span></label>
            <div class="riga-campi">
                <label class="campo"><span>Criterio %</span><input name="soglia" type="number" min="10" max="100" inputmode="numeric" value="${a.criterio.soglia}"></label>
                <label class="campo"><span>Giorni di fila</span><input name="sedute" type="number" min="1" max="10" inputmode="numeric" value="${a.criterio.sedute}"></label>
                <label class="campo"><span>Prove</span><input name="prove" type="number" min="1" max="200" inputmode="numeric" value="${a.prove || ''}" placeholder="—"></label>
            </div>
            <label class="campo"><span>Secondi di time delay (solo per il time delay)</span><input name="tdSeconds" type="number" min="0" max="60" inputmode="numeric" value="${tdA != null ? tdA : ''}" placeholder="es. 0, 1, 2…">
                <span class="sotto piccolo">Si vede in seduta e finisce nei dati di ogni seduta. Se lo cambi, il cambio resta segnato con la data${(a.tdCambi || []).length ? h` (finora: ${a.tdCambi.map((c) => `${formatoData(c.il)} ${c.da != null ? sec(c.da) + '→' : ''}${sec(c.a)}`).join(', ')})` : ''}.</span></label>
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

    // Stampa: il foglio va in un contenitore che in stampa è l'unica cosa visibile
    async function stampa(contenuto) {
        if (!contenuto) { avviso('Niente da stampare con queste scelte.'); return; }
        let box = document.getElementById('tice-stampa');
        if (!box) { box = document.createElement('div'); box.id = 'tice-stampa'; document.body.appendChild(box); }
        box.innerHTML = contenuto;
        document.documentElement.classList.add('tice-stampa-in-corso');
        const fine = () => { document.documentElement.classList.remove('tice-stampa-in-corso'); box.innerHTML = ''; window.removeEventListener('afterprint', fine); };
        window.addEventListener('afterprint', fine);
        try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* si stampa lo stesso */ }
        await Promise.all([...box.querySelectorAll('img')].map((i) => i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; })));
        if (typeof window.print !== 'function') { fine(); avviso('Su questo dispositivo la stampa non è disponibile: apri l\'app dal browser.', 'errore'); return; }
        window.print();
    }

    const chiOpera = () => { try { return localStorage.getItem('tice_operatore') || ''; } catch (e) { return ''; } };
    const sec = (n) => n + '″';
    // Il time delay di oggi: quello cambiato in seduta, altrimenti quello del programma
    const tdOggi = (att, v, t) => {
        const d = v ? P.secondiTD(v.tdSeconds) : null;
        return d != null ? d : P.tdDi(att, t === undefined ? undefined : (t || null));
    };

    // Se i secondi sono diversi dall'ultima seduta in time delay dell'attività,
    // il cambio si legge nella seduta (nota e campo tdCambio) e quindi nei grafici
    function annotaTD(p, att, s) {
        if (s.sessionType !== 'timedelay' || s.timeDelaySeconds == null) return;
        const prima = P.sedute(p, att).filter((x) => x.sessionType === 'timedelay' && x.timeDelaySeconds != null);
        if (!prima.length) return;
        const da = prima[prima.length - 1].timeDelaySeconds;
        if (da === s.timeDelaySeconds) return;
        s.tdCambio = { da, a: s.timeDelaySeconds };
        const testo = `Time delay da ${sec(da)} a ${sec(s.timeDelaySeconds)}`;
        s.note = s.note ? testo + ' — ' + s.note : testo;
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
            // il time delay di oggi resta scritto nella seduta, anche se poi il programma cambia
            if (!att.temporanea && (v.sessionType || att.sessionType) === 'timedelay' && P.secondiTD(v.tdSeconds) == null) {
                const tt = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
                const d = P.tdDi(att, tt);
                if (d != null) voceS.tdSeconds = d;
            }
            let s;
            if (att.temporanea) {
                s = P.seduta({ id: null, nome: att.nome, area: '', sessionType: att.sessionType }, null, voceS, quando);
                s.attivitaId = null;
                s.setId = 'quaderno_' + att.nome.replace(/\s+/g, '_').toLowerCase();
            } else {
                const t = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
                const prima = t ? P.criterioRaggiunto(P.sedute(p, att, t), att.criterio) : null;
                s = P.seduta(att, t, voceS, quando);
                annotaTD(p, att, s);
                if (t && !t.inizio) t.inizio = b.data;
                if (t && t.stato === 'attivo' && !prima) controlla.push({ att, t });
            }
            nuove.push(s);
        });
        if (!p.history) p.history = [];
        p.history.push(...nuove);
        // "Passa a 2" T/D" nella decisione: dalla prossima seduta il programma usa i nuovi secondi
        const passati = [];
        if (puoProgrammi(p)) Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k], att = attivitaDi(p, k);
            if (!att || att.temporanea || !haDati(v)) return;
            const n = P.tdDaDecisione(v.decisione);
            if (n != null && P.impostaTD(att, n, { chi: operatore || chiOpera(), il: b.data })) {
                att.sessionType = 'timedelay';
                att.modificato = new Date().toISOString();
                passati.push(`${att.nome} → ${sec(n)}`);
            }
        });
        const nota = String(dati.nota || '').trim();
        if (nota) {
            p.dailyNotes = p.dailyNotes || {};
            p.dailyNotes[b.data] = p.dailyNotes[b.data] ? p.dailyNotes[b.data] + '\n\n' + nota : nota;
        }
        await salvaPaziente(p);
        eliminaBozza(p.id);
        T.aperte = {};
        avviso(`Seduta salvata: ${nuove.length} attività${passati.length ? ' · time delay: ' + passati.join(', ') : ''}`);
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
            const aggiunte = applicaScelte(it.pk.attivita.map((a) => [a, it.modalita[a.id]]));
            const r = TiceImport.applica(p, it.pk, it.conferme, { sogliaPredefinita: soglia, unisci: it.unisci || {} });
            new Set(Object.values(it.unisci || {})).forEach((id) => { const a = P.attivita(p, id); if (a) rinominaSedute(p, a); });
            await salvaPaziente(p);
            await condividiScelte(aggiunte);
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
                const modalita = {}, impost = {};
                pk.attivita.forEach((a) => {
                    modalita[a.id] = statoModalita(a);
                    const td = a.tdSeconds || ((a.target || []).find((t) => t.tdSeconds) || {}).tdSeconds || null;
                    impost[a.id] = { sessionType: a.sessionType || 'independent', tdSeconds: td, scala: a.scala === 'percentuale' ? 'percentuale' : 'conteggio',
                        prove: conferme[a.id] != null ? conferme[a.id] : a.prove, soglia: (a.criterio || {}).soglia || 90, sedute: (a.criterio || {}).sedute || 2 };
                });
                const nuovo = { file: f.name, pk, nome: pk.nome, pazienteId: esistente ? esistente.id : '', conferme, modalita, impost, unisci: {}, proposte: {} };
                proponiUnione(nuovo);
                T.importazioni.push(nuovo);
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
            const secCtrl = document.getElementById('td-seconds-ctrl');
            const td = tdOggi(att, v, t);
            if (secCtrl && td != null) secCtrl.value = td;
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
        // i suggerimenti dell'attività in gioco, senza uscire dal gioco
        let lb = document.getElementById('tice-hint-gioco');
        const pL = L && paz(L.pid), aL = pL && P.attivita(pL, L.attId), tL = aL && (aL.target || []).find((x) => x.id === L.targetId);
        const testi = aL ? suggerimentiDi(aL, tL) : [];
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'tice-hint-gioco';
            lb.className = 'tice-hint-gioco';
            lb.innerHTML = '<button type="button" class="tasto-hint" aria-expanded="false" title="Suggerimenti per chi somministra"></button><div class="fumetto" hidden></div>';
            lb.firstChild.addEventListener('click', () => {
                const f = lb.querySelector('.fumetto');
                f.hidden = !f.hidden;
                lb.firstChild.setAttribute('aria-expanded', String(!f.hidden));
            });
            document.body.appendChild(lb);
        }
        lb.firstChild.innerHTML = String(icona('lightbulb'));
        lb.querySelector('.fumetto').innerHTML = String(h`<b>${L ? L.nome : ''}</b>${testi.map((x) => h`<p>${x}</p>`)}`);
        lb.hidden = !testi.length || !radice().hidden;
        if (lb.hidden) lb.querySelector('.fumetto').hidden = true;
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
        } else if (c === 'imp-unisci' && e.type === 'change') {
            const it = T.importazioni[+el.dataset.i];
            if (el.value) it.unisci[el.dataset.att] = el.value; else delete it.unisci[el.dataset.att];
            T.mantieniScroll = true; disegna();
        } else if (c === 'imp-paziente' && e.type === 'change') {
            T.importazioni[+el.dataset.i].pazienteId = el.value;
            proponiUnione(T.importazioni[+el.dataset.i]);
            T.mantieniScroll = true; disegna();
        } else if (c === 'imp-nome') {
            T.importazioni[+el.dataset.i].nome = el.value;
        } else if (c.indexOf('mod-') === 0) {
            const righe = sceltaModalita(el.dataset.k);
            const st = righe && righe[el.dataset.att];
            if (!st) return;
            if (c === 'mod-scelta' && e.type === 'change') {
                if (el.value === '+') { st.modalita = null; st.nuova = st.nuova || { id: M.nuovoId(st.nome), nome: st.nome, categoria: st.categoria || 'altro' }; }
                else { st.modalita = el.value; st.categoria = (M.trovaModalita(el.value, dizionario()) || {}).categoria; }
                st.certo = true; st.ambiguo = false;
                T.mantieniScroll = true; disegna();
            } else if (c === 'mod-variante') st.variante = el.value;
            else if (c === 'mod-nuova-nome') st.nuova.nome = el.value;
            else if (c === 'mod-nuova-cat') st.nuova.categoria = el.value;
        } else if (c === 'imp-imp' && e.type === 'change') {
            const it = T.importazioni[+el.dataset.i];
            const st = it && it.impost[el.dataset.att];
            if (!st) return;
            const campo = el.dataset.campo;
            st[campo] = ['prove', 'tdSeconds', 'soglia', 'sedute'].includes(campo) ? (parseInt(el.value, 10) || null) : el.value;
            TiceImport.imposta(it.pk, el.dataset.att, st);
            if (st.prove) it.conferme[el.dataset.att] = st.prove; else delete it.conferme[el.dataset.att];
            T.mantieniScroll = true; disegna();
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
        strumenti: { h, grezzo, icona, foglio, conferma, avviso, barra, vai: (v, pid) => vai(v, pid), paz, pazienti, salvaPaziente, formatoData, T, stampa, limitato: () => limitato(), banner: () => (EST.banner ? EST.banner() : '') }
    };
    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})();
