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

        // Mask: 0..255 soft alpha. 255 = subject/keep (coloured / opaque),
        // 0 = background (grey / transparent). Both modes start fully "kept"
        // (cutout: nothing removed yet; highlight: image fully coloured).
        const mask = new Uint8Array(w * h);
        mask.fill(255);

        // Optionally seed from an existing alpha/grey mask image (keep soft values)
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
                    mask[i] = a < 255 ? a : md[i * 4];
                }
            } catch (e) { /* ignore seed failure */ }
        }

        // --- Tool state ---
        let tool = 'wand';                                  // 'wand' | 'brush' | 'object' | 'pan'
        let effect = mode === 'cutout' ? 0 : 255;           // wand/brush sets mask to this (0 or 255)
        let hardness = 100;                                 // brush hardness 0..100
        let straightLine = false;                           // straight-line (two-click) mode
        let lineAnchor = null;                              // first click of a two-click line
        let lastBrushPt = null;                             // anchor for shift-click lines
        let zoom = 1, panX = 0, panY = 0;                   // view transform
        let samDebug = false;                               // show SAM candidate masks
        const undoStack = [];                               // mask snapshots
        // In highlight, the FIRST "keep" selection desaturates everything else,
        // so picking the subject leaves only it coloured.
        let firstKeep = (mode === 'highlight');
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
                    <button class="me-tool" data-tool="object" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;" title="Clicca su un oggetto per selezionarlo (AI)"><i class="fa-solid fa-hand-pointer"></i> Oggetto AI</button>
                    <button class="me-tool" data-tool="wand" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;"><i class="fa-solid fa-wand-magic-sparkles"></i> Bacchetta</button>
                    <button class="me-tool" data-tool="brush" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;"><i class="fa-solid fa-paintbrush"></i> Pennello</button>
                    <button class="me-tool" data-tool="pan" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;" title="Sposta l'immagine (quando ingrandita)"><i class="fa-solid fa-up-down-left-right"></i></button>
                    <button id="me-samdbg" style="border:none; cursor:pointer; padding:7px 9px; border-radius:6px; font-size:0.78rem; color:#fff;" title="Debug: mostra le 3 maschere SAM colorate"><i class="fa-solid fa-bug"></i></button>
                </div>
                <div style="display:flex; gap:4px; background:rgba(255,255,255,0.06); border-radius:8px; padding:3px;">
                    <button class="me-effect" data-effect="1" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;">${effectAddLabel}</button>
                    <button class="me-effect" data-effect="0" style="border:none; cursor:pointer; padding:7px 11px; border-radius:6px; font-size:0.78rem; color:#fff;">${effectRemLabel}</button>
                </div>
                <label id="me-tol-wrap" style="display:flex; align-items:center; gap:6px; color:#ccc; font-size:0.72rem;">Tolleranza <input id="me-tol" type="range" min="5" max="90" value="${tolerance}" style="width:80px; accent-color:var(--accent-color);"></label>
                <label id="me-brush-wrap" style="display:none; align-items:center; gap:6px; color:#ccc; font-size:0.72rem;">Dim. <input id="me-brush" type="range" min="3" max="${Math.round(Math.max(w, h) / 6)}" value="${brushSize}" style="width:80px; accent-color:var(--accent-color);"></label>
                <label id="me-hard-wrap" style="display:none; align-items:center; gap:6px; color:#ccc; font-size:0.72rem;">Durezza <input id="me-hard" type="range" min="0" max="100" value="100" style="width:70px; accent-color:var(--accent-color);"></label>
                <button id="me-line" class="btn btn-ghost me-toggle" style="display:none; padding:7px 9px; font-size:0.72rem;" title="Linea retta: tocca, poi tocca un altro punto"><i class="fa-solid fa-ruler"></i> Linea</button>
                <button id="me-ai" class="btn btn-ghost" style="padding:7px 11px; font-size:0.78rem; color:#a78bfa; border-color:rgba(167,139,250,0.4);"><i class="fa-solid fa-robot"></i> AI auto</button>
                <button id="me-undo" class="btn btn-ghost" style="padding:7px 9px; font-size:0.78rem;" title="Annulla ultima azione"><i class="fa-solid fa-rotate-left"></i></button>
                <button id="me-invert" class="btn btn-ghost" style="padding:7px 9px; font-size:0.78rem;"><i class="fa-solid fa-circle-half-stroke"></i></button>
                <button id="me-reset" class="btn btn-ghost" style="padding:7px 9px; font-size:0.78rem;">Reset</button>
                <div style="display:flex; gap:2px; align-items:center; background:rgba(255,255,255,0.06); border-radius:8px; padding:3px;">
                    <button id="me-zoom-out" style="border:none; cursor:pointer; padding:6px 9px; border-radius:6px; font-size:0.8rem; color:#fff; background:transparent;"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                    <span id="me-zoom-lbl" style="font-size:0.7rem; color:#ccc; min-width:34px; text-align:center;">100%</span>
                    <button id="me-zoom-in" style="border:none; cursor:pointer; padding:6px 9px; border-radius:6px; font-size:0.8rem; color:#fff; background:transparent;"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                </div>
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

        // --- Brush-size cursor preview (circle following the pointer) ---
        const brushCursor = document.createElement('div');
        brushCursor.style.cssText = 'position:fixed; pointer-events:none; border:2px solid rgba(255,255,255,0.95); box-shadow:0 0 0 1px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(0,0,0,0.7); border-radius:50%; transform:translate(-50%,-50%); display:none; z-index:100002;';
        document.body.appendChild(brushCursor);
        function brushDisplayDiameter() {
            const r = canvas.getBoundingClientRect();
            return brushSize * 2 * (r.width / w);
        }
        function showBrushCursorAt(clientX, clientY) {
            const d = brushDisplayDiameter();
            brushCursor.style.width = d + 'px';
            brushCursor.style.height = d + 'px';
            brushCursor.style.left = clientX + 'px';
            brushCursor.style.top = clientY + 'px';
            brushCursor.style.display = 'block';
        }
        function updateBrushCursor(ev) {
            if (tool !== 'brush') { brushCursor.style.display = 'none'; return; }
            showBrushCursorAt(ev.touches ? ev.touches[0].clientX : ev.clientX,
                              ev.touches ? ev.touches[0].clientY : ev.clientY);
        }
        const hideBrushCursor = () => { brushCursor.style.display = 'none'; };

        // --- Preview compositing ---
        const outImg = ctxWork.createImageData(w, h);
        const out = outImg.data;
        let rafPending = false;
        function render() {
            rafPending = false;
            for (let i = 0; i < w * h; i++) {
                const j = i * 4;
                const m = mask[i];
                if (mode === 'cutout') {
                    out[j] = base[j]; out[j + 1] = base[j + 1]; out[j + 2] = base[j + 2];
                    out[j + 3] = (base[j + 3] * m / 255) | 0;        // soft alpha
                } else {
                    // Smoothly blend colour (subject) with grayscale (background)
                    const g = gray[i];
                    out[j] = (base[j] * m + g * (255 - m)) / 255 | 0;
                    out[j + 1] = (base[j + 1] * m + g * (255 - m)) / 255 | 0;
                    out[j + 2] = (base[j + 2] * m + g * (255 - m)) / 255 | 0;
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

        // In highlight, the first "keep" (effect=255) selection desaturates
        // everything else, so only the chosen subject stays coloured.
        function keepGuard() {
            if (firstKeep && mode === 'highlight' && effect === 255) { mask.fill(0); firstKeep = false; }
        }

        // --- Magic wand (flood fill by colour similarity from seed) ---
        function magicWand(sx, sy) {
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
            keepGuard();
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

        // --- Brush (paint circle into mask, with hardness falloff) ---
        function paintAt(cx, cy) {
            keepGuard();
            const r = brushSize, r2 = r * r;
            const innerR = r * (hardness / 100);            // full-strength radius
            const falloff = Math.max(1, r - innerR);
            const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r);
            const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const dx = x - cx, dy = y - cy;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > r2) continue;
                    const idx = y * w + x;
                    if (hardness >= 100) { mask[idx] = effect; continue; }
                    const d = Math.sqrt(d2);
                    const a = d <= innerR ? 1 : 1 - (d - innerR) / falloff; // strength 0..1
                    if (a <= 0) continue;
                    mask[idx] = Math.round(mask[idx] * (1 - a) + effect * a);
                }
            }
            scheduleRender();
        }

        // --- Pointer handling ---
        let drawing = false, lastPt = null, samBusy = false;
        // Panoptic click-to-select: segment the whole image once, then a click
        // just picks the smallest detected region containing it.
        async function samClick(p) {
            if (samBusy) return;
            if (!window.AIEngine || !window.AIEngine.panopticSegment) { setStatus('Segmentazione AI non disponibile.'); return; }
            samBusy = true;
            try {
                const segs = await window.AIEngine.panopticSegment(opts.imageUrl, w, h, setStatus);
                const idx = Math.min(w * h - 1, Math.max(0, p.y * w + p.x));
                const hits = segs.filter(s => s.data[idx] > 127).sort((a, b) => a.area - b.area);
                if (!hits.length) { setStatus('Nessun oggetto qui. Tocca 🐞 per vedere quelli rilevati.'); return; }
                const seg = hits[0];
                keepGuard();
                for (let i = 0; i < w * h; i++) if (seg.data[i] > 127) mask[i] = effect;
                scheduleRender();
                setStatus(`Selezionato: ${seg.label} (${Math.round(100 * seg.area / (w * h))}% area). Clicca altri oggetti o rifinisci.`);
            } catch (e) {
                console.warn('panoptic click failed:', e);
                setStatus('Segmentazione non riuscita: ' + (e.message || e));
            } finally {
                samBusy = false;
            }
        }
        // Undo / view-transform helpers
        function pushUndo() { undoStack.push(mask.slice()); if (undoStack.length > 25) undoStack.shift(); }
        function undo() {
            if (!undoStack.length) { setStatus('Niente da annullare.'); return; }
            mask.set(undoStack.pop()); scheduleRender();
        }
        function applyTransform() {
            canvas.style.transformOrigin = 'center center';
            canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
            const lbl = overlay.querySelector('#me-zoom-lbl');
            if (lbl) lbl.textContent = Math.round(zoom * 100) + '%';
        }
        function setZoom(z) { zoom = Math.max(1, Math.min(8, z)); if (zoom === 1) { panX = 0; panY = 0; } applyTransform(); }
        function strokeLine(a, b) {
            const dd = Math.hypot(b.x - a.x, b.y - a.y);
            const steps = Math.max(1, Math.round(dd / Math.max(1, brushSize / 2)));
            for (let s = 1; s <= steps; s++) {
                paintAt(Math.round(a.x + (b.x - a.x) * s / steps), Math.round(a.y + (b.y - a.y) * s / steps));
            }
        }
        function _cxy(ev) { return ev.touches ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY } : { x: ev.clientX, y: ev.clientY }; }
        function _pinchDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

        let panning = false, panStart = null, pinchDist = 0, pinchZoom = 1;

        function _hue(k) { // distinct colour per object
            const h6 = ((k * 53) % 360) / 60, x = 1 - Math.abs(h6 % 2 - 1);
            const [r, g, b] = h6 < 1 ? [1, x, 0] : h6 < 2 ? [x, 1, 0] : h6 < 3 ? [0, 1, x] : h6 < 4 ? [0, x, 1] : h6 < 5 ? [x, 0, 1] : [1, 0, x];
            return [r * 255, g * 255, b * 255];
        }
        // Debug: overlay ALL detected objects, each in a distinct colour.
        async function samDebugOverlay() {
            if (!window.AIEngine || !window.AIEngine.panopticSegment) { setStatus('Debug non disponibile.'); return; }
            if (samBusy) return; samBusy = true;
            try {
                const segs = await window.AIEngine.panopticSegment(opts.imageUrl, w, h, setStatus);
                const o = ctxWork.createImageData(w, h); const od = o.data;
                for (let i = 0; i < w * h; i++) { const j = i * 4; od[j] = base[j]; od[j + 1] = base[j + 1]; od[j + 2] = base[j + 2]; od[j + 3] = 255; }
                segs.forEach((s, k) => { const c = _hue(k); for (let i = 0; i < w * h; i++) if (s.data[i] > 127) { const j = i * 4; od[j] = (od[j] + c[0] * 2) / 3; od[j + 1] = (od[j + 1] + c[1] * 2) / 3; od[j + 2] = (od[j + 2] + c[2] * 2) / 3; } });
                ctxWork.putImageData(o, 0, 0);
                ctxDisp.clearRect(0, 0, w, h); ctxDisp.drawImage(workCanvas, 0, 0);
                setStatus(`${segs.length} oggetti: ${segs.map(s => s.label).slice(0, 10).join(', ')}. Tocca 🐞 per uscire.`);
            } catch (e) { setStatus('Debug fallito: ' + (e.message || e)); }
            finally { samBusy = false; }
        }
        function onDown(ev) {
            if (ev.touches && ev.touches.length >= 2) { // pinch zoom
                ev.preventDefault(); pinchDist = _pinchDist(ev.touches); pinchZoom = zoom; drawing = false; hideBrushCursor(); return;
            }
            ev.preventDefault();
            if (tool === 'pan') { panning = true; const c = _cxy(ev); panStart = { x: c.x - panX, y: c.y - panY }; return; }
            const p = toWork(ev);
            if (tool === 'object') { if (samDebug) { samDebugOverlay(); } else { pushUndo(); samClick(p); } return; }
            if (tool === 'wand') { pushUndo(); magicWand(p.x, p.y); return; }
            // brush
            if (straightLine) {
                // Two independent clicks define a straight segment (allows
                // non-contiguous selections). First click = start, second = end.
                if (lineAnchor) {
                    pushUndo(); strokeLine(lineAnchor, p); lineAnchor = null;
                    setStatus('Segmento tracciato. Tocca due nuovi punti per un altro.');
                } else {
                    pushUndo(); paintAt(p.x, p.y); lineAnchor = p;
                    setStatus('Punto iniziale segnato — tocca il punto finale.');
                }
                lastBrushPt = p;
                return; // no free-drawing in line mode
            }
            pushUndo();
            drawing = true;
            if (ev.shiftKey && lastBrushPt) strokeLine(lastBrushPt, p); // Photoshop-style
            else paintAt(p.x, p.y);
            lastPt = p; lastBrushPt = p;
        }
        function onMove(ev) {
            if (ev.touches && ev.touches.length >= 2 && pinchDist) { ev.preventDefault(); setZoom(pinchZoom * (_pinchDist(ev.touches) / pinchDist)); return; }
            if (panning) { ev.preventDefault(); const c = _cxy(ev); panX = c.x - panStart.x; panY = c.y - panStart.y; applyTransform(); return; }
            if (!drawing || tool !== 'brush' || straightLine) return;
            ev.preventDefault();
            const p = toWork(ev);
            if (lastPt) strokeLine(lastPt, p);
            lastPt = p; lastBrushPt = p;
        }
        function onUp() { drawing = false; lastPt = null; panning = false; pinchDist = 0; }

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        canvas.addEventListener('touchstart', onDown, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onUp);

        // Brush-size cursor preview follows the pointer over the canvas
        canvas.addEventListener('mousemove', updateBrushCursor);
        canvas.addEventListener('mouseenter', updateBrushCursor);
        canvas.addEventListener('mouseleave', hideBrushCursor);
        canvas.addEventListener('touchmove', updateBrushCursor, { passive: false });
        canvas.addEventListener('touchstart', updateBrushCursor, { passive: false });

        // --- Toolbar wiring ---
        function refreshToolButtons() {
            overlay.querySelectorAll('.me-tool').forEach(b => {
                const on = b.dataset.tool === tool;
                b.style.background = on ? 'var(--accent-color)' : 'transparent';
            });
            overlay.querySelectorAll('.me-effect').forEach(b => {
                const on = (parseInt(b.dataset.effect) ? 255 : 0) === effect;
                b.style.background = on ? 'var(--accent-color)' : 'transparent';
            });
            const isBrush = tool === 'brush';
            overlay.querySelector('#me-tol-wrap').style.display = tool === 'wand' ? 'flex' : 'none';
            overlay.querySelector('#me-brush-wrap').style.display = isBrush ? 'flex' : 'none';
            overlay.querySelector('#me-hard-wrap').style.display = isBrush ? 'flex' : 'none';
            overlay.querySelector('#me-line').style.display = isBrush ? 'inline-flex' : 'none';
            canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
        }
        overlay.querySelectorAll('.me-tool').forEach(b => b.onclick = () => { tool = b.dataset.tool; if (tool !== 'brush') hideBrushCursor(); if (tool === 'object') setStatus('Clicca su un oggetto per selezionarlo (la prima volta carica il modello).'); refreshToolButtons(); });
        overlay.querySelectorAll('.me-effect').forEach(b => b.onclick = () => { effect = parseInt(b.dataset.effect) ? 255 : 0; refreshToolButtons(); });
        overlay.querySelector('#me-tol').oninput = (e) => { tolerance = parseInt(e.target.value); };
        overlay.querySelector('#me-brush').oninput = (e) => {
            brushSize = parseInt(e.target.value);
            // Show a centered preview circle while adjusting so the size is visible
            const r = canvas.getBoundingClientRect();
            showBrushCursorAt(r.left + r.width / 2, r.top + r.height / 2);
        };
        overlay.querySelector('#me-hard').oninput = (e) => { hardness = parseInt(e.target.value); };
        overlay.querySelector('#me-line').onclick = () => {
            straightLine = !straightLine;
            const b = overlay.querySelector('#me-line');
            b.style.background = straightLine ? 'var(--accent-color)' : '';
            lineAnchor = null;
            setStatus(straightLine ? 'Linea: tocca due punti per collegarli dritti (segmenti indipendenti).' : '');
        };
        overlay.querySelector('#me-samdbg').onclick = () => {
            samDebug = !samDebug;
            overlay.querySelector('#me-samdbg').style.background = samDebug ? 'var(--accent-color)' : 'transparent';
            if (samDebug) { tool = 'object'; refreshToolButtons(); samDebugOverlay(); }
            else { setStatus(''); scheduleRender(); }
        };
        overlay.querySelector('#me-undo').onclick = () => undo();
        overlay.querySelector('#me-zoom-in').onclick = () => setZoom(zoom * 1.3);
        overlay.querySelector('#me-zoom-out').onclick = () => setZoom(zoom / 1.3);
        overlay.querySelector('#me-invert').onclick = () => { pushUndo(); for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i]; firstKeep = false; scheduleRender(); };
        overlay.querySelector('#me-reset').onclick = () => { pushUndo(); mask.fill(255); firstKeep = (mode === 'highlight'); lastBrushPt = null; scheduleRender(); };
        refreshToolButtons();

        // --- AI auto-segmentation (delegated to the shared GPU-accelerated engine) ---
        overlay.querySelector('#me-ai').onclick = async () => {
            const btn = overlay.querySelector('#me-ai');
            if (!window.AIEngine) { setStatus('Motore AI non disponibile.'); return; }
            btn.disabled = true;
            try {
                const aiMask = await window.AIEngine.segmentSubject(opts.imageUrl, w, h, setStatus);
                if (aiMask) {
                    pushUndo();
                    for (let i = 0; i < w * h; i++) mask[i] = aiMask[i]; // keep soft alpha for smooth edges
                    firstKeep = false; // AI already produced subject-vs-rest
                    scheduleRender();
                    setStatus('Segmentazione AI applicata — rifinisci con bacchetta/pennello se serve.');
                } else {
                    setStatus('AI non disponibile. Usa bacchetta e pennello.');
                }
            } catch (e) {
                console.warn('AI segmentation failed:', e);
                setStatus('AI non riuscita: ' + (e.message || e) + '. Usa gli strumenti manuali o controlla Impostazioni › Immagini.');
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
                    const j = i * 4, m = mask[i];
                    od[j] = base[j]; od[j + 1] = base[j + 1]; od[j + 2] = base[j + 2];
                    od[j + 3] = (base[j + 3] * m / 255) | 0;          // soft alpha
                }
                ectx.putImageData(o, 0, 0);
                return ec.toDataURL('image/png');
            } else {
                const o = ectx.createImageData(w, h), od = o.data;
                for (let i = 0; i < w * h; i++) {
                    const j = i * 4, m = mask[i], g = gray[i];
                    od[j] = (base[j] * m + g * (255 - m)) / 255 | 0;
                    od[j + 1] = (base[j + 1] * m + g * (255 - m)) / 255 | 0;
                    od[j + 2] = (base[j + 2] * m + g * (255 - m)) / 255 | 0;
                    od[j + 3] = 255;
                }
                ectx.putImageData(o, 0, 0);
                return ec.toDataURL('image/webp', 0.9);
            }
        }

        const close = () => {
            window.removeEventListener('mouseup', onUp);
            brushCursor.remove();
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

    // Headless AI cutout: run segmentation on an image URL and return a
    // transparent PNG dataURL (soft alpha). Used by bulk scontorno. Processes a
    // single image; the caller loops sequentially so memory stays bounded and
    // the AIEngine model is loaded once and reused.
    window.aiCutoutDataUrl = async function (imageUrl, onStatus) {
        if (!window.AIEngine) throw new Error('Motore AI non disponibile');
        const img = await _loadImage(imageUrl);
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
            const s = MAX_DIM / Math.max(w, h);
            w = Math.round(w * s); h = Math.round(h * s);
        }
        const mask = await window.AIEngine.segmentSubject(imageUrl, w, h, onStatus);
        if (!mask) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, w, h);
        const im = cx.getImageData(0, 0, w, h);
        const d = im.data;
        for (let i = 0; i < w * h; i++) {
            d[i * 4 + 3] = (d[i * 4 + 3] * mask[i] / 255) | 0; // soft alpha
        }
        cx.putImageData(im, 0, 0);
        const url = c.toDataURL('image/png');
        c.width = c.height = 0; // hint the GC to release the backing store
        return url;
    };

})();
