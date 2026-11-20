'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {dragPosition,fixedBounds,clampPosition}=require('../src/drag-geometry.cjs');
const area={x:0,y:0,width:1920,height:1080};
test('dragging moves only the position, never changes selected size',()=>{
 const startCursor={x:1190,y:500};
 const startBounds={x:1000,y:320,width:260,height:260};
 const pos=dragPosition(startCursor,startBounds,{x:1380,y:620},260,area);
 assert.deepEqual(pos,{x:1190,y:440});
 assert.deepEqual(fixedBounds({...pos,width:390,height:390},260,area),{x:1190,y:440,width:260,height:260});
});
test('drag stays within display working area including negative monitor origins',()=>{
 const work={x:-1600,y:0,width:1600,height:900};
 assert.deepEqual(clampPosition(-5000,9999,260,work),{x:-1600,y:640});
 assert.deepEqual(clampPosition(999,10,260,work),{x:-260,y:10});
});
test('small display still clamps instead of expanding the pet',()=>{
 const work={x:0,y:0,width:220,height:240};
 assert.deepEqual(fixedBounds({x:40,y:90,width:800,height:800},260,work),{x:0,y:0,width:260,height:260});
});
test('drag styling does not increase silhouette/shadow relative to idle',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
 const idle=css.match(/#orb\{[^}]*filter:([^;}]+)/)?.[1];
 const dragging=css.match(/#orb\.dragging\{[^}]*filter:([^;}]+)/)?.[1];
 assert.equal(dragging,idle);
 assert.ok(!/#orb\.dragging\{[^}]*transform:scale/i.test(css));
});
