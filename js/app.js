// === APP INIT & MAIN LOGIC ===

// --- INIT ---
window.onload = async () => {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
            window.Capacitor.Plugins.StatusBar.hide().catch(err => console.error("Impossibile nascondere status bar", err));
        }

        // Init tag image cache (IndexedDB + migrate from localStorage)
        await initTagImageCache();

        state.savedSets = await DB.getAllSets();
        state.patients = await DB.getAllPatients();

        if (state.savedSets.length === 0) {
            const seed = [{
                id: "anim_liv1",
                name: "Liv 1 (Bisillabe)",
                cat: "Animali",
                modes: ['tact', 'ran', 'memory', 'tombola'],
                tags: ['animali'],
                items: [{ label: "Cane", url: null }, { label: "Gatto", url: null }]
            }];
            for (const s of seed) await DB.saveSet(s);
            state.savedSets = await DB.getAllSets();
        }

        // Migrate old label field: some old items used 'l' instead of 'label'
        // Migrate old tag case: normalize tags to lowercase
        let needsSave = false;
        state.savedSets.forEach(set => {
            if (set.items) {
                set.items.forEach(item => {
                    if (item.l && !item.label) {
                        item.label = item.l;
                        delete item.l;
                    }
                });
            }
            if (set.tags && Array.isArray(set.tags)) {
                const lowered = set.tags.map(t => t.toLowerCase().trim());
                if (set.tags.some((t, i) => t !== lowered[i])) {
                    set.tags = lowered;
                    needsSave = true;
                    DB.saveSet(set);
                }
            }
        });

        const badge = document.getElementById('lib-count');
        if (badge) badge.innerText = state.savedSets.length;

        rebuildModesConfig();
        await _migrateAggregatePoolSessions();
        renderModeSelect();
        refreshAllTags();
        filterSetsByMode();
        populateGlobalPatientSelect();

        document.addEventListener('paste', handlePaste);
        document.addEventListener('dragstart', (e) => e.preventDefault());
        document.addEventListener('keydown', handleShortcuts);

        // --- Listen for shared files (Nearby Share / Quick Share) ---
        _setupSharedFileReceiver();

    } catch (e) { console.error("Init Error", e); }
};

// === MIGRATION: unify legacy executive/cognitive pool sessions ===
// Older sessions for aggregate pool modes were saved as "Pool: tag1, tag2".
// Re-name them to the mode label so they aggregate, preserving the tags used
// in `poolTags`. Idempotent and only touches auto-named pool sessions, so it
// never overwrites custom session names or other data.
async function _migrateAggregatePoolSessions() {
    try {
        if (!state.patients || !state.patients.length) return;
        const aggModes = (typeof AGGREGATE_POOL_MODES !== 'undefined') ? AGGREGATE_POOL_MODES : [];
        if (!aggModes.length) return;
        for (const p of state.patients) {
            if (!p.history || !p.history.length) continue;
            let changed = false;
            for (const s of p.history) {
                const engine = (typeof getModeEngine === 'function') ? getModeEngine(s.mode) : s.mode;
                if (!aggModes.includes(engine)) continue;
                if (typeof s.setName === 'string' && s.setName.startsWith('Pool: ')) {
                    if (!s.poolTags || !s.poolTags.length) {
                        const tagStr = s.setName.slice(6).trim();
                        if (tagStr) s.poolTags = tagStr.split(',').map(t => t.trim()).filter(Boolean);
                    }
                    s.setName = (typeof MODES_CONFIG !== 'undefined' && MODES_CONFIG[s.mode]) ? MODES_CONFIG[s.mode] : s.mode;
                    changed = true;
                }
            }
            if (changed) await DB.savePatient(p);
        }
    } catch (e) { console.warn('Migration aggregate pool sessions failed:', e); }
}

// === SHARED FILE RECEIVER ===
// Handles files received via Android intent (Nearby Share, file manager, etc.)
function _setupSharedFileReceiver() {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;

    const App = window.Capacitor.Plugins.App;

    // --- Method 1: App plugin (VIEW intents) ---
    if (App) {
        App.addListener('appUrlOpen', async (event) => {
            console.log('[SharedFile] appUrlOpen:', event.url);
            if (event.url) await _handleReceivedFileUrl(event.url);
        });

        App.getLaunchUrl().then(async (result) => {
            if (result && result.url) {
                console.log('[SharedFile] getLaunchUrl:', result.url);
                await _handleReceivedFileUrl(result.url);
            }
        }).catch(e => console.warn('[SharedFile] getLaunchUrl error:', e));
    }

    // --- Method 2: SendIntent plugin (SEND intents from Nearby Share) ---
    const SendIntent = window.Capacitor.Plugins.SendIntent;
    if (SendIntent) {
        const _processSendIntent = async (result) => {
            if (!result) return;
            // SendIntent may provide url directly or inside result.extras
            const url = result.url || (result.extras && result.extras['android.intent.extra.STREAM']);
            const title = result.title || '';
            if (url) {
                console.log('[SharedFile] SendIntent received:', url, result.type, 'title:', title);
                // Pass title as hint for file type detection (may contain original filename)
                await _handleReceivedFileUrl(url, title);
            }
        };

        // Check if launched with a SEND intent
        SendIntent.checkSendIntentReceived().then(_processSendIntent)
            .catch(e => console.warn('[SharedFile] SendIntent check error:', e));

        // Listen for subsequent SEND intents while app is running
        if (App) {
            App.addListener('resume', async () => {
                try {
                    const result = await SendIntent.checkSendIntentReceived();
                    await _processSendIntent(result);
                } catch (e) { /* no intent */ }
            });
        }
    }
}

async function _handleReceivedFileUrl(url, filenameHint) {
    try {
        let fileData;

        if (url.startsWith('content://') || url.startsWith('file://')) {
            // Read file via Capacitor Filesystem
            const FS = window.Capacitor.Plugins.Filesystem;
            if (!FS) throw new Error('Filesystem plugin non disponibile.');

            const result = await FS.readFile({ path: url });
            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            fileData = bytes;
        } else {
            // Try fetch for https:// or other schemes
            const resp = await fetch(url);
            const buffer = await resp.arrayBuffer();
            fileData = new Uint8Array(buffer);
        }

        // Detect file type from URL, filename hint (from SendIntent title), or file signature
        const combined = (url + '|' + (filenameHint || '')).toLowerCase();
        const isTashare = combined.includes('.tashare');
        const isZip = combined.includes('.zip') || _isZipSignature(fileData);

        if (isTashare) {
            await _importSharedTashare(fileData);
        } else if (isZip) {
            const blob = new Blob([fileData], { type: 'application/zip' });
            const file = new File([blob], 'received.zip', { type: 'application/zip' });
            await importFromZip(file);
            _showImportToast('File ZIP importato con successo!');
        } else {
            // Try as tashare (compressed binary) - Nearby Share may strip the extension
            try {
                await _importSharedTashare(fileData);
            } catch {
                // Try as ZIP by signature (some providers don't include extension)
                if (_isZipSignature(fileData)) {
                    const blob = new Blob([fileData], { type: 'application/zip' });
                    const file = new File([blob], 'received.zip', { type: 'application/zip' });
                    await importFromZip(file);
                    _showImportToast('File ZIP importato con successo!');
                } else {
                    // Try as JSON
                    const text = new TextDecoder().decode(fileData);
                    const blob = new Blob([text], { type: 'application/json' });
                    const file = new File([blob], 'received.json', { type: 'application/json' });
                    await importFromJSON(file);
                    _showImportToast('File importato con successo!');
                }
            }
        }
    } catch (err) {
        console.error('[SharedFile] Import error:', err);
        alert('Errore importazione file ricevuto: ' + err.message);
    }
}

async function _importSharedTashare(uint8) {
    const jsonStr = pako.inflate(uint8, { to: 'string' });
    const data = JSON.parse(jsonStr);

    if (!data || data.type !== 'tashare' || !data.patient) {
        throw new Error('Formato file .tashare non valido.');
    }

    const incoming = data.patient;
    const localPatients = await DB.getAllPatients();
    const existing = localPatients.find(p => p.id === incoming.id);

    if (existing) {
        const existingDates = new Set((existing.history || []).map(h => h.date));
        let newSessions = 0;
        (incoming.history || []).forEach(h => {
            if (!existingDates.has(h.date)) {
                if (!existing.history) existing.history = [];
                existing.history.push(h);
                newSessions++;
            }
        });
        if (incoming.dailyNotes) {
            if (!existing.dailyNotes) existing.dailyNotes = {};
            Object.assign(existing.dailyNotes, incoming.dailyNotes);
        }
        if (!existing.photo && incoming.photo) existing.photo = incoming.photo;
        await DB.savePatient(existing);
        _showImportToast(`${incoming.name}: aggiornato (${newSessions} nuove sessioni)`);
    } else {
        const newPatient = {
            id: incoming.id, name: incoming.name, category: incoming.category || '',
            photo: incoming.photo || '', history: incoming.history || [],
            dailyNotes: incoming.dailyNotes || {}
        };
        await DB.savePatient(newPatient);
        _showImportToast(`${incoming.name}: aggiunto come nuovo paziente`);
    }

    // Import AI reports if included
    if (data.reports && Array.isArray(data.reports)) {
        try {
            const key = 'ai_reports_' + incoming.id;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            const existingTs = new Set(existing.map(r => r.timestamp || r.date));
            const newReports = data.reports.filter(r => !existingTs.has(r.timestamp || r.date));
            if (newReports.length > 0) {
                localStorage.setItem(key, JSON.stringify([...existing, ...newReports]));
            }
        } catch (e) { /* ignore */ }
    }

    // Refresh state
    state.patients = await DB.getAllPatients();
    if (typeof populateGlobalPatientSelect === 'function') populateGlobalPatientSelect();
}

function _isZipSignature(data) {
    return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04;
}

function _showImportToast(message) {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:var(--success-color, #22c55e); color:#fff; padding:12px 24px; border-radius:12px; font-size:0.9rem; font-weight:600; z-index:99999; box-shadow:0 4px 20px rgba(0,0,0,0.3); text-align:center; max-width:90vw; animation:slideUp 0.3s ease;';
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
    document.body.appendChild(toast);

    // Add animation
    const style = document.createElement('style');
    style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
    document.head.appendChild(style);

    setTimeout(() => { toast.remove(); style.remove(); }, 4000);
}

// --- SET FILTERING & DROPDOWN ---
const POOL_ENGINES = ['pool_random', 'pool_intraverbal', 'intruso', 'categorizzazione', 'ricorda', 'singolare_plurale', 'stroop_numerico', 'go_nogo', 'stroop_etichetta', 'topologia_comp'];
// Keep POOL_MODES as alias for backward compat
const POOL_MODES = POOL_ENGINES;
// Cognitive/executive pool modes: tags are interchangeable stimulus sources, so
// data is aggregated per mode (stable setId) and the tags used are recorded per session.
const AGGREGATE_POOL_MODES = ['ricorda', 'singolare_plurale', 'stroop_numerico', 'go_nogo', 'stroop_etichetta'];

window.filterSetsByMode = function () {
    const currentMode = document.getElementById('mode-select').value;
    if (!currentMode) return;
    const engine = getModeEngine(currentMode);
    const isPoolMode = POOL_ENGINES.includes(engine);
    const isQuaderno = engine === 'quaderno' || engine === 'quaderno_task';

    // Clean up multi-set session when switching away from scenario modes
    if (engine !== 'search_find' && engine !== 'intraverbal_scenari') {
        state.multiSetSession = null;
    }

    // Toggle set selector vs tag selector visibility
    const setWrapper = document.getElementById('set-selector-wrapper');
    const tagWrapper = document.getElementById('tag-selector-wrapper');
    if (setWrapper && tagWrapper) {
        if (isPoolMode) {
            setWrapper.classList.add('hidden');
            tagWrapper.classList.remove('hidden');
            renderPoolTagSelector();
        } else if (isQuaderno) {
            setWrapper.classList.remove('hidden');
            tagWrapper.classList.add('hidden');
        } else {
            setWrapper.classList.remove('hidden');
            tagWrapper.classList.add('hidden');
        }
    }

    // Pool modes don't use set dropdown
    if (isPoolMode) {
        return;
    }
    // Quaderno modes use the set dropdown for saved lists (populated in renderQuaderno)
    if (isQuaderno) {
        window.startGame();
        return;
    }

    const compatibleSets = state.savedSets.filter(s => {
        if (s.modes && Array.isArray(s.modes)) {
            // If modes array exists (even empty), use it as the source of truth
            if (s.modes.length === 0) return false; // No modes assigned = not compatible with anything
            // Resolve engine for compatibility check
            let checkEngine = engine;
            if (engine === 'intraverbal_scenari') checkEngine = 'search_find';
            else if (engine === 'ran_intensivo') checkEngine = 'ran';
            return s.modes.includes(checkEngine) || s.modes.includes(engine) || s.modes.includes(currentMode);
        }
        // Fallback for old sets without mode tags at all (modes field missing)
        if (engine === 'search_find' || engine === 'intraverbal_scenari') {
            return s.category && (s.category.includes('Scene') || s.category.includes('Cerca'));
        } else {
            return !(s.category && (s.category.includes('Scene') || s.category.includes('Cerca')));
        }
    });

    updateDropdown(compatibleSets);

    // Reset stage if active set is not compatible
    if (state.activeSetId && !compatibleSets.find(s => s.id === state.activeSetId)) {
        document.getElementById('game-stage').innerHTML = `
            <div style="height:100%; display:flex; justify-content:center; align-items:center; opacity:0.5; flex-direction:column; text-align:center;">
                <i class="fa-solid fa-filter-circle-xmark fa-3x" style="margin-bottom:15px"></i>
                <p>Il set caricato non &egrave; adatto<br>a questa modalit&agrave;.<br>Scegline un altro.</p>
            </div>`;
        state.items = [];
        state.activeSetId = null;
        const lbl = document.getElementById('set-dropdown-label');
        if (lbl) lbl.textContent = '-- Scegli un Set --';
    }
};

// --- POOL TAG SELECTOR ---
function renderPoolTagSelector() {
    const container = document.getElementById('pool-tag-selector');
    if (!container) return;

    if (state.allTags.length === 0) {
        container.innerHTML = '<span style="color:var(--text-secondary); font-size:0.8rem;">Nessun tag disponibile. Assegna tag ai set dall\'Editor.</span>';
        return;
    }

    // Count items per tag for display
    const tagCounts = {};
    state.allTags.forEach(tag => {
        tagCounts[tag] = getItemsByTag(tag).length;
    });

    container.innerHTML = state.allTags.map(tag => {
        const isSelected = state.selectedPoolTags.includes(tag);
        const count = tagCounts[tag];
        return `<span class="tag-chip" style="cursor:pointer; font-size:0.75rem; padding:4px 10px;
                    ${isSelected ? 'background:rgba(99,102,241,0.3); border-color:var(--accent-color); color:white;' : ''}"
                    onclick="togglePoolTag('${tag}')">
                    ${isSelected ? '<i class="fa-solid fa-check" style="font-size:0.6rem;"></i> ' : ''}${tag}
                    <span style="opacity:0.6; font-size:0.65rem;">(${count})</span>
                </span>`;
    }).join('');
}

window.togglePoolTag = (tag) => {
    const idx = state.selectedPoolTags.indexOf(tag);
    if (idx >= 0) {
        state.selectedPoolTags.splice(idx, 1);
    } else {
        state.selectedPoolTags.push(tag);
    }
    renderPoolTagSelector();
};

// --- CUSTOM SET DROPDOWN ---
// Persist sort preference and collapsed categories
if (!state._setDropdownSort) state._setDropdownSort = 'category';
if (!state._collapsedCats) state._collapsedCats = {};
let _dropdownSets = []; // cached for re-sort

function getSetStatus(s, activePatient, currentMode) {
    const info = { isMastered: false, isRepertorio: false, isNear: false, lastPct: null, lastDate: null, sessions: 0, ranErrorCount: null };
    if (!activePatient || !activePatient.history) return info;
    const engine = typeof getModeEngine === 'function' ? getModeEngine(currentMode) : currentMode;
    const sessions = activePatient.history.filter(h => h.setId === s.id && h.mode === currentMode);
    info.sessions = sessions.length;
    if (sessions.length === 0 && engine !== 'ran_intensivo') return info;
    if (sessions.length > 0) {
        const threshold = typeof getCriterionThreshold === 'function' ? getCriterionThreshold(activePatient.id, currentMode, s.name) : DEFAULT_CRITERION;
        info.isMastered = typeof checkCriterion === 'function' && checkCriterion(sessions, threshold);
        info.isRepertorio = typeof checkRepertorio === 'function' && checkRepertorio(sessions, threshold);
        info.isNear = !info.isMastered && typeof isNearCriterion === 'function' && isNearCriterion(sessions, threshold);
        const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const last = sorted[sorted.length - 1];
        if (last) {
            info.lastPct = last.percentage != null ? Math.round(last.percentage) : null;
            info.lastDate = last.date;
        }
    }
    // For RAN Intensivo: count errors from last RAN/RAN Intensivo session
    if (engine === 'ran_intensivo') {
        const ranSessions = activePatient.history.filter(h => h.setId === s.id && (h.mode === 'ran' || h.mode === 'ran_intensivo'));
        if (ranSessions.length > 0) {
            const lastRan = [...ranSessions].sort((a, b) => new Date(a.date) - new Date(b.date)).pop();
            if (lastRan.itemDetails && lastRan.itemDetails.length > 0) {
                info.ranErrorCount = lastRan.itemDetails.filter(d => d.result !== true).length;
            } else {
                // Fallback: use session error counts when itemDetails not available (e.g. old RAN grid sessions)
                info.ranErrorCount = lastRan.rawX != null ? lastRan.rawX : (lastRan.incorrect || 0);
            }
        }
    }
    return info;
}

function updateDropdown(sets) {
    const panel = document.getElementById('set-dropdown-panel');
    const label = document.getElementById('set-dropdown-label');
    if (!panel) return;

    _dropdownSets = sets;
    const currentMode = document.getElementById('mode-select').value;
    const activePatient = state.activePatientId ? state.patients.find(p => p.id === state.activePatientId) : null;
    const sortBy = state._setDropdownSort || 'category';

    // Enrich sets with status data for sorting
    const enriched = sets.map(s => ({
        set: s,
        status: getSetStatus(s, activePatient, currentMode)
    }));

    // Sort
    const sortFunctions = {
        'category': (a, b) => (a.set.category || 'ZZZ').localeCompare(b.set.category || 'ZZZ') || a.set.name.localeCompare(b.set.name),
        'name': (a, b) => a.set.name.localeCompare(b.set.name),
        'pct-desc': (a, b) => (b.status.lastPct ?? -1) - (a.status.lastPct ?? -1),
        'pct-asc': (a, b) => (a.status.lastPct ?? 999) - (b.status.lastPct ?? 999),
        'recent': (a, b) => {
            const da = a.status.lastDate ? new Date(a.status.lastDate) : new Date(0);
            const db = b.status.lastDate ? new Date(b.status.lastDate) : new Date(0);
            return db - da;
        },
        'criterion': (a, b) => {
            const scoreA = a.status.isMastered ? 3 : a.status.isRepertorio ? 2 : a.status.isNear ? 1 : 0;
            const scoreB = b.status.isMastered ? 3 : b.status.isRepertorio ? 2 : b.status.isNear ? 1 : 0;
            return scoreB - scoreA || (b.status.lastPct ?? -1) - (a.status.lastPct ?? -1);
        }
    };
    enriched.sort(sortFunctions[sortBy] || sortFunctions['category']);

    // Sort toolbar
    const sortOpts = [
        { key: 'category', icon: 'fa-folder', tip: 'Categoria' },
        { key: 'name', icon: 'fa-font', tip: 'Nome' },
        { key: 'recent', icon: 'fa-clock', tip: 'Recenti' },
        { key: 'pct-desc', icon: 'fa-arrow-down-9-1', tip: '% desc' },
        { key: 'pct-asc', icon: 'fa-arrow-up-1-9', tip: '% asc' },
        { key: 'criterion', icon: 'fa-trophy', tip: 'Criterio' }
    ];
    let html = `<div class="set-dropdown-sort-bar">`;
    sortOpts.forEach(o => {
        html += `<button onclick="event.stopPropagation(); changeSetDropdownSort('${o.key}')" class="${sortBy === o.key ? 'active' : ''}" title="${o.tip}"><i class="fa-solid ${o.icon}"></i></button>`;
    });
    html += `</div>`;

    // Group by category (only for 'category' sort)
    const useGroups = sortBy === 'category';

    if (useGroups) {
        const categories = {};
        enriched.forEach(e => {
            const cat = e.set.category || "Altri";
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(e);
        });
        for (const [catName, catItems] of Object.entries(categories)) {
            const collapsed = state._collapsedCats[catName] || false;
            html += `<div class="set-dropdown-group-label" onclick="event.stopPropagation(); toggleSetCategory('${catName.replace(/'/g, "\\'")}')">
                <span>${catName}</span>
                <span style="display:flex; align-items:center; gap:6px;">
                    <span style="opacity:0.5; font-size:0.6rem;">${catItems.length}</span>
                    <i class="fa-solid fa-chevron-${collapsed ? 'right' : 'down'}" style="font-size:0.55rem; opacity:0.5;"></i>
                </span>
            </div>`;
            if (!collapsed) {
                catItems.forEach(e => { html += renderSetDropdownItem(e.set, e.status); });
            }
        }
    } else {
        enriched.forEach(e => { html += renderSetDropdownItem(e.set, e.status); });
    }

    if (enriched.length === 0) {
        html += '<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.85rem;">Nessun set compatibile</div>';
    }

    panel.innerHTML = html;

    // Update trigger label
    if (state.activeSetId) {
        const activeSet = sets.find(s => s.id === state.activeSetId);
        label.textContent = activeSet ? activeSet.name : '-- Scegli un Set --';
    } else {
        label.textContent = '-- Scegli un Set --';
    }
}

function renderSetDropdownItem(s, status) {
    const isSelected = state.activeSetId === s.id;
    const missingCount = s.items.filter(i => !i.url).length;

    const firstImg = s.items.find(i => i.url);
    const thumbSrc = firstImg ? firstImg.url : (s.coverImage || null);
    const thumbHtml = thumbSrc
        ? `<div class="set-item-thumb"><img src="${thumbSrc}" loading="lazy" alt=""></div>`
        : `<div class="set-item-thumb"><i class="fa-solid fa-images"></i></div>`;

    let badges = '';
    if (status.isMastered) {
        badges += '<span class="set-item-badge badge-criterion">\uD83C\uDFC6 Criterio</span>';
    } else if (status.isRepertorio) {
        badges += '<span class="set-item-badge badge-repertorio">\u2B50 Repertorio</span>';
    }
    if (status.isNear) {
        badges += '<span class="set-item-badge badge-near">\u2191 Vicino</span>';
    }
    if (status.lastPct != null) {
        const _pctHex = typeof pctColorHex === 'function' ? pctColorHex(status.lastPct) : (status.lastPct >= 90 ? '#10b981' : status.lastPct >= 70 ? '#f59e0b' : '#ef4444');
        badges += `<span class="set-item-badge badge-pct" style="color:${_pctHex}">${status.lastPct}%</span>`;
    }
    if (status.ranErrorCount != null) {
        if (status.ranErrorCount > 0) {
            badges += `<span class="set-item-badge badge-ran-errors" style="color:var(--warning-color);"><i class="fa-solid fa-circle-exclamation" style="margin-right:2px;"></i>${status.ranErrorCount} err</span>`;
        } else {
            badges += `<span class="set-item-badge badge-ran-errors" style="color:var(--success-color);"><i class="fa-solid fa-circle-check" style="margin-right:2px;"></i>0 err</span>`;
        }
    }
    if (missingCount > 0) {
        badges += `<span class="set-item-badge badge-warning">\u26A0 ${missingCount}</span>`;
    }

    // Show data button only when a patient is selected and has sessions for this set
    let dataBtn = '';
    if (status.sessions > 0) {
        dataBtn = `<button class="set-item-data-btn" onclick="event.stopPropagation(); viewSetQuickData('${s.id}')" title="Vedi dati"><i class="fa-solid fa-chart-line"></i></button>`;
    }

    return `<div class="set-dropdown-item${isSelected ? ' selected' : ''}" data-set-id="${s.id}" onclick="selectSetFromDropdown('${s.id}')">
        ${thumbHtml}
        <div class="set-item-info">
            <div class="set-item-name">${s.name}</div>
            <div class="set-item-meta">
                <span class="set-item-count">${s.items.length} stimoli</span>
                ${badges}
            </div>
        </div>
        ${dataBtn}
    </div>`;
}

window.changeSetDropdownSort = (sortBy) => {
    state._setDropdownSort = sortBy;
    updateDropdown(_dropdownSets);
};

window.toggleSetCategory = (catName) => {
    state._collapsedCats[catName] = !state._collapsedCats[catName];
    updateDropdown(_dropdownSets);
};

window.toggleSetDropdown = () => {
    const trigger = document.getElementById('set-dropdown-trigger');
    const panel = document.getElementById('set-dropdown-panel');
    if (!trigger || !panel) return;
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        closeSetDropdown();
    } else {
        closeModeDropdown();
        if (typeof closePatientDropdown === 'function') closePatientDropdown();
        trigger.classList.add('open');
        panel.classList.add('open');
        const sel = panel.querySelector('.set-dropdown-item.selected');
        if (sel) setTimeout(() => sel.scrollIntoView({ block: 'nearest' }), 50);
    }
};

