// === PATIENT MANAGEMENT & CHARTS ===

// --- GLOBAL PATIENT SELECTOR ---
function populateGlobalPatientSelect() {
    const sel = document.getElementById('global-patient-select');
    sel.innerHTML = '<option value="">-- Ospite --</option>' +
        state.patients.map(p => `<option value="${p.id}" ${state.activePatientId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
}

window.setGlobalPatient = (pid) => {
    state.activePatientId = pid || null;
    // Refresh set list to recalculate trophy indicators for new patient
    if (typeof filterSetsByMode === 'function') {
        filterSetsByMode();
    }
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

// FIX: Real-time update - await openPatients and refresh global dropdown
window.createNewPatient = async () => {
    const name = prompt("Nome:");
    if (name) {
        const newPatient = { id: Date.now().toString(), name: name, history: [] };
        await DB.savePatient(newPatient);
        // Update state.patients FIRST, then refresh both dropdowns
        state.patients = await DB.getAllPatients();
        populateGlobalPatientSelect();
        // Refresh modal patient list
        const sel = document.getElementById('patient-select');
        sel.innerHTML = '<option value="">-- Seleziona Paziente --</option>' +
            state.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        // Auto-select the new patient in the modal
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
    if (state.activePatientId === patientId) {
        state.activePatientId = null;
    }
    populateGlobalPatientSelect();
    // Refresh modal
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
    } catch (e) {
        alert("Formato data errato. Usa AAAA-MM-GG");
        return;
    }

    s.correct = parseInt(newScore);
    s.total = parseInt(newTotal);
    s.percentage = Math.round((s.correct / s.total) * 100);

    await DB.savePatient(p);
    loadPatientData(patientId);
};

// --- HELPER: European Date Format ---
function formatDateEU(isoStr) {
    if (!isoStr) return "--.--.----";
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// --- TOGGLE CHART DETAILS ---
window.toggleChartDetails = (btn) => {
    const wrapper = btn.closest('.chart-wrapper');
    const details = wrapper.querySelector('.chart-details-table');
    const icon = btn.querySelector('i');

    if (details.style.display === 'none') {
        details.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        details.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
};

// --- CRITERION CHECK (2 consecutive >90% on different days) ---
function checkCriterion(sessions) {
    if (sessions.length < 2) return false;
    const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
    let consecutive = 0;
    let lastDateStr = null;

    for (const s of sorted) {
        const currentDateStr = new Date(s.date).toISOString().split('T')[0];
        if (s.percentage >= 90) {
            if (lastDateStr && currentDateStr !== lastDateStr) consecutive++;
            else if (!lastDateStr) consecutive = 1;
            lastDateStr = currentDateStr;
        } else {
            consecutive = 0;
            lastDateStr = null;
        }
        if (consecutive >= 2) return true;
    }
    return false;
}

// --- LOAD PATIENT DATA ---
window.loadPatientData = (pid) => {
    if (!pid) return document.getElementById('patient-dashboard').classList.add('hidden');
    const p = state.patients.find(x => x.id === pid);
    document.getElementById('patient-title').innerText = `Cartella: ${p.name}`;

    const container = document.getElementById('patient-dashboard');
    if (!document.getElementById('chart-sort-controls')) {
        const controls = document.createElement('div');
        controls.id = 'chart-sort-controls';
        controls.style.cssText = "display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-bottom:15px; padding:0 5px;";
        controls.innerHTML = `
            <span style="font-size:0.85rem; color:#aaa;"><i class="fa-solid fa-arrow-down-short-wide"></i> Ordina:</span>
            <select id="sort-select" onchange="updateChartSort(this.value)" style="padding:6px; border-radius:8px; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); font-size:0.9rem;">
                <option value="date_desc">Ultima Attivit&agrave; (Recenti)</option>
                <option value="date_asc">Cronologico (Vecchi)</option>
                <option value="mode">Per Modalit&agrave; (es. TACT, RAN)</option>
                <option value="name">Alfabetico Nome Set</option>
            </select>
        `;
        const title = document.getElementById('patient-title');
        title.parentNode.insertBefore(controls, title.nextSibling);
    }

    // Add rename + delete patient buttons if not already present
    if (!document.getElementById('btn-rename-patient')) {
        const renameBtn = document.createElement('button');
        renameBtn.id = 'btn-rename-patient';
        renameBtn.className = 'btn btn-ghost';
        renameBtn.style.cssText = 'margin-left:10px; padding:6px 12px; font-size:0.85rem;';
        renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Rinomina';
        renameBtn.onclick = () => renamePatient(pid);
        document.getElementById('patient-title').parentNode.insertBefore(renameBtn, document.getElementById('patient-title').nextSibling);
    } else {
        document.getElementById('btn-rename-patient').onclick = () => renamePatient(pid);
    }

    if (!document.getElementById('btn-delete-patient')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'btn-delete-patient';
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.style.cssText = 'margin-left:10px; padding:6px 12px; font-size:0.85rem;';
        deleteBtn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Elimina';
        deleteBtn.onclick = () => deletePatient(pid);
        const renameBtn = document.getElementById('btn-rename-patient');
        renameBtn.parentNode.insertBefore(deleteBtn, renameBtn.nextSibling);
    } else {
        document.getElementById('btn-delete-patient').onclick = () => deletePatient(pid);
    }

    renderPatientCharts(p, 'date_desc');
    document.getElementById('patient-dashboard').classList.remove('hidden');
};

window.updateChartSort = (sortMode) => {
    const pid = document.getElementById('patient-select').value;
    const p = state.patients.find(x => x.id === pid);
    if (p) renderPatientCharts(p, sortMode);
};

// --- RENDER PATIENT CHARTS ---
function renderPatientCharts(patient, sortMode = 'date_desc') {
    const container = document.getElementById('charts-container');
    container.innerHTML = '';

    if (!patient.history || patient.history.length === 0) {
        container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Nessun dato registrato.</p>';
        return;
    }

    // 1. Group data
    const groups = {};
    patient.history.forEach((h, idx) => {
        const key = `${h.setName}::${h.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...h, originalIndex: idx });
    });

    // 2. Prepare for sorting
    let chartList = Object.entries(groups).map(([key, sessions]) => {
        const [setName, modeCode] = key.split('::');
        const lastDate = Math.max(...sessions.map(s => new Date(s.date).getTime()));
        return { key, sessions, setName, modeCode, lastDate };
    });

    // 3. Sort
    chartList.sort((a, b) => {
        if (sortMode === 'date_desc') return b.lastDate - a.lastDate;
        if (sortMode === 'date_asc') return a.lastDate - b.lastDate;
        if (sortMode === 'mode') return a.modeCode.localeCompare(b.modeCode);
        if (sortMode === 'name') return a.setName.localeCompare(b.setName);
        return 0;
    });

    // 4. Render each chart
    chartList.forEach(item => {
        const { sessions, setName, modeCode } = item;
        const modeName = MODES_CONFIG[modeCode] || modeCode;

        sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

        const isMastered = checkCriterion(sessions);

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';

        const badgeHtml = isMastered ?
            `<span class="criterion-badge" style="background:#10b981; color:white; padding:2px 8px; border-radius:4px; font-size:0.7em; margin-left:10px; vertical-align:middle;">
                <i class="fa-solid fa-trophy"></i> CRITERIO
            </span>` : '';

        wrapper.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="margin:0; color:var(--accent-color); font-size:1rem;">
                    ${setName} <span style="color:#666; font-size:0.8em;">(${modeName})</span> ${badgeHtml}
                </h4>
                <button class="btn-icon" onclick="toggleChartDetails(this)" style="width:30px; height:30px; background:rgba(255,255,255,0.05);" title="Dettagli">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
        `;

        // SVG Chart
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "chart-svg");
        svg.setAttribute("viewBox", "-10 -10 320 170");

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
            lbl.setAttribute("x", x); lbl.setAttribute("y", "150");
            lbl.setAttribute("text-anchor", "middle"); lbl.setAttribute("fill", "#888"); lbl.setAttribute("font-size", "9");
            const dObj = new Date(s.date);
            lbl.textContent = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
            svg.appendChild(lbl);
        });

        wrapper.appendChild(svg);

        // Details table
        const tableContainer = document.createElement('div');
        tableContainer.className = 'chart-details-table';
        tableContainer.style.marginTop = "10px";
        tableContainer.style.display = "none";

        const tableSessions = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

        tableContainer.innerHTML = `
            <table style="width:100%; font-size:0.85rem; color:#ccc; border-collapse:collapse;">
                <tr style="border-bottom:1px solid #444; text-align:left; color:#888;">
                    <th style="padding:5px;">Data</th><th>Score</th><th>%</th><th style="text-align:right;">Azioni</th>
                </tr>
                ${tableSessions.map(s => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:8px 5px;">${formatDateEU(s.date)}</td>
                        <td>${s.correct}/${s.total}</td>
                        <td style="font-weight:bold; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'}">${s.percentage}%</td>
                        <td style="text-align:right;">
                            <button class="btn-icon" style="width:28px; height:28px; font-size:0.8rem; display:inline-flex;" onclick="editSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-icon" style="width:28px; height:28px; font-size:0.8rem; display:inline-flex; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="deleteSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')}
            </table>
        `;

        wrapper.appendChild(tableContainer);
        container.appendChild(wrapper);
    });
}
