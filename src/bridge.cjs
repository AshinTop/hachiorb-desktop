'use strict';
const http = require('node:http');
const {createAgentPresence} = require('./agent-presence.cjs');
const {version}=require('../package.json');
const STATES = Object.freeze(['idle','thinking','working','done','error','sleep']);
const EMOTIONS = new Set([
 '00','01','02','03','04','05','06','07',
 '10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25',
 '30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46','47'
]);
const DEFAULT_EMOTION = Object.freeze({idle:'02',thinking:'30',working:'32',done:'33',error:'34',sleep:'00'});
const EMOTION_STATE = Object.freeze({
 '00':'sleep','01':'idle','02':'idle','03':'idle','04':'idle','05':'thinking','06':'sleep','07':'idle',
 '10':'done','11':'idle','12':'error','13':'idle','14':'idle','15':'sleep','16':'working',
 '17':'error','18':'idle','19':'done','20':'thinking','21':'error',
 '22':'done','23':'idle','24':'idle','25':'done',
 '30':'thinking','31':'working','32':'working','33':'done','34':'error','35':'idle',
 '36':'thinking','37':'thinking','38':'error','39':'working','40':'thinking','41':'idle',
 '42':'done','43':'idle','44':'working','45':'idle','46':'error','47':'done'
});
const noop = () => {};
function validate(input) {
 if(!input || typeof input!=='object' || Array.isArray(input)) throw Error('JSON object required');
 if(!STATES.includes(input.state)) throw Error('state must be one of: '+STATES.join(', '));
 const emotionId = input.emotionId ?? DEFAULT_EMOTION[input.state];
 if(typeof emotionId!=='string'||!EMOTIONS.has(emotionId)) throw Error('Unsupported Grok Ball emotionId');
 if(input.progress != null && (!Number.isFinite(input.progress)||input.progress<0||input.progress>100)) throw Error('Invalid progress');
 if(input.attention != null && !['permission','input'].includes(input.attention))throw Error('Invalid attention');
 if(input.attention != null && input.state!=='idle')throw Error('Attention requires idle state');
 return {
  state:input.state,emotionId,
  task:(typeof input.task==='string'?input.task.trim().slice(0,100):'')||'等待新任务',
  agent:(typeof input.agent==='string'?input.agent.trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,40):'')||'manual',
  attention:input.attention??null,
  progress:input.progress??null
 };
}
function respond(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function createBridge(onChange = noop,options={}) {
 const tracker=createAgentPresence(options);
 let state = {...validate({state:'idle'}), agents:[],revision:0,updatedAt:new Date().toISOString()};
 let server;
 function sync(snapshot,{emit=true}={}){
  state={...snapshot.focus,agents:snapshot.agents,revision:state.revision+(emit?1:0),updatedAt:new Date().toISOString()};
  if(emit)onChange(state);
  return state;
 }
 function commit(input){return sync(tracker.record(validate(input)));}
 function refresh(){
  const next=tracker.snapshot();
  const unchanged=state.agent===next.focus.agent && state.state===next.focus.state &&
   state.attention===next.focus.attention && state.emotionId===next.focus.emotionId && state.task===next.focus.task;
  if(!unchanged)return sync(next);
  // Keep history freshness available even when visible focus has not changed.
  state={...state,agents:next.agents};
  return state;
 }
 function route(req,res){
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;}catch{return respond(res,400,{error:'Bad URL'});}
  if(req.method==='GET' && path==='/api/health')return respond(res,200,{ok:true,app:'HachiOrb',version});
  if(req.method==='GET' && path==='/api/state')return respond(res,200,state);
  if(req.method==='POST' && path==='/api/state'){
   // Blocks untrusted browser origins; CLI clients (no Origin) are allowed on loopback only.
   const origin=req.headers.origin;
   if(origin){
    try{const u=new URL(origin); if(!['localhost','127.0.0.1'].includes(u.hostname)||u.host!==req.headers.host||u.protocol!=='http:')return respond(res,403,{error:'Forbidden Origin'});}catch{return respond(res,403,{error:'Bad Origin'});}
   }
   if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return respond(res,415,{error:'Expected application/json'});
   let bytes=0,chunks=[],oversize=false;
   req.on('data',b=>{
    if(oversize)return;bytes+=b.length;
    if(bytes>16384){oversize=true;respond(res,413,{error:'Payload too large'});return;}
    chunks.push(b);
   });
   req.on('end',()=>{
    if(oversize)return;
    try{respond(res,200,commit(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}
    catch(e){respond(res,400,{error:e.message})}
   });
   return;
  }
  respond(res,404,{error:'Not Found'});
 }
 async function listen(port=4173){
  if(server)throw Error('Already listening');
  for(const attempt of (port===0?[0]:[port,4174,4175])){
   const candidate=http.createServer(route);
   try{
    await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(attempt,'127.0.0.1',()=>{candidate.off('error',reject);resolve()})});
    server=candidate;return server.address().port;
   }catch(e){if(e.code!=='EADDRINUSE')throw e;}
  }
  throw Error('No available localhost status port (4173/4174/4175)');
 }
 async function close(){if(!server)return;const s=server;server=null;await new Promise(resolve=>s.close(resolve));}
 return {listen,close,commit,refresh,getState:()=>state};
}
module.exports={createBridge,validate,STATES,EMOTIONS,DEFAULT_EMOTION,EMOTION_STATE};
