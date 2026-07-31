// === SET EDITOR ===

window.editSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    state.editingSetId = id;
    state.editingItems = JSON.parse(JSON.stringify(set.items));
    state._editingVariantNames = set.variantNames ? [...set.variantNames] : [];
    state._editingVariant = 0; // Always start editing the base variant
    state._editingCoverImage = set.coverImage || null;
    state._coverPasteActive = false;
    document.getElementById('edit-set-name').value = set.name;

    // Mode checkboxes
    document.getElementById('edit-modes-container').innerHTML = Object.keys(MODES_CONFIG).map(k => {
        const isChecked = set.modes ? set.modes.includes(k) : true;
        return `<div class="mode-check ${isChecked ? 'selected' : ''}" data-mode="${k}" onclick="toggleEditMode(this)">
            <i class="fa-solid ${isChecked ? 'fa-check-square' : 'fa-square'}"></i> ${MODES_CONFIG[k]}
        </div>`;
    }).join('');

    // Category editor
    populateEditorCategory(set.category || 'Personale');

    // Tag editor
    renderTagEditor(set.tags || []);

    // Image quality - load from set or pick smart default based on modes
    state._editingImageQuality = set.imageQuality || guessDefaultImageQuality(set.modes || []);
    renderImageQualitySelector();

    renderVariantEditor();
    renderEditorCover();
    renderEditorList();
    document.getElementById('modal-library').classList.remove('open');
    document.getElementById('modal-editor').classList.add('open');
};

window.toggleEditMode = (el) => {
    el.classList.toggle('selected');
    const i = el.querySelector('i');
    i.className = el.classList.contains('selected') ? 'fa-solid fa-check-square' : 'fa-solid fa-square';
};

// --- TAG EDITOR ---
let editingTags = [];

function renderTagEditor(tags) {
    editingTags = [...(tags || [])].map(t => t.toLowerCase().trim());
    const container = document.getElementById('edit-tags-container');
    if (!container) return;

    const tagImgs = getAllTagImages();
    const chipsHtml = editingTags.map((tag, i) =>
        `<span class="tag-chip" style="display:inline-flex; align-items:center; gap:4px;">
            ${tagImgs[tag.toLowerCase().trim()] ? `<img src="${tagImgs[tag.toLowerCase().trim()]}" style="width:18px; height:18px; object-fit:cover; border-radius:3px;">` : ''}
            ${tag}
            <span onclick="uploadTagImage('${tag}')" title="Immagine tag" style="cursor:pointer; opacity:0.6; font-size:0.8em;"><i class="fa-solid fa-camera"></i></span>
            <span class="remove-tag" onclick="removeEditTag(${i})"><i class="fa-solid fa-xmark"></i></span>
        </span>`
    ).join('');

    const suggestionsHtml = state.allTags
        .filter(t => !editingTags.includes(t))
        .slice(0, 10)
        .map(t => `<span class="tag-suggestion" onclick="addEditTag('${t}')">${t}</span>`)
        .join('');

    container.innerHTML = `
        <div class="tag-input-wrapper">
            ${chipsHtml}
            <input type="text" id="tag-input" placeholder="Aggiungi tag..."
                onkeydown="handleTagKeydown(event)"
                style="border:none; background:transparent; color:var(--text-primary); padding:4px; font-size:0.85rem; flex:1; min-width:100px;">
        </div>
        ${suggestionsHtml ? `<div class="tag-suggestions">${suggestionsHtml}</div>` : ''}
    `;
}

window.handleTagKeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const input = document.getElementById('tag-input');
        const value = input.value.trim().toLowerCase().replace(',', '');
        if (value && !editingTags.includes(value)) {
            addEditTag(value);
        }
    }
};

window.addEditTag = (tag) => {
    tag = tag.trim().toLowerCase();
    if (tag && !editingTags.includes(tag)) {
        editingTags.push(tag);
        renderTagEditor(editingTags);
    }
};

window.removeEditTag = (index) => {
    editingTags.splice(index, 1);
    renderTagEditor(editingTags);
};

window.uploadTagImage = (tag) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = (e) => {
        if (e.target.files[0]) {
            // Compress image before saving (tag images display small)
            compressImage(e.target.files[0], 128, 0.7, (compressedDataUrl) => {
                setTagImage(tag, compressedDataUrl);
                renderTagEditor(editingTags);
            });
        }
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
};

// Compress image to maxSize px and quality (0-1)
function compressImage(file, maxSize, quality, callback) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
        else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        callback(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback: use FileReader
        const reader = new FileReader();
        reader.onload = (ev) => callback(ev.target.result);
        reader.readAsDataURL(file);
    };
    img.src = url;
}

// --- IMAGE QUALITY PRESETS ---
const IMAGE_QUALITY_PRESETS = {
    alta:   { maxSize: 1200, quality: 0.85, label: 'Alta (1200px)',  desc: 'Per Cerca-Trova e dettagli' },
    media:  { maxSize: 600,  quality: 0.80, label: 'Media (600px)',  desc: 'Standard per naming/tact' },
    bassa:  { maxSize: 400,  quality: 0.70, label: 'Bassa (400px)',  desc: 'Minimo ingombro' },
    originale: { maxSize: 0, quality: 0,    label: 'Originale',      desc: 'Nessuna compressione' }
};
window.IMAGE_QUALITY_PRESETS = IMAGE_QUALITY_PRESETS;

// Default quality per mode
const MODE_DEFAULT_QUALITY = {
    search_find: 'alta',
    intraverbal_scenari: 'alta'
};

function getEditingImageQuality() {
    return state._editingImageQuality || 'media';
}
window.getEditingImageQuality = getEditingImageQuality;

function guessDefaultImageQuality(modes) {
    for (const m of modes) {
        if (MODE_DEFAULT_QUALITY[m]) return MODE_DEFAULT_QUALITY[m];
    }
    return 'media';
}

function renderImageQualitySelector() {
    const container = document.getElementById('edit-image-quality-container');
    if (!container) return;
    const current = getEditingImageQuality();
    container.innerHTML = Object.entries(IMAGE_QUALITY_PRESETS).map(([key, cfg]) => {
        const sel = key === current;
        return `<div class="mode-check ${sel ? 'selected' : ''}" data-quality="${key}" onclick="selectImageQuality('${key}')" title="${cfg.desc}" style="cursor:pointer;">
            <i class="fa-solid ${sel ? 'fa-check-square' : 'fa-square'}"></i> ${cfg.label}
        </div>`;
    }).join('');
}

window.selectImageQuality = (key) => {
    state._editingImageQuality = key;
    renderImageQualitySelector();
};

// Compress/resize a dataUrl string using current quality preset.
// Returns a Promise<string> with the processed dataUrl.
function compressDataUrl(dataUrl, preset) {
    if (!preset || preset === 'originale') return Promise.resolve(dataUrl);
    const cfg = IMAGE_QUALITY_PRESETS[preset];
    if (!cfg || cfg.maxSize === 0) return Promise.resolve(dataUrl);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            // Only resize if larger than max
            if (w <= cfg.maxSize && h <= cfg.maxSize) {
                // Still convert to WebP for size savings
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/webp', cfg.quality));
                return;
            }
            if (w > h) { h = Math.round(h * cfg.maxSize / w); w = cfg.maxSize; }
            else { w = Math.round(w * cfg.maxSize / h); h = cfg.maxSize; }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/webp', cfg.quality));
        };
        img.onerror = () => resolve(dataUrl); // fallback: keep original
        img.src = dataUrl;
    });
}
window.compressDataUrl = compressDataUrl;

