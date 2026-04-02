// === GAME MODE RENDERERS ===

// Balanced shuffle: distributes items evenly across categories
// instead of pure random which skews toward categories with more items
function balancedShuffle(items, getTagFn) {
    const groups = {};
    items.forEach(item => {
        const tag = getTagFn(item) || '_default';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(item);
    });
    // Shuffle within each group
    Object.values(groups).forEach(arr => arr.sort(() => Math.random() - 0.5));
    // Weighted random: equal probability per tag at each pick
    const result = [];
    const tagKeys = Object.keys(groups);
    const indices = {};
    tagKeys.forEach(k => indices[k] = 0);
    while (result.length < items.length) {
        const available = tagKeys.filter(k => indices[k] < groups[k].length);
        if (available.length === 0) break;
        const tag = available[Math.floor(Math.random() * available.length)];
        result.push(groups[tag][indices[tag]]);
        indices[tag]++;
    }
    return result;
}

function getPlaceholderUrl(label) {
    return `https://placehold.co/600x600?text=${encodeURIComponent(label || '?')}`;
}

function handleImgError(img, label) {
    img.onerror = null;
    img.src = getPlaceholderUrl(label);
}

// === CUSTOM AUTOCOMPLETE (replaces native datalist to avoid keyboard overlap) ===
// Returns HTML for a custom-autocomplete wrapper. Options is an array of strings.
// inputAttrs is an object of extra attributes for the input element.
function customAutocompleteHtml(inputId, options, inputAttrs = {}) {
    const panelId = inputId + '-ac-panel';
    const attrs = Object.entries(inputAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    const optionsHtml = options.length > 0
        ? options.map(n => `<div class="custom-ac-item" data-value="${n.replace(/"/g, '&quot;')}">${n}</div>`).join('')
        : '';
    return `<div class="custom-autocomplete-wrap">
        <input type="text" id="${inputId}" ${attrs} autocomplete="off">
        <div class="custom-ac-panel" id="${panelId}">${optionsHtml}</div>
    </div>`;
}

// Attach behavior to a custom autocomplete (call after DOM insert)
function setupCustomAutocomplete(inputId, options) {
    const input = document.getElementById(inputId);
    const panel = document.getElementById(inputId + '-ac-panel');
    if (!input || !panel) return;

    let highlighted = -1;
    let filteredOptions = [...options];

    function renderOptions(filter) {
        const query = (filter || '').toLowerCase().trim();
        filteredOptions = query
            ? options.filter(n => n.toLowerCase().includes(query))
            : [...options];
        if (filteredOptions.length === 0) {
            panel.innerHTML = '<div class="custom-ac-empty">Nessun suggerimento</div>';
        } else {
            panel.innerHTML = filteredOptions.map(n =>
                `<div class="custom-ac-item" data-value="${n.replace(/"/g, '&quot;')}">${n}</div>`
            ).join('');
        }
        highlighted = -1;
        // Attach click handlers
        panel.querySelectorAll('.custom-ac-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = el.dataset.value;
                closePanel();
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    function openPanel() {
        if (options.length === 0) return;
        renderOptions(input.value);
        // Use fixed positioning so panels aren't clipped by overflow:hidden on #game-stage
        // Use visualViewport to avoid keyboard-push issues on tablets
        const vv = window.visualViewport;
        const vpHeight = vv ? vv.height : window.innerHeight;
        const vpOffsetTop = vv ? vv.offsetTop : 0;
        const rect = input.getBoundingClientRect();
        const controlsRow = document.querySelector('.controls-row');
        const topLimit = controlsRow ? controlsRow.getBoundingClientRect().bottom + 4 : 60;
        const available = rect.top - topLimit;
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.width = rect.width + 'px';
        panel.style.bottom = (vpHeight + vpOffsetTop - rect.top + 4) + 'px';
        panel.style.maxHeight = Math.max(80, Math.min(available, 250)) + 'px';
        panel.classList.add('open');
        panel.scrollTop = 0;
    }

    function closePanel() {
        panel.classList.remove('open');
        highlighted = -1;
    }

    function highlightItem(idx) {
        const items = panel.querySelectorAll('.custom-ac-item');
        items.forEach(el => el.classList.remove('highlighted'));
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('highlighted');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
        highlighted = idx;
    }

    // Reposition panel when visual viewport changes (e.g. keyboard open/close on tablets)
    if (window.visualViewport) {
        const reposition = () => { if (panel.classList.contains('open')) openPanel(); };
        window.visualViewport.addEventListener('resize', reposition);
        window.visualViewport.addEventListener('scroll', reposition);
    }

    input.addEventListener('focus', () => { openPanel(); });
    input.addEventListener('input', () => { renderOptions(input.value); if (options.length > 0) panel.classList.add('open'); });
    input.addEventListener('blur', () => { setTimeout(closePanel, 150); });
    input.addEventListener('keydown', (e) => {
        const items = panel.querySelectorAll('.custom-ac-item');
        if (!panel.classList.contains('open') || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightItem(Math.min(highlighted + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightItem(Math.max(highlighted - 1, 0));
        } else if (e.key === 'Enter' && highlighted >= 0 && highlighted < items.length) {
            e.preventDefault();
            input.value = items[highlighted].dataset.value;
            closePanel();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (e.key === 'Escape') {
            closePanel();
        }
    });
}

function renderGameMode(mode, items) {
    const stage = document.getElementById('game-stage');
    // Preserve pointer canvas before clearing stage (detach so innerHTML doesn't destroy it)
    const pointerCanvas = document.getElementById('pointer-canvas');
    if (pointerCanvas) pointerCanvas.remove();
    stage.innerHTML = '';
    // Resolve custom modes to their engine
    const engine = (typeof getModeEngine === 'function') ? getModeEngine(mode) : mode;
    // Clean up any previous drag handlers
    if (window._topoCleanup) { window._topoCleanup(); window._topoCleanup = null; }
    if (engine === 'tact') renderTact(items, stage);
    else if (engine === 'ran') renderRan(items, stage);
    else if (engine === 'ran_intensivo') renderRanIntensivo(items, stage);
    else if (engine === 'fluenza') renderFluenza(items, stage);
    else if (engine === 'tombola') renderTombola(items, stage);
    else if (engine === 'tombola_sonora') renderTombolaSonora(items, stage);
    else if (engine === 'memory') renderMemory(items, stage);
    else if (engine === 'search_find' || engine === 'intraverbal_scenari') renderSearchFind(items, stage);
    else if (engine === 'pool_random' || engine === 'pool_intraverbal') renderPoolRandom(items, stage);
    else if (engine === 'intruso') renderIntruso(items, stage);
    else if (engine === 'topologia') renderTopologia(items, stage);
    else if (engine === 'sequenze') renderSequenze(items, stage);
    else if (engine === 'categorizzazione') renderCategorizzazione(items, stage);
    else if (engine === 'zoom') renderZoom(items, stage);
    else if (engine === 'quaderno' || engine === 'quaderno_task') renderQuaderno(stage, engine);
    // Re-insert pointer canvas on top after renderer runs (preserves event listeners and state)
    if (pointerCanvas) stage.appendChild(pointerCanvas);
    else {
        const c = document.createElement('canvas');
        c.id = 'pointer-canvas';
        stage.appendChild(c);
    }
}

// --- TACT ---
function renderTact(items, stage) {
    if (state.tactIndex === undefined) state.tactIndex = 0;

    const showCard = () => {
        const item = items[state.tactIndex];
        const status = state.session.itemResults ? state.session.itemResults[state.tactIndex] : undefined;
        const feedbackClass = status === true ? 'feedback-success' : (status === false ? 'feedback-fail' : '');

        stage.innerHTML = `
        <div class="tact-stage" onclick="window.nextTact()">
            <div class="tact-card-lg">
                <img src="${item.url || getPlaceholderUrl(item.label)}"
                     class="${feedbackClass}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this, '${item.label}')">
                <div class="tact-title">${item.label}</div>
                <div style="font-size:0.9rem; color:#888;">${state.tactIndex + 1} / ${items.length}</div>
            </div>
        </div>`;
    };
    window.nextTact = () => { state.tactIndex = (state.tactIndex + 1) % items.length; showCard(); window._startTDCountdown(); };
    showCard();
    window._startTDCountdown();
}

// --- RAN ---
function renderRan(items, stage) {
    state.ranDisplayItems = items;
    if (state.ranIndex >= items.length) state.ranIndex = 0;
    stage.innerHTML = `
        <div class="ran-container">
            <div class="ran-toolbar">
                <button class="btn btn-sm btn-ghost" onclick="toggleRanMode()">
                    <i class="fa-solid ${state.ranMode === 'grid' ? 'fa-film' : 'fa-table-cells'}"></i>
                    ${state.ranMode === 'grid' ? 'Passa a Sequenza' : 'Passa a Griglia'}
                </button>
            </div>
            <div id="ran-content" style="flex:1; min-height:0;"></div>
        </div>`;
    updateRanContent();
    window._startTDCountdown();
}

window.toggleRanMode = () => {
    state.ranMode = state.ranMode === 'grid' ? 'single' : 'grid';
    updateRanContent();
};

function updateRanContent() {
    const c = document.getElementById('ran-content');
    const items = state.ranDisplayItems;

    if (state.ranMode === 'grid') {
        let cols = Math.ceil(Math.sqrt(items.length));
        if (items.length <= 9) cols = 3; else if (items.length <= 16) cols = 4; else cols = 5;
        const rows = Math.ceil(items.length / cols);

        // Use fit-to-viewport grid: the grid IS the layout container
        c.innerHTML = `
        <div style="height:100%; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${items.map(x => `
                <div style="background:white; border-radius:8px; padding:4px; display:flex; align-items:center; justify-content:center; min-height:0; min-width:0; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.2);">
                    <img src="${x.url || getPlaceholderUrl(x.label)}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="handleImgError(this,'${x.label}')">
                </div>
            `).join('')}
        </div>`;
    } else {
        const x = items[state.ranIndex];
        const status = state.session.itemResults ? state.session.itemResults[state.ranIndex] : undefined;
        const feedbackClass = status === true ? 'feedback-success' : (status === false ? 'feedback-fail' : '');

        c.innerHTML = `
        <div class="ran-single-stage">
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; width:100%; overflow:hidden;">
                <img src="${x.url || getPlaceholderUrl(x.label)}"
                     class="ran-main-img ${feedbackClass}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this,'${x.label}')">
                <h2 style="text-align:center;">${x.label}</h2>
            </div>
            <div class="ran-controls-bar">
                <button class="ran-btn-nav" onclick="prevRan()"><i class="fa-solid fa-arrow-left"></i></button>
                <div class="ran-counter">${state.ranIndex + 1}/${items.length}</div>
                <button class="ran-btn-nav" onclick="nextRan()"><i class="fa-solid fa-arrow-right"></i></button>
            </div>
        </div>`;
    }
}

window.nextRan = () => { if (state.ranIndex < state.ranDisplayItems.length - 1) { state.ranIndex++; updateRanContent(); window._startTDCountdown(); } };
window.prevRan = () => { if (state.ranIndex > 0) { state.ranIndex--; updateRanContent(); window._startTDCountdown(); } };

// --- RAN INTENSIVO ---
function renderRanIntensivo(items, stage) {
    const ri = state._ranIntensivo;
    if (!ri || !ri.deck || ri.deck.length === 0) {
        stage.innerHTML = `<div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px; color:var(--text-secondary);">
            <i class="fa-solid fa-circle-check fa-3x" style="color:var(--success-color); margin-bottom:15px;"></i>
            <p style="font-size:1.1rem;">Nessun item da esercitare!</p>
            <p style="font-size:0.85rem;">Nell'ultima sessione RAN tutti gli item erano corretti.</p>
        </div>`;
        return;
    }

    const current = ri.deck[ri.deckIndex];
    const target = ri.target;
    const presented = ri.deckIndex + 1;
    const pct = target > 0 ? Math.round((presented / target) * 100) : 0;
    const uniqueErrorItems = ri.errorCount || ri.deck.length;

    stage.innerHTML = `
    <div class="ran-container">
        <div class="ran-toolbar" style="gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-dumbbell" style="color:var(--accent-color);"></i>
                <span style="font-weight:700; font-size:0.9rem;">RAN Intensivo</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="background:rgba(0,0,0,0.3); border-radius:8px; padding:4px 12px; font-size:0.8rem; display:flex; align-items:center; gap:6px;">
                    <span style="font-weight:bold;">${presented}</span>
                    <span style="color:var(--text-secondary);">/</span>
                    <span style="font-weight:bold;">${target}</span>
                </div>
                <div style="width:80px; height:8px; border-radius:4px; background:rgba(255,255,255,0.1); overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--accent-color); border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${uniqueErrorItems} item, ${ri.totalCorrect} <i class="fa-solid fa-check" style="color:var(--success-color);"></i></span>
            </div>
        </div>
        <div id="ran-content" style="flex:1; min-height:0;">
            <div class="ran-single-stage">
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; width:100%; overflow:hidden;">
                    <img src="${current.url || getPlaceholderUrl(current.label)}"
                         class="ran-main-img"
                         style="transition:0.3s;"
                         onerror="handleImgError(this,'${current.label}')">
                    <h2 style="text-align:center;">${current.label}</h2>
                </div>
                <div class="ran-controls-bar">
                    <button class="ran-btn-nav" onclick="prevRanIntensivo()"><i class="fa-solid fa-arrow-left"></i></button>
                    <div class="ran-counter">${presented}/${target}</div>
                    <button class="ran-btn-nav" onclick="nextRanIntensivo()"><i class="fa-solid fa-arrow-right"></i></button>
                </div>
            </div>
        </div>
    </div>`;
    window._startTDCountdown();
}

// Navigation for RAN Intensivo (manual prev/next without scoring)
window.nextRanIntensivo = () => {
    const ri = state._ranIntensivo;
    if (!ri || ri.completed || ri.deckIndex >= ri.deck.length - 1) return;
    ri.deckIndex++;
    const mode = document.getElementById('mode-select').value;
    renderGameMode(mode, ri.allItems);
};
window.prevRanIntensivo = () => {
    const ri = state._ranIntensivo;
    if (!ri || ri.deckIndex <= 0) return;
    ri.deckIndex--;
    const mode = document.getElementById('mode-select').value;
    renderGameMode(mode, ri.allItems);
};

// --- FLUENZA (Timed fluency - count items within time limit) ---
function renderFluenza(items, stage) {
    state.fluenzaDisplayItems = items;
    state.fluenzaIndex = -1;
    state.fluenzaCount = 0;
    state.fluenzaErrors = 0;
    state.fluenzaStarted = false;
    state.fluenzaFinished = false;
    state.fluenzaTimeLeft = state.fluenzaTimerDuration;
    state.fluenzaItemResults = {};
    if (state.fluenzaTimerInterval) { clearInterval(state.fluenzaTimerInterval); state.fluenzaTimerInterval = null; }

    // Calculate obiettivo from patient history
    state.fluenzaObiettivo = getFluenzaObiettivo();

    renderFluenzaUI(stage);
}

function getFluenzaObiettivo() {
    if (!state.activePatientId) return null;
    const p = state.patients.find(x => x.id === state.activePatientId);
    if (!p || !p.history) return null;
    const fluenzaSessions = p.history.filter(h => h.mode === 'fluenza' && h.setId === state.activeSetId);
    if (fluenzaSessions.length === 0) return null;
    const maxCorrect = Math.max(...fluenzaSessions.map(s => s.correct || 0));
    return maxCorrect + 2;
}

function renderFluenzaUI(stage) {
    const items = state.fluenzaDisplayItems;
    const started = state.fluenzaStarted;
    const finished = state.fluenzaFinished;
    const idx = state.fluenzaIndex;
    const count = state.fluenzaCount;
    const errors = state.fluenzaErrors;
    const timeLeft = state.fluenzaTimeLeft;
    const duration = state.fluenzaTimerDuration;
    const obiettivo = state.fluenzaObiettivo;
    const correct = count - errors;

    // Format time
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    const pct = duration > 0 ? (timeLeft / duration * 100) : 100;
    const timerColor = timeLeft <= 10 ? 'var(--danger-color)' : timeLeft <= 30 ? 'var(--warning-color)' : 'var(--accent-color)';

    // Pre-game: timer selection
    if (!started && !finished) {
        const presets = [15, 30, 60, 90, 120];
        const isCustom = !presets.includes(state.fluenzaTimerDuration);
        stage.innerHTML = `
        <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; padding:20px;">
            <i class="fa-solid fa-bolt fa-3x" style="color:var(--accent-color); opacity:0.6;"></i>
            <h2 style="margin:0; text-align:center;">Fluenza</h2>
            <p style="color:var(--text-secondary); text-align:center; margin:0;">Seleziona il tempo e premi <b>Avanti</b> per iniziare.<br>Nomina le immagini il pi&ugrave; velocemente possibile!</p>
            ${obiettivo !== null ? `<div style="background:rgba(99,102,241,0.15); padding:10px 20px; border-radius:12px; text-align:center;">
                <span style="font-size:0.8rem; color:var(--text-secondary);">Obiettivo prossima volta</span><br>
                <span style="font-size:1.5rem; font-weight:bold; color:var(--accent-color);"><i class="fa-solid fa-bullseye"></i> ${obiettivo}</span>
            </div>` : ''}
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center;">
                ${presets.map(t => `
                    <button class="btn btn-sm ${state.fluenzaTimerDuration === t ? 'btn-success' : 'btn-ghost'}"
                            onclick="state.fluenzaTimerDuration=${t}; state.fluenzaTimeLeft=${t}; renderFluenzaUI(document.getElementById('game-stage'));"
                            style="padding:10px 16px; font-size:1rem; min-width:60px;">
                        ${t}s
                    </button>
                `).join('')}
                <div style="display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:10px; border:1px solid ${isCustom ? 'var(--success-color)' : 'var(--glass-border)'}; background:${isCustom ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.2)'};">
                    <input type="number" id="fluenza-custom-time" value="${state.fluenzaTimerDuration}" min="5" max="600" step="5"
                        style="width:50px; padding:6px; border:none; background:transparent; color:white; font-size:1rem; text-align:center; outline:none;"
                        onchange="const v=Math.max(5,Math.min(600,parseInt(this.value)||60)); state.fluenzaTimerDuration=v; state.fluenzaTimeLeft=v; this.value=v; renderFluenzaUI(document.getElementById('game-stage'));">
                    <span style="font-size:0.8rem; color:var(--text-secondary);">sec</span>
                </div>
            </div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none; font-size:0.85rem; color:var(--text-secondary);"
                   onclick="state.fluenzaShowBar=!state.fluenzaShowBar; renderFluenzaUI(document.getElementById('game-stage'));">
                <span style="width:36px; height:20px; border-radius:10px; background:${state.fluenzaShowBar ? 'var(--accent-color)' : 'rgba(255,255,255,0.15)'}; position:relative; display:inline-block; transition:0.2s;">
                    <span style="width:16px; height:16px; border-radius:50%; background:white; position:absolute; top:2px; ${state.fluenzaShowBar ? 'left:18px' : 'left:2px'}; transition:0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
                </span>
                <i class="fa-solid fa-bars-progress"></i> Mostra barra tempo
            </label>
            <button class="ran-btn-nav" onclick="fluenzaNext()" style="width:80px; height:80px; font-size:2rem; margin-top:10px;">
                <i class="fa-solid fa-play"></i>
            </button>
            <span style="font-size:0.75rem; color:var(--text-secondary);">${items.length} stimoli disponibili</span>
        </div>`;
        return;
    }

    // Finished: results screen
    if (finished) {
        const pctCorrect = count > 0 ? Math.round((correct / count) * 100) : 0;
        stage.innerHTML = `
        <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:15px; padding:20px;">
            <i class="fa-solid fa-flag-checkered fa-3x" style="color:var(--success-color); opacity:0.7;"></i>
            <h2 style="margin:0;">Tempo scaduto!</h2>
            <div style="display:flex; gap:20px; flex-wrap:wrap; justify-content:center;">
                <div style="background:rgba(16,185,129,0.15); padding:15px 25px; border-radius:14px; text-align:center;">
                    <div style="font-size:2rem; font-weight:bold; color:var(--success-color);">${correct}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Corrette</div>
                </div>
                ${errors > 0 ? `<div style="background:rgba(239,68,68,0.15); padding:15px 25px; border-radius:14px; text-align:center;">
                    <div style="font-size:2rem; font-weight:bold; color:var(--danger-color);">${errors}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Errori</div>
                </div>` : ''}
                <div style="background:rgba(255,255,255,0.05); padding:15px 25px; border-radius:14px; text-align:center;">
                    <div style="font-size:2rem; font-weight:bold;">${count}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Totale</div>
                </div>
            </div>
            ${obiettivo !== null ? `<div style="background:rgba(99,102,241,0.15); padding:12px 24px; border-radius:12px; text-align:center; margin-top:5px;">
                <span style="font-size:0.8rem; color:var(--text-secondary);">Obiettivo prossima volta</span><br>
                <span style="font-size:1.3rem; font-weight:bold; color:var(--accent-color);"><i class="fa-solid fa-bullseye"></i> ${correct >= (obiettivo || 0) ? correct + 2 : obiettivo}</span>
                ${correct >= (obiettivo || 0) ? `<br><span style="font-size:0.75rem; color:var(--success-color);"><i class="fa-solid fa-star"></i> Obiettivo raggiunto!</span>` : ''}
            </div>` : `<div style="background:rgba(99,102,241,0.15); padding:12px 24px; border-radius:12px; text-align:center; margin-top:5px;">
                <span style="font-size:0.8rem; color:var(--text-secondary);">Obiettivo prossima volta</span><br>
                <span style="font-size:1.3rem; font-weight:bold; color:var(--accent-color);"><i class="fa-solid fa-bullseye"></i> ${correct + 2}</span>
            </div>`}
            <button class="btn btn-ghost" onclick="renderFluenza(state.fluenzaDisplayItems, document.getElementById('game-stage'))" style="margin-top:10px;">
                <i class="fa-solid fa-rotate-left"></i> Riprova
            </button>
        </div>`;
        return;
    }

    // During game: show current image + timer + controls
    const currentItem = idx >= 0 && idx < items.length ? items[idx] : null;
    const currentResult = state.fluenzaItemResults[idx];
    const showBar = state.fluenzaShowBar;

    stage.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; width:100%;">
        <!-- Timer bar -->
        <div style="padding:8px 15px; background:rgba(0,0,0,0.3); display:flex; align-items:center; gap:12px; flex-shrink:0;">
            <span style="font-size:1.4rem; font-weight:bold; color:${timerColor}; font-variant-numeric:tabular-nums; min-width:55px;">${timeStr}</span>
            ${showBar ? `<div style="flex:1; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:${timerColor}; border-radius:4px; transition:width 1s linear;"></div>
            </div>` : '<div style="flex:1;"></div>'}
            <span style="font-size:1rem; font-weight:bold; color:white;">${correct} <span style="font-size:0.7rem; color:var(--text-secondary);">/ ${count}</span></span>
            ${errors > 0 ? `<span style="font-size:0.85rem; color:var(--danger-color); font-weight:bold;">${errors}<i class="fa-solid fa-xmark" style="font-size:0.7rem; margin-left:2px;"></i></span>` : ''}
        </div>

        <!-- Image area -->
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; overflow:hidden;">
            ${currentItem ? `
                <img src="${currentItem.url || getPlaceholderUrl(currentItem.label)}"
                     class="ran-main-img ${currentResult === false ? 'feedback-fail' : currentResult === true ? 'feedback-success' : ''}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this,'${currentItem.label}')">
                <h2 style="text-align:center; margin-top:10px;">${currentItem.label}</h2>
            ` : `
                <p style="color:var(--text-secondary); font-size:1.1rem;">Premi <b>Avanti</b> per iniziare</p>
            `}
        </div>

        <!-- Controls bar -->
        <div class="ran-controls-bar" style="gap:15px;">
            <button class="btn-score fail" onclick="fluenzaMarkError()" style="width:56px; height:56px; border-radius:50%; font-size:1.3rem;" ${!currentItem || currentResult !== undefined ? 'disabled' : ''}>
                <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="ran-btn-nav" onclick="fluenzaNext()" style="width:70px; height:70px; font-size:1.8rem;">
                <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    </div>`;
}

window.fluenzaNext = () => {
    if (state.fluenzaFinished) return;
    const items = state.fluenzaDisplayItems;

    // First press: start timer and show first item
    if (!state.fluenzaStarted) {
        state.fluenzaStarted = true;
        state.fluenzaTimeLeft = state.fluenzaTimerDuration;
        state.fluenzaIndex = 0;
        state.fluenzaCount = 1;

        state.fluenzaTimerInterval = setInterval(() => {
            state.fluenzaTimeLeft--;
            if (state.fluenzaTimeLeft <= 0) {
                fluenzaStop();
                return;
            }
            renderFluenzaUI(document.getElementById('game-stage'));
        }, 1000);

        renderFluenzaUI(document.getElementById('game-stage'));
        return;
    }

    // Mark current as correct if not already marked
    if (state.fluenzaItemResults[state.fluenzaIndex] === undefined) {
        state.fluenzaItemResults[state.fluenzaIndex] = true;
    }

    // Advance to next item
    state.fluenzaIndex++;
    state.fluenzaCount++;

    // If we've exhausted all items, wrap around
    if (state.fluenzaIndex >= items.length) {
        state.fluenzaIndex = 0;
    }

    renderFluenzaUI(document.getElementById('game-stage'));
};

window.fluenzaMarkError = () => {
    if (state.fluenzaFinished || !state.fluenzaStarted) return;
    if (state.fluenzaIndex < 0) return;
    if (state.fluenzaItemResults[state.fluenzaIndex] !== undefined) return;

    state.fluenzaItemResults[state.fluenzaIndex] = false;
    state.fluenzaErrors++;

    // Update session
    if (state.session.active) {
        state.session.incorrect = state.fluenzaErrors;
        state.session.correct = state.fluenzaCount - state.fluenzaErrors;
        state.session.total = state.fluenzaCount;
        updateScoreUI();
    }

    renderFluenzaUI(document.getElementById('game-stage'));
};

function fluenzaStop() {
    if (state.fluenzaTimerInterval) {
        clearInterval(state.fluenzaTimerInterval);
        state.fluenzaTimerInterval = null;
    }
    state.fluenzaFinished = true;
    state.fluenzaTimeLeft = 0;

    // Finalize: the last shown item counts only if user interacted (next or marked)
    // If current item has no result, it was shown but not advanced - don't count it
    if (state.fluenzaIndex >= 0 && state.fluenzaItemResults[state.fluenzaIndex] === undefined) {
        state.fluenzaCount--;
    }

    const correct = state.fluenzaCount - state.fluenzaErrors;

    // Update session for saving
    if (state.session.active) {
        state.session.correct = correct;
        state.session.incorrect = state.fluenzaErrors;
        state.session.total = state.fluenzaCount;
        state.session.itemResults = {};
        // Store item results for per-item detail
        for (const [k, v] of Object.entries(state.fluenzaItemResults)) {
            state.session.itemResults[k] = v;
        }
        updateScoreUI();
        document.getElementById('btn-save-session').classList.remove('hidden');
        if (typeof showSessionNameInput === 'function') showSessionNameInput();
    }

    // Recalculate obiettivo based on current result
    const prevObiettivo = state.fluenzaObiettivo;
    if (prevObiettivo === null || correct >= prevObiettivo) {
        state.fluenzaObiettivo = correct + 2;
    }

    renderFluenzaUI(document.getElementById('game-stage'));
}

// --- TOMBOLA ---
function renderTombola(items, stage) {
    state._autoScoreErrored = false;
    state.deck = [...items].sort(() => Math.random() - 0.5);
    const cols = Math.ceil(Math.sqrt(items.length));
    const rows = Math.ceil(items.length / cols);

    stage.innerHTML = `
        <div style="display:flex; height:100%; flex-direction:column;">
            <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0;">
                <div style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Trova:</div>
                <div id="deck-target" style="background:white; padding:5px; border-radius:8px; display:flex; align-items:center; gap:10px;">
                    ${getDeckHtml()}
                </div>
            </div>
            <div style="flex:1; min-height:0; padding:10px; display:grid;
                        grid-template-columns:repeat(${cols}, 1fr);
                        grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                        gap:10px; overflow-y:auto;">
                ${items.map((item, idx) => `
                    <div class="card-grid" id="slot-${idx}"
                         onclick="handleMatchClick(${idx}, '${item.label}')"
                         style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                        <img src="${item.url || getPlaceholderUrl(item.label)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                             onerror="handleImgError(this, '${item.label}')">
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function getDeckHtml() {
    if (state.deck.length === 0) return `<span>FINITO!</span>`;
    const c = state.deck[0];
    return `<img src="${c.url || getPlaceholderUrl(c.label)}" style="width:40px; height:40px; object-fit:contain;"> <span style="color:#333; font-weight:bold; padding-right:10px;">${c.label}</span>`;
}

window.handleMatchClick = (idx, label) => {
    if (state.deck.length === 0) return;
    const cardEl = document.getElementById(`slot-${idx}`);
    if (cardEl.classList.contains('matched')) return;

    const isCorrect = label === state.deck[0].label;
    const isTimedelay = getSelectedSessionType() === 'timedelay';

    if (isCorrect) {
        cardEl.classList.add('matched');
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(16,185,129,0.4)';
        state.deck.shift();
        document.getElementById('deck-target').innerHTML = getDeckHtml();
    } else if (isTimedelay) {
        // Time Delay: highlight as prompt, keep visible
        cardEl.style.border = '4px solid var(--warning-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(245,158,11,0.3)';
        cardEl.style.opacity = '0.5';
    } else {
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(239,68,68,0.4)';
        setTimeout(() => {
            cardEl.style.border = '';
            cardEl.style.boxShadow = '';
        }, 600);
    }

    // Auto-score in session (skip V after correction)
    if (state.session.active) {
        const shouldScore = isCorrect ? !state._autoScoreErrored : true;
        if (isCorrect) state._autoScoreErrored = false;
        else state._autoScoreErrored = true;

        if (shouldScore) {
            const key = `tombola_${Date.now()}`;
            state.session.itemResults[key] = isCorrect ? true : (isTimedelay ? 'prompt' : false);
            const results = Object.values(state.session.itemResults);
            state.session.correct = results.filter(v => v === true).length;
            state.session.incorrect = results.filter(v => v === false).length;
            state.session.prompts = results.filter(v => v === 'prompt').length;
            state.session.total = results.length;
            updateScoreUI();
        }
        document.getElementById('btn-save-session').classList.remove('hidden');
        if (typeof showSessionNameInput === 'function') showSessionNameInput();
    }
};

// --- MEMORY ---
function renderMemory(items, stage) {
    let useItems = items.length > 10 ? items.slice(0, 10) : items;
    let deck = [...useItems, ...useItems].sort(() => Math.random() - 0.5);
    state.memory = { flipped: [], matched: [], deck: deck, lockBoard: false };
    const cols = Math.ceil(Math.sqrt(deck.length));
    const rows = Math.ceil(deck.length / cols);

    stage.innerHTML = `
        <div style="height:100%; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto; min-height:0;">
            ${deck.map((item, idx) => `
                <div class="card-grid" id="mem-${idx}" onclick="flipCard(${idx})"
                     style="background:var(--accent-color); aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                    <div class="mem-content" style="display:none; width:100%; height:100%;">
                        <img src="${item.url || getPlaceholderUrl(item.label)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; background:white; border-radius:6px;"
                             onerror="handleImgError(this, '${item.label}')">
                    </div>
                    <i class="fa-solid fa-question icon-back" style="color:white; font-size:2rem;"></i>
                </div>
            `).join('')}
        </div>`;
}

window.flipCard = (idx) => {
    if (state.memory.lockBoard || state.memory.flipped.includes(idx) || state.memory.matched.includes(idx)) return;
    const card = document.getElementById(`mem-${idx}`);
    card.querySelector('.mem-content').style.display = 'block';
    card.querySelector('.icon-back').style.display = 'none';
    card.style.background = 'white';
    state.memory.flipped.push(idx);

    if (state.memory.flipped.length === 2) {
        state.memory.lockBoard = true;
        const [i1, i2] = state.memory.flipped;
        if (state.memory.deck[i1].label === state.memory.deck[i2].label) {
            state.memory.matched.push(i1, i2);
            state.memory.flipped = [];
            state.memory.lockBoard = false;
            document.getElementById(`mem-${i1}`).classList.add('matched');
            document.getElementById(`mem-${i2}`).classList.add('matched');
        } else {
            setTimeout(() => {
                [i1, i2].forEach(i => {
                    const c = document.getElementById(`mem-${i}`);
                    c.querySelector('.mem-content').style.display = 'none';
                    c.querySelector('.icon-back').style.display = 'block';
                    c.style.background = 'var(--accent-color)';
                });
                state.memory.flipped = [];
                state.memory.lockBoard = false;
            }, 1000);
        }
    }
};

// --- POOL RANDOM (Grid, infinite batching) ---
function renderPoolRandom(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-shuffle fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Assicurati che i set abbiano immagini e tag assegnati.</p>
            </div>`;
        return;
    }

    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 0;
    state.poolAllItems = [...items];
    state.poolBatchSize = numStimuli > 0 ? Math.min(numStimuli, items.length) : items.length;

    showPoolBatch(stage);
}

function showPoolBatch(stage) {
    state.poolAllItems = balancedShuffle(state.poolAllItems, item => (item.sourceTags && item.sourceTags[0]) || item.sourceTag || '_');
    const batch = state.poolAllItems.slice(0, state.poolBatchSize);
    const cols = Math.ceil(Math.sqrt(batch.length));
    const rows = Math.ceil(batch.length / cols);

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-shuffle"></i> Pool Random
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">${batch.length} stimoli</span>
            <button class="btn btn-sm btn-primary" onclick="nextPoolBatch()" style="padding:4px 12px; font-size:0.75rem;">
                <i class="fa-solid fa-forward"></i> Avanti
            </button>
        </div>
        <div style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${batch.map((item) => `
                <div class="card-grid" style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                    <img src="${item.url || getPlaceholderUrl(item.label)}"
                         style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                         onerror="handleImgError(this, '${item.label}')">
                </div>
            `).join('')}
        </div>
    </div>`;
}

window.nextPoolBatch = () => {
    showPoolBatch(document.getElementById('game-stage'));
};

// --- INTRUSO (infinite rounds, variable card count) ---
function renderIntruso(items, stage) {
    state._autoScoreErrored = false;
    const tags = state.selectedPoolTags;
    if (tags.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-circle-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>La modalit&agrave; Intruso richiede almeno <b>2 tag diversi</b><br>per generare i distrattori.<br>Seleziona pi&ugrave; tag nel selettore.</p>
            </div>`;
        return;
    }

    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 0;
    state.intrusoCardsPerRound = numStimuli > 0 ? Math.max(numStimuli, 3) : 4;
    state.intrusoRound = 0;

    const round = generateIntrusoRound(tags, state.intrusoCardsPerRound);
    if (!round) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-circle-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>Non ci sono abbastanza item con immagini<br>per generare le domande Intruso con ${state.intrusoCardsPerRound} carte.<br>Prova con meno stimoli o aggiungi item.</p>
            </div>`;
        return;
    }

    showIntrusoRound(stage, round);
}

function generateIntrusoRound(tags, cardsPerRound) {
    const targetCount = cardsPerRound - 1;
    const tagItems = {};
    tags.forEach(tag => { tagItems[tag] = getItemsByTag(tag); });

    const validTags = tags.filter(t => tagItems[t].length >= targetCount);
    const distractorTags = tags.filter(t => tagItems[t].length >= 1);
    if (validTags.length === 0 || distractorTags.length < 2) return null;

    const targetTag = validTags[Math.floor(Math.random() * validTags.length)];
    const otherTags = distractorTags.filter(t => t !== targetTag);
    if (otherTags.length === 0) return null;
    const intruderTag = otherTags[Math.floor(Math.random() * otherTags.length)];

    const shuffledTargets = [...tagItems[targetTag]].sort(() => Math.random() - 0.5);
    const targets = shuffledTargets.slice(0, targetCount);
    if (targets.length < targetCount) return null;

    const targetLabels = new Set(targets.map(t => t.label));
    const validIntruders = tagItems[intruderTag].filter(item => !targetLabels.has(item.label));
    if (validIntruders.length === 0) return null;
    const intruder = validIntruders[Math.floor(Math.random() * validIntruders.length)];

    const cards = [...targets.map(t => ({ ...t, isIntruder: false, tag: targetTag })),
    { ...intruder, isIntruder: true, tag: intruderTag }];
    cards.sort(() => Math.random() - 0.5);

    return { targetTag, intruderTag, cards };
}

function showIntrusoRound(stage, round) {
    if (!round) return;
    state.currentIntrusoRound = round;
    const current = state.intrusoRound + 1;
    const totalCards = round.cards.length;
    const cols = totalCards <= 2 ? totalCards : Math.ceil(Math.sqrt(totalCards));
    const rows = Math.ceil(totalCards / cols);

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Trova l'intruso!</span>
            <span style="background:rgba(139,92,246,0.2); color:#a78bfa; padding:2px 10px; border-radius:10px; font-size:0.75rem;">
                Categoria: ${round.targetTag}
            </span>
            <span style="color:var(--text-secondary); font-size:0.8rem;">Round ${current}</span>
        </div>
        <div style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${round.cards.map((card, idx) => `
                <div class="card-grid" id="intruso-${idx}"
                     onclick="handleIntrusoClick(${idx})"
                     style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden; cursor:pointer; transition:0.3s;">
                    <img src="${card.url || getPlaceholderUrl(card.label)}"
                         style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                         onerror="handleImgError(this, '${card.label}')">
                </div>
            `).join('')}
        </div>
    </div>`;
}

window.handleIntrusoClick = (idx) => {
    if (!state.session.active) return;
    const round = state.currentIntrusoRound;
    if (!round) return;

    const card = round.cards[idx];
    const cardEl = document.getElementById(`intruso-${idx}`);
    const isTimedelay = getSelectedSessionType() === 'timedelay';

    // In TD mode, ignore already-tried wrong cards
    if (isTimedelay && cardEl.dataset.tried === '1') return;

    if (card.isIntruder) {
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(16,185,129,0.5)';
        // Score V only if no prior wrong in this round
        if (!state._autoScoreErrored) {
            const key = isTimedelay ? `intruso_${state.intrusoRound}_ok` : state.intrusoRound;
            state.session.itemResults[key] = true;
        }
        state._autoScoreErrored = false;
    } else if (isTimedelay) {
        // Time Delay: mark as prompt, dim card, don't advance
        cardEl.style.border = '4px solid var(--warning-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(245,158,11,0.3)';
        cardEl.style.opacity = '0.5';
        cardEl.dataset.tried = '1';
        // Only record one prompt per round in TD mode
        if (!state._autoScoreErrored) {
            const key = `intruso_${state.intrusoRound}_p`;
            state.session.itemResults[key] = 'prompt';
        }
        state._autoScoreErrored = true;
    } else {
        // Independent: mark as error, show correct intruder, advance
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(239,68,68,0.5)';
        state.session.itemResults[state.intrusoRound] = false;
        state._autoScoreErrored = true;
        round.cards.forEach((c, i) => {
            if (c.isIntruder) {
                const el = document.getElementById(`intruso-${i}`);
                el.style.border = '4px solid var(--warning-color)';
                el.style.boxShadow = '0 0 20px rgba(245,158,11,0.5)';
            }
        });
    }

    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.prompts = results.filter(v => v === 'prompt').length;
    state.session.total = results.length;
    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');

    // Don't auto-advance for wrong in TD mode
    if (isTimedelay && !card.isIntruder) return;

    // Generate next round after delay (infinite)
    setTimeout(() => {
        state._autoScoreErrored = false;
        state.intrusoRound++;
        const nextRound = generateIntrusoRound(state.selectedPoolTags, state.intrusoCardsPerRound);
        if (nextRound) {
            showIntrusoRound(document.getElementById('game-stage'), nextRound);
        }
    }, 1200);
};

// --- TOPOLOGIA (Drag & Drop) ---
function renderTopologia(items, stage) {
    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-up-down-left-right"></i> Topologia
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Trascina le immagini per disporle</span>
            <button class="btn btn-sm btn-ghost" onclick="shuffleTopologia()" style="padding:4px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-shuffle"></i> Mescola
            </button>
        </div>
        <div id="topo-canvas" style="flex:1; position:relative; overflow:hidden; min-height:0; touch-action:none;"></div>
    </div>`;

    requestAnimationFrame(() => {
        const canvas = document.getElementById('topo-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cols = Math.ceil(Math.sqrt(items.length));
        const rows = Math.ceil(items.length / cols);
        const itemW = Math.min(rect.width / cols, rect.height / rows) * 0.8;
        const itemH = itemW;

        items.forEach((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const cellW = rect.width / cols;
            const cellH = rect.height / rows;
            const left = col * cellW + (cellW - itemW) / 2;
            const top = row * cellH + (cellH - itemH) / 2;

            const el = document.createElement('div');
            el.className = 'topo-item';
            el.dataset.idx = idx;
            el.style.cssText = `position:absolute; left:${left}px; top:${top}px; width:${itemW}px; height:${itemH}px;
                background:white; border-radius:12px; padding:4px; cursor:grab; touch-action:none;
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                box-shadow:0 4px 15px rgba(0,0,0,0.3); z-index:1; user-select:none; transition:box-shadow 0.2s;`;

            const img = document.createElement('img');
            img.src = item.url || getPlaceholderUrl(item.label);
            img.draggable = false;
            img.style.cssText = 'max-width:100%; max-height:75%; object-fit:contain; pointer-events:none;';
            img.onerror = function () { handleImgError(this, item.label); };

            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:0.65rem; color:#333; font-weight:bold; margin-top:2px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; pointer-events:none;';
            lbl.textContent = item.label;

            el.appendChild(img);
            el.appendChild(lbl);
            canvas.appendChild(el);
        });

        setupTopoDrag('topo-canvas');
    });
}

function setupTopoDrag(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    let activeEl = null;
    let offsetX = 0, offsetY = 0;

    const getPos = (e) => {
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX, y: t.clientY };
    };

    const onStart = (e) => {
        const el = e.target.closest('.topo-item');
        if (!el) return;
        e.preventDefault();
        activeEl = el;
        activeEl.style.zIndex = '100';
        activeEl.style.boxShadow = '0 8px 30px rgba(0,0,0,0.5)';
        activeEl.style.cursor = 'grabbing';
        const pos = getPos(e);
        const r = el.getBoundingClientRect();
        offsetX = pos.x - r.left;
        offsetY = pos.y - r.top;
    };

    const onMove = (e) => {
        if (!activeEl) return;
        e.preventDefault();
        const pos = getPos(e);
        const cr = canvas.getBoundingClientRect();
        let newLeft = pos.x - cr.left - offsetX;
        let newTop = pos.y - cr.top - offsetY;
        newLeft = Math.max(0, Math.min(cr.width - activeEl.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(cr.height - activeEl.offsetHeight, newTop));
        activeEl.style.left = newLeft + 'px';
        activeEl.style.top = newTop + 'px';
    };

    const onEnd = () => {
        if (activeEl) {
            activeEl.style.zIndex = '1';
            activeEl.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
            activeEl.style.cursor = 'grab';
            activeEl = null;
        }
    };

    canvas.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    // Store cleanup function to remove document-level listeners
    window._topoCleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
    };
}

window.shuffleTopologia = () => {
    const canvas = document.getElementById('topo-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const items = canvas.querySelectorAll('.topo-item');
    items.forEach(el => {
        const maxLeft = rect.width - el.offsetWidth;
        const maxTop = rect.height - el.offsetHeight;
        el.style.transition = 'left 0.3s, top 0.3s, box-shadow 0.2s';
        el.style.left = Math.random() * maxLeft + 'px';
        el.style.top = Math.random() * maxTop + 'px';
        setTimeout(() => { el.style.transition = 'box-shadow 0.2s'; }, 350);
    });
};

// --- SEQUENZE (All cards visible, drag/tap to order) ---
function renderSequenze(items, stage) {
    let numbered = items.filter(i => i.seqNumber && !i.hidden).sort((a, b) => a.seqNumber - b.seqNumber);

    if (numbered.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-arrow-down-1-9 fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessuna carta con numero di sequenza assegnato.<br>Nell'editor, usa il campo <b>#</b> per assegnare un numero progressivo alle carte.</p>
            </div>`;
        return;
    }

    const numStimuli = parseInt(document.getElementById('num-stimuli').value);
    if (numStimuli > 0 && numStimuli < numbered.length) {
        const shuffled = [...numbered].sort(() => Math.random() - 0.5);
        numbered = shuffled.slice(0, numStimuli).sort((a, b) => a.seqNumber - b.seqNumber);
    }

    state.sequenzeCorrectOrder = numbered.map(item => ({ ...item }));
    state.sequenzeSourceCards = [...numbered].sort(() => Math.random() - 0.5);
    state.sequenzePlacements = new Array(numbered.length).fill(null);
    state.sequenzeSelectedSource = null;
    state.sequenzeVerified = false;

    renderSequenzeUI(stage);
}

let _seqDragJustEnded = false;

function renderSequenzeUI(stage) {
    const total = state.sequenzeCorrectOrder.length;
    const placed = state.sequenzePlacements.filter(p => p !== null).length;
    const allPlaced = placed === total;
    const verified = state.sequenzeVerified;
    const sourceCards = state.sequenzeSourceCards;
    const selectedSeq = state.sequenzeSelectedSource;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-arrow-down-1-9"></i> Sequenze
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">${placed}/${total} posizionate</span>
            <button class="btn btn-sm btn-ghost" onclick="resetSequenze()" style="padding:4px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
            ${allPlaced && !verified ? `
            <button class="btn btn-sm btn-success" onclick="checkSequenze()" style="padding:6px 16px; font-size:0.85rem; font-weight:bold;">
                <i class="fa-solid fa-check-double"></i> Conferma
            </button>` : ''}
            ${verified ? `
            <button class="btn btn-sm" onclick="startRacconto()" style="padding:6px 16px; font-size:0.85rem; font-weight:bold; background:var(--accent-color); color:white;">
                <i class="fa-solid fa-book-open"></i> Racconto
            </button>` : ''}
        </div>

        ${sourceCards.length > 0 ? `
        <div id="seq-source-area" style="padding:12px; background:rgba(99,102,241,0.03); border-bottom:1px solid #ffffff10; overflow-x:auto; display:flex; gap:10px; align-items:center; justify-content:center; flex-wrap:nowrap; flex-shrink:0;">
            ${sourceCards.map((card, idx) => {
        const isSelected = selectedSeq === card.seqNumber;
        return `
                <div class="seq-source-card" data-seq="${card.seqNumber}" data-source-idx="${idx}"
                     onclick="selectSourceCard(${card.seqNumber})"
                     style="background:white; border-radius:14px; padding:8px; cursor:pointer; flex-shrink:0;
                            border:3px solid ${isSelected ? 'var(--accent-color)' : 'transparent'};
                            box-shadow:${isSelected ? '0 0 20px rgba(99,102,241,0.5)' : '0 2px 10px rgba(0,0,0,0.25)'};
                            display:flex; flex-direction:column; align-items:center; gap:6px;
                            transition:0.15s; user-select:none; ${isSelected ? 'transform:scale(1.05);' : ''}">
                    <img src="${card.url || getPlaceholderUrl(card.label)}" style="width:100px; height:100px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${card.label}')">
                    <span style="color:#333; font-weight:bold; font-size:0.8rem; text-align:center; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${card.label}</span>
                </div>`;
    }).join('')}
        </div>` : ''}

        ${!verified ? `
        <div style="padding:6px; text-align:center; font-size:0.75rem; color:#888; flex-shrink:0;">
            ${allPlaced ? '<i class="fa-solid fa-arrows-left-right"></i> Trascina per riordinare, poi premi <b>Conferma</b>' : selectedSeq !== null ? '<i class="fa-solid fa-hand-pointer"></i> Tocca uno slot per posizionare la carta selezionata' : '<i class="fa-solid fa-hand-pointer"></i> Tocca o trascina una carta verso uno slot'}
        </div>` : ''}

        <div id="seq-slots-container" style="flex:1; min-height:0; padding:15px; overflow-x:auto; overflow-y:hidden; display:flex; flex-direction:row; gap:12px; align-items:stretch; justify-content:center;">
            ${state.sequenzeCorrectOrder.map((_, slotIdx) => {
        const placedItem = state.sequenzePlacements[slotIdx];
        const isCorrect = verified && placedItem && placedItem.seqNumber === state.sequenzeCorrectOrder[slotIdx].seqNumber;
        const isWrong = verified && placedItem && placedItem.seqNumber !== state.sequenzeCorrectOrder[slotIdx].seqNumber;
        const _seqTD = getSelectedSessionType() === 'timedelay';
        const wrongColor = _seqTD ? 'var(--warning-color)' : 'var(--danger-color)';
        const wrongRgba = _seqTD ? '245,158,11' : '239,68,68';
        const slotBorder = verified ? (isCorrect ? '3px solid var(--success-color)' : isWrong ? `3px solid ${wrongColor}` : '2px dashed #555') : (placedItem ? '2px solid var(--accent-color)' : '2px dashed #555');
        const slotBg = verified ? (isCorrect ? 'rgba(16,185,129,0.1)' : isWrong ? `rgba(${wrongRgba},0.1)` : 'rgba(255,255,255,0.02)') : (placedItem ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)');
        const slotShadow = verified ? (isCorrect ? '0 0 12px rgba(16,185,129,0.3)' : isWrong ? `0 0 12px rgba(${wrongRgba},0.3)` : 'none') : 'none';

        return `
                <div id="seq-slot-${slotIdx}" class="seq-slot-card" data-slot="${slotIdx}"
                     onclick="${!verified ? `tapSlot(${slotIdx})` : ''}"
                     style="min-width:130px; flex:1; max-width:180px; border:${slotBorder}; border-radius:14px; background:${slotBg};
                            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:10px 8px;
                            cursor:${!verified ? 'pointer' : 'default'}; transition:0.2s; box-shadow:${slotShadow}; position:relative; flex-shrink:0; user-select:none;">
                    <span style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.9rem; color:var(--text-secondary);">${slotIdx + 1}</span>
                    ${placedItem ? `
                        <div style="background:white; border-radius:12px; padding:5px;">
                            <img src="${placedItem.url || getPlaceholderUrl(placedItem.label)}" style="width:100px; height:100px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${placedItem.label}')">
                        </div>
                        <span style="font-weight:bold; font-size:0.8rem; text-align:center; word-break:break-word; line-height:1.1;">${placedItem.label}</span>
                        ${verified && isWrong ? `<span style="font-size:0.65rem; color:${wrongColor}; text-align:center;"><i class="fa-solid fa-arrow-down"></i> ${state.sequenzeCorrectOrder[slotIdx].label}</span>` : ''}
                    ` : `
                        <div style="width:100px; height:100px; border:2px dashed #444; border-radius:12px; display:flex; align-items:center; justify-content:center;">
                            <i class="fa-solid fa-plus" style="color:#555; font-size:1.5rem; opacity:0.3;"></i>
                        </div>
                        <span style="color:#555; font-size:0.75rem; font-style:italic; text-align:center;">Tocca</span>
                    `}
                </div>`;
    }).join('')}
        </div>
    </div>`;

    if (!verified) {
        setupSequenzeDrag();
    }
}

window.selectSourceCard = (seqNum) => {
    if (_seqDragJustEnded || state.sequenzeVerified) return;
    state.sequenzeSelectedSource = (state.sequenzeSelectedSource === seqNum) ? null : seqNum;
    renderSequenzeUI(document.getElementById('game-stage'));
};

window.tapSlot = (slotIdx) => {
    if (_seqDragJustEnded || state.sequenzeVerified) return;
    const selectedSeq = state.sequenzeSelectedSource;
    const currentItem = state.sequenzePlacements[slotIdx];

    if (selectedSeq !== null) {
        const sourceIdx = state.sequenzeSourceCards.findIndex(c => c.seqNumber === selectedSeq);
        if (sourceIdx < 0) return;
        const card = state.sequenzeSourceCards[sourceIdx];
        if (currentItem) state.sequenzeSourceCards.push(currentItem);
        state.sequenzePlacements[slotIdx] = card;
        state.sequenzeSourceCards.splice(sourceIdx, 1);
        state.sequenzeSelectedSource = null;
    } else {
        if (currentItem) {
            state.sequenzePlacements[slotIdx] = null;
            state.sequenzeSourceCards.push(currentItem);
        }
    }
    renderSequenzeUI(document.getElementById('game-stage'));
};

window.resetSequenze = () => {
    if (state.sequenzeVerified) state.sequenzeVerified = false;
    state.sequenzePlacements = new Array(state.sequenzeCorrectOrder.length).fill(null);
    state.sequenzeSourceCards = [...state.sequenzeCorrectOrder].sort(() => Math.random() - 0.5);
    state.sequenzeSelectedSource = null;
    renderSequenzeUI(document.getElementById('game-stage'));
};

window.checkSequenze = () => {
    const allPlaced = state.sequenzePlacements.every(p => p !== null);
    if (!allPlaced) { alert('Posiziona tutte le carte prima di confermare.'); return; }

    const isTimedelay = getSelectedSessionType() === 'timedelay';
    state.sequenzeVerified = true;
    let correct = 0;
    state.sequenzePlacements.forEach((placed, slotIdx) => {
        if (placed && placed.seqNumber === state.sequenzeCorrectOrder[slotIdx].seqNumber) correct++;
    });

    if (state.session.active) {
        state.session.correct = correct;
        state.session.total = state.sequenzeCorrectOrder.length;
        state.session.incorrect = isTimedelay ? 0 : (state.session.total - correct);
        state.session.prompts = isTimedelay ? (state.session.total - correct) : 0;
        state.session.sequenzePhase = 'seriazione';
        state.session.playItems = [...state.sequenzeCorrectOrder];
        state.session.itemResults = {};
        state.sequenzePlacements.forEach((placed, slotIdx) => {
            const ok = placed && placed.seqNumber === state.sequenzeCorrectOrder[slotIdx].seqNumber;
            state.session.itemResults[slotIdx] = ok ? true : (isTimedelay ? 'prompt' : false);
        });
        updateScoreUI();
        document.getElementById('btn-save-session').classList.remove('hidden');
        if (typeof showSessionNameInput === 'function') showSessionNameInput();
    }
    renderSequenzeUI(document.getElementById('game-stage'));
};

// --- RACCONTO PHASE ---
window.startRacconto = async () => {
    // Auto-save seriazione session inline (avoid confirmSaveSession's setTimeout issues)
    if (state.session.active && state.session.total > 0 && state.activePatientId) {
        const p = state.patients.find(x => x.id === state.activePatientId);
        if (p) {
            const mode = document.getElementById('mode-select').value;
            const engine = getModeEngine(mode);
            const type = getSelectedSessionType();
            const results = Object.values(state.session.itemResults);
            const rawV = results.filter(v => v === true).length;
            const rawP = results.filter(v => v === 'prompt').length;
            const rawX = results.filter(v => v === false).length;
            const rawTotal = rawV + rawP + rawX;
            const activeSet = state.savedSets.find(ss => ss.id === state.activeSetId);
            const defaultSetName = activeSet?.name || "Set Rimosso";
            const setCat = activeSet?.category || '';
            const nameInput = document.getElementById('session-name-input');
            const customName = nameInput ? nameInput.value.trim() : '';
            const setName = customName || defaultSetName;
            const stimCount = state.sequenzeCorrectOrder ? state.sequenzeCorrectOrder.length : rawTotal;

            const sessionData = {
                date: new Date().toISOString(),
                setId: state.activeSetId,
                setName: setName + ` [Seriazione ${stimCount}]`,
                setCat: setCat,
                mode: mode,
                correct: rawV,
                prompts: rawP,
                total: rawTotal,
                percentage: Math.round((rawV / rawTotal) * 100),
                sessionType: type,
                rawV, rawP, rawX,
                sequenzePhase: 'seriazione'
            };
            if (type === 'timedelay') sessionData.timeDelaySeconds = getSelectedTDSeconds();

            const playItems = state.session.playItems || [];
            if (playItems.length > 0) {
                const itemDetails = [];
                for (const [key, result] of Object.entries(state.session.itemResults)) {
                    const idx = parseInt(key);
                    const item = !isNaN(idx) ? playItems[idx] : null;
                    const label = item ? (item.label || item.l || `Item ${idx + 1}`) : null;
                    if (label) itemDetails.push({ label, result });
                }
                if (itemDetails.length > 0) sessionData.itemDetails = itemDetails;
            }

            if (!p.history) p.history = [];
            p.history.push(sessionData);
            await DB.savePatient(p);
            if (nameInput) nameInput.value = '';
        }
    }

    // Reset session for racconto phase
    state.session = { correct: 0, incorrect: 0, total: 0, prompts: 0, active: true, itemResults: {}, scoreHistory: [], sequenzePhase: 'racconto' };
    state.session.playItems = [...state.sequenzeCorrectOrder];
    state.raccontoSelectedIdx = null;
    state.raccontoScored = {};

    updateScoreUI();
    document.getElementById('scoring-controls').classList.remove('hidden');
    document.getElementById('btn-save-session').classList.add('hidden');
    const undoBtn = document.getElementById('btn-undo-marker');
    if (undoBtn) undoBtn.classList.remove('hidden');
    const sessionNameWrapper = document.getElementById('session-name-wrapper');
    if (sessionNameWrapper) sessionNameWrapper.classList.add('hidden');

    renderRaccontoUI(document.getElementById('game-stage'));
};

function renderRaccontoUI(stage) {
    const items = state.sequenzeCorrectOrder;
    const selectedIdx = state.raccontoSelectedIdx;
    const scored = state.raccontoScored || {};
    const allScored = Object.keys(scored).length === items.length;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-book-open"></i> Racconto
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">${Object.keys(scored).length}/${items.length} valutate</span>
        </div>

        <div style="padding:8px; text-align:center; font-size:0.75rem; color:#888; flex-shrink:0;">
            ${selectedIdx !== null ? '<i class="fa-solid fa-check-circle"></i> Usa i pulsanti <b>V</b> / <b>X</b> / <b>P</b> per valutare il racconto di questa scena' : '<i class="fa-solid fa-hand-pointer"></i> Tocca un\'immagine per evidenziarla e valutarla'}
        </div>

        <div style="flex:1; min-height:0; padding:15px; overflow-x:auto; display:flex; flex-direction:row; gap:14px; align-items:center; justify-content:center;">
            ${items.map((item, idx) => {
        const isSelected = selectedIdx === idx;
        const result = scored[idx];
        const resultBorder = result === true ? '3px solid var(--success-color)' : result === false ? '3px solid var(--danger-color)' : result === 'prompt' ? '3px solid var(--warning-color)' : (isSelected ? '3px solid var(--accent-color)' : '2px solid rgba(255,255,255,0.1)');
        const resultBg = result === true ? 'rgba(16,185,129,0.1)' : result === false ? 'rgba(239,68,68,0.1)' : result === 'prompt' ? 'rgba(245,158,11,0.1)' : (isSelected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)');
        const resultIcon = result === true ? '<i class="fa-solid fa-check" style="color:var(--success-color);"></i>' : result === false ? '<i class="fa-solid fa-xmark" style="color:var(--danger-color);"></i>' : result === 'prompt' ? '<i class="fa-solid fa-hand" style="color:var(--warning-color);"></i>' : '';
        const shadow = isSelected ? '0 0 25px rgba(99,102,241,0.5)' : 'none';
        const scale = isSelected ? 'transform:scale(1.08);' : '';

        return `
                <div onclick="selectRaccontoCard(${idx})"
                     style="min-width:140px; max-width:200px; flex-shrink:0; border:${resultBorder}; border-radius:16px; background:${resultBg};
                            display:flex; flex-direction:column; align-items:center; gap:8px; padding:12px 10px; cursor:pointer;
                            transition:0.2s; box-shadow:${shadow}; ${scale} user-select:none; position:relative;">
                    <span style="width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.85rem; color:var(--text-secondary);">${idx + 1}</span>
                    <div style="background:white; border-radius:12px; padding:5px;">
                        <img src="${item.url || getPlaceholderUrl(item.label)}" style="width:120px; height:120px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${item.label}')">
                    </div>
                    <span style="font-weight:bold; font-size:0.85rem; text-align:center; word-break:break-word; line-height:1.1;">${item.label}</span>
                    ${resultIcon ? `<div style="position:absolute; top:6px; right:6px;">${resultIcon}</div>` : ''}
                </div>`;
    }).join('')}
        </div>

        ${allScored ? `
        <div style="padding:10px; text-align:center; flex-shrink:0;">
            <span style="font-size:0.85rem; color:var(--success-color);"><i class="fa-solid fa-check-double"></i> Tutte le scene valutate</span>
        </div>` : ''}
    </div>`;
}

window.selectRaccontoCard = (idx) => {
    state.raccontoSelectedIdx = (state.raccontoSelectedIdx === idx) ? null : idx;
    renderRaccontoUI(document.getElementById('game-stage'));
};

// Hook into recordResponse for racconto scoring
const _origRecordResponse = window.recordResponse;
window.recordResponse = (result) => {
    if (state.session.sequenzePhase === 'racconto' && state.raccontoSelectedIdx !== null) {
        const idx = state.raccontoSelectedIdx;
        const prevResult = state.raccontoScored[idx];

        // If already scored, remove old score from session counts
        if (prevResult !== undefined) {
            delete state.session.itemResults[idx];
        }

        state.raccontoScored[idx] = result;
        state.session.itemResults[idx] = result;

        // Recount
        const results = Object.values(state.session.itemResults);
        state.session.correct = results.filter(v => v === true).length;
        state.session.incorrect = results.filter(v => v === false).length;
        state.session.prompts = results.filter(v => v === 'prompt').length;
        state.session.total = results.length;

        if (!state.session.scoreHistory) state.session.scoreHistory = [];
        state.session.scoreHistory.push(idx);

        updateScoreUI();

        // Auto-advance to next unscored card
        const items = state.sequenzeCorrectOrder;
        let nextIdx = null;
        for (let i = 1; i <= items.length; i++) {
            const candidate = (idx + i) % items.length;
            if (state.raccontoScored[candidate] === undefined) { nextIdx = candidate; break; }
        }
        state.raccontoSelectedIdx = nextIdx;

        // Check if all scored
        if (Object.keys(state.raccontoScored).length === items.length) {
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
        }

        renderRaccontoUI(document.getElementById('game-stage'));
        return;
    }
    _origRecordResponse(result);
};

let _seqDragCleanup = null;

function setupSequenzeDrag() {
    if (_seqDragCleanup) { _seqDragCleanup(); _seqDragCleanup = null; }

    const slotsContainer = document.getElementById('seq-slots-container');
    const sourceArea = document.getElementById('seq-source-area');
    if (!slotsContainer) return;

    let dragType = null;
    let dragData = null;
    let dragEl = null;
    let startX = 0, startY = 0;
    let isDragging = false;
    let ghostEl = null;

    function createGhost(item, x, y) {
        const ghost = document.createElement('div');
        ghost.style.cssText = `position:fixed; z-index:9999; pointer-events:none; width:110px; left:${x-55}px; top:${y-65}px; opacity:0.92; transform:scale(1.1) rotate(3deg); border-radius:14px; overflow:hidden; box-shadow:0 12px 40px rgba(99,102,241,0.5); background:white; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px; gap:4px; transition:none;`;
        ghost.innerHTML = `<img src="${item.url || getPlaceholderUrl(item.label)}" style="width:90px; height:90px; object-fit:contain; border-radius:10px;" draggable="false"><span style="font-weight:bold; font-size:0.75rem; color:#333; text-align:center; line-height:1.1;">${item.label}</span>`;
        document.body.appendChild(ghost);
        return ghost;
    }

    function moveGhost(x, y) { if (ghostEl) { ghostEl.style.left = (x-55)+'px'; ghostEl.style.top = (y-65)+'px'; } }
    function removeGhost() { if (ghostEl) { ghostEl.remove(); ghostEl = null; } }

    function findSlotTarget(cx, cy) {
        if (ghostEl) ghostEl.style.display = 'none';
        const el = document.elementFromPoint(cx, cy);
        if (ghostEl) ghostEl.style.display = '';
        return el ? el.closest('.seq-slot-card[data-slot]') : null;
    }

    function highlightSlots(cx, cy) {
        const target = findSlotTarget(cx, cy);
        slotsContainer.querySelectorAll('.seq-slot-card[data-slot]').forEach(s => {
            if (s === dragEl) return;
            s.style.outline = ''; s.style.boxShadow = '';
        });
        if (target && target !== dragEl) {
            target.style.outline = '3px dashed var(--accent-color)';
            target.style.boxShadow = '0 0 20px rgba(99,102,241,0.3)';
        }
    }

    function resetVisuals() {
        removeGhost();
        if (dragEl) { dragEl.style.opacity = ''; dragEl.style.transform = ''; }
        slotsContainer.querySelectorAll('.seq-slot-card[data-slot]').forEach(s => { s.style.outline = ''; s.style.boxShadow = ''; });
    }

    function handleDrop(cx, cy) {
        const target = findSlotTarget(cx, cy);
        resetVisuals();
        _seqDragJustEnded = true;
        setTimeout(() => { _seqDragJustEnded = false; }, 150);
        if (!target) return;
        const targetSlotIdx = parseInt(target.dataset.slot);

        if (dragType === 'source') {
            const card = state.sequenzeSourceCards.find(c => c.seqNumber === dragData.seqNum);
            if (!card) return;
            const sourceIdx = state.sequenzeSourceCards.indexOf(card);
            const existing = state.sequenzePlacements[targetSlotIdx];
            if (existing) state.sequenzeSourceCards.push(existing);
            state.sequenzePlacements[targetSlotIdx] = card;
            state.sequenzeSourceCards.splice(sourceIdx, 1);
            state.sequenzeSelectedSource = null;
            renderSequenzeUI(document.getElementById('game-stage'));
        } else if (dragType === 'slot') {
            if (targetSlotIdx !== dragData.slotIdx) swapSequenzeSlots(dragData.slotIdx, targetSlotIdx);
        }
    }

    function beginDrag(type, data, el, x, y) {
        dragType = type; dragData = data; dragEl = el; startX = x; startY = y; isDragging = false;
    }

    function checkMove(x, y, threshold) {
        if (!dragType) return;
        if (!isDragging && (Math.abs(x-startX) > threshold || Math.abs(y-startY) > threshold)) {
            isDragging = true;
            let item = dragType === 'source' ? state.sequenzeSourceCards.find(c => c.seqNumber === dragData.seqNum) : state.sequenzePlacements[dragData.slotIdx];
            if (item) ghostEl = createGhost(item, x, y);
            if (dragEl) { dragEl.style.opacity = '0.3'; if (dragType === 'slot') dragEl.style.transform = 'scale(0.9)'; }
        }
        if (isDragging) { moveGhost(x, y); highlightSlots(x, y); }
    }

    // Source card drag
    if (sourceArea) {
        sourceArea.querySelectorAll('.seq-source-card[data-seq]').forEach(card => {
            const seqNum = parseInt(card.dataset.seq);
            card.addEventListener('touchstart', (e) => { if (!e.target.closest('button')) { const t=e.touches[0]; beginDrag('source',{seqNum},card,t.clientX,t.clientY); } }, { passive: true });
            card.addEventListener('touchmove', (e) => { if (dragType==='source') { const t=e.touches[0]; checkMove(t.clientX,t.clientY,10); if (isDragging) e.preventDefault(); } }, { passive: false });
            card.addEventListener('touchend', (e) => { if (isDragging && dragType==='source') handleDrop(e.changedTouches[0].clientX,e.changedTouches[0].clientY); dragType=null; isDragging=false; });
            card.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) { beginDrag('source',{seqNum},card,e.clientX,e.clientY); e.preventDefault(); } });
        });
    }

    // Slot card drag (swap)
    slotsContainer.querySelectorAll('.seq-slot-card[data-slot]').forEach(slot => {
        const slotIdx = parseInt(slot.dataset.slot);
        if (state.sequenzePlacements[slotIdx] === null) return;
        slot.addEventListener('touchstart', (e) => { if (!state.sequenzeVerified && !e.target.closest('button')) { const t=e.touches[0]; beginDrag('slot',{slotIdx},slot,t.clientX,t.clientY); } }, { passive: true });
        slot.addEventListener('touchmove', (e) => { if (dragType==='slot') { const t=e.touches[0]; checkMove(t.clientX,t.clientY,10); if (isDragging) e.preventDefault(); } }, { passive: false });
        slot.addEventListener('touchend', (e) => { if (isDragging && dragType==='slot') handleDrop(e.changedTouches[0].clientX,e.changedTouches[0].clientY); dragType=null; isDragging=false; });
        slot.addEventListener('mousedown', (e) => { if (!state.sequenzeVerified && !e.target.closest('button')) { beginDrag('slot',{slotIdx},slot,e.clientX,e.clientY); e.preventDefault(); } });
    });

    function onDocMouseMove(e) { checkMove(e.clientX, e.clientY, 5); }
    function onDocMouseUp(e) {
        if (isDragging && dragType) handleDrop(e.clientX, e.clientY); else resetVisuals();
        dragType = null; isDragging = false;
    }
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);
    _seqDragCleanup = () => { document.removeEventListener('mousemove', onDocMouseMove); document.removeEventListener('mouseup', onDocMouseUp); removeGhost(); };
}

window.swapSequenzeSlots = (fromIdx, toIdx) => {
    if (_seqDragCleanup) { _seqDragCleanup(); _seqDragCleanup = null; }
    const temp = state.sequenzePlacements[fromIdx];
    state.sequenzePlacements[fromIdx] = state.sequenzePlacements[toIdx];
    state.sequenzePlacements[toIdx] = temp;
    renderSequenzeUI(document.getElementById('game-stage'));
};
// --- CATEGORIZZAZIONE (Sorting by Tag) ---
function renderCategorizzazione(items, stage) {
    state._autoScoreErrored = false;
    const tags = state.selectedPoolTags;
    if (tags.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-layer-group fa-3x" style="margin-bottom:15px;"></i>
                <p>La modalit&agrave; Categorizzazione richiede almeno <b>2 tag</b><br>per generare le categorie.<br>Seleziona pi&ugrave; tag nel selettore.</p>
            </div>`;
        return;
    }

    // Build items, each tagged with its source tag
    let allItems = [];
    tags.forEach(tag => {
        getItemsByTag(tag).forEach(item => {
            allItems.push({ ...item, correctTag: tag });
        });
    });

    allItems = balancedShuffle(allItems, item => item.correctTag);
    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 0;
    if (numStimuli > 0 && allItems.length > numStimuli) {
        allItems = allItems.slice(0, numStimuli);
    }

    if (allItems.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-circle-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>Non ci sono abbastanza item con immagini<br>per questa attivit&agrave;.</p>
            </div>`;
        return;
    }

    state.catItems = allItems;
    state.catIndex = 0;
    showCategorizzazioneItem(stage);
}

function showCategorizzazioneItem(stage) {
    const tags = state.selectedPoolTags;
    const items = state.catItems;
    const idx = state.catIndex;

    if (idx >= items.length) {
        const pct = state.session.total > 0 ? Math.round((state.session.correct / state.session.total) * 100) : 0;
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px;">
                <i class="fa-solid fa-flag-checkered fa-3x" style="margin-bottom:15px; color:var(--accent-color);"></i>
                <h2 style="margin:10px 0;">Sessione Completata!</h2>
                <p style="font-size:1.5rem; font-weight:bold; color:${pct >= 90 ? 'var(--success-color)' : 'white'};">${pct}%</p>
                <p style="color:var(--text-secondary);">${state.session.correct} / ${state.session.total} corretti</p>
            </div>`;
        return;
    }

    const item = items[idx];
    const total = items.length;
    const tagColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const tagImgs = getAllTagImages();

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-layer-group"></i> A quale categoria appartiene?
            </span>
            <span style="color:var(--text-secondary); font-size:0.8rem;">${idx + 1}/${total}</span>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; min-height:0;">
            <div id="cat-card" style="background:white; border-radius:16px; padding:10px; max-width:300px; width:100%; max-height:55%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); transition:0.3s;">
                <img src="${item.url || getPlaceholderUrl(item.label)}"
                     style="max-width:100%; max-height:85%; object-fit:contain; border-radius:8px;"
                     onerror="handleImgError(this, '${item.label}')">
                <div style="font-size:1rem; color:#333; font-weight:800; margin-top:6px; text-transform:uppercase;">${item.label}</div>
            </div>
        </div>
        <div style="padding:15px 10px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center; background:rgba(0,0,0,0.2); border-top:1px solid #ffffff10; flex-shrink:0;">
            ${tags.map((tag, i) => `
                <button class="btn" onclick="handleCatChoice('${tag}')"
                    style="background:${tagColors[i % tagColors.length]}; padding:15px 25px; font-size:1.2rem; border-radius:16px; min-width:140px; min-height:100px; text-transform:capitalize; display:flex; flex-direction:column; align-items:center; gap:8px;">
                    ${tagImgs[tag.toLowerCase().trim()] ? `<img src="${tagImgs[tag.toLowerCase().trim()]}" style="width:64px; height:64px; object-fit:contain; border-radius:10px; background:rgba(255,255,255,0.3);">` : ''}
                    <span>${tag}</span>
                </button>
            `).join('')}
        </div>
    </div>`;
}

window.handleCatChoice = (chosenTag) => {
    if (!state.session.active) return;
    const item = state.catItems[state.catIndex];
    const card = document.getElementById('cat-card');
    const isCorrect = chosenTag === item.correctTag;
    const isTimedelay = getSelectedSessionType() === 'timedelay';

    if (isCorrect) {
        card.style.border = '4px solid var(--success-color)';
        card.style.boxShadow = '0 0 30px rgba(16,185,129,0.5)';
        // Score V only if no prior wrong on this item
        if (!state._autoScoreErrored) {
            const key = isTimedelay ? `cat_${state.catIndex}_ok` : state.catIndex;
            state.session.itemResults[key] = true;
        }
        state._autoScoreErrored = false;
    } else if (isTimedelay) {
        // Time Delay: highlight as prompt, don't advance
        card.style.border = '4px solid var(--warning-color)';
        card.style.boxShadow = '0 0 30px rgba(245,158,11,0.3)';
        const key = `cat_${state.catIndex}_p${Date.now()}`;
        state.session.itemResults[key] = 'prompt';
        state._autoScoreErrored = true;
    } else {
        card.style.border = '4px solid var(--danger-color)';
        card.style.boxShadow = '0 0 30px rgba(239,68,68,0.5)';
        state.session.itemResults[state.catIndex] = false;
        state._autoScoreErrored = true;
    }

    // Update score
    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.prompts = results.filter(v => v === 'prompt').length;
    state.session.total = results.length;
    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');

    setTimeout(() => {
        // In TD mode, don't advance on wrong answer
        if (isCorrect || !isTimedelay) {
            state.catIndex++;
            state._autoScoreErrored = false;
        }
        showCategorizzazioneItem(document.getElementById('game-stage'));
    }, 800);
};

// --- SEARCH & FIND ---
function renderSearchFind(items, stage) {
    const s = items[0];
    stage.innerHTML = `
        <div class="search-find-container">
            <div class="sf-toolbar">
                <span style="color:white;font-weight:bold;">${s.label}</span>
                <button class="btn btn-sm btn-danger" onclick="clearMarkers()"><i class="fa-solid fa-eraser"></i> Pulisci</button>
            </div>
            <div class="sf-viewport" id="sf-viewport">
                <img src="${s.url || getPlaceholderUrl(s.label)}" class="sf-image" onerror="handleImgError(this,'${s.label}')">
            </div>
        </div>`;
    setupSearchFindTouch();
}

// Touch-permissive marker placement (tolerates slight finger movement)
function setupSearchFindTouch() {
    const vp = document.getElementById('sf-viewport');
    if (!vp) return;

    let touchStartX = 0, touchStartY = 0;
    let lastTouchEnd = 0;

    vp.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('marker-pin')) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    vp.addEventListener('touchend', (e) => {
        if (e.target.classList.contains('marker-pin')) return;
        const touch = e.changedTouches[0];
        const dx = Math.abs(touch.clientX - touchStartX);
        const dy = Math.abs(touch.clientY - touchStartY);
        // Allow up to 20px of finger movement as a tap
        if (dx < 20 && dy < 20) {
            placeMarkerAt(touch.clientX, touch.clientY);
        }
        lastTouchEnd = Date.now();
        e.preventDefault();
    });

    // Mouse click for desktop (skip if just handled by touch)
    vp.addEventListener('click', (e) => {
        if (e.target.classList.contains('marker-pin')) return;
        if (Date.now() - lastTouchEnd < 500) return;
        placeMarkerAt(e.clientX, e.clientY);
    });
}

function placeMarkerAt(clientX, clientY) {
    const vp = document.getElementById('sf-viewport');
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'marker-pin';
    m.style.left = (clientX - r.left) + 'px';
    m.style.top = (clientY - r.top) + 'px';

    const removeThisMarker = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        if (m.dataset.id && state.session && state.session.active && state.session.itemResults) {
            const removedId = m.dataset.id;
            delete state.session.itemResults[removedId];

            if (state.session.scoreHistory) {
                state.session.scoreHistory = state.session.scoreHistory.filter(id => id !== removedId);
            }

            const results = Object.values(state.session.itemResults);
            state.session.correct = results.filter(v => v === true).length;
            state.session.incorrect = results.filter(v => v === false).length;
            state.session.prompts = results.filter(v => v === 'prompt').length;
            state.session.total = results.length;

            if (state.multiSetSession && state.multiSetSession.active && typeof _updateMultiSetScoreUI === 'function') {
                _updateMultiSetScoreUI();
            } else if (typeof updateScoreUI === 'function') {
                updateScoreUI();
            }
        }

        m.remove();
    };

    m.onclick = removeThisMarker;
    m.addEventListener('touchend', removeThisMarker);

    vp.appendChild(m);
}

