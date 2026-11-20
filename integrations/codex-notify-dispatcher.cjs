'use strict';
/** Fan out Codex's single JSON argument to original notifier, then HachiOrb.
 * No shell evaluation, no persistence of event contents, no remote network.
 */
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const DIR=__dirname;
const MANIFEST=path.join(DIR,'codex-original-notify.json');

function readOriginal(manifestPath=MANIFEST){
 const data=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(data.version!==1||!(data.originalNotify===null||Array.isArray(data.originalNotify)))throw Error('Unsupported dispatcher manifest');
 const cmd=data.originalNotify;
 if(cmd && (!cmd.length||typeof cmd[0]!=='string'||!cmd[0].trim()||cmd.some(a=>typeof a!=='string')))throw Error('Invalid saved original notify');
 if(cmd && cmd.some(a=>/codex-notify-dispatcher\.(cjs|ps1)/i.test(a)))throw Error('Refusing recursive notify dispatcher');
 return cmd;
}
function spawnOnce(cmd,raw,{timeoutMs=12000,env=process.env}={}){
 return new Promise(resolve=>{
  let ended=false,child,timer;
  const finish=(result)=>{if(ended)return;ended=true;clearTimeout(timer);resolve(result);};
  try{
   child=spawn(cmd[0],[...cmd.slice(1),raw],{stdio:'ignore',shell:false,windowsHide:true,env});
   timer=setTimeout(()=>{child.kill();finish({ok:false,reason:'timeout'});},timeoutMs);
   if(timer.unref)timer.unref();
   child.once('error',e=>finish({ok:false,reason:e.code||'spawn-error'}));
   child.once('close',code=>finish({ok:code===0,reason:code===0?'ok':'exit-'+code}));
  }catch(e){finish({ok:false,reason:e.code||'spawn-error'});}
 });
}
async function dispatch(raw,{manifestPath=MANIFEST,hachiCommand=[process.execPath,path.join(DIR,'codex-notify.cjs')],run=spawnOnce}={}){
 if(typeof raw!=='string'||!raw)return {original:'missing-event',hachi:'missing-event'};
 let original=null;
 try{original=readOriginal(manifestPath)}catch(e){
  // Even if the manifest was lost, keep the HachiOrb path working.
  console.error('[HachiOrb] Original Codex notify unavailable:',e.message);
 }
 let origResult={ok:true,reason:'not-configured'};
 if(original){origResult=await run(original,raw);if(!origResult.ok)console.error('[HachiOrb] Previous Codex notify failed:',origResult.reason);}
 const hachiResult=await run(hachiCommand,raw);
 if(!hachiResult.ok)console.error('[HachiOrb] HachiOrb notify failed:',hachiResult.reason);
 return {original:origResult.reason,hachi:hachiResult.reason};
}
if(require.main===module){dispatch(process.argv[2]).catch(e=>{console.error('[HachiOrb] Dispatcher error:',e.message);});}
module.exports={readOriginal,spawnOnce,dispatch};
