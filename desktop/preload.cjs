'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('seaton:'+name,...args);
const subscribe=(name,callback)=>{
  if(typeof callback!=='function')throw new TypeError('callback must be a function');
  const listener=(_event,payload)=>callback(payload);
  ipcRenderer.on('seaton:'+name,listener);
  return ()=>ipcRenderer.removeListener('seaton:'+name,listener);
};
const api={
  getInitial:()=>invoke('getInitial'),
  unlock:value=>invoke('unlock',value),lock:()=>invoke('lock'),
  saveState:state=>invoke('saveState',state),getPrepared:()=>invoke('getPrepared'),
  savePrepared:value=>invoke('savePrepared',value),clearPrepared:()=>invoke('clearPrepared'),
  choosePrepared:state=>invoke('choosePrepared',state),
  saveFile:state=>invoke('saveFile',state),openFile:()=>invoke('openFile'),
  exportPDF:options=>invoke('exportPDF',options),print:options=>invoke('print',options),exportPNG:options=>invoke('exportPNG',options),
  openDisplay:state=>invoke('openDisplay',state),publishDisplay:state=>invoke('publishDisplay',state),
  setPresentation:active=>invoke('setPresentation',active),toggleFullscreen:()=>invoke('toggleFullscreen'),
  closeReady:result=>invoke('closeReady',result),onBeforeClose:callback=>subscribe('beforeClose',callback),
  getUpdateState:()=>invoke('getUpdateState'),checkUpdate:()=>invoke('checkUpdate'),installUpdate:()=>invoke('installUpdate'),
  onUpdate:callback=>subscribe('update',callback),onDisplay:callback=>subscribe('display',callback)
};
contextBridge.exposeInMainWorld('seaton',Object.freeze(api));
