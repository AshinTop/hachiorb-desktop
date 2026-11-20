'use strict';
/** Windows user-level installer: preserve existing Codex notify through dispatcher.
 * Never modify Codex itself. Existing config is snapshotted before a change.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {installCodex,stage,BASE_DIR}=require('./codex-notify-config.cjs');

const CODEX_HOOK_EVENTS=Object.freeze(['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','SubagentStart','SubagentStop','Stop','Interrupt','SessionEnd']);
const CODEX_INLINE_HOOK_EVENTS=new Set(['PreToolUse','PermissionRequest','PostToolUse','PreCompact','PostCompact','UserPromptSubmit','SubagentStop','Stop','PreModelRequest','PostModelRequest','Interrupt','SessionStart','SubagentStart','SessionEnd']);
const WORKBUDDY_PLUGIN_NAME='hachiorb-status';
const WORKBUDDY_MARKETPLACE_NAME='hachiorb-local';
const WORKBUDDY_PLUGIN_VERSION=require('../package.json').version;
function quoteCommandArg(value){
 const text=String(value);
 if(text.includes('"'))throw Error('Codex hook command path contains an unsupported quote');
 return `"${text}"`;
}
function gitBashPath(value){
 const text=String(value).replace(/\\/g,'/');
 const drive=/^([A-Za-z]):\/(.*)$/.exec(text);
 if(drive)return `/${drive[1].toLowerCase()}/${drive[2]}`;
 if(text.startsWith('/'))return text;
 throw Error('WorkBuddy hook paths must be absolute Windows drive paths or POSIX paths');
}
function quoteBashArg(value){
 return "'"+String(value).replace(/'/g,"'\"'\"'")+"'";
}
function configDisablesHooks(file){
 if(!fs.existsSync(file))return false;
 let section='';
 for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const line=raw.replace(/#.*$/,'').trim();
  const table=/^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
  if(table){section=table[1].trim();const inline=/^hooks\.([^.]+)(?:\.|$)/i.exec(section);if(inline&&[...CODEX_INLINE_HOOK_EVENTS].some(event=>event.toLowerCase()===inline[1].toLowerCase()))throw Error('Codex config.toml already declares hooks; merge HachiOrb into that hooks source to avoid duplicate hook layers');continue;}
  if(section.toLowerCase()==='features'&&/^hooks\s*=\s*false(?:\s|$)/i.test(line))return true;
  if(section.toLowerCase()==='features'&&/^codex_hooks\s*=\s*false(?:\s|$)/i.test(line))return true;
 }
 return false;
}
function backupFile(file){
 if(!fs.existsSync(file))return null;
 const dest=file+'.hachiorb-backup-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomBytes(3).toString('hex');
 fs.copyFileSync(file,dest);return dest;
}
function atomicWrite(file,content){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.hachiorb-tmp-'+crypto.randomBytes(5).toString('hex');
 try{fs.writeFileSync(temp,content,{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}

function setupCodexHooks({home=os.homedir(),codexHome=process.env.CODEX_HOME,root=path.resolve(__dirname,'..'),stableDir=BASE_DIR,nodeExe=process.execPath}={}){
 const codexDir=codexHome||path.join(home,'.codex');
 const file=path.join(codexDir,'hooks.json');
 if(configDisablesHooks(path.join(codexDir,'config.toml')))throw Error('Codex lifecycle hooks are disabled in config.toml; no hooks were installed');
 let data={hooks:{}};
 if(fs.existsSync(file)){
  try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){throw Error('Existing Codex hooks.json is invalid JSON; unchanged: '+e.message)}
 }
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Codex hooks.json must be a JSON object; unchanged');
 if(data.hooks!=null&&(typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw Error('Codex hooks must be an object; unchanged');
 if(!data.hooks)data.hooks={};
 for(const event of CODEX_HOOK_EVENTS){
  const groups=data.hooks[event];
  if(groups!=null&&!Array.isArray(groups))throw Error('Codex '+event+' hook groups must be an array; unchanged');
  for(const group of groups||[]){
   if(!group||typeof group!=='object'||Array.isArray(group)||!Array.isArray(group.hooks))throw Error('Codex '+event+' contains an unsupported hook group; unchanged');
   if(group.hooks.some(hook=>!hook||typeof hook!=='object'||Array.isArray(hook)))throw Error('Codex '+event+' contains an unsupported hook handler; unchanged');
  }
 }
 stage(root,stableDir);
 const script=path.join(stableDir,'codex-hook.cjs');
 const command=`${quoteCommandArg(nodeExe)} ${quoteCommandArg(script)}`;
 let changed=false;
 for(const event of CODEX_HOOK_EVENTS){
  const hookCommand=`${command} ${event}`;
  const timeout=event==='Interrupt'||event==='SessionEnd'?3:5;
  const desired={type:'command',command:hookCommand,commandWindows:hookCommand,timeout};
  if(event!=='Interrupt'&&event!=='SessionEnd')desired.async=true;
  const entries=data.hooks[event]||[];
  const groups=[];let found=false;
  for(const group of entries){
   const kept=[];
   for(const hook of group.hooks){
    const ours=hook.type==='command'&&typeof hook.command==='string'&&(
     /hachiorb[^\r\n]*codex-hook\.cjs/i.test(hook.command)||
     (/hachiorb[^\r\n]*agent-status\.ps1/i.test(hook.command)&&hook.command.includes(`codex:${event}`))
    );
    if(!ours){kept.push(hook);continue;}
    const same=Object.keys(desired).every(key=>hook[key]===desired[key])&&Object.keys(hook).every(key=>Object.hasOwn(desired,key));
    if(same&&!found){kept.push(hook);found=true;}else changed=true;
   }
   if(kept.length)groups.push({...group,hooks:kept});
  }
  if(!found){
   groups.push({hooks:[desired]});changed=true;
  }
  if(groups.length)data.hooks[event]=groups;else delete data.hooks[event];
 }
 if(!changed)return {status:'already-installed',file};
 const backup=backupFile(file);
 atomicWrite(file,JSON.stringify(data,null,2)+'\n');
 return {status:'installed',file,backup};
}

function setupCursor({home=os.homedir(),root=path.resolve(__dirname,'..'),stableDir=BASE_DIR}={}) {
 const file=path.join(home,'.cursor','hooks.json');let data={version:1,hooks:{}};
 if(fs.existsSync(file)){
  try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){throw Error('Existing Cursor hooks.json is not valid JSON; unchanged: '+e.message)}
 }
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Cursor hooks.json must be an object');
 if(![1,undefined].includes(data.version))throw Error('Unsupported Cursor hooks schema; unchanged');
 if(!data.hooks)data.hooks={};
 if(typeof data.hooks!=='object'||Array.isArray(data.hooks))throw Error('Cursor hooks must be an object; unchanged');
 const handler=path.join(stableDir,'agent-status.ps1');
 let changed=false;
 for(const event of ['beforeSubmitPrompt','afterAgentThought','afterFileEdit','stop','sessionEnd']){
  let entries=data.hooks[event];
  if(entries!=null&&!Array.isArray(entries))throw Error('Cursor '+event+' hooks must be an array; unchanged');
  const command=`powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${handler}" -Event ${event}`;
  const existing=(entries||[]).filter(item=>!item?.command || !/hachiorb[^"\r\n]*cursor-hook\.cjs/i.test(item.command));
  if(!existing.some(item=>item?.command===command))existing.push({command});
  if(JSON.stringify(entries)!==JSON.stringify(existing)){data.hooks[event]=existing;changed=true;}
 }
 if(data.version==null){data.version=1;changed=true;}
 stage(root,stableDir);
 if(!changed)return {status:'already-installed',file};
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file))fs.copyFileSync(file,file+'.hachiorb-backup-'+Date.now());
 const temp=file+'.hachiorb-tmp-'+Date.now();
 try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return {status:'installed',file};
}
const WORKBUDDY_EVENTS=Object.freeze(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Notification','Stop','SessionEnd']);
function readJsonObject(file,label,fallback={}){
 if(!fs.existsSync(file))return fallback;
 let data;
 try{data=JSON.parse(fs.readFileSync(file,'utf8'))}
 catch(e){throw Error(label+' is invalid JSON; unchanged: '+e.message)}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error(label+' must be a JSON object; unchanged');
 return data;
}
function writeJsonIfChanged(file,data){
 const content=JSON.stringify(data,null,2)+'\n';
 if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===content)return false;
 backupFile(file);atomicWrite(file,content);return true;
}
function writeOwnedFileIfChanged(file,content){
 if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===content)return false;
 atomicWrite(file,content);return true;
}
function samePath(a,b){return path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase()}
/** Install the HachiOrb Hook as a standard local plugin for WorkBuddy Desktop. */
function setupWorkBuddyDesktopPlugin({home=os.homedir(),stableDir=BASE_DIR,nodeExe=process.execPath}={}){
 const appHome=path.join(home,'.workbuddy-ai');
 const pluginsHome=path.join(appHome,'plugins');
 const marketplaceDir=path.join(pluginsHome,'marketplaces',WORKBUDDY_MARKETPLACE_NAME);
 const pluginSource=path.join(marketplaceDir,WORKBUDDY_PLUGIN_NAME);
 const cacheDir=path.join(pluginsHome,'cache',WORKBUDDY_MARKETPLACE_NAME,WORKBUDDY_PLUGIN_NAME,WORKBUDDY_PLUGIN_VERSION);
 const pluginId=WORKBUDDY_PLUGIN_NAME+'@'+WORKBUDDY_MARKETPLACE_NAME;
 const now=new Date().toISOString();
 const commandPrefix=`${quoteBashArg(gitBashPath(nodeExe))} ${quoteBashArg(gitBashPath(path.join(stableDir,'workbuddy-hook.cjs')))}`;
 const hooks={};
 for(const event of WORKBUDDY_EVENTS){
  hooks[event]=[{hooks:[{type:'command',command:`${commandPrefix} workbuddy:${event}`,timeout:15}]}];
 }
 const pluginManifest={name:WORKBUDDY_PLUGIN_NAME,version:WORKBUDDY_PLUGIN_VERSION,description:'Reports WorkBuddy lifecycle state to the local HachiOrb companion.',hooks:'./hooks/hooks.json',defaultEnabled:true};
 const pluginFiles={
  [path.join(pluginSource,'.codebuddy-plugin','plugin.json')]:JSON.stringify(pluginManifest,null,2)+'\n',
  [path.join(pluginSource,'hooks','hooks.json')]:JSON.stringify({description:'HachiOrb local WorkBuddy lifecycle status hooks',hooks},null,2)+'\n'
 };
 const pluginManifestPath=Object.keys(pluginFiles)[0];
 if(fs.existsSync(pluginManifestPath)){
  const current=readJsonObject(pluginManifestPath,'Existing HachiOrb WorkBuddy plugin manifest');
  if(current.name!==WORKBUDDY_PLUGIN_NAME)throw Error('The HachiOrb WorkBuddy plugin path contains another plugin; unchanged');
 }
 let pluginFilesChanged=false;
 for(const [file,content] of Object.entries(pluginFiles)){
  pluginFilesChanged=writeOwnedFileIfChanged(file,content)||pluginFilesChanged;
  const relative=path.relative(pluginSource,file);
  pluginFilesChanged=writeOwnedFileIfChanged(path.join(cacheDir,relative),content)||pluginFilesChanged;
 }
 const marketplaceFile=path.join(marketplaceDir,'.codebuddy-plugin','marketplace.json');
 const marketplace=readJsonObject(marketplaceFile,'Existing HachiOrb marketplace',{name:WORKBUDDY_MARKETPLACE_NAME,description:'Local HachiOrb integration plugins.',metadata:{version:'1.0.0'},plugins:[]});
 if(marketplace.name!==WORKBUDDY_MARKETPLACE_NAME||!Array.isArray(marketplace.plugins))throw Error('Existing HachiOrb marketplace has an unsupported shape; unchanged');
 const marketplacePlugins=marketplace.plugins.filter(item=>item?.name!==WORKBUDDY_PLUGIN_NAME);
 marketplacePlugins.push({name:WORKBUDDY_PLUGIN_NAME,source:'./'+WORKBUDDY_PLUGIN_NAME,version:WORKBUDDY_PLUGIN_VERSION,description:'Reports WorkBuddy lifecycle state to HachiOrb.'});
 marketplace.plugins=marketplacePlugins;
 pluginFilesChanged=writeOwnedFileIfChanged(marketplaceFile,JSON.stringify(marketplace,null,2)+'\n')||pluginFilesChanged;
 const knownFile=path.join(pluginsHome,'known_marketplaces.json');
 const known=readJsonObject(knownFile,'WorkBuddy known_marketplaces');
 const previousMarket=known[WORKBUDDY_MARKETPLACE_NAME];
 if(previousMarket?.source?.path&&!samePath(previousMarket.source.path,marketplaceDir))throw Error('WorkBuddy marketplace name hachiorb-local is already used by another source; unchanged');
 const marketRecord={...(previousMarket||{}),manifestName:WORKBUDDY_MARKETPLACE_NAME,type:'directory',source:{source:'directory',path:marketplaceDir},installLocation:marketplaceDir,description:'Local HachiOrb integration plugins.',lastUpdated:pluginFilesChanged?now:(previousMarket?.lastUpdated||now),autoUpdate:false,isBuiltIn:false};
 const knownChanged=writeJsonIfChanged(knownFile,{...known,[WORKBUDDY_MARKETPLACE_NAME]:marketRecord});
 const installedFile=path.join(pluginsHome,'installed_plugins.json');
 const installed=readJsonObject(installedFile,'WorkBuddy installed_plugins',{version:1,plugins:{}});
 if(!installed.plugins||typeof installed.plugins!=='object'||Array.isArray(installed.plugins))throw Error('WorkBuddy installed_plugins.plugins must be an object; unchanged');
 const installedEntries=installed.plugins[pluginId]||[];
 if(!Array.isArray(installedEntries))throw Error('WorkBuddy HachiOrb plugin registry entry must be an array; unchanged');
 const previousInstall=installedEntries.find(item=>item?.scope==='user');
 const installedRecord={scope:'user',installPath:cacheDir,version:WORKBUDDY_PLUGIN_VERSION,installedAt:previousInstall?.installedAt||now,lastUpdated:pluginFilesChanged||previousInstall?.installPath!==cacheDir?now:(previousInstall?.lastUpdated||now)};
 installed.plugins[pluginId]=[...installedEntries.filter(item=>item?.scope!=='user'),installedRecord];
 const installedChanged=writeJsonIfChanged(installedFile,installed);
 const configuredFile=path.join(pluginsHome,'configured-plugins.json');
 const configured=readJsonObject(configuredFile,'WorkBuddy configured-plugins',{version:1,builtInMarketPlugins:[],builtInMarketPluginsMerge:[]});
 if(configured.builtInMarketPlugins==null)configured.builtInMarketPlugins=[];
 if(!Array.isArray(configured.builtInMarketPlugins))throw Error('WorkBuddy configured-plugins.builtInMarketPlugins must be an array; unchanged');
 const configuredPlugins=configured.builtInMarketPlugins.filter(item=>!(item?.name===WORKBUDDY_PLUGIN_NAME&&item?.marketplaceName===WORKBUDDY_MARKETPLACE_NAME));
 configuredPlugins.push({name:WORKBUDDY_PLUGIN_NAME,marketplaceName:WORKBUDDY_MARKETPLACE_NAME,scope:'user'});
 configured.builtInMarketPlugins=configuredPlugins;
 const configuredChanged=writeJsonIfChanged(configuredFile,configured);
 const settingsFile=path.join(appHome,'settings.json');
 const settings=readJsonObject(settingsFile,'WorkBuddy AI settings');
 if(settings.enabledPlugins==null)settings.enabledPlugins={};
 if(typeof settings.enabledPlugins!=='object'||Array.isArray(settings.enabledPlugins))throw Error('WorkBuddy AI enabledPlugins must be an object; unchanged');
 settings.enabledPlugins[pluginId]=true;
 const settingsChanged=writeJsonIfChanged(settingsFile,settings);
 const changed=pluginFilesChanged||knownChanged||installedChanged||configuredChanged||settingsChanged;
 return {status:changed?'installed':'already-installed',plugin:pluginId,cacheDir,sourceDir:marketplaceDir};
}
/** Safely extend the legacy WorkBuddy CLI config and register its Desktop Hook plugin. */
function setupWorkBuddy({home=os.homedir(),root=path.resolve(__dirname,'..'),stableDir=BASE_DIR,nodeExe=process.execPath}={}){
 const file=path.join(home,'.workbuddy','settings.json');
 const data=readJsonObject(file,'WorkBuddy settings.json',{hooks:{}});
 if(data.disableAllHooks===true)throw Error('WorkBuddy disables all hooks in settings.json; unchanged. Re-enable Hooks in WorkBuddy and rerun setup.');
 if(data.hooks!=null && (typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw Error('WorkBuddy hooks must be an object; unchanged');
 if(!data.hooks)data.hooks={};
 stage(root,stableDir);
 const handler=path.join(stableDir,'workbuddy-hook.cjs');
 const timeout=15;
 let changed=false;
 for(const event of WORKBUDDY_EVENTS){
  const entries=data.hooks[event];
  if(entries!=null&&!Array.isArray(entries))throw Error('WorkBuddy '+event+' hooks must be an array; unchanged');
  // WorkBuddy runs hook commands through Git Bash on Windows. POSIX paths
  // avoid the backslash parsing bug in older CodeBuddy-derived runners.
  const command=`${quoteBashArg(gitBashPath(nodeExe))} ${quoteBashArg(gitBashPath(handler))} workbuddy:${event}`;
  const groups=entries||[];
  const nextGroups=[];let found=false;
  for(const group of groups){
   if(!group||typeof group!=='object'||Array.isArray(group)||!Array.isArray(group.hooks))
    throw Error('WorkBuddy '+event+' contains an unsupported hook group; unchanged');
   const nextHooks=[];
   for(const hook of group.hooks){
    const cmd=typeof hook?.command==='string'?hook.command:'';
    const ours=hook?.type==='command'&&(
     (/hachiorb[^\r\n]*agent-status\.ps1/i.test(cmd)&&new RegExp('-Event\\s+workbuddy:'+event+'(?:\\s|$)','i').test(cmd))||
     (/(?:^|[\\/'])workbuddy-hook\.cjs(?:['"\\s]|$)/i.test(cmd)&&new RegExp('(?:workbuddy:)?'+event+'(?:\\s|$)','i').test(cmd))
    );
    if(!ours){nextHooks.push(hook);continue;}
    const correct=cmd===command&&hook.timeout===timeout&&!Object.keys(hook).some(k=>!['type','command','timeout'].includes(k));
    if(correct&&!found){nextHooks.push(hook);found=true;}
    else changed=true;
   }
   if(nextHooks.length||group.hooks.length===0)nextGroups.push({...group,hooks:nextHooks});
   else changed=true;
  }
  if(!found){
   nextGroups.push({matcher:'',hooks:[{type:'command',command,timeout}]});changed=true;
  }
  if(changed||JSON.stringify(groups)!==JSON.stringify(nextGroups))data.hooks[event]=nextGroups;
 }
 if(changed)writeJsonIfChanged(file,data);
 const desktop=setupWorkBuddyDesktopPlugin({home,stableDir,nodeExe});
 return {status:changed||desktop.status==='installed'?'installed':'already-installed',file,desktop};
}
function setupAll(args=new Set(process.argv.slice(2))){
 const wantsAll=args.has('--all')||args.size===0;
 let errors=0;
 if(wantsAll||args.has('--codex')){
  try{
   const result=installCodex();
   console.log('[OK] Codex notify dispatcher:',result.status);
   if(result.original)console.log('     Original notify preserved and forwarded first.');
  }catch(e){errors++;console.error('[ERROR] Codex config unchanged:',e.message);}
  try{const result=setupCodexHooks();console.log('[OK] Codex lifecycle hooks:',result.status);}
  catch(e){errors++;console.error('[ERROR] Codex lifecycle hooks unchanged:',e.message);}
 }
 if(wantsAll||args.has('--cursor')){
  try{const result=setupCursor();console.log('[OK] Cursor hooks:',result.status)}
  catch(e){errors++;console.error('[ERROR] Cursor config unchanged:',e.message)}
 }
 if(wantsAll||args.has('--workbuddy')){
  try{const result=setupWorkBuddy();console.log('[OK] WorkBuddy hooks:',result.status);console.log('     Desktop plugin:',result.desktop.plugin);console.log('     Restart WorkBuddy AI fully to load the plugin.')}
  catch(e){errors++;console.error('[ERROR] WorkBuddy config unchanged:',e.message)}
 }
 return errors===0?0:1;
}
if(require.main===module)process.exitCode=setupAll();
module.exports={setupCodexHooks,setupCursor,setupWorkBuddy,setupWorkBuddyDesktopPlugin,setupAll,CODEX_HOOK_EVENTS,WORKBUDDY_EVENTS};
