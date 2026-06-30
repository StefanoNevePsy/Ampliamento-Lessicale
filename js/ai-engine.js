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
            engine: 'auto',        // 'auto' (native if present, else web) | 'native' | 'web'
            samModelId: '',        // segmentation (highlight) model — separate from RMBG scontorno
            device: 'auto',        // web engine only: 'auto' | 'gpu' | 'npu' | 'cpu'
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
        // Force a reload of the models next time settings change
        _seg = null; _segLoading = null;
        _sam = null; _samImg = null;
        return c;
    }

    function capabilities() {
        const hasNative = !!(typeof window !== 'undefined' && window.Capacitor
            && window.Capacitor.Plugins && window.Capacitor.Plugins.NpuCutout);
        return {
            webgpu: typeof navigator !== 'undefined' && !!navigator.gpu,
            webnn: typeof navigator !== 'undefined' && !!(navigator.ml),
            native: hasNative,
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

    // Map a model id to the native asset filename bundled in the APK
    function _assetNameFor(id) {
        if (/2\.?0/.test(id)) return 'rmbg-2.0.onnx';
        if (/1\.?4/.test(id)) return 'rmbg-1.4.onnx';
        return 'model.onnx';
    }

    function nativePlugin() {
        const P = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins)
            ? window.Capacitor.Plugins.NpuCutout : null;
        return P || null;
    }
    function nativeAvailable() {
        const cfg = getConfig();
        if (cfg.engine === 'web') return false;          // user forced the web engine
        // 'auto' and 'native' both use the plugin when it's actually present
        return !!nativePlugin();
    }

    // Per-model accelerator memory: assetName -> 'nnapi' | 'cpu' (learned at runtime)
    const _nativeAccel = {};

    // Whether, in AUTO mode, the native (NNAPI) path is worth it for this model.
    // The native path only wins when NNAPI actually accelerates; if it falls back
    // to CPU it is slower than WebGPU, so we route those models to the web engine.
    function autoPreferNative(assetName, modelId) {
        if (_nativeAccel[assetName] === 'cpu') return false;   // proven CPU-bound -> web is faster
        if (_nativeAccel[assetName] === 'nnapi') return true;  // proven accelerated -> native
        // Unknown: RMBG-1.4 (opset 11) can't use NNAPI's NHWC kernels, so it would
        // only run on native CPU -> prefer WebGPU. Heavier models (2.0) try native.
        if (/1\.?4/.test(modelId)) return false;
        return true;
    }

    // The engine that will actually be used for the current model ('native'|'web')
    function effectiveEngine() {
        const cfg = getConfig();
        if (cfg.engine === 'native') return 'native';
        if (cfg.engine === 'web') return 'web';
        // AUTO: prefer the GPU. WebGPU runs the WHOLE model on the GPU (ORT-Web for
        // RMBG-2.0, transformers.js for 1.4) — faster than NNAPI, which offloads
        // only some ops and runs the rest on CPU. Native is only used in auto when
        // WebGPU isn't available.
        if (!capabilities().webgpu && nativePlugin()) return 'native';
        return 'web';
    }

    // A human label for the engine/backend that will run the current model
    function effectiveEngineLabel() {
        if (effectiveEngine() === 'native') return 'Nativo NPU (NNAPI)';
        return _wantsOrtWeb() ? 'GPU (ORT-Web WebGPU)' : 'GPU (WebGPU)';
    }

    // Native NPU/GPU segmentation via the Capacitor plugin (ONNX Runtime + NNAPI).
    // Returns a Uint8 mask (w*h) or null if the native path isn't usable.
    async function nativeSegment(imageUrl, w, h, onStatus) {
        const P = nativePlugin();
        if (!P) return null;
        const cfg = getConfig();
        const m = candidateList()[0]; // honour configured/default model
        const id = cfg.modelId || m.id;
        const assetName = _assetNameFor(id);
        onStatus && onStatus('Scontorno nativo su NPU/GPU...');
        let res;
        try {
            res = await P.removeBackground({
                image: imageUrl, assetName,
                width: w, height: h, size: m.size,
                mean: m.mean, std: m.std, sigmoid: m.sigmoid
            });
        } catch (e) {
            console.warn('native NPU segmentation failed, falling back:', e);
            return null;
        }
        if (!res || !res.mask) return null;
        if (res.accelerator) _nativeAccel[assetName] = res.accelerator; // learn for routing
        // Decode the returned grayscale PNG mask into a Uint8 array
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('mask decode failed'));
            im.src = res.mask;
        });
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = d[i * 4]; // red channel = grayscale
        onStatus && onStatus('Scontorno nativo completato (' + (res.accelerator || 'npu') + ').');
        return mask;
    }

    // ===== ORT-Web WebGPU engine: runs the raw .onnx ENTIRELY on the GPU =====
    // Unlike NNAPI (which offloads only supported ops and runs the rest on CPU),
    // the WebGPU EP implements every op on the GPU, so a heavy model like
    // RMBG-2.0 runs fully GPU-accelerated. Used for big models transformers.js
    // can't load; falls back to transformers.js on any failure.
    const ORT_WEB_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.mjs';
    const ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
    let _ort = null;
    const _ortSessions = {};

    function _loadImg(url) {
        return new Promise((resolve, reject) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('Immagine non caricabile'));
            im.src = url;
        });
    }

    // IEEE-754 float32 <-> float16 (half) conversions for fp16 ONNX models whose
    // input/output tensors are float16 (ORT-Web represents them as Uint16Array).
    const _f32buf = new Float32Array(1), _u32buf = new Uint32Array(_f32buf.buffer);
    function _f32tof16(val) {
        _f32buf[0] = val; const i = _u32buf[0];
        const sign = (i >> 16) & 0x8000;
        let exp = ((i >> 23) & 0xff) - 127 + 15;
        const mant = i & 0x7fffff;
        if (exp <= 0) return sign;            // underflow -> signed zero
        if (exp >= 31) return sign | 0x7c00;  // overflow -> inf
        return sign | (exp << 10) | (mant >> 13);
    }
    function _f16tof32(h) {
        const sign = (h & 0x8000) << 16;
        let exp = (h >> 10) & 0x1f;
        let mant = h & 0x3ff;
        let f;
        if (exp === 0) {
            if (mant === 0) { f = sign; }
            else { exp = 1; while ((mant & 0x400) === 0) { mant <<= 1; exp--; } mant &= 0x3ff; f = sign | ((exp - 15 + 127) << 23) | (mant << 13); }
        } else if (exp === 31) { f = sign | 0x7f800000 | (mant << 13); }
        else { f = sign | ((exp - 15 + 127) << 23) | (mant << 13); }
        _u32buf[0] = f; return _f32buf[0];
    }

    async function _loadOrt(onStatus) {
        if (_ort) return _ort;
        onStatus && onStatus('Caricamento runtime WebGPU (ORT)...');
        _ort = await import(/* @vite-ignore */ ORT_WEB_CDN);
        try { _ort.env.wasm.wasmPaths = ORT_WASM_BASE; } catch (e) { /* ignore */ }
        return _ort;
    }

    // Candidate model URLs for ORT-Web: local web folder first, then Hugging Face
    // (fp16 variant — good on WebGPU, with fp32 I/O so our float input works).
    function _ortModelUrls(meta) {
        const base = (getConfig().localModelPath || './models/').replace(/\/$/, '');
        const asset = _assetNameFor(meta.id);                 // e.g. rmbg-2.0.onnx
        // Try many local names/layouts first (404s fail instantly), then remote.
        const localNames = [asset, 'model_fp16.onnx', 'model.onnx', 'model_quantized.onnx'];
        const urls = [];
        localNames.forEach(n => urls.push({ url: `${base}/${n}`, local: true }));
        urls.push({ url: `${base}/${meta.id}/onnx/model_fp16.onnx`, local: true });
        urls.push({ url: `${base}/${meta.id}/onnx/model.onnx`, local: true });
        urls.push({ url: `https://huggingface.co/${meta.id}/resolve/main/onnx/model_fp16.onnx`, local: false });
        urls.push({ url: `https://huggingface.co/${meta.id}/resolve/main/onnx/model.onnx`, local: false });
        return urls;
    }

    async function _ortGetSession(meta, onStatus) {
        if (_ortSessions[meta.id]) return _ortSessions[meta.id];
        const ort = await _loadOrt(onStatus);
        const tried = [];
        for (const { url, local } of _ortModelUrls(meta)) {
            const short = url.replace(/^https?:\/\/huggingface\.co\//, 'HF:').replace(/\?.*$/, '');
            try {
                onStatus && onStatus(`${local ? 'Cerco in locale' : 'Scarico'}: ${short}...`);
                const sess = await ort.InferenceSession.create(url, {
                    executionProviders: ['webgpu', 'wasm'],
                    graphOptimizationLevel: 'all'
                });
                _ortSessions[meta.id] = sess;
                onStatus && onStatus(`Modello caricato: ${short}`);
                return sess;
            } catch (e) {
                tried.push(short);
                console.warn('ORT-Web model load failed:', url, e);
            }
        }
        throw new Error('Modello non trovato. Tentati (in ordine): ' + tried.join('  •  ')
            + '  — metti il file .onnx (fp16) in ' + (getConfig().localModelPath || './models/')
            + ' rinominato ' + _assetNameFor(meta.id) + ' e fai cap:sync.');
    }

    async function ortWebSegment(imageUrl, w, h, onStatus) {
        const meta = candidateList()[0];
        const size = meta.size || 1024;
        const sess = await _ortGetSession(meta, onStatus);
        const ort = await _loadOrt(onStatus);

        // Preprocess -> NCHW float32, normalized
        const img = await _loadImg(imageUrl);
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, size, size);
        const px = cx.getImageData(0, 0, size, size).data;
        const plane = size * size;
        const data = new Float32Array(3 * plane);
        for (let i = 0; i < plane; i++) {
            const j = i * 4;
            data[i] = (px[j] / 255 - meta.mean[0]) / meta.std[0];
            data[plane + i] = (px[j + 1] / 255 - meta.mean[1]) / meta.std[1];
            data[2 * plane + i] = (px[j + 2] / 255 - meta.mean[2]) / meta.std[2];
        }

        onStatus && onStatus('Analisi immagine sulla GPU (WebGPU)...');
        const dims = [1, 3, size, size];
        const inName = sess.inputNames[0];
        let out;
        try {
            const feeds = {}; feeds[inName] = new ort.Tensor('float32', data, dims);
            out = await sess.run(feeds);
        } catch (e) {
            // Some fp16 ONNX expect a float16 input tensor — retry in fp16.
            const half = new Uint16Array(data.length);
            for (let i = 0; i < data.length; i++) half[i] = _f32tof16(data[i]);
            const feeds = {}; feeds[inName] = new ort.Tensor('float16', half, dims);
            out = await sess.run(feeds);
        }
        const t = out[sess.outputNames[0]];
        let od = t.data;
        if (od instanceof Uint16Array) {            // float16 output -> float32
            const f = new Float32Array(od.length);
            for (let i = 0; i < od.length; i++) f[i] = _f16tof32(od[i]);
            od = f;
        } else if (!(od instanceof Float32Array)) {
            throw new Error('Output ORT non gestito (' + t.type + ')');
        }

        // Auto-detect sigmoid (logits vs probabilities)
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < plane; i++) { const v = od[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const sig = (mx > 1.0001 || mn < -0.0001);

        // Build mask at model size, then resize to requested w*h
        const mc = document.createElement('canvas'); mc.width = size; mc.height = size;
        const mctx = mc.getContext('2d', { willReadFrequently: true });
        const mim = mctx.createImageData(size, size); const md = mim.data;
        for (let i = 0; i < plane; i++) {
            let v = od[i];
            if (sig) v = 1 / (1 + Math.exp(-v));
            let a = Math.round(v * 255); if (a < 0) a = 0; if (a > 255) a = 255;
            md[i * 4] = md[i * 4 + 1] = md[i * 4 + 2] = a; md[i * 4 + 3] = 255;
        }
        mctx.putImageData(mim, 0, 0);
        const fc = document.createElement('canvas'); fc.width = w; fc.height = h;
        const fctx = fc.getContext('2d', { willReadFrequently: true });
        fctx.drawImage(mc, 0, 0, w, h);
        const fd = fctx.getImageData(0, 0, w, h).data;
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = fd[i * 4];
        onStatus && onStatus('Scontorno GPU completato.');
        return mask;
    }

    function _wantsOrtWeb() {
        const cfg = getConfig();
        const id = cfg.modelId || candidateList()[0].id;
        // Big BiRefNet model that transformers.js can't reliably load -> use ORT-Web.
        return capabilities().webgpu && /2\.?0|birefnet/i.test(id);
    }

    // ===== SAM-family click-to-segment (for the highlight/evidenzia editor) =====
    // Separate from the RMBG scontorno model: a promptable model (SlimSAM /
    // MobileSAM via transformers.js) that segments the object under a click.
    // The image is encoded once (cached) and each click runs the light decoder.
    const SAM_DEFAULT = 'Xenova/slimsam-77-uniform';
    let _sam = null;            // { model, processor, id, device }
    let _samImg = null;         // { url, image }

    async function _loadSam(onStatus) {
        if (_sam) return _sam;
        const T = await loadTransformers(onStatus);
        const { SamModel, AutoProcessor } = T;
        if (!SamModel) throw new Error('SAM non supportato da questa versione di transformers.js');
        const id = getConfig().samModelId || SAM_DEFAULT;
        const device = capabilities().webgpu ? 'webgpu' : 'wasm';
        const dtype = device === 'webgpu' ? 'fp16' : 'q8';
        onStatus && onStatus(`Caricamento modello segmentazione (${id})...`);
        const model = await SamModel.from_pretrained(id, { device, dtype, progress_callback: _progress(onStatus) });
        const processor = await AutoProcessor.from_pretrained(id);
        _sam = { model, processor, id, device };
        onStatus && onStatus(`Modello segmentazione pronto (${id} su ${device}).`);
        return _sam;
    }

    // Segment the object under a point. `pt` is {nx, ny} normalized (0..1).
    // Returns a Uint8 mask (length w*h), 255 = object. Uses the simple full
    // forward (encode+decode) each call — robust; the encoder dominates time.
    async function samPredict(imageUrl, pt, w, h, onStatus) {
        const { model, processor } = await _loadSam(onStatus);
        if (!_samImg || _samImg.url !== imageUrl) {
            const { RawImage } = await loadTransformers(onStatus);
            _samImg = { url: imageUrl, image: await RawImage.fromURL(imageUrl) };
        }
        const image = _samImg.image;
        const px = Math.round(pt.nx * image.width), py = Math.round(pt.ny * image.height);

        onStatus && onStatus('Segmentazione oggetto (qualche secondo)...');
        const inputs = await processor(image, { input_points: [[[[px, py]]]], input_labels: [[[1]]] });
        const outputs = await model(inputs);
        const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);

        const m0 = masks[0];
        const dims = m0.dims;
        // Spatial size = last two dims. The candidate masks are stored
        // INTERLEAVED per pixel (data[i*nMasks + k]) — reading them as separate
        // planes (data[k*H*W + i]) yields a garbage region (the earlier bug).
        const H = dims[dims.length - 2], W = dims[dims.length - 1];
        const md = m0.data;
        const nMasks = Math.max(1, Math.round(md.length / (H * W)));
        const scores = (outputs.iou_scores && outputs.iou_scores.data) || [1];
        let best = 0; for (let i = 1; i < nMasks; i++) if ((scores[i] || 0) > (scores[best] || 0)) best = i;

        // Rasterize the chosen mask, count pixels (diagnostics), resize to w*h
        const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
        const mctx = mc.getContext('2d', { willReadFrequently: true });
        const im = mctx.createImageData(W, H); const idata = im.data;
        let setCount = 0;
        for (let i = 0; i < H * W; i++) {
            const on = md[i * nMasks + best] ? 255 : 0;
            if (on) setCount++;
            idata[i * 4] = idata[i * 4 + 1] = idata[i * 4 + 2] = on; idata[i * 4 + 3] = 255;
        }
        mctx.putImageData(im, 0, 0);
        const fc = document.createElement('canvas'); fc.width = w; fc.height = h;
        const fctx = fc.getContext('2d', { willReadFrequently: true });
        fctx.drawImage(mc, 0, 0, w, h);
        const fd = fctx.getImageData(0, 0, w, h).data;
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = fd[i * 4];

        const pct = Math.round(100 * setCount / (H * W));
        const sc = (scores[best] != null) ? Number(scores[best]).toFixed(2) : '?';
        if (setCount === 0) {
            onStatus && onStatus(`Nessun oggetto trovato qui (punteggio ${sc}). Prova a cliccare più al centro dell'oggetto.`);
        } else {
            onStatus && onStatus(`Oggetto selezionato (${pct}% area, punteggio ${sc}). Clicca altre parti o rifinisci col pennello.`);
        }
        return mask;
    }

    async function preloadSam(onStatus) {
        _sam = null; _samImg = null;
        const s = await _loadSam(onStatus);
        return { model: s.id, device: s.device };
    }

    // Segment the subject. Returns a Uint8 grayscale mask (length w*h), 255=subject.
    async function segmentSubject(imageUrl, w, h, onStatus) {
        // Per-model routing: native only when it's actually the better path
        if (effectiveEngine() === 'native') {
            const nm = await nativeSegment(imageUrl, w, h, onStatus);
            if (nm) return nm;
            onStatus && onStatus('Motore nativo non riuscito, uso il motore web...');
        } else if (getConfig().engine === 'native') {
            onStatus && onStatus('Plugin nativo NPU assente (build/app non nativa): uso il motore web.');
        }
        // Web path: prefer ORT-Web WebGPU (whole model on GPU) for big models
        if (_wantsOrtWeb()) {
            try {
                const om = await ortWebSegment(imageUrl, w, h, onStatus);
                if (om) return om;
            } catch (e) {
                console.warn('ORT-Web WebGPU failed, falling back to transformers.js:', e);
                onStatus && onStatus('ORT-Web non riuscito, uso transformers.js...');
            }
        }
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

    // Pre-load the web model (transformers.js)
    async function preload(onStatus) {
        await getSegmenter(onStatus);
        return _seg;
    }

    // Pre-load whichever WEB backend will run the current model (ORT-Web or transformers.js)
    async function preloadWeb(onStatus) {
        if (_wantsOrtWeb()) {
            const meta = candidateList()[0];
            await _ortGetSession(meta, onStatus);
            return { backend: 'ort-webgpu', model: meta.id };
        }
        const seg = await getSegmenter(onStatus);
        return { backend: 'transformers', model: seg.meta.id, device: seg.device, dtype: seg.dtype };
    }

    // Verify the native plugin + bundled model asset, reporting the accelerator
    async function preloadNative(onStatus) {
        const P = nativePlugin();
        if (!P) throw new Error('Plugin nativo non presente (build/app non nativa).');
        const cfg = getConfig();
        const m = candidateList()[0];
        const id = cfg.modelId || m.id;
        const assetName = _assetNameFor(id);
        onStatus && onStatus('Verifica modello nativo: ' + assetName + '...');
        const res = await P.prepare({ assetName });
        return { native: true, model: id, asset: assetName, accelerator: (res && res.accelerator) || 'cpu' };
    }

    function status() {
        return _seg ? { loaded: true, model: _seg.meta.id, device: _seg.device, dtype: _seg.dtype }
                    : { loaded: false };
    }

    function unload() { _seg = null; _segLoading = null; }

    return {
        getConfig, setConfig, capabilities, deviceChain, nativeAvailable,
        effectiveEngine, effectiveEngineLabel,
        loadTransformers, getSegmenter, segmentSubject, preload, preloadNative, preloadWeb, status, unload,
        samPredict, preloadSam,
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
    set('ai-engine-engine', cfg.engine);
    set('ai-sam-model', cfg.samModelId);
    set('ai-engine-device', cfg.device);
    set('ai-engine-model', cfg.modelId);
    set('ai-engine-localpath', cfg.localModelPath);
    chk('ai-engine-localfirst', cfg.useLocalFirst);
    if (typeof getUseScontornoEverywhere === 'function') chk('scontorno-everywhere', getUseScontornoEverywhere());
    const capsEl = document.getElementById('ai-engine-caps');
    if (capsEl) {
        const st = AIEngine.status();
        const activeEngine = AIEngine.effectiveEngineLabel();
        const nativeBadge = `Motore attivo: <b style="color:var(--success-color)">${activeEngine}</b> · ` +
            `Plugin nativo: <b style="color:${caps.native ? 'var(--success-color)' : 'var(--text-secondary)'}">${caps.native ? 'presente' : 'assente'}</b> · `;
        capsEl.innerHTML = `${nativeBadge}WebGPU (GPU): <b style="color:${caps.webgpu ? 'var(--success-color)' : 'var(--danger-color)'}">${caps.webgpu ? 'disponibile' : 'non disponibile'}</b> · WebNN (NPU): <b style="color:${caps.webnn ? 'var(--success-color)' : 'var(--text-secondary)'}">${caps.webnn ? 'sperimentale' : 'non disponibile'}</b>${st.loaded ? ` · <span style="color:var(--success-color);">Caricato: ${st.model} su ${st.device.toUpperCase()}</span>` : ''}`;
    }
};

window.saveAiEngineSettings = function () {
    if (!window.AIEngine) return;
    AIEngine.setConfig({
        engine: (document.getElementById('ai-engine-engine') || {}).value || 'auto',
        samModelId: ((document.getElementById('ai-sam-model') || {}).value || '').trim(),
        device: (document.getElementById('ai-engine-device') || {}).value || 'auto',
        modelId: ((document.getElementById('ai-engine-model') || {}).value || '').trim(),
        localModelPath: ((document.getElementById('ai-engine-localpath') || {}).value || '').trim(),
        useLocalFirst: !!(document.getElementById('ai-engine-localfirst') || {}).checked,
    });
    if (window.populateAiEngineSettings) populateAiEngineSettings(); // refresh the active-engine readout
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
        // Test whichever engine will actually be used for the current model
        if (AIEngine.effectiveEngine() === 'native') {
            const r = await AIEngine.preloadNative(upd);
            const accel = r.accelerator === 'nnapi'
                ? '<b style="color:var(--success-color)">NPU/GPU (NNAPI)</b>'
                : '<b style="color:var(--warning-color)">CPU (NNAPI non ha accelerato)</b>';
            if (s) s.innerHTML = `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> Nativo pronto: ${r.asset} — ${accel}</span>`;
        } else {
            const r = await AIEngine.preloadWeb(upd);
            const label = r.backend === 'ort-webgpu'
                ? `<b style="color:var(--success-color)">GPU (ORT-Web WebGPU)</b> — ${r.model}`
                : `${r.model} su ${(r.device || '').toUpperCase()} (${r.dtype || ''})`;
            if (s) s.innerHTML = `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> Web pronto: ${label}</span>`;
        }
        if (window.populateAiEngineSettings) populateAiEngineSettings();
    } catch (e) {
        const hint = AIEngine.effectiveEngine() === 'native'
            ? 'Verifica che il file del modello sia in native-models\\ (rinominato rmbg-2.0.onnx / rmbg-1.4.onnx) e di aver eseguito "Setup plugin NPU" + rebuild.'
            : 'Prova il download manuale del modello (pulsante qui sopra).';
        if (s) s.innerHTML = `<span style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> ${e.message || e}</span><br><span style="font-size:0.75rem;">${hint}</span>`;
    }
};

window.testSamEngine = async function () {
    if (!window.AIEngine) return;
    saveAiEngineSettings();
    const s = document.getElementById('ai-engine-status');
    const upd = (t) => { if (s) s.textContent = t; };
    try {
        upd('Caricamento modello segmentazione (prima volta: download)...');
        const r = await AIEngine.preloadSam(upd);
        if (s) s.innerHTML = `<span style="color:var(--success-color);"><i class="fa-solid fa-check"></i> Segmentazione pronta: ${r.model} su ${r.device.toUpperCase()}.</span>`;
    } catch (e) {
        if (s) s.innerHTML = `<span style="color:var(--danger-color);"><i class="fa-solid fa-xmark"></i> Segmentazione: ${e.message || e}</span>`;
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
