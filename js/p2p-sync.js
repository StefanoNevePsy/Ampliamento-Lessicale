// === P2P SYNC via PeerJS + QR Code ===
// Direct device-to-device set transfer over WebRTC

let _p2pPeer = null;
let _p2pConn = null;
let _p2pScanner = null;
let _p2pSelectData = null; // holds loaded data for checklist

// ICE servers for reliable WebRTC connections
const P2P_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
];

function createPeer(id) {
    const opts = { config: { iceServers: P2P_ICE_SERVERS } };
    return id ? new Peer(id, opts) : new Peer(opts);
}

// Generate short random ID
function generateSyncId() {
    return 'sc-' + Math.random().toString(36).substring(2, 8);
}

// Format bytes to human-readable
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Open the P2P sync modal
window.openP2PSync = () => {
    document.getElementById('modal-p2p-sync').style.display = 'flex';
    document.getElementById('p2p-role-select').style.display = '';
    document.getElementById('p2p-select-panel').style.display = 'none';
    document.getElementById('p2p-sender-panel').style.display = 'none';
    document.getElementById('p2p-receiver-panel').style.display = 'none';
    document.getElementById('p2p-progress-panel').style.display = 'none';
    _p2pSelectData = null;
    cleanupP2P();
};

window.closeP2PSync = () => {
    cleanupP2P();
    _p2pSelectData = null;
    document.getElementById('modal-p2p-sync').style.display = 'none';
};

window.backToP2PRoleSelect = () => {
    document.getElementById('p2p-select-panel').style.display = 'none';
    document.getElementById('p2p-role-select').style.display = '';
    _p2pSelectData = null;
};

function cleanupP2P() {
    if (_p2pScanner) {
        try { _p2pScanner.stop(); } catch (e) { /* ignore */ }
        _p2pScanner = null;
    }
    if (_p2pConn) {
        try { _p2pConn.close(); } catch (e) { /* ignore */ }
        _p2pConn = null;
    }
    if (_p2pPeer) {
        try { _p2pPeer.destroy(); } catch (e) { /* ignore */ }
        _p2pPeer = null;
    }
}

// ===============================
// SELECTIVE SEND - CHECKLIST
// ===============================
window.openP2PSendSelect = async () => {
    document.getElementById('p2p-role-select').style.display = 'none';
    document.getElementById('p2p-select-panel').style.display = '';

    const sets = await DB.getAllSets();
    const patients = await DB.getAllPatients();
    _p2pSelectData = { sets, patients };

    // Group sets by category
    const catMap = {};
    sets.forEach(s => {
        const cat = s.category || 'Altri';
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(s);
    });

    let html = '';

    // --- SETS ---
    html += `
    <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:10px; margin-bottom:8px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:bold; font-size:0.9rem; margin-bottom:6px;">
            <input type="checkbox" id="p2p-all-sets" checked onchange="toggleP2PSection('sets', this.checked)" style="width:16px; height:16px;">
            <i class="fa-solid fa-layer-group"></i> Set (${sets.length})
        </label>
        <div id="p2p-sets-list" style="padding-left:16px; max-height:150px; overflow-y:auto;">`;

    for (const [cat, catSets] of Object.entries(catMap).sort()) {
        html += `
        <div style="margin-bottom:4px;">
            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.8rem; color:var(--text-secondary); font-weight:bold;">
                <input type="checkbox" class="p2p-set-cat" data-cat="${cat}" checked onchange="toggleP2PCat('${cat}', this.checked)" style="width:14px; height:14px;">
                ${cat} (${catSets.length})
            </label>
            <div style="padding-left:14px;">`;
        catSets.forEach(s => {
            const sizeEst = formatBytes(JSON.stringify(s).length);
            html += `<label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.75rem; padding:1px 0;">
                <input type="checkbox" class="p2p-set-item" data-id="${s.id}" checked onchange="updateP2PSizeEstimate()" style="width:13px; height:13px;">
                ${s.name} <span style="opacity:0.4;">(${sizeEst})</span>
            </label>`;
        });
        html += `</div></div>`;
    }
    html += `</div></div>`;

    // --- PATIENTS ---
    html += `
    <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:10px; margin-bottom:8px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:bold; font-size:0.9rem; margin-bottom:6px;">
            <input type="checkbox" id="p2p-all-patients" checked onchange="toggleP2PSection('patients', this.checked)" style="width:16px; height:16px;">
            <i class="fa-solid fa-user-doctor"></i> Pazienti (${patients.length})
        </label>
        <div id="p2p-patients-list" style="padding-left:16px; max-height:120px; overflow-y:auto;">`;
    patients.forEach(p => {
        const sessions = (p.history || []).length;
        const sizeEst = formatBytes(JSON.stringify(p).length);
        html += `<label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.75rem; padding:1px 0;">
            <input type="checkbox" class="p2p-patient-item" data-id="${p.id}" checked onchange="updateP2PSizeEstimate()" style="width:13px; height:13px;">
            ${p.name || 'Senza nome'} <span style="opacity:0.4;">(${sessions} sess., ${sizeEst})</span>
        </label>`;
    });
    html += `</div></div>`;

    // --- CONFIG ---
    html += `
    <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:10px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:bold; font-size:0.9rem;">
            <input type="checkbox" id="p2p-config" checked onchange="updateP2PSizeEstimate()" style="width:16px; height:16px;">
            <i class="fa-solid fa-sliders"></i> Configurazione (tag, quaderno, layout)
        </label>
    </div>`;

    document.getElementById('p2p-select-body').innerHTML = html;
    updateP2PSizeEstimate();
};

