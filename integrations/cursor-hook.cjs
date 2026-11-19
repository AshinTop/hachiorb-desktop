'use strict';
const {cursorEvent}=require('./agent-events.cjs');
const {send}=require('./local-status.cjs');
function readStdin(max=64*1024){return new Promise((resolve,reject)=>{
 let data='',length=0;
 process.stdin.setEncoding('utf8');process.stdin.on('data',part=>{
  length+=Buffer.byteLength(part);if(length>max){reject(Error('Hook input too large'));process.stdin.pause();return;}data+=part;
 });
 process.stdin.on('end',()=>resolve(data));process.stdin.on('error',reject);
});}
(async()=>{
 const event=process.argv[2];
 // Explicit allow for Cursor's beforeSubmitPrompt observer to avoid disrupting prompts.
 // For other observational hooks, return a valid empty JSON object.
 const response=event==='beforeSubmitPrompt'?{continue:true}:{};
 try{
  const body=await readStdin();const input=body.trim()?JSON.parse(body):{};
  const mapped=cursorEvent(event,input);
  if(mapped)await send(mapped);
 }catch(e){console.error('[HachiOrb Cursor hook]',e.message);}
 process.stdout.write(JSON.stringify(response)+'\n');
})().catch(()=>{process.stdout.write('{}\n')});
