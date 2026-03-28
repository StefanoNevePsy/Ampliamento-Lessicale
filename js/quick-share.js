// === QUICK SHARE: Universal sharing via Nearby Share / Quick Share ===
// Uses the Web Share API to trigger native OS sharing (Nearby Share on Android, AirDrop on iOS/Mac)
// Works offline and is extremely fast for device-to-device transfers

// --- Feature detection ---
function isQuickShareAvailable() {
    // Capacitor native: always available via Filesystem + Share plugins
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        return !!(window.Capacitor.Plugins && window.Capacitor.Plugins.Share);
    }
    // Web: check Web Share API with file support
    if (!navigator.share) return false;
    if (!navigator.canShare) return true; // canShare may not exist but share may still work
    try {
        const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
        return navigator.canShare({ files: [testFile] });
    } catch { return false; }
}

// --- Core share function ---
async function quickShareFile(blob, filename, title) {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    // Method 1: Web Share API with file support
    if (navigator.share) {
        try {
            const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                await navigator.share({ title, files: [file] });
                return;
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.warn('Quick Share: Web Share API failed:', e.message);
        }
        // Retry with generic MIME type (some Android versions reject custom types)
        try {
            const genericBlob = new Blob([blob], { type: 'application/octet-stream' });
            const genericFile = new File([genericBlob], filename, { type: 'application/octet-stream' });
            await navigator.share({ title, files: [genericFile] });
            return;
        } catch (e2) {
            if (e2.name === 'AbortError') return;
            console.warn('Quick Share: generic MIME fallback failed:', e2.message);
        }
    }

    // Method 2: Capacitor Filesystem + Share plugins (Android native)
    if (isNative && window.Capacitor.Plugins) {
        const FS = window.Capacitor.Plugins.Filesystem;
        if (FS) {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const written = await FS.writeFile({ path: filename, data: btoa(binary), directory: 'CACHE' });

                const SharePlugin = window.Capacitor.Plugins.Share;
                if (SharePlugin) {
                    await SharePlugin.share({
                        title: title || filename,
                        url: written.uri,
                        dialogTitle: title || 'Condividi'
                    });
                    return;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('Quick Share: Capacitor share fallback failed:', e);
            }
        }
    }

    // Method 3: <a> download fallback (desktop browsers)
    _quickShareFallbackDownload(blob, filename);
}

// --- Fallback: classic download for unsupported browsers ---
function _quickShareFallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// --- Open Quick Share Hub ---
window.openQuickShare = () => {
    document.getElementById('modal-quick-share').style.display = 'flex';
    document.getElementById('qs-hub').style.display = '';
    document.getElementById('qs-select-panel').style.display = 'none';
    document.getElementById('qs-progress-panel').style.display = 'none';
};

window.closeQuickShare = () => {
    document.getElementById('modal-quick-share').style.display = 'none';
};

// --- Quick Share: Patient ---
window.quickSharePatientSelect = async () => {
    document.getElementById('qs-hub').style.display = 'none';
    document.getElementById('qs-select-panel').style.display = '';

    const patients = await DB.getAllPatients();
    let html = '<p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;"><i class="fa-solid fa-user-group"></i> Seleziona pazienti da condividere:</p>';

    if (patients.length === 0) {
        html += '<p style="text-align:center; color:#888; padding:20px;">Nessun paziente registrato.</p>';
    } else {
        html += '<label style="display:flex; align-items:center; gap:8px; padding:8px; cursor:pointer; color:var(--accent-color); font-size:0.85rem; margin-bottom:6px;"><input type="checkbox" id="qs-select-all-patients" onchange="qsToggleAll(this, \'.qs-patient-cb\')"> Seleziona tutti</label>';
        patients.forEach(p => {
            const sessions = (p.history || []).length;
            const photoHtml = p.photo
                ? `<img src="${p.photo}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:32px; height:32px; border-radius:50%; background:rgba(99,102,241,0.15); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-user" style="color:var(--accent-color); font-size:0.7rem;"></i></div>`;
            html += `
            <label style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; cursor:pointer; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); margin-bottom:4px;">
                <input type="checkbox" class="qs-patient-cb" data-id="${p.id}">
                ${photoHtml}
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.85rem;">${p.name}</div>
                    <div style="font-size:0.7rem; color:#888;">${sessions} sessioni</div>
                </div>
            </label>`;
        });
    }

    document.getElementById('qs-select-list').innerHTML = html;
    document.getElementById('qs-select-action').onclick = () => _executeQuickSharePatients();
    document.getElementById('qs-select-title').textContent = 'Pazienti';
};

