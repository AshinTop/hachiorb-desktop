'use strict';
const {app,BrowserWindow,Tray,Menu,nativeImage,ipcMain,screen,clipboard,dialog} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {createBridge,EMOTION_STATE}=require('./bridge.cjs');
const {agentName,stateName}=require('./status-display.js');
const {verified}=require('../scripts/bootstrap.cjs');
const {clampPosition,dragPosition,fixedBounds}=require('./drag-geometry.cjs');
const ROOT=path.resolve(__dirname,'..');
const UPSTREAM=path.join(ROOT,'vendor/grok-ball.js');
const SIZES=[180,220,260,300,360,420];
const LABELS={idle:'待机',thinking:'思考',working:'工作',done:'完成',error:'出错',sleep:'休息'};
const EMO_GROUPS={
 'AI 工作状态':[['30','思考中'],['31','接收任务'],['32','处理中'],['33','任务完成'],['34','出错'],['35','等待输入'],['36','联网加载'],['37','复述回忆'],['38','受限'],['39','输出回复'],['40','检索资料'],['41','停止']],
 '情绪':[['10','开心'],['11','疑惑'],['12','失落'],['13','惊讶'],['14','害羞'],['15','疲惫'],['16','专注'],['17','慌张'],['18','无奈'],['19','满意'],['20','困惑'],['21','生气']],
 '待机与休眠':[['00','睡眠'],['01','唤醒'],['02','待机'],['03','好奇'],['04','发呆'],['05','加载苏醒'],['06','休眠'],['07','抖动唤醒']]
};
const DEFAULTS={size:260,x:null,y:null,alwaysOnTop:true,followCursor:true,showStatus:true,locked:false,autostart:false};
let settings,windowPet=null,tray=null,api=null,bridge=null,dragSession=null,lastPointerIgnore=false;
let cursorTimer=null,statusTimer=null,savePath='';
function saveSettings(){try{fs.writeFileSync(savePath,JSON.stringify(settings,null,2))}catch(e){console.warn('Settings not saved',e.message)}}
function loadSettings(){
 try{const data=JSON.parse(fs.readFileSync(savePath,'utf8'));return {...DEFAULTS,
  size:SIZES.includes(data.size)?data.size:260,
  x:Number.isInteger(data.x)?data.x:null,y:Number.isInteger(data.y)?data.y:null,
  alwaysOnTop:typeof data.alwaysOnTop==='boolean'?data.alwaysOnTop:true,
  followCursor:typeof data.followCursor==='boolean'?data.followCursor:true,
  showStatus:typeof data.showStatus==='boolean'?data.showStatus:true,
  locked:typeof data.locked==='boolean'?data.locked:false,
  autostart:typeof data.autostart==='boolean'?data.autostart:false
 }}catch{return {...DEFAULTS}}
}
function boundPosition(x,y,size){
 const p=screen.getDisplayNearestPoint({x,y});const a=p.workArea;
 return clampPosition(x,y,size,a);
}
function normalizeDragSize(){
 if(!dragSession||!windowPet||windowPet.isDestroyed())return;
 const b=windowPet.getBounds();
 if(b.width===settings.size&&b.height===settings.size)return;
 const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
 windowPet.setBounds(fixedBounds(b,settings.size,area),false);
}
function defaultPosition(){const a=screen.getPrimaryDisplay().workArea;return {x:a.x+a.width-settings.size-28,y:a.y+a.height-settings.size-48}}
function sendState(state){if(windowPet&&!windowPet.isDestroyed())windowPet.webContents.send('hachi:state',state);refreshTray();}
function applySettings(){
 if(windowPet&&!windowPet.isDestroyed()){
  windowPet.setAlwaysOnTop(settings.alwaysOnTop,'floating');
  windowPet.setIgnoreMouseEvents(settings.locked, settings.locked?{forward:true}:undefined);
  windowPet.webContents.send('hachi:settings',settings);
 }
 refreshTray();saveSettings();
}
function changeEmotion(id){
 const state=EMOTION_STATE[id]||'idle';
 bridge.commit({state,emotionId:id,task:'手动表情',agent:'manual'});
}
function changeState(state){bridge.commit({state,task:'手动切换',agent:'manual'});}
function changeSize(size){
 if(!windowPet || windowPet.isDestroyed())return;
 const b=windowPet.getBounds();const pos=boundPosition(Math.round(b.x+(b.width-size)/2),Math.round(b.y+(b.height-size)/2),size);
 settings.size=size;settings.x=pos.x;settings.y=pos.y;
 windowPet.setBounds({x:pos.x,y:pos.y,width:size,height:size},false);applySettings();
}
function makeMenu(){
 const snapshot=bridge?.getState();
 const lastEvents=snapshot?.agents||[];
 const agentKeys=['codex','cursor','workbuddy','grok-bot',...lastEvents.map(s=>s.agent).filter(s=>!['codex','cursor','workbuddy','grok-bot'].includes(s))];
 const agentMenu=[...new Set(agentKeys)].map(id=>{
  const item=lastEvents.find(s=>s.agent===id);
  return {label:`${agentName(id)} · ${item?stateName(item)+(item.stale?'（上次报告）':''):'尚无事件'}`,enabled:false};
 });
 const items=[
  {label:`HachiOrb · ${agentName(snapshot?.agent)} · ${stateName(snapshot)}`,enabled:false},
  {label:'四个 Agent 最近状态',submenu:agentMenu},
  {type:'separator'},
  {label:'显示 / 隐藏',click:()=>windowPet.isVisible()?windowPet.hide():windowPet.show()},
  {label:'始终置顶',type:'checkbox',checked:settings.alwaysOnTop,click:i=>{settings.alwaysOnTop=i.checked;applySettings()}},
  {label:'锁定球体（鼠标穿透）',type:'checkbox',checked:settings.locked,click:i=>{settings.locked=i.checked;applySettings()}},
  {label:'眼睛跟随全桌面鼠标',type:'checkbox',checked:settings.followCursor,click:i=>{settings.followCursor=i.checked;applySettings()}},
  {label:'显示 Agent 名称与状态',type:'checkbox',checked:settings.showStatus,click:i=>{settings.showStatus=i.checked;applySettings()}},
  {type:'separator'},
  {label:'快速切换',submenu:Object.keys(LABELS).map(s=>({label:LABELS[s],click:()=>changeState(s)}))},
  {label:'32 种原版表情',submenu:Object.entries(EMO_GROUPS).map(([label,entries])=>({label,submenu:entries.map(([id,name])=>({label:`${id}  ${name}`,click:()=>changeEmotion(id)}))}))},
  {label:'球体大小',submenu:SIZES.map(n=>({label:`${n} px`,type:'radio',checked:settings.size===n,click:()=>changeSize(n)}))},
  {label:'恢复右下角默认位置',click:()=>{const p=defaultPosition();windowPet.setPosition(p.x,p.y);settings.x=p.x;settings.y=p.y;saveSettings()}},
  {type:'separator'},
  {label:api?`本地状态接口：127.0.0.1:${api}`:'状态服务初始化中',enabled:false},
  {label:'复制 AI 状态接口地址',click:()=>clipboard.writeText(`http://127.0.0.1:${api}/api/state`)},
  {label:'复制测试命令（PowerShell）',click:()=>clipboard.writeText(`$u='http://127.0.0.1:${api}/api/state';$b='{"state":"thinking","task":"AI 正在思考","agent":"manual"}';$d=[Text.Encoding]::UTF8.GetBytes($b);$q=[Net.HttpWebRequest]::Create($u);$q.Proxy=$null;$q.Method='POST';$q.ContentType='application/json';$q.Timeout=2000;$q.ReadWriteTimeout=2000;$q.ContentLength=$d.Length;$s=$q.GetRequestStream();$s.Write($d,0,$d.Length);$s.Close();$q.GetResponse().Close()`)},
  {label:'开机启动（仅打包版）',type:'checkbox',enabled:app.isPackaged,checked:settings.autostart,click:i=>{
    settings.autostart=i.checked;
    app.setLoginItemSettings({openAtLogin:settings.autostart,path:process.execPath});applySettings();
  }},
  {type:'separator'},
  {label:'退出 HachiOrb',click:()=>app.quit()}
 ];
 return Menu.buildFromTemplate(items);
}
function refreshTray(){if(tray&&!tray.isDestroyed()){const status=bridge?.getState();tray.setContextMenu(makeMenu());tray.setToolTip(`HachiOrb · ${agentName(status?.agent)} · ${stateName(status)}`)}}
function showContextMenu(){if(windowPet&&!windowPet.isDestroyed())makeMenu().popup({window:windowPet})}
function setupIPC(){
 ipcMain.handle('hachi:ready',()=>({state:bridge.getState(),settings:{...settings},apiPort:api}));
 ipcMain.on('hachi:show-menu',showContextMenu);
 ipcMain.on('hachi:move-begin',()=>{
  if(!windowPet||settings.locked)return;
  dragSession={startCursor:screen.getCursorScreenPoint(), startBounds:windowPet.getBounds()};
 });
 ipcMain.on('hachi:move-tick',()=>{
  if(!dragSession||settings.locked||!windowPet)return;
  const p=screen.getCursorScreenPoint(),start=dragSession;
  const area=screen.getDisplayNearestPoint(p).workArea;
  const bounded=dragPosition(start.startCursor,start.startBounds,p,settings.size,area);
  const b=windowPet.getBounds();
  if(b.width!==settings.size||b.height!==settings.size)
    windowPet.setBounds({...bounded,width:settings.size,height:settings.size},false);
  else windowPet.setPosition(bounded.x,bounded.y);
 });
 ipcMain.on('hachi:move-end',()=>{
  if(!windowPet)return;dragSession=null;
  // Per-monitor Windows DPI transitions can change BrowserWindow bounds while
  // moving. Enforce the user's selected DIP size without affecting its position.
  const b=windowPet.getBounds();
  const area=screen.getDisplayNearestPoint({x:b.x+b.width/2,y:b.y+b.height/2}).workArea;
  const expected=fixedBounds(b,settings.size,area);
  if(b.x!==expected.x || b.y!==expected.y || b.width!==expected.width || b.height!==expected.height)
    windowPet.setBounds(expected,false);
  settings.x=expected.x;settings.y=expected.y;saveSettings();
 });
 ipcMain.on('hachi:click-through',(_e,v)=>{
  if(!windowPet||settings.locked)return;
  if(lastPointerIgnore!==v){lastPointerIgnore=v;windowPet.setIgnoreMouseEvents(v,v?{forward:true}:undefined)}
 });
}
async function setupApp(){
 savePath=path.join(app.getPath('userData'),'settings.json');settings=loadSettings();
 const runtime=fs.existsSync(UPSTREAM)?fs.readFileSync(UPSTREAM):null;
 if(!runtime||!verified(runtime)){
  dialog.showErrorBox('缺少原版 Grok Ball 动画','请先运行 start-windows.bat。它会校验并下载 TyCoding 原版引擎，之后可以离线使用。');
  app.quit();return;
 }
 bridge=createBridge(sendState);
 try{api=await bridge.listen(Number(process.env.HACHI_PORT)||4173)}catch(e){dialog.showErrorBox('状态接口启动失败',e.message);app.quit();return;}
 setupIPC();
 const start=settings.x===null||settings.y===null?defaultPosition():boundPosition(settings.x,settings.y,settings.size);
 windowPet=new BrowserWindow({
  width:settings.size,height:settings.size,x:start.x,y:start.y,
  frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',
  resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
  skipTaskbar:true,show:false,alwaysOnTop:settings.alwaysOnTop,
  icon:path.join(ROOT,'assets/app.png'),
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}
 });
 windowPet.setMenuBarVisibility(false);
 windowPet.setAlwaysOnTop(settings.alwaysOnTop,'floating');
 windowPet.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 windowPet.webContents.on('will-navigate',e=>e.preventDefault());
 windowPet.on('close',e=>{
  if(!app.isQuitting){e.preventDefault();windowPet.hide();}
 });
 windowPet.on('moved',()=>{
   // Keep DPI-driven window resizes from showing during a drag. Persist only
   // after release so an intermediate monitor transition does not become the
   // user's selected size or saved position.
   if(dragSession){normalizeDragSize();return;}
   const b=windowPet.getBounds();settings.x=b.x;settings.y=b.y;saveSettings();
 });
 windowPet.on('move',normalizeDragSize);
 windowPet.on('resize',normalizeDragSize);
 windowPet.once('ready-to-show',()=>{windowPet.showInactive();applySettings();});
 await windowPet.loadFile(path.join(__dirname,'index.html'));
 tray=new Tray(nativeImage.createFromPath(path.join(ROOT,'assets/tray.png')));
 tray.on('click',()=>{if(windowPet.isVisible())windowPet.hide();else windowPet.showInactive()});
 tray.on('double-click',()=>windowPet.showInactive());
 refreshTray();
 // Return from expired completion/attention states to the next still-active Agent.
 statusTimer=setInterval(()=>bridge?.refresh(),2000);
 cursorTimer=setInterval(()=>{
  if(!windowPet||windowPet.isDestroyed()||!windowPet.isVisible()||!settings.followCursor)return;
  const p=screen.getCursorScreenPoint(),b=windowPet.getBounds();
  const nx=Math.max(-1,Math.min(1,(p.x-b.x-b.width/2)/(b.width*.75)));
  const ny=Math.max(-1,Math.min(1,(p.y-b.y-b.height/2)/(b.height*.75)));
  windowPet.webContents.send('hachi:cursor',{nx,ny});
 },80);
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>windowPet?.showInactive());
 app.on('before-quit',()=>{app.isQuitting=true;clearInterval(cursorTimer);clearInterval(statusTimer)});
 app.on('window-all-closed',()=>{/* Stay in tray until explicitly quit */});
 app.whenReady().then(()=>{app.setAppUserModelId('org.hachiorb.desktop');return setupApp()}).catch(e=>{dialog.showErrorBox('HachiOrb 无法启动',e.message);app.quit()});
 app.on('activate',()=>windowPet?.showInactive());
}
