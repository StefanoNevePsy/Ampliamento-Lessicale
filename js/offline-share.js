// === OFFLINE SHARE: Transfer patient data without internet ===
// Uses compressed files (.tashare) and animated QR codes

let _offlineQRScanner = null;
let _offlineQRInterval = null;
let _offlineReceivedChunks = {};
let _offlineTotalChunks = 0;

// --- OPEN / CLOSE ---
window.openOfflineShare = () => {
    document.getElementById('modal-offline-share').style.display = 'flex';
    document.getElementById('offline-role-select').style.display = '';
    document.getElementById('offline-send-select').style.display = 'none';
    document.getElementById('offline-send-qr').style.display = 'none';
    document.getElementById('offline-receive-panel').style.display = 'none';
    _cleanupOfflineShare();
};

window.closeOfflineShare = () => {
    _cleanupOfflineShare();
    document.getElementById('modal-offline-share').style.display = 'none';
};

window.offlineShareBackToRole = () => {
    _cleanupOfflineShare();
    document.getElementById('offline-role-select').style.display = '';
    document.getElementById('offline-send-select').style.display = 'none';
    document.getElementById('offline-send-qr').style.display = 'none';
    document.getElementById('offline-receive-panel').style.display = 'none';
};

function _cleanupOfflineShare() {
    if (_offlineQRInterval) { clearInterval(_offlineQRInterval); _offlineQRInterval = null; }
    if (_offlineQRScanner) {
        try { _offlineQRScanner.stop(); } catch (e) { /* ignore */ }
        _offlineQRScanner = null;
    }
    _offlineReceivedChunks = {};
    _offlineTotalChunks = 0;
}

// --- SEND: Patient selection ---
window.offlineShareSendSelect = async () => {
    document.getElementById('offline-role-select').style.display = 'none';
    document.getElementById('offline-send-select').style.display = '';

    const patients = await DB.getAllPatients();
    let html = '<p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">Seleziona il paziente da condividere:</p>';

    if (patients.length === 0) {
        html += '<p style="text-align:center; color:#888; padding:20px;">Nessun paziente registrato.</p>';
    } else {
        patients.forEach(p => {
            const sessions = (p.history || []).length;
            const photoHtml = p.photo
                ? `<img src="${p.photo}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">`
                : `<div style="width:36px; height:36px; border-radius:50%; background:rgba(99,102,241,0.15); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-user" style="color:var(--accent-color); font-size:0.8rem;"></i></div>`;
            html += `
            <div onclick="offlineSharePatient('${p.id}')" style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px; cursor:pointer; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); margin-bottom:6px; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                ${photoHtml}
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.9rem;">${p.name}</div>
                    ${p.category ? `<div style="font-size:0.7rem; color:var(--text-secondary);">${p.category}</div>` : ''}
                    <div style="font-size:0.7rem; color:#888;">${sessions} sessioni</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color:#666; font-size:0.8rem;"></i>
            </div>`;
        });
    }

    document.getElementById('offline-patient-list').innerHTML = html;
};