// --- SAVE EDITOR ---
window.saveEditorChanges = () => {
    const modes = [];
    document.querySelectorAll('#edit-modes-container .mode-check.selected').forEach(el => {
        modes.push(el.dataset.mode);
    });

    DB.getAllSets().then(all => {
        const s = all.find(x => x.id === state.editingSetId);
        if (s) {
            s.name = document.getElementById('edit-set-name').value;
            // Category
            let cat = document.getElementById('edit-set-category').value;
            if (cat === '__new__') cat = document.getElementById('edit-set-category-custom').value.trim() || 'Personale';
            s.category = cat;
            s.items = state.editingItems;
            s.modes = modes;
            s.tags = [...editingTags]; // Save semantic tags
            s.imageQuality = state._editingImageQuality || 'media';
            if (state._editingCoverImage) s.coverImage = state._editingCoverImage;
            else delete s.coverImage;
            // Save variant names (only if variants exist)
            if (state._editingVariantNames && state._editingVariantNames.length > 0) {
                s.variantNames = [...state._editingVariantNames];
            } else {
                delete s.variantNames;
            }
            DB.saveSet(s).then(() => {
                reloadLibrary();
                // If the edited set is the one currently loaded for play, refresh
                // the in-memory copy so image/label edits show in the modes
                // immediately (no app restart needed).
                if (state.activeSetId === s.id) {
                    state.items = JSON.parse(JSON.stringify(s.items));
                    if (typeof _updateVariantSelector === 'function') _updateVariantSelector();
                }
                document.getElementById('modal-editor').classList.remove('open');
                document.getElementById('modal-library').classList.add('open');
            });
        }
    });
};

// --- RENDER EDITOR LIST ---
// Delete an item keeping the active-item pointer consistent (a stale index
// would silently attach the next pasted image to the wrong item).
window.deleteEditorItem = (idx) => {
    state.editingItems.splice(idx, 1);
    if (state.activeEditorIndex != null) {
        if (state.activeEditorIndex === idx) state.activeEditorIndex = null;
        else if (state.activeEditorIndex > idx) state.activeEditorIndex--;
    }
    renderEditorList();
};

function renderEditorList() {
    const container = document.getElementById('editor-list');
    if (!container) return;

    const totalItems = state.editingItems.length;
    const activeItems = state.editingItems.filter(i => !i.hidden).length;
    const editVariant = state._editingVariant || 0;
    // Counters refer to the variant being edited: a variant is an independent
    // picture set, so "missing image" / "cut out" must be judged on ITS images.
    const visible = state.editingItems.filter(i => !i.hidden);
    // NB: getItemVariantUrl() falls back to the base picture, so it can never be
    // used to count coverage — it would report a variant as complete while the
    // modes silently play the base images. Ask for the variant's OWN picture.
    const withImg = visible.filter(i => hasOwnVariantImage(i, editVariant)).length;
    const withMask = visible.filter(i => hasOwnVariantImage(i, editVariant) && getItemVariantMasked(i, editVariant)).length;
    const missingInVariant = visible.length - withImg;
    const vName = editVariant > 0
        ? ((state._editingVariantNames || [])[editVariant - 1] || ('Variante ' + editVariant))
        : 'Base';

    const counterHtml = `
        <div style="position:sticky; top:0; z-index:10; background:var(--modal-bg); padding:10px; margin-bottom:10px; border-bottom:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; color:#ccc; font-size:0.9rem;">
            <span><i class="fa-solid fa-list-ol"></i> Item Attivi: <b style="color:${activeItems >= 20 ? 'var(--success-color)' : 'var(--warning-color)'}">${activeItems}</b> / ${totalItems}</span>
            <span style="font-size:0.78rem; display:flex; gap:10px; align-items:center;">
                <span style="background:rgba(139,92,246,0.18); color:#a78bfa; padding:2px 8px; border-radius:6px;"><i class="fa-solid fa-layer-group" style="font-size:0.7rem;"></i> ${vName}</span>
                <span title="Item con immagine in questa variante"><i class="fa-solid fa-image" style="opacity:0.7;"></i> <b style="color:${withImg === visible.length ? 'var(--success-color)' : 'var(--warning-color)'}">${withImg}</b>/${visible.length}</span>
                <span title="Item scontornati in questa variante"><i class="fa-solid fa-eraser" style="opacity:0.7;"></i> <b style="color:${withMask === withImg && withImg > 0 ? 'var(--success-color)' : 'var(--text-secondary)'}">${withMask}</b>/${withImg}</span>
            </span>
            ${editVariant > 0 && missingInVariant > 0 ? `
            <span style="flex-basis:100%; font-size:0.75rem; background:rgba(245,158,11,0.12); color:var(--warning-color); border:1px solid rgba(245,158,11,0.3); padding:5px 9px; border-radius:8px;">
                <i class="fa-solid fa-triangle-exclamation"></i> <b>${missingInVariant}</b> item senza immagine propria in questa variante (marcati <b>BASE</b>): nelle attivit&agrave; mostreranno l&rsquo;immagine base.
            </span>` : ''}
        </div>
    `;
    const listHtml = state.editingItems.map((item, idx) => {
        const isSelected = state.activeEditorIndex === idx;
        const activeStyle = isSelected ? 'border:1px solid var(--accent-color); background:rgba(99, 102, 241, 0.1);' : 'border:1px solid transparent;';
        const opacityStyle = item.hidden ? 'opacity: 0.6;' : 'opacity: 1;';

        const hasAudio = item.audio ? '<i class="fa-solid fa-volume-high" style="color:var(--success-color); font-size:0.6rem;"></i>' : '';
        const hasZoom = item.zoomArea ? '<i class="fa-solid fa-crop" style="color:var(--warning-color); font-size:0.6rem;"></i>' : '';
        const hasSeq = item.seqNumber ? `<i class="fa-solid fa-arrow-down-1-9" style="color:var(--accent-color); font-size:0.6rem;" title="Seq: ${item.seqNumber}"></i>` : '';
        const hasFront = item.frontMaskUrl ? '<i class="fa-solid fa-box-open" style="color:#f59e0b; font-size:0.6rem;" title="Contenitore (maschera davanti)"></i>' : '';

        // Resolve display URL based on active editing variant
        let displayUrl = getItemVariantUrl(item, editVariant);
        const hasVariantImg = hasOwnVariantImage(item, editVariant);
        // The thumbnail falls back to the base picture so the row is never empty —
        // say so out loud, otherwise a borrowed image reads as a real one.
        const borrowedBadge = editVariant > 0 && !hasVariantImg
            ? `<span title="Nessuna immagine per questa variante: in attivit&agrave; verr&agrave; usata quella base"
                     style="position:absolute; left:2px; top:2px; font-size:0.5rem; font-weight:700; letter-spacing:0.3px;
                            background:var(--warning-color); color:#000; padding:1px 4px; border-radius:4px;">BASE</span>`
            : '';
        // When "show cut-outs" is on, preview the masked (scontornata) version so
        // the AI/bulk results are visible. Checkerboard makes transparency obvious.
        const itemMasked = getItemVariantMasked(item, editVariant);
        const showMasked = state._editorShowMasked && itemMasked;
        if (showMasked) displayUrl = itemMasked;
        const thumbBg = showMasked ? 'background:repeating-conic-gradient(#777 0% 25%, #555 0% 50%) 50%/12px 12px;' : '';

        return `
        <div class="editor-item" style="${activeStyle} ${opacityStyle} transition:0.2s; cursor:pointer;" onclick="setActiveItem(${idx})">
            <div class="editor-thumb" style="cursor:pointer; position:relative;${thumbBg}${editVariant > 0 && !hasVariantImg ? ' outline:2px dashed var(--warning-color); outline-offset:-2px;' : ''}" onclick="triggerItemUpload(${idx}); event.stopPropagation();" title="Clicca per caricare">
                <img src="${displayUrl || getPlaceholderUrl(item.label)}" style="width:100%; height:100%; object-fit:${showMasked ? 'contain' : 'cover'}; pointer-events:none;">
                ${borrowedBadge}
                <div style="position:absolute; inset:0; background:rgba(0,0,0,0.35); display:flex; justify-content:center; align-items:center; opacity:0;">
                    <i class="fa-solid fa-camera" style="color:#fff;"></i>
                </div>
            </div>
            <div style="flex:1">
                <input type="text" value="${escapeHtml(item.label)}"
                    onchange="state.editingItems[${idx}].label=this.value"
                    onfocus="setActiveItem(${idx})"
                    onclick="event.stopPropagation()"
                    placeholder="Etichetta"
                    style="${item.hidden ? 'text-decoration:line-through; color:#888;' : ''}">
                <div style="display:flex; gap:2px; margin-top:2px;">${hasAudio}${hasZoom}${hasSeq}${hasFront}</div>
            </div>
            <input type="number" value="${item.seqNumber || ''}" min="1"
                onchange="state.editingItems[${idx}].seqNumber=this.value?parseInt(this.value):null; renderEditorList();"
                onclick="event.stopPropagation();"
                placeholder="#"
                title="N. Sequenza"
                style="width:38px; padding:4px; border-radius:6px; background:${item.seqNumber ? 'rgba(99,102,241,0.2)' : 'rgba(var(--shade-rgb),0.2)'}; border:1px solid ${item.seqNumber ? 'var(--accent-color)' : 'var(--glass-border)'}; color:${item.seqNumber ? 'var(--accent-color)' : '#888'}; font-size:0.8rem; text-align:center; font-weight:bold;">
            <button class="btn btn-ghost" style="padding:6px;" onclick="openPollinationsGenerator(${idx}); event.stopPropagation();" title="Cerca o genera immagine">
                <i class="fa-solid fa-wand-magic-sparkles" style="font-size:0.8rem; ${item.url ? 'opacity:0.4' : 'color:var(--accent-color); opacity:0.8'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="openAiStudioPrompt(${idx}); event.stopPropagation();" title="Prompt per AI Studio / Gemini (gratis)">
                <i class="fa-solid fa-clipboard" style="font-size:0.8rem; color:#22d3ee; opacity:0.85;"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="triggerAudioUpload(${idx}); event.stopPropagation();" title="Carica Audio">
                <i class="fa-solid fa-music" style="font-size:0.8rem; ${item.audio ? 'color:var(--success-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="scontornaEditorItem(${idx}); event.stopPropagation();" title="${itemMasked ? 'Scontorno OK per «' + vName + '» (clicca per rifare)' : 'Rimuovi sfondo (' + vName + ')'}">
                <i class="fa-solid fa-eraser" style="font-size:0.8rem; ${itemMasked ? 'color:var(--success-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="highlightEditorItem(${idx}); event.stopPropagation();" title="Evidenzia soggetto (resto in bianco e nero)">
                <i class="fa-solid fa-highlighter" style="font-size:0.8rem; ${(editVariant > 0 ? (item.variantOriginalUrls && item.variantOriginalUrls[editVariant]) : item.originalUrl) ? 'color:var(--warning-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="openZoomEditor(${idx}); event.stopPropagation();" title="Imposta Area Zoom">
                <i class="fa-solid fa-crop" style="font-size:0.8rem; ${item.zoomArea ? 'color:var(--warning-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="toggleItemVisibility(${idx}); event.stopPropagation();" title="${item.hidden ? 'Mostra' : 'Nascondi'}">
                <i class="fa-solid ${item.hidden ? 'fa-eye-slash' : 'fa-eye'}" style="${item.hidden ? 'color:#888' : 'color:var(--success-color)'}"></i>
            </button>
            <button class="btn btn-danger" style="padding:6px;" onclick="deleteEditorItem(${idx}); event.stopPropagation();">
                <i class="fa-solid fa-minus"></i>
            </button>
        </div>`;
    }).join('');

    container.innerHTML = counterHtml + listHtml;
}

