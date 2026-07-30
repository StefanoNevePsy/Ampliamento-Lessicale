// === NVIDIA build.nvidia.com (NIM) INTEGRATION ===
// Free developer APIs: image generation (FLUX.2 Klein, FLUX.1, SD3, SDXL, ...)
// and OpenAI-compatible LLMs, ~40 requests/min on the free tier.
//
// The NVIDIA endpoints do NOT send CORS headers, so a plain fetch from the
// WebView is blocked. On Android we route every call through the native
// CapacitorHttp channel (no CORS applies to native HTTP); plain fetch stays
// as the fallback for environments where it works.
//
// Model selectors are self-updating:
// - LLMs: the /v1/models catalog endpoint is public → refresh + cache.
// - Images: there is no public catalog for the genai endpoints, so we PROBE a
//   candidate list (an unauthenticated POST returns 404 if the model does not
//   exist, 401 if it exists and wants a key). Future models (Qwen-Image, SANA,
//   FLUX.2 Dev/9B...) are pre-listed as candidates and light up automatically
//   once NVIDIA publishes them; arbitrary new slugs can be added by hand.

const NVIDIA_GENAI_BASE = 'https://ai.api.nvidia.com/v1/genai/';
const NVIDIA_LLM_BASE = 'https://integrate.api.nvidia.com/v1';

function getNvidiaApiKey() { return (localStorage.getItem('nvidia_api_key') || '').trim(); }
function setNvidiaApiKey(k) { localStorage.setItem('nvidia_api_key', (k || '').trim()); }
window.getNvidiaApiKey = getNvidiaApiKey;
window.setNvidiaApiKey = setNvidiaApiKey;

// ------------------------------------------------------------
// Text provider: which engine handles translations / AI set / report
// ------------------------------------------------------------
function getTextProvider() { return localStorage.getItem('text_provider') === 'nvidia' ? 'nvidia' : 'gemini'; }
function setTextProvider(p) { localStorage.setItem('text_provider', p === 'nvidia' ? 'nvidia' : 'gemini'); }
function nvidiaTextActive() { return getTextProvider() === 'nvidia' && !!getNvidiaApiKey(); }
function canCallTextModel() {
    return nvidiaTextActive() || (typeof getGeminiApiKey === 'function' && !!getGeminiApiKey());
}
window.getTextProvider = getTextProvider;
window.setTextProvider = setTextProvider;
window.nvidiaTextActive = nvidiaTextActive;
window.canCallTextModel = canCallTextModel;

// ------------------------------------------------------------
// Native-first HTTP (CapacitorHttp bypasses CORS on the device)
// ------------------------------------------------------------
async function _nvFetch(url, opts) {
    opts = opts || {};
    const cap = window.Capacitor;
    const http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    if (http && typeof http.request === 'function' && cap.isNativePlatform && cap.isNativePlatform()) {
        const res = await http.request({
            url,
            method: opts.method || 'GET',
            headers: opts.headers || {},
            data: opts.body ? JSON.parse(opts.body) : undefined,
            connectTimeout: 30000,
            readTimeout: 180000
        });
        return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
            text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
        };
    }
    return fetch(url, opts);
}