// --- Quick Share: Sets ---
window.quickShareSetSelect = async () => {
    document.getElementById('qs-hub').style.display = 'none';
    document.getElementById('qs-select-panel').style.display = '';

    const sets = await DB.getAllSets();
    let html = '<p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;"><i class="fa-solid fa-folder-tree"></i> Seleziona set da condividere:</p>';

    if (sets.length === 0) {
        html += '<p style="text-align:center; color:#888; padding:20px;">Nessun set presente.</p>';
    } else {
        html += '<label style="display:flex; align-items:center; gap:8px; padding:8px; cursor:pointer; color:var(--accent-color); font-size:0.85rem; margin-bottom:6px;"><input type="checkbox" id="qs-select-all-sets" onchange="qsToggleAll(this, \'.qs-set-cb\')"> Seleziona tutti</label>';
        sets.forEach(s => {
            const itemCount = (s.items || []).length;
            html += `
            <label style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; cursor:pointer; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); margin-bottom:4px;">
                <input type="checkbox" class="qs-set-cb" data-id="${s.id}">
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.85rem;">${s.name}</div>
                    <div style="font-size:0.7rem; color:#888;">${s.category || ''} · ${itemCount} items</div>
                </div>
            </label>`;
        });
    }

    document.getElementById('qs-select-list').innerHTML = html;
    document.getElementById('qs-select-action').onclick = () => _executeQuickShareSets();
    document.getElementById('qs-select-title').textContent = 'Set';
};

// --- Quick Share: Full Backup ---
window.quickShareFullBackup = async () => {
    document.getElementById('qs-hub').style.display = 'none';
    document.getElementById('qs-progress-panel').style.display = '';
    _qsProgress('Preparazione backup completo...', 20);

    try {
        const sets = await DB.getAllSets();
        const patients = await DB.getAllPatients();
        _qsProgress('Creazione archivio ZIP...', 50);

        const zipBlob = await buildBackupZip(sets, patients, true, true);
        _qsProgress('Pronto per la condivisione!', 90);

        const filename = getTimestampedFilename('zip');
        await quickShareFile(zipBlob, filename, 'Terapia Attiva - Backup Completo');
        _qsProgress('Condiviso con successo!', 100, true);
    } catch (e) {
        if (e.name === 'AbortError') {
            _qsProgress('Condivisione annullata.', 0, false, true);
        } else {
            _qsProgress('Errore: ' + e.message, 0, false, true);
        }
    }
};

// --- Quick Share: Single patient (direct from dashboard) ---
window.quickSharePatientDirect = async (pid) => {
    const p = state.patients.find(x => x.id === pid);
    if (!p) return alert('Paziente non trovato.');

    const payload = {
        type: 'tashare',
        version: 1,
        timestamp: new Date().toISOString(),
        patient: {
            id: p.id, name: p.name, category: p.category || '',
            photo: p.photo || '', history: p.history || [],
            dailyNotes: p.dailyNotes || {}
        }
    };

    try {
        const reports = JSON.parse(localStorage.getItem('ai_reports_' + pid) || '[]');
        if (reports.length > 0) payload.reports = reports;
    } catch (e) { /* ignore */ }

    const json = JSON.stringify(payload);
    const compressed = pako.deflate(json);
    const blob = new Blob([compressed], { type: 'application/octet-stream' });
    const fileName = `${p.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ ]/g, '_')}_${new Date().toISOString().split('T')[0]}.tashare`;

    try {
        await quickShareFile(blob, fileName, `Paziente: ${p.name}`);
    } catch (e) {
        if (e.name !== 'AbortError') alert('Errore condivisione: ' + e.message);
    }
};

