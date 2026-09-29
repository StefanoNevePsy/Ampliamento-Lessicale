const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const rmbg = require('./rmbg');
const { creaAccesso } = require('./accesso-google');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'Centro TICE',
        icon: path.join(__dirname, '..', 'img', 'tice', 'icona-512.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile(path.join(__dirname, '..', 'index.html'));

    // Remove menu bar for cleaner look
    win.setMenuBarVisibility(false);
}

// --- Scontorno locale (vedi electron/rmbg.js) ---
ipcMain.handle('rmbg:start', (_e, modelPath) => rmbg.start(modelPath));
ipcMain.handle('rmbg:status', () => rmbg.status());
ipcMain.handle('rmbg:pick-folder', async () => {
    const r = await dialog.showOpenDialog({
        title: 'Cartella del modello RMBG',
        properties: ['openDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
});

// --- Accesso con Google dal browser di sistema (vedi electron/accesso-google.js) ---
// Il refresh token si conserva cifrato dal sistema operativo (Portachiavi su
// Mac, DPAPI su Windows). Dove la cifratura non c'è, non si conserva: si
// rientra a ogni avvio dell'app.
const fileAccesso = () => path.join(app.getPath('userData'), 'tice-accesso.bin');
const accesso = creaAccesso({
    apri: (url) => shell.openExternal(url),
    leggi: async () => {
        try {
            if (!safeStorage.isEncryptionAvailable()) return null;
            return JSON.parse(safeStorage.decryptString(fs.readFileSync(fileAccesso())));
        } catch (e) { return null; }
    },
    scrivi: async (o) => {
        if (!safeStorage.isEncryptionAvailable()) return;
        fs.writeFileSync(fileAccesso(), safeStorage.encryptString(JSON.stringify(o)));
    },
    cancella: async () => { try { fs.unlinkSync(fileAccesso()); } catch (e) { /* già tolto */ } },
});
function configAccesso(cfg) {
    if (!cfg || typeof cfg.clientId !== 'string' || cfg.clientId.length > 200) throw new Error('Configurazione di accesso non valida');
    return { clientId: cfg.clientId, clientSecret: typeof cfg.clientSecret === 'string' ? cfg.clientSecret.slice(0, 200) : '' };
}
ipcMain.handle('tice:accedi', async (e, cfg) => {
    const r = await accesso.accedi(configAccesso(cfg));
    // si torna all'app dopo l'accesso nel browser
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
    return r;
});
ipcMain.handle('tice:token', (_e, cfg) => accesso.token(configAccesso(cfg)));
ipcMain.handle('tice:utente', () => accesso.utente());
ipcMain.handle('tice:esci', () => accesso.esci());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Non lasciare un processo Python (e la VRAM) appesi dopo la chiusura.
app.on('before-quit', () => rmbg.stop());

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
