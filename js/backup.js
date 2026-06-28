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
                const isZip = filename.endsWith('.zip');
                let written;
                if (isZip) {
                    // Write in slices so a large ZIP never needs a single giant
                    // base64 string. 3MB is a multiple of 3 bytes, so the
                    // base64 of each slice concatenates into valid base64.
                    const SLICE = 3 * 1024 * 1024;
                    for (let pos = 0; pos < blob.size; pos += SLICE) {
                        const b64chunk = await _blobToBase64(blob.slice(pos, pos + SLICE));
                        if (pos === 0) {
                            await FS.writeFile({ path: filename, data: b64chunk, directory: 'CACHE' });
                        } else {
                            await FS.appendFile({ path: filename, data: b64chunk, directory: 'CACHE' });
                        }
                    }
                    written = await FS.getUri({ path: filename, directory: 'CACHE' });
                } else {
                    written = await FS.writeFile({ path: filename, data: await blob.text(), directory: 'CACHE', encoding: 'utf8' });
                }
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

// --- Chunked base64 conversion (avoids OOM on large files) ---
function _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            const commaIdx = dataUrl.indexOf(',');
            resolve(commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : dataUrl);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
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

const _EXT_MIME_MAP = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
    'aac': 'audio/aac', 'audio': 'audio/mpeg'
};

function extToMime(ext) {
    return _EXT_MIME_MAP[ext] || 'application/octet-stream';
}

// Rehydrate a ZIP entry to a dataURL without binary->string->btoa round trips:
// JSZip can return base64 directly, avoiding huge intermediate strings.
async function zipEntryToDataUrl(zip, path) {
    const entry = zip.file(path);
    if (!entry) return null;
    const ext = path.split('.').pop().toLowerCase();
    const b64 = await entry.async('base64');
    return `data:${extToMime(ext)};base64,${b64}`;
}

// Yield to the event loop so the UI stays responsive and GC can reclaim
// memory between heavy per-item operations.
function _yieldToUI() {
    return new Promise(r => setTimeout(r, 0));
}

