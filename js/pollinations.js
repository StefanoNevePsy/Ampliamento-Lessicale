// === IMAGE SEARCH & GENERATION: PIXABAY + OPENVERSE + CLOUDFLARE WORKERS AI ===

// --- AUTO-TRANSLATION (Italian labels → English prompts via Gemini) ---
const _translationCache = {};

async function translateLabelsForImageGen(labels) {
    if (typeof canCallTextModel === 'function' ? !canCallTextModel() : !(typeof getGeminiApiKey === 'function' && getGeminiApiKey())) return {};

    const toTranslate = labels.filter(l => l && !_translationCache[l.toLowerCase().trim()]);
    if (toTranslate.length === 0) {
        const result = {};
        labels.forEach(l => { if (l) result[l] = _translationCache[l.toLowerCase().trim()] || l; });
        return result;
    }

    const prompt = `Translate each Italian word/phrase to English for image generation.
Return ONLY a JSON object mapping each Italian input to its English translation.
Keep it simple and concrete (e.g. "gatto" → "cat", "macchina della polizia" → "police car").
If already English, keep as-is.

Input: ${JSON.stringify(toTranslate)}`;

    try {
        const transModel = typeof getEffectiveTranslationModel === 'function' ? getEffectiveTranslationModel() : undefined;
        const map = await callTextJSON(prompt, transModel);
        for (const [it, en] of Object.entries(map)) {
            _translationCache[it.toLowerCase().trim()] = en;
        }
    } catch (e) {
        console.warn('Translation failed, using original labels:', e.message);
    }

    const result = {};
    labels.forEach(l => { if (l) result[l] = _translationCache[l.toLowerCase().trim()] || l; });
    return result;
}

async function translateSingleLabel(label) {
    if (!label) return label;
    const key = label.toLowerCase().trim();
    if (_translationCache[key]) return _translationCache[key];
    const map = await translateLabelsForImageGen([label]);
    return map[label] || label;
}

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

// Prefer subjects on a white/isolated background (good for clinical cards)
function getPixabayWhiteBg() {
    return localStorage.getItem('pixabay_white_bg') !== 'false'; // default true
}
function setPixabayWhiteBg(on) {
    localStorage.setItem('pixabay_white_bg', on ? 'true' : 'false');
}

async function searchPixabay(query, perPage = 12, whiteBg) {
    const apiKey = getPixabayApiKey();
    if (!apiKey) throw new Error('Pixabay API key non configurata. Vai in Impostazioni > Immagini.');
    const useWhite = whiteBg === undefined ? getPixabayWhiteBg() : whiteBg;
    let url = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}&safesearch=true`;
    // colors=white biases results toward white-dominant (isolated) images
    if (useWhite) url += '&colors=white';
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
    if (!resp.ok) throw new Error('Errore download immagine');
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- OPENVERSE API (Creative Commons aggregator, no key required) ---
async function searchOpenverse(query, perPage = 12) {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${perPage}&mature=false`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Errore Openverse (${resp.status})`);
    const data = await resp.json();
    return (data.results || []).map(h => ({
        // The CORS-friendly Openverse thumbnail proxy is the reliable download
        // path; original source URLs (Flickr, etc.) often block browser fetch.
        preview: h.thumbnail,
        web: h.thumbnail,
        tags: (h.tags || []).map(t => t.name).join(', '),
        license: (h.license || '').toUpperCase(),
        attribution: h.attribution || ''
    }));
}

// --- ARASAAC API (pittogrammi AAC, gratuito, CORS, nessuna chiave) ---
// Ideal for clean symbol images on white background and visual prompt buttons.
function getArasaacLang() {
    return localStorage.getItem('arasaac_lang') || 'it';
}
function setArasaacLang(lang) {
    localStorage.setItem('arasaac_lang', (lang || 'it').trim());
}

function arasaacImageUrl(id, size = 500) {
    return `https://static.arasaac.org/pictograms/${id}/${id}_${size}.png`;
}

async function searchArasaac(query, perPage = 16, lang) {
    const language = lang || getArasaacLang();
    const url = `https://api.arasaac.org/api/pictograms/${encodeURIComponent(language)}/search/${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.status === 404) return []; // ARASAAC returns 404 when no matches
    if (!resp.ok) throw new Error(`Errore ARASAAC (${resp.status})`);
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, perPage).map(h => {
        const kw = (h.keywords || []).map(k => k.keyword).filter(Boolean).join(', ');
        return {
            preview: arasaacImageUrl(h._id, 300),
            web: arasaacImageUrl(h._id, 500),
            large: arasaacImageUrl(h._id, 500),
            tags: kw,
            arasaacId: h._id
        };
    });
}

// --- AI-powered ARASAAC query normalization via Gemini ---
async function aiNormalizeArasaacQuery(query) {
    if (typeof canCallTextModel === 'function' && !canCallTextModel()) throw new Error('Nessun motore testo configurato. Vai in Impostazioni > API.');

    const lang = getArasaacLang();
    const langName = {it:'italiano', en:'inglese', es:'spagnolo', fr:'francese', de:'tedesco'}[lang] || 'italiano';

    const prompt = `Sei un assistente per la ricerca nel database di pittogrammi ARASAAC.
Il database usa tag specifici: verbi all'infinito, nomi al singolare nella forma base, senza articoli/preposizioni.

L'utente cerca: "${query}" (lingua: ${langName})

Restituisci SOLO un JSON con questo formato:
{"query": "termine ottimizzato per la ricerca", "alternatives": ["alternativa1", "alternativa2"]}

Regole:
- Converti i verbi alla forma infinita (es. "mangia" → "mangiare", "corre" → "correre")
- Usa il nome al singolare e forma base (es. "le macchine" → "macchina", "dei gatti" → "gatto")
- Rimuovi articoli, preposizioni, aggettivi superflui
- Se il termine è composto, semplifica (es. "macchina della polizia" → "polizia")
- Suggerisci 2-3 alternative che ARASAAC potrebbe avere come tag
- Mantieni la lingua ${langName}`;

    const transModel = typeof getEffectiveTranslationModel === 'function' ? getEffectiveTranslationModel() : undefined;
    return await callTextJSON(prompt, transModel);
}

window.aiArasaacSearch = async (itemIndex) => {
    const input = document.getElementById('arasaac-query');
    const query = input?.value?.trim();
    if (!query) return;

    const btn = document.querySelector('#img-tab-arasaac .ai-arasaac-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i>'; }

    try {
        const result = await aiNormalizeArasaacQuery(query);
        if (result && result.query) {
            input.value = result.query;
            // Show alternatives as small clickable chips below the search
            const altContainer = document.getElementById('arasaac-ai-alternatives');
            if (altContainer && result.alternatives && result.alternatives.length > 0) {
                altContainer.innerHTML = result.alternatives.map(alt =>
                    `<button onclick="document.getElementById('arasaac-query').value='${jsAttr(alt)}'; runArasaacSearch(${itemIndex})" style="padding:3px 10px; border-radius:12px; border:1px solid rgba(168,85,247,0.3); background:rgba(168,85,247,0.1); color:#a855f7; font-size:0.75rem; cursor:pointer;">${typeof escapeHtml === 'function' ? escapeHtml(alt) : alt}</button>`
                ).join('');
            }
            runArasaacSearch(itemIndex);
        }
    } catch (err) {
        alert('Errore AI: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; }
    }
};

// --- CLOUDFLARE WORKERS AI (FLUX.1 Schnell, ~2000 img/day free) ---
// Requires the user to deploy a small Worker proxy — see CLOUDFLARE_WORKER.md
function getCloudflareWorkerUrl() {
    return localStorage.getItem('cloudflare_worker_url') || '';
}

function setCloudflareWorkerUrl(url) {
    localStorage.setItem('cloudflare_worker_url', url.trim());
}

function getCloudflareAuthToken() {
    return localStorage.getItem('cloudflare_auth_token') || '';
}

function setCloudflareAuthToken(token) {
    localStorage.setItem('cloudflare_auth_token', token.trim());
}

const CLOUDFLARE_DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

const CLOUDFLARE_MODELS = [
    { value: '@cf/black-forest-labs/flux-2-klein-4b', label: 'FLUX.2 Klein 4B — qualità (~320/g)' },
    { value: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 Schnell — veloce (~2000/g)' },
    { value: '@cf/black-forest-labs/flux-2-klein-9b', label: 'FLUX.2 Klein 9B — top (~7/g)' },
    { value: '@cf/leonardo/lucid-origin', label: 'Leonardo Lucid Origin (~15/g)' },
    { value: '@cf/leonardo/phoenix-1.0', label: 'Leonardo Phoenix 1.0 (~18/g)' },
];

function _cfModelSelectHtml(id) {
    const cur = getCloudflareModel();
    return `<select id="${id}" onchange="setCloudflareModel(this.value)" style="width:100%; padding:8px 10px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.82rem; margin-bottom:10px; cursor:pointer;">
        ${CLOUDFLARE_MODELS.map(m => `<option value="${m.value}"${m.value === cur ? ' selected' : ''}>${m.label}</option>`).join('')}
    </select>`;
}

function getCloudflareModel() {
    return localStorage.getItem('cloudflare_model') || CLOUDFLARE_DEFAULT_MODEL;
}

function setCloudflareModel(model) {
    localStorage.setItem('cloudflare_model', (model || CLOUDFLARE_DEFAULT_MODEL).trim());
}

function _cloudflareStepsForModel(model) {
    if (model.includes('flux-1-schnell')) return 4;
    if (model.includes('flux-2-klein-4b')) return 4;
    if (model.includes('flux-2-klein-9b')) return 25;
    if (model.includes('leonardo')) return 25;
    return undefined;
}

async function generateCloudflareImage(prompt, style) {
    const workerUrl = getCloudflareWorkerUrl();
    if (!workerUrl) throw new Error('Cloudflare Worker URL non configurato. Vai in Impostazioni > Immagini.');

    const parts = [prompt, 'isolated on pure white background, centered, studio lighting, no shadow, single subject'];
    if (style) {
        const s = POLL_STYLES.find(st => st.id === style);
        if (s) parts.push(s.prompt);
    }
    const fullPrompt = parts.join(', ');

    const headers = { 'Content-Type': 'application/json' };
    const token = getCloudflareAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const model = getCloudflareModel();
    const body = { prompt: fullPrompt, width: 1024, height: 1024, model };
    const steps = _cloudflareStepsForModel(model);
    if (steps) body.steps = steps;

    let response;
    try {
        response = await fetch(workerUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
    } catch (e) {
        throw new Error(
            'Impossibile contattare il Worker Cloudflare. ' +
            'Assicurati di aver fatto il deploy del codice aggiornato (vedi Istruzioni Setup) ' +
            'e che il binding AI sia configurato.'
        );
    }

    if (!response.ok) {
        if (response.status === 401) throw new Error('Token Cloudflare non valido. Controlla nelle Impostazioni.');
        if (response.status === 429) throw new Error('Rate limit Cloudflare. Attendi o controlla i neuroni consumati nel dashboard.');
        let errMsg = '';
        try {
            const errData = await response.json();
            errMsg = errData.error || JSON.stringify(errData);
        } catch (_) {
            errMsg = await response.text().catch(() => '');
        }
        throw new Error(`Errore Cloudflare (${response.status}): ${errMsg.slice(0, 300)}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(`Errore modello Cloudflare: ${data.error}`);
    if (!data.image) throw new Error('Nessuna immagine restituita dal Worker.');
    const b64 = data.image;
    const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
}