function closeSetDropdown() {
    const trigger = document.getElementById('set-dropdown-trigger');
    const panel = document.getElementById('set-dropdown-panel');
    if (trigger) trigger.classList.remove('open');
    if (panel) panel.classList.remove('open');
}

window.selectSetFromDropdown = (setId) => {
    closeSetDropdown();
    loadSelectedSet(setId);
};

// Quick data access: open patient modal on activities tab, scrolled to this set
window.viewSetQuickData = async (setId) => {
    closeSetDropdown();
    const pid = state.activePatientId;
    if (!pid) return;
    state.patients = await DB.getAllPatients();
    if (typeof renderPatientModalDropdown === 'function') renderPatientModalDropdown(pid);
    document.getElementById('modal-patients').classList.add('open');
    loadPatientData(pid);
    // Wait for DOM, then switch to activities tab and scroll to this set
    setTimeout(() => {
        switchReportTab('activities', pid);
        setTimeout(() => {
            state._highlightSetId = setId;
            const content = document.getElementById('report-content');
            if (content) {
                const target = content.querySelector(`[data-set-id="${setId}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.style.outline = '2px solid var(--accent-color)';
                    target.style.borderRadius = '12px';
                    setTimeout(() => { target.style.outline = ''; }, 3000);
                }
            }
        }, 150);
    }, 100);
};

// Close all custom dropdowns when clicking outside
document.addEventListener('click', (e) => {
    const setDd = document.getElementById('set-dropdown');
    if (setDd && !setDd.contains(e.target)) closeSetDropdown();
    const modeDd = document.getElementById('mode-dropdown');
    if (modeDd && !modeDd.contains(e.target)) closeModeDropdown();
    const patDd = document.getElementById('patient-dropdown');
    if (patDd && !patDd.contains(e.target)) { if (typeof closePatientDropdown === 'function') closePatientDropdown(); }
});

// --- LOAD SET FROM DROPDOWN ---
window.loadSelectedSet = async (setId) => {
    const s = state.savedSets.find(x => x.id === setId);
    if (s) {
        const mode = document.getElementById('mode-select').value;
        const engine = getModeEngine(mode);
        const isScenarioMode = (engine === 'search_find' || engine === 'intraverbal_scenari');

        // For search_find / intraverbal_scenari: snapshot current set data before switching
        if (isScenarioMode && state.session.active && state.multiSetSession && state.multiSetSession.active) {
            _snapshotCurrentSetData();
        }

        state.activeSetId = setId;
        state.items = JSON.parse(JSON.stringify(s.items));
        // Update custom dropdown label & selection highlight
        const label = document.getElementById('set-dropdown-label');
        if (label) label.textContent = s.name;
        const panel = document.getElementById('set-dropdown-panel');
        if (panel) {
            panel.querySelectorAll('.set-dropdown-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.setId === setId);
            });
        }

        if (isScenarioMode && state.multiSetSession && state.multiSetSession.active) {
            // Continue multi-set session: reset per-set scoring but keep accumulated totals
            state.session.itemResults = {};
            state.session.scoreHistory = [];
            state.session.correct = 0;
            state.session.incorrect = 0;
            state.session.prompts = 0;
            state.session.total = 0;
            // Recalculate display totals from all accumulated sets
            _updateMultiSetScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            state._sfVariantIndex = 0; // Reset variant on set switch
            let playItems = state.items.filter(i => !i.hidden);
            // Apply active variant URLs
            const activeVariant = parseInt(document.getElementById('variant-select').value) || 0;
            if (activeVariant > 0 && typeof getItemVariantUrl === 'function') {
                playItems = playItems.map(item => {
                    const varUrl = getItemVariantUrl(item, activeVariant);
                    if (varUrl && varUrl !== item.url) return { ...item, url: varUrl, _originalUrl: item.url };
                    return item;
                });
            }
            state.session.playItems = playItems;
            renderGameMode(mode, playItems);
        } else {
            window.startGame();
        }
    }
};

// Snapshot current set's scoring data into multiSetSession
function _snapshotCurrentSetData() {
    if (!state.multiSetSession || !state.activeSetId) return;
    const results = Object.values(state.session.itemResults);
    if (results.length === 0) return; // nothing scored on this set

    const activeSet = state.savedSets.find(ss => ss.id === state.activeSetId);
    const rawV = results.filter(v => v === true).length;
    const rawP = results.filter(v => v === 'prompt').length;
    const rawX = results.filter(v => v === false).length;
    const total = rawV + rawP + rawX;

    state.multiSetSession.sets.push({
        setId: state.activeSetId,
        setName: activeSet?.name || 'Set Rimosso',
        setCat: activeSet?.category || '',
        correct: rawV,
        prompts: rawP,
        incorrect: rawX,
        total: total,
        percentage: total > 0 ? Math.round((rawV / total) * 100) : 0,
        variantIndex: state._sfVariantIndex || 0
    });
}

// Update score display to show accumulated totals across all sets
function _updateMultiSetScoreUI() {
    if (!state.multiSetSession) return;
    // Sum all snapshotted sets + current set
    let totalV = 0, totalP = 0, totalX = 0;
    state.multiSetSession.sets.forEach(s => {
        totalV += s.correct;
        totalP += s.prompts;
        totalX += s.incorrect;
    });
    // Add current (not yet snapshotted) set
    const currentResults = Object.values(state.session.itemResults);
    totalV += currentResults.filter(v => v === true).length;
    totalP += currentResults.filter(v => v === 'prompt').length;
    totalX += currentResults.filter(v => v === false).length;

    // Update the score display with accumulated totals
    const el = document.getElementById('score-display');
    let html = `${totalV}`;
    let tags = [];
    if (totalP > 0) tags.push(`<span style="font-size:0.65rem; color:var(--warning-color);">P${totalP}</span>`);
    if (totalX > 0) tags.push(`<span style="font-size:0.65rem; color:var(--danger-color);">X${totalX}</span>`);
    if (tags.length > 0) html += ` ${tags.join(' ')}`;
    el.innerHTML = html;
}

// --- LABEL TOGGLE ---
const LABEL_ENGINES = ['tact', 'ran', 'ran_intensivo', 'tombola', 'topologia', 'zoom'];

window.toggleLabelsVisibility = () => {
    const stage = document.getElementById('game-stage');
    const btn = document.getElementById('btn-toggle-labels');
    if (!stage) return;
    const isHidden = stage.classList.toggle('labels-hidden');
    if (btn) btn.classList.toggle('labels-off', isHidden);
    state._labelsHidden = isHidden;
};

window.toggleScoreButtonsVisibility = () => {
    const sc = document.getElementById('scoring-controls');
    const btn = document.getElementById('btn-toggle-score-buttons');
    if (!sc) return;
    const isHidden = sc.classList.toggle('score-btns-hidden');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = isHidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        btn.title = isHidden ? 'Mostra V/X/P' : 'Nascondi V/X/P (mantieni contatore)';
    }
    try { localStorage.setItem('score_buttons_hidden', isHidden ? '1' : '0'); } catch(e) {}
};

// Restore score buttons visibility on load
function _restoreScoreButtonsVisibility() {
    try {
        if (localStorage.getItem('score_buttons_hidden') === '1') {
            const sc = document.getElementById('scoring-controls');
            const btn = document.getElementById('btn-toggle-score-buttons');
            if (sc) sc.classList.add('score-btns-hidden');
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-eye';
                btn.title = 'Mostra V/X/P';
            }
        }
    } catch(e) {}
}
document.addEventListener('DOMContentLoaded', _restoreScoreButtonsVisibility);

window.toggleSecondaryControls = () => {
    const sec = document.getElementById('controls-secondary');
    const btn = sec ? sec.querySelector('.controls-toggle-btn') : null;
    if (!sec) return;
    const isCollapsed = sec.classList.toggle('collapsed');
    if (btn) btn.classList.toggle('expanded', !isCollapsed);
    try { localStorage.setItem('controls_secondary_collapsed', isCollapsed ? '1' : '0'); } catch(e) {}
};
function _restoreSecondaryControls() {
    try {
        if (localStorage.getItem('controls_secondary_collapsed') === '1') {
            const sec = document.getElementById('controls-secondary');
            if (sec) sec.classList.add('collapsed');
        }
    } catch(e) {}
}
document.addEventListener('DOMContentLoaded', _restoreSecondaryControls);

// --- POINTER / PEN TOOL ---
(function initPointerPen() {
    let penActive = false;
    let sPenHolding = false; // S-Pen barrel button temporary activation
    let manualActive = false; // User toggled via button
    let sPenAutoActive = false; // Auto-activated by S-Pen touch (no barrel)
    let drawing = false;
    let strokes = []; // { points: [{x,y,t}], color }
    let currentStroke = null;
    const FADE_MS = 2500;
    const LINE_WIDTH = 4;
    const PEN_COLOR = '#ff4444';
    let animFrameId = null;
    let sPenAutoDeactivateTimer = null;

    function getCanvas() { return document.getElementById('pointer-canvas'); }

    function resizeCanvas() {
        const canvas = getCanvas();
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    function getPos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function activatePen() {
        if (penActive) return;
        const canvas = getCanvas();
        if (!canvas) return;
        penActive = true;
        resizeCanvas();
        canvas.classList.add('active');
        const btn = document.getElementById('btn-pointer-pen');
        if (btn) btn.classList.add('pen-active');
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseleave', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', endDraw);
        canvas.addEventListener('touchcancel', endDraw);
        if (!animFrameId) animFrameId = requestAnimationFrame(renderLoop);
    }

    function deactivatePen() {
        if (!penActive) return;
        const canvas = getCanvas();
        if (!canvas) return;
        penActive = false;
        canvas.classList.remove('active');
        const btn = document.getElementById('btn-pointer-pen');
        if (btn) btn.classList.remove('pen-active');
        canvas.removeEventListener('mousedown', startDraw);
        canvas.removeEventListener('mousemove', moveDraw);
        canvas.removeEventListener('mouseup', endDraw);
        canvas.removeEventListener('mouseleave', endDraw);
        canvas.removeEventListener('touchstart', startDraw);
        canvas.removeEventListener('touchmove', moveDraw);
        canvas.removeEventListener('touchend', endDraw);
        canvas.removeEventListener('touchcancel', endDraw);
        strokes = [];
        currentStroke = null;
        drawing = false;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function startDraw(e) {
        if (!penActive) return;
        e.preventDefault();
        drawing = true;
        const canvas = getCanvas();
        const pos = getPos(e, canvas);
        currentStroke = { points: [{ x: pos.x, y: pos.y, t: Date.now() }], color: PEN_COLOR };
    }

    function moveDraw(e) {
        if (!drawing || !currentStroke) return;
        e.preventDefault();
        const canvas = getCanvas();
        const pos = getPos(e, canvas);
        currentStroke.points.push({ x: pos.x, y: pos.y, t: Date.now() });
    }

    function endDraw(e) {
        if (!drawing || !currentStroke) return;
        if (e) e.preventDefault();
        drawing = false;
        if (currentStroke.points.length > 0) strokes.push(currentStroke);
        currentStroke = null;
    }

    function renderLoop() {
        const canvas = getCanvas();
        if (!canvas) { animFrameId = null; return; }
        const ctx = canvas.getContext('2d');
        const now = Date.now();

        // Check if canvas needs resize
        const rect = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Remove fully faded strokes
        strokes = strokes.filter(s => {
            const lastT = s.points[s.points.length - 1].t;
            return now - lastT < FADE_MS;
        });

        // Draw strokes with fading
        [...strokes, ...(currentStroke ? [currentStroke] : [])].forEach(stroke => {
            if (stroke.points.length < 2) return;
            for (let i = 1; i < stroke.points.length; i++) {
                const p0 = stroke.points[i - 1];
                const p1 = stroke.points[i];
                const age = now - p1.t;
                const alpha = Math.max(0, 1 - age / FADE_MS);
                if (alpha <= 0) continue;
                ctx.beginPath();
                ctx.strokeStyle = stroke.color;
                ctx.globalAlpha = alpha;
                ctx.lineWidth = LINE_WIDTH;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
            }
        });
        ctx.globalAlpha = 1;

        if (penActive || strokes.length > 0 || currentStroke) {
            animFrameId = requestAnimationFrame(renderLoop);
        } else {
            animFrameId = null;
        }
    }

    window.togglePointerPen = () => {
        if (penActive && !sPenHolding) {
            manualActive = false;
            deactivatePen();
        } else {
            manualActive = true;
            sPenHolding = false;
            activatePen();
        }
    };

    // --- S-PEN BARREL BUTTON: auto-activate pointer while button is held ---
    // Detection strategy (Samsung WebView quirks):
    //   1. pointerdown with button=5 (W3C standard barrel button)
    //   2. pointerdown with button=2 (Samsung WebView maps barrel → right-click)
    //   3. pointermove with buttons bitmask containing bit 1 (=2, secondary)
    //      while pointerType='pen' — some Samsung WebView versions never fire a
    //      separate pointerdown for the barrel; the flag only appears mid-stroke.
    function isSPenBarrelDown(e) {
        if (e.pointerType !== 'pen') return false;
        return e.button === 5 || (e.button === 2 && !e.ctrlKey);
    }
    function isSPenBarrelHeld(e) {
        // Check buttons bitmask: bit 1 (value 2) = secondary button held
        if (e.pointerType !== 'pen') return false;
        return (e.buttons & 2) !== 0;
    }

    function startSPenStroke(e) {
        sPenHolding = true;
        activatePen();
        const canvas = getCanvas();
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            drawing = true;
            currentStroke = { points: [{ x: pos.x, y: pos.y, t: Date.now() }], color: PEN_COLOR };
        }
    }

    function endSPenStroke() {
        if (drawing && currentStroke) {
            drawing = false;
            if (currentStroke.points.length > 0) strokes.push(currentStroke);
            currentStroke = null;
        }
        sPenHolding = false;
        if (!manualActive) {
            setTimeout(() => {
                if (!sPenHolding && !manualActive) deactivatePen();
            }, FADE_MS + 100);
        }
    }

    // --- S-PEN AUTO-POINTER: auto-activate drawing when S Pen touches screen ---
    function startSPenAutoStroke(e) {
        if (sPenAutoDeactivateTimer) { clearTimeout(sPenAutoDeactivateTimer); sPenAutoDeactivateTimer = null; }
        sPenAutoActive = true;
        activatePen();
        const canvas = getCanvas();
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            drawing = true;
            currentStroke = { points: [{ x: pos.x, y: pos.y, t: Date.now() }], color: PEN_COLOR };
        }
    }

    function endSPenAutoStroke() {
        if (drawing && currentStroke) {
            drawing = false;
            if (currentStroke.points.length > 0) strokes.push(currentStroke);
            currentStroke = null;
        }
        if (!manualActive && !sPenHolding) {
            sPenAutoDeactivateTimer = setTimeout(() => {
                if (!sPenAutoActive || manualActive || sPenHolding) return;
                sPenAutoActive = false;
                deactivatePen();
            }, FADE_MS + 100);
        }
    }

    document.addEventListener('pointerdown', (e) => {
        // Barrel button detection (existing)
        if (isSPenBarrelDown(e)) {
            if (manualActive) return;
            e.preventDefault();
            startSPenStroke(e);
            return;
        }
        // S-Pen auto-pointer: pen tip touches screen without barrel button
        if (e.pointerType === 'pen' && !manualActive && !sPenHolding) {
            startSPenAutoStroke(e);
            return;
        }
    }, true);

    document.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'pen') return;

        // In-flight barrel detection: barrel button pressed mid-stroke
        if (!sPenHolding && !manualActive && !sPenAutoActive && isSPenBarrelHeld(e)) {
            e.preventDefault();
            startSPenStroke(e);
            return;
        }
        // Barrel released mid-stroke → end immediately
        if (sPenHolding && !isSPenBarrelHeld(e)) {
            endSPenStroke();
            return;
        }
        // S-Pen auto drawing in progress
        if (sPenAutoActive && drawing && currentStroke) {
            const canvas = getCanvas();
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                currentStroke.points.push({ x: pos.x, y: pos.y, t: Date.now() });
            }
            return;
        }
        if (!sPenHolding) return;
        if (!drawing || !currentStroke) return;
        e.preventDefault();
        const canvas = getCanvas();
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            currentStroke.points.push({ x: pos.x, y: pos.y, t: Date.now() });
        }
    }, true);

    document.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'pen') return;
        if (sPenAutoActive) { endSPenAutoStroke(); return; }
        if (!sPenHolding) return;
        endSPenStroke();
    }, true);

    document.addEventListener('pointercancel', (e) => {
        if (e.pointerType !== 'pen') return;
        if (sPenAutoActive) { endSPenAutoStroke(); return; }
        if (!sPenHolding) return;
        endSPenStroke();
    }, true);

    // Prevent context menu on S-Pen barrel button (often triggers right-click menu)
    document.addEventListener('contextmenu', (e) => {
        if (sPenHolding || (e.pointerType === 'pen' && (e.buttons & 2))) {
            e.preventDefault();
        }
    });

    // Keep canvas sized on window resize
    window.addEventListener('resize', () => { if (penActive) resizeCanvas(); });
})();

// --- START GAME ---
window.startGame = () => {
    // Clean up any active fluenza timer
    if (state.fluenzaTimerInterval) { clearInterval(state.fluenzaTimerInterval); state.fluenzaTimerInterval = null; }

    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);

    // Show/hide label toggle button
    const labelBtn = document.getElementById('btn-toggle-labels');
    if (labelBtn) {
        if (LABEL_ENGINES.includes(engine)) {
            labelBtn.classList.remove('hidden');
            // Restore previous label visibility state
            const stage = document.getElementById('game-stage');
            if (stage && state._labelsHidden) {
                stage.classList.add('labels-hidden');
                labelBtn.classList.add('labels-off');
            }
        } else {
            labelBtn.classList.add('hidden');
            const stage = document.getElementById('game-stage');
            if (stage) stage.classList.remove('labels-hidden');
        }
    }
    const isPoolMode = POOL_ENGINES.includes(engine);
    const numStimuli = parseInt(document.getElementById('num-stimuli').value);

    // For pool modes, build items from selected tags
    if (isPoolMode) {
        if (state.selectedPoolTags.length === 0) {
            document.getElementById('game-stage').innerHTML = `
                <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                    <i class="fa-solid fa-tags fa-3x" style="margin-bottom:15px;"></i>
                    <p>Seleziona almeno un <b>tag</b> dal selettore<br>per avviare la modalit&agrave; ${getModeLabel(mode)}.</p>
                </div>`;
            return;
        }

        state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
        updateScoreUI();
        document.getElementById('scoring-controls').classList.remove('hidden');
        document.getElementById('btn-save-session').classList.add('hidden');
        document.getElementById('btn-undo-marker').classList.remove('hidden');

        if (engine === 'pool_random' || engine === 'pool_intraverbal') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = (engine === 'pool_intraverbal' ? 'pool_iv_' : 'pool_') + state.selectedPoolTags.join('_');
            renderGameMode(mode, poolItems);
        } else if (engine === 'intruso') {
            state.activeSetId = 'intruso_' + state.selectedPoolTags.join('_');
            renderGameMode(mode, []);
        } else if (engine === 'categorizzazione') {
            state.activeSetId = 'cat_' + state.selectedPoolTags.join('_');
            renderGameMode(mode, []);
        } else if (engine === 'ricorda') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'ricorda';
            renderGameMode(mode, poolItems);
        } else if (engine === 'singolare_plurale') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'sp';
            renderGameMode(mode, poolItems);
        } else if (engine === 'stroop_numerico') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'strnum';
            renderGameMode(mode, poolItems);
        } else if (engine === 'go_nogo') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'gonogo';
            renderGameMode(mode, poolItems);
        } else if (engine === 'stroop_etichetta') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'stret';
            renderGameMode(mode, poolItems);
        } else if (engine === 'topologia_comp') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = 'topocomp_' + state.selectedPoolTags.join('_');
            renderGameMode(mode, poolItems);
        }
        window._startTDCountdown();
        return;
    }

    // Quaderno mode: no items needed, just render
    if (engine === 'quaderno' || engine === 'quaderno_task') {
        state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
        document.getElementById('scoring-controls').classList.add('hidden');
        document.getElementById('btn-save-session').classList.add('hidden');
        document.getElementById('btn-undo-marker').classList.remove('hidden');
        renderGameMode(mode, []);
        return;
    }

    // Memoria di Lavoro: self-contained, no set or tags needed
    if (engine === 'memoria_lavoro') {
        state.session = { correct: 0, incorrect: 0, prompts: 0, total: 0, active: true, itemResults: {}, scoreHistory: [] };
        state.activeSetId = 'memlav';
        updateScoreUI();
        document.getElementById('scoring-controls').classList.add('hidden');
        document.getElementById('btn-save-session').classList.add('hidden');
        const undoBtn = document.getElementById('btn-undo-marker');
        if (undoBtn) undoBtn.classList.add('hidden');
        renderGameMode(mode, []);
        return;
    }

    // Standard modes: require loaded items
    if (!state.items.length) return;

    // Update variant selector based on current set
    _updateVariantSelector();

    state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
    state._ranGridIndex = 0; // Reset RAN grid scoring index
    updateScoreUI();
    // Fluenza and Memory have their own built-in controls/scoring
    if (engine === 'fluenza' || engine === 'memory') {
        document.getElementById('scoring-controls').classList.add('hidden');
    } else {
        document.getElementById('scoring-controls').classList.remove('hidden');
    }
    document.getElementById('btn-save-session').classList.add('hidden');

    // Initialize multi-set session for search_find / intraverbal_scenari
    if (engine === 'search_find' || engine === 'intraverbal_scenari') {
        state.multiSetSession = { sets: [], active: true, mode: mode, engine: engine };
    } else {
        state.multiSetSession = null;
    }

    let playItems = state.items.filter(i => !i.hidden);

    if (engine !== 'search_find' && engine !== 'intraverbal_scenari') {
        playItems.sort(() => Math.random() - 0.5);
        if (numStimuli > 0 && playItems.length > numStimuli) {
            playItems = playItems.slice(0, numStimuli);
        }
    }

    // Grid size (for visual layout in grids)
    const gridSize = parseInt(document.getElementById('grid-size').value);
    if (engine !== 'search_find' && engine !== 'intraverbal_scenari' && gridSize !== 20) {
        const gridLimit = gridSize * gridSize;
        if (playItems.length > gridLimit) playItems = playItems.slice(0, gridLimit);
    }

    // Apply active variant URLs to play items
    const activeVariant = parseInt(document.getElementById('variant-select').value) || 0;
    if (activeVariant > 0 && typeof getItemVariantUrl === 'function') {
        playItems = playItems.map(item => {
            const varUrl = getItemVariantUrl(item, activeVariant);
            if (varUrl && varUrl !== item.url) {
                return { ...item, url: varUrl, _originalUrl: item.url };
            }
            return item;
        });
    }

    state.tactIndex = 0;
    state.ranIndex = 0;
    state._sfVariantIndex = 0; // Reset variant navigation for search_find/intraverbal
    state.session.playItems = playItems; // Store for per-item detail tracking

    // RAN Intensivo: build deck of exactly 20 stimuli from last session's errors
    if (engine === 'ran_intensivo') {
        const TARGET = 20;
        let errorItems = [];
        const patient = state.activePatientId ? state.patients.find(p => p.id === state.activePatientId) : null;
        if (patient && patient.history) {
            // Find last RAN or RAN Intensivo session for this set
            const ranSessions = patient.history.filter(h => h.setId === state.activeSetId && (h.mode === 'ran' || h.mode === 'ran_intensivo'));
            if (ranSessions.length > 0) {
                const lastSession = [...ranSessions].sort((a, b) => new Date(a.date) - new Date(b.date)).pop();
                if (lastSession.itemDetails && lastSession.itemDetails.length > 0) {
                    const errorLabels = lastSession.itemDetails.filter(d => d.result !== true).map(d => d.label);
                    if (errorLabels.length > 0) {
                        errorItems = playItems.filter(item => {
                            const label = item.label || item.l || '';
                            return errorLabels.includes(label);
                        });
                    }
                }
            }
        }
        // If no errors found or no history, use all items
        if (errorItems.length === 0) errorItems = [...playItems];
        // Build a fixed deck of exactly TARGET items by cycling through error items
        // Re-shuffle each cycle so the order varies throughout the deck
        const deck = [];
        let cycle = [...errorItems].sort(() => Math.random() - 0.5);
        for (let i = 0; i < TARGET; i++) {
            if (i > 0 && i % errorItems.length === 0) {
                cycle = [...errorItems].sort(() => Math.random() - 0.5);
            }
            deck.push(cycle[i % errorItems.length]);
        }

        state._ranIntensivo = {
            deck: deck,
            deckIndex: 0,
            totalCorrect: 0,
            totalErrors: 0,
            totalPrompts: 0,
            target: TARGET,
            errorCount: errorItems.length,
            allItems: playItems,
            completed: false
        };
    } else {
        state._ranIntensivo = null;
    }

    const undoBtn = document.getElementById('btn-undo-marker');
    if (undoBtn) undoBtn.classList.remove('hidden');
    renderGameMode(mode, playItems);
    // Start TD countdown for all modes at session start
    window._startTDCountdown();
};

// --- SCORING ---
window.recordResponse = (result) => {
    if (!state.session.active) return;
    window._stopTDCountdown();
    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);

    // Memory uses its own internal scoring driven by card flips
    if (engine === 'memory') return;

    if (!state.session.scoreHistory) state.session.scoreHistory = [];

    if (engine === 'ran_intensivo' && state._ranIntensivo) {
        const ri = state._ranIntensivo;
        if (ri.completed) return;
        const currentItem = ri.deck[ri.deckIndex];
        const label = currentItem.label || currentItem.l || '';

        // Record per-item result using a unique key
        const resultKey = 'ri_' + Date.now();
        state.session.itemResults[resultKey] = result;
        state.session.scoreHistory.push(resultKey);
        // Also track label-keyed details for itemDetails saving
        if (!state.session._riDetails) state.session._riDetails = [];
        state.session._riDetails.push({ label, result });

        // Visual feedback
        const targetImg = document.querySelector('.ran-main-img');
        if (targetImg) {
            targetImg.classList.remove('feedback-success', 'feedback-fail', 'feedback-prompt');
            void targetImg.offsetWidth;
            if (result === 'prompt') targetImg.classList.add('feedback-prompt');
            else targetImg.classList.add(result ? 'feedback-success' : 'feedback-fail');
        }

        if (result === true) {
            ri.totalCorrect++;
        } else if (result === 'prompt') {
            ri.totalPrompts++;
        } else {
            ri.totalErrors++;
        }

        // Check completion: stop after presenting all stimuli in the fixed deck
        const totalPresented = ri.totalCorrect + ri.totalErrors + ri.totalPrompts;
        if (totalPresented >= ri.target || ri.deckIndex >= ri.deck.length - 1) {
            ri.completed = true;
            const results = Object.values(state.session.itemResults);
            state.session.correct = results.filter(v => v === true).length;
            state.session.incorrect = results.filter(v => v === false).length;
            state.session.prompts = results.filter(v => v === 'prompt').length;
            state.session.total = results.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            const stage = document.getElementById('game-stage');
            if (stage) {
                stage.innerHTML = `<div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px;">
                    <i class="fa-solid fa-trophy fa-3x" style="color:var(--warning-color); margin-bottom:15px;"></i>
                    <p style="font-size:1.3rem; font-weight:bold; color:var(--success-color);">Sessione completata!</p>
                    <p style="color:var(--text-secondary);">${ri.totalCorrect} corrette, ${ri.totalErrors} errori, ${ri.totalPrompts} prompt su ${totalPresented} stimoli</p>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:10px;">Salva la sessione per registrare i risultati.</p>
                </div>`;
            }
            return;
        }

        // Advance to next item in the fixed deck
        setTimeout(() => {
            ri.deckIndex++;
            renderGameMode(mode, ri.allItems);
            const results2 = Object.values(state.session.itemResults);
            state.session.correct = results2.filter(v => v === true).length;
            state.session.incorrect = results2.filter(v => v === false).length;
            state.session.prompts = results2.filter(v => v === 'prompt').length;
            state.session.total = results2.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            window._startTDCountdown();
        }, 350);
        return;
    } else if (engine === 'tact' || (engine === 'ran' && state.ranMode === 'single')) {
        const currentIndex = (engine === 'tact') ? state.tactIndex : state.ranIndex;
        state.session.itemResults[currentIndex] = result;
        if (state.session.scoreHistory[state.session.scoreHistory.length - 1] !== currentIndex) {
            state.session.scoreHistory.push(currentIndex);
        }

        const targetImg = document.querySelector('.tact-card-lg img, .ran-main-img');
        if (targetImg) {
            targetImg.classList.remove('feedback-success', 'feedback-fail', 'feedback-prompt');
            void targetImg.offsetWidth;
            if (result === 'prompt') targetImg.classList.add('feedback-prompt');
            else targetImg.classList.add(result ? 'feedback-success' : 'feedback-fail');
        }

        // Auto-advance to next stimulus after scoring (normal RAN single mode)
        if (engine === 'ran' && state.ranMode === 'single') {
            const maxIdx = state.ranDisplayItems.length - 1;
            if (state.ranIndex < maxIdx) {
                setTimeout(() => {
                    state.ranIndex++;
                    updateRanContent();
                    window._startTDCountdown();
                }, 350);
            }
        }
    } else if (engine === 'search_find' || engine === 'intraverbal_scenari') {
        const markers = document.querySelectorAll('.marker-pin');
        let scoredId = null;
        if (markers.length > 0) {
            const lastMarker = markers[markers.length - 1];
            if (!lastMarker.dataset.id) lastMarker.dataset.id = Date.now().toString();
            scoredId = lastMarker.dataset.id;
            state.session.itemResults[scoredId] = result;
            lastMarker.classList.remove('success', 'fail', 'prompt');
            if (result === 'prompt') lastMarker.classList.add('prompt');
            else lastMarker.classList.add(result ? 'success' : 'fail');
        } else if (engine === 'intraverbal_scenari') {
            scoredId = Date.now().toString();
            state.session.itemResults[scoredId] = result;
        }
        if (scoredId && state.session.scoreHistory[state.session.scoreHistory.length - 1] !== scoredId) {
            state.session.scoreHistory.push(scoredId);
        }
    } else if (engine === 'ran' && state.ranMode === 'grid') {
        // RAN grid mode: track per-item results using a running index
        // so itemDetails can be saved for RAN Intensivo error tracking
        if (state._ranGridIndex == null) state._ranGridIndex = 0;
        const currentIndex = state._ranGridIndex;
        state.session.itemResults[currentIndex] = result;
        state.session.scoreHistory.push(currentIndex);
        state._ranGridIndex++;
    } else if (engine === 'ricorda') {
        // Ricorda: score the last revealed card via floating buttons, then auto-flip back
        const idx = state._ricordaLastRevealed;
        if (idx === null || idx === undefined) return;
        const resultKey = 'ricorda_' + idx + '_' + Date.now();
        state.session.itemResults[resultKey] = result;
        state.session.scoreHistory.push(resultKey);
        // Delegate visual feedback + auto-flip to game-modes handler
        if (typeof window._ricordaHandleScore === 'function') window._ricordaHandleScore(result);
    } else if (engine === 'singolare_plurale') {
        if (typeof window._spHandleScore === 'function') {
            window._spHandleScore(result);
            const results0 = Object.values(state.session.itemResults);
            state.session.correct = results0.filter(v => v === true).length;
            state.session.incorrect = results0.filter(v => v === false).length;
            state.session.prompts = results0.filter(v => v === 'prompt').length;
            state.session.total = results0.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            return;
        }
    } else if (engine === 'stroop_numerico') {
        if (typeof window._stroopNumHandleScore === 'function') {
            window._stroopNumHandleScore(result);
            const results0 = Object.values(state.session.itemResults);
            state.session.correct = results0.filter(v => v === true).length;
            state.session.incorrect = results0.filter(v => v === false).length;
            state.session.prompts = results0.filter(v => v === 'prompt').length;
            state.session.total = results0.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            return;
        }
    } else if (engine === 'go_nogo') {
        if (typeof window._goNogoHandleScore === 'function') {
            window._goNogoHandleScore(result);
            const results0 = Object.values(state.session.itemResults);
            state.session.correct = results0.filter(v => v === true).length;
            state.session.incorrect = results0.filter(v => v === false).length;
            state.session.prompts = results0.filter(v => v === 'prompt').length;
            state.session.total = results0.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            return;
        }
    } else if (engine === 'stroop_etichetta') {
        if (typeof window._stroopEtHandleScore === 'function') {
            window._stroopEtHandleScore(result);
            const results0 = Object.values(state.session.itemResults);
            state.session.correct = results0.filter(v => v === true).length;
            state.session.incorrect = results0.filter(v => v === false).length;
            state.session.prompts = results0.filter(v => v === 'prompt').length;
            state.session.total = results0.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            return;
        }
    } else if (engine === 'topologia_comp') {
        if (typeof window._topoCompHandleScore === 'function') {
            window._topoCompHandleScore(result);
            const results0 = Object.values(state.session.itemResults);
            state.session.correct = results0.filter(v => v === true).length;
            state.session.incorrect = results0.filter(v => v === false).length;
            state.session.prompts = results0.filter(v => v === 'prompt').length;
            state.session.total = results0.length;
            updateScoreUI();
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            return;
        }
    } else if (engine === 'memoria_lavoro') {
        if (typeof window._memLavHandleScore === 'function') {
            window._memLavHandleScore(result);
            return;
        }
    } else {
        const id = Date.now().toString();
        state.session.itemResults[id] = result;
        state.session.scoreHistory.push(id);
    }

    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.prompts = results.filter(v => v === 'prompt').length;
    state.session.total = results.length;

    // For multi-set scenario modes, show accumulated totals
    if (state.multiSetSession && state.multiSetSession.active) {
        _updateMultiSetScoreUI();
    } else {
        updateScoreUI();
    }
    document.getElementById('btn-save-session').classList.remove('hidden');
    if (typeof showSessionNameInput === 'function') showSessionNameInput();

    // Restart TD countdown after every response (for modes without auto-advance)
    window._startTDCountdown();
};

function updateScoreUI() {
    const el = document.getElementById('score-display');
    const prompts = state.session.prompts || 0;
    const errors = state.session.incorrect || 0;

    let html = `${state.session.correct}`;
    let tags = [];
    if (prompts > 0) {
        tags.push(`<span style="font-size:0.65rem; color:var(--warning-color);">P${prompts}</span>`);
    }
    if (errors > 0) {
        tags.push(`<span style="font-size:0.65rem; color:var(--danger-color);">X${errors}</span>`);
    }

    if (tags.length > 0) {
        html += ` ${tags.join(' ')}`;
    }
    el.innerHTML = html;
}

// --- SESSION TYPE SELECTOR ---
window.onSessionTypeChange = () => {
    const type = document.getElementById('session-type-select').value;
    const tdWrapper = document.getElementById('td-seconds-wrapper');
    const btnX = document.getElementById('btn-score-x');
    const timerWrapper = document.getElementById('td-timer-wrapper');

    if (type === 'timedelay') {
        tdWrapper.style.display = '';
        // Time Delay: show P + V, hide X
        if (btnX) btnX.style.display = 'none';
        if (timerWrapper) timerWrapper.style.display = '';
    } else {
        tdWrapper.style.display = 'none';
        // Independent: show X + V, hide P
        if (btnX) btnX.style.display = '';
        if (timerWrapper) timerWrapper.style.display = 'none';
        window._stopTDCountdown();
    }
};

function getSelectedSessionType() {
    const sel = document.getElementById('session-type-select');
    return sel ? sel.value : 'independent';
}

function getSelectedTDSeconds() {
    const input = document.getElementById('td-seconds-ctrl');
    return input ? (parseInt(input.value) || 5) : 5;
}

// --- TIME-DELAY COUNTDOWN RING ---
// A subtle SVG ring around the "P" prompt button that depletes over the configured seconds.
// Visibility is controlled by the setting 'td_timer_visible' in localStorage.
(function() {
    let _tdTimerId = null;
    let _tdStartTime = 0;
    let _tdDuration = 0;

    function isTDTimerVisible() {
        return localStorage.getItem('td_timer_visible') !== 'false'; // default: visible
    }

    window._startTDCountdown = () => {
        window._stopTDCountdown();
        const type = getSelectedSessionType();
        if (type !== 'timedelay') return;
        if (!state.session.active) return;

        const ring = document.getElementById('td-ring');
        const progress = document.getElementById('td-ring-progress');
        if (!ring || !progress) return;

        // Show/hide based on setting
        ring.style.opacity = isTDTimerVisible() ? '1' : '0';

        _tdDuration = getSelectedTDSeconds() * 1000;
        _tdStartTime = performance.now();
        const circumference = 2 * Math.PI * 30; // r=30

        const tick = () => {
            const elapsed = performance.now() - _tdStartTime;
            const remaining = Math.max(0, 1 - elapsed / _tdDuration);
            progress.style.strokeDashoffset = String(circumference * (1 - remaining));

            if (remaining > 0) {
                _tdTimerId = requestAnimationFrame(tick);
            } else {
                // Timer expired — ring is fully depleted
                _tdTimerId = null;
            }
        };
        _tdTimerId = requestAnimationFrame(tick);
    };

    window._stopTDCountdown = () => {
        if (_tdTimerId) {
            cancelAnimationFrame(_tdTimerId);
            _tdTimerId = null;
        }
        const progress = document.getElementById('td-ring-progress');
        if (progress) progress.style.strokeDashoffset = '0';
    };

    // Expose visibility check for settings
    window._isTDTimerVisible = isTDTimerVisible;
})();

// --- KEYBOARD SHORTCUTS ---
function handleShortcuts(e) {
    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);
    if (state.session.active && engine !== 'fluenza' && engine !== 'memory' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        const type = getSelectedSessionType();
        if (e.key.toLowerCase() === 'v') recordResponse(true);
        if (type === 'independent' && e.key.toLowerCase() === 'x') recordResponse(false);
        if (type === 'timedelay' && e.key.toLowerCase() === 'p') recordResponse('prompt');
    }
    if (engine === 'ran' && state.ranMode === 'single') {
        if (e.key === 'ArrowRight') nextRan();
        if (e.key === 'ArrowLeft') prevRan();
    }
    if (engine === 'fluenza') {
        if (e.key === 'ArrowRight') fluenzaNext();
        if (e.key.toLowerCase() === 'x') fluenzaMarkError();
        if (e.key.toLowerCase() === 'e') { state.fluenzaHideLabels = !state.fluenzaHideLabels; renderFluenzaUI(document.getElementById('game-stage')); }
    }
    if (engine === 'search_find' || engine === 'intraverbal_scenari') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (typeof window.undoLastAction === 'function') window.undoLastAction(); }
        if (e.key === 'Delete' || e.key === 'Backspace') clearMarkers();
        // Variant navigation (only when not in fullscreen)
        const isFs = document.querySelector('.app-shell')?.classList.contains('game-fullscreen');
        if (!isFs) {
            if (e.key === 'ArrowRight' && typeof window.sfNextVariant === 'function') sfNextVariant();
            if (e.key === 'ArrowLeft' && typeof window.sfPrevVariant === 'function') sfPrevVariant();
        }
    }
    // Global undo fallback
    if (!(engine === 'search_find' || engine === 'intraverbal_scenari') && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typeof window.undoLastAction === 'function') window.undoLastAction();
    }
    // Pointer/pen toggle shortcut — "D" key (Draw) from anywhere
    if (e.key.toLowerCase() === 'd' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (typeof window.togglePointerPen === 'function') window.togglePointerPen();
    }
    // Fullscreen game area shortcut — "F" key
    if (e.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (typeof window.toggleGameFullscreen === 'function') window.toggleGameFullscreen();
    }
    // Child lock shortcut — "L" key
    if (e.key.toLowerCase() === 'l' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (typeof window.toggleGlobalScrollLock === 'function') window.toggleGlobalScrollLock();
    }
    // Label toggle shortcut — "E" key (Etichette)
    if (e.key.toLowerCase() === 'e' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (typeof window.toggleLabelsVisibility === 'function') window.toggleLabelsVisibility();
    }
    // Skip round shortcut — "S" key
    if (e.key.toLowerCase() === 's' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const skipEngine = (typeof getModeEngine === 'function') ? getModeEngine(document.getElementById('mode-select').value) : '';
        if (skipEngine === 'intruso' && typeof window.skipIntrusoRound === 'function') window.skipIntrusoRound();
        else if (skipEngine === 'categorizzazione' && typeof window.skipCatRound === 'function') window.skipCatRound();
    }
}

// --- SAVE SESSION (uses dropdown type, no modal) ---
// Shows a note prompt overlay, then saves when user confirms
window.confirmSaveSession = async () => {
    if (!state.activePatientId) return alert("Seleziona prima un paziente in alto.");
    const p = state.patients.find(x => x.id === state.activePatientId);
    if (!p) return;

    // Quaderno/Task Analysis: delegate to their own save handler
    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);
    if ((engine === 'quaderno' || engine === 'quaderno_task') && typeof window.saveQuadernoSession === 'function') {
        return window.saveQuadernoSession();
    }

    // Show note prompt overlay
    _showSessionNotePrompt(async (noteText) => {
        await _doSaveSession(p, noteText);
    });
};

// Note prompt overlay for session save
function _showSessionNotePrompt(onConfirm) {
    // Remove any existing overlay
    const existing = document.getElementById('session-note-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'session-note-overlay';
    overlay.className = 'session-note-overlay';
    overlay.innerHTML = `
        <div class="session-note-dialog">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="margin:0; color:var(--accent-color); font-size:0.95rem;"><i class="fa-solid fa-sticky-note"></i> Nota sessione (opzionale)</h4>
                <button onclick="this.closest('.session-note-overlay').remove()" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.1rem;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="daily-note-toolbar" style="border-radius:8px 8px 0 0; margin-bottom:0;">${_noteToolbarHtml()}</div>
            <div id="session-note-editable" class="note-wysiwyg note-wysiwyg-sm" contenteditable="true" data-placeholder="Aggiungi una nota per questa sessione..."></div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
                <button id="session-note-cancel" class="btn btn-ghost" style="padding:6px 16px; font-size:0.85rem;">Annulla</button>
                <button id="session-note-save" class="btn btn-primary" style="padding:6px 16px; font-size:0.85rem;"><i class="fa-solid fa-floppy-disk"></i> Salva</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const editable = document.getElementById('session-note-editable');
    const saveBtn = document.getElementById('session-note-save');
    const cancelBtn = document.getElementById('session-note-cancel');

    saveBtn.onclick = () => {
        const note = (typeof _editableHtmlToMarkup === 'function' ? _editableHtmlToMarkup(editable) : (editable.textContent || '')).trim();
        overlay.remove();
        onConfirm(note || '');
    };
    cancelBtn.onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    editable.focus();
}

async function _doSaveSession(p, noteText) {
    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);
    const type = getSelectedSessionType();

    const isMultiSet = state.multiSetSession && state.multiSetSession.active &&
        (engine === 'search_find' || engine === 'intraverbal_scenari');

    // --- Multi-set session save (search_find / intraverbal_scenari) ---
    if (isMultiSet) {
        // Snapshot current set data first
        _snapshotCurrentSetData();

        const allSets = state.multiSetSession.sets;
        if (allSets.length === 0) return alert("Nessun dato registrato.");

        // Calculate totals across all sets
        let totalV = 0, totalP = 0, totalX = 0;
        allSets.forEach(s => {
            totalV += s.correct;
            totalP += s.prompts;
            totalX += s.incorrect;
        });
        const totalAll = totalV + totalP + totalX;
        if (totalAll === 0) return;

        const nameInput = document.getElementById('session-name-input');
        let customName = nameInput ? nameInput.value.trim() : '';
        // Default name: list of set names
        const setNames = allSets.map(s => s.setName);
        const defaultName = setNames.length > 1
            ? setNames[0] + ` (+${setNames.length - 1})`
            : setNames[0] || 'Scenari';
        const setName = customName || defaultName;
        if (customName) saveCustomSessionName(customName);

        // Capture field size
        const fieldVal = parseInt(document.getElementById('num-stimuli').value);
        const fieldSize = fieldVal > 0 ? fieldVal : (state.session.playItems ? state.session.playItems.length : totalAll);

        const sessionData = {
            date: new Date().toISOString(),
            setId: 'multi_' + allSets.map(s => s.setId).join('_'),
            setName: setName,
            setCat: allSets[0]?.setCat || '',
            mode: mode,
            correct: totalV,
            prompts: totalP,
            total: totalAll,
            percentage: Math.round((totalV / totalAll) * 100),
            sessionType: type,
            fieldSize: fieldSize,
            variant: parseInt(document.getElementById('variant-select').value) || 0,
            rawV: totalV,
            rawP: totalP,
            rawX: totalX,
            // Per-set breakdown (like taskSteps for task analysis)
            setBreakdown: allSets.map(s => ({
                setId: s.setId,
                setName: s.setName,
                setCat: s.setCat,
                correct: s.correct,
                prompts: s.prompts,
                incorrect: s.incorrect,
                total: s.total,
                percentage: s.percentage,
                variantIndex: s.variantIndex
            }))
        };

        if (noteText) sessionData.note = noteText;

        if (type === 'timedelay') {
            sessionData.timeDelaySeconds = getSelectedTDSeconds();
        }

        if (!p.history) p.history = [];
        p.history.push(sessionData);
        await DB.savePatient(p);

        const btn = document.getElementById('btn-save-session');
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.style.background = 'var(--success-color)';
        if (nameInput) nameInput.value = '';

        // Reset multi-set session
        state.multiSetSession = null;

        // Refresh set dropdown so last-run % updates immediately
        if (typeof filterSetsByMode === 'function') filterSetsByMode();

        setTimeout(() => {
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
            btn.style.background = '#2563eb';
            state.session.active = false;
            document.getElementById('scoring-controls').classList.add('hidden');
            btn.classList.add('hidden');
            const sessionNameWrapper = document.getElementById('session-name-wrapper');
            if (sessionNameWrapper) sessionNameWrapper.classList.add('hidden');
        }, 1000);
        return;
    }

    // --- Standard single-set session save ---
    const total = state.session.total;
    if (total === 0) return;

    const results = Object.values(state.session.itemResults);
    const rawV = results.filter(v => v === true).length;
    const rawP = results.filter(v => v === 'prompt').length;
    const rawX = results.filter(v => v === false).length;
    const rawTotal = rawV + rawP + rawX;

    let defaultName;
    let setCat = '';
    if (AGGREGATE_POOL_MODES.includes(engine)) {
        // Aggregate per mode regardless of tags; the tags used are recorded per session
        defaultName = MODES_CONFIG[mode] || getModeLabel(mode);
    } else if (POOL_ENGINES.includes(engine)) {
        defaultName = 'Pool: ' + state.selectedPoolTags.join(', ');
    } else if (engine === 'memoria_lavoro') {
        const themeLabel = (state._memLavState && typeof MEM_LAV_THEMES !== 'undefined' && MEM_LAV_THEMES[state._memLavState.theme])
            ? MEM_LAV_THEMES[state._memLavState.theme].label : 'Memoria';
        defaultName = 'Memoria di Lavoro: ' + themeLabel;
    } else {
        const activeSet = state.savedSets.find(ss => ss.id === state.activeSetId);
        defaultName = activeSet?.name || "Set Rimosso";
        setCat = activeSet?.category || '';
    }

    const nameInput = document.getElementById('session-name-input');
    let customName = nameInput ? nameInput.value.trim() : '';
    const setName = customName || defaultName;
    if (customName) saveCustomSessionName(customName);

    const correct = rawV; // In both modes, only V = correct

    // Capture field size
    const fieldVal = parseInt(document.getElementById('num-stimuli').value);
    const fieldSize = fieldVal > 0 ? fieldVal : (state.session.playItems ? state.session.playItems.length : rawTotal);

    const sessionData = {
        date: new Date().toISOString(),
        setId: state.activeSetId,
        setName: setName,
        setCat: setCat,
        mode: mode,
        correct: correct,
        prompts: rawP,
        total: rawTotal,
        percentage: Math.round((correct / rawTotal) * 100),
        sessionType: type,
        fieldSize: fieldSize,
        variant: parseInt(document.getElementById('variant-select').value) || 0,
        rawV: rawV,
        rawP: rawP,
        rawX: rawX
    };

    if (noteText) sessionData.note = noteText;

    // Record which tags were used (for pool modes), so aggregated activities still
    // show the stimulus source per session.
    if (POOL_ENGINES.includes(engine) && state.selectedPoolTags && state.selectedPoolTags.length > 0) {
        sessionData.poolTags = [...state.selectedPoolTags];
    }

    if (type === 'timedelay') {
        sessionData.timeDelaySeconds = getSelectedTDSeconds();
    }

    // Fluenza: store duration and use count-based scoring
    if (engine === 'fluenza') {
        sessionData.fluenzaDuration = state.fluenzaTimerDuration;
        sessionData.correct = state.fluenzaCount - state.fluenzaErrors;
        sessionData.total = state.fluenzaCount;
        sessionData.rawV = sessionData.correct;
        sessionData.rawX = state.fluenzaErrors;
        sessionData.rawP = 0;
        sessionData.prompts = 0;
        sessionData.percentage = sessionData.total > 0 ? Math.round((sessionData.correct / sessionData.total) * 100) : 0;
    }

    // Sequenze phase (seriazione / racconto)
    if (state.session.sequenzePhase) {
        sessionData.sequenzePhase = state.session.sequenzePhase;
        const stimCount = state.sequenzeCorrectOrder ? state.sequenzeCorrectOrder.length : sessionData.total;
        const phaseLabel = state.session.sequenzePhase === 'racconto' ? 'Racconto' : 'Seriazione';
        sessionData.setName = setName + ` [${phaseLabel} ${stimCount}]`;
    }

    // Memory: efficiency-based scoring + completion metrics
    if (engine === 'memory' && state.memory) {
        const m = state.memory;
        const scored = m.matches + m.memoryErrors;
        sessionData.correct = m.matches;
        sessionData.rawV = m.matches;
        sessionData.rawX = m.memoryErrors;
        sessionData.rawP = 0;
        sessionData.prompts = 0;
        sessionData.total = scored;
        sessionData.percentage = scored > 0 ? Math.round((m.matches / scored) * 100) : 0;
        sessionData.memoryStats = {
            totalPairs: m.totalPairs,
            matches: m.matches,
            pairAttempts: m.pairAttempts,
            memoryErrors: m.memoryErrors,
            discoveries: m.discoveries,
            efficiency: sessionData.percentage,
            durationSeconds: m.endTime && m.startTime ? Math.round((m.endTime - m.startTime) / 1000) : 0,
            completed: m.completed
        };
    }

    // Topologia Compositiva: personaggio, positions, per-position breakdown
    if (engine === 'topologia_comp' && state._topoCompState) {
        const tc = state._topoCompState;
        sessionData.topoSubMode = tc.subMode;
        if (tc.personaggio) {
            sessionData.topoPersonaggio = tc.personaggio.label || null;
        }
        sessionData.topoEnabledPositions = [...tc.enabledPositions];
        const breakdown = [];
        for (const pos of tc.enabledPositions) {
            const ps = tc.positionStats[pos];
            if (!ps || ps.total === 0) continue;
            breakdown.push({
                position: pos,
                label: (typeof TOPO_POSITIONS !== 'undefined' && TOPO_POSITIONS[pos]) ? TOPO_POSITIONS[pos].label : pos,
                correct: ps.correct,
                prompts: ps.prompts,
                incorrect: ps.incorrect,
                total: ps.total,
                percentage: Math.round((ps.correct / ps.total) * 100)
            });
        }
        if (breakdown.length > 0) sessionData.topoBreakdown = breakdown;
    }

    // Memoria di Lavoro: theme, span, trial results with per-position detail
    if (engine === 'memoria_lavoro' && state._memLavState) {
        const ml = state._memLavState;
        sessionData.memLavTheme = ml.theme;
        sessionData.memLavSpan = ml.span;
        if (ml.trials && ml.trials.length > 0) {
            sessionData.memLavTrials = ml.trials.map(t => ({
                sequence: t.sequence,
                response: t.response,
                result: t.result,
                span: t.span,
                positionAttempts: t.positionAttempts,
                positionErrors: t.positionErrors,
                positionResults: t.positionResults,
                totalErrors: t.totalErrors
            }));
        }
    }

    // Go/No-Go: breakdown of correct/incorrect/prompt split by Go vs No-Go stimuli
    if (engine === 'go_nogo') {
        const gn = { go: { correct: 0, incorrect: 0, prompts: 0 }, nogo: { correct: 0, incorrect: 0, prompts: 0 } };
        Object.entries(state.session.itemResults).forEach(([key, res]) => {
            const cat = key.includes('_nogo_') ? 'nogo' : (key.includes('_go_') ? 'go' : null);
            if (!cat) return;
            if (res === true) gn[cat].correct++;
            else if (res === 'prompt') gn[cat].prompts++;
            else if (res === false) gn[cat].incorrect++;
        });
        const goTotal = gn.go.correct + gn.go.incorrect + gn.go.prompts;
        const nogoTotal = gn.nogo.correct + gn.nogo.incorrect + gn.nogo.prompts;
        sessionData.goNogoBreakdown = {
            go: { ...gn.go, total: goTotal, percentage: goTotal > 0 ? Math.round((gn.go.correct / goTotal) * 100) : 0 },
            nogo: { ...gn.nogo, total: nogoTotal, percentage: nogoTotal > 0 ? Math.round((gn.nogo.correct / nogoTotal) * 100) : 0 }
        };
        if (state._goNogoState && state._goNogoState.noGoTag) sessionData.goNogoTag = state._goNogoState.noGoTag;
    }

    // Save per-item details for modes with labeled items
    if (engine === 'memory' && state.memory) {
        sessionData.itemDetails = Object.entries(state.memory.pairDetails).map(([label, d]) => ({
            label: label,
            attempts: d.attempts,
            errors: Math.max(0, d.attempts - 1),
            result: d.attempts === 1
        }));
    } else if (engine === 'ran_intensivo' && state.session._riDetails && state.session._riDetails.length > 0) {
        sessionData.itemDetails = state.session._riDetails;
    } else if (engine === 'singolare_plurale' && state.session._spDetails && state.session._spDetails.length > 0) {
        sessionData.itemDetails = state.session._spDetails.map(d => ({
            label: d.form === 'plural' ? `${d.label} (${d.count})` : `${d.label} (sing.)`,
            result: d.result
        }));
        sessionData.spSubMode = state.spState?.subMode;
    } else {
        const playItems = state.session.playItems || [];
        if (playItems.length > 0 && Object.keys(state.session.itemResults).length > 0) {
            const itemDetails = [];
            for (const [key, result] of Object.entries(state.session.itemResults)) {
                const idx = parseInt(key);
                const item = !isNaN(idx) ? playItems[idx] : null;
                const label = item ? (item.label || item.l || `Item ${idx + 1}`) : null;
                if (label) {
                    itemDetails.push({ label, result });
                }
            }
            if (itemDetails.length > 0) {
                sessionData.itemDetails = itemDetails;
            }
        }
    }

    if (!p.history) p.history = [];
    p.history.push(sessionData);
    await DB.savePatient(p);

    const btn = document.getElementById('btn-save-session');
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    btn.style.background = 'var(--success-color)';
    if (nameInput) nameInput.value = '';

    // Refresh set dropdown so last-run % updates immediately
    if (typeof filterSetsByMode === 'function') filterSetsByMode();

    setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
        btn.style.background = '#2563eb';
        state.session.active = false;
        document.getElementById('scoring-controls').classList.add('hidden');
        btn.classList.add('hidden');
        const sessionNameWrapper = document.getElementById('session-name-wrapper');
        if (sessionNameWrapper) sessionNameWrapper.classList.add('hidden');
    }, 1000);
}

// Show session name input when session becomes saveable
window.showSessionNameInput = () => {
    const wrapper = document.getElementById('session-name-wrapper');
    if (wrapper) {
        wrapper.classList.remove('hidden');
        // Setup custom autocomplete with recent names
        const names = getRecentSessionNames();
        setupCustomAutocomplete('session-name-input', names);
    }
};

// --- LIBRARY ---
window.openLibrary = async () => {
    await reloadLibrary();
    document.getElementById('modal-library').classList.add('open');
};

window.closeLibrary = () => document.getElementById('modal-library').classList.remove('open');

window.reloadLibrary = async () => {
    state.savedSets = await DB.getAllSets();
    refreshAllTags();
    renderLibList();
    const badge = document.getElementById('lib-count');
    if (badge) badge.innerText = state.savedSets.length;
    if (typeof filterSetsByMode === 'function') filterSetsByMode();
};

// --- LIBRARY LIST ---
if (!state._libSort) state._libSort = 'category';
if (!state._libCollapsed) state._libCollapsed = {};

function renderLibSortBar() {
    const bar = document.getElementById('lib-sort-bar');
    if (!bar) return;
    const sortBy = state._libSort || 'category';
    const opts = [
        { key: 'category', icon: 'fa-folder', label: 'Categoria' },
        { key: 'name', icon: 'fa-font', label: 'Nome' },
        { key: 'recent', icon: 'fa-clock', label: 'Recenti' },
        { key: 'items-desc', icon: 'fa-arrow-down-9-1', label: 'Field' },
        { key: 'modes', icon: 'fa-gamepad', label: 'Modalit\u00E0' }
    ];
    bar.innerHTML = opts.map(o =>
        `<button class="${sortBy === o.key ? 'active' : ''}" onclick="changeLibSort('${o.key}')">
            <i class="fa-solid ${o.icon}"></i> ${o.label}
        </button>`
    ).join('');
}

window.changeLibSort = (sortBy) => {
    state._libSort = sortBy;
    renderLibList();
};

window.toggleLibCategory = (catName) => {
    state._libCollapsed[catName] = !state._libCollapsed[catName];
    renderLibList();
};

function renderLibList() {
    const container = document.getElementById('lib-list');
    if (!container) return;
    renderLibSortBar();

    if (state.savedSets.length === 0) {
        container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:40px;">Nessun set in archivio.</p>';
        return;
    }

    const sortBy = state._libSort || 'category';
    let sets = [...state.savedSets];

    // Sort
    const sortFn = {
        'name': (a, b) => a.name.localeCompare(b.name),
        'recent': (a, b) => (b.date || '').localeCompare(a.date || ''),
        'items-desc': (a, b) => b.items.length - a.items.length,
        'modes': (a, b) => ((a.modes || []).join(',') || 'zzz').localeCompare((b.modes || []).join(',') || 'zzz'),
        'category': (a, b) => (a.category || 'ZZZ').localeCompare(b.category || 'ZZZ') || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)
    };
    sets.sort(sortFn[sortBy] || sortFn['category']);

    const useGroups = sortBy === 'category';
    let html = '';

    if (useGroups) {
        const categories = {};
        sets.forEach(s => {
            const cat = s.category || 'Altri';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(s);
        });
        for (const [catName, catSets] of Object.entries(categories)) {
            const collapsed = state._libCollapsed[catName] || false;
            html += `<div class="lib-category-header" onclick="toggleLibCategory('${catName.replace(/'/g, "\\'")}')">
                <h3><i class="fa-solid fa-chevron-${collapsed ? 'right' : 'down'}" style="font-size:0.7rem; margin-right:6px;"></i>${catName}</h3>
                <span class="cat-count">${catSets.length} set</span>
            </div>`;
            if (!collapsed) {
                html += '<div class="lib-grid">';
                catSets.forEach((s, idx) => {
                    html += renderLibCard(s, idx, catSets.length);
                });
                html += '</div>';
            }
        }
    } else {
        html += '<div class="lib-grid">';
        sets.forEach(s => { html += renderLibCard(s); });
        html += '</div>';
    }

    container.innerHTML = html;
}

function renderLibCard(s, idxInCat, catLength) {
    const previews = s.items.filter(i => i.url).slice(0, 4);
    let previewHtml = '';

    if (previews.length > 0) {
        previewHtml = `<div class="lib-preview-grid" style="display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:2px; height:120px; border-radius:8px; overflow:hidden; background:rgba(0,0,0,0.3); margin-bottom:8px;">
            ${previews.map(i => `<img src="${i.url}" style="width:100%; height:100%; object-fit:cover;">`).join('')}
            ${previews.length < 4 ? Array(4 - previews.length).fill('<div style="background:rgba(255,255,255,0.05);"></div>').join('') : ''}
        </div>`;
    } else {
        previewHtml = `<div style="height:120px; background:rgba(0,0,0,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#666; font-size:0.8rem; margin-bottom:8px; flex-direction:column; gap:5px;">
            <i class="fa-solid fa-image fa-2x" style="opacity:0.3"></i>
            <span>No Img</span>
        </div>`;
    }

    const missingCount = s.items.filter(i => !i.url).length;
    const warningHtml = missingCount > 0
        ? `<div style="color:var(--warning-color); font-size:0.75rem; background:rgba(245, 158, 11, 0.1); padding:4px 8px; border-radius:6px; margin-top:5px; display:flex; align-items:center; gap:5px;">
            <i class="fa-solid fa-triangle-exclamation"></i> ${missingCount} immagini mancanti
           </div>`
        : '';

    const tagsHtml = (s.tags && s.tags.length > 0)
        ? `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
            ${s.tags.map(t => `<span class="tag-chip" style="font-size:0.65rem; padding:1px 6px;">${t}</span>`).join('')}
           </div>`
        : '';

    // Mode labels
    const modesHtml = (s.modes && s.modes.length > 0)
        ? `<div style="display:flex; gap:3px; flex-wrap:wrap; margin-top:2px;">
            ${s.modes.map(m => `<span style="font-size:0.6rem; padding:1px 5px; border-radius:4px; background:rgba(99,102,241,0.15); color:var(--accent-color);">${getModeLabel ? getModeLabel(m) : m}</span>`).join('')}
           </div>`
        : '';

    // Reorder buttons (only in category sort)
    let reorderHtml = '';
    if (idxInCat !== undefined && catLength !== undefined) {
        reorderHtml = `<div style="position:absolute; top:6px; right:6px; display:flex; gap:2px; z-index:2;">
            <button onclick="event.stopPropagation(); moveSetInCategory('${s.id}',-1)" style="width:24px; height:24px; border:1px solid var(--glass-border); border-radius:6px; background:rgba(0,0,0,0.4); color:${idxInCat > 0 ? 'var(--text-secondary)' : '#333'}; cursor:${idxInCat > 0 ? 'pointer' : 'default'}; font-size:0.6rem; display:flex; align-items:center; justify-content:center;" title="Sposta su" ${idxInCat === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <button onclick="event.stopPropagation(); moveSetInCategory('${s.id}',1)" style="width:24px; height:24px; border:1px solid var(--glass-border); border-radius:6px; background:rgba(0,0,0,0.4); color:${idxInCat < catLength - 1 ? 'var(--text-secondary)' : '#333'}; cursor:${idxInCat < catLength - 1 ? 'pointer' : 'default'}; font-size:0.6rem; display:flex; align-items:center; justify-content:center;" title="Sposta giù" ${idxInCat >= catLength - 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>`;
    }

    const imgCount = s.items.filter(i => i.url).length;
    const maskedCount = s.items.filter(i => i.maskedUrl).length;
    const scontornoIcon = maskedCount === imgCount && imgCount > 0
        ? 'color:var(--success-color)'
        : (maskedCount > 0 ? 'color:var(--warning-color)' : 'opacity:0.4');

    return `
    <div class="lib-card ${s.isClinical ? 'clinical' : ''}">
        ${reorderHtml}
        ${previewHtml}
        <div class="lib-title" style="font-weight:bold; font-size:1rem;">${s.name}</div>
        <div class="lib-cat" style="color:var(--text-secondary); font-size:0.8rem;">${s.category || 'Generale'}</div>
        <div style="font-size:0.8rem; color:#aaa; margin-top:2px;">${s.items.length} items</div>
        ${modesHtml}
        ${tagsHtml}
        ${warningHtml}

        <div style="display:flex; gap:5px; margin-top:10px;">
            <button class="btn btn-primary" style="flex:1; padding:6px;" onclick="loadSet('${s.id}')" title="Carica">
                <i class="fa-solid fa-play"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px;" onclick="editSet('${s.id}')" title="Modifica">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px;" onclick="scontornaSet('${s.id}')" title="Scontorna set (${maskedCount}/${imgCount})">
                <i class="fa-solid fa-eraser" style="${scontornoIcon}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px;" onclick="exportSingleSet('${s.id}')" title="Esporta file">
                <i class="fa-solid fa-file-export"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; color:#fbbf24; border-color:rgba(251,191,36,0.3);" onclick="quickShareSetDirect('${s.id}')" title="Quick Share">
                <i class="fa-solid fa-share-from-square"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px 12px; color:var(--accent-color); border-color:rgba(99,102,241,0.3);" onclick="p2pSendSet('${s.id}')" title="Invia via P2P">
                <i class="fa-solid fa-wifi"></i>
            </button>
            <button class="btn btn-danger" style="padding:6px 12px;" onclick="deleteSet('${s.id}')" title="Elimina">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>`;
}

window.scontornaSet = async (setId) => {
    if (typeof removeBackground !== 'function') return;
    const s = state.savedSets.find(x => x.id === setId);
    if (!s) return;

    const items = s.items.filter(i => i.url && !i.maskedUrl);
    if (items.length === 0) {
        const allMasked = s.items.filter(i => i.maskedUrl).length;
        if (allMasked > 0) {
            const redo = await themedConfirm(`Tutte le ${allMasked} immagini sono già scontornate. Vuoi rifare lo scontorno?`);
            if (!redo) return;
            s.items.forEach(i => { if (i.maskedUrl) delete i.maskedUrl; });
            return scontornaSet(setId);
        }
        return;
    }

    const btn = document.querySelector(`[onclick*="scontornaSet('${setId}')"]`);
    const originalHtml = btn ? btn.innerHTML : '';
    const tolerance = typeof getScontornoTolerance === 'function' ? getScontornoTolerance() : 35;
    let done = 0;

    for (const item of items) {
        const result = await removeBackground(item.url, tolerance);
        if (result) item.maskedUrl = result;
        done++;
        if (btn) btn.innerHTML = `<span style="font-size:0.6rem;">${done}/${items.length}</span>`;
    }

    await DB.saveSet(s);
    if (btn) btn.innerHTML = originalHtml;
    renderLibList();
};

// Move set position within its category
window.moveSetInCategory = async (setId, dir) => {
    const s = state.savedSets.find(x => x.id === setId);
    if (!s) return;
    const cat = s.category || 'Altri';

    // Get all sets in same category, sorted by current sortOrder then name
    const catSets = state.savedSets
        .filter(x => (x.category || 'Altri') === cat)
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name));

    // Always normalize to clean sequential integers first
    catSets.forEach((cs, i) => { cs.sortOrder = i; });

    const idx = catSets.findIndex(x => x.id === setId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= catSets.length) return;

    // Swap the two adjacent items' sortOrder
    const other = catSets[newIdx];
    const tmp = s.sortOrder;
    s.sortOrder = other.sortOrder;
    other.sortOrder = tmp;

    // Save all sets in category (normalized orders) to DB
    for (const cs of catSets) {
        await DB.saveSet(cs);
    }
    state.savedSets = await DB.getAllSets();
    renderLibList();
};

