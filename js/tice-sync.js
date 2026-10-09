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
        // App desktop: l'accesso passa dal browser di sistema (electron/accesso-google.js),
        // perché Google non lo consente dentro la finestra dell'app.
        const nativo = () => !!(window.ticeNativo && cfgApp().googleDesktopClientId);
        const cfgNativo = () => ({ clientId: cfgApp().googleDesktopClientId, clientSecret: cfgApp().googleDesktopClientSecret || '' });
        async function accediNativo() {
            const r = await window.ticeNativo.accedi(cfgNativo());
            if (!r || !imposta(r.idToken)) throw new ErroreAccesso('Accesso non riuscito.');
            return token;
        }
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
        // App installata (PWA) su telefono: il pulsante di Google apre una finestrella che
        // lì resta bianca. Si usa invece il giro classico: si va alla pagina di Google e
        // si torna qui con il token nell'indirizzo (#id_token=…), che si legge e si cancella.
        const installata = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; } catch (e) { return false; } };
        const K_NONCE = 'tice:nonce';
        const indirizzoRitorno = () => location.origin + location.pathname.replace(/index\.html$/, '');
        function accediRitorno() {
            const b = new Uint8Array(16); crypto.getRandomValues(b);
            const nonce = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
            try { localStorage.setItem(K_NONCE, nonce); } catch (e) { /* ok */ }
            const q = new URLSearchParams({ client_id: cfgApp().googleClientId, redirect_uri: indirizzoRitorno(), response_type: 'id_token',
                scope: 'openid email profile', nonce, prompt: 'select_account' });
            if (utente && utente.email) q.set('login_hint', utente.email);
            location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
        }
        function leggiRitorno() {
            const h = location.hash || '';
            if (!/(^#|&)(id_token|error)=/.test(h)) return;
            const q = new URLSearchParams(h.slice(1));
            try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ok */ }
            let nonce = null;
            try { nonce = localStorage.getItem(K_NONCE); localStorage.removeItem(K_NONCE); } catch (e) { /* ok */ }
            const t = q.get('id_token'), d = t && payload(t);
            if (t && d && nonce && d.nonce === nonce && d.aud === cfgApp().googleClientId) imposta(t);
        }
        function inizia() {
            if (!cfgApp().dev && cfgApp().googleClientId) leggiRitorno();
            try {
                const t = !token && sessionStorage.getItem(K_TOKEN);
                if (t) imposta(t);
                if (!utente) { const u = JSON.parse(localStorage.getItem(K_UTENTE) || 'null'); if (u && u.email) utente = u; }
                if (cfgApp().dev) token = sessionStorage.getItem(K_TOKEN + ':dev') || token;
            } catch (e) { /* ok */ }
            if (!cfgApp().dev && cfgApp().googleClientId && !nativo()) caricaGIS().catch(() => { /* offline */ });
            return utente;
        }
        function pulsante(el) {
            if (cfgApp().dev) return Promise.resolve();
            if (nativo()) {
                el.innerHTML = '<button type="button" class="bt primario"><i class="fa-brands fa-google"></i> Accedi con Google</button>' +
                    '<p class="sotto piccolo" style="margin:8px 0 0">Si apre il browser: dopo l\'accesso torna da solo qui.</p>';
                el.querySelector('button').onclick = () => {
                    el.querySelector('p').textContent = 'Completa l\'accesso nel browser…';
                    accediNativo().catch((e) => { el.querySelector('p').textContent = e.message; });
                };
                return Promise.resolve();
            }
            if (installata()) {
                el.innerHTML = '<button type="button" class="bt primario"><i class="fa-brands fa-google"></i> Accedi con Google</button>';
                el.querySelector('button').onclick = accediRitorno;
                return Promise.resolve();
            }
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
            if (nativo()) {
                return window.ticeNativo.token(cfgNativo()).then((r) => {
                    if (r && imposta(r.idToken)) return token;
                    throw new ErroreAccesso('Accesso scaduto: rientra con Google.');
                }, (e) => { if (e && e.accesso) throw e; throw new Error('Non riesco a rinnovare l\'accesso: controlla la connessione.'); });
            }
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
            if (nativo()) window.ticeNativo.esci().catch(() => {});
            avvisa();
        }
        return { inizia, pulsante, accessoDev, token: prendi, utente: () => utente, haToken: () => cfgApp().dev ? !!token : valido(), invalida, esci, alCambio: (f) => ascoltatori.push(f), ErroreAccesso };
    })();

    // =====================================================================
    // Chiamate al custode
    // =====================================================================
    function ErroreRete(m) { this.message = m; this.rete = true; }
    function ErroreCustode(codice, m, extra) { this.codice = codice; this.message = m || codice; this.extra = extra || null; this.custode = true; }
    const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const nuovoRid = () => {
        const b = new Uint8Array(12);
        crypto.getRandomValues(b);
        return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    };
    // Apps Script ogni tanto perde la risposta (404 "unable to open the file"),
    // risponde con una pagina d'errore o e' occupato: si riprova da soli.
    // Ogni chiamata ha un identificativo che resta uguale nei tentativi, cosi'
    // se l'azione era gia' stata fatta il custode restituisce la risposta di
    // allora invece di rifarla.
    const RIPETIBILE = (e) => (e && e.rete) || (e && e.custode && (e.codice === 'occupato' || e.codice === 'interno'));
    const ATTESE = [1500, 4000, 9000, 15000];
    // Letture e registrazioni brevi: Apps Script risponde in pochi secondi, quindi
    // se una risposta si perde per strada non si aspettano minuti prima di riprovare.
    // Le scritture pesanti (salvataggi, materiali, cambio chiave) tengono il margine lungo.
    const BREVI = new Set(['io', 'pazienti.elenco', 'pazienti.leggi', 'paziente.leggi', 'dispositivo.registra', 'dispositivo.chiave',
        'dispositivi.elenco', 'modalita.leggi', 'turni.leggi', 'cifratura.leggi', 'paziente.versioni', 'paziente.versione', 'accessi.leggi']);
    async function chiama(azione, dati, opzioni) {
        const o = Object.assign({ attesaMax: BREVI.has(azione) ? 45000 : undefined }, opzioni || {});
        const tentativi = o.tentativi || 4, rid = nuovoRid();
        for (let n = 1; ; n++) {
            try { return await chiamaUnaVolta(azione, dati, rid, o.attesaMax); }
            catch (e) {
                const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
                if (!RIPETIBILE(e) || offline || n >= tentativi) throw e;
                if (o.suTentativo) { try { o.suTentativo(n + 1, tentativi, e); } catch (x) { /* solo avviso */ } }
                const base = ATTESE[Math.min(n - 1, ATTESE.length - 1)];
                await attendi(base + Math.random() * base * 0.3);
            }
        }
    }
    async function chiamaUnaVolta(azione, dati, rid, attesaMax) {
        const url = cfgApp().custodeUrl;
        if (!url) throw new ErroreCustode('non-configurato', 'Il custode non è configurato (tice-config.js).');
        const token = await Auth.token();
        // Apps Script chiude ogni esecuzione dopo 6 minuti: oltre non arriva piu' niente
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), attesaMax || 330000) : null;
        let r, testo;
        try {
            // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
            r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ v: 1, token, azione, rid, dati: dati || {} }), redirect: 'follow', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
            // Apps Script consegna il risultato del POST da un indirizzo temporaneo:
            // se si perde solo quella consegna, la si richiede (GET) senza rifare il POST
            let consegna = null;
            try { const u = new URL(r.url); if (r.redirected && u.protocol === 'https:' && u.hostname === 'script.googleusercontent.com') consegna = u.href; } catch (e) { /* niente consegna */ }
            for (let t = 0; consegna && [404, 429, 500, 502, 503, 504].includes(r.status) && t < 3; t++) {
                await attendi(600 * (t + 1));
                r = await fetch(consegna, { method: 'GET', redirect: 'follow', cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined });
            }
            testo = r.ok ? await r.text() : '';
        } catch (e) {
            throw new ErroreRete(e && e.name === 'AbortError' ? 'Il custode non ha risposto in tempo.' : 'Nessuna connessione con il custode.');
        } finally { if (timer) clearTimeout(timer); }
        if (!r.ok) throw new ErroreRete('Il custode non risponde (HTTP ' + r.status + ').');
        let j;
        try { j = JSON.parse(testo); } catch (e) { throw new ErroreRete('Risposta del custode non leggibile.'); }
        if (!j || typeof j !== 'object') throw new ErroreRete('Risposta del custode non leggibile.');
        if (!j.ok) {
            if (j.errore === 'non-autenticato') { Auth.invalida(); throw new Auth.ErroreAccesso(j.messaggio); }
            throw new ErroreCustode(j.errore, j.messaggio, j.extra);
        }
        // la risposta di "sono attivo" (GET): la richiesta non è arrivata, si riprova
        if (!('dati' in j)) throw new ErroreRete('Il custode non ha ricevuto la richiesta: riprovo.');
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
        fase: 'spento',     // spento | fuori | chiave (admin: frase) | attesa (chiave in arrivo) | pronto
        io: null, cfg: null, chiave: null, chiavi: {}, dispositivi: null,
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
    // Ogni busta dice con quale chiave è cifrata: dopo un cambio di chiave le
    // versioni vecchie si aprono con quella di allora (solo sui dispositivi admin).
    function chiavePer(busta) {
        const k = busta && S.chiavi[busta.kid];
        if (k) return k;
        const e = new Error('Questi dati sono cifrati con una chiave del centro precedente, che questo dispositivo non ha.');
        e.senzaChiave = busta && busta.kid;
        throw e;
    }
    const apri = async (record) => C.decifra(chiavePer(record.busta), record.busta, aadP(record.id));

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
    // Il custode legge più bambini per richiesta; uno alla volta se è di una versione precedente
    async function applicaRemoto(record, r) {
        let remoto;
        try { remoto = await apri(record); }
        catch (e) { if (e.senzaChiave) { S.condivisi.add(record.id); return; } throw e; }   // in ricifratura: si riprova dopo
        const locale = await leggiLocale(record.id);
        let nuovo = remoto;
        if (locale && (S.coda.has(record.id) || !r)) {
            nuovo = U.unisci(r && r.base, locale, remoto);
            if (!U.uguali(nuovo, remoto)) S.coda.add(record.id);
        }
        await salvaLocale(nuovo);
        await scriviRec(record.id, { version: record.version, base: remoto });
        S.condivisi.add(record.id);
        cambiato('paziente:' + record.id);
    }
    let leggeAGruppi = true;
    async function leggiRecord(ids) {
        if (leggeAGruppi) {
            try { return await chiama('pazienti.leggi', { ids }); }
            catch (e) { if (!(e && e.custode && e.codice === 'richiesta-non-valida' && /Azione sconosciuta/.test(e.message))) throw e; leggeAGruppi = false; }
        }
        return [await chiama('paziente.leggi', { id: ids[0] })];
    }
    async function tira() {
        const elenco = await chiama('pazienti.elenco');
        const visti = new Set();
        const recs = await tuttiRec();
        const perId = {};
        recs.forEach((r) => { perId[r.id] = r; });
        const daLeggere = [];
        for (const v of elenco) {
            visti.add(v.id);
            try { S.etichette[v.id] = await C.decifra(chiavePer(v.etichetta), v.etichetta, aadE(v.id)); } catch (e) { S.etichette[v.id] = { nome: '(in attesa della chiave)' }; }
            const r = perId[v.id];
            if (v.eliminato) {
                if (r || S.condivisi.has(v.id)) { await togliLocale(v.id); await togliRec(v.id); S.condivisi.delete(v.id); cambiato('pazienti'); }
                continue;
            }
            if (r && r.version >= v.version) { S.condivisi.add(v.id); continue; }
            daLeggere.push(v.id);
        }
        // a gruppi: con molti bambini (primo accesso) sono poche richieste invece di una per bambino
        S.scaricati = { fatti: 0, totale: daLeggere.length };
        if (daLeggere.length) cambiato('stato');
        try {
            let resto = daLeggere.slice();
            while (resto.length) {
                const gruppo = resto.slice(0, 25);
                const arrivati = await leggiRecord(gruppo);
                for (const record of arrivati) await applicaRemoto(record, perId[record.id]);
                // il custode risponde nell'ordine chiesto, salta chi non c'è più e si ferma a risposta piena:
                // fino all'ultimo arrivato sono tutti sistemati, gli altri si chiedono al giro dopo
                const ultimo = arrivati.length ? gruppo.indexOf(arrivati[arrivati.length - 1].id) : -1;
                resto = resto.slice(ultimo < 0 ? gruppo.length : ultimo + 1);
                S.scaricati.fatti = daLeggere.length - resto.length;
                cambiato('stato');
            }
        } finally { S.scaricati = null; cambiato('stato'); }
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
    let ultimiControlli = 0;
    function sincronizza(opz) {
        if (!pronto()) return Promise.resolve(false);
        if (incorso) return incorso.then(() => sincronizza(opz));
        S.lavoro = true; cambiato('stato');
        incorso = (async () => {
            try {
                // Ruolo, chiave attuale: possono essere cambiati da un'altra parte
                if (!(opz && opz.soloCoda)) {
                    const io = await chiama('io');
                    if (!io || typeof io !== 'object') throw new ErroreRete('Risposta del custode incompleta.');
                    S.io = io; await scriviMeta('io', io);
                    if (!S.cfg || io.kid !== S.cfg.kid) { await preparaCentro(true); if (!pronto()) return false; }
                }
                for (const pid of [...S.coda]) await spingi(pid);
                await scriviMeta('coda', [...S.coda]);
                if (!(opz && opz.soloCoda)) await tira();
                for (const pid of [...S.coda]) await spingi(pid);   // quanto unito in ricezione
                await scriviMeta('coda', [...S.coda]);
                // dispositivi in attesa della chiave e dizionario delle modalità cambiano di rado:
                // si chiedono all'accesso e poi ogni 10 minuti, non a ogni sincronizzazione
                if (!(opz && opz.soloCoda)) {
                    const aspetta = S.io && S.io.inAttesa;
                    if (aspetta > 0 || (aspetta === undefined && Date.now() - ultimiControlli > 600000)) await consegnaChiavi();
                    if (Date.now() - ultimiControlli > 600000) { ultimiControlli = Date.now(); await leggiModalita(); }
                }
                S.errore = null;
                S.ultimo = new Date().toISOString();
                return true;
            } catch (e) {
                if (e && e.custode && e.codice === 'chiave-cambiata') {
                    // un admin ha cambiato la chiave: si prende la nuova e si riprova al giro dopo
                    try { await preparaCentro(true); } catch (x) { gestisciErrore(x); }
                    return false;
                }
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
        else if (e && e.custode && NEGATI.includes(e.codice)) {
            S.errore = null; S.fase = 'fuori'; S.negato = e.message;
            confermaNegato(e.codice);
        }
        else S.errore = (e && e.message) || String(e);
    }
    // Accesso tolto o scaduto: i dati del centro non restano su questo
    // dispositivo. Ma una sola risposta non basta: si richiede al custode chi
    // sei e si cancella solo se lo conferma; altrimenti (era un intoppo) si
    // riparte da soli. Un nuovo accesso aspetta che la cancellazione finisca.
    const NEGATI = ['non-autorizzato', 'disattivato', 'scaduto'];
    let verifica = null, pulizia = null;
    function confermaNegato(codice) {
        if (verifica) return verifica;
        verifica = (async () => {
            await attendi(2500);
            let ancora = false;
            try { await chiama('io'); } catch (e) { ancora = !!(e && e.custode && NEGATI.includes(e.codice)); if (!ancora) throw e; }
            if (ancora) {
                pulizia = cancellaDatiCentro().finally(() => { pulizia = null; });
                await pulizia;
                S.fase = 'fuori';
                cambiato('pazienti'); cambiato('stato');
            } else await preparaCentro();
        })().catch((e) => console.warn('verifica dell\'accesso', codice, e)).finally(() => { verifica = null; });
        return verifica;
    }
    // Accesso a tempo: passata la data, i dati del centro lasciano il dispositivo
    // anche senza rete (il custode intanto ha già revocato la chiave)
    const oggiQui = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    async function controllaScadenza() {
        const sc = S.io && S.io.scadenza;
        if (!sc || oggiQui() <= sc || pulizia) return false;
        pulizia = cancellaDatiCentro().finally(() => { pulizia = null; });
        await pulizia;
        S.fase = 'fuori';
        S.negato = 'Il tuo accesso è scaduto il ' + sc.split('-').reverse().join('/') + ': i dati del centro sono stati tolti da questo dispositivo.';
        cambiato('pazienti'); cambiato('stato');
        return true;
    }
    async function cancellaDatiCentro() {
        for (const r of await tuttiRec()) { await togliLocale(r.id); await togliRec(r.id); }
        S.condivisi.clear(); S.coda.clear();
        await scriviMeta('coda', []);
        await scriviMeta('io', null);
        await C.dimenticaTutto();
        S.chiave = null; S.chiavi = {}; S.io = null;
    }

    // ---------- chiave del centro su questo dispositivo ----------
    const eAdmin = () => !!(S.io && S.io.permessi && S.io.permessi.gestisciAccessi);
    function nomeDispositivo() {
        const ua = navigator.userAgent || '';
        const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
        const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
        const tipo = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobile|iPhone/.test(ua) ? 'telefono' : 'computer';
        return `${br} · ${so || '?'} · ${tipo}`;
    }
    /** Chiede al custode la chiave consegnata a questo dispositivo da un admin. */
    async function ottieniChiave() {
        const d = await C.dispositivo();
        await chiama('dispositivo.registra', { id: d.id, nome: nomeDispositivo(), pubblica: d.pubblica });
        const r = await chiama('dispositivo.chiave', { id: d.id });
        const busta = S.cfg && r.chiavi && r.chiavi[S.cfg.kid];
        if (!busta) return false;
        // Gli admin la ricevono esportabile (per consegnarla ad altri), gli altri no;
        // chi non è admin tiene solo la chiave attuale.
        const k = await C.riceviChiave(busta, d.privata, eAdmin());
        await C.ricordaChiave(S.cfg.kid, k, !eAdmin());
        S.chiavi = await C.portachiavi();
        return true;
    }
    function aggiornaFase() {
        S.chiave = S.cfg ? S.chiavi[S.cfg.kid] || null : null;
        // senza sapere chi sei non si entra
        if (!S.io) { S.fase = 'fuori'; return; }
        S.fase = S.chiave ? 'pronto' : (eAdmin() ? 'chiave' : 'attesa');
    }
    /** Gli admin consegnano la chiave ai dispositivi delle persone abilitate che la aspettano. */
    async function consegnaChiavi() {
        if (!eAdmin() || !S.chiave || !S.chiave.extractable) return 0;
        const el = await chiama('dispositivi.elenco');
        S.dispositivi = el;
        let n = 0;
        for (const d of el) {
            if (d.abilitato || !d.personaAbilitata) continue;
            try {
                const busta = await C.consegnaA(d.pubblica, S.chiave);
                await chiama('dispositivi.abilita', { id: d.id, kid: S.cfg.kid, chiave: busta, pubblica: d.pubblica });
                d.abilitato = true;
                n++;
            } catch (e) { console.warn('consegna della chiave', d.id, e); }
        }
        if (n) cambiato('dispositivi');
        return n;
    }

    // ---------- avvio, accesso, chiave ----------
    async function preparaCentro(senzaSincronizzare) {
        if (pulizia) await pulizia.catch(() => {});
        S.io = await chiama('io');
        await scriviMeta('io', S.io);
        leggiModalita().catch(() => {});
        S.cfg = !S.io.cifratura ? null : S.io.cfg !== undefined ? S.io.cfg : await chiama('cifratura.leggi');
        await scriviMeta('cfg', S.cfg);
        S.chiavi = await C.portachiavi();
        S.negato = null;
        aggiornaFase();
        if (S.cfg && !S.chiave) { await ottieniChiave(); aggiornaFase(); }
        else if (S.cfg) C.dispositivo().then((d) => chiama('dispositivo.registra', { id: d.id, nome: nomeDispositivo(), pubblica: d.pubblica })).catch(() => {});
        cambiato('stato');
        if (S.fase === 'pronto' && !senzaSincronizzare) sincronizza();
    }
    // I giri periodici partono subito, anche prima dell'accesso: al primo accesso
    // su un dispositivo nuovo devono già esserci (chiave da ricevere, prima sincronizzazione)
    function avviaCicli() {
        setInterval(() => {
            controllaScadenza();
            if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
            if (S.fase === 'attesa' || S.fase === 'chiave') return;   // la chiave si controlla più spesso, qui sotto
            sincronizza();
        }, 90000);
        // In attesa della chiave: si ricontrolla ogni 15 secondi (poi ogni minuto),
        // anche sui dispositivi degli amministratori, che possono anche inserirla a mano
        let controlli = 0, controllando = false;
        setInterval(() => {
            if ((S.fase !== 'attesa' && S.fase !== 'chiave') || controllando) return;
            if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
            if (++controlli > 40 && controlli % 4) return;
            controllando = true;
            preparaCentro().catch(gestisciErrore).finally(() => { controllando = false; });
        }, 15000);
        window.addEventListener('online', () => sincronizza());
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizza({ soloCoda: false }); });
    }
    async function avvia() {
        if (!cfgApp().custodeUrl) { S.fase = 'spento'; cambiato('stato'); return; }
        agganciaDB();
        avviaCicli();
        S.coda = new Set((await meta('coda')) || []);
        (await tuttiRec()).forEach((r) => S.condivisi.add(r.id));
        const u = Auth.inizia();
        if (!u) { S.fase = 'fuori'; cambiato('stato'); return; }
        // Senza rete si lavora con quanto già noto: profilo e chiave ricordati
        S.io = await meta('io');
        S.cfg = await meta('cfg');
        S.modalita = (await meta('modalita')) || null;
        S.chiavi = await C.portachiavi();
        if (S.io && S.io.email === u.email) aggiornaFase(); else S.fase = 'fuori';
        await controllaScadenza();
        cambiato('stato');
        try { await preparaCentro(); } catch (e) { gestisciErrore(e); cambiato('stato'); }
    }
    Auth.alCambio(async (u) => {
        if (!u) return;
        if (S.fase === 'fuori' || (S.io && S.io.email !== u.email)) {
            try { await preparaCentro(); } catch (e) { gestisciErrore(e); cambiato('stato'); }
        }
    });

    /** Prima configurazione (admin): la frase la conoscono solo gli admin. */
    async function creaChiave(frase, preparata) {
        const { cfg, chiave } = preparata || await C.nuovaConfigurazione(frase, true);
        S.cfg = await chiama('cifratura.imposta', { cifratura: cfg });
        await C.ricordaChiave(S.cfg.kid, chiave);
        await C.salvaFrase(frase);
        await scriviMeta('cfg', S.cfg);
        S.chiavi = await C.portachiavi();
        S.io.cifratura = true; S.io.kid = S.cfg.kid;
        aggiornaFase();
        cambiato('stato');
        sincronizza();
    }
    /** Solo admin: la frase attuale, o quella di una chiave precedente per le versioni vecchie. */
    async function inserisciChiave(frase, kid) {
        if (!S.cfg) S.cfg = await chiama('cifratura.leggi');
        const c = kid && kid !== S.cfg.kid ? (S.cfg.precedenti || []).find((x) => x.kid === kid) : S.cfg;
        if (!c) throw new Error('Chiave sconosciuta.');
        const chiave = await C.apriConFrase(frase, c, true);
        await C.ricordaChiave(c.kid, chiave);
        if (c === S.cfg) await C.salvaFrase(frase);
        await scriviMeta('cfg', S.cfg);
        S.chiavi = await C.portachiavi();
        aggiornaFase();
        cambiato('stato');
        sincronizza();
    }
    /**
     * Cambio della chiave del centro (admin): chi aveva la vecchia non apre più
     * niente di nuovo. Tutti i bambini vengono ricifrati con la nuova; i
     * dispositivi abilitati la ricevono di nuovo, quelli tolti no.
     */
    async function cambiaChiave(frase, preparata, avanzamento) {
        if (!eAdmin()) throw new Error('Solo un amministratore può cambiare la chiave.');
        await sincronizza();
        const vecchia = S.cfg.kid;
        const cfg = await chiama('cifratura.imposta', { cifratura: preparata.cfg, sostituisci: true, kidAttuale: vecchia });
        S.cfg = cfg;
        await scriviMeta('cfg', cfg);
        await C.ricordaChiave(cfg.kid, preparata.chiave);
        await C.salvaFrase(frase);
        S.chiavi = await C.portachiavi();
        aggiornaFase();
        cambiato('stato');
        const elenco = await chiama('pazienti.elenco');
        let i = 0, saltati = 0;
        for (const v of elenco) {
            if (avanzamento) avanzamento(++i, elenco.length);
            for (let t = 0; t < 4; t++) {
                const r0 = await chiama('paziente.leggi', { id: v.id });
                if (r0.busta.kid === cfg.kid) break;
                let p;
                try { p = await apri(r0); } catch (e) { if (e.senzaChiave) { saltati++; break; } throw e; }
                const b = await buste(p);
                try {
                    const r = await chiama('paziente.salva', Object.assign({ id: v.id, versioneBase: r0.version }, b));
                    if (await rec(v.id)) await scriviRec(v.id, { version: r.version, base: p });
                    break;
                } catch (e) { if (!(e.custode && e.codice === 'conflitto')) throw e; }
            }
        }
        await consegnaChiavi();
        cambiato('stato');
        return { bambini: elenco.length, saltati };
    }
    const mostraFrase = () => (eAdmin() ? C.frase() : Promise.resolve(null));
    // Dizionario delle modalità del centro (nomi dei programmi nei quaderni →
    // modalità e categorie). Un custode non ancora aggiornato non lo conosce:
    // allora resta quello di serie e lo si dice a chi prova a modificarlo.
    async function leggiModalita() {
        try {
            const d = await chiama('modalita.leggi', {}, { tentativi: 1 });
            S.modalitaAssenti = false;
            if (!S.modalita || d.version !== S.modalita.version) { S.modalita = d; await scriviMeta('modalita', d); cambiato('modalita'); }
        } catch (e) {
            if (e && e.custode && e.codice === 'richiesta-non-valida') S.modalitaAssenti = true;
        }
        return S.modalita;
    }
    async function aggiornaModalita(aggiunte) {
        if (S.modalitaAssenti) throw new ErroreCustode('da-aggiornare', 'Il custode del centro va aggiornato per condividere le modalità.');
        const d = await chiama('modalita.aggiorna', aggiunte);
        S.modalita = d; await scriviMeta('modalita', d); cambiato('modalita');
        return d;
    }

    // Turni: una busta per settimana (chiave = lunedì) e una per le persone.
    // Si legge l'ultima versione, si applica la modifica, si salva; se nel
    // frattempo qualcuno ha salvato si rilegge e si riapplica.
    const aadT = (k) => 'tice:turni:' + k;
    async function leggiTurni(k) {
        try {
            const r = await chiama('turni.leggi', { chiave: k }, { tentativi: 2 });
            if (r.busta && !S.chiavi[r.busta.kid]) {
                throw new Error(S.chiave ? 'Questi turni sono cifrati con una chiave del centro precedente, che questo dispositivo non ha.'
                    : 'La chiave del centro non è ancora arrivata su questo dispositivo: la consegna un amministratore aprendo l\'app.');
            }
            const dati = r.busta ? await C.decifra(chiavePer(r.busta), r.busta, aadT(k)) : null;
            const x = { version: r.version || 0, dati, aggiornatoDa: r.aggiornatoDa || null };
            await scriviMeta('turni:' + k, x);
            return x;
        } catch (e) {
            if (e && e.custode && e.codice === 'richiesta-non-valida' && /sconosciuta/i.test(e.message)) {
                throw new ErroreCustode('da-aggiornare', 'Il custode del centro va aggiornato per usare i turni.');
            }
            // senza rete: l'ultima copia vista su questo dispositivo
            const vecchia = await meta('turni:' + k);
            if (vecchia && (e.rete || (typeof navigator !== 'undefined' && navigator.onLine === false))) return Object.assign({ offline: true }, vecchia);
            throw e;
        }
    }
    async function modificaTurni(k, fn) {
        if (!S.chiave || !S.cfg) throw new Error('Manca la chiave del centro su questo dispositivo.');
        for (let i = 0; i < 5; i++) {
            const cur = await leggiTurni(k);
            if (cur.offline) throw new ErroreRete('Senza connessione i turni si possono solo guardare.');
            const nuovo = fn(cur.dati ? JSON.parse(JSON.stringify(cur.dati)) : null);
            const busta = await C.cifra(S.chiave, S.cfg.kid, nuovo, aadT(k));
            try {
                const r = await chiama('turni.salva', { chiave: k, busta, versioneBase: cur.version });
                await scriviMeta('turni:' + k, { version: r.version, dati: nuovo });
                cambiato('turni');
                return nuovo;
            } catch (e) {
                if (!(e.custode && e.codice === 'conflitto')) throw e;
            }
        }
        throw new Error('Troppe modifiche contemporanee ai turni: riprova.');
    }

    async function dispositivi() { S.dispositivi = await chiama('dispositivi.elenco'); return S.dispositivi; }
    async function togliDispositivo(id) { await chiama('dispositivo.togli', { id }); return dispositivi(); }
    /** Porta sul Drive del centro un bambino che finora era solo su questo dispositivo. */
    async function condividi(pid) {
        if (!pronto()) throw new Error('Questo dispositivo non ha ancora la chiave del centro.');
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
        avvia, sincronizza, condividi, esci, creaChiave, inserisciChiave, cambiaChiave, mostraFrase, dispositivi, togliDispositivo,
        ripristina, versioni, anteprimaVersione, preparaCentro, eAdmin, leggiModalita, aggiornaModalita, leggiTurni, modificaTurni,
        // l'ultima copia dei turni vista su questo dispositivo, subito (senza rete)
        turniRicordati: async (k) => { try { const x = await meta('turni:' + k); return x && x.dati !== undefined ? x : null; } catch (e) { return null; } }, ruolo: () => (S.io && S.io.ruolo) || null,
        attivo: () => !!cfgApp().custodeUrl,
        pronto, condiviso: (pid) => S.condivisi.has(pid), inAttesa: (pid) => S.coda.has(pid),
        puo: (cosa) => !S.io || !S.io.permessi || !!S.io.permessi[cosa],
        alCambio: (f) => ascolta.push(f)
    };
})();
