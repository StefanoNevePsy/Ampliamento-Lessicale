// ============================================================
// DATA VISUALIZATION MODULE — "Visualizzazioni"
// New views over data already collected, plus selectable aesthetics ("skin").
// All SVG is built with createElementNS + explicit viewBox/width/height and
// preserveAspectRatio to stay crisp and undistorted at any container size.
// ============================================================

// ---------- SKINS (palettes / aesthetics) ----------
const VIZ_SKINS = {
    clinico: {
        label: 'Clinico', icon: 'fa-stethoscope',
        bg: 'transparent', grid: 'rgba(255,255,255,0.07)', axis: 'rgba(255,255,255,0.35)',
        text: 'rgba(255,255,255,0.65)', textDim: 'rgba(255,255,255,0.3)',
        good: '#10b981', mid: '#f59e0b', bad: '#ef4444',
        v: '#10b981', p: '#f59e0b', x: '#ef4444',
        accent: '#6366f1', organic: false, font: 'inherit'
    },
    organico: {
        label: 'Organico', icon: 'fa-leaf',
        bg: '#f4efe6', grid: 'rgba(90,70,50,0.10)', axis: 'rgba(90,70,50,0.4)',
        text: '#5a4636', textDim: 'rgba(90,70,50,0.45)',
        good: '#7fa66a', mid: '#d9a441', bad: '#c2683f',
        v: '#7fa66a', p: '#d9a441', x: '#c2683f',
        accent: '#9b6a8f', organic: true, font: 'inherit'
    },
    notturno: {
        label: 'Notturno', icon: 'fa-moon',
        bg: '#0d1024', grid: 'rgba(160,180,255,0.08)', axis: 'rgba(160,180,255,0.35)',
        text: 'rgba(210,220,255,0.75)', textDim: 'rgba(210,220,255,0.35)',
        good: '#5ee0c0', mid: '#ffd479', bad: '#ff7a9c',
        v: '#5ee0c0', p: '#ffd479', x: '#ff7a9c',
        accent: '#8ab4f8', organic: true, font: 'inherit'
    }
};
function getVizSkin() {
    const k = localStorage.getItem('viz_skin');
    return VIZ_SKINS[k] ? k : 'clinico';
}
function setVizSkin(k) { if (VIZ_SKINS[k]) localStorage.setItem('viz_skin', k); }
function skin() { return VIZ_SKINS[getVizSkin()]; }
window.getVizSkin = getVizSkin;
window.setVizSkin = setVizSkin;

