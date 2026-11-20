'use strict';
/** Conservative reader/writer for Codex's top-level TOML `notify = [strings]`.
 * We deliberately refuse syntax we cannot prove safe to avoid corrupting config.toml.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const BASE_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'HachiOrb', 'hooks');
const MANIFEST = 'codex-original-notify.json';
const ENTRY = 'codex-notify-dispatcher.cjs';
const LEGACY_NAMES = new Set(['codex-notify.cjs', 'agent-status.ps1']);

function decodeArray(source, start) {
 let i=start;
 function spaces() {while(i<source.length){
  if(/[ \t\r\n]/.test(source[i])){i++;continue;}
  if(source[i]==='#'){while(i<source.length && source[i]!=='\n')i++;continue;}
  break;
 }}
 spaces(); if(source[i]!=='[')throw Error('notify must be an array of strings');i++;
 let args=[];spaces();
 while(i<source.length && source[i]!==']'){
  const quote=source[i];
  if(quote!=='"' && quote!=="'")throw Error('notify must contain only quoted strings');
  if(source.slice(i,i+3)===quote.repeat(3))throw Error('multi-line TOML strings in notify are not supported');
  let value;
  if(quote==='"'){
   let j=i+1,escaped=false;
   for(;j<source.length;j++){
    if(source[j]==='\r' || source[j]==='\n')throw Error('unclosed TOML string in notify');
    if(source[j]==='"'&&!escaped)break;
    if(source[j]==='\\'&&!escaped)escaped=true;else escaped=false;
   }
   if(j===source.length)throw Error('unclosed TOML string in notify');
   try{value=JSON.parse(source.slice(i,j+1))}catch{throw Error('unsupported TOML escape in notify; change manually')}
   i=j+1;
  } else {
   let j=source.indexOf("'",i+1);
   if(j<0 || /[\r\n]/.test(source.slice(i+1,j)))throw Error('unclosed TOML literal string in notify');
   value=source.slice(i+1,j);i=j+1;
  }
  if(!value && args.length===0)throw Error('empty notify executable');
  args.push(value);
  spaces();
  if(source[i]===','){i++;spaces();continue;}
  if(source[i]!==']')throw Error('expected comma or ] in notify array');
 }
 if(source[i]!==']')throw Error('unclosed notify array');i++;
 if(!args.length || !args[0]?.trim() || args.some(x=>typeof x!=='string'))throw Error('notify requires executable and string arguments');
 return {args,end:i};
}
function inspectNotify(content) {
 if(typeof content!=='string')throw Error('invalid TOML content');
 // Multiline strings elsewhere make regex-based top-level scanning unsafe.
 if(content.includes('"""') || content.includes("'''"))throw Error('config contains multiline TOML strings; manual review required');
 const lines=content.match(/[^\n]*(?:\n|$)/g)||[];
 let offset=0,inRoot=true,found=null,tableOffset=content.length;
 for(const line of lines){
  if(!line)continue;
  const bare=line.replace(/\r?\n$/,'');
  if(/^\s*\[/.test(bare)){
   if(inRoot){tableOffset=offset;inRoot=false;}
  }
  if(inRoot){
   if(/^\s*["']notify["']\s*=/.test(bare))throw Error('quoted top-level notify key needs manual review');
   const match=/^([ \t]*)notify[ \t]*=/.exec(bare);
   if(match){
    if(found)throw Error('duplicate top-level notify keys; manual review required');
    const startValue=offset+match[0].length;
    const parsed=decodeArray(content,startValue);
    const rest=content.slice(parsed.end).split(/\r?\n/,1)[0];
    if(!/^[ \t]*(?:#.*)?$/.test(rest))throw Error('unexpected text after notify value');
    const endLine=content.indexOf('\n',parsed.end);
    const end=endLine===-1?content.length:endLine+1;
    const currentStart=offset;
    found={args:parsed.args,start:currentStart,end,raw:content.slice(currentStart,end)};
   }
  }
  offset+=line.length;
 }
 return {notify:found,tableOffset};
}
function insertNotify(content, command) {
 const {notify,tableOffset}=inspectNotify(content);
 const line='notify = '+JSON.stringify(command)+'\n';
 if(notify){return {content:content.slice(0,notify.start)+line+content.slice(notify.end),previous:notify.args};}
 const at=content.startsWith('\uFEFF')?1:0;
 // Insert before all sections. Inserting at the very beginning avoids placing notify inside [section].
 const prefix=content.slice(0,at);
 return {content:prefix+line+content.slice(at),previous:null};
}
function isManaged(command, stableDir=BASE_DIR){
 if(!Array.isArray(command))return false;
 return command.some(v=>typeof v==='string' && /codex-notify-dispatcher\.(?:cjs|ps1)$/i.test(v) && path.normalize(v).toLowerCase()===path.normalize(path.join(stableDir,path.extname(v).toLowerCase()==='.ps1'?'codex-notify-dispatcher.ps1':ENTRY)).toLowerCase());
}
function isLegacy(command, stableDir=BASE_DIR){
 if(!Array.isArray(command))return false;
 return command.some(v=>{
  if(typeof v!=='string')return false;
  const name=path.win32.basename(v).toLowerCase();
  if(!LEGACY_NAMES.has(name))return false;
  const low=v.replace(/\\/g,'/').toLowerCase();
  return low.includes('hachiorb') || low===path.join(stableDir,name).replace(/\\/g,'/').toLowerCase();
 });
}
function backup(file) {
 if(!fs.existsSync(file))return null;
 const dest=file+'.hachiorb-backup-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+crypto.randomBytes(3).toString('hex');
 fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL);return dest;
}
function atomicWrite(file,content) {
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.hachiorb-tmp-'+crypto.randomBytes(5).toString('hex');
 try{fs.writeFileSync(temp,content,{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function stage(root, stableDir=BASE_DIR){
 fs.mkdirSync(stableDir,{recursive:true});
 for(const name of [ENTRY,'codex-hook.cjs','codex-notify.cjs','agent-events.cjs','local-status.cjs','agent-status.ps1','workbuddy-hook.cjs','codex-notify-dispatcher.ps1']){
  const source=path.join(root,'integrations',name);
  if(!fs.existsSync(source))throw Error('Missing integration file: '+name);
  const target=path.join(stableDir,name);
  if(path.resolve(source)!==path.resolve(target))fs.copyFileSync(source,target);
 }
}
function installCodex({root=path.resolve(__dirname,'..'),home=os.homedir(),codexHome=process.env.CODEX_HOME,stableDir=BASE_DIR,nodeExe=process.execPath}={}) {
 const file=path.join(codexHome||path.join(home,'.codex'),'config.toml'),manifestPath=path.join(stableDir,MANIFEST);
 const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const parsed=inspectNotify(before), current=parsed.notify?.args||null;
 const managed=current && isManaged(current,stableDir);
 if(current && !managed && current.some(x=>/codex-notify-dispatcher\.(cjs|ps1)/i.test(x)))throw Error('Unknown Codex dispatcher found; refusing to nest or replace it');
 let saved=null;
 if(fs.existsSync(manifestPath)){
  try{saved=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{throw Error('Stored original notify is unreadable; refusing to modify configuration')}
  if(saved.version!==1|| !(saved.originalNotify===null || Array.isArray(saved.originalNotify)))throw Error('Stored original notify has an unsupported format');
 }
 if(managed && !saved)throw Error('HachiOrb dispatcher found without saved original notify; manual recovery needed');
 if(managed){stage(root,stableDir);return {status:'already-installed',file,original:saved.originalNotify};}
 let original=current;
 if(current && isLegacy(current,stableDir))original=null;
 if(original && (!original.length||typeof original[0]!=='string'||original.some(x=>typeof x!=='string')))throw Error('Cannot preserve invalid original notify');
 const command=[nodeExe,path.join(stableDir,ENTRY)];
 const next=insertNotify(before,command).content;
 // Both snapshots must succeed before Codex is pointed at the dispatcher.
 const configBackup=backup(file);
 const manifestBackup=backup(manifestPath);
 stage(root,stableDir);
 atomicWrite(manifestPath,JSON.stringify({version:1,originalNotify:original,installedBy:'node',createdAt:new Date().toISOString()},null,2)+'\n');
 try{atomicWrite(file,next)}catch(e){
  if(manifestBackup)fs.copyFileSync(manifestBackup,manifestPath);
  else if(fs.existsSync(manifestPath))fs.unlinkSync(manifestPath);
  throw e;
 }
 return {status:'installed',file,configBackup,manifestBackup,original};
}
module.exports={BASE_DIR,MANIFEST,ENTRY,decodeArray,inspectNotify,insertNotify,isManaged,isLegacy,stage,installCodex};
