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
                `<div class="custom-ac-item" data-value="${n.replace(/"/g, '&quot;')}">${escapeHtml(n)}</div>`
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
    else if (engine === 'ricorda') renderRicorda(items, stage);
    else if (engine === 'singolare_plurale') renderSingolarePlurale(items, stage);
    else if (engine === 'stroop_numerico') renderStroopNumerico(items, stage);
    else if (engine === 'go_nogo') renderGoNogo(items, stage);
    else if (engine === 'stroop_etichetta') renderStroopEtichetta(items, stage);
    else if (engine === 'topologia_comp') renderTopologiaComp(items, stage);
    else if (engine === 'memoria_lavoro') renderMemoriaLavoro(items, stage);
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
                <img src="${imgUrl(item)}"
                     class="${feedbackClass}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
                <div style="background:${showingScontorno(x) ? 'transparent' : 'white'}; border-radius:8px; padding:4px; display:flex; align-items:center; justify-content:center; min-height:0; min-width:0; overflow:hidden; ${showingScontorno(x) ? '' : 'box-shadow:0 2px 5px rgba(0,0,0,0.2);'}">
                    <img src="${imgUrl(x)}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="handleImgError(this,'${jsAttr(x.label)}')">
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
                <img src="${imgUrl(x)}"
                     class="ran-main-img ${showingScontorno(x) ? 'cutout' : ''} ${feedbackClass}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this,'${jsAttr(x.label)}')">
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
                    <img src="${imgUrl(current)}"
                         class="ran-main-img ${showingScontorno(current) ? 'cutout' : ''}"
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
    state.fluenzaItemLabels = {};
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

// New fluency round in the SAME session: reshuffle the cards, keep the timer
// duration and the running score, so the therapist can chain rounds and save
// once at the end (instead of the old "Riprova" that reset everything and
// re-served the identical, unshuffled deck).
window.fluenzaReplay = () => {
    const stage = document.getElementById('game-stage');
    if (state.session && state.session.active) {
        // Fold the finished round's cumulative totals into the carry baselines.
        state.session._carryV = state.session.correct || 0;
        state.session._carryX = state.session.incorrect || 0;
        state.session._carryT = state.session.total || 0;
        state.session._fluenzaDetailsCarry = (state.session._fluenzaDetailsCarry || [])
            .concat(state.session._fluenzaDetails || []);
    }
    // Reset the per-round state and RESHUFFLE (same timer duration & obiettivo).
    state.fluenzaDisplayItems = [...(state.fluenzaDisplayItems || [])].sort(() => Math.random() - 0.5);
    state.fluenzaIndex = -1;
    state.fluenzaCount = 0;
    state.fluenzaErrors = 0;
    state.fluenzaStarted = false;
    state.fluenzaFinished = false;
    state.fluenzaTimeLeft = state.fluenzaTimerDuration;
    state.fluenzaItemResults = {};
    state.fluenzaItemLabels = {};
    if (state.fluenzaTimerInterval) { clearInterval(state.fluenzaTimerInterval); state.fluenzaTimerInterval = null; }
    renderFluenzaUI(stage);
};

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
            <button class="btn btn-primary" onclick="fluenzaReplay()" style="margin-top:10px;">
                <i class="fa-solid fa-shuffle"></i> Nuovo giro (punteggio mantenuto)
            </button>
        </div>`;
        return;
    }

    // During game: show current image + timer + controls
    const currentItem = idx >= 0 && idx < items.length ? items[idx] : null;
    const currentResult = state.fluenzaItemResults[state.fluenzaCount];
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
            <button class="btn-icon" onclick="state.fluenzaHideLabels=!state.fluenzaHideLabels; renderFluenzaUI(document.getElementById('game-stage'));"
                    title="Mostra/Nascondi etichette (E)"
                    style="width:30px; height:30px; font-size:0.7rem; ${state.fluenzaHideLabels ? 'opacity:0.4;' : ''}">
                <i class="fa-solid fa-font"></i>
            </button>
        </div>

        <!-- Image area -->
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; overflow:hidden;">
            ${currentItem ? `
                <img src="${imgUrl(currentItem)}"
                     class="ran-main-img ${currentResult === false ? 'feedback-fail' : currentResult === true ? 'feedback-success' : ''}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this,'${currentItem.label}')">
                ${!state.fluenzaHideLabels ? `<h2 style="text-align:center; margin-top:10px;">${currentItem.label}</h2>` : ''}
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

    // Mark current as correct if not already marked.
    // Keyed by the running counter (not the deck index): after the deck wraps,
    // index keys repeat and lap-1 results blocked lap-2 error marking.
    if (state.fluenzaItemResults[state.fluenzaCount] === undefined) {
        state.fluenzaItemResults[state.fluenzaCount] = true;
        if (!state.fluenzaItemLabels) state.fluenzaItemLabels = {};
        state.fluenzaItemLabels[state.fluenzaCount] = state.fluenzaDisplayItems?.[state.fluenzaIndex]?.label || '';
    }

    // Advance to next item
    state.fluenzaIndex++;
    state.fluenzaCount++;

    // If we've exhausted all items, reshuffle and wrap around
    if (state.fluenzaIndex >= items.length) {
        state.fluenzaDisplayItems = [...items].sort(() => Math.random() - 0.5);
        state.fluenzaIndex = 0;
    }

    renderFluenzaUI(document.getElementById('game-stage'));
};

