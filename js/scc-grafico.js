/**
 * Disegno della Standard Celeration Chart e pannello con controlli e analisi.
 * Usato nella presa dati (target e attività) e nelle Visualizzazioni.
 *
 *   TiceSCCGrafico.pannello(contenitore, {
 *     titolo, sedute, fasi: [{ id, data, etichetta }], nomi: { targetId: nome },
 *     obiettivo: { v, x, testo }, puoModificare,
 *     alAggiungiFase: async ({ data, etichetta }) => {}, alTogliFase: async (id) => {},
 *     nomeFile
 *   })
 *
 * Proporzioni standard della SCC: una decade in altezza e un periodo di
 * celerazione in larghezza stanno in rapporto fisso, così ×2 a settimana è
 * sempre inclinato di circa 34°, come sulle carte di Lindsley.
 * I colori vengono dal tema dell'app (variabili CSS).
 */
(function () {
    'use strict';
    const S = window.TiceSCC;
    if (!S) return;
    const NS = 'http://www.w3.org/2000/svg';
    const TAN34 = Math.tan(34 * Math.PI / 180);
    const SERIE = {
        v: { nome: 'Corrette', colore: 'var(--success-color)' },
        p: { nome: 'Con aiuto', colore: 'var(--warning-color)' },
        x: { nome: 'Errori', colore: 'var(--danger-color)' }
    };
    const METODI = { theilsen: 'Theil-Sen (robusto)', splitmiddle: 'Split-middle (classico)', minimiquadrati: 'Minimi quadrati' };
    const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const data = (k) => { const [a, m, g] = k.split('-').map(Number); return new Date(a, m - 1, g); };
    const breve = (k) => { const d = data(k); return d.getDate() + ' ' + MESI[d.getMonth()]; };
    const lunga = (k) => { const d = data(k); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear(); };
    const numero = (n) => String(n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/0$/, '')).replace('.', ',');

    function el(tag, attr, padre, stile) {
        const e = document.createElementNS(NS, tag);
        for (const k in attr) if (attr[k] != null) e.setAttribute(k, attr[k]);
        if (stile) e.setAttribute('style', stile);
        if (padre) padre.appendChild(e);
        return e;
    }
    function testo(padre, x, y, t, stile, anchor = 'start') {
        const e = el('text', { x, y, 'text-anchor': anchor }, padre, stile);
        e.textContent = t;
        return e;
    }

    // ------------------------------------------------------------------
    // Il grafico
    // ------------------------------------------------------------------
    function disegna(box, A, opz) {
        box.innerHTML = '';
        const visibili = opz.serie;
        const scala = A.scala, unita = A.unita;
        const tuttiY = [];
        visibili.forEach((k) => A.serie[k].valori.forEach((v) => { tuttiY.push(v.y); if (v.pavimento) tuttiY.push(v.pavimento * 0.75); }));
        visibili.forEach((k) => { if (A.serie[k].obiettivo) tuttiY.push(A.serie[k].obiettivo); });
        if (!tuttiY.length) { box.innerHTML = '<p class="scc-vuoto">Nessun dato da disegnare.</p>'; return; }
        let lo = Math.floor(Math.log10(Math.min(...tuttiY)));
        let hi = Math.ceil(Math.log10(Math.max(...tuttiY)) + 1e-9);
        if (hi <= lo) hi = lo + 1;
        while (hi - lo < 2) { if (lo > -1) lo--; else hi++; }
        const decadi = hi - lo;
        const H_DEC = Math.max(56, Math.min(110, 300 / decadi));
        const pxX = H_DEC * Math.log10(2) / (unita * TAN34);     // ×2 per periodo = 34°
        const ultimoX = A.punti.length ? A.punti[A.punti.length - 1].x : 0;
        let fineX = Math.max(ultimoX + (scala === 'settimane' ? 4 : 14), scala === 'settimane' ? 16 : 42);
        visibili.forEach((k) => { const a = A.serie[k].arrivo; if (a && a.x < ultimoX + (scala === 'settimane' ? 26 : 120)) fineX = Math.max(fineX, Math.ceil(a.x) + 2); });
        const pad = { l: 46, r: 16, t: 30, b: 34 };
        const largo = (box.clientWidth || 0) - pad.l - pad.r - 12;
        if (largo > 0) fineX = Math.max(fineX, Math.min(Math.floor(largo / pxX), scala === 'settimane' ? 52 : 140));
        const W = Math.round(pad.l + fineX * pxX + pad.r), Hh = Math.round(pad.t + decadi * H_DEC + pad.b);
        const X = (x) => +(pad.l + (x + 0.5) * pxX).toFixed(1);
        const Y = (y) => +(pad.t + (hi - Math.log10(y)) * H_DEC).toFixed(1);
        const svg = el('svg', { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: 'img', 'aria-label': opz.titolo || 'Standard Celeration Chart' }, null, 'display:block;font-family:inherit;');
        const g = (c) => el('g', { class: c }, svg);
        // asse dei valori in un disegno a parte, fermo a sinistra quando si scorre
        const asse = el('svg', { viewBox: `0 0 ${pad.l} ${Hh}`, width: pad.l, height: Hh, 'aria-hidden': 'true', class: 'scc-asse' }, null, 'display:block;font-family:inherit;');
        const griglia = g('griglia'), gFasi = g('fasi'), gLinee = g('linee'), gPunti = g('punti'), gTesti = g('testi');

        // griglia: decadi e sottodivisioni logaritmiche
        for (let d = lo; d <= hi; d++) {
            const y = Y(Math.pow(10, d));
            el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y }, griglia, 'stroke:rgba(var(--ink-rgb),0.28);stroke-width:1');
            testo(asse, pad.l - 6, y + 3.5, numero(Math.pow(10, d)), 'font-size:10px;fill:var(--text-secondary);font-weight:600', 'end');
            if (d < hi) for (let m = 2; m <= 9; m++) {
                const ym = Y(m * Math.pow(10, d));
                el('line', { x1: pad.l, x2: W - pad.r, y1: ym, y2: ym }, griglia, `stroke:rgba(var(--ink-rgb),${m === 5 ? 0.14 : 0.07});stroke-width:1`);
                if (m === 5 && H_DEC > 70) testo(asse, pad.l - 6, ym + 3, numero(5 * Math.pow(10, d)), 'font-size:8.5px;fill:var(--text-muted)', 'end');
            }
        }
        // griglia verticale: giorni leggeri, lunedì marcati, date sotto
        const origine = A.origine;
        let ultimaEtichetta = -1e9;
        for (let x = 0; x <= fineX; x++) {
            const k = S.piuGiorni(origine, scala === 'settimane' ? x * 7 : x);
            const lun = scala === 'settimane' || data(k).getDay() === 1;
            const xp = X(x) - pxX / 2;
            if (scala === 'giorni' && !lun && pxX < 4) continue;
            el('line', { x1: xp, x2: xp, y1: pad.t, y2: Hh - pad.b }, griglia, `stroke:rgba(var(--ink-rgb),${lun ? 0.16 : 0.05});stroke-width:1`);
            if (lun && xp - ultimaEtichetta > 38) {
                testo(griglia, xp + 2, Hh - pad.b + 13, breve(k), 'font-size:9px;fill:var(--text-secondary)');
                ultimaEtichetta = xp;
            }
        }
        testo(griglia, pad.l, Hh - 6, scala === 'settimane' ? 'settimane (ogni punto: mediana dei giorni)' : 'giorni di calendario (le righe più scure sono i lunedì)', 'font-size:9px;fill:var(--text-muted)');
        testo(asse, 4, pad.t - 16, A.perMinuto ? 'al minuto' : 'al giorno', 'font-size:9px;fill:var(--text-muted)');

        // linee di cambio fase
        (opz.fasi || []).forEach((f) => {
            const x = S.distanza(origine, f.data) / (scala === 'settimane' ? 7 : 1);
            if (x < 0 || x > fineX) return;
            const xp = X(scala === 'settimane' ? Math.floor(x) : x) - pxX / 2 - (scala === 'settimane' ? 0 : 0);
            el('line', { x1: xp, x2: xp, y1: pad.t - 4, y2: Hh - pad.b }, gFasi, `stroke:var(--text-primary);stroke-width:${f.auto ? 1 : 1.6};${f.auto ? 'stroke-dasharray:4 3;opacity:.55' : 'opacity:.85'}`);
            const t = testo(gFasi, xp + 3, pad.t - 8, f.etichetta.length > 22 ? f.etichetta.slice(0, 21) + '…' : f.etichetta, `font-size:9px;fill:var(--text-primary);font-weight:${f.auto ? 500 : 700};opacity:${f.auto ? 0.7 : 1}`);
            el('title', {}, t).textContent = (f.auto ? 'Cambio (automatico): ' : 'Cambio di fase: ') + f.etichetta + ' · ' + lunga(f.data);
        });

        // obiettivi
        visibili.forEach((k) => {
            const ob = A.serie[k].obiettivo;
            if (!ob) return;
            el('line', { x1: pad.l, x2: W - pad.r, y1: Y(ob), y2: Y(ob) }, gLinee, `stroke:${SERIE[k].colore};stroke-width:1.2;stroke-dasharray:2 4;opacity:.8`);
            testo(gLinee, W - pad.r - 2, Y(ob) - 4, 'obiettivo ' + numero(ob), `font-size:9px;fill:${SERIE[k].colore};font-weight:700`, 'end');
        });

        // celerazioni (una per fase), variabilità e proiezione
        visibili.forEach((k) => {
            const s = A.serie[k];
            s.linee.forEach((c, i) => {
                if (!c) return;
                const ultima = i === s.linee.length - 1;
                if (ultima && opz.bounce) {
                    const pts = [[c.da, c.bounce.alto], [c.a_, c.bounce.alto], [c.a_, c.bounce.basso], [c.da, c.bounce.basso]]
                        .map(([x, o], j) => `${X(x)},${Y(Math.pow(10, c.b * x + c.a + o))}`).join(' ');
                    el('polygon', { points: pts }, gLinee, `fill:${SERIE[k].colore};opacity:.08`);
                }
                el('line', { x1: X(c.da), y1: Y(c.valore(c.da)), x2: X(c.a_), y2: Y(c.valore(c.a_)) }, gLinee, `stroke:${SERIE[k].colore};stroke-width:2.2;stroke-linecap:round;opacity:.9`);
                if (ultima) {
                    const fineP = s.arrivo ? Math.min(s.arrivo.x, fineX) : Math.min(c.a_ + (scala === 'settimane' ? 3 : 10), fineX);
                    el('line', { x1: X(c.a_), y1: Y(c.valore(c.a_)), x2: X(fineP), y2: Y(c.valore(fineP)) }, gLinee, `stroke:${SERIE[k].colore};stroke-width:1.4;stroke-dasharray:3 4;opacity:.7`);
                }
                const xm = (c.da + c.a_) / 2, ym = Y(c.valore(xm));
                const lab = testo(gTesti, X(xm), ym - 7, c.testo, `font-size:10.5px;font-weight:800;fill:${SERIE[k].colore};paint-order:stroke;stroke:var(--taccuino-carta, var(--modal-bg));stroke-width:3px`, 'middle');
                el('title', {}, lab).textContent = `${SERIE[k].nome}: ${c.testo} ${scala === 'settimane' ? 'ogni 4 settimane' : 'a settimana'} (${c.n} ${scala === 'settimane' ? 'settimane' : 'giorni'})`;
            });
        });

        // punti: ● corrette, △ con aiuto, ✕ errori; pavimento come trattino
        visibili.forEach((k) => {
            A.serie[k].valori.forEach((v) => {
                const cx = X(v.x), cy = Y(v.y), col = SERIE[k].colore;
                let m;
                if (k === 'v') m = el('circle', { cx, cy, r: 3.4 }, gPunti, v.zero ? `fill:none;stroke:${col};stroke-width:1.4` : `fill:${col}`);
                else if (k === 'p') m = el('path', { d: `M${cx} ${cy - 4}L${cx + 3.8} ${cy + 3}L${cx - 3.8} ${cy + 3}Z` }, gPunti, `fill:none;stroke:${col};stroke-width:1.5`);
                else m = el('path', { d: `M${cx - 3.3} ${cy - 3.3}L${cx + 3.3} ${cy + 3.3}M${cx + 3.3} ${cy - 3.3}L${cx - 3.3} ${cy + 3.3}` }, gPunti, `stroke:${col};stroke-width:1.9;stroke-linecap:round`);
                const pt = A.punti.find((p) => p.x === v.x) || {};
                el('title', {}, m).textContent = `${lunga(v.data)} · ${SERIE[k].nome.toLowerCase()}: ${A.perMinuto ? numero(v.reale) + ' al minuto' : v.reale}` +
                    (pt.sedute ? ` · ${pt.sedute} ${pt.sedute === 1 ? 'seduta' : 'sedute'}` : '') + (pt.minuti ? ` · ${numero(pt.minuti)} min` : '');
                if (A.perMinuto && v.pavimento && k === visibili[0]) el('line', { x1: cx - 4, x2: cx + 4, y1: Y(v.pavimento), y2: Y(v.pavimento) }, gPunti, 'stroke:var(--text-secondary);stroke-width:1.6');
            });
        });
        const riga = document.createElement('div');
        riga.className = 'scc-riga';
        riga.appendChild(asse);
        riga.appendChild(svg);
        box.appendChild(riga);
        box.scrollLeft = box.scrollWidth;
    }

    // ------------------------------------------------------------------
    // Le analisi in parole
    // ------------------------------------------------------------------
    function analisiHtml(A, opz) {
        const per = A.scala === 'settimane' ? 'ogni 4 settimane' : 'a settimana';
        const unitaDati = A.scala === 'settimane' ? 'settimane' : 'giorni';
        const schede = opz.serie.map((k) => {
            const s = A.serie[k], c = s.ultima, nome = SERIE[k].nome;
            if (s.tuttiZero) return `<div class="scc-scheda"><b style="color:${SERIE[k].colore}">${nome}</b><p class="scc-sotto">Sempre zero nel periodo: nessuna linea da calcolare.</p></div>`;
            if (!c) {
                const n = s.fasi.length ? s.fasi[s.fasi.length - 1].length : 0;
                return `<div class="scc-scheda"><b style="color:${SERIE[k].colore}">${nome}</b><p class="scc-sotto">Servono almeno ${S.MIN_PUNTI} ${unitaDati} con dati${s.fasi.length > 1 ? ' nell\'ultima fase' : ''} (ora ${n}).</p></div>`;
            }
            const buono = k === 'v' ? c.verso === 'su' : c.verso === 'giu';
            const perc = Math.round((c.cel - 1) * 100);
            const frase = c.verso === 'piatto' ? 'stabile' : (c.cel > 1 ? `in crescita del ${perc}% ${per}` : `in calo del ${Math.round((1 - c.cel) * 100)}% ${per}`);
            const giudizio = c.verso === 'piatto' ? '' : buono ? ' ✓' : ' ⚠';
            let arrivo = '';
            if (s.obiettivo) {
                arrivo = s.arrivo
                    ? `<p class="scc-sotto">Al ritmo attuale arriva a ${numero(s.obiettivo)} ${s.arrivo.fra <= 0 ? 'già ora' : `verso il <b>${breve(s.arrivo.data)}</b> (fra ${s.arrivo.fra} giorni)`}.</p>`
                    : `<p class="scc-sotto">Con questa tendenza non raggiunge l'obiettivo (${numero(s.obiettivo)}).</p>`;
            }
            return `<div class="scc-scheda">
                <b style="color:${SERIE[k].colore}">${nome}</b>
                <p class="scc-cel" style="color:${SERIE[k].colore}">${c.testo}<small> ${per}</small></p>
                <p class="scc-sotto">${frase}${giudizio} · ${c.n} ${unitaDati}${s.fasi.length > 1 ? ', ultima fase' : ''}</p>
                <p class="scc-sotto">Variabilità (bounce 5–95%): ×${numero(c.bounce.molt)}${c.bounce.molt > 4 ? ' · molto irregolare' : c.bounce.molt < 1.6 ? ' · molto stabile' : ''}</p>
                ${arrivo}</div>`;
        }).join('');
        const prec = A.precisione && opz.serie.includes('v') && opz.serie.includes('x')
            ? `<div class="scc-scheda"><b>Precisione</b><p class="scc-cel">${A.precisione.testo}<small> ${per}</small></p><p class="scc-sotto">Di quanto migliora il rapporto tra corrette ed errori (celerazione delle corrette ÷ quella degli errori).</p></div>` : '';
        return `<div class="scc-analisi">${schede}${prec}</div>`;
    }

    // ------------------------------------------------------------------
    // Il pannello completo
    // ------------------------------------------------------------------
    const PREF = 'scc_preferenze';
    function preferenze() {
        try { return Object.assign({ scala: 'giorni', serie: ['v', 'p', 'x'], metodo: 'theilsen', auto: true, bounce: false, perMinuto: true }, JSON.parse(localStorage.getItem(PREF) || '{}')); }
        catch (e) { return { scala: 'giorni', serie: ['v', 'p', 'x'], metodo: 'theilsen', auto: true, bounce: false, perMinuto: true }; }
    }
    function pannello(box, opz) {
        const st = preferenze();
        let aggiungendo = false;
        const salvaPref = () => { try { localStorage.setItem(PREF, JSON.stringify(st)); } catch (e) { /* ok */ } };
        function tutteLeFasi() {
            const man = (opz.fasi || []).map((f) => Object.assign({ auto: false }, f));
            const auto = st.auto ? S.fasiAutomatiche(opz.sedute, opz.nomi) : [];
            return man.concat(auto.filter((a) => !man.some((m) => m.data === a.data))).sort((a, b) => (a.data < b.data ? -1 : 1));
        }
        function disegnaTutto() {
            const fasi = tutteLeFasi();
            const pCron = S.cronometrato(S.punti(opz.sedute).punti);
            const A = S.analisi(opz.sedute, { scala: st.scala, perMinuto: st.perMinuto && pCron, metodo: st.metodo, fasi: fasi.map((f) => f.data), obiettivo: st.perMinuto && pCron ? null : opz.obiettivo });
            const btn = (att, on, t, extra = '') => `<button type="button" class="scc-tasto ${on ? 'on' : ''}" ${att} aria-pressed="${on}" ${extra}>${t}</button>`;
            box.innerHTML = `
                <div class="scc-controlli">
                    <div class="scc-gruppo">${btn('data-scala="giorni"', st.scala === 'giorni', 'Giorni')}${btn('data-scala="settimane"', st.scala === 'settimane', 'Settimane')}</div>
                    ${pCron ? `<div class="scc-gruppo">${btn('data-min="0"', !st.perMinuto, 'Conteggi')}${btn('data-min="1"', st.perMinuto, 'Al minuto')}</div>` : ''}
                    <div class="scc-gruppo">${['v', 'p', 'x'].map((k) => btn(`data-serie="${k}"`, st.serie.includes(k), `<i style="background:${SERIE[k].colore}"></i>${SERIE[k].nome}`)).join('')}</div>
                    <div class="scc-gruppo">${btn('data-auto', st.auto, 'Cambi automatici')}${btn('data-bounce', st.bounce, 'Variabilità')}</div>
                    <select data-metodo aria-label="Metodo della linea di celerazione">${Object.keys(METODI).map((m) => `<option value="${m}" ${m === st.metodo ? 'selected' : ''}>${METODI[m]}</option>`).join('')}</select>
                </div>
                <div class="scc-carta" data-carta></div>
                <div class="scc-legenda">● corrette · △ con aiuto · ✕ errori · ${A.perMinuto ? '— pavimento (1 ÷ minuti di lavoro)' : 'sotto 1: giorni a zero'} · linea tratteggiata: proiezione · ×2 a settimana = 34°</div>
                ${analisiHtml(A, st)}
                <div class="scc-fasi">
                    <b>Cambi di fase</b>
                    ${fasi.length ? `<ul>${fasi.map((f) => `<li><span>${breve(f.data)}</span> ${esc(f.etichetta)} ${f.auto ? '<small>automatico</small>' : opz.puoModificare ? `<button type="button" class="scc-x" data-togli="${esc(f.id)}" aria-label="Togli il cambio di fase">✕</button>` : ''}</li>`).join('')}</ul>` : '<p class="scc-sotto">Nessuno.</p>'}
                    ${opz.puoModificare ? (aggiungendo ? `<form class="scc-nuova" data-nuova>
                        <input type="date" name="data" required value="${S.giorno(new Date().toISOString())}">
                        <input name="etichetta" required maxlength="60" placeholder="es. fading dell'aiuto, nuovo rinforzatore">
                        <button class="scc-tasto on">Aggiungi</button><button type="button" class="scc-tasto" data-annulla>Annulla</button></form>`
                        : '<button type="button" class="scc-tasto" data-aggiungi>+ Cambio di fase</button>') : ''}
                    <button type="button" class="scc-tasto" data-csv title="Date, Corrects, Errors, Prompted, Minutes: si apre anche in OpenCelerator">Esporta CSV</button>
                </div>
                <p class="scc-nota">La celerazione dice di quanto si moltiplica il valore in una settimana: ×2 raddoppia, ÷2 si dimezza, ×1 è stabile. Si calcola su almeno ${S.MIN_PUNTI} giorni con dati, separatamente per ogni fase. Per le corrette si vuole ×, per aiuto ed errori ÷.</p>`;
            disegna(box.querySelector('[data-carta]'), A, { serie: st.serie, fasi, bounce: st.bounce, titolo: opz.titolo });
        }
        box.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            if (!b || !box.contains(b)) return;
            if (b.dataset.scala) st.scala = b.dataset.scala;
            else if (b.dataset.min != null) st.perMinuto = b.dataset.min === '1';
            else if (b.dataset.serie) {
                const k = b.dataset.serie;
                st.serie = st.serie.includes(k) ? st.serie.filter((x) => x !== k) : ['v', 'p', 'x'].filter((x) => x === k || st.serie.includes(x));
                if (!st.serie.length) st.serie = ['v'];
            } else if (b.hasAttribute('data-auto')) st.auto = !st.auto;
            else if (b.hasAttribute('data-bounce')) st.bounce = !st.bounce;
            else if (b.hasAttribute('data-aggiungi')) aggiungendo = true;
            else if (b.hasAttribute('data-annulla')) aggiungendo = false;
            else if (b.dataset.togli) { await opz.alTogliFase(b.dataset.togli); opz.fasi = (opz.fasi || []).filter((f) => f.id !== b.dataset.togli); }
            else if (b.hasAttribute('data-csv')) { scarica(S.csv(opz.sedute), (opz.nomeFile || 'dati') + '.csv'); return; }
            else return;
            e.preventDefault();
            salvaPref();
            disegnaTutto();
        });
        box.addEventListener('change', (e) => {
            if (e.target.matches('[data-metodo]')) { st.metodo = e.target.value; salvaPref(); disegnaTutto(); }
        });
        box.addEventListener('submit', async (e) => {
            if (!e.target.matches('[data-nuova]')) return;
            e.preventDefault();
            const fd = new FormData(e.target);
            const f = await opz.alAggiungiFase({ data: fd.get('data'), etichetta: String(fd.get('etichetta') || '').trim() });
            if (f) opz.fasi = (opz.fasi || []).concat([f]);
            aggiungendo = false;
            disegnaTutto();
        });
        disegnaTutto();
        return { aggiorna: disegnaTutto };
    }
    function scarica(testo, nome) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
        a.download = nome.replace(/[\\/:*?"<>|]+/g, '_');
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    /** Distintivo compatto per elenchi: celerazione delle corrette nell'ultima fase. */
    function distintivo(sedute, fasi, nomi) {
        const date = (fasi || []).map((f) => f.data).concat(S.fasiAutomatiche(sedute, nomi).map((f) => f.data));
        const A = S.analisi(sedute, { fasi: date });
        const c = A.serie.v.ultima;
        if (!c) return null;
        return { testo: c.testo, verso: c.verso, titolo: `Corrette ${c.testo} a settimana (celerazione, ultimi ${c.n} giorni con dati)` };
    }

    window.TiceSCCGrafico = { pannello, disegna, distintivo, SERIE };
})();