window.toggleP2PSection = (section, checked) => {
    const selector = section === 'sets' ? '.p2p-set-item, .p2p-set-cat' : '.p2p-patient-item';
    document.querySelectorAll(selector).forEach(cb => { cb.checked = checked; });
    updateP2PSizeEstimate();
};

window.toggleP2PCat = (cat, checked) => {
    document.querySelectorAll('.p2p-set-item').forEach(cb => {
        const setId = cb.dataset.id;
        const s = _p2pSelectData.sets.find(x => x.id === setId);
        if (s && (s.category || 'Altri') === cat) cb.checked = checked;
    });
    updateP2PSizeEstimate();
};

window.updateP2PSizeEstimate = () => {
    if (!_p2pSelectData) return;

    const selectedSetIds = new Set();
    document.querySelectorAll('.p2p-set-item:checked').forEach(cb => selectedSetIds.add(cb.dataset.id));
    const selectedPatientIds = new Set();
    document.querySelectorAll('.p2p-patient-item:checked').forEach(cb => selectedPatientIds.add(cb.dataset.id));
    const includeConfig = document.getElementById('p2p-config').checked;

    // Calculate size
    let totalSize = 0;
    const selectedSets = _p2pSelectData.sets.filter(s => selectedSetIds.has(s.id));
    const selectedPatients = _p2pSelectData.patients.filter(p => selectedPatientIds.has(p.id));
    totalSize += JSON.stringify(selectedSets).length;
    totalSize += JSON.stringify(selectedPatients).length;
    if (includeConfig) {
        totalSize += JSON.stringify(getAllTagImages()).length;
        totalSize += JSON.stringify(getSavedQuadernoLists()).length;
        totalSize += JSON.stringify(getRecentSessionNames()).length;
    }

    const sizeStr = formatBytes(totalSize);
    const infoEl = document.getElementById('p2p-size-info');

    // Estimate compressed size (~20-30% of original for JSON with base64 images)
    const compressCheckbox = document.getElementById('p2p-compress');
    const willCompress = compressCheckbox ? compressCheckbox.checked : false;
    const estCompressedSize = Math.round(totalSize * 0.25); // conservative estimate
    const effectiveSize = willCompress ? estCompressedSize : totalSize;

    let speedNote = '';
    if (effectiveSize > 50 * 1024 * 1024) {
        speedNote = `<div style="margin-top:6px; color:var(--warning-color);"><i class="fa-solid fa-triangle-exclamation"></i> Dati molto grandi. Per trasferimenti &gt;50 MB consigliamo l'esportazione file (Backup) e condivisione manuale.</div>`;
    } else if (effectiveSize > 10 * 1024 * 1024) {
        speedNote = `<div style="margin-top:6px; color:#f59e0b;"><i class="fa-solid fa-info-circle"></i> Trasferimento di ~${formatBytes(effectiveSize)}: potrebbe richiedere qualche minuto via P2P.</div>`;
    }

    let compressNote = '';
    if (willCompress) {
        compressNote = ` <span style="color:var(--success-color); font-size:0.75rem;">(<i class="fa-solid fa-compress"></i> ~${formatBytes(estCompressedSize)} compressi)</span>`;
    }

    infoEl.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Dimensione stimata: <b>${sizeStr}</b>${compressNote}${speedNote}`;
};

// ===============================
// SENDER FLOW
// ===============================
window.startP2PSendSelected = async () => {
    if (!_p2pSelectData) return;

    // Build payload from checklist selections
    const selectedSetIds = new Set();
    document.querySelectorAll('.p2p-set-item:checked').forEach(cb => selectedSetIds.add(cb.dataset.id));
    const selectedPatientIds = new Set();
    document.querySelectorAll('.p2p-patient-item:checked').forEach(cb => selectedPatientIds.add(cb.dataset.id));
    const includeConfig = document.getElementById('p2p-config').checked;

    const sets = _p2pSelectData.sets.filter(s => selectedSetIds.has(s.id));
    const patients = _p2pSelectData.patients.filter(p => selectedPatientIds.has(p.id));

    if (sets.length === 0 && patients.length === 0 && !includeConfig) {
        alert('Seleziona almeno un elemento da inviare.');
        return;
    }

    const payload = {
        type: 'sync',
        version: 5,
        sets: sets,
        patients: patients
    };

    if (includeConfig) {
        payload.tagImages = getAllTagImages();
        payload.quadernoLists = getSavedQuadernoLists();
        payload.sessionNames = getRecentSessionNames();
        payload.activityLayout = getActivityLayout();
    }

    startP2PSendWithPayload(payload);
};

// Direct send for single set (from library card)
window.startP2PSend = async (mode) => {
    let payload;
    if (mode === 'all') {
        // This path is kept for backward compatibility but normally goes through checklist
        const sets = await DB.getAllSets();
        const patients = await DB.getAllPatients();
        payload = {
            type: 'sync',
            version: 5,
            sets: sets,
            patients: patients,
            tagImages: getAllTagImages(),
            quadernoLists: getSavedQuadernoLists(),
            sessionNames: getRecentSessionNames()
        };
    } else {
        // Single set
        const set = state.savedSets.find(s => s.id === mode);
        if (!set) { alert('Set non trovato'); return; }
        const setTagImages = {};
        if (set.tags && set.tags.length > 0) {
            const allImgs = getAllTagImages();
            set.tags.forEach(t => {
                const key = t.toLowerCase().trim();
                if (allImgs[key]) setTagImages[key] = allImgs[key];
            });
        }
        payload = {
            type: 'sync',
            version: 5,
            singleSet: true,
            sets: [set],
            tagImages: Object.keys(setTagImages).length > 0 ? setTagImages : undefined
        };
    }
    startP2PSendWithPayload(payload);
};

function startP2PSendWithPayload(payload, forceCompress) {
    document.getElementById('p2p-role-select').style.display = 'none';
    document.getElementById('p2p-select-panel').style.display = 'none';
    document.getElementById('p2p-sender-panel').style.display = '';
    document.getElementById('p2p-sender-status').textContent = 'Preparazione dati...';
    document.getElementById('p2p-qr-container').innerHTML = '';
    document.getElementById('p2p-sender-code').textContent = '';

    // Check compression preference
    const compressCheckbox = document.getElementById('p2p-compress');
    const useCompression = forceCompress !== undefined ? forceCompress : (compressCheckbox ? compressCheckbox.checked : false);

    const json = JSON.stringify(payload);
    const originalSize = json.length;
    let sendData, compressed = false, compressedSize = 0;

    if (useCompression && typeof pako !== 'undefined') {
        try {
            const uint8 = pako.deflate(json);
            compressedSize = uint8.length;
            // Convert to base64 for safe transfer over WebRTC data channel
            const binStr = Array.from(uint8, b => String.fromCharCode(b)).join('');
            sendData = btoa(binStr);
            compressed = true;
        } catch (e) {
            console.warn('Compression failed, sending uncompressed:', e);
            sendData = json;
        }
    } else {
        sendData = json;
    }

    const syncId = generateSyncId();

    try {
        _p2pPeer = createPeer(syncId);
    } catch (e) {
        document.getElementById('p2p-sender-status').textContent = 'Errore: PeerJS non disponibile. Verifica la connessione internet.';
        return;
    }

    _p2pPeer.on('open', (id) => {
        let sizeInfo = formatBytes(originalSize);
        if (compressed) {
            const ratio = Math.round((1 - compressedSize / originalSize) * 100);
            sizeInfo = `${formatBytes(compressedSize)} (compressi da ${formatBytes(originalSize)}, -${ratio}%)`;
        }
        document.getElementById('p2p-sender-status').innerHTML = `In attesa di connessione... (${sizeInfo})<br><span style="font-size:0.75rem; opacity:0.6;">L'altro dispositivo deve scansionare il QR o inserire il codice.</span>`;
        document.getElementById('p2p-sender-code').textContent = id;

        // Generate QR code
        const qrContainer = document.getElementById('p2p-qr-container');
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: id,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff'
            });
        }
    });

    _p2pPeer.on('connection', (conn) => {
        _p2pConn = conn;
        document.getElementById('p2p-sender-status').textContent = 'Dispositivo connesso! Invio dati...';

        conn.on('open', () => {
            const chunkSize = 64 * 1024; // 64KB chunks
            const totalChunks = Math.ceil(sendData.length / chunkSize);

            conn.send({ type: 'meta', totalChunks: totalChunks, totalSize: sendData.length, compressed: compressed });

            for (let i = 0; i < totalChunks; i++) {
                conn.send({ type: 'chunk', index: i, data: sendData.substring(i * chunkSize, (i + 1) * chunkSize) });
            }

            conn.send({ type: 'done' });
            let doneMsg = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> Dati inviati con successo!';
            if (compressed) {
                const ratio = Math.round((1 - compressedSize / originalSize) * 100);
                doneMsg += ` <span style="font-size:0.75rem; opacity:0.6;">(compressi -${ratio}%)</span>`;
            }
            document.getElementById('p2p-sender-status').innerHTML = doneMsg;
        });

        conn.on('error', (err) => {
            document.getElementById('p2p-sender-status').textContent = 'Errore connessione: ' + err.message;
        });
    });

    _p2pPeer.on('error', (err) => {
        let msg = 'Errore: ' + err.message;
        if (err.type === 'network' || err.type === 'server-error') {
            msg += '\n\nIl server di segnalazione non è raggiungibile. Verifica la connessione internet.';
        }
        document.getElementById('p2p-sender-status').textContent = msg;
    });
}

