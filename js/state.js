// === STATE & CONSTANTS ===
const MODES_CONFIG = {
    'tact': 'TACT',
    'ran': 'RAN',
    'tombola': 'Tombola',
    'tombola_sonora': 'Tombola Sonora',
    'memory': 'Memory',
    'search_find': 'Cerca-Trova',
    'intraverbal_scenari': 'Intraverbal-Scenari',
    'pool_random': 'Pool Random',
    'pool_intraverbal': 'Pool Intraverbal',
    'intruso': 'Intruso',
    'topologia': 'Topologia',
    'sequenze': 'Sequenze',
    'categorizzazione': 'Categorizzazione',
    'zoom': 'Zoom',
    'quaderno': 'Quaderno',
    'quaderno_task': 'Task Analysis'
};

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
    zoomIndex: 0
};

// --- TAG IMAGE HELPERS (stored in localStorage) ---
function getTagImage(tag) {
    try { return JSON.parse(localStorage.getItem('tagImages') || '{}')[tag.toLowerCase().trim()] || null; }
    catch(e) { return null; }
}

function setTagImage(tag, dataUrl) {
    try {
        const key = tag.toLowerCase().trim();
        const map = JSON.parse(localStorage.getItem('tagImages') || '{}');
        map[key] = dataUrl;
        localStorage.setItem('tagImages', JSON.stringify(map));
    } catch(e) { console.error('Error saving tag image:', e); }
}

function getAllTagImages() {
    try { return JSON.parse(localStorage.getItem('tagImages') || '{}'); }
    catch(e) { return {}; }
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
