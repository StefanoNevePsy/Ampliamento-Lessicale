// === SHARED IN-BROWSER AI ENGINE ===
// Centralizes transformers.js loading, hardware acceleration (WebGPU / optional
// WebNN-NPU, with CPU/WASM fallback) and subject segmentation (RMBG-2.0).
// Any future in-browser model should go through here so it shares the same
// GPU-accelerated runtime and the same remote->local loading fallback.
//
// Honest note on hardware: browsers expose the GPU via WebGPU. The NPU is only
// reachable through WebNN, which is experimental and not yet available in
// stable Chrome on Android — so by default we accelerate on the GPU (WebGPU)
// and fall back to CPU (WASM). 'npu' preference tries WebNN first if present.

window.AIEngine = (function () {
    const DEFAULT_LIB_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4/+esm';
    const CFG_KEY = 'ai_engine_config';

    // Segmentation model candidates, tried in order. RMBG-2.0 (BiRefNet) first,
    // RMBG-1.4 as a always-works fallback. needsSigmoid + mean/std differ.
    const SEG_MODELS = [
        { id: 'briaai/RMBG-2.0',          sigmoid: true,  custom: false, size: 1024, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
        { id: 'onnx-community/RMBG-2.0',  sigmoid: true,  custom: false, size: 1024, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
        { id: 'briaai/RMBG-1.4',          sigmoid: false, custom: true,  size: 1024, mean: [0.5, 0.5, 0.5],        std: [1, 1, 1] }
    ];

    let _lib = null;       // loaded transformers.js module
    let _seg = null;       // { model, processor, meta, device, dtype }
    let _segLoading = null;

    // --- Config (localStorage) ---
    function getConfig() {
        let c = {};
        try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { c = {}; }
        return Object.assign({
            device: 'auto',        // 'auto' | 'gpu' | 'npu' | 'cpu'
            dtype: '',             // '' = auto per device, or 'fp16'|'q8'|'q4'|'fp32'
            modelId: '',           // '' = use SEG_MODELS candidates
            localModelPath: '',    // e.g. './models/' (used if remote fails)
            useLocalFirst: false,  // try local folder before the network
            libUrl: '',            // override transformers.js URL (e.g. local copy)
        }, c);
    }
    function setConfig(patch) {
        const c = Object.assign(getConfig(), patch || {});
        localStorage.setItem(CFG_KEY, JSON.stringify(c));
        // Force a reload of the model next time settings change
        _seg = null; _segLoading = null;
        return c;
    }

    function capabilities() {
        return {
            webgpu: typeof navigator !== 'undefined' && !!navigator.gpu,
            webnn: typeof navigator !== 'undefined' && !!(navigator.ml),
        };
    }

    // --- Device / dtype selection ---
    function deviceChain() {
        const cfg = getConfig();
        const caps = capabilities();
        switch (cfg.device) {
            case 'cpu': return ['wasm'];
            case 'gpu': return caps.webgpu ? ['webgpu', 'wasm'] : ['wasm'];
            case 'npu': return [
                ...(caps.webnn ? ['webnn-npu', 'webnn-gpu'] : []),
                ...(caps.webgpu ? ['webgpu'] : []),
                'wasm'
            ];
            default: return caps.webgpu ? ['webgpu', 'wasm'] : ['wasm']; // auto
        }
    }
    function dtypeChain(device) {
        const cfg = getConfig();
        if (cfg.dtype) return [cfg.dtype];
        if (device.startsWith('webgpu')) return ['fp16', 'q8', 'fp32'];
        if (device.startsWith('webnn')) return ['fp16', 'q8'];
        return ['q8', 'fp32']; // wasm
    }

    function _progress(onStatus) {
        return (p) => {
            if (p && p.status === 'progress' && p.progress != null) {
                onStatus && onStatus(`Download ${p.file || 'modello'}: ${Math.round(p.progress)}%`);
            } else if (p && p.status === 'ready') {
                onStatus && onStatus('Modello caricato.');
            }
        };
    }

    // --- transformers.js loader (CDN -> local copy fallback) ---
    async function loadTransformers(onStatus) {
        if (_lib) return _lib;
        const cfg = getConfig();
        const urls = [];
        if (cfg.libUrl) urls.push(cfg.libUrl);
        urls.push(DEFAULT_LIB_CDN);
        // common local fallbacks if the user dropped a copy next to the app
        if (cfg.localModelPath) {
            const base = cfg.localModelPath.replace(/\/$/, '');
            urls.push(base + '/transformers.min.js');
        }
        let lastErr;
        for (const u of urls) {
            try {
                onStatus && onStatus('Caricamento libreria AI...');
                _lib = await import(/* @vite-ignore */ u);
                return _lib;
            } catch (e) { lastErr = e; console.warn('transformers.js load failed from', u, e); }
        }
        throw new Error('Libreria AI non caricabile (CDN e copia locale falliti). ' + (lastErr && lastErr.message || ''));
    }

    function candidateList() {
        const cfg = getConfig();
        if (cfg.modelId) {
            // Honour a user-specified model; guess post-processing from the name.
            const is2 = /2\.?0|birefnet/i.test(cfg.modelId);
            return [{ id: cfg.modelId, sigmoid: is2, custom: !is2, size: 1024,
                      mean: is2 ? [0.485, 0.456, 0.406] : [0.5, 0.5, 0.5],
                      std: is2 ? [0.229, 0.224, 0.225] : [1, 1, 1] }, ...SEG_MODELS];
        }
        return SEG_MODELS;
    }

    async function _loadProcessor(AutoProcessor, m) {
        try {
            // Prefer the repo's own preprocessor_config.json when present
            return await AutoProcessor.from_pretrained(m.id);
        } catch (e) {
            // Build an explicit config (e.g. RMBG-1.4 ships without one)
            return await AutoProcessor.from_pretrained(m.id, {
                config: {
                    do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
                    image_mean: m.mean, image_std: m.std, resample: 2,
                    rescale_factor: 0.00392156862745098,
                    size: { width: m.size, height: m.size },
                    feature_extractor_type: 'ImageFeatureExtractor'
                }
            });
        }
    }

    async function _buildSegmenter(onStatus) {
        const lib = await loadTransformers(onStatus);
        const { AutoModel, AutoProcessor, env } = lib;
        const cfg = getConfig();
        const devices = deviceChain();
        const models = candidateList();

        // Source order: network then local folder (or reversed if useLocalFirst)
        const sources = [{ local: false }];
        if (cfg.localModelPath) sources.push({ local: true, path: cfg.localModelPath });
        if (cfg.useLocalFirst && cfg.localModelPath) sources.reverse();

        let lastErr;
        for (const src of sources) {
            if (src.local) {
                env.allowLocalModels = true; env.localModelPath = src.path; env.allowRemoteModels = false;
            } else {
                env.allowRemoteModels = true; env.allowLocalModels = false;
            }
            for (const m of models) {
                for (const device of devices) {
                    for (const dtype of dtypeChain(device)) {
                        try {
                            onStatus && onStatus(`Caricamento ${m.id} — ${device}/${dtype}${src.local ? ' • locale' : ''}...`);
                            const modelOpts = { device, dtype, progress_callback: _progress(onStatus) };
                            // RMBG-1.4 (IS-Net) needs the 'custom' model type; BiRefNet (RMBG-2.0) auto-detects.
                            if (m.custom) modelOpts.config = { model_type: 'custom' };
                            const model = await AutoModel.from_pretrained(m.id, modelOpts);
                            const processor = await _loadProcessor(AutoProcessor, m);
                            _seg = { model, processor, meta: m, device, dtype };
                            onStatus && onStatus(`Pronto: ${m.id} su ${device.toUpperCase()} (${dtype})`);
                            return _seg;
                        } catch (e) {
                            lastErr = e;
                            console.warn(`seg load failed: ${m.id} ${device}/${dtype} local=${src.local}`, e);
                        }
                    }
                }
            }
        }
        throw new Error('Nessun modello caricabile. ' + (lastErr && lastErr.message || ''));
    }

    function getSegmenter(onStatus) {
        if (_seg) return Promise.resolve(_seg);
        if (!_segLoading) {
            _segLoading = _buildSegmenter(onStatus).catch(err => { _segLoading = null; throw err; });
        }
        return _segLoading;
    }

    // Extract the primary output tensor regardless of its key name
    function _primaryTensor(out) {
        if (!out) return null;
        return out.output || out.logits || out.alphas || out.masks || Object.values(out)[0];
    }

    // Segment the subject. Returns a Uint8 grayscale mask (length w*h), 255=subject.
    async function segmentSubject(imageUrl, w, h, onStatus) {
        const seg = await getSegmenter(onStatus);
        const { RawImage } = await loadTransformers(onStatus);
        onStatus && onStatus('Analisi immagine sulla ' + (seg.device.startsWith('web') ? 'GPU' : 'CPU') + '...');
        const image = await RawImage.fromURL(imageUrl);
        const inputs = await seg.processor(image);
        const out = await seg.model({ input: inputs.pixel_values });
        let tensor = _primaryTensor(out);
        if (!tensor) throw new Error('Output del modello non riconosciuto.');
        let t = tensor[0];                                   // drop batch dim -> [C,H,W]
        if (seg.meta.sigmoid && typeof t.sigmoid === 'function') t = t.sigmoid();
        const maskImg = await RawImage.fromTensor(t.mul(255).to('uint8')).resize(w, h);
        return maskImg.data;                                  // grayscale, length w*h
    }

    // Pre-load the model (used by the settings "test" button)
    async function preload(onStatus) {
        await getSegmenter(onStatus);
        return _seg;
    }

    function status() {
        return _seg ? { loaded: true, model: _seg.meta.id, device: _seg.device, dtype: _seg.dtype }
                    : { loaded: false };
    }

    function unload() { _seg = null; _segLoading = null; }

    return {
        getConfig, setConfig, capabilities, deviceChain,
        loadTransformers, getSegmenter, segmentSubject, preload, status, unload,
        SEG_MODELS
    };
})();

// --- Settings UI glue (called from the Impostazioni › Immagini tab) ---
window.populateAiEngineSettings = function () {
    if (!window.AIEngine) return;
    const cfg = AIEngine.getConfig();
    const caps = AIEngine.capabilities();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('ai-engine-device', cfg.device);
    set('ai-engine-model', cfg.modelId);
    set('ai-engine-localpath', cfg.localModelPath);
    chk('ai-engine-localfirst', cfg.useLocalFirst);
    const capsEl = document.getElementById('ai-engine-caps');
    if (capsEl) {
        const st = AIEngine.status();
        capsEl.innerHTML = `WebGPU (GPU): <b style="color:${caps.webgpu ? 'var(--success-color)' : 'var(--danger-color)'}">${caps.webgpu ? 'disponibile' : 'non disponibile'}</b> · WebNN (NPU): <b style="color:${caps.webnn ? 'var(--success-color)' : 'var(--text-secondary)'}">${caps.webnn ? 'sperimentale' : 'non disponibile'}</b>${st.loaded ? ` · <span style="color:var(--success-color);">Caricato: ${st.model} su ${st.device.toUpperCase()}</span>` : ''}`;
    }
};

window.saveAiEngineSettings = function () {
    if (!window.AIEngine) return;
    AIEngine.setConfig({
        device: (document.getElementById('ai-engine-device') || {}).value || 'auto',
        modelId: ((document.getElementById('ai-engine-model') || {}).value || '').trim(),
        localModelPath: ((document.getElementById('ai-engine-localpath') || {}).value || '').trim(),
        useLocalFirst: !!(document.getElementById('ai-engine-localfirst') || {}).checked,
    });
    const s = document.getElementById('ai-engine-status');
    if (s) s.innerHTML = '<span style="color:var(--success-color);">Impostazioni salvate. Premi "Carica/Test" per verificare.</span>';
};

window.testAiEngine = async function () {
    if (!window.AIEngine) return;
    saveAiEngineSettings();
    const s = document.getElementById('ai-engine-status');
    const upd = (t) => { if (s) s.textContent = t; };
    AIEngine.unload();
    try {
        upd('Avvio motore AI...');
        const seg = await AIEngine.preload(upd);
        if (s) s.innerHTML = `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> Pronto: ${seg.meta.id} su ${seg.device.toUpperCase()} (${seg.dtype}).</span>`;
        if (window.populateAiEngineSettings) populateAiEngineSettings();
    } catch (e) {
        if (s) s.innerHTML = `<span style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${e.message || e}</span><br><span style="font-size:0.75rem;">Prova il download manuale del modello (pulsante qui sopra).</span>`;
    }
};

window.showAiModelInstructions = function () {
    const cfg = window.AIEngine ? AIEngine.getConfig() : { localModelPath: './models/' };
    const path = cfg.localModelPath || './models/';
    const msg =
`SCONTORNO AI — download manuale del modello

Se il download automatico (online) fallisce, puoi scaricare il modello una volta e metterlo in una cartella dell'app.

1) Scarica i file del modello da Hugging Face:
   https://huggingface.co/briaai/RMBG-2.0/tree/main
   Servono:
     • config.json
     • preprocessor_config.json
     • onnx/model_fp16.onnx   (per GPU/WebGPU)
       oppure onnx/model_quantized.onnx (per CPU)

2) Crea questa struttura di cartelle accanto all'app:
   ${path}briaai/RMBG-2.0/config.json
   ${path}briaai/RMBG-2.0/preprocessor_config.json
   ${path}briaai/RMBG-2.0/onnx/model_fp16.onnx
   ${path}briaai/RMBG-2.0/onnx/model_quantized.onnx

3) In Impostazioni › Immagini imposta "Cartella modello locale" su:
   ${path}
   (opzionale: spunta "Usa prima la cartella locale" per lavorare offline)

4) Premi "Carica/Test modello".

Nota: RMBG-2.0 ha licenza non commerciale (uso clinico/personale ok).
In alternativa puoi usare 'onnx-community/RMBG-2.0' o il più leggero
'briaai/RMBG-1.4' nel campo Modello.

Vedi anche il file models/README.md incluso nell'app.`;
    if (typeof themedAlert === 'function') themedAlert(msg.replace(/\n/g, '<br>'));
    else alert(msg);
};