// ---------- SVG helpers ----------
const _SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(_SVGNS, tag);
    if (attrs) for (const k in attrs) {
        if (k === 'text') el.textContent = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(el);
    return el;
}
// Root SVG sized by an explicit viewBox; scales responsively without distortion.
function svgRoot(container, w, h, opts) {
    opts = opts || {};
    const svg = svgEl('svg', {
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: opts.preserveAspectRatio || 'xMidYMid meet'
    });
    // Fill the available width and derive height from the viewBox aspect ratio.
    // A fixed pixel height (the old approach) letterboxed and downscaled wide
    // charts (Fiume) or capped square ones (Rosa), which read as low resolution.
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.aspectRatio = w + ' / ' + h;
    svg.style.maxWidth = (opts.maxWidth || w) + 'px';
    svg.style.margin = opts.center === false ? '0' : '0 auto';
    svg.style.overflow = 'visible';
    if (opts.bg && opts.bg !== 'transparent') {
        svgEl('rect', { x: 0, y: 0, width: w, height: h, fill: opts.bg, rx: 14 }, svg);
    }
    if (container) container.appendChild(svg);
    return svg;
}
function _title(el, txt) { svgEl('title', { text: txt }, el); }
function _lerpColor(a, b, t) {
    const pa = a.match(/\w\w/g).map(h => parseInt(h, 16));
    const pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
// % -> skin colour (bad->mid->good ramp)
function pctSkinColor(pct, s) {
    s = s || skin();
    const bad = s.bad.replace('#', ''), mid = s.mid.replace('#', ''), good = s.good.replace('#', '');
    if (pct <= 50) return _lerpColor(bad, mid, Math.max(0, pct) / 50);
    return _lerpColor(mid, good, Math.min(50, pct - 50) / 50);
}
function _hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ============================================================
// DATA EXTRACTORS (over patient.history, all reuse existing fields)
// ============================================================

// Daily aggregation incl. V/P/X composition.
function vizDailyData(patient) {
    const history = patient.history || [];
    const byDate = {};
    history.forEach(h => { const dk = getDateKey(h.date); (byDate[dk] = byDate[dk] || []).push(h); });
    const dailyNotes = patient.dailyNotes || {};
    const dayTags = patient.dayTags || {};
    const outliers = patient.outlierDays || {};
    return Object.keys(byDate).sort().map(dk => {
        const ss = byDate[dk];
        const totalLU = ss.reduce((s, x) => s + (x.total || 0), 0);
        const correctLU = ss.reduce((s, x) => s + (x.correct || 0), 0);
        // V/P/X: prefer raw fields, fall back to correct/error split.
        let v = 0, p = 0, x = 0;
        ss.forEach(srec => {
            const hasRaw = srec.rawV != null || srec.rawP != null || srec.rawX != null;
            if (hasRaw) { v += srec.rawV || 0; p += srec.rawP || 0; x += srec.rawX || 0; }
            else { v += srec.correct || 0; x += (srec.total || 0) - (srec.correct || 0); }
        });
        return {
            date: dk, totalLU, correctLU, incorrectLU: totalLU - correctLU,
            v, p, x, sessions: ss.length,
            pct: totalLU > 0 ? Math.round(correctLU / totalLU * 100) : 0,
            hasNote: !!dailyNotes[dk] || ss.some(srec => srec.note),
            tag: dayTags[dk] && DAY_TAGS[dayTags[dk]] ? { key: dayTags[dk], ...DAY_TAGS[dayTags[dk]] } : null,
            outlier: !!outliers[dk]
        };
    });
}

// Per-item (per-stimulus) mastery across all sessions that recorded itemDetails.
function vizItemStats(patient) {
    const history = (patient.history || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const map = {};
    history.forEach(h => {
        if (!Array.isArray(h.itemDetails)) return;
        h.itemDetails.forEach(it => {
            const label = (it.label || '').trim();
            if (!label) return;
            const m = map[label] || (map[label] = { label, total: 0, correct: 0, prompt: 0, error: 0, seq: [], lastDate: h.date, cats: {} });
            m.total++;
            if (it.result === true) { m.correct++; m.seq.push(1); }
            else if (it.result === 'prompt') { m.prompt++; m.seq.push(0.5); }
            else { m.error++; m.seq.push(0); }
            m.lastDate = h.date;
            if (h.setName) m.cats[h.setName] = (m.cats[h.setName] || 0) + 1;
        });
    });
    return Object.values(map).map(m => {
        const recent = m.seq.slice(-4);
        const recentScore = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
        const mastery = m.total ? (m.correct + m.prompt * 0.5) / m.total : 0;
        let status = 'difficile';
        if (recentScore >= 0.8 && m.total >= 2) status = 'acquisito';
        else if (recentScore >= 0.45) status = 'emergente';
        const cat = Object.keys(m.cats).sort((a, b) => m.cats[b] - m.cats[a])[0] || '—';
        return { ...m, mastery, recentScore, status, cat };
    });
}

// ---- CONSTRUCT TAXONOMY ----
// Grounded in what each mode mechanically trains (ABA verbal operants, the
// Miyake executive-function model, attention taxonomy, language domains).
// Each construct aggregates the % of the modes that exercise it, weighted by
// how central that mode is to the construct. Constructs roll up into macro-areas.
const VIZ_MACROS = {
    'Linguaggio': { icon: 'fa-comment-dots', color: '#6366f1', short: 'Linguaggio' },
    'Comprensione': { icon: 'fa-ear-listen', color: '#0ea5e9', short: 'Compr.' },
    'Funzioni esecutive': { icon: 'fa-brain', color: '#ec4899', short: 'Funz. esec.' },
    'Memoria': { icon: 'fa-clock-rotate-left', color: '#8b5cf6', short: 'Memoria' },
    'Attenzione': { icon: 'fa-crosshairs', color: '#f59e0b', short: 'Attenz.' },
    'Percezione': { icon: 'fa-eye', color: '#14b8a6', short: 'Percez.' },
    'Velocità': { icon: 'fa-bolt', color: '#ef4444', short: 'Velocità' }
};
const VIZ_CONSTRUCTS = [
    // Linguaggio (espressivo)
    { key: 'denominazione', label: 'Denominazione', short: 'Denom.', macro: 'Linguaggio', modes: { tact: 1, ran: 0.8, ran_intensivo: 0.8, fluenza: 0.7, zoom: 0.5 } },
    { key: 'fluenza_verbale', label: 'Fluenza verbale', short: 'Fluenza', macro: 'Linguaggio', modes: { fluenza: 1 } },
    { key: 'morfosintassi', label: 'Morfosintassi', short: 'Morfosint.', macro: 'Linguaggio', modes: { singolare_plurale: 1 } },
    { key: 'intraverbale', label: 'Intraverbale', short: 'Intraverb.', macro: 'Linguaggio', modes: { pool_intraverbal: 1, intraverbal_scenari: 1 } },
    { key: 'narrazione', label: 'Narrazione / discorso', short: 'Narraz.', macro: 'Linguaggio', modes: { sequenze: 0.6, quaderno: 0.5, quaderno_task: 0.4 } },
    // Comprensione / semantica (ricettivo)
    { key: 'compr_lessicale', label: 'Comprensione lessicale', short: 'Compr.', macro: 'Comprensione', modes: { tombola: 1, tombola_sonora: 1, pool_random: 0.4 } },
    { key: 'categorizzazione', label: 'Categorizzazione', short: 'Categor.', macro: 'Comprensione', modes: { categorizzazione: 1, intruso: 0.8 } },
    { key: 'concetti_spaziali', label: 'Concetti spaziali', short: 'Spaziali', macro: 'Comprensione', modes: { topologia: 0.8, topologia_comp: 1 } },
    // Funzioni esecutive
    { key: 'inibizione', label: 'Inibizione', short: 'Inibiz.', macro: 'Funzioni esecutive', modes: { go_nogo: 1, stroop_numerico: 1, stroop_etichetta: 1 } },
    { key: 'memoria_lavoro', label: 'Memoria di lavoro', short: 'M. lavoro', macro: 'Funzioni esecutive', modes: { memoria_lavoro: 1 } },
    { key: 'flessibilita', label: 'Flessibilità', short: 'Flessib.', macro: 'Funzioni esecutive', modes: { intruso: 0.7, categorizzazione: 0.5, go_nogo: 0.5 } },
    { key: 'pianificazione', label: 'Pianificazione / sequenziamento', short: 'Pianif.', macro: 'Funzioni esecutive', modes: { sequenze: 1 } },
    // Memoria
    { key: 'memoria_visiva', label: 'Memoria visiva', short: 'M. visiva', macro: 'Memoria', modes: { memory: 1, ricorda: 1 } },
    { key: 'span_mnestico', label: 'Span mnestico', short: 'Span', macro: 'Memoria', modes: { memoria_lavoro: 1 } },
    { key: 'richiamo', label: 'Richiamo differito', short: 'Richiamo', macro: 'Memoria', modes: { ricorda: 1, zoom: 0.3 } },
    // Attenzione
    { key: 'att_sostenuta', label: 'Attenzione sostenuta', short: 'Att. sost.', macro: 'Attenzione', modes: { fluenza: 0.7, go_nogo: 0.8, ran: 0.5 } },
    { key: 'att_selettiva', label: 'Attenzione selettiva', short: 'Att. selet.', macro: 'Attenzione', modes: { search_find: 1, stroop_numerico: 0.6, stroop_etichetta: 0.6, tombola_sonora: 0.5 } },
    { key: 'ricerca_visiva', label: 'Ricerca visiva', short: 'Ric. visiva', macro: 'Attenzione', modes: { search_find: 1, tombola: 0.5, intruso: 0.5 } },
    // Percezione
    { key: 'discriminazione', label: 'Discriminazione visiva', short: 'Discrim.', macro: 'Percezione', modes: { zoom: 0.8, intruso: 0.6, memory: 0.4, singolare_plurale: 0.4 } },
    { key: 'chiusura', label: 'Chiusura percettiva', short: 'Chiusura', macro: 'Percezione', modes: { zoom: 1 } },
    { key: 'analisi_scena', label: 'Analisi di scena', short: 'Scena', macro: 'Percezione', modes: { search_find: 0.8, intraverbal_scenari: 0.7 } },
    // Velocità di elaborazione
    { key: 'denom_rapida', label: 'Denominazione rapida', short: 'RAN', macro: 'Velocità', modes: { ran: 1, ran_intensivo: 1, fluenza: 0.6 } },
    { key: 'automatismo', label: 'Automatizzazione', short: 'Automat.', macro: 'Velocità', modes: { ran_intensivo: 1, fluenza: 0.5, tombola: 0.4 } }
];

// Compute per-construct scores (0-100) from a set of sessions.
function vizConstructScores(sessions) {
    const modeAgg = {};
    (sessions || []).forEach(h => {
        const pct = h.percentage != null ? h.percentage : (h.total ? h.correct / h.total * 100 : 0);
        const a = modeAgg[h.mode] || (modeAgg[h.mode] = { sum: 0, n: 0 });
        a.sum += pct; a.n++;
    });
    const out = {};
    VIZ_CONSTRUCTS.forEach(c => {
        let wsum = 0, vsum = 0, nsum = 0;
        for (const mode in c.modes) {
            const a = modeAgg[mode];
            if (!a) continue;
            const w = c.modes[mode] * a.n;
            wsum += w; vsum += w * (a.sum / a.n); nsum += a.n;
        }
        if (wsum > 0) out[c.key] = { key: c.key, label: c.label, short: c.short, macro: c.macro, score: Math.round(vsum / wsum), n: nsum };
    });
    return out;
}
function vizMacroScores(constructScores) {
    const m = {};
    Object.values(constructScores).forEach(c => { const a = m[c.macro] || (m[c.macro] = { sum: 0, n: 0, ses: 0 }); a.sum += c.score; a.n++; a.ses += c.n; });
    const out = {};
    Object.keys(m).forEach(k => out[k] = { macro: k, score: Math.round(m[k].sum / m[k].n), subs: m[k].n });
    return out;
}
// Back-compat helper retained for the test API.
function vizDomainStats(patient) {
    const cs = vizConstructScores((patient.history || []));
    const ms = vizMacroScores(cs);
    return Object.keys(ms).map(k => ({ domain: k, pct: ms[k].score, n: ms[k].subs }));
}

// Time-delay fading series: timedelay sessions ordered, with delay seconds.
function vizTimeDelaySeries(patient) {
    return (patient.history || [])
        .filter(h => h.sessionType === 'timedelay')
        .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(h => ({ date: getDateKey(h.date), delay: h.timeDelaySeconds || 0, pct: h.percentage != null ? h.percentage : 0, setName: h.setName, mode: h.mode }));
}

// ============================================================
// ANALYTIC VISUALIZATIONS
// ============================================================

// 1) CALENDAR HEATMAP (contribution-graph style, by week columns)
function vizCalendarHeatmap(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient);
    if (!daily.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato.</p>'; return; }
    const byDate = {}; daily.forEach(d => byDate[d.date] = d);

    const first = new Date(daily[0].date + 'T00:00:00');
    // Extend the grid to TODAY (local), not just to the last recorded session:
    // the current week must always be visible even before logging anything.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let last = new Date(daily[daily.length - 1].date + 'T00:00:00');
    if (today > last) last = today;
    // Start grid on the Monday on/before first date.
    const start = new Date(first); const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow);
    const cell = 15, gap = 3, leftPad = 28, topPad = 18;
    const totalDays = Math.round((last - start) / 86400000) + 1;
    const weeks = Math.ceil(totalDays / 7) + 1;
    const w = leftPad + weeks * (cell + gap) + 6;
    const h = topPad + 7 * (cell + gap) + 6;
    // Native-size SVG inside a horizontal scroller (long histories must scroll,
    // not shrink into unreadable cells), anchored to the most recent weeks.
    const scroller = document.createElement('div');
    scroller.style.cssText = 'overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px;';
    container.appendChild(scroller);
    const svg = svgRoot(scroller, w, h, { bg: s.bg, cssHeight: h, maxWidth: w });
    svg.style.width = w + 'px';
    svg.style.maxWidth = 'none';

    const dayLabels = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
    dayLabels.forEach((lb, i) => {
        svgEl('text', { x: leftPad - 6, y: topPad + i * (cell + gap) + cell - 4, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: lb }, svg);
    });

    let lastMonth = -1;
    for (let wi = 0; wi < weeks; wi++) {
        for (let di = 0; di < 7; di++) {
            const cur = new Date(start); cur.setDate(start.getDate() + wi * 7 + di);
            if (cur < first || cur > last) {
                // still draw faint empty cell for grid continuity within range only
            }
            const dk = getDateKey(cur);
            const x = leftPad + wi * (cell + gap);
            const y = topPad + di * (cell + gap);
            const rec = byDate[dk];
            const inRange = cur >= start && cur <= last;
            if (!inRange) continue;
            const fill = rec ? pctSkinColor(rec.pct, s) : (s.organic ? 'rgba(120,100,80,0.06)' : 'rgba(255,255,255,0.04)');
            const r = svgEl('rect', { x, y, width: cell, height: cell, rx: s.organic ? cell / 2 : 3, fill, opacity: rec ? 1 : 1 }, svg);
            if (rec) {
                _title(r, `${formatDateEU(dk + 'T00:00:00')}\n${rec.pct}% (${rec.correctLU}/${rec.totalLU})\n${rec.sessions} sessioni${rec.tag ? '\n' + rec.tag.symbol + ' ' + rec.tag.label : ''}${rec.outlier ? '\n⚠ outlier' : ''}`);
                if (rec.tag) svgEl('circle', { cx: x + cell - 3, cy: y + 3, r: 2.5, fill: rec.tag.color, stroke: s.bg === 'transparent' ? '#1e1e2f' : s.bg, 'stroke-width': 0.6 }, svg);
                if (rec.hasNote) svgEl('circle', { cx: x + 3, cy: y + cell - 3, r: 1.6, fill: s.accent }, svg);
                if (rec.outlier) svgEl('rect', { x, y, width: cell, height: cell, rx: s.organic ? cell / 2 : 3, fill: 'none', stroke: s.bad, 'stroke-width': 1, 'stroke-dasharray': '2,2' }, svg);
            }
            // today: outlined for orientation
            if (cur.getTime() === today.getTime()) {
                svgEl('rect', { x: x - 1, y: y - 1, width: cell + 2, height: cell + 2, rx: s.organic ? cell / 2 : 4, fill: 'none', stroke: s.accent, 'stroke-width': 1.4 }, svg);
            }
            // month label on first row when month changes
            if (di === 0 && cur.getMonth() !== lastMonth) {
                lastMonth = cur.getMonth();
                const mn = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][cur.getMonth()];
                svgEl('text', { x, y: topPad - 6, 'font-size': 8, fill: s.textDim, text: mn }, svg);
            }
        }
    }
    // Land on the most recent weeks (the interesting end) by default.
    requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
    _vizLegendGradient(container, s, 'Bassa', 'Alta % giornaliera');

    // --- Weekday efficiency: is there a pattern tied to the day of the week? ---
    const wd = Array.from({ length: 7 }, () => ({ pctSum: 0, luSum: 0, n: 0 }));
    daily.forEach(d => {
        const dayIdx = (new Date(d.date + 'T00:00:00').getDay() + 6) % 7; // 0 = Mon
        wd[dayIdx].pctSum += d.pct; wd[dayIdx].luSum += d.totalLU; wd[dayIdx].n++;
    });
    const wdNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    const active = wd.map((a, i) => ({ ...a, i })).filter(a => a.n > 0);
    if (active.length >= 2) {
        const best = active.reduce((m, a) => (a.pctSum / a.n) > (m.pctSum / m.n) ? a : m);
        const head = document.createElement('div');
        head.style.cssText = 'margin:14px 0 6px; font-size:0.78rem; font-weight:600; color:var(--text-secondary); text-align:center;';
        head.innerHTML = '<i class="fa-solid fa-calendar-week"></i> Media per giorno della settimana';
        container.appendChild(head);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px; justify-content:center; align-items:flex-end;';
        row.innerHTML = wd.map((a, i) => {
            if (a.n === 0) return `<div style="width:44px; text-align:center; opacity:0.35;"><div style="height:56px; display:flex; align-items:flex-end; justify-content:center;"><div style="width:22px; height:3px; border-radius:2px; background:${s.grid};"></div></div><div style="font-size:0.68rem; color:var(--text-secondary);">${wdNames[i]}</div><div style="font-size:0.6rem; color:var(--text-secondary);">—</div></div>`;
            const avg = Math.round(a.pctSum / a.n);
            const hgt = Math.max(6, Math.round(56 * avg / 100));
            const isBest = a.i === best.i;
            return `<div style="width:44px; text-align:center;" title="${wdNames[i]}: media ${avg}% su ${a.n} giornate · ${Math.round(a.luSum / a.n)} LU/giorno">
                <div style="height:56px; display:flex; align-items:flex-end; justify-content:center;"><div style="width:22px; height:${hgt}px; border-radius:4px 4px 2px 2px; background:${pctSkinColor(avg, s)}; ${isBest ? 'outline:2px solid ' + s.accent + '; outline-offset:1px;' : ''}"></div></div>
                <div style="font-size:0.68rem; color:var(--text-secondary); font-weight:${isBest ? '700' : '400'};">${wdNames[i]}</div>
                <div style="font-size:0.62rem; color:${pctSkinColor(avg, s)}; font-weight:700;">${avg}%</div>
                <div style="font-size:0.55rem; color:var(--text-secondary);">${a.n}g</div>
            </div>`;
        }).join('');
        container.appendChild(row);
        _caption(container, 'Barre = % media delle giornate cadute in quel giorno · bordo = giorno migliore · "g" = giornate osservate');
    }
}

