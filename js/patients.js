// === PATIENT MANAGEMENT & CHARTS ===

// --- GLOBAL PATIENT SELECTOR (custom dropdown) ---
function populateGlobalPatientSelect() {
    const panel = document.getElementById('patient-dropdown-panel');
    const label = document.getElementById('patient-dropdown-label');
    const avatar = document.getElementById('patient-dropdown-avatar');
    if (!panel) return;

    const activeP = state.activePatientId ? state.patients.find(p => p.id === state.activePatientId) : null;

    // Guest option
    let html = `<div class="patient-dd-item${!state.activePatientId ? ' selected' : ''}" onclick="selectPatientFromDropdown('')">
        <div class="patient-dd-avatar"><i class="fa-solid fa-user-slash" style="font-size:0.8rem; opacity:0.5;"></i></div>
        <div class="patient-dd-info"><div class="patient-dd-name" style="opacity:0.6;">Ospite</div></div>
    </div>`;

    // Group by category
    const catMap = {};
    state.patients.forEach(p => {
        const cat = p.category || '';
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(p);
    });

    for (const [catName, catPatients] of Object.entries(catMap)) {
        if (catName) {
            html += `<div class="mode-group-header" style="color:var(--success-color); top:0;">
                <span class="mode-group-dot" style="background:var(--success-color);"></span>${catName}
            </div>`;
        }
        catPatients.forEach(p => {
            const isSelected = state.activePatientId === p.id;
            const sessCount = (p.history || []).length;
            const photoHtml = p.photo
                ? `<div class="patient-dd-avatar"><img src="${p.photo}" alt=""></div>`
                : `<div class="patient-dd-avatar"><i class="fa-solid fa-user"></i></div>`;

            html += `<div class="patient-dd-item${isSelected ? ' selected' : ''}" onclick="selectPatientFromDropdown('${p.id}')">
                ${photoHtml}
                <div class="patient-dd-info">
                    <div class="patient-dd-name">${p.name}</div>
                    ${p.category ? `<div class="patient-dd-cat">${p.category}</div>` : ''}
                    ${sessCount > 0 ? `<div class="patient-dd-cat">${sessCount} sessioni</div>` : ''}
                </div>
                <button class="patient-dd-photo-btn" onclick="event.stopPropagation(); startPatientPhotoUpload('${p.id}')" title="Cambia foto">
                    <i class="fa-solid fa-camera"></i>
                </button>
            </div>`;
        });
    }

    panel.innerHTML = html;

    // Update trigger
    if (activeP) {
        label.textContent = activeP.name;
        avatar.innerHTML = activeP.photo
            ? `<img src="${activeP.photo}" alt="">`
            : `<i class="fa-solid fa-user"></i>`;
    } else {
        label.textContent = '-- Ospite --';
        avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
    }
}

window.togglePatientDropdown = () => {
    const trigger = document.getElementById('patient-dropdown-trigger');
    const panel = document.getElementById('patient-dropdown-panel');
    if (!trigger || !panel) return;
    if (typeof closeModeDropdown === 'function') closeModeDropdown();
    if (typeof closeSetDropdown === 'function') closeSetDropdown();
    if (panel.classList.contains('open')) {
        trigger.classList.remove('open'); panel.classList.remove('open');
    } else {
        trigger.classList.add('open'); panel.classList.add('open');
    }
};

function closePatientDropdown() {
    const t = document.getElementById('patient-dropdown-trigger');
    const p = document.getElementById('patient-dropdown-panel');
    if (t) t.classList.remove('open');
    if (p) p.classList.remove('open');
}

window.selectPatientFromDropdown = (pid) => {
    closePatientDropdown();
    setGlobalPatient(pid);
    populateGlobalPatientSelect();
};

window.setGlobalPatient = (pid) => {
    state.activePatientId = pid || null;
    if (typeof filterSetsByMode === 'function') filterSetsByMode();
};

// --- PATIENT PHOTO UPLOAD ---
window._patientPhotoTarget = null;

window.startPatientPhotoUpload = (pid) => {
    window._patientPhotoTarget = pid;
    document.getElementById('patient-photo-upload').click();
};

window.onPatientPhotoSelected = async (input) => {
    if (!input.files || !input.files[0] || !window._patientPhotoTarget) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        await savePatientPhoto(window._patientPhotoTarget, e.target.result);
        window._patientPhotoTarget = null;
    };
    reader.readAsDataURL(file);
    input.value = '';
};

async function savePatientPhoto(pid, dataUrl) {
    // Resize to max 200px for storage efficiency
    const resized = await resizeImage(dataUrl, 200);
    const p = state.patients.find(x => x.id === pid);
    if (!p) return;
    p.photo = resized;
    await DB.savePatient(p);
    populateGlobalPatientSelect();
}

function resizeImage(dataUrl, maxSize) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
            else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = dataUrl;
    });
}

// --- PATIENT MODAL ---
let _patientModalSelectedId = null;

function renderPatientModalDropdown(selectedId) {
    _patientModalSelectedId = selectedId || null;
    const panel = document.getElementById('patient-modal-panel');
    const label = document.getElementById('patient-modal-label');
    const avatar = document.getElementById('patient-modal-avatar');
    if (!panel) return;

    const selP = selectedId ? state.patients.find(p => p.id === selectedId) : null;

    // Group by category
    const catMap = {};
    state.patients.forEach(p => {
        const cat = p.category || '';
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(p);
    });

    let html = '';
    for (const [catName, catPatients] of Object.entries(catMap)) {
        if (catName) {
            html += `<div class="mode-group-header" style="color:var(--success-color); top:0;">
                <span class="mode-group-dot" style="background:var(--success-color);"></span>${catName}
            </div>`;
        }
        catPatients.forEach(p => {
            const isSel = selectedId === p.id;
            const sessCount = (p.history || []).length;
            const photoHtml = p.photo
                ? `<div class="patient-dd-avatar"><img src="${p.photo}" alt=""></div>`
                : `<div class="patient-dd-avatar"><i class="fa-solid fa-user"></i></div>`;
            html += `<div class="patient-dd-item${isSel ? ' selected' : ''}" onclick="selectPatientModal('${p.id}')">
                ${photoHtml}
                <div class="patient-dd-info">
                    <div class="patient-dd-name">${p.name}</div>
                    ${p.category ? `<div class="patient-dd-cat">${p.category}</div>` : ''}
                    ${sessCount > 0 ? `<div class="patient-dd-cat">${sessCount} sessioni</div>` : ''}
                </div>
            </div>`;
        });
    }
    if (state.patients.length === 0) {
        html = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">Nessun paziente</div>';
    }
    panel.innerHTML = html;

    if (selP) {
        label.textContent = selP.name;
        avatar.innerHTML = selP.photo ? `<img src="${selP.photo}" alt="">` : '<i class="fa-solid fa-user"></i>';
    } else {
        label.textContent = '-- Seleziona Paziente --';
        avatar.innerHTML = '<i class="fa-solid fa-user"></i>';
    }
}

window.togglePatientModalDropdown = () => {
    const trigger = document.getElementById('patient-modal-trigger');
    const panel = document.getElementById('patient-modal-panel');
    if (!trigger || !panel) return;
    if (panel.classList.contains('open')) {
        trigger.classList.remove('open'); panel.classList.remove('open');
    } else {
        trigger.classList.add('open'); panel.classList.add('open');
    }
};

window.selectPatientModal = (pid) => {
    const trigger = document.getElementById('patient-modal-trigger');
    const panel = document.getElementById('patient-modal-panel');
    if (trigger) trigger.classList.remove('open');
    if (panel) panel.classList.remove('open');
    renderPatientModalDropdown(pid);
    loadPatientData(pid);
};

// Close modal dropdown on outside click
document.addEventListener('click', (e) => {
    const dd = document.getElementById('patient-modal-dropdown');
    if (dd && !dd.contains(e.target)) {
        const t = document.getElementById('patient-modal-trigger');
        const p = document.getElementById('patient-modal-panel');
        if (t) t.classList.remove('open');
        if (p) p.classList.remove('open');
    }
});

window.openPatients = async () => {
    state.patients = await DB.getAllPatients();
    renderPatientModalDropdown(_patientModalSelectedId);
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
        renderPatientModalDropdown(newPatient.id);
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
    renderPatientModalDropdown(patientId);
    document.getElementById('patient-title').innerText = `Cartella: ${p.name}`;
};

// --- PATIENT CATEGORY ---
window.editPatientCategory = async (patientId) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    // Gather existing categories for suggestions
    const existingCats = [...new Set(state.patients.map(x => x.category).filter(Boolean))];
    const suggestion = existingCats.length > 0 ? `\n\nCategorie esistenti: ${existingCats.join(', ')}` : '';
    const newCat = prompt(`Categoria per ${p.name}:${suggestion}`, p.category || '');
    if (newCat === null) return;
    p.category = newCat.trim();
    await DB.savePatient(p);
    state.patients = await DB.getAllPatients();
    populateGlobalPatientSelect();
    loadPatientData(patientId);
};

// --- DELETE PATIENT ---
window.deletePatient = async (patientId) => {
    if (!confirm("Eliminare definitivamente questo paziente e tutti i suoi dati?")) return;
    await DB.deletePatient(patientId);
    state.patients = await DB.getAllPatients();
    if (state.activePatientId === patientId) state.activePatientId = null;
    populateGlobalPatientSelect();
    renderPatientModalDropdown(null);
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

    // Session type selection
    const currentType = s.sessionType || 'independent';
    const typeChoice = prompt("Tipo sessione (1 = Indipendente, 2 = Time Delay):", currentType === 'timedelay' ? '2' : '1');
    if (typeChoice === null) return;
    const newType = typeChoice.trim() === '2' ? 'timedelay' : 'independent';

    let newTDSeconds = s.timeDelaySeconds || 5;
    if (newType === 'timedelay') {
        const tdInput = prompt("Secondi Time Delay:", newTDSeconds);
        if (tdInput === null) return;
        newTDSeconds = parseInt(tdInput) || 5;
    }

    try {
        let d = new Date(newDateStr);
        if (isNaN(d.getTime())) throw "Data invalida";
        s.date = d.toISOString();
    } catch (e) { alert("Formato data errato. Usa AAAA-MM-GG"); return; }
    s.correct = parseInt(newScore);
    s.total = parseInt(newTotal);
    s.percentage = Math.round((s.correct / s.total) * 100);
    s.sessionType = newType;
    if (newType === 'timedelay') {
        s.timeDelaySeconds = newTDSeconds;
    } else {
        delete s.timeDelaySeconds;
    }
    await DB.savePatient(p);
    loadPatientData(patientId);
};

