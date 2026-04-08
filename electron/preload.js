const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (event, status) => callback(status)),
  isElectron: true,
});