// Google "Nano Banana 2 Lite" (gemini-3.1-flash-lite-image) via the Gemini API.
// PAID model (no free tier for image generation) — needs a key with billing on.
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
async function generateGeminiImage(prompt, style) {
    const key = (typeof getGeminiApiKey === 'function') ? getGeminiApiKey() : '';
    if (!key) throw new Error('Chiave API Gemini non configurata. Vai in Impostazioni > API.');

    const parts = [prompt, 'isolated on pure white background, centered, studio lighting, no shadow, single subject'];
    if (style) { const s = POLL_STYLES.find(st => st.id === style); if (s) parts.push(s.prompt); }
    const fullPrompt = parts.join(', ');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: { responseModalities: ['IMAGE'] }
            })
        });
    } catch (e) {
        throw new Error('Impossibile contattare l\'API Gemini. Verifica la connessione.');
    }

    if (!response.ok) {
        let msg = '';
        try { const d = await response.json(); msg = (d.error && d.error.message) || JSON.stringify(d); }
        catch (_) { msg = await response.text().catch(() => ''); }
        if (response.status === 429) throw new Error('Rate limit Gemini. Riprova tra poco.');
        if (response.status === 403 || /billing|FAILED_PRECONDITION|not enabled/i.test(msg)) {
            throw new Error('Nano Banana 2 Lite richiede la fatturazione attiva sul progetto Google (modello a pagamento).');
        }
        throw new Error(`Errore Gemini (${response.status}): ${String(msg).slice(0, 300)}`);
    }

    const data = await response.json();
    const cand = data.candidates && data.candidates[0];
    const outParts = (cand && cand.content && cand.content.parts) || [];
    const imgPart = outParts.find(p => p.inlineData || p.inline_data);
    const inline = imgPart && (imgPart.inlineData || imgPart.inline_data);
    if (!inline || !inline.data) {
        const fr = cand && (cand.finishReason || cand.finish_reason);
        throw new Error('Nessuna immagine restituita da Gemini' + (fr ? ` (${fr})` : '') + '. Il prompt potrebbe essere stato rifiutato.');
    }
    const mime = inline.mimeType || inline.mime_type || 'image/png';
    return `data:${mime};base64,${inline.data}`;
}

// Guide: how to get ~8.800 free Nano Banana images via the Google Cloud trial.
window.showGeminiBulkGuide = () => {
    const existing = document.getElementById('modal-gemini-trial');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-gemini-trial';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:21000; display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';
    modal.innerHTML = `
        <div style="width:100%; max-width:520px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:22px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; color:white; font-size:1.05rem;"><i class="fa-solid fa-images" style="color:#34d399;"></i> Immagini in blocco gratis (Nano Banana)</h3>
                <button class="btn btn-ghost" onclick="document.getElementById('modal-gemini-trial').remove()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p style="color:var(--text-secondary); font-size:0.85rem; margin:0 0 12px;">Il modello immagini di Google (Nano&nbsp;Banana) costa ~0,034$ a immagine, ma i <b>300$ di credito di prova</b> di Google Cloud bastano per <b>~8.800 immagini gratis</b>. Una volta configurato, il generatore in blocco le crea tutte da solo.</p>
            <ol style="color:#ddd; font-size:0.85rem; line-height:1.6; padding-left:20px; margin:0 0 12px;">
                <li>Apri <a href="https://console.cloud.google.com/" target="_blank" style="color:#8ab4f8;">console.cloud.google.com</a> e accedi con Google.</li>
                <li>In alto, <b>crea un nuovo progetto</b> (es. &laquo;stimoli&raquo;).</li>
                <li>Attiva la <b>prova gratuita</b> (300$ / 90 giorni). Serve una carta per verifica, ma <b>non c'è addebito automatico</b> alla fine della prova.</li>
                <li>Cerca e <b>abilita</b> &laquo;<b>Generative Language API</b>&raquo; per quel progetto.</li>
                <li>Vai su <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#8ab4f8;">aistudio.google.com/apikey</a> &rarr; <b>Create API key</b> e scegli <b>il progetto appena creato</b> (quello con la fatturazione attiva).</li>
                <li>Copia la chiave e incollala in <b>Impostazioni &rarr; API &rarr; Gemini AI</b>.</li>
                <li>Nell'editor di un set: <b>Genera in blocco</b> &rarr; <b>Nano Banana</b> &rarr; scegli gli stili e avvia. Genera tutti gli item mancanti in automatico.</li>
            </ol>
            <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:10px; font-size:0.8rem; color:#6ee7b7; margin-bottom:8px;">
                <i class="fa-solid fa-shield-halved"></i> Alla fine dei 300$ (o dei 90 giorni) il servizio si ferma e basta: Google <b>non</b> addebita nulla senza una tua conferma esplicita di passaggio a pagamento.
            </div>
            <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:10px; font-size:0.8rem; color:#fcd34d; margin-bottom:14px;">
                <i class="fa-solid fa-circle-info"></i> La stessa chiave serve sia per le immagini sia per la traduzione delle etichette: una sola configurazione.
            </div>
            <button class="btn btn-primary" style="width:100%; padding:12px;" onclick="document.getElementById('modal-gemini-trial').remove()">Ho capito</button>
        </div>`;
    document.body.appendChild(modal);
};