window.loadSet = async (id) => {
    const s = state.savedSets.find(x => x.id === id);
    if (s) {
        state.activeSetId = id;
        state.items = JSON.parse(JSON.stringify(s.items));
        // Update custom dropdown label
        const label = document.getElementById('set-dropdown-label');
        if (label) label.textContent = s.name;
        window.closeLibrary();
        window.startGame();
    }
};

// FIX: No more page reload for create/delete
window.createEmptySet = async () => {
    const name = await themedPrompt("Nome del nuovo Set?");
    if (!name) return;
    const newSet = {
        id: Date.now().toString(),
        name: name,
        category: "Personale",
        items: [],
        modes: [],
        tags: [],
        date: new Date().toLocaleDateString(),
        isClinical: false
    };
    await DB.saveSet(newSet);
    await reloadLibrary();
};

window.deleteSet = async (id) => {
    if (await themedConfirm("Eliminare definitivamente?")) {
        await DB.deleteSet(id);
        await reloadLibrary();
    }
};

// --- MODE ICONS MAP ---
const MODE_ICONS = {
    tact: 'fa-hand-pointer', ran: 'fa-bolt', ran_intensivo: 'fa-dumbbell', fluenza: 'fa-comment-dots',
    tombola: 'fa-table-cells', tombola_sonora: 'fa-volume-high', memory: 'fa-clone',
    search_find: 'fa-magnifying-glass', intraverbal_scenari: 'fa-comments',
    pool_random: 'fa-shuffle', pool_intraverbal: 'fa-random', intruso: 'fa-ban',
    topologia: 'fa-map-pin', sequenze: 'fa-arrow-right-arrow-left', categorizzazione: 'fa-sitemap',
    zoom: 'fa-search-plus', quaderno: 'fa-book-open', quaderno_task: 'fa-list-check',
    ricorda: 'fa-brain', singolare_plurale: 'fa-1',
    stroop_numerico: 'fa-hashtag', go_nogo: 'fa-traffic-light', stroop_etichetta: 'fa-font',
    topologia_comp: 'fa-layer-group',
    memoria_lavoro: 'fa-cubes-stacked'
};