// --- SEND: Share a specific patient ---
window.offlineSharePatient = async (pid) => {
    const p = state.patients.find(x => x.id === pid);
    if (!p) return alert('Paziente non trovato.');

    // Build compact payload (strip photo to reduce size if needed)
    const payload = {
        type: 'tashare',
        version: 1,
        timestamp: new Date().toISOString(),
        patient: {
            id: p.id,
            name: p.name,
            category: p.category || '',
            photo: p.photo || '',
            history: p.history || [],
            dailyNotes: p.dailyNotes || {}
        }
    };

    // Also include AI reports if available
    try {
        const reports = JSON.parse(localStorage.getItem('ai_reports_' + pid) || '[]');
        if (reports.length > 0) payload.reports = reports;
    } catch (e) { /* ignore */ }

    const json = JSON.stringify(payload);
    let compressed;
    try {
        compressed = pako.deflate(json);
    } catch (e) {
        alert('Errore compressione: ' + e.message);
        return;
    }

    const originalSize = json.length;
    const compressedSize = compressed.length;

    // Show send panel
    document.getElementById('offline-role-select').style.display = 'none';
    document.getElementById('offline-send-select').style.display = 'none';
    document.getElementById('offline-send-qr').style.display = '';

    const ratio = Math.round((1 - compressedSize / originalSize) * 100);
    let statusHtml = `<b>${p.name}</b> - ${_formatBytesOffline(compressedSize)} compressi (-${ratio}%)`;

    // Method 1: File download (always available)
    const blob = new Blob([compressed], { type: 'application/octet-stream' });
    const fileName = `${p.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ ]/g, '_')}_${new Date().toISOString().split('T')[0]}.tashare`;

    let buttonsHtml = '';

    // Web Share API (for native sharing: Nearby Share, Bluetooth, AirDrop, etc.)
    if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
            buttonsHtml += `<button class="btn btn-primary" id="offline-native-share-btn" style="padding:12px; font-size:0.9rem; width:100%;">
                <i class="fa-solid fa-share-nodes"></i> Condividi (Nearby Share / Bluetooth)
            </button>`;
        }
    }

    buttonsHtml += `<button class="btn btn-ghost" id="offline-download-btn" style="padding:10px; font-size:0.85rem; width:100%;">
        <i class="fa-solid fa-download"></i> Scarica file .tashare
    </button>`;

    // Method 2: QR codes for small data (< 8KB compressed)
    const MAX_QR_TOTAL = 8000; // practical limit for animated QR transfer
    if (compressedSize <= MAX_QR_TOTAL) {
        buttonsHtml += `<button class="btn btn-ghost" id="offline-qr-btn" style="padding:10px; font-size:0.85rem; width:100%; border-color:rgba(99,102,241,0.3); color:var(--accent-color);">
            <i class="fa-solid fa-qrcode"></i> Mostra QR Animato
        </button>`;
    } else {
        statusHtml += `<br><span style="font-size:0.75rem; opacity:0.6;">Dati troppo grandi per QR - usa file o Nearby Share.</span>`;
    }

    document.getElementById('offline-send-status').innerHTML = statusHtml;
    document.getElementById('offline-qr-container').innerHTML = '';
    document.getElementById('offline-qr-progress').innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">${buttonsHtml}</div>`;

    // Wire up buttons
    const downloadBtn = document.getElementById('offline-download-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
            downloadBtn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> File scaricato!';
        };
    }

    const nativeShareBtn = document.getElementById('offline-native-share-btn');
    if (nativeShareBtn) {
        nativeShareBtn.onclick = async () => {
            try {
                const file = new File([blob], fileName, { type: 'application/octet-stream' });
                await navigator.share({ files: [file], title: `Paziente: ${p.name}` });
                nativeShareBtn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> Condiviso!';
            } catch (e) {
                if (e.name !== 'AbortError') {
                    nativeShareBtn.innerHTML = '<i class="fa-solid fa-xmark" style="color:var(--danger-color);"></i> Errore: ' + e.message;
                }
            }
        };
    }

    const qrBtn = document.getElementById('offline-qr-btn');
    if (qrBtn) {
        qrBtn.onclick = () => _startAnimatedQRSend(compressed, p.name);
    }
};

