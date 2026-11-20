'use strict';
/** Last reported state per Agent, with bounded, time-limited arbitration.
 * This is not a connection detector: hooks report events, not process liveness.
 * Sessions within the same Agent are intentionally not distinguished here.
 */
const DEFAULT_TTL = Object.freeze({
  manual:8000,
  attention:10*60*1000,
  busy:20*60*1000,
  terminal:20*1000,
  history:24*60*60*1000
});
const EMPTY = Object.freeze({
  state:'idle',emotionId:'02',task:'等待新任务',agent:'manual',progress:null,attention:null
});
const ACTIVE_STATES = new Set(['working','thinking']);
function rank(entry,at,ttl){
  const age=Math.max(0,at-entry.receivedAt);
  if(entry.value.agent==='manual')return age<ttl.manual?700:-1;
  if(entry.value.attention && age<ttl.attention)return 800;
  if(entry.value.state==='error' && age<ttl.terminal)return 500;
  if(ACTIVE_STATES.has(entry.value.state) && age<ttl.busy)return 400;
  if(entry.value.state==='done' && age<ttl.terminal)return 300;
  if(entry.value.state==='idle'||entry.value.state==='sleep')return 100;
  return -1;
}
function shown(entry,at,ttl){
  if(entry.value.attention && at-entry.receivedAt>=ttl.attention){
    return {...entry.value,attention:null,emotionId:'02',task:'等待新任务'};
  }
  return entry.value;
}
function createAgentPresence({now=()=>Date.now(), ttl=DEFAULT_TTL}={}){
  const entries=new Map();
  const durations={...DEFAULT_TTL,...ttl};
  function snapshot(){
    const timestamp=now();
    // Prune stale historical entries to keep tray data small; no remote identity inference.
    for(const [agent,entry] of entries){
      if(timestamp-entry.receivedAt>durations.history)entries.delete(agent);
    }
    const ordered=[...entries.values()].sort((a,b)=>b.receivedAt-a.receivedAt || b.sequence-a.sequence);
    const ranked=ordered.map(entry=>({entry,priority:rank(entry,timestamp,durations)}));
    ranked.sort((a,b)=>b.priority-a.priority || b.entry.receivedAt-a.entry.receivedAt || b.entry.sequence-a.entry.sequence);
    const focus=ranked[0]?.priority>=0?shown(ranked[0].entry,timestamp,durations):EMPTY;
    return {
      focus:{...focus},
      agents:ordered.map(entry=>({
        agent:entry.value.agent,state:entry.value.state,attention:entry.value.attention,
        emotionId:entry.value.emotionId,reportedAt:new Date(entry.receivedAt).toISOString(),
        stale:rank(entry,timestamp,durations)<0 || !!(entry.value.attention && timestamp-entry.receivedAt>=durations.attention)
      }))
    };
  }
  let sequence=0;
  function record(value){
    entries.set(value.agent,{value:{...value},receivedAt:now(),sequence:++sequence});
    if(entries.size>16){
      const oldest=[...entries].sort((a,b)=>a[1].receivedAt-b[1].receivedAt || a[1].sequence-b[1].sequence)[0];
      entries.delete(oldest[0]);
    }
    return snapshot();
  }
  return {record,snapshot};
}
module.exports={createAgentPresence,rank,DEFAULT_TTL};
