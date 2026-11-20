'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {codexEvent,codexHookEvent,cursorEvent}=require('../integrations/agent-events.cjs');
const {createBridge}=require('../src/bridge.cjs');
const {send,configuredPorts}=require('../integrations/local-status.cjs');
function run(file,args=[],input='',env=process.env){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(__dirname,'..',file),...args],{stdio:['pipe','pipe','pipe'],env});
  let stdout='',stderr='';p.stdout.on('data',v=>stdout+=v);p.stderr.on('data',v=>stderr+=v);
  p.on('error',reject);p.on('close',(code)=>resolve({code,stdout,stderr}));p.stdin.end(input);
 });
}
test('codex official notify event maps only turn-complete without full prompt',()=>{
 const s=codexEvent({type:'agent-turn-complete',cwd:'C:\\work\\repo', 'input-messages':['secret prompt']});
 assert.equal(s.agent,'codex');assert.equal(s.state,'done');assert.ok(!s.task.includes('secret'));
 assert.equal(codexEvent({type:'unsupported'}),null);
});
test('Codex lifecycle events distinguish thinking, tools, permission, subagents, and stop',()=>{
 assert.equal(codexHookEvent('UserPromptSubmit').state,'thinking');
 assert.equal(codexHookEvent('PreToolUse').state,'working');
 assert.equal(codexHookEvent('PostToolUse').state,'thinking');
 assert.deepEqual(codexHookEvent('PermissionRequest'),{agent:'codex',state:'idle',emotionId:'35',attention:'permission',task:'Codex 等待授权'});
 assert.equal(codexHookEvent('SubagentStart').agent,'codex');assert.equal(codexHookEvent('SubagentStart').state,'working');
 assert.equal(codexHookEvent('SubagentStop').state,'thinking');
 assert.equal(codexHookEvent('Stop').state,'done');
 assert.equal(codexHookEvent('Interrupt').state,'idle');
 assert.equal(codexHookEvent('unsupported'),null);
});
test('test subprocesses can disable all local status delivery',()=>{
 assert.deepEqual(configuredPorts(''),[]);
 assert.deepEqual(configuredPorts('4174, 4175'),[4174,4175]);
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
 const result=await run('integrations/cursor-hook.cjs',['beforeSubmitPrompt'],JSON.stringify({prompt:'classified private info'}),{...process.env,HACHI_STATUS_PORTS:''});
 assert.equal(result.code,0);assert.deepEqual(JSON.parse(result.stdout),{continue:true});
 assert.ok(!result.stdout.includes('classified'));
});
test('Codex hook ignores unsupported event and never prints private payload',async()=>{
 const result=await run('integrations/codex-notify.cjs',[JSON.stringify({type:'unknown',secret:'qwerty'})]);
 assert.equal(result.code,0);assert.equal(result.stdout,'');assert.ok(!result.stderr.includes('qwerty'));
});
test('Codex lifecycle hook reports a fixed status and never echoes prompt JSON',async()=>{
 const events=[];const server=createBridge(s=>events.push(s));const port=await server.listen(0);
 try{
  const result=await run('integrations/codex-hook.cjs',['UserPromptSubmit'],JSON.stringify({prompt:'SECRET PROMPT',cwd:'C:/private/path'}),{...process.env,HACHI_STATUS_PORTS:String(port)});
  assert.equal(result.code,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  assert.equal(events.length,1);assert.equal(events[0].agent,'codex');assert.equal(events[0].state,'thinking');
  assert.equal(events[0].task,'Codex 正在思考');assert.ok(!JSON.stringify(events[0]).includes('SECRET'));
 }finally{await server.close();}
});
test('Grok Bot explicit event rejects unknown state',async()=>{
 const result=await run('integrations/grok-bot-event.cjs',['executing']);assert.equal(result.code,2);
});
