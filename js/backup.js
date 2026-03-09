// === BACKUP & EXPORT (ZIP + legacy JSON) ===

// Helper to read AI reports for backup (mirrors _getPatientReports in patients.js)
function _getReportsForBackup(pid) {
    try {
        const key = `ai_reports_${pid}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function _setReportsForBackup(pid, reports) {
    localStorage.setItem(`ai_reports_${pid}`, JSON.stringify(reports));
}

function getTimestampedFilename(ext) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `Terapia_Attiva_${d}_${m}_${y}_${h}_${min}.${ext || 'zip'}`;
}

// Universal file download/share helper (works on desktop + Capacitor Android)
async function downloadFile(blob, filename, title) {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    // Method 1: Web Share API with file
    if (navigator.share) {
        try {
            const file = new File([blob], filename, { type: blob.type });
            await navigator.share({ title: title || filename, files: [file] });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.warn('Share file failed:', e.message);
        }
        // Retry with application/octet-stream (some Android versions reject other types)
        try {
            const genericBlob = new Blob([blob], { type: 'application/octet-stream' });
            const genericFile = new File([genericBlob], filename, { type: 'application/octet-stream' });
            await navigator.share({ title: title || filename, files: [genericFile] });
            return;
        } catch (e2) {
            if (e2.name === 'AbortError') return;
            console.warn('Share generic fallback failed:', e2.message);
        }
    }

    // Method 2: Capacitor Filesystem + Share plugins (if installed)
    if (isNative && window.Capacitor.Plugins) {
        const FS = window.Capacitor.Plugins.Filesystem;
        if (FS) {
            try {
                // For ZIP files, write as base64
                const isZip = filename.endsWith('.zip');
                let writeData;
                if (isZip) {
                    const arrayBuffer = await blob.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    writeData = { path: filename, data: btoa(binary), directory: 'CACHE' };
                } else {
                    writeData = { path: filename, data: await blob.text(), directory: 'CACHE', encoding: 'utf8' };
                }
                const written = await FS.writeFile(writeData);
                const SharePlugin = window.Capacitor.Plugins.Share;
                if (SharePlugin) {
                    await SharePlugin.share({
                        title: title || filename,
                        url: written.uri,
                        dialogTitle: title || 'Salva File'
                    });
                } else {
                    alert('File salvato nella cache: ' + filename);
                }
                return;
            } catch (e) {
                console.warn('Capacitor Filesystem fallback failed:', e);
            }
        }
    }

    // Method 3: <a> download (desktop browsers)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

    if (isNative) {
        setTimeout(() => {
            alert('Se il file non si \u00e8 scaricato, esegui:\nnpx cap sync\nper attivare il supporto download nativo.');
        }, 600);
    }
}

// --- IMAGE HELPERS for ZIP ---

// Extract extension and raw data from a dataURL
function parseDataUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const base64 = match[2];
    let ext = 'bin';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('svg')) ext = 'svg';
    else if (mime.includes('audio/')) {
        ext = mime.split('/')[1] || 'audio';
        if (ext === 'mpeg') ext = 'mp3';
    }
    return { mime, base64, ext };
}

// Convert base64 to Uint8Array for ZIP storage
function base64ToUint8(base64) {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
}

// Create a dataURL from a file's binary content and known extension
function binaryToDataUrl(uint8, ext) {
    const mimeMap = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
        'aac': 'audio/aac', 'audio': 'audio/mpeg'
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return `data:${mime};base64,${btoa(binary)}`;
}

// Sanitize a string for use as a filename
function sanitizeFilename(str) {
    return (str || 'unnamed').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
}

// --- ZIP EXPORT ---

// Build a ZIP blob from backup data, extracting images as separate files
async function buildBackupZip(sets, patients, includeConfig, includeReports = true) {
    const zip = new JSZip();
    let imageIndex = 0;

    // Manifest
    const manifest = {
        version: 6,
        format: 'zip',
        timestamp: new Date().toISOString(),
        device: navigator.userAgent,
        setCount: sets.length,
        patientCount: patients.length,
        includesConfig: includeConfig
    };

    // --- Process sets: extract images to files ---
    const processedSets = [];
    const setsFolder = zip.folder('sets');
    const itemImagesFolder = zip.folder('images/items');
    const audioFolder = zip.folder('audio');

    for (const set of sets) {
        const setClone = JSON.parse(JSON.stringify(set));
        const setSlug = sanitizeFilename(set.id);

        for (let i = 0; i < setClone.items.length; i++) {
            const item = setClone.items[i];

            // Extract item image
            if (item.url && item.url.startsWith('data:')) {
                const parsed = parseDataUrl(item.url);
                if (parsed) {
                    const imgName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                    itemImagesFolder.file(imgName, base64ToUint8(parsed.base64));
                    item.url = `images/items/${imgName}`;
                }
            }

            // Extract audio
            if (item.audio && item.audio.startsWith('data:')) {
                const parsed = parseDataUrl(item.audio);
                if (parsed) {
                    const audioName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                    audioFolder.file(audioName, base64ToUint8(parsed.base64));
                    item.audio = `audio/${audioName}`;
                }
            }
        }

        processedSets.push(setClone);
        setsFolder.file(`${setSlug}.json`, JSON.stringify(setClone, null, 2));
    }

    // --- Process patients: extract photos ---
    const processedPatients = [];
    const patientsFolder = zip.folder('patients');
    const patientPhotosFolder = zip.folder('images/patients');

    for (const patient of patients) {
        const pClone = JSON.parse(JSON.stringify(patient));
        const pSlug = sanitizeFilename(patient.id);

        if (pClone.photo && pClone.photo.startsWith('data:')) {
            const parsed = parseDataUrl(pClone.photo);
            if (parsed) {
                const photoName = `${pSlug}.${parsed.ext}`;
                patientPhotosFolder.file(photoName, base64ToUint8(parsed.base64));
                pClone.photo = `images/patients/${photoName}`;
            }
        }

        processedPatients.push(pClone);
        patientsFolder.file(`${pSlug}.json`, JSON.stringify(pClone, null, 2));
    }

    // --- AI Reports ---
    if (includeReports) {
        const reportsFolder = zip.folder('reports');
        for (const patient of patients) {
            const reports = _getReportsForBackup(patient.id);
            if (reports && reports.length > 0) {
                const pSlug = sanitizeFilename(patient.id);
                reportsFolder.file(`${pSlug}.json`, JSON.stringify(reports, null, 2));
            }
        }
    }

    // --- Config ---
    if (includeConfig) {
        const configFolder = zip.folder('config');
        const tagImagesFolder = zip.folder('images/tags');

        // Tag images: extract to files
        const tagImages = getAllTagImages();
        const tagImageMap = {};
        for (const [tag, dataUrl] of Object.entries(tagImages)) {
            const parsed = parseDataUrl(dataUrl);
            if (parsed) {
                const tagFileName = `${sanitizeFilename(tag)}.${parsed.ext}`;
                tagImagesFolder.file(tagFileName, base64ToUint8(parsed.base64));
                tagImageMap[tag] = `images/tags/${tagFileName}`;
            }
        }
        configFolder.file('tagImageMap.json', JSON.stringify(tagImageMap, null, 2));

        // Other config
        configFolder.file('quadernoLists.json', JSON.stringify(getSavedQuadernoLists(), null, 2));
        configFolder.file('sessionNames.json', JSON.stringify(getRecentSessionNames(), null, 2));
        configFolder.file('activityLayout.json', JSON.stringify(getActivityLayout(), null, 2));
    }

    // Write manifest last (after we know counts)
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}


// --- Full backup: opens selective export modal ---
window.exportAllSets = async () => {
    try {
        const sets = await DB.getAllSets();
        const patients = await DB.getAllPatients();

        if ((!sets || sets.length === 0) && (!patients || patients.length === 0)) {
            alert("Nessun dato da esportare.");
            return;
        }

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

        // --- AI REPORTS ---
        let totalReports = 0;
        patients.forEach(p => { totalReports += _getReportsForBackup(p.id).length; });
        if (totalReports > 0) {
            html += `
            <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-bottom:12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:bold; font-size:1rem;">
                    <input type="checkbox" id="exp-reports" checked style="width:18px; height:18px;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Report AI (${totalReports})
                </label>
                <div style="padding-left:20px; font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">
                    Include i report AI generati per i pazienti selezionati
                </div>
            </div>`;
        }

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

// Execute the selective export (ZIP format)
window.executeSelectiveExport = async () => {
    try {
        const selectedSetIds = new Set();
        document.querySelectorAll('.exp-set-item:checked').forEach(cb => selectedSetIds.add(cb.dataset.id));
        const selectedPatientIds = new Set();
        document.querySelectorAll('.exp-patient-item:checked').forEach(cb => selectedPatientIds.add(cb.dataset.id));
        const includeConfig = document.getElementById('exp-config').checked;
        const reportsCheckbox = document.getElementById('exp-reports');
        const includeReports = reportsCheckbox ? reportsCheckbox.checked : true;

        const sets = window._exportData.sets.filter(s => selectedSetIds.has(s.id));
        const patients = window._exportData.patients.filter(p => selectedPatientIds.has(p.id));

        if (sets.length === 0 && patients.length === 0 && !includeConfig) {
            alert("Seleziona almeno un elemento da esportare.");
            return;
        }

        const dateStr = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
        const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
        const filename = `Backup_TerapiaAttiva_${dateStr}_${timeStr}.zip`;

        const zipBlob = await buildBackupZip(sets, patients, includeConfig, includeReports);
        await downloadFile(zipBlob, filename, 'Backup Terapia Attiva');

        document.getElementById('modal-export-select').classList.remove('open');
        window._exportData = null;
    } catch (e) {
        console.error("Errore export:", e);
        alert("Errore durante l'esportazione: " + e.message);
    }
};

// Single set export as ZIP
window.exportSingleSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    if (!set) return;

    // Include tag images for this set's tags
    const sets = [set];
    const filename = `Set_${set.name.replace(/\s+/g, '_')}_${getTimestampedFilename('zip')}`;

    // Build a mini ZIP with just this set + its tag images
    const zip = new JSZip();
    const setClone = JSON.parse(JSON.stringify(set));
    const setSlug = sanitizeFilename(set.id);
    const itemImagesFolder = zip.folder('images/items');
    const audioFolder = zip.folder('audio');

    for (let i = 0; i < setClone.items.length; i++) {
        const item = setClone.items[i];
        if (item.url && item.url.startsWith('data:')) {
            const parsed = parseDataUrl(item.url);
            if (parsed) {
                const imgName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                itemImagesFolder.file(imgName, base64ToUint8(parsed.base64));
                item.url = `images/items/${imgName}`;
            }
        }
        if (item.audio && item.audio.startsWith('data:')) {
            const parsed = parseDataUrl(item.audio);
            if (parsed) {
                const audioName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                audioFolder.file(audioName, base64ToUint8(parsed.base64));
                item.audio = `audio/${audioName}`;
            }
        }
    }

    zip.folder('sets').file(`${setSlug}.json`, JSON.stringify(setClone, null, 2));

    // Tag images for this set
    if (set.tags && set.tags.length > 0) {
        const allImgs = getAllTagImages();
        const tagImagesFolder = zip.folder('images/tags');
        const tagImageMap = {};
        set.tags.forEach(t => {
            const key = t.toLowerCase().trim();
            if (allImgs[key]) {
                const parsed = parseDataUrl(allImgs[key]);
                if (parsed) {
                    const tagFileName = `${sanitizeFilename(key)}.${parsed.ext}`;
                    tagImagesFolder.file(tagFileName, base64ToUint8(parsed.base64));
                    tagImageMap[key] = `images/tags/${tagFileName}`;
                }
            }
        });
        if (Object.keys(tagImageMap).length > 0) {
            zip.folder('config').file('tagImageMap.json', JSON.stringify(tagImageMap, null, 2));
        }
    }

    const manifest = {
        version: 6,
        format: 'zip',
        singleSet: true,
        timestamp: new Date().toISOString(),
        setCount: 1
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await downloadFile(zipBlob, filename, `Set: ${set.name}`);
};


// === IMPORT (supports both ZIP and legacy JSON) ===

// Main import entry point
window.importSets = async (input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    input.value = '';

    try {
        if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
            await importFromZip(file);
        } else {
            await importFromJSON(file);
        }
    } catch (err) {
        console.error(err);
        alert("Errore importazione: " + err.message);
    }
};

// Import from ZIP file
async function importFromZip(file) {
    const zip = await JSZip.loadAsync(file);

    // Read manifest
    const manifestFile = zip.file('manifest.json');
    const manifest = manifestFile ? JSON.parse(await manifestFile.async('text')) : {};

    let setsAdded = 0, setsUpdated = 0;
    let patientsAdded = 0, patientsUpdated = 0;

    // Load current local data
    const localSets = await DB.getAllSets();
    const localPatients = await DB.getAllPatients();
    const localSetsMap = {};
    localSets.forEach(s => { localSetsMap[s.id] = s; });
    const localPatientsMap = {};
    localPatients.forEach(p => { localPatientsMap[p.id] = p; });

    // --- Import sets ---
    const setFiles = [];
    zip.folder('sets').forEach((relativePath, zipEntry) => {
        if (relativePath.endsWith('.json')) setFiles.push(zipEntry);
    });

    for (const entry of setFiles) {
        const setData = JSON.parse(await entry.async('text'));

        // Rehydrate item images from ZIP
        for (const item of setData.items) {
            if (item.url && !item.url.startsWith('data:') && !item.url.startsWith('http')) {
                const imgFile = zip.file(item.url);
                if (imgFile) {
                    const ext = item.url.split('.').pop();
                    const uint8 = await imgFile.async('uint8array');
                    item.url = binaryToDataUrl(uint8, ext);
                }
            }
            if (item.audio && !item.audio.startsWith('data:')) {
                const audioFile = zip.file(item.audio);
                if (audioFile) {
                    const ext = item.audio.split('.').pop();
                    const uint8 = await audioFile.async('uint8array');
                    item.audio = binaryToDataUrl(uint8, ext);
                }
            }
        }

        if (!setData.id) continue;
        if (localSetsMap[setData.id]) {
            const merged = mergeSets(localSetsMap[setData.id], setData);
            await DB.saveSet(merged);
            setsUpdated++;
        } else {
            await DB.saveSet(setData);
            setsAdded++;
        }
    }

    // --- Import patients ---
    const patientFiles = [];
    const patientsDir = zip.folder('patients');
    if (patientsDir) {
        patientsDir.forEach((relativePath, zipEntry) => {
            if (relativePath.endsWith('.json')) patientFiles.push(zipEntry);
        });
    }

    for (const entry of patientFiles) {
        const pData = JSON.parse(await entry.async('text'));

        // Rehydrate patient photo
        if (pData.photo && !pData.photo.startsWith('data:') && !pData.photo.startsWith('http')) {
            const photoFile = zip.file(pData.photo);
            if (photoFile) {
                const ext = pData.photo.split('.').pop();
                const uint8 = await photoFile.async('uint8array');
                pData.photo = binaryToDataUrl(uint8, ext);
            }
        }

        if (!pData.id) continue;
        if (localPatientsMap[pData.id]) {
            const merged = mergePatients(localPatientsMap[pData.id], pData);
            await DB.savePatient(merged);
            patientsUpdated++;
        } else {
            await DB.savePatient(pData);
            patientsAdded++;
        }
    }

    // --- Import config ---
    const configDir = zip.folder('config');

    // Tag images
    const tagMapFile = configDir ? configDir.file('tagImageMap.json') : null;
    if (tagMapFile) {
        const tagImageMap = JSON.parse(await tagMapFile.async('text'));
        const existing = getAllTagImages();
        for (const [tag, path] of Object.entries(tagImageMap)) {
            const imgFile = zip.file(path);
            if (imgFile) {
                const ext = path.split('.').pop();
                const uint8 = await imgFile.async('uint8array');
                existing[tag] = binaryToDataUrl(uint8, ext);
            }
        }
        await DB.importAllTagImages(existing);
        Object.assign(_tagImageCache, existing);
    }

    // Quaderno lists
    const quadernoFile = configDir ? configDir.file('quadernoLists.json') : null;
    if (quadernoFile) {
        const incoming = JSON.parse(await quadernoFile.async('text'));
        if (Array.isArray(incoming)) {
            const existing = getSavedQuadernoLists();
            const existingNames = new Set(existing.map(l => l.name));
            incoming.forEach(l => { if (!existingNames.has(l.name)) existing.push(l); });
            localStorage.setItem('quadernoLists', JSON.stringify(existing));
        }
    }

    // Session names
    const sessionFile = configDir ? configDir.file('sessionNames.json') : null;
    if (sessionFile) {
        const incoming = JSON.parse(await sessionFile.async('text'));
        if (Array.isArray(incoming)) {
            const existing = getRecentSessionNames();
            const merged = [...new Set([...existing, ...incoming])].slice(0, 30);
            localStorage.setItem('sessionNames', JSON.stringify(merged));
        }
    }

    // Activity layout
    const layoutFile = configDir ? configDir.file('activityLayout.json') : null;
    if (layoutFile) {
        const incoming = JSON.parse(await layoutFile.async('text'));
        mergeActivityLayout(incoming);
    }

    // --- Import AI Reports ---
    const reportsDir = zip.folder('reports');
    if (reportsDir) {
        const reportFiles = [];
        reportsDir.forEach((relativePath, zipEntry) => {
            if (relativePath.endsWith('.json')) reportFiles.push(zipEntry);
        });
        for (const entry of reportFiles) {
            const incomingReports = JSON.parse(await entry.async('text'));
            if (!Array.isArray(incomingReports) || incomingReports.length === 0) continue;
            // Extract patient ID from filename (sanitized ID)
            const fileName = entry.name.split('/').pop().replace('.json', '');
            // Find actual patient ID matching this slug
            const matchedPatient = [...localPatients, ...((await DB.getAllPatients()) || [])].find(p => sanitizeFilename(p.id) === fileName);
            if (matchedPatient) {
                const existing = _getReportsForBackup(matchedPatient.id);
                const existingIds = new Set(existing.map(r => r.id));
                const merged = [...existing];
                for (const r of incomingReports) {
                    if (!existingIds.has(r.id)) merged.push(r);
                }
                // Sort newest first
                merged.sort((a, b) => new Date(b.date) - new Date(a.date));
                if (merged.length > 50) merged.length = 50;
                _setReportsForBackup(matchedPatient.id, merged);
            }
        }
    }

    // Summary
    const parts = [];
    if (setsAdded > 0) parts.push(`${setsAdded} set aggiunti`);
    if (setsUpdated > 0) parts.push(`${setsUpdated} set aggiornati`);
    if (patientsAdded > 0) parts.push(`${patientsAdded} pazienti aggiunti`);
    if (patientsUpdated > 0) parts.push(`${patientsUpdated} pazienti aggiornati`);

    alert(`Sincronizzazione completata!\n\n${parts.length > 0 ? parts.join('\n') : 'Nessuna modifica necessaria.'}\n\nI dati locali non presenti nel backup sono stati mantenuti.`);

    await reloadAppData();
}

// Import from legacy JSON file (backward compatible)
async function importFromJSON(file) {
    const text = await file.text();
    const data = JSON.parse(text);

    let setsAdded = 0, setsUpdated = 0;
    let patientsAdded = 0, patientsUpdated = 0;

    const localSets = await DB.getAllSets();
    const localPatients = await DB.getAllPatients();
    const localSetsMap = {};
    localSets.forEach(s => { localSetsMap[s.id] = s; });
    const localPatientsMap = {};
    localPatients.forEach(p => { localPatientsMap[p.id] = p; });

    // Determine incoming data
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

    // Merge tag images
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
        data.quadernoLists.forEach(l => { if (!existingNames.has(l.name)) existing.push(l); });
        localStorage.setItem('quadernoLists', JSON.stringify(existing));
    }

    // Merge session names
    if (data.sessionNames && Array.isArray(data.sessionNames)) {
        const existing = getRecentSessionNames();
        const merged = [...new Set([...existing, ...data.sessionNames])].slice(0, 30);
        localStorage.setItem('sessionNames', JSON.stringify(merged));
    }

    // Activity layout
    if (data.activityLayout) {
        mergeActivityLayout(data.activityLayout);
    }

    const parts = [];
    if (setsAdded > 0) parts.push(`${setsAdded} set aggiunti`);
    if (setsUpdated > 0) parts.push(`${setsUpdated} set aggiornati`);
    if (patientsAdded > 0) parts.push(`${patientsAdded} pazienti aggiunti`);
    if (patientsUpdated > 0) parts.push(`${patientsUpdated} pazienti aggiornati`);

    alert(`Sincronizzazione completata!\n\n${parts.length > 0 ? parts.join('\n') : 'Nessuna modifica necessaria.'}\n\nI dati locali non presenti nel backup sono stati mantenuti.`);

    await reloadAppData();
}

// --- MERGE HELPERS ---

function mergeSets(local, incoming) {
    const merged = JSON.parse(JSON.stringify(local));
    const localByLabel = {};
    merged.items.forEach((item, i) => { localByLabel[item.label || item.l || ''] = i; });

    incoming.items.forEach(bItem => {
        const label = bItem.label || bItem.l || '';
        if (label in localByLabel) {
            merged.items[localByLabel[label]] = { ...merged.items[localByLabel[label]], ...bItem };
        } else {
            merged.items.push(bItem);
        }
    });

    if (incoming.tags && incoming.tags.length > 0) {
        const tagSet = new Set([...(merged.tags || []), ...incoming.tags].map(t => t.toLowerCase().trim()));
        merged.tags = [...tagSet];
    }
    if (incoming.modes && incoming.modes.length > 0) {
        merged.modes = [...new Set([...(merged.modes || []), ...incoming.modes])];
    }
    if (incoming.sortOrder != null && merged.sortOrder == null) {
        merged.sortOrder = incoming.sortOrder;
    }
    return merged;
}

function mergePatients(local, incoming) {
    const merged = JSON.parse(JSON.stringify(local));
    if (incoming.history && Array.isArray(incoming.history)) {
        if (!merged.history) merged.history = [];
        const existingByKey = {};
        merged.history.forEach((h, i) => { existingByKey[`${h.date}::${h.mode}::${h.setName}`] = i; });
        incoming.history.forEach(h => {
            const key = `${h.date}::${h.mode}::${h.setName}`;
            if (existingByKey[key] !== undefined) {
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
    if (incoming.name && !merged.name) merged.name = incoming.name;
    if (incoming.notes && !merged.notes) merged.notes = incoming.notes;
    return merged;
}

function mergeActivityLayout(incoming) {
    const local = getActivityLayout();
    if (incoming.customModes) {
        if (!local.customModes) local.customModes = {};
        for (const [k, v] of Object.entries(incoming.customModes)) {
            if (!local.customModes[k]) {
                local.customModes[k] = v;
                const inAnyGroup = local.groups.some(g => g.modes.includes(k));
                if (!inAnyGroup && local.groups.length > 0) local.groups[0].modes.push(k);
            }
        }
    }
    if (incoming.modeEmojis) {
        if (!local.modeEmojis) local.modeEmojis = {};
        Object.assign(local.modeEmojis, incoming.modeEmojis);
    }
    if (incoming.modeIcons) {
        if (!local.modeIcons) local.modeIcons = {};
        Object.assign(local.modeIcons, incoming.modeIcons);
    }
    if (incoming.groupColors) {
        if (!local.groupColors) local.groupColors = {};
        Object.assign(local.groupColors, incoming.groupColors);
    }
    saveActivityLayout(local);
    renderModeSelect();
}

// Reload app state after import
async function reloadAppData() {
    state.savedSets = await DB.getAllSets();
    state.patients = await DB.getAllPatients();
    refreshAllTags();
    populateGlobalPatientSelect();
    filterSetsByMode();
    if (document.getElementById('modal-library').classList.contains('open')) {
        renderLibList();
    }
}
