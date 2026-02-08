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
    else if (mode === 'memory') renderMemory(items, stage);
    else if (mode === 'search_find') renderSearchFind(items, stage);
    else if (mode === 'pool_random') renderPoolRandom(items, stage);
    else if (mode === 'intruso') renderIntruso(items, stage);
    else if (mode === 'topologia') renderTopologia(items, stage);
    else if (mode === 'sequenze') renderSequenze(items, stage);
    else if (mode === 'categorizzazione') renderCategorizzazione(items, stage);
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
    if (state.deck.length === 0 || label !== state.deck[0].label) return;
    document.getElementById(`slot-${idx}`).classList.add('matched');
    state.deck.shift();
    document.getElementById('deck-target').innerHTML = getDeckHtml();
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

// --- POOL RANDOM ---
// Picks random items from all sets matching the selected tags,
// then renders them as TACT-style flashcards
function renderPoolRandom(items, stage) {
    if (!items || items.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-shuffle fa-3x" style="margin-bottom:15px;"></i>
                <p>Nessun item trovato per i tag selezionati.<br>Assicurati che i set abbiano immagini e tag assegnati.</p>
            </div>`;
        return;
    }

    state.tactIndex = 0;

    const showCard = () => {
        const item = items[state.tactIndex];
        const status = state.session.itemResults ? state.session.itemResults[state.tactIndex] : undefined;
        const feedbackClass = status === true ? 'feedback-success' : (status === false ? 'feedback-fail' : '');

        stage.innerHTML = `
        <div class="tact-stage" onclick="window.nextPoolCard()">
            <div class="tact-card-lg">
                <img src="${item.url || getPlaceholderUrl(item.label)}"
                     class="${feedbackClass}"
                     style="transition:0.3s;"
                     onerror="handleImgError(this, '${item.label}')">
                <div class="tact-title">${item.label}</div>
                <div style="font-size:0.8rem; color:#888; display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap;">
                    <span>${state.tactIndex + 1} / ${items.length}</span>
                    ${(item.sourceTags || []).map(t =>
                        `<span style="background:rgba(139,92,246,0.2); color:#a78bfa; padding:1px 8px; border-radius:10px; font-size:0.7rem;">${t}</span>`
                    ).join('')}
                </div>
            </div>
        </div>`;
    };

    window.nextPoolCard = () => {
        state.tactIndex = (state.tactIndex + 1) % items.length;
        showCard();
    };
    showCard();
}

// --- INTRUSO ---
// Shows 3 items from the same tag + 1 intruder from a different tag.
// The player must identify the intruder.
function renderIntruso(items, stage) {
    // items is ignored - we build rounds from tags
    const tags = state.selectedPoolTags;
    if (tags.length < 2) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-circle-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>La modalit&agrave; Intruso richiede almeno <b>2 tag diversi</b><br>per generare i distrattori.<br>Seleziona pi&ugrave; tag nel selettore.</p>
            </div>`;
        return;
    }

    // Build rounds
    const numStimuli = parseInt(document.getElementById('num-stimuli').value) || 10;
    const rounds = buildIntrusoRounds(tags, numStimuli);

    if (rounds.length === 0) {
        stage.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.5; text-align:center; padding:20px;">
                <i class="fa-solid fa-circle-xmark fa-3x" style="margin-bottom:15px;"></i>
                <p>Non ci sono abbastanza item con immagini<br>per generare le domande Intruso.</p>
            </div>`;
        return;
    }

    state.intrusoRounds = rounds;
    state.intrusoRound = 0;
    showIntrusoRound(stage);
}

function buildIntrusoRounds(tags, count) {
    const rounds = [];
    // Collect items per tag
    const tagItems = {};
    tags.forEach(tag => {
        tagItems[tag] = getItemsByTag(tag);
    });

    // Filter tags with enough items
    const validTags = tags.filter(t => tagItems[t].length >= 3);
    const distractorTags = tags.filter(t => tagItems[t].length >= 1);

    if (validTags.length === 0 || distractorTags.length < 2) return [];

    for (let i = 0; i < count; i++) {
        // Pick a random "target" tag
        const targetTag = validTags[Math.floor(Math.random() * validTags.length)];
        // Pick a different tag for the intruder
        const otherTags = distractorTags.filter(t => t !== targetTag);
        if (otherTags.length === 0) continue;
        const intruderTag = otherTags[Math.floor(Math.random() * otherTags.length)];

        // Pick 3 random items from target tag
        const shuffledTargets = [...tagItems[targetTag]].sort(() => Math.random() - 0.5);
        const targets = shuffledTargets.slice(0, 3);
        if (targets.length < 3) continue;

        // Pick 1 random item from intruder tag (different label from targets)
        const targetLabels = new Set(targets.map(t => t.label));
        const validIntruders = tagItems[intruderTag].filter(item => !targetLabels.has(item.label));
        if (validIntruders.length === 0) continue;
        const intruder = validIntruders[Math.floor(Math.random() * validIntruders.length)];

        // Combine and shuffle positions
        const cards = [...targets.map(t => ({ ...t, isIntruder: false, tag: targetTag })),
                       { ...intruder, isIntruder: true, tag: intruderTag }];
        cards.sort(() => Math.random() - 0.5);

        rounds.push({ targetTag, intruderTag, cards });
    }

    return rounds;
}

function showIntrusoRound(stage) {
    const round = state.intrusoRounds[state.intrusoRound];
    if (!round) return;

    const total = state.intrusoRounds.length;
    const current = state.intrusoRound + 1;

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Trova l'intruso!</span>
            <span style="background:rgba(139,92,246,0.2); color:#a78bfa; padding:2px 10px; border-radius:10px; font-size:0.75rem;">
                Categoria: ${round.targetTag}
            </span>
            <span style="color:var(--text-secondary); font-size:0.8rem;">${current}/${total}</span>
        </div>
        <div style="flex:1; min-height:0; padding:10px; display:grid;
                    grid-template-columns:repeat(2, 1fr);
                    grid-template-rows:repeat(2, minmax(80px, 1fr));
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
    const round = state.intrusoRounds[state.intrusoRound];
    if (!round) return;

    const card = round.cards[idx];
    const cardEl = document.getElementById(`intruso-${idx}`);

    if (card.isIntruder) {
        // Correct! This is the intruder
        cardEl.style.border = '4px solid var(--success-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(16,185,129,0.5)';
        state.session.itemResults[state.intrusoRound] = true;
    } else {
        // Wrong! Not the intruder
        cardEl.style.border = '4px solid var(--danger-color)';
        cardEl.style.boxShadow = '0 0 20px rgba(239,68,68,0.5)';
        state.session.itemResults[state.intrusoRound] = false;
        // Highlight the actual intruder
        round.cards.forEach((c, i) => {
            if (c.isIntruder) {
                const el = document.getElementById(`intruso-${i}`);
                el.style.border = '4px solid var(--warning-color)';
                el.style.boxShadow = '0 0 20px rgba(245,158,11,0.5)';
            }
        });
    }

    // Update score
    const results = Object.values(state.session.itemResults);
    state.session.correct = results.filter(v => v === true).length;
    state.session.incorrect = results.filter(v => v === false).length;
    state.session.total = results.length;
    updateScoreUI();
    document.getElementById('btn-save-session').classList.remove('hidden');

    // Move to next round after delay
    setTimeout(() => {
        state.intrusoRound++;
        if (state.intrusoRound < state.intrusoRounds.length) {
            showIntrusoRound(document.getElementById('game-stage'));
        } else {
            // All rounds done
            const stage = document.getElementById('game-stage');
            const pct = state.session.total > 0 ? Math.round((state.session.correct / state.session.total) * 100) : 0;
            stage.innerHTML = `
                <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px;">
                    <i class="fa-solid fa-flag-checkered fa-3x" style="margin-bottom:15px; color:var(--accent-color);"></i>
                    <h2 style="margin:10px 0;">Sessione Completata!</h2>
                    <p style="font-size:1.5rem; font-weight:bold; color:${pct >= 90 ? 'var(--success-color)' : 'white'};">${pct}%</p>
                    <p style="color:var(--text-secondary);">${state.session.correct} / ${state.session.total} corretti</p>
                </div>`;
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
        // All done
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

    // Generate color palette for tags
    const tagColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    stage.innerHTML = `
    <div style="display:flex; height:100%; flex-direction:column;">
        <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0; flex-wrap:wrap;">
            <span style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">
                <i class="fa-solid fa-layer-group"></i> A quale categoria appartiene?
            </span>
            <span style="color:var(--text-secondary); font-size:0.8rem;">${idx + 1}/${total}</span>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; min-height:0;">
            <div id="cat-card" style="background:white; border-radius:16px; padding:10px; max-width:300px; width:100%; max-height:60%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); transition:0.3s;">
                <img src="${item.url || getPlaceholderUrl(item.label)}"
                     style="max-width:100%; max-height:80%; object-fit:contain; border-radius:8px;"
                     onerror="handleImgError(this, '${item.label}')">
                <div style="font-size:1.2rem; color:#333; font-weight:800; margin-top:8px; text-transform:uppercase;">${item.label}</div>
            </div>
        </div>
        <div style="padding:15px; display:flex; gap:10px; flex-wrap:wrap; justify-content:center; background:rgba(0,0,0,0.2); border-top:1px solid #ffffff10; flex-shrink:0;">
            ${tags.map((tag, i) => `
                <button class="btn" onclick="handleCatChoice('${tag}')"
                    style="background:${tagColors[i % tagColors.length]}; padding:12px 20px; font-size:1rem; border-radius:12px; min-width:100px; text-transform:capitalize;">
                    ${tag}
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
