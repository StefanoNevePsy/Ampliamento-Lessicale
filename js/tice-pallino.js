/**
 * Il pallino della sincronizzazione con il Drive del centro, sempre visibile
 * nella barra dell'app (anche fuori dalla presa dati).
 *   verde: tutto salvato · giallo: da inviare / in attesa della chiave
 *   azzurro che pulsa: sincronizzo · rosso: errore · grigio: non collegato o senza rete
 * Un tocco sincronizza subito e apre "Account e sincronizzazione".
 * Se tice-config.js non indica un custode, non compare.
 */
(function () {
    'use strict';
    const Y = window.TiceSync;
    if (!Y) return;
    const ora = (iso) => (iso ? new Date(iso).toLocaleTimeString('it-IT', Orario.opzioniOra()) : '');

    function stato() {
        const S = Y.S;
        if (!navigator.onLine) return ['spento', 'Senza rete: lavori sul dispositivo, i dati partono appena torna la connessione'];
        if (S.fase === 'fuori' || S.fase === 'spento') return ['spento', 'Non collegato al Drive del centro: tocca per accedere'];
        if (S.fase === 'chiave' || S.fase === 'attesa') return ['attesa', 'In attesa della chiave del centro'];
        if (S.lavoro) return ['lavoro', 'Sincronizzo con il Drive del centro…'];
        if (S.errore) return ['errore', 'Sincronizzazione non riuscita: ' + S.errore];
        if (S.coda.size) return ['attesa', S.coda.size + (S.coda.size === 1 ? ' bambino da inviare' : ' bambini da inviare') + ' al Drive'];
        return ['ok', 'Tutto salvato sul Drive del centro' + (S.ultimo ? ' · ultima sincronizzazione alle ' + ora(S.ultimo) : '')];
    }

    let el = null;
    function disegna() {
        if (!Y.attivo()) { if (el) el.hidden = true; return; }
        if (!el) {
            const dove = document.querySelector('.app-shell header .header-actions');
            if (!dove) return;
            el = document.createElement('button');
            el.type = 'button';
            el.className = 'btn-icon tice-pallino';
            el.innerHTML = '<i class="pallino" aria-hidden="true"></i>';
            el.onclick = () => {
                if (Y.S.fase === 'pronto') Y.sincronizza();
                if (window.TiceHome) TiceHome.vai('account');
            };
            dove.insertBefore(el, dove.firstChild);
        }
        const [s, testo] = stato();
        el.hidden = false;
        el.dataset.stato = s;
        el.title = testo;
        el.setAttribute('aria-label', 'Sincronizzazione: ' + testo);
    }

    Y.alCambio((cosa) => { if (cosa === 'stato' || cosa === 'coda' || cosa === 'pazienti') disegna(); });
    // rete che va e viene: si aggiorna anche il chip della presa dati (non durante una seduta)
    function rete() {
        disegna();
        if (window.TiceHome && TiceHome.attuale().vista !== 'seduta') TiceHome.ridisegna();
    }
    window.addEventListener('online', rete);
    window.addEventListener('offline', rete);
    // lo stato "lavoro" e gli errori non sempre passano da un evento: un controllo leggero ogni tanto
    setInterval(disegna, 3000);
    if (document.readyState === 'complete') disegna(); else window.addEventListener('load', disegna);
})();