// ------------------------------------------------------------
// IMAGE MODELS — candidates, probing, selection
// ------------------------------------------------------------
// verified:true = endpoint confirmed live; verified:false = future candidate,
// enabled automatically by "Aggiorna" the day NVIDIA publishes it.
const NVIDIA_IMAGE_CANDIDATES = [
    { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B — consigliato, ~3s', family: 'flux', verified: true },
    { id: 'black-forest-labs/flux.1-schnell', label: 'FLUX.1 Schnell — rapido', family: 'flux-schnell', verified: true },
    { id: 'black-forest-labs/flux.1-dev', label: 'FLUX.1 Dev — alta qualit\u00e0, lento (~1 min)', family: 'flux-dev', verified: true },
    // Retired for new accounts (kept as probe candidates: the authenticated
    // refresh re-enables them only where they still work)
    { id: 'stabilityai/stable-diffusion-3-medium', label: 'Stable Diffusion 3 Medium', family: 'sd3', verified: false },
    { id: 'stabilityai/stable-diffusion-xl', label: 'SDXL', family: 'sdxl', verified: false },
    { id: 'briaai/bria-2.3', label: 'Bria 2.3 — licenza commerciale', family: 'sd3', verified: false },
    // --- futuri (si attivano da soli quando NVIDIA li pubblica) ---
    { id: 'black-forest-labs/flux.2-klein-9b', label: 'FLUX.2 Klein 9B', family: 'flux', verified: false },
    { id: 'black-forest-labs/flux.2-dev', label: 'FLUX.2 Dev — top', family: 'flux-dev', verified: false },
    { id: 'qwen/qwen-image', label: 'Qwen-Image — testo nelle immagini', family: 'flux', verified: false },
    { id: 'qwen/qwen-image-2512', label: 'Qwen-Image 2512', family: 'flux', verified: false },
    { id: 'nvidia/sana', label: 'SANA — ultra veloce', family: 'flux', verified: false },
    { id: 'nvidia/sana-1.5', label: 'SANA 1.5', family: 'flux', verified: false },
    { id: 'stabilityai/stable-diffusion-3.5-large', label: 'SD 3.5 Large', family: 'sd3', verified: false }
];

function _nvCustomModels() {
    try { const a = JSON.parse(localStorage.getItem('nvidia_img_custom') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
}
function _nvAvailableCache() {
    try { return JSON.parse(localStorage.getItem('nvidia_img_available_v2') || 'null'); }
    catch (e) { return null; }
}

// Currently offered image models: probed list when we have one, else the
// verified built-ins; user's custom slugs are always included.
function getNvidiaAvailableImageModels() {
    const cache = _nvAvailableCache();
    const ids = cache && Array.isArray(cache.ids) ? cache.ids : null;
    const models = NVIDIA_IMAGE_CANDIDATES.filter(c => (ids ? ids.includes(c.id) : c.verified));
    _nvCustomModels().forEach(id => {
        if (!models.some(m => m.id === id)) models.push({ id, label: id + ' (personalizzato)', family: 'flux', custom: true });
    });
    return models;
}
window.getNvidiaAvailableImageModels = getNvidiaAvailableImageModels;

function getNvidiaImageModel() {
    const m = localStorage.getItem('nvidia_image_model') || 'black-forest-labs/flux.2-klein-4b';
    const avail = getNvidiaAvailableImageModels();
    return avail.some(a => a.id === m) ? m : (avail[0] ? avail[0].id : m);
}
function setNvidiaImageModel(m) { if (m) localStorage.setItem('nvidia_image_model', m.trim()); }
window.getNvidiaImageModel = getNvidiaImageModel;
window.setNvidiaImageModel = setNvidiaImageModel;

// Probe one slug: 404 → does not exist; anything else (401/422/429...) → exists.
async function _nvProbeModel(id) {
    const cand = NVIDIA_IMAGE_CANDIDATES.find(c => c.id === id);
    const isChat = !!(cand && cand.family === 'chat-image');
    const key = getNvidiaApiKey();
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    // Out-of-range steps: live models answer 422 (exists) WITHOUT generating;
    // absent or account-retired functions answer 404 even when authenticated
    // (unauthenticated probes can't see retirements, so use the key if set).
    const body = isChat
        ? { model: id, messages: [{ role: 'user', content: 'probe' }], max_tokens: 1 }
        : { prompt: 'probe', steps: 99999 };
    try {
        const res = await _nvFetch(isChat ? (NVIDIA_LLM_BASE + '/chat/completions') : (NVIDIA_GENAI_BASE + id), {
            method: 'POST', headers, body: JSON.stringify(body)
        });
        return res.status !== 404;
    } catch (e) { return null; } // network/CORS failure: unknown
}

window.refreshNvidiaImageModels = async function (manual) {
    const icon = document.getElementById('nvidia-img-refresh-icon');
    const status = document.getElementById('nvidia-img-status');
    if (icon) icon.classList.add('fa-spin');
    try {
        const slugs = [...new Set([...NVIDIA_IMAGE_CANDIDATES.map(c => c.id), ..._nvCustomModels()])];
        const results = await Promise.all(slugs.map(async id => ({ id, ok: await _nvProbeModel(id) })));
        if (results.every(r => r.ok === null)) throw new Error('verifica non riuscita (di solito serve l\'app Android: il browser blocca la richiesta)');
        const ids = results.filter(r => r.ok === true).map(r => r.id);
        localStorage.setItem('nvidia_img_available_v2', JSON.stringify({ ts: Date.now(), ids }));
        populateNvidiaImageSelect();
        if (status) status.textContent = `${ids.length} modelli attivi sul catalogo NVIDIA · aggiornato ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
        if (status) status.textContent = 'Lista non aggiornata: ' + e.message;
        if (manual && !document.getElementById('nvidia-img-status')) alert('Aggiornamento modelli NVIDIA fallito: ' + e.message);
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
};

window.addNvidiaCustomModel = async function () {
    const input = document.getElementById('nvidia-custom-model');
    const status = document.getElementById('nvidia-img-status');
    const slug = (input?.value || '').trim().replace(/^\/+|\/+$/g, '');
    if (!slug || !slug.includes('/')) { alert('Inserisci lo slug nel formato org/modello (es. qwen/qwen-image), come appare nell\'URL su build.nvidia.com.'); return; }
    if (status) status.textContent = 'Verifica di ' + slug + '...';
    const ok = await _nvProbeModel(slug);
    if (ok === false) { if (status) status.textContent = `"${slug}" non esiste sul catalogo hosted NVIDIA (404).`; return; }
    const customs = _nvCustomModels();
    if (!customs.includes(slug)) { customs.push(slug); localStorage.setItem('nvidia_img_custom', JSON.stringify(customs)); }
    setNvidiaImageModel(slug);
    if (input) input.value = '';
    populateNvidiaImageSelect();
    if (status) status.textContent = ok === true ? `"${slug}" verificato e aggiunto ✓` : `"${slug}" aggiunto (verifica non possibile da qui).`;
};

function populateNvidiaImageSelect() {
    ['nvidia-image-model', 'nvidia-model-single'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const cur = getNvidiaImageModel();
        sel.innerHTML = getNvidiaAvailableImageModels()
            .map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.label}</option>`).join('');
    });
}
window.populateNvidiaImageSelect = populateNvidiaImageSelect;

function _nvImageModelSelectHtml(id) {
    const cur = getNvidiaImageModel();
    return `<select id="${id}" onchange="setNvidiaImageModel(this.value)" style="width:100%; padding:8px 10px; border-radius:8px; background:rgba(var(--shade-rgb),0.3); border:1px solid var(--glass-border); color:var(--text-primary); font-size:0.82rem; margin-bottom:10px; cursor:pointer;">
        ${getNvidiaAvailableImageModels().map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.label}</option>`).join('')}
    </select>`;
}
window._nvImageModelSelectHtml = _nvImageModelSelectHtml;

// ------------------------------------------------------------
// IMAGE GENERATION
// ------------------------------------------------------------
async function generateNvidiaImage(prompt, style) {
    const key = getNvidiaApiKey();
    if (!key) throw new Error('Chiave NVIDIA non configurata. Vai in Impostazioni > API.');
    const model = getNvidiaImageModel();
    const family = (NVIDIA_IMAGE_CANDIDATES.find(c => c.id === model) || {}).family || 'flux';

    const parts = [prompt];
    if (style && typeof POLL_STYLES !== 'undefined') {
        const s = POLL_STYLES.find(st => st.id === style);
        if (s) parts.push(s.prompt);
    }
    parts.push('single subject, centered, isolated on a pure white background, no shadow');
    const fullPrompt = parts.join(', ');
    const seed = Math.floor(Math.random() * 4294967295);

    if (family === 'chat-image') {
        // Chat-completions image models (DiffusionGemma & co.): the image comes
        // back base64-embedded in the assistant message; parse permissively.
        let res;
        try {
            res = await _nvFetch(NVIDIA_LLM_BASE + '/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: fullPrompt }], max_tokens: 4096, stream: false })
            });
        } catch (e) {
            throw new Error('Impossibile contattare l\'API NVIDIA (dal browser è bloccata: usa l\'app Android).');
        }
        if (!res.ok) {
            let msg = ''; try { const d = await res.json(); msg = d.detail || (d.error && d.error.message) || JSON.stringify(d); } catch (e) {}
            if (res.status === 401 || res.status === 403) throw new Error('Chiave NVIDIA non valida o scaduta. Controlla in Impostazioni > API.');
            if (res.status === 404) throw new Error(`Il modello "${model}" non è più disponibile: premi Aggiorna nelle Impostazioni.`);
            if (res.status === 429) throw new Error('Rate limit NVIDIA (~40 richieste/min). Riprova tra poco.');
            throw new Error(`Errore NVIDIA (${res.status}): ${String(msg).slice(0, 250)}`);
        }
        const data = await res.json();
        const message = data.choices && data.choices[0] && data.choices[0].message;
        const blob = JSON.stringify(message || data);
        const m = blob.match(new RegExp('data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)'));
        if (m) return `data:image/${m[1] === 'jpg' ? 'jpeg' : m[1]};base64,${m[2]}`;
        if (message && message.b64_json) return 'data:image/png;base64,' + message.b64_json;
        throw new Error('Il modello non ha restituito un\'immagine. Risposta: ' + blob.slice(0, 160) + '…');
    }

    let body;
    if (family === 'sdxl') {
        body = { text_prompts: [{ text: fullPrompt }], cfg_scale: 5, sampler: 'K_EULER_ANCESTRAL', seed, steps: 25 };
    } else if (family === 'sd3') {
        body = { prompt: fullPrompt, cfg_scale: 5, aspect_ratio: '1:1', seed, steps: 30, negative_prompt: '' };
    } else if (family === 'flux-dev') {
        body = { prompt: fullPrompt, mode: 'base', cfg_scale: 3.5, width: 1024, height: 1024, seed, steps: 30 };
    } else if (family === 'flux-schnell') {
        body = { prompt: fullPrompt, width: 1024, height: 1024, seed, steps: 4 };
    } else { // flux.2 klein & default for unknown/custom slugs
        // NVIDIA's Klein endpoint validates steps <= 4
        body = { prompt: fullPrompt, width: 1024, height: 1024, seed, steps: 4 };
    }

    let res;
    try {
        res = await _nvFetch(NVIDIA_GENAI_BASE + model, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        throw new Error('Impossibile contattare l\'API NVIDIA (dal browser è bloccata: usa l\'app Android).');
    }

    if (!res.ok) {
        let msg = '';
        try { const d = await res.json(); msg = d.detail || d.title || (d.error && d.error.message) || JSON.stringify(d); }
        catch (e) { msg = await res.text().catch(() => ''); }
        if (res.status === 401 || res.status === 403) throw new Error('Chiave NVIDIA non valida o scaduta. Controlla in Impostazioni > API.');
        if (res.status === 404) throw new Error(`Il modello "${model}" non è più disponibile: premi Aggiorna nelle Impostazioni.`);
        if (res.status === 429) throw new Error('Rate limit NVIDIA (~40 richieste/min). Riprova tra poco.');
        throw new Error(`Errore NVIDIA (${res.status}): ${String(msg).slice(0, 250)}`);
    }

    const data = await res.json();
    const b64 = (data.artifacts && data.artifacts[0] && data.artifacts[0].base64)
        || data.image
        || (data.images && data.images[0] && (typeof data.images[0] === 'string' ? data.images[0] : data.images[0].image || data.images[0].base64))
        || (data.data && data.data[0] && data.data[0].b64_json);
    if (!b64 || typeof b64 !== 'string') throw new Error('Risposta NVIDIA senza immagine.');
    const mime = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${b64}`;
}
window.generateNvidiaImage = generateNvidiaImage;

