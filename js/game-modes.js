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
    if (mode === 'tact') renderTact(items, stage);
    else if (mode === 'ran') renderRan(items, stage);
    else if (mode === 'tombola') renderTombola(items, stage);
    else if (mode === 'memory') renderMemory(items, stage);
    else if (mode === 'search_find') renderSearchFind(items, stage);
    else if (mode === 'pool_random') renderPoolRandom(items, stage);
    else if (mode === 'intruso') renderIntruso(items, stage);
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