// --- SCONTORNO (Background removal) ---
window.scontornaEditorItem = async (idx) => {
    const item = state.editingItems[idx];
    const v = state._editingVariant || 0;
    if (!item || !getItemVariantUrl(item, v)) return;
    if (v > 0 && !hasOwnVariantImage(item, v)) {
        alert('Questo item non ha ancora un\'immagine propria in questa variante: caricala prima di scontornarla.');
        return;
    }
    if (typeof removeBackground !== 'function') return;

    // Open preview overlay with tolerance slider (acts on the active variant)
    _openScontornoPreview(item, () => renderEditorList(), v);
};

// "Front mask" editor: the user paints the FRONT part of a container object
// (e.g. the near wall of a cup). Topologia dentro/fuori then uses the item as
// a real container: full image behind, subject in the middle, painted front
// part drawn on top so the subject sits INSIDE it.
window.openFrontMaskEditor = (item, onDone) => {
    if (typeof openMaskEditor !== 'function') { alert('Editor non disponibile.'); return; }
    openMaskEditor({
        imageUrl: item.url,
        mode: 'cutout',
        startEmpty: true,
        title: 'Parte davanti — ' + (item.label || 'Item'),
        hint: 'Dipingi SOLO la parte davanti del contenitore (quella che nasconde ci\u00f2 che c\u2019\u00e8 dentro).',
        initialMaskUrl: item.frontMaskUrl || null,
        onApply: (result) => {
            if (result === null) delete item.frontMaskUrl;
            else item.frontMaskUrl = result;
            delete item._frontRimFrac; delete item._frontOpening; // recompute from the new mask
            if (onDone) onDone();
        }
    });
};

// Manual/AI cutout editor (used by the "advanced" button in the scontorno preview)
window.openManualCutout = (item, onDone, variantIndex) => {
    if (typeof openMaskEditor !== 'function') { alert('Editor non disponibile.'); return; }
    const v = variantIndex || 0;
    if (v > 0 && !hasOwnVariantImage(item, v)) {
        alert('Questo item non ha ancora un\'immagine propria in questa variante: caricala prima di scontornarla.');
        return;
    }
    const vLabel = v > 0 ? ((state._editingVariantNames || [])[v - 1] || ('Variante ' + v)) : 'Base';
    openMaskEditor({
        imageUrl: getItemVariantUrl(item, v),
        mode: 'cutout',
        title: 'Scontorno — ' + (item.label || 'Item') + ' · ' + vLabel,
        initialMaskUrl: getItemVariantMasked(item, v),
        onApply: (result) => {
            setItemVariantMasked(item, v, result || null);
            if (onDone) onDone();
        }
    });
};

// Highlight subject (keep subject in colour, desaturate the rest).
// The result replaces item.url; item.originalUrl preserves the source for restore.
window.highlightEditorItem = (idx) => {
    const item = state.editingItems[idx];
    const v = state._editingVariant || 0;
    const curUrl = getItemVariantUrl(item, v);
    if (!item || !curUrl) { alert('Nessuna immagine da evidenziare.'); return; }
    if (v > 0 && !hasOwnVariantImage(item, v)) {
        alert('Questo item non ha ancora un\'immagine propria in questa variante: caricala prima di evidenziarla.');
        return;
    }
    if (typeof openMaskEditor !== 'function') { alert('Editor non disponibile.'); return; }
    const vLabel = v > 0 ? ((state._editingVariantNames || [])[v - 1] || ('Variante ' + v)) : 'Base';
    const origForVariant = v > 0 ? (item.variantOriginalUrls && item.variantOriginalUrls[v]) : item.originalUrl;
    const source = origForVariant || curUrl; // always edit from the clean image
    openMaskEditor({
        imageUrl: source,
        mode: 'highlight',
        title: 'Evidenzia — ' + (item.label || 'Item') + ' · ' + vLabel,
        onApply: (result) => {
            if (result === null) {
                // Remove effect: restore the original picture of THIS variant
                if (v > 0) {
                    if (item.variantOriginalUrls && item.variantOriginalUrls[v]) {
                        setItemVariantUrl(item, v, item.variantOriginalUrls[v]);
                        delete item.variantOriginalUrls[v];
                        if (Object.keys(item.variantOriginalUrls).length === 0) delete item.variantOriginalUrls;
                    }
                } else if (item.originalUrl) { item.url = item.originalUrl; delete item.originalUrl; }
            } else {
                if (v > 0) {
                    if (!item.variantOriginalUrls) item.variantOriginalUrls = {};
                    if (!item.variantOriginalUrls[v]) item.variantOriginalUrls[v] = curUrl;
                    setItemVariantUrl(item, v, result);
                    setItemVariantMasked(item, v, null);
                } else {
                    if (!item.originalUrl) item.originalUrl = item.url;
                    item.url = result;
                    // Base image changed; any cached scontorno no longer matches
                    delete item.maskedUrl;
                }
            }
            renderEditorList();
        }
    });
};