// --- Progress overlay (shared by export/import) ---
function showBackupProgress(text, pct) {
    let el = document.getElementById('backup-progress-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'backup-progress-overlay';
        el.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;';
        el.innerHTML = `
            <i class="fa-solid fa-box-archive" style="font-size:2rem; color:var(--accent-color);"></i>
            <div id="backup-progress-text" style="color:#fff; font-size:0.95rem; text-align:center; padding:0 20px;"></div>
            <div style="width:min(280px, 70vw); height:8px; background:rgba(255,255,255,0.15); border-radius:4px; overflow:hidden;">
                <div id="backup-progress-bar" style="height:100%; width:0%; background:var(--accent-color); border-radius:4px; transition:width 0.2s;"></div>
            </div>`;
        document.body.appendChild(el);
    }
    el.style.display = 'flex';
    const txtEl = document.getElementById('backup-progress-text');
    if (txtEl && text != null) txtEl.textContent = text;
    const barEl = document.getElementById('backup-progress-bar');
    if (barEl && pct != null) barEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function hideBackupProgress() {
    const el = document.getElementById('backup-progress-overlay');
    if (el) el.style.display = 'none';
}

// Sanitize a string for use as a filename
function sanitizeFilename(str) {
    return (str || 'unnamed').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
}

// --- ZIP EXPORT ---

// Extract a set's media (item images, variants, audio) into the ZIP and return
// a lightweight copy of the set with media replaced by ZIP paths.
// Uses shallow clones + base64 passed straight to JSZip ({base64:true}) so the
// large base64 strings are never duplicated or re-decoded by us.
function _addSetToZip(zip, set) {
    const setSlug = sanitizeFilename(set.id);
    const itemImagesFolder = zip.folder('images/items');
    const audioFolder = zip.folder('audio');

    const setClone = { ...set, items: [] };

    for (let i = 0; i < (set.items || []).length; i++) {
        const item = { ...set.items[i] };

        // Extract item image
        if (item.url && item.url.startsWith('data:')) {
            const parsed = parseDataUrl(item.url);
            if (parsed) {
                const imgName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                itemImagesFolder.file(imgName, parsed.base64, { base64: true });
                item.url = `images/items/${imgName}`;
            }
        }

        // Extract variant images
        if (item.variantUrls && typeof item.variantUrls === 'object') {
            item.variantUrls = { ...item.variantUrls };
            for (const [vIdx, vUrl] of Object.entries(item.variantUrls)) {
                if (vUrl && vUrl.startsWith('data:')) {
                    const parsed = parseDataUrl(vUrl);
                    if (parsed) {
                        const vImgName = `${setSlug}_${i}_${sanitizeFilename(item.label)}_v${vIdx}.${parsed.ext}`;
                        itemImagesFolder.file(vImgName, parsed.base64, { base64: true });
                        item.variantUrls[vIdx] = `images/items/${vImgName}`;
                    }
                }
            }
        }

        // Extract audio
        if (item.audio && item.audio.startsWith('data:')) {
            const parsed = parseDataUrl(item.audio);
            if (parsed) {
                const audioName = `${setSlug}_${i}_${sanitizeFilename(item.label)}.${parsed.ext}`;
                audioFolder.file(audioName, parsed.base64, { base64: true });
                item.audio = `audio/${audioName}`;
            }
        }

        setClone.items.push(item);
    }

    zip.folder('sets').file(`${setSlug}.json`, JSON.stringify(setClone, null, 2));
    return setClone;
}

// Build a ZIP blob from backup data, extracting images as separate files
async function buildBackupZip(sets, patients, includeConfig, includeReports = true) {
    const zip = new JSZip();

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

    // --- Process sets: extract images to files (one at a time, yielding) ---
    const prepTotal = sets.length + patients.length;
    let prepDone = 0;
    for (const set of sets) {
        showBackupProgress(`Preparazione set: ${set.name || set.id}`, (prepDone / Math.max(1, prepTotal)) * 50);
        _addSetToZip(zip, set);
        prepDone++;
        await _yieldToUI();
    }

    // --- Process patients: extract photos ---
    const patientsFolder = zip.folder('patients');
    const patientPhotosFolder = zip.folder('images/patients');

    for (const patient of patients) {
        showBackupProgress(`Preparazione paziente: ${patient.name || patient.id}`, (prepDone / Math.max(1, prepTotal)) * 50);
        const pClone = { ...patient };
        const pSlug = sanitizeFilename(patient.id);

        if (pClone.photo && pClone.photo.startsWith('data:')) {
            const parsed = parseDataUrl(pClone.photo);
            if (parsed) {
                const photoName = `${pSlug}.${parsed.ext}`;
                patientPhotosFolder.file(photoName, parsed.base64, { base64: true });
                pClone.photo = `images/patients/${photoName}`;
            }
        }

        patientsFolder.file(`${pSlug}.json`, JSON.stringify(pClone, null, 2));
        prepDone++;
        await _yieldToUI();
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
                tagImagesFolder.file(tagFileName, parsed.base64, { base64: true });
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

    // streamFiles processes entries one at a time instead of holding the whole
    // archive uncompressed in memory; level 1 is much faster and base64 image
    // data barely compresses better at higher levels.
    return await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 }, streamFiles: true },
        (meta) => {
            showBackupProgress(`Compressione backup... ${Math.round(meta.percent)}%`, 50 + meta.percent / 2);
        }
    );
}


// --- Full backup: opens selective export modal ---
window.exportAllSets = async () => {
    try {
        // Reuse in-memory state when available: DB.getAllSets() would create a
        // second full copy of every (image-heavy) set in memory.
        const sets = (state.savedSets && state.savedSets.length) ? state.savedSets : await DB.getAllSets();
        const patients = (state.patients && state.patients.length) ? state.patients : await DB.getAllPatients();

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

        showBackupProgress('Preparazione backup...', 0);
        const zipBlob = await buildBackupZip(sets, patients, includeConfig, includeReports);
        hideBackupProgress();
        await downloadFile(zipBlob, filename, 'Backup Terapia Attiva');

        document.getElementById('modal-export-select').classList.remove('open');
        window._exportData = null;
    } catch (e) {
        hideBackupProgress();
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
    _addSetToZip(zip, set);

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
                    tagImagesFolder.file(tagFileName, parsed.base64, { base64: true });
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

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 }, streamFiles: true });
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
        hideBackupProgress();
        console.error(err);
        alert("Errore importazione: " + err.message);
    }
};

