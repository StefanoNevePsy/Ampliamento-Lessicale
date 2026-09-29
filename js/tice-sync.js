/**
 * Centro TICE — sincronizzazione con il custode (Drive del centro).
 *
 * Il bambino resta nel database dell'app come sempre; questo modulo lo tiene
 * allineato con il Drive del centro:
 *   - ogni salvataggio di un bambino condiviso lo mette in coda; dopo qualche
 *     secondo viene cifrato con la chiave del centro e inviato;
 *   - se nel frattempo un altro dispositivo l'ha salvato, il custode risponde
 *     "conflitto": si scarica la sua versione, si uniscono le due (tice-unisci)
 *     e si riprova;
 *   - periodicamente si scaricano i bambini cambiati altrove e quelli appena
 *     assegnati; quelli non più assegnati spariscono dal dispositivo.
 * Senza rete si lavora come prima: la coda parte quando la rete torna.
 *
 * Configurazione in tice-config.js: { custodeUrl, googleClientId }. Se manca,
 * l'app funziona solo sul dispositivo, come l'app personale.
 */
(function () {
    'use strict';
    const C = window.TiceCifra, U = window.TiceUnisci;
    const cfgApp = () => window.TICE_CONFIG || {};

    // =====================================================================
    // Accesso con Google: solo un "ID token" (chi sei), nessun accesso a Drive
    // o posta dell'utente. Il custode lo verifica a ogni richiesta.
    // =====================================================================
    const Auth = (function () {
        const K_TOKEN = 'tice:token', K_UTENTE = 'tice:utente';
        let token = null, scadenza = 0, utente = null, gis = null, attesa = null;
        const ascoltatori = [];
        function ErroreAccesso(m) { this.message = m; this.accesso = true; }
        function payload(jwt) {
            try {
                const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            } catch (e) { return null; }
        }
        function imposta(t) {
            const d = payload(t);
            if (!d || !d.email) return false;
            token = t; scadenza = (d.exp || 0) * 1000;
            utente = { email: String(d.email).toLowerCase(), nome: d.given_name || d.name || d.email };
            try { sessionStorage.setItem(K_TOKEN, t); localStorage.setItem(K_UTENTE, JSON.stringify(utente)); } catch (e) { /* ok */ }
            avvisa();
            return true;
        }
        const avvisa = () => ascoltatori.forEach((f) => { try { f(utente); } catch (e) { console.error(e); } });
        const valido = () => !!token && Date.now() < scadenza - 60000;
        function caricaGIS() {
            if (gis) return gis;
            gis = new Promise((ok, ko) => {
                if (window.google && google.accounts && google.accounts.id) return ok();
                const s = document.createElement('script');
                s.src = 'https://accounts.google.com/gsi/client';
                s.async = true;
                s.onload = () => ok();
                s.onerror = () => { gis = null; ko(new ErroreAccesso('Non riesco a raggiungere Google: controlla la connessione.')); };
                document.head.appendChild(s);
            }).then(() => {
                google.accounts.id.initialize({
                    client_id: cfgApp().googleClientId,
                    callback: (r) => { if (r && r.credential && imposta(r.credential) && attesa) { attesa.ok(token); attesa = null; } },
                    auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true, itp_support: true
                });
            });
            return gis;
        }
        function inizia() {
            try {
                const t = sessionStorage.getItem(K_TOKEN);
                if (t) imposta(t);
                if (!utente) { const u = JSON.parse(localStorage.getItem(K_UTENTE) || 'null'); if (u && u.email) utente = u; }
                if (cfgApp().dev) token = sessionStorage.getItem(K_TOKEN + ':dev') || token;
            } catch (e) { /* ok */ }
            if (!cfgApp().dev && cfgApp().googleClientId) caricaGIS().catch(() => { /* offline */ });
            return utente;
        }
        function pulsante(el) {
            if (cfgApp().dev) return Promise.resolve();
            return caricaGIS().then(() => google.accounts.id.renderButton(el, {
                type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'it',
                width: Math.min(320, el.clientWidth || 320)
            }));
        }
        function accessoDev(email, nome) {
            if (!cfgApp().dev) return false;
            email = email.trim().toLowerCase();
            token = 'dev:' + email + '|' + (nome || email.split('@')[0]);
            scadenza = Date.now() + 365 * 86400000;
            utente = { email, nome: nome || email.split('@')[0] };
            try { sessionStorage.setItem(K_TOKEN + ':dev', token); localStorage.setItem(K_UTENTE, JSON.stringify(utente)); } catch (e) { /* ok */ }
            avvisa();
            return true;
        }
        // Token valido; se è scaduto (dura un'ora) prova a rinnovarlo in silenzio.
        function prendi() {
            if (cfgApp().dev) return token ? Promise.resolve(token) : Promise.reject(new ErroreAccesso('Serve l\'accesso.'));
            if (valido()) return Promise.resolve(token);
            return caricaGIS().then(() => new Promise((ok, ko) => {
                attesa = { ok };
                const timer = setTimeout(() => { if (attesa) { attesa = null; ko(new ErroreAccesso('Accesso scaduto: rientra con Google.')); } }, 8000);
                google.accounts.id.prompt((n) => {
                    const saltato = (n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment());
                    if (saltato && attesa) { clearTimeout(timer); attesa = null; ko(new ErroreAccesso('Accesso scaduto: rientra con Google.')); }
                });
            }));
        }
        function invalida() {
            token = null; scadenza = 0;
            try { sessionStorage.removeItem(K_TOKEN); sessionStorage.removeItem(K_TOKEN + ':dev'); } catch (e) { /* ok */ }
        }
        function esci() {
            invalida(); utente = null;
            try { localStorage.removeItem(K_UTENTE); } catch (e) { /* ok */ }
            if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
            avvisa();
        }
        return { inizia, pulsante, accessoDev, token: prendi, utente: () => utente, haToken: () => cfgApp().dev ? !!token : valido(), invalida, esci, alCambio: (f) => ascoltatori.push(f), ErroreAccesso };
    })();

    // =====================================================================
    // Chiamate al custode
    // =====================================================================
    function ErroreRete(m) { this.message = m; this.rete = true; }
    function ErroreCustode(codice, m, extra) { this.codice = codice; this.message = m || codice; this.extra = extra || null; this.custode = true; }
    async function chiama(azione, dati) {
        const url = cfgApp().custodeUrl;
        if (!url) throw new ErroreCustode('non-configurato', 'Il custode non è configurato (tice-config.js).');
        const token = await Auth.token();
        let r;
        try {
            // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
            r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ v: 1, token, azione, dati: dati || {} }), redirect: 'follow', cache: 'no-store' });
        } catch (e) { throw new ErroreRete('Nessuna connessione con il custode.'); }
        if (!r.ok) throw new ErroreRete('Il custode non risponde (HTTP ' + r.status + ').');
        let j;
        try { j = await r.json(); } catch (e) { throw new ErroreRete('Risposta del custode non leggibile.'); }
        if (!j.ok) {
            if (j.errore === 'non-autenticato') { Auth.invalida(); throw new Auth.ErroreAccesso(j.messaggio); }
            throw new ErroreCustode(j.errore, j.messaggio, j.extra);
        }
        return j.dati;
    }

    // =====================================================================
    // Memoria della sincronizzazione (IndexedDB a parte)
    //   pazienti: pid → { version, base }   base = ultima copia sincronizzata
    //   meta: 'coda' → [pid...], 'io' → ultimo profilo, 'cfg' → config chiave
    // =====================================================================
    function apriDb() {
        return new Promise((ok, ko) => {
            const r = indexedDB.open('tice-sync', 1);
            r.onupgradeneeded = () => { r.result.createObjectStore('pazienti'); r.result.createObjectStore('meta'); };
            r.onsuccess = () => ok(r.result);
            r.onerror = () => ko(r.error);
        });
    }
    async function mem(store, modo, fn) {
        const d = await apriDb();
        return new Promise((ok, ko) => {
            const t = d.transaction(store, modo), req = fn(t.objectStore(store));
            t.oncomplete = () => { d.close(); ok(req && req.result); };
            t.onerror = () => { d.close(); ko(t.error); };
        });
    }
    const rec = (pid) => mem('pazienti', 'readonly', (s) => s.get(pid));
    const tuttiRec = () => mem('pazienti', 'readonly', (s) => s.getAll()).then((v) => v || []);
    const scriviRec = (pid, r) => mem('pazienti', 'readwrite', (s) => s.put(Object.assign({ id: pid }, r), pid));
    const togliRec = (pid) => mem('pazienti', 'readwrite', (s) => s.delete(pid));
    const meta = (k) => mem('meta', 'readonly', (s) => s.get(k));
    const scriviMeta = (k, v) => mem('meta', 'readwrite', (s) => s.put(v, k));

    // =====================================================================
    // Stato
    // =====================================================================
    const S = {
        fase: 'spento',     // spento | fuori | chiave | pronto
        io: null, cfg: null, chiave: null,
        condivisi: new Set(), coda: new Set(),
        lavoro: false, errore: null, ultimo: null, etichette: {}
    };
    const ascolta = [];
    function cambiato(cosa) { ascolta.forEach((f) => { try { f(cosa, S); } catch (e) { console.error(e); } }); }
    const pronto = () => S.fase === 'pronto' && !!S.chiave;

    // Salvataggi fatti dalla sincronizzazione stessa: non devono rimettersi in coda
    let daSync = false;
    async function salvaLocale(p) {
        daSync = true;
        try { await DB.savePatient(p); } finally { daSync = false; }
        if (typeof state !== 'undefined') {
            const i = state.patients.findIndex((x) => x.id === p.id);
            if (i >= 0) state.patients[i] = p; else state.patients.push(p);
        }
    }
    async function togliLocale(pid) {
        daSync = true;
        try { await DB.deletePatient(pid); } finally { daSync = false; }
        if (typeof state !== 'undefined') {
            state.patients = state.patients.filter((x) => x.id !== pid);
            if (state.activePatientId === pid) state.activePatientId = null;
        }
        try { localStorage.removeItem('tice_bozza_' + pid); } catch (e) { /* ok */ }
    }
    async function leggiLocale(pid) {
        const tutti = await DB.getAllPatients();
        return tutti.find((x) => x.id === pid) || null;
    }

    // ---------- coda ----------
    let timerCoda = null;
    async function inCoda(pid) {
        S.coda.add(pid);
        await scriviMeta('coda', [...S.coda]);
        cambiato('coda');
        clearTimeout(timerCoda);
        timerCoda = setTimeout(() => sincronizza({ soloCoda: true }), 2500);
    }
    function agganciaDB() {
        if (DB._ticeSync) return;
        DB._ticeSync = true;
        const salva = DB.savePatient.bind(DB), togli = DB.deletePatient.bind(DB);
        DB.savePatient = async (p) => {
            const r = await salva(p);
            if (!daSync && p && S.condivisi.has(p.id)) inCoda(p.id);
            return r;
        };
        DB.deletePatient = async (pid) => {
            const r = await togli(pid);
            if (!daSync && S.condivisi.has(pid)) {
                // Tolto da questo dispositivo: per tutti lo archivia solo un admin
                S.condivisi.delete(pid);
                S.coda.delete(pid);
                await togliRec(pid);
                await scriviMeta('coda', [...S.coda]);
                if (S.io && S.io.permessi && S.io.permessi.eliminaPazienti) {
                    chiama('paziente.archivia', { id: pid }).catch((e) => console.warn('archiviazione', e));
                }
                cambiato('pazienti');
            }
            return r;
        };
    }

    // ---------- cifratura del paziente ----------
    const aadP = (pid) => 'tice:paziente:' + pid;
    const aadE = (pid) => 'tice:etichetta:' + pid;
    async function buste(p) {
        return {
            busta: await C.cifra(S.chiave, S.cfg.kid, p, aadP(p.id)),
            etichetta: await C.cifra(S.chiave, S.cfg.kid, { nome: p.name || '', categoria: p.category || '' }, aadE(p.id))
        };
    }
    const apri = (record) => C.decifra(S.chiave, record.busta, aadP(record.id));

    // ---------- invio ----------
    async function spingi(pid) {
        for (let tentativo = 0; tentativo < 4; tentativo++) {
            const p = await leggiLocale(pid);
            if (!p) { S.coda.delete(pid); return; }
            if (U.assegnaId(p)) await salvaLocale(p);
            const istantanea = U.stabile(p);
            const r = await rec(pid);
            const b = await buste(p);
            try {
                let nuovaVersione;
                if (!r || !r.version) {
                    nuovaVersione = (await chiama('paziente.crea', Object.assign({ id: pid }, b))).version;
                } else {
                    nuovaVersione = (await chiama('paziente.salva', Object.assign({ id: pid, versioneBase: r.version }, b))).version;
                }
                await scriviRec(pid, { version: nuovaVersione, base: JSON.parse(istantanea) });
                // Se intanto il bambino è stato modificato di nuovo, resta in coda
                const ora = await leggiLocale(pid);
                if (!ora || U.stabile(ora) === istantanea) S.coda.delete(pid);
                return;
            } catch (e) {
                if (!(e.custode && e.codice === 'conflitto' && e.extra && e.extra.attuale)) throw e;
                // Un altro dispositivo ha salvato: si unisce e si riprova
                const attuale = e.extra.attuale;
                const remoto = await apri(attuale);
                const unito = U.unisci(r && r.base, p, remoto);
                await salvaLocale(unito);
                await scriviRec(pid, { version: attuale.version, base: remoto });
                cambiato('paziente:' + pid);
            }
        }
        throw new Error('Troppi salvataggi contemporanei su questo bambino: riprovo più tardi.');
    }

    // ---------- ricezione ----------
    async function tira() {
        const elenco = await chiama('pazienti.elenco');
        const visti = new Set();
        const recs = await tuttiRec();
        const perId = {};
        recs.forEach((r) => { perId[r.id] = r; });
        for (const v of elenco) {
            visti.add(v.id);
            try { S.etichette[v.id] = await C.decifra(S.chiave, v.etichetta, aadE(v.id)); } catch (e) { S.etichette[v.id] = { nome: '(illeggibile)' }; }
            const r = perId[v.id];
            if (v.eliminato) {
                if (r || S.condivisi.has(v.id)) { await togliLocale(v.id); await togliRec(v.id); S.condivisi.delete(v.id); cambiato('pazienti'); }
                continue;
            }
            if (r && r.version >= v.version) { S.condivisi.add(v.id); continue; }
            const record = await chiama('paziente.leggi', { id: v.id });
            const remoto = await apri(record);
            const locale = await leggiLocale(v.id);
            let nuovo = remoto;
            if (locale && (S.coda.has(v.id) || !r)) {
                nuovo = U.unisci(r && r.base, locale, remoto);
                if (!U.uguali(nuovo, remoto)) S.coda.add(v.id);
            }
            await salvaLocale(nuovo);
            await scriviRec(v.id, { version: record.version, base: remoto });
            S.condivisi.add(v.id);
            cambiato('paziente:' + v.id);
        }
        // Non più assegnati (o tolti dal custode): la copia locale va via
        for (const r of recs) {
            if (visti.has(r.id)) continue;
            await togliLocale(r.id);
            await togliRec(r.id);
            S.condivisi.delete(r.id);
            S.coda.delete(r.id);
            cambiato('pazienti');
        }
        await scriviMeta('coda', [...S.coda]);
    }

    // ---------- ciclo ----------
    let incorso = null;
    function sincronizza(opz) {
        if (!pronto()) return Promise.resolve(false);
        if (incorso) return incorso.then(() => sincronizza(opz));
        S.lavoro = true; cambiato('stato');
        incorso = (async () => {
            try {
                for (const pid of [...S.coda]) await spingi(pid);
                await scriviMeta('coda', [...S.coda]);
                if (!(opz && opz.soloCoda)) await tira();
                for (const pid of [...S.coda]) await spingi(pid);   // quanto unito in ricezione
                await scriviMeta('coda', [...S.coda]);
                S.errore = null;
                S.ultimo = new Date().toISOString();
                return true;
            } catch (e) {
                gestisciErrore(e);
                return false;
            } finally {
                S.lavoro = false; incorso = null; cambiato('stato');
            }
        })();
        return incorso;
    }
    function gestisciErrore(e) {
        console.warn('sincronizzazione', e);
        if (e && e.accesso) { S.errore = e.message; S.fase = 'fuori'; }
        else if (e && e.custode && ['non-autorizzato', 'disattivato', 'scaduto'].includes(e.codice)) {
            // Accesso tolto o scaduto: i dati del centro non restano su questo dispositivo
            S.errore = null; S.fase = 'fuori'; S.negato = e.message;
            cancellaDatiCentro().then(() => cambiato('pazienti')).catch((x) => console.error(x));
        }
        else S.errore = (e && e.message) || String(e);
    }
    async function cancellaDatiCentro() {
        for (const r of await tuttiRec()) { await togliLocale(r.id); await togliRec(r.id); }
        S.condivisi.clear(); S.coda.clear();
        await scriviMeta('coda', []);
        await scriviMeta('io', null);
        await C.dimenticaChiave();
        S.chiave = null; S.io = null;
    }

    // ---------- avvio, accesso, chiave ----------
    async function preparaCentro() {
        S.io = await chiama('io');
        await scriviMeta('io', S.io);
        S.cfg = S.io.cifratura ? await chiama('cifratura.leggi') : null;
        await scriviMeta('cfg', S.cfg);
        S.chiave = S.cfg ? await C.chiaveRicordata(S.cfg) : null;
        S.negato = null;
        S.fase = S.chiave ? 'pronto' : 'chiave';
        cambiato('stato');
        if (S.fase === 'pronto') sincronizza();
    }
    async function avvia() {
        if (!cfgApp().custodeUrl) { S.fase = 'spento'; cambiato('stato'); return; }
        agganciaDB();
        S.coda = new Set((await meta('coda')) || []);
        (await tuttiRec()).forEach((r) => S.condivisi.add(r.id));
        const u = Auth.inizia();
        if (!u) { S.fase = 'fuori'; cambiato('stato'); return; }
        // Senza rete si lavora con quanto già noto: profilo e chiave ricordati
        S.io = await meta('io');
        S.cfg = await meta('cfg');
        S.chiave = S.cfg ? await C.chiaveRicordata(S.cfg) : null;
        S.fase = S.io && S.io.email === u.email ? (S.chiave ? 'pronto' : 'chiave') : 'fuori';
        cambiato('stato');
        try { await preparaCentro(); } catch (e) { gestisciErrore(e); cambiato('stato'); }
        setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false) sincronizza(); }, 90000);
        window.addEventListener('online', () => sincronizza());
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizza({ soloCoda: false }); });
    }
    Auth.alCambio(async (u) => {
        if (!u) return;
        if (S.fase === 'fuori' || (S.io && S.io.email !== u.email)) {
            try { await preparaCentro(); } catch (e) { gestisciErrore(e); cambiato('stato'); }
        }
    });

    async function creaChiave(frase, preparata) {
        const { cfg, chiave } = preparata || await C.nuovaConfigurazione(frase);
        S.cfg = await chiama('cifratura.imposta', { cifratura: cfg });
        await C.ricordaChiave(chiave, S.cfg);
        await scriviMeta('cfg', S.cfg);
        S.chiave = chiave;
        S.io.cifratura = true;
        S.fase = 'pronto';
        cambiato('stato');
        sincronizza();
    }
    async function inserisciChiave(frase) {
        if (!S.cfg) S.cfg = await chiama('cifratura.leggi');
        const chiave = await C.apriConFrase(frase, S.cfg);
        await C.ricordaChiave(chiave, S.cfg);
        await scriviMeta('cfg', S.cfg);
        S.chiave = chiave;
        S.fase = 'pronto';
        cambiato('stato');
        sincronizza();
    }
    /** Porta sul Drive del centro un bambino che finora era solo su questo dispositivo. */
    async function condividi(pid) {
        if (!pronto()) throw new Error('Prima accedi e inserisci la chiave del centro.');
        S.condivisi.add(pid);
        await scriviRec(pid, { version: 0, base: null });
        await inCoda(pid);
        return sincronizza({ soloCoda: true });
    }
    async function esci(cancellaDati) {
        if (cancellaDati) await cancellaDatiCentro();
        await scriviMeta('io', null);
        Auth.esci();
        S.io = null; S.fase = 'fuori';
        cambiato('stato'); cambiato('pazienti');
    }
    /** Riporta un bambino a una versione precedente (diventa la versione attuale). */
    async function ripristina(pid, version) {
        await sincronizza();
        const vecchia = await apri(await chiama('paziente.versione', { id: pid, version }));
        await salvaLocale(vecchia);
        await inCoda(pid);
        await sincronizza({ soloCoda: true });
        cambiato('paziente:' + pid);
    }
    async function versioni(pid) { return chiama('paziente.versioni', { id: pid }); }
    async function anteprimaVersione(pid, version) { return apri(await chiama('paziente.versione', { id: pid, version })); }

    window.TiceSync = {
        S, Auth, chiama, ErroreRete, ErroreCustode,
        avvia, sincronizza, condividi, esci, creaChiave, inserisciChiave, ripristina, versioni, anteprimaVersione,
        attivo: () => !!cfgApp().custodeUrl,
        pronto, condiviso: (pid) => S.condivisi.has(pid), inAttesa: (pid) => S.coda.has(pid),
        puo: (cosa) => !S.io || !S.io.permessi || !!S.io.permessi[cosa],
        alCambio: (f) => ascolta.push(f)
    };
})();
