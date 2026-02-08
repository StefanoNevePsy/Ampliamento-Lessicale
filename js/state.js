// === STATE & CONSTANTS ===
const MODES_CONFIG = {
    'tact': 'TACT',
    'ran': 'RAN',
    'tombola': 'Tombola',
    'memory': 'Memory',
    'search_find': 'Cerca-Trova',
    'pool_random': 'Pool Random',
    'intruso': 'Intruso',
    'topologia': 'Topologia',
    'sequenze': 'Sequenze',
    'categorizzazione': 'Categorizzazione'
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
    session: { correct: 0, incorrect: 0, total: 0, active: false, itemResults: {} },
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
    catIndex: 0
};

// --- TAG IMAGE HELPERS (stored in localStorage) ---
function getTagImage(tag) {
    try { return JSON.parse(localStorage.getItem('tagImages') || '{}')[tag] || null; }
    catch(e) { return null; }
}

function setTagImage(tag, dataUrl) {
    try {
        const map = JSON.parse(localStorage.getItem('tagImages') || '{}');
        map[tag] = dataUrl;
        localStorage.setItem('tagImages', JSON.stringify(map));
    } catch(e) { console.error('Error saving tag image:', e); }
}

function getAllTagImages() {
    try { return JSON.parse(localStorage.getItem('tagImages') || '{}'); }
    catch(e) { return {}; }
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
    state.savedSets.forEach(s => {
        if (s.tags && s.tags.includes(tag)) {
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
    state.savedSets.forEach(s => {
        if (s.tags && s.tags.some(t => tags.includes(t))) {
            s.items.forEach(item => {
                const key = `${item.label}__${item.url}`;
                if (item.url && !item.hidden && !seen.has(key)) {
                    seen.add(key);
                    // Collect which tags this item belongs to
                    const matchingTags = s.tags.filter(t => tags.includes(t));
                    items.push({ ...item, sourceSet: s.name, sourceTags: matchingTags });
                }
            });
        }
    });
    return items;
}
