// === APP INIT & MAIN LOGIC ===

// --- INIT ---
window.onload = async () => {
    try {
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
        state.savedSets.forEach(set => {
            if (set.items) {
                set.items.forEach(item => {
                    if (item.l && !item.label) {
                        item.label = item.l;
                        delete item.l;
                    }
                });
            }
        });

        const badge = document.getElementById('lib-count');
        if (badge) badge.innerText = state.savedSets.length;

        refreshAllTags();
        filterSetsByMode();
        populateGlobalPatientSelect();

        document.addEventListener('paste', handlePaste);
        document.addEventListener('dragstart', (e) => e.preventDefault());
        document.addEventListener('keydown', handleShortcuts);

    } catch (e) { console.error("Init Error", e); }
};

// --- SET FILTERING & DROPDOWN ---
const POOL_MODES = ['pool_random', 'pool_intraverbal', 'intruso', 'categorizzazione'];

window.filterSetsByMode = function () {
    const currentMode = document.getElementById('mode-select').value;
    const isPoolMode = POOL_MODES.includes(currentMode);

    // Toggle set selector vs tag selector visibility
    const setWrapper = document.getElementById('set-selector-wrapper');
    const tagWrapper = document.getElementById('tag-selector-wrapper');
    if (setWrapper && tagWrapper) {
        if (isPoolMode) {
            setWrapper.classList.add('hidden');
            tagWrapper.classList.remove('hidden');
            renderPoolTagSelector();
        } else {
            setWrapper.classList.remove('hidden');
            tagWrapper.classList.add('hidden');
        }
    }

    if (isPoolMode) return; // Pool modes don't use set dropdown

    const compatibleSets = state.savedSets.filter(s => {
        if (s.modes && Array.isArray(s.modes) && s.modes.length > 0) {
            // intraverbal_scenari uses same sets as search_find
            const checkMode = currentMode === 'intraverbal_scenari' ? 'search_find' : currentMode;
            return s.modes.includes(checkMode) || s.modes.includes(currentMode);
        }
        // Fallback for old sets without mode tags
        if (currentMode === 'search_find' || currentMode === 'intraverbal_scenari') {
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

// --- DROPDOWN WITH INDICATORS ---
function updateDropdown(sets) {
    const select = document.getElementById('category-select');
    const currentMode = document.getElementById('mode-select').value;
    const activePatient = state.activePatientId ? state.patients.find(p => p.id === state.activePatientId) : null;

    select.innerHTML = '<option value="" disabled selected>-- Scegli un Set --</option>';

    const categories = {};
    sets.forEach(s => {
        const cat = s.category || "Altri";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(s);
    });

    for (const [catName, catSets] of Object.entries(categories)) {
        const group = document.createElement('optgroup');
        group.label = catName;

        catSets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;

            const missingCount = s.items.filter(i => !i.url).length;
            const warningTag = missingCount > 0 ? ` \u26A0\uFE0F${missingCount}` : '';

            let trophyTag = '';
            if (activePatient && activePatient.history) {
                const sessions = activePatient.history.filter(h => h.setId === s.id && h.mode === currentMode);
                if (typeof checkCriterion === 'function' && checkCriterion(sessions)) {
                    trophyTag = ' \uD83C\uDFC6';
                }
            }

            opt.text = `${s.name}${warningTag}${trophyTag}`;
            if (state.activeSetId === s.id) opt.selected = true;
            group.appendChild(opt);
        });
        select.appendChild(group);
    }
}

// --- LOAD SET FROM DROPDOWN ---
window.loadSelectedSet = async (setId) => {
    const s = state.savedSets.find(x => x.id === setId);
    if (s) {
        state.activeSetId = setId;
        state.items = JSON.parse(JSON.stringify(s.items));
        window.startGame();
    }
};

// --- START GAME ---
window.startGame = () => {
    const mode = document.getElementById('mode-select').value;
    const isPoolMode = POOL_MODES.includes(mode);
    const numStimuli = parseInt(document.getElementById('num-stimuli').value);

    // For pool modes, build items from selected tags
    if (isPoolMode) {
        if (state.selectedPoolTags.length === 0) {
            document.getElementById('game-stage').innerHTML = `
                <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                    <i class="fa-solid fa-tags fa-3x" style="margin-bottom:15px;"></i>
                    <p>Seleziona almeno un <b>tag</b> dal selettore<br>per avviare la modalit&agrave; ${MODES_CONFIG[mode]}.</p>
                </div>`;
            return;
        }

        state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
        updateScoreUI();
        document.getElementById('scoring-controls').classList.remove('hidden');
        document.getElementById('btn-save-session').classList.add('hidden');
        document.getElementById('btn-undo-marker').classList.add('hidden');

        // For pool_random / pool_intraverbal: collect all items from tags
        if (mode === 'pool_random' || mode === 'pool_intraverbal') {
            let poolItems = getItemsByTags(state.selectedPoolTags);
            poolItems.sort(() => Math.random() - 0.5);
            state.activeSetId = (mode === 'pool_intraverbal' ? 'pool_iv_' : 'pool_') + state.selectedPoolTags.join('_');
            renderGameMode(mode, poolItems);
        }
        // For intruso: the renderer handles its own item building
        else if (mode === 'intruso') {
            state.activeSetId = 'intruso_' + state.selectedPoolTags.join('_');
            renderGameMode(mode, []);
        }
        // For categorizzazione: the renderer handles its own item building
        else if (mode === 'categorizzazione') {
            state.activeSetId = 'cat_' + state.selectedPoolTags.join('_');
            renderGameMode(mode, []);
        }
        return;
    }

    // Quaderno mode: no items needed, just render
    if (mode === 'quaderno') {
        state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
        document.getElementById('scoring-controls').classList.add('hidden');
        document.getElementById('btn-save-session').classList.add('hidden');
        renderGameMode(mode, []);
        return;
    }

    // Standard modes: require loaded items
    if (!state.items.length) return;

    state.session = { correct: 0, incorrect: 0, total: 0, active: true, itemResults: {} };
    updateScoreUI();
    document.getElementById('scoring-controls').classList.remove('hidden');
    document.getElementById('btn-save-session').classList.add('hidden');

    let playItems = state.items.filter(i => !i.hidden);

    if (mode !== 'search_find' && mode !== 'intraverbal_scenari') {
        playItems.sort(() => Math.random() - 0.5);
        if (numStimuli > 0 && playItems.length > numStimuli) {
            playItems = playItems.slice(0, numStimuli);
        }
    }

    // Grid size (for visual layout in grids)
    const gridSize = parseInt(document.getElementById('grid-size').value);
    if (mode !== 'search_find' && mode !== 'intraverbal_scenari' && gridSize !== 20) {
        const gridLimit = gridSize * gridSize;
        if (playItems.length > gridLimit) playItems = playItems.slice(0, gridLimit);
    }

    state.tactIndex = 0;
    state.ranIndex = 0;

    const undoBtn = document.getElementById('btn-undo-marker');
    if (mode === 'search_find' || mode === 'intraverbal_scenari') undoBtn.classList.remove('hidden'); else undoBtn.classList.add('hidden');
    renderGameMode(mode, playItems);
};

// --- SCORING ---
window.recordResponse = (isCorrect) => {
    if (!state.session.active) return;
    const mode = document.getElementById('mode-select').value;

    if (mode === 'tact' || (mode === 'ran' && state.ranMode === 'single')) {
        const currentIndex = (mode === 'tact') ? state.tactIndex : state.ranIndex;
        state.session.itemResults[currentIndex] = isCorrect;

        const targetImg = document.querySelector('.tact-card-lg img, .ran-main-img');
        if (targetImg) {
            targetImg.classList.remove('feedback-success', 'feedback-fail');
            void targetImg.offsetWidth;
            targetImg.classList.add(isCorrect ? 'feedback-success' : 'feedback-fail');
        }
    } else if (mode === 'search_find' || mode === 'intraverbal_scenari') {
        const markers = document.querySelectorAll('.marker-pin');
        if (markers.length > 0) {
            const lastMarker = markers[markers.length - 1];
            if (!lastMarker.dataset.id) lastMarker.dataset.id = Date.now();
            state.session.itemResults[lastMarker.dataset.id] = isCorrect;
            lastMarker.classList.remove('success', 'fail');
            lastMarker.classList.add(isCorrect ? 'success' : 'fail');
        }
    } else {
        state.session.itemResults[Date.now()] = isCorrect;
    }

    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.total = results.length;

    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');
    if (typeof showSessionNameInput === 'function') showSessionNameInput();
};

function updateScoreUI() {
    document.getElementById('score-display').innerText = `${state.session.correct}`;
}

// --- KEYBOARD SHORTCUTS ---
function handleShortcuts(e) {
    const mode = document.getElementById('mode-select').value;
    if (state.session.active && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.key.toLowerCase() === 'v') recordResponse(true);
        if (e.key.toLowerCase() === 'x') recordResponse(false);
    }
    if (mode === 'ran' && state.ranMode === 'single') {
        if (e.key === 'ArrowRight') nextRan();
        if (e.key === 'ArrowLeft') prevRan();
    }
    if (mode === 'search_find' || mode === 'intraverbal_scenari') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') removeLastMarker();
        if (e.key === 'Delete' || e.key === 'Backspace') clearMarkers();
    }
}