function _openScontornoPreview(item, onDone, variantIndex) {
    const v = variantIndex || 0;
    const srcUrl = getItemVariantUrl(item, v);
    const curMasked = getItemVariantMasked(item, v);
    const vLabel = v > 0 ? ((state._editingVariantNames || [])[v - 1] || ('Variante ' + v)) : 'Base';
    const tolerance = getScontornoTolerance();
    const overlay = document.createElement('div');
    overlay.className = 'themed-dialog-overlay';
    overlay.innerHTML = `
        <div class="themed-dialog" style="max-width:500px; padding:16px;">
            <div style="font-weight:bold; margin-bottom:10px;"><i class="fa-solid fa-eraser"></i> Scontorno — ${item.label || 'Item'} <span style="font-size:0.72rem; background:rgba(139,92,246,0.18); color:#a78bfa; padding:1px 7px; border-radius:5px; margin-left:4px;">${vLabel}</span></div>
            <div style="display:flex; gap:10px; margin-bottom:12px;">
                <div style="flex:1; text-align:center;">
                    <div style="font-size:0.65rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:4px;">Originale</div>
                    <img id="sc-preview-orig" src="${srcUrl}" style="max-width:100%; max-height:200px; object-fit:contain; border-radius:var(--radius-sm); background:repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50%/16px 16px;">
                </div>
                <div style="flex:1; text-align:center;">
                    <div style="font-size:0.65rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:4px;">Scontornata</div>
                    <div id="sc-preview-result" style="min-height:100px; display:flex; align-items:center; justify-content:center; background:repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50%/16px 16px; border-radius:var(--radius-sm);">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:var(--text-secondary);"></i>
                    </div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                <label style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap;">Tolleranza:</label>
                <input id="sc-tolerance-slider" type="range" min="5" max="80" step="1" value="${tolerance}" style="flex:1; accent-color:var(--accent-color);">
                <span id="sc-tolerance-val" style="font-size:0.85rem; font-weight:bold; min-width:30px; text-align:center;">${tolerance}</span>
            </div>
            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:12px;">
                Bassa = conservativo (mantiene più dettagli). Alta = aggressivo (rimuove più sfondo).
            </div>
            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:10px;">
                Sfondo non uniforme? Usa <b>Manuale / AI</b> per cancellarlo a mano (bacchetta + pennello) o con il riconoscimento automatico del soggetto.
            </div>
            <div class="themed-dialog-btns">
                <button class="btn btn-ghost" id="sc-btn-cancel">Annulla</button>
                <button class="btn btn-ghost" id="sc-btn-clear" style="${curMasked ? '' : 'display:none;'} color:var(--danger-color);">Rimuovi scontorno</button>
                <button class="btn btn-ghost" id="sc-btn-front" style="color:var(--warning-color);" title="Dipingi la parte davanti: l'oggetto diventa un contenitore per Topologia dentro/fuori"><i class="fa-solid fa-box-open"></i> Contenitore</button>
                <button class="btn btn-ghost" id="sc-btn-manual" style="color:var(--accent-color);"><i class="fa-solid fa-hand-pointer"></i> Manuale / AI</button>
                <button class="btn btn-primary" id="sc-btn-apply">Applica</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const slider = overlay.querySelector('#sc-tolerance-slider');
    const valLabel = overlay.querySelector('#sc-tolerance-val');
    const resultDiv = overlay.querySelector('#sc-preview-result');
    let currentResult = null;
    let debounceTimer = null;

    const runPreview = async (tol) => {
        resultDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:var(--text-secondary);"></i>';
        const result = await removeBackground(srcUrl, tol);
        currentResult = result;
        if (result) {
            resultDiv.innerHTML = `<img src="${result}" style="max-width:100%; max-height:200px; object-fit:contain;">`;
        } else {
            resultDiv.innerHTML = '<div style="padding:20px; font-size:0.75rem; color:var(--text-muted);">Sfondo non uniforme — nessuna modifica</div>';
        }
    };

    // If a cut-out already exists (e.g. from the AI/bulk models), show THAT first
    // instead of immediately running the colour-based scontorno over it.
    if (curMasked) {
        currentResult = curMasked;
        resultDiv.innerHTML = `<img src="${curMasked}" style="max-width:100%; max-height:200px; object-fit:contain;"><div style="font-size:0.62rem; color:var(--text-muted); margin-top:4px;">Scontorno attuale (AI/manuale). Muovi la tolleranza per rifare quello a colori.</div>`;
    } else {
        runPreview(tolerance);
    }

    slider.addEventListener('input', () => {
        valLabel.textContent = slider.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runPreview(parseInt(slider.value)), 300);
    });

    const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };

    overlay.querySelector('#sc-btn-cancel').onclick = () => close();
    overlay.querySelector('#sc-btn-manual').onclick = () => {
        close();
        window.openManualCutout(item, onDone, v);
    };
    overlay.querySelector('#sc-btn-front').onclick = () => {
        close();
        window.openFrontMaskEditor(item, onDone);
    };
    overlay.querySelector('#sc-btn-clear').onclick = () => {
        setItemVariantMasked(item, v, null);
        close();
        if (onDone) onDone();
    };
    overlay.querySelector('#sc-btn-apply').onclick = () => {
        const tol = parseInt(slider.value);
        setScontornoTolerance(tol);
        if (currentResult) setItemVariantMasked(item, v, currentResult);
        close();
        if (onDone) onDone();
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

window.batchScontornoEditor = async () => {
    if (typeof removeBackground !== 'function') return;
    const v = state._editingVariant || 0;
    // Only items that own a picture in this variant: getItemVariantUrl() would
    // hand back the BASE image, and we would store a cut-out of the wrong
    // picture under this variant.
    const items = state.editingItems.filter(i => hasOwnVariantImage(i, v) && !getItemVariantMasked(i, v));
    if (items.length === 0) return;

    const tolerance = getScontornoTolerance();
    const btn = document.getElementById('btn-batch-scontorno');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 0/' + items.length;

    let done = 0;
    for (const item of items) {
        const result = await removeBackground(getItemVariantUrl(item, v), tolerance);
        if (result) setItemVariantMasked(item, v, result);
        done++;
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + done + '/' + items.length;
    }
    if (btn) btn.innerHTML = '<i class="fa-solid fa-eraser"></i> Scontorna tutti';
    renderEditorList();
};

// Bulk AI scontorno: removes the background of every image in the set using the
// AI model, loaded ONCE and reused. Processes one image at a time and yields
// between them so memory stays bounded (no all-at-once decode/compose).
window.aiBatchScontornoEditor = async () => {
    if (typeof aiCutoutDataUrl !== 'function') { alert('Editor AI non disponibile.'); return; }
    const v = state._editingVariant || 0;
    const items = state.editingItems.filter(i => {
        if (!hasOwnVariantImage(i, v)) return false; // never cut out the borrowed base image
        const u = getItemVariantUrl(i, v);
        return u && u.startsWith('data:') && !getItemVariantMasked(i, v);
    });
    if (items.length === 0) {
        alert('Nessuna immagine da scontornare in questa variante (sono già tutte scontornate, o mancano le immagini).');
        return;
    }
    const proceed = (typeof themedConfirm === 'function')
        ? await themedConfirm(`Scontornare ${items.length} immagini con l'AI?\nIl modello viene caricato una sola volta. Su molte immagini può richiedere qualche minuto.`)
        : confirm(`Scontornare ${items.length} immagini con l'AI?`);
    if (!proceed) return;

    let done = 0, failed = 0;
    showBackupProgress('Preparazione modello AI...', 0);

    // With a PC helper configured, send the images in chunks: each chunk is one
    // GPU batch over there, which is where the time on a whole set goes. Chunks
    // (not one giant request) keep progress moving and memory bounded, and any
    // failure just drops through to the per-image loop below.
    if (typeof aiCutoutDataUrlMany === 'function' && window.AIEngine
        && AIEngine.serverBase && AIEngine.serverBase()) {
        const CHUNK = 8;
        const groups = [];
        for (let i = 0; i < items.length; i += CHUNK) groups.push(items.slice(i, i + CHUNK));
        let sent = 0, serverOk = true;
        for (const group of groups) {
            const pct = (sent / items.length) * 100;
            showBackupProgress(`Scontorno sul PC: ${sent + 1}-${sent + group.length} di ${items.length}`, pct);
            let res = null;
            try {
                res = await aiCutoutDataUrlMany(group.map(it => getItemVariantUrl(it, v)),
                    (t) => showBackupProgress(`${t} (${sent + group.length}/${items.length})`, pct));
            } catch (e) { console.warn('bulk PC cutout failed', e); }
            if (!res) { serverOk = false; break; }   // PC down: finish on-device
            res.forEach((url, k) => {
                if (url) setItemVariantMasked(group[k], v, url); else failed++;
                done++;
            });
            sent += group.length;
            await new Promise(r => setTimeout(r, 0));
        }
        if (serverOk) {
            hideBackupProgress();
            renderEditorList();
            alert(`Scontorno completato sul PC: ${done - failed} riuscite${failed ? `, ${failed} fallite` : ''}.`);
            return;
        }
        showBackupProgress('PC non raggiungibile: continuo sul dispositivo...', 0);
        done = 0; failed = 0;
    }

    for (const item of items) {
        const label = item.label || `#${done + 1}`;
        try {
            const pct = (done / items.length) * 100;
            showBackupProgress(`Scontorno AI: ${label} (${done + 1}/${items.length})`, pct);
            const res = await aiCutoutDataUrl(getItemVariantUrl(item, v), (t) => showBackupProgress(`${t} — ${label} (${done + 1}/${items.length})`, pct));
            if (res) setItemVariantMasked(item, v, res); else failed++;
        } catch (e) {
            console.warn('bulk AI scontorno failed for', label, e);
            failed++;
        }
        done++;
        // Yield to the event loop so the UI updates and the GC can reclaim the
        // per-image canvas/ImageData before the next one.
        await new Promise(r => setTimeout(r, 0));
    }
    hideBackupProgress();
    renderEditorList();
    alert(`Scontorno AI completato: ${done - failed} riuscite${failed ? `, ${failed} fallite` : ''}.`);
};

