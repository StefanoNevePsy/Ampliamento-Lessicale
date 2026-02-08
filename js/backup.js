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

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
            version: 2,
            timestamp: new Date().toISOString(),
            device: navigator.userAgent,
            sets: sets || [],
            patients: patients || []
        };

        const dateStr = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
        const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
        const filename = `Backup_Stimolatore_${dateStr}_${timeStr}.json`;

        downloadJSON(fullBackup, filename);
    } catch (e) {
        console.error("Errore export:", e);
        alert("Errore durante l'esportazione: " + e.message);
    }
};

// Single set export
window.exportSingleSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    if (!set) return;
    const filename = `Set_${set.name.replace(/\s+/g, '_')}_${getTimestampedFilename()}`;
    downloadJSON(set, filename);
};

// Import (supports old array format and new object format)
window.importSets = (input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const jsonContent = e.target.result;
            const data = JSON.parse(jsonContent);

            let setsCount = 0;
            let patientsCount = 0;

            // New format (object with version)
            if (data.version && (data.sets || data.patients)) {
                if (data.sets && Array.isArray(data.sets)) {
                    for (const s of data.sets) { await DB.saveSet(s); setsCount++; }
                }
                if (data.patients && Array.isArray(data.patients)) {
                    for (const p of data.patients) { await DB.savePatient(p); patientsCount++; }
                }
            }
            // Old format (array of sets)
            else if (Array.isArray(data)) {
                for (const s of data) {
                    if (s.id && s.items) { await DB.saveSet(s); setsCount++; }
                }
            }
            // Single set
            else if (data.id && data.items) {
                await DB.saveSet(data);
                setsCount = 1;
            }
            else {
                throw new Error("Formato file non riconosciuto.");
            }

            alert(`Ripristino completato!\n\nSet importati: ${setsCount}\nPazienti importati: ${patientsCount}`);

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
