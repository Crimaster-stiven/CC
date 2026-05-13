const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  hide: () => ipcRenderer.send('window-hide'),
  close: () => ipcRenderer.send('window-close'),
  setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
  sendNotification: (data) => ipcRenderer.send('send-notification', data),
  getVersion: () => ipcRenderer.invoke('get-version')
})
