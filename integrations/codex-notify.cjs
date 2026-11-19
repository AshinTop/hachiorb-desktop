'use strict';
const {codexEvent}=require('./agent-events.cjs');
const {send}=require('./local-status.cjs');
(async()=>{
 try{
  const input=JSON.parse(process.argv[2]||'{}');
  const mapped=codexEvent(input);
  if(mapped)await send(mapped);
 }catch(e){console.error('[HachiOrb Codex hook]',e.message);}
})().catch(()=>{});
