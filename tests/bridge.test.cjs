'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBridge,validate,EMOTIONS,EMOTION_STATE}=require('../src/bridge.cjs');
const {gitBlobHash}=require('../scripts/bootstrap.cjs');
test('six agent states map to correct original Grok emotion IDs',()=>{
 const map={idle:'02',thinking:'30',working:'32',done:'33',error:'34',sleep:'00'};
 for(const [state,id] of Object.entries(map))assert.equal(validate({state}).emotionId,id);
});
test('all 32 upstream emotion IDs accepted and mapped',()=>{
 assert.equal(EMOTIONS.size,32);
 for(const id of EMOTIONS){assert.ok(EMOTION_STATE[id]);assert.equal(validate({state:'idle',emotionId:id}).emotionId,id)}
});
test('invalid inputs rejected, text fields bounded',()=>{
 assert.throws(()=>validate({state:'unknown'}));
 assert.throws(()=>validate({state:'thinking',emotionId:'77'}));
 assert.throws(()=>validate({state:'thinking',progress:101}));
 assert.throws(()=>validate({state:'working',progress:-1}));
 assert.throws(()=>validate({state:'done',progress:'80'}));
 const s=validate({state:'working',task:'  '+('字'.repeat(150))+'  ',agent:'codex'});
 assert.equal(s.task.length,100);assert.equal(s.agent,'codex');
});
test('Git blob hash matches content format',()=>{
 const bytes=Buffer.from('hello');
 const {createHash}=require('node:crypto');
 const expected=createHash('sha1').update(Buffer.from('blob 5\0hello')).digest('hex');
 assert.equal(gitBlobHash(bytes),expected);
});
test('loopback HTTP GET, POST, invalid payload, cross-origin blocking',async()=>{
 const events=[];const app=createBridge(s=>events.push(s));const port=await app.listen(0);
 try{
  const origin=`http://127.0.0.1:${port}`;
  let r=await fetch(origin+'/api/health');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
  r=await fetch(origin+'/api/state');assert.equal((await r.json()).emotionId,'02');
  r=await fetch(origin+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'working',task:'处理估价报告',agent:'codex'})});
  assert.equal(r.status,200);assert.equal((await r.json()).emotionId,'32');
  assert.equal(events.length,1);assert.equal(events[0].task,'处理估价报告');
  r=await fetch(origin+'/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify({state:'error'})});
  assert.equal(r.status,403);
  r=await fetch(origin+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:'not json'});assert.equal(r.status,400);
  r=await fetch(origin+'/api/state',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(r.status,415);
  assert.equal(app.getState().revision,1);
 }finally{await app.close()}
});
