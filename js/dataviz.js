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
        preserveAspectRatio: opts.preserveAspectRatio || 'xMidYMid meet',
        width: '100%', height: opts.cssHeight || h
    });
    svg.style.display = 'block';
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

// Cognitive domains: map each mode to a domain, average % per domain.
const VIZ_DOMAINS = {
    'Denominazione': ['ran', 'ran_intensivo', 'fluenza', 'tact'],
    'Memoria': ['memory', 'ricorda', 'memoria_lavoro', 'sequenze'],
    'Linguaggio': ['categorizzazione', 'intruso', 'singolare_plurale', 'pool_intraverbal', 'intraverbal_scenari', 'search_find', 'tombola', 'tombola_sonora', 'pool_random'],
    'Inibizione': ['go_nogo', 'stroop_numerico', 'stroop_etichetta'],
    'Spaziale': ['topologia', 'topologia_comp', 'zoom']
};
function vizDomainStats(patient) {
    const history = patient.history || [];
    const dom2mode = {};
    Object.keys(VIZ_DOMAINS).forEach(d => VIZ_DOMAINS[d].forEach(m => dom2mode[m] = d));
    const agg = {};
    history.forEach(h => {
        const d = dom2mode[h.mode];
        if (!d) return;
        const a = agg[d] || (agg[d] = { sum: 0, n: 0 });
        a.sum += (h.percentage != null ? h.percentage : (h.total ? h.correct / h.total * 100 : 0));
        a.n++;
    });
    return Object.keys(VIZ_DOMAINS).filter(d => agg[d]).map(d => ({ domain: d, pct: Math.round(agg[d].sum / agg[d].n), n: agg[d].n }));
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
    const last = new Date(daily[daily.length - 1].date + 'T00:00:00');
    // Start grid on the Monday on/before first date.
    const start = new Date(first); const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow);
    const cell = 15, gap = 3, leftPad = 28, topPad = 18;
    const totalDays = Math.round((last - start) / 86400000) + 1;
    const weeks = Math.ceil((totalDays + ((start.getDay() + 6) % 7)) / 7) + 1;
    const w = leftPad + weeks * (cell + gap) + 6;
    const h = topPad + 7 * (cell + gap) + 6;
    const svg = svgRoot(container, w, h, { bg: s.bg, cssHeight: h, maxWidth: w });

    const dayLabels = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
    dayLabels.forEach((lb, i) => {
        if (i % 2 === 0) svgEl('text', { x: leftPad - 6, y: topPad + i * (cell + gap) + cell - 3, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: lb }, svg);
    });

    let lastMonth = -1;
    for (let wi = 0; wi < weeks; wi++) {
        for (let di = 0; di < 7; di++) {
            const cur = new Date(start); cur.setDate(start.getDate() + wi * 7 + di);
            if (cur < first || cur > last) {
                // still draw faint empty cell for grid continuity within range only
            }
            const dk = cur.toISOString().split('T')[0];
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
            // month label on first row when month changes
            if (di === 0 && cur.getMonth() !== lastMonth) {
                lastMonth = cur.getMonth();
                const mn = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][cur.getMonth()];
                svgEl('text', { x, y: topPad - 6, 'font-size': 8, fill: s.textDim, text: mn }, svg);
            }
        }
    }
    _vizLegendGradient(container, s, 'Bassa', 'Alta % giornaliera');
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

