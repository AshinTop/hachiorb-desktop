'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
function file(p){return fs.readFileSync(path.join(root,p),'utf8')}
test('Windows hook installer uses Node when available and PowerShell fallback otherwise',()=>{
 const bat=file('setup-agent-hooks-windows.bat');
 assert.match(bat, /powershell\.exe.*setup-agent-hooks\.ps1/i);
 assert.match(bat, /where node/i);
 assert.match(bat, /RESULT=%ERRORLEVEL%/);
 assert.match(bat, /not installed/i);
});
test('Installer safeguards existing Codex and Cursor configuration',()=>{
 const ps=file('scripts/setup-agent-hooks.ps1');
 assert.match(ps, /Backup-IfExists/);
 assert.match(ps, /codex-notify-dispatcher\.ps1/);
 assert.match(ps, /ConvertFrom-Json/);
 assert.match(ps, /if\(\$data\.hooks -isnot/);
 assert.match(ps, /Install-Codex/);
 assert.match(ps, /Install-Cursor/);
});
test('Hook handler uses loopback only and returns continue JSON to Cursor',()=>{
 const ps=file('integrations/agent-status.ps1');
 assert.match(ps,/127\.0\.0\.1:/);
 assert.match(ps,/\$request\.Proxy\s*=\s*\$null/i);
 assert.doesNotMatch(ps,/Invoke-RestMethod/i);
 assert.match(ps,/\{"continue":true\}/);
 assert.doesNotMatch(ps,/last-assistant-message|input-messages|\.text\b/);
 for(const ev of ['beforeSubmitPrompt','afterAgentThought','afterFileEdit','stop','sessionEnd','agent-turn-complete']) assert.ok(ps.includes(ev),ev);
});
test('Windows PowerShell connection helpers bypass configured localhost proxies',()=>{
 for(const relative of ['scripts/test-agent-connection.ps1','examples/send-status.ps1']){
  const ps=file(relative);
  assert.match(ps,/\$request\.Proxy\s*=\s*\$null/i,relative);
  assert.doesNotMatch(ps,/Invoke-RestMethod/i,relative);
 }
 assert.match(file('src/main.cjs'),/\$q\.Proxy=\$null/);
});