// ===============================
// RECEIVER FLOW
// ===============================
window.startP2PReceive = () => {
    document.getElementById('p2p-role-select').style.display = 'none';
    document.getElementById('p2p-receiver-panel').style.display = '';
    document.getElementById('p2p-receiver-status').textContent = 'Scansiona il QR code o inserisci il codice manualmente.';
    document.getElementById('p2p-manual-code').value = '';
};

window.connectToSender = (code) => {
    if (!code || code.trim().length === 0) {
        alert('Inserisci un codice valido.');
        return;
    }
    code = code.trim();
    performReceive(code);
};

window.startQRScan = () => {
    const scanArea = document.getElementById('p2p-qr-scan-area');
    scanArea.style.display = '';
    document.getElementById('p2p-receiver-status').textContent = 'Inquadra il QR code con la fotocamera...';

    if (typeof Html5Qrcode === 'undefined') {
        document.getElementById('p2p-receiver-status').textContent = 'Scanner QR non disponibile. Inserisci il codice manualmente.';
        scanArea.style.display = 'none';
        return;
    }

    _p2pScanner = new Html5Qrcode('p2p-qr-reader');
    _p2pScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
            _p2pScanner.stop().then(() => {
                scanArea.style.display = 'none';
                document.getElementById('p2p-manual-code').value = decodedText;
                performReceive(decodedText);
            });
        },
        () => { /* ignore scan errors */ }
    ).catch((err) => {
        document.getElementById('p2p-receiver-status').textContent = 'Errore fotocamera: ' + err + '. Inserisci il codice manualmente.';
        scanArea.style.display = 'none';
    });
};

