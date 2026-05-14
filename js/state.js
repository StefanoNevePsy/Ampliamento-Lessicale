// === STATE & CONSTANTS ===

// Built-in mode definitions (label + engine for rendering)
const BUILTIN_MODES = {
    'tact': { label: 'TACT', engine: 'tact' },
    'ran': { label: 'RAN', engine: 'ran' },
    'fluenza': { label: 'Fluenza', engine: 'fluenza' },
    'tombola': { label: 'Tombola', engine: 'tombola' },
    'tombola_sonora': { label: 'Tombola Sonora', engine: 'tombola_sonora' },
    'memory': { label: 'Memory', engine: 'memory' },
    'search_find': { label: 'Cerca-Trova', engine: 'search_find' },
    'intraverbal_scenari': { label: 'Intraverbal-Scenari', engine: 'intraverbal_scenari' },
    'pool_random': { label: 'Pool Random', engine: 'pool_random' },
    'pool_intraverbal': { label: 'Pool Intraverbal', engine: 'pool_intraverbal' },
    'intruso': { label: 'Intruso', engine: 'intruso' },
    'topologia': { label: 'Topologia', engine: 'topologia' },
    'sequenze': { label: 'Sequenze', engine: 'sequenze' },
    'categorizzazione': { label: 'Categorizzazione', engine: 'categorizzazione' },
    'zoom': { label: 'Zoom', engine: 'zoom' },
    'ran_intensivo': { label: 'RAN Intensivo', engine: 'ran_intensivo' },
    'quaderno': { label: 'Quaderno', engine: 'quaderno' },
    'quaderno_task': { label: 'Task Analysis', engine: 'quaderno_task' },
    'ricorda': { label: 'Ricorda', engine: 'ricorda' },
    'singolare_plurale': { label: 'Singolare/Plurale', engine: 'singolare_plurale' },
    'stroop_numerico': { label: 'Stroop Numerico', engine: 'stroop_numerico' },
    'go_nogo': { label: 'Go/No-Go', engine: 'go_nogo' },
    'stroop_etichetta': { label: 'Stroop Etichetta', engine: 'stroop_etichetta' }
};

// MODES_CONFIG: dynamic map of all modes (built-in + custom)
// Rebuilt by rebuildModesConfig() on init and after edits
let MODES_CONFIG = {};

function rebuildModesConfig() {
    MODES_CONFIG = {};
    // Built-in modes
    for (const [k, v] of Object.entries(BUILTIN_MODES)) {
        MODES_CONFIG[k] = v.label;
    }
    // Custom modes from layout
    const layout = getActivityLayout();
    if (layout.customModes) {
        for (const [k, v] of Object.entries(layout.customModes)) {
            MODES_CONFIG[k] = v.label;
        }
    }
}

// --- ACTIVITY LAYOUT ---
function getDefaultActivityLayout() {
    return {
        groups: [
            { name: '', modes: ['tact', 'ran', 'ran_intensivo', 'fluenza', 'tombola', 'tombola_sonora', 'memory', 'search_find', 'intraverbal_scenari', 'zoom', 'quaderno'] },
            { name: 'Avanzate', modes: ['topologia', 'sequenze', 'quaderno_task'] },
            { name: 'Pool da Tag', modes: ['pool_random', 'pool_intraverbal', 'intruso', 'categorizzazione', 'ricorda', 'singolare_plurale'] },
            { name: 'Inibizione', modes: ['stroop_numerico', 'go_nogo', 'stroop_etichetta'] }
        ],
        modeEmojis: {},
        customModes: {} // key -> { label, engine (built-in mode key used for logic) }
    };
}

function getActivityLayout() {
    try {
        const saved = localStorage.getItem('activityLayout');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (!parsed.customModes) parsed.customModes = {};
            if (!parsed.modeEmojis) parsed.modeEmojis = {};
            // Auto-inject any new built-in modes not present in any group
            const allModes = (parsed.groups || []).flatMap(g => g.modes || []);
            const defaultLayout = getDefaultActivityLayout();
            const defaultModes = defaultLayout.groups.flatMap(g => g.modes || []);
            const missing = defaultModes.filter(m => !allModes.includes(m));
            if (missing.length > 0) {
                // Add missing modes to the first group
                if (parsed.groups && parsed.groups.length > 0) {
                    parsed.groups[0].modes = [...(parsed.groups[0].modes || []), ...missing];
                }
            }
            return parsed;
        }
    } catch(e) {}
    return getDefaultActivityLayout();
}

function saveActivityLayout(layout) {
    localStorage.setItem('activityLayout', JSON.stringify(layout));
    rebuildModesConfig();
}

