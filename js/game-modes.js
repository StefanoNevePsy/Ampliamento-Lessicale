// === GAME MODE RENDERERS ===

function getPlaceholderUrl(label) {
    return `https://placehold.co/600x600?text=${encodeURIComponent(label || '?')}`;
}

function handleImgError(img, label) {
    img.onerror = null;
    img.src = getPlaceholderUrl(label);
}

function renderGameMode(mode, items) {
    const stage = document.getElementById('game-stage');
    stage.innerHTML = '';
    // Clean up any previous drag handlers
    if (window._topoCleanup) { window._topoCleanup(); window._topoCleanup = null; }
    if (mode === 'tact') renderTact(items, stage);
    else if (mode === 'ran') renderRan(items, stage);
    else if (mode === 'tombola') renderTombola(items, stage);
    else if (mode === 'tombola_sonora') renderTombolaSonora(items, stage);
    else if (mode === 'memory') renderMemory(items, stage);
    else if (mode === 'search_find' || mode === 'intraverbal_scenari') renderSearchFind(items, stage);
    else if (mode === 'pool_random' || mode === 'pool_intraverbal') renderPoolRandom(items, stage);
    else if (mode === 'intruso') renderIntruso(items, stage);
    else if (mode === 'topologia') renderTopologia(items, stage);
    else if (mode === 'sequenze') renderSequenze(items, stage);
    else if (mode === 'categorizzazione') renderCategorizzazione(items, stage);
    else if (mode === 'zoom') renderZoom(items, stage);
    else if (mode === 'quaderno') renderQuaderno(stage);
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
    window.nextTact = () => { state.tactIndex = (state.tactIndex + 1) % items.length; showCard(); };
    showCard();
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

window.nextRan = () => { if (state.ranIndex < state.ranDisplayItems.length - 1) { state.ranIndex++; updateRanContent(); } };
window.prevRan = () => { if (state.ranIndex > 0) { state.ranIndex--; updateRanContent(); } };

// --- TOMBOLA ---
function renderTombola(items, stage) {
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

    if (isCorrect) {
        cardEl.classList.add('matched');
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(16,185,129,0.4)';
        state.deck.shift();
        document.getElementById('deck-target').innerHTML = getDeckHtml();
    } else {
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(239,68,68,0.4)';
        setTimeout(() => {
            cardEl.style.border = '';
            cardEl.style.boxShadow = '';
        }, 600);
    }

    // Auto-score in session
    if (state.session.active) {
        const key = `tombola_${Date.now()}`;
        state.session.itemResults[key] = isCorrect;
        const results = Object.values(state.session.itemResults);
        state.session.correct = results.filter(v => v === true).length;
        state.session.incorrect = results.filter(v => v === false).length;
        state.session.total = results.length;
        updateScoreUI();
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
    state.poolAllItems.sort(() => Math.random() - 0.5);
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

    if (card.isIntruder) {
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(16,185,129,0.5)';
        state.session.itemResults[state.intrusoRound] = true;
    } else {
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(239,68,68,0.5)';
        state.session.itemResults[state.intrusoRound] = false;
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
    state.session.total = results.length;
    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');

    // Generate next round after delay (infinite)
    setTimeout(() => {
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
            img.onerror = function() { handleImgError(this, item.label); };

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

// --- SEQUENZE (Temporal Ordering) ---
function renderSequenze(items, stage) {
    const ordered = items.map((item, idx) => ({ ...item, originalIndex: idx }));
    const shuffled = [...ordered].sort(() => Math.random() - 0.5);
    state.sequenzeItems = shuffled;
    state.sequenzeSelected = [];

    const cols = Math.ceil(Math.sqrt(shuffled.length));
    const rows = Math.ceil(shuffled.length / cols);

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-arrow-down-1-9"></i> Metti in ordine
            </span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">Tocca le immagini nell'ordine corretto</span>
            <button class="btn btn-sm btn-ghost" onclick="resetSequenze()" style="padding:4px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
            <button class="btn btn-sm btn-primary" onclick="checkSequenze()" style="padding:4px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-check"></i> Verifica
            </button>
        </div>
        <div id="seq-grid" style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(${cols}, 1fr);
                    grid-template-rows:repeat(${rows}, minmax(80px, 1fr));
                    gap:10px; overflow-y:auto;">
            ${shuffled.map((item, idx) => `
                <div class="card-grid" id="seq-${idx}" onclick="selectSequenze(${idx})"
                     style="aspect-ratio:unset; height:auto; min-height:0; min-width:0; overflow:visible; cursor:pointer; position:relative;">
                    <img src="${item.url || getPlaceholderUrl(item.label)}"
                         style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;"
                         onerror="handleImgError(this, '${item.label}')">
                    <div id="seq-badge-${idx}" style="display:none; position:absolute; top:-5px; left:-5px; background:var(--accent-color); color:white; width:28px; height:28px; border-radius:50%; font-weight:bold; font-size:0.85rem; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>
                </div>
            `).join('')}
        </div>
    </div>`;
}

window.selectSequenze = (idx) => {
    // If already selected, deselect (remove from order)
    const pos = state.sequenzeSelected.indexOf(idx);
    if (pos >= 0) {
        state.sequenzeSelected.splice(pos, 1);
        // Rebuild all badges
        state.sequenzeItems.forEach((_, i) => {
            const badge = document.getElementById(`seq-badge-${i}`);
            const card = document.getElementById(`seq-${i}`);
            const selPos = state.sequenzeSelected.indexOf(i);
            if (selPos >= 0) {
                badge.style.display = 'flex';
                badge.textContent = selPos + 1;
                card.style.border = '2px solid var(--accent-color)';
            } else {
                badge.style.display = 'none';
                card.style.border = '';
                card.style.opacity = '1';
            }
        });
        return;
    }

    state.sequenzeSelected.push(idx);
    const badge = document.getElementById(`seq-badge-${idx}`);
    const card = document.getElementById(`seq-${idx}`);
    badge.style.display = 'flex';
    badge.textContent = state.sequenzeSelected.length;
    card.style.border = '2px solid var(--accent-color)';
};

window.resetSequenze = () => {
    state.sequenzeSelected = [];
    state.sequenzeItems.forEach((_, i) => {
        const badge = document.getElementById(`seq-badge-${i}`);
        const card = document.getElementById(`seq-${i}`);
        if (badge) badge.style.display = 'none';
        if (card) {
            card.style.border = '';
            card.style.opacity = '1';
            card.style.boxShadow = '';
        }
    });
};

window.checkSequenze = () => {
    if (state.sequenzeSelected.length !== state.sequenzeItems.length) {
        alert(`Seleziona tutti gli item (${state.sequenzeSelected.length}/${state.sequenzeItems.length})`);
        return;
    }

    let correct = 0;
    state.sequenzeSelected.forEach((shuffledIdx, userPos) => {
        const item = state.sequenzeItems[shuffledIdx];
        const card = document.getElementById(`seq-${shuffledIdx}`);
        const badge = document.getElementById(`seq-badge-${shuffledIdx}`);
        if (item.originalIndex === userPos) {
            correct++;
            card.style.border = '3px solid var(--success-color)';
            card.style.boxShadow = '0 0 15px rgba(16,185,129,0.4)';
            badge.style.background = 'var(--success-color)';
        } else {
            card.style.border = '3px solid var(--danger-color)';
            card.style.boxShadow = '0 0 15px rgba(239,68,68,0.4)';
            badge.style.background = 'var(--danger-color)';
        }
    });

    // Record score in session
    if (state.session.active) {
        state.session.correct = correct;
        state.session.total = state.sequenzeItems.length;
        state.session.incorrect = state.session.total - correct;
        state.session.itemResults = {};
        state.sequenzeSelected.forEach((shuffledIdx, userPos) => {
            state.session.itemResults[userPos] = state.sequenzeItems[shuffledIdx].originalIndex === userPos;
        });
        updateScoreUI();
        document.getElementById('btn-save-session').classList.remove('hidden');
        if (typeof showSessionNameInput === 'function') showSessionNameInput();
    }
};

// --- CATEGORIZZAZIONE (Sorting by Tag) ---
function renderCategorizzazione(items, stage) {
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

    allItems.sort(() => Math.random() - 0.5);
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

    state.session.itemResults[state.catIndex] = isCorrect;

    if (isCorrect) {
        card.style.border = '4px solid var(--success-color)';
        card.style.boxShadow = '0 0 30px rgba(16,185,129,0.5)';
    } else {
        card.style.border = '4px solid var(--danger-color)';
        card.style.boxShadow = '0 0 30px rgba(239,68,68,0.5)';
    }

    // Update score
    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.total = results.length;
    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');

    setTimeout(() => {
        state.catIndex++;
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
            <div class="sf-viewport" id="sf-viewport" onclick="placeMarker(event)">
                <img src="${s.url || getPlaceholderUrl(s.label)}" class="sf-image" onerror="handleImgError(this,'${s.label}')">
            </div>
        </div>`;
}

window.placeMarker = (e) => {
    const vp = document.getElementById('sf-viewport');
    const r = vp.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'marker-pin';
    m.style.left = (e.clientX - r.left) + 'px';
    m.style.top = (e.clientY - r.top) + 'px';
    m.onclick = (ev) => { ev.stopPropagation(); m.remove(); };
    vp.appendChild(m);
};

window.removeLastMarker = () => {
    const m = document.querySelectorAll('.marker-pin');
    if (m.length) m[m.length - 1].remove();
};

window.clearMarkers = () => {
    document.querySelectorAll('.marker-pin').forEach(e => e.remove());
};

// --- TOMBOLA SONORA (Audio matching) ---
function renderTombolaSonora(items, stage) {
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

    if (isCorrect) {
        cardEl.classList.add('matched');
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(16,185,129,0.4)';
        state.deck.shift();
        const remaining = document.getElementById('audio-remaining');
        if (remaining) remaining.textContent = state.deck.length > 0 ? state.deck.length + ' rimasti' : 'FINITO!';
        // Play next audio after delay
        if (state.deck.length > 0) {
            setTimeout(() => playCurrentAudio(), 800);
        }
    } else {
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 15px rgba(239,68,68,0.4)';
        setTimeout(() => {
            cardEl.style.border = '';
            cardEl.style.boxShadow = '';
        }, 600);
    }

    if (state.session.active) {
        const key = `tombola_sonora_${Date.now()}`;
        state.session.itemResults[key] = isCorrect;
        const results = Object.values(state.session.itemResults);
        state.session.correct = results.filter(v => v === true).length;
        state.session.incorrect = results.filter(v => v === false).length;
        state.session.total = results.length;
        updateScoreUI();
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
                <img id="zoom-img" src="${item.url}" style="display:block; width:100%; height:auto; transform-origin:${area.x + area.w/2}% ${area.y + area.h/2}%; transform:scale(${Math.round(100/area.w * 2.5)}); transition:transform 0.8s ease;" onerror="handleImgError(this, '${item.label}')">
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
// --- QUADERNO (Manual scoring + Task Analysis) ---
// ============================================================
function renderQuaderno(stage) {
    const savedLists = getSavedQuadernoLists();

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
                ${savedLists.length > 0 ? `
                    <select id="quaderno-load-select" onchange="loadQuadernoList(this.value)" style="padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem; max-width:200px;">
                        <option value="">-- Carica Lista Salvata --</option>
                        ${savedLists.map(l => `<option value="${l.name}">${l.name} (${l.type === 'task' ? 'Task' : 'Generale'})</option>`).join('')}
                    </select>
                ` : ''}
            </div>
        </div>
        <!-- Content area -->
        <div id="quaderno-content" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-secondary);">
            <i class="fa-solid fa-book-open fa-3x" style="margin-bottom:15px; opacity:0.3;"></i>
            <p style="text-align:center;">Scegli <b>Quaderno Generale</b> per registrare attivit&agrave; manuali<br>
            o <b>Task Analysis</b> per sequenze operazionalizzate.</p>
            ${savedLists.length > 0 ? '<p style="font-size:0.8rem; opacity:0.6;">Oppure carica una lista salvata dal menu sopra.</p>' : ''}
        </div>
    </div>`;
}

// --- Open a new Quaderno sheet ---
window.openQuadernoSheet = (type) => {
    const content = document.getElementById('quaderno-content');
    if (!content) return;

    if (type === 'general') {
        state._quadernoType = 'general';
        state._quadernoRows = [];
        state._quadernoName = '';
        renderQuadernoGeneral(content);
    } else if (type === 'task') {
        state._quadernoType = 'task';
        state._quadernoSteps = [];
        state._quadernoName = '';
        renderQuadernoTask(content);
    }
};

// --- Load saved list ---
window.loadQuadernoList = (name) => {
    if (!name) return;
    const lists = getSavedQuadernoLists();
    const list = lists.find(l => l.name === name);
    if (!list) return;

    const content = document.getElementById('quaderno-content');
    state._quadernoName = list.name;

    if (list.type === 'task') {
        state._quadernoType = 'task';
        state._quadernoSteps = list.items.map(item => ({ ...item, results: [] }));
        renderQuadernoTask(content);
    } else {
        state._quadernoType = 'general';
        state._quadernoRows = list.items.map(item => ({ ...item, results: [] }));
        renderQuadernoGeneral(content);
    }
};

// ============================================================
// QUADERNO GENERALE
// ============================================================
function renderQuadernoGeneral(container) {
    const rows = state._quadernoRows || [];
    const savedNames = getSavedQuadernoLists().filter(l => l.type !== 'task').map(l => l.name);

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
            <input type="text" id="quaderno-name-input" value="${state._quadernoName || ''}" placeholder="Nome lista (es. Seduta 15 Feb)"
                list="quaderno-names-list"
                style="flex:1; padding:8px 12px; border-radius:8px; font-size:0.9rem;">
            <datalist id="quaderno-names-list">
                ${savedNames.map(n => `<option value="${n}">`).join('')}
            </datalist>
        </div>

        <div id="quaderno-rows-list">
            ${rows.map((row, i) => renderQuadernoRow(row, i)).join('')}
        </div>

        <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
            <input type="text" id="quaderno-new-activity" placeholder="Nome attivit&agrave;..."
                list="quaderno-activity-names"
                onkeydown="if(event.key==='Enter')addQuadernoRow()"
                style="flex:1; padding:10px; border-radius:8px; font-size:0.9rem;">
            <datalist id="quaderno-activity-names">
                ${getUsedActivityNames().map(n => `<option value="${n}">`).join('')}
            </datalist>
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
}

function renderQuadernoRow(row, idx) {
    const res = row.results || [];
    const xCount = res.filter(r => r === false).length;
    const pCount = res.filter(r => r === 'prompt').length;
    const vCount = res.filter(r => r === true).length;
    const total = res.length;

    return `
    <div style="display:flex; flex-direction:column; gap:6px; padding:12px 14px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:14px; transition:0.2s;">
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="flex:1; font-size:1.05rem; font-weight:700;">${row.name}</span>
            <span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:3px 10px; border-radius:8px; font-size:0.85rem; font-weight:bold; min-width:35px; text-align:center;" title="Totale LU">${total}</span>
            <button onclick="undoQuadernoResult(${idx})" style="width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Annulla ultimo" ${total === 0 ? 'disabled style="opacity:0.3; width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:default; font-size:0.85rem; display:flex; align-items:center; justify-content:center;"' : ''}>
                <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button onclick="removeQuadernoRow(${idx})" style="width:34px; height:34px; border-radius:10px; border:none; background:transparent; color:#666; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Rimuovi riga">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center; align-items:stretch;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--danger-color);">${xCount}</span>
                <button onclick="addQuadernoLU(${idx}, false)" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--danger-color); background:rgba(239,68,68,0.15); color:var(--danger-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--warning-color);">${pCount}</span>
                <button onclick="addQuadernoLU(${idx}, 'prompt')" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--warning-color); background:rgba(245,158,11,0.15); color:var(--warning-color); cursor:pointer; font-size:1rem; font-weight:800; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    P
                </button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--success-color);">${vCount}</span>
                <button onclick="addQuadernoLU(${idx}, true)" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--success-color); background:rgba(16,185,129,0.15); color:var(--success-color); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        </div>
    </div>`;
}

// Add a LU to a quaderno row (append, not toggle)
window.addQuadernoLU = (idx, result) => {
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
    const input = document.getElementById('quaderno-new-activity');
    const name = input.value.trim();
    if (!name) return;
    state._quadernoRows.push({ name, results: [] });
    input.value = '';
    renderQuadernoGeneral(document.getElementById('quaderno-content'));
};

window.removeQuadernoRow = (idx) => {
    if (state._quadernoType === 'general') {
        state._quadernoRows.splice(idx, 1);
        renderQuadernoGeneral(document.getElementById('quaderno-content'));
    } else {
        state._quadernoSteps.splice(idx, 1);
        renderQuadernoTask(document.getElementById('quaderno-content'));
    }
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

// Save quaderno: show session type modal, then save each row as separate activity
window.saveQuadernoSession = async () => {
    if (!state.activePatientId) return alert("Seleziona prima un paziente.");
    const rows = state._quadernoType === 'task' ? state._quadernoSteps : state._quadernoRows;
    const scoredRows = rows.filter(r => r.results && r.results.length > 0);
    if (scoredRows.length === 0) return alert("Nessun LU registrato.");

    // Compute totals for summary
    let totalV = 0, totalP = 0, totalX = 0;
    scoredRows.forEach(row => {
        const res = row.results;
        totalV += res.filter(v => v === true).length;
        totalP += res.filter(v => v === 'prompt').length;
        totalX += res.filter(v => v === false).length;
    });

    state._pendingSave = { rawV: totalV, rawP: totalP, rawX: totalX, total: totalV + totalP + totalX };
    state._pendingQuadernoSave = scoredRows;

    // Show session type modal
    const modal = document.getElementById('modal-session-type');
    modal.style.display = 'flex';
    document.querySelector('input[name="session-type-radio"][value="independent"]').checked = true;
    updateSessionTypeUI();

    // Override doSaveSession temporarily for quaderno
    window._originalDoSave = window.doSaveSession;
    window.doSaveSession = async () => {
        const p = state.patients.find(x => x.id === state.activePatientId);
        const type = document.querySelector('input[name="session-type-radio"]:checked').value;
        if (!p) return;

        if (!p.history) p.history = [];
        const now = new Date().toISOString();
        let totalLU = 0, totalCorrect = 0;

        state._pendingQuadernoSave.forEach(row => {
            const res = row.results;
            const rawV = res.filter(v => v === true).length;
            const rawP = res.filter(v => v === 'prompt').length;
            const rawX = res.filter(v => v === false).length;
            const total = rawV + rawP + rawX;
            if (total === 0) return;

            let correct;
            if (type === 'independent') {
                correct = rawV; // P counts as X
            } else {
                correct = rawV; // Time Delay: only V = correct, X+P = prompted
            }

            totalLU += total;
            totalCorrect += correct;

            const sessionData = {
                date: now,
                setId: 'quaderno_' + row.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(),
                setName: row.name,
                mode: state._quadernoType === 'task' ? 'quaderno_task' : 'quaderno',
                correct: correct,
                prompts: rawP,
                total: total,
                percentage: Math.round((correct / total) * 100),
                sessionType: type,
                rawV: rawV,
                rawP: rawP,
                rawX: rawX
            };
            if (type === 'timedelay') {
                sessionData.timeDelaySeconds = parseInt(document.getElementById('timedelay-seconds').value) || 5;
            }
            p.history.push(sessionData);
        });

        await DB.savePatient(p);
        closeSessionTypeModal();
        state._pendingQuadernoSave = null;

        // Restore original doSaveSession
        window.doSaveSession = window._originalDoSave;
        delete window._originalDoSave;

        alert(`Sessione salvata!\n${state._pendingSave.total} LU, ${totalCorrect} corrette (${Math.round((totalCorrect/totalLU)*100)}%)`);
    };
};

// Save quaderno template for reuse
window.saveQuadernoTemplate = () => {
    const nameInput = document.getElementById('quaderno-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return alert("Inserisci un nome per la lista.");

    const rows = state._quadernoType === 'task' ? state._quadernoSteps : state._quadernoRows;
    if (rows.length === 0) return alert("Aggiungi almeno un'attivit\u00E0.");

    const list = {
        name: name,
        type: state._quadernoType,
        items: rows.map(r => ({ name: r.name }))
    };
    saveQuadernoList(list);
    alert(`Lista "${name}" salvata!`);
    renderQuaderno(document.getElementById('game-stage'));
    // Re-open the current sheet with data
    if (state._quadernoType === 'task') {
        openQuadernoSheet('task');
        state._quadernoName = name;
        state._quadernoSteps = rows;
        renderQuadernoTask(document.getElementById('quaderno-content'));
    } else {
        openQuadernoSheet('general');
        state._quadernoName = name;
        state._quadernoRows = rows;
        renderQuadernoGeneral(document.getElementById('quaderno-content'));
    }
};

// ============================================================
// QUADERNO TASK ANALYSIS
// ============================================================
function renderQuadernoTask(container) {
    const steps = state._quadernoSteps || [];
    const savedNames = getSavedQuadernoLists().filter(l => l.type === 'task').map(l => l.name);

    container.innerHTML = `
    <div style="width:100%; max-width:700px; margin:0 auto;">
        <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
            <input type="text" id="quaderno-name-input" value="${state._quadernoName || ''}" placeholder="Nome Task Analysis (es. Memory - Procedura)"
                list="quaderno-task-names-list"
                style="flex:1; padding:8px 12px; border-radius:8px; font-size:0.9rem;">
            <datalist id="quaderno-task-names-list">
                ${savedNames.map(n => `<option value="${n}">`).join('')}
            </datalist>
        </div>

        <!-- Legend -->
        <div style="display:flex; gap:12px; margin-bottom:10px; font-size:0.75rem; color:var(--text-secondary); justify-content:center;">
            <span><span style="color:var(--danger-color);">X</span> = Errore</span>
            <span><span style="color:var(--warning-color);">P</span> = Prompt</span>
            <span><span style="color:var(--success-color);">V</span> = Corretto</span>
            <span><span style="color:#888;">N/A</span> = Non Applicabile</span>
        </div>

        <div id="quaderno-steps-list">
            ${steps.map((step, i) => renderQuadernoTaskStep(step, i)).join('')}
        </div>

        <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
            <input type="text" id="quaderno-new-step" placeholder="Nuovo passaggio..."
                list="quaderno-step-names"
                onkeydown="if(event.key==='Enter')addQuadernoStep()"
                style="flex:1; padding:10px; border-radius:8px; font-size:0.9rem;">
            <datalist id="quaderno-step-names">
                ${getUsedActivityNames().map(n => `<option value="${n}">`).join('')}
            </datalist>
            <button class="btn btn-primary" onclick="addQuadernoStep()" style="padding:10px 16px;">
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
}

function renderQuadernoTaskStep(step, idx) {
    const res = step.results || [];
    const xCount = res.filter(r => r === false).length;
    const pCount = res.filter(r => r === 'prompt').length;
    const vCount = res.filter(r => r === true).length;
    const naCount = res.filter(r => r === 'na').length;
    const total = res.length;

    return `
    <div style="display:flex; flex-direction:column; gap:6px; padding:12px 14px; margin-bottom:8px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:14px; transition:0.2s;">
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:26px; height:26px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:bold; color:var(--text-secondary); flex-shrink:0;">${idx + 1}</span>
            <span style="flex:1; font-size:1.05rem; font-weight:700;">${step.name}</span>
            <span style="background:rgba(99,102,241,0.2); color:var(--accent-color); padding:3px 10px; border-radius:8px; font-size:0.85rem; font-weight:bold; min-width:35px; text-align:center;" title="Totale LU">${total}</span>
            <button onclick="undoQuadernoResult(${idx})" style="width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Annulla ultimo" ${total === 0 ? 'disabled style="opacity:0.3; width:34px; height:34px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:default; font-size:0.85rem; display:flex; align-items:center; justify-content:center;"' : ''}>
                <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button onclick="removeQuadernoRow(${idx})" style="width:34px; height:34px; border-radius:10px; border:none; background:transparent; color:#666; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center;" title="Rimuovi riga">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center; align-items:stretch;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--danger-color);">${xCount}</span>
                <button onclick="addQuadernoLU(${idx}, false)" style="width:48px; height:48px; border-radius:50%; border:2px solid var(--danger-color); background:rgba(239,68,68,0.15); color:var(--danger-color); cursor:pointer; font-size:1.1rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--warning-color);">${pCount}</span>
                <button onclick="addQuadernoLU(${idx}, 'prompt')" style="width:48px; height:48px; border-radius:50%; border:2px solid var(--warning-color); background:rgba(245,158,11,0.15); color:var(--warning-color); cursor:pointer; font-size:0.95rem; font-weight:800; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    P
                </button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:var(--success-color);">${vCount}</span>
                <button onclick="addQuadernoLU(${idx}, true)" style="width:48px; height:48px; border-radius:50%; border:2px solid var(--success-color); background:rgba(16,185,129,0.15); color:var(--success-color); cursor:pointer; font-size:1.1rem; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <span style="font-size:0.75rem; font-weight:bold; color:#888;">${naCount}</span>
                <button onclick="addQuadernoLU(${idx}, 'na')" style="width:48px; height:48px; border-radius:12px; border:1px solid #666; background:${naCount > 0 ? 'rgba(128,128,128,0.2)' : 'transparent'}; color:#888; cursor:pointer; font-size:0.65rem; font-weight:bold; display:flex; align-items:center; justify-content:center; transition:0.1s;" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'">
                    N/A
                </button>
            </div>
        </div>
    </div>`;
}

window.addQuadernoStep = () => {
    const input = document.getElementById('quaderno-new-step');
    const name = input.value.trim();
    if (!name) return;
    state._quadernoSteps.push({ name, results: [] });
    input.value = '';
    renderQuadernoTask(document.getElementById('quaderno-content'));
};
