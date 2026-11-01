const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nexusDesktop', {
  getRuntimeURL:()=>ipcRenderer.invoke('desktop:get-runtime'),
  openDsh:()=>ipcRenderer.invoke('desktop:open-dsh'),
  openBrowserPlugin:()=>ipcRenderer.invoke('desktop:open-browser-plugin'),
  webchat:(operation,data)=>ipcRenderer.invoke('webchat:command',operation,data),
  browserBounds:rect=>ipcRenderer.send('webchat:bounds',rect),
  onWebchat:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('webchat:event',handler);return()=>ipcRenderer.removeListener('webchat:event',handler)},
  ready: () => ipcRenderer.send('desktop:renderer-ready'),
  copyText: text => ipcRenderer.invoke('desktop:copy-text', text),
  selectWorkspacePath: () => ipcRenderer.invoke('desktop:select-workspace'),
  selectAttachments: () => ipcRenderer.invoke('desktop:select-attachments'),
  getWorkspacePath: () => ipcRenderer.invoke('desktop:get-workspace'),
  saveArchive: (bytes, name) => ipcRenderer.invoke('desktop:save-archive', bytes, name),
  selectExtensionPath: (directory = false) => ipcRenderer.invoke('desktop:select-extension', directory === true),
  setTheme: theme => {
    if (theme === 'dark' || theme === 'light') ipcRenderer.send('desktop:theme', theme);
  },
});