function _vizLegendGradient(container, s, lo, hi) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; align-items:center; gap:6px; justify-content:center; margin-top:8px; font-size:0.7rem; color:var(--text-secondary);';
    wrap.innerHTML = `<span>${lo}</span>` +
        `<span style="display:inline-block; width:90px; height:9px; border-radius:5px; background:linear-gradient(90deg, ${s.bad}, ${s.mid}, ${s.good});"></span>` +
        `<span>${hi}</span>`;
    container.appendChild(wrap);
}

// 2) INDEPENDENCE AREA — stacked V/P/X per day (prompt-fading made visible)
function vizIndependenceArea(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient).filter(d => (d.v + d.p + d.x) > 0);
    if (!daily.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato V/P/X disponibile.</p>'; return; }
    const pad = { l: 34, r: 12, t: 14, b: 30 };
    const barW = 22, gap = 6;
    const plotH = 170;
    const w = Math.max(300, pad.l + pad.r + daily.length * (barW + gap));
    const h = pad.t + plotH + pad.b;
    const maxLU = Math.max(...daily.map(d => d.v + d.p + d.x), 1);
    const svg = svgRoot(container, w, h, { bg: s.bg, cssHeight: h, maxWidth: w, preserveAspectRatio: 'xMinYMid meet' });

    // y gridlines
    for (let g = 0; g <= 4; g++) {
        const val = Math.round(maxLU * g / 4);
        const gy = pad.t + plotH - plotH * g / 4;
        svgEl('line', { x1: pad.l, x2: w - pad.r, y1: gy, y2: gy, stroke: s.grid, 'stroke-dasharray': '3,4' }, svg);
        svgEl('text', { x: pad.l - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: val }, svg);
    }
    daily.forEach((d, i) => {
        const x = pad.l + i * (barW + gap);
        const tot = d.v + d.p + d.x;
        let yCursor = pad.t + plotH;
        const segs = [['x', d.x, s.bad], ['p', d.p, s.p], ['v', d.v, s.v]]; // errors bottom, independent top
        segs.forEach(([k, val, col]) => {
            if (val <= 0) return;
            const segH = plotH * val / maxLU;
            yCursor -= segH;
            const r = svgEl('rect', { x, y: yCursor, width: barW, height: segH, fill: col, rx: s.organic ? 4 : 2, opacity: 0.92 }, svg);
            _title(r, `${formatDateEU(d.date + 'T00:00:00')}\nIndip.(V): ${d.v}  Prompt(P): ${d.p}  Err.(X): ${d.x}`);
        });
        if (i % Math.ceil(daily.length / 12 || 1) === 0)
            svgEl('text', { x: x + barW / 2, y: h - pad.b + 14, 'text-anchor': 'middle', 'font-size': 7.5, fill: s.textDim, text: d.date.slice(8) + '/' + d.date.slice(5, 7) }, svg);
    });
    _vizLegendChips(container, [['Indipendente', s.v], ['Con prompt', s.p], ['Errore', s.x]]);
}

