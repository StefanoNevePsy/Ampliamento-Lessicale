// === IMAGE GENERATION WITH IMAGEN & NANO BANANA API ===
// Uses the same Gemini API key for generating images via Google's Imagen and Gemini Image models
// Imagen models use :predict endpoint, Nano Banana models use :generateContent endpoint

const IMAGEN_MODELS = [
    // Nano Banana (Gemini Image) models - use generateContent API
    { id: 'gemini-2.5-flash-preview-image-generation', name: 'Nano Banana 1 (2.5 Flash)', free: true, type: 'gemini' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 (3.1 Flash)', free: false, type: 'gemini' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro (3 Pro)', free: false, type: 'gemini' },
    // Imagen models - use predict API
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3', free: true, type: 'imagen' },
    { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', free: false, type: 'imagen' },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4 Standard', free: false, type: 'imagen' },
    { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', free: false, type: 'imagen' },
];

function getImagenModel() {
    return localStorage.getItem('imagen_model') || 'imagen-3.0-generate-002';
}

function saveImagenModel(model) {
    localStorage.setItem('imagen_model', model);
}

// --- STYLE PRESETS ---
const IMG_GENERAL_STYLES = [
    { id: 'white_bg', label: 'Sfondo bianco', prompt: 'on a clean white background', default: true },
    { id: 'centered', label: 'Centrato', prompt: 'centered composition, well-framed subject', default: true },
    { id: 'simple', label: 'Semplice', prompt: 'simple, clean, uncluttered, minimal distracting details', default: false },
    { id: 'high_contrast', label: 'Alto contrasto', prompt: 'high contrast, vivid saturated colors', default: false },
];

const IMG_SPECIFIC_STYLES = [
    { id: 'realistic', label: 'Realistico', icon: 'fa-camera', prompt: 'realistic photograph, studio lighting, sharp focus', color: '#10b981' },
    { id: 'drawing', label: 'Disegno', icon: 'fa-pencil', prompt: 'hand-drawn illustration, clean black outlines, colored pencil style', color: '#f59e0b' },
    { id: '3d', label: '3D', icon: 'fa-cube', prompt: '3D render, smooth shading, soft ambient lighting, clay style', color: '#6366f1' },
    { id: 'cartoon', label: 'Cartoon', icon: 'fa-face-smile', prompt: 'cartoon style, colorful, friendly, rounded shapes, for children', color: '#ec4899' },
    { id: 'watercolor', label: 'Acquerello', icon: 'fa-droplet', prompt: 'watercolor painting, soft edges, artistic brush strokes', color: '#06b6d4' },
    { id: 'flat', label: 'Flat', icon: 'fa-vector-square', prompt: 'flat design vector illustration, bold solid colors, minimal shading', color: '#8b5cf6' },
];

function getDefaultGeneralStyles() {
    const saved = localStorage.getItem('imagen_general_styles');
    if (saved) return JSON.parse(saved);
    return IMG_GENERAL_STYLES.filter(s => s.default).map(s => s.id);
}

function saveDefaultGeneralStyles(styles) {
    localStorage.setItem('imagen_general_styles', JSON.stringify(styles));
}

function buildImagePrompt(subject, generalStyleIds, specificStyleId) {
    const parts = [subject];
    if (specificStyleId) {
        const style = IMG_SPECIFIC_STYLES.find(s => s.id === specificStyleId);
        if (style) parts.push(style.prompt);
    }
    (generalStyleIds || []).forEach(id => {
        const gs = IMG_GENERAL_STYLES.find(s => s.id === id);
        if (gs) parts.push(gs.prompt);
    });
    return parts.join(', ');
}

// --- IMAGE GENERATION API CALL ---
// Detects model type and uses the appropriate API format
function getModelType(modelId) {
    const model = IMAGEN_MODELS.find(m => m.id === modelId);
    return model?.type || (modelId.startsWith('gemini') ? 'gemini' : 'imagen');
}

async function callImagen(prompt, aspectRatio) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('API key mancante. Configurala nelle Impostazioni.');

    const model = getImagenModel();
    const modelType = getModelType(model);

    if (modelType === 'gemini') {
        return await callGeminiImage(prompt, aspectRatio, model, apiKey);
    } else {
        return await callImagenPredict(prompt, aspectRatio, model, apiKey);
    }
}

