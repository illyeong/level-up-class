const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('levelupWidget', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
  onGoogleAuthResult: (cb) => ipcRenderer.on('google-auth-result', (_e, data) => cb(data)),
});
