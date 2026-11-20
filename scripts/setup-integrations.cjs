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
function quoteCommandArg(value){
 const text=String(value);
 if(text.includes('"'))throw Error('Codex hook command path contains an unsupported quote');
 return `"${text}"`;
}
function configDisablesHooks(file){
 if(!fs.existsSync(file))return false;
 let section='';
 for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const line=raw.replace(/#.*$/,'').trim();
  const table=/^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
  if(table){section=table[1].trim();if(/^hooks(?:\.|$)/i.test(section))throw Error('Codex config.toml already declares hooks; merge HachiOrb into that hooks source to avoid duplicate hook layers');continue;}
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
/** Desktop WorkBuddy (not CodeBuddy CLI): safely extend ~/.workbuddy/settings.json. */
function setupWorkBuddy({home=os.homedir(),root=path.resolve(__dirname,'..'),stableDir=BASE_DIR}={}){
 const file=path.join(home,'.workbuddy','settings.json');
 let data={hooks:{}};
 if(fs.existsSync(file)){
  try{data=JSON.parse(fs.readFileSync(file,'utf8'))}
  catch(e){throw Error('WorkBuddy settings.json is invalid JSON; unchanged: '+e.message)}
 }
 if(!data || typeof data!=='object'||Array.isArray(data))throw Error('WorkBuddy settings.json must be a JSON object; unchanged');
 if(data.hooks!=null && (typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw Error('WorkBuddy hooks must be an object; unchanged');
 if(!data.hooks)data.hooks={};
 const handler=path.join(stableDir,'agent-status.ps1');
 let changed=false;
 for(const event of WORKBUDDY_EVENTS){
  const entries=data.hooks[event];
  if(entries!=null&&!Array.isArray(entries))throw Error('WorkBuddy '+event+' hooks must be an array; unchanged');
  const command=`powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${handler}" -Event workbuddy:${event}`;
  const groups=entries||[];
  for(const group of groups){
   if(!group||typeof group!=='object'||Array.isArray(group)||!Array.isArray(group.hooks))
    throw Error('WorkBuddy '+event+' contains an unsupported hook group; unchanged');
  }
  if(!groups.some(group=>group.hooks.some(hook=>hook&&hook.type==='command'&&hook.command===command))){
   data.hooks[event]=[...groups,{hooks:[{type:'command',command,timeout:5}]}];changed=true;
  }
 }
 stage(root,stableDir);
 if(!changed)return {status:'already-installed',file};
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file))fs.copyFileSync(file,file+'.hachiorb-backup-'+Date.now());
 const temp=file+'.hachiorb-tmp-'+process.pid+'-'+Date.now();
 try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
 return {status:'installed',file};
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
  try{const result=setupWorkBuddy();console.log('[OK] WorkBuddy Desktop hooks:',result.status)}
  catch(e){errors++;console.error('[ERROR] WorkBuddy config unchanged:',e.message)}
 }
 return errors===0?0:1;
}
if(require.main===module)process.exitCode=setupAll();
module.exports={setupCodexHooks,setupCursor,setupWorkBuddy,setupAll,CODEX_HOOK_EVENTS,WORKBUDDY_EVENTS};
