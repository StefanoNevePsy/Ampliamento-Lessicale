// === SET EDITOR ===

window.editSet = async (id) => {
    const set = state.savedSets.find(s => s.id === id);
    state.editingSetId = id;
    state.editingItems = JSON.parse(JSON.stringify(set.items));
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

    const listHtml = state.editingItems.map((item, idx) => {
        const isSelected = state.activeEditorIndex === idx;
        const activeStyle = isSelected ? 'border:1px solid var(--accent-color); background:rgba(99, 102, 241, 0.1);' : 'border:1px solid transparent;';
        const opacityStyle = item.hidden ? 'opacity: 0.6;' : 'opacity: 1;';

        const hasAudio = item.audio ? '<i class="fa-solid fa-volume-high" style="color:var(--success-color); font-size:0.6rem;"></i>' : '';
        const hasZoom = item.zoomArea ? '<i class="fa-solid fa-crop" style="color:var(--warning-color); font-size:0.6rem;"></i>' : '';
        const hasSeq = item.seqNumber ? `<i class="fa-solid fa-arrow-down-1-9" style="color:var(--accent-color); font-size:0.6rem;" title="Seq: ${item.seqNumber}"></i>` : '';

        return `
        <div class="editor-item" style="${activeStyle} ${opacityStyle} transition:0.2s; cursor:pointer;" onclick="setActiveItem(${idx})">
            <div class="editor-thumb" style="cursor:pointer; position:relative;" onclick="triggerItemUpload(${idx}); event.stopPropagation();" title="Clicca per caricare">
                <img src="${item.url || getPlaceholderUrl(item.label)}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;">
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
    let input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    input.onchange = (e) => {
        if (e.target.files[0]) {
            const r = new FileReader();
            r.onload = async (ev) => {
                state.editingItems[index].url = await compressDataUrl(ev.target.result, getEditingImageQuality());
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

    files.forEach(file => {
        const r = new FileReader();
        r.onload = async (ev) => {
            const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            const url = await compressDataUrl(ev.target.result, preset);
            state.editingItems.push({ label: name, url, hidden: false });
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

    // Editor paste
    if (!document.getElementById('modal-editor').classList.contains('open')) return;
    if (state.activeEditorIndex === null || state.activeEditorIndex === undefined) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') === 0) {
            e.preventDefault();
            const blob = item.getAsFile();
            const r = new FileReader();
            r.onload = async (event) => {
                state.editingItems[state.activeEditorIndex].url = await compressDataUrl(event.target.result, getEditingImageQuality());
                renderEditorList();
            };
            r.readAsDataURL(blob);
        }
    }
}