// Curated FA icon list for icon picker
const FA_ICON_CHOICES = [
    'fa-hand-pointer','fa-bolt','fa-comment-dots','fa-table-cells','fa-volume-high','fa-clone',
    'fa-magnifying-glass','fa-comments','fa-shuffle','fa-random','fa-ban','fa-map-pin',
    'fa-arrow-right-arrow-left','fa-sitemap','fa-search-plus','fa-book-open','fa-list-check',
    'fa-star','fa-heart','fa-brain','fa-lightbulb','fa-puzzle-piece','fa-music','fa-palette',
    'fa-image','fa-camera','fa-eye','fa-ear-listen','fa-hand','fa-hands','fa-gamepad',
    'fa-dice','fa-shapes','fa-icons','fa-wand-magic-sparkles','fa-paintbrush','fa-pen',
    'fa-book','fa-graduation-cap','fa-chalkboard','fa-school','fa-apple-whole','fa-tree',
    'fa-sun','fa-moon','fa-cloud','fa-house','fa-car','fa-dog','fa-cat','fa-fish',
    'fa-bug','fa-feather','fa-leaf','fa-fire','fa-droplet','fa-snowflake','fa-mountain',
    'fa-basket-shopping','fa-utensils','fa-shirt','fa-person','fa-people-group','fa-child',
    'fa-face-smile','fa-face-laugh','fa-face-surprise','fa-clock','fa-trophy','fa-medal',
    'fa-flag','fa-bullseye','fa-chart-line','fa-chart-bar','fa-circle-check','fa-thumbs-up',
    'fa-rocket','fa-gear','fa-wrench','fa-scissors','fa-ruler','fa-calculator',
    'fa-phone','fa-envelope','fa-globe','fa-map','fa-location-dot','fa-compass',
    'fa-bicycle','fa-plane','fa-train','fa-ship','fa-futbol','fa-baseball','fa-basketball',
    'fa-volleyball','fa-dumbbell','fa-guitar','fa-drum','fa-microphone','fa-headphones',
    'fa-tv','fa-desktop','fa-tablet','fa-keyboard','fa-robot','fa-user-astronaut'
];