// Keep backward compat
window.placeMarker = (e) => { placeMarkerAt(e.clientX, e.clientY); };

window.undoLastAction = () => {
    if (!state.session || !state.session.active) return;
    const mode = document.getElementById('mode-select').value;
    const engine = getModeEngine(mode);

    if (engine === 'quaderno' || engine === 'quaderno_task') {
        if (state._quadernoType === 'task') {
            if (typeof window.undoLastTaskStep === 'function') window.undoLastTaskStep();
        } else {
            // Quaderno general: undo last LU from the most recently scored row
            const rows = state._quadernoRows || [];
            for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i].results && rows[i].results.length > 0) {
                    rows[i].results.pop();
                    _syncQuadernoName();
                    renderQuadernoGeneral(document.getElementById('quaderno-content'));
                    break;
                }
            }
        }
        return;
    }

    // Racconto phase undo
    if (state.session.sequenzePhase === 'racconto') {
        if (state.session.scoreHistory && state.session.scoreHistory.length > 0) {
            const lastIdx = state.session.scoreHistory.pop();
            delete state.raccontoScored[lastIdx];
            delete state.session.itemResults[lastIdx];
            const results = Object.values(state.session.itemResults);
            state.session.correct = results.filter(v => v === true).length;
            state.session.incorrect = results.filter(v => v === false).length;
            state.session.prompts = results.filter(v => v === 'prompt').length;
            state.session.total = results.length;
            state.raccontoSelectedIdx = lastIdx;
            if (typeof updateScoreUI === 'function') updateScoreUI();
            document.getElementById('btn-save-session').classList.add('hidden');
            renderRaccontoUI(document.getElementById('game-stage'));
        }
        return;
    }

    let removedId = null;

    if (engine === 'search_find' || engine === 'intraverbal_scenari') {
        const markers = document.querySelectorAll('.marker-pin');
        let markerToRemove = null;

        if (state.session.scoreHistory && state.session.scoreHistory.length > 0) {
            removedId = state.session.scoreHistory.pop();

            if (markers.length > 0) {
                for (let i = markers.length - 1; i >= 0; i--) {
                    if (markers[i].dataset.id === removedId) {
                        markerToRemove = markers[i];
                        break;
                    }
                }
            }
        }

        if (!markerToRemove && markers.length > 0) {
            markerToRemove = markers[markers.length - 1];
            removedId = markerToRemove.dataset.id;

            if (removedId && state.session.scoreHistory) {
                state.session.scoreHistory = state.session.scoreHistory.filter(id => id !== removedId);
            }
        }

        if (markerToRemove) markerToRemove.remove();
    } else {
        if (state.session.scoreHistory && state.session.scoreHistory.length > 0) {
            removedId = state.session.scoreHistory.pop();

            const currentIndex = (engine === 'tact') ? state.tactIndex : state.ranIndex;
            if (removedId === currentIndex) {
                const targetImg = document.querySelector('.tact-card-lg img, .ran-main-img');
                if (targetImg) targetImg.classList.remove('feedback-success', 'feedback-fail', 'feedback-prompt');
            }
        }
    }

    if (removedId && state.session.itemResults[removedId] !== undefined) {
        delete state.session.itemResults[removedId];
    }

    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.prompts = results.filter(v => v === 'prompt').length;
    state.session.total = results.length;

    if (state.multiSetSession && state.multiSetSession.active && typeof _updateMultiSetScoreUI === 'function') {
        _updateMultiSetScoreUI();
    } else if (typeof updateScoreUI === 'function') {
        updateScoreUI();
    }
};

