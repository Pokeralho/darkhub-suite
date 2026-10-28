// Screen color picker page: receives one screenshot of its monitor and sends back the chosen color.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('picker', {
  onImage: (cb) => ipcRenderer.on('picker:image', (_e, data) => cb(data)),
  done: (payload) => ipcRenderer.send('picker:result', payload)
})