// --- SAVE SESSION ---
window.confirmSaveSession = async () => {
    if (!state.activePatientId) return alert("Seleziona prima un paziente in alto.");
    const p = state.patients.find(x => x.id === state.activePatientId);
    const mode = document.getElementById('mode-select').value;
    let defaultName;
    if (POOL_MODES.includes(mode)) {
        defaultName = 'Pool: ' + state.selectedPoolTags.join(', ');
    } else {
        defaultName = state.savedSets.find(s => s.id === state.activeSetId)?.name || "Set Rimosso";
    }
    const total = state.session.total;
    if (total === 0) return;

    // Custom session name: use input field value if available
    const nameInput = document.getElementById('session-name-input');
    let customName = nameInput ? nameInput.value.trim() : '';
    const setName = customName || defaultName;

    // Save custom name for future suggestions
    if (customName) saveCustomSessionName(customName);

    const sessionData = {
        date: new Date().toISOString(),
        setId: state.activeSetId,
        setName: setName,
        mode: mode,
        correct: state.session.correct,
        total: total,
        percentage: Math.round((state.session.correct / total) * 100)
    };
    if (!p.history) p.history = [];
    p.history.push(sessionData);
    await DB.savePatient(p);

    const btn = document.getElementById('btn-save-session');
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    btn.style.background = 'var(--success-color)';
    if (nameInput) nameInput.value = '';
    setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
        btn.style.background = '#2563eb';
        state.session.active = false;
        document.getElementById('scoring-controls').classList.add('hidden');
        btn.classList.add('hidden');
        const sessionNameWrapper = document.getElementById('session-name-wrapper');
        if (sessionNameWrapper) sessionNameWrapper.classList.add('hidden');
    }, 1000);
};

