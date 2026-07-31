// === ADD-ON VISUALIZATIONS (extends js/dataviz.js via window._vizApi) ===
(function () {
    const A = window._vizApi;
    if (!A) return;
    const { svgRoot, svgEl, skin, pctSkinColor, _smooth, _caption, _title, _vizLegendChips, _esc, vizDailyData } = A;

    // ------------------------------------------------------------
    // SHARED HELPERS
    // ------------------------------------------------------------
    // Percentage for a single session record, computed defensively: legacy
    // records may be missing `percentage`, or even `correct`/`total`.
    function pct(h) {
        if (h == null) return 0;
        if (typeof h.percentage === 'number' && !isNaN(h.percentage)) return h.percentage;
        const total = h.total || 0;
        if (total > 0) return Math.round(((h.correct || 0) / total) * 100);
        return 0;
    }

    // Group patient.history into per-activity buckets: same stimulus set,
    // mode and delivery condition (independent / time-delay). Each group's
    // sessions are sorted chronologically so callers can read trajectories.
    function activityGroups(patient) {
        const history = (patient && patient.history) || [];
        const map = {};
        history.forEach(h => {
            const key = `${h.setName || '—'}::${h.mode || '—'}::${h.sessionType || 'independent'}`;
            if (!map[key]) map[key] = { key, setName: h.setName || '—', mode: h.mode || '—', sessionType: h.sessionType || 'independent', sessions: [] };
            map[key].sessions.push(h);
        });
        const groups = Object.values(map);
        groups.forEach(g => g.sessions.sort((a, b) => new Date(a.date) - new Date(b.date)));
        return groups;
    }

    // Condition label for the variant-comparison view: field size wins when
    // present (RAN-style sessions), otherwise time-delay seconds vs plain
    // independent practice.
    function conditionOf(h) {
        if (h.fieldSize != null && h.fieldSize !== '') return 'Campo ' + h.fieldSize;
        if (h.sessionType === 'timedelay') return 'TD ' + (h.timeDelaySeconds || 0) + 's';
        return 'Indip.';
    }

    // Monday-of-the-week key (local calendar), used to bucket long histories
    // into weekly columns for the day/activity matrix.
    function weekKeyOf(dk) {
        const dt = new Date(dk + 'T00:00:00');
        const dow = (dt.getDay() + 6) % 7; // 0 = Monday
        const monday = new Date(dt);
        monday.setDate(dt.getDate() - dow);
        return getDateKey(monday);
    }

    function emptyMsg(container, text) {
        container.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding:20px;">${_esc(text)}</p>`;
    }

    // ------------------------------------------------------------
    // 1) LEARNING CURVES — small multiples, one mini-panel per activity.
    // ------------------------------------------------------------
    function vizLearningCurves(container, patient) {
        const s = skin();
        const threshold = patient.criterionThreshold || 90;
        const groups = activityGroups(patient).filter(g => g.sessions.length >= 3);
        if (!groups.length) { emptyMsg(container, 'Servono almeno 3 sedute nella stessa attività per tracciare una curva di apprendimento.'); return; }

        const panels = groups.map(g => {
            const series = g.sessions.slice(-20).map(h => ({ pct: pct(h), date: h.date }));
            const avg = arr => arr.reduce((a, b) => a + b.pct, 0) / arr.length;
            const trend = avg(series.slice(-3)) - avg(series.slice(0, 3));
            return { g, series, trend, lastPct: series[series.length - 1].pct };
        });
        panels.sort((a, b) => a.trend - b.trend);
        const shown = panels.slice(0, 12);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(190px,1fr)); gap:10px;';
        container.appendChild(grid);

        shown.forEach(p => {
            const cell = document.createElement('div');
            cell.style.cssText = `border-radius:10px; padding:6px 8px 4px; ${s.bg !== 'transparent' ? 'background:' + s.bg + ';' : 'background:rgba(var(--ink-rgb),0.02);'} border:1px solid ${s.grid};`;
            const fullName = p.g.setName;
            const name = fullName.length > 18 ? fullName.slice(0, 17) + '…' : fullName;
            const modeLbl = p.g.mode + (p.g.sessionType === 'timedelay' ? ' · TD' : '');
            const trendStr = p.trend > 3 ? `▲ +${Math.round(p.trend)}` : (p.trend < -3 ? `▼ −${Math.round(Math.abs(p.trend))}` : '≈');
            const trendColor = p.trend > 3 ? s.good : (p.trend < -3 ? s.bad : s.textDim);

            const head = document.createElement('div');
            head.style.cssText = 'display:flex; justify-content:space-between; align-items:baseline; gap:4px;';
            head.innerHTML = `<span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${_esc(fullName)}">${_esc(name)}</span>` +
                `<span style="font-size:0.68rem; font-weight:700; color:${trendColor}; white-space:nowrap;">${trendStr}</span>`;
            cell.appendChild(head);

            const sub = document.createElement('div');
            sub.style.cssText = 'font-size:0.6rem; color:var(--text-secondary); margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            sub.textContent = `${modeLbl} · ultima: ${Math.round(p.lastPct)}%`;
            cell.appendChild(sub);

            const w = 200, h = 110, pad = { l: 6, r: 6, t: 8, b: 8 };
            const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
            const svg = svgRoot(cell, w, h, { bg: 'transparent', maxWidth: w });

            const ty = pad.t + plotH * (1 - Math.min(100, threshold) / 100);
            svgEl('line', { x1: pad.l, x2: w - pad.r, y1: ty.toFixed(1), y2: ty.toFixed(1), stroke: s.axis, 'stroke-width': 1, 'stroke-dasharray': '3,3', opacity: 0.6 }, svg);

            const n = p.series.length;
            const pts = p.series.map((d, i) => [
                +(pad.l + (n > 1 ? i * plotW / (n - 1) : plotW / 2)).toFixed(1),
                +(pad.t + plotH * (1 - Math.min(100, Math.max(0, d.pct)) / 100)).toFixed(1)
            ]);
            svgEl('path', { d: _smooth(pts), fill: 'none', stroke: s.accent, 'stroke-width': 1.6, opacity: 0.85 }, svg);
            pts.forEach((xy, i) => {
                const c = svgEl('circle', { cx: xy[0], cy: xy[1], r: 2.4, fill: pctSkinColor(p.series[i].pct, s) }, svg);
                _title(c, `${formatDateEU(p.series[i].date)}\n${Math.round(p.series[i].pct)}%`);
            });
            grid.appendChild(cell);
        });
        _caption(container, `Ordinate dal trend più critico al più positivo (Δ tra media ultime 3 e prime 3 sedute) · fino a 12 attività con almeno 3 sedute · linea tratteggiata = soglia criterio (${threshold}%).`);
    }

    // ------------------------------------------------------------
    // 2) PROMPT BALANCE — daily prompt-dependence area chart.
    // ------------------------------------------------------------
    function vizPromptBalance(container, patient) {
        const s = skin();
        const daily = vizDailyData(patient).filter(d => (d.v + d.p) > 0);
        if (daily.length < 2) { emptyMsg(container, 'Servono almeno 2 giornate con risposte indipendenti/con aiuto per questo grafico.'); return; }

        const rates = daily.map(d => ({ date: d.date, rate: (d.p / (d.v + d.p)) * 100 }));
        const pad = { l: 34, r: 12, t: 14, b: 30 };
        const plotW = Math.min(680, Math.max(300, rates.length * 16)), plotH = 190;
        const w = pad.l + plotW + pad.r, h = pad.t + plotH + pad.b;
        const svg = svgRoot(container, w, h, { bg: s.bg, maxWidth: w });

        [25, 50, 75].forEach(g => {
            const gy = +(pad.t + plotH * (1 - g / 100)).toFixed(1);
            svgEl('line', { x1: pad.l, x2: w - pad.r, y1: gy, y2: gy, stroke: s.grid, 'stroke-dasharray': '3,4' }, svg);
            svgEl('text', { x: pad.l - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: g + '%' }, svg);
        });

        const n = rates.length;
        const xAt = i => +(pad.l + (n > 1 ? i * plotW / (n - 1) : plotW / 2)).toFixed(1);
        const yAt = rate => +(pad.t + plotH * (1 - Math.min(100, rate) / 100)).toFixed(1);
        const pts = rates.map((r, i) => [xAt(i), yAt(r.rate)]);
        const areaTop = _smooth(pts);
        const areaClose = ` L ${xAt(n - 1)} ${(pad.t + plotH).toFixed(1)} L ${xAt(0)} ${(pad.t + plotH).toFixed(1)} Z`;
        svgEl('path', { d: areaTop + areaClose, fill: s.p, 'fill-opacity': 0.16, stroke: 'none' }, svg);
        svgEl('path', { d: areaTop, fill: 'none', stroke: s.p, 'stroke-width': 2, opacity: 0.9 }, svg);

        rates.forEach((r, i) => {
            const c = svgEl('circle', { cx: xAt(i), cy: yAt(r.rate), r: 3, fill: pctSkinColor(100 - r.rate, s), stroke: s.bg === 'transparent' ? 'var(--modal-bg)' : s.bg, 'stroke-width': 1 }, svg);
            _title(c, `${formatDateEU(r.date + 'T00:00:00')}\nQuota di aiuto: ${Math.round(r.rate)}%`);
            if (i % Math.ceil(n / 8 || 1) === 0)
                svgEl('text', { x: xAt(i), y: h - pad.b + 14, 'text-anchor': 'middle', 'font-size': 7.5, fill: s.textDim, text: r.date.slice(8) + '/' + r.date.slice(5, 7) }, svg);
        });

        const half = Math.max(1, Math.floor(n / 2));
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b.rate, 0) / arr.length) : 0;
        const firstAvg = avg(rates.slice(0, half));
        const secondAvg = avg(rates.slice(half));
        const chips = document.createElement('div');
        chips.style.cssText = 'display:flex; gap:14px; justify-content:center; margin-top:8px; font-size:0.72rem; color:var(--text-secondary); flex-wrap:wrap;';
        chips.innerHTML = `<span>Prima metà: <b style="color:${pctSkinColor(100 - firstAvg, s)};">${firstAvg}%</b></span><span>Seconda metà: <b style="color:${pctSkinColor(100 - secondAvg, s)};">${secondAvg}%</b></span>`;
        container.appendChild(chips);
        _caption(container, 'Quota di risposte che ha richiesto un aiuto (P su V+P) — più scende, più autonomia.');
    }

    // ------------------------------------------------------------
    // 3) CELERATION — precision-teaching log-scale chart.
    // ------------------------------------------------------------
    function vizCeleration(container, patient) {
        const s = skin();
        const daily = vizDailyData(patient);
        if (daily.length < 3) { emptyMsg(container, 'Servono almeno 3 giornate con dati per la curva di celeration.'); return; }

        const first = new Date(daily[0].date + 'T00:00:00');
        const points = daily.map(d => {
            const day = Math.round((new Date(d.date + 'T00:00:00') - first) / 86400000);
            const raw = d.correctLU;
            const y = raw > 0 ? raw : 0.5;
            return { day, raw, y, log: Math.log10(y), date: d.date, zero: raw <= 0 };
        });

        const pad = { l: 40, r: 14, t: 14, b: 34 };
        const maxDay = Math.max(...points.map(p => p.day), 1);
        const plotW = Math.max(260, maxDay * 8), plotH = 200;
        const w = pad.l + plotW + pad.r, h = pad.t + plotH + pad.b;
        const svg = svgRoot(container, w, h, { bg: s.bg, maxWidth: w });

        const logMin = Math.min(...points.map(p => p.log)) - 0.15;
        const logMax = Math.max(...points.map(p => p.log)) + 0.15;
        const yAt = log => +(pad.t + plotH * (1 - (log - logMin) / (logMax - logMin))).toFixed(1);
        const xAt = day => +(pad.l + plotW * (maxDay ? day / maxDay : 0.5)).toFixed(1);

        [1, 2, 5, 10, 20, 50, 100, 200].filter(t => { const l = Math.log10(t); return l >= logMin && l <= logMax; }).forEach(t => {
            const ty = yAt(Math.log10(t));
            svgEl('line', { x1: pad.l, x2: w - pad.r, y1: ty, y2: ty, stroke: s.grid, 'stroke-dasharray': '3,4' }, svg);
            svgEl('text', { x: pad.l - 6, y: ty + 3, 'text-anchor': 'end', 'font-size': 8, fill: s.textDim, text: t }, svg);
        });

        // Least-squares regression of log10(correct LU) against day number.
        const nP = points.length;
        const meanX = points.reduce((a, p) => a + p.day, 0) / nP;
        const meanY = points.reduce((a, p) => a + p.log, 0) / nP;
        let num = 0, den = 0;
        points.forEach(p => { num += (p.day - meanX) * (p.log - meanY); den += (p.day - meanX) * (p.day - meanX); });
        const slope = den !== 0 ? num / den : 0;
        const intercept = meanY - slope * meanX;
        svgEl('line', {
            x1: xAt(0), y1: yAt(intercept), x2: xAt(maxDay), y2: yAt(intercept + slope * maxDay),
            stroke: s.accent, 'stroke-width': 2, opacity: 0.85, 'stroke-dasharray': '5,3'
        }, svg);

        points.forEach(p => {
            const cx = xAt(p.day), cy = yAt(p.log);
            const c = svgEl('circle', { cx, cy, r: 3, fill: p.zero ? 'none' : s.v, stroke: s.v, 'stroke-width': p.zero ? 1.4 : 0 }, svg);
            _title(c, `${formatDateEU(p.date + 'T00:00:00')}\nLU corrette: ${p.raw}`);
        });
        points.forEach((p, i) => {
            if (i % Math.ceil(nP / 8 || 1) === 0)
                svgEl('text', { x: xAt(p.day), y: h - pad.b + 16, 'text-anchor': 'middle', 'font-size': 7.5, fill: s.textDim, text: p.date.slice(8) + '/' + p.date.slice(5, 7) }, svg);
        });

        const weekly = Math.pow(10, slope * 7);
        const badge = document.createElement('div');
        badge.style.cssText = `text-align:center; margin-top:6px; font-size:0.8rem; font-weight:700; color:${weekly >= 1 ? s.good : s.bad};`;
        badge.textContent = `×${weekly.toFixed(2)}/sett.`;
        container.appendChild(badge);
        _caption(container, 'Scala logaritmica: una retta = crescita a ritmo costante; ×1.25/sett. significa +25% a settimana. I cerchi vuoti sono giornate senza risposte corrette.');
    }

    // ------------------------------------------------------------
    // 4) VARIANT COMPARE — same activity under different conditions.
    // ------------------------------------------------------------
    function vizVariantCompare(container, patient) {
        const s = skin();
        const history = patient.history || [];
        const byActivity = {};
        history.forEach(h => {
            const key = `${h.setName || '—'}::${h.mode || '—'}`;
            if (!byActivity[key]) byActivity[key] = { setName: h.setName || '—', mode: h.mode || '—', byCond: {} };
            const cond = conditionOf(h);
            (byActivity[key].byCond[cond] = byActivity[key].byCond[cond] || []).push(h);
        });
        const candidates = Object.values(byActivity).map(a => {
            const conds = {};
            Object.keys(a.byCond).forEach(c => {
                if (a.byCond[c].length >= 2) conds[c] = a.byCond[c].slice().sort((x, y) => new Date(x.date) - new Date(y.date));
            });
            return { setName: a.setName, mode: a.mode, conds };
        }).filter(a => Object.keys(a.conds).length >= 2);

        if (!candidates.length) { emptyMsg(container, 'Nessuna attività con più condizioni (campo, time-delay) nel periodo.'); return; }
        const shown = candidates.slice(0, 4);
        const colorSeq = [s.accent, s.good, s.mid, s.bad];

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:14px;';
        container.appendChild(grid);

        shown.forEach(act => {
            const cell = document.createElement('div');
            cell.style.cssText = `border-radius:10px; padding:8px; ${s.bg !== 'transparent' ? 'background:' + s.bg + ';' : 'background:rgba(var(--ink-rgb),0.02);'} border:1px solid ${s.grid};`;
            const title = document.createElement('div');
            title.style.cssText = 'font-size:0.76rem; font-weight:700; text-align:center; margin-bottom:4px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            title.title = `${act.setName} · ${act.mode}`;
            title.textContent = `${act.setName} · ${act.mode}`;
            cell.appendChild(title);

            const condKeys = Object.keys(act.conds);
            const maxN = Math.max(...condKeys.map(c => act.conds[c].length), 1);
            const w = 260, h = 140, pad = { l: 30, r: 10, t: 10, b: 22 };
            const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
            const svg = svgRoot(cell, w, h, { bg: 'transparent', maxWidth: w });

            [0, 50, 100].forEach(g => {
                const gy = +(pad.t + plotH * (1 - g / 100)).toFixed(1);
                svgEl('line', { x1: pad.l, x2: w - pad.r, y1: gy, y2: gy, stroke: s.grid, 'stroke-dasharray': '3,4' }, svg);
                svgEl('text', { x: pad.l - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 7, fill: s.textDim, text: g }, svg);
            });

            condKeys.forEach((c, ci) => {
                const col = colorSeq[ci % colorSeq.length];
                const sess = act.conds[c];
                const pts = sess.map((sh, i) => [
                    +(pad.l + (maxN > 1 ? i * plotW / (maxN - 1) : plotW / 2)).toFixed(1),
                    +(pad.t + plotH * (1 - Math.min(100, Math.max(0, pct(sh))) / 100)).toFixed(1)
                ]);
                svgEl('path', { d: _smooth(pts), fill: 'none', stroke: col, 'stroke-width': 1.8, opacity: 0.85 }, svg);
                pts.forEach((xy, i) => {
                    const dot = svgEl('circle', { cx: xy[0], cy: xy[1], r: 2.6, fill: col }, svg);
                    _title(dot, `${c}\n${formatDateEU(sess[i].date)}\n${Math.round(pct(sess[i]))}%`);
                });
            });
            grid.appendChild(cell);
            _vizLegendChips(cell, condKeys.map((c, ci) => [c, colorSeq[ci % colorSeq.length]]));
        });
        _caption(container, 'Confronto della % di riuscita tra condizioni diverse della stessa attività (asse = numero di seduta in quella condizione).');
    }

    // ------------------------------------------------------------
    // 5) DAY / ACTIVITY MATRIX — heatmap grid.
    // ------------------------------------------------------------
    function vizDayActivityMatrix(container, patient) {
        const s = skin();
        const daily = vizDailyData(patient);
        if (daily.length < 2) { emptyMsg(container, 'Servono almeno 2 giornate di dati per la matrice.'); return; }
        const groups = activityGroups(patient);
        if (!groups.length) { emptyMsg(container, 'Nessun dato.'); return; }
        const topGroups = groups.slice().sort((a, b) => b.sessions.length - a.sessions.length).slice(0, 10);

        const useWeeks = daily.length > 45;
        let colKeys;
        if (useWeeks) {
            const weekSet = {};
            daily.forEach(d => { weekSet[weekKeyOf(d.date)] = true; });
            colKeys = Object.keys(weekSet).sort();
        } else {
            colKeys = daily.map(d => d.date);
        }
        const colLabel = ck => useWeeks ? `settimana del ${ck.slice(8)}/${ck.slice(5, 7)}` : `${ck.slice(8)}/${ck.slice(5, 7)}`;

        const cellData = topGroups.map(g => {
            const byCol = {};
            g.sessions.forEach(h => {
                const dk = getDateKey(h.date);
                const col = useWeeks ? weekKeyOf(dk) : dk;
                (byCol[col] = byCol[col] || []).push(pct(h));
            });
            return colKeys.map(ck => {
                const arr = byCol[ck];
                return arr && arr.length ? { pct: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length } : null;
            });
        });

        const leftW = 112, cellW = useWeeks ? 46 : 24, cellH = 24, topH = 24;
        const cellsW = colKeys.length * cellW + 8;
        const h = topH + topGroups.length * cellH + 6;
        // Row labels live OUTSIDE the scroller (they must stay visible while
        // the cells scroll, which lands on the most recent columns).
        const flexRow = document.createElement('div');
        flexRow.style.cssText = 'display:flex; align-items:flex-start;';
        container.appendChild(flexRow);
        const labelBox = document.createElement('div');
        labelBox.style.cssText = 'flex:0 0 ' + leftW + 'px;';
        flexRow.appendChild(labelBox);
        const labelSvg = svgRoot(labelBox, leftW, h, { bg: 'transparent', maxWidth: leftW });
        labelSvg.style.width = leftW + 'px'; labelSvg.style.maxWidth = 'none';
        const scroller = document.createElement('div');
        scroller.style.cssText = 'overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; flex:1; min-width:0;';
        flexRow.appendChild(scroller);
        const svg = svgRoot(scroller, cellsW, h, { bg: s.bg, maxWidth: cellsW });
        svg.style.width = cellsW + 'px';
        svg.style.maxWidth = 'none';

        const everyN = Math.max(1, Math.ceil(colKeys.length / (useWeeks ? 8 : 15)));
        colKeys.forEach((ck, ci) => {
            if (ci % everyN === 0)
                svgEl('text', { x: ci * cellW + cellW / 2, y: topH - 7, 'text-anchor': 'middle', 'font-size': 7, fill: s.textDim, text: colLabel(ck) }, svg);
        });

        topGroups.forEach((g, ri) => {
            const label = g.setName.length > 14 ? g.setName.slice(0, 13) + '…' : g.setName;
            const tdTag = g.sessionType === 'timedelay' ? ' · TD' : '';
            const lbl = svgEl('text', { x: leftW - 6, y: topH + ri * cellH + cellH / 2 + 3, 'text-anchor': 'end', 'font-size': 8, fill: s.text, text: label + tdTag }, labelSvg);
            _title(lbl, `${g.setName} (${g.mode}${g.sessionType === 'timedelay' ? ' · Time Delay' : ''})`);
            cellData[ri].forEach((cv, ci) => {
                const x = ci * cellW, y = topH + ri * cellH;
                const fill = cv ? pctSkinColor(cv.pct, s) : (s.organic ? 'rgba(120,100,80,0.06)' : 'rgba(var(--ink-rgb),0.04)');
                const rect = svgEl('rect', { x: x + 1, y: y + 1, width: cellW - 2, height: cellH - 2, rx: 3, fill }, svg);
                if (cv) _title(rect, `${g.setName}\n${colLabel(colKeys[ci])}\n${cv.pct}% (${cv.n} sedut${cv.n === 1 ? 'a' : 'e'})`);
            });
        });

        requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
        _caption(container, 'Righe = attività · colonne = giornate · colore = % media — cerca righe o colonne sistematicamente più chiare/scure.');
    }

    // ------------------------------------------------------------
    // 6) MILESTONES — acquisition timeline.
    // ------------------------------------------------------------
    function findMilestone(sessions, threshold) {
        for (let i = 0; i < sessions.length; i++) {
            if (pct(sessions[i]) < threshold) continue;
            const dayI = getDateKey(sessions[i].date);
            let j = i + 1;
            while (j < sessions.length && getDateKey(sessions[j].date) === dayI) j++;
            if (j < sessions.length && pct(sessions[j]) >= threshold) {
                return { date: sessions[j].date, sessionsToCriterion: j + 1 };
            }
        }
        return null;
    }

    function vizMilestones(container, patient) {
        const s = skin();
        const threshold = patient.criterionThreshold || 90;
        const groups = activityGroups(patient);
        if (!groups.length) { emptyMsg(container, 'Nessun dato.'); return; }

        const milestones = [], inProgress = [];
        groups.forEach(g => {
            const m = findMilestone(g.sessions, threshold);
            if (m) milestones.push({ setName: g.setName, mode: g.mode, sessionType: g.sessionType, ...m });
            else {
                const last = g.sessions[g.sessions.length - 1];
                inProgress.push({ setName: g.setName, mode: g.mode, sessionType: g.sessionType, lastPct: pct(last), lastDate: last.date });
            }
        });
        milestones.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (!milestones.length) {
            const enc = document.createElement('p');
            enc.style.cssText = 'text-align:center; color:var(--text-secondary); padding:10px 8px; font-size:0.82rem;';
            enc.textContent = 'Nessun traguardo confermato ancora — ogni seduta registrata avvicina al prossimo obiettivo.';
            container.appendChild(enc);
        } else {
            const rowH = 50;
            const totalH = milestones.length * rowH;
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative; margin-bottom:16px;';
            container.appendChild(wrap);

            // Fixed-pixel overlay SVG for the connecting line + node dots
            // (deliberately not the responsive viewBox scaling used elsewhere,
            // so its pixel coordinates line up 1:1 with the text rows below).
            const lineSvg = svgRoot(wrap, 44, Math.max(totalH, 1), { bg: 'transparent' });
            lineSvg.style.position = 'absolute';
            lineSvg.style.left = '0';
            lineSvg.style.top = '0';
            lineSvg.style.width = '44px';
            lineSvg.style.maxWidth = 'none';
            lineSvg.style.height = totalH + 'px';
            lineSvg.style.aspectRatio = 'auto';

            const steps = Math.max(20, milestones.length * 6);
            let path = '';
            for (let i = 0; i <= steps; i++) {
                const y = totalH * i / steps;
                const x = 24 + (s.organic ? Math.sin(y * 0.05) * 3 : 0);
                path += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)} ${y.toFixed(1)} `;
            }
            svgEl('path', { d: path, fill: 'none', stroke: s.axis, 'stroke-width': s.organic ? 2.4 : 1.6, opacity: 0.5 }, lineSvg);

            milestones.forEach((m, i) => {
                const cy = i * rowH + rowH / 2;
                const cx = 24 + (s.organic ? Math.sin(cy * 0.05) * 3 : 0);
                if (s.organic) svgEl('circle', { cx: cx.toFixed(1), cy, r: 9, fill: s.good, opacity: 0.16 }, lineSvg);
                const node = svgEl('circle', { cx: cx.toFixed(1), cy, r: s.organic ? 5.5 : 5, fill: s.good, stroke: s.bg === 'transparent' ? 'var(--modal-bg)' : s.bg, 'stroke-width': 1.4 }, lineSvg);
                _title(node, `${m.setName}\n${formatDateEU(m.date)}\nin ${m.sessionsToCriterion} sedute`);
            });

            const textCol = document.createElement('div');
            textCol.style.cssText = 'margin-left:44px;';
            wrap.appendChild(textCol);
            milestones.forEach(m => {
                const row = document.createElement('div');
                row.style.cssText = `height:${rowH}px; display:flex; flex-direction:column; justify-content:center; overflow:hidden;`;
                row.innerHTML = `<div style="font-size:0.78rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><b>${_esc(formatDateEU(m.date))}</b> — ${_esc(m.setName)} <span style="color:var(--text-secondary); font-size:0.7rem;">(${_esc(m.mode)}${m.sessionType === 'timedelay' ? ' · TD' : ''})</span></div>` +
                    `<div style="font-size:0.68rem; color:var(--text-secondary);">in ${m.sessionsToCriterion} sedute</div>`;
                textCol.appendChild(row);
            });
        }

        if (inProgress.length) {
            const heading = document.createElement('div');
            heading.style.cssText = 'font-size:0.8rem; font-weight:700; color:var(--text-secondary); margin:10px 0 6px;';
            heading.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> In corso';
            container.appendChild(heading);
            const list = document.createElement('div');
            list.style.cssText = 'display:flex; flex-direction:column; gap:5px;';
            inProgress.slice().sort((a, b) => b.lastPct - a.lastPct).slice(0, 8).forEach(ip => { // closest to the goal first
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:0.76rem; padding:4px 8px; border-radius:8px; background:rgba(var(--ink-rgb),0.03);';
                row.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(ip.setName)} <span style="color:var(--text-secondary); font-size:0.68rem;">(${_esc(ip.mode)}${ip.sessionType === 'timedelay' ? ' · TD' : ''})</span></span>` +
                    `<span style="font-weight:700; padding:2px 8px; border-radius:6px; color:#fff; background:${pctSkinColor(ip.lastPct, s)}; white-space:nowrap;">${Math.round(ip.lastPct)}%</span>`;
                list.appendChild(row);
            });
            container.appendChild(list);
        }
        _caption(container, `Traguardo = criterio ≥ ${threshold}% confermato da una seduta successiva in un giorno diverso.`);
    }

    // ------------------------------------------------------------
    // REGISTER
    // ------------------------------------------------------------
    A.VIZ_VIEWS.push(
        { id: 'curves', label: 'Curve apprendimento', icon: 'fa-chart-line', fn: vizLearningCurves, group: 'Clinico' },
        { id: 'promptbalance', label: 'Bilancia aiuto', icon: 'fa-scale-balanced', fn: vizPromptBalance, group: 'Clinico' },
        { id: 'celeration', label: 'Celeration', icon: 'fa-arrow-trend-up', fn: vizCeleration, group: 'Clinico' },
        { id: 'variants', label: 'Confronto condizioni', icon: 'fa-code-compare', fn: vizVariantCompare, group: 'Clinico' },
        { id: 'matrix', label: 'Matrice giorni', icon: 'fa-table-cells', fn: vizDayActivityMatrix, group: 'Giornaliero' },
        { id: 'milestones', label: 'Traguardi', icon: 'fa-flag-checkered', fn: vizMilestones, group: 'Narrativo' }
    );
})();
