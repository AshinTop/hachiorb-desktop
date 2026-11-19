'use strict';
/** Non-destructive user-level installation of official Codex/Cursor hooks. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const home=os.homedir();
const hook=path.join(root,'integrations','cursor-hook.cjs');
const cmd=name=>`node "${hook.replace(/\\/g,'/')}" ${name}`;
function setupCursor(){
 const file=path.join(home,'.cursor','hooks.json');let data={version:1,hooks:{}};
 if(fs.existsSync(file)){
  try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){throw Error('Existing Cursor hooks.json could not be parsed; nothing was changed: '+e.message);}
 }
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid Cursor config; not changing file');
 if(data.version!==1)throw Error('Unsupported Cursor hooks schema version: '+data.version);
 if(!data.hooks||typeof data.hooks!=='object')data.hooks={};
 for(const event of ['beforeSubmitPrompt','afterAgentThought','afterFileEdit','stop','sessionEnd']){
  if(!Array.isArray(data.hooks[event]))data.hooks[event]=[];
  const desired=cmd(event);
  if(!data.hooks[event].some(item=>item&&item.command===desired))data.hooks[event].push({command:desired});
 }
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file))fs.copyFileSync(file,file+'.hachiorb-backup');
 fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
 console.log('✓ Cursor hooks installed globally:',file);
 console.log('  Previous config backup: '+file+'.hachiorb-backup');
}
function setupCodex(){
 const file=path.join(home,'.codex','config.toml');let content='';
 if(fs.existsSync(file))content=fs.readFileSync(file,'utf8');
 // Never overwrite another tool's notify command. Codex config supports only one notify entry.
 if(/^\s*notify\s*=/m.test(content)){
  console.log('! Found existing Codex notify. Preserved without changes; merge manually:');
  console.log('  notify = '+JSON.stringify(['node',path.join(root,'integrations','codex-notify.cjs')]));
  return;
 }
 const snippet='notify = '+JSON.stringify(['node',path.join(root,'integrations','codex-notify.cjs')])+'\n';
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file))fs.copyFileSync(file,file+'.hachiorb-backup');
 fs.writeFileSync(file,snippet+content);
 console.log('✓ Codex agent-turn-complete notify configured:',file);
 console.log('  Note: Codex officially only emits turn-complete here (not live working stages).');
}
try{
 const args=new Set(process.argv.slice(2));
 if(args.has('--all')||args.size===0){setupCodex();setupCursor();}
 else {if(args.has('--codex'))setupCodex();if(args.has('--cursor'))setupCursor();}
}catch(e){console.error('Setup failed:',e.message);process.exitCode=1;}