// Show session name input when session becomes saveable
window.showSessionNameInput = () => {
    const wrapper = document.getElementById('session-name-wrapper');
    if (wrapper) {
        wrapper.classList.remove('hidden');
        // Update datalist with recent names
        const datalist = document.getElementById('session-names-list');
        if (datalist) {
            datalist.innerHTML = getRecentSessionNames()
                .map(n => `<option value="${n}">`)
                .join('');
        }
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
function renderLibList() {
    const container = document.getElementById('lib-list');
    if (!container) return;

    if (state.savedSets.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1; text-align:center; opacity:0.5;">Nessun set in archivio.</p>';
        return;
    }

    container.innerHTML = state.savedSets.map(s => {
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

        // Show tags if present
        const tagsHtml = (s.tags && s.tags.length > 0)
            ? `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
                ${s.tags.map(t => `<span class="tag-chip" style="font-size:0.65rem; padding:1px 6px;">${t}</span>`).join('')}
               </div>`
            : '';

        return `
        <div class="lib-card ${s.isClinical ? 'clinical' : ''}">
            ${previewHtml}
            <div class="lib-title" style="font-weight:bold; font-size:1rem;">${s.name}</div>
            <div class="lib-cat" style="color:var(--text-secondary); font-size:0.8rem;">${s.category || 'Generale'}</div>
            <div style="font-size:0.8rem; color:#aaa; margin-top:2px;">${s.items.length} items</div>
            ${tagsHtml}
            ${warningHtml}

            <div style="display:flex; gap:5px; margin-top:10px;">
                <button class="btn btn-primary" style="flex:1; padding:6px;" onclick="loadSet('${s.id}')" title="Carica">
                    <i class="fa-solid fa-play"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px;" onclick="editSet('${s.id}')" title="Modifica">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 12px;" onclick="exportSingleSet('${s.id}')" title="Esporta">
                    <i class="fa-solid fa-file-export"></i>
                </button>
                <button class="btn btn-danger" style="padding:6px 12px;" onclick="deleteSet('${s.id}')" title="Elimina">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

window.loadSet = async (id) => {
    const s = state.savedSets.find(x => x.id === id);
    if (s) {
        state.activeSetId = id;
        state.items = JSON.parse(JSON.stringify(s.items));
        const select = document.getElementById('category-select');
        if (select) select.value = id;
        window.closeLibrary();
        window.startGame();
    }
};

// FIX: No more page reload for create/delete
window.createEmptySet = async () => {
    const name = prompt("Nome del nuovo Set?");
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
    if (confirm("Eliminare definitivamente?")) {
        await DB.deleteSet(id);
        await reloadLibrary();
    }
};

// --- FULLSCREEN ---
window.toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
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
