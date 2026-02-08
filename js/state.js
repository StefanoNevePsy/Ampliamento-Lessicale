// === STATE & CONSTANTS ===
const MODES_CONFIG = {
    'tact': 'TACT',
    'ran': 'RAN',
    'tombola': 'Tombola',
    'memory': 'Memory',
    'search_find': 'Cerca-Trova'
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
    // Tag system: collected from all sets for autocomplete suggestions
    allTags: []
};

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