// --- HELPERS ---
function formatDateEU(isoStr) {
    if (!isoStr) return "--.--.----";
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getDateKey(isoStr) {
    return new Date(isoStr).toISOString().split('T')[0];
}

function getSessionTypeGroup(s) {
    if (s.sessionType === 'timedelay') return 'timedelay';
    if (s.sessionType === 'independent') return 'independent';
    return 'independent'; // legacy sessions without type treated as independent
}

function getSessionTypeLabel(typeGroup) {
    if (typeGroup === 'timedelay') return 'Time Delay';
    return 'Indipendente';
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

// --- REPERTORIO CHECK (>= 90% on first session) ---
function checkRepertorio(sessions) {
    if (sessions.length === 0) return false;
    const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted[0].percentage >= 90;
}

// --- NEAR CRITERION CHECK (last session >= 90%) ---
function isNearCriterion(sessions) {
    if (sessions.length === 0) return false;
    const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const last = sorted[sorted.length - 1];
    return last.percentage >= 90;
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
    container.innerHTML = '';

    // Patient header with photo + category + actions
    const photoSrc = p.photo || '';
    const photoHtml = photoSrc
        ? `<img src="${photoSrc}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid var(--glass-border);" onclick="startPatientPhotoUpload('${pid}')" title="Cambia foto">`
        : `<div onclick="startPatientPhotoUpload('${pid}')" title="Aggiungi foto" style="width:60px; height:60px; border-radius:50%; background:rgba(99,102,241,0.15); display:flex; align-items:center; justify-content:center; cursor:pointer; border:2px dashed var(--glass-border); color:var(--accent-color); font-size:1.3rem;">
            <i class="fa-solid fa-camera"></i>
        </div>`;

    container.innerHTML += `
        <div style="display:flex; gap:15px; margin-bottom:15px; align-items:center;">
            ${photoHtml}
            <div style="flex:1;">
                <div style="font-size:1.1rem; font-weight:700;">${p.name}</div>
                <div style="display:flex; gap:6px; align-items:center; margin-top:4px;">
                    <span onclick="editPatientCategory('${pid}')" style="font-size:0.75rem; padding:2px 8px; border-radius:6px; background:rgba(99,102,241,0.15); color:var(--accent-color); cursor:pointer;" title="Cambia categoria">
                        <i class="fa-solid fa-tag" style="margin-right:3px;"></i>${p.category || 'Nessuna categoria'}
                    </span>
                </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="renamePatient('${pid}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(234,179,8,0.3); color:#eab308;" onclick="openDailyNoteEditor('${pid}')" title="Nota Giornata">
                    <i class="fa-solid fa-book-medical"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(99,102,241,0.3); color:var(--accent-color);" onclick="generateAIReport('${pid}')" title="Report AI">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(168,85,247,0.3); color:#a855f7;" onclick="openReportHistoryStandalone('${pid}')" title="Storico Report AI">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(16,185,129,0.3); color:var(--success-color);" onclick="exportPatientExcel('${pid}')">
                    <i class="fa-solid fa-file-excel"></i>
                </button>
                <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="deletePatient('${pid}')">
                    <i class="fa-solid fa-user-minus"></i>
                </button>
            </div>
        </div>
    `;

    const hasDailyNotes = p.dailyNotes && Object.keys(p.dailyNotes).length > 0;
    if ((!p.history || p.history.length === 0) && !hasDailyNotes) {
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
            <button class="report-tab" onclick="switchReportTab('diary', '${pid}')" data-tab="diary" style="flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; background:transparent; color:var(--text-secondary);">
                <i class="fa-solid fa-book-medical"></i> Diario
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
    else if (tab === 'diary') renderDiaryTab(p);
};

// ============================================================
// TAB 1: PANORAMICA
// ============================================================
function renderOverviewTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history || [];
    const byDate = {};
    history.forEach(h => {
        const dk = getDateKey(h.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(h);
    });

    const dates = Object.keys(byDate).sort();
    // Check which days have notes (daily notes or activity notes)
    const dailyNotes = patient.dailyNotes || {};
    const dailyData = dates.map(dk => {
        const sessions = byDate[dk];
        const totalLU = sessions.reduce((sum, s) => sum + s.total, 0);
        const correctLU = sessions.reduce((sum, s) => sum + s.correct, 0);
        const hasDailyNote = !!dailyNotes[dk];
        const hasActivityNotes = sessions.some(s => s.note);
        return { date: dk, totalLU, correctLU, incorrectLU: totalLU - correctLU, sessions: sessions.length, hasNote: hasDailyNote || hasActivityNotes };
    });

    const lastSession = [...history].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const numDays = dates.length;
    const totalSessions = history.length;
    const totalLUAll = history.reduce((sum, s) => sum + s.total, 0);
    const correctLUAll = history.reduce((sum, s) => sum + s.correct, 0);

    // Daily averages
    const avgSessionsPerDay = numDays > 0 ? (totalSessions / numDays).toFixed(1) : 0;
    const avgCorrectPerDay = numDays > 0 ? Math.round(correctLUAll / numDays) : 0;
    const avgTotalPerDay = numDays > 0 ? Math.round(totalLUAll / numDays) : 0;
    const dailyPcts = dailyData.map(d => d.totalLU > 0 ? (d.correctLU / d.totalLU) * 100 : 0);
    const avgDailyPct = dailyPcts.length > 0 ? Math.round(dailyPcts.reduce((a, b) => a + b, 0) / dailyPcts.length) : 0;

    let html = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:20px;">
        <div style="background:rgba(99,102,241,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(99,102,241,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--accent-color);">${avgSessionsPerDay}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Sessioni/Giorno</div>
            <div style="font-size:0.6rem; color:#666; margin-top:2px;">${totalSessions} tot. in ${numDays}g</div>
        </div>
        <div style="background:rgba(16,185,129,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(16,185,129,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--success-color);">${avgCorrectPerDay}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">LU Corrette/Giorno</div>
            <div style="font-size:0.6rem; color:#666; margin-top:2px;">${correctLUAll} totali</div>
        </div>
        <div style="background:rgba(245,158,11,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(245,158,11,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:var(--warning-color);">${avgTotalPerDay}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">LU Totali/Giorno</div>
            <div style="font-size:0.6rem; color:#666; margin-top:2px;">${totalLUAll} totali</div>
        </div>
        <div style="background:rgba(139,92,246,0.15); padding:12px; border-radius:12px; text-align:center; border:1px solid rgba(139,92,246,0.3);">
            <div style="font-size:1.5rem; font-weight:800; color:#a78bfa;">${avgDailyPct}%</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Media Giornaliera</div>
            <div style="font-size:0.6rem; color:#666; margin-top:2px;">${numDays} giornate</div>
        </div>
    </div>`;

    if (dailyData.length > 0) {
        html += `
        <div class="chart-wrapper" style="margin-bottom:20px;">
            <h4 style="margin:0 0 10px 0; color:var(--accent-color); font-size:0.95rem;">
                <i class="fa-solid fa-chart-bar"></i> Learn Unit Giornaliere
            </h4>
            <div id="daily-lu-chart" style="overflow-x:auto;"></div>
        </div>`;
    }

    if (lastSession) {
        const modeName = MODES_CONFIG[lastSession.mode] || lastSession.mode;
        const lastModeIcon = (typeof getModeIcon === 'function') ? getModeIcon(lastSession.mode) : 'fa-puzzle-piece';
        html += `
        <div class="chart-wrapper" style="margin-bottom:15px; border-left:4px solid var(--accent-color);">
            <h4 style="margin:0 0 8px 0; color:var(--accent-color); font-size:0.9rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> Ultima Seduta
            </h4>
            <div style="display:flex; gap:15px; flex-wrap:wrap; font-size:0.9rem;">
                <div><span style="color:var(--text-secondary);">Data:</span> <b>${formatDateEU(lastSession.date)}</b></div>
                <div><span style="color:var(--text-secondary);">Attivit&agrave;:</span> <b><i class="fa-solid ${lastModeIcon}" style="font-size:0.8rem; margin-right:3px; opacity:0.7;"></i>${modeName}</b></div>
                <div><span style="color:var(--text-secondary);">Set:</span> <b>${lastSession.setName}</b>${lastSession.setCat ? ` <span style="color:var(--text-secondary); font-size:0.8em;">(${lastSession.setCat})</span>` : ''}</div>
                <div><span style="color:var(--text-secondary);">Score:</span> <b style="color:${lastSession.percentage >= 90 ? 'var(--success-color)' : 'white'}">${lastSession.correct}/${lastSession.total} (${lastSession.percentage}%)</b></div>
            </div>
        </div>`;
    }

    content.innerHTML = html;
    if (dailyData.length > 0) renderDailyLUChart(dailyData);
}

// --- Daily LU Bar Chart (green correct, red incorrect) ---
function renderDailyLUChart(dailyData) {
    const chartContainer = document.getElementById('daily-lu-chart');
    if (!chartContainer) return;

    const maxLU = Math.max(...dailyData.map(d => d.totalLU), 1);
    const topPad = 18; // space for count labels above tallest bar
    const chartHeight = 150;
    const barWidth = Math.max(30, Math.min(50, 600 / dailyData.length));
    const chartWidth = Math.max(300, dailyData.length * (barWidth + 8) + 40);
    const hasAnyNote = dailyData.some(d => d.hasNote);
    const svgH = topPad + chartHeight + (hasAnyNote ? 40 : 30);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${chartWidth} ${svgH}`);
    svg.setAttribute("width", chartWidth);
    svg.setAttribute("height", svgH);
    svg.style.minWidth = chartWidth + 'px';

    const bY = topPad; // base offset for all bar y-coords

    dailyData.forEach((d, i) => {
        const x = 20 + i * (barWidth + 8);
        const totalH = (d.totalLU / maxLU) * chartHeight;
        const correctH = (d.correctLU / maxLU) * chartHeight;
        const incorrectH = totalH - correctH;
        const tooltip = `${formatDateEU(d.date + 'T00:00:00')}\nTotali: ${d.totalLU}\nCorrette: ${d.correctLU}\nErrate: ${d.incorrectLU}\nSessioni: ${d.sessions}`;

        // Incorrect bar (red, top portion)
        if (incorrectH > 0) {
            const incorrectBar = document.createElementNS(svgNS, "rect");
            incorrectBar.setAttribute("x", x);
            incorrectBar.setAttribute("y", bY + chartHeight - totalH);
            incorrectBar.setAttribute("width", barWidth);
            incorrectBar.setAttribute("height", incorrectH);
            incorrectBar.setAttribute("fill", "var(--danger-color)");
            incorrectBar.setAttribute("opacity", "0.6");
            incorrectBar.setAttribute("rx", "4");
            const t1 = document.createElementNS(svgNS, "title");
            t1.textContent = tooltip;
            incorrectBar.appendChild(t1);
            svg.appendChild(incorrectBar);
        }

        // Correct bar (green, bottom portion)
        if (correctH > 0) {
            const correctBar = document.createElementNS(svgNS, "rect");
            correctBar.setAttribute("x", x);
            correctBar.setAttribute("y", bY + chartHeight - correctH);
            correctBar.setAttribute("width", barWidth);
            correctBar.setAttribute("height", correctH);
            correctBar.setAttribute("fill", "var(--success-color)");
            correctBar.setAttribute("opacity", "0.7");
            correctBar.setAttribute("rx", "4");
            const t2 = document.createElementNS(svgNS, "title");
            t2.textContent = tooltip;
            correctBar.appendChild(t2);
            svg.appendChild(correctBar);
        }

        // Date label
        const lbl = document.createElementNS(svgNS, "text");
        lbl.setAttribute("x", x + barWidth / 2);
        lbl.setAttribute("y", bY + chartHeight + 15);
        lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("fill", "#888");
        lbl.setAttribute("font-size", "8");
        const dObj = new Date(d.date + 'T00:00:00');
        lbl.textContent = `${dObj.getDate()}/${dObj.getMonth() + 1}`;
        svg.appendChild(lbl);

        // Note icon if day has notes
        if (d.hasNote) {
            const noteIcon = document.createElementNS(svgNS, "text");
            noteIcon.setAttribute("x", x + barWidth / 2);
            noteIcon.setAttribute("y", bY + chartHeight + 24);
            noteIcon.setAttribute("text-anchor", "middle");
            noteIcon.setAttribute("fill", "#eab308");
            noteIcon.setAttribute("font-size", "8");
            noteIcon.textContent = "\u270E";
            const noteTitle = document.createElementNS(svgNS, "title");
            noteTitle.textContent = "Giornata con note";
            noteIcon.appendChild(noteTitle);
            svg.appendChild(noteIcon);
        }

        // Count label on top (total LU)
        const countLbl = document.createElementNS(svgNS, "text");
        countLbl.setAttribute("x", x + barWidth / 2);
        countLbl.setAttribute("y", bY + chartHeight - totalH - 4);
        countLbl.setAttribute("text-anchor", "middle");
        countLbl.setAttribute("fill", "#aaa");
        countLbl.setAttribute("font-size", "9");
        countLbl.setAttribute("font-weight", "bold");
        countLbl.textContent = d.totalLU;
        svg.appendChild(countLbl);

        // Percentage label at green/red boundary
        const pct = d.totalLU > 0 ? Math.round((d.correctLU / d.totalLU) * 100) : 0;
        const pctLbl = document.createElementNS(svgNS, "text");
        pctLbl.setAttribute("x", x + barWidth + 3);
        pctLbl.setAttribute("y", bY + chartHeight - correctH + 3);
        pctLbl.setAttribute("text-anchor", "start");
        pctLbl.setAttribute("fill", "var(--success-color)");
        pctLbl.setAttribute("font-size", "7");
        pctLbl.setAttribute("font-weight", "bold");
        pctLbl.textContent = pct + '%';
        svg.appendChild(pctLbl);
    });

    // Legend
    const legendY = bY + chartHeight + 24;
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
    const legIncorrect = document.createElementNS(svgNS, "rect");
    legIncorrect.setAttribute("x", "80"); legIncorrect.setAttribute("y", legendY);
    legIncorrect.setAttribute("width", "10"); legIncorrect.setAttribute("height", "6");
    legIncorrect.setAttribute("fill", "var(--danger-color)"); legIncorrect.setAttribute("opacity", "0.6"); legIncorrect.setAttribute("rx", "2");
    svg.appendChild(legIncorrect);
    const legIText = document.createElementNS(svgNS, "text");
    legIText.setAttribute("x", "94"); legIText.setAttribute("y", legendY + 6);
    legIText.setAttribute("fill", "#888"); legIText.setAttribute("font-size", "8");
    legIText.textContent = "Errate";
    svg.appendChild(legIText);

    chartContainer.appendChild(svg);
}

// ============================================================
// TAB 2: GIORNATE - Date-based view with expandable activities
// ============================================================
function renderDatesTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history || [];
    const dailyNotes = patient.dailyNotes || {};
    const byDate = {};
    history.forEach((h, idx) => {
        const dk = getDateKey(h.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push({ ...h, originalIndex: idx });
    });

    // Also include dates that only have daily notes but no sessions
    Object.keys(dailyNotes).forEach(dk => {
        if (!byDate[dk]) byDate[dk] = [];
    });

    const dates = Object.keys(byDate).sort().reverse();

    let html = '';
    dates.forEach((dk) => {
        const sessions = byDate[dk];
        const totalLU = sessions.reduce((sum, s) => sum + s.total, 0);
        const correctLU = sessions.reduce((sum, s) => sum + s.correct, 0);
        const pct = totalLU > 0 ? Math.round((correctLU / totalLU) * 100) : 0;
        const hasDailyNote = !!dailyNotes[dk];
        const noteIndicator = hasDailyNote ? '<i class="fa-solid fa-book-medical" style="color:#eab308; font-size:0.7rem;" title="Nota giornata"></i>' : '';

        html += `
        <div class="chart-wrapper" style="margin-bottom:10px; padding:0; overflow:hidden;">
            <div onclick="toggleDateExpand(this)" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-chevron-right date-expand-icon" style="transition:transform 0.2s; font-size:0.7rem; color:var(--text-secondary);"></i>
                    <span style="font-weight:bold; font-size:1rem;">${formatDateEU(dk + 'T00:00:00')}</span>
                    ${noteIndicator}
                    <span style="color:var(--text-secondary); font-size:0.8rem;">${sessions.length} attivit&agrave;</span>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <span style="font-size:0.85rem; color:var(--success-color);">${correctLU}<span style="color:var(--text-secondary);">/${totalLU}</span></span>
                    <span style="font-weight:bold; font-size:0.9rem; color:${pct >= 90 ? 'var(--success-color)' : pct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)'};">${pct}%</span>
                </div>
            </div>
            <div class="date-detail-panel" style="display:none; padding:0 15px 12px; border-top:1px solid rgba(255,255,255,0.05);">
                ${hasDailyNote ? `
                <div class="daily-note-card" style="margin:8px 0 12px; padding:12px; border-radius:10px; background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.2); border-left:3px solid #eab308;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size:0.8rem; color:#eab308; font-weight:bold;"><i class="fa-solid fa-book-medical"></i> Nota della Giornata</span>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-icon" style="width:22px; height:22px; font-size:0.6rem; color:#eab308; border-color:rgba(234,179,8,0.3);" onclick="event.stopPropagation(); openDailyNoteEditor('${patient.id}', '${dk}')" title="Modifica"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-icon" style="width:22px; height:22px; font-size:0.6rem; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="event.stopPropagation(); deleteDailyNote('${patient.id}', '${dk}')" title="Elimina"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="daily-note-content" style="font-size:0.85rem; line-height:1.5; color:#ddd;">${_renderNoteMarkup(dailyNotes[dk])}</div>
                </div>` : ''}
                ${sessions.map(s => {
            const modeName = MODES_CONFIG[s.mode] || s.mode;
            const dayModeIcon = (typeof getModeIcon === 'function') ? getModeIcon(s.mode) : 'fa-puzzle-piece';
            const typeTag = s.sessionType === 'timedelay' ? `<span style="font-size:0.6rem; background:rgba(245,158,11,0.2); color:var(--warning-color); padding:1px 5px; border-radius:4px; margin-left:4px;">TD${s.timeDelaySeconds || ''}s</span>` : '';
            const sessionNoteIcon = s.note ? '<i class="fa-solid fa-sticky-note" style="color:#eab308; font-size:0.6rem; flex-shrink:0;" title="Nota attività"></i>' : '';
            const activityKey = encodeURIComponent(s.setName + '::' + s.mode + '::' + getSessionTypeGroup(s));
            // Set thumbnail for Giornate
            let dayThumb = '';
            if (s.setId && state.savedSets) {
                const daySet = state.savedSets.find(ss => ss.id === s.setId);
                if (daySet && daySet.items && daySet.items.length > 0) {
                    const fi = daySet.items.find(it => it.img || it.image);
                    if (fi) dayThumb = `<img src="${fi.img || fi.image}" style="width:22px; height:22px; border-radius:4px; object-fit:cover; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;" alt="">`;
                }
            }
            return `
                    <div style="margin-top:8px; border:1px solid rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
                        <div onclick="toggleDaySessionDetail(this, '${patient.id}', ${s.originalIndex}, '${activityKey}')" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
                            <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                                <i class="fa-solid fa-chevron-right day-act-icon" style="transition:transform 0.2s; font-size:0.6rem; color:#555;"></i>
                                ${dayThumb}
                                <span style="background:rgba(99,102,241,0.15); padding:2px 8px; border-radius:6px; font-size:0.7rem; color:var(--accent-color); flex-shrink:0; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid ${dayModeIcon}" style="font-size:0.65rem;"></i>${modeName}</span>
                                <span style="font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.setName}</span>${s.setCat ? `<span style="font-size:0.65rem; color:var(--text-secondary); background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:4px; flex-shrink:0;">${s.setCat}</span>` : ''}${typeTag}${sessionNoteIcon}
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                                <span style="font-size:0.85rem;">${s.correct}/${s.total}</span>
                                <span style="font-weight:bold; font-size:0.85rem; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'};">${s.percentage}%</span>
                                <button class="btn-icon" style="width:24px; height:24px; font-size:0.65rem; display:inline-flex;" onclick="event.stopPropagation(); editSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn-icon" style="width:24px; height:24px; font-size:0.65rem; display:inline-flex; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="event.stopPropagation(); deleteSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                        <div class="day-activity-chart-panel" style="display:none; padding:8px 12px 12px; border-top:1px solid rgba(255,255,255,0.03);"></div>
                    </div>`;
        }).join('')}
            </div>
        </div>`;
    });

    content.innerHTML = html;

    // Auto-expand first date
    const firstPanel = content.querySelector('.date-detail-panel');
    const firstIcon = content.querySelector('.date-expand-icon');
    if (firstPanel) firstPanel.style.display = 'block';
    if (firstIcon) firstIcon.style.transform = 'rotate(90deg)';
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

// Toggle activity chart inside a date row in Giornate tab
window.toggleDaySessionDetail = (header, patientId, sessionIdx, activityKeyEncoded) => {
    const panel = header.nextElementSibling;
    const icon = header.querySelector('.day-act-icon');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(90deg)';
        if (panel.innerHTML.trim() === '') {
            const p = state.patients.find(x => x.id === patientId);
            if (!p) return;
            const s = p.history[sessionIdx];
            if (!s) return;

            const isTD = s.sessionType === 'timedelay';
            const prompts = s.rawP || 0;
            const errors = s.rawX || 0;
            let html = '';

            // Score breakdown
            html += `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">`;
            html += `<span style="font-size:0.8rem;"><i class="fa-solid fa-check" style="color:var(--success-color);"></i> ${s.correct}</span>`;
            if (prompts > 0) html += `<span style="font-size:0.8rem; color:var(--warning-color);"><b>P</b> ${prompts}</span>`;
            if (errors > 0) html += `<span style="font-size:0.8rem; color:var(--danger-color);"><b>X</b> ${errors}</span>`;
            html += `<span style="font-size:0.8rem; color:var(--text-secondary);">Tot: ${s.total}</span>`;
            if (isTD && s.timeDelaySeconds) html += `<span style="font-size:0.75rem; background:rgba(245,158,11,0.15); color:var(--warning-color); padding:2px 8px; border-radius:6px;">TD ${s.timeDelaySeconds}s</span>`;
            html += `</div>`;

            // Item details (wrong/prompted items)
            if (s.itemDetails && s.itemDetails.length > 0) {
                const wrong = s.itemDetails.filter(d => d.result !== true);
                if (wrong.length > 0) {
                    const wrongLabel = isTD ? 'Promptati' : 'Sbagliati';
                    const wrongColor = isTD ? 'var(--warning-color)' : 'var(--danger-color)';
                    const wrongRgba = isTD ? '245,158,11' : '239,68,68';
                    html += `<div style="margin-bottom:8px;">`;
                    html += `<div style="font-size:0.7rem; color:${wrongColor}; margin-bottom:4px; font-weight:bold;">${wrongLabel} (${wrong.length}):</div>`;
                    html += `<div style="display:flex; flex-wrap:wrap; gap:2px;">`;
                    wrong.forEach(d => {
                        const isPrompt = d.result === 'prompt';
                        const color = isTD ? 'var(--warning-color)' : (isPrompt ? 'var(--warning-color)' : 'var(--danger-color)');
                        const rgba = isTD ? '245,158,11' : (isPrompt ? '245,158,11' : '239,68,68');
                        const tag = isTD ? 'P' : (isPrompt ? 'P' : 'X');
                        html += `<span style="display:inline-block; padding:2px 8px; margin:2px; border-radius:6px; font-size:0.75rem; background:rgba(${rgba},0.12); color:${color}; border:1px solid rgba(${rgba},0.3);">${d.label} <span style="opacity:0.6;">${tag}</span></span>`;
                    });
                    html += `</div></div>`;
                }
            }

            // Task analysis step details with percentages
            if (s.mode === 'quaderno_task' && s.taskSteps && s.taskSteps.length > 0) {
                html += `<div style="margin-bottom:8px;">`;
                html += `<div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:bold;"><i class="fa-solid fa-list-ol"></i> Dettaglio Passaggi:</div>`;
                html += `<div style="display:flex; flex-direction:column; gap:2px;">`;
                s.taskSteps.forEach((step, i) => {
                    const v = step.v || 0, x = step.x || 0, p = step.p || 0, na = step.na || 0;
                    const scored = v + x + p;
                    const stepPct = scored > 0 ? Math.round(v / scored * 100) : null;
                    let parts = [];
                    if (v > 0) parts.push(`<span style="color:var(--success-color)">${v}V</span>`);
                    if (x > 0) parts.push(`<span style="color:var(--danger-color)">${x}X</span>`);
                    if (p > 0) parts.push(`<span style="color:var(--warning-color)">${p}P</span>`);
                    if (parts.length === 0 && na > 0) parts.push(`<span style="color:#888">N/A</span>`);
                    let bg = 'rgba(255,255,255,0.05)', border = 'rgba(255,255,255,0.1)';
                    if (v > 0 && x === 0 && p === 0) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; }
                    else if (x > 0) { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; }
                    else if (p > 0) { bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.3)'; }
                    const pctColor = stepPct !== null ? (stepPct >= 90 ? 'var(--success-color)' : stepPct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)') : '#888';
                    const pctHtml = stepPct !== null ? `<span style="font-size:0.7rem; color:${pctColor}; font-weight:bold; margin-left:6px;">${stepPct}%</span>` : '';
                    html += `<div style="padding:4px 8px; border-radius:6px; font-size:0.75rem; background:${bg}; border:1px solid ${border}; display:flex; justify-content:space-between; align-items:center;">
                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;"><b>${i + 1}.</b> ${step.name}</span>
                        <span style="font-weight:bold; flex-shrink:0; display:flex; align-items:center; gap:4px;">${parts.length > 0 ? parts.join(' ') : '<span style="color:#888">N/A</span>'}${pctHtml}</span>
                    </div>`;
                });
                html += `</div></div>`;
            }

            // Multi-set breakdown (search_find / intraverbal_scenari)
            if (s.setBreakdown && s.setBreakdown.length > 0) {
                html += `<div style="margin-bottom:8px;">`;
                html += `<div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:bold;"><i class="fa-solid fa-images"></i> Dettaglio per Set (${s.setBreakdown.length}):</div>`;
                html += `<div style="display:flex; flex-direction:column; gap:2px;">`;
                s.setBreakdown.forEach((sb, i) => {
                    const pct = sb.percentage;
                    const pctColor = pct >= 90 ? 'var(--success-color)' : pct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';
                    let bg = 'rgba(255,255,255,0.05)', border = 'rgba(255,255,255,0.1)';
                    if (pct >= 90) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; }
                    else if (pct >= 70) { bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.3)'; }
                    else { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; }
                    let parts = [];
                    if (sb.correct > 0) parts.push(`<span style="color:var(--success-color)">${sb.correct}V</span>`);
                    if ((sb.incorrect || 0) > 0) parts.push(`<span style="color:var(--danger-color)">${sb.incorrect}X</span>`);
                    if ((sb.prompts || 0) > 0) parts.push(`<span style="color:var(--warning-color)">${sb.prompts}P</span>`);
                    html += `<div style="padding:4px 8px; border-radius:6px; font-size:0.75rem; background:${bg}; border:1px solid ${border}; display:flex; justify-content:space-between; align-items:center;">
                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;"><b>${i + 1}.</b> ${sb.setName}${sb.setCat ? ` <span style="color:var(--text-secondary); font-size:0.65rem;">(${sb.setCat})</span>` : ''}</span>
                        <span style="font-weight:bold; flex-shrink:0; display:flex; align-items:center; gap:4px;">${parts.join(' ')} <span style="font-size:0.7rem; color:${pctColor}; font-weight:bold; margin-left:6px;">${pct}%</span></span>
                    </div>`;
                });
                html += `</div></div>`;
            }

            // Session note (collapsible)
            if (s.note) {
                html += `<div style="margin-top:8px; margin-bottom:8px;">
                    <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('i').style.transform = this.nextElementSibling.style.display === 'none' ? '' : 'rotate(90deg)'" style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#eab308; font-weight:bold;">
                        <i class="fa-solid fa-chevron-right" style="font-size:0.6rem; transition:transform 0.2s;"></i>
                        <i class="fa-solid fa-sticky-note"></i> Nota
                    </div>
                    <div style="display:none; margin-top:4px; padding:8px; border-radius:8px; background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.15); font-size:0.8rem; line-height:1.4; color:#ddd;">${_renderNoteMarkup(s.note)}</div>
                </div>`;
            }

            // Activity chart (full history for this activity)
            const activityKey = decodeURIComponent(activityKeyEncoded);
            const [setName, modeCode, typeGroup] = activityKey.split('::');
            const allSessions = p.history.filter(h =>
                h.setName === setName && h.mode === modeCode && getSessionTypeGroup(h) === typeGroup
            ).sort((a, b) => new Date(a.date) - new Date(b.date));
            if (allSessions.length > 1) {
                html += `<div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:4px;"><i class="fa-solid fa-chart-line"></i> Andamento (${allSessions.length} sess.)</div>
                    <div id="day-chart-${sessionIdx}"></div>
                </div>`;
            }

            panel.innerHTML = html;

            if (allSessions.length > 1) {
                const chartEl = document.getElementById(`day-chart-${sessionIdx}`);
                if (chartEl) renderActivitySVGChart(chartEl, allSessions, typeGroup, modeCode);
            }
        }
    } else {
        panel.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
};

// --- Item details collapsible row for session tables ---
function renderItemDetailsCollapsible(s, patientId, sessionIdx, isTD) {
    const details = s.itemDetails;
    if (!details || details.length === 0) return '';

    const wrong = details.filter(d => d.result !== true);
    if (wrong.length === 0) return '';

    const wrongLabel = isTD ? 'Promptati' : 'Sbagliati';
    const wrongColor = isTD ? 'var(--warning-color)' : 'var(--danger-color)';
    const colSpan = isTD ? 6 : 5;

    const chips = wrong.map(d => {
        const isPrompt = d.result === 'prompt';
        const color = isTD ? 'var(--warning-color)' : (isPrompt ? 'var(--warning-color)' : 'var(--danger-color)');
        const tag = isTD ? 'P' : (isPrompt ? 'P' : 'X');
        return `<span style="display:inline-block; padding:2px 8px; margin:2px; border-radius:6px; font-size:0.75rem; background:rgba(${isTD ? '245,158,11' : (isPrompt ? '245,158,11' : '239,68,68')},0.12); color:${color}; border:1px solid rgba(${isTD ? '245,158,11' : (isPrompt ? '245,158,11' : '239,68,68')},0.3);">${d.label} <span style="opacity:0.6;">${tag}</span></span>`;
    }).join('');

    return `
        <tr class="item-details-row" style="display:table-row;">
            <td colspan="${colSpan}" style="padding:6px 10px; background:rgba(0,0,0,0.15);">
                <div style="font-size:0.7rem; color:${wrongColor}; margin-bottom:4px; font-weight:bold;">${wrongLabel} (${wrong.length}):</div>
                <div style="display:flex; flex-wrap:wrap; gap:2px;">${chips}</div>
            </td>
        </tr>`;
}

function renderTaskStepDetailsCollapsible(s, patientId, sessionIdx, isTD) {
    if (!s.taskSteps || s.taskSteps.length === 0) return '';
    const colSpan = isTD ? 6 : 5;

    const chips = s.taskSteps.map((step, i) => {
        const v = step.v || 0;
        const x = step.x || 0;
        const p = step.p || 0;
        const na = step.na || 0;

        let parts = [];
        if (v > 0) parts.push(`<span style="color:var(--success-color)">${v}V</span>`);
        if (x > 0) parts.push(`<span style="color:var(--danger-color)">${x}X</span>`);
        if (p > 0) parts.push(`<span style="color:var(--warning-color)">${p}P</span>`);
        if (parts.length === 0 && na > 0) parts.push(`<span style="color:#888">N/A</span>`);

        let bg = 'rgba(255,255,255,0.05)';
        let border = 'rgba(255,255,255,0.1)';

        if (v > 0 && x === 0 && p === 0) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; }
        else if (x > 0) { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; }
        else if (p > 0) { bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.3)'; }

        return `<div style="padding:4px 8px; margin:2px 0; border-radius:6px; font-size:0.75rem; background:${bg}; border:1px solid ${border}; display:flex; justify-content:space-between; align-items:center;">
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;"><b>${i + 1}.</b> ${step.name}</span>
            <span style="font-weight:bold; flex-shrink:0;">${parts.length > 0 ? parts.join(' ') : (step.scored ? '-' : '<span style="color:#888">N/A</span>')}</span>
        </div>`;
    }).join('');

    return `
        <tr class="item-details-row" style="display:table-row;">
            <td colspan="${colSpan}" style="padding:6px 10px; background:rgba(0,0,0,0.15);">
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:bold;"><i class="fa-solid fa-list-ol"></i> Dettaglio Passaggi (V/X/P):</div>
                <div style="display:flex; flex-direction:column; gap:2px;">${chips}</div>
            </td>
        </tr>`;
}

