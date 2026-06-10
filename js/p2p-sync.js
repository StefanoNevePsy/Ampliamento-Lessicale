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

    // Reuse in-memory state when available to avoid materializing a second
    // full copy of the (image-heavy) library from IndexedDB.
    const sets = (state.savedSets && state.savedSets.length) ? state.savedSets : await DB.getAllSets();
    const patients = (state.patients && state.patients.length) ? state.patients : await DB.getAllPatients();
    // Pre-compute item sizes once so the estimate doesn't re-stringify the
    // whole (potentially huge) selection on every checkbox toggle.
    const sizes = {};
    sets.forEach(s => { sizes['set:' + s.id] = JSON.stringify(s).length; });
    patients.forEach(p => { sizes['pat:' + p.id] = JSON.stringify(p).length; });
    _p2pSelectData = { sets, patients, sizes };

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
            const sizeEst = formatBytes(sizes['set:' + s.id]);
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
        const sizeEst = formatBytes(sizes['pat:' + p.id]);
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

    const sizes = _p2pSelectData.sizes || {};
    let totalSize = 0;
    document.querySelectorAll('.p2p-set-item:checked').forEach(cb => { totalSize += sizes['set:' + cb.dataset.id] || 0; });
    document.querySelectorAll('.p2p-patient-item:checked').forEach(cb => { totalSize += sizes['pat:' + cb.dataset.id] || 0; });

    const sizeStr = formatBytes(totalSize);
    const infoEl = document.getElementById('p2p-size-info');

    // Estimate compressed size (~25% of original for JSON with base64 images)
    const estCompressedSize = Math.round(totalSize * 0.25);

    let speedNote = '';
    if (estCompressedSize > 20 * 1024 * 1024) {
        speedNote = `<div style="margin-top:6px; color:#f59e0b;"><i class="fa-solid fa-info-circle"></i> Trasferimento di ~${formatBytes(estCompressedSize)}: potrebbe richiedere qualche minuto. Tieni entrambi i dispositivi attivi e con lo schermo acceso.</div>`;
    }

    infoEl.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> Dimensione stimata: <b>${sizeStr}</b> <span style="color:var(--success-color); font-size:0.75rem;">(<i class="fa-solid fa-compress"></i> ~${formatBytes(estCompressedSize)} compressi)</span>${speedNote}`;
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
        const sets = (state.savedSets && state.savedSets.length) ? state.savedSets : await DB.getAllSets();
        const patients = (state.patients && state.patients.length) ? state.patients : await DB.getAllPatients();
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

// Wait until the WebRTC data channel buffer drains below `max` bytes.
// Without this, sending many chunks in a tight loop overflows the SCTP
// buffer and kills the connection (the main cause of crashes on large data).
function _p2pWaitForBuffer(conn, max) {
    return new Promise((resolve, reject) => {
        const dc = conn.dataChannel;
        if (!dc) return resolve();
        const check = () => {
            if (!conn.open) return reject(new Error('Connessione interrotta durante l\'invio.'));
            if (dc.bufferedAmount <= max) return resolve();
            setTimeout(check, 50);
        };
        check();
    });
}

// Split a payload into independent items so each one can be compressed and
// transferred on its own: peak memory is bounded by the largest single
// set/patient instead of the entire dataset.
function _p2pPayloadToItems(payload) {
    const items = [];
    (payload.sets || []).forEach(s => items.push({ kind: 'set', data: s }));
    (payload.patients || []).forEach(p => items.push({ kind: 'patient', data: p }));
    const config = {};
    ['tagImages', 'quadernoLists', 'sessionNames', 'activityLayout'].forEach(k => {
        if (payload[k] !== undefined) config[k] = payload[k];
    });
    if (Object.keys(config).length > 0) items.push({ kind: 'config', data: config });
    return items;
}

async function _p2pSendItems(conn, items) {
    const statusEl = document.getElementById('p2p-sender-status');
    const CHUNK = 64 * 1024;          // 64KB binary chunks
    const MAX_BUFFERED = 1024 * 1024; // pause when >1MB queued on the channel

    conn.send({ type: 'meta6', totalItems: items.length });

    let sentBytes = 0;
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const json = JSON.stringify(it.data);
        let bytes, compressed = false;
        if (typeof pako !== 'undefined') {
            bytes = pako.deflate(json);
            compressed = true;
        } else {
            bytes = new TextEncoder().encode(json);
        }

        const totalChunks = Math.ceil(bytes.length / CHUNK);
        conn.send({ type: 'item-meta', index: i, kind: it.kind, compressed, totalChunks, size: bytes.length });

        for (let c = 0; c < totalChunks; c++) {
            await _p2pWaitForBuffer(conn, MAX_BUFFERED);
            // .slice() copies, so each chunk's buffer is exactly chunk-sized
            conn.send({ type: 'item-chunk', index: i, chunk: c, data: bytes.slice(c * CHUNK, (c + 1) * CHUNK).buffer });
        }

        sentBytes += bytes.length;
        if (statusEl) statusEl.textContent = `Invio: ${i + 1}/${items.length} elementi (${formatBytes(sentBytes)})...`;
    }

    // Drain completely before 'done' so it isn't lost if the user closes early
    await _p2pWaitForBuffer(conn, 0);
    conn.send({ type: 'done6' });
    if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-check" style="color:var(--success-color);"></i> Dati inviati con successo! (${items.length} elementi, ${formatBytes(sentBytes)})`;
}

