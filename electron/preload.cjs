// Bridge for the game page (see src/display.ts `desktop`).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  hide: () => ipcRenderer.send('hide'),
  onMode: (cb) => ipcRenderer.on('mode', (_e, mode) => cb(mode)),
});
