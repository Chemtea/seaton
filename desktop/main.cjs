'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {SeatingStore,atomicWrite}=require('./storage.cjs');
const {validateState,publicState,MAX_BYTES}=require('./validation.cjs');
const printing=require('./print.cjs');
const CONTROL_ONLY=new Set(['unlock','lock','saveState','getPrepared','savePrepared','clearPrepared','choosePrepared','saveFile','openFile','exportPDF','print','exportPNG','openDisplay','publishDisplay','setPresentation','getUpdateState','checkUpdate','installUpdate','toggleFullscreen','closeReady']);
function ensureRole(role,action){if(action==='getInitial'&&['control','display'].includes(role))return;if(role!=='control'||!CONTROL_ONLY.has(action))throw new Error('이 창에서는 사용할 수 없는 기능입니다.');}
function configurationKey(state){const value=validateState(state);value.seats=value.seats.map(s=>({...s,studentId:null}));return JSON.stringify(value);}
async function start(){
  const {app,BrowserWindow,ipcMain,dialog,Menu,session,screen}=require('electron');
  if(!app.requestSingleInstanceLock()){app.quit();return;}
  app.setName('자리온');
  app.setAppUserModelId('kr.seaton.classroom');
  await app.whenReady();
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  let store;
  try{store=await new SeatingStore(app.getPath('userData')).init();}
  catch(error){dialog.showErrorBox('자리온 · 자료 복구 필요',error.message+'\n자료 위치: '+app.getPath('userData'));app.quit();return;}
  const roles=new Map(),entry=path.join(__dirname,'..','app','index.html'),entryURL=pathToFileURL(entry).href;
  let control=null,display=null,presentation=false,lastDisplay=store.state?publicState(store.state):null,authEpoch=0,closing=false,closeRequested=false,closeTimer=null;
  const {createUpdater}=require('./updater.cjs');
  const sendUpdate=value=>{if(value.status==='installing')closing=true;if(control&&!control.isDestroyed())control.webContents.send('seaton:update',value);};
  const updater=createUpdater({app,send:sendUpdate,isBusy:()=>presentation||closeRequested,beforeInstall:async()=>{await requestRendererFlush();await store.flush();}});
  function makeWindow(role){
    const primary=screen.getPrimaryDisplay(),second=screen.getAllDisplays().find(d=>d.id!==primary.id);
    const options={width:1320,height:900,minWidth:900,minHeight:650,show:false,title:'자리온',backgroundColor:'#f5f7fb',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:!app.isPackaged}};
    if(role==='display'&&second){options.x=second.workArea.x;options.y=second.workArea.y;options.width=second.workArea.width;options.height=second.workArea.height;}
    const win=new BrowserWindow(options),contentsId=win.webContents.id;roles.set(contentsId,role);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('before-input-event',(event,input)=>{
      if(app.isPackaged&&(input.key==='F12'||((input.control||input.meta)&&input.shift&&['i','j','c'].includes(input.key.toLowerCase()))))event.preventDefault();
    });
    win.once('ready-to-show',()=>win.show());
    win.on('closed',()=>{roles.delete(contentsId);if(role==='display')display=null;});
    win.loadFile(entry,{query:{role}}).catch(error=>{dialog.showErrorBox('자리온',error.message);});
    return win;
  }
  let flushResolve=null,flushReject=null;
  function requestRendererFlush(){
    if(!control||control.isDestroyed())return store.flush();
    if(flushResolve)return Promise.reject(new Error('저장 작업을 기다려 주세요.'));
    return new Promise((resolve,reject)=>{
      flushResolve=resolve;flushReject=reject;
      closeTimer=setTimeout(()=>{flushResolve=null;flushReject=null;closeTimer=null;reject(new Error('마지막 변경 내용을 확인하지 못했습니다. 창을 다시 닫아 주세요.'));},10000);
      control.webContents.send('seaton:beforeClose',{});
    });
  }
  function senderRole(event){
    if(!event.senderFrame||event.senderFrame!==event.sender.mainFrame)throw new Error('허용되지 않는 요청입니다.');
    const url=event.senderFrame.url.split('?')[0].split('#')[0];
    if(url!==entryURL)throw new Error('허용되지 않는 화면입니다.');
    return roles.get(event.sender.id);
  }
  function teacher(){store.requireUnlocked();if(presentation)throw new Error('자리 발표가 끝난 뒤 실행해 주세요.');}
  const handlers={
    getInitial:async(_args,role)=>({state:role==='display'?lastDisplay:store.state,pinExists:role==='control'&&store.pinExists,version:app.getVersion(),role,notice:role==='control'?store.recoveryNotice:''}),
    unlock:async value=>{if(presentation)throw new Error('자리 발표가 끝난 뒤 실행해 주세요.');const epoch=++authEpoch;const prepared=await store.unlock(value);if(epoch!==authEpoch){store.lock();throw new Error('설정 잠금이 유지됩니다. 다시 입력해 주세요.');}return {ok:true,prepared,pinExists:store.pinExists};},
    lock:async()=>{authEpoch++;store.lock();return {ok:true};},
    saveState:async state=>{const checked=validateState(state);if(!store.unlocked&&store.state&&configurationKey(checked)!==configurationKey(store.state))throw new Error('배치 설정을 저장하려면 잠금을 먼저 해제해 주세요.');await store.saveState(checked);return {ok:true};},
    getPrepared:async()=>{teacher();return {ok:true,prepared:store.getPrepared()};},
    savePrepared:async prepared=>{teacher();return {ok:true,prepared:await store.savePrepared(prepared)};},
    clearPrepared:async()=>{teacher();await store.clearPrepared();return {ok:true};},
    choosePrepared:async state=>{try{return {ok:true,target:store.choosePrepared(state)};}catch(error){throw new Error(store.unlocked?error.message:'발표 준비를 확인해 주세요.');}},
    saveFile:async state=>{
      teacher();const checked=validateState(state);const result=await dialog.showSaveDialog(control,{title:'자리표 저장',defaultPath:'우리반.seatplan',filters:[{name:'자리온 자리표',extensions:['seatplan']}]});
      if(result.canceled||!result.filePath)return {ok:false,canceled:true};
      const serialized=await store.exportDocument(checked);await atomicWrite(result.filePath,serialized,false);return {ok:true};
    },
    openFile:async()=>{
      teacher();const result=await dialog.showOpenDialog(control,{title:'자리표 불러오기',properties:['openFile'],filters:[{name:'자리온 자리표',extensions:['seatplan']}]});
      if(result.canceled||!result.filePaths.length)return {ok:false,canceled:true};
      const file=result.filePaths[0],stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES*2)throw new Error('자리표 파일 형식 또는 크기를 확인해 주세요.');
      const state=await store.importDocument(await fs.readFile(file,'utf8'));authEpoch++;
      return {ok:true,state,pinExists:store.pinExists,requiresUnlock:true};
    },
    exportPDF:async options=>{teacher();return printing.exportPDF({BrowserWindow,dialog,parent:control,options:{...options,state:validateState(options.state)}});},
    print:async options=>{teacher();return printing.print({BrowserWindow,dialog,parent:control,options:{...options,state:validateState(options.state)}});},
    exportPNG:async options=>{teacher();return printing.exportPNG({BrowserWindow,dialog,parent:control,options:{...options,state:validateState(options.state)}});},
    openDisplay:async state=>{teacher();lastDisplay=publicState(state);if(!display||display.isDestroyed())display=makeWindow('display');else{display.webContents.send('seaton:display',lastDisplay);display.show();display.focus();}return {ok:true};},
    publishDisplay:async state=>{lastDisplay=publicState(state);if(display&&!display.isDestroyed())display.webContents.send('seaton:display',lastDisplay);return {ok:true};},
    setPresentation:async active=>{presentation=Boolean(active);return {ok:true};},
    toggleFullscreen:async()=>{control.setFullScreen(!control.isFullScreen());return {ok:true,fullscreen:control.isFullScreen()};},
    getUpdateState:async()=>{teacher();return updater.getState();},
    checkUpdate:async()=>{teacher();return updater.check();},
    installUpdate:async()=>{teacher();return updater.install();},
    closeReady:async result=>{
      if(!flushResolve)return {ok:false};clearTimeout(closeTimer);closeTimer=null;const resolve=flushResolve,reject=flushReject;flushResolve=null;flushReject=null;
      if(result&&result.ok===false){reject(new Error(result.error||'변경 내용을 저장하지 못했습니다.'));return {ok:false};}
      try{await store.flush();resolve();return {ok:true};}catch(error){reject(error);return {ok:false};}
    }
  };
  for(const [action,handler] of Object.entries(handlers))ipcMain.handle('seaton:'+action,async(event,value)=>{try{const role=senderRole(event);ensureRole(role,action);return await handler(value,role);}catch(error){return {ok:false,error:error.message||'작업을 완료하지 못했습니다.'};}});
  control=makeWindow('control');
  control.on('close',event=>{
    if(closing)return;
    event.preventDefault();if(closeRequested)return;closeRequested=true;
    requestRendererFlush().then(async()=>{await store.flush();closing=true;if(display&&!display.isDestroyed())display.destroy();control.close();}).catch(error=>{closeRequested=false;dialog.showErrorBox('자리온 · 저장 확인',error.message);});
  });
  control.on('closed',()=>{control=null;});
  app.on('second-instance',()=>{if(control){if(control.isMinimized())control.restore();control.show();control.focus();}});
  app.on('activate',()=>{if(control){control.show();control.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{updater.dispose();});
  app.on('will-quit',()=>{if(closeTimer)clearTimeout(closeTimer);store.destroy();});
  updater.start();
}
module.exports={start,ensureRole,configurationKey};
if(require.main===module)start().catch(error=>{const {app,dialog}=require('electron');dialog.showErrorBox('자리온 시작 오류',error.message);app.quit();});