window.fluenzaMarkError = () => {
    if (state.fluenzaFinished || !state.fluenzaStarted) return;
    if (state.fluenzaIndex < 0) return;
    if (state.fluenzaItemResults[state.fluenzaCount] !== undefined) return;

    state.fluenzaItemResults[state.fluenzaCount] = false;
    if (!state.fluenzaItemLabels) state.fluenzaItemLabels = {};
    state.fluenzaItemLabels[state.fluenzaCount] = state.fluenzaDisplayItems?.[state.fluenzaIndex]?.label || '';
    state.fluenzaErrors++;

    // Update session
    if (state.session.active) {
        state.session.incorrect = (state.session._carryX || 0) + state.fluenzaErrors;
        state.session.correct = (state.session._carryV || 0) + state.fluenzaCount - state.fluenzaErrors;
        state.session.total = (state.session._carryT || 0) + state.fluenzaCount;
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
    if (state.fluenzaIndex >= 0 && state.fluenzaItemResults[state.fluenzaCount] === undefined) {
        state.fluenzaCount--;
    }

    const correct = state.fluenzaCount - state.fluenzaErrors;

    // Update session for saving
    if (state.session.active) {
        state.session.correct = (state.session._carryV || 0) + correct;
        state.session.incorrect = (state.session._carryX || 0) + state.fluenzaErrors;
        state.session.total = (state.session._carryT || 0) + state.fluenzaCount;
        // Keep carried previous-round results (r<N>_ keys), wipe only current
        Object.keys(state.session.itemResults).forEach(k => { if (!/^r\d+_/.test(k)) delete state.session.itemResults[k]; });
        // Store item results for per-item detail; labels are recorded at mark
        // time (counter keys are NOT deck indexes, so the generic playItems[idx]
        // mapping in the save path must not be used for fluenza).
        state.session._fluenzaDetails = (state.session._fluenzaDetailsCarry || []).slice();
        for (const [k, v] of Object.entries(state.fluenzaItemResults)) {
            state.session.itemResults[k] = v;
            const lbl = state.fluenzaItemLabels?.[k];
            if (lbl) state.session._fluenzaDetails.push({ label: lbl, result: v });
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
                         onclick="handleMatchClick(${idx}, '${jsAttr(item.label)}')"
                         style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                        <img src="${imgUrl(item)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                             onerror="handleImgError(this, '${jsAttr(item.label)}')">
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function getDeckHtml() {
    if (state.deck.length === 0) return `<span style="font-weight:bold;">FINITO!</span> <button class="btn btn-sm btn-primary" onclick="replayRound()" style="padding:4px 12px; margin-left:8px;"><i class="fa-solid fa-shuffle"></i> Nuovo giro</button>`;
    const c = state.deck[0];
    return `<img src="${imgUrl(c)}" style="width:40px; height:40px; object-fit:contain;"> <span style="color:#333; font-weight:bold; padding-right:10px;">${c.label}</span>`;
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
    const totalPairs = useItems.length;
    state.memory = {
        flipped: [],
        matched: [],
        deck: deck,
        lockBoard: false,
        cardFlips: new Array(deck.length).fill(0),
        matches: 0,
        memoryErrors: 0,
        discoveries: 0,
        pairAttempts: 0,
        startTime: null,
        endTime: null,
        pairDetails: {},
        totalPairs: totalPairs,
        completed: false
    };
    const cols = Math.ceil(Math.sqrt(deck.length));
    const rows = Math.ceil(deck.length / cols);

    stage.innerHTML = `
        <div style="display:flex; height:100%; flex-direction:column;">
            <div id="mem-stats-bar" style="padding:8px 12px; background:rgba(0,0,0,0.2); display:flex; gap:14px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap; font-size:0.8rem;">
                <span><i class="fa-solid fa-clone" style="color:var(--accent-color);"></i> <b id="mem-stat-matches">0</b>/${totalPairs}</span>
                <span style="color:var(--text-secondary);"><i class="fa-solid fa-hand-pointer"></i> Tentativi: <b id="mem-stat-attempts">0</b></span>
                <span style="color:var(--danger-color);"><i class="fa-solid fa-x"></i> Errori: <b id="mem-stat-errors">0</b></span>
                <span style="color:var(--success-color);"><i class="fa-solid fa-gauge-high"></i> Eff: <b id="mem-stat-eff">&mdash;</b></span>
                <span style="color:var(--text-secondary);"><i class="fa-solid fa-stopwatch"></i> <b id="mem-stat-time">0:00</b></span>
            </div>
            <div style="flex:1; min-height:0; padding:10px; display:grid;
                        grid-template-columns:repeat(${cols}, 1fr);
                        grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                        gap:10px; overflow-y:auto;">
                ${deck.map((item, idx) => `
                    <div class="card-grid" id="mem-${idx}" onclick="flipCard(${idx})"
                         style="background:var(--accent-color); aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                        <div class="mem-content" style="display:none; width:100%; height:100%;">
                            <img src="${imgUrl(item)}"
                                 style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; background:white; border-radius:6px;"
                                 onerror="handleImgError(this, '${jsAttr(item.label)}')">
                        </div>
                        <i class="fa-solid fa-question icon-back" style="color:white; font-size:2rem;"></i>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function _memUpdateStats() {
    const m = state.memory;
    if (!m) return;
    const matchesEl = document.getElementById('mem-stat-matches');
    const attemptsEl = document.getElementById('mem-stat-attempts');
    const errorsEl = document.getElementById('mem-stat-errors');
    const effEl = document.getElementById('mem-stat-eff');
    const timeEl = document.getElementById('mem-stat-time');
    if (matchesEl) matchesEl.textContent = String(m.matches);
    if (attemptsEl) attemptsEl.textContent = String(m.pairAttempts);
    if (errorsEl) errorsEl.textContent = String(m.memoryErrors);
    const scored = m.matches + m.memoryErrors;
    if (effEl) effEl.textContent = scored > 0 ? Math.round((m.matches / scored) * 100) + '%' : '—';
    if (timeEl && m.startTime) {
        const elapsed = Math.floor(((m.endTime || Date.now()) - m.startTime) / 1000);
        const mm = Math.floor(elapsed / 60);
        const ss = (elapsed % 60).toString().padStart(2, '0');
        timeEl.textContent = `${mm}:${ss}`;
    }

    // Mirror into session state so updateScoreUI / save works seamlessly
    if (state.session) {
        // Additive with any carried previous rounds (replayRound)
        state.session.correct = (state.session._carryV || 0) + m.matches;
        state.session.incorrect = (state.session._carryX || 0) + m.memoryErrors;
        state.session.total = (state.session._carryT || 0) + m.matches + m.memoryErrors;
        if (typeof updateScoreUI === 'function') updateScoreUI();
    }
}

// Update timer once per second while the game is running
if (!window._memTimerId) {
    window._memTimerId = setInterval(() => {
        const m = state.memory;
        if (!m || !m.startTime || m.completed) return;
        const timeEl = document.getElementById('mem-stat-time');
        if (!timeEl) return;
        const elapsed = Math.floor((Date.now() - m.startTime) / 1000);
        const mm = Math.floor(elapsed / 60);
        const ss = (elapsed % 60).toString().padStart(2, '0');
        timeEl.textContent = `${mm}:${ss}`;
    }, 1000);
}

function _memShowSummary() {
    const m = state.memory;
    if (!m) return;
    const stage = document.getElementById('game-stage');
    if (!stage) return;
    const elapsed = Math.floor((m.endTime - m.startTime) / 1000);
    const mm = Math.floor(elapsed / 60);
    const ss = (elapsed % 60).toString().padStart(2, '0');
    const scored = m.matches + m.memoryErrors;
    const eff = scored > 0 ? Math.round((m.matches / scored) * 100) : 0;

    // Pair details sorted by attempts (hardest first)
    const pairList = Object.entries(m.pairDetails)
        .sort((a, b) => b[1].attempts - a[1].attempts)
        .map(([label, d]) => `<tr>
            <td style="padding:4px 8px; text-align:left;">${label}</td>
            <td style="padding:4px 8px; text-align:center;">${d.attempts}</td>
            <td style="padding:4px 8px; text-align:center; color:${d.attempts === 1 ? 'var(--success-color)' : (d.attempts <= 2 ? 'var(--text-secondary)' : 'var(--danger-color)')};">${d.attempts === 1 ? '✓' : (d.attempts - 1)}</td>
        </tr>`).join('');

    stage.innerHTML = `
        <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;">
            <i class="fa-solid fa-trophy fa-3x" style="color:var(--warning-color); margin-bottom:12px;"></i>
            <h2 style="margin:0 0 6px 0; color:var(--success-color);">Sessione completata!</h2>
            <p style="color:var(--text-secondary); margin:0 0 18px 0;">Salva per registrare i risultati.</p>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; width:100%; max-width:500px; margin-bottom:18px;">
                <div style="background:rgba(var(--accent-rgb),0.1); border:1px solid rgba(var(--accent-rgb),0.3); border-radius:var(--radius-md); padding:10px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Coppie</div>
                    <div style="font-size:1.5rem; font-weight:bold;">${m.matches}/${m.totalPairs}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:var(--radius-md); padding:10px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Tentativi</div>
                    <div style="font-size:1.5rem; font-weight:bold;">${m.pairAttempts}</div>
                </div>
                <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:10px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Errori</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--danger-color);">${m.memoryErrors}</div>
                </div>
                <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-md); padding:10px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Efficienza</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--success-color);">${eff}%</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:var(--radius-md); padding:10px; text-align:center;">
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">Tempo</div>
                    <div style="font-size:1.5rem; font-weight:bold;">${mm}:${ss}</div>
                </div>
            </div>
            <button class="btn btn-primary" onclick="replayRound()" style="margin-bottom:16px; padding:12px 24px;"><i class="fa-solid fa-shuffle"></i> Nuovo giro (punteggio mantenuto)</button>
            ${pairList ? `<div style="width:100%; max-width:500px;">
                <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:6px; padding:0 8px;">Dettaglio coppie</div>
                <table style="width:100%; border-collapse:collapse; background:rgba(255,255,255,0.03); border-radius:var(--radius-md); overflow:hidden; font-size:0.85rem;">
                    <thead style="background:rgba(0,0,0,0.2); color:var(--text-secondary); font-size:0.7rem; text-transform:uppercase;">
                        <tr>
                            <th style="padding:6px 8px; text-align:left;">Coppia</th>
                            <th style="padding:6px 8px; text-align:center;">Tentativi</th>
                            <th style="padding:6px 8px; text-align:center;">Errori</th>
                        </tr>
                    </thead>
                    <tbody>${pairList}</tbody>
                </table>
            </div>` : ''}
        </div>`;
}

window.flipCard = (idx) => {
    if (state.memory.lockBoard || state.memory.flipped.includes(idx) || state.memory.matched.includes(idx)) return;
    const m = state.memory;
    if (m.completed) return;

    // Start timer on first flip
    if (!m.startTime) m.startTime = Date.now();

    const card = document.getElementById(`mem-${idx}`);
    card.querySelector('.mem-content').style.display = 'block';
    card.querySelector('.icon-back').style.display = 'none';
    card.style.background = 'white';
    m.flipped.push(idx);
    m.cardFlips[idx]++;

    if (m.flipped.length === 2) {
        m.lockBoard = true;
        const [i1, i2] = m.flipped;
        m.pairAttempts++;

        const label1 = m.deck[i1].label;
        const label2 = m.deck[i2].label;
        const wasSeen1 = m.cardFlips[i1] > 1;
        const wasSeen2 = m.cardFlips[i2] > 1;

        // Track per-pair attempts for both labels involved
        [label1, label2].forEach(lbl => {
            if (!m.pairDetails[lbl]) m.pairDetails[lbl] = { attempts: 0, matched: false };
            if (!m.pairDetails[lbl].matched) m.pairDetails[lbl].attempts++;
        });

        if (label1 === label2) {
            // MATCH
            m.matches++;
            m.matched.push(i1, i2);
            m.flipped = [];
            m.lockBoard = false;
            document.getElementById(`mem-${i1}`).classList.add('matched');
            document.getElementById(`mem-${i2}`).classList.add('matched');
            if (m.pairDetails[label1]) m.pairDetails[label1].matched = true;

            // Game complete?
            if (m.matched.length === m.deck.length) {
                m.completed = true;
                m.endTime = Date.now();
                _memUpdateStats();
                if (typeof showSessionNameInput === 'function') showSessionNameInput();
                document.getElementById('btn-save-session').classList.remove('hidden');
                setTimeout(_memShowSummary, 600);
                return;
            }
            _memUpdateStats();
        } else {
            // NO MATCH
            if (wasSeen1 || wasSeen2) {
                m.memoryErrors++;
            } else {
                m.discoveries++;
            }
            _memUpdateStats();
            setTimeout(() => {
                [i1, i2].forEach(i => {
                    const c = document.getElementById(`mem-${i}`);
                    c.querySelector('.mem-content').style.display = 'none';
                    c.querySelector('.icon-back').style.display = 'block';
                    c.style.background = 'var(--accent-color)';
                });
                m.flipped = [];
                m.lockBoard = false;
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
                    <img src="${imgUrl(item)}"
                         style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                         onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
            <button class="btn btn-sm btn-ghost" onclick="skipIntrusoRound()" style="padding:3px 10px; font-size:0.7rem;" title="Salta round (S)">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${round.cards.map((card, idx) => `
                <div class="card-grid" id="intruso-${idx}"
                     onclick="handleIntrusoClick(${idx})"
                     style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden; cursor:pointer; transition:0.3s;">
                    <img src="${imgUrl(card)}"
                         style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                         onerror="handleImgError(this, '${card.label}')">
                </div>
            `).join('')}
        </div>
    </div>`;
}

window.handleIntrusoClick = (idx) => {
    if (!state.session.active) return;
    if (state._intrusoAdvancing) return;
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
    state._intrusoAdvancing = true;
    setTimeout(() => {
        state._intrusoAdvancing = false;
        state._autoScoreErrored = false;
        state.intrusoRound++;
        const nextRound = generateIntrusoRound(state.selectedPoolTags, state.intrusoCardsPerRound);
        if (nextRound) {
            showIntrusoRound(document.getElementById('game-stage'), nextRound);
        }
    }, 1200);
};

window.skipIntrusoRound = () => {
    if (state._intrusoAdvancing) return;
    state._intrusoAdvancing = true;
    state._autoScoreErrored = false;
    setTimeout(() => {
        state._intrusoAdvancing = false;
        state.intrusoRound++;
        const nextRound = generateIntrusoRound(state.selectedPoolTags, state.intrusoCardsPerRound);
        if (nextRound) showIntrusoRound(document.getElementById('game-stage'), nextRound);
    }, 300);
};

// --- TOPOLOGIA (Drag & Drop) ---
function renderTopologia(items, stage) {
    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-up-down-left-right"></i> Topologia
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Trascina per disporre &middot; doppio tocco = grande/piccolo</span>
            <button class="btn btn-sm btn-ghost" onclick="shuffleTopologia()" style="padding:4px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-shuffle"></i> Mescola
            </button>
            <button class="btn btn-sm btn-ghost" onclick="topoCycleCategory()" style="padding:4px 10px; font-size:0.75rem;" title="Suggerisce una categoria su cui lavorare (tocca per cambiarla)">
                <i class="fa-solid fa-shapes"></i> Categoria
            </button>
            <span id="topo-cat-badge" style="font-size:0.78rem; font-weight:600; color:var(--warning-color);"></span>
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
            el.dataset.baseW = itemW;
            el.dataset.scale = '1';
            el.style.cssText = `position:absolute; left:${left}px; top:${top}px; width:${itemW}px; height:${itemH}px;
                background:white; border-radius:12px; padding:4px; cursor:grab; touch-action:none;
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                box-shadow:0 4px 15px rgba(0,0,0,0.3); z-index:1; user-select:none; transition:box-shadow 0.2s;`;

            const img = document.createElement('img');
            img.src = imgUrl(item);
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
    let startX = 0, startY = 0, movedFar = false;
    let lastTapEl = null, lastTapTime = 0;

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
        startX = pos.x; startY = pos.y; movedFar = false;
        const r = el.getBoundingClientRect();
        offsetX = pos.x - r.left;
        offsetY = pos.y - r.top;
    };

    const onMove = (e) => {
        if (!activeEl) return;
        e.preventDefault();
        const pos = getPos(e);
        if (Math.abs(pos.x - startX) > 8 || Math.abs(pos.y - startY) > 8) movedFar = true;
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
            const el = activeEl;
            el.style.zIndex = '1';
            el.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
            el.style.cursor = 'grab';
            activeEl = null;
            // Double-tap (two clean taps within 350ms) cycles the card size:
            // normale -> grande -> piccolo -> normale.
            if (!movedFar) {
                const now = Date.now();
                if (lastTapEl === el && now - lastTapTime < 350) {
                    _topoCycleSize(el, canvas);
                    lastTapEl = null;
                } else {
                    lastTapEl = el; lastTapTime = now;
                }
            } else {
                lastTapEl = null;
            }
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

function _topoCycleSize(el, canvas) {
    const scales = [1, 1.5, 0.6];
    const cur = parseFloat(el.dataset.scale) || 1;
    const next = scales[(scales.indexOf(cur) + 1) % scales.length];
    el.dataset.scale = String(next);
    const base = parseFloat(el.dataset.baseW) || el.offsetWidth;
    const oldW = el.offsetWidth;
    const newW = Math.round(base * next);
    // keep the card centred where it was, clamped inside the canvas
    const cr = canvas.getBoundingClientRect();
    const left = Math.max(0, Math.min(cr.width - newW, el.offsetLeft + (oldW - newW) / 2));
    const top = Math.max(0, Math.min(cr.height - newW, el.offsetTop + (oldW - newW) / 2));
    el.style.transition = 'width 0.2s, height 0.2s, left 0.2s, top 0.2s, box-shadow 0.2s';
    el.style.width = newW + 'px';
    el.style.height = newW + 'px';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    setTimeout(() => { el.style.transition = 'box-shadow 0.2s'; }, 250);
}

window.topoCycleCategory = () => {
    const keys = Object.keys(TOPO_CATEGORIES);
    let i = (typeof state._topoCatIdx === 'number') ? state._topoCatIdx : -1;
    i = i >= keys.length - 1 ? -1 : i + 1; // ...ultima -> spento -> prima...
    state._topoCatIdx = i;
    const badge = document.getElementById('topo-cat-badge');
    if (!badge) return;
    if (i < 0) { badge.innerHTML = ''; return; }
    const c = TOPO_CATEGORIES[keys[i]];
    badge.innerHTML = `<i class="fa-solid ${c.icon}"></i> ${c.pair}`;
};

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
                    <img src="${imgUrl(card)}" style="width:100px; height:100px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${card.label}')">
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
                            <img src="${imgUrl(placedItem)}" style="width:100px; height:100px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${placedItem.label}')">
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
            if (typeof filterSetsByMode === 'function') filterSetsByMode();
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
                        <img src="${imgUrl(item)}" style="width:120px; height:120px; object-fit:contain; border-radius:10px;" draggable="false" onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
        ghost.innerHTML = `<img src="${imgUrl(item)}" style="width:90px; height:90px; object-fit:contain; border-radius:10px;" draggable="false"><span style="font-weight:bold; font-size:0.75rem; color:#333; text-align:center; line-height:1.1;">${item.label}</span>`;
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
                <button class="btn btn-primary" onclick="replayRound()" style="margin-top:14px; padding:12px 24px;"><i class="fa-solid fa-shuffle"></i> Nuovo giro</button>
                <p style="color:var(--text-secondary); font-size:0.72rem; margin-top:6px;">Rimescola gli item mantenendo il punteggio della sessione.</p>
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
            <button class="btn btn-sm btn-ghost" onclick="skipCatRound()" style="padding:3px 10px; font-size:0.7rem;" title="Salta (S)">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:15px; min-height:0;">
            <div id="cat-card" style="background:white; border-radius:16px; padding:10px; max-width:300px; width:100%; max-height:55%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); transition:0.3s;">
                <img src="${imgUrl(item)}"
                     style="max-width:100%; max-height:85%; object-fit:contain; border-radius:8px;"
                     onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
    if (state._catAdvancing) return;
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

    state._catAdvancing = true;
    setTimeout(() => {
        state._catAdvancing = false;
        // In TD mode, don't advance on wrong answer
        if (isCorrect || !isTimedelay) {
            state.catIndex++;
            state._autoScoreErrored = false;
        }
        showCategorizzazioneItem(document.getElementById('game-stage'));
    }, 800);
};

window.skipCatRound = () => {
    if (state._catAdvancing) return;
    state._catAdvancing = true;
    state._autoScoreErrored = false;
    setTimeout(() => {
        state._catAdvancing = false;
        state.catIndex++;
        showCategorizzazioneItem(document.getElementById('game-stage'));
    }, 300);
};

// --- SEARCH & FIND ---
function renderSearchFind(items, stage) {
    // Initialize variant index if not set
    if (state._sfVariantIndex === undefined || state._sfVariantIndex === null) state._sfVariantIndex = 0;
    if (state._sfVariantIndex >= items.length) state._sfVariantIndex = 0;

    const idx = state._sfVariantIndex;
    const s = items[idx];
    const total = items.length;
    const isFs = document.querySelector('.app-shell')?.classList.contains('game-fullscreen');

    // Navigation arrows (only if multiple items and NOT in fullscreen)
    const navHtml = (total > 1 && !isFs) ? `
        <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn btn-sm" onclick="sfPrevVariant()" style="padding:4px 8px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.08); color:${idx === 0 ? '#555' : 'white'}; border-radius:6px; cursor:${idx === 0 ? 'default' : 'pointer'};" ${idx === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap;">Img ${idx + 1} / ${total}</span>
            <button class="btn btn-sm" onclick="sfNextVariant()" style="padding:4px 8px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.08); color:${idx >= total - 1 ? '#555' : 'white'}; border-radius:6px; cursor:${idx >= total - 1 ? 'default' : 'pointer'};" ${idx >= total - 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>` : (total > 1 && isFs ? `<span style="font-size:0.65rem; color:var(--text-secondary);">${idx + 1}/${total}</span>` : '');

    stage.innerHTML = `
        <div class="search-find-container">
            <div class="sf-toolbar">
                <span style="color:white;font-weight:bold;">${s.label}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${navHtml}
                    <button class="btn btn-sm btn-danger" onclick="clearMarkers()"><i class="fa-solid fa-eraser"></i> Pulisci</button>
                </div>
            </div>
            <div class="sf-viewport" id="sf-viewport">
                <img src="${imgUrl(s)}" class="sf-image" onerror="handleImgError(this,'${s.label}')">
            </div>
        </div>`;
    setupSearchFindTouch();
}

// Variant navigation for search_find / intraverbal_scenari
window.sfNextVariant = () => {
    const items = state.session.playItems || state.items.filter(i => !i.hidden);
    if (!items || items.length <= 1) return;
    if (state._sfVariantIndex < items.length - 1) {
        // Clear markers on variant change
        clearMarkers();
        state._sfVariantIndex++;
        const mode = document.getElementById('mode-select').value;
        renderGameMode(mode, items);
    }
};

window.sfPrevVariant = () => {
    const items = state.session.playItems || state.items.filter(i => !i.hidden);
    if (!items || items.length <= 1) return;
    if (state._sfVariantIndex > 0) {
        // Clear markers on variant change
        clearMarkers();
        state._sfVariantIndex--;
        const mode = document.getElementById('mode-select').value;
        renderGameMode(mode, items);
    }
};

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

    if (removedId !== null && removedId !== undefined && state.session.itemResults[removedId] !== undefined) {
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
                         onclick="handleAudioMatchClick(${idx}, '${jsAttr(item.label)}')"
                         style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:hidden;">
                        <img src="${imgUrl(item)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                             onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
        if (remaining) {
            if (state.deck.length > 0) remaining.textContent = state.deck.length + ' rimasti';
            else remaining.innerHTML = `<b>FINITO!</b> <button class="btn btn-sm btn-primary" onclick="replayRound()" style="padding:3px 10px; margin-left:6px;"><i class="fa-solid fa-shuffle"></i> Nuovo giro</button>`;
        }
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
                <button class="btn btn-primary" onclick="replayRound()" style="margin-top:14px; padding:12px 24px;"><i class="fa-solid fa-shuffle"></i> Nuovo giro</button>
                <p style="color:var(--text-secondary); font-size:0.72rem; margin-top:6px;">Rimescola gli item mantenendo il punteggio della sessione.</p>
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
                <img id="zoom-img" src="${item.url}" style="display:block; width:100%; height:auto; transform-origin:${area.x + area.w / 2}% ${area.y + area.h / 2}%; transform:scale(${Math.round(100 / area.w * 2.5)}); transition:transform 0.8s ease;" onerror="handleImgError(this, '${jsAttr(item.label)}')">
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
// --- RICORDA (Cards face-up, then flipped, child guesses) ---
// ============================================================

function renderRicorda(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-brain fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Assicurati che i set abbiano immagini e tag assegnati.</p>
            </div>`;
        return;
    }

    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 0;
    const cardCount = numStimuli > 0 ? Math.min(numStimuli, items.length) : Math.min(6, items.length);
    const cards = items.slice(0, cardCount);

    // Store state for scoring
    state._ricordaCards = cards;
    state._ricordaFlipped = false;
    state._ricordaRevealed = {};
    state._ricordaScoreLog = [];
    state._ricordaLastRevealed = null;
    state.session.playItems = cards;

    _showRicordaBoard(stage, cards, false);
}

function _showRicordaBoard(stage, cards, flipped) {
    const cols = cards.length <= 2 ? cards.length : Math.ceil(Math.sqrt(cards.length));
    const rows = Math.ceil(cards.length / cols);
    const revealed = state._ricordaRevealed || {};
    const scoreLog = state._ricordaScoreLog || [];
    const uniqueScored = new Set(scoreLog.map(e => e.idx));
    const allScored = uniqueScored.size === cards.length;
    const lastRevealed = state._ricordaLastRevealed;

    // Toolbar
    let toolbarHtml;
    if (!flipped) {
        toolbarHtml = `
            <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
                <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                    <i class="fa-solid fa-brain"></i> Ricorda - Memorizza!
                </span>
                <span style="color:var(--text-secondary); font-size:0.75rem;">${cards.length} carte</span>
                <div style="display:flex; align-items:center; gap:4px;">
                    <input type="number" id="ricorda-timer-sec" value="${state._ricordaTimerSec || 5}" min="1" max="60"
                           style="width:50px; padding:4px 6px; border-radius:8px; background:rgba(255,255,255,0.1); border:1px solid var(--glass-border); color:white; font-size:0.8rem; text-align:center;"
                           onchange="state._ricordaTimerSec = parseInt(this.value) || 5">
                    <span style="font-size:0.7rem; color:var(--text-secondary);">sec</span>
                </div>
                <button class="btn btn-sm" onclick="ricordaStartTimer()" id="ricorda-timer-btn" style="padding:4px 12px; font-size:0.75rem; background:rgba(139,92,246,0.3); color:#a78bfa; border:1px solid rgba(139,92,246,0.4);">
                    <i class="fa-solid fa-clock"></i> <span id="ricorda-countdown">Timer</span>
                </button>
                <button class="btn btn-sm btn-primary" onclick="ricordaFlipAll()" style="padding:4px 14px; font-size:0.8rem;">
                    <i class="fa-solid fa-rotate"></i> Gira
                </button>
            </div>`;
    } else {
        const scoredCount = uniqueScored.size;
        toolbarHtml = `
            <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
                <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                    <i class="fa-solid fa-brain"></i> Ricorda - Indovina!
                </span>
                <span style="color:var(--text-secondary); font-size:0.75rem;">${scoredCount}/${cards.length}</span>
                ${lastRevealed !== null ? `<span style="font-size:0.7rem; color:var(--accent-color);">Tocca V / X / P per assegnare</span>` : ''}
                ${allScored ? `<button class="btn btn-sm btn-primary" onclick="ricordaNewRound()" style="padding:4px 14px; font-size:0.8rem;">
                    <i class="fa-solid fa-forward"></i> Nuovo Round
                </button>` : ''}
            </div>`;
    }

    // Card back design - decorative pattern using theme colors
    const cardBackHtml = `
        <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;
                    background: linear-gradient(135deg, var(--accent-color) 0%, color-mix(in srgb, var(--accent-color) 70%, #1e1e2f) 100%);
                    border-radius:10px; position:relative; overflow:hidden;">
            <div style="position:absolute; inset:6px; border-radius:8px; border:2px solid rgba(255,255,255,0.2);"></div>
            <div style="position:absolute; inset:10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.12);"></div>
            <div style="position:absolute; top:8px; left:8px; font-size:0.6rem; opacity:0.3; color:white;">
                <i class="fa-solid fa-star"></i>
            </div>
            <div style="position:absolute; bottom:8px; right:8px; font-size:0.6rem; opacity:0.3; color:white;">
                <i class="fa-solid fa-star"></i>
            </div>
            <div style="position:absolute; top:8px; right:8px; font-size:0.6rem; opacity:0.3; color:white;">
                <i class="fa-solid fa-diamond"></i>
            </div>
            <div style="position:absolute; bottom:8px; left:8px; font-size:0.6rem; opacity:0.3; color:white;">
                <i class="fa-solid fa-diamond"></i>
            </div>
            <i class="fa-solid fa-brain" style="color:rgba(255,255,255,0.35); font-size:2.2rem; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.3));"></i>
        </div>`;

    // Cards grid with 3D flip
    const cardsHtml = cards.map((item, idx) => {
        const isRevealed = revealed[idx];
        const isLastRevealed = (lastRevealed === idx);
        const showFront = !flipped || isRevealed;

        let highlight = '';
        if (flipped && isLastRevealed) {
            highlight = 'box-shadow: 0 0 16px rgba(139,92,246,0.6);';
        }

        return `
            <div class="ricorda-card-wrapper" id="ricorda-card-${idx}"
                 ${flipped && !isRevealed ? `onclick="ricordaReveal(${idx})"` : ''}
                 style="perspective:800px; cursor:${flipped && !isRevealed ? 'pointer' : 'default'}; min-height:0; min-width:0; ${highlight}; border-radius:12px;">
                <div class="ricorda-card-inner" style="
                    position:relative; width:100%; height:100%; transition:transform 0.5s ease;
                    transform-style:preserve-3d;
                    transform:${showFront ? 'rotateY(0deg)' : 'rotateY(180deg)'};
                ">
                    <!-- Front: image -->
                    <div style="position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden;
                                background:white; border-radius:12px; padding:5px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        <img src="${imgUrl(item)}"
                             style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:6px;"
                             onerror="handleImgError(this, '${(item.label || '').replace(/'/g, "\\'")}')">
                    </div>
                    <!-- Back: decorative -->
                    <div style="position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden;
                                transform:rotateY(180deg); border-radius:12px; overflow:hidden;">
                        ${cardBackHtml}
                    </div>
                </div>
            </div>`;
    }).join('');

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        ${toolbarHtml}
        <div style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${cardsHtml}
        </div>
    </div>`;
}

// Flip all cards face-down
window.ricordaFlipAll = () => {
    if (state._ricordaTimerInterval) {
        clearInterval(state._ricordaTimerInterval);
        state._ricordaTimerInterval = null;
    }
    state._ricordaFlipped = true;
    state._ricordaRevealed = {};
    state._ricordaLastRevealed = null;
    state._ricordaScoreLog = [];

    // Animate: flip each card with a slight stagger
    const cards = state._ricordaCards;
    _showRicordaBoard(document.getElementById('game-stage'), cards, true);
};

// Start independent auto-timer (separate from TD timer)
window.ricordaStartTimer = () => {
    if (state._ricordaTimerInterval) {
        clearInterval(state._ricordaTimerInterval);
        state._ricordaTimerInterval = null;
    }
    const seconds = parseInt(document.getElementById('ricorda-timer-sec')?.value) || state._ricordaTimerSec || 5;
    state._ricordaTimerSec = seconds;
    let remaining = seconds;
    const el = document.getElementById('ricorda-countdown');
    if (el) el.textContent = remaining + 's';
    const btn = document.getElementById('ricorda-timer-btn');
    if (btn) btn.style.background = 'rgba(139,92,246,0.6)';

    state._ricordaTimerInterval = setInterval(() => {
        remaining--;
        const el2 = document.getElementById('ricorda-countdown');
        if (el2) el2.textContent = remaining + 's';
        if (remaining <= 0) {
            clearInterval(state._ricordaTimerInterval);
            state._ricordaTimerInterval = null;
            window.ricordaFlipAll();
        }
    }, 1000);
};

// Reveal a single card (tap in flipped phase) — can re-reveal already scored cards
window.ricordaReveal = (idx) => {
    if (!state._ricordaFlipped) return;
    if (state._ricordaRevealed[idx]) return;
    state._ricordaRevealed[idx] = true;
    state._ricordaLastRevealed = idx;

    // Animate just this card flipping via DOM (smoother than full re-render)
    const card = document.getElementById('ricorda-card-' + idx);
    if (card) {
        const inner = card.querySelector('.ricorda-card-inner');
        if (inner) inner.style.transform = 'rotateY(0deg)';
        card.style.boxShadow = '0 0 16px rgba(139,92,246,0.6)';
        card.onclick = null;
        card.style.cursor = 'default';
    }

    // Start TD countdown for the scoring buttons (if in time delay mode)
    if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
};

// Called from recordResponse() in app.js — score the last revealed card, then flip it back
window._ricordaHandleScore = (result) => {
    const idx = state._ricordaLastRevealed;
    if (idx === null || idx === undefined) return;

    // Log every score event (a card can be scored multiple times)
    if (!state._ricordaScoreLog) state._ricordaScoreLog = [];
    state._ricordaScoreLog.push({ idx, result });

    // Visual feedback: brief color flash on the card
    const card = document.getElementById('ricorda-card-' + idx);
    if (card) {
        const color = result === true ? 'var(--success-color)' : result === 'prompt' ? 'var(--warning-color)' : 'var(--danger-color)';
        card.style.boxShadow = '0 0 20px ' + color;
    }

    // After a brief delay, flip the card back face-down
    setTimeout(() => {
        delete state._ricordaRevealed[idx];
        state._ricordaLastRevealed = null;

        // Animate the flip back via DOM
        if (card) {
            const inner = card.querySelector('.ricorda-card-inner');
            if (inner) inner.style.transform = 'rotateY(180deg)';
            card.style.boxShadow = 'none';
            // Re-enable click after animation completes
            setTimeout(() => {
                card.onclick = () => window.ricordaReveal(idx);
                card.style.cursor = 'pointer';
            }, 500);
        }

        // Check if every card has been scored at least once
        const uniqueScored = new Set(state._ricordaScoreLog.map(e => e.idx));
        if (uniqueScored.size === state._ricordaCards.length) {
            document.getElementById('btn-save-session').classList.remove('hidden');
            if (typeof showSessionNameInput === 'function') showSessionNameInput();
            // Update toolbar to show Nuovo Round button
            _showRicordaBoard(document.getElementById('game-stage'), state._ricordaCards, true);
        }
    }, 600);
};

// New round: reshuffle and show new cards face-up
window.ricordaNewRound = () => {
    if (state._ricordaTimerInterval) {
        clearInterval(state._ricordaTimerInterval);
        state._ricordaTimerInterval = null;
    }
    let poolItems = getItemsByTags(state.selectedPoolTags);
    poolItems.sort(() => Math.random() - 0.5);
    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 0;
    const cardCount = numStimuli > 0 ? Math.min(numStimuli, poolItems.length) : Math.min(6, poolItems.length);
    const cards = poolItems.slice(0, cardCount);

    state._ricordaCards = cards;
    state._ricordaFlipped = false;
    state._ricordaRevealed = {};
    state._ricordaScoreLog = [];
    state._ricordaLastRevealed = null;
    state.session.playItems = cards;

    _showRicordaBoard(document.getElementById('game-stage'), cards, false);
};

// ============================================================
// --- SINGOLARE / PLURALE ---
// Pool engine that reuses existing tagged images. Each round shows either
// a single image (singular) or N copies (numbered plural). Two sub-modes:
//   - random: each round randomly picks singular or plural
//   - pair: each round shows BOTH forms of the same item, in random order
// ============================================================

function renderSingolarePlurale(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-1 fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Assicurati che i set abbiano immagini e tag assegnati.</p>
            </div>`;
        return;
    }

    // Initialize state on first run (or set change)
    const prev = state.spState;
    const prevSubMode = prev?.subMode || localStorage.getItem('sp_sub_mode') || 'random';
    const prevPluralMin = (prev && prev.pluralMin) || parseInt(localStorage.getItem('sp_plural_min')) || 2;
    const prevPluralMax = (prev && prev.pluralMax) || parseInt(localStorage.getItem('sp_plural_max')) || 5;

    const pool = [...items].sort(() => Math.random() - 0.5);
    state.spState = {
        items: pool,
        index: 0,
        subMode: prevSubMode,
        pairStep: 0,
        pairOrder: Math.random() < 0.5 ? 'sp' : 'ps',
        currentForm: null,
        pluralCount: 2,
        pluralMin: prevPluralMin,
        pluralMax: prevPluralMax,
        round: 0
    };

    // Pre-process scontorno for better plural rendering
    if (typeof _topoCompPreScontorno === 'function') _topoCompPreScontorno(pool.slice(0, 6));

    _spPrepareRound();
    _spRender(stage);
}

function _spPrepareRound() {
    const sp = state.spState;
    if (!sp) return;
    const item = sp.items[sp.index % sp.items.length];

    if (sp.subMode === 'random') {
        sp.currentForm = Math.random() < 0.5 ? 'singular' : 'plural';
    } else {
        // Pair mode: order is randomized per item, then advance through both steps
        const order = sp.pairOrder;
        const step = sp.pairStep;
        if (order === 'sp') sp.currentForm = step === 0 ? 'singular' : 'plural';
        else sp.currentForm = step === 0 ? 'plural' : 'singular';
    }

    if (sp.currentForm === 'plural') {
        const range = Math.max(0, sp.pluralMax - sp.pluralMin);
        sp.pluralCount = sp.pluralMin + Math.floor(Math.random() * (range + 1));
    } else {
        sp.pluralCount = 1;
    }
    sp.currentItem = item;
}

function _spRender(stage) {
    const sp = state.spState;
    if (!sp) return;
    const item = sp.currentItem;
    const isPlural = sp.currentForm === 'plural';
    const count = sp.pluralCount;
    const url = (isPlural && count > 1 && item.maskedUrl) ? item.maskedUrl : (imgUrl(item));

    // Compute grid layout for plural display
    let cols, rows;
    if (count === 1) { cols = 1; rows = 1; }
    else if (count === 2) { cols = 2; rows = 1; }
    else if (count === 3) { cols = 3; rows = 1; }
    else if (count === 4) { cols = 2; rows = 2; }
    else if (count === 5) { cols = 3; rows = 2; }
    else { cols = 3; rows = 2; }

    const imagesHtml = Array.from({ length: count }, () => `
        <div style="display:flex; align-items:center; justify-content:center; min-width:0; min-height:0;">
            <img src="${url}" style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                 onerror="handleImgError(this, '${(item.label || '').replace(/'/g, "\\'")}')">
        </div>
    `).join('');

    const subModeLabel = sp.subMode === 'random' ? 'Random' : 'Coppia';
    const pairProgress = sp.subMode === 'pair'
        ? `<span style="color:var(--text-secondary); font-size:0.7rem;">(${sp.pairStep + 1}/2)</span>`
        : '';
    const formBadge = isPlural
        ? `<span style="background:rgba(var(--accent-rgb),0.2); color:var(--accent-color); padding:3px 12px; border-radius:10px; font-size:0.85rem; font-weight:bold;">&times; ${count}</span>`
        : `<span style="background:rgba(255,255,255,0.08); color:var(--text-secondary); padding:3px 12px; border-radius:10px; font-size:0.85rem;">Singolare</span>`;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-1"></i> Sing/Plur
            </span>
            ${formBadge}
            <span style="color:var(--text-secondary); font-size:0.75rem;">Round ${sp.round + 1}</span>
            ${pairProgress}
            <button class="btn btn-sm btn-ghost" onclick="spToggleSubMode()" title="Modalit&agrave;: ${subModeLabel}" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid ${sp.subMode === 'random' ? 'fa-shuffle' : 'fa-link'}"></i> ${subModeLabel}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="spOpenSettings()" title="Impostazioni Plurale" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-sliders"></i> ${sp.pluralMin}-${sp.pluralMax}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="spSkipRound()" title="Salta round (S)" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; min-height:0; padding:14px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, 1fr);
                    gap:12px; place-items:center;">
            ${imagesHtml}
        </div>
        ${item.label ? `<div style="text-align:center; padding:6px; color:var(--text-secondary); font-size:0.7rem; opacity:0.5; border-top:1px solid #ffffff10;">
            ${item.label}${item.sourceSet ? ` &middot; <span style="opacity:0.7;">${item.sourceSet}</span>` : ''}
        </div>` : ''}
    </div>`;
}

window.spToggleSubMode = () => {
    if (!state.spState) return;
    state.spState.subMode = state.spState.subMode === 'random' ? 'pair' : 'random';
    state.spState.pairStep = 0;
    state.spState.pairOrder = Math.random() < 0.5 ? 'sp' : 'ps';
    try { localStorage.setItem('sp_sub_mode', state.spState.subMode); } catch(e) {}
    _spPrepareRound();
    _spRender(document.getElementById('game-stage'));
};

window.spSkipRound = () => {
    _spAdvance();
    _spRender(document.getElementById('game-stage'));
};

window.spOpenSettings = async () => {
    const sp = state.spState;
    if (!sp) return;
    const minStr = await themedPrompt('Numero MINIMO copie per il plurale (1-9):', String(sp.pluralMin));
    if (minStr === null) return;
    const maxStr = await themedPrompt('Numero MASSIMO copie per il plurale (1-9):', String(sp.pluralMax));
    if (maxStr === null) return;
    const min = Math.max(1, Math.min(9, parseInt(minStr) || 2));
    const max = Math.max(min, Math.min(9, parseInt(maxStr) || 5));
    sp.pluralMin = min;
    sp.pluralMax = max;
    try {
        localStorage.setItem('sp_plural_min', String(min));
        localStorage.setItem('sp_plural_max', String(max));
    } catch(e) {}
    _spRender(document.getElementById('game-stage'));
};

function _spAdvance() {
    const sp = state.spState;
    if (!sp) return;
    if (sp.subMode === 'pair' && sp.pairStep === 0) {
        sp.pairStep = 1;
    } else {
        sp.pairStep = 0;
        sp.pairOrder = Math.random() < 0.5 ? 'sp' : 'ps';
        sp.index++;
        sp.round++;
        if (sp.index >= sp.items.length) {
            // Reshuffle and continue infinitely
            sp.items = [...sp.items].sort(() => Math.random() - 0.5);
            sp.index = 0;
        }
    }
    _spPrepareRound();
}

window._spHandleScore = (result) => {
    const sp = state.spState;
    if (!sp) return;
    const formLabel = sp.currentForm === 'plural' ? `plur_${sp.pluralCount}` : 'sing';
    const itemLabel = sp.currentItem?.label || 'item';
    const resultKey = `sp_${sp.round}_${sp.pairStep}_${formLabel}_${Date.now()}`;
    state.session.itemResults[resultKey] = result;
    state.session.scoreHistory.push(resultKey);

    // Track itemDetails for richer reporting
    if (!state.session._spDetails) state.session._spDetails = [];
    state.session._spDetails.push({
        label: itemLabel,
        form: sp.currentForm,
        count: sp.pluralCount,
        result
    });

    setTimeout(() => {
        _spAdvance();
        _spRender(document.getElementById('game-stage'));
        if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
    }, 350);
};

// ============================================================
// --- STROOP NUMERICO ---
// Show N copies of an image; the patient must say the NUMBER, not the object name.
// ============================================================
function renderStroopNumerico(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-hashtag fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Assicurati che i set abbiano immagini e tag assegnati.</p>
            </div>`;
        return;
    }

    const prev = state._stroopNumState;
    const prevMin = (prev && prev.countMin) || parseInt(localStorage.getItem('strnum_min')) || 2;
    const prevMax = (prev && prev.countMax) || parseInt(localStorage.getItem('strnum_max')) || 5;

    const pool = [...items].sort(() => Math.random() - 0.5);
    state._stroopNumState = {
        items: pool,
        index: 0,
        countMin: prevMin,
        countMax: prevMax,
        currentCount: 0,
        currentItem: null,
        round: 0
    };

    _stroopNumPrepareRound();
    _stroopNumRender(stage);
}

function _stroopNumPrepareRound() {
    const sn = state._stroopNumState;
    if (!sn) return;
    const item = sn.items[sn.index % sn.items.length];
    const range = Math.max(0, sn.countMax - sn.countMin);
    sn.currentCount = sn.countMin + Math.floor(Math.random() * (range + 1));
    sn.currentItem = item;
}

function _stroopNumRender(stage) {
    const sn = state._stroopNumState;
    if (!sn) return;
    const item = sn.currentItem;
    const count = sn.currentCount;
    const url = (count > 1 && item.maskedUrl) ? item.maskedUrl : (imgUrl(item));

    let cols, rows;
    if (count === 1) { cols = 1; rows = 1; }
    else if (count === 2) { cols = 2; rows = 1; }
    else if (count === 3) { cols = 3; rows = 1; }
    else if (count === 4) { cols = 2; rows = 2; }
    else if (count === 5) { cols = 3; rows = 2; }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else { cols = 4; rows = Math.ceil(count / 4); }

    const imagesHtml = Array.from({ length: count }, () => `
        <div style="display:flex; align-items:center; justify-content:center; min-width:0; min-height:0;">
            <img src="${url}" style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                 onerror="handleImgError(this, '${(item.label || '').replace(/'/g, "\\'")}')">
        </div>
    `).join('');

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-hashtag"></i> Stroop Numerico
            </span>
            <span style="background:rgba(var(--accent-rgb),0.2); color:var(--accent-color); padding:3px 12px; border-radius:10px; font-size:0.85rem; font-weight:bold;">
                Quanti? &times; ${count}
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Round ${sn.round + 1}</span>
            <button class="btn btn-sm btn-ghost" onclick="stroopNumOpenSettings()" title="Impostazioni quantit&agrave;" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-sliders"></i> ${sn.countMin}-${sn.countMax}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="stroopNumSkip()" title="Salta" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; min-height:0; padding:14px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, 1fr);
                    gap:12px; place-items:center;">
            ${imagesHtml}
        </div>
    </div>`;
}

function _stroopNumAdvance() {
    const sn = state._stroopNumState;
    if (!sn) return;
    sn.index++;
    sn.round++;
    if (sn.index >= sn.items.length) {
        sn.items = [...sn.items].sort(() => Math.random() - 0.5);
        sn.index = 0;
    }
    _stroopNumPrepareRound();
}

window._stroopNumHandleScore = (result) => {
    const sn = state._stroopNumState;
    if (!sn) return;
    const resultKey = `strnum_${sn.round}_${sn.currentCount}_${Date.now()}`;
    state.session.itemResults[resultKey] = result;
    state.session.scoreHistory.push(resultKey);

    setTimeout(() => {
        _stroopNumAdvance();
        _stroopNumRender(document.getElementById('game-stage'));
        if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
    }, 350);
};

window.stroopNumSkip = () => {
    _stroopNumAdvance();
    _stroopNumRender(document.getElementById('game-stage'));
};

window.stroopNumOpenSettings = async () => {
    const sn = state._stroopNumState;
    if (!sn) return;
    const minStr = await themedPrompt('Numero MINIMO copie (1-9):', String(sn.countMin));
    if (minStr === null) return;
    const maxStr = await themedPrompt('Numero MASSIMO copie (1-9):', String(sn.countMax));
    if (maxStr === null) return;
    const min = Math.max(1, Math.min(9, parseInt(minStr) || 2));
    const max = Math.max(min, Math.min(9, parseInt(maxStr) || 5));
    sn.countMin = min;
    sn.countMax = max;
    try {
        localStorage.setItem('strnum_min', String(min));
        localStorage.setItem('strnum_max', String(max));
    } catch(e) {}
    _stroopNumPrepareRound();
    _stroopNumRender(document.getElementById('game-stage'));
};

// ============================================================
// --- GO / NO-GO ---
// Pool of images from multiple tags. The clinician selects one tag as "No-Go".
// Patient names everything EXCEPT items from the No-Go tag.
// V = correct inhibition or correct naming. X = failed inhibition or naming error.
// ============================================================
function renderGoNogo(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-traffic-light fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Seleziona almeno 2 tag per usare Go/No-Go.</p>
            </div>`;
        return;
    }

    if (state.selectedPoolTags.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-traffic-light fa-3x" style="margin-bottom:15px;"></i>
                <p>Go/No-Go richiede almeno <b>2 tag</b>.<br>Il paziente nomina tutto tranne gli item del tag <b>No-Go</b>.</p>
            </div>`;
        return;
    }

    const prev = state._goNogoState;
    const prevNoGoTag = (prev && prev.noGoTag) || localStorage.getItem('gonogo_nogo_tag') || state.selectedPoolTags[0];
    const validNoGo = state.selectedPoolTags.includes(prevNoGoTag) ? prevNoGoTag : state.selectedPoolTags[0];

    const pool = balancedShuffle(items, item => {
        if (item.sourceTags) {
            return item.sourceTags.find(t => state.selectedPoolTags.includes(t)) || item.sourceTags[0];
        }
        return item.sourceTag || '_default';
    });

    const prevShowLegend = (prev && prev.showLegend !== undefined) ? prev.showLegend : localStorage.getItem('gonogo_legend') !== 'false';

    state._goNogoState = {
        items: pool,
        index: 0,
        noGoTag: validNoGo,
        round: 0,
        currentItem: null,
        showLegend: prevShowLegend
    };

    _goNogoPrepareRound();
    _goNogoRender(stage);
}

function _goNogoPrepareRound() {
    const gn = state._goNogoState;
    if (!gn) return;
    gn.currentItem = gn.items[gn.index % gn.items.length];
}

function _isNoGoItem(item, noGoTag) {
    const tagLower = noGoTag.toLowerCase().trim();
    if (item.sourceTags) return item.sourceTags.some(t => t.toLowerCase().trim() === tagLower);
    if (item.sourceTag) return item.sourceTag.toLowerCase().trim() === tagLower;
    return false;
}

function _goNogoRender(stage) {
    const gn = state._goNogoState;
    if (!gn) return;
    const item = gn.currentItem;
    const url = imgUrl(item);

    const tagOptions = state.selectedPoolTags.map(t =>
        `<option value="${t}" ${t === gn.noGoTag ? 'selected' : ''}>${t}</option>`
    ).join('');

    // Build tag legend: one mini-card per selected tag, green border = GO, red border = No-Go
    const noGoLower = gn.noGoTag.toLowerCase().trim();
    const tagLegendHtml = state.selectedPoolTags.map(t => {
        const isNoGoTag = t.toLowerCase().trim() === noGoLower;
        const borderColor = isNoGoTag ? 'var(--danger-color)' : 'var(--success-color)';
        const bgColor = isNoGoTag ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)';
        const tagImg = (typeof getTagImage === 'function') ? getTagImage(t) : null;
        const imgHtml = tagImg
            ? `<img src="${tagImg}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.style.display='none'">`
            : `<i class="fa-solid ${isNoGoTag ? 'fa-hand' : 'fa-check'}" style="font-size:1.8rem; color:${borderColor}; opacity:0.6;"></i>`;
        return `
            <div onclick="goNogoSetTag('${t.replace(/'/g, "\\'")}')" style="cursor:pointer; background:${bgColor}; border:3px solid ${borderColor}; border-radius:var(--radius-md); padding:6px; display:flex; flex-direction:column; align-items:center; gap:4px; aspect-ratio:1; min-height:60px;">
                <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; width:100%;">
                    ${imgHtml}
                </div>
                <div style="font-size:0.65rem; font-weight:bold; color:${borderColor}; text-transform:uppercase; text-align:center; line-height:1; word-break:break-word;">${t}</div>
            </div>`;
    }).join('');

    const legendVisible = gn.showLegend;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-traffic-light"></i> Go/No-Go
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Round ${gn.round + 1}</span>
            <label style="display:flex; align-items:center; gap:4px; font-size:0.7rem; color:var(--text-secondary);">
                No-Go:
                <select onchange="goNogoSetTag(this.value)" style="background:var(--input-bg); color:var(--text-primary); border:1px solid var(--glass-border); border-radius:var(--radius-sm); padding:2px 6px; font-size:0.7rem;">
                    ${tagOptions}
                </select>
            </label>
            <button class="btn btn-sm btn-ghost" onclick="goNogoToggleLegend()" title="${legendVisible ? 'Nascondi' : 'Mostra'} categorie" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid ${legendVisible ? 'fa-eye-slash' : 'fa-eye'}"></i> Categorie
            </button>
            <button class="btn btn-sm btn-ghost" onclick="goNogoSkip()" title="Salta" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; min-height:0; display:flex; gap:14px; padding:20px;">
            <div style="flex:1; min-width:0; display:flex; align-items:center; justify-content:center;" onclick="goNogoSkip()">
                <img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:var(--radius-md);"
                     onerror="handleImgError(this, '${(item.label || '').replace(/'/g, "\\'")}')">
            </div>
            ${legendVisible ? `<div style="width:clamp(80px, 14vw, 130px); flex-shrink:0; display:flex; flex-direction:column; gap:10px; overflow-y:auto;">
                ${tagLegendHtml}
            </div>` : ''}
        </div>
        ${item.label ? `<div style="text-align:center; padding:6px; color:var(--text-secondary); font-size:0.7rem; opacity:0.5; border-top:1px solid #ffffff10;">
            ${item.label}${item.sourceSet ? ` &middot; <span style="opacity:0.7;">${item.sourceSet}</span>` : ''}
        </div>` : ''}
    </div>`;
}

function _goNogoAdvance() {
    const gn = state._goNogoState;
    if (!gn) return;
    gn.index++;
    gn.round++;
    if (gn.index >= gn.items.length) {
        gn.items = balancedShuffle([...gn.items], item => {
            if (item.sourceTags) return item.sourceTags[0] || '_default';
            return item.sourceTag || '_default';
        });
        gn.index = 0;
    }
    _goNogoPrepareRound();
}

window._goNogoHandleScore = (result) => {
    const gn = state._goNogoState;
    if (!gn) return;
    const isNoGo = _isNoGoItem(gn.currentItem, gn.noGoTag);
    const label = gn.currentItem.label || 'item';
    const resultKey = `gonogo_${gn.round}_${isNoGo ? 'nogo' : 'go'}_${Date.now()}`;
    state.session.itemResults[resultKey] = result;
    state.session.scoreHistory.push(resultKey);

    const targetImg = document.querySelector('#game-stage img');
    if (targetImg) {
        targetImg.classList.remove('feedback-success', 'feedback-fail', 'feedback-prompt');
        void targetImg.offsetWidth;
        if (result === 'prompt') targetImg.classList.add('feedback-prompt');
        else targetImg.classList.add(result ? 'feedback-success' : 'feedback-fail');
    }

    setTimeout(() => {
        _goNogoAdvance();
        _goNogoRender(document.getElementById('game-stage'));
        if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
    }, 350);
};

window.goNogoSkip = () => {
    _goNogoAdvance();
    _goNogoRender(document.getElementById('game-stage'));
};

window.goNogoToggleLegend = () => {
    const gn = state._goNogoState;
    if (!gn) return;
    gn.showLegend = !gn.showLegend;
    try { localStorage.setItem('gonogo_legend', gn.showLegend ? 'true' : 'false'); } catch(e) {}
    _goNogoRender(document.getElementById('game-stage'));
};

window.goNogoSetTag = (tag) => {
    const gn = state._goNogoState;
    if (!gn) return;
    gn.noGoTag = tag;
    try { localStorage.setItem('gonogo_nogo_tag', tag); } catch(e) {}
    _goNogoRender(document.getElementById('game-stage'));
};

// ============================================================
// --- STROOP ETICHETTA (Image-Label Mismatch) ---
// Show one image with a WRONG label from another item in the same tag.
// Patient must say what they SEE, not what they READ.
// ============================================================
function renderStroopEtichetta(items, stage) {
    if (!items || items.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-font fa-3x" style="margin-bottom:15px;"></i>
                <p>Servono almeno <b>2 item</b> con immagini per Stroop Etichetta.<br>Seleziona tag con pi&ugrave; immagini.</p>
            </div>`;
        return;
    }

    const pool = [...items].sort(() => Math.random() - 0.5);
    state._stroopEtState = {
        items: pool,
        index: 0,
        round: 0,
        currentItem: null,
        mismatchLabel: null
    };

    _stroopEtPrepareRound();
    _stroopEtRender(stage);
}

function _stroopEtPrepareRound() {
    const se = state._stroopEtState;
    if (!se) return;
    const item = se.items[se.index % se.items.length];
    se.currentItem = item;

    // Pick a DIFFERENT label from the pool (ideally same tag, but any other item works)
    const sameTagItems = se.items.filter(i =>
        i !== item && i.label !== item.label
    );
    const candidates = sameTagItems.length > 0 ? sameTagItems : se.items.filter(i => i.label !== item.label);
    if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        se.mismatchLabel = pick.label;
    } else {
        se.mismatchLabel = '???';
    }
}

function _stroopEtRender(stage) {
    const se = state._stroopEtState;
    if (!se) return;
    const item = se.currentItem;
    const url = imgUrl(item);
    const wrongLabel = se.mismatchLabel;
    const correctLabel = item.label || '';

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-font"></i> Stroop Etichetta
            </span>
            <span style="background:rgba(var(--accent-rgb),0.2); color:var(--accent-color); padding:3px 12px; border-radius:10px; font-size:0.85rem; font-weight:bold;">
                <i class="fa-solid fa-eye"></i> Dire cosa VEDI
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Round ${se.round + 1}</span>
            <button class="btn btn-sm btn-ghost" onclick="stroopEtSkip()" title="Salta" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div style="flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; gap:12px;">
            <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; width:100%;">
                <img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:var(--radius-md);"
                     onerror="handleImgError(this, '${correctLabel.replace(/'/g, "\\'")}')">
            </div>
            <div style="background:rgba(239,68,68,0.15); border:2px solid rgba(239,68,68,0.4); border-radius:var(--radius-md); padding:12px 28px; text-align:center;">
                <span style="font-size:1.6rem; font-weight:bold; color:var(--danger-color); letter-spacing:1px; text-transform:uppercase;">${wrongLabel}</span>
            </div>
        </div>
    </div>`;
}

function _stroopEtAdvance() {
    const se = state._stroopEtState;
    if (!se) return;
    se.index++;
    se.round++;
    if (se.index >= se.items.length) {
        se.items = [...se.items].sort(() => Math.random() - 0.5);
        se.index = 0;
    }
    _stroopEtPrepareRound();
}

window._stroopEtHandleScore = (result) => {
    const se = state._stroopEtState;
    if (!se) return;
    const resultKey = `stret_${se.round}_${Date.now()}`;
    state.session.itemResults[resultKey] = result;
    state.session.scoreHistory.push(resultKey);

    const targetImg = document.querySelector('#game-stage img');
    if (targetImg) {
        targetImg.classList.remove('feedback-success', 'feedback-fail', 'feedback-prompt');
        void targetImg.offsetWidth;
        if (result === 'prompt') targetImg.classList.add('feedback-prompt');
        else targetImg.classList.add(result ? 'feedback-success' : 'feedback-fail');
    }

    setTimeout(() => {
        _stroopEtAdvance();
        _stroopEtRender(document.getElementById('game-stage'));
        if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
    }, 350);
};

window.stroopEtSkip = () => {
    _stroopEtAdvance();
    _stroopEtRender(document.getElementById('game-stage'));
};

// ============================================================
// --- TOPOLOGIA COMPOSITIVA ---
// Two objects composed on a canvas. Patient describes the spatial relation.
// Sub-modes: template (fixed character) and random (both objects random).
// ============================================================
// Concept categories: the therapist hint shows the PAIR (never the answer),
// so the child can't read the solution but the therapist knows what to score.
const TOPO_CATEGORIES = {
    vert: { pair: 'sopra / sotto',     icon: 'fa-arrows-up-down' },
    lat:  { pair: 'destra / sinistra', icon: 'fa-arrows-left-right' },
    dist: { pair: 'vicino / lontano',  icon: 'fa-ruler-horizontal' },
    prof: { pair: 'davanti / dietro',  icon: 'fa-layer-group' },
    cont: { pair: 'dentro / fuori',    icon: 'fa-box-open' },
    dim:  { pair: 'grande / piccolo',  icon: 'fa-up-right-and-down-left-from-center' }
};
const TOPO_POSITIONS = {
    'sopra':      { label: 'Sopra',      cat: 'vert', icon: 'fa-arrow-up',          charPos: [0.5, 0.18], refPos: [0.5, 0.68] },
    'sotto':      { label: 'Sotto',      cat: 'vert', icon: 'fa-arrow-down',        charPos: [0.5, 0.78], refPos: [0.5, 0.28] },
    'davanti':    { label: 'Davanti',    cat: 'prof', icon: 'fa-person-walking',    charPos: [0.5, 0.58], refPos: [0.5, 0.38], charScale: 1.1, refScale: 0.85, drawCharLast: true },
    'dietro':     { label: 'Dietro',     cat: 'prof', icon: 'fa-eye-slash',         charPos: [0.5, 0.35], refPos: [0.5, 0.58], charScale: 0.8, refScale: 1.0, drawCharLast: false },
    'vicino':     { label: 'Vicino',     cat: 'dist', icon: 'fa-arrows-left-right', charPos: [0.35, 0.5], refPos: [0.65, 0.5] },
    'lontano':    { label: 'Lontano',    cat: 'dist', icon: 'fa-expand',            charPos: [0.12, 0.5], refPos: [0.88, 0.5], charScale: 0.65, refScale: 0.65 },
    // dentro/fuori use a DRAWN generic box as the container, so the relation is
    // unambiguous with any image pool (a random ref image isn't a container).
    'dentro':     { label: 'Dentro',     cat: 'cont', icon: 'fa-box-open',            charPos: [0.5, 0.45],  charScale: 0.45, container: true, inside: true },
    'fuori':      { label: 'Fuori',      cat: 'cont', icon: 'fa-arrow-up-from-bracket', charPos: [0.2, 0.55], charScale: 0.7,  container: true, inside: false },
    'a destra':   { label: 'A destra',   cat: 'lat', icon: 'fa-arrow-right',       charPos: [0.72, 0.5], refPos: [0.28, 0.5] },
    'a sinistra': { label: 'A sinistra', cat: 'lat', icon: 'fa-arrow-left',        charPos: [0.28, 0.5], refPos: [0.72, 0.5] },
    'grande':     { label: 'Grande',     cat: 'dim', icon: 'fa-up-right-and-down-left-from-center', charPos: [0.32, 0.5],  refPos: [0.74, 0.6], charScale: 1.45, refScale: 0.55 },
    'piccolo':    { label: 'Piccolo',    cat: 'dim', icon: 'fa-down-left-and-up-right-to-center',   charPos: [0.28, 0.62], refPos: [0.7, 0.5],  charScale: 0.45, refScale: 1.35 }
};

function _topoCompGetEnabledPositions() {
    try {
        const saved = JSON.parse(localStorage.getItem('topo_comp_positions') || 'null');
        if (Array.isArray(saved)) {
            // v1 list saved before grande/piccolo/fuori existed: enable the new
            // positions too (the user never had a chance to opt out of them).
            const merged = [...saved];
            ['grande', 'piccolo', 'fuori'].forEach(k => { if (!merged.includes(k)) merged.push(k); });
            return merged.filter(k => TOPO_POSITIONS[k]);
        }
        if (saved && Array.isArray(saved.enabled)) return saved.enabled.filter(k => TOPO_POSITIONS[k]);
    } catch(e) {}
    return Object.keys(TOPO_POSITIONS);
}

function renderTopologiaComp(items, stage) {
    if (!items || items.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-layer-group fa-3x" style="margin-bottom:15px;"></i>
                <p>Servono almeno <b>2 item</b> con immagini.<br>Seleziona tag con pi&ugrave; immagini.</p>
            </div>`;
        return;
    }

    const prev = state._topoCompState;
    const prevSubMode = (prev && prev.subMode) || localStorage.getItem('topo_comp_submode') || 'random';
    const prevPersonaggio = prev ? prev.personaggio : null;
    const enabledPositions = _topoCompGetEnabledPositions();
    const hintMode = (prev && prev.hintMode) || localStorage.getItem('topo_comp_hint') || 'cat';

    const pool = [...items].sort(() => Math.random() - 0.5);
    state._topoCompState = {
        items: pool,
        index: 0,
        round: 0,
        subMode: prevSubMode,
        personaggio: prevPersonaggio,
        enabledPositions: enabledPositions,
        currentPosition: null,
        currentChar: null,
        currentRef: null,
        hintMode: hintMode,
        scontornoReady: {},
        positionStats: {}
    };

    // Pre-process scontorno for first few items in background
    _topoCompPreScontorno(pool.slice(0, 6));

    _topoCompPrepareRound();
    _topoCompRender(stage);
}

async function _topoCompPreScontorno(items) {
    if (typeof getScontornata !== 'function') return;
    for (const item of items) {
        if (!item.maskedUrl && item.url) {
            const result = await getScontornata(item);
            if (result) item.maskedUrl = result;
        }
    }
}

function _topoCompPrepareRound() {
    const tc = state._topoCompState;
    if (!tc || tc.enabledPositions.length === 0) return;

    tc.currentPosition = tc.enabledPositions[Math.floor(Math.random() * tc.enabledPositions.length)];

    if (tc.subMode === 'template' && tc.personaggio) {
        tc.currentChar = tc.personaggio;
        const others = tc.items.filter(i => i.label !== tc.personaggio.label || i.url !== tc.personaggio.url);
        tc.currentRef = others.length > 0
            ? others[tc.index % others.length]
            : tc.items[tc.index % tc.items.length];
    } else {
        const i1 = tc.index % tc.items.length;
        let i2 = (tc.index + 1 + Math.floor(Math.random() * (tc.items.length - 1))) % tc.items.length;
        if (i2 === i1) i2 = (i1 + 1) % tc.items.length;
        tc.currentChar = tc.items[i1];
        tc.currentRef = tc.items[i2];
    }

    // dentro/fuori: rotate the container so the concept generalizes. Pool =
    // drawn shapes (scatola, casa, cesta...) + any set item whose "front mask"
    // was painted in the editor (real-object containers).
    const posCfg = TOPO_POSITIONS[tc.currentPosition];
    if (posCfg && posCfg.container) {
        const itemConts = tc.items.filter(i => i.frontMaskUrl && i.url &&
            !(tc.currentChar && i.label === tc.currentChar.label && i.url === tc.currentChar.url));
        if (itemConts.length && Math.random() < 0.5) {
            const it = itemConts[Math.floor(Math.random() * itemConts.length)];
            if (!it.maskedUrl) _topoCompPreScontorno([it]); // background cut-out for next rounds
            tc.currentContainer = { type: 'item', item: it };
        } else {
            const ck = Object.keys(TOPO_CONTAINERS);
            tc.currentContainer = ck[Math.floor(Math.random() * ck.length)];
        }
    }
}

function _topoCompGetImgUrl(item) {
    return item.maskedUrl || imgUrl(item);
}

function _topoCompRender(stage) {
    const tc = state._topoCompState;
    if (!tc) return;

    const posConfig = TOPO_POSITIONS[tc.currentPosition] || TOPO_POSITIONS['sopra'];
    const subModeLabel = tc.subMode === 'template' ? 'Template' : 'Random';
    const persLabel = tc.personaggio ? tc.personaggio.label : 'Nessuno';

    const catCfg = TOPO_CATEGORIES[posConfig.cat] || { pair: '?', icon: 'fa-question' };
    const positionBadge = tc.hintMode === 'full'
        ? `<span style="background:rgba(var(--accent-rgb),0.2); color:var(--accent-color); padding:3px 12px; border-radius:10px; font-size:0.85rem; font-weight:bold;">
            <i class="fa-solid ${posConfig.icon}"></i> ${posConfig.label}
          </span>`
        : tc.hintMode === 'cat'
        ? `<span title="Categoria del round (la risposta esatta resta nascosta)" style="background:rgba(245,158,11,0.15); color:var(--warning-color); padding:3px 12px; border-radius:10px; font-size:0.82rem; font-weight:600;">
            <i class="fa-solid ${catCfg.icon}"></i> ${catCfg.pair}
          </span>`
        : `<span style="background:rgba(255,255,255,0.08); color:var(--text-secondary); padding:3px 12px; border-radius:10px; font-size:0.85rem;">
            <i class="fa-solid fa-question"></i> ?
          </span>`;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:8px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-layer-group"></i> Topologia
            </span>
            ${positionBadge}
            <span style="color:var(--text-secondary); font-size:0.75rem;">Round ${tc.round + 1}</span>
            <button class="btn btn-sm btn-ghost" onclick="topoCompToggleAnswer()" title="${tc.hintMode === 'off' ? 'Mostra categoria' : tc.hintMode === 'cat' ? 'Mostra risposta esatta' : 'Nascondi suggerimento'}" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid ${tc.hintMode === 'off' ? 'fa-eye' : tc.hintMode === 'cat' ? 'fa-shapes' : 'fa-eye-slash'}"></i>
            </button>
            <button class="btn btn-sm btn-ghost" onclick="topoCompToggleSubMode()" title="Modalit&agrave;: ${subModeLabel}" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid ${tc.subMode === 'template' ? 'fa-user-tag' : 'fa-shuffle'}"></i> ${subModeLabel}
            </button>
            ${tc.subMode === 'template' ? `<button class="btn btn-sm btn-ghost" onclick="topoCompSelectPersonaggio()" title="Personaggio: ${persLabel}" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-child"></i> ${persLabel.length > 10 ? persLabel.substring(0, 10) + '…' : persLabel}
            </button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="topoCompOpenSettings()" title="Posizioni attive" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-sliders"></i>
            </button>
            <button class="btn btn-sm btn-ghost" onclick="topoCompSkip()" title="Salta" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-forward-step"></i>
            </button>
        </div>
        <div id="topo-comp-canvas-area" style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:10px; background:rgba(255,255,255,0.03);"></div>
        <div style="text-align:center; padding:6px; color:var(--text-secondary); font-size:0.7rem; opacity:0.6; border-top:1px solid #ffffff10; display:flex; gap:16px; justify-content:center;">
            <span><i class="fa-solid fa-child"></i> ${tc.currentChar.label || '?'}</span>
            <span><i class="fa-solid ${posConfig.container ? 'fa-box' : 'fa-cube'}"></i> ${posConfig.container ? ((tc.currentContainer && tc.currentContainer.type === 'item') ? (tc.currentContainer.item.label || 'Contenitore') : ((TOPO_CONTAINERS[tc.currentContainer] || {}).label || 'Scatola')) : (tc.currentRef.label || '?')}</span>
        </div>
    </div>`;

    _topoCompDrawCanvas();
}

// Drawn containers for dentro/fuori: rotating shapes helps the child
// generalize the concept beyond a single container. Each draw(ctx, g, drawChar)
// renders its own back parts, calls drawChar (only when the round is "dentro")
// so the front parts occlude it, then finishes the foreground.
const TOPO_CONTAINERS = {
    scatola: {
        label: 'Scatola',
        draw(ctx, g, drawChar) {
            const { cx, cy, w, h } = g; const x = cx - w / 2, y = cy - h / 2;
            const rr = (a, b, c, d, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(a, b, c, d, r); else ctx.rect(a, b, c, d); };
            ctx.fillStyle = '#8a6a3f'; rr(x + w * 0.04, y, w * 0.92, h * 0.5, 6); ctx.fill();
            ctx.fillStyle = '#6e5330'; rr(x + w * 0.09, y + h * 0.07, w * 0.82, h * 0.4, 5); ctx.fill();
            if (drawChar) drawChar(cx, cy - h * 0.16, 0.45);
            ctx.fillStyle = '#c9974f'; rr(x, y + h * 0.32, w, h * 0.62, 8); ctx.fill();
            ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 3; rr(x, y + h * 0.32, w, h * 0.62, 8); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cx - w * 0.06, y + h * 0.32, w * 0.12, h * 0.62);
        }
    },
    casa: {
        label: 'Casa',
        draw(ctx, g, drawChar) {
            const { cx, cy, w, h } = g; const x = cx - w / 2, y = cy - h / 2;
            const rr = (a, b, c, d, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(a, b, c, d, r); else ctx.rect(a, b, c, d); };
            // roof
            ctx.fillStyle = '#c0563c'; ctx.beginPath();
            ctx.moveTo(x - w * 0.08, y + h * 0.3); ctx.lineTo(cx, y - h * 0.14); ctx.lineTo(x + w * 1.08, y + h * 0.3); ctx.closePath(); ctx.fill();
            // walls
            ctx.fillStyle = '#e8c17e'; ctx.fillRect(x, y + h * 0.3, w, h * 0.72);
            ctx.strokeStyle = '#b08850'; ctx.lineWidth = 2.5; ctx.strokeRect(x, y + h * 0.3, w, h * 0.72);
            // window
            ctx.fillStyle = '#9ad2e8'; ctx.fillRect(x + w * 0.66, y + h * 0.44, w * 0.22, h * 0.22);
            ctx.strokeRect(x + w * 0.66, y + h * 0.44, w * 0.22, h * 0.22);
            // doorway: the char is seen THROUGH the opening (clipped inside it)
            const dw = w * 0.42, dh = h * 0.58, dx = x + w * 0.1, dy = y + h * 1.02 - dh;
            ctx.fillStyle = '#3a2a18'; rr(dx, dy, dw, dh, 8); ctx.fill();
            if (drawChar) {
                ctx.save(); rr(dx + 2, dy + 2, dw - 4, dh - 4, 7); ctx.clip();
                drawChar(dx + dw / 2, dy + dh * 0.6, 0.42);
                ctx.restore();
            }
            ctx.strokeStyle = '#8a6236'; ctx.lineWidth = 3; rr(dx, dy, dw, dh, 8); ctx.stroke();
        }
    },
    cesta: {
        label: 'Cesta',
        draw(ctx, g, drawChar) {
            const { cx, cy, w, h } = g;
            const rimRx = w * 0.44, rimRy = h * 0.13, topY = cy - h * 0.24, botY = cy + h * 0.42;
            // interior + thin back rim (behind the subject)
            ctx.fillStyle = '#5f462a'; ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, false); ctx.stroke();
            if (drawChar) drawChar(cx, topY - h * 0.09, 0.5);
            // body: the top edge follows the FRONT rim arc, so the subject is
            // occluded cleanly with no gaps.
            ctx.fillStyle = '#c9974f';
            ctx.beginPath();
            ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true);
            ctx.lineTo(cx + w * 0.36, botY);
            ctx.quadraticCurveTo(cx, botY + h * 0.1, cx - w * 0.36, botY);
            ctx.closePath(); ctx.fill();
            // weave lines
            ctx.strokeStyle = 'rgba(110,83,48,0.6)'; ctx.lineWidth = 2.5;
            for (let i = 1; i < 4; i++) {
                const yy = topY + rimRy + (botY - topY - rimRy) * i / 4;
                const inset = rimRx - (rimRx - w * 0.36) * i / 4 - 4;
                ctx.beginPath(); ctx.moveTo(cx - inset, yy);
                ctx.quadraticCurveTo(cx, yy + h * 0.05, cx + inset, yy); ctx.stroke();
            }
            // front rim
            ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true); ctx.stroke();
        }
    },
    tazza: {
        label: 'Tazza',
        draw(ctx, g, drawChar) {
            const { cx, cy, w, h } = g;
            const rimRx = w * 0.3, rimRy = h * 0.1, topY = cy - h * 0.26, botY = cy + h * 0.36;
            // interior + back rim
            ctx.fillStyle = '#2e4468'; ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#3d6cb0'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, false); ctx.stroke();
            if (drawChar) drawChar(cx, topY - h * 0.08, 0.44);
            // handle (attached to the body side)
            ctx.strokeStyle = '#4a7cc4'; ctx.lineWidth = 10; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx + rimRx + 4, topY + (botY - topY) * 0.45, w * 0.13, -Math.PI / 2.6, Math.PI / 2.6); ctx.stroke();
            ctx.lineCap = 'butt';
            // body from the front rim arc down
            ctx.fillStyle = '#5b8dd9';
            ctx.beginPath();
            ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true);
            ctx.lineTo(cx + rimRx * 0.92, botY - 10);
            ctx.quadraticCurveTo(cx, botY + h * 0.08, cx - rimRx * 0.92, botY - 10);
            ctx.closePath(); ctx.fill();
            // decorative stripe, clipped to the body
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true);
            ctx.lineTo(cx + rimRx * 0.92, botY - 10);
            ctx.quadraticCurveTo(cx, botY + h * 0.08, cx - rimRx * 0.92, botY - 10);
            ctx.closePath(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(cx - rimRx, topY + (botY - topY) * 0.42, rimRx * 2, (botY - topY) * 0.18);
            ctx.restore();
            // front rim
            ctx.strokeStyle = '#3d6cb0'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true); ctx.stroke();
        }
    },
    pentola: {
        label: 'Pentola',
        draw(ctx, g, drawChar) {
            const { cx, cy, w, h } = g;
            const rimRx = w * 0.37, rimRy = h * 0.11, topY = cy - h * 0.22, botY = cy + h * 0.38;
            // interior + back rim
            ctx.fillStyle = '#44505c'; ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#6b7683'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, false); ctx.stroke();
            if (drawChar) drawChar(cx, topY - h * 0.08, 0.46);
            // side handles (attached at rim level, behind the body edge)
            ctx.strokeStyle = '#6b7683'; ctx.lineWidth = 9; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx - rimRx - 3, topY + h * 0.1, w * 0.09, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + rimRx + 3, topY + h * 0.1, w * 0.09, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
            ctx.lineCap = 'butt';
            // body from the front rim arc down
            ctx.fillStyle = '#9aa5b1';
            ctx.beginPath();
            ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true);
            ctx.lineTo(cx + rimRx * 0.96, botY - 8);
            ctx.quadraticCurveTo(cx, botY + h * 0.07, cx - rimRx * 0.96, botY - 8);
            ctx.closePath(); ctx.fill();
            // darker base band, clipped to the body
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true);
            ctx.lineTo(cx + rimRx * 0.96, botY - 8);
            ctx.quadraticCurveTo(cx, botY + h * 0.07, cx - rimRx * 0.96, botY - 8);
            ctx.closePath(); ctx.clip();
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(cx - rimRx, botY - (botY - topY) * 0.28, rimRx * 2, (botY - topY) * 0.3);
            ctx.restore();
            // front rim
            ctx.strokeStyle = '#6b7683'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.ellipse(cx, topY, rimRx, rimRy, 0, Math.PI, 0, true); ctx.stroke();
        }
    }
};

// Where does the painted "front part" begin? Scan the mask's central columns
// top-down for the first opaque row: that's the container's opening edge, so
// the subject can peek out above it regardless of the specific image.
// Analyze the painted "front part" mask: where its top edge sits (the
// container's opening) and the horizontal centre/width of that opening — so
// the subject can be sized and centred on the REAL container, wherever it
// lies inside the photo. All values are fractions of the image.
function _frontMaskOpening(img) {
    const fallback = { top: 0.35, cx: 0.5, w: 0.55 };
    try {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        if (!iw || !ih) return fallback;
        const scale = Math.min(1, 256 / Math.max(iw, ih));
        const w = Math.max(8, Math.round(iw * scale)), h = Math.max(8, Math.round(ih * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx2 = c.getContext('2d', { willReadFrequently: true });
        cx2.drawImage(img, 0, 0, w, h);
        const d = cx2.getImageData(0, 0, w, h).data;
        const alphaAt = (x, y) => d[(y * w + x) * 4 + 3] > 40;
        // topmost painted row (any column: the front may be off-centre)
        let topRow = -1;
        for (let y = 0; y < h && topRow < 0; y++) {
            for (let x = 0; x < w; x++) { if (alphaAt(x, y)) { topRow = y; break; } }
        }
        if (topRow < 0) return fallback;
        // horizontal extent of the front in a band just under the opening edge
        const band = Math.max(2, Math.round(h * 0.1));
        let left = w, right = -1;
        for (let y = topRow; y < Math.min(h, topRow + band); y++) {
            for (let x = 0; x < w; x++) {
                if (alphaAt(x, y)) { if (x < left) left = x; if (x > right) right = x; }
            }
        }
        if (right <= left) return { top: topRow / h, cx: 0.5, w: 0.55 };
        return { top: topRow / h, cx: (left + right) / 2 / w, w: (right - left) / w };
    } catch (e) { /* tainted or broken: fall through */ }
    return fallback;
}

function _topoCompDrawCanvas() {
    const tc = state._topoCompState;
    if (!tc) return;
    const area = document.getElementById('topo-comp-canvas-area');
    if (!area) return;

    const posConfig = TOPO_POSITIONS[tc.currentPosition] || TOPO_POSITIONS['sopra'];
    const charUrl = _topoCompGetImgUrl(tc.currentChar);
    const refUrl = _topoCompGetImgUrl(tc.currentRef);

    const isContainer = !!posConfig.container;
    const cc = tc.currentContainer;
    const isItemCont = isContainer && cc && typeof cc === 'object' && cc.type === 'item';
    const charImg = new Image();
    const refImg = new Image();
    const contBaseImg = new Image();
    const contFrontImg = new Image();
    let loaded = 0;
    const needed = isContainer ? (isItemCont ? (posConfig.inside ? 3 : 2) : 1) : 2;

    const onBothLoaded = () => {
        if (++loaded < needed) return;
        const areaRect = area.getBoundingClientRect();
        const cw = Math.round(areaRect.width) || 600;
        const ch = Math.round(areaRect.height) || 500;

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.cssText = 'max-width:100%; max-height:100%; border-radius:var(--radius-md);';
        const ctx = canvas.getContext('2d');

        const baseSize = Math.min(cw, ch) * 0.38;
        const charScale = posConfig.charScale || 1.0;
        const refScale = posConfig.refScale || 1.0;
        const drawCharLast = posConfig.drawCharLast !== false;

        const fitRect = (img, cx, cy, scale) => {
            const maxW = baseSize * scale, maxH = baseSize * scale;
            let w = img.naturalWidth || img.width || 1;
            let h = img.naturalHeight || img.height || 1;
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio); h = Math.round(h * ratio);
            return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
        };
        const fitAndDraw = (img, cx, cy, scale) => {
            if (!img || !img.naturalWidth) return; // failed/absent image: skip
            const r = fitRect(img, cx, cy, scale);
            ctx.drawImage(img, r.x, r.y, r.w, r.h);
        };

        const charCx = posConfig.charPos[0] * cw;
        const charCy = posConfig.charPos[1] * ch;

        if (isContainer) {
            if (isItemCont) {
                // Real-object container: CUT-OUT image behind (no photo
                // background), subject, then the painted "front part" overlay
                // on top — drawn at the same rect so it aligns pixel-perfect.
                const contScale = 1.2;
                const ccx = (posConfig.inside ? 0.5 : 0.66) * cw;
                const ccy = 0.55 * ch;
                fitAndDraw(contBaseImg, ccx, ccy, contScale);
                if (posConfig.inside) {
                    if (!cc.item._frontOpening) cc.item._frontOpening = _frontMaskOpening(contFrontImg);
                    const op = cc.item._frontOpening;
                    const contRect = fitRect(contBaseImg, ccx, ccy, contScale);
                    // real opening in canvas coords (from the painted mask)
                    const rimY = contRect.y + contRect.h * op.top;
                    const openCx = contRect.x + contRect.w * op.cx;
                    const openW = Math.max(24, contRect.w * op.w);
                    // size the subject to ~68% of the opening width
                    const nw = charImg.naturalWidth || 1, nh = charImg.naturalHeight || 1;
                    let chScale = (openW * 0.68) * Math.max(nw, nh) / (baseSize * nw);
                    chScale = Math.max(0.25, Math.min(1.0, chScale));
                    const charH = fitRect(charImg, 0, 0, chScale).h;
                    fitAndDraw(charImg, openCx, rimY - charH * 0.28, chScale);
                    fitAndDraw(contFrontImg, ccx, ccy, contScale);
                } else {
                    fitAndDraw(charImg, charCx, charCy, charScale);
                }
            } else {
                const cont = TOPO_CONTAINERS[cc] || TOPO_CONTAINERS.scatola;
                const g = {
                    cx: (posConfig.inside ? 0.5 : 0.64) * cw,
                    cy: 0.56 * ch,
                    w: baseSize * 1.3,
                    h: baseSize * 1.05
                };
                const drawChar = posConfig.inside
                    ? ((px, py, sc) => fitAndDraw(charImg, px, py, sc))
                    : null;
                cont.draw(ctx, g, drawChar);
                if (!posConfig.inside) fitAndDraw(charImg, charCx, charCy, charScale);
            }
        } else {
            const refCx = posConfig.refPos[0] * cw;
            const refCy = posConfig.refPos[1] * ch;
            if (drawCharLast) {
                fitAndDraw(refImg, refCx, refCy, refScale);
                fitAndDraw(charImg, charCx, charCy, charScale);
            } else {
                fitAndDraw(charImg, charCx, charCy, charScale);
                fitAndDraw(refImg, refCx, refCy, refScale);
            }
        }

        area.innerHTML = '';
        area.appendChild(canvas);
    };

    charImg.crossOrigin = 'anonymous';
    refImg.crossOrigin = 'anonymous';
    charImg.onload = onBothLoaded;
    refImg.onload = onBothLoaded;
    charImg.onerror = () => { charImg.src = getPlaceholderUrl(tc.currentChar.label); };
    refImg.onerror = () => { refImg.src = getPlaceholderUrl(tc.currentRef.label); };
    charImg.src = charUrl;
    if (!isContainer) refImg.src = refUrl;
    if (isItemCont) {
        contBaseImg.crossOrigin = 'anonymous';
        contFrontImg.crossOrigin = 'anonymous';
        contBaseImg.onload = onBothLoaded;
        contFrontImg.onload = onBothLoaded;
        contBaseImg.onerror = onBothLoaded;  // count anyway; fitAndDraw skips broken images
        contFrontImg.onerror = onBothLoaded;
        contBaseImg.src = cc.item.maskedUrl || cc.item.url;
        if (posConfig.inside) contFrontImg.src = cc.item.frontMaskUrl;
    }
}

function _topoCompAdvance() {
    const tc = state._topoCompState;
    if (!tc) return;
    tc.index++;
    tc.round++;
    if (tc.index >= tc.items.length) {
        tc.items = [...tc.items].sort(() => Math.random() - 0.5);
        tc.index = 0;
    }
    // Pre-scontorno next batch
    _topoCompPreScontorno(tc.items.slice(tc.index, tc.index + 4));
    _topoCompPrepareRound();
}

window._topoCompHandleScore = (result) => {
    const tc = state._topoCompState;
    if (!tc) return;
    const pos = tc.currentPosition;
    const resultKey = `topocomp_${tc.round}_${pos}_${Date.now()}`;
    state.session.itemResults[resultKey] = result;
    state.session.scoreHistory.push(resultKey);

    if (!tc.positionStats[pos]) tc.positionStats[pos] = { correct: 0, prompts: 0, incorrect: 0, total: 0 };
    const ps = tc.positionStats[pos];
    ps.total++;
    if (result === true) ps.correct++;
    else if (result === 'prompt') ps.prompts++;
    else ps.incorrect++;

    setTimeout(() => {
        _topoCompAdvance();
        _topoCompRender(document.getElementById('game-stage'));
        if (typeof window._startTDCountdown === 'function') window._startTDCountdown();
    }, 350);
};

window.topoCompSkip = () => {
    _topoCompAdvance();
    _topoCompRender(document.getElementById('game-stage'));
};

window.topoCompToggleSubMode = () => {
    const tc = state._topoCompState;
    if (!tc) return;
    tc.subMode = tc.subMode === 'random' ? 'template' : 'random';
    try { localStorage.setItem('topo_comp_submode', tc.subMode); } catch(e) {}
    _topoCompPrepareRound();
    _topoCompRender(document.getElementById('game-stage'));
};

window.topoCompToggleAnswer = () => {
    const tc = state._topoCompState;
    if (!tc) return;
    const order = ['off', 'cat', 'full'];
    tc.hintMode = order[(order.indexOf(tc.hintMode || 'off') + 1) % order.length];
    try { localStorage.setItem('topo_comp_hint', tc.hintMode); } catch (e) {}
    _topoCompRender(document.getElementById('game-stage'));
};

window.topoCompSelectPersonaggio = () => {
    const tc = state._topoCompState;
    if (!tc) return;
    const stage = document.getElementById('game-stage');

    const noneCell = `<div onclick="topoCompPickPersonaggio(-1)" style="cursor:pointer; padding:6px; border:3px dashed ${tc.personaggio ? 'rgba(255,255,255,0.25)' : 'var(--accent-color)'}; border-radius:var(--radius-md); background:rgba(255,255,255,0.03); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; min-height:88px;">
        <i class="fa-solid fa-shuffle" style="font-size:1.4rem; color:var(--text-secondary);"></i>
        <div style="font-size:0.65rem; color:var(--text-secondary); text-align:center;">Nessuno<br>(full random)</div>
    </div>`;

    const gridHtml = noneCell + tc.items.map((item, idx) => {
        const url = item.maskedUrl || imgUrl(item);
        const isSelected = tc.personaggio && tc.personaggio.label === item.label && tc.personaggio.url === item.url;
        return `<div onclick="topoCompPickPersonaggio(${idx})" style="cursor:pointer; padding:6px; border:3px solid ${isSelected ? 'var(--accent-color)' : 'transparent'}; border-radius:var(--radius-md); background:rgba(255,255,255,0.05); display:flex; flex-direction:column; align-items:center; gap:4px;">
            <img src="${url}" style="width:60px; height:60px; object-fit:contain;" onerror="handleImgError(this, '${(item.label || '').replace(/'/g, "\\'")}')">
            <div style="font-size:0.65rem; color:var(--text-secondary); text-align:center;">${item.label || ''}</div>
        </div>`;
    }).join('');

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column;">
        <div style="padding:12px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10;">
            <span style="font-size:0.9rem; font-weight:bold;"><i class="fa-solid fa-child"></i> Scegli Personaggio</span>
            <span style="font-size:0.68rem; color:var(--text-secondary);">tocca di nuovo quello attivo per deselezionarlo</span>
            <button class="btn btn-sm btn-ghost" onclick="topoCompClosePersonaggio()" style="padding:3px 10px; font-size:0.7rem;">
                <i class="fa-solid fa-xmark"></i> Chiudi
            </button>
        </div>
        <div style="flex:1; overflow-y:auto; padding:14px; display:grid; grid-template-columns:repeat(auto-fill, minmax(80px, 1fr)); gap:10px; align-content:start;">
            ${gridHtml}
        </div>
    </div>`;
};

window.topoCompPickPersonaggio = (idx) => {
    const tc = state._topoCompState;
    if (!tc) return;
    const chosen = idx >= 0 ? tc.items[idx] : null;
    const isSame = chosen && tc.personaggio && tc.personaggio.label === chosen.label && tc.personaggio.url === chosen.url;
    if (!chosen || isSame) {
        // "Nessuno" or tapping the active personaggio again: back to full random
        tc.personaggio = null;
        tc.subMode = 'random';
        try { localStorage.setItem('topo_comp_submode', 'random'); } catch(e) {}
    } else {
        tc.personaggio = chosen;
        tc.subMode = 'template';
        try { localStorage.setItem('topo_comp_submode', 'template'); } catch(e) {}
    }
    _topoCompPrepareRound();
    _topoCompRender(document.getElementById('game-stage'));
};

window.topoCompClosePersonaggio = () => {
    _topoCompRender(document.getElementById('game-stage'));
};

window.topoCompOpenSettings = async () => {
    const tc = state._topoCompState;
    if (!tc) return;
    const allPos = Object.keys(TOPO_POSITIONS);
    const enabled = new Set(tc.enabledPositions);

    const overlay = document.createElement('div');
    overlay.className = 'themed-dialog-overlay';
    const checkboxes = allPos.map(k => {
        const p = TOPO_POSITIONS[k];
        return `<label style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer;">
            <input type="checkbox" value="${k}" ${enabled.has(k) ? 'checked' : ''} style="width:18px; height:18px;">
            <i class="fa-solid ${p.icon}" style="width:20px; text-align:center;"></i>
            <span>${p.label}</span>
        </label>`;
    }).join('');

    overlay.innerHTML = `
        <div class="themed-dialog" style="max-width:340px;">
            <div class="themed-dialog-msg" style="margin-bottom:8px;"><b>Posizioni attive</b></div>
            <div style="display:flex; flex-direction:column; max-height:50vh; overflow-y:auto;">
                ${checkboxes}
            </div>
            <div class="themed-dialog-btns" style="margin-top:12px;">
                <button class="btn btn-ghost themed-dialog-cancel">Annulla</button>
                <button class="btn btn-primary themed-dialog-ok">OK</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const ok = overlay.querySelector('.themed-dialog-ok');
    const cancel = overlay.querySelector('.themed-dialog-cancel');

    const close = (save) => {
        if (save) {
            const checked = [...overlay.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
            if (checked.length > 0) {
                tc.enabledPositions = checked;
                try { localStorage.setItem('topo_comp_positions', JSON.stringify({ v: 2, enabled: checked })); } catch(e) {}
            }
        }
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    };
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
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
    // Populate the top set dropdown with the lists for this engine
    _refreshQuadernoDropdown(isTaskMode);

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; overflow:hidden;">
        <div id="quaderno-content" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary);">
        </div>
    </div>`;
    const content = document.getElementById('quaderno-content');

    // Restore previous quaderno state (e.g. after keyboard attach reload).
    // Rows and steps survive independently, so a sheet in progress in the
    // other quaderno mode is not lost when switching engines.
    const restored = _restoreQuadernoState();
    if (isTaskMode) {
        // The stored name/setId belong to the other mode's sheet: start clean
        if (restored && state._quadernoType !== 'task') { state._quadernoName = ''; state._quadernoSetId = null; }
        state._quadernoType = 'task';
        if ((state._quadernoSteps || []).length > 0) { renderQuadernoTask(content); return; }
        openQuadernoSheet('task');
    } else {
        if (restored && state._quadernoType !== 'general') { state._quadernoName = ''; state._quadernoSetId = null; }
        state._quadernoType = 'general';
        if ((state._quadernoRows || []).length > 0) { renderQuadernoGeneral(content); return; }
        openQuadernoSheet('general');
    }
}

// (Re)populate the top set dropdown for the given quaderno kind
function _refreshQuadernoDropdown(isTaskMode) {
    const sets = state.savedSets.filter(s => {
        if (!s.modes) return false;
        return isTaskMode
            ? s.modes.includes('quaderno_task')
            : s.modes.includes('quaderno') && !s.modes.includes('quaderno_task');
    });
    _populateQuadernoDropdown(sets, isTaskMode);
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
            const coverThumb = s.coverImage
                ? `<div class="set-item-thumb"><img src="${s.coverImage}" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"></div>`
                : `<div class="set-item-thumb" style="background:rgba(99,102,241,0.15);"><i class="fa-solid fa-clipboard-list" style="color:var(--accent-color);"></i></div>`;
            html += `<div class="set-dropdown-item" onclick="loadQuadernoSet('${s.id}')" style="cursor:pointer;">
                ${coverThumb}
                <div class="set-item-info">
                    <div class="set-item-name">${s.name}</div>
                    <div class="set-item-meta"><span class="set-item-count">${s.items.length} attivit&agrave;</span></div>
                </div>
                <button class="set-item-data-btn" onclick="event.stopPropagation(); uploadSetCoverImage('${s.id}')" title="${s.coverImage ? 'Cambia copertina' : 'Immagine copertina'}" style="color:${s.coverImage ? 'var(--success-color)' : 'var(--accent-color)'};"><i class="fa-solid fa-image"></i></button>
                ${s.coverImage ? `<button class="set-item-data-btn" onclick="event.stopPropagation(); removeSetCoverImage('${s.id}')" title="Rimuovi copertina" style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>`;
        });
    }

    if (taskSets.length > 0) {
        html += `<div class="set-dropdown-group-label" style="top:0; color:var(--warning-color); border-color:rgba(245,158,11,0.15);"><span><i class="fa-solid fa-list-check"></i> Task Analysis</span><span style="opacity:0.5; font-size:0.6rem;">${taskSets.length}</span></div>`;
        taskSets.forEach(s => {
            const coverThumb = s.coverImage
                ? `<div class="set-item-thumb"><img src="${s.coverImage}" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"></div>`
                : `<div class="set-item-thumb" style="background:rgba(245,158,11,0.15);"><i class="fa-solid fa-list-check" style="color:var(--warning-color);"></i></div>`;
            html += `<div class="set-dropdown-item" onclick="loadQuadernoSet('${s.id}')" style="cursor:pointer;">
                ${coverThumb}
                <div class="set-item-info">
                    <div class="set-item-name">${s.name}</div>
                    <div class="set-item-meta"><span class="set-item-count">${s.items.length} passaggi</span></div>
                </div>
                <button class="set-item-data-btn" onclick="event.stopPropagation(); uploadSetCoverImage('${s.id}')" title="${s.coverImage ? 'Cambia copertina' : 'Immagine copertina'}" style="color:${s.coverImage ? 'var(--success-color)' : 'var(--warning-color)'};"><i class="fa-solid fa-image"></i></button>
                ${s.coverImage ? `<button class="set-item-data-btn" onclick="event.stopPropagation(); removeSetCoverImage('${s.id}')" title="Rimuovi copertina" style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>`;
        });
    }

    panel.innerHTML = html;
}

// --- Cover image upload for quaderni / task analysis / any set ---
window.uploadSetCoverImage = (setId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            const resized = await _resizeCoverImage(dataUrl, 300);
            const s = state.savedSets.find(x => x.id === setId);
            if (!s) return;
            s.coverImage = resized;
            await DB.saveSet(s);
            state.savedSets = await DB.getAllSets();
            if (typeof filterSetsByMode === 'function') filterSetsByMode();
            if (typeof renderLibList === 'function') renderLibList();
            if (typeof _refreshQuadernoDropdown === 'function' && s.modes && s.modes.some(m => m.startsWith('quaderno'))) {
                _refreshQuadernoDropdown(s.modes.includes('quaderno_task'));
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

window.removeSetCoverImage = async (setId) => {
    const s = state.savedSets.find(x => x.id === setId);
    if (!s) return;
    delete s.coverImage;
    await DB.saveSet(s);
    state.savedSets = await DB.getAllSets();
    if (typeof filterSetsByMode === 'function') filterSetsByMode();
    if (typeof renderLibList === 'function') renderLibList();
    if (typeof _refreshQuadernoDropdown === 'function' && s.modes && s.modes.some(m => m.startsWith('quaderno'))) {
        _refreshQuadernoDropdown(s.modes.includes('quaderno_task'));
    }
};

function _resizeCoverImage(dataUrl, maxSize) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
            else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = dataUrl;
    });
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

// Collect the saved quaderno lists of the given kind from IndexedDB sets and
// legacy localStorage lists, deduped by name (sets win). Used by the in-sheet
// loader and by the side quaderno panel.
function getQuadernoListChoices(isTask) {
    const out = [];
    const seen = new Set();
    (state.savedSets || []).forEach(s => {
        if (!s.modes) return;
        const matches = isTask
            ? s.modes.includes('quaderno_task')
            : s.modes.includes('quaderno') && !s.modes.includes('quaderno_task');
        if (!matches) return;
        out.push({ key: 'set:' + s.id, name: s.name, count: (s.items || []).length });
        seen.add((s.name || '').toLowerCase().trim());
    });
    getSavedQuadernoLists().forEach(l => {
        if ((l.type === 'task') !== isTask) return;
        const nm = (l.name || '').toLowerCase().trim();
        if (seen.has(nm)) return;
        out.push({ key: 'local:' + l.name, name: l.name, count: (l.items || []).length });
        seen.add(nm);
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Load a list picked from the in-sheet selector. Replaces the current sheet,
// so ask first if it holds unsaved scored LUs.
window.loadQuadernoListChoice = async (key) => {
    if (!key) return;
    const rows = state._quadernoType === 'task' ? (state._quadernoSteps || []) : (state._quadernoRows || []);
    const hasData = rows.some(r => r.results && r.results.length > 0);
    if (hasData) {
        const msg = 'Caricare la lista? I punteggi non salvati della scheda corrente andranno persi.';
        const ok = typeof themedConfirm === 'function' ? await themedConfirm(msg) : confirm(msg);
        if (!ok) return;
    }
    if (key.startsWith('set:')) loadQuadernoSet(key.slice(4));
    else if (key.startsWith('local:')) loadQuadernoList(key.slice(6));
};

// --- Load saved list (legacy localStorage) ---
window.loadQuadernoList = (name) => {
    if (!name) return;
    const lists = getSavedQuadernoLists();
    const list = lists.find(l => l.name === name);
    if (!list) return;

    const content = document.getElementById('quaderno-content');
    state._quadernoName = list.name;
    // Adopt the matching IndexedDB set (same name + kind) so editing a legacy
    // list and saving UPDATES that list instead of creating a duplicate.
    const wantMode = list.type === 'task' ? 'quaderno_task' : 'quaderno';
    const twin = state.savedSets.find(s => s.name === list.name && s.modes && s.modes.includes(wantMode));
    state._quadernoSetId = twin ? twin.id : null;

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
    const s = state.savedSets.find(x => String(x.id) === String(setId));
    if (!s) return;

    const content = document.getElementById('quaderno-content');
    const isTask = s.modes && s.modes.includes('quaderno_task');

    state._quadernoName = s.name;
    state._quadernoSetId = s.id;

    const mapItem = item => ({
        name: item.name || item.label || item.l || '',
        results: [],
        ...(item.sessionType ? { sessionType: item.sessionType } : {})
    });

    if (isTask) {
        state._quadernoType = 'task';
        state._quadernoSteps = s.items.map(mapItem);
        state._taskCurrentStep = 0;
        state._taskCycleCount = 0;
        renderQuadernoTask(content);
    } else {
        state._quadernoType = 'general';
        state._quadernoRows = s.items.map(mapItem);
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
    const listChoices = getQuadernoListChoices(false);

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-name-input', savedNames, {
                value: state._quadernoName || '',
                placeholder: 'Nome lista (es. Seduta 15 Feb)',
                style: 'min-width:150px; padding:8px 12px; border-radius:8px; font-size:0.9rem;'
            })}
            ${listChoices.length > 0 ? `
            <select onchange="loadQuadernoListChoice(this.value); this.value='';" title="Carica una lista salvata" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem; max-width:180px;">
                <option value="">&#128194; Carica lista...</option>
                ${listChoices.map(c => `<option value="${c.key.replace(/"/g, '&quot;')}">${c.name} (${c.count})</option>`).join('')}
            </select>` : ''}
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
            <select id="quaderno-session-type" onchange="onQuadernoTypeChange()" title="Tipo predefinito per nuovi item" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
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
    const rowType = row.sessionType || sessionType;
    const isTD = rowType === 'timedelay';

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
            <button onclick="toggleQuadernoRowType(${idx})" style="padding:2px 8px; border-radius:6px; border:1px solid ${isTD ? 'var(--warning-color)' : 'rgba(99,102,241,0.5)'}; background:${isTD ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.1)'}; color:${isTD ? 'var(--warning-color)' : 'var(--accent-color)'}; font-size:0.65rem; font-weight:bold; cursor:pointer; white-space:nowrap;" title="Cambia tipo sessione">${isTD ? 'TD' : 'IND'}</button>
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
    state._quadernoRows.push({ name, results: [], sessionType: getQuadernoSessionType() });
    input.value = '';
    renderQuadernoGeneral(document.getElementById('quaderno-content'));
};

window.toggleQuadernoRowType = (idx) => {
    _syncQuadernoName();
    const rows = state._quadernoType === 'general' ? state._quadernoRows : state._quadernoSteps;
    if (!rows || !rows[idx]) return;
    rows[idx].sessionType = (rows[idx].sessionType || 'independent') === 'independent' ? 'timedelay' : 'independent';
    const content = document.getElementById('quaderno-content');
    if (state._quadernoType === 'general') renderQuadernoGeneral(content);
    else renderQuadernoTask(content);
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
            taskSteps.push({ name: step.name, results: [...res], v: vCount, p: pCount, x: xCount, na: naCount, scored, sessionType: step.sessionType || type });
        });

        if (totalScored === 0) return alert("Nessun LU registrato (esclusi N/A).");

        const nameInput = document.getElementById('quaderno-name-input');
        const taskName = (nameInput ? nameInput.value.trim() : '') || 'Task Analysis';

        // Determine overall session type from per-step types
        const stepTypes = new Set(taskSteps.map(s => s.sessionType));
        const overallType = stepTypes.size === 1 ? [...stepTypes][0] : 'mixed';

        const sessionData = {
            date: now,
            setId: 'quaderno_task_' + taskName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
            setName: taskName,
            mode: 'quaderno_task',
            correct: totalCorrect,
            prompts: totalP,
            total: totalScored,
            percentage: Math.round((totalCorrect / totalScored) * 100),
            sessionType: overallType,
            rawV: totalCorrect,
            rawP: totalP,
            rawX: totalX,
            taskSteps: taskSteps // Per-step detail for dashboard analysis
        };
        if (overallType === 'timedelay' || overallType === 'mixed') {
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
            // Merge taskSteps BY NAME (not by index/length): a list updated with
            // new steps keeps merging into the same session — matching steps
            // accumulate, steps added later are appended instead of forcing a
            // separate, duplicated activity.
            if (existing.taskSteps) {
                const exByName = {};
                existing.taskSteps.forEach(st => { if (st && st.name) exByName[st.name] = st; });
                taskSteps.forEach(ns => {
                    const ex = exByName[ns.name];
                    if (ex) {
                        ex.results = (ex.results || []).concat(ns.results || []);
                        ex.v = (ex.v || 0) + ns.v;
                        ex.p = (ex.p || 0) + ns.p;
                        ex.x = (ex.x || 0) + ns.x;
                        ex.na = (ex.na || 0) + ns.na;
                        ex.scored = (ex.scored || 0) + ns.scored;
                    } else {
                        existing.taskSteps.push({ ...ns, results: [...(ns.results || [])] });
                    }
                });
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
        if (typeof filterSetsByMode === 'function') filterSetsByMode();
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

            const rowType = row.sessionType || type;
            const sessionData = {
                date: now,
                setId: 'quaderno_' + row.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
                setName: row.name,
                mode: 'quaderno',
                correct: rawV,
                prompts: rawP,
                total: total,
                percentage: Math.round((rawV / total) * 100),
                sessionType: rowType,
                rawV: rawV,
                rawP: rawP,
                rawX: rawX
            };
            if (rowType === 'timedelay') {
                sessionData.timeDelaySeconds = tdSeconds;
            }
            p.history.push(sessionData);
        });

        await DB.savePatient(p);
        _clearQuadernoState();
        if (typeof filterSetsByMode === 'function') filterSetsByMode();
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

    // A loaded set is updated ONLY if its name is unchanged: renaming the
    // sheet saves it as a brand-new list, preserving the original template.
    let setId = state._quadernoSetId || null;
    let existingSet = setId ? state.savedSets.find(s => String(s.id) === String(setId)) : null;
    if (existingSet && existingSet.name !== name) {
        existingSet = null;
        setId = null;
    }

    if (!existingSet) {
        // Same name as another list of this kind → confirm before overwriting
        const sameName = state.savedSets.find(s => s.name === name && s.modes && s.modes.includes(modeTag));
        if (sameName) {
            const msg = `Esiste già una lista "${name}". Sovrascriverla?`;
            const ok = typeof themedConfirm === 'function' ? await themedConfirm(msg) : confirm(msg);
            if (!ok) return;
            existingSet = sameName;
            setId = sameName.id;
        }
    }

    const setData = {
        id: setId || Date.now().toString(),
        name: name,
        category: state._quadernoType === 'task' ? 'Task Analysis' : 'Quaderno',
        items: rows.map(r => ({ label: r.name, name: r.name, ...(r.sessionType ? { sessionType: r.sessionType } : {}) })),
        modes: [modeTag],
        tags: (existingSet && existingSet.tags) || [],
        date: new Date().toLocaleDateString(),
        isClinical: false
    };
    if (existingSet && existingSet.coverImage) setData.coverImage = existingSet.coverImage;
    if (existingSet && existingSet.sortOrder != null) setData.sortOrder = existingSet.sortOrder;

    await DB.saveSet(setData);
    state.savedSets = await DB.getAllSets();
    state._quadernoSetId = setData.id;
    state._quadernoName = name;

    // Also save to localStorage for backward compat
    const list = { name, type: state._quadernoType, items: rows.map(r => ({ name: r.name, ...(r.sessionType ? { sessionType: r.sessionType } : {}) })) };
    saveQuadernoList(list);

    // Refresh the top dropdown so the saved list is immediately loadable
    _refreshQuadernoDropdown(state._quadernoType === 'task');

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
    const listChoices = getQuadernoListChoices(true);

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center; flex-wrap:wrap;">
            ${customAutocompleteHtml('quaderno-name-input', savedNames, {
                value: state._quadernoName || '',
                placeholder: 'Nome Task Analysis (es. Memory - Procedura)',
                style: 'min-width:150px; padding:8px 12px; border-radius:8px; font-size:0.9rem;'
            })}
            ${listChoices.length > 0 ? `
            <select onchange="loadQuadernoListChoice(this.value); this.value='';" title="Carica un task salvato" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem; max-width:180px;">
                <option value="">&#128194; Carica task...</option>
                ${listChoices.map(c => `<option value="${c.key.replace(/"/g, '&quot;')}">${c.name} (${c.count})</option>`).join('')}
            </select>` : ''}
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
    const stepType = step.sessionType || sessionType;
    const isTD = stepType === 'timedelay';

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
                            stroke-dasharray="${2 * Math.PI * 28}" stroke-dashoffset="0" stroke-linecap="round"/>
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
            <button onclick="toggleQuadernoRowType(${idx})" style="padding:2px 8px; border-radius:6px; border:1px solid ${isTD ? 'var(--warning-color)' : 'rgba(99,102,241,0.5)'}; background:${isTD ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.1)'}; color:${isTD ? 'var(--warning-color)' : 'var(--accent-color)'}; font-size:0.65rem; font-weight:bold; cursor:pointer; white-space:nowrap;" title="Cambia tipo sessione">${isTD ? 'TD' : 'IND'}</button>
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
    state._quadernoSteps.push({ name, results: [], sessionType: getQuadernoSessionType() });
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
            progress.style.strokeDashoffset = String(circumference * (1 - remaining));
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

// ============================================================
// === MEMORIA DI LAVORO (Working Memory) ===
// ============================================================

const MEM_LAV_THEMES = {
    cubetti: {
        label: 'Cubetti Colorati',
        icon: 'fa-cube',
        items: [
            { id: 'red', label: 'Rosso', color: '#ef4444', emoji: '🟥' },
            { id: 'blue', label: 'Blu', color: '#3b82f6', emoji: '🟦' },
            { id: 'green', label: 'Verde', color: '#22c55e', emoji: '🟩' },
            { id: 'yellow', label: 'Giallo', color: '#eab308', emoji: '🟨' },
            { id: 'purple', label: 'Viola', color: '#a855f7', emoji: '🟪' },
            { id: 'orange', label: 'Arancione', color: '#f97316', emoji: '🟧' },
            { id: 'pink', label: 'Rosa', color: '#ec4899', emoji: '💗' },
            { id: 'cyan', label: 'Celeste', color: '#06b6d4', emoji: '🩵' }
        ],
        buildVisual: (sequence, container) => {
            container.innerHTML = '';
            const tower = document.createElement('div');
            tower.style.cssText = 'display:flex; flex-direction:column-reverse; align-items:center; gap:2px; transition:all 0.3s;';
            sequence.forEach((item, i) => {
                const block = document.createElement('div');
                block.style.cssText = `width:${60 - i * 2}px; height:30px; background:${item.color}; border-radius:4px; border:2px solid rgba(255,255,255,0.3); display:flex; align-items:center; justify-content:center; font-size:0.7rem; color:white; font-weight:bold; animation:memLavSlideIn 0.3s ease ${i * 0.1}s both;`;
                block.textContent = item.emoji;
                tower.appendChild(block);
            });
            container.appendChild(tower);
        }
    },
    panino: {
        label: 'Panino',
        icon: 'fa-burger',
        useSvg: true,
        items: [
            // ONE bread item: it renders as bottom slice, top bun or middle slice
            // automatically, depending on where it sits in the sandwich.
            { id: 'bread', label: 'Pane', color: '#d9a066', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M6,32 Q6,3 60,3 Q114,3 114,32 Z" fill="#d9a066" stroke="#b87d3f" stroke-width="2"/><ellipse cx="40" cy="16" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="60" cy="11" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="80" cy="16" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="50" cy="22" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="70" cy="22" rx="2" ry="1.4" fill="#fff4d6"/></svg>', svgTop: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M6,32 Q6,3 60,3 Q114,3 114,32 Z" fill="#d9a066" stroke="#b87d3f" stroke-width="2"/><ellipse cx="40" cy="16" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="60" cy="11" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="80" cy="16" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="50" cy="22" rx="2" ry="1.4" fill="#fff4d6"/><ellipse cx="70" cy="22" rx="2" ry="1.4" fill="#fff4d6"/></svg>', svgBottom: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M6,6 L114,6 L114,20 Q114,30 60,30 Q6,30 6,20 Z" fill="#e0b070" stroke="#b87d3f" stroke-width="2"/></svg>', svgMid: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><rect x="6" y="8" width="108" height="18" rx="8" fill="#e8c17e" stroke="#b87d3f" stroke-width="2"/><ellipse cx="45" cy="17" rx="2" ry="1.3" fill="#fff4d6"/><ellipse cx="75" cy="17" rx="2" ry="1.3" fill="#fff4d6"/></svg>' },
            { id: 'lettuce', label: 'Insalata', color: '#7cb342', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M3,18 Q12,3 21,15 Q30,1 39,15 Q48,3 57,15 Q66,1 75,15 Q84,3 93,15 Q102,1 117,18 L117,28 Q60,34 3,28 Z" fill="#8bc34a" stroke="#558b2f" stroke-width="1.5"/></svg>' },
            { id: 'tomato', label: 'Pomodoro', color: '#e74c3c', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><rect x="6" y="8" width="108" height="18" rx="9" fill="#e74c3c" stroke="#c0392b" stroke-width="1.5"/><circle cx="35" cy="17" r="2.2" fill="#ffcabf"/><circle cx="60" cy="17" r="2.2" fill="#ffcabf"/><circle cx="85" cy="17" r="2.2" fill="#ffcabf"/></svg>' },
            { id: 'cheese', label: 'Formaggio', color: '#f5c542', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M4,10 L116,10 L110,24 Q60,28 6,24 Z" fill="#f5c542" stroke="#d4a017" stroke-width="1.5"/><circle cx="30" cy="17" r="2.5" fill="#e0a800"/><circle cx="62" cy="16" r="3" fill="#e0a800"/><circle cx="90" cy="18" r="2" fill="#e0a800"/></svg>' },
            { id: 'hamburger', label: 'Hamburger', color: '#8d5524', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M8,14 Q10,7 22,7 Q30,4 40,7 Q52,4 62,7 Q74,4 84,7 Q98,5 112,14 Q114,17 112,20 L112,25 Q60,32 8,25 L8,20 Q6,17 8,14 Z" fill="#7a4a1e" stroke="#4e2f12" stroke-width="1.4"/><ellipse cx="34" cy="15" rx="3" ry="1.6" fill="#5e3817"/><ellipse cx="60" cy="13" rx="3.4" ry="1.7" fill="#5e3817"/><ellipse cx="86" cy="15" rx="3" ry="1.6" fill="#5e3817"/><path d="M14,22 Q60,27 106,22" stroke="#4e2f12" stroke-width="1.5" fill="none" opacity="0.5"/></svg>' },
            { id: 'egg', label: 'Uovo', color: '#fffaf0', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M14,18 Q8,8 22,9 Q30,2 44,9 Q60,4 78,9 Q96,5 104,12 Q116,16 104,24 Q60,30 16,24 Q8,22 14,18 Z" fill="#fffaf0" stroke="#f0e6d2" stroke-width="1"/><circle cx="62" cy="17" r="7" fill="#ffb300"/></svg>' },
            { id: 'mayo', label: 'Maionese', color: '#fff8e1', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><path d="M5,16 Q14,9 23,16 Q32,9 41,16 Q50,9 59,16 Q68,9 77,16 Q86,9 95,16 Q104,9 115,16 L115,23 Q60,27 5,23 Z" fill="#fff8e1" stroke="#ffe082" stroke-width="1.2"/></svg>' },
            { id: 'cucumber', label: 'Cetriolo', color: '#aed581', svg: '<svg viewBox="0 0 120 34" style="width:100%;height:100%;display:block;"><circle cx="28" cy="17" r="9" fill="#c5e1a5" stroke="#7cb342" stroke-width="1.5"/><circle cx="60" cy="17" r="9" fill="#c5e1a5" stroke="#7cb342" stroke-width="1.5"/><circle cx="92" cy="17" r="9" fill="#c5e1a5" stroke="#7cb342" stroke-width="1.5"/><circle cx="28" cy="17" r="3" fill="#aed581"/><circle cx="60" cy="17" r="3" fill="#aed581"/><circle cx="92" cy="17" r="3" fill="#aed581"/></svg>' }
        ],
        buildVisual: (sequence, container) => {
            container.innerHTML = '';
            const stack = document.createElement('div');
            stack.style.cssText = 'display:flex; flex-direction:column; align-items:center; transition:all 0.3s;';
            // Build bottom-up like a real sandwich: the first tapped item is the
            // base, the last is on top (consistent with the cubetti tower).
            const topFirst = [...sequence].reverse();
            topFirst.forEach((item, vi) => {
                const seqIdx = sequence.length - 1 - vi;
                const layer = document.createElement('div');
                layer.style.cssText = `width:130px; height:26px; margin-top:${vi === 0 ? '0' : '-4px'}; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.2)); animation:memLavSlideIn 0.3s ease ${seqIdx * 0.1}s both;`;
                let svg = item.svg;
                if (item.id === 'bread') {
                    svg = seqIdx === sequence.length - 1 ? item.svgTop
                        : seqIdx === 0 ? item.svgBottom
                        : item.svgMid;
                }
                layer.innerHTML = svg || `<div style="width:100%;height:100%;background:${item.color};border-radius:4px;"></div>`;
                stack.appendChild(layer);
            });
            container.appendChild(stack);
        }
    },
    animali: {
        label: 'Animali in Fila',
        icon: 'fa-paw',
        items: [
            { id: 'dog', label: 'Cane', color: '#a16207', emoji: '🐕' },
            { id: 'cat', label: 'Gatto', color: '#f97316', emoji: '🐈' },
            { id: 'rabbit', label: 'Coniglio', color: '#d1d5db', emoji: '🐇' },
            { id: 'bird', label: 'Uccello', color: '#3b82f6', emoji: '🐦' },
            { id: 'fish', label: 'Pesce', color: '#06b6d4', emoji: '🐟' },
            { id: 'turtle', label: 'Tartaruga', color: '#22c55e', emoji: '🐢' },
            { id: 'butterfly', label: 'Farfalla', color: '#a855f7', emoji: '🦋' },
            { id: 'ladybug', label: 'Coccinella', color: '#ef4444', emoji: '🐞' }
        ],
        buildVisual: (sequence, container) => {
            container.innerHTML = '';
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:6px; justify-content:center; flex-wrap:wrap; transition:all 0.3s;';
            sequence.forEach((item, i) => {
                const spot = document.createElement('div');
                spot.style.cssText = `font-size:2rem; animation:memLavSlideIn 0.3s ease ${i * 0.15}s both;`;
                spot.textContent = item.emoji;
                row.appendChild(spot);
            });
            container.appendChild(row);
        }
    }
};

// Render an item's visual content (SVG for panino, emoji otherwise)
function _memLavItemContent(item, sizePx) {
    if (item.svg) {
        return `<div style="width:${sizePx}px; height:${Math.round(sizePx * 0.34)}px; display:flex; align-items:center; justify-content:center;">${item.svg}</div>`;
    }
    return `<span style="font-size:${Math.round(sizePx * 0.5)}px; line-height:1;">${item.emoji}</span>`;
}

function _memLavShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function renderMemoriaLavoro(items, stage) {
    const savedTheme = state._memLavState?.theme || 'cubetti';
    const savedSpan = state._memLavState?.span || 3;

    state._memLavState = {
        theme: savedTheme,
        span: savedSpan,
        phase: 'setup',
        clinicianSequence: [],
        childResponse: [],
        trials: [],
        currentTrial: 0
    };

    state.session = { correct: 0, incorrect: 0, prompts: 0, total: 0, active: true, itemResults: {}, scoreHistory: [] };

    _renderMemLavSetup(stage);
}

function _renderMemLavSetup(stage) {
    const ml = state._memLavState;
    const theme = MEM_LAV_THEMES[ml.theme];
    const type = typeof getSelectedSessionType === 'function' ? getSelectedSessionType() : 'standard';
    const isTimeDelay = type === 'timedelay';

    let themeButtons = Object.entries(MEM_LAV_THEMES).map(([k, v]) =>
        `<button onclick="state._memLavState.theme='${k}'; _renderMemLavSetup(document.getElementById('game-stage'));"
                style="padding:8px 16px; border-radius:10px; border:2px solid ${k === ml.theme ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}; background:${k === ml.theme ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'}; color:${k === ml.theme ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${k === ml.theme ? 'bold' : 'normal'}; font-size:0.85rem;">
            <i class="fa-solid ${v.icon}"></i> ${v.label}
        </button>`
    ).join('');

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; padding:20px; overflow-y:auto;">
        <div style="text-align:center; margin-bottom:20px;">
            <h3 style="margin:0 0 8px; color:var(--accent-color);"><i class="fa-solid fa-cubes-stacked"></i> Memoria di Lavoro</h3>
            <p style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Seleziona il tema e lo span, poi tocca gli item per impostare la sequenza.</p>
        </div>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:16px;">
            ${themeButtons}
        </div>
        <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:20px;">
            <span style="font-size:0.85rem; color:var(--text-secondary);">Span:</span>
            <button onclick="_memLavAdjustSpan(-1)" style="width:32px; height:32px; border-radius:50%; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:white; cursor:pointer; font-size:1rem;">-</button>
            <span id="memlav-span-display" style="font-size:1.5rem; font-weight:bold; color:var(--accent-color); min-width:30px; text-align:center;">${ml.span}</span>
            <button onclick="_memLavAdjustSpan(1)" style="width:32px; height:32px; border-radius:50%; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:white; cursor:pointer; font-size:1rem;">+</button>
        </div>
        <div style="text-align:center; margin-bottom:16px;">
            <span style="font-size:0.75rem; color:var(--text-secondary); background:rgba(${isTimeDelay ? '245,158,11' : '16,185,129'},0.15); padding:3px 10px; border-radius:6px; color:${isTimeDelay ? 'var(--warning-color)' : 'var(--success-color)'};">
                ${isTimeDelay ? '<i class="fa-solid fa-clock"></i> Time Delay: errore = giallo, 1 correzione' : '<i class="fa-solid fa-check"></i> Indipendente: errore = sbagliato'}
            </span>
        </div>
        <div style="text-align:center;">
            <button class="btn btn-primary" onclick="_memLavStartTrial()" style="padding:12px 30px; font-size:1rem; border-radius:12px;">
                <i class="fa-solid fa-play"></i> Inizia Trial
            </button>
        </div>
    </div>
    <style>
        @keyframes memLavSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes memLavPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }
        @keyframes memLavShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-5px); } 75% { transform:translateX(5px); } }
    </style>`;
}

window._memLavAdjustSpan = (delta) => {
    const ml = state._memLavState;
    ml.span = Math.max(2, Math.min(8, ml.span + delta));
    const el = document.getElementById('memlav-span-display');
    if (el) el.textContent = ml.span;
};

window._memLavStartTrial = () => {
    const ml = state._memLavState;
    ml.phase = 'clinician';
    ml.clinicianSequence = [];
    ml.childResponse = [];
    const stage = document.getElementById('game-stage');
    _renderMemLavClinicianPhase(stage);
};

function _renderMemLavClinicianPhase(stage) {
    const ml = state._memLavState;
    const theme = MEM_LAV_THEMES[ml.theme];
    const remaining = ml.span - ml.clinicianSequence.length;

    const itemsHtml = theme.items.map(item =>
        `<button class="memlav-item-btn" onclick="_memLavClinicianTap('${item.id}')"
                style="width:78px; height:78px; border-radius:14px; border:2px solid ${item.color}40; background:${item.color}20;
                       display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all 0.15s; padding:4px;">
            ${_memLavItemContent(item, 62)}
            <span style="font-size:0.6rem; color:${item.color}; margin-top:3px;">${item.label}</span>
        </button>`
    ).join('');

    const seqPreview = ml.clinicianSequence.map((item, i) =>
        `<span style="display:inline-flex; align-items:center; justify-content:center; width:38px; height:32px; border-radius:8px; background:${item.color}30; border:1px solid ${item.color}50; overflow:hidden;">${_memLavItemContent(item, 32)}</span>`
    ).join('');

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column;">
        <div style="padding:10px; background:rgba(99,102,241,0.1); border-bottom:1px solid rgba(99,102,241,0.2); flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.85rem; font-weight:bold; color:var(--accent-color);">
                    <i class="fa-solid fa-hand-pointer"></i> Tocca gli item in ordine (${remaining} rimanent${remaining === 1 ? 'e' : 'i'})
                </span>
                <span style="font-size:0.75rem; color:var(--text-secondary);">
                    <i class="fa-solid ${theme.icon}"></i> ${theme.label} · Span ${ml.span}
                </span>
            </div>
            <div style="display:flex; gap:4px; margin-top:8px; min-height:36px; align-items:center;">
                ${seqPreview || '<span style="font-size:0.75rem; color:var(--text-secondary); opacity:0.5;">Tocca gli item...</span>'}
                ${ml.clinicianSequence.length > 0 ? `<button onclick="_memLavUndoClinicianTap()" style="margin-left:auto; padding:4px 8px; border-radius:6px; border:1px solid rgba(239,68,68,0.3); background:transparent; color:var(--danger-color); cursor:pointer; font-size:0.7rem;"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
            </div>
        </div>
        <div id="memlav-clin-visual" style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:10px; overflow:hidden;"></div>
        <div style="flex-shrink:0; display:flex; flex-wrap:wrap; gap:10px; padding:10px 16px 16px; justify-content:center; border-top:1px solid rgba(255,255,255,0.06);">
            ${itemsHtml}
        </div>
        ${ml.clinicianSequence.length === ml.span ? `
        <div style="padding:12px; background:rgba(16,185,129,0.1); border-top:1px solid rgba(16,185,129,0.2); text-align:center; flex-shrink:0;">
            <button class="btn btn-primary" onclick="_memLavStartChildPhase()" style="padding:10px 30px; font-size:0.95rem; border-radius:10px; background:var(--success-color);">
                <i class="fa-solid fa-child"></i> Sequenza pronta — Turno del bambino
            </button>
        </div>` : ''}
    </div>
    <style>
        @keyframes memLavSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .memlav-item-btn:active { transform:scale(0.92); }
    </style>`;

    // Live large preview: the sequence being built renders centre-stage with
    // the theme's own visual (sandwich stacking up, tower growing...), exactly
    // like the child's phase — much clearer than the small chips alone.
    const vc = document.getElementById('memlav-clin-visual');
    if (vc) {
        if (ml.clinicianSequence.length > 0) theme.buildVisual(ml.clinicianSequence, vc);
        else vc.innerHTML = '<span style="font-size:0.85rem; color:var(--text-secondary); opacity:0.5;">La sequenza apparir\u00e0 qui man mano che la costruisci</span>';
    }
}

window._memLavClinicianTap = (itemId) => {
    const ml = state._memLavState;
    if (ml.clinicianSequence.length >= ml.span) return;
    const theme = MEM_LAV_THEMES[ml.theme];
    const item = theme.items.find(i => i.id === itemId);
    if (!item) return;
    ml.clinicianSequence.push({ ...item });
    const stage = document.getElementById('game-stage');
    _renderMemLavClinicianPhase(stage);
};

window._memLavUndoClinicianTap = () => {
    const ml = state._memLavState;
    ml.clinicianSequence.pop();
    const stage = document.getElementById('game-stage');
    _renderMemLavClinicianPhase(stage);
};

window._memLavStartChildPhase = () => {
    const ml = state._memLavState;
    ml.phase = 'child';
    ml.childResponse = [];
    ml.positionAttempts = new Array(ml.span).fill(0);
    ml.positionErrors = new Array(ml.span).fill(0);
    ml._waitingCorrection = false;
    const stage = document.getElementById('game-stage');
    _renderMemLavChildPhase(stage);
};

function _renderMemLavChildPhase(stage) {
    const ml = state._memLavState;
    const theme = MEM_LAV_THEMES[ml.theme];
    const type = typeof getSelectedSessionType === 'function' ? getSelectedSessionType() : 'standard';
    const isTimeDelay = type === 'timedelay';
    const responded = ml.childResponse.length;
    const remaining = ml.span - responded;
    const currentPos = responded;

    // Randomize button order every render so the child must serialize, not track position
    const shuffledItems = _memLavShuffle(theme.items);
    const itemsHtml = shuffledItems.map(item => {
        return `<button class="memlav-child-btn" onclick="_memLavChildTap('${item.id}')"
                style="width:84px; height:84px; border-radius:16px; border:2px solid ${item.color}50; background:${item.color}15;
                       display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all 0.15s; padding:4px;"
                id="memlav-btn-${item.id}">
            ${_memLavItemContent(item, 66)}
            <span style="font-size:0.65rem; color:${item.color}; margin-top:3px;">${item.label}</span>
        </button>`;
    }).join('');

    const visualContainer = `<div id="memlav-visual" style="min-height:100px; display:flex; align-items:center; justify-content:center;"></div>`;

    const responsePreview = ml.childResponse.map((item, i) => {
        const errors = ml.positionErrors[i] || 0;
        const borderColor = errors === 0 ? 'rgba(16,185,129,0.5)' : (isTimeDelay ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.5)');
        const errBadge = errors > 0 && !isTimeDelay ? `<span style="position:absolute; top:-4px; right:-4px; font-size:0.5rem; background:#ef4444; color:white; border-radius:50%; width:14px; height:14px; display:flex; align-items:center; justify-content:center;">${errors}</span>` : '';
        return `<span style="position:relative; display:inline-flex; align-items:center; justify-content:center; width:38px; height:32px; border-radius:8px; background:${item.color}30; border:2px solid ${borderColor}; overflow:hidden;">${_memLavItemContent(item, 32)}${errBadge}</span>`;
    }).join('');

    const posIndicators = [];
    for (let i = 0; i < ml.span; i++) {
        if (i < responded) {
            posIndicators.push(`<span style="width:8px; height:8px; border-radius:50%; background:var(--success-color);"></span>`);
        } else if (i === currentPos) {
            posIndicators.push(`<span style="width:10px; height:10px; border-radius:50%; background:var(--accent-color); animation:memLavPulse 1s infinite;"></span>`);
        } else {
            posIndicators.push(`<span style="width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.15);"></span>`);
        }
    }

    const attemptsInfo = currentPos < ml.span && ml.positionErrors[currentPos] > 0
        ? `<span style="font-size:0.7rem; color:${isTimeDelay ? 'var(--warning-color)' : 'var(--danger-color)'}; margin-left:8px;">${ml.positionErrors[currentPos]} err</span>`
        : '';

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column;">
        <div style="padding:10px; background:rgba(168,85,247,0.1); border-bottom:1px solid rgba(168,85,247,0.2); flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.85rem; font-weight:bold; color:#a855f7;">
                    <i class="fa-solid fa-child"></i> Posizione ${currentPos + 1}/${ml.span}${attemptsInfo}
                </span>
                <span style="font-size:0.75rem; color:var(--text-secondary);">
                    Trial ${ml.trials.length + 1} · Span ${ml.span}
                </span>
            </div>
            <div style="display:flex; gap:4px; margin-top:8px; min-height:36px; align-items:center;">
                ${responsePreview || `<div style="display:flex; gap:4px; align-items:center;">${posIndicators.join('')}</div>`}
                ${responded > 0 ? `<span style="margin-left:6px; display:flex; gap:3px; align-items:center;">${posIndicators.slice(responded).join('')}</span>` : ''}
            </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; padding:15px; overflow-y:auto;">
            ${visualContainer}
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; align-items:center;">
                ${itemsHtml}
            </div>
        </div>
    </div>
    <style>
        @keyframes memLavSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes memLavPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
        @keyframes memLavShake { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-6px); } 40% { transform:translateX(6px); } 60% { transform:translateX(-4px); } 80% { transform:translateX(4px); } }
        .memlav-child-btn:active { transform:scale(0.9); }
    </style>`;

    ml._lastWrongId = null;

    const vc = document.getElementById('memlav-visual');
    if (vc && ml.childResponse.length > 0) {
        theme.buildVisual(ml.childResponse, vc);
    }
}

window._memLavChildTap = (itemId) => {
    const ml = state._memLavState;
    if (ml.phase !== 'child') return;
    if (ml._animating) return;
    const theme = MEM_LAV_THEMES[ml.theme];
    const item = theme.items.find(i => i.id === itemId);
    if (!item) return;

    const type = typeof getSelectedSessionType === 'function' ? getSelectedSessionType() : 'standard';
    const isTimeDelay = type === 'timedelay';
    const idx = ml.childResponse.length;
    const expected = ml.clinicianSequence[idx];

    ml.positionAttempts[idx] = (ml.positionAttempts[idx] || 0) + 1;

    if (item.id === expected.id) {
        ml.childResponse.push({ ...item });
        if (ml.childResponse.length === ml.span) {
            _memLavCompleteTrial();
        } else {
            const stage = document.getElementById('game-stage');
            _renderMemLavChildPhase(stage);
        }
    } else {
        ml.positionErrors[idx] = (ml.positionErrors[idx] || 0) + 1;
        ml._lastWrongId = itemId;
        ml._animating = true;

        const btn = document.getElementById('memlav-btn-' + itemId);
        if (btn) {
            const color = isTimeDelay ? '#f59e0b' : '#ef4444';
            btn.style.borderColor = color;
            btn.style.boxShadow = `0 0 15px ${color}80`;
            btn.style.animation = 'memLavShake 0.4s';
        }

        setTimeout(() => {
            ml._animating = false;
            const stage = document.getElementById('game-stage');
            _renderMemLavChildPhase(stage);
        }, 500);
    }
};

function _showMemLavFeedback(container, type, text) {
    const colors = { success: '#10b981', warning: '#f59e0b', danger: '#ef4444' };
    const color = colors[type] || colors.danger;
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:100; pointer-events:none;`;
    overlay.innerHTML = `<div style="font-size:1.5rem; font-weight:bold; color:${color}; animation:memLavPulse 0.5s;">${text}</div>`;
    container.style.position = 'relative';
    container.appendChild(overlay);
    setTimeout(() => overlay.remove(), 700);
}

function _memLavCompleteTrial() {
    const ml = state._memLavState;
    const stage = document.getElementById('game-stage');
    const type = typeof getSelectedSessionType === 'function' ? getSelectedSessionType() : 'standard';
    const isTimeDelay = type === 'timedelay';

    const totalErrors = ml.positionErrors.reduce((s, e) => s + e, 0);

    // Score one LUS per position: correct=V, with errors → P (time delay) or X (independent)
    const trialNum = ml.trials.length + 1;
    const positionResults = [];
    for (let i = 0; i < ml.span; i++) {
        const errs = ml.positionErrors[i] || 0;
        let posResult;
        if (errs === 0) posResult = true;
        else if (isTimeDelay) posResult = 'prompt';
        else posResult = false;
        positionResults.push(posResult);
        const resultKey = `memlav_t${trialNum}_p${i}_${Date.now()}`;
        state.session.itemResults[resultKey] = posResult;
        state.session.scoreHistory.push(resultKey);
    }

    // Overall trial outcome for display
    const result = positionResults.every(r => r === true) ? true
                 : (isTimeDelay ? 'prompt' : false);

    const trialData = {
        sequence: ml.clinicianSequence.map(i => i.id),
        response: ml.childResponse.map(i => i.id),
        result: result,
        span: ml.span,
        positionAttempts: [...ml.positionAttempts],
        positionErrors: [...ml.positionErrors],
        positionResults: positionResults,
        totalErrors: totalErrors
    };
    ml.trials.push(trialData);

    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.prompts = results.filter(v => v === 'prompt').length;
    state.session.total = results.length;
    if (typeof updateScoreUI === 'function') updateScoreUI();

    const feedbackType = result === true ? 'success' : result === 'prompt' ? 'warning' : 'danger';
    const feedbackText = result === true ? 'Perfetto!' : result === 'prompt' ? `Completato con aiuto (${totalErrors} err)` : `Completato con ${totalErrors} error${totalErrors > 1 ? 'i' : 'e'}`;
    _showMemLavFeedback(stage, feedbackType, feedbackText);

    document.getElementById('btn-save-session').classList.remove('hidden');
    if (typeof showSessionNameInput === 'function') showSessionNameInput();

    setTimeout(() => {
        _renderMemLavTrialResult(stage);
    }, 1000);
}

function _renderMemLavTrialResult(stage) {
    const ml = state._memLavState;
    const theme = MEM_LAV_THEMES[ml.theme];
    const lastTrial = ml.trials[ml.trials.length - 1];
    const resultIcon = lastTrial.result === true ? '<i class="fa-solid fa-check-circle" style="color:var(--success-color);"></i>' :
                       lastTrial.result === 'prompt' ? '<i class="fa-solid fa-exclamation-circle" style="color:var(--warning-color);"></i>' :
                       '<i class="fa-solid fa-times-circle" style="color:var(--danger-color);"></i>';

    const trialsSummary = ml.trials.map((t, i) => {
        const icon = t.result === true ? '✅' : t.result === 'prompt' ? '🟡' : '❌';
        const errText = t.totalErrors > 0 ? ` (${t.totalErrors}err)` : '';
        return `<span style="font-size:0.85rem;">${icon} T${i + 1} span${t.span}${errText}</span>`;
    }).join(' &middot; ');

    const seqHtml = ml.clinicianSequence.map(item =>
        `<span style="display:inline-flex; align-items:center; width:40px; height:18px; vertical-align:middle;">${_memLavItemContent(item, 38)}</span>`
    ).join(' ');

    const posDetailHtml = lastTrial.sequence.map((id, i) => {
        const item = theme.items.find(it => it.id === id);
        const errors = lastTrial.positionErrors[i] || 0;
        const attempts = lastTrial.positionAttempts[i] || 1;
        const posRes = lastTrial.positionResults ? lastTrial.positionResults[i] : (errors === 0);
        const isP = posRes === 'prompt';
        const bgColor = errors === 0 ? 'rgba(16,185,129,0.1)' : (isP ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)');
        const borderClr = errors === 0 ? 'rgba(16,185,129,0.3)' : (isP ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)');
        const tagClr = errors === 0 ? 'var(--success-color)' : (isP ? 'var(--warning-color)' : 'var(--danger-color)');
        const tagTxt = errors === 0 ? '✓ V' : (isP ? `P · ${errors} err` : `X · ${errors} err`);
        return `<div style="display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:6px; background:${bgColor}; border:1px solid ${borderClr};">
            <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:bold;">${i + 1}.</span>
            <span style="display:inline-flex; align-items:center; width:44px; height:18px;">${item ? _memLavItemContent(item, 42) : '?'}</span>
            <span style="font-size:0.75rem; color:${tagClr}; font-weight:bold; margin-left:auto;">${tagTxt} · ${attempts} tent.</span>
        </div>`;
    }).join('');

    stage.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; padding:20px; overflow-y:auto;">
        <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:2rem; margin-bottom:8px;">${resultIcon}</div>
            <div style="font-size:1rem; font-weight:bold; color:white;">Trial ${ml.trials.length} completato</div>
            <div style="margin-top:8px; font-size:0.85rem; color:var(--text-secondary);">Sequenza: ${seqHtml}</div>
            ${lastTrial.totalErrors > 0 ? `<div style="margin-top:6px; font-size:0.8rem; color:var(--warning-color);">${lastTrial.totalErrors} errori totali</div>` : ''}
        </div>
        <div style="margin-bottom:16px;">
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:bold;"><i class="fa-solid fa-list-ol"></i> Dettaglio per posizione:</div>
            <div style="display:flex; flex-direction:column; gap:3px;">${posDetailHtml}</div>
        </div>
        <div id="memlav-result-visual" style="display:flex; align-items:center; justify-content:center; margin-bottom:16px;"></div>
        <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Storico trial:</div>
            <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">${trialsSummary}</div>
        </div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="_memLavStartTrial()" style="padding:10px 24px; font-size:0.95rem; border-radius:10px;">
                <i class="fa-solid fa-redo"></i> Nuovo Trial (Span ${ml.span})
            </button>
            <button class="btn btn-ghost" onclick="state._memLavState.span = Math.min(8, state._memLavState.span + 1); _memLavStartTrial();" style="padding:10px 20px; font-size:0.85rem; border-radius:10px; border-color:rgba(16,185,129,0.3); color:var(--success-color);">
                <i class="fa-solid fa-arrow-up"></i> Span +1
            </button>
            <button class="btn btn-ghost" onclick="state._memLavState.span = Math.max(2, state._memLavState.span - 1); _memLavStartTrial();" style="padding:10px 20px; font-size:0.85rem; border-radius:10px; border-color:rgba(239,68,68,0.3); color:var(--danger-color);">
                <i class="fa-solid fa-arrow-down"></i> Span -1
            </button>
            <button class="btn btn-ghost" onclick="_renderMemLavSetup(document.getElementById('game-stage'));" style="padding:10px 20px; font-size:0.85rem; border-radius:10px;">
                <i class="fa-solid fa-gear"></i> Impostazioni
            </button>
        </div>
    </div>`;

    const vc = document.getElementById('memlav-result-visual');
    if (vc) {
        const fullItems = lastTrial.sequence.map(id => theme.items.find(i => i.id === id));
        theme.buildVisual(fullItems, vc);
    }
}

window._memLavHandleScore = (result) => {
    // Score handling is done internally by _memLavCompleteTrial
    // This function exists as a hook for the main scoring system
};