window.removeLastMarker = window.undoLastAction;

window.clearMarkers = () => {
    document.querySelectorAll('.marker-pin').forEach(m => {
        if (m.dataset.id && state.session && state.session.active && state.session.itemResults) {
            const removedId = m.dataset.id;
            delete state.session.itemResults[removedId];
            if (state.session.scoreHistory) {
                state.session.scoreHistory = state.session.scoreHistory.filter(id => id !== removedId);
            }
        }
        m.remove();
    });

    if (state.session && state.session.active && state.session.itemResults) {
        const results = Object.values(state.session.itemResults);
        state.session.correct = results.filter(v => v === true).length;
        state.session.incorrect = results.filter(v => v === false).length;
        state.session.prompts = results.filter(v => v === 'prompt').length;
        state.session.total = results.length;
        if (state.multiSetSession && state.multiSetSession.active && typeof _updateMultiSetScoreUI === 'function') {
            _updateMultiSetScoreUI();
        } else if (typeof updateScoreUI === 'function') {
            updateScoreUI();
        }
    }
};

// --- TOMBOLA SONORA (Audio matching) ---
function renderTombolaSonora(items, stage) {
    state._autoScoreErrored = false;
    // Filter items that have audio
    const audioItems = items.filter(i => i.audio);
    if (audioItems.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-volume-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item con audio trovato in questo set.<br>Aggiungi file audio agli item nell'Editor<br>(icona <i class="fa-solid fa-music"></i>).</p>
            </div>`;
        return;
    }

    state.deck = [...audioItems].sort(() => Math.random() - 0.5);
    const cols = Math.ceil(Math.sqrt(audioItems.length));
    const rows = Math.ceil(audioItems.length / cols);

    stage.innerHTML = `
        <div style="display:flex; height:100%; flex-direction:column;">
            <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0;">
                <div style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                    <i class="fa-solid fa-music"></i> Ascolta e Trova:
                </div>
                <button id="btn-play-audio" class="btn btn-primary" onclick="playCurrentAudio()" style="padding:8px 20px; border-radius:20px; font-size:0.9rem;">
                    <i class="fa-solid fa-play"></i> Riproduci
                </button>
                <span id="audio-remaining" style="color:var(--text-secondary); font-size:0.75rem;">${state.deck.length} rimasti</span>
            </div>
            <div style="flex:1; min-height:0; padding:10px; display:grid;
                        grid-template-columns:repeat(${cols}, 1fr);
                        grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                        gap:10px; overflow-y:auto;">
                ${audioItems.map((item, idx) => `
                    <div class="card-grid" id="audio-slot-${idx}"
                         onclick="handleAudioMatchClick(${idx}, '${item.label.replace(/'/g, "\\'")}')"
                         style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                        <img src="${item.url || getPlaceholderUrl(item.label)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                             onerror="handleImgError(this, '${item.label}')">
                    </div>
                `).join('')}
            </div>
        </div>`;

    // Auto-play first audio after a short delay
    setTimeout(() => playCurrentAudio(), 500);
}

window.playCurrentAudio = () => {
    if (state.deck.length === 0) return;
    const current = state.deck[0];
    if (current.audio) {
        if (window._currentAudio) { window._currentAudio.pause(); }
        window._currentAudio = new Audio(current.audio);
        window._currentAudio.play().catch(e => console.warn('Audio play failed:', e));
        const btn = document.getElementById('btn-play-audio');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> ...';
            window._currentAudio.onended = () => { btn.innerHTML = '<i class="fa-solid fa-play"></i> Riproduci'; };
        }
    }
};

window.handleAudioMatchClick = (idx, label) => {
    if (state.deck.length === 0) return;
    const cardEl = document.getElementById(`audio-slot-${idx}`);
    if (cardEl.classList.contains('matched')) return;

    const isCorrect = label === state.deck[0].label;
    const isTimedelay = getSelectedSessionType() === 'timedelay';

    if (isCorrect) {
        cardEl.classList.add('matched');
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(16,185,129,0.4)';
        state.deck.shift();
        const remaining = document.getElementById('audio-remaining');
        if (remaining) remaining.textContent = state.deck.length > 0 ? state.deck.length + ' rimasti' : 'FINITO!';
        if (state.deck.length > 0) {
            setTimeout(() => playCurrentAudio(), 800);
        }
    } else if (isTimedelay) {
        cardEl.style.border = '4px solid var(--warning-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(245,158,11,0.3)';
        cardEl.style.opacity = '0.5';
    } else {
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(239,68,68,0.4)';
        setTimeout(() => {
            cardEl.style.border = '';
            cardEl.style.boxShadow = '';
        }, 600);
    }

    // Auto-score in session (skip V after correction)
    if (state.session.active) {
        const shouldScore = isCorrect ? !state._autoScoreErrored : true;
        if (isCorrect) state._autoScoreErrored = false;
        else state._autoScoreErrored = true;

        if (shouldScore) {
            const key = `tombola_sonora_${Date.now()}`;
            state.session.itemResults[key] = isCorrect ? true : (isTimedelay ? 'prompt' : false);
            const results = Object.values(state.session.itemResults);
            state.session.correct = results.filter(v => v === true).length;
            state.session.incorrect = results.filter(v => v === false).length;
            state.session.prompts = results.filter(v => v === 'prompt').length;
            state.session.total = results.length;
            updateScoreUI();
        }
        document.getElementById('btn-save-session').classList.remove('hidden');
        if (typeof showSessionNameInput === 'function') showSessionNameInput();
    }
};

// --- ZOOM (Part-to-whole guessing) ---
function renderZoom(items, stage) {
    const zoomItems = items.filter(i => i.url);
    if (zoomItems.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-magnifying-glass fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item con immagine trovato.</p>
            </div>`;
        return;
    }

    state.zoomIndex = 0;
    state.zoomRevealed = false;
    state.zoomItems = zoomItems.sort(() => Math.random() - 0.5);
    showZoomItem(stage);
}