// ------------------------------------------------------------
// LLM — self-updating catalog (public /v1/models) + chat helpers
// ------------------------------------------------------------
const NVIDIA_LLM_FAVORITES = [
    'meta/llama-3.3-70b-instruct',
    'meta/llama-4-maverick-17b-128e-instruct',
    'mistralai/mistral-large-3-675b-instruct-2512',
    'deepseek-ai/deepseek-v4-flash',
    'google/gemma-3-12b-it'
];
const _NV_LLM_EXCLUDE = /embed|rerank|ocr|paddle|clip|guard|safety|riva|-vl-|vlm|fuyu|kosmos|vila|neva/i;

function getNvidiaLlmModel() { return localStorage.getItem('nvidia_llm_model') || NVIDIA_LLM_FAVORITES[0]; }
function setNvidiaLlmModel(m) { if (m) localStorage.setItem('nvidia_llm_model', m.trim()); }
window.getNvidiaLlmModel = getNvidiaLlmModel;
window.setNvidiaLlmModel = setNvidiaLlmModel;

function _nvLlmCache() {
    try { return JSON.parse(localStorage.getItem('nvidia_llm_models_cache') || 'null'); }
    catch (e) { return null; }
}

window.refreshNvidiaLlmModels = async function (manual) {
    const icon = document.getElementById('nvidia-llm-refresh-icon');
    if (icon) icon.classList.add('fa-spin');
    try {
        const res = await _nvFetch(NVIDIA_LLM_BASE + '/models', { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const ids = (data.data || []).map(m => m.id).filter(id => !_NV_LLM_EXCLUDE.test(id)).sort();
        if (!ids.length) throw new Error('lista vuota');
        localStorage.setItem('nvidia_llm_models_cache', JSON.stringify({ ts: Date.now(), ids }));
        populateNvidiaLlmSelect();
    } catch (e) {
        if (manual) alert('Aggiornamento LLM NVIDIA fallito: ' + e.message + '\n(dal browser la richiesta è bloccata: usa l\'app Android)');
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
};

function populateNvidiaLlmSelect() {
    const sel = document.getElementById('nvidia-llm-model');
    if (!sel) return;
    const cache = _nvLlmCache();
    const ids = (cache && cache.ids) || [];
    const all = [...new Set([...NVIDIA_LLM_FAVORITES.filter(f => !ids.length || ids.includes(f)), ...ids])];
    const cur = getNvidiaLlmModel();
    if (!all.includes(cur)) all.unshift(cur);
    sel.innerHTML = all.map(id => `<option value="${id}"${id === cur ? ' selected' : ''}>${id}</option>`).join('');
}
window.populateNvidiaLlmSelect = populateNvidiaLlmSelect;

// Core chat call (OpenAI-compatible).
async function nvidiaChat(messages, opts) {
    opts = opts || {};
    const key = getNvidiaApiKey();
    if (!key) throw new Error('Chiave NVIDIA non configurata. Vai in Impostazioni > API.');
    let res;
    try {
        res = await _nvFetch(NVIDIA_LLM_BASE + '/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: opts.model || getNvidiaLlmModel(),
                messages,
                temperature: opts.temperature != null ? opts.temperature : 0.4,
                max_tokens: opts.maxTokens || 4096,
                stream: false
            })
        });
    } catch (e) {
        throw new Error('Impossibile contattare l\'API NVIDIA (dal browser è bloccata: usa l\'app Android).');
    }
    if (!res.ok) {
        let msg = ''; try { const d = await res.json(); msg = d.detail || (d.error && d.error.message) || JSON.stringify(d); } catch (e) { }
        if (res.status === 401 || res.status === 403) throw new Error('Chiave NVIDIA non valida. Controlla in Impostazioni > API.');
        if (res.status === 404) throw new Error(`Il modello LLM "${opts.model || getNvidiaLlmModel()}" non è disponibile: aggiornane la lista nelle Impostazioni.`);
        if (res.status === 429) throw new Error('Rate limit NVIDIA. Riprova tra poco.');
        throw new Error(`Errore NVIDIA (${res.status}): ${String(msg).slice(0, 250)}`);
    }
    const data = await res.json();
    let text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Risposta vuota dal modello NVIDIA.');
    // Strip reasoning blocks some models (DeepSeek & co.) prepend.
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return text;
}
window.nvidiaChat = nvidiaChat;

