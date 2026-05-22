// === IMAGE GENERATION: POLLINATIONS.AI + PIXABAY + TOGETHER AI ===

const POLL_STYLES = [
    { id: 'realistic', label: 'Realistico', icon: 'fa-camera', prompt: 'realistic photograph, studio lighting, sharp focus', color: '#10b981' },
    { id: 'drawing', label: 'Disegno', icon: 'fa-pencil', prompt: 'hand-drawn illustration, clean black outlines, colored pencil style', color: '#f59e0b' },
    { id: '3d', label: '3D', icon: 'fa-cube', prompt: '3D render, smooth shading, soft ambient lighting, clay style', color: '#6366f1' },
    { id: 'cartoon', label: 'Cartoon', icon: 'fa-face-smile', prompt: 'cartoon style, colorful, friendly, rounded shapes, for children', color: '#ec4899' },
    { id: 'watercolor', label: 'Acquerello', icon: 'fa-droplet', prompt: 'watercolor painting, soft edges, artistic brush strokes', color: '#06b6d4' },
    { id: 'flat', label: 'Flat', icon: 'fa-vector-square', prompt: 'flat design vector illustration, bold solid colors, minimal shading', color: '#8b5cf6' },
];

// --- PIXABAY API ---
function getPixabayApiKey() {
    return localStorage.getItem('pixabay_api_key') || '';
}
function savePixabayApiKey(key) {
    localStorage.setItem('pixabay_api_key', key.trim());
}

async function searchPixabay(query, perPage = 12) {
    const apiKey = getPixabayApiKey();
    if (!apiKey) throw new Error('Pixabay API key non configurata. Vai in Impostazioni > Immagini.');
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}&safesearch=true`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Errore Pixabay (${resp.status})`);
    const data = await resp.json();
    return (data.hits || []).map(h => ({
        preview: h.previewURL,
        web: h.webformatURL,
        large: h.largeImageURL,
        tags: h.tags
    }));
}

async function fetchPixabayAsDataUrl(imageUrl) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error('Errore download immagine Pixabay');
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- TOGETHER AI API ---
function getTogetherApiKey() {
    return localStorage.getItem('together_api_key') || '';
}
function saveTogetherApiKey(key) {
    localStorage.setItem('together_api_key', key.trim());
}

