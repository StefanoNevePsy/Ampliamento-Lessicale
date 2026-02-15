// === PATIENT MANAGEMENT & CHARTS ===

// --- GLOBAL PATIENT SELECTOR ---
function populateGlobalPatientSelect() {
    const sel = document.getElementById('global-patient-select');
    sel.innerHTML = '<option value="">-- Ospite --</option>' +
        state.patients.map(p => `<option value="${p.id}" ${state.activePatientId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
}

window.setGlobalPatient = (pid) => {
    state.activePatientId = pid || null;
    if (typeof filterSetsByMode === 'function') filterSetsByMode();
};

// --- PATIENT MODAL ---
window.openPatients = async () => {
    state.patients = await DB.getAllPatients();
    const sel = document.getElementById('patient-select');
    sel.innerHTML = '<option value="">-- Seleziona Paziente --</option>' +
        state.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    document.getElementById('modal-patients').classList.add('open');
};

window.closePatients = () => document.getElementById('modal-patients').classList.remove('open');

window.createNewPatient = async () => {
    const name = prompt("Nome:");
    if (name) {
        const newPatient = { id: Date.now().toString(), name: name, history: [] };
        await DB.savePatient(newPatient);
        state.patients = await DB.getAllPatients();
        populateGlobalPatientSelect();
        const sel = document.getElementById('patient-select');
        sel.innerHTML = '<option value="">-- Seleziona Paziente --</option>' +
            state.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        sel.value = newPatient.id;
        loadPatientData(newPatient.id);
    }
};

// --- RENAME PATIENT ---
window.renamePatient = async (patientId) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const newName = prompt("Nuovo nome:", p.name);
    if (!newName || newName.trim() === '' || newName.trim() === p.name) return;
    p.name = newName.trim();
    await DB.savePatient(p);
    state.patients = await DB.getAllPatients();
    populateGlobalPatientSelect();
    const sel = document.getElementById('patient-select');
    sel.innerHTML = '<option value="">-- Seleziona Paziente --</option>' +
        state.patients.map(pt => `<option value="${pt.id}" ${pt.id === patientId ? 'selected' : ''}>${pt.name}</option>`).join('');
    document.getElementById('patient-title').innerText = `Cartella: ${p.name}`;
};

// --- DELETE PATIENT ---
window.deletePatient = async (patientId) => {
    if (!confirm("Eliminare definitivamente questo paziente e tutti i suoi dati?")) return;
    await DB.deletePatient(patientId);
    state.patients = await DB.getAllPatients();
    if (state.activePatientId === patientId) state.activePatientId = null;
    populateGlobalPatientSelect();
    const sel = document.getElementById('patient-select');
    sel.innerHTML = '<option value="">-- Seleziona Paziente --</option>' +
        state.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    document.getElementById('patient-dashboard').classList.add('hidden');
};

// --- SESSION MANAGEMENT ---
window.deleteSession = async (patientId, sessionIndex) => {
    if (!confirm("Eliminare questa sessione dai dati?")) return;
    const p = state.patients.find(x => x.id === patientId);
    p.history.splice(sessionIndex, 1);
    await DB.savePatient(p);
    loadPatientData(patientId);
};

window.editSession = async (patientId, sessionIndex) => {
    const p = state.patients.find(x => x.id === patientId);
    const s = p.history[sessionIndex];
    const currentDateStr = s.date.substring(0, 10);
    const newDateStr = prompt("Data (AAAA-MM-GG):", currentDateStr);
    if (newDateStr === null) return;
    const newScore = prompt("Punteggio Corretti:", s.correct);
    if (newScore === null) return;
    const newTotal = prompt("Totale Item:", s.total);
    if (newTotal === null) return;
    try {
        let d = new Date(newDateStr);
        if (isNaN(d.getTime())) throw "Data invalida";
        s.date = d.toISOString();
    } catch (e) { alert("Formato data errato. Usa AAAA-MM-GG"); return; }
    s.correct = parseInt(newScore);
    s.total = parseInt(newTotal);
    s.percentage = Math.round((s.correct / s.total) * 100);
    await DB.savePatient(p);
    loadPatientData(patientId);
};

// --- HELPER ---
function formatDateEU(isoStr) {
    if (!isoStr) return "--.--.----";
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getDateKey(isoStr) {
    return new Date(isoStr).toISOString().split('T')[0];
}

// --- CRITERION CHECK ---
function checkCriterion(sessions) {
    if (sessions.length < 2) return false;
    const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
    let consecutive = 0, lastDateStr = null;
    for (const s of sorted) {
        const currentDateStr = getDateKey(s.date);
        if (s.percentage >= 90) {
            if (lastDateStr && currentDateStr !== lastDateStr) consecutive++;
            else if (!lastDateStr) consecutive = 1;
            lastDateStr = currentDateStr;
        } else { consecutive = 0; lastDateStr = null; }
        if (consecutive >= 2) return true;
    }
    return false;
}

// ============================================================
// --- LOAD PATIENT DATA (New Dashboard) ---
// ============================================================
window.loadPatientData = (pid) => {
    if (!pid) return document.getElementById('patient-dashboard').classList.add('hidden');
    const p = state.patients.find(x => x.id === pid);
    if (!p) return;

    document.getElementById('patient-title').innerText = `Cartella: ${p.name}`;
    const container = document.getElementById('charts-container');

    // Build the entire dashboard
    container.innerHTML = '';

    // Patient action buttons
    container.innerHTML += `
        <div style="display:flex; gap:8px; margin-bottom:15px; flex-wrap:wrap;">
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="renamePatient('${pid}')">
                <i class="fa-solid fa-pen"></i> Rinomina
            </button>
            <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="deletePatient('${pid}')">
                <i class="fa-solid fa-user-minus"></i> Elimina
            </button>
        </div>
    `;

    if (!p.history || p.history.length === 0) {
        container.innerHTML += '<p style="text-align:center; opacity:0.5; padding:20px;">Nessun dato registrato.</p>';
        document.getElementById('patient-dashboard').classList.remove('hidden');
        return;
    }

    // === TAB NAVIGATION ===
    container.innerHTML += `
        <div id="report-tabs" style="display:flex; gap:4px; margin-bottom:15px; background:rgba(0,0,0,0.2); padding:4px; border-radius:12px;">
            <button class="report-tab active" onclick="switchReportTab('overview', '${pid}')" data-tab="overview" style="flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; background:var(--accent-color); color:white;">
                <i class="fa-solid fa-chart-line"></i> Panoramica
            </button>
            <button class="report-tab" onclick="switchReportTab('dates', '${pid}')" data-tab="dates" style="flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; background:transparent; color:var(--text-secondary);">
                <i class="fa-solid fa-calendar-days"></i> Giornate
            </button>
            <button class="report-tab" onclick="switchReportTab('activities', '${pid}')" data-tab="activities" style="flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; background:transparent; color:var(--text-secondary);">
                <i class="fa-solid fa-list-check"></i> Attivit&agrave;
            </button>
        </div>
        <div id="report-content"></div>
    `;

    document.getElementById('patient-dashboard').classList.remove('hidden');
    renderOverviewTab(p);
};

// --- TAB SWITCHING ---
window.switchReportTab = (tab, pid) => {
    const p = state.patients.find(x => x.id === pid);
    if (!p) return;

    document.querySelectorAll('.report-tab').forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.style.background = 'var(--accent-color)';
            btn.style.color = 'white';
            btn.classList.add('active');
        } else {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-secondary)';
            btn.classList.remove('active');
        }
    });

    if (tab === 'overview') renderOverviewTab(p);
    else if (tab === 'dates') renderDatesTab(p);
    else if (tab === 'activities') renderActivitiesTab(p);
};

// ============================================================
// TAB 1: PANORAMICA - Daily LU chart + last session summary
// ============================================================
function renderOverviewTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history;

    // Group by date
    const byDate = {};
    history.forEach(h => {
        const dk = getDateKey(h.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(h);
    });

    const dates = Object.keys(byDate).sort();
    const dailyData = dates.map(dk => {
        const sessions = byDate[dk];
        const totalLU = sessions.reduce((sum, s) => sum + s.total, 0);
        const correctLU = sessions.reduce((sum, s) => sum + s.correct, 0);
        return { date: dk, totalLU, correctLU, sessions: sessions.length };
    });

    // Last session
    const lastSession = [...history].sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    // Summary stats
    const totalSessions = history.length;
    const totalLUAll = history.reduce((sum, s) => sum + s.total, 0);
    const correctLUAll = history.reduce((sum, s) => sum + s.correct, 0);
    const avgPct = totalSessions > 0 ? Math.round((correctLUAll / totalLUAll) * 100) : 0;

    let html = `
    <!-- Summary Cards -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:20px;">
        <div style="background:rgba(99,102,241,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(99,102,241,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--accent-color);">${totalSessions}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Sessioni</div>
        </div>
        <div style="background:rgba(16,185,129,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(16,185,129,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--success-color);">${correctLUAll}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">LU Corrette</div>
        </div>
        <div style="background:rgba(245,158,11,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(245,158,11,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--warning-color);">${totalLUAll}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">LU Totali</div>
        </div>
        <div style="background:rgba(139,92,246,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(139,92,246,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:#a78bfa;">${avgPct}%</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Media</div>
        </div>
    </div>`;

    // Daily LU Chart (bar chart)
    if (dailyData.length > 0) {
        html += `
        <div class="chart-wrapper" style="margin-bottom:20px;">
            <h4 style="margin:0 0 10px 0; color:var(--accent-color); font-size:0.95rem;">
                <i class="fa-solid fa-chart-bar"></i> Learn Unit Giornaliere
            </h4>
            <div id="daily-lu-chart" style="overflow-x:auto;"></div>
        </div>`;
    }

    // Last session
    if (lastSession) {
        const modeName = MODES_CONFIG[lastSession.mode] || lastSession.mode;
        html += `
        <div class="chart-wrapper" style="margin-bottom:15px; border-left:4px solid var(--accent-color);">
            <h4 style="margin:0 0 8px 0; color:var(--accent-color); font-size:0.9rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> Ultima Seduta
            </h4>
            <div style="display:flex; gap:15px; flex-wrap:wrap; font-size:0.9rem;">
                <div><span style="color:var(--text-secondary);">Data:</span> <b>${formatDateEU(lastSession.date)}</b></div>
                <div><span style="color:var(--text-secondary);">Attivit&agrave;:</span> <b>${modeName}</b></div>
                <div><span style="color:var(--text-secondary);">Set:</span> <b>${lastSession.setName}</b></div>
                <div><span style="color:var(--text-secondary);">Score:</span> <b style="color:${lastSession.percentage >= 90 ? 'var(--success-color)' : 'white'}">${lastSession.correct}/${lastSession.total} (${lastSession.percentage}%)</b></div>
            </div>
        </div>`;
    }

    content.innerHTML = html;

    // Render the daily LU bar chart
    if (dailyData.length > 0) {
        renderDailyLUChart(dailyData);
    }
}

function renderDailyLUChart(dailyData) {
    const chartContainer = document.getElementById('daily-lu-chart');
    if (!chartContainer) return;

    const maxLU = Math.max(...dailyData.map(d => d.totalLU), 1);
    const chartHeight = 150;
    const barWidth = Math.max(30, Math.min(50, 600 / dailyData.length));
    const chartWidth = Math.max(300, dailyData.length * (barWidth + 8) + 40);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight + 30}`);
    svg.setAttribute("width", chartWidth);
    svg.setAttribute("height", chartHeight + 30);
    svg.style.minWidth = chartWidth + 'px';

    dailyData.forEach((d, i) => {
        const x = 20 + i * (barWidth + 8);
        const totalH = (d.totalLU / maxLU) * chartHeight;
        const correctH = (d.correctLU / maxLU) * chartHeight;

        // Total bar (background)
        const totalBar = document.createElementNS(svgNS, "rect");
        totalBar.setAttribute("x", x);
        totalBar.setAttribute("y", chartHeight - totalH);
        totalBar.setAttribute("width", barWidth);
        totalBar.setAttribute("height", totalH);
        totalBar.setAttribute("fill", "rgba(255,255,255,0.15)");
        totalBar.setAttribute("rx", "4");
        const title1 = document.createElementNS(svgNS, "title");
        title1.textContent = `${formatDateEU(d.date + 'T00:00:00')}\nTotali: ${d.totalLU}\nCorrette: ${d.correctLU}\nSessioni: ${d.sessions}`;
        totalBar.appendChild(title1);
        svg.appendChild(totalBar);

        // Correct bar (foreground)
        const correctBar = document.createElementNS(svgNS, "rect");
        correctBar.setAttribute("x", x);
        correctBar.setAttribute("y", chartHeight - correctH);
        correctBar.setAttribute("width", barWidth);
        correctBar.setAttribute("height", correctH);
        correctBar.setAttribute("fill", "var(--success-color)");
        correctBar.setAttribute("opacity", "0.7");
        correctBar.setAttribute("rx", "4");
        const title2 = document.createElementNS(svgNS, "title");
        title2.textContent = title1.textContent;
        correctBar.appendChild(title2);
        svg.appendChild(correctBar);

        // Date label
        const lbl = document.createElementNS(svgNS, "text");
        lbl.setAttribute("x", x + barWidth / 2);
        lbl.setAttribute("y", chartHeight + 15);
        lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("fill", "#888");
        lbl.setAttribute("font-size", "8");
        const dObj = new Date(d.date + 'T00:00:00');
        lbl.textContent = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
        svg.appendChild(lbl);

        // Count label on top
        const countLbl = document.createElementNS(svgNS, "text");
        countLbl.setAttribute("x", x + barWidth / 2);
        countLbl.setAttribute("y", chartHeight - totalH - 4);
        countLbl.setAttribute("text-anchor", "middle");
        countLbl.setAttribute("fill", "#aaa");
        countLbl.setAttribute("font-size", "8");
        countLbl.textContent = d.totalLU;
        svg.appendChild(countLbl);
    });

    // Legend
    const legendY = chartHeight + 24;
    const legCorrect = document.createElementNS(svgNS, "rect");
    legCorrect.setAttribute("x", "20"); legCorrect.setAttribute("y", legendY);
    legCorrect.setAttribute("width", "10"); legCorrect.setAttribute("height", "6");
    legCorrect.setAttribute("fill", "var(--success-color)"); legCorrect.setAttribute("opacity", "0.7"); legCorrect.setAttribute("rx", "2");
    svg.appendChild(legCorrect);
    const legCText = document.createElementNS(svgNS, "text");
    legCText.setAttribute("x", "34"); legCText.setAttribute("y", legendY + 6);
    legCText.setAttribute("fill", "#888"); legCText.setAttribute("font-size", "8");
    legCText.textContent = "Corrette";
    svg.appendChild(legCText);
    const legTotal = document.createElementNS(svgNS, "rect");
    legTotal.setAttribute("x", "80"); legTotal.setAttribute("y", legendY);
    legTotal.setAttribute("width", "10"); legTotal.setAttribute("height", "6");
    legTotal.setAttribute("fill", "rgba(255,255,255,0.15)"); legTotal.setAttribute("rx", "2");
    svg.appendChild(legTotal);
    const legTText = document.createElementNS(svgNS, "text");
    legTText.setAttribute("x", "94"); legTText.setAttribute("y", legendY + 6);
    legTText.setAttribute("fill", "#888"); legTText.setAttribute("font-size", "8");
    legTText.textContent = "Totali";
    svg.appendChild(legTText);

    chartContainer.appendChild(svg);
}

