'use strict';
/** Windows user-level installer: preserve existing Codex notify through dispatcher.
 * Never modify Codex itself. Existing config is snapshotted before a change.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {installCodex,stage,BASE_DIR}=require('./codex-notify-config.cjs');

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
   console.log('     Codex emits agent-turn-complete only.');
  }catch(e){errors++;console.error('[ERROR] Codex config unchanged:',e.message);}
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
module.exports={setupCursor,setupWorkBuddy,setupAll,WORKBUDDY_EVENTS};
