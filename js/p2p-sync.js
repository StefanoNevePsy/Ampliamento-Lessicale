// === P2P SYNC via PeerJS + QR Code ===
// Direct device-to-device set transfer over WebRTC

let _p2pPeer = null;
let _p2pConn = null;
let _p2pScanner = null;

// Generate short random ID
function generateSyncId() {
    return 'sc-' + Math.random().toString(36).substring(2, 8);
}

// Open the P2P sync modal
window.openP2PSync = () => {
    document.getElementById('modal-p2p-sync').style.display = 'flex';
    document.getElementById('p2p-role-select').style.display = '';
    document.getElementById('p2p-sender-panel').style.display = 'none';
    document.getElementById('p2p-receiver-panel').style.display = 'none';
    document.getElementById('p2p-progress-panel').style.display = 'none';
    cleanupP2P();
};

window.closeP2PSync = () => {
    cleanupP2P();
    document.getElementById('modal-p2p-sync').style.display = 'none';
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
// SENDER FLOW
// ===============================
window.startP2PSend = async (mode) => {
    document.getElementById('p2p-role-select').style.display = 'none';
    document.getElementById('p2p-sender-panel').style.display = '';
    document.getElementById('p2p-sender-status').textContent = 'Connessione in corso...';
    document.getElementById('p2p-qr-container').innerHTML = '';
    document.getElementById('p2p-sender-code').textContent = '';

    const syncId = generateSyncId();

    // Build payload based on mode
    let payload;
    if (mode === 'all') {
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
        // mode = set ID
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

    try {
        _p2pPeer = new Peer(syncId);
    } catch (e) {
        document.getElementById('p2p-sender-status').textContent = 'Errore: PeerJS non disponibile. Verifica la connessione internet.';
        return;
    }

    _p2pPeer.on('open', (id) => {
        document.getElementById('p2p-sender-status').innerHTML = 'In attesa di connessione...<br><span style="font-size:0.75rem; opacity:0.6;">L\'altro dispositivo deve scansionare il QR o inserire il codice.</span>';
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
            // Send data in chunks if large
            const json = JSON.stringify(payload);
            const chunkSize = 64 * 1024; // 64KB chunks
            const totalChunks = Math.ceil(json.length / chunkSize);

            conn.send({ type: 'meta', totalChunks: totalChunks, totalSize: json.length });

            for (let i = 0; i < totalChunks; i++) {
                conn.send({ type: 'chunk', index: i, data: json.substring(i * chunkSize, (i + 1) * chunkSize) });
            }

            conn.send({ type: 'done' });
            document.getElementById('p2p-sender-status').innerHTML = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> Dati inviati con successo!';
        });

        conn.on('error', (err) => {
            document.getElementById('p2p-sender-status').textContent = 'Errore connessione: ' + err.message;
        });
    });

    _p2pPeer.on('error', (err) => {
        document.getElementById('p2p-sender-status').textContent = 'Errore: ' + err.message;
    });
};

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
            // QR scanned successfully
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
        _p2pPeer = new Peer();
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

        _p2pConn.on('data', async (msg) => {
            if (msg.type === 'meta') {
                totalChunks = msg.totalChunks;
                totalSize = msg.totalSize;
                chunks = new Array(totalChunks).fill(null);
                const sizeKB = Math.round(totalSize / 1024);
                document.getElementById('p2p-progress-text').textContent = `Ricezione: 0/${totalChunks} (${sizeKB} KB)`;
            } else if (msg.type === 'chunk') {
                chunks[msg.index] = msg.data;
                const received = chunks.filter(c => c !== null).length;
                const pct = Math.round((received / totalChunks) * 100);
                document.getElementById('p2p-progress-bar-fill').style.width = pct + '%';
                document.getElementById('p2p-progress-text').textContent = `Ricezione: ${received}/${totalChunks}`;
            } else if (msg.type === 'done') {
                document.getElementById('p2p-progress-text').textContent = 'Sincronizzazione in corso...';
                document.getElementById('p2p-progress-bar-fill').style.width = '100%';

                try {
                    const fullJson = chunks.join('');
                    const data = JSON.parse(fullJson);
                    const result = await mergeReceivedData(data);
                    document.getElementById('p2p-progress-text').innerHTML =
                        `<i class="fa-solid fa-check" style="color:var(--success-color);"></i> ${result}`;
                } catch (err) {
                    document.getElementById('p2p-progress-text').textContent = 'Errore: ' + err.message;
                }
            }
        });

        _p2pConn.on('error', (err) => {
            document.getElementById('p2p-progress-text').textContent = 'Errore: ' + err.message;
        });
    });

    _p2pPeer.on('error', (err) => {
        document.getElementById('p2p-progress-text').textContent = 'Errore: ' + err.message;
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