function _vizLegendChips(container, items) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:8px; font-size:0.72rem; color:var(--text-secondary);';
    wrap.innerHTML = items.map(([l, c]) => `<span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:11px; height:11px; border-radius:3px; background:${c}; display:inline-block;"></span>${l}</span>`).join('');
    container.appendChild(wrap);
}

// 3) TIME-DELAY FADING — delay seconds trajectory over time
function vizTimeDelayFading(container, patient) {
    const s = skin();
    const series = vizTimeDelaySeries(patient);
    if (series.length < 1) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessuna seduta in Time Delay registrata.</p>'; return; }
    const pad = { l: 34, r: 14, t: 16, b: 34 };
    const plotW = Math.max(260, series.length * 30), plotH = 150;
    const w = pad.l + plotW + pad.r, h = pad.t + plotH + pad.b;
    const maxDelay = Math.max(...series.map(d => d.delay), 1);
    const svg = svgRoot(container, w, h, { bg: s.bg, cssHeight: h, maxWidth: w });

    for (let g = 0; g <= maxDelay; g += Math.max(1, Math.ceil(maxDelay / 5))) {
        const gy = pad.t + plotH - plotH * g / maxDelay;
        svgEl('line', { x1: pad.l, x2: w - pad.r, y1: gy, y2: gy, stroke: s.grid, 'stroke-dasharray': '3,4' }, svg);
        svgEl('text', { x: pad.l - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: g + 's' }, svg);
    }
    const stepX = series.length > 1 ? plotW / (series.length - 1) : 0;
    let path = '';
    series.forEach((d, i) => {
        const x = pad.l + (series.length > 1 ? i * stepX : plotW / 2);
        const y = pad.t + plotH - plotH * d.delay / maxDelay;
        path += (i === 0 ? 'M' : 'L') + ` ${x} ${y} `;
    });
    if (series.length > 1) svgEl('path', { d: path, fill: 'none', stroke: s.accent, 'stroke-width': 2, 'stroke-linejoin': 'round', opacity: 0.85 }, svg);
    series.forEach((d, i) => {
        const x = pad.l + (series.length > 1 ? i * stepX : plotW / 2);
        const y = pad.t + plotH - plotH * d.delay / maxDelay;
        const c = svgEl('circle', { cx: x, cy: y, r: 4, fill: pctSkinColor(d.pct, s), stroke: s.bg === 'transparent' ? '#1e1e2f' : s.bg, 'stroke-width': 1.2 }, svg);
        _title(c, `${formatDateEU(d.date + 'T00:00:00')}\nDelay: ${d.delay}s · ${d.pct}%\n${d.setName || ''}`);
    });
    const cap = document.createElement('div');
    cap.style.cssText = 'text-align:center; margin-top:6px; font-size:0.7rem; color:var(--text-secondary);';
    cap.textContent = 'Ritardo del prompt (s) nel tempo · colore = % della seduta';
    container.appendChild(cap);
}