async function nvidiaChatText(prompt, opts) {
    return nvidiaChat([{ role: 'user', content: prompt }], opts);
}
window.nvidiaChatText = nvidiaChatText;

// JSON-mode helper: mirrors callGemini's contract (returns a parsed object).
async function nvidiaChatJSON(prompt, opts) {
    const text = await nvidiaChat([
        { role: 'system', content: 'Rispondi SOLO con JSON valido, senza testo aggiuntivo e senza blocchi di codice.' },
        { role: 'user', content: prompt }
    ], Object.assign({ temperature: 0.2 }, opts));
    // Tolerate code fences / stray prose: parse the outermost JSON value.
    const start = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i === -1 ? Infinity : i; }));
    if (start === Infinity) throw new Error('Il modello NVIDIA non ha restituito JSON. Prova un LLM diverso nelle Impostazioni.');
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    return JSON.parse(text.slice(start, end + 1));
}
window.nvidiaChatJSON = nvidiaChatJSON;

// Conversation in Gemini "contents" shape → OpenAI messages.
async function nvidiaConversation(contents, opts) {
    const messages = (contents || []).map(c => ({
        role: c.role === 'model' ? 'assistant' : 'user',
        content: (c.parts || []).map(p => p.text || '').join('\n')
    }));
    return nvidiaChat(messages, Object.assign({ maxTokens: 8192, temperature: 0.7 }, opts));
}
window.nvidiaConversation = nvidiaConversation;