// Get the engine (rendering logic) for a mode key
function getModeEngine(modeKey) {
    if (BUILTIN_MODES[modeKey]) return modeKey;
    const layout = getActivityLayout();
    if (layout.customModes && layout.customModes[modeKey]) return layout.customModes[modeKey].engine;
    return modeKey;
}

// Get display label for a mode (with emoji if set)
function getModeLabel(modeKey) {
    const layout = getActivityLayout();
    const emoji = (layout.modeEmojis && layout.modeEmojis[modeKey]) ? layout.modeEmojis[modeKey] + ' ' : '';
    if (layout.customModes && layout.customModes[modeKey]) return emoji + layout.customModes[modeKey].label;
    if (BUILTIN_MODES[modeKey]) return emoji + BUILTIN_MODES[modeKey].label;
    return emoji + (MODES_CONFIG[modeKey] || modeKey);
}

let state = {
    items: [],
    deck: [],
    memory: { flipped: [], matched: [], lockBoard: false },
    savedSets: [],
    patients: [],
    editingSetId: null,
    editingItems: [],
    activeEditorIndex: null,
    ranMode: 'grid',
    ranIndex: 0,
    tactIndex: 0,
    activeSetId: null,
    activePatientId: null,
    session: { correct: 0, incorrect: 0, prompts: 0, total: 0, active: false, itemResults: {} },
    // Tag system
    allTags: [],
    // Pool/Intruso: selected tags for filtering
    selectedPoolTags: [],
    // Intruso state
    intrusoRound: 0,
    intrusoRounds: [],
    intrusoCardsPerRound: 4,
    currentIntrusoRound: null,
    // Pool Random state
    poolAllItems: [],
    poolBatchSize: 0,
    // Sequenze state
    sequenzeItems: [],
    sequenzeSelected: [],
    // Categorizzazione state
    catItems: [],
    catIndex: 0,
    // Zoom state
    zoomRevealed: false,
    zoomIndex: 0,
    // Fluenza state
    fluenzaIndex: -1,
    fluenzaCount: 0,
    fluenzaErrors: 0,
    fluenzaStarted: false,
    fluenzaFinished: false,
    fluenzaTimerDuration: 60,
    fluenzaTimeLeft: 0,
    fluenzaTimerInterval: null,
    fluenzaItemResults: {},
    fluenzaShowBar: true,
    // Multi-set session for search_find / intraverbal_scenari
    // Allows accumulating data across multiple sets, then saving one unified session
    multiSetSession: null,  // { sets: [ { setId, setName, setCat, itemResults, scoreHistory } ], active: false }
    // Singolare/Plurale state
    spState: null  // { items, index, subMode, pairStep, pairOrder, currentForm, pluralCount, round }
};

// --- TAG IMAGE HELPERS (IndexedDB with in-memory cache) ---
// Cache loaded on app init - sync read, async write
let _tagImageCache = {};

async function initTagImageCache() {
    try {
        _tagImageCache = await DB.getAllTagImages();
        // Migrate from localStorage if any exist there
        try {
            const lsData = localStorage.getItem('tagImages');
            if (lsData) {
                const lsMap = JSON.parse(lsData);
                const lsKeys = Object.keys(lsMap);
                if (lsKeys.length > 0) {
                    let migrated = 0;
                    for (const key of lsKeys) {
                        if (!_tagImageCache[key]) {
                            _tagImageCache[key] = lsMap[key];
                            migrated++;
                        }
                    }
                    if (migrated > 0) {
                        await DB.importAllTagImages(_tagImageCache);
                    }
                    localStorage.removeItem('tagImages');
                    console.log(`Migrated ${migrated} tag images from localStorage to IndexedDB`);
                }
            }
        } catch(e) { console.warn('Tag image migration:', e); }
    } catch(e) {
        console.error('Error loading tag image cache:', e);
        _tagImageCache = {};
    }
}

function getTagImage(tag) {
    return _tagImageCache[tag.toLowerCase().trim()] || null;
}

function setTagImage(tag, dataUrl) {
    const key = tag.toLowerCase().trim();
    _tagImageCache[key] = dataUrl;
    DB.saveTagImage(key, dataUrl).catch(e => console.error('Error saving tag image:', e));
}

function getAllTagImages() {
    return { ..._tagImageCache };
}

// --- CUSTOM SESSION NAMES (stored in localStorage) ---
function getRecentSessionNames() {
    try { return JSON.parse(localStorage.getItem('sessionNames') || '[]'); }
    catch(e) { return []; }
}