// Bulk AI highlight: keep the subject coloured, desaturate the background, for
// every image. Uses the native ML Kit subject mask when available, else RMBG.
// The result replaces item.url; item.originalUrl preserves the source.
window.aiBatchHighlightEditor = async () => {
    if (typeof aiHighlightDataUrl !== 'function') { alert('Editor AI non disponibile.'); return; }
    const hv = state._editingVariant || 0;
    const items = state.editingItems.filter(i => {
        if (!hasOwnVariantImage(i, hv)) return false; // never edit the borrowed base image
        const u = getItemVariantUrl(i, hv);
        return u && u.startsWith('data:');
    });
    if (items.length === 0) { alert('Nessuna immagine da evidenziare.'); return; }
    const proceed = (typeof themedConfirm === 'function')
        ? await themedConfirm(`Evidenziare il soggetto in ${items.length} immagini?\nLo sfondo diventa bianco e nero. L'originale resta recuperabile.`)
        : confirm(`Evidenziare il soggetto in ${items.length} immagini?`);
    if (!proceed) return;

    let done = 0, failed = 0;
    showBackupProgress('Preparazione modello AI...', 0);
    for (const item of items) {
        const label = item.label || `#${done + 1}`;
        try {
            const pct = (done / items.length) * 100;
            showBackupProgress(`Evidenzia AI: ${label} (${done + 1}/${items.length})`, pct);
            const res = await aiHighlightDataUrl(getItemVariantUrl(item, hv), (t) => showBackupProgress(`${t} — ${label} (${done + 1}/${items.length})`, pct));
            if (res) {
                if (hv > 0) {
                    if (!item.variantOriginalUrls) item.variantOriginalUrls = {};
                    if (!item.variantOriginalUrls[hv]) item.variantOriginalUrls[hv] = getItemVariantUrl(item, hv);
                    setItemVariantUrl(item, hv, res);
                    setItemVariantMasked(item, hv, null);
                } else {
                    if (!item.originalUrl) item.originalUrl = item.url;
                    item.url = res; delete item.maskedUrl;
                }
            }
            else failed++;
        } catch (e) {
            console.warn('bulk AI highlight failed for', label, e);
            failed++;
        }
        done++;
        await new Promise(r => setTimeout(r, 0));
    }
    hideBackupProgress();
    renderEditorList();
    alert(`Evidenzia AI completata: ${done - failed} riuscite${failed ? `, ${failed} fallite` : ''}.`);
};

// Toggle the editor thumbnails between originals and cut-outs (masked) so the
// AI/bulk scontorno results can be reviewed at a glance.
window.toggleEditorShowMasked = () => {
    state._editorShowMasked = !state._editorShowMasked;
    const btn = document.getElementById('btn-toggle-masked');
    if (btn) btn.innerHTML = state._editorShowMasked
        ? '<i class="fa-solid fa-eye-slash"></i> Mostra originali'
        : '<i class="fa-solid fa-eye"></i> Mostra scontornate';
    renderEditorList();
};

// Remove every existing background-removal result in the set, so they can be
// redone in bulk (e.g. with a different/AI model). Originals stay untouched.
window.clearAllScontorni = async () => {
    const v = state._editingVariant || 0;
    const vLabel = v > 0 ? ((state._editingVariantNames || [])[v - 1] || ('Variante ' + v)) : 'Base';
    const items = state.editingItems.filter(i => getItemVariantMasked(i, v));
    if (items.length === 0) { alert('Nessuno scontorno da rimuovere in «' + vLabel + '».'); return; }
    const proceed = (typeof themedConfirm === 'function')
        ? await themedConfirm(`Rimuovere lo scontorno da ${items.length} immagini della variante «${vLabel}»?\nLe immagini originali restano intatte; potrai rifare lo scontorno in bulk.`)
        : confirm(`Rimuovere lo scontorno da ${items.length} immagini?`);
    if (!proceed) return;
    items.forEach(i => setItemVariantMasked(i, v, null));
    renderEditorList();
    alert(`Scontorni rimossi da ${items.length} immagini. Ricorda di salvare il set (o rifai subito il bulk).`);
};

window.openScontornoSettings = async () => {
    const current = getScontornoTolerance();
    const val = await themedPrompt('Tolleranza scontorno (5-80).\nBassa = conservativo, Alta = aggressivo:', String(current));
    if (val === null) return;
    setScontornoTolerance(parseInt(val) || 35);
};

// --- EDITOR ACTIONS ---
window.addNewItem = () => {
    state.editingItems.push({ label: 'Nuovo', url: null, hidden: false });
    renderEditorList();
    setTimeout(() => {
        const list = document.getElementById('editor-list');
        list.scrollTop = list.scrollHeight;
    }, 100);
};

window.toggleBulkAddPanel = () => {
    const panel = document.getElementById('bulk-add-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        document.getElementById('bulk-add-textarea').focus();
    }
};

window.bulkAddItems = () => {
    const textarea = document.getElementById('bulk-add-textarea');
    const text = textarea.value.trim();
    if (!text) return;
    const names = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;
    names.forEach(name => {
        state.editingItems.push({ label: name, url: null, hidden: false });
    });
    textarea.value = '';
    document.getElementById('bulk-add-panel').classList.add('hidden');
    renderEditorList();
    setTimeout(() => {
        const list = document.getElementById('editor-list');
        list.scrollTop = list.scrollHeight;
    }, 100);
};

window.closeEditor = () => {
    document.getElementById('modal-editor').classList.remove('open');
    document.getElementById('modal-library').classList.add('open');
};

window.toggleItemVisibility = (idx) => {
    state.editingItems[idx].hidden = !state.editingItems[idx].hidden;
    renderEditorList();
};