// Provider-routing entry point used by translations / AI set generation.
// Same contract as callGemini: returns a parsed JSON value.
async function callTextJSON(prompt, geminiModelHint) {
    if (nvidiaTextActive()) return nvidiaChatJSON(prompt);
    const apiKey = typeof getGeminiApiKey === 'function' ? getGeminiApiKey() : '';
    if (!apiKey) throw new Error('Nessun motore testo configurato: inserisci la chiave Gemini o attiva NVIDIA in Impostazioni > API.');
    return callGemini(prompt, apiKey, geminiModelHint);
}
window.callTextJSON = callTextJSON;

// ------------------------------------------------------------
// SETTINGS UI
// ------------------------------------------------------------
const _NV_CACHE_TTL = 24 * 60 * 60 * 1000;

window.populateNvidiaSettings = function () {
    const keyInput = document.getElementById('nvidia-api-key');
    if (keyInput) keyInput.value = getNvidiaApiKey();
    populateNvidiaImageSelect();
    populateNvidiaLlmSelect();
    const prov = document.getElementById('text-provider-select');
    if (prov) prov.value = getTextProvider();
    const status = document.getElementById('nvidia-img-status');
    const cache = _nvAvailableCache();
    if (status && cache) status.textContent = `${(cache.ids || []).length} modelli attivi · ultimo controllo ${new Date(cache.ts).toLocaleDateString('it-IT')} ${new Date(cache.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    // Auto-refresh both catalogs in background when stale (self-updating selectors).
    if (!cache || (Date.now() - cache.ts) > _NV_CACHE_TTL) setTimeout(() => window.refreshNvidiaImageModels(false), 400);
    const llmCache = _nvLlmCache();
    if (!llmCache || (Date.now() - llmCache.ts) > _NV_CACHE_TTL) setTimeout(() => window.refreshNvidiaLlmModels(false), 900);
};