// Get effective icon for a mode (custom from layout, or default)
function getModeIcon(modeKey) {
    const layout = getActivityLayout();
    if (layout.modeIcons && layout.modeIcons[modeKey]) return layout.modeIcons[modeKey];
    return MODE_ICONS[getModeEngine(modeKey)] || 'fa-puzzle-piece';
}
const DEFAULT_GROUP_COLORS_FALLBACK = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
function getThemeGroupColors() {
    const s = getComputedStyle(document.documentElement);
    return [1,2,3,4,5,6].map(i => s.getPropertyValue('--cat-' + i).trim() || DEFAULT_GROUP_COLORS_FALLBACK[i - 1]);
}
const DEFAULT_GROUP_COLORS = DEFAULT_GROUP_COLORS_FALLBACK;

// --- RENDER MODE SELECT (custom dropdown + hidden select sync) ---
function renderModeSelect() {
    const select = document.getElementById('mode-select');
    if (!select) return;
    const currentValue = select.value;
    const layout = getActivityLayout();

    // Keep hidden select in sync for filterSetsByMode
    select.innerHTML = '';
    layout.groups.forEach(group => {
        const parent = group.name ? document.createElement('optgroup') : select;
        if (group.name) { parent.label = group.name; select.appendChild(parent); }
        (group.modes || []).forEach(modeKey => {
            if (!MODES_CONFIG[modeKey] && !BUILTIN_MODES[modeKey]) return;
            const opt = document.createElement('option');
            opt.value = modeKey; opt.text = getModeLabel(modeKey);
            parent.appendChild(opt);
        });
    });
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) select.value = currentValue;

    // Render custom dropdown
    const panel = document.getElementById('mode-dropdown-panel');
    const label = document.getElementById('mode-dropdown-label');
    if (!panel) return;

    const _themeColors = getThemeGroupColors();
    let html = '';
    layout.groups.forEach((group, gi) => {
        const color = (layout.groupColors && layout.groupColors[gi]) || _themeColors[gi % _themeColors.length];
        if (group.name) {
            html += `<div class="mode-group-header" style="color:${color};">
                <span class="mode-group-dot" style="background:${color};"></span>${group.name}
            </div>`;
        }
        (group.modes || []).forEach(modeKey => {
            if (!MODES_CONFIG[modeKey] && !BUILTIN_MODES[modeKey]) return;
            const isSelected = select.value === modeKey;
            const emoji = (layout.modeEmojis && layout.modeEmojis[modeKey]) || '';
            const iconClass = getModeIcon(modeKey);
            const iconHtml = emoji
                ? `<div class="mode-dd-icon" style="font-size:1.1rem;">${emoji}</div>`
                : `<div class="mode-dd-icon" style="color:${color};"><i class="fa-solid ${iconClass}"></i></div>`;

            // Preview: count compatible sets
            const engine = getModeEngine(modeKey);
            const compatCount = state.savedSets.filter(s => {
                if (s.modes && Array.isArray(s.modes) && s.modes.length > 0) {
                    return s.modes.includes(engine) || s.modes.includes(modeKey);
                }
                return false;
            }).length;

            // For RAN Intensivo, show error count from last RAN session of active set
            let extraInfo = '';
            if (engine === 'ran_intensivo' && state.activeSetId) {
                const patient = state.activePatientId ? state.patients.find(p => p.id === state.activePatientId) : null;
                if (patient && patient.history) {
                    const ranSessions = patient.history.filter(h => h.setId === state.activeSetId && (h.mode === 'ran' || h.mode === 'ran_intensivo'));
                    if (ranSessions.length > 0) {
                        const lastSession = [...ranSessions].sort((a, b) => new Date(a.date) - new Date(b.date)).pop();
                        let errCount = null;
                        if (lastSession.itemDetails && lastSession.itemDetails.length > 0) {
                            errCount = lastSession.itemDetails.filter(d => d.result !== true).length;
                        } else {
                            // Fallback: use session error counts when itemDetails not available
                            errCount = lastSession.rawX != null ? lastSession.rawX : (lastSession.incorrect || 0);
                        }
                        if (errCount != null) {
                            if (errCount > 0) {
                                extraInfo = `<div style="font-size:0.65rem; color:var(--warning-color);"><i class="fa-solid fa-circle-exclamation" style="margin-right:3px;"></i>${errCount} errori nell'ultima RAN</div>`;
                            } else {
                                extraInfo = `<div style="font-size:0.65rem; color:var(--success-color);"><i class="fa-solid fa-circle-check" style="margin-right:3px;"></i>Nessun errore nell'ultima RAN</div>`;
                            }
                        }
                    }
                }
            }

            html += `<div class="mode-dd-item${isSelected ? ' selected' : ''}" onclick="selectModeFromDropdown('${modeKey}')">
                ${iconHtml}
                <div style="flex:1; min-width:0;">
                    <div class="mode-dd-label">${getModeLabel(modeKey)}</div>
                    ${compatCount > 0 ? `<div style="font-size:0.65rem; color:var(--text-secondary);">${compatCount} set</div>` : ''}
                    ${extraInfo}
                </div>
            </div>`;
        });
    });
    panel.innerHTML = html;

    // Update trigger label
    const selVal = select.value;
    if (selVal) {
        label.textContent = getModeLabel(selVal);
    } else {
        label.textContent = '-- Attivit\u00E0 --';
    }
}