function saveCustomSessionName(name) {
    if (!name || !name.trim()) return;
    try {
        let names = getRecentSessionNames();
        names = names.filter(n => n !== name.trim());
        names.unshift(name.trim());
        if (names.length > 20) names = names.slice(0, 20);
        localStorage.setItem('sessionNames', JSON.stringify(names));
    } catch(e) { console.error('Error saving session name:', e); }
}

// --- QUADERNO HELPERS (stored in localStorage) ---
function getSavedQuadernoLists() {
    try { return JSON.parse(localStorage.getItem('quadernoLists') || '[]'); }
    catch(e) { return []; }
}

function saveQuadernoList(list) {
    try {
        let lists = getSavedQuadernoLists();
        const existingIdx = lists.findIndex(l => l.name === list.name);
        if (existingIdx >= 0) lists[existingIdx] = list;
        else lists.unshift(list);
        localStorage.setItem('quadernoLists', JSON.stringify(lists));
    } catch(e) { console.error('Error saving quaderno list:', e); }
}

function deleteQuadernoList(name) {
    try {
        let lists = getSavedQuadernoLists().filter(l => l.name !== name);
        localStorage.setItem('quadernoLists', JSON.stringify(lists));
    } catch(e) { console.error('Error deleting quaderno list:', e); }
}

// Collect all unique tags from existing sets
function refreshAllTags() {
    const tagSet = new Set();
    state.savedSets.forEach(s => {
        if (s.tags && Array.isArray(s.tags)) {
            s.tags.forEach(t => tagSet.add(t.toLowerCase().trim()));
        }
    });
    state.allTags = [...tagSet].sort();
}

// Get all items from sets that have a specific tag, with images only
function getItemsByTag(tag) {
    const items = [];
    const tagLower = tag.toLowerCase().trim();
    state.savedSets.forEach(s => {
        if (s.tags && s.tags.some(t => t.toLowerCase().trim() === tagLower)) {
            s.items.forEach(item => {
                if (item.url && !item.hidden) {
                    items.push({ ...item, sourceSet: s.name, sourceTag: tag });
                }
            });
        }
    });
    return items;
}

// === THEMED PROMPT & CONFIRM (cross-platform, replaces window.prompt/confirm) ===

function themedPrompt(message, defaultValue = '') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'themed-dialog-overlay';
        overlay.innerHTML = `
            <div class="themed-dialog">
                <div class="themed-dialog-msg">${message}</div>
                <input class="themed-dialog-input" type="text" value="${defaultValue.replace(/"/g, '&quot;')}" />
                <div class="themed-dialog-btns">
                    <button class="btn btn-ghost themed-dialog-cancel">Annulla</button>
                    <button class="btn btn-primary themed-dialog-ok">OK</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));
        const inp = overlay.querySelector('.themed-dialog-input');
        const ok = overlay.querySelector('.themed-dialog-ok');
        const cancel = overlay.querySelector('.themed-dialog-cancel');
        inp.focus();
        inp.select();
        const close = val => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); resolve(val); };
        ok.onclick = () => close(inp.value || null);
        cancel.onclick = () => close(null);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); });
        overlay.addEventListener('click', e => { if (e.target === overlay) cancel.click(); });
    });
}

function themedConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'themed-dialog-overlay';
        overlay.innerHTML = `
            <div class="themed-dialog">
                <div class="themed-dialog-msg">${message}</div>
                <div class="themed-dialog-btns">
                    <button class="btn btn-ghost themed-dialog-cancel">Annulla</button>
                    <button class="btn btn-danger themed-dialog-ok">Conferma</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));
        const ok = overlay.querySelector('.themed-dialog-ok');
        const cancel = overlay.querySelector('.themed-dialog-cancel');
        ok.focus();
        const close = val => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); resolve(val); };
        ok.onclick = () => close(true);
        cancel.onclick = () => close(false);
        overlay.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); });
        overlay.addEventListener('click', e => { if (e.target === overlay) cancel.click(); });
    });
}

// Get all items from sets matching ANY of the selected tags
function getItemsByTags(tags) {
    const items = [];
    const seen = new Set();
    const tagsLower = tags.map(t => t.toLowerCase().trim());
    state.savedSets.forEach(s => {
        if (s.tags && s.tags.some(t => tagsLower.includes(t.toLowerCase().trim()))) {
            s.items.forEach(item => {
                const key = `${item.label}__${item.url}`;
                if (item.url && !item.hidden && !seen.has(key)) {
                    seen.add(key);
                    const matchingTags = s.tags.filter(t => tagsLower.includes(t.toLowerCase().trim()));
                    items.push({ ...item, sourceSet: s.name, sourceTags: matchingTags });
                }
            });
        }
    });
    return items;
}
