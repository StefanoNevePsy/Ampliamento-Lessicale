// ============================================================
// Visuali dei programmi TICE (attività → target) e tavolozza «Quaderno».
// Si aggiungono a quelle di js/dataviz.js: stessi strumenti (svgRoot, skin…).
//   · Target nel tempo: una riga per target, da quando si apre a quando
//     arriva a criterio, con i pallini delle sedute
//   · Target acquisiti: il registro cumulativo (introdotti e a criterio)
//   · Sedute al criterio: quante sedute è servito a ogni target, in ordine;
//     se le barre si accorciano, impara a imparare
// Più: testi mai troppo piccoli sul telefono, per tutte le visuali.
// ============================================================
(function () {
    'use strict';
    const A = window._vizApi;
    if (!A) return;
    const { svgRoot, svgEl, _caption, _title, _vizLegendChips, _esc } = A;


    // ---------- tavolozza «Quaderno»: i colori dell'app, letti dal tema ----------
    function inHex(colore, riserva) {
        try {
            const c = document.createElement('canvas'); c.width = c.height = 1;
            const g = c.getContext('2d'); g.fillStyle = riserva; g.fillStyle = colore; g.fillRect(0, 0, 1, 1);
            const d = g.getImageData(0, 0, 1, 1).data;
            return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('');
        } catch (e) { return riserva; }
    }
    const varCss = (n, riserva) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
        return v ? inHex(v, riserva) : riserva;
    };
    const quaderno = {
        label: 'Quaderno', icon: 'fa-pen-nib', bg: 'transparent', organic: false, font: "'Archivo Variable', system-ui, sans-serif"
    };
    // i colori si leggono al momento del disegno (tema chiaro o scuro)
    ['grid', 'axis', 'text', 'textDim', 'good', 'mid', 'bad', 'v', 'p', 'x', 'accent'].forEach((k) => {
        Object.defineProperty(quaderno, k, {
            enumerable: true,
            get() {
                const ink = varCss('--text-primary', '#1a2131');
                switch (k) {
                    case 'grid': return ink + '1f';
                    case 'axis': return ink + '66';
                    case 'text': return ink + 'cc';
                    case 'textDim': return ink + '80';
                    case 'good': case 'v': return varCss('--success-color', '#3f7d4e');
                    case 'mid': case 'p': return varCss('--warning-color', '#9c6c1c');
                    case 'bad': case 'x': return varCss('--danger-color', '#a3313b');
                    default: return varCss('--taccuino-spot', '#c74a31');
                }
            }
        });
    });
    A.VIZ_SKINS.quaderno = quaderno;
    // con l'aspetto «quaderno» è la tavolozza di partenza (finché non se ne sceglie un'altra)
    const getOrig = window.getVizSkin;
    window.getVizSkin = function () {
        let k = null; try { k = localStorage.getItem('viz_skin'); } catch (e) { /* niente */ }
        if (!k && document.documentElement.dataset.ticeStile === 'quaderno') return 'quaderno';
        return getOrig();
    };

    // ---------- dati dei programmi ----------
    const oggiK = () => getDateKey(new Date());
    const giorno = (d) => (!d ? '' : String(d).length > 10 ? getDateKey(d) : String(d).slice(0, 10));
    const nomeBreve = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    function righeProgramma(patient) {
        const att = ((patient.programma && patient.programma.attivita) || []).filter((a) => (a.target || []).length);
        const sed = (patient.history || []).filter((h) => h.attivitaId);
        return att.map((a) => {
            const P = window.TiceProgramma, col = P && P.coloreDi ? P.coloreDi(patient, a) : '#888';
            const target = (a.target || []).filter((t) => t.stato !== 'pianificato').map((t) => {
                const s = sed.filter((h) => h.targetId === t.id).sort((x, y) => String(x.date).localeCompare(String(y.date)));
                const inizio = giorno(t.inizio) || (s[0] && giorno(s[0].date)) || '';
                const chiuso = ['criterio', 'repertorio', 'chiuso'].includes(t.stato);
                const fine = chiuso ? (giorno(t.fine) || (s.length && giorno(s[s.length - 1].date)) || inizio) : '';
                return { t, s, inizio, fine, stato: t.stato };
            }).filter((x) => x.inizio);
            return { a, col, target };
        }).filter((r) => r.target.length);
    }
    const giorni = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
    const piu = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return getDateKey(d); };
    // larghezza reale del riquadro: sul telefono il disegno non si rimpicciolisce, si ridistribuisce
    const larghezza = (container, max) => Math.max(330, Math.min(max, Math.round(container.clientWidth || max)));
    function vuoto(container, testo) { container.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding:24px; line-height:1.5;">${testo}</p>`; }
    function tacche(svg, s, x0, x1, da, a, y, alto) {
        // un segno per mese (o per settimana, se il periodo è corto)
        const n = giorni(da, a), pxGiorno = (x1 - x0) / Math.max(1, n);
        const passo = pxGiorno >= 30 ? 'giorno' : pxGiorno * 7 >= 52 ? 'sett' : pxGiorno * 30 >= 34 ? 'mese' : 'trimestre';
        let k = da;
        const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
        let guardia = 0;
        while (k <= a && guardia++ < 400) {
            const d = new Date(k + 'T12:00:00');
            const segna = passo === 'trimestre' ? d.getDate() === 1 && d.getMonth() % 3 === 0 : passo === 'mese' ? d.getDate() === 1 : passo === 'sett' ? d.getDay() === 1 : true;
            if (segna) {
                const x = x0 + (x1 - x0) * giorni(da, k) / Math.max(1, n);
                svgEl('line', { x1: x, x2: x, y1: y, y2: y + alto, stroke: s.grid, 'stroke-width': 1 }, svg);
                svgEl('text', { x: x + 2, y: y - 4, 'font-size': 10, fill: s.textDim, text: passo === 'mese' || passo === 'trimestre' ? mesi[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '') : d.getDate() + ' ' + mesi[d.getMonth()] }, svg);
            }
            k = piu(k, 1);
        }
    }

    // ---------- 1. Target nel tempo ----------
    function vizTargetTempo(container, patient) {
        const s = window.skin ? window.skin() : A.skin();
        const righe = righeProgramma(patient);
        if (!righe.length) return vuoto(container, 'Qui compaiono i target dei programmi TICE: si riempie man mano che si aprono target e si registrano sedute.');
        const tutte = righe.flatMap((r) => r.target);
        const da = tutte.map((x) => x.inizio).sort()[0], a = oggiK();
        const W = larghezza(container, 980), stretto = W < 560, L = stretto ? 118 : 220, R = 16, RIGA = 24, TESTA = 28, TOP = 26;
        const cAtt = stretto ? 15 : 26, cT = stretto ? 16 : 30;
        const H = TOP + righe.reduce((n, r) => n + TESTA + r.target.length * RIGA, 0) + 10;
        const svg = svgRoot(container, W, H, { maxWidth: W });
        const X = (k) => L + (W - L - R) * giorni(da, k) / Math.max(1, giorni(da, a));
        tacche(svg, s, L, W - R, da, a, TOP, H - TOP - 6);
        let y = TOP;
        righe.forEach((r) => {
            y += TESTA;
            // nome dell'attività con il suo colore come evidenziatore
            const tw = Math.min(W - 10, nomeBreve(r.a.nome, cAtt + 20).length * 7.6);
            svgEl('rect', { x: 2, y: y - 9, width: tw + 6, height: 7, fill: r.col, opacity: 0.35, rx: 1 }, svg);
            svgEl('text', { x: 4, y: y - 6, 'font-size': 14, fill: s.text, 'font-family': "Gloock, Georgia, serif", text: nomeBreve(r.a.nome, cAtt + 20) }, svg);
            r.target.forEach((x) => {
                const cy = y + RIGA / 2 + 2;
                svgEl('text', { x: 10, y: cy + 4, 'font-size': 11, fill: s.text, text: nomeBreve(x.t.testo, cT) }, svg);
                const x0 = X(x.inizio), x1 = X(x.fine || a);
                const col = x.stato === 'attivo' ? s.accent : x.stato === 'chiuso' ? s.textDim : s.good;
                const barra = svgEl('rect', { x: x0, y: cy - 4, width: Math.max(3, x1 - x0), height: 8, rx: 4, fill: col, opacity: x.stato === 'attivo' ? 0.28 : 0.35 }, svg);
                _title(barra, `${x.t.testo}\naperto il ${formatDateEU(x.inizio)}${x.fine ? '\n' + (x.stato === 'chiuso' ? 'chiuso' : 'a criterio') + ' il ' + formatDateEU(x.fine) + ' · ' + (giorni(x.inizio, x.fine) + 1) + ' giorni' : '\nin corso'}\n${x.s.length} sedute`);
                x.s.forEach((h) => {
                    const c = svgEl('circle', { cx: X(giorno(h.date)), cy, r: 2.6, fill: A.pctSkinColor(h.percentage || 0, s) }, svg);
                    _title(c, `${formatDateEU(giorno(h.date))} · ${h.percentage}%`);
                });
                if (x.fine && x.stato !== 'chiuso') svgEl('text', { x: x1 + 4, y: cy + 4, 'font-size': 11, fill: s.good, 'font-weight': 700, text: '✓' }, svg);
                y += RIGA;
            });
        });
        _vizLegendChips(container, [['In corso', s.accent], ['A criterio', s.good], ['Chiuso', s.textDim]]);
        _caption(container, 'Ogni riga è un target: la barra va da quando si apre a quando arriva a criterio; i pallini sono le sedute, colorati per percentuale.');
    }

    // ---------- 2. Target acquisiti (registro cumulativo) ----------
    function vizTargetAcquisiti(container, patient) {
        const s = window.skin ? window.skin() : A.skin();
        const tutte = righeProgramma(patient).flatMap((r) => r.target);
        const acq = tutte.filter((x) => x.fine && x.stato !== 'chiuso').map((x) => x.fine).sort();
        const intro = tutte.map((x) => x.inizio).sort();
        if (!intro.length) return vuoto(container, 'Ancora nessun target aperto nei programmi TICE.');
        const da = intro[0], a = oggiK();
        const W = larghezza(container, 900), H = W < 560 ? 260 : 300, L = 34, R = 46, T = 28, B = 24;
        const svg = svgRoot(container, W, H, { maxWidth: W });
        const max = Math.max(1, intro.length);
        const X = (k) => L + (W - L - R) * giorni(da, k) / Math.max(1, giorni(da, a));
        const Y = (n) => H - B - (H - B - T) * n / max;
        tacche(svg, s, L, W - R, da, a, T, H - T - B);
        [0, Math.round(max / 2), max].forEach((n) => {
            svgEl('line', { x1: L, x2: W - R, y1: Y(n), y2: Y(n), stroke: s.grid }, svg);
            svgEl('text', { x: L - 6, y: Y(n) + 4, 'font-size': 10, fill: s.textDim, 'text-anchor': 'end', text: n }, svg);
        });
        const scala = (date) => { let d = `M ${X(da)} ${Y(0)}`, n = 0; date.forEach((k) => { d += ` L ${X(k)} ${Y(n)} L ${X(k)} ${Y(++n)}`; }); return d + ` L ${X(a)} ${Y(n)}`; };
        svgEl('path', { d: scala(intro), fill: 'none', stroke: s.axis, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
        svgEl('path', { d: scala(acq), fill: 'none', stroke: s.good, 'stroke-width': 2.5 }, svg);
        acq.forEach((k, i) => { const c = svgEl('circle', { cx: X(k), cy: Y(i + 1), r: 3, fill: s.good }, svg); _title(c, `${formatDateEU(k)} · ${i + 1}° target a criterio`); });
        // i totali in fondo alle linee, grandi
        svgEl('text', { x: W - R + 8, y: Y(acq.length) + 8, 'font-size': 24, fill: s.good, 'font-family': 'Gloock, Georgia, serif', text: acq.length }, svg);
        if (intro.length !== acq.length) svgEl('text', { x: W - R + 8, y: Y(intro.length) - 4, 'font-size': 14, fill: s.textDim, 'font-family': 'Gloock, Georgia, serif', text: intro.length }, svg);
        _vizLegendChips(container, [['A criterio', s.good], ['Introdotti', s.axis]]);
        _caption(container, 'Registro cumulativo: la linea piena sale a ogni target acquisito, quella tratteggiata a ogni target introdotto. La distanza fra le due sono i target in lavoro.');
    }

    // ---------- 3. Sedute al criterio ----------
    function vizSeduteCriterio(container, patient) {
        const s = window.skin ? window.skin() : A.skin();
        const righe = righeProgramma(patient);
        const v = righe.flatMap((r) => r.target.filter((x) => x.fine && x.stato !== 'chiuso').map((x) => ({
            r, x, n: new Set(x.s.filter((h) => giorno(h.date) <= x.fine).map((h) => giorno(h.date))).size
        }))).filter((o) => o.n > 0).sort((p, q) => p.x.fine.localeCompare(q.x.fine));
        if (!v.length) return vuoto(container, 'Compare quando almeno un target arriva a criterio: per ognuno, quante sedute sono servite.');
        const W = larghezza(container, 900), BAR = Math.max(14, Math.min(40, (W - 80) / v.length - 6)), L = 36, T = 24, B = 92;
        const larg = Math.max(W, L + v.length * (BAR + 6) + 20), H = 300;
        const svg = svgRoot(container, larg, H, { maxWidth: larg });
        if (larg > W) { container.style.overflowX = 'auto'; svg.style.width = larg + 'px'; }
        const max = Math.max(...v.map((o) => o.n));
        const Y = (n) => H - B - (H - B - T) * n / max;
        [0, Math.ceil(max / 2), max].forEach((n) => {
            svgEl('line', { x1: L, x2: larg - 10, y1: Y(n), y2: Y(n), stroke: s.grid }, svg);
            svgEl('text', { x: L - 6, y: Y(n) + 4, 'font-size': 10, fill: s.textDim, 'text-anchor': 'end', text: n }, svg);
        });
        v.forEach((o, i) => {
            const x = L + 10 + i * (BAR + 6);
            const b = svgEl('rect', { x, y: Y(o.n), width: BAR, height: Y(0) - Y(o.n), rx: 3, fill: o.r.col, opacity: 0.85 }, svg);
            _title(b, `${o.r.a.nome} · ${o.x.t.testo}\n${o.n} sedute · a criterio il ${formatDateEU(o.x.fine)}`);
            svgEl('text', { x: x + BAR / 2, y: Y(o.n) - 5, 'font-size': 11, 'text-anchor': 'middle', fill: s.text, 'font-weight': 700, text: o.n }, svg);
            svgEl('text', { x: x + BAR / 2, y: H - B + 12, 'font-size': 10, fill: s.textDim, 'text-anchor': 'end', transform: `rotate(-50 ${x + BAR / 2} ${H - B + 12})`, text: nomeBreve(o.x.t.testo, 18) }, svg);
        });
        // tendenza: media mobile su tre target
        if (v.length >= 4) {
            let d = '';
            v.forEach((o, i) => {
                const fin = v.slice(Math.max(0, i - 2), i + 1), m = fin.reduce((t, q) => t + q.n, 0) / fin.length;
                d += (i ? ' L ' : 'M ') + (L + 10 + i * (BAR + 6) + BAR / 2) + ' ' + Y(m);
            });
            svgEl('path', { d, fill: 'none', stroke: s.accent, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
        }
        _vizLegendChips(container, righe.filter((r) => v.some((o) => o.r === r)).map((r) => [r.a.nome, r.col]).concat(v.length >= 4 ? [['Tendenza (media su 3)', s.accent]] : []));
        _caption(container, 'Una barra per target, in ordine di acquisizione: quante sedute sono servite per arrivare a criterio. Se la linea scende, i nuovi target si imparano più in fretta.');
    }

    A.VIZ_VIEWS.unshift(
        { id: 'tice-tempo', label: 'Target nel tempo', icon: 'fa-bars-staggered', fn: vizTargetTempo, group: 'Programma' },
        { id: 'tice-acquisiti', label: 'Target acquisiti', icon: 'fa-stairs', fn: vizTargetAcquisiti, group: 'Programma' },
        { id: 'tice-sedute', label: 'Sedute al criterio', icon: 'fa-chart-column', fn: vizSeduteCriterio, group: 'Programma' }
    );

    // ---------- leggibilità: nessun testo sotto i 10px sullo schermo ----------
    const orig = window.renderVizTab;
    window.renderVizTab = function (patient) {
        // per i bambini con un programma TICE si parte dai target
        if (!state._vizView && patient && righeProgramma(patient).length) state._vizView = 'tice-tempo';
        orig(patient);
        const tela = document.getElementById('viz-canvas');
        if (!tela) return;
        requestAnimationFrame(() => tela.querySelectorAll('svg').forEach((svg) => {
            const vb = svg.viewBox && svg.viewBox.baseVal, w = svg.getBoundingClientRect().width;
            if (!vb || !vb.width || !w) return;
            const scala = w / vb.width;
            svg.querySelectorAll('text').forEach((t) => {
                const fs = parseFloat(t.getAttribute('font-size') || '0');
                if (fs && fs * scala < 10) t.setAttribute('font-size', (10 / scala).toFixed(1));
            });
        }));
    };
})();