async function generateTogetherImage(prompt, style) {
    const apiKey = getTogetherApiKey();
    if (!apiKey) throw new Error('Together AI API key non configurata. Vai in Impostazioni > Immagini.');
    const parts = [prompt, 'on a clean white background, centered composition'];
    if (style) {
        const s = POLL_STYLES.find(st => st.id === style);
        if (s) parts.push(s.prompt);
    }
    const fullPrompt = parts.join(', ');

    const resp = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'black-forest-labs/FLUX.1-schnell-Free',
            prompt: fullPrompt,
            width: 512,
            height: 512,
            n: 1,
            response_format: 'b64_json'
        })
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Errore Together AI (${resp.status})`);
    }

    const data = await resp.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('Nessuna immagine generata');
    return `data:image/png;base64,${b64}`;
}

// --- GEMINI IMAGE GENERATION ---
const GEMINI_IMG_MODELS = [
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 (3.1 Flash)', free: true },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana (2.5 Flash)', free: true },
];

function getGeminiImageModel() {
    const stored = localStorage.getItem('gemini_image_model');
    if (stored && GEMINI_IMG_MODELS.some(m => m.id === stored)) return stored;
    return 'gemini-3.1-flash-image-preview';
}

function setGeminiImageModel(model) {
    localStorage.setItem('gemini_image_model', model);
}

async function generateGeminiImage(prompt, style) {
    const apiKey = typeof getGeminiApiKey === 'function' ? getGeminiApiKey() : '';
    if (!apiKey) throw new Error('Gemini API key non configurata. Vai in Impostazioni > API.');

    const parts = [prompt, 'on a clean white background, centered composition, single subject'];
    if (style) {
        const s = POLL_STYLES.find(st => st.id === style);
        if (s) parts.push(s.prompt);
    }
    const fullPrompt = `Generate an image of: ${parts.join(', ')}. No text or labels in the image.`;

    const model = getGeminiImageModel();
    const MAX_RETRIES = 3;
    const BACKOFF_MS = [4000, 10000, 20000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const respParts = data.candidates?.[0]?.content?.parts || [];
            const imagePart = respParts.find(p => p.inlineData);
            if (!imagePart) throw new Error('Il modello non ha generato un\'immagine. Prova un altro modello nelle Impostazioni > Immagini.');
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }

        const err = await response.json().catch(() => ({}));
        const msg = err?.error?.message || '';

        if (response.status === 429) {
            if (/quota/i.test(msg) || /per day/i.test(msg) || /daily/i.test(msg)) {
                throw new Error('Quota giornaliera Gemini esaurita. Riprova domani o usa un altro motore.');
            }
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
                continue;
            }
            throw new Error('Rate limit Gemini persistente. Attendi qualche minuto.');
        }

        if (response.status === 400 && (/responseModalities/i.test(msg) || /not supported/i.test(msg))) {
            throw new Error(`Il modello "${model}" non supporta la generazione immagini. Cambia modello in Impostazioni > Immagini.`);
        }

        throw new Error(msg || `Errore Gemini API (${response.status})`);
    }
}

// --- POLLINATIONS (original, free) ---
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

// --- SINGLE ITEM IMAGE GENERATOR (with tabs: Pixabay / Pollinations / Together AI) ---
let _pollSelectedStyle = null;
let _pollLastImageUrl = null;
let _imgGenTab = 'pixabay';

window.openPollinationsGenerator = (itemIndex) => {
    const item = state.editingItems[itemIndex];
    if (!item) return;

    _pollSelectedStyle = null;
    _pollLastImageUrl = null;
    _imgGenTab = getPixabayApiKey() ? 'pixabay' : 'pollinations';

    const existing = document.getElementById('modal-pollinations');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-pollinations';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    const hasPixabay = !!getPixabayApiKey();
    const hasTogether = !!getTogetherApiKey();
    const hasGemini = !!(typeof getGeminiApiKey === 'function' && getGeminiApiKey());

    modal.innerHTML = `
        <div style="width:100%; max-width:540px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-image" style="color:var(--accent-color);"></i> Immagine</h3>
                <button class="btn btn-ghost" onclick="closePollinationsGenerator()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <!-- Source tabs -->
            <div style="display:flex; gap:4px; margin-bottom:12px; border-bottom:1px solid var(--glass-border); padding-bottom:8px; flex-wrap:wrap;">
                <button class="img-src-tab ${_imgGenTab === 'pixabay' ? 'active' : ''}" onclick="switchImgGenTab('pixabay', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'pixabay' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'pixabay' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-magnifying-glass"></i> Pixabay ${!hasPixabay ? '<span style="font-size:0.6rem; opacity:0.5;">(no key)</span>' : ''}
                </button>
                <button class="img-src-tab" onclick="switchImgGenTab('pollinations', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Pollinations
                </button>
                <button class="img-src-tab" onclick="switchImgGenTab('together', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-robot"></i> Together AI ${!hasTogether ? '<span style="font-size:0.6rem; opacity:0.5;">(no key)</span>' : ''}
                </button>
                <button class="img-src-tab" onclick="switchImgGenTab('gemini', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:transparent; color:var(--text-secondary); cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-sparkles"></i> Gemini ${!hasGemini ? '<span style="font-size:0.6rem; opacity:0.5;">(no key)</span>' : ''}
                </button>
            </div>

            <!-- Pixabay tab -->
            <div id="img-tab-pixabay" style="${_imgGenTab !== 'pixabay' ? 'display:none;' : ''}">
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <input type="text" id="pixabay-query" value="${escapeHtml(item.label)}" placeholder="Cerca immagine..." style="flex:1; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;">
                    <button class="btn btn-primary" onclick="runPixabaySearch(${itemIndex})" style="padding:10px 16px;">
                        <i class="fa-solid fa-search"></i>
                    </button>
                </div>
                <div id="pixabay-results-container"></div>
            </div>

            <!-- Pollinations tab -->
            <div id="img-tab-pollinations" style="${_imgGenTab !== 'pollinations' ? 'display:none;' : ''}">
                <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.75rem; color:#6ee7b7;">
                    <i class="fa-solid fa-gift"></i> Gratuito &mdash; nessuna API key richiesta
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                <textarea id="poll-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:10px;">${escapeHtml(item.label)}</textarea>

                <label style="font-size:0.8rem; color:#aaa;">Stile</label>
                <div id="poll-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                    ${POLL_STYLES.map(s => `
                        <div class="poll-style-btn" data-style-id="${s.id}" onclick="selectPollStyle(this)"
                             style="border-color:${s.color}40;">
                            <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Together AI tab -->
            <div id="img-tab-together" style="${_imgGenTab !== 'together' ? 'display:none;' : ''}">
                <div style="background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.75rem; color:#a78bfa;">
                    <i class="fa-solid fa-robot"></i> Together AI &mdash; FLUX.1 Schnell (richiede API key)
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                <textarea id="together-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:10px;">${escapeHtml(item.label)}</textarea>

                <label style="font-size:0.8rem; color:#aaa;">Stile</label>
                <div id="together-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                    ${POLL_STYLES.map(s => `
                        <div class="poll-style-btn" data-style-id="${s.id}" onclick="selectPollStyle(this)"
                             style="border-color:${s.color}40;">
                            <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Gemini tab -->
            <div id="img-tab-gemini" style="display:none;">
                <div style="background:rgba(66,133,244,0.1); border:1px solid rgba(66,133,244,0.3); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.75rem; color:#93bbfc;">
                    <i class="fa-solid fa-sparkles"></i> Gemini &mdash; usa la stessa API key delle impostazioni
                    <span style="margin-left:6px; font-size:0.65rem; opacity:0.7;">(${getGeminiImageModel()})</span>
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                <textarea id="gemini-img-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:10px;">${escapeHtml(item.label)}</textarea>

                <label style="font-size:0.8rem; color:#aaa;">Stile</label>
                <div id="gemini-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                    ${POLL_STYLES.map(s => `
                        <div class="poll-style-btn" data-style-id="${s.id}" onclick="selectPollStyle(this)"
                             style="border-color:${s.color}40;">
                            <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Shared preview/status -->
            <div id="poll-preview" style="display:none; text-align:center; margin-bottom:12px;">
                <img id="poll-preview-img" src="" style="max-width:100%; max-height:250px; border-radius:10px; border:2px solid var(--glass-border);">
            </div>

            <div id="poll-status" style="display:none; text-align:center; padding:20px;">
                <div class="loading-spinner" style="margin:0 auto 10px;"></div>
                <p style="color:#a5b4fc; margin:0;" id="poll-status-text">Generazione in corso...</p>
            </div>

            <div id="poll-actions">
                <button id="poll-generate-btn" class="btn btn-primary" style="width:100%; padding:12px;" onclick="runImageGeneration(${itemIndex})">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera
                </button>
            </div>
            <div id="poll-accept-actions" style="display:none; gap:8px; margin-top:8px;">
                <button class="btn btn-success" style="flex:1; padding:12px;" onclick="acceptPollImage(${itemIndex})">
                    <i class="fa-solid fa-check"></i> Usa questa
                </button>
                <button class="btn btn-ghost" style="padding:12px;" onclick="runImageGeneration(${itemIndex})">
                    <i class="fa-solid fa-rotate"></i> Rigenera
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Auto-search pixabay if key available
    if (_imgGenTab === 'pixabay' && hasPixabay) {
        setTimeout(() => runPixabaySearch(itemIndex), 200);
    }
};