// Imagen models (:predict endpoint)
async function callImagenPredict(prompt, aspectRatio, model, apiKey) {
    const url = `${GEMINI_API_BASE}models/${model}:predict?key=${apiKey}`;

    const body = {
        instances: [{ prompt }],
        parameters: { sampleCount: 1 }
    };
    if (aspectRatio) body.parameters.aspectRatio = aspectRatio;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error('Limite richieste raggiunto. Attendi qualche minuto.');
        if (response.status === 403) throw new Error('Modello non disponibile con la tua API key. Prova un altro modello nelle Impostazioni.');
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }

    const data = await response.json();
    const prediction = data.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) throw new Error('Nessuna immagine generata. Prova con un prompt diverso.');

    return `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
}

// Nano Banana / Gemini Image models (:generateContent endpoint)
async function callGeminiImage(prompt, aspectRatio, model, apiKey) {
    const url = `${GEMINI_API_BASE}models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseModalities: ['IMAGE'],
        }
    };

    // Add image config if aspect ratio specified
    if (aspectRatio) {
        body.generationConfig.imageConfig = { aspectRatio };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error('Limite richieste raggiunto. Attendi qualche minuto.');
        if (response.status === 403) throw new Error('Modello non disponibile con la tua API key. Prova un altro modello nelle Impostazioni.');
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }

    const data = await response.json();

    // Extract image from response parts
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error('Risposta vuota dal modello.');

    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart?.inlineData?.data) throw new Error('Nessuna immagine generata. Prova con un prompt diverso.');

    return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
}

// --- UI: SINGLE ITEM IMAGE GENERATOR ---
let _selectedSpecificStyle = null;
let _lastGeneratedImageUrl = null;

