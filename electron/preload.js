// Ponte minimo verso il processo principale: solo lo scontorno locale, niente
// accesso generico al filesystem o a Node dal lato pagina.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopRmbg', {
    // Avvia (o riusa) lo scontorno locale. modelPath = la cartella del modello
    // sul PC, es. F:\Stable Diffusion\RMBG-2.0
    start: (modelPath) => ipcRenderer.invoke('rmbg:start', modelPath),
    status: () => ipcRenderer.invoke('rmbg:status'),
    pickFolder: () => ipcRenderer.invoke('rmbg:pick-folder'),
});
