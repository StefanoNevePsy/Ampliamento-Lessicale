// === IMAGE GENERATION WITH POLLINATIONS.AI ===
// Free, no API key required. Uses URL-based image generation.
// https://pollinations.ai

const POLL_STYLES = [
    { id: 'realistic', label: 'Realistico', icon: 'fa-camera', prompt: 'realistic photograph, studio lighting, sharp focus', color: '#10b981' },
    { id: 'drawing', label: 'Disegno', icon: 'fa-pencil', prompt: 'hand-drawn illustration, clean black outlines, colored pencil style', color: '#f59e0b' },
    { id: '3d', label: '3D', icon: 'fa-cube', prompt: '3D render, smooth shading, soft ambient lighting, clay style', color: '#6366f1' },
    { id: 'cartoon', label: 'Cartoon', icon: 'fa-face-smile', prompt: 'cartoon style, colorful, friendly, rounded shapes, for children', color: '#ec4899' },
    { id: 'watercolor', label: 'Acquerello', icon: 'fa-droplet', prompt: 'watercolor painting, soft edges, artistic brush strokes', color: '#06b6d4' },
    { id: 'flat', label: 'Flat', icon: 'fa-vector-square', prompt: 'flat design vector illustration, bold solid colors, minimal shading', color: '#8b5cf6' },
];

function buildPollinationsUrl(prompt, width = 512, height = 512, seed) {
    const params = new URLSearchParams({ width, height, nologo: 'true', enhance: 'true' });
    if (seed !== undefined) params.set('seed', seed);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
}

