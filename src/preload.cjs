'use strict';
const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('hachi',Object.freeze({
  ready:()=>ipcRenderer.invoke('hachi:ready'),
  moveBegin:()=>ipcRenderer.send('hachi:move-begin'),
  moveTick:()=>ipcRenderer.send('hachi:move-tick'),
  moveEnd:()=>ipcRenderer.send('hachi:move-end'),
  setClickThrough:(enabled)=>ipcRenderer.send('hachi:click-through',!!enabled),
  showMenu:()=>ipcRenderer.send('hachi:show-menu'),
  onState:(callback)=>ipcRenderer.on('hachi:state',(_e,data)=>callback(data)),
  onCursor:(callback)=>ipcRenderer.on('hachi:cursor',(_e,point)=>callback(point)),
  onSettings:(callback)=>ipcRenderer.on('hachi:settings',(_e,settings)=>callback(settings))
}));
