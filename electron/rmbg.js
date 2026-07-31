// Avvio automatico dello scontorno locale sul desktop.
//
// Sul PC il modello che l'utente ha gia' scaricato e' un repo PyTorch
// (safetensors + codice Python caricato con trust_remote_code): il motore web
// dell'app parla ONNX e non puo' leggerlo. Invece di chiedere una conversione,
// il processo desktop avvia da solo tools/rmbg_server.py, che quella cartella
// la legge nativamente e gira sulla GPU CUDA.
//
// Resta tutto su 127.0.0.1: nessun dato lascia il computer.

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = Number(process.env.RMBG_PORT || 7865);
const URL = `http://127.0.0.1:${PORT}`;

let child = null;
let lastError = '';

function serverScript() {
    // In sviluppo sta accanto al repo; nel pacchetto finisce in resources/.
    const candidates = [
        path.join(__dirname, '..', 'tools', 'rmbg_server.py'),
        path.join(process.resourcesPath || '', 'tools', 'rmbg_server.py'),
    ];
    return candidates.find(p => p && fs.existsSync(p)) || '';
}

// Il primo Python che risponde. Su Windows "py" c'e' quasi sempre, "python"
// puo' essere lo stub del Microsoft Store che apre il negozio invece di partire.
function findPython() {
    const tries = process.platform === 'win32'
        ? [['py', ['-3']], ['python', []], ['python3', []]]
        : [['python3', []], ['python', []]];
    for (const [cmd, pre] of tries) {
        try {
            const r = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.version_info[0])'],
                { encoding: 'utf8', timeout: 8000 });
            if (r.status === 0 && String(r.stdout).trim().startsWith('3')) return { cmd, pre };
        } catch (e) { /* prova il prossimo */ }
    }
    return null;
}

function ping(timeoutMs = 1500) {
    return new Promise(resolve => {
        const req = http.get(URL + '/health', { timeout: timeoutMs }, res => {
            let b = '';
            res.on('data', d => b += d);
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

async function start(modelPath) {
    lastError = '';

    // Gia' in piedi? Puo' essere una nostra istanza o una avviata a mano: va bene.
    const already = await ping();
    if (already) return { ok: true, url: URL, external: !child, info: already };

    const script = serverScript();
    if (!script) { lastError = 'tools/rmbg_server.py non trovato nel pacchetto.'; return { ok: false, error: lastError }; }
    if (modelPath && !fs.existsSync(modelPath)) {
        lastError = `La cartella del modello non esiste: ${modelPath}`;
        return { ok: false, error: lastError };
    }

    const py = findPython();
    if (!py) {
        lastError = 'Python 3 non trovato sul PC. Installalo da python.org, poi: pip install flask flask-cors torch torchvision transformers pillow';
        return { ok: false, error: lastError };
    }

    const env = { ...process.env, RMBG_PORT: String(PORT) };
    if (modelPath) env.RMBG_MODEL = modelPath;

    child = spawn(py.cmd, [...py.pre, script], { env, windowsHide: true });
    child.stdout.on('data', d => process.stdout.write('[rmbg] ' + d));
    child.stderr.on('data', d => {
        const s = String(d);
        process.stderr.write('[rmbg] ' + s);
        // Le dipendenze mancanti sono l'inciampo tipico: riportale all'utente.
        if (/ModuleNotFoundError|No module named/.test(s)) {
            lastError = 'Manca una libreria Python. Esegui: pip install flask flask-cors torch torchvision transformers pillow';
        }
    });
    child.on('exit', code => { if (code) lastError = lastError || `Il processo e' uscito con codice ${code}.`; child = null; });

    // Il primo avvio carica torch: puo' volerci qualche decina di secondi.
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!child && lastError) return { ok: false, error: lastError };
        const info = await ping();
        if (info) return { ok: true, url: URL, external: false, info };
    }
    lastError = lastError || 'Il server non ha risposto entro 60 secondi.';
    return { ok: false, error: lastError };
}

async function status() {
    const info = await ping();
    return { running: !!info, url: URL, spawned: !!child, info, error: lastError };
}

function stop() {
    if (!child) return;
    try { child.kill(); } catch (e) { /* in chiusura non importa */ }
    child = null;
}

module.exports = { start, stop, status, URL };