async function fetchPollinationsImage(prompt, style) {
    const parts = [prompt, 'on a clean white background, centered composition'];
    if (style) {
        const s = POLL_STYLES.find(st => st.id === style);
        if (s) parts.push(s.prompt);
    }
    const fullPrompt = parts.join(', ');
    const url = buildPollinationsUrl(fullPrompt);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Errore Pollinations (${response.status})`);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- SINGLE ITEM IMAGE GENERATOR ---
let _pollSelectedStyle = null;
let _pollLastImageUrl = null;

window.openPollinationsGenerator = (itemIndex) => {
    const item = state.editingItems[itemIndex];
    if (!item) return;

    _pollSelectedStyle = null;
    _pollLastImageUrl = null;

    const existing = document.getElementById('modal-pollinations');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-pollinations';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-color);"></i> Genera Immagine</h3>
                <button class="btn btn-ghost" onclick="closePollinationsGenerator()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:8px 12px; margin-bottom:12px; font-size:0.8rem; color:#6ee7b7;">
                <i class="fa-solid fa-gift"></i> Gratuito &mdash; powered by Pollinations.ai (nessuna API key richiesta)
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
            <textarea id="poll-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:12px;">${escapeHtml(item.label)}</textarea>

            <label style="font-size:0.8rem; color:#aaa;">Stile</label>
            <div id="poll-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                ${POLL_STYLES.map(s => `
                    <div class="poll-style-btn" data-style-id="${s.id}" onclick="selectPollStyle(this)"
                         style="border-color:${s.color}40;">
                        <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                    </div>
                `).join('')}
            </div>

            <div id="poll-preview" style="display:none; text-align:center; margin-bottom:12px;">
                <img id="poll-preview-img" src="" style="max-width:100%; max-height:250px; border-radius:10px; border:2px solid var(--glass-border);">
            </div>

            <div id="poll-status" style="display:none; text-align:center; padding:20px;">
                <div class="loading-spinner" style="margin:0 auto 10px;"></div>
                <p style="color:#a5b4fc; margin:0;" id="poll-status-text">Generazione in corso...</p>
            </div>

            <div id="poll-actions">
                <button id="poll-generate-btn" class="btn btn-primary" style="width:100%; padding:12px;" onclick="runPollGeneration(${itemIndex})">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera
                </button>
            </div>
            <div id="poll-accept-actions" style="display:none; gap:8px; margin-top:8px;">
                <button class="btn btn-success" style="flex:1; padding:12px;" onclick="acceptPollImage(${itemIndex})">
                    <i class="fa-solid fa-check"></i> Usa questa
                </button>
                <button class="btn btn-ghost" style="padding:12px;" onclick="runPollGeneration(${itemIndex})">
                    <i class="fa-solid fa-rotate"></i> Rigenera
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.closePollinationsGenerator = () => {
    const modal = document.getElementById('modal-pollinations');
    if (modal) modal.remove();
};

window.selectPollStyle = (el) => {
    const wasSelected = el.classList.contains('selected');
    document.querySelectorAll('#poll-styles .poll-style-btn').forEach(btn => btn.classList.remove('selected'));
    if (!wasSelected) {
        el.classList.add('selected');
        _pollSelectedStyle = el.dataset.styleId;
    } else {
        _pollSelectedStyle = null;
    }
};

window.runPollGeneration = async (itemIndex) => {
    const prompt = document.getElementById('poll-prompt').value.trim();
    if (!prompt) { alert('Inserisci un prompt.'); return; }

    const genBtn = document.getElementById('poll-generate-btn');
    const status = document.getElementById('poll-status');
    const preview = document.getElementById('poll-preview');
    const actions = document.getElementById('poll-actions');
    const acceptActions = document.getElementById('poll-accept-actions');

    genBtn.style.display = 'none';
    status.style.display = 'block';
    preview.style.display = 'none';
    acceptActions.style.display = 'none';
    document.getElementById('poll-status-text').textContent = 'Generazione in corso (Pollinations.ai)...';

    try {
        const imageUrl = await fetchPollinationsImage(prompt, _pollSelectedStyle);
        _pollLastImageUrl = imageUrl;

        document.getElementById('poll-preview-img').src = imageUrl;
        preview.style.display = 'block';
        status.style.display = 'none';
        actions.style.display = 'none';
        acceptActions.style.display = 'flex';
    } catch (err) {
        status.style.display = 'none';
        actions.style.display = 'flex';
        genBtn.style.display = '';
        alert('Errore: ' + err.message);
    }
};

window.acceptPollImage = (itemIndex) => {
    if (_pollLastImageUrl && state.editingItems[itemIndex]) {
        state.editingItems[itemIndex].url = _pollLastImageUrl;
        renderEditorList();
        closePollinationsGenerator();
    }
};

// --- BULK IMAGE GENERATION ---
let _bulkPollGenerating = false;

window.openBulkPollinations = () => {
    const existing = document.getElementById('modal-poll-bulk');
    if (existing) existing.remove();

    const itemsWithoutImage = state.editingItems.filter(i => !i.url && !i.hidden).length;
    const totalItems = state.editingItems.filter(i => !i.hidden).length;

    const modal = document.createElement('div');
    modal.id = 'modal-poll-bulk';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-images" style="color:var(--accent-color);"></i> Genera Tutte le Immagini</h3>
                <button class="btn btn-ghost" onclick="closeBulkPollinations()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:8px 12px; margin-bottom:12px; font-size:0.8rem; color:#6ee7b7;">
                <i class="fa-solid fa-gift"></i> Gratuito &mdash; powered by Pollinations.ai
            </div>

            <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:10px; padding:12px; margin-bottom:16px; font-size:0.85rem; color:#a5b4fc;">
                <i class="fa-solid fa-circle-info"></i> Genera automaticamente un'immagine per ogni item. Lo stile verr&agrave; scelto casualmente tra quelli selezionati.
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Quali item?</label>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button class="btn btn-ghost bulk-poll-target selected" data-target="missing" onclick="selectBulkPollTarget(this)" style="flex:1; padding:8px; font-size:0.85rem;">
                    <i class="fa-solid fa-image"></i> Solo senza immagine (${itemsWithoutImage})
                </button>
                <button class="btn btn-ghost bulk-poll-target" data-target="all" onclick="selectBulkPollTarget(this)" style="flex:1; padding:8px; font-size:0.85rem;">
                    <i class="fa-solid fa-images"></i> Tutti (${totalItems})
                </button>
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Stili da randomizzare <span style="opacity:0.5;">(seleziona almeno 1)</span></label>
            <div id="bulk-poll-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                ${POLL_STYLES.map(s => {
                    const isDefault = s.id === 'realistic' || s.id === 'drawing';
                    return `
                    <div class="poll-style-btn ${isDefault ? 'selected' : ''}"
                         data-style-id="${s.id}" onclick="this.classList.toggle('selected')"
                         style="border-color:${s.color}40;">
                        <i class="fa-solid ${s.icon}" style="color:${s.color}; font-size:0.75rem;"></i> ${s.label}
                    </div>`;
                }).join('')}
            </div>

            <div id="bulk-poll-progress" style="display:none; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#ccc; margin-bottom:6px;">
                    <span id="bulk-poll-progress-text">Generazione in corso...</span>
                    <span id="bulk-poll-progress-count">0/0</span>
                </div>
                <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                    <div id="bulk-poll-progress-bar" style="width:0%; height:100%; background:var(--accent-color); transition:width 0.3s;"></div>
                </div>
                <div id="bulk-poll-log" style="max-height:150px; overflow-y:auto; margin-top:8px; font-size:0.8rem; color:#888;"></div>
            </div>

            <div id="bulk-poll-actions">
                <button id="bulk-poll-generate-btn" class="btn btn-primary" style="width:100%; padding:14px; font-size:1rem;" onclick="runBulkPollGeneration()">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera Immagini
                </button>
            </div>
            <div id="bulk-poll-done" style="display:none;">
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-success" style="flex:1; padding:14px;" onclick="closeBulkPollinations()">
                        <i class="fa-solid fa-check"></i> Fatto
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

window.closeBulkPollinations = () => {
    _bulkPollGenerating = false;
    const modal = document.getElementById('modal-poll-bulk');
    if (modal) modal.remove();
};

window.selectBulkPollTarget = (el) => {
    document.querySelectorAll('.bulk-poll-target').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
};

window.runBulkPollGeneration = async () => {
    const selectedStyles = [];
    document.querySelectorAll('#bulk-poll-styles .poll-style-btn.selected').forEach(btn => {
        selectedStyles.push(btn.dataset.styleId);
    });
    if (selectedStyles.length === 0) {
        alert('Seleziona almeno uno stile.');
        return;
    }

    const target = document.querySelector('.bulk-poll-target.selected')?.dataset.target || 'missing';
    const items = state.editingItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !item.hidden)
        .filter(({ item }) => target === 'all' || !item.url);

    if (items.length === 0) {
        alert('Nessun item da generare.');
        return;
    }

    document.getElementById('bulk-poll-actions').style.display = 'none';
    document.getElementById('bulk-poll-progress').style.display = 'block';

    _bulkPollGenerating = true;
    let completed = 0;
    let errors = 0;
    const log = document.getElementById('bulk-poll-log');

    for (const { item, idx } of items) {
        if (!_bulkPollGenerating) break;

        const randomStyle = selectedStyles[Math.floor(Math.random() * selectedStyles.length)];
        const styleName = POLL_STYLES.find(s => s.id === randomStyle)?.label || randomStyle;

        document.getElementById('bulk-poll-progress-text').textContent = `${item.label} (${styleName})...`;
        document.getElementById('bulk-poll-progress-count').textContent = `${completed}/${items.length}`;
        document.getElementById('bulk-poll-progress-bar').style.width = `${(completed / items.length) * 100}%`;

        try {
            const imageUrl = await fetchPollinationsImage(item.label, randomStyle);
            state.editingItems[idx].url = imageUrl;
            log.innerHTML += `<div style="color:var(--success-color);"><i class="fa-solid fa-check"></i> ${escapeHtml(item.label)} (${styleName})</div>`;
        } catch (err) {
            errors++;
            log.innerHTML += `<div style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${escapeHtml(item.label)}: ${err.message}</div>`;
        }

        completed++;
        log.scrollTop = log.scrollHeight;

        // Small delay between requests to be polite
        if (_bulkPollGenerating && completed < items.length) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    document.getElementById('bulk-poll-progress-text').textContent = `Completato: ${completed - errors} ok, ${errors} errori`;
    document.getElementById('bulk-poll-progress-count').textContent = `${completed}/${items.length}`;
    document.getElementById('bulk-poll-progress-bar').style.width = '100%';
    document.getElementById('bulk-poll-done').style.display = 'block';

    renderEditorList();
};
