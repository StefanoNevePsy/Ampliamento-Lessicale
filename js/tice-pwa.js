/**
 * App installabile e utilizzabile offline (service worker in sw.js).
 *
 * - registra il service worker (solo su http/https: non nell'app desktop,
 *   che carica i file dal disco e funziona già offline);
 * - quando è pronta una versione nuova mostra "Aggiorna";
 * - tiene l'invito all'installazione del browser per il menu della presa dati.
 */
(function () {
    'use strict';
    let invito = null;

    function banda(testo, azione, etichetta) {
        let b = document.getElementById('tice-aggiornamento');
        if (!b) {
            b = document.createElement('div');
            b.id = 'tice-aggiornamento';
            b.className = 'tice-aggiornamento';
            document.body.appendChild(b);
        }
        b.innerHTML = '<span></span><button type="button"></button><button type="button" class="chiudi" aria-label="Più tardi">×</button>';
        b.firstChild.textContent = testo;
        b.children[1].textContent = etichetta;
        b.children[1].onclick = azione;
        b.children[2].onclick = () => b.remove();
    }

    function registra() {
        if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
        let ricaricando = false;
        // Versione nuova attiva: si ricarica appena non c'è un foglio aperto
        // (un modulo a metà o la fine seduta), o quando l'app torna in primo piano
        const tranquillo = () => !document.querySelector('.tice-foglio-sfondo, .modal.open, .modal[style*="flex"]');
        const ricarica = () => {
            if (ricaricando) return;
            if (document.visibilityState === 'visible' && !tranquillo()) { setTimeout(ricarica, 2000); return; }
            ricaricando = true;
            location.reload();
        };
        const giaControllata = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (giaControllata) ricarica(); });
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
            const proponi = (w) => banda('È disponibile una versione nuova dell\'app.', () => w.postMessage('aggiorna'), 'Aggiorna');
            if (reg.waiting && navigator.serviceWorker.controller) proponi(reg.waiting);
            reg.addEventListener('updatefound', () => {
                const w = reg.installing;
                if (!w) return;
                w.addEventListener('statechange', () => {
                    // "installed" con un controllore attivo = aggiornamento, non prima installazione
                    if (w.state === 'installed' && navigator.serviceWorker.controller) proponi(w);
                });
            });
            // controlla aggiornamenti all'apertura, quando l'app torna in primo piano e ogni 10 minuti
            reg.update().catch(() => {});
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
            setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 600000);
        }).catch((e) => console.warn('service worker', e));
    }

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invito = e; });
    window.addEventListener('appinstalled', () => { invito = null; });

    window.TicePwa = {
        puoInstallare: () => !!invito,
        installata: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        installa: async () => {
            if (!invito) return false;
            invito.prompt();
            const r = await invito.userChoice;
            invito = null;
            return r && r.outcome === 'accepted';
        }
    };
    if (document.readyState === 'complete') registra(); else window.addEventListener('load', registra);
})();