function showZoomItem(stage) {
    const items = state.zoomItems;
    const idx = state.zoomIndex;

    if (idx >= items.length) {
        const pct = state.session.total > 0 ? Math.round((state.session.correct / state.session.total) * 100) : 0;
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px;">
                <i class="fa-solid fa-flag-checkered fa-3x" style="margin-bottom:15px; color:var(--accent-color);"></i>
                <h2 style="margin:10px 0;">Zoom Completato!</h2>
                <p style="font-size:1.5rem; font-weight:bold; color:${pct >= 90 ? 'var(--success-color)' : 'white'};">${pct}%</p>
                <p style="color:var(--text-secondary);">${state.session.correct} / ${state.session.total} corretti</p>
            </div>`;
        return;
    }

    const item = items[idx];
    state.zoomRevealed = false;

    // Default zoom area: center 30% of image, or use custom if defined
    const area = item.zoomArea || { x: 35, y: 35, w: 30, h: 30 };

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-magnifying-glass"></i> Cos'&egrave;?
            </span>
            <span style="color:var(--text-secondary); font-size:0.8rem;">${idx + 1}/${items.length}</span>
        </div>
        <div id="zoom-display" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; min-height:0; cursor:pointer;" onclick="revealZoom()">
            <div id="zoom-image-container" style="position:relative; max-width:90%; max-height:70%; overflow:hidden; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.5); background:white;">
                <img id="zoom-img" src="${item.url}" style="display:block; width:100%; height:auto; transform-origin:${area.x + area.w / 2}% ${area.y + area.h / 2}%; transform:scale(${Math.round(100 / area.w * 2.5)}); transition:transform 0.8s ease;" onerror="handleImgError(this, '${item.label}')">
            </div>
            <div id="zoom-label" style="margin-top:15px; font-size:1.5rem; font-weight:800; color:white; text-transform:uppercase; opacity:0; transition:opacity 0.5s;">${item.label}</div>
            <div id="zoom-hint" style="margin-top:10px; color:var(--text-secondary); font-size:0.85rem;">
                <i class="fa-solid fa-hand-pointer"></i> Tocca per rivelare
            </div>
        </div>
        <div style="padding:10px; display:flex; gap:10px; justify-content:center; background:rgba(0,0,0,0.2); border-top:1px solid #ffffff10; flex-shrink:0;">
            <button class="btn btn-primary" onclick="nextZoomItem()" style="padding:10px 30px;">
                <i class="fa-solid fa-forward"></i> Avanti
            </button>
        </div>
    </div>`;
}

window.revealZoom = () => {
    if (state.zoomRevealed) return;
    state.zoomRevealed = true;

    const img = document.getElementById('zoom-img');
    const label = document.getElementById('zoom-label');
    const hint = document.getElementById('zoom-hint');

    if (img) img.style.transform = 'scale(1)';
    if (label) label.style.opacity = '1';
    if (hint) hint.style.display = 'none';
};

window.nextZoomItem = () => {
    state.zoomIndex++;
    showZoomItem(document.getElementById('game-stage'));
};

// ============================================================
// --- QUADERNO STATE PERSISTENCE (survives keyboard attach/page reload) ---
// ============================================================
function _saveQuadernoState() {
    try {
        const data = {
            type: state._quadernoType,
            name: state._quadernoName,
            setId: state._quadernoSetId,
            rows: state._quadernoRows,
            steps: state._quadernoSteps,
            currentStep: state._taskCurrentStep,
            cycleCount: state._taskCycleCount,
            tdSeconds: state._quadernoTDSeconds
        };
        sessionStorage.setItem('_quadernoState', JSON.stringify(data));
    } catch(e) { /* ignore */ }
}

function _restoreQuadernoState() {
    try {
        const raw = sessionStorage.getItem('_quadernoState');
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data.type) return false;
        state._quadernoType = data.type;
        state._quadernoName = data.name || '';
        state._quadernoSetId = data.setId || null;
        state._quadernoRows = data.rows || [];
        state._quadernoSteps = data.steps || [];
        state._taskCurrentStep = data.currentStep || 0;
        state._taskCycleCount = data.cycleCount || 0;
        state._quadernoTDSeconds = data.tdSeconds || 5;
        return true;
    } catch(e) { return false; }
}