// --- Quick Share: Single set (direct from library) ---
window.quickShareSetDirect = async (setId) => {
    const set = state.savedSets.find(s => s.id === setId);
    if (!set) return;

    try {
        // Build mini ZIP for this set
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

        // Tag images
        if (set.tags && set.tags.length > 0 && typeof getAllTagImages === 'function') {
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
                zip.file('tagImageMap.json', JSON.stringify(tagImageMap));
            }
        }

        const manifest = { version: 6, format: 'zip', timestamp: new Date().toISOString(), setCount: 1, patientCount: 0 };
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const filename = `Set_${set.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;

        await quickShareFile(zipBlob, filename, `Set: ${set.name}`);
    } catch (e) {
        if (e.name !== 'AbortError') alert('Errore condivisione: ' + e.message);
    }
};

// --- Execute: share selected patients ---
async function _executeQuickSharePatients() {
    const checked = document.querySelectorAll('.qs-patient-cb:checked');
    if (checked.length === 0) return alert('Seleziona almeno un paziente.');

    document.getElementById('qs-select-panel').style.display = 'none';
    document.getElementById('qs-progress-panel').style.display = '';

    try {
        if (checked.length === 1) {
            // Single patient: share as .tashare
            const pid = checked[0].dataset.id;
            _qsProgress('Preparazione dati paziente...', 30);
            const p = state.patients.find(x => x.id === pid);
            if (!p) throw new Error('Paziente non trovato.');

            const payload = {
                type: 'tashare', version: 1, timestamp: new Date().toISOString(),
                patient: { id: p.id, name: p.name, category: p.category || '', photo: p.photo || '', history: p.history || [], dailyNotes: p.dailyNotes || {} }
            };
            try {
                const reports = JSON.parse(localStorage.getItem('ai_reports_' + pid) || '[]');
                if (reports.length > 0) payload.reports = reports;
            } catch (e) { /* ignore */ }

            const compressed = pako.deflate(JSON.stringify(payload));
            const blob = new Blob([compressed], { type: 'application/octet-stream' });
            const fileName = `${p.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ ]/g, '_')}_${new Date().toISOString().split('T')[0]}.tashare`;

            _qsProgress('Pronto!', 80);
            await quickShareFile(blob, fileName, `Paziente: ${p.name}`);
            _qsProgress('Condiviso!', 100, true);
        } else {
            // Multiple patients: share as ZIP backup
            const pids = new Set();
            checked.forEach(cb => pids.add(cb.dataset.id));
            const patients = state.patients.filter(p => pids.has(p.id));

            _qsProgress(`Preparazione ${patients.length} pazienti...`, 30);
            const zipBlob = await buildBackupZip([], patients, false, true);

            _qsProgress('Pronto!', 80);
            const filename = `Pazienti_${patients.length}_${new Date().toISOString().split('T')[0]}.zip`;
            await quickShareFile(zipBlob, filename, `${patients.length} Pazienti`);
            _qsProgress('Condiviso!', 100, true);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            _qsProgress('Condivisione annullata.', 0, false, true);
        } else {
            _qsProgress('Errore: ' + e.message, 0, false, true);
        }
    }
}

// --- Execute: share selected sets ---
async function _executeQuickShareSets() {
    const checked = document.querySelectorAll('.qs-set-cb:checked');
    if (checked.length === 0) return alert('Seleziona almeno un set.');

    document.getElementById('qs-select-panel').style.display = 'none';
    document.getElementById('qs-progress-panel').style.display = '';

    try {
        const setIds = new Set();
        checked.forEach(cb => setIds.add(cb.dataset.id));
        const sets = state.savedSets.filter(s => setIds.has(s.id));

        _qsProgress(`Preparazione ${sets.length} set...`, 30);
        const zipBlob = await buildBackupZip(sets, [], false, false);

        _qsProgress('Pronto!', 80);
        const filename = sets.length === 1
            ? `Set_${sets[0].name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`
            : `Set_${sets.length}_${new Date().toISOString().split('T')[0]}.zip`;
        const title = sets.length === 1 ? `Set: ${sets[0].name}` : `${sets.length} Set`;

        await quickShareFile(zipBlob, filename, title);
        _qsProgress('Condiviso!', 100, true);
    } catch (e) {
        if (e.name === 'AbortError') {
            _qsProgress('Condivisione annullata.', 0, false, true);
        } else {
            _qsProgress('Errore: ' + e.message, 0, false, true);
        }
    }
}

// --- Toggle all checkboxes ---
window.qsToggleAll = (masterCb, selector) => {
    document.querySelectorAll(selector).forEach(cb => cb.checked = masterCb.checked);
};

// --- Progress helper ---
function _qsProgress(text, pct, success, error) {
    const bar = document.getElementById('qs-progress-bar');
    const txt = document.getElementById('qs-progress-text');
    const icon = document.getElementById('qs-progress-icon');

    if (bar) bar.style.width = pct + '%';
    if (success) {
        bar.style.background = 'var(--success-color)';
        icon.innerHTML = '<i class="fa-solid fa-circle-check" style="font-size:3rem; color:var(--success-color);"></i>';
    } else if (error) {
        bar.style.background = 'var(--danger-color)';
        icon.innerHTML = '<i class="fa-solid fa-circle-xmark" style="font-size:3rem; color:var(--danger-color);"></i>';
    } else {
        bar.style.background = 'var(--accent-color)';
        icon.innerHTML = '<i class="fa-solid fa-share-from-square" style="font-size:3rem; color:var(--accent-color); animation:pulse 1.5s infinite;"></i>';
    }
    if (txt) txt.textContent = text;
}
