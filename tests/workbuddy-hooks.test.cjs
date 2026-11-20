'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {workbuddyEvent}=require('../integrations/agent-events.cjs');
const {setupWorkBuddy,WORKBUDDY_EVENTS}=require('../scripts/setup-integrations.cjs');
const root=path.join(__dirname,'..');
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hachi-wb-'));return {dir,home:path.join(dir,'home'),stableDir:path.join(dir,'stable')}}
function run(ctx){return setupWorkBuddy({root,home:ctx.home,stableDir:ctx.stableDir})}
function filename(ctx){return path.join(ctx.home,'.workbuddy','settings.json')}
function clean(ctx){fs.rmSync(ctx.dir,{recursive:true,force:true})}
test('WorkBuddy hooks map key lifecycle and never forward prompt content',()=>{
 const sensitive={prompt:'PRIVATE MESSAGE',tool_input:{password:'PRIVATE KEY'},last_assistant_message:'SECRET',session_id:'abc123'};
 const expected={SessionStart:'idle',UserPromptSubmit:'thinking',PreToolUse:'working',PostToolUse:'thinking',PermissionRequest:'idle',Stop:'done',SessionEnd:'idle'};
 for(const [event,state] of Object.entries(expected)){
  const mapped=workbuddyEvent(event,sensitive); assert.equal(mapped.state,state); assert.equal(mapped.agent,'workbuddy');
  assert.ok(!JSON.stringify(mapped).includes('PRIVATE'));assert.ok(!JSON.stringify(mapped).includes('SECRET'));
 }
 assert.equal(workbuddyEvent('PermissionRequest',sensitive).emotionId,'35');
 assert.equal(workbuddyEvent('PermissionRequest',sensitive).attention,'permission');
 assert.equal(workbuddyEvent('Notification',{notification_type:'permission_prompt'}).attention,'permission');
 assert.equal(workbuddyEvent('Notification',{notification_type:'idle_prompt'}).emotionId,'35');
 assert.equal(workbuddyEvent('Notification',{notification_type:'idle_prompt'}).attention,'input');
 assert.equal(workbuddyEvent('Notification',{notification_type:'other',prompt:'SECRET'}),null);
 assert.equal(workbuddyEvent('RandomEvent',sensitive),null);
 assert.match(fs.readFileSync(path.join(root,'integrations/agent-status.ps1'),'utf8'),/'PostToolUse' \{ \$state='thinking'/);
});
test('Installer safely merges other WorkBuddy hooks, backs up, and reruns idempotently',()=>{
 const ctx=temp(),file=filename(ctx);fs.mkdirSync(path.dirname(file),{recursive:true});
 const original={locale:'zh-CN',hooks:{Stop:[{matcher:'',hooks:[{type:'command',command:'original-app.exe'}]}],CustomEvent:[{hooks:[{type:'command',command:'other-tool'}]}]}};
 fs.writeFileSync(file,JSON.stringify(original));
 const result=run(ctx);assert.equal(result.status,'installed');
 const now=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.deepEqual(now.hooks.CustomEvent,original.hooks.CustomEvent);
 assert.equal(now.hooks.Stop[0].hooks[0].command,'original-app.exe');
 for(const event of WORKBUDDY_EVENTS){
  const hooks=now.hooks[event];assert.ok(Array.isArray(hooks));
  assert.equal(hooks.flatMap(x=>x.hooks).filter(h=>h.command?.includes('workbuddy:'+event)).length,1);
 }
 assert.equal(run(ctx).status,'already-installed');
 assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(now,null,2)+'\n');
 assert.equal(fs.readdirSync(path.dirname(file)).filter(x=>x.includes('hachiorb-backup')).length,1);
 clean(ctx);
});
test('Installer refuses malformed WorkBuddy config without modifying it',()=>{
 for(const raw of ['{oops',JSON.stringify({hooks:{Stop:{bad:true}}}),JSON.stringify({hooks:{Stop:[{matcher:''}]}}),JSON.stringify({hooks:[]})]){
  const ctx=temp(),file=filename(ctx);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,raw);
  assert.throws(()=>run(ctx));assert.equal(fs.readFileSync(file,'utf8'),raw);clean(ctx);
 }
});
test('WorkBuddy handler emits valid JSON and does not echo private messages while HachiOrb is offline',()=>{
 const hook=path.join(root,'integrations','workbuddy-hook.cjs');
 const run=spawnSync(process.execPath,[hook,'UserPromptSubmit'],{input:JSON.stringify({prompt:'SECRET TOKEN',session_id:'abc'}),encoding:'utf8',timeout:8000,env:{...process.env,HACHI_STATUS_PORTS:''}});
 assert.equal(run.status,0);assert.equal(run.stdout.trim(),'{}');assert.doesNotMatch(run.stderr,/SECRET|TOKEN/);
});
test('Windows fallback stages WorkBuddy and avoids private payload or cloud services',()=>{
 const ps=fs.readFileSync(path.join(root,'scripts/setup-agent-hooks.ps1'),'utf8');
 const installer=fs.readFileSync(path.join(root,'scripts/setup-integrations.cjs'),'utf8');
 const handler=fs.readFileSync(path.join(root,'integrations/agent-status.ps1'),'utf8');
 const bat=fs.readFileSync(path.join(root,'setup-agent-hooks-windows.bat'),'utf8');
 assert.match(ps,/Install-WorkBuddy/);assert.match(ps,/setup-integrations\.cjs/);assert.match(ps,/--workbuddy/);assert.ok(installer.includes("path.join(home,'.workbuddy','settings.json')"));
 assert.match(handler,/workbuddy:/);assert.match(handler,/PermissionRequest/);assert.match(handler,/\$statusPayload\.attention=\$attention/);assert.match(handler,/127\.0\.0\.1/);
 assert.match(bat,/WorkBuddy/);
});
