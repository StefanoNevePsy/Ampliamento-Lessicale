// Ponte minimo verso il processo principale: scontorno locale e accesso con
// Google dal browser di sistema. Niente accesso generico al filesystem o a
// Node dal lato pagina.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopRmbg', {
    // Avvia (o riusa) lo scontorno locale. modelPath = la cartella del modello
    // sul PC, es. F:\Stable Diffusion\RMBG-2.0
    start: (modelPath) => ipcRenderer.invoke('rmbg:start', modelPath),
    status: () => ipcRenderer.invoke('rmbg:status'),
    pickFolder: () => ipcRenderer.invoke('rmbg:pick-folder'),
});

// Accesso con Google per l'edizione Centro TICE (electron/accesso-google.js).
// La pagina riceve solo l'ID token (chi sei), mai il refresh token.
contextBridge.exposeInMainWorld('ticeNativo', {
    accedi: (cfg) => ipcRenderer.invoke('tice:accedi', cfg),
    token: (cfg) => ipcRenderer.invoke('tice:token', cfg),
    utente: () => ipcRenderer.invoke('tice:utente'),
    esci: () => ipcRenderer.invoke('tice:esci'),
});