window.setActiveItem = (index) => {
    if (state._coverPasteActive) { state._coverPasteActive = false; renderEditorCover(); }
    if (state.activeEditorIndex === index) return; // skip re-render if already active
    state.activeEditorIndex = index;
    renderEditorList();
};

// --- IMAGE UPLOAD ---
window.triggerItemUpload = (index) => {
    state.activeEditorIndex = index;
    const editVariant = state._editingVariant || 0;
    let input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    input.onchange = (e) => {
        if (e.target.files[0]) {
            const r = new FileReader();
            r.onload = async (ev) => {
                const compressed = await compressDataUrl(ev.target.result, getEditingImageQuality());
                setItemVariantUrl(state.editingItems[index], editVariant, compressed);
                renderEditorList();
            };
            r.readAsDataURL(e.target.files[0]);
        }
    };
    document.body.appendChild(input); input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
};

// --- BULK UPLOAD ---
window.bulkUploadImages = (input) => {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    const preset = getEditingImageQuality();
    const editVariant = state._editingVariant || 0;

    files.forEach(file => {
        const r = new FileReader();
        r.onload = async (ev) => {
            const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            const url = await compressDataUrl(ev.target.result, preset);
            if (editVariant === 0) {
                state.editingItems.push({ label: name, url, hidden: false });
            } else {
                // For non-base variants, try to match by filename to existing items
                const existing = state.editingItems.find(i =>
                    i.label.toLowerCase().trim() === name.toLowerCase().trim());
                if (existing) {
                    setItemVariantUrl(existing, editVariant, url);
                } else {
                    // No matching item: create new item with this variant image
                    const newItem = { label: name, url: null, hidden: false };
                    setItemVariantUrl(newItem, editVariant, url);
                    state.editingItems.push(newItem);
                }
            }
            renderEditorList();
        };
        r.readAsDataURL(file);
    });

    input.value = '';
};

// --- AUDIO UPLOAD ---
window.triggerAudioUpload = (index) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';
    input.onchange = (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.editingItems[index].audio = ev.target.result;
                renderEditorList();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
};

