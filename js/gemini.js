// === GEMINI AI INTEGRATION ===
// Generates therapy stimulus sets directly from natural language descriptions

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

function getGeminiModel() {
    return localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
}

function saveGeminiModel(model) {
    localStorage.setItem('gemini_model', model);
}

function getGeminiApiUrl() {
    return `${GEMINI_API_BASE}${getGeminiModel()}:generateContent`;
}

// --- API KEY MANAGEMENT ---
function getGeminiApiKey() {
    return localStorage.getItem('gemini_api_key') || '';
}

function saveGeminiApiKey(key) {
    localStorage.setItem('gemini_api_key', key.trim());
}

window.openSettings = () => {
    const modal = document.getElementById('modal-settings');
    document.getElementById('api-key').value = getGeminiApiKey();
    document.getElementById('gemini-model').value = getGeminiModel();
    modal.style.display = 'flex';
};

window.closeSettings = () => {
    document.getElementById('modal-settings').style.display = 'none';
};

window.saveKey = () => {
    const key = document.getElementById('api-key').value.trim();
    saveGeminiApiKey(key);
    const model = document.getElementById('gemini-model').value;
    saveGeminiModel(model);
    closeSettings();
};

// --- GEMINI API CALL ---
async function callGemini(prompt, apiKey) {
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

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error('Limite di richieste raggiunto. Riprova tra qualche minuto.');
        if (response.status === 400) throw new Error('Chiave API non valida. Controlla nelle Impostazioni.');
        throw new Error(err.error?.message || `Errore API (${response.status})`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Risposta vuota dall\'AI');
    return JSON.parse(text);
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
