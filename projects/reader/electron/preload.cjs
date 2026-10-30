const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('reader',Object.freeze({
  list:()=>ipcRenderer.invoke('reader:list'),
  readPreferences:()=>ipcRenderer.invoke('reader:preferences'),
  updatePreferences:value=>ipcRenderer.invoke('reader:update-preferences',value),
  open:()=>ipcRenderer.invoke('reader:import'),
  read:id=>ipcRenderer.invoke('reader:read',id),
  progress:(id,position)=>ipcRenderer.invoke('reader:progress',id,position),
  remove:id=>ipcRenderer.invoke('reader:remove',id)
}));