function performReceive(senderId) {
    document.getElementById('p2p-receiver-status').textContent = 'Connessione a ' + senderId + '...';
    document.getElementById('p2p-receiver-panel').style.display = 'none';
    document.getElementById('p2p-progress-panel').style.display = '';
    document.getElementById('p2p-progress-text').textContent = 'Connessione in corso...';
    document.getElementById('p2p-progress-bar-fill').style.width = '0%';

    try {
        _p2pPeer = createPeer();
    } catch (e) {
        document.getElementById('p2p-progress-text').textContent = 'Errore: PeerJS non disponibile.';
        return;
    }

    _p2pPeer.on('open', () => {
        _p2pConn = _p2pPeer.connect(senderId, { reliable: true });

        let chunks = [];
        let totalChunks = 0;
        let totalSize = 0;

        _p2pConn.on('open', () => {
            document.getElementById('p2p-progress-text').textContent = 'Connesso! Ricezione dati...';
        });

        let isCompressed = false;

        _p2pConn.on('data', async (msg) => {
            if (msg.type === 'meta') {
                totalChunks = msg.totalChunks;
                totalSize = msg.totalSize;
                isCompressed = !!msg.compressed;
                chunks = new Array(totalChunks).fill(null);
                const compressLabel = isCompressed ? ' (compressi)' : '';
                document.getElementById('p2p-progress-text').textContent = `Ricezione: 0/${totalChunks} (${formatBytes(totalSize)}${compressLabel})`;
            } else if (msg.type === 'chunk') {
                chunks[msg.index] = msg.data;
                const received = chunks.filter(c => c !== null).length;
                const pct = Math.round((received / totalChunks) * 100);
                document.getElementById('p2p-progress-bar-fill').style.width = pct + '%';
                document.getElementById('p2p-progress-text').textContent = `Ricezione: ${received}/${totalChunks} (${pct}%)`;
            } else if (msg.type === 'done') {
                document.getElementById('p2p-progress-text').textContent = isCompressed ? 'Decompressione e sincronizzazione...' : 'Sincronizzazione in corso...';
                document.getElementById('p2p-progress-bar-fill').style.width = '100%';

                try {
                    const fullData = chunks.join('');
                    let jsonStr;

                    if (isCompressed && typeof pako !== 'undefined') {
                        const binStr = atob(fullData);
                        const uint8 = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) uint8[i] = binStr.charCodeAt(i);
                        jsonStr = pako.inflate(uint8, { to: 'string' });
                    } else {
                        jsonStr = fullData;
                    }

                    const data = JSON.parse(jsonStr);
                    const result = await mergeReceivedData(data);
                    document.getElementById('p2p-progress-text').innerHTML =
                        `<i class="fa-solid fa-check" style="color:var(--success-color);"></i> ${result}`;
                } catch (err) {
                    document.getElementById('p2p-progress-text').textContent = 'Errore: ' + err.message;
                }
            }
        });

        _p2pConn.on('error', (err) => {
            document.getElementById('p2p-progress-text').textContent = 'Errore connessione: ' + err.message;
        });
    });

    _p2pPeer.on('error', (err) => {
        let msg = 'Errore: ' + err.message;
        if (err.type === 'peer-unavailable') {
            msg = 'Dispositivo non trovato. Verifica che il codice sia corretto e che il mittente sia ancora in attesa.';
        } else if (err.type === 'network' || err.type === 'server-error') {
            msg += '\n\nProblema di rete. Verifica che entrambi i dispositivi siano connessi a internet.';
        }
        document.getElementById('p2p-progress-text').textContent = msg;
    });
}