function startP2PSendWithPayload(payload) {
    document.getElementById('p2p-role-select').style.display = 'none';
    document.getElementById('p2p-select-panel').style.display = 'none';
    document.getElementById('p2p-sender-panel').style.display = '';
    document.getElementById('p2p-sender-status').textContent = 'Preparazione dati...';
    document.getElementById('p2p-qr-container').innerHTML = '';
    document.getElementById('p2p-sender-code').textContent = '';

    const items = _p2pPayloadToItems(payload);

    const syncId = generateSyncId();

    try {
        _p2pPeer = createPeer(syncId);
    } catch (e) {
        document.getElementById('p2p-sender-status').textContent = 'Errore: PeerJS non disponibile. Verifica la connessione internet.';
        return;
    }

    _p2pPeer.on('open', (id) => {
        document.getElementById('p2p-sender-status').innerHTML = `In attesa di connessione... (${items.length} elementi)<br><span style="font-size:0.75rem; opacity:0.6;">L'altro dispositivo deve scansionare il QR o inserire il codice.</span>`;
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
            _p2pSendItems(conn, items).catch(err => {
                document.getElementById('p2p-sender-status').textContent = 'Errore invio: ' + err.message;
            });
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

window.startQRScan = async () => {
    const scanArea = document.getElementById('p2p-qr-scan-area');
    scanArea.style.display = '';
    document.getElementById('p2p-receiver-status').textContent = 'Richiesta permesso fotocamera...';

    if (typeof Html5Qrcode === 'undefined') {
        document.getElementById('p2p-receiver-status').textContent = 'Scanner QR non disponibile. Inserisci il codice manualmente.';
        scanArea.style.display = 'none';
        return;
    }

    // Request camera permission explicitly (needed for Android/Capacitor)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Permission granted — stop the test stream immediately
        stream.getTracks().forEach(t => t.stop());
    } catch (permErr) {
        console.warn('Camera permission denied:', permErr);
        const msg = permErr.name === 'NotAllowedError'
            ? 'Permesso fotocamera negato. Vai nelle impostazioni dell\'app e abilita il permesso fotocamera, poi riprova.'
            : 'Fotocamera non disponibile: ' + (permErr.message || permErr) + '. Inserisci il codice manualmente.';
        document.getElementById('p2p-receiver-status').textContent = msg;
        scanArea.style.display = 'none';
        return;
    }

    document.getElementById('p2p-receiver-status').textContent = 'Inquadra il QR code con la fotocamera...';

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

        // Legacy protocol (v5) state
        let chunks = [];
        let totalChunks = 0;
        let totalSize = 0;
        let isCompressed = false;

        // Item protocol (v6) state: only one item buffered at a time
        let v6 = null;

        _p2pConn.on('open', () => {
            document.getElementById('p2p-progress-text').textContent = 'Connesso! Ricezione dati...';
        });

        _p2pConn.on('data', async (msg) => {
            const progressText = document.getElementById('p2p-progress-text');
            const progressBar = document.getElementById('p2p-progress-bar-fill');

            // === Item-based protocol (v6) ===
            if (msg.type === 'meta6') {
                // v6 must be assigned synchronously: the first item-meta can
                // arrive while the merge context is still loading from the DB.
                v6 = {
                    totalItems: msg.totalItems,
                    doneItems: 0,
                    current: null,
                    mergeQueue: Promise.resolve(),
                    mergeError: null,
                    ctxPromise: _p2pCreateMergeContext()
                };
                progressText.textContent = `Ricezione: 0/${msg.totalItems} elementi`;
            } else if (msg.type === 'item-meta' && v6) {
                v6.current = {
                    kind: msg.kind,
                    compressed: msg.compressed,
                    totalChunks: msg.totalChunks,
                    size: msg.size,
                    parts: new Array(msg.totalChunks).fill(null),
                    got: 0
                };
            } else if (msg.type === 'item-chunk' && v6 && v6.current) {
                const cur = v6.current;
                if (cur.parts[msg.chunk] === null) cur.got++;
                cur.parts[msg.chunk] = new Uint8Array(msg.data);

                const pct = Math.round(((v6.doneItems + cur.got / cur.totalChunks) / v6.totalItems) * 100);
                progressBar.style.width = pct + '%';
                progressText.textContent = `Ricezione: ${v6.doneItems + 1}/${v6.totalItems} elementi (${pct}%)`;

                if (cur.got >= cur.totalChunks) {
                    // Item complete: reassemble now, then merge through a serial
                    // queue. `current` is cleared synchronously so the next
                    // item-meta (which can arrive while a merge is pending)
                    // isn't clobbered.
                    v6.doneItems++;
                    v6.current = null;

                    const assembled = new Uint8Array(cur.size);
                    let offset = 0;
                    for (const part of cur.parts) { assembled.set(part, offset); offset += part.length; }
                    cur.parts = null;

                    const state6 = v6;
                    state6.mergeQueue = state6.mergeQueue.then(async () => {
                        const jsonStr = cur.compressed
                            ? pako.inflate(assembled, { to: 'string' })
                            : new TextDecoder().decode(assembled);
                        const obj = JSON.parse(jsonStr);
                        await _p2pMergeItem(await state6.ctxPromise, cur.kind, obj);
                    }).catch(err => {
                        state6.mergeError = err;
                        progressText.textContent = 'Errore elaborazione elemento: ' + err.message;
                    });
                }
            } else if (msg.type === 'done6' && v6) {
                progressText.textContent = 'Sincronizzazione in corso...';
                progressBar.style.width = '100%';
                const state6 = v6;
                v6 = null;
                try {
                    await state6.mergeQueue;
                    const result = await _p2pFinalizeMerge(await state6.ctxPromise);
                    progressText.innerHTML = state6.mergeError
                        ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning-color);"></i> ${result} (alcuni elementi non importati: ${state6.mergeError.message})`
                        : `<i class="fa-solid fa-check" style="color:var(--success-color);"></i> ${result}`;
                } catch (err) {
                    progressText.textContent = 'Errore: ' + err.message;
                }

            // === Legacy protocol (v5 and earlier senders) ===
            } else if (msg.type === 'meta') {
                totalChunks = msg.totalChunks;
                totalSize = msg.totalSize;
                isCompressed = !!msg.compressed;
                chunks = new Array(totalChunks).fill(null);
                const compressLabel = isCompressed ? ' (compressi)' : '';
                progressText.textContent = `Ricezione: 0/${totalChunks} (${formatBytes(totalSize)}${compressLabel})`;
            } else if (msg.type === 'chunk') {
                chunks[msg.index] = msg.data;
                const received = chunks.filter(c => c !== null).length;
                const pct = Math.round((received / totalChunks) * 100);
                progressBar.style.width = pct + '%';
                progressText.textContent = `Ricezione: ${received}/${totalChunks} (${pct}%)`;
            } else if (msg.type === 'done') {
                progressText.textContent = isCompressed ? 'Decompressione e sincronizzazione...' : 'Sincronizzazione in corso...';
                progressBar.style.width = '100%';

                try {
                    const fullData = chunks.join('');
                    chunks = [];
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
                    progressText.innerHTML =
                        `<i class="fa-solid fa-check" style="color:var(--success-color);"></i> ${result}`;
                } catch (err) {
                    progressText.textContent = 'Errore: ' + err.message;
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

// --- Incremental merge: items are merged one at a time as they arrive ---

async function _p2pCreateMergeContext() {
    const localSets = await DB.getAllSets();
    const localPatients = await DB.getAllPatients();
    const localSetsMap = {};
    localSets.forEach(s => { localSetsMap[s.id] = s; });
    const localPatientsMap = {};
    localPatients.forEach(p => { localPatientsMap[p.id] = p; });
    return {
        localSetsMap, localPatientsMap,
        setsAdded: 0, setsUpdated: 0,
        patientsAdded: 0, patientsUpdated: 0
    };
}

async function _p2pMergeItem(ctx, kind, obj) {
    if (kind === 'set') {
        if (!obj.id) return;
        if (ctx.localSetsMap[obj.id]) {
            const merged = mergeSets(ctx.localSetsMap[obj.id], obj);
            await DB.saveSet(merged);
            ctx.localSetsMap[obj.id] = merged;
            ctx.setsUpdated++;
        } else {
            await DB.saveSet(obj);
            ctx.localSetsMap[obj.id] = obj;
            ctx.setsAdded++;
        }
    } else if (kind === 'patient') {
        if (!obj.id) return;
        if (ctx.localPatientsMap[obj.id]) {
            const merged = mergePatients(ctx.localPatientsMap[obj.id], obj);
            await DB.savePatient(merged);
            ctx.localPatientsMap[obj.id] = merged;
            ctx.patientsUpdated++;
        } else {
            await DB.savePatient(obj);
            ctx.localPatientsMap[obj.id] = obj;
            ctx.patientsAdded++;
        }
    } else if (kind === 'config') {
        await _p2pMergeConfig(obj);
    }
}

async function _p2pMergeConfig(data) {
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
        if (data.activityLayout.modeIcons) {
            if (!local.modeIcons) local.modeIcons = {};
            Object.assign(local.modeIcons, data.activityLayout.modeIcons);
        }
        if (data.activityLayout.groupColors) {
            if (!local.groupColors) local.groupColors = {};
            Object.assign(local.groupColors, data.activityLayout.groupColors);
        }
        saveActivityLayout(local);
        renderModeSelect();
    }
}

async function _p2pFinalizeMerge(ctx) {
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
    if (ctx.setsAdded > 0) parts.push(`${ctx.setsAdded} set aggiunti`);
    if (ctx.setsUpdated > 0) parts.push(`${ctx.setsUpdated} set aggiornati`);
    if (ctx.patientsAdded > 0) parts.push(`${ctx.patientsAdded} pazienti aggiunti`);
    if (ctx.patientsUpdated > 0) parts.push(`${ctx.patientsUpdated} pazienti aggiornati`);

    return parts.length > 0 ? parts.join(', ') : 'Nessuna modifica necessaria';
}

// Merge a full payload at once (legacy v5 protocol support)
async function mergeReceivedData(data) {
    const ctx = await _p2pCreateMergeContext();
    for (const s of (data.sets || [])) await _p2pMergeItem(ctx, 'set', s);
    for (const p of (data.patients || [])) await _p2pMergeItem(ctx, 'patient', p);
    await _p2pMergeConfig(data);
    return _p2pFinalizeMerge(ctx);
}

// Send a single set via P2P (called from library card)
window.p2pSendSet = (setId) => {
    openP2PSync();
    // Skip role selection, go directly to sender
    startP2PSend(setId);
};
