// === BACKGROUND REMOVAL (flood-fill from corners) ===
// Removes white/light backgrounds from images, producing transparent PNGs.
// Results are cached on item.maskedUrl and persisted via DB.saveSet().

const _scontornoMemCache = {};

function getScontornoTolerance() {
    return parseInt(localStorage.getItem('scontorno_tolerance')) || 35;
}

function setScontornoTolerance(val) {
    localStorage.setItem('scontorno_tolerance', String(Math.max(5, Math.min(80, parseInt(val) || 35))));
}

function _colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function _sampleCornerColor(data, w, h, cornerSize) {
    const samples = [];
    const regions = [
        [0, 0],
        [w - cornerSize, 0],
        [0, h - cornerSize],
        [w - cornerSize, h - cornerSize]
    ];
    for (const [ox, oy] of regions) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = oy; y < oy + cornerSize && y < h; y++) {
            for (let x = ox; x < ox + cornerSize && x < w; x++) {
                const i = (y * w + x) * 4;
                r += data[i]; g += data[i + 1]; b += data[i + 2];
                count++;
            }
        }
        if (count > 0) samples.push({ r: r / count, g: g / count, b: b / count });
    }
    return samples;
}

function _floodFillTransparent(data, w, h, bgR, bgG, bgB, tolerance) {
    const visited = new Uint8Array(w * h);
    const queue = [];

    const isBackground = (idx) => {
        const i = idx * 4;
        if (data[i + 3] === 0) return false;
        return _colorDistance(data[i], data[i + 1], data[i + 2], bgR, bgG, bgB) <= tolerance;
    };

    // Seed from all 4 edges
    for (let x = 0; x < w; x++) {
        if (isBackground(x)) queue.push(x);
        const bottom = (h - 1) * w + x;
        if (isBackground(bottom)) queue.push(bottom);
    }
    for (let y = 1; y < h - 1; y++) {
        if (isBackground(y * w)) queue.push(y * w);
        const right = y * w + w - 1;
        if (isBackground(right)) queue.push(right);
    }

    queue.forEach(idx => { visited[idx] = 1; });

    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        data[idx * 4 + 3] = 0;

        const x = idx % w;
        const y = (idx - x) / w;
        const neighbors = [];
        if (x > 0) neighbors.push(idx - 1);
        if (x < w - 1) neighbors.push(idx + 1);
        if (y > 0) neighbors.push(idx - w);
        if (y < h - 1) neighbors.push(idx + w);

        for (const n of neighbors) {
            if (!visited[n] && isBackground(n)) {
                visited[n] = 1;
                queue.push(n);
            }
        }
    }
}

function _featherEdges(data, w, h, radius) {
    if (radius < 1) return;
    const copy = new Uint8Array(data.length);
    copy.set(data);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (copy[i + 3] === 0) continue;
            let minDistSq = radius * radius + 1;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    const ni = (ny * w + nx) * 4;
                    if (copy[ni + 3] === 0) {
                        const dSq = dx * dx + dy * dy;
                        if (dSq < minDistSq) minDistSq = dSq;
                    }
                }
            }
            if (minDistSq <= radius * radius) {
                const dist = Math.sqrt(minDistSq);
                const alpha = Math.min(255, Math.round((dist / radius) * copy[i + 3]));
                data[i + 3] = alpha;
            }
        }
    }
}

function removeBackground(imageUrl, tolerance, featherRadius) {
    if (tolerance === undefined) tolerance = getScontornoTolerance();
    if (featherRadius === undefined) featherRadius = 1;

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxDim = 1024;
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;
                if (w > maxDim || h > maxDim) {
                    const scale = maxDim / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                const cornerSize = Math.max(3, Math.round(Math.min(w, h) * 0.03));
                const corners = _sampleCornerColor(data, w, h, cornerSize);

                let maxDist = 0;
                for (let i = 0; i < corners.length; i++) {
                    for (let j = i + 1; j < corners.length; j++) {
                        const d = _colorDistance(corners[i].r, corners[i].g, corners[i].b,
                                                  corners[j].r, corners[j].g, corners[j].b);
                        if (d > maxDist) maxDist = d;
                    }
                }

                if (maxDist > 80) {
                    resolve(null);
                    return;
                }

                const bgR = Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length);
                const bgG = Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length);
                const bgB = Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length);

                _floodFillTransparent(data, w, h, bgR, bgG, bgB, tolerance);
                if (featherRadius > 0) _featherEdges(data, w, h, featherRadius);

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                console.error('removeBackground error:', e);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = imageUrl;
    });
}

// Preview scontorno with a specific tolerance, returns data URL without saving
async function previewScontorno(imageUrl, tolerance) {
    return removeBackground(imageUrl, tolerance);
}

async function getScontornata(item) {
    if (!item || !item.url) return null;
    if (item.maskedUrl) return item.maskedUrl;

    const cacheKey = item.url.substring(0, 120) + '_' + item.url.length;
    if (_scontornoMemCache[cacheKey]) return _scontornoMemCache[cacheKey];

    const result = await removeBackground(item.url);
    if (result) {
        _scontornoMemCache[cacheKey] = result;
    }
    return result;
}

async function getOrCreateMaskedUrl(item) {
    if (item.maskedUrl) return item.maskedUrl;
    return getScontornata(item);
}

async function batchScontorno(items, progressCallback) {
    let done = 0;
    const total = items.length;
    const modifiedSets = new Set();
    const tolerance = getScontornoTolerance();

    for (const item of items) {
        if (item.maskedUrl) { done++; continue; }
        const masked = await removeBackground(item.url, tolerance);
        if (masked) {
            item.maskedUrl = masked;
            for (const set of state.savedSets) {
                const match = set.items.find(si => si.url === item.url && si.label === item.label);
                if (match && !match.maskedUrl) {
                    match.maskedUrl = masked;
                    modifiedSets.add(set.id);
                }
            }
        }
        done++;
        if (progressCallback) progressCallback(done, total);
    }

    for (const setId of modifiedSets) {
        const set = state.savedSets.find(s => s.id === setId);
        if (set) await DB.saveSet(set);
    }

    return done;
}
