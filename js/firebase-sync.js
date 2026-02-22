// === FIREBASE SYNC ===
// Lightweight patient data sync via Firebase Realtime Database
// Only syncs patient history (not images/sets which are too large)

const FIREBASE_CONFIG_KEY = 'firebaseConfig';
const FIREBASE_ENABLED_KEY = 'firebaseSyncEnabled';

function isFirebaseSyncEnabled() {
    return localStorage.getItem(FIREBASE_ENABLED_KEY) === 'true';
}

function getFirebaseConfig() {
    try { return JSON.parse(localStorage.getItem(FIREBASE_CONFIG_KEY) || 'null'); }
    catch(e) { return null; }
}

function saveFirebaseConfig(config) {
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

// Initialize Firebase (lazy)
let _firebaseApp = null;
let _firebaseDb = null;

function initFirebase() {
    const config = getFirebaseConfig();
    if (!config || !config.databaseURL) return false;

    try {
        if (!window.firebase) {
            console.warn('Firebase SDK not loaded');
            return false;
        }
        if (!_firebaseApp) {
            _firebaseApp = firebase.initializeApp(config);
        }
        _firebaseDb = firebase.database();
        return true;
    } catch(e) {
        console.error('Firebase init error:', e);
        return false;
    }
}

// Get device ID for identifying this device
function getDeviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('deviceId', id);
    }
    return id;
}

// Sync patient to Firebase (upload)
async function syncPatientToFirebase(patient) {
    if (!isFirebaseSyncEnabled()) return;
    if (!initFirebase()) return;

    try {
        // Sync full patient data including session details
        // (taskSteps, itemDetails, sessionType, setCat, etc.)
        const syncData = {
            id: patient.id,
            name: patient.name,
            history: (patient.history || []).map(h => {
                // Clone session but exclude any accidental large fields
                const session = { ...h };
                // Remove transient/internal fields that shouldn't sync
                delete session.originalIndex;
                return session;
            }),
            lastSync: new Date().toISOString(),
            deviceId: getDeviceId()
        };

        await _firebaseDb.ref(`patients/${patient.id}`).set(syncData);
        console.log(`Synced patient ${patient.name} to Firebase`);
    } catch(e) {
        console.error('Firebase sync error:', e);
    }
}

// Pull all patients from Firebase
async function pullPatientsFromFirebase() {
    if (!isFirebaseSyncEnabled()) return null;
    if (!initFirebase()) return null;

    try {
        const snapshot = await _firebaseDb.ref('patients').once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.values(data);
    } catch(e) {
        console.error('Firebase pull error:', e);
        return null;
    }
}

// Full sync: merge remote patients with local
window.syncWithFirebase = async () => {
    if (!isFirebaseSyncEnabled()) {
        alert('Firebase sync non abilitato. Configura prima le credenziali.');
        return;
    }

    const statusEl = document.getElementById('firebase-sync-status');
    if (statusEl) statusEl.textContent = 'Sincronizzazione in corso...';

    try {
        // Pull remote
        const remotePatients = await pullPatientsFromFirebase();
        if (remotePatients === null) {
            if (statusEl) statusEl.textContent = 'Errore connessione Firebase.';
            return;
        }

        // Get local
        const localPatients = await DB.getAllPatients();
        let mergedCount = 0;
        let newCount = 0;

        // Merge remote into local
        for (const remote of remotePatients) {
            const local = localPatients.find(p => p.id === remote.id);
            if (local) {
                // Merge histories: add remote sessions not in local
                const localDates = new Set(local.history.map(h => h.date));
                const newSessions = (remote.history || []).filter(h => !localDates.has(h.date));
                if (newSessions.length > 0) {
                    local.history.push(...newSessions);
                    local.history.sort((a, b) => new Date(a.date) - new Date(b.date));
                    await DB.savePatient(local);
                    mergedCount++;
                }
            } else {
                // New patient from remote
                await DB.savePatient({ id: remote.id, name: remote.name, history: remote.history || [] });
                newCount++;
            }
        }

        // Push all local to remote
        const updatedLocal = await DB.getAllPatients();
        for (const p of updatedLocal) {
            await syncPatientToFirebase(p);
        }

        // Update state
        state.patients = updatedLocal;
        populateGlobalPatientSelect();

        const msg = `Sync completato!\nNuovi pazienti: ${newCount}\nPazienti aggiornati: ${mergedCount}\nTotale sincronizzati: ${updatedLocal.length}`;
        if (statusEl) statusEl.textContent = 'Ultimo sync: ' + new Date().toLocaleTimeString('it-IT');
        alert(msg);

    } catch(e) {
        console.error('Sync error:', e);
        if (statusEl) statusEl.textContent = 'Errore: ' + e.message;
    }
};

// Open Firebase settings modal
window.openFirebaseSettings = () => {
    const config = getFirebaseConfig() || {};
    const enabled = isFirebaseSyncEnabled();
    const modal = document.getElementById('modal-firebase');
    if (!modal) return;

    document.getElementById('firebase-enabled-toggle').checked = enabled;
    document.getElementById('firebase-db-url').value = config.databaseURL || '';
    document.getElementById('firebase-api-key').value = config.apiKey || '';
    document.getElementById('firebase-project-id').value = config.projectId || '';

    modal.style.display = 'flex';
};

window.closeFirebaseSettings = () => {
    const modal = document.getElementById('modal-firebase');
    if (modal) modal.style.display = 'none';
};

window.saveFirebaseSettings = () => {
    const enabled = document.getElementById('firebase-enabled-toggle').checked;
    const dbUrl = document.getElementById('firebase-db-url').value.trim();
    const apiKey = document.getElementById('firebase-api-key').value.trim();
    const projectId = document.getElementById('firebase-project-id').value.trim();

    localStorage.setItem(FIREBASE_ENABLED_KEY, enabled ? 'true' : 'false');

    if (dbUrl) {
        saveFirebaseConfig({
            apiKey: apiKey || 'dummy',
            databaseURL: dbUrl,
            projectId: projectId || 'stimolatore'
        });
    }

    // Reset Firebase instance to pick up new config
    _firebaseApp = null;
    _firebaseDb = null;

    closeFirebaseSettings();

    if (enabled && dbUrl) {
        alert('Firebase configurato! Usa il pulsante Sync per sincronizzare.');
    }
};

// Auto-sync after saving patient (hook into DB.savePatient)
const _originalSavePatient = DB.savePatient;
DB.savePatient = async function(patient) {
    const result = await _originalSavePatient.call(this, patient);
    // Background sync (don't await)
    if (isFirebaseSyncEnabled()) {
        syncPatientToFirebase(patient).catch(e => console.warn('Background sync failed:', e));
    }
    return result;
};