function _clearQuadernoState() {
    try { sessionStorage.removeItem('_quadernoState'); } catch(e) { /* ignore */ }
}

// ============================================================
// --- QUADERNO (Manual scoring + Task Analysis) ---
// ============================================================
function renderQuaderno(stage, engine) {
    const isTaskMode = engine === 'quaderno_task';
    // Filter saved sets based on current engine
    const quadernoSets = state.savedSets.filter(s => {
        if (!s.modes) return false;
        if (isTaskMode) return s.modes.includes('quaderno_task');
        if (engine === 'quaderno') return s.modes.includes('quaderno') && !s.modes.includes('quaderno_task');
        return s.modes.includes('quaderno') || s.modes.includes('quaderno_task');
    });

    // Populate the set dropdown with filtered lists
    _populateQuadernoDropdown(quadernoSets, isTaskMode);

    // Try to restore previous quaderno state (e.g. after keyboard attach reload)
    if (_restoreQuadernoState() && (state._quadernoRows.length > 0 || state._quadernoSteps.length > 0)) {
        stage.innerHTML = `
        <div style="height:100%; display:flex; flex-direction:column; overflow:hidden;">
            <div id="quaderno-content" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary);">
            </div>
        </div>`;
        const content = document.getElementById('quaderno-content');
        if (state._quadernoType === 'task') renderQuadernoTask(content);
        else renderQuadernoGeneral(content);
        return;
    }

    // If entering directly via Task Analysis mode, open task sheet immediately
    if (isTaskMode) {
        stage.innerHTML = `
        <div style="height:100%; display:flex; flex-direction:column; overflow:hidden;">
            <div id="quaderno-content" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary);">
            </div>
        </div>`;
        openQuadernoSheet('task');
        return;
    }

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; overflow:hidden;">
        <!-- Quaderno Header -->
        <div style="padding:12px; background:rgba(0,0,0,0.2); border-bottom:1px solid #ffffff10; flex-shrink:0;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="openQuadernoSheet('general')" style="padding:8px 16px; font-size:0.9rem;">
                    <i class="fa-solid fa-clipboard-list"></i> Quaderno Generale
                </button>
                <button class="btn btn-ghost" onclick="openQuadernoSheet('task')" style="padding:8px 16px; font-size:0.9rem; border-color:var(--warning-color); color:var(--warning-color);">
                    <i class="fa-solid fa-list-check"></i> Task Analysis
                </button>
            </div>
        </div>
        <!-- Content area -->
        <div id="quaderno-content" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary);">
            <i class="fa-solid fa-book-open fa-3x" style="margin-bottom:15px; opacity:0.3;"></i>
            <p style="text-align:center;">Scegli <b>Quaderno Generale</b> per registrare attivit&agrave; manuali<br>
            o <b>Task Analysis</b> per sequenze operazionalizzate.</p>
            ${quadernoSets.length > 0 ? '<p style="font-size:0.8rem; opacity:0.6;">Oppure carica una lista salvata dal dropdown Set in alto.</p>' : ''}
        </div>
    </div>`;
}

// Show quaderno/task analysis lists in the set dropdown
function _populateQuadernoDropdown(quadernoSets, isTaskMode) {
    const setWrapper = document.getElementById('set-selector-wrapper');
    const panel = document.getElementById('set-dropdown-panel');
    const label = document.getElementById('set-dropdown-label');
    if (!setWrapper || !panel) return;

    // Show the set dropdown for quaderno modes
    setWrapper.classList.remove('hidden');
    label.textContent = isTaskMode ? '-- Task Salvati --' : '-- Liste Salvate --';

    if (quadernoSets.length === 0) {
        const emptyMsg = isTaskMode
            ? 'Nessun task salvato.<br>Crea una Task Analysis e salva la lista.'
            : 'Nessuna lista salvata.<br>Crea un quaderno e salva la lista.';
        panel.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.85rem;">${emptyMsg}</div>`;
        return;
    }

    let html = '';
    // Group by type
    const generalSets = quadernoSets.filter(s => s.modes.includes('quaderno') && !s.modes.includes('quaderno_task'));
    const taskSets = quadernoSets.filter(s => s.modes.includes('quaderno_task'));

    if (generalSets.length > 0) {
        html += `<div class="set-dropdown-group-label" style="top:0;"><span><i class="fa-solid fa-clipboard-list"></i> Quaderno Generale</span><span style="opacity:0.5; font-size:0.6rem;">${generalSets.length}</span></div>`;
        generalSets.forEach(s => {
            html += `<div class="set-dropdown-item" onclick="loadQuadernoSet('${s.id}')" style="cursor:pointer;">
                <div class="set-item-thumb" style="background:rgba(99,102,241,0.15);"><i class="fa-solid fa-clipboard-list" style="color:var(--accent-color);"></i></div>
                <div class="set-item-info">
                    <div class="set-item-name">${s.name}</div>
                    <div class="set-item-meta"><span class="set-item-count">${s.items.length} attivit&agrave;</span></div>
                </div>
            </div>`;
        });
    }

    if (taskSets.length > 0) {
        html += `<div class="set-dropdown-group-label" style="top:0; color:var(--warning-color); border-color:rgba(245,158,11,0.15);"><span><i class="fa-solid fa-list-check"></i> Task Analysis</span><span style="opacity:0.5; font-size:0.6rem;">${taskSets.length}</span></div>`;
        taskSets.forEach(s => {
            html += `<div class="set-dropdown-item" onclick="loadQuadernoSet('${s.id}')" style="cursor:pointer;">
                <div class="set-item-thumb" style="background:rgba(245,158,11,0.15);"><i class="fa-solid fa-list-check" style="color:var(--warning-color);"></i></div>
                <div class="set-item-info">
                    <div class="set-item-name">${s.name}</div>
                    <div class="set-item-meta"><span class="set-item-count">${s.items.length} passaggi</span></div>
                </div>
            </div>`;
        });
    }

    panel.innerHTML = html;
}