// --- Set breakdown collapsible row for multi-set sessions (search_find / intraverbal_scenari) ---
function renderSetBreakdownCollapsible(s, patientId, sessionIdx, isTD) {
    if (!s.setBreakdown || s.setBreakdown.length === 0) return '';
    const colSpan = isTD ? 6 : 5;

    const chips = s.setBreakdown.map((sb, i) => {
        const pct = sb.percentage;
        const pctColor = pct >= 90 ? 'var(--success-color)' : pct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';
        let bg = 'rgba(255,255,255,0.05)';
        let border = 'rgba(255,255,255,0.1)';
        if (pct >= 90) { bg = 'rgba(16,185,129,0.1)'; border = 'rgba(16,185,129,0.3)'; }
        else if (pct >= 70) { bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.3)'; }
        else { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.3)'; }

        let parts = [];
        if (sb.correct > 0) parts.push(`<span style="color:var(--success-color)">${sb.correct}V</span>`);
        if ((sb.incorrect || 0) > 0) parts.push(`<span style="color:var(--danger-color)">${sb.incorrect}X</span>`);
        if ((sb.prompts || 0) > 0) parts.push(`<span style="color:var(--warning-color)">${sb.prompts}P</span>`);

        return `<div style="padding:4px 8px; margin:2px 0; border-radius:6px; font-size:0.75rem; background:${bg}; border:1px solid ${border}; display:flex; justify-content:space-between; align-items:center;">
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;"><b>${i + 1}.</b> ${sb.setName}${sb.setCat ? ` <span style="color:var(--text-secondary); font-size:0.65rem;">(${sb.setCat})</span>` : ''}</span>
            <span style="font-weight:bold; flex-shrink:0; display:flex; align-items:center; gap:4px;">${parts.join(' ')} <span style="font-size:0.7rem; color:${pctColor}; font-weight:bold; margin-left:4px;">${pct}%</span></span>
        </div>`;
    }).join('');

    return `
        <tr class="item-details-row" style="display:table-row;">
            <td colspan="${colSpan}" style="padding:6px 10px; background:rgba(0,0,0,0.15);">
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:bold;"><i class="fa-solid fa-images"></i> Dettaglio per Set (${s.setBreakdown.length}):</div>
                <div style="display:flex; flex-direction:column; gap:2px;">${chips}</div>
            </td>
        </tr>`;
}