// --- ZOOM AREA EDITOR ---
window.openZoomEditor = (index) => {
    const item = state.editingItems[index];
    if (!item.url) {
        alert("Carica prima un'immagine per questo item.");
        return;
    }

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'zoom-area-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;';

    const currentArea = item.zoomArea || null;

    modal.innerHTML = `
        <div style="color:#fff; margin-bottom:15px; text-align:center;">
            <h3 style="margin:0 0 5px 0;"><i class="fa-solid fa-crop"></i> Definisci Area Zoom</h3>
            <p style="margin:0; opacity:0.7; font-size:0.85rem;">Trascina sull'immagine per selezionare l'area da zoomare</p>
        </div>
        <div id="zoom-editor-container" style="position:relative; max-width:90vw; max-height:60vh; display:inline-block; cursor:crosshair; touch-action:none;">
            <img id="zoom-editor-img" src="${item.url}" style="max-width:90vw; max-height:60vh; display:block; border-radius:8px; user-select:none;" draggable="false">
            <div id="zoom-selection-rect" style="position:absolute; border:3px dashed #f59e0b; background:rgba(245,158,11,0.15); display:none; pointer-events:none;"></div>
            ${currentArea ? `<div id="zoom-existing-rect" style="position:absolute; border:2px solid #10b981; background:rgba(16,185,129,0.15); left:${currentArea.x}%; top:${currentArea.y}%; width:${currentArea.w}%; height:${currentArea.h}%; pointer-events:none;"></div>` : ''}
        </div>
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button id="zoom-save-btn" class="btn btn-success" style="padding:10px 20px;" ${currentArea ? '' : 'disabled style="padding:10px 20px; opacity:0.5;"'}>
                <i class="fa-solid fa-check"></i> Salva Area
            </button>
            ${currentArea ? '<button class="btn btn-danger" style="padding:10px 20px;" onclick="clearZoomArea(' + index + ')"><i class="fa-solid fa-trash"></i> Rimuovi</button>' : ''}
            <button class="btn btn-ghost" style="padding:10px 20px;" onclick="closeZoomEditor()">
                <i class="fa-solid fa-xmark"></i> Annulla
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup drag selection
    const container = document.getElementById('zoom-editor-container');
    const img = document.getElementById('zoom-editor-img');
    const rect = document.getElementById('zoom-selection-rect');
    let startX = 0, startY = 0, isDragging = false;
    let selArea = currentArea ? { ...currentArea } : null;

    const getRelPos = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const r = img.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(100, ((touch.clientX - r.left) / r.width) * 100)),
            y: Math.max(0, Math.min(100, ((touch.clientY - r.top) / r.height) * 100))
        };
    };

    const onStart = (e) => {
        e.preventDefault();
        isDragging = true;
        const pos = getRelPos(e);
        startX = pos.x;
        startY = pos.y;
        rect.style.display = 'block';
        const existing = document.getElementById('zoom-existing-rect');
        if (existing) existing.style.display = 'none';
    };

    const onMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const pos = getRelPos(e);
        const left = Math.min(startX, pos.x);
        const top = Math.min(startY, pos.y);
        const width = Math.abs(pos.x - startX);
        const height = Math.abs(pos.y - startY);
        rect.style.left = left + '%';
        rect.style.top = top + '%';
        rect.style.width = width + '%';
        rect.style.height = height + '%';
        selArea = { x: Math.round(left), y: Math.round(top), w: Math.round(width), h: Math.round(height) };
    };

    const onEnd = () => {
        isDragging = false;
        if (selArea && selArea.w > 2 && selArea.h > 2) {
            const saveBtn = document.getElementById('zoom-save-btn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
        }
    };

    container.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    container.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    document.getElementById('zoom-save-btn').onclick = () => {
        if (selArea && selArea.w > 2 && selArea.h > 2) {
            state.editingItems[index].zoomArea = selArea;
            closeZoomEditor();
            renderEditorList();
        }
    };

    window._zoomEditorCleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
    };
};

window.clearZoomArea = (index) => {
    delete state.editingItems[index].zoomArea;
    closeZoomEditor();
    renderEditorList();
};

window.closeZoomEditor = () => {
    if (window._zoomEditorCleanup) { window._zoomEditorCleanup(); window._zoomEditorCleanup = null; }
    const modal = document.getElementById('zoom-area-modal');
    if (modal) modal.remove();
};

// --- CATEGORY EDITOR ---
function populateEditorCategory(current) {
    const sel = document.getElementById('edit-set-category');
    if (!sel) return;
    const cats = [...new Set(state.savedSets.map(s => s.category).filter(Boolean))].sort();
    sel.innerHTML = '';
    if (!cats.includes(current) && current) {
        const opt = document.createElement('option');
        opt.value = current; opt.text = current; opt.selected = true;
        sel.appendChild(opt);
    }
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.text = c;
        if (c === current) opt.selected = true;
        sel.appendChild(opt);
    });
    const optNew = document.createElement('option');
    optNew.value = '__new__'; optNew.text = '+ Nuova categoria...';
    sel.appendChild(optNew);
    document.getElementById('edit-set-category-custom').style.display = 'none';
}

window.onEditCategoryChange = (sel) => {
    const custom = document.getElementById('edit-set-category-custom');
    if (sel.value === '__new__') { custom.style.display = ''; custom.focus(); }
    else { custom.style.display = 'none'; }
};

// --- SET COVER (thumb beside the set name; paste target like the items) ---
function renderEditorCover() {
    const box = document.getElementById('edit-cover-slot');
    if (!box) return;
    const cover = state._editingCoverImage;
    const active = !!state._coverPasteActive;
    box.innerHTML = `
        <div onclick="focusSetCover()" title="${cover ? 'Tocca, poi Ctrl+V per sostituire la copertina' : 'Tocca, poi Ctrl+V per incollare la copertina'}"
             style="position:relative; width:62px; height:62px; border-radius:10px; overflow:hidden; cursor:pointer;
                    border:2px ${active ? 'solid var(--accent-color)' : 'dashed rgba(var(--ink-rgb),0.22)'};
                    background:rgba(var(--shade-rgb),0.25); display:flex; align-items:center; justify-content:center;
                    ${active ? 'box-shadow:0 0 0 3px rgba(99,102,241,0.25);' : ''}">
            ${cover
                ? `<img src="${cover}" style="width:100%; height:100%; object-fit:cover;">`
                : `<i class="fa-solid fa-image" style="font-size:1.1rem; opacity:0.35;"></i>`}
            <span onclick="event.stopPropagation(); triggerSetCoverUpload();" title="Carica da file"
                  style="position:absolute; left:2px; bottom:2px; width:20px; height:20px; border-radius:6px; background:rgba(0,0,0,0.6);
                         display:flex; align-items:center; justify-content:center; font-size:0.6rem; color:#ddd;">
                <i class="fa-solid fa-folder-open"></i>
            </span>
            ${cover ? `<span onclick="event.stopPropagation(); removeEditorCover();" title="Rimuovi copertina"
                  style="position:absolute; right:2px; top:2px; width:20px; height:20px; border-radius:6px; background:rgba(0,0,0,0.6);
                         display:flex; align-items:center; justify-content:center; font-size:0.6rem; color:var(--danger-color);">
                <i class="fa-solid fa-xmark"></i>
            </span>` : ''}
        </div>`;
    const hint = document.getElementById('edit-cover-hint');
    if (hint) {
        hint.innerHTML = active
            ? '<span style="color:var(--accent-color);"><i class="fa-solid fa-paste"></i> Premi <b>Ctrl+V</b> per incollare la copertina</span>'
            : (cover ? 'Copertina impostata &middot; tocca l\'anteprima per sostituirla' : 'Copertina del set &middot; tocca per incollare o carica un file');
    }
}
window.renderEditorCover = renderEditorCover;

// Make the cover the active paste target (and deselect any active item, so
// Ctrl+V doesn't land on an item image instead).
window.focusSetCover = () => {
    state._coverPasteActive = true;
    if (state.activeEditorIndex !== null && state.activeEditorIndex !== undefined) {
        state.activeEditorIndex = null;
        renderEditorList();
    }
    renderEditorCover();
};

window.setEditorCover = async (dataUrl) => {
    state._editingCoverImage = await _resizeSetCover(dataUrl, 400);
    renderEditorCover();
};

window.removeEditorCover = () => {
    state._editingCoverImage = null;
    renderEditorCover();
};

window.triggerSetCoverUpload = () => {
    state._coverPasteActive = true;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    input.onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => setEditorCover(ev.target.result);
        r.readAsDataURL(f);
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
};

// Covers are decorative: keep them small regardless of the set's image quality.
function _resizeSetCover(dataUrl, maxSize) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/webp', 0.82));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// --- PASTE HANDLER ---
async function handlePaste(e) {
    // Patient photo paste (when patient dropdown is open and a target is set)
    if (window._patientPhotoTarget) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                e.preventDefault();
                const blob = item.getAsFile();
                const r = new FileReader();
                r.onload = async (event) => {
                    await savePatientPhoto(window._patientPhotoTarget, event.target.result);
                    window._patientPhotoTarget = null;
                };
                r.readAsDataURL(blob);
                return;
            }
        }
    }

    // Editor paste (variant-aware)
    if (!document.getElementById('modal-editor').classList.contains('open')) return;

    // Set cover paste (the cover slot beside the name is the active target)
    if (state._coverPasteActive) {
        const cItems = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const it of cItems) {
            if (it.type.indexOf('image') === 0) {
                e.preventDefault();
                const r = new FileReader();
                r.onload = (ev) => setEditorCover(ev.target.result);
                r.readAsDataURL(it.getAsFile());
                return;
            }
        }
    }

    if (state.activeEditorIndex === null || state.activeEditorIndex === undefined) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const editVariant = state._editingVariant || 0;
    for (const item of items) {
        if (item.type.indexOf('image') === 0) {
            e.preventDefault();
            const blob = item.getAsFile();
            const r = new FileReader();
            r.onload = async (event) => {
                const compressed = await compressDataUrl(event.target.result, getEditingImageQuality());
                setItemVariantUrl(state.editingItems[state.activeEditorIndex], editVariant, compressed);
                renderEditorList();
            };
            r.readAsDataURL(blob);
        }
    }
}

// === SET VARIANT SYSTEM ===
// Helper: get the URL for a specific variant of an item
function getItemVariantUrl(item, variantIndex) {
    if (!variantIndex || variantIndex === 0) return item.url;
    if (item.variantUrls && item.variantUrls[variantIndex]) return item.variantUrls[variantIndex];
    return item.url; // fallback to base
}
window.getItemVariantUrl = getItemVariantUrl;

// Does this item have a picture of its OWN for the variant? Use this — never
// getItemVariantUrl() — whenever the answer drives a count, a badge or a
// "what's missing" decision: getItemVariantUrl() falls back to the base image,
// so it answers "will something be shown", not "is this variant covered".
function hasOwnVariantImage(item, variantIndex) {
    if (!item) return false;
    if (!variantIndex || variantIndex === 0) return !!item.url;
    return !!(item.variantUrls && item.variantUrls[variantIndex]);
}
window.hasOwnVariantImage = hasOwnVariantImage;

// --- Per-variant cut-outs -------------------------------------------------
// Each variant is a DIFFERENT picture, so it needs its OWN cut-out. Base keeps
// item.maskedUrl; variants store theirs in item.variantMaskedUrls[index].
function getItemVariantMasked(item, variantIndex) {
    if (!item) return null;
    if (!variantIndex || variantIndex === 0) return item.maskedUrl || null;
    return (item.variantMaskedUrls && item.variantMaskedUrls[variantIndex]) || null;
}
window.getItemVariantMasked = getItemVariantMasked;

function setItemVariantMasked(item, variantIndex, url) {
    if (!item) return;
    if (!variantIndex || variantIndex === 0) {
        if (url) item.maskedUrl = url; else delete item.maskedUrl;
        return;
    }
    if (url) {
        if (!item.variantMaskedUrls) item.variantMaskedUrls = {};
        item.variantMaskedUrls[variantIndex] = url;
    } else if (item.variantMaskedUrls) {
        delete item.variantMaskedUrls[variantIndex];
        if (Object.keys(item.variantMaskedUrls).length === 0) delete item.variantMaskedUrls;
    }
}
window.setItemVariantMasked = setItemVariantMasked;

// Resolve the image an item shows for a variant, honouring the cut-out
// preference — used by the modes at play time.
function itemVariantDisplayUrl(item, variantIndex) {
    const masked = getItemVariantMasked(item, variantIndex);
    if (masked && typeof getUseScontornoEverywhere === 'function' && getUseScontornoEverywhere()) return masked;
    return getItemVariantUrl(item, variantIndex);
}
window.itemVariantDisplayUrl = itemVariantDisplayUrl;

// Helper: set the URL for a specific variant of an item
function setItemVariantUrl(item, variantIndex, url) {
    if (!variantIndex || variantIndex === 0) {
        item.url = url;
    } else {
        if (!item.variantUrls) item.variantUrls = {};
        item.variantUrls[variantIndex] = url;
    }
}
window.setItemVariantUrl = setItemVariantUrl;

// --- Repair of variant data written by older builds -----------------------
// There was a window (per-variant cut-outs shipped before per-variant pictures)
// in which a picture pasted or generated with a variant open was written to the
// item's BASE url, while its cut-out and its pre-highlight original were already
// filed under the variant. The variant then looks right in the editor — the
// preview falls back to the base picture, and the cut-out really is the new one —
// but it owns no picture, so the modes play the base images.
//
// Those orphans are recognisable, and the picture they were made from is known:
//   variantOriginalUrls[v]  is literally this variant's own picture before the
//                           highlight step, so it can be adopted as-is;
//   variantMaskedUrls[v]    was cut out of whatever item.url held at the time,
//                           which is the picture the editor is showing.
function diagnoseVariantData(items, v) {
    const report = { ok: [], fromOriginal: [], fromBase: [], empty: [] };
    if (!v) return report;
    (items || []).forEach((item, idx) => {
        const entry = { idx, label: item.label || `#${idx + 1}` };
        if (hasOwnVariantImage(item, v)) { report.ok.push(entry); return; }
        if (item.variantOriginalUrls && item.variantOriginalUrls[v]) { report.fromOriginal.push(entry); return; }
        if (item.variantMaskedUrls && item.variantMaskedUrls[v] && item.url) { report.fromBase.push(entry); return; }
        report.empty.push(entry);
    });
    return report;
}
window.diagnoseVariantData = diagnoseVariantData;

