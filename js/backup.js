// === BACKUP & EXPORT ===

function getTimestampedFilename() {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `Terapia_Attiva_${d}_${m}_${y}_${h}_${min}.json`;
}

async function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Try Web Share API first (works on Android/Capacitor)
    try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title: 'Backup Terapia Attiva', files: [file] });
            return;
        }
    } catch (e) {
        // Share was cancelled or not supported, fall through to download
        if (e.name === 'AbortError') return; // User cancelled share
    }

    // Fallback: <a> download (works on desktop browsers)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Full backup - opens selective export modal
window.exportAllSets = async () => {
    try {
        const sets = await DB.getAllSets();
        const patients = await DB.getAllPatients();

        if ((!sets || sets.length === 0) && (!patients || patients.length === 0)) {
            alert("Nessun dato da esportare.");
            return;
        }

        // Store data for the export modal
        window._exportData = { sets, patients };

        // Group sets by category
        const catMap = {};
        sets.forEach(s => {
            const cat = s.category || 'Altri';
            if (!catMap[cat]) catMap[cat] = [];
            catMap[cat].push(s);
        });

        let html = `<div style="max-width:600px; margin:0 auto;">`;

        // --- SETS ---
        html += `
        <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; font-size:1rem; margin-bottom:8px;">
                <input type="checkbox" id="exp-all-sets" checked onchange="toggleExportSection('sets', this.checked)" style="width:18px; height:18px;">
                <i class="fa-solid fa-layer-group"></i> Set (${sets.length})
            </label>
            <div id="exp-sets-list" style="padding-left:20px;">`;

        for (const [cat, catSets] of Object.entries(catMap).sort()) {
            html += `
            <div style="margin-bottom:6px;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.85rem; color:var(--text-secondary); font-weight:bold;">
                    <input type="checkbox" class="exp-set-cat" data-cat="${cat}" checked onchange="toggleExportCat('${cat}', this.checked)" style="width:16px; height:16px;">
                    ${cat} (${catSets.length})
                </label>
                <div style="padding-left:18px;">`;
            catSets.forEach(s => {
                html += `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem; padding:2px 0;">
                    <input type="checkbox" class="exp-set-item" data-id="${s.id}" checked style="width:14px; height:14px;">
                    ${s.name} <span style="opacity:0.5;">(${s.items.length})</span>
                </label>`;
            });
            html += `</div></div>`;
        }
        html += `</div></div>`;

        // --- PATIENTS ---
        html += `
        <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; font-size:1rem; margin-bottom:8px;">
                <input type="checkbox" id="exp-all-patients" checked onchange="toggleExportSection('patients', this.checked)" style="width:18px; height:18px;">
                <i class="fa-solid fa-user-doctor"></i> Pazienti (${patients.length})
            </label>
            <div id="exp-patients-list" style="padding-left:20px;">`;
        patients.forEach(p => {
            const sessions = (p.history || []).length;
            html += `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem; padding:2px 0;">
                <input type="checkbox" class="exp-patient-item" data-id="${p.id}" checked style="width:14px; height:14px;">
                ${p.name || 'Senza nome'} <span style="opacity:0.5;">(${sessions} sessioni)</span>
            </label>`;
        });
        html += `</div></div>`;

        // --- CONFIG ---
        html += `
        <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; font-size:1rem;">
                <input type="checkbox" id="exp-config" checked style="width:18px; height:18px;">
                <i class="fa-solid fa-sliders"></i> Configurazione (attivit&agrave;, quaderno, tag)
            </label>
        </div>`;

        html += `</div>`;

        document.getElementById('export-select-body').innerHTML = html;
        document.getElementById('modal-export-select').classList.add('open');

    } catch (e) {
        console.error("Errore export:", e);
        alert("Errore durante l'esportazione: " + e.message);
    }
};

// Toggle helpers for export checklist
window.toggleExportSection = (section, checked) => {
    const selector = section === 'sets' ? '.exp-set-item, .exp-set-cat' : '.exp-patient-item';
    document.querySelectorAll(selector).forEach(cb => { cb.checked = checked; });
};
window.toggleExportCat = (cat, checked) => {
    document.querySelectorAll(`.exp-set-item`).forEach(cb => {
        const setId = cb.dataset.id;
        const s = window._exportData.sets.find(x => x.id === setId);
        if (s && (s.category || 'Altri') === cat) cb.checked = checked;
    });
};