// ============================================================
// TAB 3: ATTIVITA - Per-activity charts separated by session type
// ============================================================
function renderActivitiesTab(patient, sortBy) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const history = patient.history;
    if (!sortBy) sortBy = state._activitiesSortBy || 'recent-desc';

    // Group by setName::mode::sessionType
    const groups = {};
    history.forEach((h, idx) => {
        const typeGroup = getSessionTypeGroup(h);
        const key = `${h.setName}::${h.mode}::${typeGroup}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...h, originalIndex: idx });
    });

    let chartList = Object.entries(groups).map(([key, sessions]) => {
        const [setName, modeCode, typeGroup] = key.split('::');
        const sortedSess = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const lastDate = Math.max(...sessions.map(s => new Date(s.date).getTime()));
        const setCat = sessions.find(s => s.setCat)?.setCat || '';
        const isMastered = checkCriterion(sortedSess);
        const isRepertorio = checkRepertorio(sortedSess);
        const lastSession = sortedSess[sortedSess.length - 1];
        const lastPct = lastSession ? lastSession.percentage : 0;
        const avgPct = sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.percentage, 0) / sessions.length) : 0;
        const criterionScore = isMastered ? 2 : isRepertorio ? 1 : 0;
        return { key, sessions, setName, modeCode, typeGroup, lastDate, setCat, isMastered, isRepertorio, lastPct, avgPct, criterionScore };
    });

    // Sort
    if (sortBy === 'recent-desc') chartList.sort((a, b) => b.lastDate - a.lastDate);
    else if (sortBy === 'recent-asc') chartList.sort((a, b) => a.lastDate - b.lastDate);
    else if (sortBy === 'category') chartList.sort((a, b) => (a.setCat || 'zzz').localeCompare(b.setCat || 'zzz') || b.lastDate - a.lastDate);
    else if (sortBy === 'criterion-desc') chartList.sort((a, b) => b.criterionScore - a.criterionScore || b.lastDate - a.lastDate);
    else if (sortBy === 'criterion-asc') chartList.sort((a, b) => a.criterionScore - b.criterionScore || b.lastDate - a.lastDate);
    else if (sortBy === 'pct-desc') chartList.sort((a, b) => b.lastPct - a.lastPct || b.lastDate - a.lastDate);
    else if (sortBy === 'pct-asc') chartList.sort((a, b) => a.lastPct - b.lastPct || b.lastDate - a.lastDate);

    // Sort toolbar
    let html = `
    <div style="display:flex; gap:6px; margin-bottom:12px; align-items:center; flex-wrap:wrap; background:rgba(0,0,0,0.2); padding:8px; border-radius:10px;">
        <span style="font-size:0.75rem; color:var(--text-secondary); margin-right:4px;"><i class="fa-solid fa-sort"></i> Ordina:</span>
        ${[
            ['recent-desc', 'Recenti ↓'],
            ['recent-asc', 'Recenti ↑'],
            ['category', 'Categoria'],
            ['criterion-desc', 'Criterio ↓'],
            ['criterion-asc', 'Criterio ↑'],
            ['pct-desc', '% ↓'],
            ['pct-asc', '% ↑']
        ].map(([val, label]) => `<button onclick="changeActivitiesSort('${val}', '${patient.id}')" style="padding:4px 10px; border-radius:6px; font-size:0.7rem; border:1px solid ${sortBy === val ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${sortBy === val ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${sortBy === val ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${sortBy === val ? 'bold' : 'normal'};">${label}</button>`).join('')}
    </div>`;

    chartList.forEach(item => {
        const { sessions, setName, modeCode, typeGroup, setCat, isMastered, isRepertorio, lastPct } = item;
        const modeName = MODES_CONFIG[modeCode] || modeCode;
        sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
        const lastSession = sessions[sessions.length - 1];
        const nearCrit = !isMastered && isNearCriterion(sessions);

        let badgeHtml = '';
        if (isMastered) badgeHtml += `<span class="criterion-badge"><i class="fa-solid fa-trophy"></i> CRITERIO</span>`;
        if (isRepertorio) badgeHtml += `<span class="repertorio-badge"><i class="fa-solid fa-star"></i> REPERTORIO</span>`;

        const typeColor = typeGroup === 'timedelay' ? 'var(--warning-color)' : 'var(--success-color)';
        const typeLbl = getSessionTypeLabel(typeGroup);
        const chartId = 'activity-chart-' + item.key.replace(/[^a-zA-Z0-9]/g, '_');

        // Mode icon
        const modeIconClass = (typeof getModeIcon === 'function') ? getModeIcon(modeCode) : 'fa-puzzle-piece';

        // Set thumbnail from first item image (if set still exists)
        let setThumbHtml = '';
        const setId = sessions.find(s => s.setId)?.setId;
        if (setId && state.savedSets) {
            const setObj = state.savedSets.find(ss => ss.id === setId);
            if (setObj && setObj.items && setObj.items.length > 0) {
                const firstImg = setObj.items.find(it => it.img || it.image);
                if (firstImg) {
                    const imgSrc = firstImg.img || firstImg.image;
                    setThumbHtml = `<img src="${imgSrc}" style="width:28px; height:28px; border-radius:6px; object-fit:cover; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;" alt="">`;
                }
            }
        }

        // Check if this is a task analysis group with step data
        const isTaskAnalysis = modeCode === 'quaderno_task';
        const sessionsWithSteps = sessions.filter(s => s.taskSteps && s.taskSteps.length > 0);
        const taskStepsAnalysisHtml = isTaskAnalysis && sessionsWithSteps.length > 0
            ? renderTaskStepsAnalysis(sessionsWithSteps) : '';

        // Check if this has multi-set breakdown data (search_find / intraverbal_scenari)
        const sessionsWithBreakdown = sessions.filter(s => s.setBreakdown && s.setBreakdown.length > 0);
        const setBreakdownAnalysisHtml = sessionsWithBreakdown.length > 0
            ? renderSetBreakdownAnalysis(sessionsWithBreakdown) : '';

        // Fluenza obiettivo
        const isFluenza = modeCode === 'fluenza';
        let fluenzaObiettivoHtml = '';
        if (isFluenza && sessions.length > 0) {
            const maxCorrect = Math.max(...sessions.map(s => s.correct || 0));
            const obiettivo = maxCorrect + 2;
            fluenzaObiettivoHtml = `<span style="font-size:0.7rem; background:rgba(99,102,241,0.15); color:var(--accent-color); padding:2px 8px; border-radius:6px; font-weight:bold;"><i class="fa-solid fa-bullseye"></i> Ob: ${obiettivo}</span>`;
        }

        // Quick status: last session + near criterion
        const lastPctColor = lastPct >= 90 ? 'var(--success-color)' : lastPct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';
        const nearCritHtml = nearCrit ? `<span style="font-size:0.65rem; background:rgba(16,185,129,0.15); color:var(--success-color); padding:1px 6px; border-radius:4px;"><i class="fa-solid fa-arrow-trend-up"></i> Vicino al criterio</span>` : '';
        const lastInfoHtml = lastSession ? `<span style="font-size:0.7rem; color:var(--text-secondary);">${formatDateEU(lastSession.date)}</span> <span style="font-size:0.75rem; font-weight:bold; color:${lastPctColor};">${lastPct}%</span>` : '';

        html += `
        <div class="chart-wrapper" data-set-id="${setId || ''}" style="margin-bottom:12px; border-left:3px solid ${typeColor};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <h4 style="margin:0; color:var(--accent-color); font-size:0.95rem; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${setThumbHtml}
                    <i class="fa-solid ${modeIconClass}" style="font-size:0.85rem; opacity:0.7;"></i>
                    ${setName} ${setCat ? `<span style="color:var(--text-secondary); font-size:0.7em; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:4px;">${setCat}</span>` : ''}<span style="color:#666; font-size:0.8em;">(${modeName})</span> ${badgeHtml} ${fluenzaObiettivoHtml}
                </h4>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.65rem; background:rgba(${typeGroup === 'timedelay' ? '245,158,11' : '16,185,129'},0.15); color:${typeColor}; padding:2px 8px; border-radius:6px; font-weight:bold;">${typeLbl}</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${sessions.length} sess.</span>
                    <button class="btn-icon" onclick="toggleActivityDetails(this)" style="width:28px; height:28px; background:rgba(255,255,255,0.05);" title="Dettagli">
                        <i class="fa-solid fa-chevron-down" style="font-size:0.7rem;"></i>
                    </button>
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
                ${lastInfoHtml} ${nearCritHtml}
            </div>
            <div id="${chartId}"></div>
            <div class="activity-details-panel" style="display:none; margin-top:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
                ${taskStepsAnalysisHtml}
                ${setBreakdownAnalysisHtml}
                <table style="width:100%; font-size:0.85rem; color:#ccc; border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #444; text-align:left; color:#888; font-size:0.75rem;">
                        <th style="padding:5px;">Data</th><th>Score</th><th>%</th>${typeGroup === 'timedelay' ? '<th>TD</th>' : ''}<th style="text-align:right;">Azioni</th>
                    </tr>
                    ${[...sessions].reverse().map(s => {
            const isTD = typeGroup === 'timedelay';
            const nonCorrect = s.total - s.correct;
            const scoreExtra = isTD
                ? (nonCorrect > 0 ? ` <span style="color:var(--warning-color); font-size:0.75rem;">${nonCorrect}P</span>` : '')
                : (nonCorrect > 0 ? ` <span style="color:var(--danger-color); font-size:0.75rem;">${nonCorrect}X</span>` : '');
            const isTaskAnalysisSession = s.mode === 'quaderno_task' && s.taskSteps && s.taskSteps.length > 0;
            const hasSetBreakdown = s.setBreakdown && s.setBreakdown.length > 0;
            const hasDetails = s.itemDetails && s.itemDetails.length > 0 && s.itemDetails.some(d => d.result !== true);
            let itemDetailsHtml = '';
            if (hasDetails) {
                itemDetailsHtml = renderItemDetailsCollapsible(s, patient.id, s.originalIndex, isTD);
            } else if (isTaskAnalysisSession) {
                itemDetailsHtml = renderTaskStepDetailsCollapsible(s, patient.id, s.originalIndex, isTD);
            } else if (hasSetBreakdown) {
                itemDetailsHtml = renderSetBreakdownCollapsible(s, patient.id, s.originalIndex, isTD);
            }
            const hasExpandable = hasDetails || isTaskAnalysisSession || hasSetBreakdown;
            const expandColor = isTD ? 'var(--warning-color)' : (isTaskAnalysisSession ? 'var(--accent-color)' : (hasSetBreakdown ? 'var(--accent-color)' : 'var(--danger-color)'));
            const expandRgba = isTD ? '245,158,11' : (isTaskAnalysisSession ? '99,102,241' : (hasSetBreakdown ? '99,102,241' : '239,68,68'));
            const detailsBtn = hasExpandable
                ? `<button class="btn-icon item-details-toggle" style="width:26px; height:26px; font-size:0.6rem; display:inline-flex; color:${expandColor}; border-color:rgba(${expandRgba},0.3);" title="Dettagli"><i class="fa-solid fa-chevron-down" style="transition:transform 0.2s; transform:rotate(180deg);"></i></button>`
                : '';
            const noteIcon = s.note ? ' <i class="fa-solid fa-sticky-note" style="color:#eab308; font-size:0.55rem;" title="Nota"></i>' : '';
            const colSpan = isTD ? 5 : 4;
            const noteRow = s.note ? `
                        <tr class="note-details-row" style="display:none;">
                            <td colspan="${colSpan}" style="padding:6px 10px; background:rgba(234,179,8,0.06);">
                                <div style="font-size:0.75rem; color:#eab308; margin-bottom:3px; font-weight:bold;"><i class="fa-solid fa-sticky-note"></i> Nota</div>
                                <div style="font-size:0.8rem; line-height:1.4; color:#ddd;">${_renderNoteMarkup(s.note)}</div>
                            </td>
                        </tr>` : '';
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px 5px;">${formatDateEU(s.date)}${noteIcon}</td>
                            <td>${s.correct}/${s.total}${scoreExtra}</td>
                            <td style="font-weight:bold; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'}">${s.percentage}%</td>
                            ${isTD ? `<td style="font-size:0.8rem; color:var(--warning-color);">${s.timeDelaySeconds || '?'}s</td>` : ''}
                            <td style="text-align:right;">
                                ${s.note ? `<button class="btn-icon note-toggle-btn" style="width:26px; height:26px; font-size:0.6rem; display:inline-flex; color:#eab308; border-color:rgba(234,179,8,0.3);" title="Nota"><i class="fa-solid fa-sticky-note" style="transition:transform 0.2s;"></i></button>` : ''}
                                ${detailsBtn}
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex;" onclick="editSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn-icon" style="width:26px; height:26px; font-size:0.7rem; display:inline-flex; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" onclick="deleteSession('${patient.id}', ${s.originalIndex})"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>
                        ${itemDetailsHtml}
                        ${noteRow}
                    `}).join('')}
                </table>
            </div>
        </div>`;
    });

    content.innerHTML = html;

    // Wire up item detail toggles (default open)
    content.querySelectorAll('.item-details-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = btn.closest('tr').nextElementSibling;
            if (row && row.classList.contains('item-details-row')) {
                const isOpen = row.style.display !== 'none';
                row.style.display = isOpen ? 'none' : 'table-row';
                btn.querySelector('i').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    });

    // Wire up note toggle buttons
    content.querySelectorAll('.note-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Find the note-details-row for this row (may be after item-details-row)
            let tr = btn.closest('tr');
            let noteRow = null;
            let sibling = tr.nextElementSibling;
            while (sibling) {
                if (sibling.classList.contains('note-details-row')) { noteRow = sibling; break; }
                sibling = sibling.nextElementSibling;
            }
            if (noteRow) {
                const isOpen = noteRow.style.display !== 'none';
                noteRow.style.display = isOpen ? 'none' : 'table-row';
            }
        });
    });

    // Render SVG charts
    chartList.forEach(item => {
        const chartId = 'activity-chart-' + item.key.replace(/[^a-zA-Z0-9]/g, '_');
        const container = document.getElementById(chartId);
        if (container) renderActivitySVGChart(container, item.sessions, item.typeGroup, item.modeCode);
    });
}

