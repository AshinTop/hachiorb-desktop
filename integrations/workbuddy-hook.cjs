'use strict';
/** WorkBuddy Desktop observer Hook. Never transmit prompt, tool input or output. */
const {workbuddyEvent}=require('./agent-events.cjs');
const {send}=require('./local-status.cjs');
const VALID=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Notification','Stop','SessionEnd']);
async function readStdin(limit=65536){
 return new Promise((resolve,reject)=>{
  let data='',total=0,done=false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{
   if(done)return;
   total+=Buffer.byteLength(chunk);
   if(total>limit){done=true;process.stdin.pause();reject(new Error('Hook event too large'));return;}
   data+=chunk;
  });
  process.stdin.once('end',()=>{if(!done)resolve(data)});
  process.stdin.once('error',reject);
 });
}
async function main(kind=process.argv[2]){
 if(typeof kind==='string'&&kind.startsWith('workbuddy:'))kind=kind.slice('workbuddy:'.length);
 if(!VALID.has(kind))return;
 try{
  const raw=await readStdin();
  const data=raw.trim()?JSON.parse(raw):{};
  const state=workbuddyEvent(kind,data);
  if(state)await send(state);
 }catch{
  // A status indicator must not interrupt WorkBuddy's task.
 }
}
if(require.main===module)main().finally(()=>process.stdout.write('{}\n'));
module.exports={main,readStdin,VALID};