// ============================================================
// TAB 2: GIORNATE - Date-based expandable view
// ============================================================
function renderDatesTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history;
    const byDate = {};
    history.forEach((h, idx) => {
        const dk = getDateKey(h.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push({ ...h, originalIndex: idx });
    });

    const dates = Object.keys(byDate).sort().reverse();

    let html = '';
    dates.forEach((dk, dateIdx) => {
        const sessions = byDate[dk];
        const totalLU = sessions.reduce((sum, s) => sum + s.total, 0);
        const correctLU = sessions.reduce((sum, s) => sum + s.correct, 0);
        const pct = totalLU > 0 ? Math.round((correctLU / totalLU) * 100) : 0;

        html += `
        <div class="chart-wrapper" style="margin-bottom:10px; padding:0; overflow:hidden;">
            <div onclick="toggleDateExpand(this)" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-chevron-right date-expand-icon" style="transition:transform 0.2s; font-size:0.7rem; color:var(--text-secondary);"></i>
                    <span style="font-weight:bold; font-size:1rem;">${formatDateEU(dk + 'T00:00:00')}</span>
                    <span style="color:var(--text-secondary); font-size:0.8rem;">${sessions.length} attivit&agrave;</span>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <span style="font-size:0.85rem; color:var(--success-color);">${correctLU}<span style="color:var(--text-secondary);">/${totalLU}</span></span>
                    <span style="font-weight:bold; font-size:0.9rem; color:${pct >= 90 ? 'var(--success-color)' : pct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)'};">${pct}%</span>
                </div>
            </div>
            <div class="date-detail-panel" style="display:none; padding:0 15px 12px; border-top:1px solid rgba(255,255,255,0.05);">
                <table style="width:100%; font-size:0.85rem; color:#ccc; border-collapse:collapse; margin-top:8px;">
                    <tr style="border-bottom:1px solid #333; color:#888; font-size:0.75rem; text-transform:uppercase;">
                        <th style="padding:5px; text-align:left;">Attivit&agrave;</th>
                        <th style="text-align:left;">Set/Nome</th>
                        <th style="text-align:center;">Score</th>
                        <th style="text-align:center;">%</th>
                        <th style="text-align:right;">Azioni</th>
                    </tr>
                    ${sessions.map(s => {
                        const modeName = MODES_CONFIG[s.mode] || s.mode;
                        return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:8px 5px;"><span style="background:rgba(99,102,241,0.15); padding:2px 8px; border-radius:6px; font-size:0.75rem; color:var(--accent-color);">${modeName}</span></td>
                            <td style="padding:8px 5px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.setName}</td>
                            <td style="text-align:center;">${s.correct}/${s.total}</td>
                            <td style="text-align:center; font-weight:bold; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'};">${s.percentage}%</td>
                            <td style="text-align:right; white-space:nowrap;">
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex;" onclick="editSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="deleteSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`;
                    }).join('')}
                </table>
            </div>
        </div>`;
    });

    content.innerHTML = html;

    // Auto-expand first date
    const firstPanel = content.querySelector('.date-detail-panel');
    const firstIcon = content.querySelector('.date-expand-icon');
    if (firstPanel) { firstPanel.style.display = 'block'; }
    if (firstIcon) { firstIcon.style.transform = 'rotate(90deg)'; }
}

window.toggleDateExpand = (header) => {
    const panel = header.nextElementSibling;
    const icon = header.querySelector('.date-expand-icon');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(90deg)';
    } else {
        panel.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
};

// ============================================================
// TAB 3: ATTIVITA - Per-activity charts (set+mode)
// ============================================================
function renderActivitiesTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history;

    // Group by setName::mode
    const groups = {};
    history.forEach((h, idx) => {
        const key = `${h.setName}::${h.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...h, originalIndex: idx });
    });

    let chartList = Object.entries(groups).map(([key, sessions]) => {
        const [setName, modeCode] = key.split('::');
        const lastDate = Math.max(...sessions.map(s => new Date(s.date).getTime()));
        return { key, sessions, setName, modeCode, lastDate };
    });

    chartList.sort((a, b) => b.lastDate - a.lastDate);

    let html = '';

    chartList.forEach(item => {
        const { sessions, setName, modeCode } = item;
        const modeName = MODES_CONFIG[modeCode] || modeCode;
        sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
        const isMastered = checkCriterion(sessions);

        const badgeHtml = isMastered ?
            `<span class="criterion-badge"><i class="fa-solid fa-trophy"></i> CRITERIO</span>` : '';

        const chartId = 'activity-chart-' + item.key.replace(/[^a-zA-Z0-9]/g, '_');

        html += `
        <div class="chart-wrapper" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h4 style="margin:0; color:var(--accent-color); font-size:0.95rem;">
                    ${setName} <span style="color:#666; font-size:0.8em;">(${modeName})</span> ${badgeHtml}
                </h4>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${sessions.length} sess.</span>
                    <button class="btn-icon" onclick="toggleActivityDetails(this)" style="width:28px; height:28px; background:rgba(255,255,255,0.05);" title="Dettagli">
                        <i class="fa-solid fa-chevron-down" style="font-size:0.7rem;"></i>
                    </button>
                </div>
            </div>
            <div id="${chartId}"></div>
            <div class="activity-details-panel" style="display:none; margin-top:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
                <table style="width:100%; font-size:0.85rem; color:#ccc; border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #444; text-align:left; color:#888; font-size:0.75rem;">
                        <th style="padding:5px;">Data</th><th>Score</th><th>%</th><th style="text-align:right;">Azioni</th>
                    </tr>
                    ${[...sessions].reverse().map(s => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px 5px;">${formatDateEU(s.date)}</td>
                            <td>${s.correct}/${s.total}</td>
                            <td style="font-weight:bold; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'}">${s.percentage}%</td>
                            <td style="text-align:right;">
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex;" onclick="editSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="deleteSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        </div>`;
    });

    content.innerHTML = html;

    // Render SVG charts after DOM is ready
    chartList.forEach(item => {
        const chartId = 'activity-chart-' + item.key.replace(/[^a-zA-Z0-9]/g, '_');
        const container = document.getElementById(chartId);
        if (container) renderActivitySVGChart(container, item.sessions);
    });
}

