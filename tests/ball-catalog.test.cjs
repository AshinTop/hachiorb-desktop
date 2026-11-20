'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {BODIES,validBody,normalizeBody,bodyName}=require('../src/ball-catalog.cjs');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Grok Ball Pro includes exactly nine selectable body IDs',()=>{
 assert.deepEqual(BODIES.map(b=>b.id),['classic','midnight','encore','red','sunshine','jade','backbeat','night-seed','sprout']);
 assert.equal(new Set(BODIES.map(b=>b.id)).size,9);
 for(const body of BODIES){assert.equal(validBody(body.id),true);assert.ok(body.name);}
 assert.equal(normalizeBody('red'),'red');assert.equal(normalizeBody('../unsafe'),'classic');
 assert.equal(bodyName('sprout'),'胡萝卜卜卜');
});
test('body switching uses Pro setBody without changing active Agent status or emotion',()=>{
 const renderer=read('src/renderer.js'),main=read('src/main.cjs');
 assert.match(renderer,/ball\.setBody\(next\)/);
 assert.match(main,/body:normalizeBody\(data\.body\)/);
 assert.match(main,/settings\.body=body;applySettings\(\)/);
 const changer=main.split('function changeBody(body)')[1].split('function changeSize')[0];
 assert.doesNotMatch(changer,/bridge\.commit/);
 assert.match(main,/切换球体（9 款/);
});
test('pinned Pro source is integrity checked and adds 42 emotions',()=>{
 const bootstrap=read('scripts/bootstrap.cjs');
 assert.match(bootstrap,/308db672da87402a2997a97306f4151eac2fcada/);
 assert.match(bootstrap,/876966b2da2c16b572dca956320bd256d17b3e78/);
 assert.match(bootstrap,/AshinTop\/grok-ball-pro/);
 const {EMOTIONS,validate}=require('../src/bridge.cjs');
 assert.equal(EMOTIONS.size,42);
 for(const id of ['22','23','24','25','42','43','44','45','46','47'])assert.equal(validate({state:'idle',emotionId:id}).emotionId,id);
});
test('release history lives in CHANGELOG, not README',()=>{
 assert.match(read('README.md'),/CHANGELOG\.md/);
 assert.match(read('CHANGELOG.md'),/v1\.4\.0/);
 assert.doesNotMatch(read('README.md'),/^## v1\.3\.1\s*$/m);
});