window.toggleModeDropdown = () => {
    const trigger = document.getElementById('mode-dropdown-trigger');
    const panel = document.getElementById('mode-dropdown-panel');
    if (!trigger || !panel) return;
    // Close other dropdowns first
    closeSetDropdown();
    closePatientDropdown();
    if (panel.classList.contains('open')) {
        trigger.classList.remove('open'); panel.classList.remove('open');
    } else {
        trigger.classList.add('open'); panel.classList.add('open');
    }
};

function closeModeDropdown() {
    const t = document.getElementById('mode-dropdown-trigger');
    const p = document.getElementById('mode-dropdown-panel');
    if (t) t.classList.remove('open');
    if (p) p.classList.remove('open');
}

window.selectModeFromDropdown = (modeKey) => {
    const select = document.getElementById('mode-select');
    if (select) { select.value = modeKey; }
    closeModeDropdown();
    const label = document.getElementById('mode-dropdown-label');
    if (label) label.textContent = getModeLabel(modeKey);
    filterSetsByMode();
};

// --- ACTIVITY LAYOUT EDITOR ---
let _editingLayout = null;

window.openActivityLayout = () => {
    _editingLayout = JSON.parse(JSON.stringify(getActivityLayout()));
    document.getElementById('modal-activity-layout').classList.add('open');
    renderActivityLayoutBody();
};

window.closeActivityLayout = () => {
    document.getElementById('modal-activity-layout').classList.remove('open');
    _editingLayout = null;
};

window.saveActivityLayoutAndClose = () => {
    saveActivityLayout(_editingLayout);
    renderModeSelect();
    filterSetsByMode();
    closeActivityLayout();
};

function renderActivityLayoutBody() {
    const body = document.getElementById('activity-layout-body');
    const groups = _editingLayout.groups;
    const emojis = _editingLayout.modeEmojis || {};
    const customModes = _editingLayout.customModes || {};
    if (!_editingLayout.groupColors) _editingLayout.groupColors = {};

    let html = `
        <div style="display:flex; gap:8px; margin-bottom:15px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="addActivityGroup()" style="padding:8px 14px;">
                <i class="fa-solid fa-folder-plus"></i> Categoria
            </button>
            <button class="btn btn-primary" onclick="openAddCustomMode()" style="padding:8px 14px;">
                <i class="fa-solid fa-plus-circle"></i> Nuova Attivit&agrave;
            </button>
            <button class="btn btn-ghost" onclick="resetActivityLayoutEdit()" style="padding:8px 14px;">
                <i class="fa-solid fa-rotate-left"></i> Default
            </button>
        </div>
    `;

    groups.forEach((group, gi) => {
        const groupName = group.name || '(Principale)';
        const _tc = getThemeGroupColors();
        const groupColor = (_editingLayout.groupColors[gi]) || _tc[gi % _tc.length];
        html += `
        <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.08); border-left:3px solid ${groupColor};">
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button class="btn btn-ghost" onclick="moveGroupUp(${gi})" style="padding:1px 7px; font-size:0.65rem;" ${gi === 0 ? 'disabled style="padding:1px 7px; font-size:0.65rem; opacity:0.3;"' : ''}>&#9650;</button>
                    <button class="btn btn-ghost" onclick="moveGroupDown(${gi})" style="padding:1px 7px; font-size:0.65rem;" ${gi === groups.length - 1 ? 'disabled style="padding:1px 7px; font-size:0.65rem; opacity:0.3;"' : ''}>&#9660;</button>
                </div>
                <input type="color" value="${groupColor}" onchange="updateGroupColor(${gi}, this.value)"
                       style="width:30px; height:30px; border:none; border-radius:6px; background:transparent; cursor:pointer; padding:0;" title="Colore categoria">
                <input type="text" value="${group.name}" onchange="updateGroupName(${gi}, this.value)"
                       placeholder="Nome categoria..." style="flex:1; min-width:100px; font-weight:bold; font-size:0.95rem; padding:6px 10px;">
                ${groups.length > 1 ? `<button class="btn btn-ghost" onclick="removeActivityGroup(${gi})" style="color:var(--danger-color); padding:4px 8px;" title="Elimina categoria">
                    <i class="fa-solid fa-trash" style="font-size:0.8rem;"></i>
                </button>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:3px;">`;

        (group.modes || []).forEach((mode, mi) => {
            const label = (customModes[mode] ? customModes[mode].label : (BUILTIN_MODES[mode] ? BUILTIN_MODES[mode].label : mode));
            const emoji = emojis[mode] || '';
            const isCustom = !!customModes[mode];
            const engineLabel = isCustom ? ` <span style="font-size:0.65rem; color:var(--text-secondary); opacity:0.7;">(${BUILTIN_MODES[customModes[mode].engine]?.label || customModes[mode].engine})</span>` : '';
            const modeIconClass = (_editingLayout.modeIcons && _editingLayout.modeIcons[mode]) || MODE_ICONS[getModeEngine(mode)] || 'fa-puzzle-piece';

            // Build move-to options
            const moveOpts = groups.map((g, idx) => idx !== gi
                ? `<option value="${idx}">${g.name || '(Principale)'}</option>` : '').filter(Boolean).join('');

            html += `
                <div style="display:flex; align-items:center; gap:5px; padding:5px 6px; background:rgba(255,255,255,0.03); border-radius:8px; ${isCustom ? 'border-left:3px solid var(--accent-color);' : ''}">
                    <button class="btn btn-ghost" onclick="openModeIconPicker('${mode}')" style="width:32px; height:32px; padding:0; font-size:0.9rem; color:${groupColor}; display:flex; align-items:center; justify-content:center; border-radius:6px;" title="Cambia icona">
                        <i class="fa-solid ${modeIconClass}"></i>
                    </button>
                    <input type="text" value="${emoji}" onchange="updateModeEmoji('${mode}', this.value)"
                           maxlength="4" style="width:34px; text-align:center; font-size:1rem; padding:3px; border-radius:6px;" placeholder="&#128204;" title="Emoji">
                    <span style="flex:1; font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label}${engineLabel}</span>
                    <button class="btn btn-ghost" onclick="moveModeInGroup(${gi},${mi},-1)" style="padding:1px 5px; font-size:0.6rem;" ${mi === 0 ? 'disabled' : ''}>&#9650;</button>
                    <button class="btn btn-ghost" onclick="moveModeInGroup(${gi},${mi},1)" style="padding:1px 5px; font-size:0.6rem;" ${mi === (group.modes || []).length - 1 ? 'disabled' : ''}>&#9660;</button>
                    ${groups.length > 1 ? `<select onchange="moveModeToGroup(${gi},${mi},parseInt(this.value))" style="width:auto; min-width:0; padding:3px 6px; font-size:0.7rem; border-radius:6px;">
                        <option value="">&#8594;</option>${moveOpts}
                    </select>` : ''}
                    ${isCustom ? `<button class="btn btn-ghost" onclick="deleteCustomMode('${mode}',${gi},${mi})" style="color:var(--danger-color); padding:2px 5px;" title="Elimina attivit&agrave; personalizzata"><i class="fa-solid fa-xmark" style="font-size:0.7rem;"></i></button>` : ''}
                </div>`;
        });

        html += `</div></div>`;
    });

    body.innerHTML = html;
}

// Layout editor actions
window.addActivityGroup = () => { _editingLayout.groups.push({ name: 'Nuova Categoria', modes: [] }); renderActivityLayoutBody(); };
window.removeActivityGroup = (gi) => {
    const modes = _editingLayout.groups[gi].modes;
    const target = gi === 0 ? 1 : 0;
    _editingLayout.groups[target].modes.push(...modes);
    _editingLayout.groups.splice(gi, 1);
    renderActivityLayoutBody();
};
window.moveGroupUp = (gi) => {
    if (gi <= 0) return;
    const g = _editingLayout.groups; [g[gi - 1], g[gi]] = [g[gi], g[gi - 1]];
    const c = _editingLayout.groupColors || {};
    const tmp = c[gi]; c[gi] = c[gi - 1]; c[gi - 1] = tmp;
    renderActivityLayoutBody();
};
window.moveGroupDown = (gi) => {
    const g = _editingLayout.groups; if (gi >= g.length - 1) return;
    [g[gi], g[gi + 1]] = [g[gi + 1], g[gi]];
    const c = _editingLayout.groupColors || {};
    const tmp = c[gi]; c[gi] = c[gi + 1]; c[gi + 1] = tmp;
    renderActivityLayoutBody();
};
window.updateGroupName = (gi, name) => { _editingLayout.groups[gi].name = name; };
window.updateGroupColor = (gi, color) => { if (!_editingLayout.groupColors) _editingLayout.groupColors = {}; _editingLayout.groupColors[gi] = color; renderActivityLayoutBody(); };
window.updateModeEmoji = (mode, emoji) => { if (!_editingLayout.modeEmojis) _editingLayout.modeEmojis = {}; _editingLayout.modeEmojis[mode] = emoji.trim(); };
window.moveModeInGroup = (gi, mi, dir) => {
    const modes = _editingLayout.groups[gi].modes;
    const ni = mi + dir;
    if (ni < 0 || ni >= modes.length) return;
    [modes[mi], modes[ni]] = [modes[ni], modes[mi]];
    renderActivityLayoutBody();
};
window.moveModeToGroup = (fromGi, mi, toGi) => {
    if (toGi === '' || toGi === fromGi) return;
    const mode = _editingLayout.groups[fromGi].modes.splice(mi, 1)[0];
    _editingLayout.groups[toGi].modes.push(mode);
    renderActivityLayoutBody();
};
window.resetActivityLayoutEdit = () => { _editingLayout = getDefaultActivityLayout(); renderActivityLayoutBody(); };