window.openImageGenerator = (itemIndex) => {
    const item = state.editingItems[itemIndex];
    if (!item) return;

    if (!getGeminiApiKey()) {
        openSettings();
        setTimeout(() => alert('Configura prima la chiave API nelle Impostazioni per generare immagini.'), 300);
        return;
    }

    const generalStyles = getDefaultGeneralStyles();
    _selectedSpecificStyle = null;
    _lastGeneratedImageUrl = null;

    const existing = document.getElementById('modal-imagen');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-imagen';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-color);"></i> Genera Immagine</h3>
                <button class="btn btn-ghost" onclick="closeImageGenerator()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
            <textarea id="imagen-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:12px;">${escapeHtml(item.label)}</textarea>

            <label style="font-size:0.8rem; color:#aaa;">Stili Generali <span style="opacity:0.5;">(applicati sempre)</span></label>
            <div id="imagen-general-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                ${IMG_GENERAL_STYLES.map(s => `
                    <div class="img-style-chip ${generalStyles.includes(s.id) ? 'selected' : ''}"
                         data-style-id="${s.id}" onclick="toggleImagenGeneralStyle(this)">
                        <i class="fa-solid ${generalStyles.includes(s.id) ? 'fa-check-square' : 'fa-square'}" style="font-size:0.75rem;"></i> ${s.label}
                    </div>
                `).join('')}
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Stile Specifico</label>
            <div id="imagen-specific-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                ${IMG_SPECIFIC_STYLES.map(s => `
                    <div class="img-style-btn" data-style-id="${s.id}" onclick="selectImagenSpecificStyle(this)"
                         style="border-color:${s.color}40;">
                        <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                    </div>
                `).join('')}
            </div>

            <div id="imagen-preview" style="display:none; text-align:center; margin-bottom:12px;">
                <img id="imagen-preview-img" src="" style="max-width:100%; max-height:250px; border-radius:10px; border:2px solid var(--glass-border);">
            </div>

            <div id="imagen-status" style="display:none; text-align:center; padding:20px;">
                <div class="loading-spinner" style="margin:0 auto 10px;"></div>
                <p style="color:#a5b4fc; margin:0;" id="imagen-status-text">Generazione in corso...</p>
            </div>

            <div id="imagen-actions">
                <button id="imagen-generate-btn" class="btn btn-primary" style="width:100%; padding:12px;" onclick="runImageGeneration(${itemIndex})">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera
                </button>
            </div>
            <div id="imagen-accept-actions" style="display:none; gap:8px; margin-top:8px;">
                <button class="btn btn-success" style="flex:1; padding:12px;" onclick="acceptGeneratedImage(${itemIndex})">
                    <i class="fa-solid fa-check"></i> Usa questa
                </button>
                <button class="btn btn-ghost" style="padding:12px;" onclick="runImageGeneration(${itemIndex})">
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

window.closeImageGenerator = () => {
    const modal = document.getElementById('modal-imagen');
    if (modal) modal.remove();
};

window.toggleImagenGeneralStyle = (el) => {
    el.classList.toggle('selected');
    const icon = el.querySelector('i');
    icon.className = el.classList.contains('selected') ? 'fa-solid fa-check-square' : 'fa-solid fa-square';
    icon.style.fontSize = '0.75rem';

    const selectedIds = [];
    document.querySelectorAll('#imagen-general-styles .img-style-chip.selected').forEach(chip => {
        selectedIds.push(chip.dataset.styleId);
    });
    saveDefaultGeneralStyles(selectedIds);
};

window.selectImagenSpecificStyle = (el) => {
    const wasSelected = el.classList.contains('selected');
    document.querySelectorAll('#imagen-specific-styles .img-style-btn').forEach(btn => btn.classList.remove('selected'));
    if (!wasSelected) {
        el.classList.add('selected');
        _selectedSpecificStyle = el.dataset.styleId;
    } else {
        _selectedSpecificStyle = null;
    }
};

window.runImageGeneration = async (itemIndex) => {
    const prompt = document.getElementById('imagen-prompt').value.trim();
    if (!prompt) { alert('Inserisci un prompt.'); return; }

    const generalIds = [];
    document.querySelectorAll('#imagen-general-styles .img-style-chip.selected').forEach(chip => {
        generalIds.push(chip.dataset.styleId);
    });

    const fullPrompt = buildImagePrompt(prompt, generalIds, _selectedSpecificStyle);

    const genBtn = document.getElementById('imagen-generate-btn');
    const status = document.getElementById('imagen-status');
    const preview = document.getElementById('imagen-preview');
    const actions = document.getElementById('imagen-actions');
    const acceptActions = document.getElementById('imagen-accept-actions');

    genBtn.style.display = 'none';
    status.style.display = 'block';
    preview.style.display = 'none';
    acceptActions.style.display = 'none';
    document.getElementById('imagen-status-text').textContent = `Generazione con ${getImagenModel()}...`;

    try {
        const imageUrl = await callImagen(fullPrompt, '1:1');
        _lastGeneratedImageUrl = imageUrl;

        document.getElementById('imagen-preview-img').src = imageUrl;
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

window.acceptGeneratedImage = (itemIndex) => {
    if (_lastGeneratedImageUrl && state.editingItems[itemIndex]) {
        state.editingItems[itemIndex].url = _lastGeneratedImageUrl;
        renderEditorList();
        closeImageGenerator();
    }
};

// --- UI: BULK IMAGE GENERATION ---
let _bulkGenerating = false;

window.openBulkImageGenerator = () => {
    if (!getGeminiApiKey()) {
        openSettings();
        setTimeout(() => alert('Configura prima la chiave API nelle Impostazioni.'), 300);
        return;
    }

    const generalStyles = getDefaultGeneralStyles();

    const existing = document.getElementById('modal-imagen-bulk');
    if (existing) existing.remove();

    const itemsWithoutImage = state.editingItems.filter(i => !i.url && !i.hidden).length;
    const totalItems = state.editingItems.filter(i => !i.hidden).length;

    const modal = document.createElement('div');
    modal.id = 'modal-imagen-bulk';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-images" style="color:var(--accent-color);"></i> Genera Tutte le Immagini</h3>
                <button class="btn btn-ghost" onclick="closeBulkImageGenerator()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:10px; padding:12px; margin-bottom:16px; font-size:0.85rem; color:#a5b4fc;">
                <i class="fa-solid fa-circle-info"></i> Genera automaticamente un'immagine per ogni item del set. Lo stile specifico verr&agrave; scelto casualmente tra quelli selezionati.
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Quali item?</label>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button class="btn btn-ghost bulk-target-btn selected" data-target="missing" onclick="selectBulkTarget(this)" style="flex:1; padding:8px; font-size:0.85rem;">
                    <i class="fa-solid fa-image"></i> Solo senza immagine (${itemsWithoutImage})
                </button>
                <button class="btn btn-ghost bulk-target-btn" data-target="all" onclick="selectBulkTarget(this)" style="flex:1; padding:8px; font-size:0.85rem;">
                    <i class="fa-solid fa-images"></i> Tutti (${totalItems})
                </button>
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Stili Generali</label>
            <div id="bulk-general-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                ${IMG_GENERAL_STYLES.map(s => `
                    <div class="img-style-chip ${generalStyles.includes(s.id) ? 'selected' : ''}"
                         data-style-id="${s.id}" onclick="toggleBulkGeneralStyle(this)">
                        <i class="fa-solid ${generalStyles.includes(s.id) ? 'fa-check-square' : 'fa-square'}" style="font-size:0.75rem;"></i> ${s.label}
                    </div>
                `).join('')}
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Stili da randomizzare <span style="opacity:0.5;">(seleziona almeno 1)</span></label>
            <div id="bulk-specific-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                ${IMG_SPECIFIC_STYLES.map(s => {
                    const isDefault = s.id === 'realistic' || s.id === 'drawing';
                    return `
                    <div class="img-style-chip ${isDefault ? 'selected' : ''}"
                         data-style-id="${s.id}" onclick="toggleBulkSpecificStyle(this)">
                        <i class="fa-solid ${isDefault ? 'fa-check-square' : 'fa-square'}" style="font-size:0.75rem; color:${s.color};"></i>
                        <i class="fa-solid ${s.icon}" style="color:${s.color}; font-size:0.75rem;"></i> ${s.label}
                    </div>`;
                }).join('')}
            </div>

            <div id="bulk-progress" style="display:none; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#ccc; margin-bottom:6px;">
                    <span id="bulk-progress-text">Generazione in corso...</span>
                    <span id="bulk-progress-count">0/0</span>
                </div>
                <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                    <div id="bulk-progress-bar" style="width:0%; height:100%; background:var(--accent-color); transition:width 0.3s;"></div>
                </div>
                <div id="bulk-progress-log" style="max-height:150px; overflow-y:auto; margin-top:8px; font-size:0.8rem; color:#888;"></div>
            </div>

            <div id="bulk-actions">
                <button id="bulk-generate-btn" class="btn btn-primary" style="width:100%; padding:14px; font-size:1rem;" onclick="runBulkImageGeneration()">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera Immagini
                </button>
            </div>
            <div id="bulk-done" style="display:none;">
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-success" style="flex:1; padding:14px;" onclick="closeBulkImageGenerator()">
                        <i class="fa-solid fa-check"></i> Fatto
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

window.closeBulkImageGenerator = () => {
    _bulkGenerating = false;
    const modal = document.getElementById('modal-imagen-bulk');
    if (modal) modal.remove();
};

window.selectBulkTarget = (el) => {
    document.querySelectorAll('.bulk-target-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
};

window.toggleBulkGeneralStyle = (el) => {
    el.classList.toggle('selected');
    const icon = el.querySelector('i');
    icon.className = el.classList.contains('selected') ? 'fa-solid fa-check-square' : 'fa-solid fa-square';
    icon.style.fontSize = '0.75rem';
};

window.toggleBulkSpecificStyle = (el) => {
    el.classList.toggle('selected');
    const icons = el.querySelectorAll('i');
    icons[0].className = el.classList.contains('selected') ? 'fa-solid fa-check-square' : 'fa-solid fa-square';
    icons[0].style.fontSize = '0.75rem';
};

window.runBulkImageGeneration = async () => {
    const specificStyles = [];
    document.querySelectorAll('#bulk-specific-styles .img-style-chip.selected').forEach(chip => {
        specificStyles.push(chip.dataset.styleId);
    });
    if (specificStyles.length === 0) {
        alert('Seleziona almeno uno stile specifico.');
        return;
    }

    const generalIds = [];
    document.querySelectorAll('#bulk-general-styles .img-style-chip.selected').forEach(chip => {
        generalIds.push(chip.dataset.styleId);
    });

    const target = document.querySelector('.bulk-target-btn.selected')?.dataset.target || 'missing';
    const items = state.editingItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !item.hidden)
        .filter(({ item }) => target === 'all' || !item.url);

    if (items.length === 0) {
        alert('Nessun item da generare.');
        return;
    }

    document.getElementById('bulk-actions').style.display = 'none';
    document.getElementById('bulk-progress').style.display = 'block';

    _bulkGenerating = true;
    let completed = 0;
    let errors = 0;
    const log = document.getElementById('bulk-progress-log');

    for (const { item, idx } of items) {
        if (!_bulkGenerating) break;

        const randomStyle = specificStyles[Math.floor(Math.random() * specificStyles.length)];
        const fullPrompt = buildImagePrompt(item.label, generalIds, randomStyle);
        const styleName = IMG_SPECIFIC_STYLES.find(s => s.id === randomStyle)?.label || randomStyle;

        document.getElementById('bulk-progress-text').textContent = `${item.label} (${styleName})...`;
        document.getElementById('bulk-progress-count').textContent = `${completed}/${items.length}`;
        document.getElementById('bulk-progress-bar').style.width = `${(completed / items.length) * 100}%`;

        try {
            const imageUrl = await callImagen(fullPrompt, '1:1');
            state.editingItems[idx].url = imageUrl;
            log.innerHTML += `<div style="color:var(--success-color);"><i class="fa-solid fa-check"></i> ${escapeHtml(item.label)} (${styleName})</div>`;
        } catch (err) {
            errors++;
            log.innerHTML += `<div style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${escapeHtml(item.label)}: ${err.message}</div>`;
            if (err.message.includes('Limite') || err.message.includes('429')) {
                log.innerHTML += `<div style="color:var(--warning-color);"><i class="fa-solid fa-clock"></i> Attesa 30s per limite richieste...</div>`;
                log.scrollTop = log.scrollHeight;
                await new Promise(r => setTimeout(r, 30000));
            }
        }

        completed++;
        log.scrollTop = log.scrollHeight;

        // Delay between requests to avoid rate limiting
        if (_bulkGenerating && completed < items.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    document.getElementById('bulk-progress-text').textContent = `Completato: ${completed - errors} ok, ${errors} errori`;
    document.getElementById('bulk-progress-count').textContent = `${completed}/${items.length}`;
    document.getElementById('bulk-progress-bar').style.width = '100%';
    document.getElementById('bulk-done').style.display = 'block';

    renderEditorList();
};

// --- SETTINGS: IMAGEN MODEL SELECTOR ---
window.populateImagenModelSelect = () => {
    const select = document.getElementById('imagen-model');
    if (!select) return;
    const current = getImagenModel();
    select.innerHTML = '';
    for (const m of IMAGEN_MODELS) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name + (m.free ? ' (gratuito)' : ' (a pagamento)');
        if (m.id === current) opt.selected = true;
        select.appendChild(opt);
    }
};

// Hook into saveKey to also save imagen model
const _originalSaveKey = window.saveKey;
window.saveKey = () => {
    const imagenSelect = document.getElementById('imagen-model');
    if (imagenSelect) saveImagenModel(imagenSelect.value);
    _originalSaveKey();
};

// Hook into openSettings to populate imagen model
const _originalOpenSettings = window.openSettings;
window.openSettings = () => {
    _originalOpenSettings();
    setTimeout(() => populateImagenModelSelect(), 50);
};
