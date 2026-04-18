// === SET EDITOR ===

window.editSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    state.editingSetId = id;
    state.editingItems = JSON.parse(JSON.stringify(set.items));
    state._editingVariantNames = set.variantNames ? [...set.variantNames] : [];
    state._editingVariant = 0; // Always start editing the base variant
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
                style="border:none; background:transparent; color:white; padding:4px; font-size:0.85rem; flex:1; min-width:100px;">
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
            // Save variant names (only if variants exist)
            if (state._editingVariantNames && state._editingVariantNames.length > 0) {
                s.variantNames = [...state._editingVariantNames];
            } else {
                delete s.variantNames;
            }
            DB.saveSet(s).then(() => {
                reloadLibrary();
                document.getElementById('modal-editor').classList.remove('open');
                document.getElementById('modal-library').classList.add('open');
            });
        }
    });
};

// --- RENDER EDITOR LIST ---
function renderEditorList() {
    const container = document.getElementById('editor-list');
    if (!container) return;

    const totalItems = state.editingItems.length;
    const activeItems = state.editingItems.filter(i => !i.hidden).length;

    const counterHtml = `
        <div style="position:sticky; top:0; z-index:10; background:#1e1e2f; padding:10px; margin-bottom:10px; border-bottom:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; color:#ccc; font-size:0.9rem;">
            <span><i class="fa-solid fa-list-ol"></i> Item Attivi: <b style="color:${activeItems >= 20 ? 'var(--success-color)' : 'var(--warning-color)'}">${activeItems}</b> / ${totalItems}</span>
            <span style="font-size:0.8rem; opacity:0.7;">(Target RAN: ~20)</span>
        </div>
    `;

    const editVariant = state._editingVariant || 0;
    const listHtml = state.editingItems.map((item, idx) => {
        const isSelected = state.activeEditorIndex === idx;
        const activeStyle = isSelected ? 'border:1px solid var(--accent-color); background:rgba(99, 102, 241, 0.1);' : 'border:1px solid transparent;';
        const opacityStyle = item.hidden ? 'opacity: 0.6;' : 'opacity: 1;';

        const hasAudio = item.audio ? '<i class="fa-solid fa-volume-high" style="color:var(--success-color); font-size:0.6rem;"></i>' : '';
        const hasZoom = item.zoomArea ? '<i class="fa-solid fa-crop" style="color:var(--warning-color); font-size:0.6rem;"></i>' : '';
        const hasSeq = item.seqNumber ? `<i class="fa-solid fa-arrow-down-1-9" style="color:var(--accent-color); font-size:0.6rem;" title="Seq: ${item.seqNumber}"></i>` : '';

        // Resolve display URL based on active editing variant
        const displayUrl = getItemVariantUrl(item, editVariant);
        const hasVariantImg = editVariant > 0 && item.variantUrls && item.variantUrls[editVariant];

        return `
        <div class="editor-item" style="${activeStyle} ${opacityStyle} transition:0.2s; cursor:pointer;" onclick="setActiveItem(${idx})">
            <div class="editor-thumb" style="cursor:pointer; position:relative;${editVariant > 0 && !hasVariantImg ? ' outline:2px dashed var(--warning-color); outline-offset:-2px;' : ''}" onclick="triggerItemUpload(${idx}); event.stopPropagation();" title="Clicca per caricare">
                <img src="${displayUrl || getPlaceholderUrl(item.label)}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;">
                <div style="position:absolute; inset:0; background:rgba(0,0,0,0.3); display:flex; justify-content:center; align-items:center; opacity:0;">
                    <i class="fa-solid fa-camera" style="color:white;"></i>
                </div>
            </div>
            <div style="flex:1">
                <input type="text" value="${item.label}"
                    onchange="state.editingItems[${idx}].label=this.value"
                    onfocus="setActiveItem(${idx})"
                    onclick="event.stopPropagation()"
                    placeholder="Etichetta"
                    style="${item.hidden ? 'text-decoration:line-through; color:#888;' : ''}">
                <div style="display:flex; gap:2px; margin-top:2px;">${hasAudio}${hasZoom}${hasSeq}</div>
            </div>
            <input type="number" value="${item.seqNumber || ''}" min="1"
                onchange="state.editingItems[${idx}].seqNumber=this.value?parseInt(this.value):null; renderEditorList();"
                onclick="event.stopPropagation();"
                placeholder="#"
                title="N. Sequenza"
                style="width:38px; padding:4px; border-radius:6px; background:${item.seqNumber ? 'rgba(99,102,241,0.2)' : 'rgba(0,0,0,0.2)'}; border:1px solid ${item.seqNumber ? 'var(--accent-color)' : 'var(--glass-border)'}; color:${item.seqNumber ? 'var(--accent-color)' : '#888'}; font-size:0.8rem; text-align:center; font-weight:bold;">
            <button class="btn btn-ghost" style="padding:6px;" onclick="openPollinationsGenerator(${idx}); event.stopPropagation();" title="Genera immagine AI (Pollinations)">
                <i class="fa-solid fa-wand-magic-sparkles" style="font-size:0.8rem; ${item.url ? 'opacity:0.4' : 'color:var(--accent-color); opacity:0.8'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="triggerAudioUpload(${idx}); event.stopPropagation();" title="Carica Audio">
                <i class="fa-solid fa-music" style="font-size:0.8rem; ${item.audio ? 'color:var(--success-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="openZoomEditor(${idx}); event.stopPropagation();" title="Imposta Area Zoom">
                <i class="fa-solid fa-crop" style="font-size:0.8rem; ${item.zoomArea ? 'color:var(--warning-color)' : 'opacity:0.4'}"></i>
            </button>
            <button class="btn btn-ghost" style="padding:6px;" onclick="toggleItemVisibility(${idx}); event.stopPropagation();" title="${item.hidden ? 'Mostra' : 'Nascondi'}">
                <i class="fa-solid ${item.hidden ? 'fa-eye-slash' : 'fa-eye'}" style="${item.hidden ? 'color:#888' : 'color:var(--success-color)'}"></i>
            </button>
            <button class="btn btn-danger" style="padding:6px;" onclick="state.editingItems.splice(${idx},1); renderEditorList(); event.stopPropagation();">
                <i class="fa-solid fa-minus"></i>
            </button>
        </div>`;
    }).join('');

    container.innerHTML = counterHtml + listHtml;
}

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
        <div style="color:white; margin-bottom:15px; text-align:center;">
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
        ${activeVar === 0 ? 'background:rgba(99,102,241,0.3); border-color:var(--accent-color); color:white; font-weight:bold;' : ''}"
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
            ${isActive ? 'background:rgba(99,102,241,0.3); border-color:var(--accent-color); color:white; font-weight:bold;' : ''}"
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
