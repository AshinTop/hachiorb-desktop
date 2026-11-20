'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('renderer includes common display formatter before pet controller',()=>{
 const html=read('src/index.html');
 assert.ok(html.indexOf('src="status-display.js"')>=0);
 assert.ok(html.indexOf('src="status-display.js"')<html.indexOf('src="renderer.js"'));
 const controller=read('src/renderer.js');
 assert.match(controller,/HachiStatus\.agentName\(status\.agent\)/);
 assert.match(controller,/HachiStatus\.stateName\(status\)/);
 assert.match(controller,/label\.textContent/);
 assert.match(controller,/label\.hidden=!showStatus/);
});
test('small persistent status label has no decorative frame and can be hidden',()=>{
 const css=read('src/styles.css');
 assert.match(css,/#label\{[^\n]*border:0;/);
 assert.match(css,/#label\{[^\n]*opacity:\.86/);
 const main=read('src/main.cjs');
 assert.match(main,/显示 Agent 名称与状态/);
 assert.match(main,/四个 Agent 最近状态/);
 assert.match(main,/statusTimer=setInterval\(\(\)=>bridge\?\.refresh\(\),2000\)/);
});
test('PowerShell fallback and Node adapter both tag WorkBuddy permission / answer',()=>{
 const ps=read('integrations/agent-status.ps1');
 const node=read('integrations/agent-events.cjs');
 assert.match(ps,/\$attention='permission'/);
 assert.match(ps,/\$attention='input'/);
 assert.match(ps,/\$statusPayload\.attention=\$attention/);
 assert.match(node,/attention:'permission'/);
 assert.match(node,/attention:'input'/);
});
test('Windows release remains manual-only and does not use Actions artifacts',()=>{
 const workflow=read('.github/workflows/windows-portable.yml');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^\s+push:/m);
 assert.doesNotMatch(workflow,/upload-artifact/);
 assert.match(workflow,/default: 'v1\.3\.0'/);
});