// Merge received data using existing merge helpers from backup.js
async function mergeReceivedData(data) {
    const localSets = await DB.getAllSets();
    const localPatients = await DB.getAllPatients();
    const localSetsMap = {};
    localSets.forEach(s => { localSetsMap[s.id] = s; });
    const localPatientsMap = {};
    localPatients.forEach(p => { localPatientsMap[p.id] = p; });

    let setsAdded = 0, setsUpdated = 0;
    let patientsAdded = 0, patientsUpdated = 0;

    const incomingSets = data.sets || [];
    const incomingPatients = data.patients || [];

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

    if (data.tagImages && typeof data.tagImages === 'object') {
        const existing = getAllTagImages();
        const merged = { ...existing, ...data.tagImages };
        await DB.importAllTagImages(merged);
        Object.assign(_tagImageCache, merged);
    }
    if (data.quadernoLists && Array.isArray(data.quadernoLists)) {
        const existing = getSavedQuadernoLists();
        const existingNames = new Set(existing.map(l => l.name));
        data.quadernoLists.forEach(l => {
            if (!existingNames.has(l.name)) existing.push(l);
        });
        localStorage.setItem('quadernoLists', JSON.stringify(existing));
    }
    if (data.sessionNames && Array.isArray(data.sessionNames)) {
        const existing = getRecentSessionNames();
        const merged = [...new Set([...existing, ...data.sessionNames])].slice(0, 30);
        localStorage.setItem('sessionNames', JSON.stringify(merged));
    }
    // Import activity layout (same logic as backup import)
    if (data.activityLayout) {
        const local = getActivityLayout();
        if (data.activityLayout.customModes) {
            if (!local.customModes) local.customModes = {};
            for (const [k, v] of Object.entries(data.activityLayout.customModes)) {
                if (!local.customModes[k]) {
                    local.customModes[k] = v;
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

    // Reload state
    state.savedSets = await DB.getAllSets();
    state.patients = await DB.getAllPatients();
    refreshAllTags();
    populateGlobalPatientSelect();
    filterSetsByMode();
    if (document.getElementById('modal-library').classList.contains('open')) {
        renderLibList();
    }

    const parts = [];
    if (setsAdded > 0) parts.push(`${setsAdded} set aggiunti`);
    if (setsUpdated > 0) parts.push(`${setsUpdated} set aggiornati`);
    if (patientsAdded > 0) parts.push(`${patientsAdded} pazienti aggiunti`);
    if (patientsUpdated > 0) parts.push(`${patientsUpdated} pazienti aggiornati`);

    return parts.length > 0 ? parts.join(', ') : 'Nessuna modifica necessaria';
}

// Send a single set via P2P (called from library card)
window.p2pSendSet = (setId) => {
    openP2PSync();
    // Skip role selection, go directly to sender
    startP2PSend(setId);
};
