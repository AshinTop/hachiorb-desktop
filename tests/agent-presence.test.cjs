'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAgentPresence}=require('../src/agent-presence.cjs');
const {validate,createBridge}=require('../src/bridge.cjs');
const {agentName,stateName}=require('../src/status-display.js');
function fixture(){
 let time=1000000;
 const presence=createAgentPresence({now:()=>time,ttl:{manual:100,attention:600,busy:1000,terminal:200,history:2000}});
 const report=(agent,state,extra={})=>presence.record(validate({agent,state,...extra}));
 return {report,advance:ms=>{time+=ms;return presence.snapshot()},snapshot:()=>presence.snapshot()};
}
test('four Agents keep separate last reported states without idle stealing a working foreground',()=>{
 const f=fixture();
 f.report('cursor','working');f.advance(1);
 f.report('codex','done');f.advance(1);
 f.report('grok-bot','thinking');f.advance(1);
 const state=f.report('workbuddy','idle');
 assert.equal(state.agents.length,4);
 assert.equal(state.focus.agent,'grok-bot');
 assert.equal(state.focus.state,'thinking');
 assert.equal(state.agents.find(x=>x.agent==='cursor').state,'working');
 assert.equal(state.agents.find(x=>x.agent==='codex').state,'done');
});
test('WorkBuddy permission and waiting-answer reports interrupt activity but do not stay forever',()=>{
 const f=fixture();
 f.report('codex','working');f.advance(5);
 let s=f.report('workbuddy','idle',{attention:'permission',emotionId:'35'});
 assert.equal(s.focus.agent,'workbuddy');assert.equal(s.focus.attention,'permission');
 assert.equal(stateName(s.focus),'等待授权');
 f.advance(5);
 s=f.report('workbuddy','idle',{attention:'input',emotionId:'35'});
 assert.equal(s.focus.attention,'input');assert.equal(stateName(s.focus),'等待回答');
 s=f.advance(601);
 assert.equal(s.focus.agent,'codex');
 assert.equal(s.focus.state,'working');
 assert.equal(s.agents.find(x=>x.agent==='workbuddy').stale,true);
 f.report('codex','idle');
 s=f.snapshot();
 assert.equal(s.focus.attention,null);
 assert.equal(s.focus.emotionId,'02');
 assert.notEqual(stateName(s.focus),'等待回答');
});
test('a terminal event does not hide an active Agent; error appears when no busy Agent remains',()=>{
 const f=fixture();
 f.report('cursor','working');f.advance(2);
 let s=f.report('workbuddy','done');assert.equal(s.focus.agent,'cursor');
 f.advance(2);
 s=f.report('cursor','done');assert.equal(s.focus.agent,'cursor');
 f.advance(2);
 s=f.report('grok-bot','error');assert.equal(s.focus.agent,'grok-bot');
 s=f.advance(201);assert.equal(s.focus.state,'idle');
});
test('manual menu selection overrides active state briefly and then returns automatically',()=>{
 const f=fixture();
 f.report('cursor','working');f.advance(2);
 let s=f.report('manual','done',{emotionId:'10'});
 assert.equal(s.focus.agent,'manual');assert.equal(s.focus.emotionId,'10');
 s=f.advance(101);assert.equal(s.focus.agent,'cursor');
 assert.equal(s.agents.find(x=>x.agent==='manual').stale,true);
});
test('an incoming WorkBuddy permission prompt takes precedence over manual expression preview',()=>{
 const f=fixture();
 f.report('manual','done',{emotionId:'10'});f.advance(10);
 const s=f.report('workbuddy','idle',{attention:'permission',emotionId:'35'});
 assert.equal(s.focus.agent,'workbuddy');assert.equal(s.focus.attention,'permission');
});
test('active states expire rather than pretending an Agent is still connected',()=>{
 const f=fixture();f.report('cursor','working');
 let s=f.advance(1001);
 assert.equal(s.focus.agent,'manual');assert.equal(s.focus.state,'idle');
 assert.equal(s.agents.find(x=>x.agent==='cursor').stale,true);
 s=f.advance(1100);assert.equal(s.agents.length,0);
});
test('status report list is bounded under many unknown Agent names',()=>{
 const f=fixture();
 for(let i=0;i<20;i++){f.report('custom-'+i,'idle');f.advance(1)}
 assert.equal(f.snapshot().agents.length,16);
});
test('attention validates strict safe values and status labels are neutral',()=>{
 assert.equal(validate({state:'idle',agent:'workbuddy',attention:'permission'}).attention,'permission');
 assert.throws(()=>validate({state:'working',attention:'permission'}));
 assert.throws(()=>validate({state:'idle',attention:'password'}));
 assert.equal(agentName('grok-bot'),'Grok Bot');assert.equal(agentName('workbuddy'),'WorkBuddy');
 assert.equal(stateName({state:'done'}),'本轮完成');
});
test('HTTP bridge retains per-Agent history and GET focus returns selected active channel',async()=>{
 const bridge=createBridge();const port=await bridge.listen(0);
 try{
  const endpoint=`http://127.0.0.1:${port}/api/state`;
  const send=async body=>{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json()};
  await send({agent:'cursor',state:'working'});
  const response=await send({agent:'codex',state:'done'});
  assert.equal(response.agent,'cursor');assert.equal(response.state,'working');
  assert.equal(response.agents.length,2);assert.equal(response.revision,2);
  const state=await (await fetch(endpoint)).json();
  assert.equal(state.agent,'cursor');assert.equal(state.agents.find(x=>x.agent==='codex').state,'done');
  await send({agent:'workbuddy',state:'idle',attention:'permission',emotionId:'35'});
  const awaiting=await (await fetch(endpoint)).json();
  assert.equal(awaiting.agent,'workbuddy');assert.equal(awaiting.attention,'permission');
 }finally{await bridge.close()}
});