function renderActivitySVGChart(container, sessions) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("viewBox", "-10 -10 320 160");

    // Axes
    const axisY = document.createElementNS(svgNS, "line");
    axisY.setAttribute("x1", "20"); axisY.setAttribute("y1", "0");
    axisY.setAttribute("x2", "20"); axisY.setAttribute("y2", "130");
    axisY.setAttribute("stroke", "#666"); axisY.setAttribute("stroke-width", "1");
    svg.appendChild(axisY);

    const axisX = document.createElementNS(svgNS, "line");
    axisX.setAttribute("x1", "20"); axisX.setAttribute("y1", "130");
    axisX.setAttribute("x2", "300"); axisX.setAttribute("y2", "130");
    axisX.setAttribute("stroke", "#666"); axisX.setAttribute("stroke-width", "1");
    svg.appendChild(axisX);

    // 90% threshold
    const line90 = document.createElementNS(svgNS, "line");
    line90.setAttribute("x1", "20"); line90.setAttribute("x2", "300");
    line90.setAttribute("y1", "13"); line90.setAttribute("y2", "13");
    line90.setAttribute("class", "threshold-line");
    svg.appendChild(line90);

    const stepX = sessions.length > 1 ? 260 / (sessions.length - 1) : 0;
    let pathD = "";

    sessions.forEach((s, i) => {
        const x = 20 + (sessions.length > 1 ? i * stepX : 130);
        const y = 130 - (1.3 * s.percentage);
        if (i === 0) pathD += `M ${x} ${y}`; else pathD += ` L ${x} ${y}`;
    });

    if (sessions.length > 1) {
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", pathD);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "white");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("opacity", "0.6");
        svg.appendChild(path);
    }

    sessions.forEach((s, i) => {
        const x = 20 + (sessions.length > 1 ? i * stepX : 130);
        const y = 130 - (1.3 * s.percentage);
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", x); dot.setAttribute("cy", y);
        dot.setAttribute("r", "5"); dot.setAttribute("fill", "white");
        dot.setAttribute("stroke", "var(--accent-color)"); dot.setAttribute("stroke-width", "2");
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${formatDateEU(s.date)}\nScore: ${s.percentage}% (${s.correct}/${s.total})`;
        dot.appendChild(title);
        svg.appendChild(dot);

        const lbl = document.createElementNS(svgNS, "text");
        lbl.setAttribute("x", x); lbl.setAttribute("y", "148");
        lbl.setAttribute("text-anchor", "middle"); lbl.setAttribute("fill", "#888"); lbl.setAttribute("font-size", "9");
        const dObj = new Date(s.date);
        lbl.textContent = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
        svg.appendChild(lbl);
    });

    container.appendChild(svg);
}

window.toggleActivityDetails = (btn) => {
    const wrapper = btn.closest('.chart-wrapper');
    const panel = wrapper.querySelector('.activity-details-panel');
    const icon = btn.querySelector('i');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        panel.style.display = 'none';
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
};