// 4) DOMAIN RADAR — performance profile across cognitive domains
function vizDomainRadar(container, patient) {
    const s = skin();
    const stats = vizDomainStats(patient);
    if (stats.length < 3) { container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">Servono almeno 3 domini con dati per il profilo radar.</p>'; return; }
    const size = 300, cx = size / 2, cy = size / 2 + 6, R = 105;
    const svg = svgRoot(container, size, size, { bg: s.bg, cssHeight: size, maxWidth: size });
    const n = stats.length;
    const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
    // rings
    [0.25, 0.5, 0.75, 1].forEach(rr => {
        let p = '';
        for (let i = 0; i < n; i++) { const a = ang(i); p += (i === 0 ? 'M' : 'L') + ` ${cx + Math.cos(a) * R * rr} ${cy + Math.sin(a) * R * rr} `; }
        p += 'Z';
        svgEl('path', { d: p, fill: 'none', stroke: s.grid, 'stroke-width': 1 }, svg);
    });
    // axes + labels
    stats.forEach((st, i) => {
        const a = ang(i);
        svgEl('line', { x1: cx, y1: cy, x2: cx + Math.cos(a) * R, y2: cy + Math.sin(a) * R, stroke: s.grid }, svg);
        const lx = cx + Math.cos(a) * (R + 16), ly = cy + Math.sin(a) * (R + 16);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
        svgEl('text', { x: lx, y: ly + 3, 'text-anchor': anchor, 'font-size': 10, fill: s.text, text: st.domain }, svg);
        svgEl('text', { x: lx, y: ly + 14, 'text-anchor': anchor, 'font-size': 8, fill: s.textDim, text: st.pct + '%' }, svg);
    });
    // data polygon
    let dp = '';
    stats.forEach((st, i) => { const a = ang(i); const rr = R * st.pct / 100; dp += (i === 0 ? 'M' : 'L') + ` ${cx + Math.cos(a) * rr} ${cy + Math.sin(a) * rr} `; });
    dp += 'Z';
    svgEl('path', { d: dp, fill: s.accent, 'fill-opacity': 0.25, stroke: s.accent, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    stats.forEach((st, i) => { const a = ang(i); const rr = R * st.pct / 100; const c = svgEl('circle', { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: 3.5, fill: pctSkinColor(st.pct, s) }, svg); _title(c, `${st.domain}: ${st.pct}% (${st.n} sedute)`); });
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
        });
    });
    const cap = document.createElement('div');
    cap.style.cssText = 'text-align:center; margin-top:6px; font-size:0.7rem; color:var(--text-secondary);';
    cap.textContent = 'Ogni stella è uno stimolo · luminosità = acquisizione · grandezza = volte praticato';
    container.appendChild(cap);
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
// TAB RENDERER + sub-nav + skin selector
// ============================================================
const VIZ_VIEWS = [
    { id: 'calendar', label: 'Calendario', icon: 'fa-calendar', fn: vizCalendarHeatmap, group: 'Giornaliero' },
    { id: 'glyphs', label: 'Glifi giornata', icon: 'fa-snowflake', fn: vizDayGlyphs, group: 'Narrativo' },
    { id: 'tree', label: 'Albero', icon: 'fa-tree', fn: vizGrowthTree, group: 'Narrativo' },
    { id: 'independence', label: 'Indipendenza V/P/X', icon: 'fa-layer-group', fn: vizIndependenceArea, group: 'Clinico' },
    { id: 'timedelay', label: 'Time-Delay fading', icon: 'fa-hourglass-half', fn: vizTimeDelayFading, group: 'Clinico' },
    { id: 'radar', label: 'Profilo domini', icon: 'fa-chart-pie', fn: vizDomainRadar, group: 'Clinico' },
    { id: 'vocab', label: 'Vocabolario', icon: 'fa-spell-check', fn: vizVocabulary, group: 'Per-item' }
];

function renderVizTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;
    const cur = state._vizView || 'calendar';
    const sk = getVizSkin();

    const skinBtns = Object.keys(VIZ_SKINS).map(k => {
        const sd = VIZ_SKINS[k];
        const on = k === sk;
        return `<button onclick="setVizSkin('${k}'); renderVizTab(state.patients.find(p=>p.id==='${patient.id}'))" title="${sd.label}" style="padding:5px 10px; border-radius:8px; cursor:pointer; font-size:0.72rem; border:1px solid ${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.12)'}; background:${on ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${on ? 'var(--accent-color)' : 'var(--text-secondary)'};"><i class="fa-solid ${sd.icon}"></i> ${sd.label}</button>`;
    }).join('');

    const viewBtns = VIZ_VIEWS.map(v => {
        const on = v.id === cur;
        return `<button onclick="selectVizView('${v.id}', '${patient.id}')" style="padding:6px 10px; border-radius:8px; cursor:pointer; font-size:0.74rem; white-space:nowrap; border:1px solid ${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${on ? 'var(--accent-color)' : 'rgba(255,255,255,0.03)'}; color:${on ? '#fff' : 'var(--text-secondary)'};"><i class="fa-solid ${v.icon}"></i> ${v.label}</button>`;
    }).join('');

    content.innerHTML = `
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
            <span style="font-size:0.72rem; color:var(--text-secondary);"><i class="fa-solid fa-palette"></i> Stile:</span>
            ${skinBtns}
        </div>
        <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:14px; -webkit-overflow-scrolling:touch;">${viewBtns}</div>
        <div id="viz-canvas" style="min-height:120px;"></div>`;

    const canvas = document.getElementById('viz-canvas');
    const view = VIZ_VIEWS.find(v => v.id === cur) || VIZ_VIEWS[0];
    try { view.fn(canvas, patient); }
    catch (e) { canvas.innerHTML = `<p style="color:var(--danger-color); text-align:center; padding:20px;">Errore nel disegno: ${_esc(e.message)}</p>`; console.error('viz error', e); }
}
window.renderVizTab = renderVizTab;
window.selectVizView = (id, pid) => { state._vizView = id; const p = state.patients.find(x => x.id === pid); if (p) renderVizTab(p); };

// expose extractors for testing
window._vizApi = { vizDailyData, vizItemStats, vizDomainStats, vizTimeDelaySeries, VIZ_VIEWS, VIZ_SKINS };