// --- CUSTOM MODE CREATION ---
window.openAddCustomMode = () => {
    const engines = Object.entries(BUILTIN_MODES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const groups = _editingLayout.groups.map((g, i) => `<option value="${i}">${g.name || '(Principale)'}</option>`).join('');

    const html = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:20000; display:flex; align-items:center; justify-content:center; padding:20px;" id="custom-mode-overlay">
        <div style="background:#1e1e2f; border-radius:16px; padding:20px; max-width:400px; width:100%; border:1px solid rgba(255,255,255,0.1);">
            <h3 style="margin:0 0 15px 0;"><i class="fa-solid fa-plus-circle"></i> Nuova Attivit&agrave; Personalizzata</h3>
            <label style="font-size:0.8rem; color:#aaa;">Nome</label>
            <input type="text" id="custom-mode-name" placeholder="es. Scena Azioni" style="margin-bottom:10px; font-size:1rem;">
            <label style="font-size:0.8rem; color:#aaa;">Logica (Modalit&agrave; Base)</label>
            <select id="custom-mode-engine" style="margin-bottom:10px;">${engines}</select>
            <label style="font-size:0.8rem; color:#aaa;">Categoria</label>
            <select id="custom-mode-group" style="margin-bottom:15px;">${groups}</select>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-success" onclick="confirmAddCustomMode()" style="flex:1;">Crea</button>
                <button class="btn btn-ghost" onclick="document.getElementById('custom-mode-overlay').remove()" style="flex:1;">Annulla</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.confirmAddCustomMode = () => {
    const name = document.getElementById('custom-mode-name').value.trim();
    const engine = document.getElementById('custom-mode-engine').value;
    const groupIdx = parseInt(document.getElementById('custom-mode-group').value);
    if (!name) { alert('Inserisci un nome.'); return; }

    // Generate unique key
    const key = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36);

    if (!_editingLayout.customModes) _editingLayout.customModes = {};
    _editingLayout.customModes[key] = { label: name, engine: engine };
    _editingLayout.groups[groupIdx].modes.push(key);

    document.getElementById('custom-mode-overlay').remove();
    renderActivityLayoutBody();
};

window.deleteCustomMode = async (modeKey, gi, mi) => {
    if (!await themedConfirm('Eliminare questa attività personalizzata?')) return;
    _editingLayout.groups[gi].modes.splice(mi, 1);
    if (_editingLayout.customModes) delete _editingLayout.customModes[modeKey];
    if (_editingLayout.modeEmojis) delete _editingLayout.modeEmojis[modeKey];
    if (_editingLayout.modeIcons) delete _editingLayout.modeIcons[modeKey];
    renderActivityLayoutBody();
};

// --- MODE ICON PICKER ---
window.openModeIconPicker = (modeKey) => {
    const currentIcon = (_editingLayout.modeIcons && _editingLayout.modeIcons[modeKey]) || MODE_ICONS[getModeEngine(modeKey)] || 'fa-puzzle-piece';
    const iconsHtml = FA_ICON_CHOICES.map(ic =>
        `<button onclick="selectModeIcon('${modeKey}','${ic}')" style="width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; border:1px solid ${ic === currentIcon ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; border-radius:8px; background:${ic === currentIcon ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.03)'}; color:${ic === currentIcon ? 'var(--accent-color)' : '#ccc'}; cursor:pointer; font-size:1rem; transition:all 0.15s;" onmouseover="this.style.background='rgba(99,102,241,0.15)'" onmouseout="this.style.background='${ic === currentIcon ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.03)'}'" title="${ic}">
            <i class="fa-solid ${ic}"></i>
        </button>`
    ).join('');

    const html = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:20000; display:flex; align-items:center; justify-content:center; padding:20px;" id="icon-picker-overlay" onclick="if(event.target===this)this.remove()">
        <div style="background:#1e1e2f; border-radius:16px; padding:20px; max-width:500px; width:100%; max-height:80vh; overflow-y:auto; border:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0;"><i class="fa-solid fa-icons"></i> Scegli Icona</h3>
                <button class="btn btn-ghost" onclick="selectModeIcon('${modeKey}','')" style="font-size:0.75rem; padding:4px 10px;">
                    <i class="fa-solid fa-rotate-left"></i> Default
                </button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">
                ${iconsHtml}
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.selectModeIcon = (modeKey, iconClass) => {
    if (!_editingLayout.modeIcons) _editingLayout.modeIcons = {};
    if (iconClass) {
        _editingLayout.modeIcons[modeKey] = iconClass;
    } else {
        delete _editingLayout.modeIcons[modeKey];
    }
    const overlay = document.getElementById('icon-picker-overlay');
    if (overlay) overlay.remove();
    renderActivityLayoutBody();
};

// --- FULLSCREEN ---
window.toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
    } else {
        document.exitFullscreen();
    }
};

// --- CHILD LOCK ---
window.toggleGlobalScrollLock = () => {
    document.body.classList.toggle('global-locked');
    document.getElementById('btn-global-lock').classList.toggle('locked');
};

// --- S PEN INTEGRATION ---
let sPenClickCount = 0;
let sPenTimer = null;

window.addEventListener('sPenNativeEvent', (event) => {
    try {
        let data = null;
        if (event.detail !== undefined && event.detail !== null) {
            if (typeof event.detail === 'object') {
                data = event.detail;
            } else if (typeof event.detail === 'string') {
                if (event.detail.trim() === "undefined" || event.detail.trim() === "") return;
                try { data = JSON.parse(event.detail); }
                catch (e) { if (event.detail.includes("down")) data = { action: "down" }; }
            }
        } else if (event.data) {
            data = (typeof event.data === 'string') ? JSON.parse(event.data) : event.data;
        }
        if (data && data.action === 'down') handleSPenInput();
    } catch (e) { console.error("S Pen Event Error:", e); }
});

function handleSPenInput() {
    sPenClickCount++;
    if (sPenClickCount === 1) {
        sPenTimer = setTimeout(() => {
            sPenClickCount = 0;
            if (isSessionActive()) {
                recordResponse(true);
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 300);
    } else {
        clearTimeout(sPenTimer);
        sPenClickCount = 0;
        if (isSessionActive()) {
            recordResponse(false);
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
    }
}

function isSessionActive() {
    return typeof state !== 'undefined' && state.session && state.session.active;
}

// --- INSTRUCTIONS MODAL ---
window.openInstructions = function () {
    const modal = document.getElementById('modal-instructions');
    if (modal) modal.classList.add('open');
};

window.closeInstructions = function () {
    const modal = document.getElementById('modal-instructions');
    if (modal) modal.classList.remove('open');
};

document.addEventListener('click', function (event) {
    const modal = document.getElementById('modal-instructions');
    if (event.target === modal) window.closeInstructions();
});

document.addEventListener('DOMContentLoaded', () => {
    const infoBtns = document.querySelectorAll('.fa-info');
    infoBtns.forEach(icon => {
        const btn = icon.closest('button');
        if (btn) {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modal = document.getElementById('modal-instructions');
                if (modal) modal.classList.add('open');
            };
        }
    });
});

// --- GLOBAL BACK BUTTON & BROWSER HISTORY ---
document.addEventListener('DOMContentLoaded', () => {
    // Inizializza la history di base della finestra per evitare popstate vuoti
    if (!window.history.state || !window.history.state.base) {
        window.history.replaceState({ base: true }, '');
    }

    // Creiamo una funzione universale per aggiungere uno "strato" di navigazione (es. quando apriamo un modal)
    window.pushAppHistory = (hashName) => {
        window.history.pushState({ hash: hashName }, '', '#' + hashName);
    };

    // Sovrascriviamo leggermente i metodi di apertura modali per registrare la history
    const overrideModalOpen = (fnName, hash) => {
        if (typeof window[fnName] === 'function') {
            const orig = window[fnName];
            window[fnName] = (...args) => {
                window.pushAppHistory(hash);
                return orig(...args);
            };
        }
    };

    overrideModalOpen('openPatients', 'patients');
    overrideModalOpen('openLibrary', 'library');
    overrideModalOpen('openEditor', 'editor');
    if (typeof openActivityLayout === 'function') overrideModalOpen('openActivityLayout', 'activities');
    overrideModalOpen('openFirebaseSettings', 'firebase');

    // Funzione globale che prova a chiudere l'ultima cosa aperta
    const goBackOrClose = async () => {
        const openModals = Array.from(document.querySelectorAll('.modal-fs.open, .modal.open, .modal-small.open'));
        if (openModals.length > 0) {
            const topModal = openModals[openModals.length - 1];
            topModal.classList.remove('open');
            return true;
        } else if (typeof state !== 'undefined' && state.session && state.session.active) {
            if (await themedConfirm("Attività in corso. Vuoi tornare al menu e azzerare i dati correnti?")) {
                window.location.reload();
            }
            return true; // We handled it
        }
        return false;
    };

    // Ascolto del tasto indietro sul browser e su Android gestito come popstate
    window.addEventListener('popstate', (e) => {
        // Se c'è un modal aperto, chiudiamolo
        goBackOrClose();
    });

    // Se Capacitor è disponibile ma per qualche configurazione il "back" nativo non scatena popstate per Android, forziamolo:
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
                window.history.back();
            } else {
                if (!goBackOrClose()) {
                    window.Capacitor.Plugins.App.exitApp();
                }
            }
        });
    }
});