// --- Open a new Quaderno sheet ---
window.openQuadernoSheet = (type) => {
    const content = document.getElementById('quaderno-content');
    if (!content) return;

    if (type === 'general') {
        state._quadernoType = 'general';
        state._quadernoRows = [];
        state._quadernoName = '';
        state._quadernoSetId = null;
        renderQuadernoGeneral(content);
    } else if (type === 'task') {
        state._quadernoType = 'task';
        state._quadernoSteps = [];
        state._quadernoName = '';
        state._quadernoSetId = null;
        state._taskCurrentStep = 0;
        state._taskCycleCount = 0;
        renderQuadernoTask(content);
    }
};

// --- Load saved list (legacy localStorage) ---
window.loadQuadernoList = (name) => {
    if (!name) return;
    const lists = getSavedQuadernoLists();
    const list = lists.find(l => l.name === name);
    if (!list) return;

    const content = document.getElementById('quaderno-content');
    state._quadernoName = list.name;
    state._quadernoSetId = null;

    if (list.type === 'task') {
        state._quadernoType = 'task';
        state._quadernoSteps = list.items.map(item => ({ ...item, results: [] }));
        state._taskCurrentStep = 0;
        state._taskCycleCount = 0;
        renderQuadernoTask(content);
    } else {
        state._quadernoType = 'general';
        state._quadernoRows = list.items.map(item => ({ ...item, results: [] }));
        renderQuadernoGeneral(content);
    }
};

