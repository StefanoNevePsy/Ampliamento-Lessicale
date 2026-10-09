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
    // Aspetto: «quaderno» (righe a matita, testate, annotazioni a mano) o «classico»,
    // com'era prima: si sceglie dal menu e resta su questo dispositivo
    const stile = () => { try { return localStorage.getItem('tice_stile') === 'classico' ? 'classico' : 'quaderno'; } catch (e) { return 'quaderno'; } };
    const applicaStile = () => { document.documentElement.dataset.ticeStile = stile(); };
    applicaStile();
    // La testata della pagina: un'etichetta spaziata e il titolo grande, come le pagine di PsyDiary
    const testata = (eti, titolo, o = {}) => h`<div class="tq-testata">
        ${o.azione ? h`<button type="button" class="eti tq-eti tocca-eti" data-a="${o.azione}">${eti} ${icona('chevron-down')}</button>` : h`<span class="eti tq-eti">${eti}</span>`}
        <h1 class="tq-titolo">${titolo}${o.mano ? h` <span class="mano">${o.mano}</span>` : ''}</h1></div>`;
    // il timbro sulla pagina quando una seduta è salvata
    function timbro(testo) {
        document.querySelectorAll('.tq-timbro').forEach((x) => x.remove());
        const d = document.createElement('div');
        d.className = 'tq-timbro'; d.setAttribute('aria-hidden', 'true');
        d.innerHTML = `<span>${String(testo).replace(/[<>&]/g, '')}</span>`;
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 2200);
    }

    // ---------- stato ----------
    const T = { vista: 'turni', pid: null, aperte: {}, chiusiAperti: {}, suggerimenti: {}, cerca: '', importazioni: [] };
    // Suggerimenti per chi somministra: dell'attività e del target in corso
    const suggerimentiDi = (att, t) => [att && att.suggerimenti, t && t.suggerimento].concat(((att && !att.temporanea && att.misure) || []).map((m) => m.suggerimenti))
        .map((x) => String(x || '').trim()).filter(Boolean);
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
        // una bozza ancora vuota di un altro giorno (app rimasta aperta) diventa di oggi
        const b = T.bozza;
        if (b.data !== oggi() && !Object.values(b.voci).some(haDati) && !b.extra.length && !b.temp.length) { b.data = oggi(); b.inizio = new Date().toISOString(); }
        return T.bozza;
    }
    function salvaBozza() {
        if (!T.bozza) return;
        const b = T.bozza;
        const vuota = !Object.values(b.voci).some(haDati) && !b.extra.length && !b.temp.length;
        try {
            if (vuota) localStorage.removeItem(chiaveBozza(b.pid));
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
    // Più prese dati nella stessa attività: la voce della seduta è "idAttività~idPresa"
    const baseId = (k) => String(k).split('~')[0];
    const msDi = (k) => String(k).split('~')[1] || null;
    const misure = (att) => (att && !att.temporanea && att.misure) || [];
    // Il tipo di una sottoattività: il suo, se indicato, altrimenti quello dell'attività
    function tipoMisura(att, m) {
        if (!m || !m.tipo) return { sessionType: att.sessionType || 'independent', eco: att.risposte === 'ecoico' };
        return { sessionType: m.tipo === 'timedelay' ? 'timedelay' : 'independent', eco: m.tipo === 'ecoico' };
    }
    // L'attività "vista" da una voce: per una sottoattività con il proprio tipo, i suoi tasti
    function attPerVoce(att, k) {
        const m = misure(att).find((x) => x.id === msDi(k));
        if (!m || (!m.tipo && !(+m.prove > 0))) return att;
        const a = Object.assign({}, att);
        // le prove per LU della sottoattività, se indicate, valgono più di quelle dell'attività
        if (+m.prove > 0) a.prove = +m.prove;
        if (m.tipo) {
            const tm = tipoMisura(att, m);
            a.sessionType = tm.sessionType;
            if (tm.eco) { a.risposte = 'ecoico'; a.nomeP = 'Ecoica'; } else { delete a.risposte; if (a.nomeP === 'Ecoica') delete a.nomeP; }
        }
        return a;
    }
    function attivitaDi(p, id) {
        id = baseId(id);
        const a = P.attivita(p, id);
        if (a) return a;
        const t = bozza(p.id).temp.find((x) => x.id === id);
        return t ? Object.assign({ temporanea: true, target: [], criterio: { soglia: 90, sedute: 2 } }, t) : null;
    }
    function voce(p, att, k) {
        const b = bozza(p.id);
        k = k || att.id;
        if (!b.voci[k]) {
            const c = att.temporanea ? null : P.targetCorrente(att);
            // una presa dati segue il target scelto per le altre della stessa attività
            const gia = Object.keys(b.voci).filter((x) => baseId(x) === att.id).map((x) => b.voci[x])[0];
            const m = misure(att).find((x) => x.id === msDi(k));
            b.voci[k] = { v: 0, p: 0, x: 0, sequenza: '', nota: '', decisione: '', targetId: gia ? gia.targetId : (c ? c.target.id : null),
                mantenimento: gia ? gia.mantenimento : !!(c && c.mantenimento), sessionType: tipoMisura(att, m).sessionType };
        }
        return b.voci[k];
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
            const m = misure(att).find((x) => x.id === msDi(u[k]));
            return { att, r, testo: att.nome + (m ? ' · ' + m.nome : '') + (ps ? ' · ' + ps.testo : '') };
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
                ${tasti(att, tipo)}
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
            // Toccare fuori o Esc con un modulo modificato: prima si chiede (un tocco
            // distratto non deve buttare via un'attività scritta a metà)
            let iniziale = null, chiedendo = false;
            const statoForm = () => { const fm = f.querySelector('form'); return fm ? JSON.stringify([...new FormData(fm)]) + '|' + fm.querySelectorAll('input, textarea, select').length : ''; };
            const lascia = async () => {
                if (chiedendo || sfondo.querySelector('.tice-foglio-sfondo')) return;
                if (iniziale != null && statoForm() !== iniziale) {
                    chiedendo = true;
                    const ok = await conferma('Scartare le modifiche?', 'Quello che hai scritto in questo foglio non è ancora salvato.', { ok: 'Scarta', pericolo: true });
                    chiedendo = false;
                    if (!ok) return;
                }
                chiudi(null);
            };
            const tasto = (e) => { if (e.key === 'Escape' && document.querySelectorAll('.tice-foglio-sfondo').length && document.querySelectorAll('.tice-foglio-sfondo')[document.querySelectorAll('.tice-foglio-sfondo').length - 1] === sfondo) lascia(); };
            document.addEventListener('keydown', tasto);
            sfondo.addEventListener('click', (e) => {
                if (e.target === sfondo) return lascia();
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
            iniziale = statoForm();
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
        d.setAttribute('role', tipo === 'errore' ? 'alert' : 'status');
        d.setAttribute('aria-live', tipo === 'errore' ? 'assertive' : 'polite');
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
            <div class="titolo"><span class="titolo-testo">${titolo}</span>${sotto ? (sotto.azione ? h`<button type="button" class="sotto-titolo tocca" data-a="${sotto.azione}"><span class="tocca-testo">${sotto.testo}</span>${icona('chevron-down')}</button>` : h`<span class="sotto-titolo">${sotto.testo}</span>`) : ''}</div>
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
    // età dalla data di nascita: "4 anni e 3 mesi" (sotto i 2 anni, in mesi)
    function eta(p) {
        if (!p.nascita) return '';
        const n = new Date(p.nascita + 'T12:00:00'), o = new Date();
        const mesi = (o.getFullYear() - n.getFullYear()) * 12 + o.getMonth() - n.getMonth() - (o.getDate() < n.getDate() ? 1 : 0);
        if (mesi < 0) return '';
        if (mesi < 24) return mesi + (mesi === 1 ? ' mese' : ' mesi');
        const a = Math.floor(mesi / 12), m = mesi % 12;
        return a + ' anni' + (m ? ' e ' + m + (m === 1 ? ' mese' : ' mesi') : '');
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
                <span class="avatar ${eGruppo(p) ? 'gruppo' : ''}">${eGruppo(p) ? icona('users') : p.photo ? h`<img src="${p.photo}" alt="">` : iniziali(p.name)}</span>
                <span class="corpo"><span class="t1">${p.name}</span>
                    <span class="t2">${EST.pillola ? EST.pillola(p) : ''}${b && risposte ? h`<span class="pill arancio">seduta in corso · ${risposte} risposte</span> ` : ''}${attive ? `${attive} attività in corso` : 'nessun programma'}${u ? ' · ultima ' + formatoData(P.giorno(u)) : ''}${eGruppo(p) ? ' · gruppo di ' + membriDi(p).length : ''}${p.category ? ' · ' + p.category : ''}${eta(p) ? ' · ' + eta(p) : ''}</span></span>
                ${icona('chevron-right')}
            </button>`;
        });
        return h`${barra({ indietro: VISTE.turni ? 'vai-bambini' : null, titolo: 'Tutti i bambini', destra: h`
                <button class="ib" data-a="vai-turni" aria-label="Turni" title="Turni della settimana">${icona('calendar-week')}</button>
                <button class="ib" data-a="giochi" aria-label="Giochi e attività dell'app" title="Giochi e attività">${icona('gamepad')}</button>
                <button class="ib" data-a="menu" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${testata('Centro TICE · ' + pazienti().length + (pazienti().length === 1 ? ' bambino' : ' bambini'), 'Tutti i bambini')}
                ${EST.banner ? EST.banner() : ''}
                ${pazienti().length > 6 ? h`<input class="cerca" type="search" placeholder="Cerca un bambino" value="${T.cerca}" data-cambio="cerca" aria-label="Cerca">` : ''}
                ${righe.length ? h`<div class="scheda">${righe}</div>`
                    : h`<div class="vuoto">${q ? 'Nessun bambino con questo nome.' : 'Ancora nessun bambino.'}</div>`}
                ${limitato() ? '' : h`<div class="bottoni" style="margin-top:14px">
                    <button class="bt" data-a="nuovo-bambino">${icona('user-plus')} Nuovo bambino</button>
                    <button class="bt" data-a="nuovo-gruppo">${icona('users')} Nuovo gruppo</button>
                    <button class="bt" data-a="vai-import">${icona('file-import')} Importa quaderni</button>
                </div>`}
            </main>`;
    }

    // ---------- gruppi ----------
    // Un gruppo è una cartella a sé (nome, membri, programma, storico) che si
    // sincronizza come un bambino. Ogni sua attività ha una riga per bambino:
    // sono le sue "sottoattività" (id = id del bambino), tenute allineate ai membri.
    const eGruppo = (p) => !!(p && p.gruppo);
    const membriDi = (g) => (g.membri || []).map((id) => paz(id)).filter(Boolean);
    function allineaMembri(g) {
        const membri = membriDi(g);
        P.programma(g).attivita.forEach((a) => {
            const prima = a.misure || [];
            a.misure = membri.map((b) => Object.assign({}, prima.find((m) => m.id === b.id) || {}, { id: b.id, nome: b.name, bambino: true }));
        });
    }
    // Presenti di oggi: tutti i membri, tranne quelli segnati assenti nella bozza
    const presente = (b, pid) => !(b.assenti || []).includes(pid);
    async function moduloGruppo(g) {
        const tutti = pazienti().filter((x) => !eGruppo(x)).sort((u, v) => String(u.name).localeCompare(String(v.name), 'it'));
        const gia = (g && g.membri) || [];
        return foglio(h`<form><h2>${g ? 'Modifica il gruppo' : 'Nuovo gruppo'}</h2>
            <label class="campo"><span>Nome del gruppo</span><input name="nome" required maxlength="80" value="${(g && g.name) || ''}" placeholder="es. Abilità sociali martedì" autocomplete="off" ${g ? '' : grezzo('autofocus')}></label>
            <div class="campo"><span>Bambini del gruppo</span>
                <div class="opzioni" style="max-height:40vh;overflow-y:auto">${tutti.map((x) => h`<label class="opzione"><input type="checkbox" name="m" value="${x.id}" ${gia.includes(x.id) ? grezzo('checked') : ''}><span class="corpo">${x.name}</span></label>`)}</div>
                <span class="sotto piccolo">In seduta, per ogni attività, una riga per bambino. I dati restano nella cartella del gruppo, separati per bambino.</span></div>
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">${g ? 'Salva' : 'Crea'}</button></div></form>`,
        { invia: (form) => { const fd = new FormData(form); return { nome: String(fd.get('nome') || '').trim(), membri: fd.getAll('m') }; } });
    }

    // ---------- presa dati ----------
    // Learn unit contate: quante prove aspettano e cosa entra nei dati salvando ora
    function statoLU(att, v, t, ms) {
        if (!P.conAttesa(att, t)) return null;
        const n = +att.prove, prec = P.inAttesaDi(att, t, ms);
        const seq = v ? ((v.sequenza || '').length === v.v + v.p + v.x ? v.sequenza : 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x)) : '';
        const d = P.dividiLU(prec && prec.seq, seq, n);
        return { n, prec, oggi: seq.length, blocchi: d.blocchi, resto: d.resto.length };
    }
    function previsione(p, att, v) {
        if (att.temporanea || att.mantenimento || !v || !haDati(v)) return null;
        const senza = !(att.target || []).length;
        const t = v.targetId ? att.target.find((x) => x.id === v.targetId) : null;
        if (!t && !senza) return null;
        const b = bozza(p.id);
        const serie = senza ? P.sedute(p, att) : P.sedute(p, att, t);
        if (P.criterioRaggiunto(serie, att.criterio)) return null;
        const lu = statoLU(att, v, t);
        const oggiS = lu ? lu.blocchi.map((bl) => ({ date: b.data + 'T12:00:00', percentage: Math.round(100 * P.contaRisposte(bl).v / bl.length) }))
            : [{ date: b.data + 'T12:00:00', percentage: Math.round(100 * v.v / (v.v + v.p + v.x)) }];
        return oggiS.length && P.criterioRaggiunto(serie.concat(oggiS), att.criterio) === b.data ? 'Con questi dati oggi raggiunge il criterio.' : null;
    }
    // In time delay la risposta non corretta è quella promptata, in indipendente è l'errore:
    // si punteggia solo corretta / promptata oppure corretta / errata
    const nonCorretta = (tipo) => (tipo === 'timedelay' ? 'P' : 'X');
    // Echo to tact: si segna se lo dice da solo (✓), se lo ripete in ecoico (e+) o se no (✗)
    const ecoico = (att) => att && att.risposte === 'ecoico';
    function tasti(att, tipo, k) {
        k = k || att.id;
        if (ecoico(att)) return h`<div class="tasti">
            <button class="tasto v" data-a="segna" data-id="${k}" data-r="V">✓<small>Autonoma</small></button>
            <button class="tasto p" data-a="segna" data-id="${k}" data-r="P">e+<small>Ecoica</small></button>
            <button class="tasto x" data-a="segna" data-id="${k}" data-r="X">✗<small>Errata</small></button>
        </div>`;
        return h`<div class="tasti due">
            <button class="tasto v" data-a="segna" data-id="${k}" data-r="V">✓<small>Corretta</small></button>
            ${nonCorretta(tipo) === 'P'
                ? h`<button class="tasto p" data-a="segna" data-id="${k}" data-r="P">P<small>${att.nomeP || 'Promptata'}</small></button>`
                : h`<button class="tasto x" data-a="segna" data-id="${k}" data-r="X">✗<small>Errata</small></button>`}
        </div>`;
    }
    // Cambiando strategia le risposte non corrette passano dall'una all'altra colonna
    function convertiVoce(v, tipo, att) {
        if (ecoico(att)) return;
        const da = nonCorretta(tipo) === 'P' ? 'X' : 'P', a = nonCorretta(tipo);
        const k = da.toLowerCase(), j = a.toLowerCase();
        if (!v[k]) return;
        v[j] += v[k]; v[k] = 0;
        v.sequenza = (v.sequenza || '').split(da).join(a);
        if (v.esiti) Object.keys(v.esiti).forEach((id) => { v.esiti[id] = v.esiti[id].split(da).join(a); });
    }

    function schedaAttivita(p, att) {
        const b = bozza(p.id);
        const ms = misure(att).filter((m) => !eGruppo(p) || presente(b, m.id));
        const vm = ms.map((m) => b.voci[att.id + '~' + m.id] || null);
        // con più prese dati, il target e le opzioni comuni si leggono dalla prima voce aperta
        const v = b.voci[att.id] || vm.find(Boolean);
        const c = att.temporanea ? null : P.targetCorrente(att);
        const t = v && v.targetId ? att.target.find((x) => x.id === v.targetId) : (c && c.target);
        const mant = att.mantenimento || (v ? v.mantenimento : (c && c.mantenimento));
        const aperta = T.aperte[att.id];
        const tot = !ms.length && v ? v.v + v.p + v.x : 0;
        const pct = tot ? Math.round(100 * v.v / tot) : null;
        const soglia = (att.criterio && att.criterio.soglia) || 90;
        const tipo = (v && v.sessionType) || att.sessionType;
        const senzaTarget = !att.temporanea && !(att.target || []).length;
        const valuta = !att.temporanea && !att.mantenimento && (senzaTarget || (t && t.stato === 'attivo'));
        const aCriterio = valuta && P.criterioDi(p, att, senzaTarget ? null : t);
        // ogni presa dati arriva a criterio per conto suo; l'attività quando ci arrivano tutte
        const critM = ms.map((m) => (valuta && !m.mantenimento ? P.criterioRaggiunto(P.sedute(p, att, senzaTarget ? undefined : t, m.id), att.criterio) : null));
        const nCrit = critM.filter(Boolean).length, nAcq = ms.filter((m) => !m.mantenimento).length;
        const giocabile = t && t.setId && setArchivio().some((x) => x.id === t.setId);
        const giaOggi = !att.temporanea && t ? P.sedute(p, att, t).filter((x) => P.giorno(x.date) === b.data) : [];
        const oggiV = giaOggi.reduce((n, x) => n + (x.correct || 0), 0), oggiT = giaOggi.reduce((n, x) => n + (x.total || 0), 0);
        const prev = ms.length ? null : previsione(p, att, v);
        const hint = suggerimentiDi(att, t).length;
        const passi = P.passiDi(t);
        const st = passi.length ? statoTA(v, passi) : null;
        const tdS = tipo === 'timedelay' ? tdOggi(att, v, t || null) : null;
        const lu = ms.length ? null : statoLU(att, v, t || null);
        return h`<div class="att ${haDati(v) || vm.some(haDati) ? 'con-dati' : ''} ${hint ? 'con-hint' : ''}" data-att="${att.id}" style="--col:${P.coloreDi(p, att)}">
            ${hint ? h`<button class="ib hint-tasto ${T.suggerimenti[att.id] ? 'on' : ''}" data-a="suggerimenti" data-id="${att.id}" aria-expanded="${T.suggerimenti[att.id] ? 'true' : 'false'}" aria-label="Suggerimenti" title="Suggerimenti per chi somministra">${icona('lightbulb')}</button>` : ''}
            <button class="att-testa" data-a="apri-att" data-id="${att.id}" aria-expanded="${aperta ? 'true' : 'false'}">
                <span class="corpo">
                    <span class="nome"><span class="nome-testo">${att.nome}</span>
                        ${ecoico(att) ? h` <span class="pill">Echo to tact</span>` : tipo === 'timedelay' ? h` <span class="pill">T/D${tdS != null ? ' ' + sec(tdS) : ''}</span>` : ''}
                        ${att.temporanea ? h` <span class="pill grigia">solo oggi</span>` : ''}
                        ${att.stato && att.stato !== 'attivo' ? h` <span class="pill grigia">${att.stato}</span>` : ''}
                        ${mant ? h` <span class="pill arancio" title="${att.mantenimento ? 'Il dato si prende ma non entra nelle statistiche' : 'Il target ha già raggiunto il criterio: si registra come mantenimento finché non si apre il prossimo'}">mantenimento</span>` : ''}
                        ${aCriterio ? h` <span class="pill verde">${icona('flag-checkered')} criterio</span>` : nCrit ? h` <span class="pill verde chiara" title="${ms.filter((m, i) => critM[i]).map((m) => m.nome).join(', ')} a criterio">${icona('flag-checkered')} ${nCrit} di ${nAcq}</span>` : ''}
                    </span>
                    ${t ? h`<span class="target">${t.setId ? h`${icona(giocabile ? 'layer-group' : 'triangle-exclamation')} ` : ''}${t.testo}${t.setId ? h` · ${etichettaModo(P.modoTarget(att, t))}` : ''}</span>` : (senzaTarget ? (P.inPercentuale(att) ? h`<span class="target">${icona('percent')} Dato in percentuale a ogni seduta</span>` : h`<span class="target">${icona('layer-group')} LU da ${att.prove} prove</span>`)
                        : !att.temporanea ? h`<span class="target"><i>Nessun target in corso: aggiungilo dal programma.</i></span>` : '')}
                    ${st ? h`<span class="target ta-riga">${icona('list-ol')} passo <b>${st.i + 1}/${passi.length}</b> · ${st.passo.testo}${st.giri ? h` <span class="pill grigia">giro ${st.giri + 1}</span>` : ''}</span>` : ''}
                    ${lu && (lu.prec || lu.oggi) ? h`<span class="target lu-attesa">${icona('hourglass-half')} ${testoLU(lu)}</span>` : ''}
                    ${oggiT ? h`<span class="target">${icona('circle-check')} già oggi: ${oggiV}/${oggiT} (${Math.round(100 * oggiV / oggiT)}%)${(() => { const chi = [...new Set(giaOggi.map((x) => x.operatore).filter(Boolean))]; return chi.length ? h` <span class="chi">· ${chi.join(', ')}</span>` : ''; })()}</span>` : ''}
                </span>
                <span class="conto">${ms.length ? h`<span class="piccolo sotto conto-ms">${ms.map((m, i) => { const x = vm[i], n = x ? x.v + x.p + x.x : 0; return h`<span>${m.nome}: <b class="${n ? classePct(Math.round(100 * x.v / n), soglia) : ''}">${n ? Math.round(100 * x.v / n) + '%' : '—'}</b></span>`; })}</span>` : tot ? h`<b class="${classePct(pct, soglia)}">${pct}%</b><br><span class="piccolo sotto">${v.v}/${tot}${att.prove ? ' di ' + att.prove : ''}</span>`
                    : h`<span class="piccolo sotto">${att.prove ? att.prove + ' prove' : 'tocca'}</span>`}</span>
            </button>
            ${hint && T.suggerimenti[att.id] ? h`<div class="att-suggerimenti aperti">
                ${h`<div class="sugg-testo">
                    ${att.suggerimenti ? h`<p>${att.suggerimenti}</p>` : ''}
                    ${t && t.suggerimento ? h`<p>${att.suggerimenti ? h`<b>${t.testo}:</b> ` : ''}${t.suggerimento}</p>` : ''}
                    ${ms.filter((m) => m.suggerimenti).map((m) => h`<p><b>${m.nome}:</b> ${m.suggerimenti}</p>`)}
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
                ${ms.length ? ms.map((m, i) => presaDati(p, att, t, tipo, m, vm[i], critM[i], soglia)) : h`${tasti(att, tipo)}
                <div class="sotto-tasti">
                    <div class="sequenza ${ecoico(att) ? 'eco' : ''}" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                    ${st ? h`<button class="ib" data-a="salta-passo" data-id="${att.id}" aria-label="Salta il passo" title="Salta il passo">${icona('forward')}</button>
                    <button class="ib" data-a="apri-ta" data-id="${att.id}" aria-label="Lista dei passi" title="Lista dei passi">${icona('list-ol')}</button>` : ''}
                    ${tipo === 'timedelay' ? h`<button class="bt piccolo fantasma td-voce" data-a="td-voce" data-id="${att.id}" title="Cambia il time delay">${icona('stopwatch')} ${tdS != null ? sec(tdS) : 'T/D ?'}</button>` : ''}
                    <button class="ib" data-a="annulla" data-id="${att.id}" aria-label="Annulla l'ultima" title="Annulla l'ultima">${icona('rotate-left')}</button>
                    <button class="ib" data-a="nota-voce" data-id="${att.id}" aria-label="Nota e opzioni" title="Nota e opzioni">${icona('pen')}</button>
                </div>`}
                ${prev ? h`<p class="avviso-criterio">${icona('flag-checkered')} ${prev}</p>` : ''}
                ${aCriterio ? (senzaTarget ? h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}: dal programma puoi terminare l'attività o aggiungere un target.</p>`
                    : h`<p class="avviso-criterio">${icona('flag-checkered')} Criterio raggiunto il ${formatoData(aCriterio)}. <button class="bt piccolo" data-a="chiudi-target" data-id="${att.id}" data-t="${t.id}">Passa al prossimo target</button></p>`) : ''}
                ${!ms.length && v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${v.nota}</p>` : ''}
            </div>` : ''}
        </div>`;
    }
    // Le prove che non arrivano a una LU intera non si perdono: restano da parte e la completano la volta dopo
    function testoLU(lu) {
        const prima = lu.prec ? `${lu.prec.seq.length} ${lu.prec.seq.length === 1 ? 'prova tenuta' : 'prove tenute'} da parte dal ${formatoData(lu.prec.dal)} · ` : '';
        if (lu.blocchi.length) return prima + `salvando, ${lu.blocchi.length === 1 ? 'la LU' : lu.blocchi.length + ' LU'} da ${lu.n} ${lu.blocchi.length === 1 ? 'entra' : 'entrano'} nei dati`
            + (lu.resto ? `; ${lu.resto} ${lu.resto === 1 ? 'prova resta' : 'prove restano'} da parte per la prossima seduta` : '');
        const m = lu.n - lu.resto;
        return prima + `ancora ${m} ${m === 1 ? 'prova' : 'prove'} per la LU da ${lu.n}: se non ci arrivi, si completa nella prossima seduta`;
    }
    // Una delle prese dati dell'attività (es. Categorizzazione → «Categorizza», «Tact mix»)
    function presaDati(p, att, t, tipo, m, v, crit, soglia) {
        const k = att.id + '~' + m.id;
        const attM = attPerVoce(att, k), tm = tipoMisura(att, m);
        const tipoM = (v && v.sessionType) || tm.sessionType;
        const tot = v ? v.v + v.p + v.x : 0;
        const lu = statoLU(attM, v, t || null, m.id);
        return h`<div class="presa ${crit ? 'a-criterio' : ''} ${m.bambino ? 'compatta' : ''}">
            <div class="presa-testa"><b>${m.nome}</b>
                ${m.tipo ? h`<span class="pill">${tm.eco ? 'Echo to tact' : tipoM === 'timedelay' ? 'T/D' : 'Indip.'}</span>` : ''}
                ${m.mantenimento ? h`<span class="pill grigia" title="Il dato si prende ma resta fuori da statistiche e criterio">mantenimento</span>` : ''}
                ${crit ? h`<span class="pill verde">${icona('flag-checkered')} criterio il ${formatoData(crit)}</span>` : ''}
                <span class="presa-conto">${tot ? h`<b class="${classePct(Math.round(100 * v.v / tot), soglia)}">${Math.round(100 * v.v / tot)}%</b> <span class="sotto">${v.v}/${tot}${attM.prove ? ' di ' + attM.prove : ''}</span>` : h`<span class="sotto">${attM.prove ? attM.prove + ' prove' : ''}</span>`}</span></div>
            ${lu && (lu.prec || lu.oggi) ? h`<p class="sotto piccolo lu-attesa">${icona('hourglass-half')} ${testoLU(lu)}</p>` : ''}
            ${tasti(attM, tipoM, k)}
            <div class="sotto-tasti">
                <div class="sequenza ${tm.eco ? 'eco' : ''}" aria-label="Sequenza delle risposte">${(v ? v.sequenza : '').split('').map((r) => h`<i class="${r}"></i>`)}</div>
                <button class="ib" data-a="annulla" data-id="${k}" aria-label="Annulla l'ultima di ${m.nome}" title="Annulla l'ultima">${icona('rotate-left')}</button>
                <button class="ib" data-a="nota-voce" data-id="${k}" aria-label="Nota e opzioni di ${m.nome}" title="Nota e opzioni">${icona('pen')}</button>
            </div>
            ${v && (v.nota || v.decisione) ? h`<p class="nota-voce">${icona('note-sticky')} ${v.decisione ? h`<b>${v.decisione}</b> ` : ''}${v.nota}</p>` : ''}
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

    // Per il calendario: la seduta di un bambino in quel giorno è in corso (bozza) o già salvata?
    function statoSeduta(pid, g) {
        const p = paz(pid);
        if (!p) return null;
        const b = T.bozza && T.bozza.pid === pid ? T.bozza : leggiBozza(pid);
        const prove = b && b.data === g ? Object.values(b.voci).filter(haDati).reduce((n, v) => n + v.v + v.p + v.x, 0) : 0;
        const ultima = (p.history || []).map((x) => String(x.date || '')).filter((d) => d && P.giorno(d) === g).sort().pop();
        const ora = ultima && !/T12:00:00(\.000)?Z?$/.test(ultima) ? new Date(ultima).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        return { prove, salvata: !!ultima, ora };
    }
    function riassunto(p) {
        const b = bozza(p.id);
        let corrette = 0, prove = 0, n = 0;
        // le attività in mantenimento non entrano nel conto delle LU della giornata
        Object.keys(b.voci).forEach((k) => { const v = b.voci[k], a = attivitaDi(p, k), mm = a ? misure(a).find((x) => x.id === msDi(k)) : null; if (haDati(v) && !(a && a.mantenimento) && !(mm && mm.mantenimento)) { n++; corrette += v.v; prove += v.v + v.p + v.x; } });
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
        if (eGruppo(p)) allineaMembri(p);
        const b = bozza(p.id);
        const lista = attivitaSeduta(p);
        const unica = lista.length === 1 && lista[0];
        const unicaGioco = unica && !unica.temporanea && schermoGrande() && ((P.targetCorrente(unica) || {}).target || {}).setId;
        if (unica && !unicaGioco && T.aperte[unica.id] === undefined) T.aperte[unica.id] = true;
        const perArea = perCategoria(lista);
        const nonOggi = b.data !== oggi();
        return h`${barra({ indietro: 'vai-ritorno', titolo: p.name,
                sotto: { testo: (nonOggi ? 'Seduta del ' : 'Oggi, ') + formatoData(b.data, true) + (chiDellaSeduta(p, b) ? ' · ' + chiDellaSeduta(p, b) : ''), azione: 'data' },
                destra: h`<button class="ib" data-a="apri-cartella" aria-label="Cartella clinica" title="Cartella clinica">${icona('chart-line')}</button>
                    <button class="ib" data-a="vai-programma" aria-label="Programma" title="Programma">${icona('list-check')}</button>
                    <button class="ib" data-a="menu-bambino" aria-label="Altro">${icona('ellipsis-vertical')}</button>` })}
            <main class="tice-main">
                ${testata((eGruppo(p) ? 'Gruppo · ' : 'Seduta · ') + (nonOggi ? 'del ' : 'oggi, ') + new Date(b.data + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) + (chiDellaSeduta(p, b) ? ' · ' + chiDellaSeduta(p, b) : ''), p.name, { azione: 'data' })}
                ${nonOggi ? h`<div class="banda">${icona('calendar-day')}<div>Stai registrando una seduta del <b>${formatoData(b.data, true)}</b>, non di oggi.</div></div>` : ''}
                ${eGruppo(p) ? h`<div class="presenti"><span class="sotto piccolo">Presenti oggi</span>${membriDi(p).map((x) => h`<button class="pill-presenza ${presente(b, x.id) ? 'si' : ''}" data-a="presente" data-pid="${x.id}" aria-pressed="${presente(b, x.id) ? 'true' : 'false'}">${presente(b, x.id) ? icona('check') : icona('xmark')} ${x.name}</button>`)}</div>` : ''}
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
        id = baseId(id);
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
        if (!aggiunte || (!Object.keys(aggiunte.sinonimi || {}).length && !(aggiunte.modalita || []).length && !(aggiunte.categorie || []).length)) return;
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
        // con più prese dati: quali sono già a criterio su quel target
        const statoMisure = (tg) => {
            if (!(att.misure || []).length || tg.stato !== 'attivo') return '';
            const acq = att.misure.filter((m) => !m.mantenimento);
            const ok = acq.filter((m) => P.criterioRaggiunto(P.sedute(p, att, tg, m.id), att.criterio));
            return ok.length ? h` <span class="pill verde chiara" title="${ok.map((m) => m.nome).join(', ')} a criterio">${icona('flag-checkered')} ${ok.length} di ${acq.length}: ${ok.map((m) => m.nome).join(', ')}</span>` : '';
        };
        const riga = (tg) => h`<li class="${CHIUSI.includes(tg.stato) ? 'chiuso' : ''}">
                    <span class="punto ${tg.stato}"></span>
                    <span class="tt">${P.passiDi(tg).length ? h`${icona('list-ol')} ` : ''}${tg.testo}${P.passiDi(tg).length ? h` <span class="sotto piccolo">· ${P.passiDi(tg).length} passi</span>` : ''}${tg.suggerimento ? h` <span class="sotto" title="Ha dei suggerimenti">${icona('lightbulb')}</span>` : ''}${celerazioneTarget(p, att, tg)}${statoMisure(tg)}<small>${P.STATI_TARGET[tg.stato] || tg.stato}${tg.fine ? ' il ' + formatoData(tg.fine) : ''}${ultimo(tg)}</small></span>
                    ${modifica || tg.setId ? h`<button class="ib" data-a="menu-target" data-id="${att.id}" data-t="${tg.id}" aria-label="Opzioni del target">${icona('ellipsis')}</button>` : ''}
                </li>`;
        const ultimaS = !t.length ? P.sedute(p, att).slice(-1)[0] : null;
        return h`<div class="scheda" data-prog="${att.id}" style="--col:${P.coloreDi(p, att)}">
            <button class="att-testa" ${modifica ? grezzo(`data-a="mod-att" data-id="${esc(att.id)}"`) : ''}>
                <span class="corpo"><span class="nome"><span class="nome-testo">${att.nome}</span>
                    ${(() => { const e = M.etichetta(att, dizionario()); return e && M.normalizza(e) !== M.normalizza(att.nome) ? h` <span class="pill grigia">${e}</span>` : ''; })()}
                    ${ecoico(att) ? h` <span class="pill">Echo to tact</span>` : att.sessionType === 'timedelay' ? (() => {
                        const d = P.tdDi(att), u = (att.tdCambi || []).slice(-1)[0];
                        return h` <span class="pill" title="${u ? `Cambiato il ${formatoData(u.il)}${u.da != null ? ' da ' + sec(u.da) : ''} a ${sec(u.a)}` : 'Time delay'}">T/D${d != null ? ' ' + sec(d) : ''}</span>`;
                    })() : h` <span class="pill grigia">Indip.</span>`}
                    ${att.stato !== 'attivo' ? h` <span class="pill arancio">${ETICHETTE_STATO[att.stato] || att.stato}</span>` : ''}
                    ${att.mantenimento ? h` <span class="pill grigia" title="Il dato si prende ma non entra nelle statistiche">mantenimento</span>` : ''}
                    ${att.suggerimenti ? h` <span class="pill grigia" title="${att.suggerimenti}">${icona('lightbulb')} suggerimenti</span>` : ''}</span>
                    <span class="target">${(att.misure || []).length ? h`${icona('table-cells')} ${att.misure.map((m) => m.nome + (m.mantenimento ? ' (mant.)' : '')).join(' · ')} — ` : ''}Criterio ${att.criterio.soglia}% per ${att.criterio.sedute} giorni${att.prove ? ' · ' + att.prove + ' prove' : ''}${att.descrizione ? ' · ' + att.descrizione : ''}</span></span>
                ${modifica ? icona('pen') : ''}
            </button>
            <ul class="targets">
                ${chiusi.length ? h`<li><details class="chiusi" ${T.chiusiAperti[att.id] ? grezzo('open') : ''} data-chiusi="${att.id}"><summary class="sotto piccolo">${chiusi.length} ${chiusi.length === 1 ? 'target chiuso' : 'target chiusi'}</summary>
                    <ul class="targets" style="padding:0">${chiusi.map(riga)}</ul></details></li>` : ''}
                ${aperti.map(riga)}
                ${!t.length ? h`<li class="senza-target"><span class="punto"></span><span class="tt">${P.inPercentuale(att) ? h`${icona('percent')} Senza numero di prove: il dato si prende in percentuale a ogni seduta` : h`${icona('layer-group')} LU da ${att.prove} prove: il dato entra quando se ne completano ${att.prove}`}<small>${ultimaS ? `${P.sedute(p, att).length} sedute, ultima ${formatoData(P.giorno(ultimaS.date))} ${ultimaS.percentage}%` : 'Nessuna seduta ancora'}</small></span></li>` : ''}
                <li class="azioni-att">${modifica ? h`<button class="bt piccolo fantasma" data-a="nuovo-target" data-id="${att.id}">${icona('plus')} Target</button>` : ''}
                    ${P.sedute(p, att).length ? h`<button class="bt piccolo fantasma" data-a="scc-att" data-id="${att.id}">${icona('chart-line')} Andamento</button>` : ''}</li>
            </ul>
        </div>`;
    }
    function vistaProgramma() {
        const p = paz(T.pid);
        if (!p) { T.vista = 'bambini'; return vistaBambini(); }
        if (eGruppo(p)) allineaMembri(p);
        const tutte = P.programma(p).attivita;
        const modifica = puoProgrammi(p);
        const attive = tutte.filter((a) => a.stato === 'attivo');
        const altre = tutte.filter((a) => a.stato !== 'attivo');
        const gruppi = perCategoria(attive);
        const senza = tutte.filter((a) => !a.modalita || !M.trovaModalita(a.modalita, dizionario()));
        return h`${barra({ indietro: 'vai-seduta', titolo: 'Programma', sotto: { testo: p.name },
                destra: h`<button class="ib" data-a="apri-cartella" aria-label="Cartella clinica" title="Cartella clinica">${icona('chart-line')}</button>` })}
            <main class="tice-main">
                ${testata('Programma · ' + attive.length + (attive.length === 1 ? ' attività in corso' : ' attività in corso'), p.name)}
                <p class="sotto">Le attività in corso compaiono nella presa dati con il loro target. Quando un target raggiunge il criterio l'app propone di passare al successivo.</p>
                ${modifica ? h`<button class="bt primario largo" data-a="nuova-att">${icona('plus')} Nuova attività</button>`
                    : h`<div class="banda">${icona('lock')}<div>Il programma lo modificano le professioniste: tu registri le sedute.</div></div>`}
                <button class="bt largo fantasma" data-a="stampa-griglie" style="margin-top:8px">${icona('print')} Stampa le griglie per la presa dati su carta</button>
                ${modifica && senza.length ? h`<p class="sotto piccolo riga-riordina">${icona('layer-group')} ${senza.length} ${senza.length === 1 ? 'attività non ha' : 'attività non hanno'} ancora una modalità del centro · <button class="link" data-a="classifica">riordina</button></p>` : ''}
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
        'apri-cartella': () => { if (T.pid) apriCartella(T.pid); },
        'vai-import': () => { if (!limitato()) vai('import'); },
        'apri-bambino': (b) => { T.aperte = {}; T.ritorno = T.vista === 'turni' ? 'turni' : 'bambini'; vai('seduta', b.dataset.pid); },
        // indietro dalla presa dati: dove si era (i turni del giorno o l'elenco dei bambini)
        'vai-ritorno': () => vai(T.ritorno === 'bambini' || !VISTE.turni ? 'bambini' : 'turni'),
        giochi: () => chiudi(),
        menu: async () => {
            const r = await foglio(h`<h2>Centro TICE</h2><div class="opzioni">
                <button class="opzione" data-foglio="giochi">${icona('gamepad')}<span class="corpo">Giochi e attività<small>Tutte le attività dell'app, con i set</small></span></button>
                <button class="opzione" data-foglio="cartelle">${icona('chart-line')}<span class="corpo">Cartelle cliniche<small>Grafici, giornate, diario, report</small></span></button>
                ${limitato() ? '' : h`<button class="opzione" data-foglio="import">${icona('file-import')}<span class="corpo">Importa quaderni Numbers</span></button>
                <button class="opzione" data-foglio="archivio">${icona('folder-open')}<span class="corpo">Archivio set</span></button>
                <button class="opzione" data-foglio="opzioni">${icona('gear')}<span class="corpo">Impostazioni e tema</span></button>`}
                ${limitato() ? '' : h`<button class="opzione" data-foglio="modalita">${icona('tags')}<span class="corpo">Categorie e modalità<small>Aggiungi categorie e tipi di attività, senza doppioni</small></span></button>`}
                <button class="opzione" data-foglio="schermo">${icona('expand')}<span class="corpo">Schermo<small>Dimensione dell'interfaccia e schermo intero</small></span></button>
                <button class="opzione" data-foglio="aspetto">${icona('pen-nib')}<span class="corpo">Aspetto · ${stile() === 'quaderno' ? 'quaderno' : 'classico'}<small>${stile() === 'quaderno' ? 'Torna all\'aspetto classico, senza righe e annotazioni' : 'Passa al quaderno: testate, righe a matita, annotazioni'}</small></span></button>
                ${EST.opzioniMenu ? EST.opzioniMenu() : ''}
                ${window.TicePwa && TicePwa.puoInstallare() ? h`<button class="opzione" data-foglio="installa">${icona('download')}<span class="corpo">Installa l'app<small>Si apre come un'app e funziona anche senza rete</small></span></button>` : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaMenu) return EST.sceltaMenu(r.slice(4));
            if (r === 'installa') { TicePwa.installa(); return; }
            if (r === 'schermo') { await opzioniSchermo(); return; }
            if (r === 'aspetto') {
                try { localStorage.setItem('tice_stile', stile() === 'quaderno' ? 'classico' : 'quaderno'); } catch (e) { /* niente */ }
                applicaStile(); disegna();
                avviso(stile() === 'quaderno' ? 'Aspetto: quaderno' : 'Aspetto: classico');
                return;
            }
            if (r === 'modalita') { await gestisciModalita(); disegna(); return; }
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
                <button class="opzione" data-foglio="annulla">${icona('rotate-left')}<span class="corpo">Annulla la seduta in corso</span></button>
                ${limitato() ? '' : eGruppo(p) ? h`<button class="opzione" data-foglio="dati">${icona('users')}<span class="corpo">Modifica il gruppo<small>Nome e bambini</small></span></button>`
                    : h`<button class="opzione" data-foglio="dati">${icona('pen')}<span class="corpo">Modifica i dati del bambino<small>Nome, data di nascita, categoria</small></span></button>`}
                ${EST.opzioniBambino ? EST.opzioniBambino(p) : ''}
                ${!limitato() && !(EST.condiviso && EST.condiviso(p.id)) ? h`<button class="opzione" data-foglio="elimina">${icona('trash')}<span class="corpo">Elimina il bambino<small>Con il suo programma e le sue sedute, da questo dispositivo</small></span></button>` : ''}
            </div><div class="bottoni"><button class="bt" data-foglio="chiudi">Chiudi</button></div>`);
            if (r && r.indexOf('est:') === 0 && EST.sceltaBambino) return EST.sceltaBambino(r.slice(4), p);
            if (r === 'programma') vai('programma');
            else if (r === 'cartella') apriCartella(p.id);
            else if (r === 'giochi') { if (typeof setGlobalPatient === 'function') setGlobalPatient(p.id); chiudi(); }
            else if (r === 'data') azioni.data();
            else if (r === 'stampa') azioni['stampa-griglie']();
            else if (r === 'annulla') azioni['annulla-seduta']();
            else if (r === 'dati') azioni['modifica-bambino']();
            else if (r === 'elimina') azioni['elimina-bambino']();
        },
        'nuovo-gruppo': async () => {
            if (limitato()) return;
            const r = await moduloGruppo(null);
            if (!r || !r.nome) return;
            if (r.membri.length < 2) { avviso('Scegli almeno due bambini.', 'errore'); return; }
            const g = { id: 'g' + Date.now().toString(), name: r.nome, gruppo: true, membri: r.membri, history: [], programma: { attivita: [] } };
            await salvaPaziente(g);
            if (EST.nuovoBambino) await EST.nuovoBambino(g);
            if (typeof state !== 'undefined' && Array.isArray(state.patients) && !state.patients.some((x) => x.id === g.id)) state.patients.push(g);
            T.ritorno = 'bambini';
            vai('programma', g.id);
        },
        'modifica-gruppo': async () => {
            const g = paz(T.pid);
            if (!eGruppo(g) || limitato()) return;
            const r = await moduloGruppo(g);
            if (!r || !r.nome) return;
            if (r.membri.length < 1) { avviso('Il gruppo deve avere almeno un bambino.', 'errore'); return; }
            g.name = r.nome; g.membri = r.membri;
            allineaMembri(g);
            await salvaPaziente(g);
            avviso('Gruppo salvato');
            disegna();
        },
        'presente': (b) => {
            const p = paz(T.pid), bz = bozza(p.id);
            bz.assenti = bz.assenti || [];
            const id = b.dataset.pid;
            bz.assenti = bz.assenti.includes(id) ? bz.assenti.filter((x) => x !== id) : bz.assenti.concat([id]);
            salvaBozza(); T.mantieniScroll = true; disegna();
        },
        'modifica-bambino': async () => {
            const p = paz(T.pid);
            if (eGruppo(p)) return azioni['modifica-gruppo']();
            if (!p || limitato()) return;
            const r = await foglio(h`<form><h2>Dati del bambino</h2>
                <label class="campo"><span>Nome (o iniziali)</span><input name="nome" required maxlength="80" value="${p.name || ''}" autocomplete="off"></label>
                <label class="campo"><span>Data di nascita (facoltativa)</span><input name="nascita" type="date" value="${p.nascita || ''}" max="${oggi()}"></label>
                <label class="campo"><span>Categoria (facoltativa)</span><input name="cat" maxlength="60" value="${p.category || ''}" placeholder="es. Aula 1" list="tice-categorie"></label>
                <datalist id="tice-categorie">${[...new Set(pazienti().map((x) => x.category).filter(Boolean))].map((c) => h`<option value="${c}">`)}</datalist>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`);
            if (!r || !r.nome.trim()) return;
            p.name = r.nome.trim();
            if (r.nascita) p.nascita = r.nascita; else delete p.nascita;
            if (r.cat.trim()) p.category = r.cat.trim(); else delete p.category;
            await salvaPaziente(p);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            avviso('Dati salvati');
            disegna();
        },
        'elimina-bambino': async () => {
            const p = paz(T.pid);
            if (!p || limitato()) return;
            const n = (p.history || []).length;
            if (!await conferma(`Eliminare ${p.name}?`, `${n ? `Le sue ${n} sedute e il programma vengono cancellati` : 'Il bambino viene cancellato'} da questo dispositivo. Non si può annullare.`, { ok: 'Elimina', pericolo: true })) return;
            await DB.deletePatient(p.id);
            if (typeof state !== 'undefined' && Array.isArray(state.patients)) state.patients = state.patients.filter((x) => x.id !== p.id);
            eliminaBozza(p.id);
            if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
            avviso(`${p.name} eliminato`);
            vai('bambini');
        },
        'nuovo-bambino': async () => {
            if (limitato()) return;
            const r = await foglio(h`<form><h2>Nuovo bambino</h2>
                <label class="campo"><span>Nome (o iniziali)</span><input name="nome" required maxlength="80" autofocus autocomplete="off"></label>
                <label class="campo"><span>Data di nascita (facoltativa)</span><input name="nascita" type="date" max="${oggi()}"></label>
                <label class="campo"><span>Categoria (facoltativa)</span><input name="cat" maxlength="60" placeholder="es. Aula 1" list="tice-categorie"></label>
                <datalist id="tice-categorie">${[...new Set(pazienti().map((x) => x.category).filter(Boolean))].map((c) => h`<option value="${c}">`)}</datalist>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Crea</button></div></form>`);
            if (!r || !r.nome.trim()) return;
            const p = { id: Date.now().toString(), name: r.nome.trim(), history: [], programma: { attivita: [] } };
            if (r.cat.trim()) p.category = r.cat.trim();
            if (r.nascita) p.nascita = r.nascita;
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
            const v = voce(p, att, b.dataset.id);
            const r = b.dataset.r;
            v[r.toLowerCase()] += 1;
            v.sequenza += r;
            ultimeDi(bozza(p.id)).push(b.dataset.id);
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
            const v = voce(p, att, b.dataset.id);
            const attV = attPerVoce(att, b.dataset.id);
            const targets = (att.target || []).filter((t) => t.stato === 'attivo' || t.stato === 'criterio' || t.stato === 'repertorio' || t.id === v.targetId);
            const tV = v.targetId ? (att.target || []).find((x) => x.id === v.targetId) : null;
            const msV = msDi(b.dataset.id), mV = misure(att).find((x) => x.id === msV);
            const attesaV = P.conAttesa(attV, tV) ? P.inAttesaDi(att, tV, msV) : null;
            const eco = ecoico(attV), tipoV = v.sessionType === 'timedelay' ? 'timedelay' : 'independent';
            const r = await foglio(h`<form class="modulo-att"><h2>${att.nome}${mV ? h` <span class="sotto">· ${mV.nome}</span>` : ''}</h2>
                <label class="campo"><span>Nota</span><textarea name="nota" maxlength="2000" rows="3">${v.nota || ''}</textarea></label>
                <label class="campo"><span>Decisione (facoltativa)</span><input name="decisione" maxlength="200" value="${v.decisione || ''}" placeholder="es. Passa a 1&quot; T/D" list="tice-decisioni"></label>
                <datalist id="tice-decisioni"><option value='Passa a 0" T/D'><option value='Passa a 1" T/D'><option value='Passa a 2" T/D'><option value="Probe"><option value="Stop"></datalist>
                <label class="campo campo-chi"><span>Svolta da <small class="sotto">· solo se diversa da chi ha svolto la seduta</small></span><input name="operatore" maxlength="120" value="${v.operatore || ''}" placeholder="${chiDellaSeduta(p, bozza(p.id)) || 'Nome'}" autocomplete="off"></label>
                <details class="sez apribile"><summary><span class="sez-titolo">Correggi i dati</span> <span class="sotto piccolo">${[targets.length > 1 ? 'target' : '', eco ? '' : 'tipo', 'conteggi', attesaV ? 'prove in attesa' : ''].filter(Boolean).join(', ')}</span></summary>
                    ${targets.length > 1 ? h`<label class="campo"><span>Target registrato</span><select name="targetId">
                        ${targets.map((t) => h`<option value="${t.id}" ${t.id === v.targetId ? grezzo('selected') : ''}>${t.testo} (${P.STATI_TARGET[t.stato]})</option>`)}</select></label>` : ''}
                    ${eco ? '' : h`<div class="campo"><span>Tipo di seduta</span><div class="scelta">
                        <label><input type="radio" name="tipo" value="independent" ${tipoV === 'independent' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                        <label><input type="radio" name="tipo" value="timedelay" ${tipoV === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label>
                    </div><span class="sotto piccolo avviso-doppione" data-conversione></span></div>`}
                    <div class="riga-campi conteggi">
                        <label class="campo"><span>✓ ${eco ? 'Autonome' : 'Corrette'}</span><input name="v" type="number" min="0" max="999" inputmode="numeric" value="${v.v}"></label>
                        ${eco ? h`<label class="campo"><span>e+ Ecoiche</span><input name="eco" type="number" min="0" max="999" inputmode="numeric" value="${v.p}"></label>
                            <label class="campo"><span>✗ Errate</span><input name="no" type="number" min="0" max="999" inputmode="numeric" value="${v.x}"></label>`
                            : h`<label class="campo"><span data-etichetta-no>${tipoV === 'timedelay' ? 'P Promptate' : '✗ Errate'}</span><input name="no" type="number" min="0" max="999" inputmode="numeric" value="${v.p + v.x}"></label>`}
                    </div>
                    ${attesaV ? h`<label class="spunta-riga"><input type="checkbox" name="scarta"> <span><b>Scarta le ${attesaV.seq.length} prove in attesa</b><br><span class="sotto piccolo">Registrate dal ${formatoData(attesaV.dal)} senza arrivare a una LU da ${attV.prove}: non entreranno nei dati.</span></span></label>` : ''}
                </details>
                ${att.temporanea ? h`<button type="button" class="bt pericolo" data-foglio="togli" style="width:100%">Togli dalla seduta</button>` : ''}
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
                dopo: (el) => {
                    // cambiando tipo: l'etichetta dei conteggi e cosa succede alle risposte già segnate
                    const conv = el.querySelector('[data-conversione]'), et = el.querySelector('[data-etichetta-no]');
                    el.querySelectorAll('[name=tipo]').forEach((x) => x.addEventListener('change', () => {
                        if (et) et.textContent = x.value === 'timedelay' ? 'P Promptate' : '✗ Errate';
                        const n = x.value === 'timedelay' ? v.x : v.p;
                        conv.textContent = x.value !== tipoV && n ? `Cambiando tipo, ${n} ${n === 1 ? 'risposta' : 'risposte'} ${x.value === 'timedelay' ? '✗' : 'P'} ${n === 1 ? 'diventa' : 'diventano'} ${x.value === 'timedelay' ? 'P' : '✗'}.` : '';
                    }));
                }
            });
            if (r === 'togli') {
                const bz = bozza(p.id);
                bz.temp = bz.temp.filter((x) => x.id !== att.id);
                delete bz.voci[att.id];
                salvaBozza(); T.mantieniScroll = true; disegna();
                return;
            }
            if (!r) return;
            if (r.targetId && r.targetId !== v.targetId) {
                const tt = att.target.find((x) => x.id === r.targetId);
                // il target è dell'attività: vale per tutte le sue prese dati
                const bz = bozza(p.id);
                Object.keys(bz.voci).filter((x) => baseId(x) === att.id).map((x) => bz.voci[x]).concat([v]).forEach((x) => {
                    x.targetId = r.targetId; x.mantenimento = !!(tt && tt.stato !== 'attivo');
                });
            }
            if (!eco) v.sessionType = r.tipo === 'timedelay' ? 'timedelay' : 'independent';
            convertiVoce(v, v.sessionType, attV);
            const no = ecoico(attV) ? 'x' : nonCorretta(v.sessionType).toLowerCase();
            const nv = Math.max(0, Math.min(999, parseInt(r.v, 10) || 0));
            const nn = Math.max(0, Math.min(999, parseInt(r.no, 10) || 0));
            const ne = ecoico(attV) ? Math.max(0, Math.min(999, parseInt(r.eco, 10) || 0)) : v.p;
            if (nv !== v.v || nn !== v[no] || ne !== v.p) {
                v.p = ne;
                // la sequenza non corrisponde più ai conteggi: la si ricostruisce in blocco
                v.v = nv; v[no] = nn;
                v.sequenza = 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x);
            }
            v.decisione = r.decisione.trim();
            v.nota = r.nota.trim();
            if (String(r.operatore || '').trim()) v.operatore = String(r.operatore).trim(); else delete v.operatore;
            if (r.scarta && attesaV && att.inAttesa) {
                delete att.inAttesa[P.chiaveAttesa(tV, msV)];
                if (!Object.keys(att.inAttesa).length) delete att.inAttesa;
                await salvaPaziente(p);
            }
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
                const tt = a && v.targetId ? (a.target || []).find((x) => x.id === v.targetId) : null;
                const lu = a ? statoLU(attPerVoce(a, k), v, tt, msDi(k)) : null;
                const mm = a ? misure(a).find((x) => x.id === msDi(k)) : null;
                return h`<tr><td>${a ? a.nome : '?'}${mm ? ' · ' + mm.nome : ''}${lu ? h`<br><small class="sotto">${lu.blocchi.length ? `${lu.blocchi.length} LU nei dati` : 'non entra ancora nei dati'}${lu.resto ? ` · ${lu.resto}/${lu.n} in attesa` : ''}</small>` : ''}</td><td class="num">${v.v}/${tot}</td><td class="num"><b class="${classePct(pct, a && a.criterio && a.criterio.soglia)}">${pct}%</b></td></tr>`;
            });
            // chi ha svolto la seduta: dai turni del calendario; se non c'è nessuno, lo si chiede
            const cal = EST.chiDi ? await EST.chiDi(p.id, b.data).catch(() => ({ nomi: [], persone: [] })) : { nomi: [], persone: [] };
            const operatore = b.operatore || cal.nomi.join(' + ');
            let ultimo = '';
            try { ultimo = localStorage.getItem('tice_operatore') || ''; } catch (e) { /* niente */ }
            const suggeriti = [...new Set([ultimo, ...cal.persone].filter(Boolean))];
            const dati = await foglio(h`<form class="fine-seduta"><h2>Fine seduta</h2>
                <table class="tabella" style="margin-bottom:14px"><tbody>${righe}</tbody>
                    <tfoot><tr><th>Learn unit</th><th class="num">${r0.corrette}/${r0.prove}</th><th class="num">${Math.round(100 * r0.corrette / r0.prove)}%</th></tr></tfoot></table>
                <label class="campo campo-chi"><span>Chi ha svolto la seduta${!b.operatore && cal.nomi.length ? h` <small class="sotto">· dal calendario</small>` : ''}</span><input name="operatore" maxlength="120" required value="${operatore}" placeholder="Nome, o più nomi separati da +" list="tice-chi" autocomplete="off">
                    <datalist id="tice-chi">${suggeriti.map((n) => h`<option value="${n}">`)}</datalist></label>
                <label class="campo"><span>Note sulla seduta (vanno nel diario del giorno)</span><textarea name="nota" maxlength="5000" placeholder="Comportamento, rinforzatori, osservazioni…"></textarea></label>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Torna alla seduta</button><button class="bt primario">${icona('check')} Salva</button></div></form>`);
            if (!dati) return;
            try { localStorage.setItem('tice_operatore', dati.operatore.trim().split('+')[0].trim()); } catch (e) { /* niente */ }
            await salvaSeduta(p, b, dati);
        },
        'chiudi-target': async (b) => {
            const p = paz(T.pid);
            const att = P.attivita(p, b.dataset.id);
            const t = att && att.target.find((x) => x.id === b.dataset.t);
            if (!t) return;
            await proponiProssimo(p, att, t, P.criterioDi(p, att, t));
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
            try { await risolviNuovaModalita(r); } catch (e) { avviso('Modalità non creata: ' + (e.message || e), 'errore'); r.modalita = ''; }
            const righe = String(r.target || '').split('\n').map((x) => x.trim()).filter(Boolean);
            const att = P.nuovaAttivita(p, Object.assign({}, r, { target: null, sessionType: r.sessionType === 'timedelay' ? 'timedelay' : 'independent' }));
            if (r.sessionType === 'ecoico') { att.risposte = 'ecoico'; att.nomeP = 'Ecoica'; }
            if (r.colore) att.colore = r.colore;
            if (eGruppo(p)) allineaMembri(p); else impostaMisure(att, r);
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
                if (['attivo', 'sospeso', 'terminato'].includes(r.stato)) att.stato = r.stato;
                att.nome = r.nome.trim() || att.nome;
                try { await risolviNuovaModalita(r); } catch (e) { avviso('Modalità non creata: ' + (e.message || e), 'errore'); r.modalita = att.modalita || ''; }
                modalitaDaModulo(att, r);
                att.descrizione = r.descrizione.trim();
                att.suggerimenti = String(r.suggerimenti || '').trim();
                att.cronometro = !!r.cronometro;
                if (!eGruppo(p)) impostaMisure(att, r);
                if (r.mantenimento) att.mantenimento = true; else delete att.mantenimento;
                att.sessionType = r.sessionType === 'timedelay' ? 'timedelay' : 'independent';
                if (r.sessionType === 'ecoico') { att.risposte = 'ecoico'; att.nomeP = 'Ecoica'; }
                else if (ecoico(att)) { delete att.risposte; if (att.nomeP === 'Ecoica') delete att.nomeP; }
                if (r.colore) att.colore = r.colore; else delete att.colore;
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
            const crit = P.criterioDi(p, att, t);
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

    // ---------- categorie e modalità nuove, senza doppioni ----------
    // Un nome uguale a meno di maiuscole, accenti e spazi è la stessa cosa
    const stessaModalita = (nome) => { const n = M.normalizza(nome); return n ? M.elenco(dizionario()).modalita.find((m) => M.normalizza(m.nome) === n) : null; };
    const stessaCategoria = (nome) => { const n = M.normalizza(nome); return n ? M.elenco(dizionario()).categorie.find((c) => M.normalizza(c.nome) === n) : null; };
    const nomeCategoria = (id) => (M.elenco(dizionario()).categorie.find((c) => c.id === id) || {}).nome || '';
    async function creaCategoria(nome) {
        nome = String(nome || '').trim().slice(0, 60);
        if (!nome) return null;
        const c = stessaCategoria(nome);
        if (c) return c.id;
        const id = M.nuovoId(nome);
        await salvaDizionario({ categorie: [{ id, nome }], modalita: [], sinonimi: {} });
        return id;
    }
    async function creaModalita(nome, categoria) {
        nome = String(nome || '').trim().slice(0, 60);
        if (!nome) return null;
        const m = stessaModalita(nome);
        if (m) return m.id;
        const id = M.nuovoId(nome);
        await salvaDizionario({ modalita: [{ id, nome, categoria: categoria || 'altro' }], sinonimi: {} });
        return id;
    }
    // Il campo "categoria" dei moduli: le esistenti o una nuova scritta sul posto
    function sceltaCategoria(nome, scelta) {
        const E = M.elenco(dizionario());
        return h`<select class="campo-in" name="${nome}" data-cat-scelta aria-label="Categoria">${E.categorie.map((c) => h`<option value="${c.id}" ${scelta === c.id ? grezzo('selected') : ''}>${c.nome}</option>`)}<option value="+">+ Nuova categoria…</option></select>`;
    }
    const campoNuovaCategoria = (nome) => h`<input class="campo-in" name="${nome + '_nuova'}" maxlength="60" placeholder="Nome della nuova categoria" hidden data-cat-nuova data-doppione="categoria" autocomplete="off">`;
    // Avvisi dal vivo sui doppioni e campi che compaiono con le scelte "+ nuova"
    function agganciaNuove(el) {
        el.querySelectorAll('[data-cat-scelta]').forEach((sel) => {
            const nuova = sel.closest('.campo').querySelector('[data-cat-nuova]');
            const mostra = () => { nuova.hidden = sel.value !== '+'; if (!nuova.hidden) nuova.focus(); };
            sel.addEventListener('change', mostra);
        });
        el.querySelectorAll('[data-doppione]').forEach((inp) => {
            const nota = inp.closest('.campo').querySelector('[data-doppione-nota]');
            const prova = () => {
                const x = inp.dataset.doppione === 'categoria' ? stessaCategoria(inp.value) : stessaModalita(inp.value);
                // un avviso per campo: due campi nello stesso riquadro non si cancellano a vicenda
                if (!x) { if (nota.dataset.di === inp.name) { nota.textContent = ''; delete nota.dataset.di; } return; }
                nota.dataset.di = inp.name;
                nota.textContent = inp.dataset.doppione === 'categoria' ? `Esiste già la categoria «${x.nome}»: verrà usata quella.` : `Esiste già «${x.nome}» in ${nomeCategoria(x.categoria)}: verrà usata quella.`;
            };
            inp.addEventListener('input', prova);
            prova();
        });
    }
    async function categoriaDalModulo(r, campo) {
        return r[campo] === '+' ? creaCategoria(r[campo + '_nuova']) : r[campo];
    }
    // Il foglio per vedere e aggiungere categorie e modalità
    async function gestisciModalita() {
        for (;;) {
            const E = M.elenco(dizionario());
            const r = await foglio(h`<form><h2>Categorie e modalità</h2>
                <p class="sotto piccolo">Servono a raggruppare le attività nel programma e nelle statistiche. Nel centro valgono per tutti.</p>
                <div class="campo"><span>Nuova modalità (tipo di attività)</span>
                    <div class="riga-campi"><input class="campo-in" name="mod" maxlength="60" placeholder="es. Echo to tact" data-doppione="modalita" autocomplete="off">
                        ${sceltaCategoria('cat', 'altro')}</div>
                    ${campoNuovaCategoria('cat')}
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span>
                    <button class="bt piccolo primario" name="azione" value="modalita">${icona('plus')} Aggiungi la modalità</button></div>
                <div class="campo"><span>Nuova categoria</span>
                    <div class="riga-campi"><input class="campo-in" name="categoria" maxlength="60" placeholder="es. Repertori accademici" data-doppione="categoria" autocomplete="off"></div>
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span>
                    <button class="bt piccolo" name="azione" value="categoria">${icona('plus')} Aggiungi la categoria</button></div>
                <div class="elenco-modalita">${E.categorie.map((c) => { const ms = E.modalita.filter((m) => m.categoria === c.id); return h`<div class="cat-mod"><b>${c.nome}</b>${c.centro ? h` <span class="pill grigia">del centro</span>` : ''}<div class="chips">${ms.length ? ms.map((m) => h`<span class="chip ${m.centro ? 'nuova' : ''}">${m.nome}</span>`) : h`<span class="sotto piccolo">nessuna modalità</span>`}</div></div>`; })}</div>
                <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Fatto</button></div></form>`, {
                dopo: agganciaNuove,
                invia: (form, bt) => { const d = Object.fromEntries(new FormData(form)); d.azione = bt && bt.value; return d; }
            });
            if (!r) return;
            try {
                if (r.azione === 'modalita') {
                    if (!String(r.mod || '').trim()) { avviso('Scrivi il nome della modalità.', 'errore'); continue; }
                    const gia = stessaModalita(r.mod);
                    if (gia) { avviso(`«${gia.nome}» esiste già in ${nomeCategoria(gia.categoria)}.`); continue; }
                    const cat = await categoriaDalModulo(r, 'cat');
                    await creaModalita(r.mod, cat);
                    avviso(`Modalità «${r.mod.trim()}» aggiunta in ${nomeCategoria(cat)}`);
                } else if (r.azione === 'categoria') {
                    if (!String(r.categoria || '').trim()) { avviso('Scrivi il nome della categoria.', 'errore'); continue; }
                    const gia = stessaCategoria(r.categoria);
                    if (gia) { avviso(`La categoria «${gia.nome}» esiste già.`); continue; }
                    await creaCategoria(r.categoria);
                    avviso(`Categoria «${r.categoria.trim()}» aggiunta`);
                }
            } catch (e) { avviso(e.message || String(e), 'errore'); return; }
        }
    }

    // Modalità scelta nel modulo, o riconosciuta dal nome quando è sicura
    // "+ Nuova modalità…" nel modulo: la si crea (o si usa quella con lo stesso nome)
    async function risolviNuovaModalita(r) {
        if (r.modalita !== '+') return;
        r.modalita = String(r.mod_nome || '').trim() ? await creaModalita(r.mod_nome, await categoriaDalModulo(r, 'mod_cat')) : '';
    }
    function modalitaDaModulo(att, r) {
        if (r.modalita) { att.modalita = r.modalita; att.variante = String(r.variante || '').trim(); return; }
        const x = M.riconosci(att, dizionario());
        if (x.modalita && x.certo) { att.modalita = x.modalita; att.variante = String(r.variante || '').trim() || x.variante; }
        else { delete att.modalita; att.variante = String(r.variante || '').trim(); }
    }
    // Le prese dati scritte nel modulo: quelle già esistenti tengono il loro id (e i dati)
    function impostaMisure(att, r) {
        const righe = Object.keys(r).filter((k) => /^ms_nome_\d+$/.test(k)).sort((x, y) => +x.slice(8) - +y.slice(8))
            .map((k) => { const i = k.slice(8); return { id: String(r['ms_id_' + i] || ''), nome: String(r[k] || '').trim(), mant: !!r['ms_mant_' + i],
                tipo: ['independent', 'timedelay', 'ecoico'].includes(r['ms_tipo_' + i]) ? r['ms_tipo_' + i] : '', sugg: String(r['ms_sugg_' + i] || '').trim(),
                prove: Math.min(200, parseInt(r['ms_prove_' + i], 10) || 0) }; })
            .filter((x) => x.nome);
        const viste = new Set();
        const nuove = righe.filter((x) => { const k = x.nome.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; }).slice(0, 8);
        if (nuove.length < 2) { delete att.misure; return; }
        const prima = att.misure || [];
        att.misure = nuove.map((x) => {
            const vecchia = prima.find((m) => m.id === x.id) || prima.find((m) => m.nome.toLowerCase() === x.nome.toLowerCase());
            const m = { id: vecchia ? vecchia.id : P.nuovoId('ms'), nome: x.nome };
            if (x.mant) m.mantenimento = true;
            if (x.tipo) m.tipo = x.tipo;
            if (x.sugg) m.suggerimenti = x.sugg;
            if (x.prove > 0) m.prove = x.prove;
            return m;
        });
    }
    function moduloAttivita(p, att) {
        const a = att || { nome: '', area: '', descrizione: '', sessionType: 'independent', criterio: { soglia: 90, sedute: 2 }, prove: null };
        const tdA = att ? P.tdDi(att) : null;
        const tipoA = ecoico(a) ? 'ecoico' : a.sessionType === 'timedelay' ? 'timedelay' : 'independent';
        const nMis = (a.misure || []).length;
        const conTesti = !!(a.descrizione || a.suggerimenti);
        return foglio(h`<form class="modulo-att"><h2>${att ? 'Modifica attività' : 'Nuova attività'}</h2>
            <section class="sez">
                <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" value="${a.nome}" ${att ? '' : grezzo('autofocus')} placeholder="es. TACT, Imitazione motoria"></label>
                <div class="riga-campi">
                    <label class="campo"><span>Modalità</span><select name="modalita" class="campo-in" data-mod-scelta><option value="">Dal nome, in automatico</option>${opzioniModalita(a.modalita)}<option value="+">+ Nuova modalità…</option></select></label>
                    <label class="campo"><span>Variante</span><input name="variante" maxlength="80" value="${a.variante || ''}" placeholder="es. intensivo"></label>
                </div>
                <div class="campo nuova-modalita" data-mod-nuova hidden><span>Nuova modalità</span>
                    <div class="riga-campi"><input class="campo-in" name="mod_nome" maxlength="60" placeholder="Nome, es. Echo to tact" data-doppione="modalita" autocomplete="off">
                        ${sceltaCategoria('mod_cat', 'altro')}</div>
                    ${campoNuovaCategoria('mod_cat')}
                    <span class="sotto piccolo avviso-doppione" data-doppione-nota></span></div>
                <div class="campo"><span>Colore <small class="sotto">· in seduta, nel programma e sui fogli</small></span><div class="colori-att">
                    <label title="Automatico"><input type="radio" name="colore" value="" ${!a.colore ? grezzo('checked') : ''}><span class="auto" style="--col:${att ? P.coloreDi(p, att, true) : P.PALETTE[P.programma(p).attivita.length % P.PALETTE.length]}">A</span></label>
                    ${P.PALETTE.map((c) => h`<label><input type="radio" name="colore" value="${c}" ${a.colore === c ? grezzo('checked') : ''}><span style="--col:${c}"></span></label>`)}
                </div></div>
            </section>
            <section class="sez"><h3 class="sez-titolo">Come si prende il dato</h3>
                <div class="campo"><span>Tipo di seduta</span><div class="scelta">
                    <label><input type="radio" name="sessionType" value="independent" ${tipoA === 'independent' ? grezzo('checked') : ''}><span>Indipendente</span></label>
                    <label><input type="radio" name="sessionType" value="timedelay" ${tipoA === 'timedelay' ? grezzo('checked') : ''}><span>Time delay</span></label>
                    <label><input type="radio" name="sessionType" value="ecoico" ${tipoA === 'ecoico' ? grezzo('checked') : ''}><span>Echo to tact</span></label></div>
                    <span class="sotto piccolo" data-se-tipo="independent" ${tipoA === 'independent' ? '' : grezzo('hidden')}>In seduta: ✓ corretta, ✗ errata.</span>
                    <span class="sotto piccolo" data-se-tipo="ecoico" ${tipoA === 'ecoico' ? '' : grezzo('hidden')}>In seduta: ✓ se lo dice da solo, e+ se lo ripete in ecoico, ✗ se no.</span></div>
                <label class="campo" data-se-tipo="timedelay" ${tipoA === 'timedelay' ? '' : grezzo('hidden')}><span>Secondi di time delay</span><input name="tdSeconds" type="number" min="0" max="60" inputmode="numeric" value="${tdA != null ? tdA : ''}" placeholder="es. 0, 1, 2…">
                    <span class="sotto piccolo">In seduta: ✓ corretta, P promptata. Se cambi i secondi, il cambio resta segnato con la data${(a.tdCambi || []).length ? h` (finora: ${a.tdCambi.map((c) => `${formatoData(c.il)} ${c.da != null ? sec(c.da) + '→' : ''}${sec(c.a)}`).join(', ')})` : ''}.</span></label>
                <div class="riga-campi">
                    <label class="campo"><span>Prove per LU</span><input name="prove" type="number" min="1" max="200" inputmode="numeric" value="${a.prove || ''}" placeholder="vuoto = %"></label>
                    <label class="campo"><span>Criterio %</span><input name="soglia" type="number" min="10" max="100" inputmode="numeric" value="${a.criterio.soglia}"></label>
                    <label class="campo"><span>Giorni di fila</span><input name="sedute" type="number" min="1" max="10" inputmode="numeric" value="${a.criterio.sedute}"></label>
                </div>
                <p class="sotto piccolo aiuto">Con le prove per LU il dato entra quando se ne completano tante, anche in più sedute; vuoto: percentuale a ogni seduta.</p>
                <label class="spunta-riga"><input type="checkbox" name="mantenimento" ${a.mantenimento ? grezzo('checked') : ''}> <span><b>Mantenimento</b> <span class="sotto piccolo">· si segna, ma fuori da statistiche e criterio</span></span></label>
                <label class="spunta-riga"><input type="checkbox" name="cronometro" ${a.cronometro ? grezzo('checked') : ''}> <span><b>Cronometra (fluency)</b> <span class="sotto piccolo">· risposte al minuto, grafico SCC</span></span></label>
            </section>
            ${att ? '' : h`<section class="sez"><h3 class="sez-titolo">Target</h3>
                <label class="campo"><span>Uno per riga: il primo è quello da cui si parte</span><textarea name="target" rows="3" placeholder="es. Animali: cane, gatto&#10;Frutta: mela, banana"></textarea>
                    <span class="sotto piccolo">Vuoto: li scegli dopo dall'archivio dei set o da una lista; si può anche lavorare senza target.</span></label></section>`}
            <details class="sez apribile" ${eGruppo(p) ? grezzo('hidden') : ''} ${nMis ? grezzo('open') : ''}><summary><span class="sez-titolo">Sottoattività</span> <span class="sotto piccolo">${nMis ? nMis + ' · ' : ''}più prese dati nella stessa attività</span></summary>
                <div class="sottoattivita" data-sotto>${(a.misure || []).map((m, i) => rigaSotto(i, m))}</div>
                <button type="button" class="bt piccolo fantasma" data-sotto-aggiungi>${icona('plus')} Aggiungi sottoattività</button>
                <p class="sotto piccolo aiuto">Ognuna ha i suoi tasti e il suo dato sullo stesso target, e arriva a criterio per conto suo; l'attività quando ci arrivano tutte. Tipo e prove vuoti: come l'attività.</p></details>
            <details class="sez apribile" ${conTesti ? grezzo('open') : ''}><summary><span class="sez-titolo">Descrizione e suggerimenti</span> <span class="sotto piccolo">${conTesti ? 'compilati' : 'facoltativi'}</span></summary>
                <label class="campo"><span>Descrizione</span><input name="descrizione" maxlength="300" value="${a.descrizione || ''}"></label>
                <label class="campo"><span>Suggerimenti per chi somministra</span><textarea name="suggerimenti" maxlength="3000" rows="3" placeholder="Come presentare lo stimolo, che aiuto dare, quando rinforzare, errori da evitare…">${a.suggerimenti || ''}</textarea>
                    <span class="sotto piccolo">In seduta, con il tasto dei suggerimenti.</span></label></details>
            ${att ? h`<section class="sez"><h3 class="sez-titolo">Stato</h3>
                <div class="scelta">
                    <label><input type="radio" name="stato" value="attivo" ${att.stato === 'attivo' ? grezzo('checked') : ''}><span>Attiva</span></label>
                    <label><input type="radio" name="stato" value="sospeso" ${att.stato === 'sospeso' ? grezzo('checked') : ''}><span>Sospesa</span></label>
                    <label><input type="radio" name="stato" value="terminato" ${att.stato === 'terminato' ? grezzo('checked') : ''}><span>Terminata</span></label></div>
                <span class="sotto piccolo">Sospesa o terminata: non compare nella presa dati; i dati restano.</span>
                <button type="button" class="bt piccolo fantasma pericolo-testo" data-foglio="elimina" style="margin-top:10px">${icona('trash')} Elimina dal programma…</button></section>` : ''}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`, {
            dopo: (el) => {
                agganciaNuove(el);
                const sm = el.querySelector('[data-mod-scelta]'), nm = el.querySelector('[data-mod-nuova]');
                sm.addEventListener('change', () => { nm.hidden = sm.value !== '+'; if (!nm.hidden) nm.querySelector('input').focus(); });
                // le parti che dipendono dal tipo di seduta compaiono solo quando servono
                el.querySelectorAll('[name=sessionType]').forEach((r) => r.addEventListener('change', () => {
                    el.querySelectorAll('[data-se-tipo]').forEach((x) => { x.hidden = x.dataset.seTipo !== r.value; });
                }));
                const box = el.querySelector('[data-sotto]');
                let n = box.children.length;
                const nuova = () => { box.insertAdjacentHTML('beforeend', String(rigaSotto(n++, null))); box.lastElementChild.querySelector('input').focus(); };
                el.querySelector('[data-sotto-aggiungi]').addEventListener('click', nuova);
                box.addEventListener('click', (e) => { const x = e.target.closest('[data-sotto-togli]'); if (x) x.closest('.riga-sotto').remove(); });
            }
        });
    }
    // Una riga del modulo: nome della sottoattività e i suoi flag (l'id tiene i dati già presi)
    function rigaSotto(i, m) {
        const tipo = (m && m.tipo) || '';
        const opz = [['', 'Tipo come l\'attività'], ['independent', 'Indipendente'], ['timedelay', 'Time delay'], ['ecoico', 'Echo to tact']];
        return h`<div class="riga-sotto">
            <div class="riga-sotto-1">
                <input type="hidden" name="${'ms_id_' + i}" value="${m ? m.id : ''}">
                <input class="campo-in" name="${'ms_nome_' + i}" maxlength="60" value="${m ? m.nome : ''}" placeholder="es. Categorizza" aria-label="Nome della sottoattività">
                <label class="spunta-riga" title="Il dato si prende ma resta fuori da statistiche e criterio"><input type="checkbox" name="${'ms_mant_' + i}" ${m && m.mantenimento ? grezzo('checked') : ''}> <span>Mantenimento</span></label>
                <button type="button" class="ib" data-sotto-togli aria-label="Togli la sottoattività" title="Togli">${icona('xmark')}</button>
            </div>
            <div class="riga-sotto-2">
                <select class="campo-in" name="${'ms_tipo_' + i}" aria-label="Tipo di seduta della sottoattività">${opz.map(([v, n]) => h`<option value="${v}" ${v === tipo ? grezzo('selected') : ''}>${n}</option>`)}</select>
                <input class="campo-in prove-sotto" name="${'ms_prove_' + i}" type="number" min="1" max="200" inputmode="numeric" value="${(m && m.prove) || ''}" placeholder="Prove" title="Prove per LU (vuoto: come l'attività)" aria-label="Prove per LU della sottoattività">
                <input class="campo-in" name="${'ms_sugg_' + i}" maxlength="600" value="${(m && m.suggerimenti) || ''}" placeholder="Indicazioni per chi somministra (facoltative)" aria-label="Indicazioni della sottoattività">
            </div>
        </div>`;
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

    // Chi ha svolto la seduta: dai turni del calendario, se c'è qualcuno in turno con il bambino
    const chiCache = {};
    function chiDalCalendario(pid, data) {
        const k = pid + '|' + data;
        if (!EST.chiDi) return { nomi: [], persone: [] };
        if (!chiCache[k] || Date.now() - chiCache[k].il > 120000) {
            const prima = chiCache[k] || { nomi: [], persone: [] };
            chiCache[k] = Object.assign({}, prima, { il: Date.now() });
            EST.chiDi(pid, data).then((r) => { const cambiato = (r.nomi || []).join() !== (prima.nomi || []).join(); chiCache[k] = Object.assign(r, { il: Date.now() }); if (cambiato && T.vista === 'seduta' && T.pid === pid) TiceHome.ridisegna(); })
                .catch(() => { /* resta quello di prima */ });
        }
        return chiCache[k];
    }
    const chiDellaSeduta = (p, b) => (b.operatore ? b.operatore : chiDalCalendario(p.id, b.data).nomi.join(' + '));

    async function salvaSeduta(p, b, dati) {
        const quando = b.data === oggi() ? new Date().toISOString() : b.data + 'T12:00:00';
        const operatore = String(dati.operatore || '').trim();
        const nuove = [];
        const controlla = [];
        const attese = [];   // { nome, n, di }: prove che aspettano di completare la LU
        Object.keys(b.voci).forEach((k) => {
            const v = b.voci[k];
            if (!haDati(v)) return;
            const att = attivitaDi(p, k);
            if (!att) return;
            // una delle prese dati dell'attività: seduta a sé, con il suo nome e il suo grafico
            const m = misure(att).find((x) => x.id === msDi(k)) || null;
            const marca = (x) => {
                if (m && x) {
                    x.setName += ' · ' + m.nome; x.setId += '~' + m.id; x.misura = m.id; x.misuraNome = m.nome;
                    if (m.mantenimento) { x.mantenimento = true; x.fuoriStatistiche = true; }
                    if (m.bambino) { x.bambino = m.id; x.bambinoNome = m.nome; x.gruppo = p.id; }
                }
                return x;
            };
            const voceS = Object.assign({}, v, { operatore: String(v.operatore || '').trim() || operatore });
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
                const senza = !(att.target || []).length;
                const prima = t || senza ? P.criterioDi(p, att, t) : null;
                if (t && !t.inizio) t.inizio = b.data;
                const giaIn = controlla.some((c) => c.att === att);
                // con più prese dati: quali erano già a criterio, per avvisare di quelle nuove
                const primaM = misure(att).map((x) => x.mantenimento || !!P.criterioRaggiunto(P.sedute(p, att, t || undefined, x.id), att.criterio));
                if (!giaIn && ((t && t.stato === 'attivo') || senza) && !prima && !att.mantenimento) controlla.push({ att, t: t || null, primaM });
                const attL = m ? attPerVoce(att, k) : att;
                if (P.conAttesa(attL, t)) {
                    // LU contate: entrano nei dati solo a blocchi completi, il resto aspetta
                    const n = +attL.prove, k = P.chiaveAttesa(t, m && m.id), prec = P.inAttesaDi(att, t, m && m.id);
                    const seq = (v.sequenza || '').length === v.v + v.p + v.x ? v.sequenza : 'V'.repeat(v.v) + 'P'.repeat(v.p) + 'X'.repeat(v.x);
                    const { blocchi, resto } = P.dividiLU(prec && prec.seq, seq, n);
                    const testoOggi = [voceS.decisione ? '**' + voceS.decisione + '**' : '', voceS.nota].filter(Boolean).join(' — ');
                    blocchi.forEach((bl, i) => {
                        const ultimo = i === blocchi.length - 1;
                        const vb = Object.assign({}, voceS, P.contaRisposte(bl), { sequenza: bl, nota: '', decisione: '' });
                        const sb = marca(P.seduta(att, t, vb, quando));
                        const note = [];
                        if (i === 0 && prec && prec.seq) {
                            note.push(`LU iniziata il ${formatoData(prec.dal)} (${prec.seq.length} prove) e completata oggi`);
                            (prec.note || []).forEach((x) => note.push(x));
                        }
                        if (ultimo && testoOggi) note.push(testoOggi);
                        if (note.length) sb.note = note.join(' — ');
                        if (i === 0 && prec && prec.dal) sb.iniziata = prec.dal;
                        annotaTD(p, att, sb);
                        nuove.push(sb);
                        p.history = p.history || [];
                        p.history.push(sb);   // la seduta dopo confronta il time delay con questa
                    });
                    att.inAttesa = att.inAttesa || {};
                    if (resto) {
                        att.inAttesa[k] = { seq: resto, dal: blocchi.length ? b.data : ((prec && prec.dal) || b.data),
                            note: blocchi.length ? [] : ((prec && prec.note) || []).concat(testoOggi ? [testoOggi] : []) };
                        attese.push({ nome: att.nome + (m ? ' · ' + m.nome : ''), n: resto.length, di: n });
                    } else delete att.inAttesa[k];
                    if (!Object.keys(att.inAttesa).length) delete att.inAttesa;
                    return;
                }
                s = marca(P.seduta(att, t, voceS, quando));
                annotaTD(p, att, s);
            }
            nuove.push(s);
            p.history = p.history || [];
            p.history.push(s);
        });
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
        timbro('Salvata · ' + formatoData(b.data));
        avviso(`Seduta salvata${attese.length ? ' · in attesa di completare la LU: ' + attese.map((x) => `${x.nome} ${x.n}/${x.di}`).join(', ') : ''}${passati.length ? ' · time delay: ' + passati.join(', ') : ''}`);
        disegna();
        // Criteri raggiunti con questa seduta: si propone il passo successivo
        for (const { att, t, primaM } of controlla) {
            // una presa dati arrivata a criterio, le altre ancora no
            misure(att).forEach((x, i) => {
                if (!primaM[i] && P.criterioRaggiunto(P.sedute(p, att, t || undefined, x.id), att.criterio) && !P.criterioDi(p, att, t)) {
                    const acq = misure(att).filter((y) => !y.mantenimento);
                    const fatte = acq.filter((y) => P.criterioRaggiunto(P.sedute(p, att, t || undefined, y.id), att.criterio)).length;
                    avviso(`${att.nome} · ${x.nome}: a criterio (${fatte} di ${acq.length}). L'attività ci arriva quando ci arrivano tutte.`);
                }
            });
            if (!t) {
                if (P.criterioDi(p, att, null)) avviso(`${att.nome}: criterio raggiunto (${att.criterio.soglia}% per ${att.criterio.sedute} giorni).`);
                continue;
            }
            const data = P.criterioDi(p, att, t);
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
                        const data = P.criterioDi(pp, att, t);
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
    // ---------- schermo: dimensione dell'interfaccia e schermo intero (per dispositivo) ----------
    const SCALE = [['0.9', 'Piccola'], ['1', 'Normale'], ['1.15', 'Grande'], ['1.3', 'Molto grande']];
    const leggiPref = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const scriviPref = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* solo per questa volta */ } };
    function applicaScala() {
        const z = parseFloat(leggiPref('tice_scala') || '1');
        document.documentElement.style.zoom = z && z !== 1 ? String(z) : '';
    }
    const puoSchermoIntero = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    const aSchermoIntero = () => !!document.fullscreenElement;
    function schermoIntero(si) {
        try {
            if (si && !aSchermoIntero()) return document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            if (!si && aSchermoIntero()) return document.exitFullscreen().catch(() => {});
        } catch (e) { /* non disponibile */ }
        return Promise.resolve();
    }
    // Nell'app installata su telefono e tablet lo schermo intero è la scelta di partenza:
    // alcuni browser (Firefox per Android) lasciano le barre di sistema anche con il manifest
    const installata = () => ['fullscreen', 'standalone', 'minimal-ui'].some((m) => window.matchMedia && matchMedia('(display-mode: ' + m + ')').matches);
    const touch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const vuoleSchermoIntero = () => { const v = leggiPref('tice_schermo_intero'); return v === '1' || (v == null && installata() && touch()); };
    // Il browser concede lo schermo intero solo dopo un tocco: si chiede al primo
    // tocco, e di nuovo quando l'app torna in primo piano (Android lo toglie uscendo)
    function schermoInteroAlTocco() {
        if (!puoSchermoIntero()) return;
        const arma = () => {
            if (!vuoleSchermoIntero() || aSchermoIntero()) return;
            document.addEventListener('pointerup', () => { if (vuoleSchermoIntero() && !aSchermoIntero()) schermoIntero(true); }, { capture: true, once: true });
        };
        arma();
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') arma(); });
        document.addEventListener('fullscreenchange', () => { if (!aSchermoIntero()) setTimeout(arma, 300); });
    }
    async function opzioniSchermo() {
        const z = leggiPref('tice_scala') || '1', fs = vuoleSchermoIntero();
        const r = await foglio(h`<form><h2>Schermo</h2>
            <div class="campo"><span>Dimensione dell'interfaccia</span><div class="scelta">
                ${SCALE.map(([v, n]) => h`<label><input type="radio" name="scala" value="${v}" ${v === z ? grezzo('checked') : ''}><span>${n}</span></label>`)}
            </div><span class="sotto piccolo">Vale solo per questo dispositivo: più grande sui telefoni, più piccola sui monitor grandi.</span></div>
            ${puoSchermoIntero() ? h`<label class="spunta-riga"><input type="checkbox" name="intero" ${fs ? grezzo('checked') : ''}> <span><b>Schermo intero</b><br><span class="sotto piccolo">Senza barre del browser e di sistema. Si attiva al primo tocco dopo l'apertura; per uscire, scorri dal bordo dello schermo (o Esc sul computer).</span></span></label>`
                : h`<p class="sotto piccolo">Su questo dispositivo lo schermo intero non è disponibile: aggiungi l'app alla schermata Home per aprirla senza barre del browser.</p>`}
            <div class="bottoni"><button type="button" class="bt" data-foglio="chiudi">Annulla</button><button class="bt primario">Salva</button></div></form>`,
        { dopo: (el) => el.querySelectorAll('[name=scala]').forEach((x) => x.addEventListener('change', () => { document.documentElement.style.zoom = x.value === '1' ? '' : x.value; })) });
        if (!r) { applicaScala(); return; }
        scriviPref('tice_scala', r.scala && r.scala !== '1' ? r.scala : null);
        applicaScala();
        if (puoSchermoIntero()) {
            scriviPref('tice_schermo_intero', r.intero ? '1' : '0');
            await schermoIntero(!!r.intero);
        }
    }
    applicaScala();
    schermoInteroAlTocco();

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
        strumenti: { h, grezzo, icona, foglio, conferma, avviso, barra, vai: (v, pid) => vai(v, pid), paz, pazienti, salvaPaziente, formatoData, T, stampa, statoSeduta, testata, limitato: () => limitato(), banner: () => (EST.banner ? EST.banner() : '') }
    };
    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})();
