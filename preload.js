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
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateState: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  smokeReady: () => ipcRenderer.send('smoke:ready')
});
