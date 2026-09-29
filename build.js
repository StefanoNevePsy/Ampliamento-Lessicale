const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, 'www');

// www/ si rigenera da zero: niente file vecchi che restano nel sito
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest);

const itemsToCopy = ['index.html', 'tice-config.js', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'build', 'img', 'models', 'vendor', 'strumenti'];

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

console.log('Build complete: Files copied to www/ directory.');
