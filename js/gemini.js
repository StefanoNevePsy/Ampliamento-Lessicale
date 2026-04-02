// === GEMINI AI INTEGRATION ===
// Generates therapy stimulus sets directly from natural language descriptions

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/';

function getGeminiModel() {
    return localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
}

function saveGeminiModel(model) {
    localStorage.setItem('gemini_model', model);
}

function getGeminiApiUrl() {
    return `${GEMINI_API_BASE}models/${getGeminiModel()}:generateContent`;
}

// --- DYNAMIC MODEL LISTING ---
// Models known to be free on the Gemini API free tier
const FREE_MODELS = new Set([
    'gemini-2.5-flash', 'gemini-2.5-flash-lite',
    'gemini-2.0-flash', 'gemini-2.0-flash-lite',
    'gemini-3-flash', 'gemini-3.1-flash-lite'
]);

// Fallback list in case the API call fails
const FALLBACK_MODELS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: true },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', free: true },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash (preview)', free: true },
];

async function fetchAvailableModels(apiKey) {
    const resp = await fetch(`${GEMINI_API_BASE}models?key=${apiKey}`);
    if (!resp.ok) throw new Error(`Errore ${resp.status}`);
    const data = await resp.json();

    return (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        // Exclude embedding, TTS, image-only, and other non-text models
        .filter(m => !m.name.includes('embedding') && !m.name.includes('tts')
                  && !m.name.includes('imagen') && !m.name.includes('computer-use')
                  && !m.name.includes('deep-research'))
        .map(m => {
            // m.name is like "models/gemini-2.5-flash"
            const id = m.name.replace('models/', '');
            const isFree = FREE_MODELS.has(id) || id.includes('flash');
            return { id, name: m.displayName || id, free: isFree };
        })
        // Sort: free first, then alphabetically
        .sort((a, b) => {
            if (a.free !== b.free) return a.free ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
}

function populateModelSelect(models) {
    const select = document.getElementById('gemini-model');
    const current = getGeminiModel();
    select.innerHTML = '';

    for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name + (m.free ? ' (gratuito)' : ' (a pagamento)');
        select.appendChild(opt);
    }

    // Restore previous selection if still available
    if (models.some(m => m.id === current)) {
        select.value = current;
    }

    const hint = document.getElementById('gemini-model-hint');
    if (hint) hint.textContent = `${models.length} modelli disponibili. I modelli "gratuito" non hanno costi.`;
}

window.refreshGeminiModels = async () => {
    const apiKey = document.getElementById('api-key').value.trim() || getGeminiApiKey();
    if (!apiKey) {
        alert('Inserisci prima la chiave API per caricare i modelli.');
        return;
    }

    const icon = document.getElementById('gemini-refresh-icon');
    icon.classList.add('fa-spin');
    const hint = document.getElementById('gemini-model-hint');
    hint.textContent = 'Caricamento modelli...';

    try {
        const models = await fetchAvailableModels(apiKey);
        if (models.length === 0) throw new Error('Nessun modello trovato');
        populateModelSelect(models);
        // Cache the list for 24h
        localStorage.setItem('gemini_models_cache', JSON.stringify({ ts: Date.now(), models }));
    } catch (err) {
        hint.textContent = 'Errore nel caricamento. Uso lista predefinita.';
        populateModelSelect(FALLBACK_MODELS);
    } finally {
        icon.classList.remove('fa-spin');
    }
};

// --- API KEY MANAGEMENT ---
function getGeminiApiKey() {
    return localStorage.getItem('gemini_api_key') || '';
}

function saveGeminiApiKey(key) {
    localStorage.setItem('gemini_api_key', key.trim());
}

// --- THEME SYSTEM ---
const APP_THEMES = [
    { id: 'default', name: 'Indigo', icon: 'fa-gem', colors: ['#1e1e2f', '#2d2b55', '#6366f1', '#10b981'] },
    { id: 'ocean', name: 'Oceano', icon: 'fa-water', colors: ['#0f172a', '#1e3a5f', '#38bdf8', '#34d399'] },
    { id: 'forest', name: 'Foresta', icon: 'fa-tree', colors: ['#1a2e1a', '#2d4a2d', '#4ade80', '#34d399'] },
    { id: 'sunset', name: 'Tramonto', icon: 'fa-sun', colors: ['#2d1b2e', '#4a2040', '#f472b6', '#34d399'] },
    { id: 'midnight', name: 'Mezzanotte', icon: 'fa-moon', colors: ['#0a0a0a', '#1a1a2e', '#8b5cf6', '#10b981'] },
    { id: 'light', name: 'Chiaro', icon: 'fa-cloud-sun', colors: ['#f1f5f9', '#e2e8f0', '#6366f1', '#059669'] },
    { id: 'arcraiders', name: 'Arc Raiders', icon: 'fa-satellite-dish', colors: ['#0d0d1a', '#151528', '#e8a020', '#3dbb5e'], badge: 'NEW' },
    { id: 'sakura', name: 'Sakura', icon: 'fa-fan', colors: ['#2e1a2a', '#3d2040', '#f06292', '#81c784'] },
    { id: 'arctic', name: 'Artico', icon: 'fa-snowflake', colors: ['#e8f0f8', '#d0dde8', '#4a90d9', '#3dae8f'] },
    { id: 'volcano', name: 'Vulcano', icon: 'fa-fire', colors: ['#1a0a0a', '#2e1510', '#e8603c', '#50b080'] },
    { id: 'cyberpunk', name: 'Cyberpunk', icon: 'fa-bolt', colors: ['#0a0014', '#1a0030', '#00e0a0', '#ff3060'] },
    { id: 'sand', name: 'Sabbia', icon: 'fa-umbrella-beach', colors: ['#f5f0e0', '#e8dcc8', '#b08840', '#6a9a50'] },
    { id: 'deepspace', name: 'Spazio', icon: 'fa-star', colors: ['#050510', '#0a0a2e', '#7c6cf0', '#40c090'] },
];

function getCurrentTheme() {
    return localStorage.getItem('app_theme') || 'default';
}

function applyTheme(themeId) {
    if (themeId === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeId);
    }
    localStorage.setItem('app_theme', themeId);
    // Update theme-color meta
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const theme = APP_THEMES.find(t => t.id === themeId);
    if (metaTheme && theme) metaTheme.setAttribute('content', theme.colors[0]);
}

function renderThemePicker() {
    const container = document.getElementById('theme-picker');
    if (!container) return;
    const current = getCurrentTheme();
    container.innerHTML = APP_THEMES.map(t => `
        <div class="theme-card ${t.id === current ? 'active' : ''}" onclick="selectTheme('${t.id}')">
            <div class="theme-preview">
                ${t.colors.map(c => `<span style="background:${c};"></span>`).join('')}
            </div>
            <div class="theme-name"><i class="fa-solid ${t.icon || 'fa-palette'}" style="margin-right:4px; opacity:0.7;"></i>${t.name}</div>
            ${t.badge ? `<span style="position:absolute;top:4px;left:6px;font-size:0.55rem;background:rgba(191,120,42,0.3);color:#bf782a;padding:1px 5px;border-radius:3px;font-weight:700;letter-spacing:1px;font-family:monospace;">${t.badge}</span>` : ''}
            <i class="fa-solid fa-check theme-check"></i>
        </div>
    `).join('');
}

window.selectTheme = (themeId) => {
    applyTheme(themeId);
    renderThemePicker();
    // Re-render mode dropdown with new theme colors
    if (typeof renderModeSelect === 'function') renderModeSelect();
};

// --- SETTINGS TABS ---
window.switchSettingsTab = (tab) => {
    ['api', 'images', 'theme', 'session'].forEach(t => {
        const el = document.getElementById('settings-tab-' + t);
        if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('#settings-tabs .settings-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'theme') renderThemePicker();
};

window.openSettings = () => {
    const modal = document.getElementById('modal-settings');
    // API tab
    document.getElementById('api-key').value = getGeminiApiKey();

    const cached = JSON.parse(localStorage.getItem('gemini_models_cache') || 'null');
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (cached && (Date.now() - cached.ts < ONE_DAY) && cached.models?.length) {
        populateModelSelect(cached.models);
    } else {
        populateModelSelect(FALLBACK_MODELS);
        const apiKey = getGeminiApiKey();
        if (apiKey) setTimeout(() => refreshGeminiModels(), 100);
    }

    // Images tab
    const pixabayInput = document.getElementById('pixabay-api-key');
    const togetherInput = document.getElementById('together-api-key');
    if (pixabayInput) pixabayInput.value = getPixabayApiKey();
    if (togetherInput) togetherInput.value = getTogetherApiKey();

    // Session tab
    const tdTimerCb = document.getElementById('setting-td-timer');
    if (tdTimerCb) tdTimerCb.checked = localStorage.getItem('td_timer_visible') !== 'false';

    // Reset to first tab
    switchSettingsTab('api');

    modal.style.display = 'flex';
};

window.closeSettings = () => {
    document.getElementById('modal-settings').style.display = 'none';
};

window.saveAllSettings = () => {
    // Save API settings
    const key = document.getElementById('api-key').value.trim();
    saveGeminiApiKey(key);
    const model = document.getElementById('gemini-model').value;
    saveGeminiModel(model);

    // Save image API keys
    const pixabayKey = document.getElementById('pixabay-api-key')?.value?.trim();
    if (pixabayKey !== undefined) savePixabayApiKey(pixabayKey);
    const togetherKey = document.getElementById('together-api-key')?.value?.trim();
    if (togetherKey !== undefined) saveTogetherApiKey(togetherKey);

    // Theme is saved live on selection

    // Save session settings
    const tdTimerCb = document.getElementById('setting-td-timer');
    if (tdTimerCb) localStorage.setItem('td_timer_visible', tdTimerCb.checked ? 'true' : 'false');

    closeSettings();
};

// Backward compat
window.saveKey = window.saveAllSettings;

// Apply saved theme on load
(function() {
    const saved = getCurrentTheme();
    if (saved && saved !== 'default') applyTheme(saved);
})();

// --- GEMINI API CALL (with auto-retry on rate limit) ---
function _parse429Error(errBody) {
    const msg = errBody?.error?.message || '';
    // Google distinguishes RESOURCE_EXHAUSTED (quota) vs rate limit
    if (/quota/i.test(msg) || /per day/i.test(msg) || /daily/i.test(msg)) {
        return { retryable: false, message: 'Quota giornaliera esaurita per questo modello. Prova con un altro modello (es. gemini-2.0-flash o gemini-2.5-flash-lite) nelle Impostazioni.' };
    }
    if (/per minute/i.test(msg) || /rate limit/i.test(msg) || /too many/i.test(msg)) {
        return { retryable: true, message: 'Troppe richieste al minuto.' };
    }
    // Default: assume retryable
    return { retryable: true, message: msg || 'Limite richieste raggiunto.' };
}

async function callGemini(prompt, apiKey) {
    const MAX_RETRIES = 3;
    const BACKOFF_MS = [3000, 8000, 15000]; // 3s, 8s, 15s

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(`${getGeminiApiUrl()}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 4096,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Risposta vuota dall\'AI');
            return JSON.parse(text);
        }

        const err = await response.json().catch(() => ({}));

        if (response.status === 429) {
            const parsed = _parse429Error(err);
            if (!parsed.retryable) throw new Error(parsed.message);
            if (attempt < MAX_RETRIES) {
                // Update status text if visible
                const statusEl = document.getElementById('gemini-status-text');
                if (statusEl) statusEl.textContent = `Rate limit — nuovo tentativo tra ${BACKOFF_MS[attempt] / 1000}s (${attempt + 1}/${MAX_RETRIES})...`;
                await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
                continue;
            }
            throw new Error('Limite richieste persistente. Prova con un altro modello (es. gemini-2.0-flash o gemini-2.5-flash-lite) nelle Impostazioni, oppure attendi qualche minuto.');
        }

        if (response.status === 400) throw new Error('Chiave API non valida. Controlla nelle Impostazioni.');
        if (response.status === 404) {
            localStorage.removeItem('gemini_models_cache');
            throw new Error(`Il modello "${getGeminiModel()}" non è più disponibile. Apri Impostazioni e scegline un altro.`);
        }
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }
}

// --- SET GENERATION ---
const GEMINI_SET_PROMPT = `Sei un logopedista esperto in riabilitazione neuropsicologica.
Genera un set di stimoli terapeutici basato sulla richiesta dell'utente.

Rispondi SOLO con un oggetto JSON con questa struttura:
{
  "name": "Nome del set (breve, descrittivo)",
  "category": "Categoria appropriata (es. Animali, Cibo, Azioni, Oggetti, Colori, Personale)",
  "tags": ["tag1", "tag2"],
  "modes": ["tact", "ran", "memory", "tombola"],
  "items": [
    {"label": "Parola/frase"},
    {"label": "Parola/frase"}
  ]
}

Regole:
- Genera almeno 20 item (ideale per RAN)
- Le etichette devono essere in italiano
- Scegli le modalità più appropriate tra: tact, ran, ran_intensivo, fluenza, tombola, tombola_sonora, memory, search_find, intraverbal_scenari, zoom, quaderno, topologia, sequenze, categorizzazione, pool_random, pool_intraverbal, intruso
- I tag devono essere parole chiave semantiche in minuscolo
- La categoria deve essere concisa (1-2 parole)
- Per le sequenze, aggiungi "seqNumber" a ogni item
- Se l'utente chiede bisillabe, trisillabe ecc., rispetta la struttura fonologica
- Se l'utente specifica un livello di difficoltà, adatta la complessità lessicale

Richiesta dell'utente: `;

async function generateSetWithGemini(userPrompt) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Inserisci la chiave API Gemini nelle Impostazioni (icona chiave in alto a destra).');
    }

    const fullPrompt = GEMINI_SET_PROMPT + userPrompt;
    const result = await callGemini(fullPrompt, apiKey);

    // Validate structure
    if (!result.name || !result.items || !Array.isArray(result.items)) {
        throw new Error('Formato risposta non valido. Riprova.');
    }

    // Ensure items have required fields
    result.items = result.items.map(item => ({
        label: item.label || 'Senza nome',
        url: null,
        hidden: false,
        ...(item.seqNumber ? { seqNumber: item.seqNumber } : {})
    }));

    return result;
}

// --- UI: GENERATION MODAL ---
window.openGeminiGenerator = () => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        openSettings();
        setTimeout(() => {
            alert('Per generare set con AI, inserisci prima la tua chiave API Gemini gratuita.\n\nOttienila su: https://aistudio.google.com/apikey');
        }, 300);
        return;
    }

    // Create modal if not exists
    let modal = document.getElementById('modal-gemini');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-gemini';
        modal.className = 'modal-fs';
        modal.innerHTML = `
            <div class="modal-header">
                <h2><i class="fa-solid fa-wand-magic-sparkles"></i> Genera Set con AI</h2>
                <button class="btn btn-danger" onclick="closeGeminiGenerator()">Chiudi</button>
            </div>
            <div class="modal-body" style="max-width:600px; margin:0 auto;">
                <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:12px; padding:15px; margin-bottom:20px;">
                    <p style="margin:0; font-size:0.85rem; color:#a5b4fc;">
                        <i class="fa-solid fa-circle-info"></i> Descrivi il set che vuoi creare. Puoi specificare categoria, numero di sillabe, livello di difficoltà, tema, ecc.
                    </p>
                </div>

                <label style="font-size:0.85rem; color:#aaa;">Descrizione del set da generare</label>
                <textarea id="gemini-prompt" rows="4" placeholder="Es: 20 parole bisillabe di animali domestici per bambini di 4 anni&#10;Es: verbi di azioni quotidiane in forma infinitiva&#10;Es: oggetti della cucina, trisillabe, livello facile"
                    style="width:100%; padding:12px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:1rem; resize:vertical; font-family:inherit;"></textarea>

                <div id="gemini-suggestions" style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
                    <span class="tag-suggestion" onclick="setGeminiPrompt('20 animali bisillabe per bambini')">Animali bisillabe</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('cibi e alimenti comuni, parole semplici')">Cibi comuni</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('verbi di azioni quotidiane in forma infinitiva')">Verbi azioni</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('oggetti della casa, trisillabe')">Oggetti casa</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('mezzi di trasporto per bambini')">Trasporti</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('parti del corpo umano')">Corpo umano</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('vestiti e abbigliamento')">Abbigliamento</span>
                    <span class="tag-suggestion" onclick="setGeminiPrompt('frutta e verdura, parole facili')">Frutta e verdura</span>
                </div>

                <button id="gemini-generate-btn" class="btn btn-primary" style="width:100%; padding:15px; font-size:1.1rem; margin-top:10px;" onclick="runGeminiGeneration()">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Genera Set
                </button>

                <div id="gemini-status" style="display:none; text-align:center; padding:20px;">
                    <div class="loading-spinner" style="margin:0 auto 10px;"></div>
                    <p style="color:#a5b4fc;" id="gemini-status-text">Generazione in corso...</p>
                </div>

                <div id="gemini-result" style="display:none; margin-top:20px;">
                    <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:15px;">
                        <h3 style="margin:0 0 10px; color:var(--success-color);"><i class="fa-solid fa-check-circle"></i> Set generato!</h3>
                        <p id="gemini-result-info" style="margin:0; font-size:0.9rem; color:#ccc;"></p>
                    </div>
                    <div id="gemini-result-preview" style="max-height:300px; overflow-y:auto; margin-top:10px; padding:10px; background:rgba(0,0,0,0.2); border-radius:10px;"></div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="btn btn-success" style="flex:1; padding:12px;" onclick="saveGeminiSet()">
                            <i class="fa-solid fa-save"></i> Salva nell'Archivio
                        </button>
                        <button class="btn btn-ghost" style="padding:12px;" onclick="editGeminiSet()">
                            <i class="fa-solid fa-pen"></i> Modifica prima
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Reset state
    document.getElementById('gemini-prompt').value = '';
    document.getElementById('gemini-status').style.display = 'none';
    document.getElementById('gemini-result').style.display = 'none';
    document.getElementById('gemini-generate-btn').style.display = '';
    modal.classList.add('open');
};

window.closeGeminiGenerator = () => {
    const modal = document.getElementById('modal-gemini');
    if (modal) modal.classList.remove('open');
};

window.setGeminiPrompt = (text) => {
    document.getElementById('gemini-prompt').value = text;
};

// Store last generated set
let _lastGeminiSet = null;

window.runGeminiGeneration = async () => {
    const prompt = document.getElementById('gemini-prompt').value.trim();
    if (!prompt) {
        alert('Inserisci una descrizione per il set da generare.');
        return;
    }

    const btn = document.getElementById('gemini-generate-btn');
    const status = document.getElementById('gemini-status');
    const result = document.getElementById('gemini-result');

    btn.style.display = 'none';
    status.style.display = 'block';
    result.style.display = 'none';
    document.getElementById('gemini-status-text').textContent = `Generazione in corso con ${getGeminiModel()}...`;

    try {
        _lastGeminiSet = await generateSetWithGemini(prompt);

        // Show result
        const info = document.getElementById('gemini-result-info');
        info.innerHTML = `<b>${_lastGeminiSet.name}</b> &mdash; ${_lastGeminiSet.items.length} stimoli, Categoria: ${_lastGeminiSet.category || 'Personale'}`;

        const preview = document.getElementById('gemini-result-preview');
        preview.innerHTML = _lastGeminiSet.items.map((item, i) =>
            `<div style="padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; gap:8px;">
                <span style="color:#666; font-size:0.75rem; width:24px;">${i + 1}.</span>
                <span>${item.label}</span>
                ${item.seqNumber ? `<span style="color:var(--accent-color); font-size:0.75rem;">#${item.seqNumber}</span>` : ''}
            </div>`
        ).join('');

        status.style.display = 'none';
        result.style.display = 'block';
    } catch (err) {
        status.style.display = 'none';
        btn.style.display = '';
        alert('Errore: ' + err.message);
    }
};

window.saveGeminiSet = async () => {
    if (!_lastGeminiSet) return;

    const newSet = {
        id: Date.now().toString(),
        name: _lastGeminiSet.name,
        category: _lastGeminiSet.category || 'Personale',
        items: _lastGeminiSet.items,
        modes: _lastGeminiSet.modes || ['tact', 'ran', 'memory'],
        tags: _lastGeminiSet.tags || [],
        date: new Date().toLocaleDateString(),
        isClinical: false,
        generatedByAI: true
    };

    await DB.saveSet(newSet);
    await reloadLibrary();
    closeGeminiGenerator();

    // Open editor for the new set
    editSet(newSet.id);
};

window.editGeminiSet = async () => {
    // Save first, then open in editor
    await saveGeminiSet();
};
