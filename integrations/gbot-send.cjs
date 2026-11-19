'use strict';
/** Local opt-in wrapper for community gbot CLI: submission is NOT task completion. */
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {send}=require('./local-status.cjs');
(async()=>{
 const [target,...parts]=process.argv.slice(2);const message=parts.join(' ');
 if(!target||!message){console.error('Usage: node integrations/gbot-send.cjs <BotName> <message>');process.exitCode=2;return;}
 await send({agent:'grok-bot',state:'thinking',task:`Grok Bot · 准备发送给 ${target}`});
 // Child process receives only user-provided command args; no shell interpolation.
 let command='gbot',args=['send',target,message,'--json'];
 if(process.platform==='win32'){
  // Windows cannot safely spawn .cmd without shell; execute package's JS bin using Node.
  const base=path.join(process.env.APPDATA||'', 'npm','node_modules','grok-bot-cli');
  try{
   const pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
   const rel=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.gbot;
   if(!rel)throw Error('gbot binary not found in package.json');
   command=process.execPath;args=[path.join(base,rel),...args];
  }catch(e){console.error('Install `npm install -g grok-bot-cli`, or call `gbot send` directly:',e.message);process.exitCode=1;return;}
 }
 const child=spawn(command,args,{stdio:'inherit',shell:false});
 child.once('error',async err=>{
  console.error('gbot was not started:',err.message);
  await send({agent:'grok-bot',state:'error',task:'Grok Bot · CLI 无法启动'});process.exitCode=1;
 });
 child.once('exit',async(code,signal)=>{
  if(signal||code!==0){await send({agent:'grok-bot',state:'error',task:`Grok Bot · 消息发送失败`});process.exitCode=code||1;}
  else {await send({agent:'grok-bot',state:'working',task:`Grok Bot · 已提交给 ${target}（非任务完成）`});}
 });
})().catch(e=>{console.error(e.message);process.exitCode=1});