// --- Load quaderno from IndexedDB set ---
window.loadQuadernoSet = (setId) => {
    const s = state.savedSets.find(x => x.id === setId);
    if (!s) return;

    const content = document.getElementById('quaderno-content');
    const isTask = s.modes && s.modes.includes('quaderno_task');

    state._quadernoName = s.name;
    state._quadernoSetId = s.id;

    if (isTask) {
        state._quadernoType = 'task';
        state._quadernoSteps = s.items.map(item => ({ name: item.name || item.label || item.l || '', results: [] }));
        state._taskCurrentStep = 0;
        state._taskCycleCount = 0;
        renderQuadernoTask(content);
    } else {
        state._quadernoType = 'general';
        state._quadernoRows = s.items.map(item => ({ name: item.name || item.label || item.l || '', results: [] }));
        renderQuadernoGeneral(content);
    }
};

// ============================================================
// QUADERNO GENERALE
// ============================================================
function getQuadernoSessionType() {
    const sel = document.getElementById('quaderno-session-type');
    return sel ? sel.value : 'independent';
}

function getQuadernoTDSeconds() {
    const input = document.getElementById('quaderno-td-seconds');
    return input ? (parseInt(input.value) || 5) : 5;
}

window.onQuadernoTypeChange = () => {
    _syncQuadernoName();
    const type = getQuadernoSessionType();
    const tdWrap = document.getElementById('quaderno-td-seconds-wrap');
    if (tdWrap) tdWrap.style.display = type === 'timedelay' ? '' : 'none';
    // Re-render rows to update buttons
    const content = document.getElementById('quaderno-content');
    if (state._quadernoType === 'general') renderQuadernoGeneral(content);
    else renderQuadernoTask(content);
};

function renderQuadernoGeneral(container) {
    _saveQuadernoState();
    container.style.justifyContent = 'flex-start';
    container.style.alignItems = 'stretch';
    const rows = state._quadernoRows || [];
    const savedNames = getSavedQuadernoLists().filter(l => l.type !== 'task').map(l => l.name);
    const qType = getQuadernoSessionType();
    const activityNames = getUsedActivityNames();

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-name-input', savedNames, {
                value: state._quadernoName || '',
                placeholder: 'Nome lista (es. Seduta 15 Feb)',
                style: 'min-width:150px; padding:8px 12px; border-radius:8px; font-size:0.9rem;'
            })}
        </div>

        <div id="quaderno-rows-list">
            ${rows.map((row, i) => renderQuadernoRow(row, i, qType)).join('')}
        </div>

        <div style="display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-new-activity', activityNames, {
                placeholder: 'Nome attività...',
                onkeydown: "if(event.key==='Enter')addQuadernoRow()",
                style: 'min-width:120px; padding:10px; border-radius:8px; font-size:0.9rem;'
            })}
            <select id="quaderno-session-type" onchange="onQuadernoTypeChange()" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
                <option value="independent" ${qType === 'independent' ? 'selected' : ''}>Indipendente</option>
                <option value="timedelay" ${qType === 'timedelay' ? 'selected' : ''}>Time Delay</option>
            </select>
            <span id="quaderno-td-seconds-wrap" style="${qType === 'timedelay' ? '' : 'display:none;'}">
                <input type="number" id="quaderno-td-seconds" value="${state._quadernoTDSeconds || 5}" min="1" max="30" style="width:55px; padding:8px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.85rem; text-align:center;" placeholder="sec">
            </span>
            <button class="btn btn-primary" onclick="addQuadernoRow()" style="padding:10px 16px;">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>

        <div style="display:flex; gap:8px; margin-top:15px; justify-content:center;">
            <button class="btn btn-success" onclick="saveQuadernoSession()" style="padding:10px 20px;">
                <i class="fa-solid fa-floppy-disk"></i> Salva Sessione
            </button>
            <button class="btn btn-ghost" onclick="saveQuadernoTemplate()" style="padding:10px 20px;">
                <i class="fa-solid fa-bookmark"></i> Salva Lista
            </button>
        </div>
    </div>`;

    // Setup custom autocomplete behavior after DOM insert
    setupCustomAutocomplete('quaderno-name-input', savedNames);
    setupCustomAutocomplete('quaderno-new-activity', activityNames);
}

function renderQuadernoRow(row, idx, sessionType) {
    const res = row.results || [];
    const xCount = res.filter(r => r === false).length;
    const pCount = res.filter(r => r === 'prompt').length;
    const vCount = res.filter(r => r === true).length;
    const total = res.length;
    const isTD = sessionType === 'timedelay';

    // Independent: X + V, Time Delay: P + V
    const leftBtn = isTD ? `
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--warning-color);">${pCount}</span>
                <button onclick="addQuadernoLU(${idx}, 'prompt')" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--warning-color); background:rgba(245,158,11,0.15); color:var(--warning-color); cursor:pointer; font-size:1rem; font-weight:800; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    P
                </button>
            </div>` : `
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--danger-color);">${xCount}</span>
                <button onclick="addQuadernoLU(${idx}, false)" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--danger-color); background:rgba(239,68,68,0.15); color:var(--danger-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;

    const totalRows = (state._quadernoType === 'general' ? state._quadernoRows : state._quadernoSteps || []).length;
    return `
    <div style="display:flex; flex-direction:column; gap:6px; padding:12px 14px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:14px; transition:0.2s;">
        <div style="display:flex; align-items:center; gap:6px;">
            <div style="display:flex; flex-direction:column; gap:2px; flex-shrink:0;">
                <button onclick="moveQuadernoRow(${idx},-1)" style="width:24px; height:16px; border:none; background:transparent; color:${idx > 0 ? 'var(--text-secondary)' : '#333'}; cursor:${idx > 0 ? 'pointer' : 'default'}; font-size:0.6rem; display:flex; align-items:center; justify-content:center; padding:0;" title="Sposta su" ${idx === 0 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button onclick="moveQuadernoRow(${idx},1)" style="width:24px; height:16px; border:none; background:transparent; color:${idx < totalRows - 1 ? 'var(--text-secondary)' : '#333'}; cursor:${idx < totalRows - 1 ? 'pointer' : 'default'}; font-size:0.6rem; display:flex; align-items:center; justify-content:center; padding:0;" title="Sposta giù" ${idx >= totalRows - 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <span onclick="renameQuadernoRow(${idx})" style="flex:1; font-size:1.05rem; font-weight:700; cursor:pointer;" title="Rinomina">${row.name}</span>
            <span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:3px 10px; border-radius:8px; font-size:0.85rem; font-weight:bold; min-width:35px; text-align:center;" title="Totale LU">${total}</span>
            <button onclick="undoQuadernoResult(${idx})" style="width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Annulla ultimo" ${total === 0 ? 'disabled style="opacity:0.3; width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:default; font-size:0.85rem; display:flex; align-items:center; justify-content:center;"' : ''}>
                <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button onclick="removeQuadernoRow(${idx})" style="width:34px; height:34px; border-radius:10px; border:none; background:transparent; color:#666; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Rimuovi riga">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center; align-items:stretch;">
            ${leftBtn}
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--success-color);">${vCount}</span>
                <button onclick="addQuadernoLU(${idx}, true)" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--success-color); background:rgba(16,185,129,0.15); color:var(--success-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        </div>
    </div>`;
}

// Sync the quaderno name input value to state before any re-render
function _syncQuadernoName() {
    const input = document.getElementById('quaderno-name-input');
    if (input) state._quadernoName = input.value;
}

// Add a LU to a quaderno row (append, not toggle)
window.addQuadernoLU = (idx, result) => {
    _syncQuadernoName();
    if (state._quadernoType === 'general') {
        if (!state._quadernoRows[idx].results) state._quadernoRows[idx].results = [];
        state._quadernoRows[idx].results.push(result);
        renderQuadernoGeneral(document.getElementById('quaderno-content'));
    } else {
        if (!state._quadernoSteps[idx].results) state._quadernoSteps[idx].results = [];
        state._quadernoSteps[idx].results.push(result);
        renderQuadernoTask(document.getElementById('quaderno-content'));
    }
};

// Undo last LU from a quaderno row
window.undoQuadernoResult = (idx) => {
    _syncQuadernoName();
    if (state._quadernoType === 'general') {
        const res = state._quadernoRows[idx].results;
        if (res && res.length > 0) {
            res.pop();
            renderQuadernoGeneral(document.getElementById('quaderno-content'));
        }
    } else {
        const res = state._quadernoSteps[idx].results;
        if (res && res.length > 0) {
            res.pop();
            renderQuadernoTask(document.getElementById('quaderno-content'));
        }
    }
};

window.addQuadernoRow = () => {
    _syncQuadernoName();
    const input = document.getElementById('quaderno-new-activity');
    const name = input.value.trim();
    if (!name) return;
    state._quadernoRows.push({ name, results: [] });
    input.value = '';
    renderQuadernoGeneral(document.getElementById('quaderno-content'));
};

window.removeQuadernoRow = (idx) => {
    _syncQuadernoName();
    if (state._quadernoType === 'general') {
        state._quadernoRows.splice(idx, 1);
        renderQuadernoGeneral(document.getElementById('quaderno-content'));
    } else {
        state._quadernoSteps.splice(idx, 1);
        // Adjust current step pointer if needed
        if (state._taskCurrentStep >= (state._quadernoSteps || []).length) {
            state._taskCurrentStep = 0;
        }
        renderQuadernoTask(document.getElementById('quaderno-content'));
    }
};

window.moveQuadernoRow = (idx, dir) => {
    _syncQuadernoName();
    const rows = state._quadernoType === 'general' ? state._quadernoRows : state._quadernoSteps;
    if (!rows) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= rows.length) return;
    // Swap
    [rows[idx], rows[newIdx]] = [rows[newIdx], rows[idx]];
    // Adjust task current step pointer if needed
    if (state._quadernoType === 'task') {
        if (state._taskCurrentStep === idx) state._taskCurrentStep = newIdx;
        else if (state._taskCurrentStep === newIdx) state._taskCurrentStep = idx;
    }
    const content = document.getElementById('quaderno-content');
    if (state._quadernoType === 'general') renderQuadernoGeneral(content);
    else renderQuadernoTask(content);
};

window.renameQuadernoRow = async (idx) => {
    _syncQuadernoName();
    const rows = state._quadernoType === 'general' ? state._quadernoRows : state._quadernoSteps;
    if (!rows || !rows[idx]) return;
    const newName = await themedPrompt('Rinomina:', rows[idx].name);
    if (!newName || newName.trim() === '' || newName.trim() === rows[idx].name) return;
    rows[idx].name = newName.trim();
    const content = document.getElementById('quaderno-content');
    if (state._quadernoType === 'general') renderQuadernoGeneral(content);
    else renderQuadernoTask(content);
};

function getUsedActivityNames() {
    const names = new Set();
    // From saved quaderno templates
    getSavedQuadernoLists().forEach(l => {
        l.items.forEach(item => names.add(item.name));
    });
    // From active patient's history (setName from quaderno sessions)
    if (state.activePatientId) {
        const p = state.patients.find(x => x.id === state.activePatientId);
        if (p && p.history) {
            p.history.forEach(h => {
                if (h.setName) names.add(h.setName);
            });
        }
    }
    return [...names].sort();
}

// Save quaderno: uses dropdown type, no modal needed
window.saveQuadernoSession = async () => {
    if (!state.activePatientId) return alert("Seleziona prima un paziente.");
    const p = state.patients.find(x => x.id === state.activePatientId);
    if (!p) return;

    const type = getQuadernoSessionType();
    const tdSeconds = getQuadernoTDSeconds();
    if (!p.history) p.history = [];
    const now = new Date().toISOString();

    if (state._quadernoType === 'task') {
        // Task Analysis: save as ONE session with all step details, exclude N/A from totals
        const steps = state._quadernoSteps || [];
        let totalScored = 0, totalCorrect = 0, totalP = 0, totalX = 0;
        const taskSteps = [];

        steps.forEach(step => {
            const res = step.results || [];
            const vCount = res.filter(r => r === true).length;
            const pCount = res.filter(r => r === 'prompt').length;
            const xCount = res.filter(r => r === false).length;
            const naCount = res.filter(r => r === 'na').length;
            const scored = vCount + pCount + xCount; // N/A excluded
            totalScored += scored;
            totalCorrect += vCount;
            totalP += pCount;
            totalX += xCount;
            taskSteps.push({ name: step.name, results: [...res], v: vCount, p: pCount, x: xCount, na: naCount, scored });
        });

        if (totalScored === 0) return alert("Nessun LU registrato (esclusi N/A).");

        const nameInput = document.getElementById('quaderno-name-input');
        const taskName = (nameInput ? nameInput.value.trim() : '') || 'Task Analysis';

        const sessionData = {
            date: now,
            setId: 'quaderno_task_' + taskName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
            setName: taskName,
            mode: 'quaderno_task',
            correct: totalCorrect,
            prompts: totalP,
            total: totalScored,
            percentage: Math.round((totalCorrect / totalScored) * 100),
            sessionType: type,
            rawV: totalCorrect,
            rawP: totalP,
            rawX: totalX,
            taskSteps: taskSteps // Per-step detail for dashboard analysis
        };
        if (type === 'timedelay') {
            sessionData.timeDelaySeconds = tdSeconds;
        }

        // Check for existing task analysis session today with same name → merge
        const todayStr = now.slice(0, 10); // YYYY-MM-DD
        const existingIdx = p.history.findIndex(h =>
            h.mode === 'quaderno_task' &&
            h.setName === taskName &&
            h.date && h.date.slice(0, 10) === todayStr
        );

        let merged = false;
        if (existingIdx >= 0) {
            const existing = p.history[existingIdx];
            // Merge taskSteps: append new cycles' results to existing steps
            if (existing.taskSteps && existing.taskSteps.length === taskSteps.length) {
                // Same steps structure → merge results arrays
                for (let i = 0; i < taskSteps.length; i++) {
                    existing.taskSteps[i].results = existing.taskSteps[i].results.concat(taskSteps[i].results);
                    existing.taskSteps[i].v += taskSteps[i].v;
                    existing.taskSteps[i].p += taskSteps[i].p;
                    existing.taskSteps[i].x += taskSteps[i].x;
                    existing.taskSteps[i].na += taskSteps[i].na;
                    existing.taskSteps[i].scored += taskSteps[i].scored;
                }
                existing.correct += totalCorrect;
                existing.prompts += totalP;
                existing.total += totalScored;
                existing.rawV += totalCorrect;
                existing.rawP += totalP;
                existing.rawX += totalX;
                existing.percentage = Math.round((existing.correct / existing.total) * 100);
                existing.date = now; // Update timestamp to latest
                merged = true;
            }
        }

        if (!merged) {
            p.history.push(sessionData);
        }

        await DB.savePatient(p);
        _clearQuadernoState();
        const mergeNote = merged ? ' (accorpata con sessione precedente)' : '';
        alert(`Task Analysis salvata${mergeNote}!\n${totalScored} LU (escl. N/A), ${totalCorrect} corrette (${Math.round((totalCorrect / totalScored) * 100)}%)\nCicli completati: ${(state._taskCycleCount || 0) + (state._taskCurrentStep > 0 ? 1 : 0)}`);

    } else {
        // General Quaderno: save each row as a separate session (original behavior)
        const rows = state._quadernoRows || [];
        const scoredRows = rows.filter(r => r.results && r.results.length > 0);
        if (scoredRows.length === 0) return alert("Nessun LU registrato.");

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

            const sessionData = {
                date: now,
                setId: 'quaderno_' + row.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
                setName: row.name,
                mode: 'quaderno',
                correct: rawV,
                prompts: rawP,
                total: total,
                percentage: Math.round((rawV / total) * 100),
                sessionType: type,
                rawV: rawV,
                rawP: rawP,
                rawX: rawX
            };
            if (type === 'timedelay') {
                sessionData.timeDelaySeconds = tdSeconds;
            }
            p.history.push(sessionData);
        });

        await DB.savePatient(p);
        _clearQuadernoState();
        alert(`Sessione salvata!\n${totalLU} LU, ${totalCorrect} corrette (${totalLU > 0 ? Math.round((totalCorrect / totalLU) * 100) : 0}%)`);
    }
};