// Generic radar drawer. axes:[{label, sub}], polygons:[{values[], color, label, dots}]
function _drawRadar(parentSvg, cx, cy, R, axes, polygons, s, opts) {
    opts = opts || {};
    const n = axes.length;
    const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
    [0.25, 0.5, 0.75, 1].forEach(rr => {
        let p = '';
        for (let i = 0; i < n; i++) { const a = ang(i); p += (i === 0 ? 'M' : 'L') + ` ${(cx + Math.cos(a) * R * rr).toFixed(1)} ${(cy + Math.sin(a) * R * rr).toFixed(1)} `; }
        svgEl('path', { d: p + 'Z', fill: 'none', stroke: s.grid, 'stroke-width': 1 }, parentSvg);
    });
    axes.forEach((ax, i) => {
        const a = ang(i);
        svgEl('line', { x1: cx, y1: cy, x2: cx + Math.cos(a) * R, y2: cy + Math.sin(a) * R, stroke: s.grid }, parentSvg);
        const lx = cx + Math.cos(a) * (R + opts.labelPad || R + 15), ly = cy + Math.sin(a) * (R + (opts.labelPad || 15));
        const anchor = Math.abs(Math.cos(a)) < 0.35 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
        const t = svgEl('text', { x: lx, y: ly + 3, 'text-anchor': anchor, 'font-size': opts.labelSize || 10, fill: s.text, 'font-weight': 600, text: ax.label }, parentSvg);
        if (ax.sub != null) svgEl('text', { x: lx, y: ly + (opts.labelSize || 10) + 5, 'text-anchor': anchor, 'font-size': (opts.labelSize || 10) - 2, fill: s.textDim, text: ax.sub }, parentSvg);
    });
    polygons.forEach(poly => {
        let dp = '';
        poly.values.forEach((v, i) => { const a = ang(i); const rr = R * Math.max(0, Math.min(100, v)) / 100; dp += (i === 0 ? 'M' : 'L') + ` ${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; });
        svgEl('path', { d: dp + 'Z', fill: poly.color, 'fill-opacity': poly.fillOpacity != null ? poly.fillOpacity : 0.22, stroke: poly.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, parentSvg);
        if (poly.dots !== false) poly.values.forEach((v, i) => {
            const a = ang(i); const rr = R * Math.max(0, Math.min(100, v)) / 100;
            const c = svgEl('circle', { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: opts.dotR || 3.2, fill: poly.dotColor || pctSkinColor(v, s) }, parentSvg);
            _title(c, `${axes[i].label}: ${Math.round(v)}%`);
        });
    });
}

// 4) DOMAIN PROFILE — macro radar (with optional start→recent overlay) + sub-radars per area
function vizDomainRadar(container, patient) {
    const s = skin();
    const sessions = patient.history || [];
    const cs = vizConstructScores(sessions);
    const ms = vizMacroScores(cs);
    const macroKeys = Object.keys(VIZ_MACROS).filter(k => ms[k]);
    if (macroKeys.length < 3) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Servono attività in almeno 3 aree per il profilo. Continua a registrare sedute in modalità diverse.</p>'; return; }

    const showProg = state._vizRadarProgress && sessions.length >= 6;
    // control row
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex; justify-content:center; margin-bottom:8px;';
    ctrl.innerHTML = `<button onclick="state._vizRadarProgress=${!showProg}; renderVizTab(state.patients.find(p=>p.id==='${patient.id}'))" style="padding:5px 12px; border-radius:8px; cursor:pointer; font-size:0.72rem; border:1px solid ${showProg ? 'var(--accent-color)' : 'rgba(255,255,255,0.12)'}; background:${showProg ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${showProg ? 'var(--accent-color)' : 'var(--text-secondary)'};"><i class="fa-solid fa-arrow-trend-up"></i> Progresso (inizio → recente)</button>`;
    container.appendChild(ctrl);

    // MAIN macro radar
    const size = 340, cx = size / 2, cy = size / 2 + 4, R = size / 2 - 58;
    const svg = svgRoot(container, size, size, { bg: s.bg, cssHeight: size, maxWidth: size });
    const axes = macroKeys.map(k => ({ label: VIZ_MACROS[k].short || k, sub: showProg ? null : ms[k].score + '%' }));

    let polygons;
    if (showProg) {
        const sorted = sessions.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        const half = Math.floor(sorted.length / 2);
        const early = vizMacroScores(vizConstructScores(sorted.slice(0, half)));
        const recent = vizMacroScores(vizConstructScores(sorted.slice(half)));
        polygons = [
            { values: macroKeys.map(k => early[k] ? early[k].score : 0), color: s.textDim, fillOpacity: 0.10, dots: false, label: 'Inizio' },
            { values: macroKeys.map(k => recent[k] ? recent[k].score : 0), color: s.accent, fillOpacity: 0.22, dotColor: s.accent, label: 'Recente' }
        ];
    } else {
        polygons = [{ values: macroKeys.map(k => ms[k].score), color: s.accent, fillOpacity: 0.24 }];
    }
    _drawRadar(svg, cx, cy, R, axes, polygons, s, { labelPad: 16, labelSize: 10, dotR: 3.4 });
    // macro icons at label anchors would overlap; keep textual.

    if (showProg) _vizLegendChips(container, [['Inizio', s.textDim], ['Recente', s.accent]]);
    _caption(container, showProg ? 'Confronto tra la prima e la seconda metà del periodo: più il poligono “Recente” è ampio, più il profilo cresce.' : 'Media per area cognitiva. Attiva “Progresso” per confrontare inizio e periodo recente.');

    // SUB-RADARS per macro-area with ≥3 measured constructs
    const bySub = {};
    Object.values(cs).forEach(c => (bySub[c.macro] = bySub[c.macro] || []).push(c));
    const richMacros = macroKeys.filter(k => (bySub[k] || []).length >= 3);
    if (richMacros.length) {
        const heading = document.createElement('div');
        heading.style.cssText = 'margin:16px 0 8px; font-size:0.85rem; color:var(--text-secondary); text-align:center; font-weight:600;';
        heading.innerHTML = '<i class="fa-solid fa-diagram-project"></i> Dettaglio per area';
        container.appendChild(heading);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px; justify-items:center;';
        container.appendChild(grid);
        richMacros.forEach(mk => {
            const subs = bySub[mk].slice().sort((a, b) => a.label.localeCompare(b.label));
            const cell = document.createElement('div');
            cell.style.cssText = `width:100%; max-width:230px; padding:8px; border-radius:12px; ${s.bg !== 'transparent' ? 'background:' + s.bg + ';' : 'background:rgba(255,255,255,0.02);'} border:1px solid ${VIZ_MACROS[mk].color}44;`;
            cell.innerHTML = `<div style="text-align:center; font-size:0.78rem; font-weight:700; color:${VIZ_MACROS[mk].color}; margin-bottom:2px;"><i class="fa-solid ${VIZ_MACROS[mk].icon}"></i> ${mk} <span style="color:var(--text-secondary); font-weight:400;">${ms[mk].score}%</span></div>`;
            grid.appendChild(cell);
            const ssz = 190, scx = ssz / 2, scy = ssz / 2 + 2, sR = ssz / 2 - 44;
            const ssvg = svgRoot(cell, ssz, ssz, { bg: 'transparent', cssHeight: ssz, maxWidth: ssz });
            _drawRadar(ssvg, scx, scy, sR, subs.map(c => ({ label: c.short, sub: c.score + '%' })),
                [{ values: subs.map(c => c.score), color: VIZ_MACROS[mk].color, fillOpacity: 0.2 }], s, { labelPad: 12, labelSize: 8, dotR: 2.6 });
        });
    }
}

// ============================================================
// VOCABULARY / PER-ITEM
// ============================================================
// 5a) Vocabulary list-heatmap (clinico) OR star sky (organic skins).
function vizVocabulary(container, patient) {
    const s = skin();
    const items = vizItemStats(patient);
    if (!items.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato per-item. Le modalità con dettaglio per stimolo lo popolano automaticamente.</p>'; return; }
    if (s.organic) return _vizVocabSky(container, items, s);
    return _vizVocabHeat(container, items, s);
}

function _vizVocabHeat(container, items, s) {
    const order = { difficile: 0, emergente: 1, acquisito: 2 };
    items.sort((a, b) => order[a.status] - order[b.status] || b.total - a.total);
    const counts = { acquisito: 0, emergente: 0, difficile: 0 };
    items.forEach(i => counts[i.status]++);
    const summary = document.createElement('div');
    summary.style.cssText = 'display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:12px;';
    summary.innerHTML = [['acquisito', 'Acquisiti', s.good], ['emergente', 'Emergenti', s.mid], ['difficile', 'Da rinforzare', s.bad]]
        .map(([k, l, c]) => `<div style="background:${c}22; border:1px solid ${c}55; border-radius:10px; padding:6px 12px; text-align:center; min-width:84px;"><div style="font-size:1.3rem; font-weight:800; color:${c};">${counts[k]}</div><div style="font-size:0.65rem; color:var(--text-secondary);">${l}</div></div>`).join('');
    container.appendChild(summary);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:6px;';
    items.forEach(it => {
        const col = it.status === 'acquisito' ? s.good : it.status === 'emergente' ? s.mid : s.bad;
        const spark = it.seq.slice(-8).map(v => v === 1 ? '●' : v === 0.5 ? '◐' : '○').join('');
        const chip = document.createElement('div');
        chip.style.cssText = `background:${col}1a; border-left:3px solid ${col}; border-radius:6px; padding:6px 8px; overflow:hidden;`;
        chip.innerHTML = `<div style="font-size:0.8rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_esc(it.label)}</div>` +
            `<div style="font-size:0.62rem; color:var(--text-secondary); margin-top:2px;">${Math.round(it.mastery * 100)}% · ${it.total}× <span style="letter-spacing:1px; color:${col};">${spark}</span></div>`;
        chip.title = `${it.label}\nAcquisizione: ${Math.round(it.mastery * 100)}%\nCorrette ${it.correct} · Prompt ${it.prompt} · Errori ${it.error}\nCategoria: ${it.cat}`;
        grid.appendChild(chip);
    });
    container.appendChild(grid);
}

// 5b) "Vocabulary sky" — each item a star; brightness = mastery, size = practice.
function _vizVocabSky(container, items, s) {
    const w = 360, h = 300, pad = 16;
    const svg = svgRoot(container, w, h, { bg: s.bg, cssHeight: h, maxWidth: w });
    // soft nebula clusters per category
    const cats = {}; items.forEach(it => (cats[it.cat] = cats[it.cat] || []).push(it));
    const catKeys = Object.keys(cats);
    const maxTotal = Math.max(...items.map(i => i.total), 1);
    catKeys.forEach((ck, ci) => {
        const cxBase = pad + 40 + ((_hashStr(ck) % 1000) / 1000) * (w - 80 - pad);
        const cyBase = pad + 30 + ((_hashStr(ck + 'y') % 1000) / 1000) * (h - 70 - pad);
        cats[ck].forEach((it, ii) => {
            const a = (_hashStr(it.label) % 1000) / 1000 * Math.PI * 2;
            const rad = 8 + ((_hashStr(it.label + 'r') % 1000) / 1000) * 34;
            let x = cxBase + Math.cos(a) * rad, y = cyBase + Math.sin(a) * rad;
            x = Math.max(pad + 6, Math.min(w - pad - 6, x)); y = Math.max(pad + 6, Math.min(h - pad - 22, y));
            const size = 1.6 + (it.total / maxTotal) * 4.5;
            const bright = 0.35 + it.mastery * 0.65;
            const col = pctSkinColor(Math.round(it.mastery * 100), s);
            const star = svgEl('circle', { cx: x, cy: y, r: size, fill: col, opacity: bright }, svg);
            svgEl('circle', { cx: x, cy: y, r: size * 2.4, fill: col, opacity: bright * 0.18 }, svg); // glow
            _title(star, `${it.label}\n${Math.round(it.mastery * 100)}% · praticato ${it.total}×\nCategoria: ${it.cat}`);
            it._sx = x; it._sy = y; it._ssize = size;
        });
    });
    // Label the most-practiced words so the sky is anchored to real content.
    items.slice().sort((a, b) => b.total - a.total).slice(0, 6).forEach(it => {
        if (it._sx == null) return;
        svgEl('text', { x: it._sx, y: it._sy - it._ssize - 3, 'text-anchor': 'middle', 'font-size': 7, fill: s.text, opacity: 0.85, text: it.label.length > 12 ? it.label.slice(0, 11) + '…' : it.label }, svg);
    });
    // Explicit how-to-read legend (the metaphor alone wasn't self-evident).
    const leg = document.createElement('div');
    leg.style.cssText = 'display:flex; gap:14px; justify-content:center; align-items:center; flex-wrap:wrap; margin-top:8px; font-size:0.68rem; color:var(--text-secondary);';
    leg.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:6px; height:6px; border-radius:50%; background:${s.bad}; opacity:0.45; display:inline-block;"></span> piccola e spenta = poco praticato / in difficoltà</span>
        <span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; border-radius:50%; background:${s.good}; box-shadow:0 0 6px ${s.good}; display:inline-block;"></span> grande e brillante = molto praticato e acquisito</span>
        <span style="display:inline-flex; align-items:center; gap:5px;"><span style="display:inline-block; width:56px; height:7px; border-radius:4px; background:linear-gradient(90deg, ${s.bad}, ${s.mid}, ${s.good});"></span> colore = acquisizione</span>`;
    container.appendChild(leg);
    _caption(container, 'Ogni stella è una parola, raggruppata per set. Tocca una stella per i dettagli.');
}

// ============================================================
// NARRATIVE "FRAGAPANE" VISUALS
// ============================================================
// 6) DAY GLYPHS — one organic radial glyph per day (a constellation row).
function vizDayGlyphs(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient);
    if (!daily.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato.</p>'; return; }
    const maxLU = Math.max(...daily.map(d => d.totalLU), 1);
    const maxSess = Math.max(...daily.map(d => d.sessions), 1);
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex; flex-wrap:wrap; gap:10px; justify-content:center; padding:14px; border-radius:14px; ${s.bg !== 'transparent' ? 'background:' + s.bg + ';' : ''}`;
    container.appendChild(wrap);

    daily.forEach(d => {
        const sz = 70, cx = sz / 2, cy = sz / 2;
        const cellSvg = svgRoot(wrap, sz, sz + 14, { center: false, cssHeight: sz + 14, maxWidth: sz, preserveAspectRatio: 'xMidYMid meet' });
        cellSvg.style.margin = '0';
        cellSvg.style.width = sz + 'px';
        const rays = Math.max(3, d.sessions);
        const baseR = 8 + (d.totalLU / maxLU) * 8;
        const rayLen = 6 + (d.totalLU / maxLU) * 16;
        const col = pctSkinColor(d.pct, s);
        // petals/rays
        for (let i = 0; i < rays; i++) {
            const a = -Math.PI / 2 + i * 2 * Math.PI / rays;
            const x1 = cx + Math.cos(a) * baseR, y1 = cy + Math.sin(a) * baseR;
            const len = rayLen * (0.7 + 0.3 * ((d.sessions ? (i % d.sessions) + 1 : 1) / Math.max(1, d.sessions)));
            const x2 = cx + Math.cos(a) * (baseR + len), y2 = cy + Math.sin(a) * (baseR + len);
            if (s.organic) {
                // teardrop petal via quadratic curves
                const ox = Math.cos(a + Math.PI / 2), oy = Math.sin(a + Math.PI / 2);
                const wgt = 2.6;
                const d1 = `M ${x1} ${y1} Q ${(x1 + x2) / 2 + ox * wgt} ${(y1 + y2) / 2 + oy * wgt} ${x2} ${y2} Q ${(x1 + x2) / 2 - ox * wgt} ${(y1 + y2) / 2 - oy * wgt} ${x1} ${y1} Z`;
                svgEl('path', { d: d1, fill: col, opacity: 0.55 }, cellSvg);
            } else {
                svgEl('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 }, cellSvg);
            }
        }
        // core
        const core = svgEl('circle', { cx, cy, r: baseR, fill: col, opacity: 0.92 }, cellSvg);
        _title(core, `${formatDateEU(d.date + 'T00:00:00')}\n${d.pct}% · ${d.sessions} sedute · ${d.totalLU} LU${d.tag ? '\n' + d.tag.symbol + ' ' + d.tag.label : ''}`);
        if (d.hasNote) svgEl('circle', { cx, cy, r: baseR * 0.4, fill: s.bg === 'transparent' ? '#fff' : s.bg, opacity: 0.85 }, cellSvg);
        if (d.tag) svgEl('circle', { cx: cx, cy: 4, r: 3, fill: d.tag.color }, cellSvg);
        if (d.outlier) svgEl('circle', { cx, cy, r: baseR + rayLen + 3, fill: 'none', stroke: s.bad, 'stroke-width': 1, 'stroke-dasharray': '2,3' }, cellSvg);
        svgEl('text', { x: cx, y: sz + 10, 'text-anchor': 'middle', 'font-size': 8, fill: s.text, text: d.date.slice(8) + '/' + d.date.slice(5, 7) }, cellSvg);
    });
}

// 7) GROWTH TREE — therapy journey as a growing branch; each day a leaf.
function vizGrowthTree(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient);
    if (!daily.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato.</p>'; return; }
    const maxLU = Math.max(...daily.map(d => d.totalLU), 1);
    const segH = Math.max(14, Math.min(34, 520 / daily.length));
    const w = 340, h = 60 + daily.length * segH + 30;
    const cx = w / 2;
    const svg = svgRoot(container, w, h, { bg: s.bg, cssHeight: h, maxWidth: w });

    const baseY = h - 24, topY = 40;
    // trunk (slightly wavy)
    let trunk = `M ${cx} ${baseY}`;
    daily.forEach((d, i) => { const y = baseY - (i + 1) * segH; const sway = Math.sin(i * 0.6) * 6; trunk += ` Q ${cx + sway} ${y + segH / 2} ${cx + Math.sin((i + 1) * 0.6) * 6} ${y}`; });
    svgEl('path', { d: trunk, fill: 'none', stroke: s.organic ? '#8a6a4a' : s.axis, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.8 }, svg);

    daily.forEach((d, i) => {
        const y = baseY - (i + 1) * segH;
        const tx = cx + Math.sin((i + 1) * 0.6) * 6;
        const side = i % 2 === 0 ? 1 : -1;
        const len = 14 + (d.totalLU / maxLU) * 46;
        const ex = tx + side * len, ey = y - segH * 0.4;
        const col = pctSkinColor(d.pct, s);
        // branch
        svgEl('path', { d: `M ${tx} ${y} Q ${tx + side * len * 0.5} ${y - 2} ${ex} ${ey}`, fill: 'none', stroke: s.organic ? '#8a6a4a' : col, 'stroke-width': 2, opacity: 0.7, 'stroke-linecap': 'round' }, svg);
        // leaf (size ~ sessions, colour ~ %)
        const leafR = 4 + Math.min(6, d.sessions);
        if (s.organic) {
            const ang = Math.atan2(ey - y, ex - tx);
            const ox = Math.cos(ang + Math.PI / 2), oy = Math.sin(ang + Math.PI / 2);
            const lx = ex + Math.cos(ang) * leafR, ly = ey + Math.sin(ang) * leafR;
            svgEl('path', { d: `M ${ex} ${ey} Q ${(ex + lx) / 2 + ox * leafR} ${(ey + ly) / 2 + oy * leafR} ${lx} ${ly} Q ${(ex + lx) / 2 - ox * leafR} ${(ey + ly) / 2 - oy * leafR} ${ex} ${ey} Z`, fill: col, opacity: 0.85 }, svg);
        } else {
            svgEl('circle', { cx: ex, cy: ey, r: leafR, fill: col, opacity: 0.85 }, svg);
        }
        const leaf = svgEl('circle', { cx: ex, cy: ey, r: leafR, fill: 'transparent' }, svg);
        _title(leaf, `${formatDateEU(d.date + 'T00:00:00')}\n${d.pct}% · ${d.sessions} sedute · ${d.totalLU} LU`);
        if (d.hasNote) svgEl('circle', { cx: ex + side * (leafR + 3), cy: ey, r: 2, fill: s.accent }, svg); // bud = note
        if (d.tag) svgEl('circle', { cx: ex, cy: ey - leafR - 3, r: 2.4, fill: d.tag.color }, svg);
    });
    // crown
    svgEl('circle', { cx: cx + Math.sin((daily.length) * 0.6) * 6, cy: topY, r: 6, fill: s.good, opacity: 0.5 }, svg);
    const cap = document.createElement('div');
    cap.style.cssText = 'text-align:center; margin-top:6px; font-size:0.7rem; color:var(--text-secondary);';
    cap.textContent = 'Dal basso verso l\'alto nel tempo · foglia = giornata (colore = %, grandezza = sedute)';
    container.appendChild(cap);
}

// ============================================================
// SHARED REFINEMENTS: smooth curves, soft caption
// ============================================================
// Catmull-Rom → cubic Bézier smoothing through points [[x,y],...].
function _smooth(pts, cont) {
    if (!pts.length) return '';
    if (pts.length < 3) return (cont ? 'L' : 'M') + ` ${pts[0][0]} ${pts[0][1]}` + pts.slice(1).map(p => ` L ${p[0]} ${p[1]}`).join('');
    let d = (cont ? 'L' : 'M') + ` ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
}
function _caption(container, text) {
    const cap = document.createElement('div');
    cap.style.cssText = 'text-align:center; margin-top:8px; font-size:0.7rem; color:var(--text-secondary); font-style:italic; opacity:0.85;';
    cap.textContent = text;
    container.appendChild(cap);
}

// ============================================================
// NEW ORGANIC ALTERNATIVES (same data, different form)
// ============================================================
// 8) DAILY ROSE — Nightingale coxcomb: each day a petal around a circle.
function vizDailyRose(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient);
    if (!daily.length) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Nessun dato.</p>'; return; }
    const size = 340, cx = size / 2, cy = size / 2, Rmax = size / 2 - 30, Rmin = 14;
    const svg = svgRoot(container, size, size, { bg: s.bg, cssHeight: size, maxWidth: 520 });
    const maxLU = Math.max(...daily.map(d => d.totalLU), 1);
    const n = daily.length;
    const slice = 2 * Math.PI / n;
    // guide rings
    [0.5, 1].forEach(rr => svgEl('circle', { cx, cy, r: Rmin + (Rmax - Rmin) * rr, fill: 'none', stroke: s.grid, 'stroke-width': 1 }, svg));
    daily.forEach((d, i) => {
        const Ri = Rmin + (Rmax - Rmin) * Math.sqrt(d.totalLU / maxLU);
        const a0 = -Math.PI / 2 + i * slice + slice * 0.08;
        const a1 = -Math.PI / 2 + (i + 1) * slice - slice * 0.08;
        const x0 = cx + Math.cos(a0) * Ri, y0 = cy + Math.sin(a0) * Ri;
        const x1 = cx + Math.cos(a1) * Ri, y1 = cy + Math.sin(a1) * Ri;
        const ix0 = cx + Math.cos(a0) * Rmin, iy0 = cy + Math.sin(a0) * Rmin;
        const ix1 = cx + Math.cos(a1) * Rmin, iy1 = cy + Math.sin(a1) * Rmin;
        const col = pctSkinColor(d.pct, s);
        const large = (a1 - a0) > Math.PI ? 1 : 0;
        const path = svgEl('path', {
            d: `M ${ix0} ${iy0} L ${x0} ${y0} A ${Ri} ${Ri} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${Rmin} ${Rmin} 0 ${large} 0 ${ix0} ${iy0} Z`,
            fill: col, opacity: 0.9, stroke: s.bg === 'transparent' ? '#1e1e2f' : s.bg, 'stroke-width': 0.8
        }, svg);
        _title(path, `${formatDateEU(d.date + 'T00:00:00')}\n${d.pct}% · ${d.sessions} sedute · ${d.totalLU} LU${d.tag ? '\n' + d.tag.symbol + ' ' + d.tag.label : ''}`);
        const am = (a0 + a1) / 2;
        if (d.tag) svgEl('circle', { cx: cx + Math.cos(am) * (Ri + 6), cy: cy + Math.sin(am) * (Ri + 6), r: 2.6, fill: d.tag.color }, svg);
        if (d.hasNote) svgEl('circle', { cx: cx + Math.cos(am) * (Rmin + 4), cy: cy + Math.sin(am) * (Rmin + 4), r: 1.6, fill: s.accent }, svg);
    });
    svgEl('circle', { cx, cy, r: Rmin - 3, fill: 'none', stroke: s.axis, 'stroke-width': 1, opacity: 0.4 }, svg);
    _caption(container, 'Ogni petalo è una giornata (in senso orario) · lunghezza = LU · colore = %');
}

// 9) INDEPENDENCE STREAM — flowing streamgraph of V/P/X (organic alt to bars).
function vizIndependenceStream(container, patient) {
    const s = skin();
    const daily = vizDailyData(patient).filter(d => (d.v + d.p + d.x) > 0);
    if (daily.length < 2) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Servono almeno 2 giornate con dati V/P/X.</p>'; return; }
    const pad = { l: 12, r: 12, t: 16, b: 30 };
    const plotW = Math.max(280, daily.length * 26), plotH = 180;
    const w = pad.l + plotW + pad.r, h = pad.t + plotH + pad.b;
    const svg = svgRoot(container, w, h, { bg: s.bg, maxWidth: Math.max(w, 680) });
    const maxTot = Math.max(...daily.map(d => d.v + d.p + d.x), 1);
    const mid = pad.t + plotH / 2;
    const sc = (plotH * 0.86) / maxTot;
    const stepX = daily.length > 1 ? plotW / (daily.length - 1) : 0;
    const xAt = i => pad.l + (daily.length > 1 ? i * stepX : plotW / 2);
    // layer order bottom→top: x (errors), p (prompt), v (independent), centered baseline
    const layers = [['x', s.x], ['p', s.p], ['v', s.v]];
    // baseline: centre the total stack
    const base = daily.map(d => mid + (d.v + d.p + d.x) * sc / 2);
    let cursor = base.slice();
    layers.forEach(([key, col]) => {
        const bot = daily.map((d, i) => [xAt(i), cursor[i]]);
        const top = daily.map((d, i) => { cursor[i] -= d[key] * sc; return [xAt(i), cursor[i]]; });
        const d = _smooth(top) + ' ' + _smooth(bot.slice().reverse(), true) + ' Z';
        const area = svgEl('path', { d, fill: col, opacity: 0.9 }, svg);
        _title(area, key === 'v' ? 'Indipendente (V)' : key === 'p' ? 'Con prompt (P)' : 'Errore (X)');
    });
    daily.forEach((d, i) => {
        if (i % Math.ceil(daily.length / 10 || 1) === 0)
            svgEl('text', { x: xAt(i), y: h - pad.b + 16, 'text-anchor': 'middle', 'font-size': 7.5, fill: s.textDim, text: d.date.slice(8) + '/' + d.date.slice(5, 7) }, svg);
    });
    _vizLegendChips(container, [['Indipendente', s.v], ['Con prompt', s.p], ['Errore', s.x]]);
    _caption(container, 'Il flusso si allarga con il volume · lo strato verde che cresce = più autonomia');
}

// ============================================================
// TAB RENDERER + sub-nav + skin selector
// ============================================================
const VIZ_VIEWS = [
    { id: 'calendar', label: 'Calendario', icon: 'fa-calendar', fn: vizCalendarHeatmap, group: 'Giornaliero' },
    { id: 'rose', label: 'Rosa giornate', icon: 'fa-fan', fn: vizDailyRose, group: 'Giornaliero' },
    { id: 'glyphs', label: 'Glifi giornata', icon: 'fa-snowflake', fn: vizDayGlyphs, group: 'Narrativo' },
    { id: 'tree', label: 'Albero', icon: 'fa-tree', fn: vizGrowthTree, group: 'Narrativo' },
    { id: 'independence', label: 'Indipendenza V/P/X', icon: 'fa-layer-group', fn: vizIndependenceArea, group: 'Clinico' },
    { id: 'stream', label: 'Fiume V/P/X', icon: 'fa-water', fn: vizIndependenceStream, group: 'Clinico' },
    { id: 'timedelay', label: 'Time-Delay fading', icon: 'fa-hourglass-half', fn: vizTimeDelayFading, group: 'Clinico' },
    { id: 'radar', label: 'Profilo domini', icon: 'fa-chart-pie', fn: vizDomainRadar, group: 'Profilo' },
    { id: 'vocab', label: 'Vocabolario', icon: 'fa-spell-check', fn: vizVocabulary, group: 'Per-item' }
];

// ---- Temporal filter shared by all viz ----
function vizFilterRange() {
    const f = state._vizFilter || 'all';
    const now = new Date();
    const today = getDateKey(now);
    const back = d => getDateKey(new Date(now.getTime() - d * 86400000));
    if (f === 'week') return { from: back(7), to: today };
    if (f === 'month') return { from: back(30), to: today };
    if (f === 'quarter') return { from: back(90), to: today };
    if (f === 'year') return { from: back(365), to: today };
    if (f === 'custom') return { from: state._vizFrom || '', to: state._vizTo || today };
    return { from: '', to: '' };
}
function vizFilteredPatient(patient) {
    const { from, to } = vizFilterRange();
    if (!from && !to) return patient;
    const history = (patient.history || []).filter(h => {
        const dk = getDateKey(h.date);
        return (!from || dk >= from) && (!to || dk <= to);
    });
    return Object.assign({}, patient, { history });
}
window.setVizFilter = (f, pid) => { state._vizFilter = f; const p = state.patients.find(x => x.id === pid); if (p) renderVizTab(p); };

function renderVizTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;
    const cur = state._vizView || 'calendar';
    const sk = getVizSkin();
    const tf = state._vizFilter || 'all';
    const rerender = `renderVizTab(state.patients.find(p=>p.id==='${patient.id}'))`;

    const skinBtns = Object.keys(VIZ_SKINS).map(k => {
        const sd = VIZ_SKINS[k];
        const on = k === sk;
        return `<button onclick="setVizSkin('${k}'); ${rerender}" title="${sd.label}" style="padding:5px 10px; border-radius:8px; cursor:pointer; font-size:0.72rem; border:1px solid ${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.12)'}; background:${on ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${on ? 'var(--accent-color)' : 'var(--text-secondary)'};"><i class="fa-solid ${sd.icon}"></i> ${sd.label}</button>`;
    }).join('');

    const _tf = (val, label) => `<button onclick="setVizFilter('${val}', '${patient.id}')" style="padding:4px 10px; border-radius:6px; font-size:0.7rem; cursor:pointer; border:1px solid ${tf === val ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${tf === val ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${tf === val ? 'var(--accent-color)' : 'var(--text-secondary)'}; font-weight:${tf === val ? '700' : '400'};">${label}</button>`;
    const filterBar = `<div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-bottom:10px; background:rgba(0,0,0,0.2); padding:6px 8px; border-radius:10px;">
        <span style="font-size:0.7rem; color:var(--text-secondary);"><i class="fa-solid fa-filter"></i></span>
        ${_tf('week', 'Sett.')}${_tf('month', 'Mese')}${_tf('quarter', '3 mesi')}${_tf('year', 'Anno')}${_tf('custom', 'Da-A')}${_tf('all', 'Tutto')}
    </div>${tf === 'custom' ? `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; font-size:0.72rem; color:var(--text-secondary);">
        Da <input type="date" value="${state._vizFrom || ''}" onchange="state._vizFrom=this.value; ${rerender}" style="padding:4px; border-radius:6px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;">
        A <input type="date" value="${state._vizTo || ''}" onchange="state._vizTo=this.value; ${rerender}" style="padding:4px; border-radius:6px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;">
    </div>` : ''}`;

    // Grouped view nav
    let lastGroup = null, viewBtns = '';
    VIZ_VIEWS.forEach(v => {
        if (v.group !== lastGroup) { viewBtns += `<span style="font-size:0.62rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; align-self:center; margin:0 2px 0 6px; opacity:0.6; white-space:nowrap;">${v.group}</span>`; lastGroup = v.group; }
        const on = v.id === cur;
        viewBtns += `<button onclick="selectVizView('${v.id}', '${patient.id}')" style="padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.74rem; white-space:nowrap; border:1px solid ${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.03)'}; color:${on ? '#fff' : 'var(--text-secondary)'};"><i class="fa-solid ${v.icon}"></i> ${v.label}</button>`;
    });

    content.innerHTML = `
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
            <span style="font-size:0.72rem; color:var(--text-secondary);"><i class="fa-solid fa-palette"></i> Stile:</span>
            ${skinBtns}
        </div>
        ${filterBar}
        <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:14px; -webkit-overflow-scrolling:touch; align-items:center;">${viewBtns}</div>
        <div id="viz-canvas" style="min-height:120px;"></div>`;

    const canvas = document.getElementById('viz-canvas');
    const view = VIZ_VIEWS.find(v => v.id === cur) || VIZ_VIEWS[0];
    const fp = vizFilteredPatient(patient);
    if (!(fp.history || []).length) { canvas.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:24px;">Nessuna seduta nel periodo selezionato.</p>'; return; }
    try { view.fn(canvas, fp); }
    catch (e) { canvas.innerHTML = `<p style="color:var(--danger-color); text-align:center; padding:20px;">Errore nel disegno: ${_esc(e.message)}</p>`; console.error('viz error', e); }
}
window.renderVizTab = renderVizTab;
window.selectVizView = (id, pid) => { state._vizView = id; const p = state.patients.find(x => x.id === pid); if (p) renderVizTab(p); };

// expose extractors for testing
window._vizApi = {
    vizDailyData, vizItemStats, vizDomainStats, vizTimeDelaySeries, VIZ_VIEWS, VIZ_SKINS,
    // drawing toolkit for add-on visualizations (js/dataviz-extra.js)
    svgRoot, svgEl, skin, pctSkinColor, _smooth, _caption, _title, _vizLegendChips, _esc
};
