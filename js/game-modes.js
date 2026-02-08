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
            <div id="ran-content" style="flex:1; overflow:hidden;"></div>
        </div>`;
    updateRanContent();
}

window.toggleRanMode = () => {
    state.ranMode = state.ranMode === 'grid' ? 'single' : 'grid';
    updateRanContent();
};

function updateRanContent() {
    const c = document.getElementById('ran-content');
    const i = state.ranDisplayItems;

    if (state.ranMode === 'grid') {
        let cols = Math.ceil(Math.sqrt(i.length));
        if (i.length <= 9) cols = 3; else if (i.length <= 16) cols = 4; else cols = 5;
        const rows = Math.ceil(i.length / cols);
        const needsScroll = rows > 5;
        const gridStyle = needsScroll
            ? `grid-template-columns:repeat(${cols},1fr);`
            : `grid-template-columns:repeat(${cols},1fr); grid-template-rows:repeat(${rows},1fr); height:100%;`;
        const areaStyle = needsScroll ? 'ran-scroll-area' : '';
        let h = `<div class="${areaStyle}" style="height:100%; padding:10px; ${needsScroll ? 'overflow-y:auto;' : 'overflow:hidden;'} min-height:0;">`;
        h += `<div class="grid-adaptive" style="${gridStyle} align-content:stretch;">`;
        i.forEach(x => { h += `<div class="ran-card" style="${needsScroll ? '' : 'aspect-ratio:auto; max-height:100%;'}"><img src="${x.url || getPlaceholderUrl(x.label)}" onerror="handleImgError(this,'${x.label}')"></div>`; });
        h += `</div></div>`;
        c.innerHTML = h;
    } else {
        const x = i[state.ranIndex];
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
                <div class="ran-counter">${state.ranIndex + 1}/${i.length}</div>
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
    // If few items, fill the space; if many, allow scroll
    const needsScroll = rows > 5;
    const gridStyle = needsScroll
        ? `grid-template-columns:repeat(${cols}, 1fr);`
        : `grid-template-columns:repeat(${cols}, 1fr); grid-template-rows:repeat(${rows}, 1fr); height:100%;`;

    stage.innerHTML = `
        <div style="display:flex; height:100%; flex-direction:column;">
            <div style="padding:10px; background:rgba(0,0,0,0.2); display:flex; gap:10px; align-items:center; justify-content:center; border-bottom:1px solid #ffffff10; flex-shrink:0;">
                <div style="font-size:0.8rem; text-transform:uppercase; font-weight:bold;">Trova:</div>
                <div id="deck-target" style="background:white; padding:5px; border-radius:8px; display:flex; align-items:center; gap:10px;">
                    ${getDeckHtml()}
                </div>
            </div>
            <div style="flex:1; ${needsScroll ? 'overflow-y:auto;' : 'overflow:hidden;'} padding:10px; min-height:0;">
                <div class="grid-adaptive" style="${gridStyle} align-content:stretch;">
                    ${items.map((item, idx) => `
                        <div class="card-grid" id="slot-${idx}" onclick="handleMatchClick(${idx}, '${item.label}')" style="aspect-ratio:auto; max-height:100%;">
                            <img src="${item.url || getPlaceholderUrl(item.label)}" onerror="handleImgError(this, '${item.label}')">
                        </div>
                    `).join('')}
                </div>
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
    const needsScroll = rows > 5;
    const gridStyle = needsScroll
        ? `grid-template-columns: repeat(${cols}, 1fr);`
        : `grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); height:100%;`;

    stage.innerHTML = `
        <div style="padding:10px; height:100%; ${needsScroll ? 'overflow-y:auto;' : 'overflow:hidden;'} min-height:0;">
            <div class="grid-adaptive" style="${gridStyle} align-content:stretch;">
                ${deck.map((item, idx) => `
                    <div class="card-grid" id="mem-${idx}" onclick="flipCard(${idx})" style="background:var(--accent-color); aspect-ratio:auto; max-height:100%;">
                        <div class="mem-content" style="display:none; width:100%; height:100%;">
                            <img src="${item.url || getPlaceholderUrl(item.label)}" style="width:100%; height:100%; object-fit:contain; background:white; border-radius:6px;" onerror="handleImgError(this, '${item.label}')">
                        </div>
                        <i class="fa-solid fa-question icon-back" style="color:white; font-size:2rem;"></i>
                    </div>
                `).join('')}
            </div>
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