// Save quaderno template as a proper set (IndexedDB) for reuse and editing
window.saveQuadernoTemplate = async () => {
    const nameInput = document.getElementById('quaderno-name-input');
    let name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        name = await themedPrompt("Nome per la lista:");
        if (!name || !name.trim()) return;
        name = name.trim();
        if (nameInput) nameInput.value = name;
    }

    const rows = state._quadernoType === 'task' ? state._quadernoSteps : state._quadernoRows;
    if (rows.length === 0) return alert("Aggiungi almeno un'attivit\u00E0.");

    const modeTag = state._quadernoType === 'task' ? 'quaderno_task' : 'quaderno';

    // Check if we're editing an existing set (matched by _quadernoSetId)
    let setId = state._quadernoSetId || null;
    let existingSet = setId ? state.savedSets.find(s => s.id === setId) : null;

    if (!existingSet) {
        // Also check by name + mode for backward compatibility
        existingSet = state.savedSets.find(s => s.name === name && s.modes && s.modes.includes(modeTag));
        if (existingSet) setId = existingSet.id;
    }

    const setData = {
        id: setId || Date.now().toString(),
        name: name,
        category: state._quadernoType === 'task' ? 'Task Analysis' : 'Quaderno',
        items: rows.map(r => ({ label: r.name, name: r.name })),
        modes: [modeTag],
        tags: [],
        date: new Date().toLocaleDateString(),
        isClinical: false
    };

    await DB.saveSet(setData);
    state.savedSets = await DB.getAllSets();
    state._quadernoSetId = setData.id;
    state._quadernoName = name;

    // Also save to localStorage for backward compat
    const list = { name, type: state._quadernoType, items: rows.map(r => ({ name: r.name })) };
    saveQuadernoList(list);

    alert(`Lista "${name}" salvata!`);

    // Re-render keeping current data
    const content = document.getElementById('quaderno-content');
    if (state._quadernoType === 'task') {
        renderQuadernoTask(content);
    } else {
        renderQuadernoGeneral(content);
    }
};

// ============================================================
// QUADERNO TASK ANALYSIS (one LU per step, auto-repeat cycles)
// ============================================================
function renderQuadernoTask(container) {
    _saveQuadernoState();
    container.style.justifyContent = 'flex-start';
    container.style.alignItems = 'stretch';
    const steps = state._quadernoSteps || [];
    const savedNames = getSavedQuadernoLists().filter(l => l.type === 'task').map(l => l.name);
    const qType = getQuadernoSessionType();
    const currentStep = state._taskCurrentStep || 0;
    const cycleCount = state._taskCycleCount || 0;
    // Compute totals excluding N/A
    let totalScored = 0, totalCorrect = 0;
    steps.forEach(step => {
        (step.results || []).forEach(r => {
            if (r !== 'na') { totalScored++; if (r === true) totalCorrect++; }
        });
    });
    const pct = totalScored > 0 ? Math.round((totalCorrect / totalScored) * 100) : 0;

    const stepNames = getUsedActivityNames();

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-name-input', savedNames, {
                value: state._quadernoName || '',
                placeholder: 'Nome Task Analysis (es. Memory - Procedura)',
                style: 'min-width:150px; padding:8px 12px; border-radius:8px; font-size:0.9rem;'
            })}
        </div>

        <!-- Legend + Cycle counter -->
        <div style="display:flex; gap:12px; margin-bottom:10px; font-size:0.75rem; color:var(--text-secondary); justify-content:center; align-items:center; flex-wrap:wrap;">
            ${qType === 'independent' ? '<span><span style="color:var(--danger-color);">X</span> = Errore</span>' : '<span><span style="color:var(--warning-color);">P</span> = Prompt</span>'}
            <span><span style="color:var(--success-color);">V</span> = Corretto</span>
            <span><span style="color:#888;">N/A</span> = Non Applicabile</span>
            ${cycleCount > 0 ? `<span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:2px 10px; border-radius:8px; font-weight:bold;">Ciclo ${cycleCount + 1}</span>` : ''}
            ${totalScored > 0 ? `<span style="background:rgba(${pct >= 90 ? '16,185,129' : '255,255,255'},0.15); color:${pct >= 90 ? 'var(--success-color)' : '#ccc'}; padding:2px 10px; border-radius:8px; font-weight:bold;">${totalCorrect}/${totalScored} (${pct}%)</span>` : ''}
        </div>

        <div id="quaderno-steps-list">
            ${steps.map((step, i) => renderQuadernoTaskStep(step, i, qType, i === currentStep && steps.length > 0)).join('')}
        </div>

        <div style="display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-new-step', stepNames, {
                placeholder: 'Nuovo passaggio...',
                onkeydown: "if(event.key==='Enter')addQuadernoStep()",
                style: 'min-width:120px; padding:10px; border-radius:8px; font-size:0.9rem;'
            })}
            <select id="quaderno-session-type" onchange="onQuadernoTypeChange()" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
                <option value="independent" ${qType === 'independent' ? 'selected' : ''}>Indipendente</option>
                <option value="timedelay" ${qType === 'timedelay' ? 'selected' : ''}>Time Delay</option>
            </select>
            <span id="quaderno-td-seconds-wrap" style="${qType === 'timedelay' ? '' : 'display:none;'}">
                <input type="number" id="quaderno-td-seconds" value="${state._quadernoTDSeconds || 5}" min="1" max="30" style="width:55px; padding:8px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.85rem; text-align:center;" placeholder="sec">
            </span>
            <button class="btn btn-primary" onclick="addQuadernoStep()" style="padding:10px 16px;">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>

        <div style="display:flex; gap:8px; margin-top:15px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-ghost" onclick="undoLastTaskStep()" style="padding:10px 20px;" ${totalScored === 0 ? 'disabled style="padding:10px 20px; opacity:0.3;"' : ''}>
                <i class="fa-solid fa-rotate-left"></i> Annulla Ultimo
            </button>
            <button class="btn btn-success" onclick="saveQuadernoSession()" style="padding:10px 20px;">
                <i class="fa-solid fa-floppy-disk"></i> Salva Sessione
            </button>
            <button class="btn btn-ghost" onclick="saveQuadernoTemplate()" style="padding:10px 20px;">
                <i class="fa-solid fa-bookmark"></i> Salva Lista
            </button>
        </div>
    </div>`;

    setupCustomAutocomplete('quaderno-name-input', savedNames);
    setupCustomAutocomplete('quaderno-new-step', stepNames);

    // Auto-scroll to active step & start ring countdown
    if (steps.length > 0) {
        setTimeout(() => {
            const activeEl = document.getElementById('task-step-' + currentStep);
            if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        _startTaskTDRing();
    }
}

function renderQuadernoTaskStep(step, idx, sessionType, isActive) {
    const res = step.results || [];
    const xCount = res.filter(r => r === false).length;
    const pCount = res.filter(r => r === 'prompt').length;
    const vCount = res.filter(r => r === true).length;
    const naCount = res.filter(r => r === 'na').length;
    const scoredCount = res.filter(r => r !== 'na').length;
    const total = res.length;
    const isTD = sessionType === 'timedelay';

    // Show last result icon for completed steps
    const lastResult = res.length > 0 ? res[res.length - 1] : null;
    const lastIcon = lastResult === true ? '<i class="fa-solid fa-check" style="color:var(--success-color);"></i>'
        : lastResult === false ? '<i class="fa-solid fa-xmark" style="color:var(--danger-color);"></i>'
            : lastResult === 'prompt' ? '<span style="color:var(--warning-color); font-weight:800;">P</span>'
                : lastResult === 'na' ? '<span style="color:#888; font-size:0.7rem;">N/A</span>' : '';

    const activeBorder = isActive ? 'border:2px solid var(--accent-color); background:rgba(99,102,241,0.1);' : 'border:1px solid var(--glass-border); background:rgba(255,255,255,0.05);';
    const activeGlow = isActive ? 'box-shadow:0 0 12px rgba(99,102,241,0.3);' : '';

    // Only show buttons for active step
    const buttonsHtml = isActive ? `
        <div style="display:flex; gap:10px; justify-content:center; align-items:stretch; margin-top:6px;">
            ${isTD ? `
            <div style="position:relative; width:64px; height:64px; display:flex; align-items:center; justify-content:center;">
                <svg class="task-td-ring" width="64" height="64" style="position:absolute; top:0; left:0; pointer-events:none; transform:rotate(-90deg); opacity:${typeof _isTDTimerVisible === 'function' && !_isTDTimerVisible() ? '0' : '1'};">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
                    <circle class="task-td-ring-progress" cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3"
                            stroke-dasharray="${2 * Math.PI * 28}" stroke-dashoffset="0" stroke-linecap="round"
                            style="transition: stroke-dashoffset 0.1s linear;"/>
                </svg>
                <button onclick="taskStepScore('prompt')" style="width:56px; height:56px; border-radius:50%; border:2px solid var(--warning-color); background:rgba(245,158,11,0.15); color:var(--warning-color); cursor:pointer; font-size:1rem; font-weight:800; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    P
                </button>
            </div>` : `
            <button onclick="taskStepScore(false)" style="width:56px; height:56px; border-radius:50%; border:2px solid var(--danger-color); background:rgba(239,68,68,0.15); color:var(--danger-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                <i class="fa-solid fa-xmark"></i>
            </button>`}
            <button onclick="taskStepScore(true)" style="width:56px; height:56px; border-radius:50%; border:2px solid var(--success-color); background:rgba(16,185,129,0.15); color:var(--success-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                <i class="fa-solid fa-check"></i>
            </button>
            <button onclick="taskStepScore('na')" style="width:56px; height:56px; border-radius:14px; border:1px solid #666; background:transparent; color:#888; cursor:pointer; font-size:0.7rem; font-weight:bold; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                N/A
            </button>
        </div>` : '';

    // Summary line for non-active steps (show counts)
    const summaryHtml = !isActive && total > 0 ? `
        <div style="display:flex; gap:8px; justify-content:center; font-size:0.75rem; margin-top:4px;">
            ${vCount > 0 ? `<span style="color:var(--success-color);">V:${vCount}</span>` : ''}
            ${isTD && pCount > 0 ? `<span style="color:var(--warning-color);">P:${pCount}</span>` : ''}
            ${!isTD && xCount > 0 ? `<span style="color:var(--danger-color);">X:${xCount}</span>` : ''}
            ${naCount > 0 ? `<span style="color:#888;">N/A:${naCount}</span>` : ''}
        </div>` : '';

    const totalSteps = (state._quadernoSteps || []).length;
    return `
    <div id="task-step-${idx}" style="display:flex; flex-direction:column; gap:4px; padding:12px 14px; margin-bottom:8px; ${activeBorder} border-radius:14px; transition:0.2s; ${activeGlow}">
        <div style="display:flex; align-items:center; gap:6px;">
            <div style="display:flex; flex-direction:column; gap:1px; flex-shrink:0;">
                <button onclick="moveQuadernoRow(${idx},-1)" style="width:22px; height:14px; border:none; background:transparent; color:${idx > 0 ? 'var(--text-secondary)' : '#333'}; cursor:${idx > 0 ? 'pointer' : 'default'}; font-size:0.55rem; display:flex; align-items:center; justify-content:center; padding:0;" ${idx === 0 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <span style="width:22px; height:22px; border-radius:50%; background:${isActive ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; color:${isActive ? 'white' : 'var(--text-secondary)'};">${idx + 1}</span>
                <button onclick="moveQuadernoRow(${idx},1)" style="width:22px; height:14px; border:none; background:transparent; color:${idx < totalSteps - 1 ? 'var(--text-secondary)' : '#333'}; cursor:${idx < totalSteps - 1 ? 'pointer' : 'default'}; font-size:0.55rem; display:flex; align-items:center; justify-content:center; padding:0;" ${idx >= totalSteps - 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <span onclick="renameQuadernoRow(${idx})" style="flex:1; font-size:1.05rem; font-weight:700; cursor:pointer;" title="Rinomina">${step.name}</span>
            ${lastIcon ? `<span style="font-size:1rem;">${lastIcon}</span>` : ''}
            ${scoredCount > 0 ? `<span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:bold;">${scoredCount}</span>` : ''}
            <button onclick="removeQuadernoRow(${idx})" style="width:28px; height:28px; border-radius:8px; border:none; background:transparent; color:#555; cursor:pointer; font-size:0.75rem; display:flex; align-items:center; justify-content:center;" title="Rimuovi">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        ${buttonsHtml}
        ${summaryHtml}
    </div>`;
}

// Score the current active task step and auto-advance
window.taskStepScore = (result) => {
    _syncQuadernoName();
    const steps = state._quadernoSteps;
    if (!steps || steps.length === 0) return;
    const idx = state._taskCurrentStep || 0;

    if (!steps[idx].results) steps[idx].results = [];
    steps[idx].results.push(result);

    // Advance to next step
    const nextIdx = idx + 1;
    if (nextIdx >= steps.length) {
        // Cycle complete - restart from first step
        state._taskCurrentStep = 0;
        state._taskCycleCount = (state._taskCycleCount || 0) + 1;
    } else {
        state._taskCurrentStep = nextIdx;
    }

    renderQuadernoTask(document.getElementById('quaderno-content'));
};

// Undo last scored task step (go back one)
window.undoLastTaskStep = () => {
    _syncQuadernoName();
    const steps = state._quadernoSteps;
    if (!steps || steps.length === 0) return;

    // Find the last step that has results by walking backwards from current position
    let currentStep = state._taskCurrentStep || 0;
    let cycleCount = state._taskCycleCount || 0;

    // The previous step is (currentStep - 1), wrapping to end of list
    let prevStep;
    if (currentStep === 0) {
        prevStep = steps.length - 1;
        if (cycleCount > 0) cycleCount--;
    } else {
        prevStep = currentStep - 1;
    }

    if (steps[prevStep].results && steps[prevStep].results.length > 0) {
        steps[prevStep].results.pop();
        state._taskCurrentStep = prevStep;
        state._taskCycleCount = cycleCount;
        renderQuadernoTask(document.getElementById('quaderno-content'));
    }
};

window.addQuadernoStep = () => {
    _syncQuadernoName();
    const input = document.getElementById('quaderno-new-step');
    const name = input.value.trim();
    if (!name) return;
    if (!state._quadernoSteps) state._quadernoSteps = [];
    state._quadernoSteps.push({ name, results: [] });
    input.value = '';
    renderQuadernoTask(document.getElementById('quaderno-content'));
};

// --- TASK ANALYSIS TD RING COUNTDOWN ---
(function() {
    let _taskTdTimerId = null;

    window._startTaskTDRing = () => {
        _stopTaskTDRing();
        if (typeof getSelectedSessionType !== 'function') return;
        if (getSelectedSessionType() !== 'timedelay') return;
        if (typeof _isTDTimerVisible === 'function' && !_isTDTimerVisible()) return;

        const activeStep = document.getElementById('task-step-' + (state._taskCurrentStep || 0));
        if (!activeStep) return;
        const ring = activeStep.querySelector('.task-td-ring');
        const progress = activeStep.querySelector('.task-td-ring-progress');
        if (!ring || !progress) return;

        const duration = (typeof getSelectedTDSeconds === 'function' ? getSelectedTDSeconds() : 5) * 1000;
        const circumference = 2 * Math.PI * 28;
        const startTime = performance.now();

        const tick = () => {
            const elapsed = performance.now() - startTime;
            const remaining = Math.max(0, 1 - elapsed / duration);
            progress.setAttribute('stroke-dashoffset', String(circumference * (1 - remaining)));
            if (remaining > 0) {
                _taskTdTimerId = requestAnimationFrame(tick);
            } else {
                _taskTdTimerId = null;
            }
        };
        _taskTdTimerId = requestAnimationFrame(tick);
    };

    function _stopTaskTDRing() {
        if (_taskTdTimerId) {
            cancelAnimationFrame(_taskTdTimerId);
            _taskTdTimerId = null;
        }
    }
})();
