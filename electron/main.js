const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'Terapia Attiva',
        icon: path.join(__dirname, '..', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadFile(path.join(__dirname, '..', 'index.html'));

    // Remove menu bar for cleaner look
    win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