// Execute the selective export
window.executeSelectiveExport = async () => {
    try {
        const selectedSetIds = new Set();
        document.querySelectorAll('.exp-set-item:checked').forEach(cb => selectedSetIds.add(cb.dataset.id));
        const selectedPatientIds = new Set();
        document.querySelectorAll('.exp-patient-item:checked').forEach(cb => selectedPatientIds.add(cb.dataset.id));
        const includeConfig = document.getElementById('exp-config').checked;

        const sets = window._exportData.sets.filter(s => selectedSetIds.has(s.id));
        const patients = window._exportData.patients.filter(p => selectedPatientIds.has(p.id));

        if (sets.length === 0 && patients.length === 0 && !includeConfig) {
            alert("Seleziona almeno un elemento da esportare.");
            return;
        }

        const backup = {
            version: 5,
            timestamp: new Date().toISOString(),
            device: navigator.userAgent,
            sets: sets,
            patients: patients
        };

        if (includeConfig) {
            backup.tagImages = getAllTagImages();
            backup.quadernoLists = getSavedQuadernoLists();
            backup.sessionNames = getRecentSessionNames();
            backup.activityLayout = getActivityLayout();
        }

        const dateStr = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
        const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
        const filename = `Backup_TerapiaAttiva_${dateStr}_${timeStr}.json`;

        await downloadJSON(backup, filename);
        document.getElementById('modal-export-select').classList.remove('open');
        window._exportData = null;
    } catch (e) {
        console.error("Errore export:", e);
        alert("Errore durante l'esportazione: " + e.message);
    }
};

// Single set export (with tag images for portability)
window.exportSingleSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    if (!set) return;

    // Collect relevant tag images for this set's tags
    const setTagImages = {};
    if (set.tags && set.tags.length > 0) {
        const allImgs = getAllTagImages();
        set.tags.forEach(t => {
            const key = t.toLowerCase().trim();
            if (allImgs[key]) setTagImages[key] = allImgs[key];
        });
    }

    const exportData = {
        version: 5,
        singleSet: true,
        timestamp: new Date().toISOString(),
        sets: [set],
        tagImages: Object.keys(setTagImages).length > 0 ? setTagImages : undefined
    };

    const filename = `Set_${set.name.replace(/\s+/g, '_')}_${getTimestampedFilename()}`;
    await downloadJSON(exportData, filename);
};

// --- MERGE HELPERS ---
// Merge a backup set into a local set: keep local items, add/update from backup
function mergeSets(local, incoming) {
    const merged = JSON.parse(JSON.stringify(local));
    // Build map of local items by label for quick lookup
    const localByLabel = {};
    merged.items.forEach((item, i) => { localByLabel[item.label || item.l || ''] = i; });

    incoming.items.forEach(bItem => {
        const label = bItem.label || bItem.l || '';
        if (label in localByLabel) {
            // Update existing item (overwrite with backup version)
            merged.items[localByLabel[label]] = { ...merged.items[localByLabel[label]], ...bItem };
        } else {
            // Add new item
            merged.items.push(bItem);
        }
    });

    // Merge metadata: take backup values only if they add info
    if (incoming.tags && incoming.tags.length > 0) {
        const tagSet = new Set([...(merged.tags || []), ...incoming.tags].map(t => t.toLowerCase().trim()));
        merged.tags = [...tagSet];
    }
    if (incoming.modes && incoming.modes.length > 0) {
        merged.modes = [...new Set([...(merged.modes || []), ...incoming.modes])];
    }
    // Preserve sortOrder from incoming if local doesn't have one
    if (incoming.sortOrder != null && merged.sortOrder == null) {
        merged.sortOrder = incoming.sortOrder;
    }
    return merged;
}

// Merge backup patient into local patient: keep existing history, add new sessions
function mergePatients(local, incoming) {
    const merged = JSON.parse(JSON.stringify(local));
    if (incoming.history && Array.isArray(incoming.history)) {
        if (!merged.history) merged.history = [];
        // Deduplicate by date+mode+setName, but enrich if incoming has more data
        const existingByKey = {};
        merged.history.forEach((h, i) => { existingByKey[`${h.date}::${h.mode}::${h.setName}`] = i; });
        incoming.history.forEach(h => {
            const key = `${h.date}::${h.mode}::${h.setName}`;
            if (existingByKey[key] !== undefined) {
                // Replace local with incoming if incoming has more fields (taskSteps, itemDetails, etc.)
                const localIdx = existingByKey[key];
                if (Object.keys(h).length > Object.keys(merged.history[localIdx]).length) {
                    merged.history[localIdx] = h;
                }
            } else {
                existingByKey[key] = merged.history.length;
                merged.history.push(h);
            }
        });
    }
    // Merge basic info (name, notes) - prefer non-empty values
    if (incoming.name && !merged.name) merged.name = incoming.name;
    if (incoming.notes && !merged.notes) merged.notes = incoming.notes;
    return merged;
}

