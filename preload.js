const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadProgress: () => ipcRenderer.invoke('data:loadProgress'),
  saveProgress: (data) => ipcRenderer.invoke('data:saveProgress', data),
  loadHistory: () => ipcRenderer.invoke('data:loadHistory'),
  appendHistory: (record) => ipcRenderer.invoke('data:appendHistory', record),
  clearHistory: () => ipcRenderer.invoke('data:clearHistory'),
  loadCustomMaterials: () => ipcRenderer.invoke('data:loadCustomMaterials'),
  saveCustomMaterials: (data) => ipcRenderer.invoke('data:saveCustomMaterials', data),
  importTextFile: () => ipcRenderer.invoke('data:importTextFile'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openReleases: () => ipcRenderer.invoke('app:openReleases'),
  smokeReady: () => ipcRenderer.send('smoke:ready')
});
