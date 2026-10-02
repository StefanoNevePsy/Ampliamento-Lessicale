const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, 'www');

// www/ si rigenera da zero: niente file vecchi che restano nel sito
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest);

const itemsToCopy = ['index.html', 'privacy.html', 'tice-config.js', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'build', 'img', 'models', 'vendor', 'strumenti'];

function copyRecursiveSync(src, destPath) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath);
        }
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), Math.join(destPath, childItemName));
            // wait math is wrong, should be path.join
        });
    } else if (exists) {
        fs.copyFileSync(src, destPath);
    }
}

// Correct fix for path.join:
function copySafeRecursiveSync(src, destPath) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
        fs.readdirSync(src).forEach(childItemName => {
            copySafeRecursiveSync(path.join(src, childItemName), path.join(destPath, childItemName));
        });
    } else if (exists) {
        fs.copyFileSync(src, destPath);
    }
}

itemsToCopy.forEach(item => {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(dest, item);
    copySafeRecursiveSync(srcPath, destPath);
});

// Service worker: versione di questa pubblicazione ed elenco dei file da
// scaricare al primo avvio, così l'app si apre anche senza rete.
(function scriviServiceWorker() {
    const sw = path.join(dest, 'sw.js');
    if (!fs.existsSync(sw)) return;
    const file = [];
    (function giro(dir, rel) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.name.startsWith('.') || r === 'sw.js' || r === 'models' || r.endsWith('.md')) return;
            if (e.isDirectory()) giro(path.join(dir, e.name), r); else file.push('./' + r);
        });
    })(dest, '');
    file.push('./');
    let commit = '';
    try { commit = require('child_process').execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { /* senza git */ }
    const versione = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + (commit ? '-' + commit : '');
    const testo = fs.readFileSync(sw, 'utf8')
        .replace("'__VERSIONE__'", JSON.stringify(versione))
        .replace('/*__FILE__*/[]', JSON.stringify(file));
    fs.writeFileSync(sw, testo);
    console.log(`Service worker: versione ${versione}, ${file.length} file per l'uso offline.`);
})();

// Content Security Policy, solo per il sito su GitHub Pages (TICE_CSP=1 nel
// workflow): l'app desktop carica index.html dal disco e quella Android ha il
// suo contenitore, e lì la regola non serve né va rischiata.
// L'app base usa gestori inline (onclick=...) in tutta l'interfaccia, quindi
// gli script inline restano permessi; la regola limita invece DA DOVE si
// carica codice e VERSO CHI si possono mandare dati: solo i servizi che l'app
// usa davvero (custode, Google, AI e immagini scelti nelle impostazioni).
(function scriviCsp() {
    if (!process.env.TICE_CSP) return;
    let custode = '';
    try {
        const t = fs.readFileSync(path.join(dest, 'tice-config.js'), 'utf8');
        const m = /custodeUrl:\s*'([^']+)'/.exec(t);
        if (m) custode = new URL(m[1]).origin;
    } catch (e) { /* senza custode */ }
    const regole = [
        "default-src 'self'",
        // gstatic: Firebase (sync storico); unpkg: PeerJS; jsdelivr: modelli AI nel browser
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://www.gstatic.com https://unpkg.com https://cdn.jsdelivr.net https://accounts.google.com/gsi/client https://*.firebaseio.com https://*.firebasedatabase.app",
        "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        // immagini dai motori di ricerca scelti (Openverse restituisce indirizzi di tanti siti)
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' data: blob:" + (custode ? ' ' + custode : '') +
            " https://script.google.com https://script.googleusercontent.com https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com" +
            " https://generativelanguage.googleapis.com https://*.nvidia.com" +
            " https://pixabay.com https://api.openverse.org https://api.arasaac.org https://static.arasaac.org" +
            " https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net" +
            " https://*.workers.dev https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app" +
            " https://*.peerjs.com wss://*.peerjs.com http://localhost:* http://127.0.0.1:*",
        'frame-src https://accounts.google.com https://*.firebaseio.com',
        "worker-src 'self' blob: https://cdn.jsdelivr.net",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ];
    const meta = `<meta http-equiv="Content-Security-Policy" content="${regole.join('; ')}">`;
    for (const f of ['index.html', 'privacy.html']) {
        const p = path.join(dest, f);
        if (!fs.existsSync(p)) continue;
        const html = fs.readFileSync(p, 'utf8');
        const regola = f === 'index.html' ? meta : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">`;
        fs.writeFileSync(p, html.replace(/<meta charset="[^"]*"\s*\/?>/i, (m) => m + '\n    ' + regola));
    }
    console.log('Content Security Policy inserita (sito pubblicato).');
})();

console.log('Build complete: Files copied to www/ directory.');
