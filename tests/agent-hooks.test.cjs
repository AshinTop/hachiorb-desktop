'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {codexEvent,cursorEvent}=require('../integrations/agent-events.cjs');
const {createBridge}=require('../src/bridge.cjs');
const {send}=require('../integrations/local-status.cjs');
function run(file,args=[],input=''){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(__dirname,'..',file),...args],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';p.stdout.on('data',v=>stdout+=v);p.stderr.on('data',v=>stderr+=v);
  p.on('error',reject);p.on('close',(code)=>resolve({code,stdout,stderr}));p.stdin.end(input);
 });
}
test('codex official notify event maps only turn-complete without full prompt',()=>{
 const s=codexEvent({type:'agent-turn-complete',cwd:'C:\\work\\repo', 'input-messages':['secret prompt']});
 assert.equal(s.agent,'codex');assert.equal(s.state,'done');assert.ok(!s.task.includes('secret'));
 assert.equal(codexEvent({type:'unsupported'}),null);
});
test('Cursor event classification respects aborted/error/completed',()=>{
 assert.equal(cursorEvent('beforeSubmitPrompt',{}).state,'thinking');
 assert.equal(cursorEvent('afterAgentThought',{}).state,'working');
 assert.equal(cursorEvent('afterFileEdit',{}).state,'working');
 assert.equal(cursorEvent('stop',{status:'error'}).state,'error');
 assert.equal(cursorEvent('stop',{status:'aborted'}).state,'idle');
 assert.equal(cursorEvent('stop',{status:'completed'}).state,'done');
 assert.equal(cursorEvent('sessionEnd',{}).state,'idle');
});
test('Loopback sender finds ephemeral bridge and does not transmit secrets',async()=>{
 const events=[];const server=createBridge(s=>events.push(s));const port=await server.listen(0);
 const previousHttpProxy=process.env.HTTP_PROXY,previousLowerHttpProxy=process.env.http_proxy;
 try{
  // Node's built-in http client must keep localhost traffic direct even when a desktop proxy is configured.
  process.env.HTTP_PROXY='http://127.0.0.1:10808';process.env.http_proxy='http://127.0.0.1:10808';
  const s=codexEvent({type:'agent-turn-complete',cwd:'C:/projects/sample', 'last-assistant-message':'SECRET'});
  assert.equal(await send(s,{ports:[port]}),true);
  assert.equal(events.length,1);assert.equal(events[0].task.includes('SECRET'),false);
 }finally{
  if(previousHttpProxy===undefined)delete process.env.HTTP_PROXY;else process.env.HTTP_PROXY=previousHttpProxy;
  if(previousLowerHttpProxy===undefined)delete process.env.http_proxy;else process.env.http_proxy=previousLowerHttpProxy;
  await server.close();
 }
});
test('Cursor hook returns valid JSON response even when local desktop is offline',async()=>{
 const result=await run('integrations/cursor-hook.cjs',['beforeSubmitPrompt'],JSON.stringify({prompt:'classified private info'}));
 assert.equal(result.code,0);assert.deepEqual(JSON.parse(result.stdout),{continue:true});
 assert.ok(!result.stdout.includes('classified'));
});
test('Codex hook ignores unsupported event and never prints private payload',async()=>{
 const result=await run('integrations/codex-notify.cjs',[JSON.stringify({type:'unknown',secret:'qwerty'})]);
 assert.equal(result.code,0);assert.equal(result.stdout,'');assert.ok(!result.stderr.includes('qwerty'));
});
test('Grok Bot explicit event rejects unknown state',async()=>{
 const result=await run('integrations/grok-bot-event.cjs',['executing']);assert.equal(result.code,2);
});
