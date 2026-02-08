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

    // Tag editor
    renderTagEditor(set.tags || []);

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
    editingTags = [...(tags || [])];
    const container = document.getElementById('edit-tags-container');
    if (!container) return;

    const chipsHtml = editingTags.map((tag, i) =>
        `<span class="tag-chip">
            ${tag}
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
            s.items = state.editingItems;
            s.modes = modes;
            s.tags = [...editingTags]; // Save semantic tags
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
                    placeholder="Etichetta"
                    style="${item.hidden ? 'text-decoration:line-through; color:#888;' : ''}">
            </div>
            <button class="btn btn-ghost" style="padding:10px;" onclick="toggleItemVisibility(${idx}); event.stopPropagation();" title="${item.hidden ? 'Mostra' : 'Nascondi'}">
                <i class="fa-solid ${item.hidden ? 'fa-eye-slash' : 'fa-eye'}" style="${item.hidden ? 'color:#888' : 'color:var(--success-color)'}"></i>
            </button>
            <button class="btn btn-danger" style="padding:10px;" onclick="state.editingItems.splice(${idx},1); renderEditorList(); event.stopPropagation();">
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
            r.onload = (ev) => { state.editingItems[index].url = ev.target.result; renderEditorList(); };
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

    files.forEach(file => {
        const r = new FileReader();
        r.onload = (ev) => {
            const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            state.editingItems.push({ label: name, url: ev.target.result, hidden: false });
            renderEditorList();
        };
        r.readAsDataURL(file);
    });

    input.value = '';
};

// --- PASTE HANDLER ---
async function handlePaste(e) {
    if (!document.getElementById('modal-editor').classList.contains('open')) return;
    if (state.activeEditorIndex === null || state.activeEditorIndex === undefined) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') === 0) {
            e.preventDefault();
            const blob = item.getAsFile();
            const r = new FileReader();
            r.onload = (event) => {
                state.editingItems[state.activeEditorIndex].url = event.target.result;
                renderEditorList();
            };
            r.readAsDataURL(blob);
        }
    }
}