// --- VARIANT SELECTOR ---
function _updateVariantSelector() {
    const wrapper = document.getElementById('variant-selector-wrapper');
    const select = document.getElementById('variant-select');
    if (!wrapper || !select) return;

    const activeSet = state.activeSetId ? state.savedSets.find(s => s.id === state.activeSetId) : null;
    const variantNames = activeSet?.variantNames;

    if (variantNames && variantNames.length > 0) {
        wrapper.classList.remove('hidden');
        select.innerHTML = '<option value="0">Base</option>';
        variantNames.forEach((name, i) => {
            const opt = document.createElement('option');
            opt.value = i + 1;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } else {
        wrapper.classList.add('hidden');
        select.innerHTML = '<option value="0">Base</option>';
        select.value = '0';
    }
}

window.onVariantChange = () => {
    window.startGame();
};

// --- GAME AREA FULLSCREEN ---
window.toggleGameFullscreen = () => {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    const isFs = shell.classList.toggle('game-fullscreen');
    const icon = document.getElementById('game-fs-icon');
    if (icon) {
        icon.className = isFs
            ? 'fa-solid fa-down-left-and-up-right-to-center'
            : 'fa-solid fa-up-right-and-down-left-from-center';
    }
    const btn = document.getElementById('btn-game-fullscreen');
    if (btn) btn.classList.toggle('pen-active', isFs);
};

// === FAB MENU (collapsible floating tools) ===
window.toggleFabMenu = () => {
    const items = document.getElementById('fab-menu-items');
    const btn = document.getElementById('fab-toggle-btn');
    if (!items || !btn) return;
    const isCollapsed = items.classList.contains('fab-collapsed');
    items.classList.toggle('fab-collapsed', !isCollapsed);
    items.classList.toggle('fab-expanded', isCollapsed);
    btn.classList.toggle('fab-open', isCollapsed);
    const icon = document.getElementById('fab-toggle-icon');
    if (icon) {
        icon.className = isCollapsed ? 'fa-solid fa-xmark' : 'fa-solid fa-wrench';
    }
};

// ============================================================
// VISUAL PROMPT BUTTONS (touchable by children during activities)
// ============================================================

const DEFAULT_VISUAL_PROMPTS = [
    { id: 'aiuto', label: 'Aiuto', icon: 'fa-circle-question', image: null, color: '#3b82f6', enabled: true },
    { id: 'stop', label: 'Stop', icon: 'fa-hand', image: null, color: '#ef4444', enabled: true },
    { id: 'ancora', label: 'Ancora', icon: 'fa-rotate-right', image: null, color: '#10b981', enabled: true },
    { id: 'si', label: 'Sì', icon: 'fa-thumbs-up', image: null, color: '#22c55e', enabled: true },
    { id: 'no', label: 'No', icon: 'fa-thumbs-down', image: null, color: '#f97316', enabled: true }
];

function getVisualPrompts() {
    try {
        const saved = localStorage.getItem('visualPromptButtons');
        if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_VISUAL_PROMPTS.map(p => ({ ...p }));
}

function saveVisualPrompts(prompts) {
    localStorage.setItem('visualPromptButtons', JSON.stringify(prompts));
}

function isVisualPromptBarVisible() {
    return localStorage.getItem('vpb_visible') === 'true';
}

function setVisualPromptBarVisible(visible) {
    localStorage.setItem('vpb_visible', visible ? 'true' : 'false');
}

window.toggleVisualPromptBar = () => {
    const bar = document.getElementById('visual-prompt-bar');
    if (!bar) return;
    const isVisible = !bar.classList.contains('hidden');
    if (isVisible) {
        bar.classList.add('hidden');
        setVisualPromptBarVisible(false);
        document.getElementById('btn-visual-prompts')?.classList.remove('pen-active');
    } else {
        renderVisualPromptBar();
        bar.classList.remove('hidden');
        setVisualPromptBarVisible(true);
        document.getElementById('btn-visual-prompts')?.classList.add('pen-active');
    }
};

function renderVisualPromptBar() {
    const bar = document.getElementById('visual-prompt-bar');
    if (!bar) return;
    const prompts = getVisualPrompts().filter(p => p.enabled);

    let html = '';
    prompts.forEach(p => {
        const content = p.image
            ? `<img src="${p.image}" alt="${p.label}" draggable="false">`
            : `<i class="fa-solid ${p.icon}"></i>`;
        html += `<button class="vpb-btn" data-vpb-id="${p.id}" style="--vpb-color:${p.color};" ontouchstart="vpbTap(this)" onmousedown="vpbTap(this)">
            <div class="vpb-content">${content}</div>
            <span class="vpb-label">${p.label}</span>
        </button>`;
    });

    html += `<button class="vpb-config-btn" onclick="openVisualPromptConfig()" title="Configura"><i class="fa-solid fa-gear"></i></button>`;
    bar.innerHTML = html;
}

window.vpbTap = (btn) => {
    btn.classList.remove('vpb-active');
    void btn.offsetWidth;
    btn.classList.add('vpb-active');
    setTimeout(() => btn.classList.remove('vpb-active'), 2500);
};

window.openVisualPromptConfig = () => {
    const prompts = getVisualPrompts();
    const existing = document.getElementById('vpb-config-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vpb-config-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:25000; display:flex; align-items:center; justify-content:center; padding:20px;';

    let itemsHtml = prompts.map((p, i) => {
        const preview = p.image
            ? `<img src="${p.image}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;" alt="">`
            : `<div style="width:36px;height:36px;border-radius:8px;background:${p.color}20;display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${p.icon}" style="color:${p.color};font-size:1rem;"></i></div>`;
        return `<div style="display:flex; align-items:center; gap:10px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:6px;">
            <label style="display:flex; align-items:center;"><input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="vpbToggleEnabled(${i}, this.checked)"></label>
            ${preview}
            <input type="text" value="${p.label}" onchange="vpbChangeLabel(${i}, this.value)" style="flex:1; padding:4px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.3); color:white; font-size:0.85rem;">
            <input type="color" value="${p.color}" onchange="vpbChangeColor(${i}, this.value)" style="width:30px; height:30px; border:none; border-radius:6px; cursor:pointer;">
            <button class="btn-icon" style="width:28px; height:28px; font-size:0.7rem; color:#10b981;" onclick="vpbSearchArasaac(${i})" title="Cerca pittogramma ARASAAC"><i class="fa-solid fa-icons"></i></button>
            <button class="btn-icon" style="width:28px; height:28px; font-size:0.7rem; color:var(--accent-color);" onclick="vpbUploadImage(${i})" title="Carica immagine"><i class="fa-solid fa-image"></i></button>
            ${p.image ? `<button class="btn-icon" style="width:28px; height:28px; font-size:0.7rem; color:var(--danger-color);" onclick="vpbRemoveImage(${i})" title="Rimuovi immagine"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
    }).join('');

    modal.innerHTML = `
    <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:22px; max-height:90vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="margin:0; color:var(--accent-color);"><i class="fa-solid fa-hand-pointer"></i> Prompt Visivi</h3>
            <button class="btn btn-ghost" onclick="document.getElementById('vpb-config-modal').remove()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin:0 0 16px;">Tasti toccabili dal bambino durante le attività. Seleziona quali mostrare e personalizza immagini e colori.</p>
        <div id="vpb-config-items">${itemsHtml}</div>
        <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn btn-ghost" onclick="vpbAddPrompt()" style="padding:6px 14px; font-size:0.8rem;"><i class="fa-solid fa-plus"></i> Aggiungi</button>
            <button class="btn btn-ghost" onclick="vpbResetDefaults()" style="padding:6px 14px; font-size:0.8rem; color:var(--warning-color); border-color:rgba(245,158,11,0.3);"><i class="fa-solid fa-rotate-left"></i> Ripristina</button>
        </div>
    </div>`;

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
};

window.vpbToggleEnabled = (idx, enabled) => {
    const prompts = getVisualPrompts();
    if (prompts[idx]) { prompts[idx].enabled = enabled; saveVisualPrompts(prompts); renderVisualPromptBar(); }
};

window.vpbChangeLabel = (idx, label) => {
    const prompts = getVisualPrompts();
    if (prompts[idx]) { prompts[idx].label = label; saveVisualPrompts(prompts); renderVisualPromptBar(); }
};

window.vpbChangeColor = (idx, color) => {
    const prompts = getVisualPrompts();
    if (prompts[idx]) { prompts[idx].color = color; saveVisualPrompts(prompts); renderVisualPromptBar(); }
};

window.vpbUploadImage = (idx) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = Math.min(img.width, img.height, 200);
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
                const prompts = getVisualPrompts();
                if (prompts[idx]) {
                    prompts[idx].image = canvas.toDataURL('image/jpeg', 0.85);
                    saveVisualPrompts(prompts);
                    renderVisualPromptBar();
                    openVisualPromptConfig();
                }
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

window.vpbRemoveImage = (idx) => {
    const prompts = getVisualPrompts();
    if (prompts[idx]) { prompts[idx].image = null; saveVisualPrompts(prompts); renderVisualPromptBar(); openVisualPromptConfig(); }
};

// Search ARASAAC pictograms for a visual prompt button
window.vpbSearchArasaac = (idx) => {
    if (typeof searchArasaac !== 'function') { alert('Ricerca ARASAAC non disponibile.'); return; }
    const prompts = getVisualPrompts();
    const defaultQuery = prompts[idx]?.label || '';

    const existing = document.getElementById('vpb-arasaac-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vpb-arasaac-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:26000; display:flex; align-items:center; justify-content:center; padding:20px;';
    modal.innerHTML = `
    <div style="width:100%; max-width:460px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:20px; max-height:85vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0; color:#10b981; font-size:1rem;"><i class="fa-solid fa-icons"></i> Pittogramma ARASAAC</h3>
            <button class="btn btn-ghost" onclick="document.getElementById('vpb-arasaac-modal').remove()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:10px;">
            <input type="text" id="vpb-arasaac-query" value="${(defaultQuery || '').replace(/"/g, '&quot;')}" placeholder="Cerca..." onkeydown="if(event.key==='Enter')vpbRunArasaacSearch(${idx})" style="flex:1; padding:9px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;">
            <button class="btn ai-arasaac-btn" onclick="vpbAiArasaacSearch(${idx})" style="padding:9px 12px; background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.4); border-radius:8px; color:#a855f7; cursor:pointer;" title="Ottimizza con AI"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
            <button class="btn btn-primary" onclick="vpbRunArasaacSearch(${idx})" style="padding:9px 14px;"><i class="fa-solid fa-search"></i></button>
        </div>
        <div id="vpb-arasaac-results"></div>
    </div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    if (defaultQuery) vpbRunArasaacSearch(idx);
};

window.vpbRunArasaacSearch = async (idx) => {
    const query = document.getElementById('vpb-arasaac-query')?.value?.trim();
    const container = document.getElementById('vpb-arasaac-results');
    if (!query || !container) return;
    container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div></div>';
    try {
        const results = await searchArasaac(query, 16);
        if (results.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-secondary); font-size:0.85rem;">Nessun pittogramma trovato.</div>';
            return;
        }
        window._vpbArasaacResults = results;
        container.innerHTML = `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
            ${results.map((r, i) => `<div onclick="vpbPickArasaac(${idx}, ${i})" style="cursor:pointer; background:#fff; border-radius:8px; padding:4px; border:2px solid transparent;" onmouseover="this.style.borderColor='#10b981'" onmouseout="this.style.borderColor='transparent'">
                <img src="${r.preview}" loading="lazy" alt="${(r.tags || '').replace(/"/g, '&quot;')}" style="width:100%; aspect-ratio:1; object-fit:contain;">
            </div>`).join('')}
        </div>`;
    } catch (err) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--danger-color); font-size:0.85rem;">${err.message}</div>`;
    }
};

window.vpbAiArasaacSearch = async (idx) => {
    const input = document.getElementById('vpb-arasaac-query');
    const query = input?.value?.trim();
    if (!query) return;

    const btn = document.querySelector('#vpb-arasaac-modal .ai-arasaac-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i>'; }

    try {
        const result = await aiNormalizeArasaacQuery(query);
        if (result && result.query) {
            input.value = result.query;
            vpbRunArasaacSearch(idx);
        }
    } catch (err) {
        alert('Errore AI: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; }
    }
};

window.vpbPickArasaac = async (idx, resultIndex) => {
    const results = window._vpbArasaacResults;
    if (!results || !results[resultIndex]) return;
    const container = document.getElementById('vpb-arasaac-results');
    if (container) container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div><p style="color:#a5b4fc; font-size:0.8rem;">Download...</p></div>';
    try {
        const dataUrl = await fetchPixabayAsDataUrl(results[resultIndex].web);
        const prompts = getVisualPrompts();
        if (prompts[idx]) {
            prompts[idx].image = dataUrl;
            saveVisualPrompts(prompts);
            renderVisualPromptBar();
        }
        document.getElementById('vpb-arasaac-modal')?.remove();
        openVisualPromptConfig();
    } catch (err) {
        alert('Errore download: ' + err.message);
    }
};

window.vpbAddPrompt = () => {
    const prompts = getVisualPrompts();
    prompts.push({ id: 'custom_' + Date.now(), label: 'Nuovo', icon: 'fa-star', image: null, color: '#a78bfa', enabled: true });
    saveVisualPrompts(prompts);
    openVisualPromptConfig();
    renderVisualPromptBar();
};

window.vpbResetDefaults = () => {
    saveVisualPrompts(DEFAULT_VISUAL_PROMPTS.map(p => ({ ...p })));
    renderVisualPromptBar();
    openVisualPromptConfig();
};

// Auto-show prompt bar if it was visible in previous session
if (isVisualPromptBarVisible()) {
    document.addEventListener('DOMContentLoaded', () => {
        const bar = document.getElementById('visual-prompt-bar');
        if (bar) { renderVisualPromptBar(); bar.classList.remove('hidden'); }
        document.getElementById('btn-visual-prompts')?.classList.add('pen-active');
    });
}

// ============================================================
// NOTEBOOK SIDE PANEL (accessible during activities)
// ============================================================

// The side panel hosts an independent "Quaderno" (scorable item lists). It is
// fully isolated from the main activity: it uses its own state object
// (_sideQuaderno) and its own save routine, so it never touches state.session
// or state._quaderno*. On save it appends 'quaderno' sessions to the active
// patient's history — operating on the same in-memory patient object the main
// save uses — so its LUs count in the day's totals with no data conflict.

let _notebookPanelOpen = false;
let _notebookHandleVisible = false;

function _sideQuadernoStorageKey() {
    const pid = state.activePatientId || 'guest';
    return `side_quaderno_${pid}`;
}

function _loadSideQuaderno() {
    try {
        const raw = localStorage.getItem(_sideQuadernoStorageKey());
        if (raw) {
            const data = JSON.parse(raw);
            // Stale data from a previous day is discarded (LUs are per-day)
            if (data.date === new Date().toISOString().split('T')[0]) {
                return data;
            }
        }
    } catch {}
    return { date: new Date().toISOString().split('T')[0], rows: [], sessionType: 'independent', tdSeconds: 5 };
}

function _saveSideQuaderno() {
    if (!state._sideQuaderno) return;
    try { localStorage.setItem(_sideQuadernoStorageKey(), JSON.stringify(state._sideQuaderno)); } catch {}
}

window.toggleNotebookHandle = () => {
    const handle = document.getElementById('notebook-tab-handle');
    const btn = document.getElementById('btn-notebook-panel');
    if (!handle) return;
    _notebookHandleVisible = !_notebookHandleVisible;
    handle.classList.toggle('hidden', !_notebookHandleVisible);
    if (btn) btn.classList.toggle('pen-active', _notebookHandleVisible);
    if (!_notebookHandleVisible && _notebookPanelOpen) {
        toggleNotebookPanel();
    }
};

window.toggleNotebookPanel = () => {
    const panel = document.getElementById('notebook-side-panel');
    if (!panel) return;
    _notebookPanelOpen = !_notebookPanelOpen;
    panel.classList.toggle('open', _notebookPanelOpen);
    if (_notebookPanelOpen) renderNotebookPanel();
};

function renderNotebookPanel() {
    const body = document.getElementById('notebook-panel-body');
    if (!body) return;

    // (Re)load isolated side-quaderno state
    if (!state._sideQuaderno) state._sideQuaderno = _loadSideQuaderno();
    const sq = state._sideQuaderno;

    const patientName = state.activePatientId
        ? (state.patients.find(p => p.id === state.activePatientId)?.name || 'Paziente')
        : null;

    const isTD = sq.sessionType === 'timedelay';
    const totalLU = sq.rows.reduce((sum, r) => sum + (r.results ? r.results.length : 0), 0);

    // Activity name suggestions (reuse the same source as the main quaderno)
    const activityNames = (typeof getUsedActivityNames === 'function') ? getUsedActivityNames() : [];
    const datalistOpts = activityNames.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');

    let html = `
    <div style="margin-bottom:10px; padding:8px 10px; background:rgba(99,102,241,0.08); border-radius:10px; font-size:0.78rem; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
        <span><i class="fa-solid fa-user" style="margin-right:4px;"></i> ${patientName || '<span style="color:var(--warning-color);">Nessun paziente</span>'}</span>
        ${totalLU > 0 ? `<span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:2px 8px; border-radius:6px; font-weight:bold; font-size:0.7rem;">${totalLU} LU</span>` : ''}
    </div>

    <div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:10px; line-height:1.4;">
        Registra item extra che esulano dall'attività corrente. I LU vengono salvati come sessioni "Quaderno" e rientrano nei totali del giorno.
    </div>

    <datalist id="side-q-names">${datalistOpts}</datalist>

    <div id="side-q-rows">
        ${sq.rows.length === 0
            ? `<div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:0.8rem; opacity:0.6;"><i class="fa-solid fa-clipboard-list fa-2x" style="margin-bottom:8px; display:block;"></i>Aggiungi un item da punteggiare</div>`
            : sq.rows.map((row, i) => _renderSideQuadernoRow(row, i, isTD)).join('')}
    </div>

    <div style="display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap;">
        <input list="side-q-names" type="text" id="side-q-new" placeholder="Nome item..." onkeydown="if(event.key==='Enter')addSideQuadernoRow()" autocomplete="off" style="flex:1; min-width:100px; padding:9px 10px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
        <button class="btn btn-primary" onclick="addSideQuadernoRow()" style="padding:9px 14px;"><i class="fa-solid fa-plus"></i></button>
    </div>

    <div style="display:flex; gap:6px; margin-top:8px; align-items:center; flex-wrap:wrap;">
        <span style="font-size:0.7rem; color:var(--text-secondary);">Tipo predefinito:</span>
        <select id="side-q-type" onchange="setSideQuadernoType(this.value)" style="flex:1; padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.8rem;" title="Tipo predefinito per nuovi item">
            <option value="independent" ${!isTD ? 'selected' : ''}>Indipendente</option>
            <option value="timedelay" ${isTD ? 'selected' : ''}>Time Delay</option>
        </select>
        ${isTD ? `<input type="number" id="side-q-td" value="${sq.tdSeconds || 5}" min="1" max="30" onchange="state._sideQuaderno.tdSeconds=parseInt(this.value)||5; _saveSideQuaderno();" style="width:55px; padding:8px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.8rem; text-align:center;">` : ''}
    </div>

    <div style="display:flex; gap:6px; margin-top:14px;">
        <button class="btn btn-success" onclick="saveSideQuadernoSession()" style="flex:1; padding:10px;" ${totalLU === 0 ? 'disabled style="flex:1; padding:10px; opacity:0.4;"' : ''}>
            <i class="fa-solid fa-floppy-disk"></i> Salva nei dati
        </button>
        ${sq.rows.length > 0 ? `<button class="btn btn-ghost" onclick="clearSideQuaderno()" style="padding:10px 12px; color:var(--danger-color); border-color:rgba(239,68,68,0.3);" title="Svuota"><i class="fa-solid fa-eraser"></i></button>` : ''}
    </div>`;

    body.innerHTML = html;
}

function _renderSideQuadernoRow(row, idx, isTD) {
    const res = row.results || [];
    const vCount = res.filter(r => r === true).length;
    const pCount = res.filter(r => r === 'prompt').length;
    const xCount = res.filter(r => r === false).length;
    const total = res.length;
    const rowIsTD = (row.sessionType || (isTD ? 'timedelay' : 'independent')) === 'timedelay';

    const leftBtn = rowIsTD
        ? `<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.65rem; font-weight:bold; color:var(--warning-color);">${pCount}</span>
                <button onclick="sideQuadernoAddLU(${idx}, 'prompt')" style="width:40px; height:40px; border-radius:50%; border:2px solid var(--warning-color); background:rgba(245,158,11,0.15); color:var(--warning-color); cursor:pointer; font-size:0.9rem; font-weight:800; display:flex; align-items:center; justify-content:center;">P</button>
            </div>`
        : `<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.65rem; font-weight:bold; color:var(--danger-color);">${xCount}</span>
                <button onclick="sideQuadernoAddLU(${idx}, false)" style="width:40px; height:40px; border-radius:50%; border:2px solid var(--danger-color); background:rgba(239,68,68,0.15); color:var(--danger-color); cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-xmark"></i></button>
            </div>`;

    return `
    <div style="display:flex; flex-direction:column; gap:6px; padding:10px; margin-bottom:7px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:12px;">
        <div style="display:flex; align-items:center; gap:6px;">
            <span style="flex:1; font-size:0.9rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row.name}</span>
            <button onclick="toggleSideQuadernoRowType(${idx})" style="padding:2px 8px; border-radius:6px; border:1px solid ${rowIsTD ? 'var(--warning-color)' : 'rgba(99,102,241,0.5)'}; background:${rowIsTD ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.1)'}; color:${rowIsTD ? 'var(--warning-color)' : 'var(--accent-color)'}; font-size:0.65rem; font-weight:bold; cursor:pointer; white-space:nowrap;" title="Cambia tipo sessione">${rowIsTD ? 'TD' : 'IND'}</button>
            <span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:bold;" title="Totale LU">${total}</span>
            <button onclick="sideQuadernoUndo(${idx})" style="width:28px; height:28px; border-radius:8px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer; font-size:0.7rem;" title="Annulla ultimo" ${total === 0 ? 'disabled' : ''}><i class="fa-solid fa-rotate-left"></i></button>
            <button onclick="sideQuadernoRemoveRow(${idx})" style="width:28px; height:28px; border-radius:8px; border:none; background:transparent; color:#666; cursor:pointer; font-size:0.75rem;" title="Rimuovi"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
            ${leftBtn}
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.65rem; font-weight:bold; color:var(--success-color);">${vCount}</span>
                <button onclick="sideQuadernoAddLU(${idx}, true)" style="width:40px; height:40px; border-radius:50%; border:2px solid var(--success-color); background:rgba(16,185,129,0.15); color:var(--success-color); cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-check"></i></button>
            </div>
        </div>
    </div>`;
}

window.addSideQuadernoRow = () => {
    if (!state._sideQuaderno) state._sideQuaderno = _loadSideQuaderno();
    const input = document.getElementById('side-q-new');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    state._sideQuaderno.rows.push({ name, results: [], sessionType: state._sideQuaderno.sessionType || 'independent' });
    _saveSideQuaderno();
    renderNotebookPanel();
    setTimeout(() => { const el = document.getElementById('side-q-new'); if (el) el.focus(); }, 0);
};

window.sideQuadernoAddLU = (idx, result) => {
    if (!state._sideQuaderno || !state._sideQuaderno.rows[idx]) return;
    if (!state._sideQuaderno.rows[idx].results) state._sideQuaderno.rows[idx].results = [];
    state._sideQuaderno.rows[idx].results.push(result);
    _saveSideQuaderno();
    renderNotebookPanel();
};

window.sideQuadernoUndo = (idx) => {
    if (!state._sideQuaderno || !state._sideQuaderno.rows[idx]) return;
    const res = state._sideQuaderno.rows[idx].results;
    if (res && res.length > 0) { res.pop(); _saveSideQuaderno(); renderNotebookPanel(); }
};

window.sideQuadernoRemoveRow = (idx) => {
    if (!state._sideQuaderno) return;
    state._sideQuaderno.rows.splice(idx, 1);
    _saveSideQuaderno();
    renderNotebookPanel();
};

window.toggleSideQuadernoRowType = (idx) => {
    if (!state._sideQuaderno || !state._sideQuaderno.rows[idx]) return;
    const row = state._sideQuaderno.rows[idx];
    row.sessionType = (row.sessionType || 'independent') === 'independent' ? 'timedelay' : 'independent';
    _saveSideQuaderno();
    renderNotebookPanel();
};

window.setSideQuadernoType = (type) => {
    if (!state._sideQuaderno) return;
    state._sideQuaderno.sessionType = type;
    _saveSideQuaderno();
    renderNotebookPanel();
};

window.clearSideQuaderno = async () => {
    if (typeof themedConfirm === 'function' && !await themedConfirm("Svuotare il quaderno laterale? I dati non salvati andranno persi.")) return;
    state._sideQuaderno = { date: new Date().toISOString().split('T')[0], rows: [], sessionType: 'independent', tdSeconds: 5 };
    _saveSideQuaderno();
    renderNotebookPanel();
};

window.saveSideQuadernoSession = async () => {
    if (!state.activePatientId) return alert("Seleziona prima un paziente in alto.");
    // Operate on the SAME in-memory patient object the main save uses to avoid conflicts
    const p = state.patients.find(x => x.id === state.activePatientId);
    if (!p) return;
    if (!state._sideQuaderno) return;

    const sq = state._sideQuaderno;
    const type = sq.sessionType || 'independent';
    const tdSeconds = sq.tdSeconds || 5;
    const scoredRows = sq.rows.filter(r => r.results && r.results.length > 0);
    if (scoredRows.length === 0) return alert("Nessun LU registrato.");

    if (!p.history) p.history = [];
    const now = new Date().toISOString();
    let totalLU = 0, totalCorrect = 0;

    scoredRows.forEach(row => {
        const res = row.results;
        const rawV = res.filter(v => v === true).length;
        const rawP = res.filter(v => v === 'prompt').length;
        const rawX = res.filter(v => v === false).length;
        const total = rawV + rawP + rawX;
        if (total === 0) return;
        totalLU += total;
        totalCorrect += rawV;

        const rowType = row.sessionType || type;
        const sessionData = {
            date: now,
            setId: 'quaderno_' + row.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            setName: row.name,
            mode: 'quaderno',
            correct: rawV,
            prompts: rawP,
            total: total,
            percentage: Math.round((rawV / total) * 100),
            sessionType: rowType,
            rawV, rawP, rawX
        };
        if (rowType === 'timedelay') sessionData.timeDelaySeconds = tdSeconds;
        p.history.push(sessionData);
    });

    await DB.savePatient(p);

    // Clear the side quaderno after a successful save
    state._sideQuaderno = { date: new Date().toISOString().split('T')[0], rows: [], sessionType: type, tdSeconds };
    _saveSideQuaderno();
    renderNotebookPanel();
    if (typeof filterSetsByMode === 'function') filterSetsByMode();

    // Brief confirmation on the save button
    const btn = document.querySelector('#notebook-panel-body .btn-success');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvato!';
        setTimeout(() => { if (btn.isConnected) btn.innerHTML = orig; }, 1800);
    }
};