// --- ACTIVITY SVG CHART with Time Delay vertical markers ---
function renderActivitySVGChart(container, sessions, typeGroup, modeCode) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("viewBox", "-10 -10 320 160");

    const isFluenza = modeCode === 'fluenza';

    // For fluenza: y-axis shows count (correct items), scale dynamically
    let fluenzaMax = 0;
    let fluenzaObiettivo = 0;
    if (isFluenza) {
        fluenzaMax = Math.max(...sessions.map(s => s.correct || 0));
        fluenzaObiettivo = fluenzaMax + 2;
        // Scale: chart height = 130, max value = obiettivo + a small margin
        fluenzaMax = Math.max(fluenzaObiettivo + 2, fluenzaMax + 4);
    }

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

    // Gridlines with labels
    if (!isFluenza) {
        [25, 50, 75].forEach(pct => {
            const gy = 130 - (1.3 * pct);
            const gl = document.createElementNS(svgNS, "line");
            gl.setAttribute("x1", "20"); gl.setAttribute("x2", "300");
            gl.setAttribute("y1", gy); gl.setAttribute("y2", gy);
            gl.setAttribute("stroke", "rgba(255,255,255,0.08)");
            gl.setAttribute("stroke-width", "1");
            gl.setAttribute("stroke-dasharray", "3,4");
            svg.appendChild(gl);
            const gt = document.createElementNS(svgNS, "text");
            gt.setAttribute("x", "17"); gt.setAttribute("y", gy + 3);
            gt.setAttribute("text-anchor", "end");
            gt.setAttribute("fill", "rgba(255,255,255,0.25)");
            gt.setAttribute("font-size", "7");
            gt.textContent = pct + '%';
            svg.appendChild(gt);
        });
        // 90% label next to threshold
        const lbl90 = document.createElementNS(svgNS, "text");
        lbl90.setAttribute("x", "17"); lbl90.setAttribute("y", "16");
        lbl90.setAttribute("text-anchor", "end");
        lbl90.setAttribute("fill", "var(--danger-color)");
        lbl90.setAttribute("font-size", "7"); lbl90.setAttribute("opacity", "0.7");
        lbl90.textContent = '90%';
        svg.appendChild(lbl90);
    } else if (fluenzaMax > 0) {
        const step = Math.max(1, Math.ceil(fluenzaMax / 5));
        for (let val = step; val < fluenzaMax; val += step) {
            const gy = 130 - (130 * val / fluenzaMax);
            const gl = document.createElementNS(svgNS, "line");
            gl.setAttribute("x1", "20"); gl.setAttribute("x2", "300");
            gl.setAttribute("y1", gy); gl.setAttribute("y2", gy);
            gl.setAttribute("stroke", "rgba(255,255,255,0.08)");
            gl.setAttribute("stroke-width", "1");
            gl.setAttribute("stroke-dasharray", "3,4");
            svg.appendChild(gl);
            const gt = document.createElementNS(svgNS, "text");
            gt.setAttribute("x", "17"); gt.setAttribute("y", gy + 3);
            gt.setAttribute("text-anchor", "end");
            gt.setAttribute("fill", "rgba(255,255,255,0.25)");
            gt.setAttribute("font-size", "7");
            gt.textContent = val;
            svg.appendChild(gt);
        }
    }

    if (isFluenza) {
        // Obiettivo line instead of 90% threshold
        const obY = fluenzaMax > 0 ? 130 - (130 * fluenzaObiettivo / fluenzaMax) : 10;
        const lineOb = document.createElementNS(svgNS, "line");
        lineOb.setAttribute("x1", "20"); lineOb.setAttribute("x2", "300");
        lineOb.setAttribute("y1", obY); lineOb.setAttribute("y2", obY);
        lineOb.setAttribute("stroke", "var(--accent-color)");
        lineOb.setAttribute("stroke-width", "1");
        lineOb.setAttribute("stroke-dasharray", "6,3");
        lineOb.setAttribute("opacity", "0.6");
        svg.appendChild(lineOb);

        const obLbl = document.createElementNS(svgNS, "text");
        obLbl.setAttribute("x", "5"); obLbl.setAttribute("y", obY - 3);
        obLbl.setAttribute("fill", "var(--accent-color)"); obLbl.setAttribute("font-size", "8");
        obLbl.setAttribute("font-weight", "bold");
        obLbl.textContent = fluenzaObiettivo;
        svg.appendChild(obLbl);
    } else {
        // 90% threshold
        const line90 = document.createElementNS(svgNS, "line");
        line90.setAttribute("x1", "20"); line90.setAttribute("x2", "300");
        line90.setAttribute("y1", "13"); line90.setAttribute("y2", "13");
        line90.setAttribute("class", "threshold-line");
        svg.appendChild(line90);
    }

    const stepX = sessions.length > 1 ? 260 / (sessions.length - 1) : 0;
    let pathD = "";

    // Time Delay vertical markers
    if (typeGroup === 'timedelay') {
        let lastTD = null;
        sessions.forEach((s, i) => {
            const td = s.timeDelaySeconds || null;
            if (td !== null && td !== lastTD && lastTD !== null) {
                const x = 20 + (sessions.length > 1 ? i * stepX : 130);
                const vLine = document.createElementNS(svgNS, "line");
                vLine.setAttribute("x1", x); vLine.setAttribute("x2", x);
                vLine.setAttribute("y1", "0"); vLine.setAttribute("y2", "130");
                vLine.setAttribute("stroke", "var(--warning-color)");
                vLine.setAttribute("stroke-width", "1.5");
                vLine.setAttribute("stroke-dasharray", "4,3");
                vLine.setAttribute("opacity", "0.7");
                svg.appendChild(vLine);

                const tdLbl = document.createElementNS(svgNS, "text");
                tdLbl.setAttribute("x", x); tdLbl.setAttribute("y", "140");
                tdLbl.setAttribute("text-anchor", "middle");
                tdLbl.setAttribute("fill", "var(--warning-color)");
                tdLbl.setAttribute("font-size", "8");
                tdLbl.setAttribute("font-weight", "bold");
                tdLbl.textContent = `${td}s`;
                svg.appendChild(tdLbl);
            }
            lastTD = td;
        });
    }

    sessions.forEach((s, i) => {
        const x = 20 + (sessions.length > 1 ? i * stepX : 130);
        const y = isFluenza
            ? (fluenzaMax > 0 ? 130 - (130 * (s.correct || 0) / fluenzaMax) : 65)
            : 130 - (1.3 * s.percentage);
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
        const y = isFluenza
            ? (fluenzaMax > 0 ? 130 - (130 * (s.correct || 0) / fluenzaMax) : 65)
            : 130 - (1.3 * s.percentage);
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", x); dot.setAttribute("cy", y);
        dot.setAttribute("r", "5"); dot.setAttribute("fill", "white");
        dot.setAttribute("stroke", "var(--accent-color)"); dot.setAttribute("stroke-width", "2");

        let tooltipText = isFluenza
            ? `${formatDateEU(s.date)}\nCorrette: ${s.correct}/${s.total}${s.rawX ? ' (Errori: ' + s.rawX + ')' : ''}\nDurata: ${s.fluenzaDuration || '?'}s`
            : `${formatDateEU(s.date)}\nScore: ${s.percentage}% (${s.correct}/${s.total})`;
        if (s.rawP) tooltipText += `\nPrompt: ${s.rawP}`;
        if (s.timeDelaySeconds) tooltipText += `\nTime Delay: ${s.timeDelaySeconds}s`;

        const title = document.createElementNS(svgNS, "title");
        title.textContent = tooltipText;
        dot.appendChild(title);
        svg.appendChild(dot);

        // For fluenza, show count label on dot
        if (isFluenza) {
            const countLbl = document.createElementNS(svgNS, "text");
            countLbl.setAttribute("x", x); countLbl.setAttribute("y", y - 8);
            countLbl.setAttribute("text-anchor", "middle"); countLbl.setAttribute("fill", "white"); countLbl.setAttribute("font-size", "8"); countLbl.setAttribute("font-weight", "bold");
            countLbl.textContent = s.correct;
            svg.appendChild(countLbl);
        }

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

window.changeActivitiesSort = (sortBy, patientId) => {
    state._activitiesSortBy = sortBy;
    const p = state.patients.find(x => x.id === patientId);
    if (p) renderActivitiesTab(p, sortBy);
};

// ============================================================
// NOTES SYSTEM - Daily notes & markup rendering
// ============================================================

// Render basic markup (bold, italic, headers, lists, line breaks)
function _renderNoteMarkup(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h5 style="margin:8px 0 4px; color:var(--accent-color); font-size:0.85rem;">$1</h5>')
        .replace(/^## (.+)$/gm, '<h4 style="margin:10px 0 5px; color:var(--accent-color); font-size:0.9rem;">$1</h4>')
        .replace(/^# (.+)$/gm, '<h3 style="margin:12px 0 6px; color:var(--accent-color); font-size:0.95rem;">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del style="opacity:0.6;">$1</del>')
        .replace(/^- (.+)$/gm, '<li style="margin:2px 0 2px 16px; list-style:disc;">$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:2px 0 2px 16px; list-style:decimal;" value="$1">$2</li>')
        .replace(/\n/g, '<br>');
}

// Open daily note editor (fullscreen modal with markup toolbar)
window.openDailyNoteEditor = (patientId, dateKey) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;

    if (!dateKey) {
        // Default to today
        dateKey = new Date().toISOString().split('T')[0];
    }

    const existingNote = (p.dailyNotes || {})[dateKey] || '';

    // Remove any existing editor
    const existing = document.getElementById('daily-note-editor-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'daily-note-editor-overlay';
    overlay.className = 'daily-note-editor-overlay';

    overlay.innerHTML = `
        <div class="daily-note-editor">
            <div class="daily-note-editor-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-book-medical" style="color:#eab308; font-size:1.1rem;"></i>
                    <h3 style="margin:0; font-size:1rem;">Nota della Giornata</h3>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="date" id="daily-note-date" value="${dateKey}" style="padding:4px 8px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
                    <button onclick="document.getElementById('daily-note-editor-overlay').remove()" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="daily-note-toolbar">
                <button onclick="_insertMarkup('**','**')" title="Grassetto"><i class="fa-solid fa-bold"></i></button>
                <button onclick="_insertMarkup('*','*')" title="Corsivo"><i class="fa-solid fa-italic"></i></button>
                <button onclick="_insertMarkup('~~','~~')" title="Barrato"><i class="fa-solid fa-strikethrough"></i></button>
                <span style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></span>
                <button onclick="_insertMarkup('# ','')" title="Titolo"><i class="fa-solid fa-heading"></i></button>
                <button onclick="_insertMarkup('## ','')" title="Sottotitolo">H2</button>
                <button onclick="_insertMarkup('### ','')" title="Sottotitolo piccolo">H3</button>
                <span style="width:1px; background:rgba(255,255,255,0.1); margin:0 4px;"></span>
                <button onclick="_insertMarkup('- ','')" title="Lista puntata"><i class="fa-solid fa-list-ul"></i></button>
                <button onclick="_insertMarkup('1. ','')" title="Lista numerata"><i class="fa-solid fa-list-ol"></i></button>
            </div>
            <textarea id="daily-note-textarea" placeholder="Scrivi le note della giornata...\n\nPuoi usare:\n**grassetto**  *corsivo*  ~~barrato~~\n# Titolo  ## Sottotitolo\n- Lista puntata\n1. Lista numerata">${existingNote}</textarea>
            <div class="daily-note-preview-toggle" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px;">
                <button onclick="_toggleNotePreview()" class="btn btn-ghost" style="padding:4px 12px; font-size:0.8rem;"><i class="fa-solid fa-eye"></i> Anteprima</button>
                <div style="display:flex; gap:8px;">
                    <button onclick="document.getElementById('daily-note-editor-overlay').remove()" class="btn btn-ghost" style="padding:6px 16px; font-size:0.85rem;">Annulla</button>
                    <button onclick="_saveDailyNoteFromEditor('${patientId}')" class="btn btn-primary" style="padding:6px 16px; font-size:0.85rem;"><i class="fa-solid fa-floppy-disk"></i> Salva Nota</button>
                </div>
            </div>
            <div id="daily-note-preview" style="display:none; padding:12px 16px; border-top:1px solid rgba(255,255,255,0.05); max-height:200px; overflow-y:auto; font-size:0.85rem; line-height:1.5; color:#ddd;"></div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('daily-note-textarea').focus();
};

// Insert markup at cursor position in the note textarea
window._insertMarkup = (before, after) => {
    const ta = document.getElementById('daily-note-textarea');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const replacement = before + (selected || 'testo') + after;
    ta.setRangeText(replacement, start, end, 'select');
    ta.focus();
};

// Toggle note preview
window._toggleNotePreview = () => {
    const preview = document.getElementById('daily-note-preview');
    const ta = document.getElementById('daily-note-textarea');
    if (!preview || !ta) return;
    if (preview.style.display === 'none') {
        preview.innerHTML = _renderNoteMarkup(ta.value);
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

// Save daily note from editor
window._saveDailyNoteFromEditor = async (patientId) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const dateInput = document.getElementById('daily-note-date');
    const ta = document.getElementById('daily-note-textarea');
    if (!dateInput || !ta) return;

    const dk = dateInput.value;
    const text = ta.value.trim();

    if (!p.dailyNotes) p.dailyNotes = {};

    if (text) {
        p.dailyNotes[dk] = text;
    } else {
        delete p.dailyNotes[dk];
    }

    await DB.savePatient(p);
    document.getElementById('daily-note-editor-overlay').remove();

    // Refresh current view
    if (state.activePatientId === patientId) {
        loadPatientData(patientId);
    }
};

// Delete a daily note
window.deleteDailyNote = async (patientId, dateKey) => {
    if (!confirm("Eliminare la nota di questa giornata?")) return;
    const p = state.patients.find(x => x.id === patientId);
    if (!p || !p.dailyNotes) return;
    delete p.dailyNotes[dateKey];
    await DB.savePatient(p);
    loadPatientData(patientId);
};

// ============================================================
// TAB 4: DIARIO CLINICO - Chronological diary view
// ============================================================
function renderDiaryTab(patient) {
    const content = document.getElementById('report-content');
    if (!content) return;

    const dailyNotes = patient.dailyNotes || {};
    const history = patient.history || [];

    // Collect all dates with notes (daily or activity)
    const allDates = new Set();
    Object.keys(dailyNotes).forEach(dk => allDates.add(dk));
    history.forEach(h => {
        if (h.note) allDates.add(getDateKey(h.date));
    });

    const dates = [...allDates].sort().reverse();

    if (dates.length === 0) {
        content.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
                <i class="fa-solid fa-book-medical" style="font-size:2.5rem; opacity:0.3; margin-bottom:12px; display:block;"></i>
                <p style="font-size:0.9rem; margin-bottom:8px;">Nessuna nota registrata</p>
                <p style="font-size:0.8rem; opacity:0.6;">Le note della giornata e delle attività appariranno qui in ordine cronologico.</p>
                <button class="btn btn-primary" style="margin-top:12px; padding:8px 20px; font-size:0.85rem;" onclick="openDailyNoteEditor('${patient.id}')">
                    <i class="fa-solid fa-plus"></i> Aggiungi Nota Giornata
                </button>
            </div>`;
        return;
    }

    let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h4 style="margin:0; color:var(--accent-color); font-size:0.95rem;"><i class="fa-solid fa-book-medical"></i> Diario Clinico</h4>
        <button class="btn btn-primary" style="padding:6px 14px; font-size:0.8rem;" onclick="openDailyNoteEditor('${patient.id}')">
            <i class="fa-solid fa-plus"></i> Nuova Nota
        </button>
    </div>`;

    dates.forEach(dk => {
        const hasDailyNote = !!dailyNotes[dk];
        const dayActivityNotes = history.filter(h => getDateKey(h.date) === dk && h.note);

        html += `
        <div class="diary-entry" style="margin-bottom:16px; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02);">
            <div style="padding:12px 16px; background:rgba(0,0,0,0.15); display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-calendar-day" style="color:var(--accent-color); font-size:0.9rem;"></i>
                    <span style="font-weight:bold; font-size:1rem;">${formatDateEU(dk + 'T00:00:00')}</span>
                    <span style="font-size:0.7rem; color:var(--text-secondary);">${_getDayOfWeek(dk)}</span>
                </div>
                <div style="display:flex; gap:4px;">
                    ${hasDailyNote ? `<button class="btn-icon" style="width:24px; height:24px; font-size:0.65rem; color:#eab308; border-color:rgba(234,179,8,0.3);" onclick="openDailyNoteEditor('${patient.id}', '${dk}')" title="Modifica nota giornata"><i class="fa-solid fa-pen"></i></button>` : `<button class="btn-icon" style="width:24px; height:24px; font-size:0.65rem; color:#eab308; border-color:rgba(234,179,8,0.3);" onclick="openDailyNoteEditor('${patient.id}', '${dk}')" title="Aggiungi nota giornata"><i class="fa-solid fa-plus"></i></button>`}
                </div>
            </div>`;

        // Daily note
        if (hasDailyNote) {
            html += `
            <div style="padding:14px 16px; border-bottom:${dayActivityNotes.length > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none'};">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                    <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; background:rgba(234,179,8,0.15);"><i class="fa-solid fa-book-medical" style="color:#eab308; font-size:0.6rem;"></i></span>
                    <span style="font-size:0.75rem; color:#eab308; font-weight:600;">Nota della Giornata</span>
                </div>
                <div class="diary-note-text" style="font-size:0.85rem; line-height:1.6; color:#ddd; padding-left:26px;">${_renderNoteMarkup(dailyNotes[dk])}</div>
            </div>`;
        }

        // Activity notes
        if (dayActivityNotes.length > 0) {
            dayActivityNotes.forEach(s => {
                const modeName = MODES_CONFIG[s.mode] || s.mode;
                const modeIcon = (typeof getModeIcon === 'function') ? getModeIcon(s.mode) : 'fa-puzzle-piece';
                const timeStr = new Date(s.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                html += `
                <div style="padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.03);">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                        <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; background:rgba(99,102,241,0.15);"><i class="fa-solid ${modeIcon}" style="color:var(--accent-color); font-size:0.6rem;"></i></span>
                        <span style="font-size:0.75rem; color:var(--accent-color); font-weight:600;">${modeName}</span>
                        <span style="font-size:0.75rem; color:var(--text-secondary);">- ${s.setName}</span>
                        <span style="font-size:0.65rem; color:#888;">${timeStr}</span>
                        <span style="font-size:0.7rem; font-weight:bold; color:${s.percentage >= 90 ? 'var(--success-color)' : 'white'};">${s.percentage}%</span>
                    </div>
                    <div style="font-size:0.8rem; line-height:1.5; color:#ccc; padding-left:26px; border-left:2px solid rgba(99,102,241,0.2);">${_renderNoteMarkup(s.note)}</div>
                </div>`;
            });
        }

        html += `</div>`;
    });

    content.innerHTML = html;
}

// Helper: get day of week in Italian
function _getDayOfWeek(dateKey) {
    const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const d = new Date(dateKey + 'T00:00:00');
    return days[d.getDay()];
}

// ============================================================
// --- EXCEL EXPORT ---
// ============================================================
window.exportPatientExcel = (pid) => {
    const p = state.patients.find(x => x.id === pid);
    if (!p || !p.history || p.history.length === 0) return alert("Nessun dato da esportare.");

    const sorted = [...p.history].sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:spreadsheet" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>
td, th { border: 1px solid #ccc; padding: 4px 8px; font-family: Arial; font-size: 11px; }
th { background: #4472c4; color: white; font-weight: bold; }
.pct-high { background: #c6efce; color: #006100; }
.pct-low { background: #ffc7ce; color: #9c0006; }
</style></head><body>`;

    html += `<table><caption>${p.name} - Tutte le Sessioni</caption>`;
    html += `<tr><th>Data</th><th>Ora</th><th>Attivit&agrave;</th><th>Modalit&agrave;</th><th>Tipo</th><th>Corrette</th><th>Prompt</th><th>Totale</th><th>%</th></tr>`;

    sorted.forEach(s => {
        const d = new Date(s.date);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const modeName = MODES_CONFIG[s.mode] || s.mode;
        const typeLabel = s.sessionType === 'timedelay' ? `Time Delay (${s.timeDelaySeconds || '?'}s)` : (s.sessionType === 'independent' ? 'Indipendente' : '-');
        const pctClass = s.percentage >= 90 ? 'pct-high' : (s.percentage < 50 ? 'pct-low' : '');
        const prompts = s.prompts || s.rawP || '-';
        const catStr = s.setCat ? ` (${s.setCat})` : '';
        html += `<tr><td>${dateStr}</td><td>${timeStr}</td><td>${s.setName}${catStr}</td><td>${modeName}</td><td>${typeLabel}</td><td>${s.correct}</td><td>${prompts}</td><td>${s.total}</td><td class="${pctClass}">${s.percentage}%</td></tr>`;
    });
    html += `</table><br>`;

    html += `<table><caption>${p.name} - Riepilogo Giornaliero</caption>`;
    html += `<tr><th>Data</th><th>LU Totali</th><th>LU Corrette</th><th>% Media</th><th>N. Attivit&agrave;</th></tr>`;

    const byDate = {};
    sorted.forEach(s => {
        const dk = getDateKey(s.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(s);
    });

    Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([dk, sessions]) => {
        const totalLU = sessions.reduce((acc, s) => acc + s.total, 0);
        const totalCorrect = sessions.reduce((acc, s) => acc + s.correct, 0);
        const avgPct = totalLU > 0 ? Math.round((totalCorrect / totalLU) * 100) : 0;
        const d = new Date(dk);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const pctClass = avgPct >= 90 ? 'pct-high' : (avgPct < 50 ? 'pct-low' : '');
        html += `<tr><td>${dateStr}</td><td>${totalLU}</td><td>${totalCorrect}</td><td class="${pctClass}">${avgPct}%</td><td>${sessions.length}</td></tr>`;
    });
    html += `</table><br>`;

    html += `<table><caption>${p.name} - Riepilogo per Attivit&agrave;</caption>`;
    html += `<tr><th>Attivit&agrave;</th><th>Modalit&agrave;</th><th>Tipo</th><th>N. Sessioni</th><th>Ultima Data</th><th>Ultima %</th><th>Media %</th><th>Criterio</th></tr>`;

    const byActivity = {};
    sorted.forEach(s => {
        const key = `${s.setName}__${s.mode}__${getSessionTypeGroup(s)}`;
        if (!byActivity[key]) byActivity[key] = [];
        byActivity[key].push(s);
    });

    Object.entries(byActivity).forEach(([key, sessions]) => {
        const [name, mode, typeGroup] = key.split('__');
        const modeName = MODES_CONFIG[mode] || mode;
        const last = sessions[sessions.length - 1];
        const avgPct = Math.round(sessions.reduce((a, s) => a + s.percentage, 0) / sessions.length);
        const hasCriterion = checkCriterion(sessions);
        const lastD = new Date(last.date);
        const lastDateStr = `${String(lastD.getDate()).padStart(2, '0')}/${String(lastD.getMonth() + 1).padStart(2, '0')}/${lastD.getFullYear()}`;
        const aCat = sessions.find(s => s.setCat)?.setCat || '';
        const aCatStr = aCat ? ` (${aCat})` : '';
        html += `<tr><td>${name}${aCatStr}</td><td>${modeName}</td><td>${getSessionTypeLabel(typeGroup)}</td><td>${sessions.length}</td><td>${lastDateStr}</td><td>${last.percentage}%</td><td>${avgPct}%</td><td>${hasCriterion ? 'RAGGIUNTO' : '-'}</td></tr>`;
    });
    html += `</table></body></html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const safeName = p.name.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_');
    const fileName = `${safeName}_report_${new Date().toISOString().split('T')[0]}.xls`;

    downloadFile(blob, fileName, `Report ${p.name}`);
};

// ============================================================
// TASK ANALYSIS - Per-step breakdown across sessions
// ============================================================
function renderTaskStepsAnalysis(sessions) {
    // Get the template from the first session that has taskSteps
    const template = sessions[0].taskSteps;
    if (!template || template.length === 0) return '';

    // Aggregate per-step across ALL sessions (excluding N/A)
    const stepAggregates = template.map((tmplStep, stepIdx) => {
        let totalV = 0, totalX = 0, totalP = 0, totalScored = 0;
        sessions.forEach(session => {
            if (session.taskSteps && session.taskSteps[stepIdx]) {
                const step = session.taskSteps[stepIdx];
                (step.results || []).forEach(r => {
                    if (r === true) { totalV++; totalScored++; }
                    else if (r === false) { totalX++; totalScored++; }
                    else if (r === 'prompt') { totalP++; totalScored++; }
                });
            }
        });
        const pctCorrect = totalScored > 0 ? Math.round((totalV / totalScored) * 100) : 0;
        const pctError = totalScored > 0 ? Math.round(((totalX + totalP) / totalScored) * 100) : 0;
        return { name: tmplStep.name, totalV, totalX, totalP, totalScored, pctCorrect, pctError };
    });

    // Find steps with lowest correct percentage (problem areas)
    const sorted = [...stepAggregates].filter(s => s.totalScored > 0).sort((a, b) => a.pctCorrect - b.pctCorrect);
    const worstSteps = sorted.filter(s => s.pctCorrect < 90).slice(0, 3);

    let html = `
    <div style="margin-top:10px; padding:10px; background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.15); border-radius:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <i class="fa-solid fa-list-check" style="color:var(--warning-color);"></i>
            <span style="font-weight:bold; font-size:0.9rem; color:var(--warning-color);">Analisi per Passaggio</span>
            <span style="font-size:0.7rem; color:var(--text-secondary);">(su ${sessions.length} sessioni)</span>
        </div>`;

    // Problem areas highlight
    if (worstSteps.length > 0) {
        html += `<div style="margin-bottom:10px; padding:8px; background:rgba(239,68,68,0.08); border-radius:8px; border:1px solid rgba(239,68,68,0.15);">
            <div style="font-size:0.75rem; color:var(--danger-color); font-weight:bold; margin-bottom:4px;">
                <i class="fa-solid fa-triangle-exclamation"></i> Passaggi critici:
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${worstSteps.map(s => `<span style="display:inline-block; padding:2px 8px; border-radius:6px; font-size:0.75rem; background:rgba(239,68,68,0.12); color:var(--danger-color); border:1px solid rgba(239,68,68,0.2);">${s.name} <b>${s.pctCorrect}%</b></span>`).join('')}
            </div>
        </div>`;
    }

    // Aggregate table (always visible)
    html += renderTaskStepTable(stepAggregates, 'Riepilogo Totale');

    // Per-session collapsible sections
    if (sessions.length > 0) {
        html += `<div style="margin-top:10px;">`;
        [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((session, si) => {
            const steps = session.taskSteps || [];
            const sessionStepData = steps.map((step, stepIdx) => {
                let totalV = 0, totalX = 0, totalP = 0, totalScored = 0;
                (step.results || []).forEach(r => {
                    if (r === true) { totalV++; totalScored++; }
                    else if (r === false) { totalX++; totalScored++; }
                    else if (r === 'prompt') { totalP++; totalScored++; }
                });
                const pctCorrect = totalScored > 0 ? Math.round((totalV / totalScored) * 100) : 0;
                const pctError = totalScored > 0 ? Math.round(((totalX + totalP) / totalScored) * 100) : 0;
                return { name: step.name, totalV, totalX, totalP, totalScored, pctCorrect, pctError };
            });
            const sTotalScored = sessionStepData.reduce((s, x) => s + x.totalScored, 0);
            const sTotalV = sessionStepData.reduce((s, x) => s + x.totalV, 0);
            const sPct = sTotalScored > 0 ? Math.round((sTotalV / sTotalScored) * 100) : 0;
            const pctColor = sPct >= 90 ? 'var(--success-color)' : sPct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';

            html += `
            <div style="border:1px solid rgba(255,255,255,0.05); border-radius:8px; margin-bottom:6px; overflow:hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? '' : 'none'; this.querySelector('.ta-sess-icon').style.transform = this.nextElementSibling.style.display === 'none' ? '' : 'rotate(90deg)';"
                     style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; cursor:pointer; background:rgba(255,255,255,0.02);"
                     onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-chevron-right ta-sess-icon" style="font-size:0.6rem; color:var(--text-secondary); transition:transform 0.2s;"></i>
                        <span style="font-size:0.8rem; font-weight:600;">${formatDateEU(session.date)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.8rem;">${sTotalV}/${sTotalScored}</span>
                        <span style="font-weight:bold; font-size:0.8rem; color:${pctColor};">${sPct}%</span>
                    </div>
                </div>
                <div style="display:none; padding:6px;">
                    ${renderTaskStepTable(sessionStepData)}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderTaskStepTable(stepAggregates, title) {
    let html = '';
    if (title) {
        html += `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold; margin-bottom:4px; margin-top:4px;">${title}</div>`;
    }
    html += `<table style="width:100%; font-size:0.8rem; color:#ccc; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #444; color:#888; font-size:0.7rem;">
            <th style="padding:4px; text-align:left;">#</th>
            <th style="text-align:left;">Passaggio</th>
            <th style="text-align:center;">V</th>
            <th style="text-align:center;">X/P</th>
            <th style="text-align:center;">Tot</th>
            <th style="text-align:right;">%</th>
        </tr>`;

    stepAggregates.forEach((step, i) => {
        const barWidth = step.pctCorrect;
        const barColor = step.pctCorrect >= 90 ? 'var(--success-color)' : step.pctCorrect >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';
        html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:5px 4px; color:var(--text-secondary); font-weight:bold;">${i + 1}</td>
            <td style="padding:5px 4px; font-weight:600;">${step.name}</td>
            <td style="text-align:center; color:var(--success-color);">${step.totalV}</td>
            <td style="text-align:center; color:var(--danger-color);">${step.totalX + step.totalP}</td>
            <td style="text-align:center; color:var(--text-secondary);">${step.totalScored}</td>
            <td style="text-align:right; width:90px;">
                <div style="display:flex; align-items:center; gap:4px; justify-content:flex-end;">
                    <div style="width:50px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                        <div style="width:${barWidth}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                    </div>
                    <span style="font-weight:bold; color:${barColor}; min-width:30px; text-align:right;">${step.pctCorrect}%</span>
                </div>
            </td>
        </tr>`;
    });

    html += `</table>`;
    return html;
}

// --- Set Breakdown Analysis (aggregate per-set data across multi-set sessions) ---
function renderSetBreakdownAnalysis(sessions) {
    if (!sessions || sessions.length === 0) return '';

    // Collect all unique set names and aggregate data
    const setMap = {};
    sessions.forEach(session => {
        (session.setBreakdown || []).forEach(sb => {
            const key = sb.setName;
            if (!setMap[key]) {
                setMap[key] = { setName: sb.setName, setCat: sb.setCat || '', totalV: 0, totalX: 0, totalP: 0, totalScored: 0, appearances: 0 };
            }
            setMap[key].totalV += sb.correct || 0;
            setMap[key].totalX += sb.incorrect || 0;
            setMap[key].totalP += sb.prompts || 0;
            setMap[key].totalScored += sb.total || 0;
            setMap[key].appearances++;
        });
    });

    const setAggregates = Object.values(setMap).map(s => ({
        ...s,
        pctCorrect: s.totalScored > 0 ? Math.round((s.totalV / s.totalScored) * 100) : 0
    }));

    if (setAggregates.length === 0) return '';

    // Find weakest sets
    const sorted = [...setAggregates].filter(s => s.totalScored > 0).sort((a, b) => a.pctCorrect - b.pctCorrect);
    const worstSets = sorted.filter(s => s.pctCorrect < 90).slice(0, 3);

    let html = `
    <div style="margin-top:10px; padding:10px; background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.15); border-radius:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <i class="fa-solid fa-images" style="color:var(--accent-color);"></i>
            <span style="font-weight:bold; font-size:0.9rem; color:var(--accent-color);">Analisi per Set</span>
            <span style="font-size:0.7rem; color:var(--text-secondary);">(su ${sessions.length} sessioni)</span>
        </div>`;

    // Problem areas highlight
    if (worstSets.length > 0) {
        html += `<div style="margin-bottom:10px; padding:8px; background:rgba(239,68,68,0.08); border-radius:8px; border:1px solid rgba(239,68,68,0.15);">
            <div style="font-size:0.75rem; color:var(--danger-color); font-weight:bold; margin-bottom:4px;">
                <i class="fa-solid fa-triangle-exclamation"></i> Set critici:
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${worstSets.map(s => `<span style="display:inline-block; padding:2px 8px; border-radius:6px; font-size:0.75rem; background:rgba(239,68,68,0.12); color:var(--danger-color); border:1px solid rgba(239,68,68,0.2);">${s.setName} <b>${s.pctCorrect}%</b></span>`).join('')}
            </div>
        </div>`;
    }

    // Aggregate table
    html += renderSetBreakdownTable(setAggregates, 'Riepilogo Totale');

    // Per-session collapsible sections
    if (sessions.length > 0) {
        html += `<div style="margin-top:10px;">`;
        [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((session) => {
            const breakdown = session.setBreakdown || [];
            const sTotalScored = breakdown.reduce((sum, sb) => sum + (sb.total || 0), 0);
            const sTotalV = breakdown.reduce((sum, sb) => sum + (sb.correct || 0), 0);
            const sPct = sTotalScored > 0 ? Math.round((sTotalV / sTotalScored) * 100) : 0;
            const pctColor = sPct >= 90 ? 'var(--success-color)' : sPct >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';

            const sessionSetData = breakdown.map(sb => ({
                setName: sb.setName, setCat: sb.setCat || '',
                totalV: sb.correct || 0, totalX: sb.incorrect || 0, totalP: sb.prompts || 0,
                totalScored: sb.total || 0,
                pctCorrect: sb.percentage || 0, appearances: 1
            }));

            html += `
            <div style="border:1px solid rgba(255,255,255,0.05); border-radius:8px; margin-bottom:6px; overflow:hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? '' : 'none'; this.querySelector('.sb-sess-icon').style.transform = this.nextElementSibling.style.display === 'none' ? '' : 'rotate(90deg)';"
                     style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; cursor:pointer; background:rgba(255,255,255,0.02);"
                     onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-chevron-right sb-sess-icon" style="font-size:0.6rem; color:var(--text-secondary); transition:transform 0.2s;"></i>
                        <span style="font-size:0.8rem; font-weight:600;">${formatDateEU(session.date)}</span>
                        <span style="font-size:0.7rem; color:var(--text-secondary);">${breakdown.length} set</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.8rem;">${sTotalV}/${sTotalScored}</span>
                        <span style="font-weight:bold; font-size:0.8rem; color:${pctColor};">${sPct}%</span>
                    </div>
                </div>
                <div style="display:none; padding:6px;">
                    ${renderSetBreakdownTable(sessionSetData)}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderSetBreakdownTable(setAggregates, title) {
    let html = '';
    if (title) {
        html += `<div style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold; margin-bottom:4px; margin-top:4px;">${title}</div>`;
    }
    html += `<table style="width:100%; font-size:0.8rem; color:#ccc; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #444; color:#888; font-size:0.7rem;">
            <th style="padding:4px; text-align:left;">#</th>
            <th style="text-align:left;">Set</th>
            <th style="text-align:center;">V</th>
            <th style="text-align:center;">X/P</th>
            <th style="text-align:center;">Tot</th>
            <th style="text-align:right;">%</th>
        </tr>`;

    setAggregates.forEach((s, i) => {
        const barWidth = s.pctCorrect;
        const barColor = s.pctCorrect >= 90 ? 'var(--success-color)' : s.pctCorrect >= 70 ? 'var(--warning-color)' : 'var(--danger-color)';
        html += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:5px 4px; color:var(--text-secondary); font-weight:bold;">${i + 1}</td>
            <td style="padding:5px 4px; font-weight:600;">${s.setName}${s.setCat ? ` <span style="color:var(--text-secondary); font-size:0.65rem;">(${s.setCat})</span>` : ''}</td>
            <td style="text-align:center; color:var(--success-color);">${s.totalV}</td>
            <td style="text-align:center; color:var(--danger-color);">${s.totalX + s.totalP}</td>
            <td style="text-align:center; color:var(--text-secondary);">${s.totalScored}</td>
            <td style="text-align:right; width:90px;">
                <div style="display:flex; align-items:center; gap:4px; justify-content:flex-end;">
                    <div style="width:50px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                        <div style="width:${barWidth}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                    </div>
                    <span style="font-weight:bold; color:${barColor}; min-width:30px; text-align:right;">${s.pctCorrect}%</span>
                </div>
            </td>
        </tr>`;
    });

    html += `</table>`;
    return html;
}

// ============================================================
// AI CLINICAL REPORT (Gemini) — Privacy-safe
// ============================================================
const FICTIONAL_NAMES = [
    'Marco R.', 'Laura B.', 'Giuseppe V.', 'Anna M.', 'Francesco T.',
    'Elena S.', 'Alessandro P.', 'Chiara D.', 'Luca F.', 'Sara G.'
];

function _buildPatientSummaryForAI(patient, fakeName) {
    const history = patient.history || [];
    if (history.length === 0) return null;

    const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDate = sorted[0].date;
    const lastDate = sorted[sorted.length - 1].date;

    // Group by activity (setName + mode + sessionType)
    const byActivity = {};
    sorted.forEach(s => {
        const typeGroup = getSessionTypeGroup(s);
        const key = `${s.setName}||${s.mode}||${typeGroup}`;
        if (!byActivity[key]) byActivity[key] = [];
        byActivity[key].push(s);
    });

    const activities = Object.entries(byActivity).map(([key, sessions]) => {
        const [setName, mode, typeGroup] = key.split('||');
        const modeName = MODES_CONFIG[mode] || mode;
        const sortedSess = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const firstSess = sortedSess[0];
        const lastSess = sortedSess[sortedSess.length - 1];
        const avgPct = Math.round(sessions.reduce((a, s) => a + s.percentage, 0) / sessions.length);
        const hasCriterion = checkCriterion(sessions);
        const isRepert = checkRepertorio(sessions);
        const setCat = sessions.find(s => s.setCat)?.setCat || '';

        // Trend: compare first half avg vs second half avg
        const mid = Math.floor(sortedSess.length / 2);
        const firstHalfAvg = mid > 0 ? Math.round(sortedSess.slice(0, mid).reduce((a, s) => a + s.percentage, 0) / mid) : firstSess.percentage;
        const secondHalfAvg = mid > 0 ? Math.round(sortedSess.slice(mid).reduce((a, s) => a + s.percentage, 0) / (sortedSess.length - mid)) : lastSess.percentage;
        const trend = secondHalfAvg - firstHalfAvg;

        return {
            nome_attivita: setName,
            categoria_set: setCat,
            modalita: modeName,
            tipo_sessione: getSessionTypeLabel(typeGroup),
            n_sessioni: sessions.length,
            prima_data: formatDateEU(firstSess.date),
            ultima_data: formatDateEU(lastSess.date),
            percentuale_prima_sessione: firstSess.percentage,
            percentuale_ultima_sessione: lastSess.percentage,
            media_percentuale: avgPct,
            trend_punti: trend,
            criterio_raggiunto: hasCriterion,
            in_repertorio: isRepert
        };
    });

    // Daily summary
    const byDate = {};
    sorted.forEach(s => {
        const dk = getDateKey(s.date);
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(s);
    });
    const nGiornate = Object.keys(byDate).length;
    const totalSessions = history.length;
    const overallAvg = Math.round(history.reduce((a, s) => a + s.percentage, 0) / history.length);

    return {
        paziente: fakeName,
        periodo: `${formatDateEU(firstDate)} - ${formatDateEU(lastDate)}`,
        totale_giornate: nGiornate,
        totale_sessioni: totalSessions,
        media_percentuale_globale: overallAvg,
        attivita: activities
    };
}

const AI_REPORT_PROMPT = `Sei un neuropsicologo/logopedista esperto in riabilitazione neuropsicologica e precision teaching.
Analizza i dati clinici del paziente e genera un report professionale.

Rispondi in formato TESTO (non JSON), in italiano, con queste sezioni:

## Riepilogo Generale
Breve panoramica dell'andamento complessivo del paziente, numero di sessioni, periodo di trattamento, media globale.

## Analisi per Attività
Per ogni attività significativa, commenta:
- Andamento (miglioramento, stallo, regressione)
- Se il criterio è stato raggiunto o meno
- Se l'attività è in repertorio

## Punti di Forza
Attività dove il paziente mostra le migliori performance.

## Aree di Attenzione
Attività con trend negativo o percentuali basse che richiedono intervento.

## Suggerimenti Terapeutici
Basandoti sui dati, suggerisci:
- Con quali attività procedere (e perché)
- Se ci sono attività da dismettere perché già in criterio
- Se ci sono aree dove introdurre nuovi stimoli o aumentare la difficoltà
- Eventuali strategie (time delay, prompt fading, ecc.)

Sii professionale ma chiaro. Usa un linguaggio clinico accessibile.

Ecco i dati del paziente:
`;

// --- AI REPORT CONVERSATION STATE ---
// Tracks the multi-turn conversation for follow-up questions
window._aiReportConversation = null; // array of {role, parts} for Gemini
window._aiReportFakeName = null;
window._aiReportRealName = null;
window._aiReportPatientId = null;

window.generateAIReport = async (pid) => {
    const p = state.patients.find(x => x.id === pid);
    if (!p) return;

    if (!p.history || p.history.length === 0) {
        alert('Nessun dato registrato per questo paziente.');
        return;
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        openSettings();
        setTimeout(() => {
            alert('Per generare il report AI, inserisci prima la tua chiave API Gemini nelle Impostazioni.');
        }, 300);
        return;
    }

    // Privacy: use a fictional name
    const fakeName = FICTIONAL_NAMES[Math.floor(Math.random() * FICTIONAL_NAMES.length)];
    const realName = p.name;

    const summary = _buildPatientSummaryForAI(p, fakeName);
    if (!summary) return;

    // Show loading modal
    let modal = document.getElementById('modal-ai-report');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ai-report';
        modal.className = 'modal-fs';
        modal.innerHTML = `
            <div class="modal-header">
                <h2><i class="fa-solid fa-wand-magic-sparkles"></i> Report AI</h2>
                <button class="btn btn-danger" onclick="closeAIReport()">Chiudi</button>
            </div>
            <div class="modal-body" id="ai-report-body" style="max-width:700px; margin:0 auto; padding-bottom:80px;"></div>
            <div id="ai-report-chat-bar" style="display:none; position:fixed; bottom:0; left:0; right:0; background:var(--glass-bg, rgba(15,15,30,0.95)); backdrop-filter:blur(20px); border-top:1px solid var(--glass-border); padding:10px 16px; z-index:1001;">
                <div style="max-width:700px; margin:0 auto; display:flex; gap:8px; align-items:center;">
                    <i class="fa-solid fa-comments" style="color:var(--accent-color); font-size:1rem;"></i>
                    <input type="text" id="ai-report-chat-input" placeholder="Chiedi altro sul report..."
                        style="flex:1; padding:10px 14px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-primary); font-size:0.85rem; outline:none;"
                        onkeydown="if(event.key==='Enter')askReportFollowUp()">
                    <button class="btn btn-primary" style="padding:8px 14px; border-radius:10px; font-size:0.85rem;" onclick="askReportFollowUp()">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const body = document.getElementById('ai-report-body');
    body.innerHTML = `
        <div style="text-align:center; padding:40px;">
            <div class="loading-spinner" style="margin:0 auto 15px;"></div>
            <p style="color:var(--accent-color); font-weight:600;">Generazione report in corso con ${getGeminiModel()}...</p>
            <p style="color:var(--text-secondary); font-size:0.8rem; margin-top:8px;">
                <i class="fa-solid fa-shield-halved"></i> Il nome del paziente viene sostituito con un nome fittizio per tutelare la privacy.
            </p>
        </div>
    `;
    modal.classList.add('open');
    document.getElementById('ai-report-chat-bar').style.display = 'none';

    // Reset conversation state
    window._aiReportConversation = null;
    window._aiReportFakeName = fakeName;
    window._aiReportRealName = realName;
    window._aiReportPatientId = pid;

    try {
        const prompt = AI_REPORT_PROMPT + JSON.stringify(summary, null, 2);

        // Call Gemini with text response (not JSON)
        const response = await _callGeminiText(prompt, apiKey);

        // Initialize conversation history for follow-ups
        window._aiReportConversation = [
            { role: 'user', parts: [{ text: prompt }] },
            { role: 'model', parts: [{ text: response }] }
        ];

        // Replace fictional name back with real name
        const fakeFirst = fakeName.split(' ')[0];
        const realFirst = realName.split(' ')[0];
        const finalReport = response.replaceAll(fakeName, realName)
            .replaceAll(fakeFirst, realFirst);

        // Auto-save the report
        const reportEntry = _saveReport(pid, realName, finalReport);

        // Render the report
        _renderAIReport(body, pid, finalReport, reportEntry?.id);

        // Store last report for copy/download
        window._lastAIReport = finalReport;
        window._lastAIReportPatient = realName;

        // Show the chat bar
        document.getElementById('ai-report-chat-bar').style.display = 'block';

    } catch (err) {
        body.innerHTML = `
            <div style="text-align:center; padding:30px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size:2rem; color:var(--danger-color); margin-bottom:10px;"></i>
                <p style="color:var(--danger-color); font-weight:600;">Errore nella generazione del report</p>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:8px;">${err.message}</p>
                <button class="btn btn-primary" style="margin-top:15px;" onclick="generateAIReport('${pid}')">
                    <i class="fa-solid fa-arrows-rotate"></i> Riprova
                </button>
            </div>
        `;
    }
};

// Render the report content with buttons and chat area
function _renderAIReport(body, pid, finalReport, reportId) {
    body.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="copyAIReport()">
                <i class="fa-solid fa-copy"></i> Copia
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(16,185,129,0.3); color:var(--success-color);" onclick="downloadAIReport('${pid}')">
                <i class="fa-solid fa-file-arrow-down"></i> Scarica
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(99,102,241,0.3); color:var(--accent-color);" onclick="generateAIReport('${pid}')">
                <i class="fa-solid fa-arrows-rotate"></i> Rigenera
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(245,158,11,0.3); color:var(--warning-color);" onclick="openReportHistory('${pid}')">
                <i class="fa-solid fa-clock-rotate-left"></i> Storico
            </button>
        </div>
        <div id="ai-report-content" style="background:rgba(0,0,0,0.2); border:1px solid var(--glass-border); border-radius:12px; padding:20px; line-height:1.7; font-size:0.9rem; color:var(--text-primary);">
            ${_markdownToHtml(finalReport)}
        </div>
        <div id="ai-report-followup-area"></div>
        <div style="margin-top:10px; padding:8px; background:rgba(99,102,241,0.05); border-radius:8px; font-size:0.7rem; color:var(--text-secondary); text-align:center;">
            <i class="fa-solid fa-shield-halved"></i> Report generato con AI. Il nome del paziente non è mai stato inviato ai server esterni.
        </div>
    `;
}

// --- FOLLOW-UP CHAT ---
window.askReportFollowUp = async () => {
    const input = document.getElementById('ai-report-chat-input');
    if (!input) return;
    const question = input.value.trim();
    if (!question) return;
    if (!window._aiReportConversation) {
        alert('Nessuna conversazione attiva. Genera prima un report.');
        return;
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) return;

    const fakeName = window._aiReportFakeName;
    const realName = window._aiReportRealName;

    // Replace real name with fake name in the question for privacy
    let safeQuestion = question;
    if (realName && fakeName) {
        const realFirst = realName.split(' ')[0];
        const fakeFirst = fakeName.split(' ')[0];
        safeQuestion = question.replaceAll(realName, fakeName).replaceAll(realFirst, fakeFirst);
    }

    // Add user message to conversation
    window._aiReportConversation.push({
        role: 'user',
        parts: [{ text: safeQuestion }]
    });

    input.value = '';
    input.disabled = true;

    // Show the question in the followup area
    const followupArea = document.getElementById('ai-report-followup-area');
    if (followupArea) {
        followupArea.innerHTML += `
            <div style="margin-top:15px; padding:12px 16px; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2); border-radius:10px; font-size:0.85rem;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; color:var(--accent-color); font-weight:600; font-size:0.75rem;">
                    <i class="fa-solid fa-user"></i> Domanda
                </div>
                ${question}
            </div>
            <div id="ai-followup-loading" style="text-align:center; padding:15px;">
                <div class="loading-spinner" style="margin:0 auto 8px; width:20px; height:20px;"></div>
                <span style="color:var(--text-secondary); font-size:0.75rem;">Risposta in corso...</span>
            </div>
        `;
        followupArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    try {
        const response = await _callGeminiConversation(window._aiReportConversation, apiKey);

        // Add model response to conversation
        window._aiReportConversation.push({
            role: 'model',
            parts: [{ text: response }]
        });

        // Replace fake name with real name
        let displayResponse = response;
        if (fakeName && realName) {
            const fakeFirst = fakeName.split(' ')[0];
            const realFirst = realName.split(' ')[0];
            displayResponse = response.replaceAll(fakeName, realName).replaceAll(fakeFirst, realFirst);
        }

        // Remove loading and show response
        const loading = document.getElementById('ai-followup-loading');
        if (loading) loading.remove();

        if (followupArea) {
            followupArea.innerHTML += `
                <div style="margin-top:8px; padding:14px 16px; background:rgba(0,0,0,0.2); border:1px solid var(--glass-border); border-radius:10px; font-size:0.85rem; line-height:1.6;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; color:var(--accent-color); font-weight:600; font-size:0.75rem;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Risposta AI
                    </div>
                    ${_markdownToHtml(displayResponse)}
                </div>
            `;
            followupArea.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        // Update saved report with follow-up conversation
        _updateReportWithFollowUp(window._aiReportPatientId, question, displayResponse);

    } catch (err) {
        const loading = document.getElementById('ai-followup-loading');
        if (loading) loading.remove();

        if (followupArea) {
            followupArea.innerHTML += `
                <div style="margin-top:8px; padding:12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:10px; font-size:0.8rem; color:var(--danger-color);">
                    <i class="fa-solid fa-circle-exclamation"></i> Errore: ${err.message}
                </div>
            `;
        }
    } finally {
        input.disabled = false;
        input.focus();
    }
};

// Gemini multi-turn conversation call
async function _callGeminiConversation(contents, apiKey) {
    const MAX_RETRIES = 3;
    const BACKOFF_MS = [3000, 8000, 15000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(`${getGeminiApiUrl()}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Risposta vuota dall\'AI');
            return text;
        }

        const err = await response.json().catch(() => ({}));

        if (response.status === 429) {
            const parsed = _parse429Error(err);
            if (!parsed.retryable) throw new Error(parsed.message);
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
                continue;
            }
            throw new Error('Limite richieste persistente.');
        }

        if (response.status === 400) throw new Error('Chiave API non valida.');
        if (response.status === 404) throw new Error(`Modello "${getGeminiModel()}" non disponibile.`);
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }
}

// --- REPORT SAVING ---
function _getPatientReports(pid) {
    try {
        const key = `ai_reports_${pid}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function _setPatientReports(pid, reports) {
    localStorage.setItem(`ai_reports_${pid}`, JSON.stringify(reports));
}

function _saveReport(pid, patientName, reportText) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');

    const entry = {
        id: Date.now().toString(),
        name: `Report ${patientName} ${dateStr}_${timeStr}`,
        date: now.toISOString(),
        patientName: patientName,
        text: reportText,
        model: getGeminiModel(),
        followUps: [] // {question, answer} pairs
    };

    const reports = _getPatientReports(pid);
    reports.unshift(entry); // newest first
    // Keep max 50 reports per patient
    if (reports.length > 50) reports.length = 50;
    _setPatientReports(pid, reports);
    return entry;
}

function _updateReportWithFollowUp(pid, question, answer) {
    if (!pid) return;
    const reports = _getPatientReports(pid);
    if (reports.length === 0) return;
    // Update the most recent report
    if (!reports[0].followUps) reports[0].followUps = [];
    reports[0].followUps.push({ question, answer });
    _setPatientReports(pid, reports);
}

// --- OPEN REPORT HISTORY STANDALONE (from cartella clinica) ---
window.openReportHistoryStandalone = (pid) => {
    const reports = _getPatientReports(pid);
    if (reports.length === 0) {
        alert('Nessun report salvato per questo paziente.');
        return;
    }

    // Ensure the AI report modal exists
    let modal = document.getElementById('modal-ai-report');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ai-report';
        modal.className = 'modal-fs';
        modal.innerHTML = `
            <div class="modal-header">
                <h2><i class="fa-solid fa-clock-rotate-left"></i> Storico Report AI</h2>
                <button class="btn btn-danger" onclick="closeAIReport()">Chiudi</button>
            </div>
            <div class="modal-body" id="ai-report-body" style="max-width:700px; margin:0 auto; padding-bottom:80px;"></div>
            <div id="ai-report-chat-bar" style="display:none; position:fixed; bottom:0; left:0; right:0; background:var(--glass-bg, rgba(15,15,30,0.95)); backdrop-filter:blur(20px); border-top:1px solid var(--glass-border); padding:10px 16px; z-index:1001;">
                <div style="max-width:700px; margin:0 auto; display:flex; gap:8px; align-items:center;">
                    <i class="fa-solid fa-comments" style="color:var(--accent-color); font-size:1rem;"></i>
                    <input type="text" id="ai-report-chat-input" placeholder="Chiedi altro sul report..."
                        style="flex:1; padding:10px 14px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-primary); font-size:0.85rem; outline:none;"
                        onkeydown="if(event.key==='Enter')askReportFollowUp()">
                    <button class="btn btn-primary" style="padding:8px 14px; border-radius:10px; font-size:0.85rem;" onclick="askReportFollowUp()">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // Update header to show "Storico" instead of "Report AI"
        const header = modal.querySelector('.modal-header h2');
        if (header) header.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Storico Report AI';
    }

    // Hide chat bar
    const chatBar = document.getElementById('ai-report-chat-bar');
    if (chatBar) chatBar.style.display = 'none';

    // Open modal
    setTimeout(() => modal.classList.add('open'), 10);

    // Show history
    openReportHistory(pid);
};

// --- REPORT HISTORY ---
window.openReportHistory = (pid) => {
    const reports = _getPatientReports(pid);
    if (reports.length === 0) {
        alert('Nessun report salvato per questo paziente.');
        return;
    }

    const body = document.getElementById('ai-report-body');
    if (!body) return;

    // Hide chat bar while browsing history
    const chatBar = document.getElementById('ai-report-chat-bar');
    if (chatBar) chatBar.style.display = 'none';

    let html = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="generateAIReport('${pid}')">
                <i class="fa-solid fa-arrow-left"></i> Nuovo Report
            </button>
            <h3 style="margin:0; font-size:1rem; color:var(--accent-color);">
                <i class="fa-solid fa-clock-rotate-left"></i> Storico Report (${reports.length})
            </h3>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
    `;

    reports.forEach((r, i) => {
        const d = new Date(r.date);
        const dateDisplay = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeDisplay = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const followUpCount = (r.followUps || []).length;
        const preview = r.text.substring(0, 120).replace(/[#*\n]/g, ' ').trim() + '...';

        html += `
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--glass-border); border-radius:10px; padding:12px 14px; cursor:pointer; transition:all 0.2s;"
                 onclick="viewSavedReport('${pid}', ${i})"
                 onmouseover="this.style.borderColor='var(--accent-color)'" onmouseout="this.style.borderColor='var(--glass-border)'">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">
                        <i class="fa-solid fa-file-lines" style="color:var(--accent-color); margin-right:4px;"></i>
                        ${r.name || `Report ${dateDisplay}`}
                    </span>
                    <button class="btn btn-ghost" style="padding:3px 8px; font-size:0.7rem; color:var(--danger-color); border-color:rgba(239,68,68,0.3);"
                            onclick="event.stopPropagation(); deleteReport('${pid}', ${i})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">
                    ${dateDisplay} ${timeDisplay} &middot; ${r.model || '?'}
                    ${followUpCount > 0 ? ` &middot; <i class="fa-solid fa-comments" style="font-size:0.65rem;"></i> ${followUpCount} domande` : ''}
                </div>
                <div style="font-size:0.75rem; color:var(--text-secondary); opacity:0.7;">${preview}</div>
            </div>
        `;
    });

    html += '</div>';
    body.innerHTML = html;
};

window.viewSavedReport = (pid, index) => {
    const reports = _getPatientReports(pid);
    if (!reports[index]) return;

    const r = reports[index];
    const body = document.getElementById('ai-report-body');
    if (!body) return;

    // Don't show chat bar for historical reports (conversation is closed)
    const chatBar = document.getElementById('ai-report-chat-bar');
    if (chatBar) chatBar.style.display = 'none';

    let html = `
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="openReportHistory('${pid}')">
                <i class="fa-solid fa-arrow-left"></i> Storico
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem;" onclick="window._lastAIReport='${_escapeForAttr(r.text)}'; copyAIReport()">
                <i class="fa-solid fa-copy"></i> Copia
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem; border-color:rgba(16,185,129,0.3); color:var(--success-color);"
                    onclick="window._lastAIReport=_getPatientReports('${pid}')[${index}].text; window._lastAIReportPatient='${_escapeForAttr(r.patientName || '')}'; downloadAIReport('${pid}')">
                <i class="fa-solid fa-file-arrow-down"></i> Scarica
            </button>
        </div>
        <div style="margin-bottom:10px; font-size:0.8rem; color:var(--text-secondary);">
            <i class="fa-solid fa-calendar"></i> ${new Date(r.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
            ${new Date(r.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            &middot; <i class="fa-solid fa-robot"></i> ${r.model || '?'}
        </div>
        <div style="background:rgba(0,0,0,0.2); border:1px solid var(--glass-border); border-radius:12px; padding:20px; line-height:1.7; font-size:0.9rem; color:var(--text-primary);">
            ${_markdownToHtml(r.text)}
        </div>
    `;

    // Show follow-up Q&A if any
    if (r.followUps && r.followUps.length > 0) {
        html += `<div style="margin-top:15px;">
            <h4 style="color:var(--accent-color); font-size:0.85rem; margin-bottom:10px;">
                <i class="fa-solid fa-comments"></i> Domande di follow-up (${r.followUps.length})
            </h4>`;
        r.followUps.forEach(fu => {
            html += `
                <div style="margin-bottom:10px; padding:10px 14px; background:rgba(99,102,241,0.08); border-radius:8px; font-size:0.83rem;">
                    <div style="font-weight:600; color:var(--accent-color); font-size:0.75rem; margin-bottom:4px;">
                        <i class="fa-solid fa-user"></i> Domanda
                    </div>
                    ${fu.question}
                </div>
                <div style="margin-bottom:12px; padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:8px; font-size:0.83rem; line-height:1.5;">
                    <div style="font-weight:600; color:var(--accent-color); font-size:0.75rem; margin-bottom:4px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Risposta
                    </div>
                    ${_markdownToHtml(fu.answer)}
                </div>
            `;
        });
        html += '</div>';
    }

    html += `
        <div style="margin-top:10px; padding:8px; background:rgba(99,102,241,0.05); border-radius:8px; font-size:0.7rem; color:var(--text-secondary); text-align:center;">
            <i class="fa-solid fa-shield-halved"></i> Report generato con AI. Il nome del paziente non è mai stato inviato ai server esterni.
        </div>
    `;

    body.innerHTML = html;
};

function _escapeForAttr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

window.deleteReport = (pid, index) => {
    if (!confirm('Eliminare questo report?')) return;
    const reports = _getPatientReports(pid);
    reports.splice(index, 1);
    _setPatientReports(pid, reports);
    openReportHistory(pid);
};

// Expose _getPatientReports globally for backup and viewSavedReport
window._getPatientReports = _getPatientReports;

window.closeAIReport = () => {
    const modal = document.getElementById('modal-ai-report');
    if (modal) modal.classList.remove('open');
    // Clear conversation to avoid stale data in next report
    window._aiReportConversation = null;
    window._aiReportFakeName = null;
    window._aiReportRealName = null;
    window._aiReportPatientId = null;
    // Hide chat bar
    const chatBar = document.getElementById('ai-report-chat-bar');
    if (chatBar) chatBar.style.display = 'none';
};

window.copyAIReport = () => {
    if (!window._lastAIReport) return;
    navigator.clipboard.writeText(window._lastAIReport).then(() => {
        alert('Report copiato negli appunti!');
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = window._lastAIReport;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Report copiato!');
    });
};

window.downloadAIReport = (pid) => {
    if (!window._lastAIReport) return;
    const name = window._lastAIReportPatient || 'paziente';
    const safeName = name.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const blob = new Blob([window._lastAIReport], { type: 'text/plain;charset=utf-8' });
    const fileName = `${safeName}_report_AI_${dateStr}.txt`;
    downloadFile(blob, fileName, `Report AI ${name}`);
};

// --- REPORT SECTION ICONS ---
const REPORT_SECTION_ICONS = {
    'riepilogo': { icon: 'fa-clipboard-list', color: '#6366f1' },
    'generale': { icon: 'fa-clipboard-list', color: '#6366f1' },
    'panoramica': { icon: 'fa-clipboard-list', color: '#6366f1' },
    'analisi': { icon: 'fa-chart-line', color: '#f59e0b' },
    'attivit': { icon: 'fa-chart-line', color: '#f59e0b' },
    'punti di forza': { icon: 'fa-star', color: '#10b981' },
    'forza': { icon: 'fa-star', color: '#10b981' },
    'aree di attenzione': { icon: 'fa-triangle-exclamation', color: '#ef4444' },
    'attenzione': { icon: 'fa-triangle-exclamation', color: '#ef4444' },
    'criticit': { icon: 'fa-triangle-exclamation', color: '#ef4444' },
    'suggeriment': { icon: 'fa-lightbulb', color: '#8b5cf6' },
    'raccomandazion': { icon: 'fa-lightbulb', color: '#8b5cf6' },
    'terapeutic': { icon: 'fa-lightbulb', color: '#8b5cf6' },
    'conclusion': { icon: 'fa-flag-checkered', color: '#06b6d4' },
    'obiettiv': { icon: 'fa-bullseye', color: '#f97316' },
    'progresso': { icon: 'fa-arrow-trend-up', color: '#10b981' },
    'miglioramento': { icon: 'fa-arrow-trend-up', color: '#10b981' },
};

function _getSectionIcon(headingText) {
    const lower = headingText.toLowerCase();
    for (const [keyword, cfg] of Object.entries(REPORT_SECTION_ICONS)) {
        if (lower.includes(keyword)) return cfg;
    }
    return { icon: 'fa-circle-info', color: 'var(--accent-color)' };
}

// Enrich report text with mode icons where mode names are mentioned
function _enrichReportWithModeIcons(html) {
    const allModes = typeof MODES_CONFIG !== 'undefined' ? MODES_CONFIG : {};
    for (const [key, label] of Object.entries(allModes)) {
        if (!label || label.length < 2) continue;
        const iconClass = (typeof getModeIcon === 'function') ? getModeIcon(key) : (MODE_ICONS?.[key] || 'fa-puzzle-piece');
        const regex = new RegExp(`\\b(${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
        html = html.replace(regex, `<i class="fa-solid ${iconClass}" style="font-size:0.75em; opacity:0.7; margin-right:2px;"></i>$1`);
    }
    return html;
}

// Simple markdown-to-HTML converter for the report with section icons
function _markdownToHtml(md) {
    let html = md
        .replace(/^### (.+)$/gm, (_, title) => {
            const cfg = _getSectionIcon(title);
            return `<h4 style="color:${cfg.color}; margin:18px 0 8px; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid ${cfg.icon}" style="font-size:0.9em;"></i> ${title}</h4>`;
        })
        .replace(/^## (.+)$/gm, (_, title) => {
            const cfg = _getSectionIcon(title);
            return `<h3 style="color:${cfg.color}; margin:20px 0 10px; font-size:1.05rem; border-bottom:2px solid ${cfg.color}33; padding-bottom:8px; display:flex; align-items:center; gap:10px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:${cfg.color}22; flex-shrink:0;">
                    <i class="fa-solid ${cfg.icon}" style="font-size:0.85em;"></i>
                </span> ${title}</h3>`;
        })
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li style="margin:4px 0; margin-left:16px;">$1</li>')
        .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="list-style:disc; padding-left:8px; margin:6px 0;">${match}</ul>`)
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');

    // Add mode-specific icons next to mode names
    html = _enrichReportWithModeIcons(html);
    return html;
}

// Gemini call that returns plain text (not JSON)
async function _callGeminiText(prompt, apiKey) {
    const MAX_RETRIES = 3;
    const BACKOFF_MS = [3000, 8000, 15000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(`${getGeminiApiUrl()}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Risposta vuota dall\'AI');
            return text;
        }

        const err = await response.json().catch(() => ({}));

        if (response.status === 429) {
            const parsed = _parse429Error(err);
            if (!parsed.retryable) throw new Error(parsed.message);
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
                continue;
            }
            throw new Error('Limite richieste persistente. Prova con un altro modello nelle Impostazioni, oppure attendi qualche minuto.');
        }

        if (response.status === 400) throw new Error('Chiave API non valida. Controlla nelle Impostazioni.');
        if (response.status === 404) throw new Error(`Il modello "${getGeminiModel()}" non è più disponibile. Apri Impostazioni e scegline un altro.`);
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }
}