// Import (non-destructive merge: never deletes existing data)
window.importSets = (input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const jsonContent = e.target.result;
            const data = JSON.parse(jsonContent);

            let setsAdded = 0, setsUpdated = 0;
            let patientsAdded = 0, patientsUpdated = 0;

            // Load current local data
            const localSets = await DB.getAllSets();
            const localPatients = await DB.getAllPatients();
            const localSetsMap = {};
            localSets.forEach(s => { localSetsMap[s.id] = s; });
            const localPatientsMap = {};
            localPatients.forEach(p => { localPatientsMap[p.id] = p; });

            // Determine incoming sets
            let incomingSets = [];
            let incomingPatients = [];

            if (data.version && (data.sets || data.patients)) {
                incomingSets = data.sets || [];
                incomingPatients = data.patients || [];
            } else if (Array.isArray(data)) {
                incomingSets = data.filter(s => s.id && s.items);
            } else if (data.id && data.items) {
                incomingSets = [data];
            } else {
                throw new Error("Formato file non riconosciuto.");
            }

            // Merge sets
            for (const incoming of incomingSets) {
                if (!incoming.id) continue;
                if (localSetsMap[incoming.id]) {
                    const merged = mergeSets(localSetsMap[incoming.id], incoming);
                    await DB.saveSet(merged);
                    setsUpdated++;
                } else {
                    await DB.saveSet(incoming);
                    setsAdded++;
                }
            }

            // Merge patients
            for (const incoming of incomingPatients) {
                if (!incoming.id) continue;
                if (localPatientsMap[incoming.id]) {
                    const merged = mergePatients(localPatientsMap[incoming.id], incoming);
                    await DB.savePatient(merged);
                    patientsUpdated++;
                } else {
                    await DB.savePatient(incoming);
                    patientsAdded++;
                }
            }

            // Merge tag images (add from backup, never remove existing)
            if (data.tagImages && typeof data.tagImages === 'object') {
                const existing = getAllTagImages();
                const merged = { ...existing, ...data.tagImages };
                await DB.importAllTagImages(merged);
                Object.assign(_tagImageCache, merged);
            }
            // Merge quaderno lists
            if (data.quadernoLists && Array.isArray(data.quadernoLists)) {
                const existing = getSavedQuadernoLists();
                const existingNames = new Set(existing.map(l => l.name));
                data.quadernoLists.forEach(l => {
                    if (!existingNames.has(l.name)) existing.push(l);
                });
                localStorage.setItem('quadernoLists', JSON.stringify(existing));
            }
            // Merge session names
            if (data.sessionNames && Array.isArray(data.sessionNames)) {
                const existing = getRecentSessionNames();
                const merged = [...new Set([...existing, ...data.sessionNames])].slice(0, 30);
                localStorage.setItem('sessionNames', JSON.stringify(merged));
            }
            // Import activity layout (if present and none exists locally, or merge custom modes)
            if (data.activityLayout) {
                const local = getActivityLayout();
                if (data.activityLayout.customModes) {
                    if (!local.customModes) local.customModes = {};
                    for (const [k, v] of Object.entries(data.activityLayout.customModes)) {
                        if (!local.customModes[k]) {
                            local.customModes[k] = v;
                            // Add to first group if not already in any group
                            const inAnyGroup = local.groups.some(g => g.modes.includes(k));
                            if (!inAnyGroup && local.groups.length > 0) local.groups[0].modes.push(k);
                        }
                    }
                }
                if (data.activityLayout.modeEmojis) {
                    if (!local.modeEmojis) local.modeEmojis = {};
                    Object.assign(local.modeEmojis, data.activityLayout.modeEmojis);
                }
                saveActivityLayout(local);
                renderModeSelect();
            }

            // Build summary
            const parts = [];
            if (setsAdded > 0) parts.push(`${setsAdded} set aggiunti`);
            if (setsUpdated > 0) parts.push(`${setsUpdated} set aggiornati`);
            if (patientsAdded > 0) parts.push(`${patientsAdded} pazienti aggiunti`);
            if (patientsUpdated > 0) parts.push(`${patientsUpdated} pazienti aggiornati`);

            alert(`Sincronizzazione completata!\n\n${parts.length > 0 ? parts.join('\n') : 'Nessuna modifica necessaria.'}\n\nI dati locali non presenti nel backup sono stati mantenuti.`);

            // Reload without page refresh
            state.savedSets = await DB.getAllSets();
            state.patients = await DB.getAllPatients();
            refreshAllTags();
            populateGlobalPatientSelect();
            filterSetsByMode();
            if (document.getElementById('modal-library').classList.contains('open')) {
                renderLibList();
            }

        } catch (err) {
            console.error(err);
            alert("Errore importazione: " + err.message);
        }
    };

    reader.onerror = () => {
        alert("Errore di lettura file. Verifica i permessi dell'app.");
    };

    reader.readAsText(file);
    input.value = '';
};