// --- SINGLE ITEM IMAGE GENERATOR (with tabs: Pixabay / Openverse / Cloudflare) ---
let _pollSelectedStyle = null;
let _pollLastImageUrl = null;
let _imgGenTab = 'pixabay';

window.openPollinationsGenerator = (itemIndex) => {
    const item = state.editingItems[itemIndex];
    if (!item) return;

    _pollSelectedStyle = null;
    _pollLastImageUrl = null;
    _imgGenTab = getPixabayApiKey() ? 'pixabay' : 'openverse';

    const existing = document.getElementById('modal-pollinations');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-pollinations';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    const hasPixabay = !!getPixabayApiKey();
    const hasCloudflare = !!getCloudflareWorkerUrl();
    const hasGeminiKey = typeof getGeminiApiKey === 'function' && !!getGeminiApiKey();
    const hasNvidiaKey = typeof getNvidiaApiKey === 'function' && !!getNvidiaApiKey();

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
                <button class="img-src-tab ${_imgGenTab === 'arasaac' ? 'active' : ''}" onclick="switchImgGenTab('arasaac', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'arasaac' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'arasaac' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-icons"></i> ARASAAC
                </button>
                <button class="img-src-tab ${_imgGenTab === 'openverse' ? 'active' : ''}" onclick="switchImgGenTab('openverse', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'openverse' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'openverse' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-images"></i> Openverse
                </button>
                <button class="img-src-tab ${_imgGenTab === 'cloudflare' ? 'active' : ''}" onclick="switchImgGenTab('cloudflare', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'cloudflare' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'cloudflare' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-cloud"></i> Cloudflare ${!hasCloudflare ? '<span style="font-size:0.6rem; opacity:0.5;">(no url)</span>' : ''}
                </button>
                <button class="img-src-tab ${_imgGenTab === 'gemini' ? 'active' : ''}" onclick="switchImgGenTab('gemini', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'gemini' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'gemini' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Gemini ${!hasGeminiKey ? '<span style="font-size:0.6rem; opacity:0.5;">(no key)</span>' : ''}
                </button>
                <button class="img-src-tab ${_imgGenTab === 'nvidia' ? 'active' : ''}" onclick="switchImgGenTab('nvidia', ${itemIndex})" style="padding:6px 12px; border:none; border-radius:8px 8px 0 0; background:${_imgGenTab === 'nvidia' ? 'rgba(99,102,241,0.2)' : 'transparent'}; color:${_imgGenTab === 'nvidia' ? 'var(--accent-color)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.8rem; font-weight:600;">
                    <i class="fa-solid fa-microchip"></i> NVIDIA ${!hasNvidiaKey ? '<span style="font-size:0.6rem; opacity:0.5;">(no key)</span>' : ''}
                </button>
            </div>

            <!-- Pixabay tab -->
            <div id="img-tab-pixabay" style="${_imgGenTab !== 'pixabay' ? 'display:none;' : ''}">
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <input type="text" id="pixabay-query" value="${escapeHtml(item.label)}" placeholder="Cerca immagine..." style="flex:1; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;" onkeydown="if(event.key==='Enter')runPixabaySearch(${itemIndex})">
                    <button class="btn btn-primary" onclick="runPixabaySearch(${itemIndex})" style="padding:10px 16px;">
                        <i class="fa-solid fa-search"></i>
                    </button>
                </div>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#aaa; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" id="pixabay-white-bg-search" ${getPixabayWhiteBg() ? 'checked' : ''} onchange="onPixabayWhiteBgToggle(${itemIndex})" style="width:15px; height:15px; accent-color:var(--accent-color);">
                    <i class="fa-solid fa-square" style="color:#fff; text-shadow:0 0 1px #888;"></i> Preferisci sfondo bianco
                </label>
                <div id="pixabay-results-container"></div>
            </div>

            <!-- Openverse tab -->
            <div id="img-tab-openverse" style="${_imgGenTab !== 'openverse' ? 'display:none;' : ''}">
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <input type="text" id="openverse-query" value="${escapeHtml(item.label)}" placeholder="Cerca immagine..." style="flex:1; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;" onkeydown="if(event.key==='Enter')runOpenverseSearch(${itemIndex})">
                    <button class="btn btn-primary" onclick="runOpenverseSearch(${itemIndex})" style="padding:10px 16px;">
                        <i class="fa-solid fa-search"></i>
                    </button>
                </div>
                <p style="font-size:0.7rem; color:#888; margin:0 0 8px;"><i class="fa-solid fa-creative-commons"></i> Immagini Creative Commons da Openverse &mdash; nessuna chiave richiesta. Verifica la licenza per usi pubblici.</p>
                <div id="openverse-results-container"></div>
            </div>

            <!-- ARASAAC tab -->
            <div id="img-tab-arasaac" style="${_imgGenTab !== 'arasaac' ? 'display:none;' : ''}">
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <input type="text" id="arasaac-query" value="${escapeHtml(item.label)}" placeholder="Cerca pittogramma..." style="flex:1; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white;" onkeydown="if(event.key==='Enter')runArasaacSearch(${itemIndex})">
                    <select id="arasaac-lang" onchange="setArasaacLang(this.value); runArasaacSearch(${itemIndex})" style="padding:10px; border-radius:10px; background:#2a2a40; border:1px solid var(--glass-border); color:white; font-size:0.85rem;">
                        ${['it', 'en', 'es', 'fr', 'de'].map(l => `<option value="${l}"${getArasaacLang() === l ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('')}
                    </select>
                    <button class="btn ai-arasaac-btn" onclick="aiArasaacSearch(${itemIndex})" style="padding:10px 14px; background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.4); border-radius:10px; color:#a855f7; cursor:pointer;" title="Ottimizza ricerca con AI">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                    <button class="btn btn-primary" onclick="runArasaacSearch(${itemIndex})" style="padding:10px 16px;">
                        <i class="fa-solid fa-search"></i>
                    </button>
                </div>
                <p style="font-size:0.7rem; color:#888; margin:0 0 8px;"><i class="fa-solid fa-icons"></i> Pittogrammi ARASAAC &mdash; simboli AAC su sfondo bianco, gratuiti (licenza CC BY-NC-SA). Ideali per carte e prompt visivi.</p>
                <div id="arasaac-ai-alternatives" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;"></div>
                <div id="arasaac-results-container"></div>
            </div>

            <!-- Cloudflare tab -->
            <div id="img-tab-cloudflare" style="${_imgGenTab !== 'cloudflare' ? 'display:none;' : ''}">
                <div style="background:rgba(243,128,32,0.1); border:1px solid rgba(243,128,32,0.3); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.75rem; color:#f9a160;">
                    <i class="fa-solid fa-cloud"></i> Cloudflare Workers AI (gratis)
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Modello</label>
                ${_cfModelSelectHtml('cf-model-single')}
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                    <button onclick="cfPreviewTranslation()" title="Traduci il prompt in inglese per correggerlo" style="background:none; border:none; color:var(--accent-color); font-size:0.72rem; cursor:pointer; padding:2px 4px;">
                        <i class="fa-solid fa-language"></i> Traduci/correggi
                    </button>
                </div>
                <textarea id="cloudflare-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:6px;">${escapeHtml(item.label)}</textarea>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#aaa; margin-bottom:10px; cursor:pointer;">
                    <input type="checkbox" id="cf-autotranslate" checked style="width:15px; height:15px; accent-color:var(--accent-color);">
                    Traduci automaticamente in inglese prima di generare
                </label>

                <label style="font-size:0.8rem; color:#aaa;">Stile</label>
                <div id="cloudflare-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
                    ${POLL_STYLES.map(s => `
                        <div class="poll-style-btn" data-style-id="${s.id}" onclick="selectPollStyle(this)"
                             style="border-color:${s.color}40;">
                            <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Gemini (Nano Banana 2 Lite) tab -->
            <div id="img-tab-gemini" style="${_imgGenTab !== 'gemini' ? 'display:none;' : ''}">
                <div style="background:rgba(66,133,244,0.1); border:1px solid rgba(66,133,244,0.3); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.74rem; color:#8ab4f8;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Google <b>Nano Banana 2 Lite</b> &mdash; a pagamento (chiave Gemini con fatturazione attiva): ~0,034$ a immagine (~0,017$ in batch).
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                <textarea id="gemini-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:6px;">${escapeHtml(item.label)}</textarea>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#aaa; margin-bottom:10px; cursor:pointer;">
                    <input type="checkbox" id="gemini-autotranslate" checked style="width:15px; height:15px; accent-color:var(--accent-color);">
                    Traduci automaticamente in inglese prima di generare
                </label>
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

            <!-- NVIDIA tab -->
            <div id="img-tab-nvidia" style="${_imgGenTab !== 'nvidia' ? 'display:none;' : ''}">
                <div style="background:rgba(118,185,0,0.1); border:1px solid rgba(118,185,0,0.35); border-radius:10px; padding:6px 10px; margin-bottom:10px; font-size:0.74rem; color:#a3d55f;">
                    <i class="fa-solid fa-microchip"></i> NVIDIA build.nvidia.com &mdash; gratis (~40 img/min). Modelli FLUX.2, SD3&hellip; selezionabili.
                </div>
                <label style="font-size:0.8rem; color:#aaa;">Modello</label>
                ${typeof _nvImageModelSelectHtml === 'function' ? _nvImageModelSelectHtml('nvidia-model-single') : ''}
                <label style="font-size:0.8rem; color:#aaa;">Prompt</label>
                <textarea id="nvidia-prompt" rows="2" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.95rem; resize:vertical; font-family:inherit; margin-bottom:6px;">${escapeHtml(item.label)}</textarea>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; color:#aaa; margin-bottom:10px; cursor:pointer;">
                    <input type="checkbox" id="nvidia-autotranslate" checked style="width:15px; height:15px; accent-color:var(--accent-color);">
                    Traduci automaticamente in inglese prima di generare
                </label>
                <label style="font-size:0.8rem; color:#aaa;">Stile</label>
                <div id="nvidia-styles" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
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
                <button id="poll-generate-btn" class="btn btn-primary" style="width:100%; padding:12px; ${(_imgGenTab === 'pixabay' || _imgGenTab === 'openverse') ? 'display:none;' : ''}" onclick="runImageGeneration(${itemIndex})">
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

    // Auto-search on open
    if (_imgGenTab === 'pixabay' && hasPixabay) {
        setTimeout(() => runPixabaySearch(itemIndex), 200);
    } else if (_imgGenTab === 'openverse') {
        setTimeout(() => runOpenverseSearch(itemIndex), 200);
    } else if (_imgGenTab === 'arasaac') {
        setTimeout(() => runArasaacSearch(itemIndex), 200);
    }
};

window.switchImgGenTab = (tab, itemIndex) => {
    _imgGenTab = tab;
    ['pixabay', 'arasaac', 'openverse', 'cloudflare', 'gemini', 'nvidia'].forEach(t => {
        const el = document.getElementById('img-tab-' + t);
        if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('.img-src-tab').forEach(btn => {
        const isActive = btn.textContent.toLowerCase().includes(tab);
        btn.style.background = isActive ? 'rgba(99,102,241,0.2)' : 'transparent';
        btn.style.color = isActive ? 'var(--accent-color)' : 'var(--text-secondary)';
    });
    // Auto-search when a search tab is opened and empty
    if (tab === 'openverse' && !document.getElementById('openverse-results-container')?.innerHTML.trim()) {
        runOpenverseSearch(itemIndex);
    }
    if (tab === 'arasaac' && !document.getElementById('arasaac-results-container')?.innerHTML.trim()) {
        runArasaacSearch(itemIndex);
    }
    const genBtn = document.getElementById('poll-generate-btn');
    if (genBtn) {
        genBtn.style.display = (tab === 'pixabay' || tab === 'openverse' || tab === 'arasaac') ? 'none' : '';
    }
};

window.onPixabayWhiteBgToggle = (itemIndex) => {
    const cb = document.getElementById('pixabay-white-bg-search');
    if (cb) setPixabayWhiteBg(cb.checked);
    // Re-run the search with the new preference if a query is present
    if (document.getElementById('pixabay-query')?.value?.trim()) {
        runPixabaySearch(itemIndex);
    }
};

window.runPixabaySearch = async (itemIndex) => {
    const query = document.getElementById('pixabay-query')?.value?.trim();
    if (!query) return;

    const container = document.getElementById('pixabay-results-container');
    if (!container) return;

    const whiteBg = document.getElementById('pixabay-white-bg-search')?.checked;

    container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div><p style="color:#a5b4fc; font-size:0.8rem; margin-top:8px;">Ricerca su Pixabay...</p></div>';

    try {
        const results = await searchPixabay(query, 12, whiteBg);
        if (results.length === 0) {
            const hint = whiteBg ? ' Prova a disattivare "sfondo bianco" o usa termini diversi.' : ' Prova con termini diversi.';
            container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-secondary); font-size:0.85rem;"><i class="fa-solid fa-search"></i> Nessun risultato.${hint}</div>`;
            return;
        }
        container.innerHTML = `<div class="pixabay-results">
            ${results.map((r, i) => `
                <div class="pixabay-result-item" onclick="selectPixabayImage(${itemIndex}, ${i})" data-url="${escapeHtml(r.web)}">
                    <img src="${r.preview}" loading="lazy" alt="${escapeHtml(r.tags)}">
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

window.runOpenverseSearch = async (itemIndex) => {
    const query = document.getElementById('openverse-query')?.value?.trim();
    if (!query) return;

    const container = document.getElementById('openverse-results-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div><p style="color:#a5b4fc; font-size:0.8rem; margin-top:8px;">Ricerca su Openverse...</p></div>';

    try {
        const results = await searchOpenverse(query);
        if (results.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-secondary); font-size:0.85rem;"><i class="fa-solid fa-search"></i> Nessun risultato. Prova con termini diversi (anche in inglese).</div>';
            return;
        }
        container.innerHTML = `<div class="pixabay-results">
            ${results.map((r, i) => `
                <div class="pixabay-result-item" onclick="selectOpenverseImage(${itemIndex}, ${i})" data-url="${r.web}" title="${escapeHtml(r.license ? 'Licenza ' + r.license : '')}">
                    <img src="${r.preview}" loading="lazy" alt="${escapeHtml(r.tags)}">
                </div>
            `).join('')}
        </div>
        <p style="font-size:0.65rem; color:#666; text-align:center; margin-top:6px;"><i class="fa-solid fa-creative-commons"></i> Immagini Creative Commons da Openverse</p>`;
        window._openverseResults = results;
    } catch (err) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--danger-color); font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</div>`;
    }
};

window.selectOpenverseImage = async (itemIndex, resultIndex) => {
    const results = window._openverseResults;
    if (!results || !results[resultIndex]) return;

    document.querySelectorAll('#openverse-results-container .pixabay-result-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#openverse-results-container .pixabay-result-item')[resultIndex]?.classList.add('selected');

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

window.runArasaacSearch = async (itemIndex) => {
    const query = document.getElementById('arasaac-query')?.value?.trim();
    if (!query) return;

    const container = document.getElementById('arasaac-results-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loading-spinner" style="margin:0 auto;"></div><p style="color:#a5b4fc; font-size:0.8rem; margin-top:8px;">Ricerca su ARASAAC...</p></div>';

    try {
        const results = await searchArasaac(query, 16);
        if (results.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-secondary); font-size:0.85rem;"><i class="fa-solid fa-search"></i> Nessun pittogramma trovato. Prova con un sinonimo o cambia lingua.</div>';
            return;
        }
        container.innerHTML = `<div class="pixabay-results">
            ${results.map((r, i) => `
                <div class="pixabay-result-item arasaac-result-item" onclick="selectArasaacImage(${itemIndex}, ${i})" data-url="${r.web}" title="${escapeHtml(r.tags)}">
                    <img src="${r.preview}" loading="lazy" alt="${escapeHtml(r.tags)}" style="object-fit:contain; background:#fff;">
                </div>
            `).join('')}
        </div>
        <p style="font-size:0.65rem; color:#666; text-align:center; margin-top:6px;"><i class="fa-solid fa-icons"></i> Pittogrammi ARASAAC &mdash; CC BY-NC-SA</p>`;
        window._arasaacResults = results;
    } catch (err) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--danger-color); font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</div>`;
    }
};

window.selectArasaacImage = async (itemIndex, resultIndex) => {
    const results = window._arasaacResults;
    if (!results || !results[resultIndex]) return;

    document.querySelectorAll('#arasaac-results-container .pixabay-result-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#arasaac-results-container .pixabay-result-item')[resultIndex]?.classList.add('selected');

    const status = document.getElementById('poll-status');
    const preview = document.getElementById('poll-preview');
    const acceptActions = document.getElementById('poll-accept-actions');
    const actions = document.getElementById('poll-actions');

    status.style.display = 'block';
    document.getElementById('poll-status-text').textContent = 'Download pittogramma...';

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

// Translate the current prompt into English and put it back in the textarea
// so the clinician can correct it before generating. Disables auto-translate.
window.cfPreviewTranslation = async () => {
    const promptEl = document.getElementById('cloudflare-prompt');
    const prompt = promptEl?.value?.trim();
    if (!prompt) { alert('Inserisci un prompt da tradurre.'); return; }
    const btnSpinTarget = document.querySelector('#img-tab-cloudflare .fa-language');
    if (btnSpinTarget) btnSpinTarget.classList.add('fa-spin');
    try {
        const translated = await translateSingleLabel(prompt);
        promptEl.value = translated;
        const cb = document.getElementById('cf-autotranslate');
        if (cb) cb.checked = false; // what you see is now what gets sent
    } catch (e) {
        alert('Traduzione fallita: ' + e.message);
    } finally {
        if (btnSpinTarget) btnSpinTarget.classList.remove('fa-spin');
    }
};

window.runImageGeneration = async (itemIndex) => {
    const tab = _imgGenTab;
    if (tab === 'pixabay') return;

    const isGemini = tab === 'gemini';
    const isNvidia = tab === 'nvidia';
    const promptEl = document.getElementById(isGemini ? 'gemini-prompt' : isNvidia ? 'nvidia-prompt' : 'cloudflare-prompt');
    const prompt = promptEl?.value?.trim();
    if (!prompt) { alert('Inserisci un prompt.'); return; }
    const autoTranslate = document.getElementById(isGemini ? 'gemini-autotranslate' : isNvidia ? 'nvidia-autotranslate' : 'cf-autotranslate')?.checked !== false;

    const genBtn = document.getElementById('poll-generate-btn');
    const status = document.getElementById('poll-status');
    const preview = document.getElementById('poll-preview');
    const actions = document.getElementById('poll-actions');
    const acceptActions = document.getElementById('poll-accept-actions');

    genBtn.style.display = 'none';
    status.style.display = 'block';
    preview.style.display = 'none';
    acceptActions.style.display = 'none';

    document.getElementById('poll-status-text').textContent = autoTranslate ? `Traduzione prompt...` : `Generazione in corso...`;

    try {
        const finalPrompt = autoTranslate ? await translateSingleLabel(prompt) : prompt;
        document.getElementById('poll-status-text').textContent = `Generazione in corso (${isGemini ? 'Nano Banana 2 Lite' : isNvidia ? 'NVIDIA' : 'Cloudflare Flux'})...`;

        const imageUrl = isGemini
            ? await generateGeminiImage(finalPrompt, _pollSelectedStyle)
            : isNvidia
                ? await generateNvidiaImage(finalPrompt, _pollSelectedStyle)
                : await generateCloudflareImage(finalPrompt, _pollSelectedStyle);
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
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;'); // quote-safe: usable inside HTML attributes
}
window.escapeHtml = escapeHtml;

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
        // Write into the variant currently being edited (not always the base)
        const _v = (typeof state._editingVariant === 'number') ? state._editingVariant : 0;
        const _compressed = await compressDataUrl(_pollLastImageUrl, getEditingImageQuality());
        if (_v > 0 && typeof setItemVariantUrl === 'function') setItemVariantUrl(state.editingItems[itemIndex], _v, _compressed);
        else state.editingItems[itemIndex].url = _compressed;
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

    const hasPixabay = !!getPixabayApiKey();
    const hasCloudflare = !!getCloudflareWorkerUrl();
    const hasGeminiKey = typeof getGeminiApiKey === 'function' && !!getGeminiApiKey();
    const hasNvidiaKey = typeof getNvidiaApiKey === 'function' && !!getNvidiaApiKey();

    modal.innerHTML = `
        <div style="width:100%; max-width:500px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-images" style="color:var(--accent-color);"></i> Genera Tutte le Immagini</h3>
                <button class="btn btn-ghost" onclick="closeBulkPollinations()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <label style="font-size:0.8rem; color:#aaa;">Sorgente immagini</label>
            <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
                ${hasCloudflare ? `<button class="btn btn-ghost bulk-engine-btn selected" data-engine="cloudflare" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-cloud"></i> Cloudflare Flux</button>` : ''}
                ${hasGeminiKey ? `<button class="btn btn-ghost bulk-engine-btn ${!hasCloudflare ? 'selected' : ''}" data-engine="gemini" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;" title="Gratis con i crediti di prova Google (~8.800 immagini). Vedi guida in Impostazioni > API."><i class="fa-solid fa-wand-magic-sparkles"></i> Nano Banana</button>` : ''}
                ${hasNvidiaKey ? `<button class="btn btn-ghost bulk-engine-btn ${!hasCloudflare && !hasGeminiKey ? 'selected' : ''}" data-engine="nvidia" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;" title="NVIDIA build.nvidia.com — gratis, ~40 immagini/min. Modello scelto in Impostazioni > API."><i class="fa-solid fa-microchip"></i> NVIDIA</button>` : ''}
                ${hasPixabay ? `<button class="btn btn-ghost bulk-engine-btn ${!hasCloudflare && !hasGeminiKey ? 'selected' : ''}" data-engine="pixabay" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-search"></i> Pixabay</button>` : ''}
                <button class="btn btn-ghost bulk-engine-btn ${!hasCloudflare && !hasPixabay ? 'selected' : ''}" data-engine="arasaac" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-icons"></i> ARASAAC</button>
                <button class="btn btn-ghost bulk-engine-btn" data-engine="openverse" onclick="selectBulkEngine(this)" style="flex:1; padding:6px; font-size:0.8rem;"><i class="fa-solid fa-images"></i> Openverse</button>
            </div>

            <div id="bulk-cf-model-section" style="${hasCloudflare ? '' : 'display:none;'}">
                <label style="font-size:0.8rem; color:#aaa;">Modello Cloudflare</label>
                ${_cfModelSelectHtml('cf-model-bulk')}
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

            <div id="bulk-styles-section" style="${hasCloudflare ? '' : 'display:none;'}">
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
    const engine = el.dataset.engine;
    const isCf = engine === 'cloudflare';
    const usesStyles = isCf || engine === 'gemini' || engine === 'nvidia'; // AI generators use style prompts
    const cfSection = document.getElementById('bulk-cf-model-section');
    if (cfSection) cfSection.style.display = isCf ? '' : 'none';
    const stylesSection = document.getElementById('bulk-styles-section');
    if (stylesSection) stylesSection.style.display = usesStyles ? '' : 'none';
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
    if (_bulkPollGenerating) return; // double-tap guard
    const engine = document.querySelector('.bulk-engine-btn.selected')?.dataset?.engine || (getCloudflareWorkerUrl() ? 'cloudflare' : 'pixabay');

    const selectedStyles = [];
    if (engine === 'cloudflare' || engine === 'gemini' || engine === 'nvidia') {
        document.querySelectorAll('#bulk-poll-styles .poll-style-btn.selected').forEach(btn => {
            selectedStyles.push(btn.dataset.styleId);
        });
        if (selectedStyles.length === 0) {
            alert('Seleziona almeno uno stile.');
            return;
        }
    }

    const target = document.querySelector('.bulk-poll-target.selected')?.dataset.target || 'missing';
    const _tv = (typeof state._editingVariant === 'number') ? state._editingVariant : 0;
    const _hasImg = (it) => (_tv > 0 && typeof getItemVariantUrl === 'function')
        ? !!(it.variantUrls && it.variantUrls[_tv])
        : !!it.url;
    const items = state.editingItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !item.hidden)
        .filter(({ item }) => target === 'all' || !_hasImg(item));

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

    // Batch-translate all labels upfront (one Gemini call).
    // Pixabay and ARASAAC search natively in Italian, so skip translation for them.
    let translations = {};
    if (engine !== 'pixabay' && engine !== 'arasaac') {
        document.getElementById('bulk-poll-progress-text').textContent = 'Traduzione etichette...';
        try {
            const allLabels = items.map(({ item }) => item.label).filter(Boolean);
            translations = await translateLabelsForImageGen(allLabels);
            log.innerHTML += `<div style="color:var(--accent-color);"><i class="fa-solid fa-language"></i> ${Object.keys(translations).length} etichette tradotte</div>`;
        } catch (e) {
            log.innerHTML += `<div style="color:var(--warning-color);"><i class="fa-solid fa-triangle-exclamation"></i> Traduzione fallita, uso etichette originali</div>`;
        }
    }

    for (const { item, idx } of items) {
        if (!_bulkPollGenerating) break;

        const randomStyle = selectedStyles.length > 0 ? selectedStyles[Math.floor(Math.random() * selectedStyles.length)] : null;
        const styleName = randomStyle ? (POLL_STYLES.find(s => s.id === randomStyle)?.label || randomStyle) : engine;
        const translatedLabel = translations[item.label] || item.label;

        document.getElementById('bulk-poll-progress-text').textContent = `${item.label} → ${translatedLabel} (${styleName})...`;
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
            } else if (engine === 'openverse') {
                const results = await searchOpenverse(translatedLabel, 3);
                if (results.length > 0) {
                    imageUrl = await fetchPixabayAsDataUrl(results[0].web);
                } else {
                    throw new Error('Nessun risultato');
                }
            } else if (engine === 'arasaac') {
                const results = await searchArasaac(item.label, 3);
                if (results.length > 0) {
                    imageUrl = await fetchPixabayAsDataUrl(results[0].web);
                } else {
                    throw new Error('Nessun pittogramma');
                }
            } else if (engine === 'gemini') {
                imageUrl = await generateGeminiImage(translatedLabel, randomStyle);
            } else if (engine === 'nvidia') {
                imageUrl = await generateNvidiaImage(translatedLabel, randomStyle);
            } else {
                imageUrl = await generateCloudflareImage(translatedLabel, randomStyle);
            }
            const _bv = (typeof state._editingVariant === 'number') ? state._editingVariant : 0;
            const _bImg = await compressDataUrl(imageUrl, getEditingImageQuality());
            if (_bv > 0 && typeof setItemVariantUrl === 'function') setItemVariantUrl(state.editingItems[idx], _bv, _bImg);
            else state.editingItems[idx].url = _bImg;
            log.innerHTML += `<div style="color:var(--success-color);"><i class="fa-solid fa-check"></i> ${escapeHtml(item.label)} → ${escapeHtml(translatedLabel)} (${styleName})</div>`;
        } catch (err) {
            errors++;
            log.innerHTML += `<div style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${escapeHtml(item.label)}: ${err.message}</div>`;
        }

        completed++;
        log.scrollTop = log.scrollHeight;

        if (_bulkPollGenerating && completed < items.length) {
            const delay = engine === 'nvidia' ? 1800 : (engine === 'cloudflare' || engine === 'gemini') ? 800 : 500;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    document.getElementById('bulk-poll-progress-text').textContent = `Completato: ${completed - errors} ok, ${errors} errori`;
    document.getElementById('bulk-poll-progress-count').textContent = `${completed}/${items.length}`;
    document.getElementById('bulk-poll-progress-bar').style.width = '100%';
    document.getElementById('bulk-poll-done').style.display = 'block';
    _bulkPollGenerating = false;

    renderEditorList();
};

// --- CLOUDFLARE WORKER SETUP INSTRUCTIONS ---
const CLOUDFLARE_WORKER_CODE = `export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    if (env.AUTH_TOKEN) {
      const got = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (got !== env.AUTH_TOKEN) return new Response('Unauthorized', { status: 401, headers: cors });
    }

    try {
      const { prompt, width = 1024, height = 1024, steps, model } = await request.json();
      const chosen = model || '@cf/black-forest-labs/flux-2-klein-4b';

      let result;
      if (chosen.includes('flux-2')) {
        // FLUX.2 family requires multipart/form-data input
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('width', String(width));
        form.append('height', String(height));
        if (steps) form.append('steps', String(steps));
        const formResponse = new Response(form);
        result = await env.AI.run(chosen, {
          multipart: {
            body: formResponse.body,
            contentType: formResponse.headers.get('content-type')
          }
        });
      } else {
        // FLUX.1 Schnell / Leonardo use a plain JSON object input
        const inputs = { prompt, width, height };
        if (steps) inputs.steps = steps;
        result = await env.AI.run(chosen, inputs);
      }

      let image = result && result.image;
      if (!image && result instanceof ReadableStream) {
        const buf = await new Response(result).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        image = btoa(bin);
      }

      return new Response(JSON.stringify({ image }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || 'Unknown AI error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors }
      });
    }
  }
};`;

window.showCloudflareInstructions = () => {
    const existing = document.getElementById('modal-cf-instructions');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-cf-instructions';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:25000; display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';

    modal.innerHTML = `
        <div style="width:100%; max-width:680px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:24px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:white;"><i class="fa-solid fa-cloud" style="color:#f38020;"></i> Setup Cloudflare Worker (gratis, 10 min)</h3>
                <button class="btn btn-ghost" onclick="document.getElementById('modal-cf-instructions').remove()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div style="background:rgba(243,128,32,0.08); border:1px solid rgba(243,128,32,0.25); border-radius:10px; padding:12px; margin-bottom:16px; font-size:0.85rem; color:#ddd;">
                <b style="color:#f9a160;">Perché serve un Worker?</b><br>
                I browser bloccano le chiamate dirette all'API Cloudflare (CORS). Un piccolo Worker (gratis) fa da ponte tra l'app e l'API.
                Cloudflare regala 10.000 "neuroni"/giorno (da ~320 immagini con FLUX.2 Klein 4B fino a ~2000 con FLUX.1 Schnell), senza carta di credito. Scegli il modello in Impostazioni.
            </div>

            <h4 style="margin:0 0 8px; color:var(--accent-color);">Step 1 — Crea account Cloudflare</h4>
            <p style="margin:0 0 10px; font-size:0.85rem; color:#ccc;">Vai su <a href="https://dash.cloudflare.com/sign-up" target="_blank" style="color:var(--accent-color);">dash.cloudflare.com/sign-up</a> e crea un account gratuito (no carta).</p>

            <h4 style="margin:14px 0 8px; color:var(--accent-color);">Step 2 — Crea un Worker</h4>
            <ol style="margin:0; padding-left:20px; font-size:0.85rem; color:#ccc; line-height:1.6;">
                <li>Dal dashboard: <b>Workers &amp; Pages</b> → <b>Create</b> → <b>Start with Hello World</b></li>
                <li>Dai un nome (es. <code style="background:rgba(0,0,0,0.4); padding:1px 5px; border-radius:3px;">stimoli-flux</code>) → <b>Deploy</b></li>
                <li>Clicca <b>Edit code</b> (in alto a destra)</li>
                <li>Cancella tutto il contenuto e incolla il codice qui sotto, poi <b>Save and Deploy</b></li>
            </ol>

            <div style="position:relative; margin-top:10px;">
                <button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent); this.textContent='Copiato!'; setTimeout(()=>this.textContent='Copia',1500);"
                    style="position:absolute; top:6px; right:6px; padding:4px 10px; font-size:0.75rem; background:var(--accent-color); color:white; border:none; border-radius:6px; cursor:pointer;">Copia</button>
                <pre style="background:rgba(0,0,0,0.5); padding:12px; border-radius:8px; font-size:0.75rem; color:#a5d6ff; overflow-x:auto; max-height:240px; margin:0; line-height:1.4;">${escapeHtml(CLOUDFLARE_WORKER_CODE)}</pre>
            </div>

            <h4 style="margin:14px 0 8px; color:var(--accent-color);">Step 3 — Abilita Workers AI</h4>
            <p style="margin:0 0 10px; font-size:0.85rem; color:#ccc;">Nel Worker, vai su <b>Settings</b> → <b>Bindings</b> → <b>Add binding</b> → seleziona <b>AI</b> → variabile <code style="background:rgba(0,0,0,0.4); padding:1px 5px; border-radius:3px;">AI</code> → <b>Deploy</b>.</p>

            <h4 style="margin:14px 0 8px; color:var(--accent-color);">Step 4 — (Consigliato) Token di sicurezza</h4>
            <p style="margin:0 0 10px; font-size:0.85rem; color:#ccc;">
                Senza protezione il tuo Worker è pubblico e chiunque può consumare la tua quota.
                Vai su <b>Settings</b> → <b>Variables and Secrets</b> → <b>Add</b> → tipo <b>Secret</b> → nome <code style="background:rgba(0,0,0,0.4); padding:1px 5px; border-radius:3px;">AUTH_TOKEN</code> → valore: una stringa lunga a tua scelta (es. genera su <a href="https://www.uuidgenerator.net/" target="_blank" style="color:var(--accent-color);">uuidgenerator.net</a>). Salva.
            </p>

            <h4 style="margin:14px 0 8px; color:var(--accent-color);">Step 5 — Configura qui</h4>
            <ul style="margin:0; padding-left:20px; font-size:0.85rem; color:#ccc; line-height:1.6;">
                <li>Copia l'URL del Worker (es. <code style="background:rgba(0,0,0,0.4); padding:1px 5px; border-radius:3px;">https://stimoli-flux.tuoaccount.workers.dev</code>) nel campo <b>URL del Worker</b></li>
                <li>Incolla l'AUTH_TOKEN (se l'hai impostato) nel campo <b>Auth Token</b></li>
                <li><b>Salva</b> le impostazioni</li>
            </ul>

            <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:10px; margin-top:14px; font-size:0.8rem; color:#fcd34d;">
                <i class="fa-solid fa-rotate"></i> <b>Se cambi modello</b> nelle Impostazioni, devi ri-fare il deploy con il codice qui sopra (basta sovrascrivere e cliccare Save and Deploy).
            </div>

            <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:10px; margin-top:8px; font-size:0.8rem; color:#6ee7b7;">
                <i class="fa-solid fa-check-circle"></i> Fatto! Ora puoi generare immagini di alta qualità direttamente dall'editor.
            </div>

            <button class="btn btn-primary" style="width:100%; padding:12px; margin-top:14px;" onclick="document.getElementById('modal-cf-instructions').remove()">Ho capito</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// ============================================================
// AI STUDIO manual prompt helper (free image gen via the web UI)
// ============================================================
function getAiStudioStyles() {
    try { const s = JSON.parse(localStorage.getItem('aistudio_styles') || 'null'); if (Array.isArray(s)) return s; } catch (e) { /* default */ }
    return POLL_STYLES.map(s => s.id); // default: all styles in the random pool
}
function setAiStudioStyles(arr) { localStorage.setItem('aistudio_styles', JSON.stringify(arr || [])); }
window.getAiStudioStyles = getAiStudioStyles;
window.setAiStudioStyles = setAiStudioStyles;

// Settings UI: the style pool checkboxes (called from switchSettingsTab('images'))
window.populateAiStudioStyles = function () {
    const c = document.getElementById('aistudio-styles-pool');
    if (!c) return;
    const sel = getAiStudioStyles();
    c.innerHTML = POLL_STYLES.map(s => `
        <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:#ddd; cursor:pointer; background:rgba(255,255,255,0.04); padding:5px 9px; border-radius:8px;">
            <input type="checkbox" value="${s.id}" ${sel.includes(s.id) ? 'checked' : ''} onchange="_saveAiStudioStyles()" style="accent-color:var(--accent-color);">
            <i class="fa-solid ${s.icon}" style="color:${s.color};"></i> ${s.label}
        </label>`).join('');
};
window._saveAiStudioStyles = function () {
    const ids = [...document.querySelectorAll('#aistudio-styles-pool input:checked')].map(i => i.value);
    setAiStudioStyles(ids);
};

function _composeAiStudioPrompt(translatedLabel, styleId) {
    let style = styleId;
    if (!style || style === 'random') {
        const pool = getAiStudioStyles().filter(id => POLL_STYLES.some(s => s.id === id));
        const ids = pool.length ? pool : POLL_STYLES.map(s => s.id);
        style = ids[Math.floor(Math.random() * ids.length)];
    }
    const s = POLL_STYLES.find(st => st.id === style);
    const parts = [translatedLabel];
    if (s) parts.push(s.prompt);
    parts.push('single subject, centered, isolated on a pure white background, no shadow, 1:1 square aspect ratio');
    return { prompt: parts.join(', '), styleLabel: s ? s.label : style };
}

let _aiStudioTranslated = '';
window._aiStudioRefresh = function () {
    const sel = document.getElementById('aistudio-style');
    const ta = document.getElementById('aistudio-prompt-text');
    if (!sel || !ta) return;
    const { prompt, styleLabel } = _composeAiStudioPrompt(_aiStudioTranslated, sel.value);
    ta.value = prompt;
    const info = document.getElementById('aistudio-style-info');
    if (info) info.textContent = sel.value === 'random' ? `Stile casuale scelto: ${styleLabel}` : '';
};

function _aiStudioStatus(msg, color) { const s = document.getElementById('aistudio-status'); if (s) { s.textContent = msg; s.style.color = color || '#aaa'; } }

window._aiStudioCopy = async () => {
    const ta = document.getElementById('aistudio-prompt-text');
    if (!ta) return;
    try { await navigator.clipboard.writeText(ta.value); }
    catch (e) { ta.select(); try { document.execCommand('copy'); } catch (_) {} }
    _aiStudioStatus('Prompt copiato negli appunti ✓', 'var(--success-color)');
};

window._aiStudioClose = () => {
    const m = document.getElementById('modal-aistudio');
    if (m && m._onPaste) document.removeEventListener('paste', m._onPaste);
    if (m) m.remove();
};

async function _aiStudioApplyFile(file, idx) {
    if (!file) return;
    _aiStudioStatus('Importazione immagine...', '#aaa');
    try {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); });
        const compressed = await compressDataUrl(dataUrl, getEditingImageQuality());
        const _av = (typeof state._editingVariant === 'number') ? state._editingVariant : 0;
        if (_av > 0 && typeof setItemVariantUrl === 'function') setItemVariantUrl(state.editingItems[idx], _av, compressed);
        else state.editingItems[idx].url = compressed;
        if (typeof renderEditorList === 'function') renderEditorList();
        _aiStudioStatus('Immagine importata ✓', 'var(--success-color)');
        setTimeout(() => _aiStudioClose(), 700);
    } catch (e) { _aiStudioStatus('Errore import: ' + e.message, 'var(--danger-color)'); }
}
window._aiStudioFile = (input, idx) => { if (input.files && input.files[0]) _aiStudioApplyFile(input.files[0], idx); };

// Touch-only paste. The async Clipboard API (navigator.clipboard.read) is
// blocked in the Android WebView, but a *trusted* paste event into an editable
// field is allowed (that's why Ctrl+V works). So the paste zone is a
// contenteditable element: the user long-presses it and taps "Incolla", which
// fires a real paste we can read — no keyboard needed.
window._aiStudioPasteBtn = async (idx) => {
    // Best case: the async API is available (e.g. permission granted) — use it.
    if (navigator.clipboard && navigator.clipboard.read) {
        try {
            const clipItems = await navigator.clipboard.read();
            for (const ci of clipItems) {
                const imgType = ci.types.find(t => t.startsWith('image/'));
                if (imgType) { await _aiStudioApplyFile(await ci.getType(imgType), idx); return; }
            }
        } catch (e) { /* blocked in WebView → fall through to the long-press box */ }
    }
    // Touch path: focus the editable box and tell the user to long-press → Incolla.
    const box = document.getElementById('aistudio-paste');
    if (box) { box.focus(); }
    _aiStudioStatus('Tieni premuto il riquadro qui sotto e tocca "Incolla"', '#8ab4f8');
};

// Read an image that the system pasted into the contenteditable box. Handles
// both shapes: a paste event carrying an image File, or an <img> the WebView
// injected into the box (data:/blob: src).
async function _aiStudioReadPasteBox(idx) {
    const box = document.getElementById('aistudio-paste');
    if (!box) return;
    const img = box.querySelector('img');
    const src = img && img.getAttribute('src');
    box.innerHTML = '';
    if (src && /^(data:|blob:)/.test(src)) {
        try {
            const blob = await (await fetch(src)).blob();
            await _aiStudioApplyFile(blob, idx);
            return;
        } catch (e) { /* fall through */ }
    }
    if (!state.editingItems[idx] || !state.editingItems[idx].url) {
        _aiStudioStatus('Non sono riuscito a leggere l\'immagine incollata: usa "Carica file"', 'var(--warning-color)');
    }
}
window._aiStudioReadPasteBox = _aiStudioReadPasteBox;

window.openAiStudioPrompt = async (itemIndex) => {
    const item = state.editingItems[itemIndex];
    if (!item) return;
    _aiStudioClose();
    _aiStudioTranslated = item.label;

    const modal = document.createElement('div');
    modal.id = 'modal-aistudio';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:21000; display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';
    modal.innerHTML = `
        <div style="width:100%; max-width:480px; background:#1e1e2f; border-radius:16px; border:1px solid var(--glass-border); padding:20px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; color:white; font-size:1rem;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#8ab4f8;"></i> Prompt per AI Studio (gratis)</h3>
                <button class="btn btn-ghost" onclick="_aiStudioClose()" style="padding:6px 10px;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div style="font-size:0.8rem; color:#aaa; margin-bottom:8px;">Item: <b style="color:#fff;">${escapeHtml(item.label)}</b></div>
            <label style="font-size:0.8rem; color:#aaa;">Stile</label>
            <select id="aistudio-style" onchange="_aiStudioRefresh()" style="width:100%; padding:8px; border-radius:8px; background:#2a2a40; border:1px solid var(--glass-border); color:white; margin-bottom:4px;">
                <option value="random">Casuale (dal pool nelle Impostazioni)</option>
                ${POLL_STYLES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
            </select>
            <div id="aistudio-style-info" style="font-size:0.7rem; color:#8ab4f8; margin-bottom:8px; min-height:14px;"></div>
            <label style="font-size:0.8rem; color:#aaa;">Prompt (tradotto + 1:1 + sfondo bianco)</label>
            <textarea id="aistudio-prompt-text" rows="4" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:white; font-size:0.85rem; resize:vertical; font-family:inherit; margin-bottom:8px;"></textarea>
            <div style="display:flex; gap:8px; margin-bottom:14px;">
                <button class="btn btn-primary" style="flex:1; padding:10px;" onclick="_aiStudioCopy()"><i class="fa-solid fa-copy"></i> Copia prompt</button>
                <button class="btn btn-ghost" style="flex:1; padding:10px;" onclick="window.open('https://aistudio.google.com/','_blank')"><i class="fa-solid fa-up-right-from-square"></i> Apri AI Studio</button>
            </div>
            <label style="font-size:0.8rem; color:#aaa;">Riporta qui l'immagine generata</label>
            <div id="aistudio-paste" contenteditable="true"
                 style="border:2px dashed var(--glass-border); border-radius:10px; padding:18px 12px; text-align:center; color:#8ab4f8; font-size:0.85rem; min-height:30px; margin:4px 0 4px; outline:none; -webkit-user-select:text; user-select:text;">
                <i class="fa-solid fa-paste"></i> Tieni premuto qui &rarr; <b>Incolla</b>
            </div>
            <div style="font-size:0.7rem; color:#777; text-align:center; margin-bottom:8px;">Senza tastiera: tieni premuto il riquadro e tocca &laquo;Incolla&raquo;. Con tastiera: Ctrl+V.</div>
            <button class="btn btn-ghost" style="width:100%; padding:11px;" onclick="document.getElementById('aistudio-file').click()"><i class="fa-solid fa-folder-open"></i> Oppure carica il file salvato</button>
            <input type="file" id="aistudio-file" accept="image/*" style="display:none;" onchange="_aiStudioFile(this, ${itemIndex})">
            <div id="aistudio-status" style="font-size:0.78rem; text-align:center; min-height:16px; color:#aaa; margin-top:6px;"></div>
        </div>`;
    document.body.appendChild(modal);

    // Clear the placeholder hint as soon as the box is focused/long-pressed.
    const pasteBox = document.getElementById('aistudio-paste');
    pasteBox.addEventListener('focus', () => { if (pasteBox.dataset.cleared !== '1') { pasteBox.innerHTML = ''; pasteBox.dataset.cleared = '1'; } });
    // A trusted paste (Ctrl+V or long-press → Incolla) bubbles up to the
    // document; read the image File directly when it carries one.
    const onPaste = async (e) => {
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for (const it of items) {
            if (it.type && it.type.startsWith('image/')) { e.preventDefault(); await _aiStudioApplyFile(it.getAsFile(), itemIndex); return; }
        }
    };
    modal._onPaste = onPaste;
    document.addEventListener('paste', onPaste);
    // Fallback for WebViews that paste an <img> into the box instead of firing
    // an image-bearing paste event: scan the box whenever its content changes.
    pasteBox.addEventListener('input', () => setTimeout(() => _aiStudioReadPasteBox(itemIndex), 30));

    _aiStudioRefresh();
    document.getElementById('aistudio-style-info').textContent = 'Traduzione etichetta...';
    try { _aiStudioTranslated = await translateSingleLabel(item.label); } catch (e) { /* keep original */ }
    _aiStudioRefresh();
};
