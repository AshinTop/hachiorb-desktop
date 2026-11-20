'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const {decodeArray,inspectNotify,installCodex,MANIFEST}=require('../scripts/codex-notify-config.cjs');
const {dispatch,readOriginal}=require('../integrations/codex-notify-dispatcher.cjs');
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hachiorb-notify-test-'));return {dir,home:path.join(dir,'home'),stableDir:path.join(dir,'AppData Local','HachiOrb','hooks')};}
function prepare(context,config){const file=path.join(context.home,'.codex','config.toml');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,config);return file;}
function install(ctx){return installCodex({root,home:ctx.home,stableDir:ctx.stableDir,nodeExe:process.execPath});}
function fixture(ctx){return JSON.parse(fs.readFileSync(path.join(ctx.stableDir,MANIFEST),'utf8'));}
test('Codex TOML parses literal, double-quoted, multiline arrays and section boundaries',()=>{
 assert.deepEqual(decodeArray(` ["C:\\\\Program Files\\\\node.exe", 'literal', # comment\n "--flag",]`,0).args,['C:\\Program Files\\node.exe','literal','--flag']);
 const sample=`model = 'test'\nnotify = [\n  'C:\\Agent\\notify.exe', # preserve\n  '--color',\n]\n[features]\nnotify = ['nested-notifier']\n`;
 assert.deepEqual(inspectNotify(sample).notify.args,['C:\\Agent\\notify.exe','--color']);
 const onlySection=`[some_section]\nnotify = ['foo']\n`;
 assert.equal(inspectNotify(onlySection).notify,null);
});
test('Install keeps original notify, backs up config, and leaves unrelated TOML untouched',()=>{
 const ctx=temp(),old=['C:\\Program Files\\Notifier\\notify.exe','--title','original'];
 const config=`model = 'original'\nnotify = ${JSON.stringify(old)} # existing user notification\n[projects.\"D:\\\\Example\"]\ntrust_level = 'trusted'\n`;
 const file=prepare(ctx,config);const result=install(ctx);
 assert.equal(result.status,'installed');
 assert.deepEqual(fixture(ctx).originalNotify,old);
 const content=fs.readFileSync(file,'utf8');
 const parsed=inspectNotify(content);assert.equal(parsed.notify.args[0],process.execPath);
 assert.equal(parsed.notify.args[1],path.join(ctx.stableDir,'codex-notify-dispatcher.cjs'));
 assert.match(content,/model = 'original'/);
 assert.match(content,/trust_level = 'trusted'/);
 assert.equal(fs.readFileSync(result.configBackup,'utf8'),config);
 for(const name of ['codex-notify-dispatcher.cjs','codex-notify-dispatcher.ps1','agent-events.cjs','codex-notify.cjs','agent-status.ps1','local-status.cjs']){
  assert.ok(fs.existsSync(path.join(ctx.stableDir,name)),name);
 }
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Rerun installer is idempotent, preserves manifest and does not create additional backup',()=>{
 const ctx=temp();const file=prepare(ctx,`notify = ['python', 'notify.py']\n`);
 install(ctx);const once=fs.readFileSync(file,'utf8');const manifestBefore=fs.readFileSync(path.join(ctx.stableDir,MANIFEST),'utf8');
 const result=install(ctx);assert.equal(result.status,'already-installed');
 assert.equal(fs.readFileSync(file,'utf8'),once);
 assert.equal(fs.readFileSync(path.join(ctx.stableDir,MANIFEST),'utf8'),manifestBefore);
 const backups=fs.readdirSync(path.dirname(file)).filter(n=>n.startsWith('config.toml.hachiorb-backup-'));
 assert.equal(backups.length,1);
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Incomplete/unsafe Codex config must be left untouched and no manifest created',()=>{
 const unsafe=[`notify = { command = 'no' }\n`,`notify = ["broken"\n`,`notify = ["a"]\nnotify = ["b"]\n`,`notify = ["a"] junk\n`,`notify = [123]\n`,`notify = ["x"]\nnotes = """multi"""\n`,`notify = ["other", "my-codex-notify-dispatcher.cjs"]\n`];
 for(const config of unsafe){const ctx=temp();const file=prepare(ctx,config);
  assert.throws(()=>install(ctx));assert.equal(fs.readFileSync(file,'utf8'),config);
  assert.ok(!fs.existsSync(path.join(ctx.stableDir,MANIFEST)));
  fs.rmSync(ctx.dir,{recursive:true,force:true});
 }
});
test('Installed dispatcher without saved manifest is rejected to prevent losing original',()=>{
 const ctx=temp();const line=`notify = ${JSON.stringify([process.execPath,path.join(ctx.stableDir,'codex-notify-dispatcher.cjs')])}\n`;
 const file=prepare(ctx,line);assert.throws(()=>install(ctx),/without saved original/);
 assert.equal(fs.readFileSync(file,'utf8'),line);
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Legacy HachiOrb direct hook is upgraded without treating it as another tool',()=>{
 const ctx=temp();prepare(ctx,`notify = ${JSON.stringify(['node','C:\\HachiOrb\\integrations\\codex-notify.cjs'])}\n`);
 const result=install(ctx);assert.equal(result.status,'installed');assert.equal(fixture(ctx).originalNotify,null);
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Dispatcher invokes original first and then HachiOrb with identical raw JSON',async()=>{
 const ctx=temp();fs.mkdirSync(ctx.stableDir,{recursive:true});const output=path.join(ctx.dir,'log.jsonl');
 const handler=path.join(ctx.dir,'notify.cjs');
 fs.writeFileSync(handler,`const fs=require('fs');fs.appendFileSync(process.argv[2], JSON.stringify({hook:process.argv[3],payload:process.argv[4]})+'\\n');`);
 const original=[process.execPath,handler,output,'original'];const hachi=[process.execPath,handler,output,'hachiorb'];
 const manifestPath=path.join(ctx.stableDir,MANIFEST);fs.writeFileSync(manifestPath,JSON.stringify({version:1,originalNotify:original}));
 const payload=JSON.stringify({type:'agent-turn-complete','thread-id':'id',cwd:'C:\\Some Project','last-assistant-message':'private message'});
 const r=await dispatch(payload,{manifestPath,hachiCommand:hachi});
 assert.deepEqual(r,{original:'ok',hachi:'ok'});
 const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.map(x=>x.hook),['original','hachiorb']);
 assert.equal(rows[0].payload,payload);assert.equal(rows[1].payload,payload);
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Original notify failing cannot prevent HachiOrb',async()=>{
 const ctx=temp();fs.mkdirSync(ctx.stableDir,{recursive:true});
 const manifestPath=path.join(ctx.stableDir,MANIFEST);fs.writeFileSync(manifestPath,JSON.stringify({version:1,originalNotify:['missing-original-executable']}));
 const calls=[];
 const r=await dispatch('{"type":"agent-turn-complete"}',{manifestPath,hachiCommand:['node','hachi'],run:async (cmd,payload)=>{calls.push(cmd[0]);return {ok:cmd[0]!=='missing-original-executable',reason:cmd[0]==='node'?'ok':'not-found'};}});
 assert.deepEqual(calls,['missing-original-executable','node']);assert.equal(r.hachi,'ok');
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
test('Windows BAT has Node-first and no-Node PowerShell fallback with actual exit handling',()=>{
 const bat=fs.readFileSync(path.join(root,'setup-agent-hooks-windows.bat'),'utf8');
 assert.match(bat,/node scripts\\setup-integrations\.cjs --all/i);
 assert.match(bat, /powershell\.exe.*scripts\\setup-agent-hooks\.ps1/i);
 assert.match(bat,/set "RESULT=%ERRORLEVEL%"/);
 assert.match(bat,/exit \/b %RESULT%/);
 const ps=fs.readFileSync(path.join(root,'scripts/setup-agent-hooks.ps1'),'utf8');
 assert.match(ps,/codex-notify-dispatcher\.ps1/);
 assert.match(ps,/originalNotify/);
 assert.match(ps,/Write-Config \$manifest/);
 assert.match(ps,/Duplicate top-level notify/i);
});
test('Portable packaging stages installer outside Electron app.asar',()=>{
 const {stagePortable,files}=require('../scripts/stage-portable-hooks.cjs');
 const ctx=temp();const out=path.join(ctx.dir,'HachiOrb-win32-x64');fs.mkdirSync(out,{recursive:true});
 const staged=stagePortable({source:root,output:out});
 assert.ok(staged.length>=10);
 for(const rel of files)assert.equal(fs.readFileSync(path.join(out,rel),'utf8'),fs.readFileSync(path.join(root,rel),'utf8'));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.match(pkg.scripts['pack:win'],/stage-portable-hooks\.cjs/);
 fs.rmSync(ctx.dir,{recursive:true,force:true});
});
