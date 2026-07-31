const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const rmbg = require('./rmbg');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'Terapia Attiva',
        icon: path.join(__dirname, '..', 'build', 'icon.png'),
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Non lasciare un processo Python (e la VRAM) appesi dopo la chiusura.
app.on('before-quit', () => rmbg.stop());

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
