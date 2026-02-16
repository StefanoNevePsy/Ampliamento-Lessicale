// === BACKUP & EXPORT ===

function getTimestampedFilename() {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `Ampliamento_Lessicale_${d}_${m}_${y}_${h}_${min}.json`;
}

async function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Try Web Share API first (works on Android/Capacitor)
    try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ title: 'Backup Stimolatore', files: [file] });
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

// Full backup (Sets + Patients)
window.exportAllSets = async () => {
    try {
        const sets = await DB.getAllSets();
        const patients = await DB.getAllPatients();

        if ((!sets || sets.length === 0) && (!patients || patients.length === 0)) {
            alert("Nessun dato da esportare.");
            return;
        }

        const fullBackup = {
            version: 5,
            timestamp: new Date().toISOString(),
            device: navigator.userAgent,
            sets: sets || [],
            patients: patients || [],
            tagImages: getAllTagImages(), // from cache (backed by IndexedDB)
            quadernoLists: getSavedQuadernoLists(),
            sessionNames: getRecentSessionNames()
        };

        const dateStr = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
        const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
        const filename = `Backup_Stimolatore_${dateStr}_${timeStr}.json`;

        await downloadJSON(fullBackup, filename);
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
    return merged;
}

// Merge backup patient into local patient: keep existing history, add new sessions
function mergePatients(local, incoming) {
    const merged = JSON.parse(JSON.stringify(local));
    if (incoming.history && Array.isArray(incoming.history)) {
        if (!merged.history) merged.history = [];
        // Deduplicate by date+mode+setName
        const existingKeys = new Set(merged.history.map(h => `${h.date}::${h.mode}::${h.setName}`));
        incoming.history.forEach(h => {
            const key = `${h.date}::${h.mode}::${h.setName}`;
            if (!existingKeys.has(key)) {
                merged.history.push(h);
                existingKeys.add(key);
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
