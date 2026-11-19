'use strict';
/** Explicit Grok Bot status bridge. Does not claim to observe every Grok Bot GUI event. */
const {send}=require('./local-status.cjs');
const allowed=new Set(['idle','thinking','working','done','error','sleep']);
(async()=>{
 const state=process.argv[2];
 if(!allowed.has(state)){console.error('Usage: node integrations/grok-bot-event.cjs <idle|thinking|working|done|error|sleep> [task]');process.exitCode=2;return;}
 const task=(process.argv.slice(3).join(' ')||`Grok Bot · ${state}`).slice(0,100);
 if(!await send({agent:'grok-bot',state,task})){
  console.error('HachiOrb is not running on ports 4173–4175');process.exitCode=1;
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
