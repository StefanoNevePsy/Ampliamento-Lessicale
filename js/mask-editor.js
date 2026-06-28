// === INTERACTIVE MASK EDITOR ===
// Reusable full-screen overlay to build a pixel mask over an image, using a
// magic-wand (flood select by colour) and a freehand brush. Powers two modes:
//   - 'cutout'    : mask = subject to keep; background becomes transparent (PNG)
//   - 'highlight' : mask = subject to keep in colour; the rest is desaturated
// An optional in-browser AI segmentation engine can seed the mask automatically.
//
// Usage:
//   openMaskEditor({
//     imageUrl, mode: 'cutout'|'highlight', title,
//     initialMaskUrl,         // optional: alpha/grey image to seed the mask
//     onApply(resultUrl)      // resultUrl is a dataURL, or null to "remove effect"
//   });

(function () {
    const MAX_DIM = 1100;                 // working resolution cap
    // In-browser segmentation model (lazy-loaded from CDN, cached by the browser)
    const AI_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';
    const AI_MODEL = 'briaai/RMBG-1.4';
    let _aiModel = null, _aiProcessor = null, _aiLib = null;

    function _colorDist(d, i, r, g, b) {
        const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function _loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Immagine non caricabile'));
            img.src = url;
        });
    }

    window.openMaskEditor = async function (opts) {
        const mode = opts.mode === 'highlight' ? 'highlight' : 'cutout';
        let img;
        try { img = await _loadImage(opts.imageUrl); }
        catch (e) { alert(e.message); return; }

        // Working dimensions
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
            const s = MAX_DIM / Math.max(w, h);
            w = Math.round(w * s); h = Math.round(h * s);
        }

        // Offscreen working canvas with original colour pixels
        const workCanvas = document.createElement('canvas');
        workCanvas.width = w; workCanvas.height = h;
        const ctxWork = workCanvas.getContext('2d', { willReadFrequently: true });
        ctxWork.drawImage(img, 0, 0, w, h);
        let baseData;
        try {
            baseData = ctxWork.getImageData(0, 0, w, h);
        } catch (e) {
            // Tainted canvas (remote image without CORS): can't edit pixels
            alert('Questa immagine è remota e non può essere modificata. Scarica/genera l\'immagine nel set prima di usarla.');
            return;
        }
        const base = baseData.data;

        // Precompute grayscale (for highlight preview/export)
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) {
            const j = i * 4;
            gray[i] = (base[j] * 0.299 + base[j + 1] * 0.587 + base[j + 2] * 0.114) | 0;
        }

        // Mask: 1 = subject/keep, 0 = background. Defaults differ by mode.
        const mask = new Uint8Array(w * h);
        if (mode === 'cutout') mask.fill(1); // start keeping everything, click bg to remove

        // Optionally seed from an existing alpha/grey mask image
        if (opts.initialMaskUrl) {
            try {
                const mImg = await _loadImage(opts.initialMaskUrl);
                const mc = document.createElement('canvas');
                mc.width = w; mc.height = h;
                const mctx = mc.getContext('2d', { willReadFrequently: true });
                mctx.drawImage(mImg, 0, 0, w, h);
                const md = mctx.getImageData(0, 0, w, h).data;
                for (let i = 0; i < w * h; i++) {
                    // Use alpha if present (cutout source), else luminance
                    const a = md[i * 4 + 3];
                    const v = a < 255 ? a : md[i * 4];
                    mask[i] = v > 127 ? 1 : 0;
                }
            } catch (e) { /* ignore seed failure */ }
        }

        // --- Tool state ---
        let tool = 'wand';                                  // 'wand' | 'brush'
        let effect = mode === 'cutout' ? 0 : 1;             // wand/brush sets mask to this
        let tolerance = 32;
        let brushSize = Math.max(10, Math.round(Math.max(w, h) / 35));

        // --- Build overlay UI ---
        const overlay = document.createElement('div');
        overlay.className = 'mask-editor-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:100001; background:rgba(8,8,14,0.94); display:flex; flex-direction:column; gap:8px; padding:10px; box-sizing:border-box;';

        const effectAddLabel = mode === 'cutout' ? 'Ripristina' : 'Aggiungi soggetto';
        const effectRemLabel = mode === 'cutout' ? 'Cancella sfondo' : 'Rimuovi';

        overlay.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; color:#fff; flex-shrink:0;">
                <i class="fa-solid ${mode === 'cutout' ? 'fa-eraser' : 'fa-wand-magic-sparkles'}" style="color:var(--accent-color);"></i>
                <b style="font-size:0.95rem;">${opts.title || (mode === 'cutout' ? 'Scontorno manuale' : 'Evidenzia soggetto')}</b>
                <span style="font-size:0.72rem; color:#aaa; margin-left:auto;">${mode === 'cutout' ? 'Tocca lo sfondo per cancellarlo, poi rifinisci col pennello.' : 'Seleziona il soggetto da lasciare a colori.'}</span>
            </div>

            <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; background:repeating-conic-gradient(#3a3a44 0% 25%, #2a2a32 0% 50%) 50%/24px 24px; border-radius:10px; overflow:hidden;">
                <canvas id="me-canvas" style="max-width:100%; max-height:100%; touch-action:none; cursor:crosshair; image-rendering:auto;"></canvas>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; flex-shrink:0;">
                <div style="display:flex; gap:4px; background:rgba(255,255,255,0.06); border-radius:8px; padding:3px;">
                    <button class="me-tool" data-tool="wand" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;"><i class="fa-solid fa-wand-magic-sparkles"></i> Bacchetta</button>
                    <button class="me-tool" data-tool="brush" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;"><i class="fa-solid fa-paintbrush"></i> Pennello</button>
                </div>
                <div style="display:flex; gap:4px; background:rgba(255,255,255,0.06); border-radius:8px; padding:3px;">
                    <button class="me-effect" data-effect="${mode === 'cutout' ? '0' : '1'}" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;">${effectRemLabel}</button>
                    <button class="me-effect" data-effect="${mode === 'cutout' ? '1' : '0'}" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;">${effectAddLabel}</button>
                </div>
                <label id="me-tol-wrap" style="display:flex; align-items:center; gap:6px; color:#ccc; font-size:0.72rem;">Tolleranza <input id="me-tol" type="range" min="5" max="90" value="${tolerance}" style="width:90px; accent-color:var(--accent-color);"></label>
                <label id="me-brush-wrap" style="display:none; align-items:center; gap:6px; color:#ccc; font-size:0.72rem;">Pennello <input id="me-brush" type="range" min="3" max="${Math.round(Math.max(w, h) / 6)}" value="${brushSize}" style="width:90px; accent-color:var(--accent-color);"></label>
                <button id="me-ai" class="btn btn-ghost" style="padding:7px 11px; font-size:0.78rem; color:#a78bfa; border-color:rgba(167,139,250,0.4);"><i class="fa-solid fa-robot"></i> AI auto</button>
                <button id="me-invert" class="btn btn-ghost" style="padding:7px 11px; font-size:0.78rem;"><i class="fa-solid fa-circle-half-stroke"></i> Inverti</button>
                <button id="me-reset" class="btn btn-ghost" style="padding:7px 11px; font-size:0.78rem;"><i class="fa-solid fa-rotate-left"></i> Reset</button>
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center; flex-shrink:0;">
                <span id="me-status" style="font-size:0.72rem; color:#9a9; margin-right:auto;"></span>
                <button id="me-remove" class="btn btn-ghost" style="padding:8px 14px; color:var(--danger-color);">${mode === 'cutout' ? 'Rimuovi scontorno' : 'Rimuovi effetto'}</button>
                <button id="me-cancel" class="btn btn-ghost" style="padding:8px 14px;">Annulla</button>
                <button id="me-apply" class="btn btn-primary" style="padding:8px 18px;">Applica</button>
            </div>`;

        document.body.appendChild(overlay);

        const canvas = overlay.querySelector('#me-canvas');
        const ctxDisp = canvas.getContext('2d');
        // Display canvas at working resolution (CSS scales it to fit)
        canvas.width = w; canvas.height = h;

        const statusEl = overlay.querySelector('#me-status');
        const setStatus = (t) => { statusEl.textContent = t || ''; };

        // --- Preview compositing ---
        const outImg = ctxWork.createImageData(w, h);
        const out = outImg.data;
        let rafPending = false;
        function render() {
            rafPending = false;
            for (let i = 0; i < w * h; i++) {
                const j = i * 4;
                if (mode === 'cutout') {
                    out[j] = base[j]; out[j + 1] = base[j + 1]; out[j + 2] = base[j + 2];
                    out[j + 3] = mask[i] ? base[j + 3] : 0;
                } else {
                    if (mask[i]) { out[j] = base[j]; out[j + 1] = base[j + 1]; out[j + 2] = base[j + 2]; }
                    else { const g = gray[i]; out[j] = g; out[j + 1] = g; out[j + 2] = g; }
                    out[j + 3] = 255;
                }
            }
            ctxDisp.putImageData(outImg, 0, 0);
        }
        function scheduleRender() {
            if (!rafPending) { rafPending = true; requestAnimationFrame(render); }
        }
        render();

        // --- Coordinate mapping (display CSS px -> working px) ---
        function toWork(ev) {
            const r = canvas.getBoundingClientRect();
            const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
            const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
            return { x: Math.floor(cx / r.width * w), y: Math.floor(cy / r.height * h) };
        }

        // --- Magic wand (flood fill by colour similarity from seed) ---
        function magicWand(sx, sy) {
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
            const seed = (sy * w + sx) * 4;
            const sr = base[seed], sg = base[seed + 1], sb = base[seed + 2];
            const visited = new Uint8Array(w * h);
            const stack = [sy * w + sx];
            visited[sy * w + sx] = 1;
            const tol = tolerance;
            while (stack.length) {
                const idx = stack.pop();
                if (_colorDist(base, idx * 4, sr, sg, sb) > tol) continue;
                mask[idx] = effect;
                const x = idx % w, y = (idx - x) / w;
                if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; stack.push(idx - 1); }
                if (x < w - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; stack.push(idx + 1); }
                if (y > 0 && !visited[idx - w]) { visited[idx - w] = 1; stack.push(idx - w); }
                if (y < h - 1 && !visited[idx + w]) { visited[idx + w] = 1; stack.push(idx + w); }
            }
            scheduleRender();
        }

        // --- Brush (paint circle into mask) ---
        function paintAt(cx, cy) {
            const r = brushSize, r2 = r * r;
            const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r);
            const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const dx = x - cx, dy = y - cy;
                    if (dx * dx + dy * dy <= r2) mask[y * w + x] = effect;
                }
            }
            scheduleRender();
        }

        // --- Pointer handling ---
        let drawing = false, lastPt = null;
        function onDown(ev) {
            ev.preventDefault();
            const p = toWork(ev);
            if (tool === 'wand') { magicWand(p.x, p.y); return; }
            drawing = true; lastPt = p; paintAt(p.x, p.y);
        }
        function onMove(ev) {
            if (!drawing || tool !== 'brush') return;
            ev.preventDefault();
            const p = toWork(ev);
            // interpolate between last point and current for smooth strokes
            if (lastPt) {
                const dist = Math.hypot(p.x - lastPt.x, p.y - lastPt.y);
                const steps = Math.max(1, Math.round(dist / (brushSize / 2)));
                for (let s = 1; s <= steps; s++) {
                    paintAt(Math.round(lastPt.x + (p.x - lastPt.x) * s / steps),
                            Math.round(lastPt.y + (p.y - lastPt.y) * s / steps));
                }
            }
            lastPt = p;
        }
        function onUp() { drawing = false; lastPt = null; }

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        canvas.addEventListener('touchstart', onDown, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onUp);

        // --- Toolbar wiring ---
        function refreshToolButtons() {
            overlay.querySelectorAll('.me-tool').forEach(b => {
                const on = b.dataset.tool === tool;
                b.style.background = on ? 'var(--accent-color)' : 'transparent';
            });
            overlay.querySelectorAll('.me-effect').forEach(b => {
                const on = parseInt(b.dataset.effect) === effect;
                b.style.background = on ? 'var(--accent-color)' : 'transparent';
            });
            overlay.querySelector('#me-tol-wrap').style.display = tool === 'wand' ? 'flex' : 'none';
            overlay.querySelector('#me-brush-wrap').style.display = tool === 'brush' ? 'flex' : 'none';
        }
        overlay.querySelectorAll('.me-tool').forEach(b => b.onclick = () => { tool = b.dataset.tool; refreshToolButtons(); });
        overlay.querySelectorAll('.me-effect').forEach(b => b.onclick = () => { effect = parseInt(b.dataset.effect); refreshToolButtons(); });
        overlay.querySelector('#me-tol').oninput = (e) => { tolerance = parseInt(e.target.value); };
        overlay.querySelector('#me-brush').oninput = (e) => { brushSize = parseInt(e.target.value); };
        overlay.querySelector('#me-invert').onclick = () => { for (let i = 0; i < mask.length; i++) mask[i] = mask[i] ? 0 : 1; scheduleRender(); };
        overlay.querySelector('#me-reset').onclick = () => { mask.fill(mode === 'cutout' ? 1 : 0); scheduleRender(); };
        refreshToolButtons();

        // --- AI auto-segmentation ---
        overlay.querySelector('#me-ai').onclick = async () => {
            const btn = overlay.querySelector('#me-ai');
            btn.disabled = true;
            try {
                const aiMask = await runAiSegmentation(opts.imageUrl, w, h, setStatus);
                if (aiMask) {
                    for (let i = 0; i < w * h; i++) mask[i] = aiMask[i] > 127 ? 1 : 0;
                    scheduleRender();
                    setStatus('Segmentazione AI applicata — rifinisci se serve.');
                } else {
                    setStatus('AI non disponibile. Usa bacchetta e pennello.');
                }
            } catch (e) {
                console.warn('AI segmentation failed:', e);
                setStatus('AI non riuscita: ' + (e.message || e) + '. Usa gli strumenti manuali.');
            } finally {
                btn.disabled = false;
            }
        };

        // --- Export ---
        function exportResult() {
            const ec = document.createElement('canvas');
            ec.width = w; ec.height = h;
            const ectx = ec.getContext('2d');
            if (mode === 'cutout') {
                const o = ectx.createImageData(w, h), od = o.data;
                for (let i = 0; i < w * h; i++) {
                    const j = i * 4;
                    od[j] = base[j]; od[j + 1] = base[j + 1]; od[j + 2] = base[j + 2];
                    od[j + 3] = mask[i] ? base[j + 3] : 0;
                }
                _featherAlpha(od, w, h);
                ectx.putImageData(o, 0, 0);
                return ec.toDataURL('image/png');
            } else {
                const o = ectx.createImageData(w, h), od = o.data;
                for (let i = 0; i < w * h; i++) {
                    const j = i * 4;
                    if (mask[i]) { od[j] = base[j]; od[j + 1] = base[j + 1]; od[j + 2] = base[j + 2]; }
                    else { const g = gray[i]; od[j] = g; od[j + 1] = g; od[j + 2] = g; }
                    od[j + 3] = 255;
                }
                ectx.putImageData(o, 0, 0);
                return ec.toDataURL('image/webp', 0.9);
            }
        }

        const close = () => {
            window.removeEventListener('mouseup', onUp);
            overlay.remove();
        };
        overlay.querySelector('#me-cancel').onclick = close;
        overlay.querySelector('#me-remove').onclick = () => { close(); if (opts.onApply) opts.onApply(null); };
        overlay.querySelector('#me-apply').onclick = () => {
            const result = exportResult();
            close();
            if (opts.onApply) opts.onApply(result);
        };
    };

    // Light 1px feather of the alpha edge to avoid hard jaggies (cutout export)
    function _featherAlpha(data, w, h) {
        const a = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (a[i] === 0) continue;
                // if any 4-neighbour is transparent, soften this edge pixel
                const edge = (x > 0 && a[i - 1] === 0) || (x < w - 1 && a[i + 1] === 0) ||
                             (y > 0 && a[i - w] === 0) || (y < h - 1 && a[i + w] === 0);
                if (edge) data[i * 4 + 3] = Math.round(a[i] * 0.55);
            }
        }
    }

    // Lazy-loaded in-browser segmentation (RMBG-1.4 via transformers.js).
    // Returns a Uint8 grayscale mask (w*h) or null if unavailable.
    async function runAiSegmentation(imageUrl, w, h, setStatus) {
        if (!_aiLib) {
            setStatus && setStatus('Caricamento motore AI (prima volta ~40MB)...');
            _aiLib = await import(/* @vite-ignore */ AI_CDN + '/+esm');
            _aiLib.env.allowLocalModels = false;
        }
        const { AutoModel, AutoProcessor, RawImage } = _aiLib;
        if (!_aiModel) {
            _aiModel = await AutoModel.from_pretrained(AI_MODEL, {
                config: { model_type: 'custom' },
                progress_callback: (p) => {
                    if (p && p.status === 'progress' && p.progress != null) {
                        setStatus && setStatus(`Download modello AI: ${Math.round(p.progress)}%`);
                    }
                }
            });
            _aiProcessor = await AutoProcessor.from_pretrained(AI_MODEL, {
                config: {
                    do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
                    image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1],
                    feature_extractor_type: 'ImageFeatureExtractor',
                    resample: 2, rescale_factor: 0.00392156862745098,
                    size: { width: 1024, height: 1024 }
                }
            });
        }
        setStatus && setStatus('Analisi immagine...');
        const image = await RawImage.fromURL(imageUrl);
        const { pixel_values } = await _aiProcessor(image);
        const { output } = await _aiModel({ input: pixel_values });
        const maskImg = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(w, h);
        return maskImg.data; // grayscale, length w*h
    }
})();