// --- Animated QR Send ---
function _startAnimatedQRSend(compressedData, patientName) {
    const qrContainer = document.getElementById('offline-qr-container');
    const progressEl = document.getElementById('offline-qr-progress');
    qrContainer.innerHTML = '';

    // Convert to base64 for QR-safe encoding
    const b64 = btoa(Array.from(compressedData, b => String.fromCharCode(b)).join(''));

    // Split into chunks (QR can hold ~2953 bytes alphanumeric, use ~1800 to be safe)
    const CHUNK_SIZE = 1800;
    const chunks = [];
    for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
        chunks.push(b64.substring(i, i + CHUNK_SIZE));
    }
    const totalChunks = chunks.length;

    progressEl.innerHTML = `
        <div style="font-size:0.8rem; color:#aaa; margin-bottom:6px;">
            Punta la fotocamera dell'altro dispositivo verso il QR.<br>
            <b>${totalChunks} QR code${totalChunks > 1 ? ' (animati)' : ''}</b> - cambiano automaticamente.
        </div>
        <div id="offline-qr-counter" style="font-size:1.2rem; font-weight:bold; color:var(--accent-color);"></div>`;

    let currentIdx = 0;

    function showChunk(idx) {
        qrContainer.innerHTML = '';
        // Format: TA|chunkIdx|totalChunks|data
        const qrData = `TA|${idx}|${totalChunks}|${chunks[idx]}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: qrData,
                width: 260,
                height: 260,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }
        const counter = document.getElementById('offline-qr-counter');
        if (counter) counter.textContent = `${idx + 1} / ${totalChunks}`;
    }

    showChunk(0);

    if (totalChunks > 1) {
        _offlineQRInterval = setInterval(() => {
            currentIdx = (currentIdx + 1) % totalChunks;
            showChunk(currentIdx);
        }, 1500); // 1.5 seconds per QR
    }
}

// --- RECEIVE: Panel ---
window.offlineShareReceive = () => {
    document.getElementById('offline-role-select').style.display = 'none';
    document.getElementById('offline-receive-panel').style.display = '';
    document.getElementById('offline-receive-progress').style.display = 'none';
    document.getElementById('offline-receive-status').textContent = 'Scegli come ricevere i dati del paziente.';
    _offlineReceivedChunks = {};
    _offlineTotalChunks = 0;
};

// --- RECEIVE: QR Scan ---
window.offlineStartQRScan = async () => {
    const scanArea = document.getElementById('offline-qr-scan-area');
    scanArea.style.display = '';
    document.getElementById('offline-receive-progress').style.display = '';
    document.getElementById('offline-receive-status').textContent = 'Richiesta permesso fotocamera...';
    _offlineReceivedChunks = {};
    _offlineTotalChunks = 0;

    if (typeof Html5Qrcode === 'undefined') {
        document.getElementById('offline-receive-status').textContent = 'Scanner QR non disponibile.';
        scanArea.style.display = 'none';
        return;
    }

    // Request camera permission
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream.getTracks().forEach(t => t.stop());
    } catch (permErr) {
        const msg = permErr.name === 'NotAllowedError'
            ? 'Permesso fotocamera negato. Abilita nelle impostazioni dell\'app.'
            : 'Fotocamera non disponibile: ' + (permErr.message || permErr);
        document.getElementById('offline-receive-status').textContent = msg;
        scanArea.style.display = 'none';
        return;
    }

    document.getElementById('offline-receive-status').textContent = 'Inquadra il QR code animato...';
    document.getElementById('offline-receive-text').textContent = 'In attesa del primo QR...';

    _offlineQRScanner = new Html5Qrcode('offline-qr-reader');
    _offlineQRScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => _onOfflineQRScanned(decodedText),
        () => { /* ignore scan errors */ }
    ).catch((err) => {
        document.getElementById('offline-receive-status').textContent = 'Errore fotocamera: ' + err;
        scanArea.style.display = 'none';
    });
};

function _onOfflineQRScanned(data) {
    // Parse: TA|chunkIdx|totalChunks|base64data
    if (!data.startsWith('TA|')) return;
    const parts = data.split('|');
    if (parts.length < 4) return;

    const chunkIdx = parseInt(parts[1]);
    const total = parseInt(parts[2]);
    const chunkData = parts.slice(3).join('|'); // rejoin in case data contains |

    if (isNaN(chunkIdx) || isNaN(total)) return;

    _offlineTotalChunks = total;
    _offlineReceivedChunks[chunkIdx] = chunkData;

    const received = Object.keys(_offlineReceivedChunks).length;
    const pct = Math.round((received / total) * 100);
    document.getElementById('offline-receive-bar').style.width = pct + '%';
    document.getElementById('offline-receive-text').textContent = `Ricevuto ${received}/${total} QR (${pct}%)`;
    document.getElementById('offline-receive-status').textContent = `Scansione in corso... ${received}/${total}`;

    // All chunks received?
    if (received >= total) {
        if (_offlineQRScanner) {
            try { _offlineQRScanner.stop(); } catch (e) { /* ignore */ }
            _offlineQRScanner = null;
        }
        document.getElementById('offline-qr-scan-area').style.display = 'none';
        _processReceivedOfflineData();
    }
}

async function _processReceivedOfflineData() {
    document.getElementById('offline-receive-status').textContent = 'Elaborazione dati...';
    document.getElementById('offline-receive-bar').style.width = '100%';

    try {
        // Reassemble base64 chunks in order
        let b64 = '';
        for (let i = 0; i < _offlineTotalChunks; i++) {
            if (!_offlineReceivedChunks[i]) throw new Error(`Chunk ${i} mancante`);
            b64 += _offlineReceivedChunks[i];
        }

        // Decode base64 to binary
        const binStr = atob(b64);
        const uint8 = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) uint8[i] = binStr.charCodeAt(i);

        // Decompress
        const jsonStr = pako.inflate(uint8, { to: 'string' });
        const data = JSON.parse(jsonStr);

        await _importOfflinePatient(data);
    } catch (err) {
        document.getElementById('offline-receive-status').innerHTML =
            `<span style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> Errore: ${err.message}</span>`;
    }
}

// --- RECEIVE: File import ---
window.offlineImportFile = async (input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    document.getElementById('offline-receive-progress').style.display = '';
    document.getElementById('offline-receive-status').textContent = 'Lettura file...';
    document.getElementById('offline-receive-bar').style.width = '50%';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        // Decompress
        const jsonStr = pako.inflate(uint8, { to: 'string' });
        const data = JSON.parse(jsonStr);

        document.getElementById('offline-receive-bar').style.width = '80%';
        await _importOfflinePatient(data);
    } catch (err) {
        document.getElementById('offline-receive-status').innerHTML =
            `<span style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> Errore: ${err.message}</span>`;
    }

    // Reset file input
    input.value = '';
};

// --- IMPORT: Merge patient data ---
async function _importOfflinePatient(data) {
    if (!data || data.type !== 'tashare' || !data.patient) {
        throw new Error('Formato file non valido.');
    }

    const incoming = data.patient;
    const localPatients = await DB.getAllPatients();
    const existing = localPatients.find(p => p.id === incoming.id);

    if (existing) {
        // Merge: add new sessions, update notes
        const existingDates = new Set((existing.history || []).map(h => h.date));
        let newSessions = 0;

        (incoming.history || []).forEach(h => {
            if (!existingDates.has(h.date)) {
                if (!existing.history) existing.history = [];
                existing.history.push(h);
                newSessions++;
            }
        });

        // Merge daily notes (incoming overwrites for same date)
        if (incoming.dailyNotes) {
            if (!existing.dailyNotes) existing.dailyNotes = {};
            Object.assign(existing.dailyNotes, incoming.dailyNotes);
        }

        // Update photo if missing locally
        if (!existing.photo && incoming.photo) {
            existing.photo = incoming.photo;
        }

        await DB.savePatient(existing);

        document.getElementById('offline-receive-status').innerHTML =
            `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> <b>${incoming.name}</b> aggiornato: ${newSessions} nuove sessioni aggiunte.</span>`;
    } else {
        // New patient: save directly
        await DB.savePatient(incoming);

        document.getElementById('offline-receive-status').innerHTML =
            `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> <b>${incoming.name}</b> importato con ${(incoming.history || []).length} sessioni.</span>`;
    }

    // Import AI reports if present
    if (data.reports && Array.isArray(data.reports) && data.reports.length > 0) {
        try {
            const existingReports = JSON.parse(localStorage.getItem('ai_reports_' + incoming.id) || '[]');
            const existingTimestamps = new Set(existingReports.map(r => r.timestamp));
            data.reports.forEach(r => {
                if (!existingTimestamps.has(r.timestamp)) existingReports.push(r);
            });
            localStorage.setItem('ai_reports_' + incoming.id, JSON.stringify(existingReports));
        } catch (e) { /* ignore */ }
    }

    document.getElementById('offline-receive-bar').style.width = '100%';

    // Refresh state
    state.patients = await DB.getAllPatients();
    populateGlobalPatientSelect();
}

// --- Shortcut: share current patient directly from dashboard ---
window.offlineSharePatient = (pid) => {
    // Open modal directly in send mode for this patient
    document.getElementById('modal-offline-share').style.display = 'flex';
    document.getElementById('offline-role-select').style.display = 'none';
    document.getElementById('offline-send-select').style.display = 'none';
    document.getElementById('offline-send-qr').style.display = 'none';
    document.getElementById('offline-receive-panel').style.display = 'none';
    _cleanupOfflineShare();

    // Go directly to sharing this patient
    const p = state.patients.find(x => x.id === pid);
    if (!p) { alert('Paziente non trovato.'); return; }

    _offlineSharePatientDirect(pid);
};

async function _offlineSharePatientDirect(pid) {
    const p = state.patients.find(x => x.id === pid);
    if (!p) return;

    const payload = {
        type: 'tashare',
        version: 1,
        timestamp: new Date().toISOString(),
        patient: {
            id: p.id,
            name: p.name,
            category: p.category || '',
            photo: p.photo || '',
            history: p.history || [],
            dailyNotes: p.dailyNotes || {}
        }
    };

    try {
        const reports = JSON.parse(localStorage.getItem('ai_reports_' + pid) || '[]');
        if (reports.length > 0) payload.reports = reports;
    } catch (e) { /* ignore */ }

    const json = JSON.stringify(payload);
    let compressed;
    try {
        compressed = pako.deflate(json);
    } catch (e) {
        alert('Errore compressione: ' + e.message);
        return;
    }

    const originalSize = json.length;
    const compressedSize = compressed.length;
    const ratio = Math.round((1 - compressedSize / originalSize) * 100);

    document.getElementById('offline-send-qr').style.display = '';

    const blob = new Blob([compressed], { type: 'application/octet-stream' });
    const fileName = `${p.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ ]/g, '_')}_${new Date().toISOString().split('T')[0]}.tashare`;

    let statusHtml = `<b>${p.name}</b> - ${_formatBytesOffline(compressedSize)} compressi (-${ratio}%)`;

    let buttonsHtml = '';

    if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
            buttonsHtml += `<button class="btn btn-primary" id="offline-native-share-btn" style="padding:12px; font-size:0.9rem; width:100%;">
                <i class="fa-solid fa-share-nodes"></i> Condividi (Nearby Share / Bluetooth)
            </button>`;
        }
    }

    buttonsHtml += `<button class="btn btn-ghost" id="offline-download-btn" style="padding:10px; font-size:0.85rem; width:100%;">
        <i class="fa-solid fa-download"></i> Scarica file .tashare
    </button>`;

    const MAX_QR_TOTAL = 8000;
    if (compressedSize <= MAX_QR_TOTAL) {
        buttonsHtml += `<button class="btn btn-ghost" id="offline-qr-btn" style="padding:10px; font-size:0.85rem; width:100%; border-color:rgba(99,102,241,0.3); color:var(--accent-color);">
            <i class="fa-solid fa-qrcode"></i> Mostra QR Animato
        </button>`;
    } else {
        statusHtml += `<br><span style="font-size:0.75rem; opacity:0.6;">Dati troppo grandi per QR - usa file o Nearby Share.</span>`;
    }

    document.getElementById('offline-send-status').innerHTML = statusHtml;
    document.getElementById('offline-qr-container').innerHTML = '';
    document.getElementById('offline-qr-progress').innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">${buttonsHtml}</div>`;

    const downloadBtn = document.getElementById('offline-download-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
            downloadBtn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> File scaricato!';
        };
    }

    const nativeShareBtn = document.getElementById('offline-native-share-btn');
    if (nativeShareBtn) {
        nativeShareBtn.onclick = async () => {
            try {
                const file = new File([blob], fileName, { type: 'application/octet-stream' });
                await navigator.share({ files: [file], title: `Paziente: ${p.name}` });
                nativeShareBtn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--success-color);"></i> Condiviso!';
            } catch (e) {
                if (e.name !== 'AbortError') {
                    nativeShareBtn.innerHTML = '<i class="fa-solid fa-xmark" style="color:var(--danger-color);"></i> Errore: ' + e.message;
                }
            }
        };
    }

    const qrBtn = document.getElementById('offline-qr-btn');
    if (qrBtn) {
        qrBtn.onclick = () => _startAnimatedQRSend(compressed, p.name);
    }
}

function _formatBytesOffline(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