// Import from ZIP file
async function importFromZip(file) {
    showBackupProgress('Lettura archivio...', 0);
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

    const patientFiles = [];
    const patientsDir = zip.folder('patients');
    if (patientsDir) {
        patientsDir.forEach((relativePath, zipEntry) => {
            if (relativePath.endsWith('.json')) patientFiles.push(zipEntry);
        });
    }

    const importTotal = setFiles.length + patientFiles.length;
    let importDone = 0;

    // Sets are processed and saved one at a time so only a single set's images
    // are ever held decompressed in memory.
    for (const entry of setFiles) {
        showBackupProgress(`Importazione set ${importDone + 1}/${importTotal}...`, (importDone / Math.max(1, importTotal)) * 100);
        const setData = JSON.parse(await entry.async('text'));

        // Rehydrate item images from ZIP (base64 straight from JSZip, no binary round trips)
        for (const item of setData.items) {
            if (item.url && !item.url.startsWith('data:') && !item.url.startsWith('http')) {
                item.url = (await zipEntryToDataUrl(zip, item.url)) || item.url;
            }
            if (item.audio && !item.audio.startsWith('data:')) {
                item.audio = (await zipEntryToDataUrl(zip, item.audio)) || item.audio;
            }
            // Rehydrate variant images
            if (item.variantUrls && typeof item.variantUrls === 'object') {
                for (const [vIdx, vPath] of Object.entries(item.variantUrls)) {
                    if (vPath && !vPath.startsWith('data:') && !vPath.startsWith('http')) {
                        item.variantUrls[vIdx] = (await zipEntryToDataUrl(zip, vPath)) || vPath;
                    }
                }
            }
        }

        if (setData.id) {
            if (localSetsMap[setData.id]) {
                const merged = mergeSets(localSetsMap[setData.id], setData);
                await DB.saveSet(merged);
                // Replace the in-memory reference so subsequent merges don't
                // keep the old (image-heavy) version alive.
                localSetsMap[setData.id] = merged;
                setsUpdated++;
            } else {
                await DB.saveSet(setData);
                setsAdded++;
            }
        }
        importDone++;
        await _yieldToUI();
    }

    // --- Import patients ---
    for (const entry of patientFiles) {
        showBackupProgress(`Importazione pazienti ${importDone + 1}/${importTotal}...`, (importDone / Math.max(1, importTotal)) * 100);
        const pData = JSON.parse(await entry.async('text'));

        // Rehydrate patient photo
        if (pData.photo && !pData.photo.startsWith('data:') && !pData.photo.startsWith('http')) {
            pData.photo = (await zipEntryToDataUrl(zip, pData.photo)) || pData.photo;
        }

        if (pData.id) {
            if (localPatientsMap[pData.id]) {
                const merged = mergePatients(localPatientsMap[pData.id], pData);
                await DB.savePatient(merged);
                localPatientsMap[pData.id] = merged;
                patientsUpdated++;
            } else {
                await DB.savePatient(pData);
                patientsAdded++;
            }
        }
        importDone++;
        await _yieldToUI();
    }

    // --- Import config ---
    showBackupProgress('Importazione configurazione...', 95);
    const configDir = zip.folder('config');

    // Tag images
    const tagMapFile = configDir ? configDir.file('tagImageMap.json') : null;
    if (tagMapFile) {
        const tagImageMap = JSON.parse(await tagMapFile.async('text'));
        const existing = getAllTagImages();
        for (const [tag, path] of Object.entries(tagImageMap)) {
            const dataUrl = await zipEntryToDataUrl(zip, path);
            if (dataUrl) existing[tag] = dataUrl;
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
    hideBackupProgress();
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
    // Shallow clone: item objects are replaced (not mutated) below, so sharing
    // references with `local` is safe and avoids duplicating base64 images.
    const merged = { ...local, items: [...(local.items || [])], tags: [...(local.tags || [])], modes: [...(local.modes || [])] };
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
    const merged = { ...local, history: [...(local.history || [])] };
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

    // Merge date-keyed maps (existing local entries win on conflict)
    ['dailyNotes', 'outlierDays', 'dayTags', 'criterionOverrides'].forEach(field => {
        if (incoming[field] && typeof incoming[field] === 'object') {
            merged[field] = { ...incoming[field], ...(merged[field] || {}) };
        }
    });
    if (!merged.photo && incoming.photo) merged.photo = incoming.photo;
    return merged;
}

function mergeActivityLayout(incoming) {
    // Full replace: restore the exact layout structure (groups, ordering, icons, colors)
    // from the backup, preserving any local custom modes not present in backup
    const local = getActivityLayout();
    const result = JSON.parse(JSON.stringify(incoming));

    // Ensure required fields exist
    if (!result.groups) result.groups = local.groups;
    if (!result.customModes) result.customModes = {};
    if (!result.modeEmojis) result.modeEmojis = {};

    // Preserve local custom modes not in backup
    if (local.customModes) {
        for (const [k, v] of Object.entries(local.customModes)) {
            if (!result.customModes[k]) {
                result.customModes[k] = v;
                const inAnyGroup = (result.groups || []).some(g => (g.modes || []).includes(k));
                if (!inAnyGroup && result.groups && result.groups.length > 0) {
                    result.groups[0].modes.push(k);
                }
            }
        }
    }

    saveActivityLayout(result);
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