window.switchImgGenTab = (tab, itemIndex) => {
    _imgGenTab = tab;
    ['pixabay', 'pollinations', 'together', 'gemini'].forEach(t => {
        const el = document.getElementById('img-tab-' + t);
        if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('.img-src-tab').forEach(btn => {
        const isActive = btn.textContent.toLowerCase().includes(tab === 'gemini' ? 'gemini' : tab);
        btn.style.background = isActive ? 'rgba(99,102,241,0.2)' : 'transparent';
        btn.style.color = isActive ? 'var(--accent-color)' : 'var(--text-secondary)';
    });
    const genBtn = document.getElementById('poll-generate-btn');
    if (genBtn) {
        genBtn.style.display = tab === 'pixabay' ? 'none' : '';
    }
};

window.runPixabaySearch = async (itemIndex) => {
    const query = document.getElementById('pixabay-query')?.value?.trim();
    if (!query) return;

    const container = document.getElementById('pixabay-results-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div><p style="color:#a5b4fc; font-size:0.8rem; margin-top:8px;">Ricerca su Pixabay...</p></div>';

    try {
        const results = await searchPixabay(query);
        if (results.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-secondary); font-size:0.85rem;"><i class="fa-solid fa-search"></i> Nessun risultato. Prova con termini diversi.</div>';
            return;
        }
        container.innerHTML = `<div class="pixabay-results">
            ${results.map((r, i) => `
                <div class="pixabay-result-item" onclick="selectPixabayImage(${itemIndex}, ${i})" data-url="${r.web}">
                    <img src="${r.preview}" loading="lazy" alt="${r.tags}">
                </div>
            `).join('')}
        </div>
        <p style="font-size:0.65rem; color:#666; text-align:center; margin-top:6px;">Immagini da Pixabay.com &mdash; Licenza gratuita</p>`;
        window._pixabayResults = results;
    } catch (err) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--danger-color); font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</div>`;
    }
};

window.selectPixabayImage = async (itemIndex, resultIndex) => {
    const results = window._pixabayResults;
    if (!results || !results[resultIndex]) return;

    // Highlight selected
    document.querySelectorAll('.pixabay-result-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.pixabay-result-item')[resultIndex]?.classList.add('selected');

    const status = document.getElementById('poll-status');
    const preview = document.getElementById('poll-preview');
    const acceptActions = document.getElementById('poll-accept-actions');
    const actions = document.getElementById('poll-actions');

    status.style.display = 'block';
    document.getElementById('poll-status-text').textContent = 'Download immagine...';

    try {
        const dataUrl = await fetchPixabayAsDataUrl(results[resultIndex].web);
        _pollLastImageUrl = dataUrl;
        document.getElementById('poll-preview-img').src = dataUrl;
        preview.style.display = 'block';
        status.style.display = 'none';
        actions.style.display = 'none';
        acceptActions.style.display = 'flex';
    } catch (err) {
        status.style.display = 'none';
        alert('Errore download: ' + err.message);
    }
};

window.runImageGeneration = async (itemIndex) => {
    const tab = _imgGenTab;
    if (tab === 'pixabay') return;

    const promptIds = { together: 'together-prompt', gemini: 'gemini-img-prompt', pollinations: 'poll-prompt' };
    const promptEl = document.getElementById(promptIds[tab] || 'poll-prompt');
    const prompt = promptEl?.value?.trim();
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

    const engineNames = { together: 'Together AI', gemini: 'Gemini', pollinations: 'Pollinations.ai' };
    document.getElementById('poll-status-text').textContent = `Generazione in corso (${engineNames[tab] || tab})...`;

    try {
        let imageUrl;
        if (tab === 'together') {
            imageUrl = await generateTogetherImage(prompt, _pollSelectedStyle);
        } else if (tab === 'gemini') {
            imageUrl = await generateGeminiImage(prompt, _pollSelectedStyle);
        } else {
            imageUrl = await fetchPollinationsImage(prompt, _pollSelectedStyle);
        }
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

// Keep backward compat
window.runPollGeneration = window.runImageGeneration;

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
    const container = el.parentElement;
    const wasSelected = el.classList.contains('selected');
    container.querySelectorAll('.poll-style-btn').forEach(btn => btn.classList.remove('selected'));
    if (!wasSelected) {
        el.classList.add('selected');
        _pollSelectedStyle = el.dataset.styleId;
    } else {
        _pollSelectedStyle = null;
    }
};

window.acceptPollImage = async (itemIndex) => {
    if (_pollLastImageUrl && state.editingItems[itemIndex]) {
        state.editingItems[itemIndex].url = await compressDataUrl(_pollLastImageUrl, getEditingImageQuality());
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

    const hasTogether = !!getTogetherApiKey();
    const hasPixabay = !!getPixabayApiKey();
    const hasGemini = !!(typeof getGeminiApiKey === 'function' && getGeminiApiKey());

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-images" style="color:var(--accent-color);"></i> Genera Tutte le Immagini</h3>
                <button class="btn btn-ghost" onclick="closeBulkPollinations()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Sorgente immagini</label>
            <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
                ${hasPixabay ? `<button class="btn btn-ghost bulk-engine-btn selected" data-engine="pixabay" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-search"></i> Pixabay</button>` : ''}
                <button class="btn btn-ghost bulk-engine-btn ${!hasPixabay && !hasGemini ? 'selected' : ''}" data-engine="pollinations" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-wand-magic-sparkles"></i> Pollinations</button>
                ${hasTogether ? `<button class="btn btn-ghost bulk-engine-btn" data-engine="together" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-robot"></i> Together AI</button>` : ''}
                ${hasGemini ? `<button class="btn btn-ghost bulk-engine-btn ${!hasPixabay ? 'selected' : ''}" data-engine="gemini" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-sparkles"></i> Gemini</button>` : ''}
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

            <div id="bulk-styles-section">
                <label style="font-size:0.8rem; color:#aaa;">Stili da randomizzare <span style="opacity:0.5;">(per generazione AI)</span></label>
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

window.selectBulkEngine = (el) => {
    document.querySelectorAll('.bulk-engine-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
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
    const engine = document.querySelector('.bulk-engine-btn.selected')?.dataset?.engine || 'pollinations';

    const selectedStyles = [];
    if (engine !== 'pixabay') {
        document.querySelectorAll('#bulk-poll-styles .poll-style-btn.selected').forEach(btn => {
            selectedStyles.push(btn.dataset.styleId);
        });
        if (selectedStyles.length === 0) {
            alert('Seleziona almeno uno stile.');
            return;
        }
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

        const randomStyle = selectedStyles.length > 0 ? selectedStyles[Math.floor(Math.random() * selectedStyles.length)] : null;
        const styleName = randomStyle ? (POLL_STYLES.find(s => s.id === randomStyle)?.label || randomStyle) : engine;

        document.getElementById('bulk-poll-progress-text').textContent = `${item.label} (${styleName})...`;
        document.getElementById('bulk-poll-progress-count').textContent = `${completed}/${items.length}`;
        document.getElementById('bulk-poll-progress-bar').style.width = `${(completed / items.length) * 100}%`;

        try {
            let imageUrl;
            if (engine === 'pixabay') {
                const results = await searchPixabay(item.label, 3);
                if (results.length > 0) {
                    imageUrl = await fetchPixabayAsDataUrl(results[0].web);
                } else {
                    throw new Error('Nessun risultato');
                }
            } else if (engine === 'together') {
                imageUrl = await generateTogetherImage(item.label, randomStyle);
            } else if (engine === 'gemini') {
                imageUrl = await generateGeminiImage(item.label, randomStyle);
            } else {
                imageUrl = await fetchPollinationsImage(item.label, randomStyle);
            }
            state.editingItems[idx].url = await compressDataUrl(imageUrl, getEditingImageQuality());
            log.innerHTML += `<div style="color:var(--success-color);"><i class="fa-solid fa-check"></i> ${escapeHtml(item.label)} (${styleName})</div>`;
        } catch (err) {
            errors++;
            log.innerHTML += `<div style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${escapeHtml(item.label)}: ${err.message}</div>`;
        }

        completed++;
        log.scrollTop = log.scrollHeight;

        if (_bulkPollGenerating && completed < items.length) {
            const delay = engine === 'pixabay' ? 500 : engine === 'gemini' ? 4000 : 1500;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    document.getElementById('bulk-poll-progress-text').textContent = `Completato: ${completed - errors} ok, ${errors} errori`;
    document.getElementById('bulk-poll-progress-count').textContent = `${completed}/${items.length}`;
    document.getElementById('bulk-poll-progress-bar').style.width = '100%';
    document.getElementById('bulk-poll-done').style.display = 'block';

    renderEditorList();
};