window.repairVariantData = async () => {
    const v = state._editingVariant || 0;
    if (!v) return;
    const diag = diagnoseVariantData(state.editingItems, v);
    const n = diag.fromOriginal.length + diag.fromBase.length;
    if (n === 0) return;

    const vName = (state._editingVariantNames || [])[v - 1] || ('Variante ' + v);
    const sample = [...diag.fromOriginal, ...diag.fromBase].slice(0, 6).map(e => e.label).join(', ');
    const msg = `Registrare in "${vName}" l'immagine che stai gia' vedendo, per ${n} item?\n\n`
        + `${sample}${n > 6 ? `, +${n - 6} altri` : ''}\n\n`
        + `Da questo momento le attivita' useranno quell'immagine (e il suo scontorno) invece di ripiegare sulla base. `
        + `Le immagini base non vengono toccate. Nulla e' definitivo finche' non premi Salva.`;
    const ok = (typeof themedConfirm === 'function') ? await themedConfirm(msg) : confirm(msg);
    if (!ok) return;

    diag.fromOriginal.forEach(e => {
        const item = state.editingItems[e.idx];
        setItemVariantUrl(item, v, item.variantOriginalUrls[v]);
    });
    diag.fromBase.forEach(e => {
        const item = state.editingItems[e.idx];
        setItemVariantUrl(item, v, item.url);
    });

    renderVariantEditor();
    renderEditorList();
    if (typeof _showImportToast === 'function') _showImportToast(`${n} item riparati in ${vName} \u2014 premi Salva per confermare`);
    else alert(`${n} item riparati in ${vName} \u2014 premi Salva per confermare.`);
};

// Render variant editor UI in the editor modal
function renderVariantEditor() {
    const container = document.getElementById('edit-variant-container');
    if (!container) return;
    const names = state._editingVariantNames || [];
    const activeVar = state._editingVariant || 0;

    // Variant chips: Base + each named variant
    let html = '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">';

    // Base variant chip
    html += `<span class="tag-chip" style="cursor:pointer; font-size:0.8rem; padding:5px 12px;
        ${activeVar === 0 ? 'background:rgba(99,102,241,0.3); border-color:var(--accent-color); color:var(--text-primary); font-weight:bold;' : ''}"
        onclick="selectEditingVariant(0)">
        <i class="fa-solid fa-image" style="margin-right:4px;"></i>Base
    </span>`;

    names.forEach((name, i) => {
        const vIdx = i + 1;
        const isActive = activeVar === vIdx;
        // Count items that have this variant's image
        const filled = state.editingItems.filter(item => item.variantUrls && item.variantUrls[vIdx]).length;
        const total = state.editingItems.length;
        html += `<span class="tag-chip" style="cursor:pointer; font-size:0.8rem; padding:5px 12px;
            ${isActive ? 'background:rgba(99,102,241,0.3); border-color:var(--accent-color); color:var(--text-primary); font-weight:bold;' : ''}"
            onclick="selectEditingVariant(${vIdx})">
            <i class="fa-solid fa-layer-group" style="margin-right:4px;"></i>${name}
            <span style="opacity:0.5; font-size:0.65rem; margin-left:4px;">${filled}/${total}</span>
            <span onclick="event.stopPropagation(); renameVariant(${i})" style="cursor:pointer; opacity:0.5; margin-left:2px;" title="Rinomina"><i class="fa-solid fa-pen" style="font-size:0.6rem;"></i></span>
            <span onclick="event.stopPropagation(); removeVariant(${i})" style="cursor:pointer; opacity:0.5; margin-left:2px; color:var(--danger-color);" title="Elimina"><i class="fa-solid fa-xmark" style="font-size:0.7rem;"></i></span>
        </span>`;
    });

    // Add variant button
    html += `<button class="btn btn-ghost" onclick="addVariant()" style="padding:4px 10px; font-size:0.75rem; border-radius:8px;">
        <i class="fa-solid fa-plus"></i> Variante
    </button>`;
    html += '</div>';

    // Hint when editing a non-base variant
    if (activeVar > 0) {
        const varName = names[activeVar - 1] || `Variante ${activeVar}`;
        html += `<div style="margin-top:6px; font-size:0.75rem; color:var(--accent-color); background:rgba(99,102,241,0.1); padding:6px 10px; border-radius:8px;">
            <i class="fa-solid fa-info-circle"></i> Stai modificando la variante <b>${varName}</b>. Le immagini caricate andranno in questa variante.
            Le immagini con bordo tratteggiato non hanno ancora un'immagine per questa variante (verr&agrave; usata l'immagine base).
        </div>`;

        const diag = diagnoseVariantData(state.editingItems, activeVar);
        const repairable = diag.fromOriginal.length + diag.fromBase.length;
        if (repairable > 0) {
            html += `<div style="margin-top:6px; font-size:0.75rem; color:var(--warning-color); background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); padding:8px 10px; border-radius:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <span style="flex:1; min-width:220px;">
                    <i class="fa-solid fa-screwdriver-wrench"></i> <b>${repairable}</b> item hanno lo scontorno di questa variante ma nessuna immagine registrata:
                    salvati da una versione precedente, che scriveva l&rsquo;immagine sulla base. In attivit&agrave; mostrano l&rsquo;immagine base.
                </span>
                <button class="btn btn-sm" onclick="repairVariantData()" style="background:var(--warning-color); color:#000; padding:5px 12px; font-size:0.75rem; white-space:nowrap;">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Ripara ${repairable} item
                </button>
            </div>`;
        }
    }

    container.innerHTML = html;
}
window.renderVariantEditor = renderVariantEditor;

window.selectEditingVariant = (idx) => {
    state._editingVariant = idx;
    renderVariantEditor();
    renderEditorList();
};

window.addVariant = async () => {
    const name = await themedPrompt('Nome della variante:', `Variante ${(state._editingVariantNames || []).length + 1}`);
    if (!name) return;
    if (!state._editingVariantNames) state._editingVariantNames = [];
    state._editingVariantNames.push(name.trim());
    // Switch to the new variant for editing
    state._editingVariant = state._editingVariantNames.length;
    renderVariantEditor();
    renderEditorList();
};

window.renameVariant = async (index) => {
    const current = state._editingVariantNames[index];
    const newName = await themedPrompt('Rinomina variante:', current);
    if (newName !== null && newName.trim()) {
        state._editingVariantNames[index] = newName.trim();
        renderVariantEditor();
    }
};

window.removeVariant = async (index) => {
    const name = state._editingVariantNames[index];
    if (!await themedConfirm(`Eliminare la variante "${name}" e tutte le sue immagini?`)) return;
    const vIdx = index + 1;
    // Remove variant images from all items
    state.editingItems.forEach(item => {
        if (item.variantUrls) {
            delete item.variantUrls[vIdx];
            // Re-index higher variants
            const newVarUrls = {};
            for (const [k, v] of Object.entries(item.variantUrls)) {
                const ki = parseInt(k);
                if (ki > vIdx) newVarUrls[ki - 1] = v;
                else if (ki < vIdx) newVarUrls[ki] = v;
            }
            item.variantUrls = Object.keys(newVarUrls).length > 0 ? newVarUrls : undefined;
            if (item.variantUrls && Object.keys(item.variantUrls).length === 0) delete item.variantUrls;
        }
    });
    state._editingVariantNames.splice(index, 1);
    // Reset editing variant if it was the deleted one
    if (state._editingVariant === vIdx) state._editingVariant = 0;
    else if (state._editingVariant > vIdx) state._editingVariant--;
    renderVariantEditor();
    renderEditorList();
};
